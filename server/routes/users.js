// /api/users  -  search people, view profiles, edit your own profile
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { bad, str, checkPassword } = require('../utils/validate');
const { createToken } = require('../middleware/auth');
const { publicUser, followStatus, canView } = require('../utils/social');
const { getStats, getDayPlan } = require('../utils/routine');
const { imageUpload, imageType } = require('../utils/upload');
const { goalsWithProgress } = require('./goals');

const router = express.Router();

// GET /api/users/search?q=ali
router.get('/search', async (req, res) => {
  const q = `%${str(req.query.q, 50)}%`;
  const [rows] = await db.query(
    `SELECT u.*, f.status AS follow_status FROM users u
       LEFT JOIN follows f ON f.following_id = u.id AND f.follower_id = ?
      WHERE (u.username LIKE ? OR u.display_name LIKE ? OR u.school LIKE ?) AND u.id <> ?
      ORDER BY u.display_name LIMIT 30`, [req.user.id, q, q, q, req.user.id]);
  res.json({ users: rows.map((u) => ({ ...publicUser(u), follow_status: u.follow_status || 'none' })) });
});

// PUT /api/users/me  { display_name, bio, school, accent_color, is_private }
router.put('/me', async (req, res) => {
  const b = req.body;
  const displayName = str(b.display_name, 60);
  if (!displayName) throw bad('Display name cannot be empty.');
  const color = /^#[0-9a-fA-F]{6}$/.test(b.accent_color) ? b.accent_color : '#4f7a6a';
  await db.query(
    'UPDATE users SET display_name = ?, bio = ?, school = ?, accent_color = ?, is_private = ? WHERE id = ?',
    [displayName, str(b.bio, 280), str(b.school, 100), color, b.is_private ? 1 : 0, req.user.id]);

  // Made the profile public again? Then pending follow requests become accepted.
  if (!b.is_private) await db.query("UPDATE follows SET status = 'accepted' WHERE following_id = ?", [req.user.id]);

  const [[user]] = await db.query('SELECT * FROM users WHERE id = ?', [req.user.id]);
  res.json({ user: publicUser(user, true) });
});

// POST /api/users/me/avatar   (form-data field name: "avatar")
router.post('/me/avatar', imageUpload.single('avatar'), async (req, res) => {
  if (!req.file) throw bad('Please choose an image.');
  const mime = imageType(req.file.buffer);
  if (!mime) throw bad('Please upload a PNG, JPG, WEBP or GIF image.');
  await db.query(
    `INSERT INTO avatars (user_id, mime, data) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE mime = VALUES(mime), data = VALUES(data)`, [req.user.id, mime, req.file.buffer]);
  const url = `/api/avatars/${req.user.id}?v=${Date.now()}`; // ?v= makes browsers load the new picture
  await db.query('UPDATE users SET avatar_url = ? WHERE id = ?', [url, req.user.id]);
  res.json({ avatar_url: url });
});

// PUT /api/users/me/password  { current_password, new_password }
router.put('/me/password', async (req, res) => {
  const [[user]] = await db.query('SELECT * FROM users WHERE id = ?', [req.user.id]);
  if (!(await bcrypt.compare(String(req.body.current_password || ''), user.password_hash))) throw bad('Current password is wrong.');
  const hash = await bcrypt.hash(checkPassword(req.body.new_password, 'New password'), 12);
  await db.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.user.id]);
  // Every other phone/browser is now logged out. This one gets a fresh token.
  res.json({ ok: true, token: createToken({ ...user, password_hash: hash }) });
});

// GET /api/users/:username  -> profile page data
// Locked (private) profiles only show basic info unless you are an accepted follower.
router.get('/:username', async (req, res) => {
  const [[owner]] = await db.query('SELECT * FROM users WHERE username = ?', [str(req.params.username, 30).toLowerCase()]);
  if (!owner) return res.status(404).json({ error: 'User not found.' });

  const [[counts]] = await db.query(
    `SELECT (SELECT COUNT(*) FROM follows WHERE following_id = ? AND status = 'accepted') AS followers,
            (SELECT COUNT(*) FROM follows WHERE follower_id = ? AND status = 'accepted') AS following`,
    [owner.id, owner.id]);

  const isMe = owner.id === req.user.id;
  const visible = await canView(req.user.id, owner);
  const profile = {
    user: publicUser(owner, isMe),
    is_me: isMe,
    follow_status: isMe ? 'self' : await followStatus(req.user.id, owner.id),
    follows_you: isMe ? false : (await followStatus(owner.id, req.user.id)) === 'accepted',
    followers: counts.followers,
    following: counts.following,
    locked: !visible,
  };

  if (visible) {
    const stats = await getStats(owner.id, 30);
    const plan = await getDayPlan(owner.id);
    profile.stats = stats;
    profile.today = plan.tasks.map(({ title, category, start_time, end_time, priority, status, points, points_earned }) =>
      ({ title, category, start_time, end_time, priority, status, points, points_earned }));
    profile.goals = (await goalsWithProgress(owner.id)).filter((g) => isMe || g.is_public);
  }
  res.json(profile);
});

module.exports = router;
