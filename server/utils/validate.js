// Tiny helpers to check user input and send friendly errors.

// Throw this inside a route and server.js turns it into a JSON error response.
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const bad = (message) => new HttpError(400, message);

// Trimmed string with a max length (returns '' when missing)
const str = (v, max = 255) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

const isTime = (v) => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

// Passwords: 8+ characters. bcrypt only uses the first 72 bytes, so we stop there.
function checkPassword(pw, label = 'Password') {
  if (typeof pw !== 'string' || pw.length < 8) throw bad(`${label} must be at least 8 characters.`);
  if (Buffer.byteLength(pw) > 72) throw bad(`${label} is too long (max 72 characters).`);
  return pw;
}

module.exports = { HttpError, bad, str, isTime, checkPassword };
