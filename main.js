import './style.css';

const KEY = 'atul_playground_v3';
const TARGET = 12 * 60;
const DEFAULT_BLOCKS = [
  ['05:30–08:00', 'Focus block'],
  ['08:00–08:30', 'Breakfast / reset'],
  ['08:30–11:00', 'Focus block'],
  ['11:00–11:30', 'Break'],
  ['11:30–13:30', 'Focus block'],
  ['13:30–14:00', 'Lunch'],
  ['14:00–17:00', 'Sleep / recovery'],
  ['17:30–20:00', 'Focus block'],
  ['20:00–20:30', 'Dinner / break'],
  ['20:30–23:00', 'Focus block']
];

const pad = n => String(n).padStart(2, '0');
const localDate = (date = new Date()) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const tomorrow = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return localDate(d);
};
const fmt = mins =>
  `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;

let state;
try {
  state = JSON.parse(localStorage.getItem(KEY) || 'null');
} catch {
  state = null;
}
state ||= { days: {}, plans: {}, posts: [], note: '' };
state.days ||= {};
state.plans ||= {};
state.posts ||= [];
state.note ||= '';

let timer = { running: false, seconds: 0, startedAt: null };
let selectedScheduleDate = tomorrow();

const save = () => localStorage.setItem(KEY, JSON.stringify(state));

function ensureDay(date = localDate()) {
  state.days[date] ||= { focus: 0, sessions: 0 };
  state.days[date].focus ||= 0;
  state.days[date].sessions ||= 0;
  return state.days[date];
}

function defaultBlocks() {
  return DEFAULT_BLOCKS.map(([time, title]) => ({ time, title, done: false }));
}

function normalisePlan(plan) {
  if (!Array.isArray(plan)) return null;
  return plan.map(block => ({
    time: String(block?.time ?? ''),
    title: String(block?.title ?? 'Focus block'),
    done: Boolean(block?.done)
  }));
}

function getPlan(date) {
  const existing = normalisePlan(state.plans[date]);
  if (existing) {
    state.plans[date] = existing;
    return existing;
  }
  const fresh = defaultBlocks();
  state.plans[date] = fresh;
  return fresh;
}

const app = document.querySelector('#app');

function render() {
  const d = ensureDay();
  const pct = Math.min(100, Math.round(d.focus / TARGET * 100));
  const todayPlan = getPlan(localDate());

  app.innerHTML = `
    <div class="shell">
      <header class="hero">
        <div class="stars">✦　✧　★　✦　✧</div>
        <div class="eyebrow">ATUL'S PERSONAL PLAYGROUND · OWNERSHIP: ATUL</div>
        <h1>ATUL<br><span>(PLAYGROUND)</span></h1>
        <p>A flexible personal workspace built around one objective: <b>12 hours of real focused work.</b></p>
      </header>

      <nav class="nav">
        ${[
          ['today', 'Today'],
          ['schedule', 'Schedule / Edit'],
          ['calendar', 'Calendar'],
          ['posts', 'Posts'],
          ['tools', 'Tools']
        ].map(([view, label], i) => `
          <button class="navbtn ${i === 0 ? 'active' : ''}" data-view="${view}">${label}</button>
        `).join('')}
      </nav>

      <main>
        <section id="today" class="view active">
          <div class="stats">
            <article class="card">
              <small>TODAY'S FOCUS</small>
              <strong id="focus">${fmt(d.focus)}</strong>
              <div class="progress"><i style="width:${pct}%"></i></div>
              <small>${pct}% of 12h</small>
            </article>
            <article class="card">
              <small>REMAINING</small>
              <strong>${fmt(Math.max(0, TARGET - d.focus))}</strong>
              <small>Only counted focus time matters.</small>
            </article>
            <article class="card">
              <small>TODAY</small>
              <strong>${new Date().toLocaleDateString(undefined, {day:'numeric', month:'short'})}</strong>
              <button class="btn" id="resetDay">Reset today's record</button>
            </article>
          </div>

          <article class="card section">
            <h2>⏱ Focus timer</h2>
            <div class="timer" id="timer">00:00:00</div>
            <div class="controls">
              <button class="btn primary" id="start">Start focus</button>
              <button class="btn" id="pause">Pause</button>
              <button class="btn" id="log">Log 60 min</button>
            </div>
          </article>

          <article class="card section">
            <div class="section-title-row">
              <div>
                <h2>🗓 Today's flexible timeline</h2>
                <div class="notice">Tick a block when you complete it. You can edit today's schedule whenever you need.</div>
              </div>
              <button class="btn primary" id="editToday">✏️ Edit today</button>
            </div>

            <div class="timeline">
              ${todayPlan.length
                ? todayPlan.map((block, i) => timelineBlock(block, i)).join('')
                : '<div class="empty">No blocks yet. Click “Edit today” to add one.</div>'}
            </div>
          </article>
        </section>

        <section id="schedule" class="view">
          <article class="card">
            <h2>✨ Schedule / Edit a day</h2>
            <p class="muted">Choose any date. Edit, add, remove, and check off timetable blocks.</p>

            <div class="formrow">
              <label>Date
                <input id="planDate" type="date" value="${escapeAttr(selectedScheduleDate)}">
              </label>
              <label>Focus target (hours)
                <input id="target" type="number" value="12" min="1" max="18" step=".5">
              </label>
            </div>

            <div id="blocks"></div>

            <div class="controls">
              <button class="btn" id="addBlock">＋ Add block</button>
              <button class="btn primary" id="savePlan">💾 Save schedule</button>
            </div>
            <p class="muted" id="scheduleStatus"></p>
          </article>
        </section>

        <section id="calendar" class="view">
          <article class="card">
            <h2>📅 Calendar</h2>
            <div class="calendar" id="calendarGrid"></div>
            <p class="muted">Click any date to open and edit that day's schedule.</p>
          </article>
        </section>

        <section id="posts" class="view">
          <article class="card">
            <h2>📸 Posts</h2>
            <p class="muted">Wins, thoughts, pictures and motivation.</p>
            <textarea id="postText" placeholder="Write a post..."></textarea>
            <input id="postImage" type="file" accept="image/*">
            <button class="btn primary" id="publish">Publish</button>
          </article>
          <div id="postList" class="postgrid"></div>
        </section>

        <section id="tools" class="view">
          <div class="stats">
            <article class="card"><small>REAL FOCUS</small><strong>${fmt(d.focus)}</strong><small>Today</small></article>
            <article class="card"><small>SESSIONS</small><strong>${d.sessions}</strong><small>Today</small></article>
          </div>
          <article class="card section">
            <h2>📝 Quick note</h2>
            <textarea id="note" placeholder="Things Atul needs to remember...">${escapeHtml(state.note || '')}</textarea>
            <button class="btn primary" id="saveNote">Save note</button>
          </article>
        </section>
      </main>

      <div class="toast pink">💗 i miss “us”</div>
      <div class="toast yellow">🍈 fresh focus fuel 🍈</div>
      <footer>Built for Atul ✦ ATUL(PLAYGROUND)</footer>
    </div>`;

  wire();
  renderScheduleEditor(selectedScheduleDate);
  renderCalendar();
  renderPosts();
}

function timelineBlock(block, index) {
  return `
    <label class="slot" style="cursor:pointer;display:flex;align-items:center;gap:12px;">
      <input
        type="checkbox"
        class="timeline-check"
        data-index="${index}"
        ${block.done ? 'checked' : ''}
        aria-label="Mark ${escapeAttr(block.title)} complete"
        style="width:18px;height:18px;flex:0 0 auto;"
      >
      <b style="${block.done ? 'text-decoration:line-through;opacity:.6;' : ''}">${escapeHtml(block.time)}</b>
      <span style="${block.done ? 'text-decoration:line-through;opacity:.6;' : ''}">${escapeHtml(block.title)}</span>
    </label>`;
}

function wire() {
  document.querySelectorAll('.navbtn').forEach(button => {
    button.onclick = () => showView(button.dataset.view);
  });

  document.getElementById('start').onclick = () => {
    if (timer.running) return;
    timer.running = true;
    timer.startedAt = Date.now() - timer.seconds * 1000;
    tick();
  };

  document.getElementById('pause').onclick = () => {
    if (timer.running) {
      timer.seconds = Math.floor((Date.now() - timer.startedAt) / 1000);
    }
    timer.running = false;
  };

  document.getElementById('log').onclick = () => {
    ensureDay().focus += 60;
    ensureDay().sessions++;
    save();
    render();
  };

  document.getElementById('resetDay').onclick = () => {
    if (confirm("Reset today's focus record?")) {
      state.days[localDate()] = { focus: 0, sessions: 0 };
      save();
      render();
    }
  };

  document.querySelectorAll('.timeline-check').forEach(check => {
    check.onchange = () => {
      const plan = getPlan(localDate());
      const index = Number(check.dataset.index);
      if (!plan[index]) return;
      plan[index].done = check.checked;
      save();
      const slot = check.closest('.slot');
      if (slot) {
        slot.querySelectorAll('b, span').forEach(el => {
          el.style.textDecoration = check.checked ? 'line-through' : '';
          el.style.opacity = check.checked ? '.6' : '';
        });
      }
    };
  });

  document.getElementById('editToday').onclick = () => {
    selectedScheduleDate = localDate();
    showView('schedule');
  };

  document.getElementById('planDate').onchange = event => {
    selectedScheduleDate = event.target.value || localDate();
    renderScheduleEditor(selectedScheduleDate);
  };

  document.getElementById('addBlock').onclick = () => {
    const container = document.getElementById('blocks');
    if (!container) return;
    container.appendChild(blockEditor({time: '', title: 'Focus block', done: false}, container.children.length));
  };

  document.getElementById('savePlan').onclick = saveCurrentPlan;

  document.getElementById('publish').onclick = () => {
    const text = document.getElementById('postText').value.trim();
    const file = document.getElementById('postImage').files[0];
    if (!text && !file) return;
    if (!file) return pushPost(text, '');
    const reader = new FileReader();
    reader.onload = () => pushPost(text, reader.result);
    reader.readAsDataURL(file);
  };

  document.getElementById('saveNote').onclick = () => {
    state.note = document.getElementById('note').value;
    save();
    alert('Note saved.');
  };
}

function showView(view) {
  document.querySelectorAll('.navbtn').forEach(button => {
    button.classList.toggle('active', button.dataset.view === view);
  });
  document.querySelectorAll('.view').forEach(section => {
    section.classList.toggle('active', section.id === view);
  });
  if (view === 'schedule') renderScheduleEditor(selectedScheduleDate);
}

function renderScheduleEditor(date) {
  const dateInput = document.getElementById('planDate');
  const container = document.getElementById('blocks');
  if (!dateInput || !container) return;

  selectedScheduleDate = date || localDate();
  dateInput.value = selectedScheduleDate;

  const plan = getPlan(selectedScheduleDate);
  container.innerHTML = plan.map((block, index) => blockEditor(block, index)).join('');

  const target = document.getElementById('target');
  const savedTarget = state.days[selectedScheduleDate]?.targetHours;
  if (target) target.value = savedTarget ?? 12;

  container.querySelectorAll('.remove').forEach(button => {
    button.onclick = () => button.closest('.block')?.remove();
  });
}

function blockEditor(block, index) {
  const wrapper = document.createElement('div');
  wrapper.className = 'block';
  wrapper.dataset.index = index;

  const time = document.createElement('input');
  time.className = 'bt';
  time.placeholder = 'Time';
  time.value = block.time;

  const title = document.createElement('input');
  title.className = 'bn';
  title.placeholder = 'Block name';
  title.value = block.title;

  const doneLabel = document.createElement('label');
  doneLabel.style.cssText = 'display:flex;align-items:center;gap:6px;white-space:nowrap;';
  const done = document.createElement('input');
  done.type = 'checkbox';
  done.className = 'bdone';
  done.checked = Boolean(block.done);
  doneLabel.append(done, document.createTextNode('Done'));

  const remove = document.createElement('button');
  remove.className = 'btn danger remove';
  remove.type = 'button';
  remove.textContent = 'Remove';

  wrapper.append(time, title, doneLabel, remove);
  return wrapper;
}

function saveCurrentPlan() {
  const date = document.getElementById('planDate').value;
  if (!date) {
    alert('Please choose a date.');
    return;
  }

  selectedScheduleDate = date;

  const blocks = [...document.querySelectorAll('#blocks .block')].map(block => ({
    time: block.querySelector('.bt')?.value.trim() || '',
    title: block.querySelector('.bn')?.value.trim() || 'Untitled block',
    done: Boolean(block.querySelector('.bdone')?.checked)
  })).filter(block => block.time || block.title);

  state.plans[date] = blocks;

  const targetHours = Number(document.getElementById('target')?.value || 12);
  ensureDay(date).targetHours = Number.isFinite(targetHours) ? targetHours : 12;

  save();

  const status = document.getElementById('scheduleStatus');
  if (status) status.textContent = `✓ Saved schedule for ${date}.`;
  render();
  showView('schedule');
  const newStatus = document.getElementById('scheduleStatus');
  if (newStatus) newStatus.textContent = `✓ Saved schedule for ${date}.`;
}

function pushPost(text, img) {
  state.posts.push({ text, img, date: Date.now() });
  save();
  document.getElementById('postText').value = '';
  document.getElementById('postImage').value = '';
  renderPosts();
}

function renderPosts() {
  const list = document.getElementById('postList');
  if (!list) return;
  if (!state.posts.length) {
    list.innerHTML = '<div class="card empty">No posts yet. Make the first one ✦</div>';
    return;
  }
  list.innerHTML = [...state.posts].reverse().map(p => `
    <article class="post card">
      ${p.img ? `<img src="${escapeAttr(p.img)}" alt="Post image">` : ''}
      <div><b>Atul</b><p>${escapeHtml(p.text || '')}</p><small>${new Date(p.date).toLocaleString()}</small></div>
    </article>`).join('');
}

function renderCalendar() {
  const el = document.getElementById('calendarGrid');
  if (!el) return;

  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const first = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();

  let html = `<div class="calhead">${now.toLocaleDateString(undefined, {month:'long', year:'numeric'})}</div>`;
  for (let i = 0; i < (first + 6) % 7; i++) html += '<div></div>';

  for (let n = 1; n <= days; n++) {
    const k = `${y}-${pad(m + 1)}-${pad(n)}`;
    const f = state.days[k]?.focus || 0;
    const hasPlan = Array.isArray(state.plans[k]);
    html += `
      <button type="button" class="calday ${k === localDate() ? 'today' : ''}" data-date="${k}"
        style="border:0;background:transparent;cursor:pointer;">
        <b>${n}</b>
        <small>${f ? fmt(f) : hasPlan ? 'Schedule' : ''}</small>
      </button>`;
  }

  el.innerHTML = html;

  el.querySelectorAll('.calday').forEach(button => {
    button.onclick = () => {
      selectedScheduleDate = button.dataset.date;
      showView('schedule');
    };
  });
}

function tick() {
  if (!timer.running) return;
  timer.seconds = Math.floor((Date.now() - timer.startedAt) / 1000);

  const h = String(Math.floor(timer.seconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((timer.seconds % 3600) / 60)).padStart(2, '0');
  const s = String(timer.seconds % 60).padStart(2, '0');

  const timerEl = document.getElementById('timer');
  if (timerEl) timerEl.textContent = `${h}:${m}:${s}`;

  requestAnimationFrame(tick);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value);
}

render();
