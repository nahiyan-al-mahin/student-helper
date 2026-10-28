// Loads settings from the .env file so every other file can just
// `require('./config')` instead of reading process.env everywhere.
require('dotenv').config({ path: __dirname + '/.env', quiet: true });

// All "today", check-in windows and streaks use this time zone.
// Cloud servers run in UTC, so we set it explicitly (Bangladesh by default).
process.env.TZ = process.env.APP_TIMEZONE || process.env.TZ || 'Asia/Dhaka';

// The database can be given as ONE link (what cloud hosts like TiDB / Aiven show you):
//   DATABASE_URL=mysql://user:password@host:4000/student_helper
// ...or as separate DB_HOST / DB_USER / DB_PASSWORD / DB_NAME values (local MySQL).
function dbSettings() {
  const e = process.env;
  const s = { host: e.DB_HOST || 'localhost', port: Number(e.DB_PORT) || 3306, user: e.DB_USER || 'root',
    password: e.DB_PASSWORD || '', database: e.DB_NAME || 'student_helper' };
  if (e.DATABASE_URL) {
    const u = new URL(e.DATABASE_URL);
    Object.assign(s, { host: u.hostname, port: Number(u.port) || 3306, user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password), database: u.pathname.slice(1) || s.database });
    if (u.searchParams.get('ssl') || u.searchParams.get('sslaccept')) e.DB_SSL = e.DB_SSL || 'true';
  }
  // Cloud databases need an encrypted (TLS) connection. Local MySQL does not.
  if (e.DB_SSL === 'true') s.ssl = { minVersion: 'TLSv1.2', rejectUnauthorized: true };
  return s;
}

const config = {
  port: Number(process.env.PORT) || 3000,
  db: dbSettings(),
  jwtSecret: process.env.JWT_SECRET || 'dev-secret',
  isProduction: process.env.NODE_ENV === 'production' || !!process.env.RENDER,
  // Websites allowed to call the API from a browser (besides this site itself and the Android app)
  allowedOrigins: (process.env.ALLOWED_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean),
  chatKey: process.env.CHAT_SECRET_KEY || '',
  checkinWindow: Number(process.env.CHECKIN_WINDOW_MINUTES) || 15,
  streakMinPoints: Number(process.env.STREAK_MIN_POINTS) || 70,
};

if (!/^[0-9a-fA-F]{64}$/.test(config.chatKey)) {
  console.error('\n  CHAT_SECRET_KEY in server/.env must be 64 hex characters.');
  console.error("  Create one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"\n");
  process.exit(1);
}

// Online, the login-token secret must be long and random, or anyone could make fake logins
if (config.isProduction && config.jwtSecret.length < 32) {
  console.error('\n  JWT_SECRET must be set to a long random value (32+ characters) on the server.\n');
  process.exit(1);
}

module.exports = config;
