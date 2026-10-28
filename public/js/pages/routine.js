// Routine page: weekly grid, add/edit task modal, and "upload routine photo" (OCR)
let tasks = [];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday first
let selectedDay = new Date().getDay();

async function load() {
  ({ tasks } = await api('GET', '/routine'));
  render();
}

function render() {
  $('#dayTabs').innerHTML = WEEK_ORDER.map((d) =>
    `<button class="${d === selectedDay ? 'active' : ''}" data-day="${d}">${DAY_NAMES[d]}</button>`).join('');

  $('#week').innerHTML = WEEK_ORDER.map((d) => {
    const list = tasks.filter((t) => t.days.split(',').includes(String(d)));
    return `<div class="day-col ${d === new Date().getDay() ? 'today' : ''} ${d === selectedDay ? 'show' : ''}">
      <h3>${DAY_NAMES[d]}${d === new Date().getDay() ? ' · Today' : ''}</h3>
      ${list.map((t) => `
        <div class="r-task cat-${t.category}" data-id="${t.id}">
          <span class="small muted">${fmtTime(t.start_time)} - ${fmtTime(t.end_time)}</span>
          <b>${CATEGORY[t.category].icon} ${esc(t.title)} ${t.priority === 'high' ? '<i data-icon="bell"></i>' : ''}</b>
</div>`).join('') || '<p class="small muted" style="text-align:center">Free day <i data-icon="sun"></i></p>'}
    </div>`;
  }).join('');
}

$('#dayTabs').onclick = (e) => {
  const b = e.target.closest('[data-day]');
  if (b) { selectedDay = Number(b.dataset.day); render(); }
};
$('#week').onclick = (e) => {
  const card = e.target.closest('.r-task');
  if (card) openTaskModal(tasks.find((t) => t.id === Number(card.dataset.id)));
};
$('#addBtn').onclick = () => openTaskModal();

// ---------- Add / edit task ----------
function dayChips(selected) {
  return WEEK_ORDER.map((d) => `<label class="chip-toggle"><input type="checkbox" name="day" value="${d}" ${selected.includes(d) ? 'checked' : ''}><span>${DAY_NAMES[d]}</span></label>`).join('');
}

function openTaskModal(task) {
  const t = task || { title: '', category: 'study', days: String(selectedDay), start_time: '08:00', end_time: '09:00', priority: 'normal', notes: '' };
  const days = t.days.split(',').map(Number);
  const m = openModal(`
    <div class="modal-head"><h2>${task ? 'Edit task' : 'New task'}</h2><button class="icon-btn" data-close><i data-icon="x"></i></button></div>
    <form id="taskForm">
      <div class="field"><label>Task name</label><input name="title" required maxlength="100" value="${esc(t.title)}" placeholder="e.g. Physics revision"></div>
      <div class="field"><label>Category</label><select name="category">
        ${Object.entries(CATEGORY).map(([k, c]) => `<option value="${k}" ${k === t.category ? 'selected' : ''}>${c.label}</option>`).join('')}
      </select></div>
      <div class="field"><label>Days</label><div class="chips">${dayChips(days)}</div>
        <div class="small" style="margin-top:.4rem"><a href="#" data-preset="1,2,3,4,5">Weekdays</a> · <a href="#" data-preset="0,6">Weekend</a> · <a href="#" data-preset="0,1,2,3,4,5,6">Every day</a></div></div>
      <div class="row">
        <div class="field"><label>Start</label><input type="time" name="start_time" required value="${t.start_time}"></div>
        <div class="field"><label>End</label><input type="time" name="end_time" required value="${t.end_time}"></div>
      </div>
      <div class="field card" style="padding:.9rem;box-shadow:none">
        <label class="switch" style="margin:0">
          <span><i data-icon="bell"></i> High priority (alarm + double points)<br><small class="muted" style="font-weight:500">Use for study / work time you must not miss</small></span>
          <input type="checkbox" name="priority" ${t.priority === 'high' ? 'checked' : ''}><span class="track"></span>
        </label>
      </div>
      <div class="field"><label>Notes (optional)</label><input name="notes" maxlength="255" value="${esc(t.notes)}"></div>
      <div class="modal-foot">
        ${task ? '<button type="button" class="btn danger" id="delTask" style="margin-right:auto">Delete</button>' : ''}
        <button type="button" class="btn ghost" data-close>Cancel</button>
        <button class="btn grad">${task ? 'Save' : 'Add task'}</button>
      </div>
    </form>`);

  $$('[data-preset]', m).forEach((a) => a.onclick = (e) => {
    e.preventDefault();
    const set = a.dataset.preset.split(',');
    $$('input[name=day]', m).forEach((c) => { c.checked = set.includes(c.value); });
  });

  $('#taskForm', m).onsubmit = (e) => {
    e.preventDefault();
    const f = e.target;
    const body = {
      title: f.title.value, category: f.category.value,
      days: $$('input[name=day]:checked', m).map((c) => Number(c.value)),
      start_time: f.start_time.value, end_time: f.end_time.value,
      priority: f.priority.checked ? 'high' : 'normal', notes: f.notes.value,
    };
    withButton(f.querySelector('.btn.grad'), async () => {
      await api(task ? 'PUT' : 'POST', task ? `/routine/tasks/${task.id}` : '/routine/tasks', body);
      toast(task ? 'Task updated' : 'Task added', 'success');
      m.close();
      load();
    });
  };

  if (task) $('#delTask', m).onclick = (e) => withButton(e.target, async () => {
    if (!confirm(`Delete "${task.title}" from your routine?`)) return;
    await api('DELETE', `/routine/tasks/${task.id}`);
    toast('Task deleted');
    m.close();
    load();
  });
}

