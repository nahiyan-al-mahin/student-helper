// Today page: points ring, streak, today's timeline with Check in / Done buttons
let plan = null;
let stats = null;

const STATUS = {
  upcoming: { badge: '<span class="badge">Upcoming</span>' },
  checkin_open: { badge: '<span class="badge purple"><i data-icon="dot"></i> Check-in open</span>' },
  in_progress: { badge: '<span class="badge warn">In progress</span>' },
  done: { badge: '<span class="badge ok"><i data-icon="check"></i> Done</span>' },
  missed: { badge: '<span class="badge">Missed</span>' },
};

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

// The score ring in the purple hero box
function ringSvg(value, max = 100) {
  const r = 52, c = 2 * Math.PI * r, pct = max ? value / max : 0;
  return `<div class="ring-wrap">
    <svg width="120" height="120"><circle cx="60" cy="60" r="${r}" stroke="rgba(255,255,255,.25)" stroke-width="12" fill="none"/>
    <circle cx="60" cy="60" r="${r}" stroke="#fff" stroke-width="12" fill="none" stroke-linecap="round"
      stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct)}" style="transition:stroke-dashoffset .8s"/></svg>
    <div class="ring-label"><span><b>${value}</b><small>of ${max} pts</small></span></div></div>`;
}

function renderHero() {
  const me = auth.user;
  const done = plan.tasks.filter((t) => t.status === 'done').length;
  const next = plan.tasks.find((t) => t.status === 'checkin_open') || plan.tasks.find((t) => t.status === 'in_progress') || plan.tasks.find((t) => t.status === 'upcoming');
  let line = 'No tasks today. Enjoy your free day, or add something to your routine!';
  if (plan.tasks.length) {
    line = done === plan.tasks.length ? 'Every task done today. Legendary!'
      : next ? `Next up: <b>${esc(next.title)}</b> at ${fmtTime(next.start_time)}`
      : 'Today\'s tasks are over. See you tomorrow!';
  }
  $('#hero').innerHTML = `${ringSvg(plan.earned, plan.total_possible || 100)}
    <div style="position:relative;z-index:1">
      <p>${fmtDate(plan.date, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      <h1>${greeting()}, ${esc(me.display_name.split(' ')[0])}</h1>
      <p>${line}</p>
    </div>`;
}

function renderStats() {
  const done = plan.tasks.filter((t) => t.status === 'done').length;
  const s = stats || {};
  const card = (ico, value, label, color) => `<div class="card stat"><span class="ico" style="background:color-mix(in srgb, var(${color}) 15%, transparent);color:var(${color})">${ico}</span><span><b>${value}</b><small>${label}</small></span></div>`;
  $('#stats').innerHTML =
    card('<i data-icon="flame"></i>', `${s.streak ?? 0} day${s.streak === 1 ? '' : 's'}`, 'Current streak', '--orange') +
    card('<i data-icon="trophy"></i>', s.best_streak ?? 0, 'Best streak', '--amber') +
    card('<i data-icon="check-circle"></i>', `${done}/${plan.tasks.length}`, 'Tasks done today', '--mint') +
    card('<i data-icon="trending"></i>', s.success_rate == null ? '–' : s.success_rate + '%', 'Success (30 days)', '--primary');
}

function actionHtml(t) {
  const now = Date.now();
  if (t.status === 'checkin_open') {
    const left = new Date(t.checkin_closes_at) - now;
    return `<button class="btn grad sm" data-checkin="${t.id}"><i data-icon="check-circle"></i> Check in · <span data-left="${t.checkin_closes_at}">${fmtDuration(left)}</span> left</button>`;
  }
  if (t.status === 'in_progress') return `<button class="btn success sm" data-done="${t.id}"><i data-icon="sparkles"></i> Mark done</button>`;
  if (t.status === 'done') return `<span class="badge ok" style="font-size:.9rem">+${t.points_earned} pts</span>`;
  if (t.status === 'upcoming') return `<span class="small muted">in <span data-left="${t.checkin_opens_at}">${fmtDuration(new Date(t.checkin_opens_at) - now)}</span></span>`;
  return '<span class="small muted">0 pts</span>';
}

function renderTimeline() {
  $('#ruleNote').innerHTML = plan.tasks.length
    ? `Check in within ${plan.checkin_window_minutes} minutes after a task starts, then mark it done to earn its points. <i data-icon="bell"></i> = alarm (high priority).`
    : '';
  if (!plan.tasks.length) {
    $('#timeline').innerHTML = `<div class="empty"><span class="big"><i data-icon="calendar"></i></span>Nothing planned for today.<br><br>
      <a class="btn" href="/app/routine.html">Create your routine</a></div>`;
    return;
  }
  $('#timeline').innerHTML = plan.tasks.map((t) => `
    <div class="task cat-${t.category} ${t.status}">
      <div class="time">${fmtTime(t.start_time)}<small>${fmtTime(t.end_time)}</small></div>
      <div class="info">
        <b>${CATEGORY[t.category].icon} ${esc(t.title)}</b>
        <div class="meta">${STATUS[t.status].badge}
          ${t.priority === 'high' ? '<span class="badge high"><i data-icon="bell"></i> High</span>' : ''}
          <span class="badge">${t.points} pts</span></div>
      </div>
      <div class="action">${actionHtml(t)}</div>
    </div>`).join('');
}

