// =====================================================================
//  shell.js - runs on every page inside /app
//   1. Sends you to the login page if you are not logged in
//   2. Builds the sidebar (desktop) and bottom menu (phone)
//   3. Runs the ALARM: when a HIGH priority task starts, it rings,
//      shows a phone/desktop notification and a check-in popup.
//   4. Fills the right-hand side panel on big screens (clock, now/next,
//      last 7 days, coming up, friends, a thought for today).
// =====================================================================

if (!auth.token) location.href = '/login.html';

const NAV = [
  { id: 'today', href: '/app/today.html', icon: '<i data-icon="home"></i>', label: 'Today' },
  { id: 'routine', href: '/app/routine.html', icon: '<i data-icon="calendar"></i>', label: 'Routine' },
  { id: 'planner', href: '/app/planner.html', icon: '<i data-icon="star"></i>', label: 'Important' },
  { id: 'goals', href: '/app/goals.html', icon: '<i data-icon="target"></i>', label: 'Goals' },
  { id: 'people', href: '/app/people.html', icon: '<i data-icon="users"></i>', label: 'People' },
  { id: 'chat', href: '/app/chat.html', icon: '<i data-icon="message"></i>', label: 'Chat' },
  { id: 'reports', href: '/app/reports.html', icon: '<i data-icon="chart"></i>', label: 'Reports' },
  { id: 'profile', href: '/app/profile.html', icon: '<i data-icon="user"></i>', label: 'My profile' },
  { id: 'settings', href: '/app/settings.html', icon: '<i data-icon="settings"></i>', label: 'Settings' },
];
const BOTTOM = ['today', 'routine', 'goals', 'people'];

(function buildShell() {
  const page = document.body.dataset.page;
  const title = document.body.dataset.title || '';
  const me = auth.user || {};
  const content = document.getElementById('app');

  const link = (n) => `<a href="${n.href}" class="${n.id === page ? 'active' : ''}" data-nav="${n.id}">
      <span class="ico">${n.icon}</span><span>${n.label}</span>${n.id === 'chat' ? '<span class="count hidden" data-unread></span>' : ''}</a>`;

  const shell = document.createElement('div');
  shell.className = 'shell';
  shell.innerHTML = `
    <aside class="sidebar">
      <a class="logo" href="/app/today.html"><span class="logo-mark"><i data-icon="sprout"></i></span> Student Helper</a>
      <nav class="nav">${NAV.map(link).join('')}</nav>
      <a class="me" href="/app/profile.html">${avatarHtml(me, 'sm')}<span><b>${esc(me.display_name)}</b><small>@${esc(me.username)}</small></span></a>
    </aside>
    <div class="content">
      <header class="topbar">
        <span class="title">${esc(title)}</span>
        <button class="icon-btn" id="themeBtn" title="Light / dark mode"><i data-icon="contrast"></i></button>
        <a class="icon-btn" href="/app/chat.html" title="Chat" style="position:relative"><i data-icon="message"></i><span class="count hidden" data-unread style="position:absolute;top:-4px;right:-6px"></span></a>
      </header>
      <main class="page"></main>
    </div>
    <aside class="rail" id="rail" aria-label="Your day at a glance"></aside>
    <nav class="bottom-nav">
      ${NAV.filter((n) => BOTTOM.includes(n.id)).map(link).join('')}
      <a href="#" id="moreBtn" class="${BOTTOM.includes(page) ? '' : 'active'}"><span class="ico"><i data-icon="menu"></i></span><span>More</span><span class="count hidden" data-unread></span></a>
    </nav>`;
  content.replaceWith(shell);
  shell.querySelector('.page').appendChild(content);
  content.removeAttribute('hidden');

  $('#themeBtn').onclick = () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('sh_theme', next);
    applyTheme(next);
  };

  // "More" pop-up menu for phones
  $('#moreBtn').onclick = (e) => {
    e.preventDefault();
    const old = $('.menu-pop');
    if (old) return old.remove();
    const pop = document.createElement('div');
    pop.className = 'menu-pop';
    pop.innerHTML = NAV.filter((n) => !BOTTOM.includes(n.id)).map((n) => `<a href="${n.href}">${n.icon} ${n.label}</a>`).join('')
      + '<a href="#" id="logoutPop"><i data-icon="logout"></i> Log out</a>';
    document.body.appendChild(pop);
    $('#logoutPop').onclick = (ev) => { ev.preventDefault(); auth.logout(); };
    setTimeout(() => document.addEventListener('click', function off(ev) {
      if (!pop.contains(ev.target)) { pop.remove(); document.removeEventListener('click', off); }
    }), 0);
  };
})();

