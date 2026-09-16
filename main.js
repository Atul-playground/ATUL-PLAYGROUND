import './style.css';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://ojnoeeheodakhwqzteaa.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_n55zrEeKX0fe0WPAWuCRZg_zN-fc5uX';
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });

const KEY = 'atul_playground_v4';
const DEFAULT_TARGET = 12 * 60;

const today = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const tomorrow = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const fmt = mins => `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;

const DEFAULT_BLOCKS = [
  { time: '05:30–08:00', title: 'Focus block', done: false },
  { time: '08:00–08:30', title: 'Breakfast / reset', done: false },
  { time: '08:30–11:00', title: 'Focus block', done: false },
  { time: '11:00–11:30', title: 'Break', done: false },
  { time: '11:30–13:30', title: 'Focus block', done: false },
  { time: '13:30–14:00', title: 'Lunch', done: false },
  { time: '14:00–17:00', title: 'Sleep / recovery', done: false },
  { time: '17:30–20:00', title: 'Focus block', done: false },
  { time: '20:00–20:30', title: 'Dinner / break', done: false },
  { time: '20:30–23:00', title: 'Focus block', done: false }
];

let state = JSON.parse(localStorage.getItem(KEY) || 'null') || {
  days: {},
  plans: {},
  posts: [],
  note: ''
};

let timer = { running: false, seconds: 0, startedAt: null };
let cloud = { progress: null, posts: [], ready: false };

const save = () => localStorage.setItem(KEY, JSON.stringify(state));

const day = () => {
  const key = today();
  state.days[key] ||= { focus: 0, sessions: 0 };
  return state.days[key];
};

const app = document.querySelector('#app');

function cloneDefaults() {
  return DEFAULT_BLOCKS.map(b => ({ ...b }));
}

function normalisePlan(plan) {
  if (!plan) {
    return { target: 12, blocks: cloneDefaults() };
  }

  // Support the old format where a plan was directly an array.
  if (Array.isArray(plan)) {
    return {
      target: 12,
      blocks: plan.map(b => ({
        time: b.time || '',
        title: b.title || 'Focus block',
        done: !!b.done
      }))
    };
  }

  return {
    target: Number(plan.target) || 12,
    blocks: Array.isArray(plan.blocks)
      ? plan.blocks.map(b => ({
          time: b.time || '',
          title: b.title || 'Focus block',
          done: !!b.done
        }))
      : cloneDefaults()
  };
}

function getPlan(date) {
  return normalisePlan(state.plans[date]);
}

function formatDate(date) {
  if (!date) return '';
  const [y, m, d] = date.split('-');
  return `${d}/${m}/${y}`;
}

function render() {
  const d = day();
  const sharedFocus = Number(cloud.progress?.focus_minutes ?? d.focus ?? 0);
  const pct = Math.min(100, Math.round(sharedFocus / DEFAULT_TARGET * 100));

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
        ].map(([x, label], i) => `
          <button class="navbtn ${i === 0 ? 'active' : ''}" data-view="${x}">${label}</button>
        `).join('')}
      </nav>

      <main>
        <section id="today" class="view active">
          <div class="stats">
            <article class="card">
              <small>TODAY'S FOCUS</small>
              <strong id="focus">${fmt(sharedFocus)}</strong>
              <div class="progress"><i style="width:${pct}%"></i></div>
              <small>${pct}% of 12h</small>
            </article>
            <article class="card">
              <small>REMAINING</small>
              <strong>${fmt(Math.max(0, DEFAULT_TARGET - sharedFocus))}</strong>
              <small>Only counted focus time matters.</small>
            </article>
            <article class="card">
              <small>TODAY</small>
              <strong>${new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</strong>
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
            <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
              <h2 style="margin:0">🗓 Today's flexible timeline</h2>
              <button class="btn primary" id="editToday">✏️ Edit today's schedule</button>
            </div>
            <div class="notice">Move breaks and meals when life changes. Check off blocks as you finish them.</div>
            <div class="timeline" id="todayTimeline"></div>
          </article>
        </section>

        <section id="schedule" class="view">
          <article class="card">
            <h2>✨ Schedule / Edit a day</h2>
            <p class="muted">Choose any date. Edit, add, remove, and check off timetable blocks.</p>

            <div class="formrow">
              <label>Date
                <input id="planDate" type="date" value="${today()}">
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
            <article class="card"><small>REAL FOCUS</small><strong>${fmt(sharedFocus)}</strong><small>Today</small></article>
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
  renderTodayTimeline();
  renderScheduleEditor(today());
  renderCalendar();
  renderPosts();
}

async function loadCloud() {
  try {
    const [{ data: progress, error: progressError }, { data: posts, error: postsError }] = await Promise.all([
      supabase.from('progress').select('id,focus_minutes,progress_date,updated_at').eq('id', 1).maybeSingle(),
      supabase.from('posts').select('id,caption,image_url,created_at').order('created_at', { ascending: false })
    ]);

    if (progressError) throw progressError;
    if (postsError) throw postsError;

    if (!progress) {
      const { data: created, error } = await supabase.from('progress').insert({ id: 1, focus_minutes: 0, progress_date: today() }).select().single();
      if (error) throw error;
      cloud.progress = created;
    } else if (progress.progress_date !== today()) {
      const { data: reset, error } = await supabase.from('progress').update({ focus_minutes: 0, progress_date: today() }).eq('id', 1).select().single();
      if (error) throw error;
      cloud.progress = reset;
    } else {
      cloud.progress = progress;
    }

    cloud.posts = posts || [];
    cloud.ready = true;
    render();
  } catch (error) {
    console.error('Supabase error:', error);
    cloud.ready = false;
    render();
  }
}

setInterval(() => {
  loadCloud();
}, 15000);

async function updateSharedFocus(delta) {
  const current = Number(cloud.progress?.focus_minutes || 0);
  const next = Math.max(0, current + delta);
  const { data, error } = await supabase.from('progress').update({ focus_minutes: next, progress_date: today(), updated_at: new Date().toISOString() }).eq('id', 1).select().single();
  if (error) throw error;
  cloud.progress = data;
  return data;
}

async function resetSharedFocus() {
  const { data, error } = await supabase.from('progress').update({ focus_minutes: 0, progress_date: today(), updated_at: new Date().toISOString() }).eq('id', 1).select().single();
  if (error) throw error;
  cloud.progress = data;
}


function switchView(view) {
  document.querySelectorAll('.navbtn').forEach(x => {
    x.classList.toggle('active', x.dataset.view === view);
  });
  document.querySelectorAll('.view').forEach(x => {
    x.classList.toggle('active', x.id === view);
  });
}

function wire() {
  document.querySelectorAll('.navbtn').forEach(b => {
    b.onclick = () => {
      switchView(b.dataset.view);
      if (b.dataset.view === 'schedule') {
        const input = document.getElementById('planDate');
        renderScheduleEditor(input?.value || today());
      }
    };
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

  document.getElementById('log').onclick = async () => {
    try {
      day().sessions++;
      save();
      await updateSharedFocus(60);
      render();
    } catch (error) {
      console.error(error);
      alert('Could not update shared progress. Check the Supabase setup.');
    }
  };

  document.getElementById('resetDay').onclick = async () => {
    if (!confirm("Reset today's shared focus record?")) return;
    try {
      state.days[today()] = { focus: 0, sessions: 0 };
      save();
      await resetSharedFocus();
      render();
    } catch (error) {
      console.error(error);
      alert('Could not reset shared progress. Check the Supabase setup.');
    }
  };

  document.getElementById('editToday').onclick = () => {
    switchView('schedule');
    const input = document.getElementById('planDate');
    input.value = today();
    renderScheduleEditor(today());
  };

  document.getElementById('planDate').onchange = e => {
    renderScheduleEditor(e.target.value);
  };

  document.getElementById('addBlock').onclick = () => addBlock();

  document.getElementById('savePlan').onclick = () => {
    const date = document.getElementById('planDate').value;
    if (!date) return;

    const blocks = [...document.querySelectorAll('#blocks .block')].map(b => ({
      time: b.querySelector('.bt')?.value || '',
      title: b.querySelector('.bn')?.value || 'Focus block',
      done: !!b.querySelector('.bc')?.checked
    }));

    state.plans[date] = {
      target: Number(document.getElementById('target').value) || 12,
      blocks
    };

    save();
    renderTodayTimeline();
    alert(`Schedule saved for ${formatDate(date)}.`);
  };

  document.getElementById('publish').onclick = async () => {
    const text = document.getElementById('postText').value.trim();
    const file = document.getElementById('postImage').files[0];
    if (!text && !file) return;
    const button = document.getElementById('publish');
    button.disabled = true;
    button.textContent = 'Publishing…';
    try {
      let imageUrl = '';
      if (file) {
        if (!file.type.startsWith('image/')) throw new Error('Please choose an image.');
        if (file.size > 5 * 1024 * 1024) throw new Error('Please keep images under 5 MB.');
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
        const path = `${Date.now()}-${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage.from('post-images').upload(path, file, { contentType: file.type, upsert: false });
        if (uploadError) throw uploadError;
        imageUrl = supabase.storage.from('post-images').getPublicUrl(path).data.publicUrl;
      }

      const { data, error } = await supabase.from('posts').insert({ caption: text, image_url: imageUrl || null }).select().single();
      if (error) throw error;
      cloud.posts.unshift(data);
      document.getElementById('postText').value = '';
      document.getElementById('postImage').value = '';
      renderPosts();
    } catch (error) {
      console.error(error);
      alert(`Could not publish: ${error.message || error}`);
    } finally {
      button.disabled = false;
      button.textContent = 'Publish';
    }
  };

  document.getElementById('saveNote').onclick = () => {
    state.note = document.getElementById('note').value;
    save();
    alert('Note saved.');
  };
}

