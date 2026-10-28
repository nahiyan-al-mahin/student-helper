// Login tokens (JWT).
// After login the client gets a token and sends it on every request as:
//   Authorization: Bearer <token>
// This works the same for the website and for a future mobile app.
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../db');

// A short fingerprint of the password hash. It changes when the password changes,
// which logs out every phone/browser that still has an old token.
const passwordStamp = (hash) => crypto.createHmac('sha256', config.jwtSecret).update(hash).digest('base64url').slice(0, 16);

function createToken(user) {
  return jwt.sign({ id: user.id, username: user.username, pv: passwordStamp(user.password_hash) },
    config.jwtSecret, { expiresIn: '30d', algorithm: 'HS256' });
}

// Put this in front of any route that needs a logged-in user.
// It sets req.user = { id, username }.
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Please log in first.' });
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
  } catch {
    return res.status(401).json({ error: 'Your session expired. Please log in again.' });
  }
  // The account must still exist and the password must not have changed since this login
  const [[user]] = await db.query('SELECT id, username, password_hash FROM users WHERE id = ?', [payload.id]);
  if (!user || payload.pv !== passwordStamp(user.password_hash)) {
    return res.status(401).json({ error: 'Your session expired. Please log in again.' });
  }
  req.user = { id: user.id, username: user.username };
  next();
}

module.exports = { createToken, requireAuth };
