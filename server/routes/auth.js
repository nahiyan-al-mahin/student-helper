// /api/auth  -  register, log in, and "who am I"
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { createToken, requireAuth } = require('../middleware/auth');
const { bad, str } = require('../utils/validate');
const { publicUser } = require('../utils/social');

const router = express.Router();

// POST /api/auth/register  { username, email, password, display_name }
router.post('/register', async (req, res) => {
  const username = str(req.body.username, 30).toLowerCase();
  const email = str(req.body.email, 120).toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const displayName = str(req.body.display_name, 60) || username;

  if (!/^[a-z0-9_.]{3,30}$/.test(username)) throw bad('Username must be 3-30 letters, numbers, _ or .');
  if (!/^\S+@\S+\.\S+$/.test(email)) throw bad('Please enter a valid email.');
  if (password.length < 6) throw bad('Password must be at least 6 characters.');

  const [taken] = await db.query('SELECT username, email FROM users WHERE username = ? OR email = ?', [username, email]);
  if (taken.length) throw bad(taken[0].username === username ? 'That username is taken.' : 'That email is already registered.');

  const hash = await bcrypt.hash(password, 10);
  const [result] = await db.query(
    'INSERT INTO users (username, email, password_hash, display_name) VALUES (?, ?, ?, ?)',
    [username, email, hash, displayName]);

  const [[user]] = await db.query('SELECT * FROM users WHERE id = ?', [result.insertId]);
  res.status(201).json({ token: createToken(user), user: publicUser(user, true) });
});

// POST /api/auth/login  { login (username or email), password }
router.post('/login', async (req, res) => {
  const login = str(req.body.login, 120).toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const [[user]] = await db.query('SELECT * FROM users WHERE username = ? OR email = ?', [login, login]);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    throw bad('Wrong username/email or password.');
  }
  res.json({ token: createToken(user), user: publicUser(user, true) });
});

// GET /api/auth/me  -> the logged-in user's own account
router.get('/me', requireAuth, async (req, res) => {
  const [[user]] = await db.query('SELECT * FROM users WHERE id = ?', [req.user.id]);
  if (!user) return res.status(401).json({ error: 'Account not found.' });
  res.json({ user: publicUser(user, true) });
});

module.exports = router;