function renderScheduleEditor(date) {
  const blocks = document.getElementById('blocks');
  const target = document.getElementById('target');
  if (!blocks || !target) return;

  const plan = getPlan(date);
  target.value = plan.target;

  blocks.innerHTML = '';
  plan.blocks.forEach(b => addBlock(b.time, b.title, b.done));
}

function addBlock(time = '', title = 'Focus block', done = false) {
  const blocks = document.getElementById('blocks');
  if (!blocks) return;

  const el = document.createElement('div');
  el.className = 'block';
  el.innerHTML = `
    <label class="block-check" title="Mark this block complete">
      <input class="bc" type="checkbox" ${done ? 'checked' : ''}>
      <span>Done</span>
    </label>
    <input class="bt" placeholder="Time" value="${escapeAttr(time)}">
    <input class="bn" placeholder="Block name" value="${escapeAttr(title)}">
    <button class="btn danger remove" type="button">Remove</button>
  `;

  const checkbox = el.querySelector('.bc');
  checkbox.onchange = () => {
    el.classList.toggle('completed', checkbox.checked);
  };
  el.classList.toggle('completed', done);

  el.querySelector('.remove').onclick = () => el.remove();
  blocks.appendChild(el);
}

function renderTodayTimeline() {
  const timeline = document.getElementById('todayTimeline');
  if (!timeline) return;

  const plan = getPlan(today());

  timeline.innerHTML = '';

  plan.blocks.forEach((b, index) => {
    const row = document.createElement('div');
    row.className = `slot ${b.done ? 'completed' : ''}`;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = !!b.done;
    checkbox.title = 'Mark complete';

    const time = document.createElement('b');
    time.textContent = b.time;

    const title = document.createElement('span');
    title.textContent = b.title;

    checkbox.onchange = () => {
      const current = getPlan(today());
      if (!current.blocks[index]) return;
      current.blocks[index].done = checkbox.checked;
      state.plans[today()] = current;
      save();
      row.classList.toggle('completed', checkbox.checked);
    };

    row.append(checkbox, time, title);
    timeline.appendChild(row);
  });
}

