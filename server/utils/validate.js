// Tiny helpers to check user input and send friendly errors.

// Throw this inside a route and server.js turns it into a JSON error response.
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const bad = (message) => new HttpError(400, message);

// Trimmed string with a max length (returns '' when missing)
const str = (v, max = 255) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

const isTime = (v) => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

module.exports = { HttpError, bad, str, isTime };
