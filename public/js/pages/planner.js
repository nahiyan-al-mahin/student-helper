// Important tasks & events: list with filters + month calendar
let events = [];
let filter = 'upcoming';
let selectedDate = null;
let month = new Date(); month.setDate(1);

async function load() {
  ({ events } = await api('GET', '/events'));
  render();
}

function visibleEvents() {
  const t = todayStr();
  if (selectedDate) return events.filter((e) => e.event_date === selectedDate);
  if (filter === 'upcoming') return events.filter((e) => !e.is_done && e.event_date >= t);
  if (filter === 'overdue') return events.filter((e) => !e.is_done && e.event_date < t);
  if (filter === 'done') return events.filter((e) => e.is_done).reverse();
  return events;
}

function daysLeft(date) {
  const [y, m, d] = date.split('-').map(Number);
  const diff = Math.round((new Date(y, m - 1, d) - new Date(new Date().toDateString())) / 86400000);
  if (diff === 0) return '<span class="badge high">Today</span>';
  if (diff === 1) return '<span class="badge warn">Tomorrow</span>';
  if (diff < 0) return `<span class="badge">${-diff}d ago</span>`;
  return `<span class="badge purple">in ${diff} days</span>`;
}

function renderList() {
  const list = visibleEvents();
  $('#list').innerHTML = (selectedDate ? `<div class="card-head"><h3>${fmtDate(selectedDate, { weekday: 'long', day: 'numeric', month: 'long' })}</h3><button class="btn sm ghost" id="clearDate">Show all</button></div>` : '')
    + (list.length ? list.map((e) => `
    <div class="list-item">
      <button class="check ${e.is_done ? 'on' : ''}" data-toggle="${e.id}" title="Mark done">${e.is_done ? '<i data-icon="check"></i>' : ''}</button>
      <div class="date-box"><small>${fmtDate(e.event_date, { month: 'short' })}</small><b>${Number(e.event_date.slice(8))}</b></div>
      <div class="grow">
        <b style="${e.is_done ? 'text-decoration:line-through;opacity:.6' : ''}">${e.kind === 'event' ? '<i data-icon="event"></i>' : '<i data-icon="pin"></i>'} ${esc(e.title)}</b>
        <small class="muted">${fmtDate(e.event_date)}${e.event_time ? ' · ' + fmtTime(e.event_time) : ''}${e.description ? ' · ' + esc(e.description) : ''}</small>
      </div>
      ${e.is_done ? '' : daysLeft(e.event_date)}
      <button class="icon-btn" data-edit="${e.id}" title="Edit"><i data-icon="pencil"></i></button>
</div>`).join('') : `<div class="empty"><span class="big">${filter === 'overdue' ? '<i data-icon="sparkles"></i>' : '<i data-icon="star"></i>'}</span>${filter === 'overdue' && !selectedDate ? 'Nothing overdue. Nice!' : 'Nothing here yet.'}</div>`);
  const clear = $('#clearDate');
  if (clear) clear.onclick = () => { selectedDate = null; render(); };
}

function renderCalendar() {
  $('#monthLabel').textContent = month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const first = new Date(month), start = new Date(first);
  start.setDate(1 - ((first.getDay() + 6) % 7)); // back to Monday
  const byDate = {};
  events.forEach((e) => { (byDate[e.event_date] = byDate[e.event_date] || []).push(e); });

  let html = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => `<div class="dow">${d}</div>`).join('');
  for (let i = 0; i < 42; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const ds = todayStr(d);
    const items = (byDate[ds] || []).filter((e) => !e.is_done);
    html += `<button data-date="${ds}" class="${d.getMonth() !== month.getMonth() ? 'other' : ''} ${ds === todayStr() ? 'today' : ''} ${ds === selectedDate ? 'selected' : ''}">
      ${d.getDate()}<span class="dots">${items.slice(0, 3).map(() => '<i></i>').join('')}</span></button>`;
  }
  $('#cal').innerHTML = html;
}

function render() { renderList(); renderCalendar(); }

$('#filterTabs').onclick = (e) => {
  const b = e.target.closest('[data-filter]');
  if (!b) return;
  filter = b.dataset.filter; selectedDate = null;
  $$('#filterTabs button').forEach((x) => x.classList.toggle('active', x === b));
  render();
};
$('#cal').onclick = (e) => {
  const b = e.target.closest('[data-date]');
  if (b) { selectedDate = b.dataset.date === selectedDate ? null : b.dataset.date; render(); }
};
$('#prevMonth').onclick = () => { month.setMonth(month.getMonth() - 1); renderCalendar(); };
$('#nextMonth').onclick = () => { month.setMonth(month.getMonth() + 1); renderCalendar(); };

$('#list').onclick = (e) => {
  const tog = e.target.closest('[data-toggle]');
  const edit = e.target.closest('[data-edit]');
  if (tog) withButton(tog, async () => {
    const ev = events.find((x) => x.id === Number(tog.dataset.toggle));
    await api('PUT', `/events/${ev.id}`, { ...ev, is_done: !ev.is_done });
    if (!ev.is_done) toast('Done!', 'success');
    load();
  });
  if (edit) openForm(events.find((x) => x.id === Number(edit.dataset.edit)));
};
$('#addBtn').onclick = () => openForm();

function openForm(ev) {
  const e = ev || { title: '', description: '', kind: 'task', event_date: selectedDate || todayStr(), event_time: '', is_done: false };
  const m = openModal(`
    <div class="modal-head"><h2>${ev ? 'Edit' : 'New'} important item</h2><button class="icon-btn" data-close><i data-icon="x"></i></button></div>
    <form id="evForm">
      <div class="field"><label>Type</label><div class="chips">
        <label class="chip-toggle"><input type="radio" name="kind" value="task" ${e.kind === 'task' ? 'checked' : ''}><span><i data-icon="pin"></i> Task</span></label>
        <label class="chip-toggle"><input type="radio" name="kind" value="event" ${e.kind === 'event' ? 'checked' : ''}><span><i data-icon="event"></i> Event</span></label>
      </div></div>
      <div class="field"><label>Title</label><input name="title" required maxlength="120" value="${esc(e.title)}" placeholder="e.g. Chemistry exam"></div>
      <div class="row">
        <div class="field"><label>Date</label><input type="date" name="event_date" required value="${e.event_date}"></div>
        <div class="field"><label>Time (optional)</label><input type="time" name="event_time" value="${e.event_time || ''}"></div>
      </div>
      <div class="field"><label>Details (optional)</label><textarea name="description" maxlength="500">${esc(e.description)}</textarea></div>
      <div class="modal-foot">
        ${ev ? '<button type="button" class="btn danger" id="delEv" style="margin-right:auto">Delete</button>' : ''}
        <button type="button" class="btn ghost" data-close>Cancel</button>
        <button class="btn grad">Save</button>
      </div>
    </form>`);
  $('#evForm', m).onsubmit = (x) => {
    x.preventDefault();
    const body = { ...formData(x.target), is_done: e.is_done };
    withButton($('.btn.grad', m), async () => {
      await api(ev ? 'PUT' : 'POST', ev ? `/events/${ev.id}` : '/events', body);
      toast('Saved', 'success'); m.close(); load();
    });
  };
  if (ev) $('#delEv', m).onclick = (x) => withButton(x.target, async () => {
    if (!confirm('Delete this item?')) return;
    await api('DELETE', `/events/${ev.id}`); m.close(); load();
  });
}

load().catch((err) => toast(err.message, 'error'));
