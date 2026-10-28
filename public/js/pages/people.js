// People page: feed of people I follow, search, followers / following, follow requests
let tab = new URLSearchParams(location.search).get('tab') || 'feed';

// One reusable person row with a follow button
function personRow(u, status) {
  const btn = {
    none: `<button class="btn sm" data-follow="${u.id}">${u.is_private ? '<i data-icon="lock"></i> Request' : '<i data-icon="plus"></i> Follow'}</button>`,
    pending: `<button class="btn sm ghost" data-unfollow="${u.id}">Requested</button>`,
    accepted: `<button class="btn sm outline" data-unfollow="${u.id}">Following</button>`,
  }[status] || '';
  return `<div class="list-item person">
    <a href="/app/profile.html?u=${esc(u.username)}">${avatarHtml(u)}</a>
    <div class="grow"><a class="name" href="/app/profile.html?u=${esc(u.username)}"><b>${esc(u.display_name)} ${u.is_private ? '<i data-icon="lock"></i>' : ''}</b></a>
      <small class="muted">@${esc(u.username)}${u.school ? ' · ' + esc(u.school) : ''}</small></div>
    ${btn}
  </div>`;
}

const panels = {
  async feed() {
    const { feed } = await api('GET', '/social/feed');
    if (!feed.length) return `<div class="card empty"><span class="big"><i data-icon="users"></i></span>You're not following anyone yet.<br><br><button class="btn" data-goto="find">Find people</button></div>`;
    return `<div class="grid cols-3">${feed.map((f) => {
      const pct = f.tasks_total ? Math.round((f.tasks_done / f.tasks_total) * 100) : 0;
      const sr = f.success_rate == null ? 'New' : f.success_rate + '%';
      const now = f.current_task;
      return `<div class="card feed-card">
        <div class="person"><a href="/app/profile.html?u=${esc(f.user.username)}">${avatarHtml(f.user)}</a>
          <div class="grow"><a class="name" href="/app/profile.html?u=${esc(f.user.username)}"><b>${esc(f.user.display_name)}</b></a><small class="muted">@${esc(f.user.username)}</small></div>
          ${f.success_rate === 100 ? '<span class="perfect">100%</span>' : `<span class="badge purple">${sr}</span>`}</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);margin:1rem 0 .5rem;text-align:center">
          <div><b style="font-size:1.3rem">${f.today_points}</b><br><small class="muted">pts today</small></div>
          <div><b style="font-size:1.3rem"><i data-icon="flame"></i> ${f.streak}</b><br><small class="muted">streak</small></div>
          <div><b style="font-size:1.3rem">${f.tasks_done}/${f.tasks_total}</b><br><small class="muted">tasks</small></div>
        </div>
        <div class="bar"><i style="width:${pct}%"></i></div>
        ${now ? `<div class="now">${now.status === 'upcoming' ? '<i data-icon="next"></i> Next' : '<i data-icon="play"></i> Now'}: <b>${CATEGORY[now.category].icon} ${esc(now.title)}</b> · ${fmtTime(now.start_time)}</div>` : ''}
      </div>`;
    }).join('')}</div>`;
  },

  async find() {
    return `<div class="card"><form id="searchForm" class="row" style="margin-bottom:.5rem">
        <input name="q" placeholder="Search by name, username or school" style="flex:1 1 220px" autofocus>
        <button class="btn" style="flex:0 0 auto">Search</button></form>
      <div id="results"><p class="muted small">Type a name to find students.</p></div></div>`;
  },

  async followers() {
    const [{ users }, { users: following }] = await Promise.all([api('GET', '/social/followers'), api('GET', '/social/following')]);
    const ids = new Set(following.map((u) => u.id));
    return `<div class="card">${users.length ? users.map((u) => personRow(u, ids.has(u.id) ? 'accepted' : 'none')).join('') : '<div class="empty">No followers yet.</div>'}</div>`;
  },

  async following() {
    const { users } = await api('GET', '/social/following');
    return `<div class="card">${users.length ? users.map((u) => personRow(u, 'accepted')).join('') : '<div class="empty">You are not following anyone.</div>'}</div>`;
  },

  async requests() {
    const { requests } = await api('GET', '/social/requests');
    return `<div class="card">${requests.length ? requests.map((u) => `<div class="list-item person">
        ${avatarHtml(u)}<div class="grow"><b>${esc(u.display_name)}</b><small class="muted">@${esc(u.username)} wants to follow you</small></div>
        <button class="btn sm success" data-accept="${u.id}">Accept</button>
        <button class="btn sm ghost" data-decline="${u.id}">Decline</button></div>`).join('')
      : '<div class="empty">No follow requests.<br><small>Requests show up here when your profile is locked <i data-icon="lock"></i>.</small></div>'}</div>`;
  },
};

async function show(name) {
  tab = name;
  $$('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  $('#panel').innerHTML = '<p class="muted">Loading…</p>';
  try { $('#panel').innerHTML = await panels[name](); } catch (err) { toast(err.message, 'error'); }
  const form = $('#searchForm');
  if (form) form.onsubmit = async (e) => {
    e.preventDefault();
    const { users } = await api('GET', '/users/search?q=' + encodeURIComponent(form.q.value));
    $('#results').innerHTML = users.length ? users.map((u) => personRow(u, u.follow_status)).join('') : '<p class="muted">No one found.</p>';
  };
}

async function refreshRequestCount() {
  const { requests } = await api('GET', '/social/requests');
  $('#reqCount').textContent = requests.length;
  $('#reqCount').classList.toggle('hidden', !requests.length);
}

$('#tabs').onclick = (e) => { const b = e.target.closest('[data-tab]'); if (b) show(b.dataset.tab); };

document.addEventListener('click', (e) => {
  const goto = e.target.closest('[data-goto]');
  if (goto) return show(goto.dataset.goto);
  const f = e.target.closest('[data-follow]'), u = e.target.closest('[data-unfollow]');
  const a = e.target.closest('[data-accept]'), d = e.target.closest('[data-decline]');
  if (f) withButton(f, async () => {
    const r = await api('POST', `/social/follow/${f.dataset.follow}`);
    f.outerHTML = r.follow_status === 'pending' ? `<button class="btn sm ghost" data-unfollow="${f.dataset.follow}">Requested</button>` : `<button class="btn sm outline" data-unfollow="${f.dataset.follow}">Following</button>`;
    toast(r.follow_status === 'pending' ? 'Request sent' : 'Following!', 'success');
  });
  if (u) withButton(u, async () => {
    await api('DELETE', `/social/follow/${u.dataset.unfollow}`);
    u.outerHTML = `<button class="btn sm" data-follow="${u.dataset.unfollow}"><i data-icon="plus"></i> Follow</button>`;
  });
  if (a || d) withButton(a || d, async () => {
    await api('POST', `/social/requests/${(a || d).dataset.accept || (a || d).dataset.decline}/${a ? 'accept' : 'decline'}`);
    toast(a ? 'Request accepted' : 'Request declined');
    show('requests'); refreshRequestCount();
  });
});

show(tab);
refreshRequestCount();
