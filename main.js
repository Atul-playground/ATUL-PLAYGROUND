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
let serverClockOffsetMs = 0;
let cloud = { progress: null, posts: [], ready: false, loading: false };
let currentView = 'today';
let selectedScheduleDate = today();

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
  const activeView = currentView || 'today';
  const d = day();
  const sharedFocus = Number(cloud.progress?.focus_minutes ?? d.focus ?? 0);
  const pct = Math.min(100, Math.round(sharedFocus / DEFAULT_TARGET * 100));

  app.innerHTML = `
    <style>
      body {
        background: linear-gradient(-45deg, #dff5e7, #e8f4ff, #f6e8ff, #fff3d9, #dff5e7);
        background-size: 500% 500%;
        animation: atulGradient 60s ease-in-out infinite;
      }
      @keyframes atulGradient {
        0% { background-position: 0% 50%; }
        25% { background-position: 50% 100%; }
        50% { background-position: 100% 50%; }
        75% { background-position: 50% 0%; }
        100% { background-position: 0% 50%; }
      }
      .floating-stars { position: fixed; inset: 0; pointer-events: none; overflow: hidden; z-index: 0; }
      .floating-star { position: absolute; left: var(--x); top: 105vh; font-size: var(--size); opacity: 0; animation: starFloat var(--duration) linear infinite; animation-delay: var(--delay); filter: drop-shadow(0 0 6px rgba(255,255,255,.9)); }
      @keyframes starFloat {
        0% { transform: translate3d(0,0,0) rotate(0deg); opacity: 0; }
        10% { opacity: .85; }
        75% { opacity: .6; }
        100% { transform: translate3d(var(--drift),-125vh,0) rotate(220deg); opacity: 0; }
      }
      .shell { position: relative; z-index: 1; }
      .water-reminder { position: fixed; right: 22px; bottom: 22px; width: min(270px, calc(100vw - 36px)); z-index: 50; opacity: .96; }
      .water-reminder.glow .water-box { animation: waterGlow 1.35s ease-in-out infinite; }
      .water-box { position: relative; overflow: hidden; padding: 13px 14px; border-radius: 18px; background: rgba(255,255,255,.94); border: 1px solid rgba(75,130,110,.18); box-shadow: 0 10px 30px rgba(0,0,0,.13); }
      .water-box::before, .water-box::after { content: ''; position:absolute; border-radius:50%; background: rgba(111,206,184,.18); pointer-events:none; animation: waterBubble 3.2s ease-in-out infinite; }
      .water-box::before { width: 34px; height: 34px; right: 18px; bottom: -12px; }
      .water-box::after { width: 15px; height: 15px; right: 66px; bottom: 7px; animation-delay: -1.4s; }
      .water-head { display:flex; align-items:center; justify-content:space-between; gap:8px; position:relative; z-index:1; }
      .water-head h2 { margin:0; font-size:.92rem; }
      .water-close { border:0; background:transparent; font-size:17px; cursor:pointer; padding:3px 7px; border-radius:9px; }
      .water-close:hover { background: rgba(0,0,0,.05); }
      .water-copy { margin:5px 0 8px; font-size:.78rem; position:relative; z-index:1; }
      .water-progress { height:7px; border-radius:999px; overflow:hidden; background:rgba(0,0,0,.08); margin:7px 0 9px; position:relative; z-index:1; }
      .water-progress i { display:block; height:100%; width:0%; background:linear-gradient(90deg,#76c7ff,#7ee6b0); transition:width .25s ease; }
      .water-actions { display:flex; gap:5px; flex-wrap:wrap; position:relative; z-index:1; }
      .water-actions .btn { min-width:0; padding:6px 8px; font-size:.74rem; }
      @keyframes waterGlow { 0%,100% { box-shadow: 0 10px 30px rgba(0,0,0,.13), 0 0 0 rgba(74,190,165,0); } 50% { box-shadow: 0 10px 30px rgba(0,0,0,.13), 0 0 24px rgba(74,190,165,.72); } }
      @keyframes waterBubble { 0%,100% { transform:translateY(0) scale(1); opacity:.35; } 50% { transform:translateY(-18px) scale(1.12); opacity:.8; } }
    </style>

      <div class="shell">
      <header class="hero">
        <div class="floating-stars" aria-hidden="true">${Array.from({ length: 36 }, (_, i) => `<span class="floating-star" style="--x:${(i * 37) % 100}%;--size:${12 + (i % 6) * 5}px;--duration:${14 + (i % 9) * 2}s;--delay:-${(i % 14) * 2}s;--drift:${-35 + (i % 8) * 10}px">${i % 3 === 0 ? '✦' : i % 3 === 1 ? '✧' : '★'}</span>`).join('')}</div>
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
        ].map(([x, label]) => `
          <button class="navbtn ${activeView === x ? 'active' : ''}" data-view="${x}">${label}</button>
        `).join('')}
      </nav>

      <main>
        <section id="today" class="view ${activeView === 'today' ? 'active' : ''}">
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

        <section id="schedule" class="view ${activeView === 'schedule' ? 'active' : ''}">
          <article class="card">
            <h2>✨ Schedule / Edit a day</h2>
            <p class="muted">Choose any date. Edit, add, remove, and check off timetable blocks.</p>

            <div class="formrow">
              <label>Date
                <input id="planDate" type="date" value="${selectedScheduleDate || today()}">
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

        <section id="calendar" class="view ${activeView === 'calendar' ? 'active' : ''}">
          <article class="card">
            <h2>📅 Calendar</h2>
            <div class="calendar" id="calendarGrid"></div>
            <p class="muted">Click any date to edit its schedule. Days with logged focus show their total.</p>
          </article>
        </section>

        <section id="posts" class="view ${activeView === 'posts' ? 'active' : ''}">
          <article class="card">
            <h2>📸 Posts</h2>
            <p class="muted">Wins, thoughts, pictures and motivation.</p>
            <textarea id="postText" placeholder="Write a post..."></textarea>
            <input id="postImage" type="file" accept="image/*">
            <button class="btn primary" id="publish">Publish</button>
          </article>
          <div id="postList" class="postgrid"></div>
        </section>

        <section id="tools" class="view ${activeView === 'tools' ? 'active' : ''}">
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
      <div class="water-reminder" id="waterReminder" role="status" aria-live="polite">
        <div class="water-box">
          <div class="water-head">
            <h2 id="waterTitle">💧 Water check</h2>
            <button class="water-close" id="waterClose" type="button" aria-label="Close water reminder">×</button>
          </div>
          <p class="water-copy">Take a few sips and log them. <b id="waterAmount">0.00 L / 4.0 L</b></p>
          <div class="water-progress"><i id="waterBar"></i></div>
          <div class="water-actions">
            <button class="btn primary" id="water250" type="button">+250 ml</button>
            <button class="btn primary" id="water500" type="button">+500 ml</button>
            <button class="btn" id="water1000" type="button">+1 L</button>
            <button class="btn" id="waterClose2" type="button">Later</button>
          </div>
        </div>
      </div>
      <footer>Built for Atul ✦ ATUL(PLAYGROUND)</footer>
    </div>`;

  wire();
  renderTodayTimeline();
  renderScheduleEditor(selectedScheduleDate || today());
  renderCalendar();
  renderPosts();
}

