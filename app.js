// ============================================================
// Hip Recovery Gym Tracker
// ============================================================

const STORAGE_KEY = 'hipRecovery.v1';
const DEFAULT_EXERCISES = [
  'Bike',
  'Hip machine',
  'Leg press (double)',
  'Leg press (single)',
];

// ---------- State ----------

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { sessions: [] };
    const parsed = JSON.parse(raw);
    if (!parsed.sessions) parsed.sessions = [];
    return parsed;
  } catch {
    return { sessions: [] };
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function upsertSession(session) {
  const state = loadState();
  const idx = state.sessions.findIndex(s => s.id === session.id);
  if (idx >= 0) {
    state.sessions[idx] = session;
  } else {
    state.sessions.push(session);
  }
  saveState(state);
}

function deleteSession(id) {
  const state = loadState();
  state.sessions = state.sessions.filter(s => s.id !== id);
  saveState(state);
}

function getSession(id) {
  return loadState().sessions.find(s => s.id === id);
}

function getActiveSession() {
  return loadState().sessions.find(s => s.status === 'active');
}

// ---------- Utilities ----------

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

const todayISO = () => {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
};

const formatDate = (iso) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
  });
};

const formatShortDate = (iso) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric'
  });
};

const formatTime = (iso) => {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: 'numeric', minute: '2-digit'
  });
};

function painLevel(score) {
  if (score === null || score === undefined || score === '') return 'empty';
  const n = Number(score);
  if (n === 0) return '0';
  if (n <= 3) return 'low';
  if (n <= 6) return 'mid';
  return 'high';
}

function isWithinRolling7(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const now = new Date();
  now.setHours(23, 59, 59, 999);
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  sevenDaysAgo.setHours(0, 0, 0, 0);
  return date >= sevenDaysAgo && date <= now;
}

function rolling7Range() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 6);
  const fmt = (d) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const endYear = end.getFullYear();
  return `${fmt(start)} – ${fmt(end)}, ${endYear}`;
}

// ---------- Router ----------

const app = document.getElementById('app');

function render() {
  const hash = window.location.hash || '#home';
  const [route, param] = hash.slice(1).split('/');

  app.innerHTML = '';

  switch (route) {
    case 'new':
      renderNewSession();
      break;
    case 'session':
      renderSessionDetail(param);
      break;
    case 'history':
      renderHistory();
      break;
    case 'print':
      renderPrint();
      break;
    case 'home':
    default:
      renderHome();
      break;
  }

  window.scrollTo(0, 0);
}

function navigate(hash) {
  window.location.hash = hash;
}

window.addEventListener('hashchange', render);

// ---------- Home ----------

function renderHome() {
  const tpl = document.getElementById('tpl-home').content.cloneNode(true);
  const active = getActiveSession();

  if (active) {
    const banner = tpl.querySelector('[data-active]');
    banner.hidden = false;
    tpl.querySelector('[data-active-date]').textContent = formatDate(active.date);
    tpl.querySelector('[data-resume]').onclick = () => navigate(`#session/${active.id}`);
  }

  tpl.querySelector('[data-new-session]').onclick = () => navigate('#new');
  tpl.querySelector('[data-history]').onclick = () => navigate('#history');
  tpl.querySelector('[data-print]').onclick = () => navigate('#print');
  tpl.querySelector('[data-export]').onclick = handleExport;
  tpl.querySelector('[data-import]').onclick = handleImport;

  app.appendChild(tpl);
}

// ---------- New Session ----------

function renderNewSession() {
  const tpl = document.getElementById('tpl-new-session').content.cloneNode(true);

  const session = {
    id: uid(),
    date: todayISO(),
    status: 'active',
    pain: {
      pre: { score: null, notes: '', timestamp: null },
      post: { score: null, notes: '', timestamp: null },
      twoHour: { score: null, notes: '', timestamp: null },
      night: { score: null, notes: '', timestamp: null },
    },
    exercises: DEFAULT_EXERCISES.map(name => ({
      id: uid(), name, sets: '', reps: '', weight: ''
    })),
    createdAt: new Date().toISOString(),
  };

  tpl.querySelector('[data-back]').onclick = () => navigate('#home');

  const dateInput = tpl.querySelector('[data-field="date"]');
  dateInput.value = session.date;
  dateInput.onchange = (e) => session.date = e.target.value;

  // Pain picker
  const painPicker = tpl.querySelector('[data-pain-picker="pre"]');
  buildPainPicker(painPicker, (score) => {
    session.pain.pre.score = score;
    session.pain.pre.timestamp = new Date().toISOString();
  });

  const preNotes = tpl.querySelector('[data-field="preNotes"]');
  preNotes.oninput = (e) => session.pain.pre.notes = e.target.value;

  // Exercises
  const list = tpl.querySelector('[data-exercise-list]');
  session.exercises.forEach(ex => list.appendChild(buildExerciseRow(ex, session)));

  tpl.querySelector('[data-add-exercise]').onclick = () => {
    const ex = { id: uid(), name: '', sets: '', reps: '', weight: '' };
    session.exercises.push(ex);
    list.appendChild(buildExerciseRow(ex, session));
  };

  // Save
  tpl.querySelector('[data-save-session]').onclick = () => {
    if (!session.date) {
      alert('Please pick a date');
      return;
    }
    // Strip empty unnamed exercises
    session.exercises = session.exercises.filter(ex => ex.name.trim() !== '');
    upsertSession(session);
    navigate(`#session/${session.id}`);
  };

  app.appendChild(tpl);
}

