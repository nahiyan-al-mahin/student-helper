// One shared MySQL connection pool for the whole app.
// Use it like:   const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [id]);
// The "?" placeholders keep us safe from SQL injection.
const mysql = require('mysql2/promise');
const config = require('./config');

const db = mysql.createPool({
  ...config.db,
  connectionLimit: 10,
  dateStrings: true, // return DATE / DATETIME as plain text like '2026-10-28'
});

// Make MySQL's NOW() use the same time zone as the app (see APP_TIMEZONE in config.js)
const offset = -new Date().getTimezoneOffset();
const tz = `${offset >= 0 ? '+' : '-'}${String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0')}:${String(Math.abs(offset) % 60).padStart(2, '0')}`;
db.pool.on('connection', (conn) => conn.query(`SET time_zone = '${tz}'`));

module.exports = db;
