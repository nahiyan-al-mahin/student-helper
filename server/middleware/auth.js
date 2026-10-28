// Login tokens (JWT).
// After login the client gets a token and sends it on every request as:
//   Authorization: Bearer <token>
// This works the same for the website and for a future mobile app.
const jwt = require('jsonwebtoken');
const config = require('../config');

function createToken(user) {
  return jwt.sign({ id: user.id, username: user.username }, config.jwtSecret, { expiresIn: '30d' });
}

// Put this in front of any route that needs a logged-in user.
// It sets req.user = { id, username }.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Please log in first.' });
  try {
    req.user = jwt.verify(token, config.jwtSecret);
    next();
  } catch {
    res.status(401).json({ error: 'Your session expired. Please log in again.' });
  }
}

module.exports = { createToken, requireAuth };
