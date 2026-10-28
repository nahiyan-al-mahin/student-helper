// Reports page: numbers, charts (simple SVG, no chart library) and insights
let days = 7;

// Bar chart of daily points. Days without routine tasks are shown grey.
function dailyChart(daily, minPts) {
  const W = 700, H = 220, padL = 30, padB = 24, n = daily.length;
  const bw = (W - padL) / n;
  const y = (v) => H - padB - (v / 100) * (H - padB - 10);
  let svg = `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Daily points">`;
  [0, 50, 100].forEach((v) => {
    svg += `<line x1="${padL}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-dasharray="3 4"/>
      <text x="0" y="${y(v) + 4}">${v}</text>`;
  });
  svg += `<line x1="${padL}" x2="${W}" y1="${y(minPts)}" y2="${y(minPts)}" stroke="var(--amber)" stroke-width="1.5"/>`;
  daily.forEach((d, i) => {
    const x = padL + i * bw + bw * 0.18, w = bw * 0.64;
    const color = !d.scheduled ? 'var(--line)' : d.points >= 100 ? 'var(--mint)' : d.points >= minPts ? 'var(--primary)' : 'var(--pink)';
    const h = d.scheduled ? Math.max(2, y(0) - y(d.points)) : 3;
    const isToday = d.date === todayStr(); // today is not finished yet, so draw it faded
    svg += `<rect x="${x}" y="${y(0) - h}" width="${w}" height="${h}" rx="${Math.min(6, w / 3)}" fill="${color}" opacity="${isToday ? 0.45 : 1}"><title>${isToday ? '(today so far) ' : ''}${fmtDate(d.date)}: ${d.scheduled ? d.points + ' pts' : 'no tasks'}</title></rect>`;
    const every = Math.ceil(n / 10);
    if (i % every === 0) svg += `<text x="${x + w / 2}" y="${H - 6}" text-anchor="middle">${n <= 7 ? fmtDate(d.date, { weekday: 'short' }) : fmtDate(d.date, { day: 'numeric', month: 'short' })}</text>`;
  });
  return svg + '</svg>';
}

// One horizontal bar row. value is 0-100; suffix is '%' or '' (for points)
const hbar = (label, value, suffix = '%') => `<div class="hbar"><span>${label}</span>
  <div class="bar"><i style="width:${value ?? 0}%"></i></div><b>${value == null ? '–' : value + suffix}</b></div>`;

function kpi(icon, value, label) {
  return `<div class="card stat"><span class="ico">${icon}</span><span><b>${value}</b><small>${label}</small></span></div>`;
}