// =====================================================================
//  Upload routine photo
//  1. The photo is read IN THE BROWSER with Tesseract.js (OCR).
//  2. We look for lines like "8:00 - 9:30 Math" or "Mon 4pm-5pm Gym".
//  3. The student checks/edits the rows, then they are saved in one go.
//  Works best with a clear, typed list. Hand-written or grid tables may
//  need more fixing in step 3.
// =====================================================================
const DAY_WORDS = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const CAT_WORDS = {
  study: /study|math|physics|chem|bio|english|bangla|science|history|read|homework|revision|revise|class|lecture|exam|lesson|practice|coding|program/i,
  exercise: /gym|run|exercise|walk|yoga|sport|football|cricket|workout|swim|cycle/i,
  work: /work|job|tuition|tutor|office|project/i,
  break: /break|lunch|dinner|breakfast|rest|nap|sleep|snack|tea/i,
};
const TIME_RANGE = /(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?\s*(?:-|–|—|to|~)\s*(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?/i;

function to24(h, m, ap, fallbackAp) {
  h = Number(h); m = Number(m || 0);
  ap = (ap || fallbackAp || '').toLowerCase().replace(/\./g, '');
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  if (h > 23 || m > 59) return null;
  return `${pad(h)}:${pad(m)}`;
}

function parseRoutineText(text, defaultDays) {
  const rows = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const t = line.match(TIME_RANGE);
    if (!t) continue;
    let start = to24(t[1], t[2], t[3], t[6]);
    let end = to24(t[4], t[5], t[6], t[3]);
    if (!start || !end) continue;
    // "2-3" with no am/pm and small numbers: guess afternoon (school timetables)
    if (!t[3] && !t[6] && Number(t[1]) < 7) { start = to24(Number(t[1]) + 12, t[2]); end = to24(Number(t[4]) + 12, t[5]); }
    if (end <= start) continue;

    // Day names on the line, "daily", "weekdays"...
    let days = [];
    const lower = line.toLowerCase();
    if (/daily|every ?day/.test(lower)) days = [0, 1, 2, 3, 4, 5, 6];
    else if (/weekdays?/.test(lower)) days = [1, 2, 3, 4, 5];
    else if (/weekends?/.test(lower)) days = [0, 6];
    else for (const [w, d] of Object.entries(DAY_WORDS)) if (new RegExp(`\\b${w}`, 'i').test(lower)) days.push(d);
    if (!days.length) days = defaultDays;

    const title = line.replace(t[0], ' ')
      .replace(/\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b|\b(daily|every ?day|weekdays?|weekends?)\b/gi, ' ')
      .replace(/[|:;,_\-–—•*]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100) || 'Task';
    const category = Object.keys(CAT_WORDS).find((c) => CAT_WORDS[c].test(title)) || 'personal';
    rows.push({ title, category, days, start_time: start, end_time: end, priority: category === 'study' || category === 'work' ? 'high' : 'normal' });
  }
  return rows;
}

$('#photoBtn').onclick = () => {
  const m = openModal(`
    <div class="modal-head"><h2><i data-icon="camera"></i> Routine from a photo</h2><button class="icon-btn" data-close><i data-icon="x"></i></button></div>
    <div id="step1">
      <p class="muted">Take a clear photo of your routine. Each line should have a time and a task, like <b>8:00 - 9:30 Math</b> or <b>Mon 4pm-5pm Gym</b>.</p>
      <label class="dropzone"><input type="file" accept="image/*" id="photoInput">
        <span style="font-size:2.2rem"><i data-icon="image"></i></span><br><b>Choose a photo</b><br><span class="small muted">PNG or JPG</span></label>
      <div class="field" style="margin-top:1rem"><label>Lines without a day name go on</label><div class="chips">${dayChips([1, 2, 3, 4, 5])}</div></div>
      <p class="small muted">The photo is read on your own device and is not uploaded.</p>
      <p class="small">Got a table or colourful planner? Use <a href="#" id="useAi"><i data-icon="sparkles"></i> Import with AI</a> instead. It understands any layout.</p>
    </div>
    <div id="step2" class="hidden">
      <img id="photoPreview" class="ocr-preview" alt="">
      <p id="ocrStatus" class="muted" style="text-align:center">Reading your routine…</p>
      <div class="bar"><i id="ocrBar" style="width:0%"></i></div>
    </div>
    <div id="step3" class="hidden"></div>`, { wide: true });

  $('#useAi', m).onclick = (e) => { e.preventDefault(); m.close(); $('#aiBtn').click(); };

  $('#photoInput', m).onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!window.Tesseract) return toast('Could not load the photo reader. Check your internet connection.', 'error');
    const defaultDays = $$('input[name=day]:checked', m).map((c) => Number(c.value));
    $('#step1', m).classList.add('hidden');
    $('#step2', m).classList.remove('hidden');
    $('#photoPreview', m).src = URL.createObjectURL(file);

    try {
      const result = await Tesseract.recognize(file, 'eng', {
        logger: (l) => {
          if (l.status === 'recognizing text') {
            $('#ocrBar', m).style.width = Math.round(l.progress * 100) + '%';
            $('#ocrStatus', m).textContent = `Reading your routine… ${Math.round(l.progress * 100)}%`;
          }
        },
      });
      const rows = parseRoutineText(result.data.text, defaultDays);
      showReview(m, rows, result.data.text);
    } catch (err) {
      $('#ocrStatus', m).textContent = 'Sorry, the photo could not be read: ' + err.message;
    }
  };
};