async function renderSide() {
  const to = new Date(); to.setDate(to.getDate() + 14);
  const [{ events }, { goals }] = await Promise.all([
    api('GET', `/events?from=${todayStr()}&to=${todayStr(to)}`),
    api('GET', '/goals'),
  ]);
  const upcoming = events.filter((e) => !e.is_done).slice(0, 5);
  $('#events').innerHTML = upcoming.length ? upcoming.map((e) => `
    <div class="list-item">
      <div class="date-box"><small>${fmtDate(e.event_date, { month: 'short' })}</small><b>${Number(e.event_date.slice(8))}</b></div>
      <div class="grow"><b>${e.kind === 'event' ? '<i data-icon="event"></i>' : '<i data-icon="pin"></i>'} ${esc(e.title)}</b>
        <small class="muted">${e.event_date === todayStr() ? 'Today' : fmtDate(e.event_date)}${e.event_time ? ' · ' + fmtTime(e.event_time) : ''}</small></div>
    </div>`).join('') : '<p class="muted small">No important tasks or events in the next 2 weeks.</p>';

  $('#goals').innerHTML = goals.length ? goals.slice(0, 4).map((g) => `
    <div style="margin-bottom:.9rem">
      <div class="row" style="justify-content:space-between;margin-bottom:.3rem"><b style="flex:0 1 auto">${esc(g.title)}</b>
        <span class="small muted" style="flex:0 0 auto">${+g.progress.toFixed(2)}/${g.target_value} ${esc(g.unit)}</span></div>
      <div class="bar"><i style="width:${g.percent}%"></i></div>
    </div>`).join('') : '<p class="muted small">No goals yet. <a href="/app/goals.html">Set one</a>.</p>';
}

function renderAll() {
  renderHero();
  renderStats();
  renderTimeline();
}

async function load() {
  [plan, stats] = await Promise.all([api('GET', '/today'), api('GET', `/users/${auth.user.username}`).then((p) => p.stats)]);
  Alarm.setPlan(plan);
  renderAll();
}

// Buttons inside the timeline
$('#timeline').addEventListener('click', (e) => {
  const checkin = e.target.closest('[data-checkin]');
  const done = e.target.closest('[data-done]');
  if (checkin) withButton(checkin, async () => {
    plan = await api('POST', `/today/${checkin.dataset.checkin}/checkin`);
    Alarm.setPlan(plan);
    toast('Checked in! Now focus and finish it', 'success');
    renderAll();
  });
  if (done) withButton(done, async () => {
    plan = await api('POST', `/today/${done.dataset.done}/complete`);
    Alarm.setPlan(plan);
    const t = plan.tasks.find((x) => x.id === Number(done.dataset.done));
    toast(`+${t.points_earned} points!`, 'success');
    await load();
    renderSide();
  });
});

// The alarm popup can check you in from any page; refresh when it does
document.addEventListener('plan-updated', (e) => { plan = e.detail; renderAll(); });

// Notification permission banner
if ('Notification' in window && Notification.permission === 'default') {
  $('#notifBanner').classList.remove('hidden');
  $('#enableNotif').onclick = async () => {
    const r = await Notification.requestPermission();
    $('#notifBanner').classList.add('hidden');
    toast(r === 'granted' ? 'Alarms are on' : 'Notifications blocked. Alarms will still ring while this site is open.');
  };
}

load().then(renderSide).catch((err) => toast(err.message, 'error'));

// Every second: update the countdown texts. When a task's window opens or closes,
// change its status right away (the server checks the same rules again on click).
function tick() {
  if (!plan) return;
  const now = Date.now();
  let changed = false;
  for (const t of plan.tasks) {
    if (t.status === 'upcoming' && now >= new Date(t.checkin_opens_at)) { t.status = 'checkin_open'; changed = true; }
    if (t.status === 'checkin_open' && now > new Date(t.checkin_closes_at)) { t.status = 'missed'; changed = true; }
  }
  if (changed) return renderAll();
  $$('[data-left]').forEach((el) => { el.textContent = fmtDuration(new Date(el.dataset.left) - now); });
}
setInterval(tick, 1000);
setInterval(() => load().catch(() => {}), 60000);