async function loadCloud(initial = false) {
  if (cloud.loading) return;
  cloud.loading = true;
  try {
    const [{ data: progress, error: progressError }, { data: posts, error: postsError }] = await Promise.all([
      supabase.from('progress').select('id,focus_minutes,progress_date,updated_at,plans,note,sessions,timer_running,timer_started_at,timer_seconds').eq('id', 1).maybeSingle(),
      supabase.from('posts').select('id,caption,image_url,created_at').order('created_at', { ascending: false })
    ]);

    if (progressError) throw progressError;
    if (postsError) throw postsError;

    if (!progress) {
      const { data: created, error } = await supabase.from('progress').insert({
        id: 1, focus_minutes: 0, progress_date: today(), plans: {}, note: '',
        sessions: 0, timer_running: false, timer_started_at: null, timer_seconds: 0
      }).select().single();
      if (error) throw error;
      cloud.progress = created;
    } else if (progress.progress_date !== today()) {
      const { data: reset, error } = await supabase.from('progress').update({
        focus_minutes: 0, progress_date: today(), sessions: 0,
        timer_running: false, timer_started_at: null, timer_seconds: 0,
        updated_at: new Date().toISOString()
      }).eq('id', 1).select().single();
      if (error) throw error;
      cloud.progress = reset;
    } else {
      cloud.progress = progress;
    }

    cloud.posts = posts || [];
    if (cloud.progress?.plans) state.plans = cloud.progress.plans || {};
    if (typeof cloud.progress?.note === 'string') state.note = cloud.progress.note;
    state.days[today()] ||= { focus: 0, sessions: 0 };
    state.days[today()].sessions = Number(cloud.progress?.sessions || 0);
    timer.running = !!cloud.progress?.timer_running;
    timer.seconds = Number(cloud.progress?.timer_seconds || 0);
    timer.startedAt = cloud.progress?.timer_started_at
      ? new Date(cloud.progress.timer_started_at).getTime()
      : null;
    save();
    cloud.ready = true;
    await syncServerClock();
  } catch (error) {
    console.error('Supabase error:', error);
    cloud.ready = false;
  } finally {
    cloud.loading = false;
  }
  if (initial) {
    render();
    wire();
    wireWaterReminder();
  } else {
    updateVisibleCloudUI();
  }
}

