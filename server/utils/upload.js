// File uploads (profile pictures) using multer.
// The picture is kept in memory and then saved INSIDE the database (avatars table),
// because free cloud hosts (like Render) wipe their disk on every restart.
// It is served at /api/avatars/<userId>.
const path = require('path');
const multer = require('multer');
const { bad } = require('./validate');

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 }, // 1 MB (the browser shrinks photos before uploading)
  fileFilter: (req, file, cb) => {
    const ok = ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(path.extname(file.originalname).toLowerCase());
    cb(ok ? null : bad('Please upload a PNG, JPG, WEBP or GIF image.'), ok);
  },
});

// Looks at the first bytes of the file to see what it REALLY is. A file named
// "photo.png" could be a web page with a script inside; we never save those.
function imageType(buf) {
  const hex = buf.subarray(0, 12).toString('hex');
  if (hex.startsWith('89504e470d0a1a0a')) return 'image/png';
  if (hex.startsWith('ffd8ff')) return 'image/jpeg';
  if (hex.startsWith('474946383761') || hex.startsWith('474946383961')) return 'image/gif';
  if (hex.startsWith('52494646') && hex.slice(16, 24) === '57454250') return 'image/webp';
  return null;
}

module.exports = { imageUpload, imageType };
