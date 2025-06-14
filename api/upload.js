const formidable = require('formidable');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');

exports.config = {
  api: {
    bodyParser: false,
  },
};

// UPLOAD FUNCTIONS
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

  console.log('[UGUU] Upload success:', response.data.files[0]);
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

  console.log('[SUPA] Upload success:', response.data.link);
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

  const response = await axios.put('https://autoresbot.com/tmp-files/upload', form, {
    headers: {
      ...form.getHeaders(),
      Referer: 'https://autoresbot.com/',
      'User-Agent': 'Mozilla/5.0',
    },
  });

  console.log('[AUTORESBOT] Upload success:', response.data.fileUrl);
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

  console.log('[CATBOX] Upload success:', response.data);
  return {
    success: true,
    author: 'Yudzxml',
    result: {
      url: response.data,
      message: 'File uploaded successfully',
    },
  };
}

// Parse Form with limit 100MB
function parseForm(req) {
  return new Promise((resolve, reject) => {
    const form = new formidable.IncomingForm({
      keepExtensions: true,
      maxFileSize: 100 * 1024 * 1024, // 100MB
    });

    // Debug: log incoming headers
    console.log('[SERVER] Request headers:', req.headers);

    form.parse(req, (err, fields, files) => {
      if (err) {
        console.error('[FORM PARSE ERROR]', err.message);
        return reject(err);
      }
      resolve({ fields, files });
    });
  });
}

// MAIN HANDLER
module.exports = async (req, res) => {
  // --- CORS & Preflight ---
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ success: false, message: 'Method not allowed' }));
  }

  try {
    console.log('[SERVER] Parsing upload form...');
    const { files } = await parseForm(req);

    if (!files.file) {
      console.log('[ERROR] No file field in form');
      res.statusCode = 400;
      return res.end(JSON.stringify({ success: false, message: 'No file uploaded' }));
    }

    // Handle array or single file
    let file = Array.isArray(files.file) ? files.file[0] : files.file;

    // Detail file after parse
    console.log('[RECEIVED FILE]', {
      name: file.originalFilename,
      size: file.size,
      type: file.mimetype,
      path: file.filepath || file.path,
    });

    const filePath = file.filepath || file.path;
    const fileName = file.originalFilename || file.name;
    if (!filePath) {
      console.log('[ERROR] Invalid file path');
      res.statusCode = 400;
      return res.end(JSON.stringify({ success: false, message: 'Invalid file path' }));
    }

    console.log(`[UPLOAD] Starting upload pipeline for: ${fileName}`);

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
          console.log('[SUCCESS] Uploaded via', fn.name);
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify(result));
        }
      } catch (err) {
        console.error(`[FAILURE] ${fn.name} failed:`, err.message);
        lastError = err;
      }
    }

    // Jika semua service gagal
    res.statusCode = 500;
    return res.end(JSON.stringify({
      success: false,
      message: lastError?.message || 'All upload attempts failed',
    }));
  } catch (err) {
    console.error('[SERVER ERROR]', err.message);
    res.statusCode = 500;
    return res.end(JSON.stringify({
      success: false,
      message: err.message || 'Internal Server Error',
    }));
  }
};