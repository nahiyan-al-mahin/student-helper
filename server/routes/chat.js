// /api/chat  -  private 1-to-1 chat. Messages are encrypted in the database.
// You can chat with someone when at least one of you follows the other.
const express = require('express');
const db = require('../db');
const { encrypt, decrypt } = require('../utils/crypto');
const { publicUser } = require('../utils/social');
const { bad, str } = require('../utils/validate');

const router = express.Router();

async function canChat(a, b) {
  const [rows] = await db.query(
    `SELECT 1 FROM follows WHERE status = 'accepted' AND
       ((follower_id = ? AND following_id = ?) OR (follower_id = ? AND following_id = ?)) LIMIT 1`, [a, b, b, a]);
  return rows.length > 0;
}

const toJson = (m) => ({
  id: m.id, sender_id: m.sender_id, receiver_id: m.receiver_id,
  text: decrypt(m), is_read: !!m.is_read, created_at: m.created_at,
});

// GET /api/chat/conversations  -> everyone I've chatted with + last message + unread count
router.get('/conversations', async (req, res) => {
  const me = req.user.id;
  const [rows] = await db.query(
    `SELECT m.* FROM messages m
       JOIN (SELECT MAX(id) AS id FROM messages WHERE sender_id = ? OR receiver_id = ?
              GROUP BY IF(sender_id = ?, receiver_id, sender_id)) last ON last.id = m.id
      ORDER BY m.id DESC`, [me, me, me]);
  const [unread] = await db.query(
    'SELECT sender_id, COUNT(*) AS n FROM messages WHERE receiver_id = ? AND is_read = 0 GROUP BY sender_id', [me]);
  const unreadBy = new Map(unread.map((u) => [u.sender_id, u.n]));

  const conversations = [];
  for (const m of rows) {
    const otherId = m.sender_id === me ? m.receiver_id : m.sender_id;
    const [[other]] = await db.query('SELECT * FROM users WHERE id = ?', [otherId]);
    conversations.push({ user: publicUser(other), last_message: toJson(m), unread: unreadBy.get(otherId) || 0 });
  }
  res.json({ conversations });
});

// GET /api/chat/unread-count  -> small number for the menu badge
router.get('/unread-count', async (req, res) => {
  const [[r]] = await db.query('SELECT COUNT(*) AS n FROM messages WHERE receiver_id = ? AND is_read = 0', [req.user.id]);
  res.json({ unread: r.n });
});

// GET /api/chat/:userId?after=123  -> messages with that user (only newer than id 123 when polling)
router.get('/:userId', async (req, res) => {
  const me = req.user.id, other = Number(req.params.userId);
  const [[user]] = await db.query('SELECT * FROM users WHERE id = ?', [other]);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  const after = Number(req.query.after) || 0;
  const [rows] = await db.query(
    `SELECT * FROM messages WHERE id > ? AND
       ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))
      ORDER BY id DESC LIMIT 200`, [after, me, other, other, me]);
  await db.query('UPDATE messages SET is_read = 1 WHERE sender_id = ? AND receiver_id = ? AND is_read = 0', [other, me]);
  res.json({ user: publicUser(user), can_chat: await canChat(me, other), messages: rows.reverse().map(toJson) });
});

// POST /api/chat/:userId  { text }
router.post('/:userId', async (req, res) => {
  const me = req.user.id, other = Number(req.params.userId);
  const text = str(req.body.text, 2000);
  if (!text) throw bad('Message is empty.');
  if (other === me) throw bad("You can't message yourself.");
  if (!(await canChat(me, other))) throw bad('You can only chat when one of you follows the other.');
  const enc = encrypt(text);
  const [r] = await db.query('INSERT INTO messages (sender_id, receiver_id, ciphertext, iv, auth_tag) VALUES (?, ?, ?, ?, ?)',
    [me, other, enc.ciphertext, enc.iv, enc.auth_tag]);
  const [[m]] = await db.query('SELECT * FROM messages WHERE id = ?', [r.insertId]);
  res.status(201).json({ message: toJson(m) });
});

module.exports = router;
