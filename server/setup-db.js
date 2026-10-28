// Creates the database and all tables from database/schema.sql.
// Run once with:  npm run db:setup     (safe to run again, it won't delete data)
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const config = require('./config');

(async () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.sql'), 'utf8')
    .replace(/student_helper/g, config.db.database); // respect DB_NAME from .env

  const { database, ...login } = config.db; // connect without picking a database yet
  const conn = await mysql.createConnection({ ...login, multipleStatements: true });
  await conn.query(sql);
  await conn.end();
  console.log(`Database "${database}" is ready.`);
})().catch((err) => {
  console.error('Database setup failed:', err.message || err.code);
  if (err.code === 'ECONNREFUSED') console.error('  MySQL is not running. Start it (XAMPP: click Start next to MySQL) and try again.');
  process.exit(1);
});
