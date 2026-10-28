// Profile page: /app/profile.html?u=username  (no ?u = my own profile)
const username = new URLSearchParams(location.search).get('u') || auth.user.username;
const STATUS_ICON = { done: '<i data-icon="check-circle"></i>', in_progress: '<i data-icon="play"></i>', checkin_open: '<i data-icon="bell"></i>', upcoming: '<i data-icon="hourglass"></i>', missed: '<i data-icon="x-circle"></i>' };

async function load() {
  const p = await api('GET', `/users/${encodeURIComponent(username)}`);
  const u = p.user;
  document.title = `${u.display_name} · Student Helper`;

  let followBtn = '';
  if (p.is_me) followBtn = '<a class="btn ghost" href="/app/settings.html"><i data-icon="pencil"></i> Edit profile</a>';
  else if (p.follow_status === 'accepted') followBtn = '<button class="btn outline" id="unfollow">Following</button>';
  else if (p.follow_status === 'pending') followBtn = '<button class="btn ghost" id="unfollow">Requested</button>';
  else followBtn = `<button class="btn grad" id="follow">${u.is_private ? '<i data-icon="lock"></i> Request to follow' : '<i data-icon="plus"></i> Follow'}</button>`;
  const canMessage = !p.is_me && (p.follow_status === 'accepted' || p.follows_you);

  let body = '';
  if (p.locked) {
    body = `<div class="card locked"><div class="big"><i data-icon="lock"></i></div><h2>This profile is private</h2>
      <p class="muted">${p.follow_status === 'pending' ? 'Your follow request is waiting for approval.' : `Follow ${esc(u.display_name)} to see their routine and progress.`}</p></div>`;
  } else {
    const s = p.stats;
    const success = s.success_rate == null ? '<span class="muted">New</span>' : s.success_rate === 100 ? '<span class="perfect">100% perfect</span>' : `${s.success_rate}%`;
    body = `
      <div class="grid cols-4">
        <div class="card stat"><span class="ico"><i data-icon="trending"></i></span><span><b class="success-pill">${success}</b><small>Routine success (30d)</small></span></div>
        <div class="card stat"><span class="ico"><i data-icon="flame"></i></span><span><b>${s.streak}</b><small>Day streak</small></span></div>
        <div class="card stat"><span class="ico"><i data-icon="trophy"></i></span><span><b>${s.best_streak}</b><small>Best streak</small></span></div>
        <div class="card stat"><span class="ico"><i data-icon="star"></i></span><span><b>${s.today_points}</b><small>Points today</small></span></div>
      </div>
      <div class="grid cols-2" style="margin-top:1rem">
        <section class="card">
          <h3>Today's routine</h3>
          ${p.today.length ? p.today.map((t) => `<div class="list-item">
              <span style="font-size:1.2rem">${STATUS_ICON[t.status]}</span>
              <div class="grow"><b>${CATEGORY[t.category].icon} ${esc(t.title)}</b><small class="muted">${fmtTime(t.start_time)} - ${fmtTime(t.end_time)}</small></div>
              <span class="badge ${t.status === 'done' ? 'ok' : ''}">${t.status === 'done' ? '+' + t.points_earned : t.points} pts</span></div>`).join('')
            : '<p class="muted">No tasks today.</p>'}
        </section>
        <section class="card">
          <h3>Goals</h3>
          ${p.goals.length ? p.goals.map((g) => `<div style="margin-bottom:.9rem">
              <div style="display:flex;justify-content:space-between;gap:.5rem"><b>${esc(g.title)}</b><small class="muted">${+g.progress.toFixed(2)}/${g.target_value} ${esc(g.unit)}</small></div>
              <div class="bar" style="margin-top:.3rem"><i style="width:${g.percent}%"></i></div></div>`).join('')
            : '<p class="muted">No public goals.</p>'}
          <h3 style="margin-top:1.2rem">Last 14 days</h3>
          <div style="display:flex;gap:4px;align-items:flex-end;height:70px">
            ${s.daily.slice(-14).map((d) => `<div title="${fmtDate(d.date)}: ${d.points} pts" style="flex:1;border-radius:6px 6px 2px 2px;background:${d.scheduled ? 'var(--primary)' : 'var(--line)'};opacity:${d.scheduled ? 0.35 + (d.points / 100) * 0.65 : 1};height:${d.scheduled ? Math.max(6, d.points * 0.7) : 6}px"></div>`).join('')}
          </div>
        </section>
      </div>`;
  }

  $('#profile').innerHTML = `
    <div class="cover" style="--accent:${esc(u.accent_color)}"></div>
    <div class="profile-head">
      ${avatarHtml(u, 'lg')}
      <div class="who">
        <h1 style="margin:0">${esc(u.display_name)} ${u.is_private ? '<i data-icon="lock"></i>' : ''}</h1>
        <p class="muted" style="margin:0">@${esc(u.username)}${u.school ? ' · <i data-icon="school"></i> ' + esc(u.school) : ''}</p>
        <p class="small" style="margin:.3rem 0 0"><b>${p.followers}</b> followers · <b>${p.following}</b> following${p.follows_you ? ' · <span class="badge">Follows you</span>' : ''}</p>
      </div>
      <div class="actions">${canMessage ? `<a class="btn ghost" href="/app/chat.html?u=${u.id}"><i data-icon="message"></i> Message</a>` : ''}${followBtn}</div>
    </div>
    ${u.bio ? `<p style="margin:0 1.2rem 1.2rem">${esc(u.bio)}</p>` : ''}
    ${body}`;

  const f = $('#follow'), uf = $('#unfollow');
  if (f) f.onclick = () => withButton(f, async () => { await api('POST', `/social/follow/${u.id}`); load(); });
  if (uf) uf.onclick = () => withButton(uf, async () => {
    if (!confirm(p.follow_status === 'pending' ? 'Cancel follow request?' : `Unfollow ${u.display_name}?`)) return;
    await api('DELETE', `/social/follow/${u.id}`); load();
  });
}

load().catch((err) => { $('#profile').innerHTML = `<div class="card empty"><span class="big"><i data-icon="help"></i></span>${esc(err.message)}</div>`; });
