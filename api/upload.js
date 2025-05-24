const formidable = require('formidable');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');

exports.config = {
  api: {
    bodyParser: false,
  },
};

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
    result: {
      url: response.data.files[0],
    },
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

  const response = await axios.put('https://autoresbot.com/tmp-files/upload', form, {
    headers: {
      ...form.getHeaders(),
      Referer: 'https://autoresbot.com/',
      'User-Agent': 'Mozilla/5.0',
    },
  });

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

function parseForm(req) {
  return new Promise((resolve, reject) => {
    const form = new formidable.IncomingForm();
    form.keepExtensions = true;
    form.parse(req, (err, fields, files) => {
      if (err) return reject(err);
      resolve({ fields, files });
    });
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ success: false, message: 'Method not allowed' }));
  }

  try {
    const { files } = await parseForm(req);

    if (!files.file) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ success: false, message: 'No file uploaded' }));
    }

    let file = files.file;
if (Array.isArray(file)) file = file[0];

const filePath = file.filepath;
const fileName = file.originalFilename;

if (!filePath || typeof filePath !== 'string') {
  res.statusCode = 400;
  return res.end(JSON.stringify({ success: false, message: 'Invalid file path' }));
}

    const uploadFunctions = [
      uploadToUguu,
      uploadToSupa,
      uploadToAutoresbot,
      uploadToCatbox,
    ];

    let lastError = null;

    for (const uploadFunc of uploadFunctions) {
      try {
        const result = await uploadFunc(filePath, fileName);
        if (result && result.success) {
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify(result));
        }
      } catch (error) {
        lastError = error;
      }
    }

    // Kalau semua gagal:
    res.statusCode = 500;
    return res.end(
      JSON.stringify({
        success: false,
        message:
          (lastError && lastError.message) || 'All upload attempts failed',
      }),
    );
  } catch (err) {
    res.statusCode = 500;
    return res.end(
      JSON.stringify({
        success: false,
        message: err.message || 'Internal Server Error',
      }),
    );
  }
};