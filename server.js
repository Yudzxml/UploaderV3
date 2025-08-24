const express = require('express');
const formidable = require('formidable');
const fs = require('fs');
const axios = require('axios');
const cheerio = require('cheerio');
const FormData = require('form-data');
const cors = require('cors');
const path = require('path');
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

    return res.status(500).json({ success: false, message: lastError?.message || 'All uploads failed' });
  });
}

// --- UPLOAD NO EXP ---
async function top4top(filePath) {
  try {
    const mainRes = await fetch('https://top4top.io/', {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      }
    });

    const cookies = mainRes.headers.get('set-cookie');
    const form = new FormData();
    form.append('file_0_', fs.createReadStream(filePath));
    form.append('submitr', '[ رفع الملفات ]');

    const uploadRes = await fetch('https://top4top.io/index.php', {
      method: 'POST',
      headers: {
        'Cookie': cookies,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      },
      body: form
    });

    const html = await uploadRes.text();
    const $ = cheerio.load(html);
    const getInputValue = (label) => $(`p.btitle:contains("${label}")`).next('input').val() || '';

    return {
      success: true,
      author: 'Yudzxml',
      result: {
        url: getInputValue('رابط الصورة المباشر'),
        deleteUrl: getInputValue('رابط الحذف')
      }
    };
  } catch (err) {
    console.error(err);
    throw err;
  }
}

async function ypnk(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`File tidak ditemukan di path: ${filePath}`);

  const form = new FormData();
  form.append('files', fs.createReadStream(filePath));

  const headers = {
    ...form.getHeaders(),
    'authority': 'cdn.ypnk.biz.id',
    'accept': '*/*',
    'accept-language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    'cache-control': 'no-cache',
    'origin': 'https://cdn.ypnk.biz.id',
    'pragma': 'no-cache',
    'referer': 'https://cdn.ypnk.biz.id/',
    'sec-ch-ua': '"Chromium";v="139", "Not;A=Brand";v="99"',
    'sec-ch-ua-mobile': '?1',
    'sec-ch-ua-platform': '"Android"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',
    'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36'
  };

  const res = await axios.post('https://cdn.ypnk.biz.id/upload', form, { headers });
  const fileUrl = res.data.files[0] ? 'https://cdn.ypnk.biz.id' + res.data.files[0].url : null;

  return {
    success: true,
    author: 'Yudzxml',
    result: {
      url: fileUrl,
      message: 'File uploaded successfully',
    }
  };
}

async function uploadToCatbox(filePath, fileName) {
  try {
    const form = new FormData();
    form.append('reqtype', 'fileupload');
    form.append('userhash', '');
    form.append('fileToUpload', fs.createReadStream(filePath), fileName);

    const response = await axios.post('https://catbox.moe/user/api.php', form, {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json', Referer: 'https://catbox.moe/', ...form.getHeaders() },
      timeout: 15000,
    });

    if (response.data && typeof response.data === 'string' && response.data.startsWith('http')) {
      return { success: true, author: 'Yudzxml', result: { url: response.data, message: 'File uploaded successfully' } };
    } else {
      throw new Error('Invalid response from Catbox');
    }
  } catch (e) {
    throw e;
  }
}

// --- UPLOAD EXP ---
async function uploadToUguu(filePath, fileName) {
  try {
    const form = new FormData();
    form.append('files[]', fs.createReadStream(filePath), fileName);

    const response = await axios.post('https://uguu.se/upload', form, { headers: { ...form.getHeaders(), 'User-Agent': 'Mozilla/5.0' } });

    if (response.data && Array.isArray(response.data.files) && response.data.files.length > 0) {
      return { success: true, author: 'Yudzxml', result: { url: response.data.files[0].url || 'unknown' } };
    } else {
      throw new Error('Invalid response from Uguu');
    }
  } catch (e) {
    throw e;
  }
}

async function uploadToAutoresbot(filePath, fileName) {
  try {
    const form = new FormData();
    form.append('expired', '6months');
    form.append('file', fs.createReadStream(filePath), fileName);

    const response = await axios.put('https://autoresbot.com/tmp-files/upload', form, {
      headers: { ...form.getHeaders(), Referer: 'https://autoresbot.com/', 'User-Agent': 'Mozilla/5.0' },
      timeout: 15000,
    });

    if (response.data && response.data.fileUrl) {
      return { success: true, author: 'Yudzxml', result: { url: response.data.fileUrl, expired: response.data.expired } };
    } else {
      throw new Error('Invalid response from Autoresbot');
    }
  } catch (e) {
    throw e;
  }
}

app.listen(PORT, () => console.log(`[SERVER] Running on port ${PORT}`));