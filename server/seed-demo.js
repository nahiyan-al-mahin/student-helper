// Adds 3 demo students with 3 weeks of history, so you can try every page
// (reports, streaks, followers, chat) right away.
//   npm run seed      -> log in as  demo / demo123
// Run it again any time: it deletes and re-creates only the demo accounts.
const bcrypt = require('bcryptjs');
const db = require('./db');
const { encrypt } = require('./utils/crypto');
const { getTasks, isScheduledOn, splitPoints } = require('./utils/routine');
const { today, addDays } = require('./utils/dates');

const DAYS_BACK = 21;
const USERS = [
  { username: 'demo', display_name: 'Ayesha Rahman', school: 'Dhaka College', bio: 'HSC 2027 · Science · Coffee + calculus ☕', accent_color: '#4f7a6a', skill: 0.85 },
  { username: 'rafi', display_name: 'Rafi Ahmed', school: 'Notre Dame College', bio: 'Future engineer. 5am club.', accent_color: '#5d88ad', skill: 0.95 },
  { username: 'nadia', display_name: 'Nadia Islam', school: 'Viqarunnisa Noon', bio: 'Medical aspirant 🩺', accent_color: '#c4705a', skill: 0.65, is_private: 1 },
];
const ROUTINE = [
  ['Morning revision', 'study', '0,1,2,3,4,6', '06:30', '07:30', 'high'],
  ['College', 'work', '0,1,2,3,4', '08:00', '13:00', 'normal'],
  ['Lunch & rest', 'break', '0,1,2,3,4,5,6', '13:30', '14:30', 'normal'],
  ['Physics practice', 'study', '0,1,2,3,4', '16:00', '17:30', 'high'],
  ['Evening run', 'exercise', '0,2,4,6', '18:00', '18:30', 'normal'],
  ['Math problem set', 'study', '0,1,2,3,4,5,6', '20:00', '21:30', 'high'],
  ['Read a book', 'personal', '5,6', '10:00', '11:00', 'normal'],
];
const at = (date, time, plusMin = 0) => {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + plusMin;
  return `${date} ${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}:00`;
};

(async () => {
  await db.query('DELETE FROM users WHERE username IN (?)', [USERS.map((u) => u.username)]);
  const hash = await bcrypt.hash('demo123', 10);
  const start = addDays(today(), -DAYS_BACK);
  const ids = {};

  for (const u of USERS) {
    const [r] = await db.query(
      `INSERT INTO users (username, email, password_hash, display_name, bio, school, accent_color, is_private, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [u.username, `${u.username}@example.com`, hash, u.display_name, u.bio, u.school, u.accent_color, u.is_private || 0, `${start} 08:00:00`]);
    ids[u.username] = r.insertId;
    for (const t of ROUTINE) {
      await db.query(`INSERT INTO routine_tasks (user_id, title, category, days, start_time, end_time, priority, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [r.insertId, ...t, `${start} 08:00:00`]);
    }

    // Past days: randomly complete tasks based on the student's "skill"
    const tasks = await getTasks(r.insertId);
    for (let d = start; d < today(); d = addDays(d, 1)) {
      const dayTasks = tasks.filter((t) => isScheduledOn(t, d));
      const points = splitPoints(dayTasks);
      for (const t of dayTasks) {
        if (Math.random() > u.skill) continue; // missed
        const done = Math.random() < 0.95;
        await db.query('INSERT INTO task_logs (user_id, task_id, log_date, checked_in_at, completed_at, points_earned) VALUES (?, ?, ?, ?, ?, ?)',
          [r.insertId, t.id, d, at(d, t.start_time, 3), done ? at(d, t.end_time) : null, done ? points.get(t.id) : 0]);
      }
    }

    const [g] = await db.query("INSERT INTO goals (user_id, title, period, target_value, unit, auto_study) VALUES (?, 'Study 4 hours a day', 'daily', 4, 'hours', 1)", [r.insertId]);
    await db.query("INSERT INTO goal_progress (goal_id, amount, note) VALUES (?, 1.5, 'Morning revision + extra')", [g.insertId]);
    const [g2] = await db.query("INSERT INTO goals (user_id, title, period, target_value, unit) VALUES (?, 'Finish Organic Chemistry', 'once', 12, 'chapters')", [r.insertId]);
    await db.query('INSERT INTO goal_progress (goal_id, amount) VALUES (?, 5)', [g2.insertId]);

    await db.query(`INSERT INTO events (user_id, title, description, kind, event_date, event_time) VALUES
      (?, 'Physics class test', 'Chapters 3-5', 'event', ?, '10:00'),
      (?, 'Submit chemistry assignment', '', 'task', ?, NULL),
      (?, 'Math olympiad registration', '', 'task', ?, NULL)`,
      [r.insertId, addDays(today(), 3), r.insertId, addDays(today(), 1), r.insertId, addDays(today(), 9)]);
  }

  // Follows + a little chat
  const follow = (a, b) => db.query("INSERT INTO follows (follower_id, following_id, status) VALUES (?, ?, 'accepted')", [ids[a], ids[b]]);
  await follow('demo', 'rafi'); await follow('rafi', 'demo'); await follow('demo', 'nadia'); await follow('nadia', 'demo');
  for (const [from, to, text] of [
    ['rafi', 'demo', 'Did you finish the physics problem set? 😅'],
    ['demo', 'rafi', 'Almost! Q7 is tricky. Study session at 4?'],
    ['rafi', 'demo', 'Deal. Let\'s keep the streak going 🔥'],
  ]) {
    const e = encrypt(text);
    await db.query('INSERT INTO messages (sender_id, receiver_id, ciphertext, iv, auth_tag, is_read) VALUES (?, ?, ?, ?, ?, ?)',
      [ids[from], ids[to], e.ciphertext, e.iv, e.auth_tag, to === 'demo' && text.includes('streak') ? 0 : 1]);
  }

  console.log('Demo data ready. Log in with  demo / demo123  (also: rafi, nadia - same password)');
  process.exit(0);
})().catch((err) => { console.error('Seeding failed:', err.message || err.code); process.exit(1); });
