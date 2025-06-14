const express = require('express');
const formidable = require('formidable');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// --- CORS ---
app.use(cors());

// --- Serve static files dari folder "public" ---
app.use(express.static(path.join(__dirname, 'public')));

// --- Fallback: kirim index.html saat akses root "/" ---
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- ROUTE UPLOAD FILE ---
app.post('/upload', (req, res) => {
  const form = new formidable.IncomingForm({
    keepExtensions: true,
    maxFileSize: 100 * 1024 * 1024, // 100MB
  });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error('[FORM ERROR]', err.message);
      return res.status(400).json({ success: false, message: err.message });
    }

    const file = Array.isArray(files.file) ? files.file[0] : files.file;
    if (!file || !file.filepath) {
      return res
        .status(400)
        .json({ success: false, message: 'No file uploaded or invalid file path' });
    }

    const filePath = file.filepath;
    const fileName = file.originalFilename || file.name;

    console.log(`[UPLOAD] Start for: ${fileName}`);

    const uploadFunctions = [
      uploadToSupa,
      uploadToUguu,
      uploadToAutoresbot,
      uploadToCatbox,
    ];

    let lastError = null;

    for (const fn of uploadFunctions) {
      try {
        const result = await fn(filePath, fileName);
        if (result.success) {
          console.log('[SUCCESS] via', fn.name);
          return res.json(result);
        }
      } catch (err) {
        console.error(`[FAIL] ${fn.name}:`, err.message);
        lastError = err;
      }
    }

    return res
      .status(500)
      .json({ success: false, message: lastError?.message || 'All uploads failed' });
  });
});

// --- UPLOAD FUNCTIONS ---
async function uploadToUguu(filePath, fileName) {
  const form = new FormData();
  form.append('files[]', fs.createReadStream(filePath), fileName);

  const response = await axios({
    url: 'https://uguu.se/upload.php',
    method: 'POST',
    headers: {
      'User-Agent': 'Mozilla/5.0',
      ...form.getHeaders(),
    },
    data: form,
  });

  return {
    success: true,
    author: 'Yudzxml',
    result: response.data.files[0],
  };
}

async function uploadToSupa(filePath, fileName) {
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath), fileName);

  const response = await axios.post('https://i.supa.codes/api/upload', form, {
    headers: form.getHeaders(),
  });

  return {
    success: true,
    author: 'Yudzxml',
    result: {
      url: response.data.link,
      deletionURL: response.data.delete,
      errorMessage: response.data.message || null,
    },
  };
}

async function uploadToAutoresbot(filePath, fileName) {
  const form = new FormData();
  form.append('expired', '6months');
  form.append('file', fs.createReadStream(filePath), fileName);

  const response = await axios.put(
    'https://autoresbot.com/tmp-files/upload',
    form,
    {
      headers: {
        ...form.getHeaders(),
        Referer: 'https://autoresbot.com/',
        'User-Agent': 'Mozilla/5.0',
      },
    }
  );

  return {
    success: true,
    author: 'Yudzxml',
    result: {
      url: response.data.fileUrl,
      expired: response.data.expired,
    },
  };
}

async function uploadToCatbox(filePath, fileName) {
  const form = new FormData();
  form.append('reqtype', 'fileupload');
  form.append('userhash', '');
  form.append('fileToUpload', fs.createReadStream(filePath), fileName);

  const response = await axios.post('https://catbox.moe/user/api.php', form, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      Accept: 'application/json',
      Referer: 'https://catbox.moe/',
      ...form.getHeaders(),
    },
  });

  return {
    success: true,
    author: 'Yudzxml',
    result: {
      url: response.data,
      message: 'File uploaded successfully',
    },
  };
}

// --- START SERVER ---
app.listen(PORT, () => {
  console.log(`[SERVER] Running on port ${PORT}`);
});