function buildPainPicker(container, onSelect, initial = null) {
  container.innerHTML = '';
  for (let i = 0; i <= 10; i++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pain-cell';
    btn.dataset.score = i;
    btn.dataset.level = painLevel(i);
    btn.textContent = i;
    btn.setAttribute('aria-label', `Pain ${i} out of 10`);
    if (i === initial) btn.classList.add('selected');
    btn.onclick = () => {
      container.querySelectorAll('.pain-cell').forEach(c => c.classList.remove('selected'));
      btn.classList.add('selected');
      onSelect(i);
    };
    container.appendChild(btn);
  }
}

function buildExerciseRow(exercise, session) {
  const tpl = document.getElementById('tpl-exercise-row').content.cloneNode(true);
  const row = tpl.querySelector('[data-exercise-row]');

  const nameInput = row.querySelector('[data-exercise-name]');
  nameInput.value = exercise.name;
  nameInput.oninput = (e) => exercise.name = e.target.value;

  const setsInput = row.querySelector('[data-sets]');
  setsInput.value = exercise.sets;
  setsInput.oninput = (e) => exercise.sets = e.target.value;

  const repsInput = row.querySelector('[data-reps]');
  repsInput.value = exercise.reps;
  repsInput.oninput = (e) => exercise.reps = e.target.value;

  const weightInput = row.querySelector('[data-weight]');
  weightInput.value = exercise.weight;
  weightInput.oninput = (e) => exercise.weight = e.target.value;

  row.querySelector('[data-remove-exercise]').onclick = () => {
    session.exercises = session.exercises.filter(ex => ex.id !== exercise.id);
    row.remove();
  };

  return row;
}

// ---------- Session Detail ----------

function renderSessionDetail(id) {
  const session = getSession(id);
  if (!session) {
    navigate('#home');
    return;
  }

  const tpl = document.getElementById('tpl-session-detail').content.cloneNode(true);
  tpl.querySelector('[data-back]').onclick = () => navigate('#home');
  tpl.querySelector('[data-session-date]').textContent = formatDate(session.date);

  // Pre-gym display
  const preDisplay = tpl.querySelector('[data-pain-display="pre"]');
  preDisplay.appendChild(buildPainBadge(session.pain.pre.score));
  tpl.querySelector('[data-notes-display="pre"]').textContent = session.pain.pre.notes || '';

  // Exercise display
  const exDisplay = tpl.querySelector('[data-exercise-display]');
  if (session.exercises.length === 0) {
    exDisplay.innerHTML = '<div class="notes-display">No exercises logged</div>';
  } else {
    session.exercises.forEach(ex => {
      const row = document.createElement('div');
      row.className = 'exercise-display-row';
      const detail = [
        ex.sets && `${ex.sets} sets`,
        ex.reps && `${ex.reps} reps`,
        ex.weight && `${ex.weight} lbs`,
      ].filter(Boolean).join(' · ');
      row.innerHTML = `<strong>${escapeHtml(ex.name)}</strong><span>${detail || '—'}</span>`;
      exDisplay.appendChild(row);
    });
  }

  // Three checkpoints
  ['post', 'twoHour', 'night'].forEach(key => {
    const container = tpl.querySelector(`[data-checkpoint="${key}"]`);
    const timeEl = tpl.querySelector(`[data-checkpoint-time="${key}"]`);
    renderCheckpoint(container, timeEl, session, key);
  });

  tpl.querySelector('[data-delete-session]').onclick = () => {
    if (confirm('Delete this session? This cannot be undone.')) {
      deleteSession(session.id);
      navigate('#home');
    }
  };

  app.appendChild(tpl);
}

function buildPainBadge(score) {
  const wrap = document.createElement('div');
  wrap.style.display = 'flex';
  wrap.style.alignItems = 'center';
  wrap.style.gap = '10px';

  const badge = document.createElement('span');
  badge.className = `pain-badge level-${painLevel(score)}`;
  badge.textContent = (score === null || score === undefined || score === '') ? '–' : score;

  const label = document.createElement('span');
  label.className = 'pain-label';
  if (score === null || score === undefined || score === '') {
    label.textContent = 'Not logged';
  } else {
    label.textContent = `${score} / 10`;
  }

  wrap.appendChild(badge);
  wrap.appendChild(label);
  return wrap;
}

