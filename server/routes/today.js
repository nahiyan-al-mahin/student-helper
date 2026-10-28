// /api/today  -  today's tasks, check-in and "mark done"
//
// The rules (feature #8):
//  - When a task starts, the student has CHECKIN_WINDOW_MINUTES (15) to check in.
//  - Missed the window?  The task is "missed" and gives 0 points.
//  - After checking in, the student must also mark it done (any time today).
//  - Only checked-in AND done tasks earn their share of the 100 daily points.
const express = require('express');
const db = require('../db');
const config = require('../config');
const { getDayPlan } = require('../utils/routine');
const { today, isValidDate, atTime } = require('../utils/dates');
const { bad } = require('../utils/validate');

const router = express.Router();

// GET /api/today            -> today's plan
// GET /api/today?date=2026-10-27 -> plan of another day (history)
router.get('/', async (req, res) => {
  const date = isValidDate(req.query.date) ? req.query.date : today();
  res.json(await getDayPlan(req.user.id, date));
});

// Finds a task in today's plan or throws a friendly error
async function findTodayTask(userId, taskId) {
  const plan = await getDayPlan(userId);
  const task = plan.tasks.find((t) => t.id === Number(taskId));
  if (!task) throw bad('That task is not part of today\'s routine.');
  return task;
}

// POST /api/today/:taskId/checkin
router.post('/:taskId/checkin', async (req, res) => {
  const task = await findTodayTask(req.user.id, req.params.taskId);
  if (task.status === 'upcoming') throw bad(`Check-in opens at ${task.start_time}.`);
  if (task.status === 'missed') throw bad(`The ${config.checkinWindow}-minute check-in window for this task has closed.`);
  if (task.status !== 'checkin_open') throw bad('You already checked in to this task.');

  await db.query('INSERT INTO task_logs (user_id, task_id, log_date, checked_in_at) VALUES (?, ?, ?, NOW())',
    [req.user.id, task.id, today()]);
  res.json(await getDayPlan(req.user.id));
});

// POST /api/today/:taskId/complete
router.post('/:taskId/complete', async (req, res) => {
  const task = await findTodayTask(req.user.id, req.params.taskId);
  if (task.status === 'done') throw bad('This task is already done.');
  if (task.status !== 'in_progress') throw bad('You need to check in to a task (when it starts) before marking it done.');

  const [[log]] = await db.query('SELECT id FROM task_logs WHERE task_id = ? AND log_date = ?', [task.id, today()]);
  await db.query('UPDATE task_logs SET completed_at = NOW(), points_earned = ? WHERE id = ?', [task.points, log.id]);

  // Study tasks automatically add their hours to "auto study" goals
  if (task.category === 'study') {
    const minutes = (atTime(today(), task.end_time) - atTime(today(), task.start_time)) / 60000;
    const [goals] = await db.query('SELECT id FROM goals WHERE user_id = ? AND auto_study = 1', [req.user.id]);
    for (const g of goals) {
      await db.query('INSERT INTO goal_progress (goal_id, amount, note, source_log) VALUES (?, ?, ?, ?)',
        [g.id, (minutes / 60).toFixed(2), task.title, log.id]);
    }
  }
  res.json(await getDayPlan(req.user.id));
});

module.exports = router;