function updateVisibleCloudUI() {
  const d = day();
  const sharedFocus = Number(cloud.progress?.focus_minutes ?? d.focus ?? 0);
  d.focus = sharedFocus;
  save();

  const focusEl = document.getElementById('focus');
  if (focusEl) focusEl.textContent = fmt(sharedFocus);

  const progressEl = document.querySelector('.progress i');
  if (progressEl) progressEl.style.width = `${Math.min(100, Math.round(sharedFocus / DEFAULT_TARGET * 100))}%`;

  // Refresh posts without rebuilding the whole app.
  renderPosts();
}

setInterval(() => {
  loadCloud(false);
}, 15000);

async function updateSharedFocus(delta) {
  const current = Number(cloud.progress?.focus_minutes || 0);
  const next = Math.max(0, current + delta);
  const { data, error } = await supabase.from('progress').update({
    focus_minutes: next, progress_date: today(), updated_at: new Date().toISOString(),
    plans: state.plans, note: state.note, sessions: day().sessions,
    timer_running: timer.running, timer_started_at: timer.startedAt ? new Date(timer.startedAt).toISOString() : null,
    timer_seconds: timer.seconds
  }).eq('id', 1).select().single();
  if (error) throw error;
  cloud.progress = data;
  return data;
}

async function resetSharedFocus() {
  const { data, error } = await supabase.from('progress').update({
    focus_minutes: 0, progress_date: today(), updated_at: new Date().toISOString(),
    plans: state.plans, note: state.note, sessions: 0,
    timer_running: false, timer_started_at: null, timer_seconds: 0
  }).eq('id', 1).select().single();
  if (error) throw error;
  cloud.progress = data;
}


async function saveSharedState() {
  const { data, error } = await supabase
    .from('progress')
    .update({
      plans: state.plans,
      note: state.note,
      sessions: day().sessions,
      timer_running: timer.running,
      timer_started_at: timer.startedAt ? new Date(timer.startedAt).toISOString() : null,
      timer_seconds: timer.seconds,
      updated_at: new Date().toISOString(),
      progress_date: today()
    })
    .eq('id', 1)
    .select('id,focus_minutes,progress_date,updated_at,plans,note,sessions,timer_running,timer_started_at,timer_seconds')
    .single();
  if (error) throw error;
  cloud.progress = data;
  state.plans = data.plans || {};
  state.note = data.note || '';
  save();
  return data;
}