function renderCheckpoint(container, timeEl, session, key) {
  container.innerHTML = '';
  const data = session.pain[key];
  const logged = data.score !== null && data.score !== undefined && data.score !== '';

  if (logged) {
    timeEl.textContent = `Logged ${formatTime(data.timestamp)}`;
    timeEl.classList.add('checkpoint-logged');
  } else {
    timeEl.textContent = '';
  }

  // Pain picker
  const picker = document.createElement('div');
  picker.className = 'pain-picker';
  container.appendChild(picker);
  buildPainPicker(picker, (score) => {
    session.pain[key].score = score;
    session.pain[key].timestamp = new Date().toISOString();
    upsertSession(session);
    // Re-render just this checkpoint's time label
    timeEl.textContent = `Logged ${formatTime(session.pain[key].timestamp)}`;
    timeEl.classList.add('checkpoint-logged');
    maybeCompleteSession(session);
  }, logged ? Number(data.score) : null);

  // Notes
  const field = document.createElement('label');
  field.className = 'field';
  field.innerHTML = `
    <span class="field-label">Notes</span>
    <textarea rows="2" placeholder="How does it feel?"></textarea>
  `;
  const textarea = field.querySelector('textarea');
  textarea.value = data.notes || '';
  textarea.oninput = (e) => {
    session.pain[key].notes = e.target.value;
    upsertSession(session);
  };
  container.appendChild(field);
}

function maybeCompleteSession(session) {
  const allLogged = ['pre', 'post', 'twoHour', 'night'].every(
    k => session.pain[k].score !== null && session.pain[k].score !== ''
  );
  if (allLogged && session.status !== 'complete') {
    session.status = 'complete';
    upsertSession(session);
  }
}

// ---------- History ----------

function renderHistory() {
  const tpl = document.getElementById('tpl-history').content.cloneNode(true);
  tpl.querySelector('[data-back]').onclick = () => navigate('#home');

  const state = loadState();
  const sessions = [...state.sessions].sort((a, b) => b.date.localeCompare(a.date));

  const list = tpl.querySelector('[data-session-list]');

  if (sessions.length === 0) {
    list.innerHTML = '<div class="empty-state">No sessions logged yet.</div>';
  } else {
    sessions.forEach(s => list.appendChild(buildSessionCard(s)));
  }

  // Chart
  if (sessions.length >= 2) {
    const chart = tpl.querySelector('[data-chart]');
    chart.hidden = false;
    const svg = tpl.querySelector('[data-chart-svg]');
    svg.innerHTML = buildChart(sessions.slice().reverse());
  }

  app.appendChild(tpl);
}

function buildSessionCard(session) {
  const card = document.createElement('button');
  card.className = 'session-card';
  card.type = 'button';
  card.onclick = () => navigate(`#session/${session.id}`);

  const dates = document.createElement('div');
  dates.className = 'session-card-dates';
  const dateEl = document.createElement('div');
  dateEl.className = 'session-card-date';
  dateEl.textContent = formatShortDate(session.date);
  const metaEl = document.createElement('div');
  metaEl.className = 'session-card-meta';
  const exCount = session.exercises.length;
  const statusText = session.status === 'complete' ? 'Complete' : 'In progress';
  metaEl.textContent = `${exCount} exercise${exCount === 1 ? '' : 's'} · ${statusText}`;
  dates.appendChild(dateEl);
  dates.appendChild(metaEl);

  const pips = document.createElement('div');
  pips.className = 'pain-row';
  ['pre', 'post', 'twoHour', 'night'].forEach(key => {
    const s = session.pain[key].score;
    const pip = document.createElement('span');
    pip.className = `pain-pip level-${painLevel(s)}`;
    pip.textContent = (s === null || s === '' || s === undefined) ? '' : s;
    pip.title = key;
    pips.appendChild(pip);
  });

  card.appendChild(dates);
  card.appendChild(pips);
  return card;
}

