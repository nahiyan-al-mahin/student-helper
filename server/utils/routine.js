// =====================================================================
//  The "brain" of the routine system:
//   - which tasks happen on a given day
//   - how the 100 daily points are split between tasks
//   - the status of each task (upcoming / check-in open / missed / done)
//   - streaks and success percentage
// =====================================================================
const db = require('../db');
const config = require('../config');
const { today, addDays, parseDate, atTime } = require('./dates');

// High priority tasks are worth double the points of normal tasks.
const WEIGHT = { high: 2, normal: 1 };

// Is this task part of the routine on this date?
// (it must be on that week day, already exist that day, and not be deleted before/on that day)
function isScheduledOn(task, dateStr) {
  const weekday = String(parseDate(dateStr).getDay());
  return task.days.split(',').includes(weekday)
    && task.created_at.slice(0, 10) <= dateStr
    && (!task.deleted_at || task.deleted_at.slice(0, 10) > dateStr);
}

// Split 100 points between the tasks of one day, by weight.
// Rounding leftovers go to the heaviest tasks so the total is always exactly 100.
function splitPoints(tasks) {
  const total = tasks.reduce((sum, t) => sum + WEIGHT[t.priority], 0);
  if (!total) return new Map();
  const shares = tasks.map((t) => {
    const exact = (100 * WEIGHT[t.priority]) / total;
    return { id: t.id, points: Math.floor(exact), rest: exact - Math.floor(exact) };
  });
  let left = 100 - shares.reduce((s, x) => s + x.points, 0);
  [...shares].sort((a, b) => b.rest - a.rest).forEach((s) => { if (left-- > 0) s.points++; });
  return new Map(shares.map((s) => [s.id, s.points]));
}

// All routine tasks of a user. Deleted tasks are included only when asked
// (reports and streaks still need them for past days).
async function getTasks(userId, { includeDeleted = false } = {}) {
  const [rows] = await db.query(
    `SELECT id, title, category, days, TIME_FORMAT(start_time,'%H:%i') AS start_time,
            TIME_FORMAT(end_time,'%H:%i') AS end_time, priority, notes, created_at, deleted_at
       FROM routine_tasks WHERE user_id = ? ${includeDeleted ? '' : 'AND deleted_at IS NULL'}
      ORDER BY start_time`, [userId]);
  return rows;
}

// Work out what a task looks like right now for the student.
function taskStatus(task, log, dateStr, now = new Date()) {
  const start = atTime(dateStr, task.start_time);
  const windowEnd = new Date(start.getTime() + config.checkinWindow * 60000);
  const isToday = dateStr === today();

  if (log && log.completed_at) return 'done';
  if (log && log.checked_in_at) return isToday ? 'in_progress' : 'missed';
  if (dateStr > today() || (isToday && now < start)) return 'upcoming';
  if (isToday && now <= windowEnd) return 'checkin_open';
  return 'missed';
}

// The full plan for one day: tasks + points + status + total score.
async function getDayPlan(userId, dateStr = today()) {
  const tasks = (await getTasks(userId, { includeDeleted: true })).filter((t) => isScheduledOn(t, dateStr));
  const points = splitPoints(tasks);
  const [logs] = await db.query('SELECT * FROM task_logs WHERE user_id = ? AND log_date = ?', [userId, dateStr]);
  const logByTask = new Map(logs.map((l) => [l.task_id, l]));
  const now = new Date();

  const items = tasks.map((t) => {
    const log = logByTask.get(t.id);
    const start = atTime(dateStr, t.start_time);
    return {
      ...t,
      points: points.get(t.id),
      status: taskStatus(t, log, dateStr, now),
      checked_in_at: log ? log.checked_in_at : null,
      completed_at: log ? log.completed_at : null,
      points_earned: log ? log.points_earned : 0,
      checkin_opens_at: start.toISOString(),
      checkin_closes_at: new Date(start.getTime() + config.checkinWindow * 60000).toISOString(),
    };
  });

  return {
    date: dateStr,
    checkin_window_minutes: config.checkinWindow,
    total_possible: items.length ? 100 : 0,
    earned: items.reduce((s, t) => s + t.points_earned, 0),
    tasks: items,
  };
}

// Streak + success numbers for a user, looking back `days` days.
// A day with no routine tasks is skipped (it neither adds to nor breaks a streak).
async function getStats(userId, days = 30) {
  const [[user]] = await db.query('SELECT created_at FROM users WHERE id = ?', [userId]);
  const tasks = await getTasks(userId, { includeDeleted: true });
  const firstDay = user.created_at.slice(0, 10);
  const lookback = addDays(today(), -365);
  const [rows] = await db.query(
    `SELECT log_date, SUM(points_earned) AS points FROM task_logs
      WHERE user_id = ? AND log_date >= ? GROUP BY log_date`, [userId, lookback]);
  const pointsOn = new Map(rows.map((r) => [r.log_date, Number(r.points)]));

  // Build one entry per day, oldest -> newest
  const history = [];
  for (let d = firstDay > lookback ? firstDay : lookback; d <= today(); d = addDays(d, 1)) {
    const scheduled = tasks.some((t) => isScheduledOn(t, d));
    history.push({ date: d, scheduled, points: pointsOn.get(d) || 0 });
  }

  const good = (h) => h.points >= config.streakMinPoints;

  // Current streak: count back from today. Today only counts if already good
  // (an unfinished today does not break the streak).
  let streak = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i];
    if (!h.scheduled) continue;
    if (good(h)) streak++;
    else if (h.date === today()) continue;
    else break;
  }

  let bestStreak = 0, run = 0;
  for (const h of history) {
    if (!h.scheduled) continue;
    run = good(h) ? run + 1 : 0;
    bestStreak = Math.max(bestStreak, run);
  }

  // Success % = points earned / points possible over finished days in range
  const recent = history.slice(-days);
  const finished = recent.filter((h) => h.scheduled && h.date < today());
  const earned = finished.reduce((s, h) => s + h.points, 0);
  const successRate = finished.length ? Math.round((earned / (finished.length * 100)) * 100) : null;

  return {
    streak,
    best_streak: bestStreak,
    streak_min_points: config.streakMinPoints,
    today_points: pointsOn.get(today()) || 0,
    success_rate: successRate, // null = not enough history yet
    perfect_days: finished.filter((h) => h.points >= 100).length,
    days_tracked: finished.length,
    daily: recent,
  };
}

module.exports = { WEIGHT, isScheduledOn, splitPoints, getTasks, getDayPlan, getStats };
