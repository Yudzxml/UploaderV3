const express = require('express');
const formidable = require('formidable');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
const cors = require('cors');
const path = require('path');
const tmp = require('tmp')
const app = express();
const PORT = process.env.PORT || 3000;


app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

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

    // Defensive check untuk files.file
    let file = files.file;
    if (!file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    if (Array.isArray(file)) file = file[0];
    if (!file.filepath) {
      return res.status(400).json({ success: false, message: 'Invalid file path' });
    }

    const filePath = file.filepath;
    const fileName = file.originalFilename || file.newFilename || file.name;

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
        if (result && result.success) {
          console.log('[SUCCESS] via', fn.name);
          return res.json(result);
        } else {
          lastError = new Error('Upload failed or invalid response from ' + fn.name);
          console.error(`[FAIL] ${fn.name}:`, lastError.message);
        }
      } catch (err) {
        console.error(`[FAIL] ${fn.name}:`, err.message);
        lastError = err;
      }
    }

    return res.status(500).json({ success: false, message: lastError?.message || 'All uploads failed' });
  });
});
app.post('/v1/upload', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ success: false, message: 'Missing URL' });
    }

    const response = await axios({
      url,
      method: 'GET',
      responseType: 'stream',
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0',
        Accept: '*/*',
      },
    });

    const allowedTypes = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'video/mp4': '.mp4',
      'audio/mpeg': '.mp3',
      'audio/ogg': '.ogg',
      'application/pdf': '.pdf',
      'application/zip': '.zip',
      'application/x-zip-compressed': '.zip',
    };

    const contentType = response.headers['content-type'];
    const ext = allowedTypes[contentType];
    if (!ext) {
      return res.status(415).json({
        success: false,
        message: `Unsupported content-type: ${contentType}`,
      });
    }

    const tmpFile = tmp.fileSync({ postfix: ext });
    const writer = fs.createWriteStream(tmpFile.name);
    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    const fileName = `remote-upload-${Date.now()}${ext}`;
    const result = await uploadToUguu(tmpFile.name, fileName);
    tmpFile.removeCallback();

    return res.json(result);
  } catch (err) {
    console.error('[URL Upload ERROR]', err.message);
    return res.status(500).json({
      success: false,
      message: err.message || 'Upload failed',
    });
  }
});
// --- UPLOAD FUNCTIONS ---
async function uploadToUguu(filePath, fileName) {
  try {
    console.log('[uploadToUguu] File path:', filePath);
    console.log('[uploadToUguu] File name:', fileName);

    const form = new FormData();
    form.append('files[]', fs.createReadStream(filePath), fileName);

    const headers = {
      ...form.getHeaders(),
      'User-Agent': 'Mozilla/5.0',
    };

    console.log('[uploadToUguu] Headers:', headers);

    const response = await axios.post('https://uguu.se/upload', form, {
      headers,
    });

    console.log('[uploadToUguu] Raw response:', response.data);

    if (response.data && Array.isArray(response.data.files) && response.data.files.length > 0) {
      return {
        success: true,
        author: 'Yudzxml',
        result: {
          url: response.data.files[0].url || response.data.files[0].name || 'unknown',
        },
      };
    } else {
      console.error('[uploadToUguu] Unexpected response structure:', response.data);
      throw new Error('Invalid response from Uguu');
    }
  } catch (error) {
    console.error('[uploadToUguu ERROR]', error.message);
    if (error.response) {
      console.error('[uploadToUguu ERROR] Response:', error.response.status, error.response.data);
    }
    throw error;
  }
}

async function uploadToSupa(filePath, fileName) {
  try {
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath), fileName);

    const response = await axios.post('https://i.supa.codes/api/upload', form, {
      headers: {
        ...form.getHeaders(),
        'User-Agent': 'Mozilla/5.0',
      },
      timeout: 15000,
    });

    if (response.data && response.data.link) {
      return {
        success: true,
        author: 'Yudzxml',
        result: {
          url: response.data.link,
          deletionURL: response.data.delete,
          errorMessage: response.data.message || null,
        },
      };
    } else {
      throw new Error('Invalid response from Supa');
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

    const response = await axios.put(
      'https://autoresbot.com/tmp-files/upload',
      form,
      {
        headers: {
          ...form.getHeaders(),
          Referer: 'https://autoresbot.com/',
          'User-Agent': 'Mozilla/5.0',
        },
        timeout: 15000,
      }
    );

    if (response.data && response.data.fileUrl) {
      return {
        success: true,
        author: 'Yudzxml',
        result: {
          url: response.data.fileUrl,
          expired: response.data.expired,
        },
      };
    } else {
      throw new Error('Invalid response from Autoresbot');
    }
  } catch (e) {
    throw e;
  }
}

async function uploadToCatbox(filePath, fileName) {
  try {
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
      timeout: 15000,
    });

    // catbox.moe API returns URL string on success
    if (response.data && typeof response.data === 'string' && response.data.startsWith('http')) {
      return {
        success: true,
        author: 'Yudzxml',
        result: {
          url: response.data,
          message: 'File uploaded successfully',
        },
      };
    } else {
      throw new Error('Invalid response from Catbox');
    }
  } catch (e) {
    throw e;
  }
}

app.listen(PORT, () => {
  console.log(`[SERVER] Running on port ${PORT}`);
});