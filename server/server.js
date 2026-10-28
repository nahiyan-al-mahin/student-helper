// =====================================================================
//  Student Helper - main server file
//  Start with:  npm start   (or "npm run dev" to auto-restart on changes)
//
//  It does two jobs:
//   1. Serves the website files from /public   ->  http://localhost:3000
//   2. Serves the REST API under /api          ->  http://localhost:3000/api/...
//  The future mobile app will talk to the same /api, so both share
//  one database and the same features.
// =====================================================================
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { imageType } = require('./utils/upload');
const config = require('./config');
const db = require('./db');
const { requireAuth } = require('./middleware/auth');

const app = express();
app.set('trust proxy', 1); // Render sits in front of us; this gives the real visitor IP for rate limits

// ---------- Security ----------
// Safe browser headers. The Content-Security-Policy only lets the pages run our own
// scripts (+ the photo reader from jsdelivr), so injected <script> tags won't run.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'https://cdn.jsdelivr.net', "'wasm-unsafe-eval'"],
      workerSrc: ["'self'", 'blob:', 'https://cdn.jsdelivr.net'],
      connectSrc: ["'self'", 'https://cdn.jsdelivr.net', 'https://tessdata.projectnaptha.com'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'blob:'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: config.isProduction ? [] : null, // local testing runs on plain http
    },
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // the Android app shows avatars from here
}));

// Who may call the API from a browser: this site, the Android app (https://localhost),
// local testing, and anything listed in ALLOWED_ORIGINS. Logins use tokens, not cookies.
const ORIGINS = ['https://localhost', 'http://localhost', 'capacitor://localhost', ...config.allowedOrigins];
app.use('/api', cors({
  origin: (origin, cb) => cb(null, !origin || ORIGINS.includes(origin) || /^http:\/\/localhost:\d+$/.test(origin)),
}));
app.use(express.json({ limit: '1mb' }));  // read JSON request bodies

// The visitor's real IP. On Render requests pass through Cloudflare, which sets this header.
const visitorKey = (req) => ipKeyGenerator(String(req.headers['cf-connecting-ip'] || req.headers['true-client-ip'] || req.ip));

// Slow down password guessing: 10 failed logins / sign-ups per 15 minutes per IP
const authLimit = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 10, skipSuccessfulRequests: true, keyGenerator: visitorKey,
  standardHeaders: 'draft-8', legacyHeaders: false,
  message: { error: 'Too many tries. Please wait 15 minutes and try again.' },
});
app.use(['/api/auth/login', '/api/auth/register', '/api/users/me/password'], authLimit);
// Everything else: 600 requests a minute per IP is far more than a student needs
app.use('/api', rateLimit({ windowMs: 60 * 1000, limit: 600, keyGenerator: visitorKey, standardHeaders: 'draft-8', legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' } }));

// ---------- API routes ----------
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Profile pictures are stored in the database. Public (no login) so <img> tags can load them.
app.get('/api/avatars/:userId', async (req, res) => {
  const [[row]] = await db.query('SELECT mime, data FROM avatars WHERE user_id = ?', [Number(req.params.userId) || 0]);
  const mime = row && imageType(row.data);
  if (!mime) return res.status(404).end();
  // Only real image types are saved; this header also stops a browser from running it as a page
  res.set('Content-Security-Policy', "default-src 'none'; sandbox")
    .set('Content-Type', mime).set('Cache-Control', 'public, max-age=604800').send(row.data);
});
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', requireAuth, require('./routes/users'));
app.use('/api/routine', requireAuth, require('./routes/routine'));
app.use('/api/today', requireAuth, require('./routes/today'));
app.use('/api/events', requireAuth, require('./routes/events'));
app.use('/api/goals', requireAuth, require('./routes/goals'));
app.use('/api/social', requireAuth, require('./routes/social'));
app.use('/api/chat', requireAuth, require('./routes/chat'));
app.use('/api/reports', requireAuth, require('./routes/reports'));
app.use('/api', (req, res) => res.status(404).json({ error: 'API route not found.' }));

// ---------- Website ----------
app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));

// ---------- Errors ----------
// Any error thrown in a route ends up here and is sent back as { error: "..." }
app.use((err, req, res, next) => {
  const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 400 : 500);
  if (status === 500) console.error(err);
  res.status(status).json({ error: status === 500 ? 'Something went wrong on the server.' : err.message });
});

// Check the database first so we can show a clear message if MySQL is not set up
db.query('SELECT 1 FROM users LIMIT 1')
  .then(() => app.listen(config.port, () => console.log(`\n  Student Helper is running at http://localhost:${config.port}  (time zone: ${process.env.TZ})\n`)))
  .catch((err) => {
    console.error('\n  Could not use the database:', err.message);
    console.error('  1) Is MySQL running?  2) Are DB_USER / DB_PASSWORD right in server/.env?');
    console.error('  3) Did you run "npm run db:setup"?\n');
    process.exit(1);
  });
