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

module.exports = { imageUpload };
