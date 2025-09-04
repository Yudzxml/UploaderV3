const express = require('express');
const formidable = require('formidable');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const cors = require('cors');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- ENDPOINT UPLOAD NO EXP ---
app.post('/api/v1/upload', (req, res) => {
  handleUpload(req, res, [ypnk, top4top, uploadToCatbox]);
});

// --- ENDPOINT UPLOAD EXP ---
app.post('/api/v2/upload', (req, res) => {
  handleUpload(req, res, [uploadToUguu, uploadToAutoresbot]);
});

// --- GENERIC HANDLE UPLOAD ---
function handleUpload(req, res, uploadFunctions) {
  const form = new formidable.IncomingForm({
    keepExtensions: true,
    maxFileSize: 100 * 1024 * 1024, // 100MB
    uploadDir: '/tmp', // railway friendly
  });

  form.parse(req, async (err, fields, files) => {
    if (err) return res.status(400).json({ success: false, message: err.message });

    let file = files.file;
    if (!file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    if (Array.isArray(file)) file = file[0];
    if (!file.filepath) return res.status(400).json({ success: false, message: 'Invalid file path' });

    const filePath = file.filepath;
    const fileName = file.originalFilename || file.newFilename || file.name;

    console.log(`[UPLOAD] Start for: ${fileName}`);

    let lastError = null;

    for (const fn of uploadFunctions) {
      try {
        const result = await fn(filePath, fileName);
        if (result && result.success) {
          console.log(`[SUCCESS] via ${fn.name}`);
          fs.unlink(filePath, () => {}); // cleanup
          return res.json(result);
        } else {
          lastError = new Error(`Upload failed or invalid response from ${fn.name}`);
          console.error(`[FAIL] ${fn.name}:`, lastError.message);
        }
      } catch (e) {
        console.error(`[FAIL] ${fn.name}:`, e.message);
        lastError = e;
      }
    }

    fs.unlink(filePath, () => {}); // cleanup
    return res.status(500).json({ success: false, message: lastError?.message || 'All uploads failed' });
  });
}

// --- UPLOAD FUNCTIONS ---
async function ypnk(filePath) {
  const form = new FormData();
  form.append('files', fs.createReadStream(filePath));

  const headers = { ...form.getHeaders(), 'User-Agent': 'Mozilla/5.0' };

  const res = await axios.post('https://cdn.yupra.my.id/upload', form, { headers });
  const fileUrl = res.data.files?.[0]?.url ? 'https://cdn.ypnk.biz.id' + res.data.files[0].url : null;

  return { success: true, author: 'Yudzxml', result: { url: fileUrl, message: 'File uploaded successfully' } };
}

async function top4top(filePath) {
  const mainRes = await axios.get('https://top4top.io/', { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const cookies = mainRes.headers['set-cookie']?.join('; ');

  const form = new FormData();
  form.append('file_0_', fs.createReadStream(filePath));
  form.append('submitr', '[ رفع الملفات ]');

  const uploadRes = await axios.post('https://top4top.io/index.php', form, {
    headers: { ...form.getHeaders(), Cookie: cookies },
  });

  const $ = cheerio.load(uploadRes.data);
  const getInputValue = (label) => $(`p.btitle:contains("${label}")`).next('input').val() || '';

  return { success: true, author: 'Yudzxml', result: { url: getInputValue('رابط الصورة المباشر'), deleteUrl: getInputValue('رابط الحذف') } };
}

async function uploadToCatbox(filePath, fileName) {
  const form = new FormData();
  form.append('reqtype', 'fileupload');
  form.append('userhash', '');
  form.append('fileToUpload', fs.createReadStream(filePath), fileName);

  const res = await axios.post('https://catbox.moe/user/api.php', form, {
    headers: { ...form.getHeaders(), 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
    timeout: 15000,
  });

  if (typeof res.data === 'string' && res.data.startsWith('http')) {
    return { success: true, author: 'Yudzxml', result: { url: res.data, message: 'File uploaded successfully' } };
  } else throw new Error('Invalid response from Catbox');
}

async function uploadToUguu(filePath, fileName) {
  const form = new FormData();
  form.append('files[]', fs.createReadStream(filePath), fileName);

  const res = await axios.post('https://uguu.se/upload', form, { headers: { ...form.getHeaders(), 'User-Agent': 'Mozilla/5.0' } });

  if (Array.isArray(res.data.files) && res.data.files.length > 0) {
    return { success: true, author: 'Yudzxml', result: { url: res.data.files[0].url || 'unknown' } };
  } else throw new Error('Invalid response from Uguu');
}

async function uploadToAutoresbot(filePath, fileName) {
  const form = new FormData();
  form.append('expired', '6months');
  form.append('file', fs.createReadStream(filePath), fileName);

  const res = await axios.put('https://autoresbot.com/tmp-files/upload', form, { headers: { ...form.getHeaders(), 'User-Agent': 'Mozilla/5.0' }, timeout: 15000 });

  if (res.data?.fileUrl) {
    return { success: true, author: 'Yudzxml', result: { url: res.data.fileUrl, expired: res.data.expired } };
  } else throw new Error('Invalid response from Autoresbot');
}

app.listen(PORT, () => console.log(`[SERVER] Running on port ${PORT}`));
