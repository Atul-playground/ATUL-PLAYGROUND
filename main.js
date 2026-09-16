import './style.css';

const KEY = 'atul_playground_v3';
const TARGET = 12 * 60;
const today = () => new Date().toISOString().slice(0, 10);
const fmt = mins => `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;

let state = JSON.parse(localStorage.getItem(KEY) || 'null') || {
  days: {}, plans: {}, posts: [], note: ''
};
let timer = { running: false, seconds: 0, startedAt: null };

const save = () => localStorage.setItem(KEY, JSON.stringify(state));
const day = () => state.days[today()] ||= { focus: 0, sessions: 0 };
const app = document.querySelector('#app');

function render() {
  const d = day();
  const pct = Math.min(100, Math.round(d.focus / TARGET * 100));
  app.innerHTML = `
    <div class="shell">
      <header class="hero">
        <div class="stars">✦　✧　★　✦　✧</div>
        <div class="eyebrow">ATUL'S PERSONAL PLAYGROUND · OWNERSHIP: ATUL</div>
        <h1>ATUL<br><span>(PLAYGROUND)</span></h1>
        <p>A flexible personal workspace built around one objective: <b>12 hours of real focused work.</b></p>
      </header>

      <nav class="nav">
        ${['today','schedule','calendar','posts','tools'].map((x,i)=>`
          <button class="navbtn ${i===0?'active':''}" data-view="${x}">
            ${({today:'Today',schedule:'Schedule next day',calendar:'Calendar',posts:'Posts',tools:'Tools'})[x]}
          </button>`).join('')}
      </nav>

      <main>
        <section id="today" class="view active">
          <div class="stats">
            <article class="card"><small>TODAY'S FOCUS</small><strong id="focus">${fmt(d.focus)}</strong><div class="progress"><i style="width:${pct}%"></i></div><small>${pct}% of 12h</small></article>
            <article class="card"><small>REMAINING</small><strong>${fmt(Math.max(0,TARGET-d.focus))}</strong><small>Only counted focus time matters.</small></article>
            <article class="card"><small>TODAY</small><strong>${new Date().toLocaleDateString(undefined,{day:'numeric',month:'short'})}</strong><button class="btn" id="resetDay">Reset today's record</button></article>
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
            <div class="timeline">
              ${[
                ['05:30–08:00','Focus block'],
                ['08:00–08:30','Breakfast / reset'],
                ['08:30–11:00','Focus block'],
                ['11:00–11:30','Break'],
                ['11:30–13:30','Focus block'],
                ['13:30–14:00','Lunch'],
                ['14:00–17:00','Sleep / recovery'],
                ['17:30–20:00','Focus block'],
                ['20:00–20:30','Dinner / break'],
                ['20:30–23:00','Focus block']
              ].map(([t,n])=>`<div class="slot"><b>${t}</b><span>${n}</span></div>`).join('')}
            </div>
          </article>
        </section>

        <section id="schedule" class="view">
          <article class="card">
            <h2>✨ Schedule your next day</h2>
            <p class="muted">Create a different routine whenever you need one.</p>
            <div class="formrow">
              <label>Date<input id="planDate" type="date" value="${new Date(Date.now()+86400000).toISOString().slice(0,10)}"></label>
              <label>Focus target (hours)<input id="target" type="number" value="12" min="1" max="18" step=".5"></label>
            </div>
            <div id="blocks"></div>
            <button class="btn" id="addBlock">＋ Add block</button>
            <button class="btn primary" id="savePlan">Save schedule</button>
          </article>
        </section>

        <section id="calendar" class="view">
          <article class="card">
            <h2>📅 Calendar</h2>
            <div class="calendar" id="calendarGrid"></div>
            <p class="muted">Days with logged focus will show their total.</p>
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
            <textarea id="note" placeholder="Things Atul needs to remember...">${state.note || ''}</textarea>
            <button class="btn primary" id="saveNote">Save note</button>
          </article>
        </section>
      </main>

      <div class="toast pink">💗 i miss “us”</div>
      <div class="toast yellow">🍈 fresh focus fuel 🍈</div>
      <footer>Built for Atul ✦ ATUL(PLAYGROUND)</footer>
    </div>`;

  wire();
  renderCalendar();
  renderPosts();
}

function wire() {
  document.querySelectorAll('.navbtn').forEach(b => b.onclick = () => {
    document.querySelectorAll('.navbtn').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.view').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    document.getElementById(b.dataset.view).classList.add('active');
  });

  document.getElementById('start').onclick = () => {
    if (timer.running) return;
    timer.running = true;
    timer.startedAt = Date.now();
    tick();
  };
  document.getElementById('pause').onclick = () => {
    timer.running = false;
  };
  document.getElementById('log').onclick = () => {
    day().focus += 60;
    day().sessions++;
    save(); render();
  };
  document.getElementById('resetDay').onclick = () => {
    if (confirm("Reset today's focus record?")) {
      state.days[today()] = {focus:0,sessions:0};
      save(); render();
    }
  };

  document.getElementById('addBlock').onclick = () => addBlock();
  document.getElementById('savePlan').onclick = () => {
    const date = document.getElementById('planDate').value;
    state.plans[date] = [...document.querySelectorAll('.block')].map(b => ({
      time: b.querySelector('.bt').value,
      title: b.querySelector('.bn').value
    }));
    save();
    alert('Schedule saved.');
  };

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

function addBlock(time='', title='Focus block') {
  const blocks = document.getElementById('blocks');
  if (!blocks) return;

  const el = document.createElement('div');
  el.className = 'block';
  el.innerHTML = `<input class="bt" placeholder="Time" value="${time}"><input class="bn" placeholder="Block name" value="${title}"><button class="btn danger remove">Remove</button>`;

  el.querySelector('.remove').onclick = () => el.remove();
  blocks.appendChild(el);
}

function pushPost(text,img) {
  state.posts.push({text,img,date:Date.now()});
  save();
  document.getElementById('postText').value='';
  document.getElementById('postImage').value='';
  renderPosts();
}

function renderPosts() {
  const list = document.getElementById('postList');
  if (!state.posts.length) {
    list.innerHTML = '<div class="card empty">No posts yet. Make the first one ✦</div>';
    return;
  }
  list.innerHTML = [...state.posts].reverse().map(p => `
    <article class="post card">${p.img ? `<img src="${p.img}" alt="Post image">` : ''}
      <div><b>Atul</b><p>${escapeHtml(p.text || '')}</p><small>${new Date(p.date).toLocaleString()}</small></div>
    </article>`).join('');
}

function renderCalendar() {
  const el = document.getElementById('calendarGrid');
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const first = new Date(y,m,1).getDay();
  const days = new Date(y,m+1,0).getDate();
  let html = `<div class="calhead">${now.toLocaleDateString(undefined,{month:'long',year:'numeric'})}</div>`;
  for(let i=0;i<(first+6)%7;i++) html += '<div></div>';
  for(let n=1;n<=days;n++){
    const k = `${y}-${String(m+1).padStart(2,'0')}-${String(n).padStart(2,'0')}`;
    const f = state.days[k]?.focus || 0;
    html += `<div class="calday ${k===today()?'today':''}"><b>${n}</b><small>${f?fmt(f):''}</small></div>`;
  }
  el.innerHTML = html;
}

function tick() {
  if (!timer.running) return;
  timer.seconds = Math.floor((Date.now()-timer.startedAt)/1000);
  const h=String(Math.floor(timer.seconds/3600)).padStart(2,'0');
  const m=String(Math.floor(timer.seconds%3600/60)).padStart(2,'0');
  const s=String(timer.seconds%60).padStart(2,'0');
  const t=document.getElementById('timer');
  if(t) t.textContent=`${h}:${m}:${s}`;
  requestAnimationFrame(tick);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

render();
