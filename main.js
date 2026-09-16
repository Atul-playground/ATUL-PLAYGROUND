import './style.css';

const KEY = 'atul_playground_v4';
const TARGET = 12 * 60;

const pad = n => String(n).padStart(2, '0');
const localDateKey = (date = new Date()) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const tomorrow = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return localDateKey(d);
};

const fmt = mins => `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;

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

const makeDefaultBlocks = () =>
  DEFAULT_BLOCKS.map(([time, title]) => ({ time, title, done: false }));

let state = JSON.parse(localStorage.getItem(KEY) || 'null') || {
  days: {},
  plans: {},
  posts: [],
  note: ''
};

let timer = { running: false, seconds: 0, startedAt: null };
let selectedScheduleDate = localDateKey();

const app = document.querySelector('#app');

const save = () => localStorage.setItem(KEY, JSON.stringify(state));

const day = date => {
  const key = date || localDateKey();
  if (!state.days[key]) state.days[key] = { focus: 0, sessions: 0 };
  return state.days[key];
};

function getPlan(date) {
  const saved = state.plans[date];

  if (Array.isArray(saved)) {
    return {
      target: 12,
      blocks: saved.map(b => ({
        time: b.time || '',
        title: b.title || 'Focus block',
        done: Boolean(b.done)
      }))
    };
  }

  if (saved && typeof saved === 'object') {
    return {
      target: Number(saved.target) || 12,
      blocks: Array.isArray(saved.blocks)
        ? saved.blocks.map(b => ({
            time: b.time || '',
            title: b.title || 'Focus block',
            done: Boolean(b.done)
          }))
        : makeDefaultBlocks()
    };
  }

  return { target: 12, blocks: makeDefaultBlocks() };
}

function setPlan(date, plan) {
  state.plans[date] = {
    target: Number(plan.target) || 12,
    blocks: plan.blocks.map(b => ({
      time: b.time || '',
      title: b.title || 'Focus block',
      done: Boolean(b.done)
    }))
  };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

function render() {
  const todayKey = localDateKey();
  const d = day(todayKey);
  const pct = Math.min(100, Math.round(d.focus / TARGET * 100));
  const todayPlan = getPlan(todayKey);

  app.innerHTML = `
    <style>
      .floating-stars {
        position: fixed;
        inset: 0;
        pointer-events: none;
        overflow: hidden;
        z-index: 0;
      }
      .floating-star {
        position: absolute;
        left: var(--x);
        top: 105vh;
        font-size: var(--size);
        opacity: 0;
        animation: starFloat var(--duration) linear infinite;
        animation-delay: var(--delay);
        filter: drop-shadow(0 0 5px rgba(255,255,255,.8));
      }
      @keyframes starFloat {
        0% { transform: translate3d(0, 0, 0) rotate(0deg); opacity: 0; }
        12% { opacity: .7; }
        75% { opacity: .55; }
        100% { transform: translate3d(var(--drift), -125vh, 0) rotate(180deg); opacity: 0; }
      }
      .shell { position: relative; z-index: 1; }
      .timeline-check {
        display: flex;
        align-items: center;
        gap: 12px;
        width: 100%;
      }
      .timeline-check input[type="checkbox"] {
        width: 19px;
        height: 19px;
        flex: 0 0 auto;
        accent-color: #5fbd7b;
        cursor: pointer;
      }
      .timeline-check.done span {
        text-decoration: line-through;
        opacity: .55;
      }
      .edit-today-row {
        display: flex;
        justify-content: flex-end;
        margin-top: 14px;
      }
      .block {
        display: grid;
        grid-template-columns: 1fr 1.5fr auto;
        gap: 10px;
        align-items: center;
        margin-bottom: 10px;
      }
      .block-done {
        display: flex;
        align-items: center;
        gap: 7px;
        white-space: nowrap;
      }
      @media (max-width: 700px) {
        .block { grid-template-columns: 1fr; }
        .block-done { justify-content: flex-start; }
      }
    </style>

    <div class="floating-stars" aria-hidden="true">
      ${Array.from({ length: 18 }, (_, i) => `
        <span class="floating-star"
          style="--x:${(i * 17 + 4) % 100}%;--size:${10 + (i % 4) * 4}px;--duration:${13 + (i % 7) * 2}s;--delay:-${i * 1.7}s;--drift:${-35 + (i % 9) * 9}px">✦</span>
      `).join('')}
    </div>

    <div class="shell">
      <header class="hero">
        <div class="stars">✦　✧　★　✦　✧</div>
        <div class="eyebrow">ATUL'S PERSONAL PLAYGROUND · OWNERSHIP: ATUL</div>
        <h1>ATUL<br><span>(PLAYGROUND)</span></h1>
        <p>A flexible personal workspace built around one objective: <b>12 hours of real focused work.</b></p>
      </header>

      <nav class="nav">
        ${['today','schedule','calendar','posts','tools'].map((x, i) => `
          <button class="navbtn ${i === 0 ? 'active' : ''}" data-view="${x}">
            ${({today:'Today',schedule:'Schedule / Edit',calendar:'Calendar',posts:'Posts',tools:'Tools'})[x]}
          </button>
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
              <strong>${new Date().toLocaleDateString(undefined,{day:'numeric',month:'short'})}</strong>
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
            <h2>🗓 Today's flexible timeline</h2>
            <div class="notice">Move breaks and meals when life changes. Protect the total focus target rather than a rigid clock.</div>
            <div class="timeline" id="todayTimeline">
              ${todayPlan.blocks.map((b, i) => `
                <div class="slot">
                  <label class="timeline-check ${b.done ? 'done' : ''}">
                    <input type="checkbox" class="today-check" data-index="${i}" ${b.done ? 'checked' : ''}>
                    <b>${escapeHtml(b.time)}</b>
                    <span>${escapeHtml(b.title)}</span>
                  </label>
                </div>
              `).join('')}
            </div>
            <div class="edit-today-row">
              <button class="btn primary" id="editToday">✏️ Edit today's schedule</button>
            </div>
          </article>
        </section>

        <section id="schedule" class="view">
          <article class="card">
            <h2>✨ Schedule / Edit a day</h2>
            <p class="muted">Choose any date. Edit, add, remove, and check off timetable blocks.</p>

            <div class="formrow">
              <label>Date
                <input id="planDate" type="date" value="${selectedScheduleDate}">
              </label>
              <label>Focus target (hours)
                <input id="target" type="number" value="${getPlan(selectedScheduleDate).target}" min="1" max="18" step=".5">
              </label>
            </div>

            <div id="blocks"></div>

            <button class="btn" id="addBlock">＋ Add block</button>
            <button class="btn primary" id="savePlan">💾 Save schedule</button>
          </article>
        </section>

        <section id="calendar" class="view">
          <article class="card">
            <h2>📅 Calendar</h2>
            <div class="calendar" id="calendarGrid"></div>
            <p class="muted">Click any date to edit its schedule. Days with logged focus show their total.</p>
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
    </div>
  `;

  wire();
  renderEditorBlocks(selectedScheduleDate);
  renderCalendar();
  renderPosts();
}

function showView(view) {
  document.querySelectorAll('.navbtn').forEach(x =>
    x.classList.toggle('active', x.dataset.view === view)
  );
  document.querySelectorAll('.view').forEach(x =>
    x.classList.toggle('active', x.id === view)
  );
}

function openSchedule(date) {
  selectedScheduleDate = date || localDateKey();
  showView('schedule');
  const input = document.getElementById('planDate');
  if (input) input.value = selectedScheduleDate;
  renderEditorBlocks(selectedScheduleDate);
}

function wire() {
  document.querySelectorAll('.navbtn').forEach(b => {
    b.onclick = () => showView(b.dataset.view);
  });

  document.getElementById('start').onclick = () => {
    if (timer.running) return;
    timer.running = true;
    timer.startedAt = Date.now() - timer.seconds * 1000;
    tick();
  };

  document.getElementById('pause').onclick = () => {
    timer.running = false;
  };

  document.getElementById('log').onclick = () => {
    day().focus += 60;
    day().sessions++;
    save();
    render();
  };

  document.getElementById('resetDay').onclick = () => {
    if (confirm("Reset today's focus record?")) {
      state.days[localDateKey()] = { focus: 0, sessions: 0 };
      save();
      render();
    }
  };

  document.getElementById('editToday').onclick = () => openSchedule(localDateKey());

  document.getElementById('planDate').onchange = e => {
    selectedScheduleDate = e.target.value || localDateKey();
    renderEditorBlocks(selectedScheduleDate);
  };

  document.getElementById('addBlock').onclick = () => {
    addBlock();
  };

  document.getElementById('savePlan').onclick = () => {
    const date = document.getElementById('planDate').value || localDateKey();
    const target = Number(document.getElementById('target').value) || 12;

    const blocks = [...document.querySelectorAll('.block')].map(b => ({
      time: b.querySelector('.bt').value,
      title: b.querySelector('.bn').value,
      done: b.querySelector('.block-check').checked
    }));

    setPlan(date, { target, blocks });
    selectedScheduleDate = date;
    save();
    alert('Schedule saved.');
    render();
    showView('schedule');
  };

  document.querySelectorAll('.today-check').forEach(cb => {
    cb.onchange = () => {
      const index = Number(cb.dataset.index);
      const plan = getPlan(localDateKey());
      if (plan.blocks[index]) {
        plan.blocks[index].done = cb.checked;
        setPlan(localDateKey(), plan);
        save();
        cb.closest('.timeline-check').classList.toggle('done', cb.checked);
      }
    };
  });

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

function renderEditorBlocks(date) {
  const container = document.getElementById('blocks');
  const target = document.getElementById('target');

  if (!container || !target) return;

  const plan = getPlan(date);
  target.value = plan.target;
  container.innerHTML = '';

  plan.blocks.forEach(block => addBlock(block.time, block.title, block.done));
}

function addBlock(time = '', title = 'Focus block', done = false) {
  const container = document.getElementById('blocks');
  if (!container) return;

  const el = document.createElement('div');
  el.className = 'block';

  el.innerHTML = `
    <input class="bt" placeholder="Time" value="${escapeHtml(time)}">
    <input class="bn" placeholder="Block name" value="${escapeHtml(title)}">
    <label class="block-done">
      <input type="checkbox" class="block-check" ${done ? 'checked' : ''}>
      Done
    </label>
    <button class="btn danger remove" type="button">Remove</button>
  `;

  el.querySelector('.remove').onclick = () => el.remove();
  container.appendChild(el);
}

function pushPost(text, img) {
  state.posts.push({ text, img, date: Date.now() });
  save();

  const textEl = document.getElementById('postText');
  const imageEl = document.getElementById('postImage');

  if (textEl) textEl.value = '';
  if (imageEl) imageEl.value = '';

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
      ${p.img ? `<img src="${p.img}" alt="Post image">` : ''}
      <div>
        <b>Atul</b>
        <p>${escapeHtml(p.text || '')}</p>
        <small>${new Date(p.date).toLocaleString()}</small>
      </div>
    </article>
  `).join('');
}

function renderCalendar() {
  const el = document.getElementById('calendarGrid');
  if (!el) return;

  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const first = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();

  let html = `<div class="calhead">${now.toLocaleDateString(undefined,{month:'long',year:'numeric'})}</div>`;

  for (let i = 0; i < (first + 6) % 7; i++) {
    html += '<div></div>';
  }

  for (let n = 1; n <= days; n++) {
    const k = `${y}-${pad(m + 1)}-${pad(n)}`;
    const f = state.days[k]?.focus || 0;
    const isToday = k === localDateKey();

    html += `
      <button type="button" class="calday ${isToday ? 'today' : ''}" data-date="${k}">
        <b>${n}</b>
        <small>${f ? fmt(f) : ''}</small>
      </button>
    `;
  }

  el.innerHTML = html;

  el.querySelectorAll('.calday').forEach(button => {
    button.onclick = () => openSchedule(button.dataset.date);
  });
}

function tick() {
  if (!timer.running) return;

  timer.seconds = Math.floor((Date.now() - timer.startedAt) / 1000);

  const h = String(Math.floor(timer.seconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((timer.seconds % 3600) / 60)).padStart(2, '0');
  const s = String(timer.seconds % 60).padStart(2, '0');

  const t = document.getElementById('timer');
  if (t) t.textContent = `${h}:${m}:${s}`;

  requestAnimationFrame(tick);
}

render();
