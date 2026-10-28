// /api/social  -  follow / unfollow, follow requests, followers lists, and the feed
const express = require('express');
const db = require('../db');
const { publicUser } = require('../utils/social');
const { getStats, getDayPlan } = require('../utils/routine');
const { bad } = require('../utils/validate');

const router = express.Router();

// POST /api/social/follow/:userId
// Public profile -> followed right away. Private (locked) -> request is "pending".
router.post('/follow/:userId', async (req, res) => {
  const targetId = Number(req.params.userId);
  if (targetId === req.user.id) throw bad("You can't follow yourself.");
  const [[target]] = await db.query('SELECT id, is_private FROM users WHERE id = ?', [targetId]);
  if (!target) return res.status(404).json({ error: 'User not found.' });
  const status = target.is_private ? 'pending' : 'accepted';
  await db.query('INSERT IGNORE INTO follows (follower_id, following_id, status) VALUES (?, ?, ?)', [req.user.id, targetId, status]);
  res.json({ follow_status: status });
});

// DELETE /api/social/follow/:userId  -> unfollow (or cancel request)
router.delete('/follow/:userId', async (req, res) => {
  await db.query('DELETE FROM follows WHERE follower_id = ? AND following_id = ?', [req.user.id, req.params.userId]);
  res.json({ follow_status: 'none' });
});

// GET /api/social/requests  -> people asking to follow my locked profile
router.get('/requests', async (req, res) => {
  const [rows] = await db.query(
    `SELECT u.* FROM follows f JOIN users u ON u.id = f.follower_id
      WHERE f.following_id = ? AND f.status = 'pending' ORDER BY f.created_at DESC`, [req.user.id]);
  res.json({ requests: rows.map((u) => publicUser(u)) });
});

// POST /api/social/requests/:userId/accept  |  /decline
router.post('/requests/:userId/:action', async (req, res) => {
  const args = [req.params.userId, req.user.id];
  if (req.params.action === 'accept') {
    await db.query("UPDATE follows SET status = 'accepted' WHERE follower_id = ? AND following_id = ?", args);
  } else {
    await db.query("DELETE FROM follows WHERE follower_id = ? AND following_id = ? AND status = 'pending'", args);
  }
  res.json({ ok: true });
});

// GET /api/social/followers   and   /api/social/following
async function listPeople(req, res, followers) {
  const [rows] = await db.query(
    `SELECT u.* FROM follows f JOIN users u ON u.id = ${followers ? 'f.follower_id' : 'f.following_id'}
      WHERE ${followers ? 'f.following_id' : 'f.follower_id'} = ? AND f.status = 'accepted'
      ORDER BY u.display_name`, [req.user.id]);
  res.json({ users: rows.map((u) => publicUser(u)) });
}
router.get('/followers', (req, res) => listPeople(req, res, true));
router.get('/following', (req, res) => listPeople(req, res, false));

// GET /api/social/feed  -> how the people I follow are doing today
router.get('/feed', async (req, res) => {
  const [rows] = await db.query(
    `SELECT u.* FROM follows f JOIN users u ON u.id = f.following_id
      WHERE f.follower_id = ? AND f.status = 'accepted'`, [req.user.id]);

  const feed = [];
  for (const u of rows) {
    const [stats, plan] = await Promise.all([getStats(u.id, 30), getDayPlan(u.id)]);
    const now = plan.tasks.find((t) => t.status === 'in_progress' || t.status === 'checkin_open')
      || plan.tasks.find((t) => t.status === 'upcoming');
    feed.push({
      user: publicUser(u),
      today_points: plan.earned,
      streak: stats.streak,
      success_rate: stats.success_rate,
      tasks_done: plan.tasks.filter((t) => t.status === 'done').length,
      tasks_total: plan.tasks.length,
      current_task: now ? { title: now.title, category: now.category, start_time: now.start_time, status: now.status } : null,
    });
  }
  feed.sort((a, b) => b.today_points - a.today_points);
  res.json({ feed });
});

module.exports = router;
