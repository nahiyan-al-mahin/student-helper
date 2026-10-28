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
const config = require('./config');
const db = require('./db');
const { requireAuth } = require('./middleware/auth');

const app = express();
app.use(cors());                          // lets a mobile app / other origin call the API
app.use(express.json({ limit: '1mb' }));  // read JSON request bodies

// ---------- API routes ----------
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Profile pictures are stored in the database. Public (no login) so <img> tags can load them.
app.get('/api/avatars/:userId', async (req, res) => {
  const [[row]] = await db.query('SELECT mime, data FROM avatars WHERE user_id = ?', [req.params.userId]);
  if (!row) return res.status(404).end();
  res.set('Content-Type', row.mime).set('Cache-Control', 'public, max-age=604800').send(row.data);
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