// ---------- Unread chat badge ----------
async function refreshUnread() {
  try {
    const { unread } = await api('GET', '/chat/unread-count');
    $$('[data-unread]').forEach((el) => { el.textContent = unread; el.classList.toggle('hidden', !unread); });
  } catch { /* ignore */ }
}
refreshUnread();
setInterval(refreshUnread, 20000);

// Keep the saved user fresh (name / avatar might change on another device)
api('GET', '/auth/me').then(({ user }) => auth.save(null, user)).catch(() => {});

// =====================================================================
//  NATIVE ALARMS (Android app only)
//  In the installed app we ask Android to show a notification at the
//  start time of every HIGH priority task, every week. Android shows
//  them even when the app is closed. We re-plan them each time the app
//  opens or the routine changes.
// =====================================================================
const NativeAlarms = {
  plugin() { return IS_NATIVE_APP && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications; },

  // Runs one sync at a time (the Routine page and the menu can both ask)
  sync(tasks) {
    this.queue = (this.queue || Promise.resolve()).then(() => this.run(tasks));
    return this.queue;
  },

  async run(tasks) {
    const LN = this.plugin();
    if (!LN || !auth.token) return;
    try {
      if ((await LN.checkPermissions()).display !== 'granted') {
        if ((await LN.requestPermissions()).display !== 'granted') return;
      }
      await LN.createChannel({ id: 'alarms', name: 'Task alarms', description: 'High priority tasks', importance: 5, vibration: true, visibility: 1 });
      if (!tasks) ({ tasks } = await api('GET', '/routine'));

      // Remove the old plan, then add the new one
      const old = await LN.getPending();
      if (old.notifications.length) await LN.cancel({ notifications: old.notifications.map((n) => ({ id: n.id })) });

      const list = [];
      for (const t of tasks) {
        if (t.priority !== 'high') continue;
        const [hour, minute] = t.start_time.split(':').map(Number);
        for (const d of t.days.split(',').map(Number)) {
          list.push({
            id: t.id * 10 + d, // unique per task + weekday
            title: `${t.title} is starting`,
            body: 'Open Student Helper and check in to earn your points.',
            channelId: 'alarms',
            schedule: { on: { weekday: d + 1, hour, minute }, allowWhileIdle: true }, // Android: Sunday = 1
            extra: { taskId: t.id },
          });
        }
      }
      if (list.length) await LN.schedule({ notifications: list });
    } catch (err) { console.warn('Native alarms:', err); }
  },
};

// Android back button: go back a page, or close the app on the first page
if (IS_NATIVE_APP && window.Capacitor.Plugins.App) {
  window.Capacitor.Plugins.App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack && !/today\.html$/.test(location.pathname)) history.back();
    else window.Capacitor.Plugins.App.exitApp();
  });
}

