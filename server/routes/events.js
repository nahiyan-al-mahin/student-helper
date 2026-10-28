// /api/events  -  important tasks and events (exams, deadlines, trips ...)
const express = require('express');
const db = require('../db');
const { bad, str, isTime } = require('../utils/validate');
const { isValidDate } = require('../utils/dates');

const router = express.Router();

function cleanEvent(b) {
  const title = str(b.title, 120);
  if (!title) throw bad('Title is required.');
  if (!isValidDate(b.event_date)) throw bad('Please pick a date.');
  return {
    title,
    description: str(b.description, 500),
    kind: b.kind === 'event' ? 'event' : 'task',
    event_date: b.event_date,
    event_time: isTime(b.event_time) ? b.event_time : null,
    is_important: b.is_important === false ? 0 : 1,
    is_done: b.is_done ? 1 : 0,
  };
}

// GET /api/events?from=2026-10-01&to=2026-10-31   (both optional)
router.get('/', async (req, res) => {
  const from = isValidDate(req.query.from) ? req.query.from : '1000-01-01';
  const to = isValidDate(req.query.to) ? req.query.to : '9999-12-31';
  const [rows] = await db.query(
    `SELECT id, title, description, kind, event_date, TIME_FORMAT(event_time,'%H:%i') AS event_time,
            is_important, is_done FROM events
      WHERE user_id = ? AND event_date BETWEEN ? AND ? ORDER BY event_date, event_time IS NULL, event_time`,
    [req.user.id, from, to]);
  res.json({ events: rows.map((e) => ({ ...e, is_important: !!e.is_important, is_done: !!e.is_done })) });
});

router.post('/', async (req, res) => {
  const e = cleanEvent(req.body);
  const [r] = await db.query('INSERT INTO events SET ?, user_id = ?', [e, req.user.id]);
  res.status(201).json({ id: r.insertId, ...e });
});

router.put('/:id', async (req, res) => {
  const e = cleanEvent(req.body);
  const [r] = await db.query('UPDATE events SET ? WHERE id = ? AND user_id = ?', [e, req.params.id, req.user.id]);
  if (!r.affectedRows) return res.status(404).json({ error: 'Not found.' });
  res.json({ id: Number(req.params.id), ...e });
});

router.delete('/:id', async (req, res) => {
  await db.query('DELETE FROM events WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  res.json({ ok: true });
});

module.exports = router;