async function load() {
  const r = await api('GET', `/reports?days=${days}`);
  const s = r.summary;
  $('#rangeLabel').textContent = `${fmtDate(r.from)} - ${fmtDate(r.to)}`;

  $('#report').innerHTML = `
    <div class="grid cols-4">
      ${kpi('<i data-icon="trending"></i>', s.success_rate == null ? '–' : s.success_rate + '%', 'Routine success')}
      ${kpi('<i data-icon="star"></i>', s.avg_daily_points ?? '–', 'Avg. points / day')}
      ${kpi('<i data-icon="flame"></i>', `${s.streak} <small class="muted">/ best ${s.best_streak}</small>`, 'Streak (days)')}
      ${kpi('<i data-icon="timer"></i>', s.checkin_rate == null ? '–' : s.checkin_rate + '%', 'On-time check-ins')}
      ${kpi('<i data-icon="check-circle"></i>', `${s.tasks_done}/${s.tasks_scheduled}`, 'Tasks completed')}
      ${kpi('<i data-icon="book"></i>', s.study_hours + 'h', 'Study hours')}
      ${kpi('<i data-icon="award"></i>', s.perfect_days, 'Perfect days')}
      ${kpi('<i data-icon="star"></i>', `${s.important_done} done · ${s.important_upcoming} next`, 'Important items')}
    </div>

    <section class="card" style="margin-top:1rem">
      <div class="card-head"><h2>Daily points</h2>
        <span class="small muted"><span class="cat-dot" style="--c:var(--mint)"></span> 100 &nbsp; <span class="cat-dot" style="--c:var(--primary)"></span> streak day &nbsp; <span class="cat-dot" style="--c:var(--pink)"></span> below goal &nbsp; <span style="color:var(--amber)">━</span> streak line</span></div>
      ${dailyChart(r.daily, s.streak_min_points)}
    </section>

    <div class="grid cols-2" style="margin-top:1rem">
      <section class="card">
        <h2><i data-icon="bulb"></i> Insights</h2>
        ${r.insights.map((t) => `<div class="insight"><span class="ico"><i data-icon="bulb"></i></span><span>${esc(t)}</span></div>`).join('')}
      </section>
      <section class="card">
        <h2><i data-icon="sprout"></i> How your routine helps your life</h2>
        ${r.life_impact.length ? r.life_impact.map((t) => `<div class="insight"><span class="ico"><i data-icon="sprout"></i></span><span>${esc(t)}</span></div>`).join('') : '<p class="muted">Keep following your routine for a few days to see this.</p>'}
      </section>
    </div>

    <div class="grid cols-3" style="margin-top:1rem">
      <section class="card">
        <h3>By category</h3>
        ${r.categories.length ? r.categories.map((c) => hbar(`${CATEGORY[c.name].icon} ${CATEGORY[c.name].label}`, c.rate)).join('') : '<p class="muted small">No data yet.</p>'}
      </section>
      <section class="card">
        <h3>By time of day</h3>
        ${r.parts_of_day.length ? r.parts_of_day.map((p) => hbar({ Morning: '<i data-icon="sunrise"></i>', Afternoon: '<i data-icon="sun"></i>', Evening: '<i data-icon="moon"></i>' }[p.name] + ' ' + p.name, p.rate)).join('') : '<p class="muted small">No data yet.</p>'}
      </section>
      <section class="card">
        <h3>Average points by day</h3>
        ${[1, 2, 3, 4, 5, 6, 0].map((i) => r.weekdays[i]).map((w) => hbar(w.name, w.avg_points, ' pts')).join('')}
      </section>
    </div>

    <div class="grid cols-2" style="margin-top:1rem">
      <section class="card">
        <h3>Tasks</h3>
        ${r.tasks.length ? `<div style="overflow-x:auto"><table class="table"><thead><tr><th>Task</th><th>Done</th><th>Rate</th></tr></thead><tbody>
          ${r.tasks.map((t) => `<tr><td>${CATEGORY[t.category].icon} ${esc(t.name)}</td><td>${t.done}/${t.scheduled}</td>
            <td><span class="badge ${t.rate >= 80 ? 'ok' : t.rate >= 50 ? 'warn' : 'high'}">${t.rate}%</span></td></tr>`).join('')}
        </tbody></table></div>` : '<p class="muted small">No finished days yet.</p>'}
      </section>
      <section class="card">
        <h3>Goals right now</h3>
        ${r.goals.length ? r.goals.map((g) => `<div style="margin-bottom:.9rem">
            <div style="display:flex;justify-content:space-between;gap:.5rem"><b>${esc(g.title)}</b><small class="muted">${+g.progress.toFixed(2)}/${g.target_value} ${esc(g.unit)}</small></div>
            <div class="bar" style="margin-top:.3rem"><i style="width:${g.percent}%"></i></div></div>`).join('') : '<p class="muted small">No goals yet.</p>'}
      </section>
    </div>`;
}

$('#range').onclick = (e) => {
  const b = e.target.closest('[data-days]');
  if (!b) return;
  days = Number(b.dataset.days);
  $$('#range button').forEach((x) => x.classList.toggle('active', x === b));
  load().catch((err) => toast(err.message, 'error'));
};

load().catch((err) => toast(err.message, 'error'));