// =====================================================================
//  ALARM ENGINE
//  Only HIGH priority tasks ring. It works while any page of the site
//  is open in the browser. (The mobile app will use real push alarms.)
// =====================================================================
const Alarm = {
  plan: null,
  audioCtx: null,
  ringing: null,

  // Pages that already loaded today's plan can hand it over
  setPlan(plan) { this.plan = plan; },

  async refresh() {
    try { this.plan = await api('GET', '/today'); } catch { /* offline? try later */ }
  },

  key(task) { return `sh_alarm_${this.plan.date}_${task.id}`; },

  check() {
    if (!this.plan || this.plan.date !== todayStr() || this.ringing) return;
    const now = Date.now();
    for (const t of this.plan.tasks) {
      if (t.priority !== 'high' || t.checked_in_at) continue;
      const opens = new Date(t.checkin_opens_at).getTime(), closes = new Date(t.checkin_closes_at).getTime();
      if (now >= opens && now < closes && !localStorage.getItem(this.key(t))) {
        localStorage.setItem(this.key(t), '1');
        this.ring(t);
        break;
      }
    }
  },

  // Beep-beep sound made in the browser (no audio file needed)
  beep() {
    if (!this.audioCtx) return;
    const ctx = this.audioCtx;
    [0, 0.25, 0.5].forEach((delay) => {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.08, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.2);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.2);
    });
  },

  ring(task) {
    // 1) System notification (shows even if the tab is in the background)
    if ('Notification' in window && Notification.permission === 'granted') {
      const n = new Notification(`${task.title} is starting!`, {
        body: `Check in within ${this.plan.checkin_window_minutes} minutes to earn ${task.points} points.`,
        requireInteraction: true,
        tag: 'task-' + task.id,
      });
      n.onclick = () => { window.focus(); n.close(); };
    }

    // 2) Sound, repeating every 2 seconds for up to a minute
    this.beep();
    let count = 0;
    const soundTimer = setInterval(() => { if (++count > 30) clearInterval(soundTimer); else this.beep(); }, 2000);

    // 3) Popup with a live countdown and a Check in button
    const closes = new Date(task.checkin_closes_at).getTime();
    const modal = openModal(`
      <div class="alarm">
        <div class="bell"><i data-icon="alarm"></i></div>
        <h2>${esc(task.title)}</h2>
        <p class="muted">${fmtTime(task.start_time)} - ${fmtTime(task.end_time)} · worth <b>${task.points} points</b></p>
        <p class="small muted">Time left to check in</p>
        <div class="countdown" id="alarmCountdown"></div>
        <div class="modal-foot" style="justify-content:center">
          <button class="btn ghost" data-close>Later</button>
          <button class="btn grad" id="alarmCheckin"><i data-icon="check-circle"></i> Check in now</button>
        </div>
      </div>`, { onClose: () => { clearInterval(soundTimer); clearInterval(tick); this.ringing = null; } });
    this.ringing = task.id;

    const updateCountdown = () => {
      const left = closes - Date.now();
      $('#alarmCountdown', modal).textContent = left > 0 ? fmtDuration(left) : 'Window closed';
      if (left <= 0) clearInterval(soundTimer);
    };
    updateCountdown();
    const tick = setInterval(updateCountdown, 500);

    $('#alarmCheckin', modal).onclick = (e) => withButton(e.target, async () => {
      const plan = await api('POST', `/today/${task.id}/checkin`);
      this.plan = plan;
      toast(`Checked in to ${task.title}. You've got this!`, 'success');
      document.dispatchEvent(new CustomEvent('plan-updated', { detail: plan }));
      modal.close();
    });
  },

  // Plays a test alarm (used on the Settings page)
  test() {
    this.unlockAudio();
    const now = new Date(), start = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    this.plan = this.plan || { date: todayStr(), checkin_window_minutes: 15, tasks: [] };
    const fake = { id: 0, title: 'Test alarm', start_time: start, end_time: start, points: 0, checkin_closes_at: new Date(Date.now() + 15 * 60000).toISOString() };
    this.ring(fake);
    $('#alarmCheckin').onclick = () => $('.modal-bg').click();
  },

  // Browsers only allow sound after the user clicked something once
  unlockAudio() {
    if (!this.audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) this.audioCtx = new Ctx();
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') this.audioCtx.resume();
  },
};

document.addEventListener('click', () => Alarm.unlockAudio(), { once: true });
document.addEventListener('plan-updated', (e) => Alarm.setPlan(e.detail));
Alarm.refresh().then(() => { Alarm.check(); Rail.start(); });
NativeAlarms.sync();
setInterval(() => Alarm.check(), 5000);
setInterval(() => Alarm.refresh(), 120000);

// =====================================================================
//  RIGHT SIDE PANEL ("rail") - only on wide screens (1400px and up)
//  Small, calm summary of the day so the right side is never empty.
// =====================================================================
const THOUGHTS = [
  'Small steps every day beat one big push on Sunday night.',
  'You do not need a perfect day. You need to show up for the next task.',
  'Finished is better than perfect. Tick one box, then the next.',
  'Rest is part of the routine, not a break from it.',
  'If a task feels heavy, do the first five minutes only.',
  'Compare yourself with yesterday, not with someone else\'s today.',
  'A missed task is information, not failure. Adjust and keep going.',
  'Put the phone in another room for the next study block.',
  'Drink some water and stretch. Your brain will thank you.',
  'The best time to review is right before you forget.',
  'Protect your sleep. Tomorrow\'s focus is built tonight.',
  'Write down what is on your mind, then come back to the task.',
  'Consistency is a quiet kind of talent.',
  'One honest hour of focus is worth three distracted ones.',
];

