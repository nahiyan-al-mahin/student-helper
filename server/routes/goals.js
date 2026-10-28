// /api/goals  -  daily / weekly / one-time goals and their progress
const express = require('express');
const db = require('../db');
const { bad, str } = require('../utils/validate');
const { today, addDays, parseDate, isValidDate } = require('../utils/dates');

const router = express.Router();

// First day of the current period: today (daily), Monday (weekly), or forever (once)
function periodStart(period) {
  if (period === 'daily') return today();
  if (period === 'weekly') {
    const dow = parseDate(today()).getDay(); // 0 = Sunday
    return addDays(today(), -((dow + 6) % 7));
  }
  return '1000-01-01';
}

// All goals of a user, each with its progress for the current period.
async function goalsWithProgress(userId) {
  const [goals] = await db.query('SELECT * FROM goals WHERE user_id = ? ORDER BY created_at DESC', [userId]);
  for (const g of goals) {
    const [[p]] = await db.query(
      'SELECT COALESCE(SUM(amount),0) AS total FROM goal_progress WHERE goal_id = ? AND created_at >= ?',
      [g.id, periodStart(g.period)]);
    g.target_value = Number(g.target_value);
    g.progress = Number(p.total);
    g.percent = Math.min(100, Math.round((g.progress / g.target_value) * 100));
    g.is_done = g.progress >= g.target_value;
    g.auto_study = !!g.auto_study;
    g.is_public = !!g.is_public;
  }
  return goals;
}

function cleanGoal(b) {
  const title = str(b.title, 120);
  if (!title) throw bad('Goal title is required.');
  const target = Number(b.target_value);
  if (!(target > 0)) throw bad('Target must be a number above 0.');
  return {
    title,
    period: ['daily', 'weekly', 'once'].includes(b.period) ? b.period : 'daily',
    target_value: target,
    unit: str(b.unit, 20) || 'hours',
    auto_study: b.auto_study ? 1 : 0,
    deadline: isValidDate(b.deadline) ? b.deadline : null,
    is_public: b.is_public === false ? 0 : 1,
  };
}

router.get('/', async (req, res) => res.json({ goals: await goalsWithProgress(req.user.id) }));

router.post('/', async (req, res) => {
  const [r] = await db.query('INSERT INTO goals SET ?, user_id = ?', [cleanGoal(req.body), req.user.id]);
  res.status(201).json({ id: r.insertId });
});

router.put('/:id', async (req, res) => {
  const [r] = await db.query('UPDATE goals SET ? WHERE id = ? AND user_id = ?', [cleanGoal(req.body), req.params.id, req.user.id]);
  if (!r.affectedRows) return res.status(404).json({ error: 'Goal not found.' });
  res.json({ ok: true });
});

router.delete('/:id', async (req, res) => {
  await db.query('DELETE FROM goals WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  res.json({ ok: true });
});

// POST /api/goals/:id/progress  { amount: 1.5, note: 'Chapter 3' }
router.post('/:id/progress', async (req, res) => {
  const amount = Number(req.body.amount);
  if (!amount) throw bad('Enter how much you did, e.g. 1.5');
  const [[goal]] = await db.query('SELECT id FROM goals WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  if (!goal) return res.status(404).json({ error: 'Goal not found.' });
  await db.query('INSERT INTO goal_progress (goal_id, amount, note) VALUES (?, ?, ?)', [goal.id, amount, str(req.body.note, 120)]);
  res.status(201).json({ goals: await goalsWithProgress(req.user.id) });
});

module.exports = router;
module.exports.goalsWithProgress = goalsWithProgress;