function buildChart(sessions) {
  // Small inline SVG line chart: pre (green), post (amber), night (purple)
  const W = 320, H = 140, P = 24;
  const plotW = W - P * 2;
  const plotH = H - P * 2;

  const series = [
    { key: 'pre', color: '#6b8e7f' },
    { key: 'post', color: '#c89b5a' },
    { key: 'night', color: '#8b6b8e' },
  ];

  const points = sessions.map((s, i) => ({
    x: sessions.length === 1 ? plotW / 2 : (i / (sessions.length - 1)) * plotW,
    pre: s.pain.pre.score,
    post: s.pain.post.score,
    night: s.pain.night.score,
  }));

  const yFor = (score) => plotH - (Number(score) / 10) * plotH;

  let paths = '';
  let dots = '';

  series.forEach(({ key, color }) => {
    let d = '';
    points.forEach((p, i) => {
      const v = p[key];
      if (v === null || v === '' || v === undefined) return;
      const x = p.x + P;
      const y = yFor(v) + P;
      d += (d ? ' L' : 'M') + ` ${x.toFixed(1)} ${y.toFixed(1)}`;
      dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="${color}" />`;
    });
    if (d) {
      paths += `<path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />`;
    }
  });

  // Gridlines (0, 5, 10)
  let grid = '';
  [0, 5, 10].forEach(v => {
    const y = yFor(v) + P;
    grid += `<line x1="${P}" y1="${y}" x2="${W - P}" y2="${y}" stroke="#e5e2db" stroke-width="1" />`;
    grid += `<text x="${P - 6}" y="${y + 3}" text-anchor="end" font-size="9" fill="#a8a8a8">${v}</text>`;
  });

  return `
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      ${grid}
      ${paths}
      ${dots}
    </svg>
  `;
}

// ---------- Print ----------

function renderPrint() {
  const tpl = document.getElementById('tpl-print').content.cloneNode(true);
  tpl.querySelector('[data-back]').onclick = () => navigate('#home');
  tpl.querySelector('[data-week-range]').textContent = rolling7Range();

  const state = loadState();
  const sessions = state.sessions
    .filter(s => isWithinRolling7(s.date))
    .sort((a, b) => a.date.localeCompare(b.date));

  const body = tpl.querySelector('[data-print-body]');

  if (sessions.length === 0) {
    body.innerHTML = '<p style="text-align:center;color:#666;padding:20px 0;">No sessions logged in the past 7 days.</p>';
  } else {
    sessions.forEach(s => body.appendChild(buildPrintSession(s)));
  }

  app.appendChild(tpl);
}

function buildPrintSession(session) {
  const wrap = document.createElement('div');
  wrap.className = 'print-session';

  const h2 = document.createElement('h2');
  h2.textContent = formatDate(session.date);
  wrap.appendChild(h2);

  // Pain table
  const painTable = document.createElement('table');
  painTable.className = 'print-table';
  const painRows = [
    ['Before gym', session.pain.pre],
    ['Right after', session.pain.post],
    ['2 hours later', session.pain.twoHour],
    ['That night', session.pain.night],
  ];
  painTable.innerHTML = `
    <thead>
      <tr>
        <th>Checkpoint</th>
        <th class="num">Pain (0–10)</th>
        <th>Notes</th>
      </tr>
    </thead>
    <tbody>
      ${painRows.map(([label, p]) => {
        const score = (p.score === null || p.score === '' || p.score === undefined) ? '—' : p.score;
        const notes = p.notes ? escapeHtml(p.notes) : '';
        return `<tr>
          <td><strong>${label}</strong></td>
          <td class="num">${score}</td>
          <td>${notes}</td>
        </tr>`;
      }).join('')}
    </tbody>
  `;
  wrap.appendChild(painTable);

  // Exercise table
  if (session.exercises.length > 0) {
    const exTable = document.createElement('table');
    exTable.className = 'print-table';
    exTable.innerHTML = `
      <thead>
        <tr>
          <th>Exercise</th>
          <th class="num">Sets</th>
          <th class="num">Reps</th>
          <th class="num">Weight (lbs)</th>
        </tr>
      </thead>
      <tbody>
        ${session.exercises.map(ex => `
          <tr>
            <td>${escapeHtml(ex.name)}</td>
            <td class="num">${ex.sets || '—'}</td>
            <td class="num">${ex.reps || '—'}</td>
            <td class="num">${ex.weight || '—'}</td>
          </tr>
        `).join('')}
      </tbody>
    `;
    wrap.appendChild(exTable);
  }

  return wrap;
}

// ---------- Export / Import ----------

function handleExport() {
  const state = loadState();
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `hip-recovery-${todayISO()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function handleImport() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!data.sessions || !Array.isArray(data.sessions)) {
          throw new Error('Invalid format');
        }
        const choice = confirm(
          `Import ${data.sessions.length} session(s)?\n\n` +
          `OK = Merge with existing data\n` +
          `Cancel = Keep current data`
        );
        if (!choice) return;

        const current = loadState();
        const existingIds = new Set(current.sessions.map(s => s.id));
        data.sessions.forEach(s => {
          if (!existingIds.has(s.id)) {
            current.sessions.push(s);
          }
        });
        saveState(current);
        alert(`Imported successfully.`);
        render();
      } catch (err) {
        alert('Could not read file: ' + err.message);
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

// ---------- Helpers ----------

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ---------- Boot ----------

render();