const Rail = {
  wide: window.matchMedia('(min-width: 1400px)'),
  stats: null,
  events: [],
  feed: [],
  loaded: false,

  async load() {
    const [profile, ev, feed] = await Promise.all([
      api('GET', `/users/${auth.user.username}`).catch(() => ({})),
      api('GET', `/events?from=${todayStr()}`).catch(() => ({ events: [] })),
      api('GET', '/social/feed').catch(() => ({ feed: [] })),
    ]);
    this.stats = profile.stats || null;
    this.events = ev.events.filter((e) => !e.is_done).slice(0, 3);
    this.feed = feed.feed.slice(0, 4);
    this.loaded = true;
    this.render();
  },

  // The task happening right now, and the one after it
  nowNext() {
    const tasks = (Alarm.plan && Alarm.plan.tasks) || [];
    const hm = new Date().toTimeString().slice(0, 5);
    const now = tasks.find((t) => t.start_time <= hm && hm < t.end_time);
    const next = tasks.find((t) => t.start_time > hm);
    return { now, next };
  },

  mins(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m; },

  render() {
    const el = $('#rail');
    if (!el || !this.wide.matches) return;
    const d = new Date();
    const page = document.body.dataset.page;
    const plan = Alarm.plan;
    const { now, next } = this.nowNext();
    const hm = d.getHours() * 60 + d.getMinutes();

    const nowHtml = now ? (() => {
      const pct = Math.round(((hm - this.mins(now.start_time)) / (this.mins(now.end_time) - this.mins(now.start_time))) * 100);
      return `<div class="rail-now cat-${now.category}"><small>Right now</small><b>${CATEGORY[now.category].icon} ${esc(now.title)}</b>
        <span class="small muted">${fmtTime(now.start_time)} - ${fmtTime(now.end_time)}</span>
        <div class="bar thin"><i style="width:${pct}%"></i></div></div>`;
    })() : '<p class="small muted" style="margin:0 0 .6rem">Nothing scheduled right now. A good moment to breathe.</p>';
    const nextHtml = next ? `<div class="rail-next"><small>Next</small><span><b>${esc(next.title)}</b> at ${fmtTime(next.start_time)}</span></div>` : '';

    const earned = plan ? plan.earned : 0;
    const pointsHtml = plan && plan.tasks.length ? `<div class="rail-points"><span>Today</span><b>${earned}<small> / 100 pts</small></b></div>
      <div class="bar thin"><i style="width:${earned}%"></i></div>` : '';

    // Last 7 days as tiny bars
    let weekHtml = '';
    if (this.stats && this.stats.daily) {
      const last = this.stats.daily.slice(-7);
      weekHtml = `<section class="rail-card"><h4>Last 7 days</h4>
        <div class="mini-bars">${last.map((x) => {
          const dt = new Date(x.date + 'T00:00');
          const good = x.points >= this.stats.streak_min_points;
          return `<div title="${fmtDate(x.date)}: ${x.points} pts"><span class="col"><i class="${good ? 'good' : ''}" style="height:${Math.max(4, x.points)}%"></i></span>
            <small>${'SMTWTFS'[dt.getDay()]}</small></div>`;
        }).join('')}</div>
        <p class="small muted" style="margin:.6rem 0 0"><i data-icon="flame"></i> ${this.stats.streak}-day streak · a day counts at ${this.stats.streak_min_points}+ pts</p></section>`;
    }

    const eventsHtml = page === 'today' || page === 'planner' ? '' : `<section class="rail-card"><h4>Coming up <a href="/app/planner.html">All</a></h4>
      ${this.events.length ? this.events.map((e) => `<div class="rail-row"><span class="date-box sm"><small>${fmtDate(e.event_date, { month: 'short' })}</small><b>${Number(e.event_date.slice(8))}</b></span>
        <span class="grow"><b>${e.is_important ? '<i data-icon="pin"></i> ' : ''}${esc(e.title)}</b><small class="muted">${e.event_time ? fmtTime(e.event_time) : 'All day'}</small></span></div>`).join('')
        : '<p class="small muted" style="margin:0">No dates coming up. Nice and clear.</p>'}</section>`;

    const friendsHtml = page === 'people' ? '' : `<section class="rail-card"><h4>Friends today <a href="/app/people.html">All</a></h4>
      ${this.feed.length ? this.feed.map((f) => `<a class="rail-row" href="/app/profile.html?u=${encodeURIComponent(f.user.username)}">${avatarHtml(f.user, 'sm')}
        <span class="grow"><b>${esc(f.user.display_name)}</b><span class="bar thin"><i style="width:${f.today_points}%"></i></span></span>
        <small class="muted">${f.today_points}</small></a>`).join('')
        : '<p class="small muted" style="margin:0">Follow a friend to see how their day is going.</p>'}</section>`;

    const dayNo = Math.floor(Date.now() / 86400000);
    el.innerHTML = `
      <section class="rail-card rail-clock">
        <b>${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</b>
        <span>${d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}</span>
      </section>
      <section class="rail-card">${nowHtml}${nextHtml}${pointsHtml}</section>
      ${weekHtml}${eventsHtml}${friendsHtml}
      <section class="rail-card rail-thought"><h4>A thought for today</h4><p>${THOUGHTS[dayNo % THOUGHTS.length]}</p></section>`;
  },

  start() {
    const go = () => { if (this.wide.matches && !this.loaded) this.load(); else this.render(); };
    this.wide.addEventListener('change', go);
    go();
    setInterval(() => this.render(), 30000);          // clock + "right now"
    setInterval(() => this.wide.matches && this.load(), 180000); // fresh numbers
  },
};
