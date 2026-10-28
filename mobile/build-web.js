// =====================================================================
//  build-web.js - copies the website into the app
//
//  The app shows the same pages as the website (../public). This script
//  copies them into ./www and points them at the online server, so the
//  app uses the same API and the same database as the website.
//
//  Run: node build-web.js          (uses the Render address below)
//       API_URL=http://192.168.0.5:3000 node build-web.js   (test with your PC)
// =====================================================================
const fs = require('fs');
const path = require('path');

const API_URL = (process.env.API_URL || 'https://student-helper-z9wg.onrender.com').replace(/\/$/, '');
const from = path.join(__dirname, '..', 'public');
const to = path.join(__dirname, 'www');

fs.rmSync(to, { recursive: true, force: true });
fs.cpSync(from, to, { recursive: true });

// The browser-only parts are not needed inside the app
fs.rmSync(path.join(to, 'sw.js'), { force: true });
fs.rmSync(path.join(to, 'manifest.webmanifest'), { force: true });

// Tell the pages where the server is
fs.writeFileSync(path.join(to, 'js', 'config.js'), `window.API_URL = ${JSON.stringify(API_URL)};\n`);

// The app skips the welcome page: logged in -> Today, otherwise -> Log in
fs.writeFileSync(path.join(to, 'index.html'), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Student Helper</title><style>body{background:#f5f2ec;margin:0}</style></head>
<body><script>
  location.replace(localStorage.getItem('sh_token') ? '/app/today.html' : '/login.html');
</script></body></html>
`);

console.log('Copied the website into www/, API =', API_URL);
