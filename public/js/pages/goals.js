// Goals page: cards with progress, log progress, create / edit goals
let goals = [];
const PERIOD = { daily: 'Today', weekly: 'This week', once: 'Overall' };

async function load() {
  ({ goals } = await api('GET', '/goals'));
  render();
}

function render() {
  if (!goals.length) {
    $('#goals').innerHTML = `<div class="card empty" style="grid-column:1/-1"><span class="big"><i data-icon="target"></i></span>
      No goals yet. Try <b>"Study 3 hours every day"</b> or <b>"Finish 10 chapters of Physics"</b>.<br><br>
      <button class="btn" onclick="openForm()">Set my first goal</button></div>`;
    return;
  }
  $('#goals').innerHTML = goals.map((g) => `
    <div class="card goal-card ${g.is_done ? 'done' : ''}">
      <div class="top">
        <div class="grow">
          <span class="badge purple">${PERIOD[g.period]}</span> ${g.auto_study ? '<span class="badge ok" title="Completed study tasks add hours automatically"><i data-icon="zap"></i> Auto</span>' : ''} ${g.is_public ? '' : '<span class="badge"><i data-icon="lock"></i> Private</span>'}
          <h3 style="margin-top:.5rem">${esc(g.title)}</h3>
          ${g.deadline ? `<small class="muted">Deadline: ${fmtDate(g.deadline)}</small>` : ''}
        </div>
        <button class="icon-btn" data-edit="${g.id}"><i data-icon="pencil"></i></button>
      </div>
      <div class="big">${+g.progress.toFixed(2)} <span class="muted" style="font-size:1rem">/ ${g.target_value} ${esc(g.unit)}</span></div>
      <div class="bar" style="margin:.5rem 0 1rem"><i style="width:${g.percent}%"></i></div>
      ${g.is_done ? '<p style="margin:0;font-weight:600;color:var(--mint)"><i data-icon="sparkles"></i> Goal reached!</p>' : `
      <form class="row" data-progress="${g.id}" style="gap:.5rem">
        <input name="amount" type="number" step="0.25" min="0.25" placeholder="+ ${esc(g.unit)}" required style="flex:1 1 80px">
        <button class="btn sm" style="flex:0 0 auto">Add</button>
      </form>`}
    </div>`).join('');
}

$('#goals').addEventListener('submit', (e) => {
  const f = e.target.closest('[data-progress]');
  if (!f) return;
  e.preventDefault();
  withButton(f.querySelector('button'), async () => {
    ({ goals } = await api('POST', `/goals/${f.dataset.progress}/progress`, { amount: f.amount.value }));
    const g = goals.find((x) => x.id === Number(f.dataset.progress));
    toast(g.is_done ? 'Goal reached!' : 'Progress saved', 'success');
    render();
  });
});
$('#goals').addEventListener('click', (e) => {
  const b = e.target.closest('[data-edit]');
  if (b) openForm(goals.find((g) => g.id === Number(b.dataset.edit)));
});
$('#addBtn').onclick = () => openForm();

function openForm(goal) {
  const g = goal || { title: '', period: 'daily', target_value: 2, unit: 'hours', auto_study: true, deadline: '', is_public: true };
  const m = openModal(`
    <div class="modal-head"><h2>${goal ? 'Edit goal' : 'New goal'}</h2><button class="icon-btn" data-close><i data-icon="x"></i></button></div>
    <form id="goalForm">
      <div class="field"><label>Goal</label><input name="title" required maxlength="120" value="${esc(g.title)}" placeholder="e.g. Study 3 hours"></div>
      <div class="field"><label>How often</label><div class="chips">
        ${Object.entries({ daily: 'Every day', weekly: 'Every week', once: 'One-time goal' }).map(([k, v]) =>
          `<label class="chip-toggle"><input type="radio" name="period" value="${k}" ${g.period === k ? 'checked' : ''}><span>${v}</span></label>`).join('')}
      </div></div>
      <div class="row">
        <div class="field"><label>Target</label><input type="number" name="target_value" step="0.25" min="0.25" required value="${g.target_value}"></div>
        <div class="field"><label>Unit</label><input name="unit" maxlength="20" value="${esc(g.unit)}" placeholder="hours, chapters, pages…"></div>
      </div>
      <div class="field"><label>Deadline (optional)</label><input type="date" name="deadline" value="${g.deadline || ''}"></div>
      <div class="field"><label class="switch"><span><i data-icon="zap"></i> Count my study tasks automatically<br><small class="muted" style="font-weight:500">Finished "Study" routine tasks add their hours here</small></span>
        <input type="checkbox" name="auto_study" ${g.auto_study ? 'checked' : ''}><span class="track"></span></label></div>
      <div class="field"><label class="switch"><span>Show on my profile</span>
        <input type="checkbox" name="is_public" ${g.is_public ? 'checked' : ''}><span class="track"></span></label></div>
      <div class="modal-foot">
        ${goal ? '<button type="button" class="btn danger" id="delGoal" style="margin-right:auto">Delete</button>' : ''}
        <button type="button" class="btn ghost" data-close>Cancel</button>
        <button class="btn grad">Save</button>
      </div>
    </form>`);
  $('#goalForm', m).onsubmit = (e) => {
    e.preventDefault();
    const f = e.target;
    const body = { ...formData(f), auto_study: f.auto_study.checked, is_public: f.is_public.checked };
    withButton($('.btn.grad', m), async () => {
      await api(goal ? 'PUT' : 'POST', goal ? `/goals/${goal.id}` : '/goals', body);
      toast('Goal saved', 'success'); m.close(); load();
    });
  };
  if (goal) $('#delGoal', m).onclick = (e) => withButton(e.target, async () => {
    if (!confirm('Delete this goal?')) return;
    await api('DELETE', `/goals/${goal.id}`); m.close(); load();
  });
}

load().catch((err) => toast(err.message, 'error'));
