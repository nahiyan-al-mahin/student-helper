// /api/routine  -  create and edit the weekly routine
const express = require('express');
const db = require('../db');
const { bad, str, isTime } = require('../utils/validate');
const { getTasks } = require('../utils/routine');

const router = express.Router();
const CATEGORIES = ['study', 'work', 'exercise', 'personal', 'break', 'other'];

// Check one task coming from the client and return clean values.
function cleanTask(b) {
  const title = str(b.title, 100);
  if (!title) throw bad('Task title is required.');
  const days = [...new Set((Array.isArray(b.days) ? b.days : String(b.days || '').split(','))
    .map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
  if (!days.length) throw bad(`Pick at least one day for "${title}".`);
  if (!isTime(b.start_time) || !isTime(b.end_time)) throw bad(`Times for "${title}" must look like 08:30.`);
  if (b.end_time <= b.start_time) throw bad(`End time must be after start time for "${title}".`);
  return {
    title,
    category: CATEGORIES.includes(b.category) ? b.category : 'other',
    days: days.join(','),
    start_time: b.start_time,
    end_time: b.end_time,
    priority: b.priority === 'high' ? 'high' : 'normal',
    notes: str(b.notes, 255),
  };
}

const COLUMNS = ['title', 'category', 'days', 'start_time', 'end_time', 'priority', 'notes'];
const values = (t) => COLUMNS.map((c) => t[c]);

// GET /api/routine  -> all tasks of the weekly routine
router.get('/', async (req, res) => {
  res.json({ tasks: await getTasks(req.user.id) });
});

// POST /api/routine/tasks  { title, category, days:[1,2,3], start_time:'08:00', end_time:'09:00', priority, notes }
router.post('/tasks', async (req, res) => {
  const t = cleanTask(req.body);
  const [r] = await db.query(
    `INSERT INTO routine_tasks (user_id, ${COLUMNS.join(', ')}) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [req.user.id, ...values(t)]);
  res.status(201).json({ id: r.insertId, ...t });
});

// PUT /api/routine/tasks/:id
router.put('/tasks/:id', async (req, res) => {
  const t = cleanTask(req.body);
  const [r] = await db.query(
    `UPDATE routine_tasks SET ${COLUMNS.map((c) => `${c} = ?`).join(', ')} WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    [...values(t), req.params.id, req.user.id]);
  if (!r.affectedRows) return res.status(404).json({ error: 'Task not found.' });
  res.json({ id: Number(req.params.id), ...t });
});

// DELETE /api/routine/tasks/:id
// We only mark it deleted, so points already earned stay in the reports.
router.delete('/tasks/:id', async (req, res) => {
  await db.query('UPDATE routine_tasks SET deleted_at = NOW() WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  res.json({ ok: true });
});

// POST /api/routine/import  { tasks:[...], replace:true|false }
// Used by "Upload routine photo" and "Import with AI (JSON)": the browser
// turns the photo / JSON into rows, the student checks them, then they are
// all saved here at once.
router.post('/import', async (req, res) => {
  const list = Array.isArray(req.body.tasks) ? req.body.tasks.slice(0, 200) : [];
  if (!list.length) throw bad('No tasks to import.');
  const clean = list.map(cleanTask); // throws on the first bad row

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    if (req.body.replace) await conn.query('UPDATE routine_tasks SET deleted_at = NOW() WHERE user_id = ? AND deleted_at IS NULL', [req.user.id]);
    for (const t of clean) {
      await conn.query(`INSERT INTO routine_tasks (user_id, ${COLUMNS.join(', ')}) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.user.id, ...values(t)]);
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  res.status(201).json({ imported: clean.length, tasks: await getTasks(req.user.id) });
});

module.exports = router;
