// /api/reports?days=7|30|90  -  how the student is doing, plus plain-English insights
const express = require('express');
const db = require('../db');
const { getStats, getTasks, isScheduledOn } = require('../utils/routine');
const { goalsWithProgress } = require('./goals');
const { today, parseDate, atTime } = require('../utils/dates');

const router = express.Router();
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const hoursOf = (t) => (atTime(today(), t.end_time) - atTime(today(), t.start_time)) / 3600000;
const rate = (a, b) => (b ? Math.round((a / b) * 100) : null);
const partOfDay = (time) => (time < '12:00' ? 'Morning' : time < '17:00' ? 'Afternoon' : 'Evening');

router.get('/', async (req, res) => {
  const days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 7;
  const userId = req.user.id;
  const stats = await getStats(userId, days);
  const tasks = await getTasks(userId, { includeDeleted: true });
  const from = stats.daily.length ? stats.daily[0].date : today();

  const [logs] = await db.query('SELECT * FROM task_logs WHERE user_id = ? AND log_date >= ?', [userId, from]);
  const logOf = new Map(logs.map((l) => [`${l.task_id}|${l.log_date}`, l]));

  // Go through every task that was scheduled on every finished day in range
  const byCategory = {}, byTask = {}, byPart = {}, byWeekday = WEEKDAYS.map((name) => ({ name, points: 0, days: 0 }));
  let scheduledCount = 0, checkedIn = 0, done = 0, studyHours = 0;
  const bump = (obj, key, isDone, extra = {}) => {
    obj[key] = obj[key] || { name: key, scheduled: 0, done: 0, ...extra };
    obj[key].scheduled++;
    if (isDone) obj[key].done++;
    return obj[key];
  };

  for (const day of stats.daily) {
    if (day.date >= today() || !day.scheduled) continue; // only finished days
    const wd = byWeekday[parseDate(day.date).getDay()];
    wd.points += day.points; wd.days++;
    for (const t of tasks.filter((x) => isScheduledOn(x, day.date))) {
      const log = logOf.get(`${t.id}|${day.date}`);
      const isDone = !!(log && log.completed_at);
      scheduledCount++;
      if (log && log.checked_in_at) checkedIn++;
      if (isDone) { done++; if (t.category === 'study') studyHours += hoursOf(t); }
      const c = bump(byCategory, t.category, isDone, { hours: 0 });
      if (isDone) c.hours += hoursOf(t);
      bump(byTask, t.title, isDone, { category: t.category });
      bump(byPart, partOfDay(t.start_time), isDone);
    }
  }

  const withRate = (o) => Object.values(o).map((x) => ({ ...x, rate: rate(x.done, x.scheduled) }));
  const categories = withRate(byCategory).map((c) => ({ ...c, hours: Math.round(c.hours * 10) / 10 }));
  const taskRates = withRate(byTask).sort((a, b) => b.rate - a.rate);
  const parts = withRate(byPart);
  const weekdays = byWeekday.map((w) => ({ name: w.name, avg_points: w.days ? Math.round(w.points / w.days) : null }));
  const finished = stats.daily.filter((d) => d.scheduled && d.date < today());
  const avgPoints = finished.length ? Math.round(finished.reduce((s, d) => s + d.points, 0) / finished.length) : null;

  const goals = await goalsWithProgress(userId);
  const [[ev]] = await db.query(
    `SELECT SUM(event_date >= ? AND is_done = 0) AS upcoming, SUM(is_done = 1 AND event_date >= ?) AS done
       FROM events WHERE user_id = ? AND is_important = 1`, [today(), from, userId]);

  // ---------- Plain-English insights ----------
  const insights = [];
  const life = [];
  if (!tasks.length) {
    insights.push('You have no routine yet. Add a few tasks on the Routine page to start earning points.');
  } else if (!finished.length) {
    insights.push('Your report fills in after your first full day. Check in to tasks today to get started!');
  } else {
    if (stats.success_rate >= 90) insights.push(`Amazing! You followed ${stats.success_rate}% of your routine. Keep that streak alive.`);
    else if (stats.success_rate >= 60) insights.push(`Good work: ${stats.success_rate}% of your routine done. A few more check-ins and you will hit 90%.`);
    else insights.push(`You completed ${stats.success_rate}% of your routine. Try making the routine a bit lighter so it is easier to follow.`);

    const missedCheckins = scheduledCount - checkedIn;
    if (missedCheckins > 0) insights.push(`You missed the check-in window ${missedCheckins} time${missedCheckins > 1 ? 's' : ''}. Mark important tasks as High priority so an alarm reminds you.`);

    const worstPart = [...parts].sort((a, b) => a.rate - b.rate)[0];
    const bestPart = [...parts].sort((a, b) => b.rate - a.rate)[0];
    if (parts.length > 1 && bestPart.rate - worstPart.rate >= 15) {
      insights.push(`You are strongest in the ${bestPart.name.toLowerCase()} (${bestPart.rate}%) and weakest in the ${worstPart.name.toLowerCase()} (${worstPart.rate}%). Put hard subjects in the ${bestPart.name.toLowerCase()}.`);
    }
    const weakTask = taskRates.filter((t) => t.scheduled >= 2).slice(-1)[0];
    if (weakTask && weakTask.rate < 50) insights.push(`"${weakTask.name}" is your most skipped task (${weakTask.rate}% done). Try moving it to another time.`);

    const bestDay = weekdays.filter((w) => w.avg_points !== null).sort((a, b) => b.avg_points - a.avg_points)[0];
    if (bestDay) insights.push(`${bestDay.name} is your best day with an average of ${bestDay.avg_points} points.`);

    // How the routine helps your life (projections at the current pace)
    const perWeek = (studyHours / finished.length) * 7;
    if (perWeek > 0) {
      life.push(`You study about ${perWeek.toFixed(1)} hours a week. Keep this pace for a 16-week semester and that is about ${Math.round(perWeek * 16)} hours of focused learning.`);
    }
    const exercise = byCategory.exercise;
    if (exercise && exercise.done) life.push(`You exercised ${exercise.done} time${exercise.done > 1 ? 's' : ''} in this period. Regular movement helps focus, sleep and memory.`);
    if (stats.streak > 0) life.push(`Your ${stats.streak}-day streak is building a habit. Habits take around two months on average to feel automatic, so every day counts.`);
    else life.push('Start a new streak today: earn at least ' + stats.streak_min_points + ' points to count the day.');
    if (stats.perfect_days) life.push(`You had ${stats.perfect_days} perfect day${stats.perfect_days > 1 ? 's' : ''} (100 points). That shows you can do it; aim for one more this week.`);
    const doneGoals = goals.filter((g) => g.is_done).length;
    if (goals.length) life.push(`${doneGoals} of your ${goals.length} goals are complete for the current period.`);
  }

  res.json({
    range_days: days,
    from,
    to: today(),
    summary: {
      success_rate: stats.success_rate,
      avg_daily_points: avgPoints,
      streak: stats.streak,
      best_streak: stats.best_streak,
      streak_min_points: stats.streak_min_points,
      perfect_days: stats.perfect_days,
      tasks_scheduled: scheduledCount,
      tasks_done: done,
      checkin_rate: rate(checkedIn, scheduledCount),
      study_hours: Math.round(studyHours * 10) / 10,
      important_upcoming: Number(ev.upcoming) || 0,
      important_done: Number(ev.done) || 0,
    },
    daily: stats.daily,
    categories,
    parts_of_day: parts,
    weekdays,
    tasks: taskRates,
    goals,
    insights,
    life_impact: life,
  });
});

module.exports = router;