function subscribeToCloud() {
  supabase
    .channel('atul-playground-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'progress' }, payload => {
      if (payload.new && payload.new.id === 1) {
        cloud.progress = payload.new;
        state.plans = payload.new.plans || {};
        state.note = payload.new.note || '';
        state.days[today()] ||= { focus: 0, sessions: 0 };
        state.days[today()].focus = Number(payload.new.focus_minutes || 0);
        state.days[today()].sessions = Number(payload.new.sessions || 0);
        timer.running = !!payload.new.timer_running;
        timer.seconds = Number(payload.new.timer_seconds || 0);
        timer.startedAt = payload.new.timer_started_at
          ? new Date(payload.new.timer_started_at).getTime()
          : null;
        save();
        updateVisibleCloudUI();
        updateSharedTimerUI();
      }
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, payload => {
      loadCloud(false);
    })
    .subscribe();
}


function switchView(view) {
  currentView = view;
  document.querySelectorAll('.navbtn').forEach(x => {
    x.classList.toggle('active', x.dataset.view === view);
  });
  document.querySelectorAll('.view').forEach(x => {
    x.classList.toggle('active', x.id === view);
  });
}

function sharedNow() { return Date.now() + serverClockOffsetMs; }

function updateSharedTimerUI() {
  const t = document.getElementById('timer');
  if (t) t.textContent = formatTimer(timer.running ? Math.max(timer.seconds, Math.floor((sharedNow() - timer.startedAt) / 1000)) : timer.seconds);
}