// Step 3: editable table of what we found
function showReview(m, rows, rawText, skipped = []) {
  $('#step2', m).classList.add('hidden');
  const box = $('#step3', m);
  box.classList.remove('hidden');
  const rowHtml = (r = { title: '', category: 'study', days: [1, 2, 3, 4, 5], start_time: '08:00', end_time: '09:00', priority: 'normal' }) => `
    <tr>
      <td><input data-f="title" value="${esc(r.title)}" style="min-width:140px"></td>
      <td><input type="time" data-f="start_time" value="${r.start_time}"></td>
      <td><input type="time" data-f="end_time" value="${r.end_time}"></td>
      <td><input data-f="days" value="${r.days.map((d) => DAY_NAMES[d]).join(' ')}" title="e.g. Mon Tue Wed" style="min-width:120px"></td>
      <td><select data-f="category">${Object.entries(CATEGORY).map(([k, c]) => `<option value="${k}" ${k === r.category ? 'selected' : ''}>${c.label}</option>`).join('')}</select></td>
      <td style="text-align:center"><input type="checkbox" data-f="priority" ${r.priority === 'high' ? 'checked' : ''} title="High priority (alarm)"></td>
      <td><button class="icon-btn" data-remove title="Remove"><i data-icon="x"></i></button></td>
    </tr>`;

  box.innerHTML = `
    <p>${rows.length ? `We found <b>${rows.length}</b> task${rows.length > 1 ? 's' : ''}. Check them and fix anything that's wrong.` : "We couldn't find any times in this photo. Add the tasks below, or try a clearer photo."}</p>
    <div style="overflow-x:auto"><table class="ocr-table">
      <thead><tr><th>Task</th><th>Start</th><th>End</th><th>Days</th><th>Category</th><th><i data-icon="bell"></i></th><th></th></tr></thead>
      <tbody>${rows.map(rowHtml).join('')}</tbody></table></div>
    <button class="btn sm ghost" id="addRow" style="margin-top:.5rem"><i data-icon="plus"></i> Add row</button>
    ${skipped.length ? `<p class="small muted">Skipped ${skipped.length} item(s) with missing or wrong times: ${esc(skipped.join(', '))}</p>` : ''}
    ${rawText ? `<details style="margin-top:1rem"><summary class="small muted">Text we read from the photo</summary><pre class="small" style="white-space:pre-wrap">${esc(rawText)}</pre></details>` : ''}
    <label class="switch" style="margin-top:1rem"><span>Replace my current routine<br><small class="muted" style="font-weight:500">Off = add these tasks to it</small></span><input type="checkbox" id="replace"><span class="track"></span></label>
    <div class="modal-foot"><button class="btn ghost" data-close>Cancel</button><button class="btn grad" id="importBtn">Save to my routine</button></div>`;

  box.onclick = (e) => { if (e.target.closest('[data-remove]')) e.target.closest('tr').remove(); };
  $('#addRow', box).onclick = () => $('tbody', box).insertAdjacentHTML('beforeend', rowHtml());

  $('#importBtn', box).onclick = (e) => withButton(e.target, async () => {
    const list = $$('tbody tr', box).map((tr) => {
      const v = (f) => tr.querySelector(`[data-f=${f}]`);
      const days = v('days').value.toLowerCase().split(/[\s,]+/).map((w) => DAY_WORDS[w.slice(0, 3)]).filter((d) => d !== undefined);
      return { title: v('title').value, start_time: v('start_time').value, end_time: v('end_time').value, days, category: v('category').value, priority: v('priority').checked ? 'high' : 'normal' };
    });
    if ($('#replace', box).checked && !confirm('This removes all tasks in your current routine. Continue?')) return;
    const res = await api('POST', '/routine/import', { tasks: list, replace: $('#replace', box).checked });
    toast(`${res.imported} tasks saved to your routine`, 'success');
    m.close();
    load();
  });
}

// =====================================================================
//  Import with AI (JSON)
//  Photo OCR can't understand grid timetables (columns per day, colours,
//  tasks after midnight). So the student copies AI_PROMPT into any AI chat
//  (ChatGPT, Gemini, Claude...) together with their routine picture, and
//  pastes / uploads the JSON it replies with. We clean it up below, then
//  reuse the same review table as the photo import.
// =====================================================================
const AI_PROMPT = `You are helping me import my weekly routine into an app called Student Helper.
I attached a picture (or pasted text) of my routine. Read ALL of it carefully, every day and every block.
Reply with ONLY a JSON object. No explanation, no markdown, no code fences.

Use exactly this format:
{
  "tasks": [
    { "title": "University study", "days": ["Sat"], "start": "10:00", "end": "12:00", "category": "study", "priority": "high", "notes": "" }
  ]
}

Rules:
1. "start" and "end" use 24-hour time "HH:MM". 1:30 PM = "13:30". Midnight = "00:00".
2. "days" uses only: "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat".
3. If the same task with the same times happens on several days, write it ONCE and list all those days.
4. A task that starts after midnight belongs to the NEXT calendar day. Example: Saturday night "12:00 AM - 2:15 AM Gaming" becomes days ["Sun"], start "00:00", end "02:15".
5. A task that ends exactly at midnight gets end "23:59". A task that crosses midnight (for example 11:00 PM - 12:30 AM) must be split in two: one until "23:59" on the first day, and one from "00:00" on the next day.
6. Do NOT include night sleep. Include naps only if they are shown as their own block.
7. "category" must be one of: "study", "work", "exercise", "personal", "break", "other".
   Classes, courses, revision, assignments and reading = study. Jobs, commute or "outside" work = work.
   Meals, rest, naps, showers and refresh = break. Family time, gaming and hobbies = personal.
8. "priority" is "high" only for important study or work blocks that should ring an alarm. Everything else is "normal".
9. Keep "title" short (at most 60 characters). Put extra details in "notes".
10. Skip days the routine marks as excluded, off or empty.
11. Tasks on the same day must not overlap.`;

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

// "13:30", "1:30 PM", "9 am", "24:00" -> minutes after midnight (or null)
function toMinutes(v) {
  const m = String(v ?? '').trim().toLowerCase().match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] || 0);
  const ap = (m[3] || '').replace(/\./g, '');
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  if (h > 24 || min > 59 || (h === 24 && min > 0)) return null;
  return h * 60 + min;
}
const fromMinutes = (n) => `${pad(Math.floor(n / 60))}:${pad(n % 60)}`;

// ["Mon","tuesday",3], "weekdays", "daily", "Mon, Wed" -> [1,2,3] etc.
function toDays(v) {
  const list = Array.isArray(v) ? v : String(v ?? '').split(/[\s,/&]+/);
  const out = new Set();
  for (const item of list) {
    if (typeof item === 'number' && item >= 0 && item <= 6) { out.add(item); continue; }
    const w = String(item).trim().toLowerCase();
    if (!w) continue;
    if (/^(daily|every ?day|all)$/.test(w)) ALL_DAYS.forEach((d) => out.add(d));
    else if (/^weekdays?$/.test(w)) [1, 2, 3, 4, 5].forEach((d) => out.add(d));
    else if (/^weekends?$/.test(w)) [0, 6].forEach((d) => out.add(d));
    else if (/^[0-6]$/.test(w)) out.add(Number(w));
    else if (DAY_WORDS[w.slice(0, 3)] !== undefined) out.add(DAY_WORDS[w.slice(0, 3)]);
  }
  return [...out].sort();
}

// Text from the AI (maybe with ```json fences or a sentence around it) -> review rows
function parseAiJson(text) {
  const raw = String(text).replace(/```(?:json)?/gi, '');
  const first = raw.search(/[[{]/);
  const last = Math.max(raw.lastIndexOf('}'), raw.lastIndexOf(']'));
  if (first < 0 || last < first) throw new Error('No JSON found. Paste the whole answer from the AI.');
  let data;
  try { data = JSON.parse(raw.slice(first, last + 1)); }
  catch { throw new Error('This is not valid JSON. Ask the AI to "reply with only valid JSON" and try again.'); }
  const items = Array.isArray(data) ? data : (data.tasks || data.routine || data.items || []);
  if (!Array.isArray(items) || !items.length) throw new Error('The JSON has no "tasks" list.');

  const rows = [];
  const skipped = [];
  for (const t of items) {
    const title = String(t.title || t.name || t.task || '').trim().slice(0, 100);
    const start = toMinutes(t.start ?? t.start_time ?? t.from);
    let end = toMinutes(t.end ?? t.end_time ?? t.to);
    const days = toDays(t.days ?? t.day);
    if (!title || start === null || end === null || !days.length) { skipped.push(title || '(no title)'); continue; }
    if (/sleep/i.test(title) && !/nap/i.test(title)) continue; // night sleep is not a task

    const catText = `${t.category || ''} ${title}`;
    const category = CATEGORY[t.category] ? t.category
      : Object.keys(CAT_WORDS).find((c) => CAT_WORDS[c].test(catText)) || 'personal';
    const priority = /^(high|true|important|urgent)$/i.test(String(t.priority)) ? 'high' : 'normal';
    const notes = String(t.notes || '').slice(0, 255);
    const base = { title, category, priority, notes };

    if (end === 0 || end === 1440) end = 1439; // "ends at midnight" -> 23:59
    if (end > start) {
      rows.push({ ...base, days, start_time: fromMinutes(start), end_time: fromMinutes(end) });
    } else if (end < start) {
      // Crosses midnight: split into "start -> 23:59" and "00:00 -> end" on the next day
      rows.push({ ...base, days, start_time: fromMinutes(start), end_time: '23:59' });
      if (end > 0) rows.push({ ...base, days: days.map((d) => (d + 1) % 7).sort(), start_time: '00:00', end_time: fromMinutes(end) });
    } else skipped.push(title);
  }

  // Same task + same times on different days -> one row with all the days
  const merged = new Map();
  for (const r of rows) {
    const key = [r.title.toLowerCase(), r.start_time, r.end_time, r.category, r.priority].join('|');
    if (merged.has(key)) merged.get(key).days = [...new Set([...merged.get(key).days, ...r.days])].sort();
    else merged.set(key, { ...r });
  }
  const list = [...merged.values()].sort((a, b) => a.start_time.localeCompare(b.start_time));
  return { rows: list, skipped };
}

$('#aiBtn').onclick = () => {
  const m = openModal(`
    <div class="modal-head"><h2><i data-icon="sparkles"></i> Import your routine with AI</h2><button class="icon-btn" data-close><i data-icon="x"></i></button></div>
    <div id="step1">
      <p class="muted">Works with <b>any</b> routine: tables, colourful planners, handwriting or plain text.</p>
      <ol class="ai-steps">
        <li>Copy this prompt.</li>
        <li>Open any AI chat (ChatGPT, Gemini, Claude, Copilot…), paste the prompt and attach a picture of your routine.</li>
        <li>Copy the AI's answer and paste it below, or save it as a <b>.json</b> file and upload it.</li>
      </ol>
      <div class="prompt-box"><pre id="aiPrompt">${esc(AI_PROMPT)}</pre>
        <button class="btn sm grad" id="copyPrompt"><i data-icon="clipboard"></i> Copy prompt</button></div>
      <div class="field" style="margin-top:1rem"><label>Paste the AI's answer here</label>
        <textarea id="aiJson" rows="7" placeholder='{ "tasks": [ ... ] }' style="font-family:ui-monospace,monospace;font-size:.8rem"></textarea></div>
      <div class="row" style="align-items:center">
        <label class="btn ghost sm" style="flex:0 0 auto;cursor:pointer"><i data-icon="folder"></i> Upload .json file<input type="file" accept=".json,.txt,application/json,text/plain" id="aiFile" hidden></label>
        <span class="small muted" style="flex:1">You can check and fix every task before it is saved.</span>
        <button class="btn grad" id="aiRead" style="flex:0 0 auto">Check tasks</button>
      </div>
      <p id="aiError" class="small" style="color:var(--pink)"></p>
    </div>
    <div id="step2" class="hidden"></div>
    <div id="step3" class="hidden"></div>`, { wide: true });

  $('#copyPrompt', m).onclick = async () => {
    try { await navigator.clipboard.writeText(AI_PROMPT); }
    catch { // older browsers / http on a phone: select the text so the student can copy it
      const r = document.createRange(); r.selectNodeContents($('#aiPrompt', m));
      getSelection().removeAllRanges(); getSelection().addRange(r); document.execCommand('copy');
    }
    toast('Prompt copied. Paste it into your AI chat', 'success');
  };

  $('#aiFile', m).onchange = async (e) => {
    const file = e.target.files[0];
    if (file) { $('#aiJson', m).value = await file.text(); $('#aiRead', m).click(); }
  };

  $('#aiRead', m).onclick = () => {
    const text = $('#aiJson', m).value.trim();
    $('#aiError', m).textContent = '';
    if (!text) { $('#aiError', m).textContent = 'Paste the AI answer first, or upload a .json file.'; return; }
    try {
      const { rows, skipped } = parseAiJson(text);
      if (!rows.length) throw new Error('No usable tasks found in this JSON.');
      $('#step1', m).classList.add('hidden');
      showReview(m, rows, null, skipped);
    } catch (err) {
      $('#aiError', m).textContent = err.message;
    }
  };
};

if (new URLSearchParams(location.search).get('welcome')) {
  openModal(`<div style="text-align:center"><div style="font-size:3rem"><i data-icon="sparkles"></i></div><h2>Welcome to Student Helper!</h2>
    <p class="muted">Start by building your weekly routine. Add tasks one by one, or upload a photo of a routine you already have.</p>
    <p class="small muted">Tip: turn on <i data-icon="bell"></i> High priority for study and work time so the alarm reminds you to check in.</p>
    <div class="modal-foot" style="justify-content:center"><button class="btn grad" data-close>Let's go</button></div></div>`);
  history.replaceState(null, '', location.pathname);
}

load().catch((err) => toast(err.message, 'error'));