function pushPost(text, img) {
  // Kept for compatibility with older local data. New posts use Supabase.
  state.posts.push({ text, img, date: Date.now() });
  save();
  renderPosts();
}

function renderPosts() {
  const list = document.getElementById('postList');
  if (!list) return;

  if (!cloud.ready && !cloud.posts.length) {
    list.innerHTML = '<div class="card empty">Connecting to shared posts…</div>';
    return;
  }

  if (!cloud.posts.length) {
    list.innerHTML = '<div class="card empty">No posts yet. Make the first one ✦</div>';
    return;
  }

  list.innerHTML = cloud.posts.map(p => `
    <article class="post card">
      ${p.image_url ? `<img src="${escapeAttr(p.image_url)}" alt="Post image">` : ''}
      <div><b>Atul</b><p>${escapeHtml(p.caption || '')}</p><small>${new Date(p.created_at).toLocaleString()}</small></div>
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

  let html = `<div class="calhead">${now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</div>`;
  for (let i = 0; i < (first + 6) % 7; i++) html += '<div></div>';

  for (let n = 1; n <= days; n++) {
    const k = `${y}-${String(m + 1).padStart(2, '0')}-${String(n).padStart(2, '0')}`;
    const f = state.days[k]?.focus || 0;
    const hasPlan = !!state.plans[k];

    html += `
      <button type="button" class="calday ${k === today() ? 'today' : ''}" data-date="${k}" title="Edit ${formatDate(k)}">
        <b>${n}</b>
        <small>${f ? fmt(f) : ''}${hasPlan ? ' ✎' : ''}</small>
      </button>`;
  }

  el.innerHTML = html;

  el.querySelectorAll('.calday').forEach(btn => {
    btn.onclick = () => {
      const date = btn.dataset.date;
      switchView('schedule');
      document.getElementById('planDate').value = date;
      renderScheduleEditor(date);
    };
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

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

function escapeAttr(s) {
  return escapeHtml(s);
}

render();
loadCloud();