function formatTimer(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  const h = String(Math.floor(safe / 3600)).padStart(2, '0');
  const m = String(Math.floor((safe % 3600) / 60)).padStart(2, '0');
  const s = String(safe % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

let timerSyncBusy = false;

async function syncServerClock() {
  try {
    const before = Date.now();
    const { data, error } = await supabase.rpc('get_server_time');
    const after = Date.now();
    if (error || !data) return;
    const serverMs = new Date(data).getTime();
    const midpoint = before + Math.round((after - before) / 2);
    if (Number.isFinite(serverMs)) serverClockOffsetMs = serverMs - midpoint;
  } catch (error) {
    console.error('Server clock sync failed:', error);
  }
}

async function refreshTimerFromCloud() {
  if (!cloud.ready || timerSyncBusy) return;
  timerSyncBusy = true;
  try {
    const { data, error } = await supabase.from('progress')
      .select('id,focus_minutes,progress_date,updated_at,plans,note,sessions,timer_running,timer_started_at,timer_seconds')
      .eq('id', 1).maybeSingle();
    if (error || !data || data.progress_date !== today()) return;
    cloud.progress = data;
    timer.running = !!data.timer_running;
    timer.seconds = Number(data.timer_seconds || 0);
    timer.startedAt = data.timer_started_at ? new Date(data.timer_started_at).getTime() : null;
    state.days[today()] ||= { focus: 0, sessions: 0 };
    state.days[today()].sessions = Number(data.sessions || 0);
    updateSharedTimerUI();
    updateVisibleCloudUI();
  } catch (error) {
    console.error('Timer sync failed:', error);
  } finally {
    timerSyncBusy = false;
  }
}

setInterval(() => {
  if (timer.running) updateSharedTimerUI();
}, 250);

setInterval(refreshTimerFromCloud, 3000);

async function saveTimerState() {
  const payload = {
    timer_running: timer.running,
    timer_started_at: timer.startedAt ? new Date(timer.startedAt).toISOString() : null,
    timer_seconds: timer.seconds,
    sessions: day().sessions,
    plans: state.plans,
    note: state.note,
    progress_date: today(),
    updated_at: new Date().toISOString()
  };
  const { data, error } = await supabase.from('progress').update(payload)
    .eq('id', 1)
    .select('id,focus_minutes,progress_date,updated_at,plans,note,sessions,timer_running,timer_started_at,timer_seconds')
    .single();
  if (error) throw error;
  cloud.progress = data;
  timer.running = !!data.timer_running;
  timer.seconds = Number(data.timer_seconds || 0);
  timer.startedAt = data.timer_started_at ? new Date(data.timer_started_at).getTime() : null;
}

async function applyTimerRow(data) {
  if (!data) throw new Error('No timer row returned');
  cloud.progress = data;
  timer.running = !!data.timer_running;
  timer.seconds = Number(data.timer_seconds || 0);
  timer.startedAt = data.timer_started_at ? new Date(data.timer_started_at).getTime() : null;
  state.days[today()] ||= { focus: 0, sessions: 0 };
  state.days[today()].sessions = Number(data.sessions || 0);
  updateVisibleCloudUI();
  updateSharedTimerUI();
}

async function startSharedTimer() {
  const seconds = Math.max(0, Number(timer.seconds) || 0);
  const { data, error } = await supabase.rpc('start_shared_timer', { p_seconds: seconds });
  if (!error && data) {
    await applyTimerRow(data);
    return;
  }
  // Backward-compatible fallback if the new SQL function has not been run yet.
  timer.running = true;
  timer.startedAt = sharedNow() - seconds * 1000;
  await saveTimerState();
}

async function pauseSharedTimer(seconds) {
  const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
  const { data, error } = await supabase.rpc('pause_shared_timer', { p_seconds: safeSeconds });
  if (!error && data) {
    await applyTimerRow(data);
    return;
  }
  timer.running = false;
  timer.seconds = safeSeconds;
  timer.startedAt = null;
  await saveTimerState();
}

function getWaterState() {
  const key = `atul_water_${today()}`;
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) {}
  raw = raw && typeof raw === 'object' ? raw : { ml: 0, lastReminder: 0 };
  raw.ml = Math.max(0, Math.min(4000, Number(raw.ml) || 0));
  raw.lastReminder = Number(raw.lastReminder) || 0;
  return { key, data: raw };
}

function saveWaterState() {
  const { key, data } = getWaterState();
  localStorage.setItem(key, JSON.stringify(data));
  return data;
}

function updateWaterPopup() {
  const { data } = getWaterState();
  const amount = document.getElementById('waterAmount');
  const bar = document.getElementById('waterBar');
  const popup = document.getElementById('waterReminder');
  if (amount) amount.textContent = `${(data.ml / 1000).toFixed(2)} L / 4.0 L`;
  if (bar) bar.style.width = `${Math.min(100, data.ml / 40)}%`;
  if (popup) popup.classList.toggle('glow', data.ml < 4000 && data.lastReminder > 0 && Date.now() - data.lastReminder < 60 * 60 * 1000);
}

function setWaterGlow(needed) {
  const popup = document.getElementById('waterReminder');
  if (!popup) return;
  popup.classList.toggle('glow', !!needed);
}

function addWater(ml) {
  const amount = Math.max(1, Number(ml) || 0);
  const { key, data } = getWaterState();
  data.ml = Math.min(4000, data.ml + amount);
  data.lastReminder = Date.now();
  localStorage.setItem(key, JSON.stringify(data));
  updateWaterPopup();
  setWaterGlow(false);
}

function remindWaterNow() {
  const { key, data } = getWaterState();
  if (data.ml >= 4000) {
    setWaterGlow(false);
    return;
  }
  data.lastReminder = Date.now();
  localStorage.setItem(key, JSON.stringify(data));
  setWaterGlow(true);
}

function startWaterReminderSystem() {
  if (window.__atulWaterReminderStarted) return;
  window.__atulWaterReminderStarted = true;
  const maybeRemind = () => {
    const { data } = getWaterState();
    if (data.ml >= 4000) {
      setWaterGlow(false);
      return;
    }
    if (!data.lastReminder || Date.now() - data.lastReminder >= 60 * 60 * 1000) {
      remindWaterNow();
    }
  };
  maybeRemind();
  setInterval(maybeRemind, 60 * 1000);
}

function wireWaterReminder() {
  const b250 = document.getElementById('water250');
  const b500 = document.getElementById('water500');
  const b1000 = document.getElementById('water1000');
  const close = document.getElementById('waterClose');
  const close2 = document.getElementById('waterClose2');
  if (b250) b250.onclick = () => addWater(250);
  if (b500) b500.onclick = () => addWater(500);
  if (b1000) b1000.onclick = () => addWater(1000);
  if (close) close.onclick = () => setWaterGlow(false);
  if (close2) close2.onclick = () => setWaterGlow(false);
  updateWaterPopup();
  startWaterReminderSystem();
}

function wire() {
  document.querySelectorAll('.navbtn').forEach(b => {
    b.onclick = () => {
      switchView(b.dataset.view);
      if (b.dataset.view === 'schedule') {
        const input = document.getElementById('planDate');
        selectedScheduleDate = input?.value || selectedScheduleDate || today();
        renderScheduleEditor(selectedScheduleDate);
      }
    };
  });

  document.getElementById('start').onclick = async () => {
    await syncServerClock();
    await refreshTimerFromCloud();
    if (timer.running) return;
    const secondsAtStart = Math.max(0, Number(timer.seconds) || 0);
    try {
      await startSharedTimer();
      updateSharedTimerUI();
    } catch (error) {
      console.error(error);
      alert('Could not start the shared timer. Check the Supabase setup.');
    }
  };

  document.getElementById('pause').onclick = async () => {
    await syncServerClock();
    await refreshTimerFromCloud();
    if (!timer.running) return;
    const seconds = Math.max(0, Math.floor((sharedNow() - timer.startedAt) / 1000));
    try {
      await pauseSharedTimer(seconds);
      updateSharedTimerUI();
    } catch (error) {
      console.error(error);
      alert('Could not pause the shared timer. Check the Supabase setup.');
    }
  };

  document.getElementById('log').onclick = async () => {
    const raw = prompt('How many minutes do you want to log in today\'s goal?', '60');
    if (raw === null) return;
    const minutes = Number(String(raw).trim());
    if (!Number.isFinite(minutes) || !Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
      alert('Enter a whole number of minutes between 1 and 1440.');
      return;
    }
    const previousSessions = day().sessions;
    try {
      day().sessions = previousSessions + 1;
      save();
      await updateSharedFocus(minutes);
      updateVisibleCloudUI();
    } catch (error) {
      day().sessions = previousSessions;
      save();
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
      updateVisibleCloudUI();
      updateSharedTimerUI();
    } catch (error) {
      console.error(error);
      alert('Could not reset shared progress. Check the Supabase setup.');
    }
  };

  document.getElementById('editToday').onclick = () => {
    switchView('schedule');
    selectedScheduleDate = today();
    const input = document.getElementById('planDate');
    input.value = selectedScheduleDate;
    renderScheduleEditor(selectedScheduleDate);
  };

  document.getElementById('planDate').onchange = e => {
    selectedScheduleDate = e.target.value || today();
    renderScheduleEditor(selectedScheduleDate);
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
    saveSharedState().then(() => {
      renderTodayTimeline();
      renderCalendar();
      alert(`Schedule saved for ${formatDate(date)}.`);
    }).catch(error => {
      console.error(error);
      alert(`Schedule saved locally, but cloud sync failed: ${error.message || error}`);
    });
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

  document.getElementById('saveNote').onclick = async () => {
    state.note = document.getElementById('note').value;
    save();
    try {
      await saveSharedState();
      alert('Shared note saved.');
    } catch (error) {
      console.error(error);
      alert(`Note saved locally, but cloud sync failed: ${error.message || error}`);
    }
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
      saveSharedState().catch(error => console.error('Schedule sync error:', error));
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
      selectedScheduleDate = date;
      document.getElementById('planDate').value = date;
      renderScheduleEditor(date);
    };
  });
}

function tick() {
  if (!timer.running) return;
  timer.seconds = Math.max(timer.seconds, Math.floor((Date.now() - timer.startedAt) / 1000));
  updateSharedTimerUI();
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
wireWaterReminder();
loadCloud(true);
subscribeToCloud();

