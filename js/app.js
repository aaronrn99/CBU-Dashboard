// ================================================
//  CBU Dashboard — Architecture Fall 2026
//  app.js
// ================================================

// ── State ─────────────────────────────────────
const state = {
    notes: [],
    schedule: {},
    canvasSettings: { url: '', token: '' },
    assignments: [],
    thesis: { notes: [], links: [], pdfs: [] },
    calendarEvents: [],
    customEvents: [],   // shared store — synced between Schedule and Calendar tabs
    sketches: [],
};

// ── Persistence ───────────────────────────────
function save(key, data)       { driveSet(key, data); }
function load(key, fallback)   { return driveGet(key, fallback); }

// ── XSS Protection ───────────────────────────
function esc(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ── PIN Lock ──────────────────────────────────

const PIN_HASH_KEY = 'cbu_pin_hash';

async function pinSHA256(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

let _pinMode  = 'verify'; // verify | create | confirm | change_current | change_new | change_confirm
let _pinEntry = '';
let _pinFirst = '';

async function pinBoot() {
    // Show PIN screen in a connecting state while we silently auth Drive
    const screen = document.getElementById('pinScreen');
    if (screen) screen.style.display = '';
    _pinSetConnecting(true);

    try {
        await drivePreload();
        // Pull pinHash from Drive — prevents a new setup on a fresh browser
        const driveHash = driveGet('pinHash', null);
        if (driveHash) localStorage.setItem(PIN_HASH_KEY, driveHash);
    } catch {
        // Drive unavailable — fall through to localStorage
    }

    _pinSetConnecting(false);
    const stored = localStorage.getItem(PIN_HASH_KEY);
    _showPinScreen(stored ? 'verify' : 'create');
}

function _pinSetConnecting(on) {
    const titleEl = document.getElementById('pinTitle');
    const subEl   = document.getElementById('pinSubtitle');
    const pad     = document.querySelector('.pin-pad');
    const dotsEl  = document.querySelector('.pin-dots');
    if (titleEl) titleEl.textContent = on ? 'Connecting…' : '';
    if (subEl)   {
        subEl.textContent = on ? 'Syncing your security settings…' : '';
        subEl.style.color = 'var(--text-3)';
        if (!on) delete subEl.dataset.err;
    }
    if (pad)    pad.style.visibility    = on ? 'hidden' : '';
    if (dotsEl) dotsEl.style.visibility = on ? 'hidden' : '';
}

function _showPinScreen(mode) {
    _pinMode  = mode;
    _pinEntry = '';
    _pinFirst = '';
    const el = document.getElementById('pinScreen');
    if (el) el.style.display = '';
    _updatePinUI();
}

function _hidePinScreen() {
    const el = document.getElementById('pinScreen');
    if (el) el.style.display = 'none';
}

function _updatePinUI() {
    const titles = {
        verify:         'Enter PIN',
        create:         'Create PIN',
        confirm:        'Confirm PIN',
        change_current: 'Enter Current PIN',
        change_new:     'Enter New PIN',
        change_confirm: 'Confirm New PIN',
    };
    const titleEl = document.getElementById('pinTitle');
    if (titleEl) titleEl.textContent = titles[_pinMode] || 'Enter PIN';
    document.querySelectorAll('.pin-dot').forEach((d, i) => {
        d.classList.toggle('filled', i < _pinEntry.length);
        d.classList.remove('error', 'success');
    });
    const sub = document.getElementById('pinSubtitle');
    if (sub && !sub.dataset.err) sub.textContent = '';
}

function pinInput(digit) {
    if (_pinEntry.length >= 6) return;
    _pinEntry += String(digit);
    _updatePinUI();
    if (_pinEntry.length === 6) setTimeout(pinSubmit, 120);
}

function pinBackspace() {
    if (!_pinEntry.length) return;
    _pinEntry = _pinEntry.slice(0, -1);
    _updatePinUI();
}

async function pinSubmit() {
    const hash = await pinSHA256(_pinEntry);

    if (_pinMode === 'verify') {
        if (hash === localStorage.getItem(PIN_HASH_KEY)) {
            _pinSuccessUnlock();
        } else {
            _pinError('Incorrect PIN');
        }

    } else if (_pinMode === 'create') {
        _pinFirst = _pinEntry;
        _pinEntry = '';
        _pinMode  = 'confirm';
        _updatePinUI();

    } else if (_pinMode === 'confirm') {
        if (_pinEntry === _pinFirst) {
            localStorage.setItem(PIN_HASH_KEY, hash);
            driveSet('pinHash', hash);
            _pinSuccessUnlock();
        } else {
            _pinFirst = '';
            _pinMode  = 'create';
            _pinError("PINs don't match");
        }

    } else if (_pinMode === 'change_current') {
        if (hash === localStorage.getItem(PIN_HASH_KEY)) {
            _pinEntry = '';
            _pinMode  = 'change_new';
            _updatePinUI();
        } else {
            _pinError('Incorrect PIN');
        }

    } else if (_pinMode === 'change_new') {
        _pinFirst = _pinEntry;
        _pinEntry = '';
        _pinMode  = 'change_confirm';
        _updatePinUI();

    } else if (_pinMode === 'change_confirm') {
        if (_pinEntry === _pinFirst) {
            localStorage.setItem(PIN_HASH_KEY, hash);
            driveSet('pinHash', hash);
            _hidePinScreen();
            _pinSetStatus('PIN updated successfully.');
        } else {
            _pinFirst = '';
            _pinMode  = 'change_new';
            _pinError("PINs don't match");
        }
    }
}

function _pinSuccessUnlock() {
    document.querySelectorAll('.pin-dot').forEach(d => d.classList.add('success'));
    setTimeout(() => {
        _hidePinScreen();
        driveStart();
    }, 380);
}

function _pinError(msg) {
    const dots = document.querySelectorAll('.pin-dot');
    dots.forEach(d => d.classList.add('error'));
    const sub = document.getElementById('pinSubtitle');
    if (sub) { sub.textContent = msg; sub.style.color = 'var(--red)'; sub.dataset.err = '1'; }
    setTimeout(() => {
        dots.forEach(d => { d.classList.remove('error', 'filled'); });
        _pinEntry = '';
        if (sub) { sub.textContent = ''; sub.style.color = ''; delete sub.dataset.err; }
    }, 600);
}

function _pinSetStatus(msg) {
    const el = document.getElementById('pinChangeStatus');
    if (!el) return;
    el.textContent = msg;
    el.className = 'settings-status settings-status-saved';
    setTimeout(() => { el.textContent = ''; el.className = 'settings-status'; }, 3000);
}

function openChangePinFlow() {
    _showPinScreen('change_current');
}

document.addEventListener('DOMContentLoaded', () => {
    pinBoot();
    document.addEventListener('keydown', e => {
        const screen = document.getElementById('pinScreen');
        if (!screen || screen.style.display === 'none') return;
        if (e.key >= '0' && e.key <= '9') pinInput(e.key);
        else if (e.key === 'Backspace') pinBackspace();
    });
});

// ── Init ──────────────────────────────────────
function init() {
    state.notes          = load('notes', []);
    state.schedule       = load('schedule', {});
    state.canvasSettings = load('canvasSettings', { url: '', token: '' });
    state.assignments    = load('assignments', []);
    state.calendarEvents = load('calendarEvents', []);
    state.customEvents   = load('custom_events', []);
    state.thesis = {
        notes: load('thesis_notes', []),
        links: load('thesis_links', []),
        pdfs:  load('thesis_pdfs',  []),
    };
    state.sketches = (load('sketches', []) || []).sort((a, b) =>
        new Date(b.addedAt) - new Date(a.addedAt)
    );

    _todosViewDate = todayDateStr();

    setDateDisplay();
    initBanner();
    initBannerImages();
    renderAssignments();
    renderTodos();
    renderStudioOverview();
    renderSchedule();
    renderNotes();
    renderThesisNotes();
    renderThesisLinks();
    renderThesisPdfs();
    renderCalendar();
    renderSketchLog();
    bindEvents();
}

// ── Date & Banner ─────────────────────────────

// Banner state
let _bannerPool  = [];
let _bannerIndex = 0;

// Build the message pool for the current moment.
// Index 0 is always the time-based base message; expanded date messages follow.
function getBannerPool() {
    const now   = new Date();
    const month = now.getMonth() + 1;
    const day   = now.getDate();
    const hour  = now.getHours();

    const is      = (m, d)             => month === m && day === d;
    const between = (m1, d1, m2, d2)   => {
        const n = month * 100 + day;
        return n >= m1 * 100 + d1 && n <= m2 * 100 + d2;
    };

    // Base message (time-of-day)
    let base;
    if      (hour >= 5  && hour < 12) base = 'GOOD MORNING, AARON.';
    else if (hour >= 12 && hour < 17) base = 'GOOD AFTERNOON, AARON.';
    else if (hour >= 17 && hour < 21) base = 'GOOD EVENING, AARON.';
    else if (hour >= 21)              base = 'WORKING LATE, AARON.';
    else                              base = 'UP EARLY, AARON.';

    const pool = [base];

    // Expanded date-specific messages (added when date matches)
    if (is(11, 4))               pool.push('3 WEEKS UNTIL THANKSGIVING BREAK, AARON.');
    if (is(11, 11))              pool.push('2 WEEKS UNTIL THANKSGIVING BREAK, AARON.');
    if (is(11, 18))              pool.push('1 WEEK UNTIL THANKSGIVING BREAK, AARON.');
    if (between(11, 22, 11, 24)) pool.push('A FEW DAYS UNTIL THANKSGIVING BREAK, AARON.');
    if (between(11, 25, 11, 27)) pool.push('ENJOY YOUR BREAK, AARON.');
    if (is(11, 20))              pool.push('3 WEEKS UNTIL WINTER BREAK, AARON.');
    if (is(11, 27))              pool.push('2 WEEKS UNTIL WINTER BREAK, AARON.');
    if (is(12, 4))               pool.push('1 WEEK UNTIL WINTER BREAK, AARON.');
    if (between(12, 7, 12, 11))  pool.push('FINALS WEEK, AARON.');
    if (month === 12 && day >= 11) pool.push("SEMESTER'S DONE, AARON.");

    return pool;
}

// Fade the banner to a new message (opacity transition is in CSS)
function fadeToBannerMessage(msg) {
    const el = document.getElementById('bannerText');
    if (!el) return;
    el.style.opacity = '0';
    setTimeout(() => {
        el.textContent = msg;
        el.style.opacity = '1';
    }, 650);
}

// Advance to the next message in the pool (called every 20 minutes)
function advanceBanner() {
    const newPool = getBannerPool();
    // Keep cycling; if pool shrank, clamp index to avoid out-of-bounds
    _bannerIndex = (_bannerIndex + 1) % newPool.length;
    _bannerPool  = newPool;
    fadeToBannerMessage(_bannerPool[_bannerIndex]);
}

// Initialise banner on page load
function initBanner() {
    _bannerPool  = getBannerPool();
    _bannerIndex = 0;
    const el = document.getElementById('bannerText');
    if (el) el.textContent = _bannerPool[0];
    setInterval(advanceBanner, 20 * 60 * 1000);   // rotate every 20 minutes
}

// Two <img> elements crossfade every 15 s. One fades in while the other
// fades out — a true blend, not a cut. object-fit: cover is in the CSS.
function initBannerImages() {
    const slideA = document.getElementById('bannerSlideA');
    const slideB = document.getElementById('bannerSlideB');
    if (!slideA || !slideB) return;

    const IMAGES = [
        'images/Image 1.jpeg',
        'images/Image 2.jpeg',
        'images/Image 3.jpeg',
        'images/Image 4.jpeg',
        'images/image 5.jpeg',
        'images/Image 6.jpeg',
        'images/Image 7.jpeg',
        'images/Image 8.jpeg',
        'images/Image 9.jpeg',
        'images/Image 10 .jpeg',
    ];
    let current = slideA;
    let next    = slideB;
    let idx     = 0;

    // Load first image, fade in once it's ready
    current.src = IMAGES[0];
    setTimeout(() => current.classList.add('active'), 100);

    setInterval(() => {
        idx = (idx + 1) % IMAGES.length;
        // Capture current slide references so the onload closure is correct
        // even if the interval fires again before the image finishes loading.
        const outgoing = current;
        const incoming = next;
        incoming.onload = () => {
            incoming.classList.add('active');   // fade in new image
            outgoing.classList.remove('active'); // fade out old image
        };
        incoming.src = IMAGES[idx];
        [current, next] = [next, current]; // swap roles for next cycle
    }, 15000);
}

function setDateDisplay() {
    const el = document.getElementById('dateDisplay');
    if (!el) return;
    const now = new Date();
    el.textContent = now.toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
}

// ── Navigation ───────────────────────────────
const SECTION_TITLES = {
    assignments: 'Assignments',
    todos:       'To-Do List',
    studio:      'Studio Projects',
    sketchlog:   'Sketch Log',
    schedule:    'Weekly Schedule',
    notes:       'Notes',
    thesis:      'Thesis',
    calendar:    'Calendar',
    files:       'Files',
    settings:    'Settings',
    claude:      'Claude',
};

function showSection(id) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));

    const sec = document.getElementById(id);
    const lnk = document.querySelector(`.nav-link[data-section="${id}"]`);
    if (sec) sec.classList.add('active');
    if (lnk) lnk.classList.add('active');

    const titleEl = document.getElementById('pageTitle');
    if (titleEl) titleEl.textContent = SECTION_TITLES[id] || '';

    if (id === 'files')      renderFiles();
    if (id === 'settings')   renderSettingsSection();
    if (id === 'sketchlog')  renderSketchLog();
    if (id === 'claude') {
        document.getElementById('claudeModeSelect').style.display  = '';
        document.getElementById('claudeInlineChat').style.display  = 'none';
    }
    if (id === 'studio') {
        currentProjectId = null;
        const ov = document.getElementById('studioOverview');
        const dt = document.getElementById('studioDetail');
        if (ov) ov.style.display = '';
        if (dt) dt.style.display = 'none';
        renderStudioOverview();
    }
}

// ── Canvas API ───────────────────────────────
async function syncCanvas() {
    const { url, token } = state.canvasSettings;
    const statusEl = document.getElementById('canvasStatus');
    const syncBtn  = document.getElementById('syncCanvas');

    if (!url || !token) {
        statusEl.className = 'canvas-status error';
        statusEl.textContent = 'Canvas not configured — add your URL and token in Settings.';
        return;
    }

    syncBtn.disabled = true;
    syncBtn.textContent = '↻ Syncing…';
    statusEl.className = 'canvas-status';
    statusEl.textContent = 'Connecting to Canvas…';

    try {
        const base    = url.replace(/\/+$/, '');
        const headers = { Authorization: `Bearer ${token}` };

        const coursesRes = await fetch(
            `${base}/api/v1/courses?enrollment_state=active&per_page=20`, { headers }
        );

        if (!coursesRes.ok) {
            throw new Error(
                coursesRes.status === 401
                    ? 'Invalid API token — regenerate it in Canvas → Account → Settings.'
                    : `Canvas returned ${coursesRes.status}: ${coursesRes.statusText}`
            );
        }

        const courses = await coursesRes.json();

        if (!Array.isArray(courses) || courses.length === 0) {
            throw new Error('No active courses found. Check your token permissions.');
        }

        statusEl.textContent = `Found ${courses.length} course(s). Fetching assignments…`;

        const allAssignments = [];

        await Promise.allSettled(
            courses.slice(0, 12).map(async course => {
                if (!course.id) return;
                try {
                    const res = await fetch(
                        `${base}/api/v1/courses/${course.id}/assignments` +
                        `?bucket=upcoming&per_page=30&order_by=due_at`,
                        { headers }
                    );
                    if (!res.ok) return;
                    const list = await res.json();
                    if (!Array.isArray(list)) return;
                    list.forEach(a => {
                        if (!a.name) return;
                        allAssignments.push({
                            id:              a.id,
                            title:           a.name,
                            course:          course.name || course.course_code || 'Unknown',
                            dueAt:           a.due_at || null,
                            pointsPossible:  a.points_possible ?? null,
                            url:             a.html_url || null,
                        });
                    });
                } catch { /* skip individual course errors */ }
            })
        );

        allAssignments.sort((a, b) => {
            if (!a.dueAt) return 1;
            if (!b.dueAt) return -1;
            return new Date(a.dueAt) - new Date(b.dueAt);
        });

        state.assignments = allAssignments;
        save('assignments', allAssignments);
        renderAssignments();
        syncCanvasAssignmentsToEvents(allAssignments);

        statusEl.className = 'canvas-status success';
        statusEl.textContent =
            `Synced ${allAssignments.length} assignment(s) from ${courses.length} course(s) · ` +
            new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

    } catch (err) {
        statusEl.className = 'canvas-status error';
        statusEl.textContent = err.message;
    } finally {
        syncBtn.disabled = false;
        syncBtn.textContent = '↻ Sync Canvas';
    }
}

function assignmentStatus(dueAt) {
    if (!dueAt) return { label: 'No Due Date', cls: 'badge-upcoming' };
    const diff = new Date(dueAt) - Date.now();
    const days  = diff / 864e5;
    if (diff < 0)    return { label: 'Overdue',   cls: 'badge-overdue' };
    if (days <= 2)   return { label: 'Due Soon',  cls: 'badge-due-soon' };
    return              { label: 'Upcoming',   cls: 'badge-upcoming' };
}

function fmtDue(dueAt) {
    if (!dueAt) return 'No due date';
    return new Date(dueAt).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit'
    });
}

function renderAssignments() {
    const el = document.getElementById('assignmentsList');
    if (!el) return;

    if (!state.assignments.length) {
        const msg = (!state.canvasSettings.url || !state.canvasSettings.token)
            ? 'Configure Canvas to sync your assignments.'
            : 'No upcoming assignments found. Click "Sync Canvas" to fetch.';
        el.innerHTML = `<div class="empty-state">
            <div class="empty-state-icon"></div>
            <div class="empty-state-text">${msg}</div>
        </div>`;
        return;
    }

    el.innerHTML = state.assignments.map(a => {
        const { label, cls } = assignmentStatus(a.dueAt);
        const pts = a.pointsPossible != null ? `${a.pointsPossible} pts` : '';
        return `
        <div class="assignment-card">
            <div class="assignment-info">
                <div class="assignment-title">${esc(a.title)}</div>
                <div class="assignment-meta">
                    <span>${esc(a.course)}</span>
                    <span>${fmtDue(a.dueAt)}</span>
                    ${pts ? `<span>${pts}</span>` : ''}
                </div>
            </div>
            <div class="assignment-actions">
                <span class="badge ${cls}">${label}</span>
                ${a.url
                    ? `<a href="${esc(a.url)}" target="_blank" rel="noopener noreferrer" class="btn btn-ghost" style="font-size:12px;padding:5px 10px">Open ↗</a>`
                    : ''}
            </div>
        </div>`;
    }).join('');
}

// ── To-Do ────────────────────────────────────
// ── Day-by-Day To-Do ──────────────────────────

let _todosViewDate = null; // YYYY-MM-DD

function todayDateStr() {
    return new Date().toISOString().slice(0, 10);
}

function getTodosForDay(dateStr)        { return driveGet('todos_' + dateStr, []); }
function saveTodosForDay(dateStr, todos) { driveSet('todos_' + dateStr, todos); }

function todosGoDay(delta) {
    const d = new Date(_todosViewDate + 'T12:00:00');
    d.setDate(d.getDate() + delta);
    _todosViewDate = d.toISOString().slice(0, 10);
    renderTodos();
}

function addTodo() {
    const input = document.getElementById('todoInput');
    const text  = input?.value.trim();
    if (!text) return;
    const todos = getTodosForDay(_todosViewDate);
    todos.unshift({ id: Date.now(), text, completed: false });
    saveTodosForDay(_todosViewDate, todos);
    input.value = '';
    renderTodos();
}

function toggleTodo(id) {
    const todos = getTodosForDay(_todosViewDate);
    const todo  = todos.find(t => t.id === id);
    if (!todo) return;
    todo.completed = !todo.completed;
    saveTodosForDay(_todosViewDate, todos);
    if (todo.completed) {
        const itemEl = document.querySelector(`.dtask[data-id="${id}"]`);
        if (itemEl) {
            itemEl.classList.add('completed', 'dtask--sinking');
            const circle = itemEl.querySelector('.dtask-circle');
            if (circle) {
                circle.classList.add('checked');
                circle.innerHTML = '<svg viewBox="0 0 12 12" width="12" height="12"><polyline points="2,6 5,9 10,3" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
            }
            const txt = itemEl.querySelector('.dtask-text');
            if (txt) txt.style.textDecoration = 'line-through';
            setTimeout(() => renderTodos(), 260);
            return;
        }
    }
    renderTodos();
}

function deleteTodo(id) {
    saveTodosForDay(_todosViewDate, getTodosForDay(_todosViewDate).filter(t => t.id !== id));
    renderTodos();
}

function renderTodos() {
    if (!_todosViewDate) _todosViewDate = todayDateStr();
    const today   = todayDateStr();
    const isToday = _todosViewDate === today;

    const d       = new Date(_todosViewDate + 'T12:00:00');
    const dayName = d.toLocaleDateString('en-US', { weekday: 'long' });
    const dateStr = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    const nameEl  = document.getElementById('todoDayName');
    const dateEl  = document.getElementById('todoDayDate');
    const badge   = document.getElementById('todoTodayBadge');
    if (nameEl) nameEl.textContent  = dayName;
    if (dateEl) dateEl.textContent  = dateStr;
    if (badge)  badge.style.display = isToday ? '' : 'none';

    const wrap  = document.getElementById('todoListWrap');
    if (!wrap) return;
    const todos = getTodosForDay(_todosViewDate);

    if (!todos.length) {
        wrap.innerHTML = '<p class="todo-empty">No tasks for this day.</p>';
        return;
    }

    const sorted = [...todos].sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        return b.id - a.id;
    });

    const checkmark = '<svg viewBox="0 0 12 12" width="12" height="12"><polyline points="2,6 5,9 10,3" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    wrap.innerHTML = sorted.map(t => `
        <div class="dtask${t.completed ? ' completed' : ''}" data-id="${t.id}">
            <button class="dtask-circle${t.completed ? ' checked' : ''}"
                    onclick="toggleTodo(${t.id})"
                    aria-label="${t.completed ? 'Mark incomplete' : 'Mark complete'}">
                ${t.completed ? checkmark : ''}
            </button>
            <span class="dtask-text">${esc(t.text)}</span>
            <button class="dtask-del" onclick="deleteTodo(${t.id})" aria-label="Delete task">✕</button>
        </div>`
    ).join('');
}

// ── Studio Projects ───────────────────────────

const PROJECT_NAMES = ['Project 1', 'Project 2', 'Project 3', 'Project 4'];
let currentProjectId = null;

function getProjectData(n)       { return driveGet('project_' + n, { notes: [], files: [], deliverables: [] }); }
function saveProjectData(n, data) { driveSet('project_' + n, data); }

function renderStudioOverview() {
    const el = document.getElementById('studioOverviewGrid');
    if (!el) return;
    el.innerHTML = PROJECT_NAMES.map((name, i) => {
        const n    = i + 1;
        const data = getProjectData(n);
        const nc   = data.notes.length;
        const fc   = data.files.length;
        const dc   = data.deliverables.length;
        return `
        <div class="project-card">
            <div class="project-card-header">
                <div class="project-name">${esc(name)}</div>
                <button class="btn btn-primary" style="font-size:12px;padding:5px 12px"
                    onclick="openProject(${n})">Open →</button>
            </div>
            <div class="project-overview-stats">
                <span class="project-stat">${nc} note${nc !== 1 ? 's' : ''}</span>
                <span class="project-stat">${fc} file${fc !== 1 ? 's' : ''}</span>
                <span class="project-stat">${dc} deliverable${dc !== 1 ? 's' : ''}</span>
            </div>
        </div>`;
    }).join('');
}

function openProject(n) {
    currentProjectId = n;
    document.getElementById('studioOverview').style.display = 'none';
    document.getElementById('studioDetail').style.display   = '';
    document.getElementById('studioDetailTitle').textContent = PROJECT_NAMES[n - 1];
    renderStudioNotes();
    renderStudioFiles();
    renderStudioDeliverables();
}

function closeProject() {
    currentProjectId = null;
    document.getElementById('studioOverview').style.display = '';
    document.getElementById('studioDetail').style.display   = 'none';
    renderStudioOverview();
}

// ── Critique Notes ────────────────────────────

function addStudioNote() {
    const input = document.getElementById('studioNoteInput');
    const text  = input?.value.trim();
    if (!text || !currentProjectId) return;
    const data = getProjectData(currentProjectId);
    data.notes.unshift({ id: Date.now(), text, createdAt: new Date().toISOString() });
    saveProjectData(currentProjectId, data);
    input.value = '';
    renderStudioNotes();
}

function deleteStudioNote(id) {
    const data = getProjectData(currentProjectId);
    data.notes = data.notes.filter(n => n.id !== id);
    saveProjectData(currentProjectId, data);
    renderStudioNotes();
}

function renderStudioNotes() {
    const el = document.getElementById('studioNotesList');
    if (!el) return;
    const data = getProjectData(currentProjectId);
    if (!data.notes.length) {
        el.innerHTML = `<div class="empty-state" style="padding:28px 20px">
            <div class="empty-state-icon"></div>
            <div class="empty-state-text">No critique notes yet. Add one above.</div>
        </div>`;
        return;
    }
    el.innerHTML = data.notes.map(n => `
        <div class="note-card" style="margin-bottom:10px">
            <div style="font-size:13px;line-height:1.6;color:var(--text-1);white-space:pre-wrap">${esc(n.text)}</div>
            <div class="note-divider" style="margin:8px 0"></div>
            <div class="note-footer">
                <span class="note-date">${fmtNoteDate(n.createdAt)}</span>
                <button class="btn btn-danger" onclick="deleteStudioNote(${n.id})">Delete</button>
            </div>
        </div>`
    ).join('');
}

// ── Project Files ─────────────────────────────

function renderStudioFiles() {
    const contentEl = document.getElementById('studioFilesContent');
    if (!contentEl) return;
    contentEl.innerHTML = `
    <div class="files-upload-area" style="margin-bottom:12px">
        <div class="files-drop-zone" id="studioDropZone">
            <span class="files-drop-icon"></span>
            <span>Drop files here to upload to Google Drive</span>
        </div>
        <label class="btn btn-ghost" for="studioUploadInput" style="cursor:pointer">↑ Upload File</label>
        <input type="file" id="studioUploadInput" multiple style="display:none" aria-label="Upload files">
    </div>`;
    bindStudioUpload();
    renderStudioFilesList();
}

function renderStudioFilesList() {
    const el = document.getElementById('studioFilesList');
    if (!el) return;
    const data = getProjectData(currentProjectId);
    if (!data.files.length) {
        el.innerHTML = `<div class="empty-state" style="padding:24px 20px">
            <div class="empty-state-icon"></div>
            <div class="empty-state-text">No files uploaded yet.</div>
        </div>`;
        return;
    }
    el.innerHTML = data.files.map(f => {
        const ext  = (f.name.split('.').pop() || '').toLowerCase();
        const icon = FILE_ICONS[ext] || '';
        return `
        <div class="pdf-item">
            <span class="pdf-icon">${icon}</span>
            <div class="pdf-info">
                <div class="pdf-name">${esc(f.name)}</div>
                <div class="pdf-meta">${fmtFileSize(f.size)} · ${fmtNoteDate(f.uploadedAt)}</div>
            </div>
            <div class="pdf-actions">
                <button class="btn btn-ghost" style="font-size:12px;padding:5px 10px"
                    onclick="downloadStudioFile(${f.id})">↓ Download</button>
                <button class="btn btn-danger" onclick="deleteStudioFile(${f.id})" aria-label="Remove">✕</button>
            </div>
        </div>`;
    }).join('');
}

function downloadStudioFile(id) {
    const data = getProjectData(currentProjectId);
    const file = data.files.find(f => f.id === id);
    if (file && file.driveId) downloadDriveFile(file.driveId, file.name, null);
}

function deleteStudioFile(id) {
    const data = getProjectData(currentProjectId);
    data.files = data.files.filter(f => f.id !== id);
    saveProjectData(currentProjectId, data);
    renderStudioFilesList();
}

function bindStudioUpload() {
    const dropZone  = document.getElementById('studioDropZone');
    const fileInput = document.getElementById('studioUploadInput');
    if (!dropZone || !fileInput) return;

    dropZone.addEventListener('dragenter', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', e => {
        if (!dropZone.contains(e.relatedTarget)) dropZone.classList.remove('dragover');
    });
    dropZone.addEventListener('drop', e => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        const files = e.dataTransfer?.files;
        if (files?.length) handleStudioUpload(files);
    });
    fileInput.addEventListener('change', e => {
        if (e.target.files?.length) handleStudioUpload(e.target.files);
        e.target.value = '';
    });
}

async function handleStudioUpload(files) {
    if (!isDriveConnected() || !currentProjectId) return;
    const fileArray = Array.from(files).filter(f => f.size >= 0);
    if (!fileArray.length) return;
    const progressEl = document.getElementById('studioUploadProgress');
    if (!progressEl) return;
    const ts    = Date.now();
    const items = fileArray.map((file, i) => ({ file, uid: `stu-${ts}-${i}`, id: ts + i }));
    progressEl.innerHTML = `<div class="files-upload-block" style="margin-bottom:12px">
        ${items.map(item => `
        <div class="files-upload-item">
            <span class="files-upload-name" title="${esc(item.file.name)}">${esc(item.file.name)}</span>
            <div class="files-upload-bar-wrap"><div class="files-upload-bar" id="${item.uid}-bar" style="width:0%"></div></div>
            <span class="files-upload-status" id="${item.uid}-status">0%</span>
        </div>`).join('')}
    </div>`;
    try {
        const projId = await getProjectFolder(currentProjectId);
        await Promise.allSettled(items.map(async item => {
            const barEl    = document.getElementById(`${item.uid}-bar`);
            const statusEl = document.getElementById(`${item.uid}-status`);
            try {
                const result = await uploadFileToDrive(item.file, projId, pct => {
                    if (barEl)    barEl.style.width   = `${pct}%`;
                    if (statusEl) statusEl.textContent = `${pct}%`;
                });
                if (barEl)    barEl.style.width = '100%';
                if (statusEl) { statusEl.textContent = 'Done'; statusEl.className = 'files-upload-status done'; }
                const data = getProjectData(currentProjectId);
                data.files.unshift({
                    id:         item.id,
                    name:       item.file.name,
                    driveId:    result.id,
                    size:       item.file.size,
                    uploadedAt: new Date().toISOString(),
                });
                saveProjectData(currentProjectId, data);
                renderStudioFilesList();
            } catch {
                if (barEl)    { barEl.style.background = 'var(--red)'; barEl.style.width = '100%'; }
                if (statusEl) { statusEl.textContent = 'Failed'; statusEl.className = 'files-upload-status error'; }
            }
        }));
    } catch (err) { console.warn('[Drive] Studio upload failed:', err.message); }
    setTimeout(() => { if (progressEl) progressEl.innerHTML = ''; }, 2500);
}

// ── Timeline Deliverables ─────────────────────

function addStudioDeliverable() {
    const nameEl = document.getElementById('studioDeliverableName');
    const dateEl = document.getElementById('studioDeliverableDate');
    const name   = nameEl?.value.trim();
    if (!name || !currentProjectId) return;
    const data = getProjectData(currentProjectId);
    data.deliverables.push({ id: Date.now(), name, dueDate: dateEl?.value || '', completed: false });
    saveProjectData(currentProjectId, data);
    nameEl.value = '';
    if (dateEl) dateEl.value = '';
    renderStudioDeliverables();
    syncProjectDeliverablesToEvents(currentProjectId);
}

function toggleStudioDeliverable(id) {
    const data = getProjectData(currentProjectId);
    const del  = data.deliverables.find(d => d.id === id);
    if (!del) return;
    del.completed = !del.completed;
    saveProjectData(currentProjectId, data);
    renderStudioDeliverables();
    syncProjectDeliverablesToEvents(currentProjectId);
}

function deleteStudioDeliverable(id) {
    const data = getProjectData(currentProjectId);
    data.deliverables = data.deliverables.filter(d => d.id !== id);
    saveProjectData(currentProjectId, data);
    renderStudioDeliverables();
    syncProjectDeliverablesToEvents(currentProjectId);
}

function syncCanvasAssignmentsToEvents(assignments) {
    state.customEvents = state.customEvents.filter(e => e.source !== 'canvas');
    assignments.forEach(a => {
        if (!a.dueAt) return;
        state.customEvents.push({
            id:        a.id,
            name:      a.title,
            date:      a.dueAt.slice(0, 10),
            startTime: '',
            endTime:   '',
            category:  'architecture',
            source:    'canvas',
            course:    a.course,
        });
    });
    save('custom_events', state.customEvents);
    renderCalendar();
    renderSchedule();
}

function syncProjectDeliverablesToEvents(projectId) {
    const projectName = PROJECT_NAMES[projectId - 1];
    state.customEvents = state.customEvents.filter(
        e => !(e.source === 'project' && e.projectName === projectName)
    );
    const data = getProjectData(projectId);
    data.deliverables.forEach(d => {
        if (!d.dueDate) return;
        state.customEvents.push({
            id:          d.id,
            name:        d.name,
            date:        d.dueDate,
            startTime:   '',
            endTime:     '',
            category:    'architecture',
            source:      'project',
            projectName,
            completed:   d.completed,
        });
    });
    save('custom_events', state.customEvents);
    renderCalendar();
    renderSchedule();
}

function renderStudioDeliverables() {
    const el = document.getElementById('studioDeliverablesList');
    if (!el) return;
    const data = getProjectData(currentProjectId);
    if (!data.deliverables.length) {
        el.innerHTML = `<div class="empty-state" style="padding:28px 20px">
            <div class="empty-state-icon"></div>
            <div class="empty-state-text">No deliverables yet. Add one above.</div>
        </div>`;
        return;
    }
    const sorted = [...data.deliverables].sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate);
    });
    el.innerHTML = sorted.map(d => {
        const status  = d.dueDate ? assignmentStatus(d.dueDate + 'T23:59:59') : { label: 'No Date', cls: 'badge-upcoming' };
        const fmtDate = d.dueDate
            ? new Date(d.dueDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : '';
        return `
        <div class="todo-item${d.completed ? ' completed' : ''}">
            <div class="todo-checkbox${d.completed ? ' checked' : ''}"
                 onclick="toggleStudioDeliverable(${d.id})" role="checkbox"
                 aria-checked="${d.completed}" tabindex="0"
                 onkeydown="if(event.key==='Enter'||event.key===' ')toggleStudioDeliverable(${d.id})">
            </div>
            <span class="todo-text">${esc(d.name)}</span>
            ${fmtDate ? `<span class="badge ${esc(status.cls)}" style="flex-shrink:0">${fmtDate}</span>` : ''}
            <button class="btn btn-danger" onclick="deleteStudioDeliverable(${d.id})" aria-label="Delete">✕</button>
        </div>`;
    }).join('');
}

// ── Schedule ──────────────────────────────────

// Fall 2026 courses — each block renders once with rowspan to span its full duration
const COURSE_BLOCKS = [
    {
        code:         'ARCH 3100',
        title:        'Design Studio III',
        room:         'Arch 222',
        days:         ['Monday', 'Wednesday', 'Friday'],
        startTime:    '1:00 PM',
        displayStart: '1:15 PM',
        displayEnd:   '5:00 PM',
        slots:        4,
        color:        '#58a6ff',
        bg:           'rgba(88,166,255,0.10)',
    },
    {
        code:         'ARCH 3500',
        title:        'Architectural Theory I',
        room:         null,
        days:         ['Wednesday', 'Friday'],
        startTime:    '9:00 AM',
        displayStart: '9:00 AM',
        displayEnd:   '10:30 AM',
        slots:        2,
        color:        '#a371f7',
        bg:           'rgba(163,113,247,0.10)',
    },
    {
        code:         'ARCH 3800',
        title:        'Thermal Environmental Systems',
        room:         'Arch 114',
        days:         ['Tuesday', 'Thursday'],
        startTime:    '3:00 PM',
        displayStart: '3:00 PM',
        displayEnd:   '4:30 PM',
        slots:        2,
        color:        '#3fb950',
        bg:           'rgba(63,185,80,0.10)',
    },
    {
        code:         'ARCH 3930',
        title:        'Structural Systems I',
        room:         'Arch 114',
        days:         ['Tuesday'],
        startTime:    '6:00 PM',
        displayStart: '6:30 PM',
        displayEnd:   '9:30 PM',
        slots:        3,
        color:        '#d29922',
        bg:           'rgba(210,153,34,0.10)',
    },
    {
        code:         'GNST 0500',
        title:        'Chapel Convocation',
        room:         null,
        days:         ['Tuesday'],
        startTime:    '9:00 AM',
        displayStart: '9:00 AM',
        displayEnd:   '10:00 AM',
        slots:        1,
        color:        '#f0883e',
        bg:           'rgba(240,136,62,0.10)',
    },
];

const DAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const TIMES = [
    '7:00 AM','8:00 AM','9:00 AM','10:00 AM','11:00 AM',
    '12:00 PM','1:00 PM','2:00 PM','3:00 PM','4:00 PM',
    '5:00 PM','6:00 PM','7:00 PM','8:00 PM',
];

let scheduleWeekOffset = 0;  // 0 = current week, ±N = N weeks forward/back
let scheduleEditing    = false;
let pendingSlotKey     = null;

// Returns the Sunday that starts the week containing today, shifted by `offset` weeks.
// today.getDay() === 0 for Sunday, so subtracting it always lands on Sunday.
function getWeekSunday(offset) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const sun   = new Date(today);
    sun.setDate(today.getDate() - today.getDay() + offset * 7);
    return sun;
}

// Format a Date as "YYYY-MM-DD"
function toDateStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// ── Time utilities ─────────────────────────
// "9:00 AM" → "09:00"
function displayTimeToHM(t) {
    const m = t.match(/^(\d+):(\d+)\s*(AM|PM)$/i);
    if (!m) return '09:00';
    let h = +m[1], min = +m[2], p = m[3].toUpperCase();
    if (p === 'PM' && h !== 12) h += 12;
    if (p === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`;
}

// "09:00" → one hour later "10:00"
function addOneHourHM(hm) {
    const [h, m] = hm.split(':').map(Number);
    return `${String(Math.min(h + 1, 23)).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

// "09:30" → "9:30 AM"
function hmToDisplayTime(hm) {
    if (!hm) return '';
    const [h, m] = hm.split(':').map(Number);
    const p = h >= 12 ? 'PM' : 'AM';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:${String(m).padStart(2,'0')} ${p}`;
}

// "9:00 AM" → minutes since midnight (for slot lookup)
function displayTimeToMins(t) {
    const m = t.match(/^(\d+):(\d+)\s*(AM|PM)$/i);
    if (!m) return -1;
    let h = +m[1], min = +m[2], p = m[3].toUpperCase();
    if (p === 'PM' && h !== 12) h += 12;
    if (p === 'AM' && h === 12) h = 0;
    return h * 60 + min;
}

// "09:30" (HH:MM) → which TIMES[] index it belongs to
function findTimeSlotIdx(startHM) {
    if (!startHM) return -1;
    const [h, m] = startHM.split(':').map(Number);
    const eventMins = h * 60 + m;
    for (let i = 0; i < TIMES.length; i++) {
        const slotMins = displayTimeToMins(TIMES[i]);
        const nextMins = i + 1 < TIMES.length ? displayTimeToMins(TIMES[i + 1]) : slotMins + 60;
        if (eventMins >= slotMins && eventMins < nextMins) return i;
    }
    return -1;
}

// ── Custom Events (shared Schedule ↔ Calendar store) ──
function openCustomEventFromCell(dateStr, timeSlot) {
    const startHM  = displayTimeToHM(timeSlot);
    const d        = new Date(dateStr + 'T12:00:00');
    const dayLabel = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    document.getElementById('schedCustomEventDate').value      = dateStr;
    document.getElementById('schedCustomEventDateGroup').style.display = 'none';
    document.getElementById('schedCustomEventSubtitle').textContent    = `${dayLabel} · ${timeSlot}`;
    document.getElementById('schedCustomEventName').value  = '';
    document.getElementById('schedCustomStartTime').value  = startHM;
    document.getElementById('schedCustomEndTime').value    = addOneHourHM(startHM);
    openModal('schedCustomEventModal');
    setTimeout(() => document.getElementById('schedCustomEventName').focus(), 60);
}

function openAddScheduleEvent() {
    document.getElementById('schedCustomEventDate').value      = '';
    document.getElementById('schedCustomEventDateGroup').style.display = '';
    document.getElementById('schedCustomEventSubtitle').textContent    = '';
    document.getElementById('schedCustomEventName').value  = '';
    document.getElementById('schedCustomStartTime').value  = '';
    document.getElementById('schedCustomEndTime').value    = '';
    openModal('schedCustomEventModal');
    setTimeout(() => document.getElementById('schedCustomEventDate').focus(), 60);
}

function saveCustomEvent() {
    const name      = document.getElementById('schedCustomEventName').value.trim();
    const date      = document.getElementById('schedCustomEventDate').value;
    const startTime = document.getElementById('schedCustomStartTime').value;
    const endTime   = document.getElementById('schedCustomEndTime').value;
    if (!name || !date) return;
    state.customEvents.push({ id: Date.now(), name, date, startTime, endTime, category: 'personal' });
    save('custom_events', state.customEvents);
    closeModal('schedCustomEventModal');
    renderSchedule();
    renderCalendar();
}

function deleteCustomEvent(id) {
    state.customEvents = state.customEvents.filter(e => e.id !== id);
    save('custom_events', state.customEvents);
    renderSchedule();
    renderCalendar();
}

function deleteAnyEvent(id) {
    if (state.customEvents.some(e => e.id === id)) deleteCustomEvent(id);
    else deleteCalendarEvent(id);
}

function toggleScheduleEdit() {
    scheduleEditing = !scheduleEditing;
    const btn = document.getElementById('editScheduleBtn');
    btn.textContent  = scheduleEditing ? 'Done' : 'Edit';
    btn.className    = scheduleEditing ? 'btn btn-primary' : 'btn btn-ghost';
    renderSchedule();
}

function openScheduleSlot(key) {
    if (!scheduleEditing) return;
    pendingSlotKey = key;
    const [day, time] = key.split('|');
    const events = state.schedule[key] || [];
    document.getElementById('scheduleModalSubtitle').textContent =
        `${day} · ${time}`;
    document.getElementById('scheduleEventInput').value = events.join(', ');
    openModal('scheduleModal');
    setTimeout(() => document.getElementById('scheduleEventInput').focus(), 60);
}

function saveScheduleSlot() {
    if (!pendingSlotKey) return;
    const raw    = document.getElementById('scheduleEventInput').value.trim();
    const events = raw ? raw.split(',').map(s => s.trim()).filter(Boolean) : [];
    state.schedule[pendingSlotKey] = events;
    save('schedule', state.schedule);
    pendingSlotKey = null;
    closeModal('scheduleModal');
    renderSchedule();
}

function clearScheduleSlot() {
    if (!pendingSlotKey) return;
    // Store [] rather than deleting so the empty override survives a reload and won't re-merge the default
    state.schedule[pendingSlotKey] = [];
    save('schedule', state.schedule);
    pendingSlotKey = null;
    closeModal('scheduleModal');
    renderSchedule();
}

function renderSchedule() {
    const el = document.getElementById('scheduleGrid');
    if (!el) return;

    const editCls = scheduleEditing ? 'editable' : '';

    // ── Week dates (Sun–Sat) ────────────────────
    const sunday = getWeekSunday(scheduleWeekOffset);
    const weekDates = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(sunday);
        d.setDate(sunday.getDate() + i);
        return d;
    });

    // Update week-range label — "Sun, Sep 8 – Sat, Sep 14, 2026"
    const rangeEl = document.getElementById('scheduleWeekRange');
    if (rangeEl) {
        const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const fmt = (d, yr) =>
            `${DAY_FULL[d.getDay()].slice(0, 3)}, ${MON[d.getMonth()]} ${d.getDate()}` +
            (yr ? `, ${d.getFullYear()}` : '');
        rangeEl.textContent = `${fmt(weekDates[0], false)} – ${fmt(weekDates[6], true)}`;
    }

    // Dim "Today" button when already on the current week
    const todayBtn = document.getElementById('todayBtn');
    if (todayBtn) todayBtn.style.opacity = scheduleWeekOffset === 0 ? '0.35' : '1';

    // Today's date string for column highlighting
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const todayStr = toDateStr(now);

    // All calendar events used for day-header indicators
    const allCal = [...CBU_FALL_2026, ...state.calendarEvents, ...state.customEvents.map(e => ({ ...e, label: e.name }))];

    // ── Course-block coverage map ──────────────
    // Classes only render on dates within the semester (Classes Begin – Semester Closes),
    // so weeks before/after the term (e.g. August) show an empty schedule.
    const semesterStart = CBU_FALL_2026.find(e => e.id === 'cbu-classes-begin').date;
    const semesterEnd   = CBU_FALL_2026.find(e => e.id === 'cbu-closes').date;
    const timeIndex = {};
    TIMES.forEach((t, i) => { timeIndex[t] = i; });
    const coverage = Array.from({ length: DAY_FULL.length }, () => ({}));
    COURSE_BLOCKS.forEach(block => {
        const si = timeIndex[block.startTime];
        if (si === undefined) return;
        block.days.forEach(day => {
            const di = DAY_FULL.indexOf(day);
            if (di < 0) return;
            const cellDateStr = toDateStr(weekDates[di]);
            if (cellDateStr < semesterStart || cellDateStr > semesterEnd) return;
            for (let i = si; i < si + block.slots; i++) {
                coverage[di][i] = { block, isStart: i === si };
            }
        });
    });

    // ── Column headers with date + CBU indicators ──
    const headerCells = weekDates.map((date, di) => {
        const ds      = toDateStr(date);
        const isToday = ds === todayStr;
        const dateLabel = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

        // Find CBU / user calendar events that fall on this exact date (including range days)
        const dayEvents = allCal.filter(e => {
            if (e.date === ds) return true;
            if (e.endDate) return ds >= e.date && ds <= e.endDate;
            return false;
        });

        const badges = dayEvents.slice(0, 2).map(e => {
            const label = e.label.length > 20 ? e.label.slice(0, 18) + '…' : e.label;
            const done  = e.completed ? ' style="text-decoration:line-through;opacity:0.55"' : '';
            return `<div class="sched-day-badge cat-${esc(e.category)}"${done}>${esc(label)}</div>`;
        }).join('');

        return `<th class="${isToday ? 'sched-today-col' : ''}">
            <div class="sched-day-name">${DAY_FULL[di]}</div>
            <div class="sched-day-date">${dateLabel}</div>
            ${badges}
        </th>`;
    }).join('');

    // ── Table body ─────────────────────────────
    const tbody = TIMES.map((time, ti) => {
        const cells = weekDates.map((date, di) => {
            const info = coverage[di][ti];

            if (info && !info.isStart) return '';   // interior of a rowspan

            if (info && info.isStart) {
                const { block } = info;
                const meta = [`${block.displayStart}–${block.displayEnd}`, block.room]
                    .filter(Boolean).join(' · ');
                return `<td rowspan="${block.slots}" style="background:${block.bg};border-left:3px solid ${block.color};vertical-align:top;padding:10px 10px 8px;">
                    <div style="color:${block.color};font-size:11.5px;font-weight:700;letter-spacing:0.02em;line-height:1">${esc(block.code)}</div>
                    <div style="color:var(--text-1);font-size:12px;margin-top:4px;line-height:1.3">${esc(block.title)}</div>
                    <div style="color:var(--text-2);font-size:10.5px;margin-top:5px">${esc(meta)}</div>
                </td>`;
            }

            // Empty slot — weekly text events (edit mode) + date-specific custom events
            const key = `${DAY_FULL[di]}|${time}`;
            const events = (state.schedule[key] || []).filter(Boolean);
            const cellDateStr = toDateStr(date);
            const cellCustom  = state.customEvents.filter(e => e.date === cellDateStr && findTimeSlotIdx(e.startTime) === ti);

            const evHtml = events.map(e =>
                `<div class="schedule-event ${editCls}"
                      ${scheduleEditing ? `onclick="event.stopPropagation();openScheduleSlot('${key}')"` : ''}
                 >${esc(e)}</div>`
            ).join('');

            const customHtml = cellCustom.map(e => {
                const timeRange = e.startTime && e.endTime
                    ? `${hmToDisplayTime(e.startTime)}–${hmToDisplayTime(e.endTime)}`
                    : e.startTime ? hmToDisplayTime(e.startTime) : '';
                return `<div class="sched-custom-event" onclick="event.stopPropagation()">
                    <div class="sched-custom-event-name">${esc(e.name)}</div>
                    ${timeRange ? `<div class="sched-custom-event-time">${timeRange}</div>` : ''}
                    <button class="sched-custom-event-del" onclick="event.stopPropagation();deleteCustomEvent(${e.id})" aria-label="Delete event">✕</button>
                </div>`;
            }).join('');

            if (scheduleEditing) {
                return `<td class="editable" onclick="openScheduleSlot('${key}')">${evHtml}${customHtml}</td>`;
            }
            return `<td class="sched-clickable" onclick="openCustomEventFromCell('${cellDateStr}','${time}')">${evHtml}${customHtml}</td>`;
        }).join('');
        return `<tr><td>${time}</td>${cells}</tr>`;
    }).join('');

    el.innerHTML = `
        <div class="schedule-wrapper">
            <table class="schedule-table">
                <thead><tr><th style="min-width:72px">Time</th>${headerCells}</tr></thead>
                <tbody>${tbody}</tbody>
            </table>
        </div>`;
}

// ── Notes ─────────────────────────────────────
function addNote() {
    const note = {
        id:        Date.now(),
        title:     '',
        content:   '',
        updatedAt: new Date().toISOString(),
    };
    state.notes.unshift(note);
    save('notes', state.notes);
    renderNotes();
    setTimeout(() => {
        const input = document.querySelector(`[data-note-id="${note.id}"] .note-title`);
        if (input) input.focus();
    }, 40);
}

function updateNote(id, field, value) {
    const note = state.notes.find(n => n.id === id);
    if (!note) return;
    note[field]    = value;
    note.updatedAt = new Date().toISOString();
    save('notes', state.notes);
    const dateEl = document.querySelector(`[data-note-id="${id}"] .note-date`);
    if (dateEl) dateEl.textContent = fmtNoteDate(note.updatedAt);
}

function deleteNote(id) {
    if (!confirm('Delete this note?')) return;
    state.notes = state.notes.filter(n => n.id !== id);
    save('notes', state.notes);
    renderNotes();
}

function fmtNoteDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        + ' · '
        + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function renderNotes() {
    const el = document.getElementById('notesGrid');
    if (!el) return;

    if (!state.notes.length) {
        el.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
            <div class="empty-state-icon"></div>
            <div class="empty-state-text">No notes yet. Click "+ New Note" to create one.</div>
        </div>`;
        return;
    }

    el.innerHTML = state.notes.map(n => `
        <div class="note-card" data-note-id="${n.id}">
            <input
                class="note-title"
                placeholder="Untitled"
                value="${esc(n.title)}"
                oninput="updateNote(${n.id}, 'title', this.value)"
                aria-label="Note title"
            />
            <div class="note-divider"></div>
            <textarea
                class="note-content"
                placeholder="Write your notes here…"
                oninput="updateNote(${n.id}, 'content', this.value)"
                aria-label="Note content"
            >${esc(n.content)}</textarea>
            <div class="note-footer">
                <span class="note-date">${fmtNoteDate(n.updatedAt)}</span>
                <button class="btn btn-danger" onclick="deleteNote(${n.id})">Delete</button>
            </div>
        </div>`
    ).join('');
}

// ── Thesis ────────────────────────────────────

// ── Thesis PDFs ───────────────────────────────

let _thesisPdfFolderId = null;

async function getThesisPdfFolder() {
    if (_thesisPdfFolderId) return _thesisPdfFolderId;
    const cbuId    = await getCBUFolder();
    const thesisId = await getOrCreateSubfolder(cbuId, 'Thesis');
    _thesisPdfFolderId = await getOrCreateSubfolder(thesisId, 'PDFs');
    return _thesisPdfFolderId;
}

// Thesis sub-tab switcher
function switchThesisTab(tabId) {
    document.querySelectorAll('.thesis-tab-btn').forEach(btn => {
        const active = btn.dataset.tab === tabId;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-selected', active);
    });
    document.querySelectorAll('.thesis-panel').forEach(p => {
        p.classList.toggle('active', p.id === tabId);
    });
}

// Thesis Notes
function addThesisNote() {
    const note = { id: Date.now(), title: '', content: '', updatedAt: new Date().toISOString() };
    state.thesis.notes.unshift(note);
    save('thesis_notes', state.thesis.notes);
    renderThesisNotes();
    setTimeout(() => {
        document.querySelector(`[data-thesis-note-id="${note.id}"] .note-title`)?.focus();
    }, 40);
}

function updateThesisNote(id, field, value) {
    const note = state.thesis.notes.find(n => n.id === id);
    if (!note) return;
    note[field]    = value;
    note.updatedAt = new Date().toISOString();
    save('thesis_notes', state.thesis.notes);
    const dateEl = document.querySelector(`[data-thesis-note-id="${id}"] .note-date`);
    if (dateEl) dateEl.textContent = fmtNoteDate(note.updatedAt);
}

function deleteThesisNote(id) {
    if (!confirm('Delete this note?')) return;
    state.thesis.notes = state.thesis.notes.filter(n => n.id !== id);
    save('thesis_notes', state.thesis.notes);
    renderThesisNotes();
}

function renderThesisNotes() {
    const el = document.getElementById('thesisNotesGrid');
    if (!el) return;
    if (!state.thesis.notes.length) {
        el.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
            <div class="empty-state-icon"></div>
            <div class="empty-state-text">No thesis notes yet. Click "+ New Note" to create one.</div>
        </div>`;
        return;
    }
    el.innerHTML = state.thesis.notes.map(n => `
        <div class="note-card" data-thesis-note-id="${n.id}">
            <input class="note-title" placeholder="Untitled" value="${esc(n.title)}"
                oninput="updateThesisNote(${n.id}, 'title', this.value)" aria-label="Note title"/>
            <div class="note-divider"></div>
            <textarea class="note-content" placeholder="Write your thesis notes here…"
                oninput="updateThesisNote(${n.id}, 'content', this.value)"
                aria-label="Note content">${esc(n.content)}</textarea>
            <div class="note-footer">
                <span class="note-date">${fmtNoteDate(n.updatedAt)}</span>
                <button class="btn btn-danger" onclick="deleteThesisNote(${n.id})">Delete</button>
            </div>
        </div>`
    ).join('');
}

// Thesis Links
function addThesisLink() {
    const label = document.getElementById('thesisLinkLabel').value.trim();
    let   url   = document.getElementById('thesisLinkUrl').value.trim();
    if (!label || !url) return;
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    state.thesis.links.unshift({ id: Date.now(), label, url, addedAt: new Date().toISOString() });
    save('thesis_links', state.thesis.links);
    closeModal('thesisLinkModal');
    document.getElementById('thesisLinkLabel').value = '';
    document.getElementById('thesisLinkUrl').value   = '';
    renderThesisLinks();
}

function deleteThesisLink(id) {
    state.thesis.links = state.thesis.links.filter(l => l.id !== id);
    save('thesis_links', state.thesis.links);
    renderThesisLinks();
}

function renderThesisLinks() {
    const el = document.getElementById('thesisLinksList');
    if (!el) return;
    if (!state.thesis.links.length) {
        el.innerHTML = `<div class="empty-state">
            <div class="empty-state-icon"></div>
            <div class="empty-state-text">No links yet. Click "+ Add Link" to save a research URL.</div>
        </div>`;
        return;
    }
    el.innerHTML = state.thesis.links.map(l => `
        <div class="link-item">
            <span class="link-icon"></span>
            <div class="link-info">
                <div class="link-label">${esc(l.label)}</div>
                <div class="link-url">${esc(l.url)}</div>
            </div>
            <a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer"
               class="btn btn-ghost" style="font-size:12px;padding:5px 10px">Open ↗</a>
            <button class="btn btn-danger" onclick="deleteThesisLink(${l.id})" aria-label="Remove link">✕</button>
        </div>`
    ).join('');
}

function fmtFileSize(bytes) {
    if (bytes < 1024)    return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
}

async function handleThesisPdfUpload(files) {
    if (!isDriveConnected()) return;
    const fileArray = Array.from(files).filter(f => f.type === 'application/pdf' && f.size > 0);
    if (!fileArray.length) return;
    const progressEl = document.getElementById('thesisPdfProgress');
    if (!progressEl) return;
    const ts    = Date.now();
    const items = fileArray.map((file, i) => ({ file, uid: `pdf-${ts}-${i}`, id: ts + i }));
    progressEl.innerHTML = `<div class="files-upload-block" style="margin-bottom:12px">
        ${items.map(item => `
        <div class="files-upload-item">
            <span class="files-upload-name" title="${esc(item.file.name)}">${esc(item.file.name)}</span>
            <div class="files-upload-bar-wrap"><div class="files-upload-bar" id="${item.uid}-bar" style="width:0%"></div></div>
            <span class="files-upload-status" id="${item.uid}-status">0%</span>
        </div>`).join('')}
    </div>`;
    try {
        const folderId = await getThesisPdfFolder();
        await Promise.allSettled(items.map(async item => {
            const barEl    = document.getElementById(`${item.uid}-bar`);
            const statusEl = document.getElementById(`${item.uid}-status`);
            try {
                const result = await uploadFileToDrive(item.file, folderId, pct => {
                    if (barEl)    barEl.style.width   = `${pct}%`;
                    if (statusEl) statusEl.textContent = `${pct}%`;
                });
                if (barEl)    barEl.style.width = '100%';
                if (statusEl) { statusEl.textContent = 'Done'; statusEl.className = 'files-upload-status done'; }
                state.thesis.pdfs.unshift({ id: item.id, name: item.file.name, size: item.file.size, driveId: result.id, addedAt: new Date().toISOString() });
                save('thesis_pdfs', state.thesis.pdfs);
                renderThesisPdfs();
            } catch {
                if (barEl)    { barEl.style.background = 'var(--red)'; barEl.style.width = '100%'; }
                if (statusEl) { statusEl.textContent = 'Failed'; statusEl.className = 'files-upload-status error'; }
            }
        }));
    } catch (err) { console.warn('[Drive] PDF upload failed:', err.message); }
    setTimeout(() => { if (progressEl) progressEl.innerHTML = ''; }, 2500);
}

function openThesisPdf(id) {
    const meta = state.thesis.pdfs.find(p => p.id === id);
    if (meta?.driveId) window.open(`https://drive.google.com/file/d/${meta.driveId}/view`, '_blank', 'noopener');
}

function downloadThesisPdf(id) {
    const meta = state.thesis.pdfs.find(p => p.id === id);
    if (meta?.driveId) downloadDriveFile(meta.driveId, meta.name, null);
}

async function deleteThesisPdf(id) {
    if (!confirm('Remove this PDF from the library?')) return;
    const meta = state.thesis.pdfs.find(p => p.id === id);
    state.thesis.pdfs = state.thesis.pdfs.filter(p => p.id !== id);
    save('thesis_pdfs', state.thesis.pdfs);
    renderThesisPdfs();
    if (meta?.driveId) driveReq(`https://www.googleapis.com/drive/v3/files/${meta.driveId}`, { method: 'DELETE' }).catch(() => {});
}

function renderThesisPdfs() {
    const el = document.getElementById('thesisPdfsList');
    if (!el) return;
    if (!state.thesis.pdfs.length) {
        el.innerHTML = `<div class="empty-state">
            <div class="empty-state-icon"></div>
            <div class="empty-state-text">No PDFs yet. Drop a file above or click "+ Upload PDF".</div>
        </div>`;
        return;
    }
    el.innerHTML = state.thesis.pdfs.map(p => `
        <div class="pdf-item">
            <span class="pdf-icon"></span>
            <div class="pdf-info">
                <div class="pdf-name">${esc(p.name)}</div>
                <div class="pdf-meta">${p.size ? fmtFileSize(p.size) + ' · ' : ''}Added ${fmtNoteDate(p.addedAt)}</div>
            </div>
            <div class="pdf-actions" style="flex-wrap:wrap;gap:5px">
                <button class="btn btn-ghost" style="font-size:12px;padding:5px 10px"
                    onclick="openPdfInClaude(${p.id})">Ask Claude →</button>
                <button class="btn btn-ghost" style="font-size:12px;padding:5px 10px"
                    onclick="initSummarizePdf(${p.id})">Summarize</button>
                <button class="btn btn-ghost" style="font-size:12px;padding:5px 10px"
                    onclick="openThesisPdf(${p.id})">Open</button>
                <button class="btn btn-ghost" style="font-size:12px;padding:5px 10px"
                    onclick="downloadThesisPdf(${p.id})">↓ Save</button>
                <button class="btn btn-danger" onclick="deleteThesisPdf(${p.id})" aria-label="Remove PDF">✕</button>
            </div>
        </div>`
    ).join('');
}

function bindThesisPdfUpload() {
    const drop  = document.getElementById('thesisPdfDrop');
    const input = document.getElementById('pdfUploadInput');
    if (!drop || !input) return;
    drop.addEventListener('dragenter', e => { e.preventDefault(); drop.classList.add('dragover'); });
    drop.addEventListener('dragover',  e => { e.preventDefault(); drop.classList.add('dragover'); });
    drop.addEventListener('dragleave', e => {
        if (!drop.contains(e.relatedTarget)) drop.classList.remove('dragover');
    });
    drop.addEventListener('drop', e => {
        e.preventDefault();
        drop.classList.remove('dragover');
        if (e.dataTransfer?.files?.length) handleThesisPdfUpload(e.dataTransfer.files);
    });
    input.addEventListener('change', e => {
        if (e.target.files?.length) handleThesisPdfUpload(e.target.files);
        e.target.value = '';
    });
}

// ── Calendar ──────────────────────────────────

const CBU_FALL_2026 = [
    // Milestones — blue
    { id: 'cbu-classes-begin', date: '2026-09-08',                        label: 'Classes Begin',                  category: 'milestone', builtin: true },
    { id: 'cbu-resume',        date: '2026-12-01',                        label: 'Classes Resume',                 category: 'milestone', builtin: true },
    { id: 'cbu-closes',        date: '2026-12-18',                        label: 'Semester Closes',                category: 'milestone', builtin: true },
    // Deadlines — amber
    { id: 'cbu-add-deadline',  date: '2026-09-15',                        label: 'Last Day to Add a Class',        category: 'deadline',  builtin: true },
    { id: 'cbu-drop-deadline', date: '2026-09-22',                        label: 'Last Day to Drop with Refund',   category: 'deadline',  builtin: true },
    { id: 'cbu-withdraw',      date: '2026-11-09',                        label: 'Last Day to Withdraw (W grade)', category: 'deadline',  builtin: true },
    { id: 'cbu-finals',        date: '2026-12-07', endDate: '2026-12-11', label: 'Final Examinations',             category: 'deadline',  builtin: true },
    // Holidays — red
    { id: 'cbu-labor-day',     date: '2026-09-07',                        label: 'Labor Day (No Classes)',         category: 'holiday',   builtin: true },
    { id: 'cbu-thanksgiving',  date: '2026-11-25', endDate: '2026-11-27', label: 'Thanksgiving Break (No Classes)',category: 'holiday',   builtin: true },
];

const CAL_CAT_LABELS = {
    milestone:    'Milestone',
    holiday:      'Holiday',
    deadline:     'Deadline',
    architecture: 'Architecture',
    personal:     'Personal',
};

function formatCalDate(dateStr, endDateStr) {
    const start = new Date(dateStr + 'T12:00:00');
    const opts  = { month: 'short', day: 'numeric' };
    if (!endDateStr) return start.toLocaleDateString('en-US', opts);
    const end = new Date(endDateStr + 'T12:00:00');
    if (start.getMonth() === end.getMonth()) {
        return `${start.toLocaleDateString('en-US', opts)} – ${end.getDate()}`;
    }
    return `${start.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', opts)}`;
}

function calDaysUntil(dateStr, endDateStr) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const start = new Date(dateStr + 'T00:00:00');
    const end   = endDateStr ? new Date(endDateStr + 'T00:00:00') : start;
    if (today >= start && today <= end) return { text: 'Ongoing',         cls: 'countdown-today' };
    const diff = Math.round((start - today) / 86400000);
    if (diff > 0) {
        if (diff === 1)  return { text: 'Tomorrow',      cls: 'countdown-soon' };
        if (diff <= 14)  return { text: `In ${diff}d`,   cls: 'countdown-soon' };
        return                  { text: `In ${diff}d`,   cls: 'countdown-upcoming' };
    }
    const ago = Math.round((today - end) / 86400000);
    return { text: `${ago}d ago`, cls: 'countdown-past' };
}

function groupCalByMonth(events) {
    const groups = new Map();
    const sorted = [...events].sort((a, b) => {
        const cmp = a.date.localeCompare(b.date);
        if (cmp !== 0) return cmp;
        return (a.builtin ? 0 : 1) - (b.builtin ? 0 : 1);
    });
    sorted.forEach(e => {
        const d   = new Date(e.date + 'T12:00:00');
        const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
        if (!groups.has(key)) {
            groups.set(key, {
                label:  d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
                events: [],
            });
        }
        groups.get(key).events.push(e);
    });
    return [...groups.values()];
}

function renderCalendar() {
    const el = document.getElementById('calendarList');
    if (!el) return;

    const all    = [
        ...CBU_FALL_2026,
        ...state.calendarEvents,
        ...state.customEvents.map(e => ({ ...e, label: e.name })),
    ];
    const groups = groupCalByMonth(all);

    // "Next upcoming" banner
    const today  = new Date(); today.setHours(0, 0, 0, 0);
    const next   = all
        .filter(e => new Date(e.date + 'T00:00:00') >= today)
        .sort((a, b) => a.date.localeCompare(b.date))[0];
    const banner = document.getElementById('calNextBanner');
    if (banner) {
        if (next) {
            const { text } = calDaysUntil(next.date, next.endDate);
            banner.innerHTML =
                `<span class="cal-next-label">Next:</span> ${esc(next.label)} <span class="cal-next-when">${text}</span>`;
            banner.style.display = 'flex';
        } else {
            banner.style.display = 'none';
        }
    }

    if (!groups.length) {
        el.innerHTML = `<div class="empty-state">
            <div class="empty-state-icon"></div>
            <div class="empty-state-text">No events on the calendar.</div>
        </div>`;
        renderCalGrid();
        return;
    }

    el.innerHTML = groups.map(g => `
        <div class="cal-group">
            <div class="cal-month-header">${g.label}</div>
            ${g.events.map(e => {
                const cd     = calDaysUntil(e.date, e.endDate);
                const isPast = cd.cls === 'countdown-past';
                const cat    = esc(e.category);
                return `
                <div class="cal-event-row${isPast ? ' cal-past' : ''}">
                    <span class="cal-date">${formatCalDate(e.date, e.endDate)}</span>
                    <span class="cal-dot dot-${cat}"></span>
                    <span class="cal-label"${e.completed ? ' style="text-decoration:line-through;opacity:0.55"' : ''}>${esc(e.label)}</span>
                    <span class="cal-cat-badge cat-${cat}">${esc(CAL_CAT_LABELS[e.category] || e.category)}</span>
                    <span class="cal-countdown ${cd.cls}">${cd.text}</span>
                    ${!e.builtin && e.source !== 'project' && e.source !== 'canvas'
                        ? `<button class="btn btn-danger" onclick="deleteAnyEvent(${e.id})" aria-label="Delete event">✕</button>`
                        : `<span style="width:32px;flex-shrink:0"></span>`}
                </div>`;
            }).join('')}
        </div>`
    ).join('');

    renderCalGrid();
}

function addCalendarEvent() {
    const label    = document.getElementById('calEventLabel').value.trim();
    const date     = document.getElementById('calEventDate').value;
    const endDate  = document.getElementById('calEventEndDate').value || null;
    const category = document.getElementById('calEventCategory').value;
    if (!label || !date) return;
    if (endDate && endDate < date) {
        alert('End date must be on or after the start date.');
        return;
    }
    state.calendarEvents.push({ id: Date.now(), label, date, endDate, category, builtin: false });
    save('calendarEvents', state.calendarEvents);
    closeModal('calEventModal');
    document.getElementById('calEventLabel').value    = '';
    document.getElementById('calEventDate').value     = '';
    document.getElementById('calEventEndDate').value  = '';
    document.getElementById('calEventCategory').value = 'personal';
    renderCalendar();
    renderSchedule();
}

function deleteCalendarEvent(id) {
    state.calendarEvents = state.calendarEvents.filter(e => e.id !== id);
    save('calendarEvents', state.calendarEvents);
    renderCalendar();
    renderSchedule();
}

// ── Calendar Grid ─────────────────────────────

const CAL_GRID_MONTHS = [
    { year: 2026, month: 8  },  // September
    { year: 2026, month: 9  },  // October
    { year: 2026, month: 10 },  // November
    { year: 2026, month: 11 },  // December
];

const DOW_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// Build a map from dateStr → [events] expanding multi-day ranges
function buildDayEventMap() {
    const all = [
        ...CBU_FALL_2026,
        ...state.calendarEvents,
        ...state.customEvents.map(e => ({ ...e, label: e.name })),
    ];
    const map = {};
    all.forEach(e => {
        const add = ds => { (map[ds] = map[ds] || []).push(e); };
        add(e.date);
        if (e.endDate) {
            const cur = new Date(e.date + 'T12:00:00');
            const end = new Date(e.endDate + 'T12:00:00');
            cur.setDate(cur.getDate() + 1);
            while (cur <= end) {
                add(cur.toISOString().slice(0, 10));
                cur.setDate(cur.getDate() + 1);
            }
        }
    });
    return map;
}

function renderCalGrid() {
    const el = document.getElementById('calGridContainer');
    if (!el) return;

    const dayMap   = buildDayEventMap();
    const now      = new Date(); now.setHours(0, 0, 0, 0);
    const todayStr = now.toISOString().slice(0, 10);

    el.innerHTML = CAL_GRID_MONTHS.map(({ year, month }) => {
        const monthLabel     = new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        const firstDayOfWeek = new Date(year, month, 1).getDay();
        const daysInMonth    = new Date(year, month + 1, 0).getDate();

        const cells = [];

        // Blank cells before the 1st
        for (let i = 0; i < firstDayOfWeek; i++) {
            cells.push('<div class="cal-day cal-day-empty"></div>');
        }

        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const events  = dayMap[dateStr] || [];
            const isToday = dateStr === todayStr;

            // Up to 3 deduplicated category dots
            const seen = new Set();
            const dots = events
                .filter(e => !seen.has(e.category) && seen.add(e.category))
                .slice(0, 3)
                .map(e => `<div class="cal-day-dot dot-${esc(e.category)}"></div>`)
                .join('');

            const title = events.length
                ? ` title="${esc(events.map(e => e.label).join(' · '))}"`
                : '';

            cells.push(
                `<div class="cal-day${isToday ? ' cal-day-today' : ''}${events.length ? ' cal-day-has-event' : ''}"` +
                ` onclick="gridDayClick('${dateStr}')"${title}>` +
                `<div class="cal-day-num">${d}</div>` +
                (dots ? `<div class="cal-day-dots">${dots}</div>` : '') +
                `</div>`
            );
        }

        return `<div class="cal-month-card">` +
            `<div class="cal-month-card-title">${monthLabel}</div>` +
            `<div class="cal-grid-dow">${DOW_LABELS.map(l => `<span>${l}</span>`).join('')}</div>` +
            `<div class="cal-grid-days">${cells.join('')}</div>` +
            `</div>`;
    }).join('');
}

function gridDayClick(dateStr) {
    document.getElementById('calEventLabel').value    = '';
    document.getElementById('calEventDate').value     = dateStr;
    document.getElementById('calEventEndDate').value  = '';
    document.getElementById('calEventCategory').value = 'personal';
    openModal('calEventModal');
    setTimeout(() => document.getElementById('calEventLabel').focus(), 60);
}

// ── Files & Google Drive ──────────────────────

let filesPathStack    = [{ id: null, label: 'CBU Dashboard' }];
let _cbuFolderId      = null;
let _projectsFolderId = null;
const _projectFolderIds = {};   // projectId → Drive folder ID
let _filesEntries     = [];

function getAnthropicKey() { try { return localStorage.getItem('cbu_anthropicKey') || ''; } catch { return ''; } }

async function getCBUFolder() {
    if (_cbuFolderId) return _cbuFolderId;
    const q   = encodeURIComponent("name='CBU Dashboard' and mimeType='application/vnd.google-apps.folder' and trashed=false");
    const res = await driveReq(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&spaces=drive`);
    if (!res.ok) throw new Error('Drive folder search failed');
    const { files } = await res.json();
    if (files.length) { _cbuFolderId = files[0].id; return _cbuFolderId; }
    const cr = await driveReq('https://www.googleapis.com/drive/v3/files', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: 'CBU Dashboard', mimeType: 'application/vnd.google-apps.folder' }),
    });
    if (!cr.ok) throw new Error('Could not create CBU Dashboard folder');
    _cbuFolderId = (await cr.json()).id;
    return _cbuFolderId;
}

async function getOrCreateSubfolder(parentId, name) {
    const q   = encodeURIComponent(`name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
    const res = await driveReq(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&spaces=drive`);
    if (res.ok) { const { files } = await res.json(); if (files.length) return files[0].id; }
    const cr = await driveReq('https://www.googleapis.com/drive/v3/files', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
    });
    return (await cr.json()).id;
}

async function getProjectsFolder() {
    if (_projectsFolderId) return _projectsFolderId;
    const cbuId = await getCBUFolder();
    _projectsFolderId = await getOrCreateSubfolder(cbuId, 'Projects');
    return _projectsFolderId;
}

async function getProjectFolder(projectId) {
    if (_projectFolderIds[projectId]) return _projectFolderIds[projectId];
    const projectsId = await getProjectsFolder();
    _projectFolderIds[projectId] = await getOrCreateSubfolder(projectsId, `Project ${projectId}`);
    return _projectFolderIds[projectId];
}

const FILE_ICONS = {
    jpg:'', jpeg:'', png:'', gif:'', webp:'', svg:'', heic:'',
    pdf:'',
    doc:'', docx:'', txt:'', rtf:'', md:'',
    xls:'', xlsx:'', csv:'', numbers:'',
    ppt:'', pptx:'', key:'',
    ai:'', psd:'', indd:'', sketch:'', fig:'', xd:'',
    dwg:'', dxf:'', rvt:'',
    mp4:'', mov:'', avi:'', mkv:'',
    mp3:'', wav:'', aac:'',
    zip:'', rar:'', '7z':'',
};

function fileExtIcon(name) {
    const ext = (name.split('.').pop() || '').toLowerCase();
    return FILE_ICONS[ext] || '';
}

function isDriveFolder(f) { return f.mimeType === 'application/vnd.google-apps.folder'; }

// ── Render entry point ─────────────────────────

async function renderFiles() {
    const noToken    = document.getElementById('filesNoToken');
    const browser    = document.getElementById('filesBrowser');
    const refreshBtn = document.getElementById('filesRefreshBtn');
    if (!isDriveConnected()) {
        if (noToken)    noToken.style.display    = 'block';
        if (browser)    browser.style.display    = 'none';
        if (refreshBtn) refreshBtn.style.display = 'none';
        return;
    }
    if (noToken)    noToken.style.display    = 'none';
    if (browser)    browser.style.display    = 'block';
    if (refreshBtn) refreshBtn.style.display = '';
    try {
        const folderId = await getCBUFolder();
        filesPathStack = [{ id: folderId, label: 'CBU Dashboard' }];
        await loadFilesFolder(folderId);
    } catch (err) {
        const grid = document.getElementById('filesGrid');
        if (grid) grid.innerHTML = `<div class="empty-state"><div class="empty-state-text">${esc(err.message)}</div></div>`;
    }
}

// ── Folder loading ─────────────────────────────

async function loadFilesFolder(folderId) {
    const grid = document.getElementById('filesGrid');
    if (!grid) return;
    grid.innerHTML = `<div class="files-loading"><div class="files-loading-dots"><span></span><span></span><span></span></div>Loading…</div>`;
    updateFilesBreadcrumb();
    try {
        const q   = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
        const res = await driveReq(
            `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,size,modifiedTime,thumbnailLink)&orderBy=folder,name&pageSize=100&spaces=drive`
        );
        if (!res.ok) throw new Error('Drive list failed: ' + res.status);
        const { files } = await res.json();
        renderFilesGrid(files || []);
    } catch (err) {
        grid.innerHTML = `<div class="empty-state"><div class="empty-state-icon">!</div><div class="empty-state-text">${esc(err.message)}</div></div>`;
    }
}

// ── Grid rendering ─────────────────────────────

function renderFilesGrid(files) {
    const grid = document.getElementById('filesGrid');
    if (!grid) return;
    if (!files.length) {
        grid.innerHTML = `<div class="empty-state"><div class="empty-state-icon"></div><div class="empty-state-text">This folder is empty.</div></div>`;
        return;
    }
    _filesEntries = files;
    grid.innerHTML = files.map((f, idx) => {
        const isFolder = isDriveFolder(f);
        const modified = f.modifiedTime
            ? new Date(f.modifiedTime).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })
            : '';
        const size   = f.size ? fmtFileSize(parseInt(f.size)) : '';
        const meta   = [modified, size].filter(Boolean).join(' · ');
        const footer = isFolder
            ? `<div class="files-card-meta">${meta}</div>`
            : `<div class="files-card-footer">
                   <span class="files-card-meta">${meta}</span>
                   <button class="files-dl-btn" data-dl-idx="${idx}" title="Download ${esc(f.name)}" aria-label="Download">↓</button>
               </div>`;
        const preview = f.thumbnailLink
            ? `<img src="${f.thumbnailLink}" alt="" class="files-card-thumb" onerror="this.parentNode.textContent='${isFolder ? '' : fileExtIcon(f.name)}'">`
            : (isFolder ? '' : fileExtIcon(f.name));
        return `
        <div class="files-card" data-idx="${idx}" data-id="${esc(f.id)}" data-name="${esc(f.name)}"
             data-folder="${isFolder ? '1' : ''}" data-mime="${esc(f.mimeType)}" title="${esc(f.name)}">
            <div class="files-card-preview">${preview}</div>
            <div class="files-card-info">
                <div class="files-card-name">${esc(f.name)}</div>
                ${footer}
            </div>
        </div>`;
    }).join('');
    grid.onclick = filesGridClick;
}

function filesGridClick(e) {
    const dlBtn = e.target.closest('.files-dl-btn');
    if (dlBtn) {
        const f = _filesEntries[+dlBtn.dataset.dlIdx];
        if (f) downloadDriveFile(f.id, f.name, dlBtn);
        return;
    }
    const card = e.target.closest('.files-card');
    if (!card) return;
    if (card.dataset.folder) {
        filesPathStack.push({ id: card.dataset.id, label: card.dataset.name });
        loadFilesFolder(card.dataset.id);
    } else {
        openDriveFile(card.dataset.id, card.dataset.name, card.dataset.mime);
    }
}

// ── Breadcrumb ────────────────────────────────

function updateFilesBreadcrumb() {
    const el = document.getElementById('filesBreadcrumb');
    if (!el) return;
    el.innerHTML = filesPathStack.map((bc, i) => {
        const isLast = i === filesPathStack.length - 1;
        const label  = esc(bc.label);
        if (isLast) return `<span class="files-bc-item files-bc-current">${label}</span>`;
        return `<span class="files-bc-item files-bc-link" data-bc-idx="${i}">${label}</span>`
             + `<span class="files-bc-sep">›</span>`;
    }).join('');
    el.onclick = null;
    el.addEventListener('click', e => {
        const item = e.target.closest('.files-bc-link');
        if (!item) return;
        const idx = +item.dataset.bcIdx;
        filesPathStack = filesPathStack.slice(0, idx + 1);
        loadFilesFolder(filesPathStack[idx].id);
    }, { once: true });
}

// ── Open / Download ────────────────────────────

function openDriveFile(fileId, name, mimeType) {
    const isGoogleDoc = mimeType && mimeType.startsWith('application/vnd.google-apps.');
    const url = isGoogleDoc
        ? `https://drive.google.com/file/d/${fileId}/edit`
        : `https://drive.google.com/file/d/${fileId}/view`;
    window.open(url, '_blank', 'noopener');
}

async function downloadDriveFile(fileId, name, btn) {
    const origLabel = btn?.textContent;
    const grid      = document.getElementById('filesGrid');
    const showErr   = msg => {
        if (!grid) return;
        const t = document.createElement('div');
        t.className = 'files-error-toast';
        t.textContent = `Could not download "${name}": ${msg}`;
        grid.prepend(t);
        setTimeout(() => t.remove(), 6000);
    };
    try {
        if (btn) { btn.textContent = '…'; btn.disabled = true; }
        const res = await driveReq(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const blob = await res.blob();
        const url  = URL.createObjectURL(blob);
        const a    = Object.assign(document.createElement('a'), { href: url, download: name });
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) { showErr(err.message); }
    finally { if (btn) { btn.textContent = origLabel; btn.disabled = false; } }
}

// ── Upload ─────────────────────────────────────

function uploadFileToDrive(file, folderId, onProgress) {
    const form = new FormData();
    form.append('metadata', new Blob(
        [JSON.stringify({ name: file.name, parents: [folderId] })],
        { type: 'application/json' }
    ));
    form.append('file', file);
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.addEventListener('progress', e => {
            if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
        });
        xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) { resolve(JSON.parse(xhr.responseText)); }
            else { reject(new Error(`Upload failed (${xhr.status})`)); }
        });
        xhr.addEventListener('error', () => reject(new Error('Network error during upload')));
        xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')));
        xhr.open('POST', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,mimeType');
        xhr.setRequestHeader('Authorization', 'Bearer ' + getDriveToken());
        xhr.send(form);
    });
}

async function handleDriveUpload(files) {
    if (!isDriveConnected()) return;
    const fileArray  = Array.from(files).filter(f => f.size >= 0);
    if (!fileArray.length) return;
    const progressEl = document.getElementById('filesUploadProgress');
    if (!progressEl) return;
    const folderId   = filesPathStack[filesPathStack.length - 1].id;
    if (!folderId) return;
    const ts    = Date.now();
    const items = fileArray.map((file, i) => ({ file, uid: `up-${ts}-${i}` }));
    progressEl.innerHTML = `<div class="files-upload-block">
        ${items.map(item => `
        <div class="files-upload-item">
            <span class="files-upload-name" title="${esc(item.file.name)}">${esc(item.file.name)}</span>
            <div class="files-upload-bar-wrap"><div class="files-upload-bar" id="${item.uid}-bar" style="width:0%"></div></div>
            <span class="files-upload-status" id="${item.uid}-status">0%</span>
        </div>`).join('')}
    </div>`;
    let anyFailed = false;
    await Promise.allSettled(items.map(async item => {
        const barEl    = document.getElementById(`${item.uid}-bar`);
        const statusEl = document.getElementById(`${item.uid}-status`);
        try {
            await uploadFileToDrive(item.file, folderId, pct => {
                if (barEl)    barEl.style.width   = `${pct}%`;
                if (statusEl) statusEl.textContent = `${pct}%`;
            });
            if (barEl)    barEl.style.width = '100%';
            if (statusEl) { statusEl.textContent = 'Done'; statusEl.className = 'files-upload-status done'; }
        } catch (err) {
            anyFailed = true;
            if (barEl)    { barEl.style.background = 'var(--red)'; barEl.style.width = '100%'; }
            if (statusEl) { statusEl.textContent = 'Failed'; statusEl.className = 'files-upload-status error'; }
            const grid = document.getElementById('filesGrid');
            if (grid) {
                const t = document.createElement('div');
                t.className   = 'files-error-toast';
                t.textContent = `Failed to upload "${item.file.name}": ${err.message}`;
                grid.prepend(t); setTimeout(() => t.remove(), 6000);
            }
        }
    }));
    setTimeout(() => {
        if (progressEl) progressEl.innerHTML = '';
        loadFilesFolder(folderId);
    }, anyFailed ? 3500 : 1500);
}

function bindFilesUpload() {
    const dropZone  = document.getElementById('filesDropZone');
    const fileInput = document.getElementById('filesUploadInput');
    if (!dropZone || !fileInput) return;
    dropZone.addEventListener('dragenter', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', e => {
        if (!dropZone.contains(e.relatedTarget)) dropZone.classList.remove('dragover');
    });
    dropZone.addEventListener('drop', e => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        const files = e.dataTransfer?.files;
        if (files?.length) handleDriveUpload(files);
    });
    fileInput.addEventListener('change', e => {
        if (e.target.files?.length) handleDriveUpload(e.target.files);
        e.target.value = '';
    });
}

// ── Sketch Log ────────────────────────────────

let _sketchFolderId   = null;
let _pendingSketchFile = null;
let _expandedSketchId  = null;
const _sketchThumbs   = {};   // driveId → URL (in-memory cache per session)

async function getSketchFolder() {
    if (_sketchFolderId) return _sketchFolderId;
    const cbuId = await getCBUFolder();
    _sketchFolderId = await getOrCreateSubfolder(cbuId, 'Sketches');
    return _sketchFolderId;
}

function handleSketchFiles(files) {
    const imgs = Array.from(files).filter(f =>
        f.type === 'image/jpeg' || f.type === 'image/jpg' || f.type === 'image/png'
    );
    if (imgs.length) openSketchUploadModal(imgs[0]);
}

function openSketchUploadModal(file) {
    if (!file) return;
    _pendingSketchFile = file;

    const filenameEl = document.getElementById('sketchModalFilename');
    const previewImg = document.getElementById('sketchPreviewImg');
    const loadingEl  = document.getElementById('sketchPreviewLoading');
    const dateInput  = document.getElementById('sketchDateInput');
    const descInput  = document.getElementById('sketchDescInput');

    if (filenameEl) filenameEl.textContent = file.name;
    if (dateInput)  dateInput.value = new Date().toISOString().slice(0, 10);
    if (descInput)  descInput.value = '';
    if (loadingEl)  loadingEl.style.display = '';
    if (previewImg) { previewImg.style.display = 'none'; previewImg.src = ''; }

    const reader = new FileReader();
    reader.onload = e => {
        if (previewImg) { previewImg.src = e.target.result; previewImg.style.display = ''; }
        if (loadingEl)  loadingEl.style.display = 'none';
    };
    reader.readAsDataURL(file);
    openModal('sketchUploadModal');
}

function cancelSketchUpload() {
    _pendingSketchFile = null;
    closeModal('sketchUploadModal');
}

async function saveSketch() {
    if (!_pendingSketchFile) return;
    if (!isDriveConnected()) { showClaudeToast('Connect Google Drive first.'); return; }

    const btn     = document.getElementById('saveSketchBtn');
    const dateVal = document.getElementById('sketchDateInput')?.value.trim();
    const desc    = document.getElementById('sketchDescInput')?.value.trim();

    if (btn) { btn.disabled = true; btn.textContent = 'Uploading…'; }

    try {
        const folderId = await getSketchFolder();
        const file     = _pendingSketchFile;
        const result   = await uploadFileToDrive(file, folderId, () => {});

        // Cache data URL so thumbnail shows immediately without waiting for Drive to generate one
        const localReader = new FileReader();
        localReader.onload = e => { _sketchThumbs[result.id] = e.target.result; };
        localReader.readAsDataURL(file);

        const sketch = {
            id:      Date.now(),
            name:    file.name,
            driveId: result.id,
            date:    dateVal || new Date().toISOString().slice(0, 10),
            desc:    desc || '',
            addedAt: new Date().toISOString(),
            size:    file.size,
        };

        state.sketches.unshift(sketch);
        save('sketches', state.sketches);
        _pendingSketchFile = null;
        closeModal('sketchUploadModal');
        renderSketchLog();
    } catch (err) {
        console.warn('[Drive] Sketch upload failed:', err.message);
        showClaudeToast('Upload failed: ' + err.message);
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Save to Drive'; }
    }
}

function renderSketchLog() {
    const grid = document.getElementById('sketchGrid');
    if (!grid) return;

    if (!state.sketches.length) {
        grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
            <div class="empty-state-icon"></div>
            <div class="empty-state-text">No sketches yet. Drop an image above or click "+ Upload Sketch".</div>
        </div>`;
        return;
    }

    grid.innerHTML = state.sketches.map((s, i) => {
        const dateLabel = s.date
            ? new Date(s.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : '';
        return `
        <div class="sketch-card" data-id="${s.id}" style="animation-delay:${i * 60}ms" onclick="openSketchExpanded(${s.id})">
            <button class="sketch-card-del" onclick="showSketchDeleteConfirm(event,${s.id})" aria-label="Delete sketch" title="Delete">✕</button>
            <div class="sketch-card-confirm" style="display:none">
                <div class="sketch-card-confirm-text">Delete this sketch?</div>
                <div class="sketch-card-confirm-btns">
                    <button class="sketch-card-confirm-yes" onclick="confirmDeleteSketch(event,${s.id})">Yes</button>
                    <button class="sketch-card-confirm-no" onclick="cancelDeleteSketch(event,${s.id})">No</button>
                </div>
            </div>
            <div class="sketch-card-meta-row">
                <span class="sketch-card-date">${esc(dateLabel)}</span>
            </div>
            <div class="sketch-card-desc">${esc(s.desc)}</div>
            <div class="sketch-card-thumb-wrap">
                <img class="sketch-card-thumb" data-drive-id="${esc(s.driveId)}"
                     alt="${esc(s.name)}" src="" style="opacity:0">
            </div>
        </div>`;
    }).join('');

    grid.querySelectorAll('.sketch-card-thumb').forEach(img => loadSketchThumbnail(img));
}

function showSketchDeleteConfirm(e, id) {
    e.stopPropagation();
    const card = document.querySelector(`.sketch-card[data-id="${id}"]`);
    if (!card) return;
    card.querySelector('.sketch-card-confirm').style.display = '';
    card.querySelector('.sketch-card-del').style.display     = 'none';
}

function cancelDeleteSketch(e, id) {
    e.stopPropagation();
    const card = document.querySelector(`.sketch-card[data-id="${id}"]`);
    if (!card) return;
    card.querySelector('.sketch-card-confirm').style.display = 'none';
    card.querySelector('.sketch-card-del').style.display     = '';
}

async function confirmDeleteSketch(e, id) {
    e.stopPropagation();
    const sketch = state.sketches.find(s => s.id === id);
    if (!sketch) return;

    const card = document.querySelector(`.sketch-card[data-id="${id}"]`);
    if (card) {
        card.classList.add('sketch-card-removing');
        await new Promise(r => setTimeout(r, 260));
        card.remove();
    }

    state.sketches = state.sketches.filter(s => s.id !== id);
    save('sketches', state.sketches);

    if (sketch.driveId) {
        driveReq(`https://www.googleapis.com/drive/v3/files/${sketch.driveId}`, { method: 'DELETE' }).catch(() => {});
    }

    if (!state.sketches.length) renderSketchLog();
}

async function loadSketchThumbnail(img) {
    const driveId = img.dataset.driveId;
    if (!driveId) return;
    if (_sketchThumbs[driveId]) {
        img.src = _sketchThumbs[driveId];
        img.style.opacity = '1';
        return;
    }
    if (!isDriveConnected()) return;
    try {
        const res = await driveReq(`https://www.googleapis.com/drive/v3/files/${driveId}?fields=thumbnailLink`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.thumbnailLink) {
            const url = data.thumbnailLink.replace(/=s\d+/, '=s400');
            _sketchThumbs[driveId] = url;
            img.src = url;
            img.style.opacity = '1';
        }
    } catch {}
}

async function openSketchExpanded(id) {
    const sketch = state.sketches.find(s => s.id === id);
    if (!sketch) return;
    _expandedSketchId = id;

    const dateEl   = document.getElementById('sketchExpandedDate');
    const descEl   = document.getElementById('sketchExpandedDesc');
    const imgEl    = document.getElementById('sketchExpandedImg');
    const metaView = document.getElementById('sketchExpandedMetaView');
    const metaEdit = document.getElementById('sketchExpandedMetaEdit');
    const editBtn  = document.getElementById('editSketchBtn');

    if (metaView) metaView.style.display = '';
    if (metaEdit) metaEdit.style.display = 'none';
    if (editBtn)  editBtn.style.display  = '';

    const dateLabel = sketch.date
        ? new Date(sketch.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
        : 'No date';

    if (dateEl) dateEl.textContent = dateLabel;
    if (descEl) descEl.textContent = sketch.desc;
    if (imgEl)  imgEl.src = _sketchThumbs[sketch.driveId] || '';

    openModal('sketchExpandedModal');

    if (sketch.driveId && isDriveConnected() && imgEl) {
        try {
            const res = await driveReq(`https://www.googleapis.com/drive/v3/files/${sketch.driveId}?alt=media`);
            if (!res.ok) return;
            const blob   = await res.blob();
            const prevUrl = imgEl.src;
            imgEl.src    = URL.createObjectURL(blob);
            if (prevUrl.startsWith('blob:')) URL.revokeObjectURL(prevUrl);
        } catch {}
    }
}

function openSketchEditMode() {
    const sketch = state.sketches.find(s => s.id === _expandedSketchId);
    if (!sketch) return;
    document.getElementById('sketchEditDate').value = sketch.date || '';
    document.getElementById('sketchEditDesc').value = sketch.desc || '';
    document.getElementById('sketchExpandedMetaView').style.display = 'none';
    document.getElementById('sketchExpandedMetaEdit').style.display = '';
    document.getElementById('editSketchBtn').style.display = 'none';
}

function cancelSketchEdit() {
    document.getElementById('sketchExpandedMetaView').style.display = '';
    document.getElementById('sketchExpandedMetaEdit').style.display = 'none';
    document.getElementById('editSketchBtn').style.display = '';
}

function saveSketchEdit() {
    const sketch = state.sketches.find(s => s.id === _expandedSketchId);
    if (!sketch) return;

    sketch.date = document.getElementById('sketchEditDate').value;
    sketch.desc = document.getElementById('sketchEditDesc').value.trim();
    save('sketches', state.sketches);

    const dateLabel = sketch.date
        ? new Date(sketch.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
        : 'No date';
    document.getElementById('sketchExpandedDate').textContent = dateLabel;
    document.getElementById('sketchExpandedDesc').textContent = sketch.desc;

    cancelSketchEdit();
    renderSketchLog();
}

function downloadCurrentSketch() {
    const sketch = state.sketches.find(s => s.id === _expandedSketchId);
    if (sketch?.driveId) downloadDriveFile(sketch.driveId, sketch.name, null);
}

function bindSketchLog() {
    const dropZone = document.getElementById('sketchDropZone');
    const input    = document.getElementById('sketchUploadInput');

    if (dropZone) {
        dropZone.addEventListener('dragenter', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
        dropZone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('dragover'); });
        dropZone.addEventListener('dragleave', e => {
            if (!dropZone.contains(e.relatedTarget)) dropZone.classList.remove('dragover');
        });
        dropZone.addEventListener('drop', e => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            if (e.dataTransfer?.files?.length) handleSketchFiles(e.dataTransfer.files);
        });
        dropZone.addEventListener('click', () => input?.click());
    }

    if (input) {
        input.addEventListener('change', e => {
            if (e.target.files?.length) handleSketchFiles(e.target.files);
            e.target.value = '';
        });
    }

    document.getElementById('saveSketchBtn')?.addEventListener('click', saveSketch);
    document.getElementById('cancelSketchBtn')?.addEventListener('click', cancelSketchUpload);
    document.getElementById('editSketchBtn')?.addEventListener('click', openSketchEditMode);
    document.getElementById('downloadSketchBtn')?.addEventListener('click', downloadCurrentSketch);
    document.getElementById('closeSketchExpandedBtn')?.addEventListener('click', () => closeModal('sketchExpandedModal'));
    document.getElementById('saveSketchEditBtn')?.addEventListener('click', saveSketchEdit);
    document.getElementById('cancelSketchEditBtn')?.addEventListener('click', cancelSketchEdit);
}

// ── Settings ──────────────────────────────────

function renderSettingsSection() {
    // Anthropic
    const aInput = document.getElementById('anthropicKeyInput');
    const aDot   = document.getElementById('claudeDot');
    const aKey   = getAnthropicKey();
    if (aInput) {
        aInput.value       = '';
        aInput.placeholder = aKey ? 'Key saved — paste new key to replace' : 'sk-ant-…';
    }
    if (aDot) aDot.className = `settings-status-dot${aKey ? ' connected' : ''}`;
    const aStatus = document.getElementById('anthropicKeyStatus');
    if (aStatus) {
        aStatus.className   = `settings-status${aKey ? ' settings-status-saved' : ''}`;
        aStatus.textContent = aKey ? 'API key saved' : '';
    }

    // Canvas
    const cvUrl  = document.getElementById('canvasUrl');
    const cvTok  = document.getElementById('canvasToken');
    const cvDot  = document.getElementById('canvasSettingsDot');
    const cvStat = document.getElementById('canvasSettingsStatus');
    if (cvUrl)  cvUrl.value  = state.canvasSettings.url   || '';
    if (cvTok)  cvTok.value  = state.canvasSettings.token || '';
    const hasCanvas = !!(state.canvasSettings.url && state.canvasSettings.token);
    if (cvDot)  cvDot.className = `settings-status-dot${hasCanvas ? ' connected' : ''}`;
    if (cvStat) { cvStat.textContent = ''; cvStat.className = 'settings-status'; }

    // API Credits
    const apiBalance  = parseFloat(driveGet('api_balance', '0'));
    const apiWarning  = parseFloat(driveGet('api_warning', '2'));
    const apiReload   = parseFloat(driveGet('api_reload',  '15'));
    const balInput    = document.getElementById('apiBalanceInput');
    const warnInput   = document.getElementById('apiWarningInput');
    const reloadInput = document.getElementById('apiReloadInput');
    if (balInput)    balInput.value    = apiBalance > 0 ? apiBalance.toFixed(2) : '';
    if (warnInput)   warnInput.value   = apiWarning.toFixed(2);
    if (reloadInput) reloadInput.value = apiReload.toFixed(2);
    renderApiCreditSection();
    startClawdLoopIfNeeded();
}


// ── Claude Assistant ──────────────────────────

let claudeHistory = [];   // { role, content } pairs for Simple mode

function saveAnthropicKey() {
    const input = document.getElementById('anthropicKeyInput');
    const raw   = input?.value.trim();
    const sEl   = document.getElementById('anthropicKeyStatus');
    const dot   = document.getElementById('claudeDot');
    if (!raw) {
        if (sEl) { sEl.className = 'settings-status settings-status-error'; sEl.textContent = 'Paste a key above first.'; }
        return;
    }
    try { localStorage.setItem('cbu_anthropicKey', raw); } catch (e) { console.warn(e); }
    if (input) { input.value = ''; input.placeholder = 'Key saved — paste new key to replace'; }
    if (sEl)   { sEl.className = 'settings-status settings-status-saved'; sEl.textContent = 'API key saved'; }
    if (dot)   { dot.className = 'settings-status-dot connected'; }
}

function buildDashboardContext() {
    const now     = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const lines   = [
        `Current date and time: ${now.toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' })} at ${now.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' })}`,
        '',
    ];

    // ── Assignments ──────────────────────────────
    if (state.assignments.length) {
        lines.push(`CANVAS ASSIGNMENTS (${state.assignments.length} total):`);
        state.assignments.forEach(a => {
            const due = a.dueAt
                ? new Date(a.dueAt).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })
                : 'No due date';
            const overdue = a.dueAt && new Date(a.dueAt) < now ? ' [OVERDUE]' : '';
            lines.push(`• ${a.title} — ${a.course} — Due ${due}${overdue}`);
        });
        lines.push('');
    }

    // ── Studio projects ──────────────────────────
    lines.push('STUDIO PROJECTS:');
    PROJECT_NAMES.forEach((name, i) => {
        const n    = i + 1;
        const data = getProjectData(n);
        lines.push(`  ${name}:`);
        if (data.deliverables.length) {
            lines.push('    Deliverables:');
            data.deliverables.forEach(d => {
                const due = d.dueDate
                    ? new Date(d.dueDate + 'T12:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric' })
                    : 'No date';
                lines.push(`      ${d.completed ? '✓' : '○'} ${d.name} — ${due}`);
            });
        }
        if (data.files.length) {
            lines.push(`    Files (${data.files.length}): ${data.files.map(f => f.name).join(', ')}`);
        }
        if (data.notes.length) {
            lines.push(`    Notes (${data.notes.length}): ${data.notes.map(n => n.text?.slice(0, 50) || '(note)').join(' | ')}`);
        }
    });
    lines.push('');

    // ── To-dos (recent 30 days + next 7) ────────
    const todoLines = [];
    for (let offset = -30; offset <= 7; offset++) {
        const d = new Date(now);
        d.setDate(d.getDate() + offset);
        const ds    = d.toISOString().slice(0, 10);
        const todos = getTodosForDay(ds);
        if (todos.length) {
            const label = offset === 0 ? `${ds} (TODAY)` : ds;
            todoLines.push(`  ${label}:`);
            todos.forEach(t => todoLines.push(`    ${t.completed ? '✓' : '○'} ${t.text}`));
        }
    }
    if (todoLines.length) {
        lines.push('TO-DO LISTS:');
        lines.push(...todoLines);
        lines.push('');
    }

    // ── Calendar (all events) ────────────────────
    const allEvents = [
        ...CBU_FALL_2026,
        ...state.calendarEvents,
        ...state.customEvents.map(e => ({ ...e, label: e.name })),
    ].sort((a, b) => a.date.localeCompare(b.date));
    if (allEvents.length) {
        lines.push('ACADEMIC & PERSONAL CALENDAR:');
        allEvents.forEach(e => {
            const d = new Date(e.date + 'T12:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
            const past = e.date < todayStr ? ' [past]' : '';
            lines.push(`  ${d} — ${e.label} [${e.category}]${past}`);
        });
        lines.push('');
    }

    // ── Dashboard notes ──────────────────────────
    if (state.notes.length) {
        lines.push(`DASHBOARD NOTES (${state.notes.length}):`);
        state.notes.forEach(n => {
            const upd = n.updatedAt ? new Date(n.updatedAt).toLocaleDateString('en-US', { month:'short', day:'numeric' }) : '';
            lines.push(`  • "${n.title || '(untitled)'}" — ${upd}`);
        });
        lines.push('');
    }

    // ── Thesis ───────────────────────────────────
    const hasThesis = state.thesis.notes.length || state.thesis.pdfs.length || state.thesis.links.length;
    if (hasThesis) {
        lines.push('THESIS:');
        if (state.thesis.notes.length) {
            lines.push(`  Notes (${state.thesis.notes.length}):`);
            state.thesis.notes.forEach(n => {
                const d = n.updatedAt ? new Date(n.updatedAt).toLocaleDateString('en-US', { month:'short', day:'numeric' }) : '';
                lines.push(`    • "${n.title || '(untitled)'}" — ${d}`);
            });
        }
        if (state.thesis.pdfs.length) {
            lines.push(`  PDFs (${state.thesis.pdfs.length}):`);
            state.thesis.pdfs.forEach(p => {
                const added = p.addedAt ? new Date(p.addedAt).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) : '';
                const size  = p.size ? fmtFileSize(p.size) : '';
                lines.push(`    • ${p.name}${size ? ' (' + size + ')' : ''} — Added ${added}${p.driveId ? ' [Drive ID: ' + p.driveId + ']' : ''}`);
            });
        }
        if (state.thesis.links.length) {
            lines.push(`  Research Links (${state.thesis.links.length}):`);
            state.thesis.links.forEach(l => lines.push(`    • ${l.label}`));
        }
        lines.push('');
    }

    // ── Sketch log ───────────────────────────────
    if (state.sketches.length) {
        lines.push(`SKETCH LOG (${state.sketches.length} sketches):`);
        state.sketches.forEach(s => {
            const d = s.date ? new Date(s.date + 'T12:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) : 'No date';
            lines.push(`  • ${s.name} — ${d}${s.desc ? ' — "' + s.desc + '"' : ''}`);
        });
        lines.push('');
    }

    // ── Active PDF ───────────────────────────────
    if (_activePdfMeta) {
        lines.push(`ACTIVE DOCUMENT: ${_activePdfMeta.name}${_activePdfMeta.size ? ' (' + fmtFileSize(_activePdfMeta.size) + ')' : ''}`);
        lines.push('The user is currently discussing this PDF. If they ask you to "read" or "analyze" the full document, remind them to use the Summarize button to send the actual PDF content.');
        lines.push('');
    }

    return lines.join('\n').trim();
}

// Active PDF attached to chat, and pending summarize target
let _activePdfMeta        = null;
let _pendingSummarizeMeta = null;

function deductApiUsage(usage) {
    if (!usage) return;
    const iT = usage.input_tokens  || 0;
    const oT = usage.output_tokens || 0;
    const c  = (iT / 1e6) * 0.80 + (oT / 1e6) * 4.00;
    driveSet('api_tokens_input',  String(parseInt(driveGet('api_tokens_input',  '0')) + iT));
    driveSet('api_tokens_output', String(parseInt(driveGet('api_tokens_output', '0')) + oT));
    const b = parseFloat(driveGet('api_balance', '0'));
    if (b > 0) {
        driveSet('api_balance', String(Math.max(0, b - c)));
        if (document.getElementById('settings')?.classList.contains('active')) renderApiCreditSection();
    }
}

async function callClaudeAPI(messages, systemPrompt, maxTokens = 1000, beta = null) {
    const body = {
        model:      'claude-haiku-4-5-20251001',
        max_tokens: maxTokens,
        system:     systemPrompt,
        messages,
    };
    if (beta) body.beta = beta;
    const res = await fetch('/api/claude', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
    });
    if (!res.ok) {
        let msg = `API error ${res.status}`;
        try { const j = await res.json(); msg = j.error?.message || msg; } catch {}
        throw new Error(msg);
    }
    const data = await res.json();
    deductApiUsage(data.usage);
    return data.content?.[0]?.text || '(empty response)';
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

function openSimpleMode() {
    document.getElementById('claudeModeSelect').style.display = 'none';
    document.getElementById('claudeInlineChat').style.display = '';
    renderChatHistory();
    renderPdfCard();
    setTimeout(() => document.getElementById('claudeChatInput')?.focus(), 80);
}

function backToClaudeMenu() {
    document.getElementById('claudeModeSelect').style.display = '';
    document.getElementById('claudeInlineChat').style.display = 'none';
}

async function openComplexMode() {
    const ctx = `Here is my current CBU Dashboard context:\n\n${buildDashboardContext()}`;
    try {
        await navigator.clipboard.writeText(ctx);
        showClaudeToast('Context copied to clipboard — paste it into Claude to get started.');
    } catch {
        showClaudeToast('Could not copy automatically — allow clipboard access and try again.');
    }
    window.open('https://claude.ai', '_blank', 'noopener');
}

function showClaudeToast(msg) {
    const el = document.getElementById('claudeToast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.remove('show'), 4000);
}

function renderClaudeText(text) {
    return esc(text).replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
}

function renderChatHistory() {
    const el = document.getElementById('claudeChatHistory');
    if (!el) return;
    if (!claudeHistory.length) {
        el.innerHTML = `<div class="claude-chat-empty">Ask about your assignments,<br>projects, deadlines, or to-dos.</div>`;
        return;
    }
    el.innerHTML = claudeHistory.map(m => {
        if (m.role === 'user')      return `<div class="claude-msg claude-msg-user">${esc(m.content)}</div>`;
        if (m.role === 'assistant') return `<div class="claude-msg claude-msg-claude">${renderClaudeText(m.content)}</div>`;
        if (m.role === '_error')    return `<div class="claude-msg claude-msg-error">${esc(m.content)}</div>`;
        if (m.role === '_image')    return `<div class="claude-msg-image">
            <img src="${esc(m.content)}" alt="${esc(m.caption || 'Sketch')}" class="claude-sketch-inline">
            <div class="claude-sketch-caption">${esc(m.caption || '')}</div>
        </div>`;
        if (m.role === '_pdfs') return (m.pdfs || []).map(p => `
            <div class="claude-pdf-result-card">
                <span class="claude-pdf-result-icon">📄</span>
                <div class="claude-pdf-result-info">
                    <div class="claude-pdf-result-name">${esc(p.name)}</div>
                    <div class="claude-pdf-result-meta">${p.size ? fmtFileSize(p.size) + ' · ' : ''}${p.addedAt ? fmtNoteDate(p.addedAt) : ''}</div>
                </div>
                <div class="claude-pdf-result-actions">
                    <button class="btn btn-ghost" style="font-size:12px;padding:5px 10px"
                        onclick="openDriveFile('${esc(p.driveId)}','${esc(p.name)}','application/pdf')">Open in Drive ↗</button>
                    <button class="btn btn-ghost" style="font-size:12px;padding:5px 10px"
                        onclick="initSummarizePdf(${p.id})">Summarize</button>
                </div>
            </div>`).join('');
        return '';
    }).join('');
    el.scrollTop = el.scrollHeight;
}

const CLAUDE_PERSONA =
    'You are a helpful assistant built into a student architecture dashboard for Aaron at CBU (Fall 2026). ' +
    'Respond in plain conversational prose — no bullet points, no dashes, no section headers, no numbered lists. ' +
    'When listing files, PDFs, sketches, assignments, or any dashboard items, weave them into natural sentences. ' +
    'Use **bold** (double asterisks) only for file names, PDF titles, and sketch names when you mention them — no other bold. ' +
    'For example: "You have one thesis PDF — **Thesis.pdf** (7.4 MB), added May 14." ' +
    'Keep responses concise and direct.';

const FULL_READ_TRIGGERS = [
    'read the full document', 'read this document', 'analyze this pdf',
    'analyze the pdf', 'read this pdf', 'full document', 'read the document',
];

const SKETCH_SHOW_TRIGGERS = ['show me', 'show the', 'display the', 'see the sketch', 'view the sketch'];

const PDF_FIND_TRIGGERS = [
    'find pdf', 'open pdf', 'show pdf', 'search pdf', 'locate pdf',
    'find the pdf', 'open the pdf', 'find a pdf', 'search for pdf',
    'find document', 'open document', 'find the document', 'open the document',
    'find my pdf', 'pull up the pdf', 'get the pdf', 'show me the pdf',
];

function searchThesisPdfs(query) {
    const STOP = new Set(['the','a','an','find','open','show','me','pdf','document',
        'please','can','you','my','thesis','file','look','up','for','about',
        'get','pull','search','locate','some','any','that']);
    const terms = query.toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2 && !STOP.has(w));
    if (!terms.length) return [...state.thesis.pdfs];
    return state.thesis.pdfs.filter(p => {
        const name = p.name.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
        return terms.some(t => name.includes(t));
    });
}

async function sendSimpleMessage() {
    const input   = document.getElementById('claudeChatInput');
    const sendBtn = document.getElementById('claudeSendBtn');
    const histEl  = document.getElementById('claudeChatHistory');
    const text    = input?.value.trim();
    if (!text) return;

    // Detect "read full document" trigger when a PDF is attached
    if (_activePdfMeta) {
        const lc = text.toLowerCase();
        if (FULL_READ_TRIGGERS.some(t => lc.includes(t))) {
            input.value = '';
            input.style.height = '';
            await summarizePdfFull(_activePdfMeta, text);
            input?.focus();
            return;
        }
    }

    // Balance warning check
    const _curBal  = parseFloat(driveGet('api_balance',  '0'));
    const _warnThr = parseFloat(driveGet('api_warning', '2'));
    if (_curBal > 0 && _curBal <= _warnThr) {
        const _proceed = await showApiWarningModal();
        if (!_proceed) return;
    }

    input.value = '';
    input.style.height = '';
    sendBtn.disabled = true;

    const lc = text.toLowerCase();

    // Detect PDF find/open requests — show matching PDF cards before Claude's text response
    const isPdfFind = PDF_FIND_TRIGGERS.some(t => lc.includes(t)) ||
        ((lc.includes('find') || lc.includes('open') || lc.includes('pull up') || lc.includes('show me')) &&
         (lc.includes('pdf') || lc.includes('document')) &&
         state.thesis.pdfs.length > 0);
    if (isPdfFind && state.thesis.pdfs.length) {
        const matches = searchThesisPdfs(text);
        if (matches.length) {
            claudeHistory.push({ role: '_pdfs', pdfs: matches });
        }
    }

    // Detect sketch display requests — show thumbnails before sending to Claude
    const wantsSketch = SKETCH_SHOW_TRIGGERS.some(t => lc.includes(t)) &&
                        (lc.includes('sketch') || lc.includes('drawing'));
    if (wantsSketch && state.sketches.length) {
        const matches = state.sketches.filter(s => {
            const d = (s.desc || '').toLowerCase();
            const n = (s.name || '').toLowerCase();
            // If the message mentions words from the description or filename, prefer that sketch
            const words = lc.split(/\s+/).filter(w => w.length > 3);
            return words.some(w => d.includes(w) || n.includes(w));
        });
        const toShow = matches.length ? matches.slice(0, 3) : state.sketches.slice(0, 1);
        toShow.forEach(s => {
            const url = _sketchThumbs[s.driveId];
            if (url) {
                const d = s.date ? new Date(s.date + 'T12:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) : '';
                claudeHistory.push({ role: '_image', content: url, caption: `${s.name}${d ? ' — ' + d : ''}${s.desc ? ' — ' + s.desc : ''}` });
            }
        });
    }

    claudeHistory.push({ role: 'user', content: text });
    renderChatHistory();

    const typingEl = document.createElement('div');
    typingEl.className = 'claude-typing';
    typingEl.innerHTML = '<span></span><span></span><span></span>';
    histEl?.appendChild(typingEl);
    if (histEl) histEl.scrollTop = histEl.scrollHeight;

    try {
        const systemPrompt =
            CLAUDE_PERSONA + ' Here is the full dashboard context:\n\n' + buildDashboardContext();

        const reply = await callClaudeAPI(
            claudeHistory.filter(m => m.role === 'user' || m.role === 'assistant'),
            systemPrompt,
            1000,
        );
        typingEl.remove();
        claudeHistory.push({ role: 'assistant', content: reply });
        renderChatHistory();
    } catch (err) {
        typingEl.remove();
        claudeHistory.push({ role: '_error', content: err.message });
        renderChatHistory();
    } finally {
        sendBtn.disabled = false;
        input?.focus();
    }
}

// ── PDF card helpers ──────────────────────────

function renderPdfCard() {
    const card   = document.getElementById('claudePdfCard');
    const nameEl = document.getElementById('claudePdfCardName');
    const metaEl = document.getElementById('claudePdfCardMeta');
    if (!card) return;
    if (!_activePdfMeta) { card.style.display = 'none'; return; }
    if (nameEl) nameEl.textContent = _activePdfMeta.name;
    if (metaEl) metaEl.textContent = _activePdfMeta.size ? fmtFileSize(_activePdfMeta.size) : '';
    card.style.display = '';
}

function dismissPdfCard() {
    _activePdfMeta = null;
    renderPdfCard();
}

function openPdfInClaude(id) {
    const pdf = state.thesis.pdfs.find(p => p.id === id);
    if (!pdf) return;
    _activePdfMeta = pdf;
    showSection('claude');
    openSimpleMode();
    // Pre-fill message
    const input = document.getElementById('claudeChatInput');
    if (input) {
        input.value = `Tell me about this document: ${pdf.name}`;
        input.dispatchEvent(new Event('input'));
        input.focus();
    }
}

function initSummarizePdf(id) {
    const pdf = state.thesis.pdfs.find(p => p.id === id);
    if (!pdf) return;
    _pendingSummarizeMeta = pdf;
    const estTokens = Math.round((pdf.size || 100000) / 200);
    const estCost   = ((estTokens / 1e6) * 4.00).toFixed(4);
    const warnEl    = document.getElementById('pdfSummarizeWarningText');
    if (warnEl) warnEl.textContent =
        `Summarizing "${pdf.name}" will use approximately ${estTokens.toLocaleString()} tokens (≈ $${estCost}). Continue?`;
    openModal('pdfSummarizeModal');
}

function cancelSummarizePdf() {
    _pendingSummarizeMeta = null;
    closeModal('pdfSummarizeModal');
}

async function confirmSummarize() {
    const pdf = _pendingSummarizeMeta;
    _pendingSummarizeMeta = null;
    closeModal('pdfSummarizeModal');
    if (!pdf) return;
    _activePdfMeta = pdf;
    showSection('claude');
    openSimpleMode();
    await summarizePdfFull(pdf, `Please summarize this document: ${pdf.name}`);
}

async function summarizePdfFull(pdf, userText) {
    if (!pdf?.driveId || !isDriveConnected()) {
        showClaudeToast('Google Drive not connected — cannot fetch PDF.');
        return;
    }
    const sendBtn = document.getElementById('claudeSendBtn');
    const histEl  = document.getElementById('claudeChatHistory');

    const balCheck  = parseFloat(driveGet('api_balance',  '0'));
    const warnCheck = parseFloat(driveGet('api_warning', '2'));
    if (balCheck > 0 && balCheck <= warnCheck) {
        const proceed = await showApiWarningModal();
        if (!proceed) return;
    }

    if (sendBtn) sendBtn.disabled = true;

    claudeHistory.push({ role: 'user', content: userText });
    renderChatHistory();

    const typingEl = document.createElement('div');
    typingEl.className = 'claude-typing';
    typingEl.innerHTML = '<span></span><span></span><span></span>';
    histEl?.appendChild(typingEl);
    if (histEl) histEl.scrollTop = histEl.scrollHeight;

    try {
        const res = await driveReq(`https://www.googleapis.com/drive/v3/files/${pdf.driveId}?alt=media`);
        if (!res.ok) throw new Error('Could not fetch PDF from Drive (HTTP ' + res.status + ')');
        const blob   = await res.blob();
        const base64 = await blobToBase64(blob);

        const systemPrompt =
            CLAUDE_PERSONA + ' Here is the full dashboard context:\n\n' + buildDashboardContext();

        const apiMessages = [
            ...claudeHistory.slice(0, -1).filter(m => m.role === 'user' || m.role === 'assistant'),
            {
                role: 'user',
                content: [
                    { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
                    { type: 'text', text: userText },
                ],
            },
        ];

        typingEl.remove();
        const reply = await callClaudeAPI(apiMessages, systemPrompt, 2000, 'pdfs-2024-09-25');
        claudeHistory.push({ role: 'assistant', content: reply });
        renderChatHistory();
    } catch (err) {
        typingEl.remove();
        claudeHistory.push({ role: '_error', content: err.message });
        renderChatHistory();
    } finally {
        if (sendBtn) sendBtn.disabled = false;
    }
}

// ── API Credit Tracker ────────────────────────

let _apiWarnResolve    = null;
let _clawdLoopStarted  = false;

function resolveApiWarning(proceed) {
    closeModal('apiWarningModal');
    closeApiWarningAnimations();
    if (_apiWarnResolve) { _apiWarnResolve(proceed); _apiWarnResolve = null; }
}

function showApiWarningModal() {
    return new Promise(resolve => {
        _apiWarnResolve = resolve;
        const reload   = parseFloat(driveGet('api_reload',  '15')).toFixed(2);
        const balance  = parseFloat(driveGet('api_balance', '0')).toFixed(2);
        const reloadEl = document.getElementById('apiWarnReloadAmt');
        const balEl    = document.getElementById('apiWarnBalanceBadge');
        const mascot   = document.getElementById('apiWarnClawd');
        if (reloadEl) reloadEl.textContent = reload;
        if (balEl)    balEl.textContent    = '$' + balance;
        if (mascot)   mascot.classList.add('clawd-alarmed');
        openModal('apiWarningModal');
    });
}

function closeApiWarningAnimations() {
    const mascot = document.getElementById('apiWarnClawd');
    if (mascot) mascot.classList.remove('clawd-alarmed');
}

function saveApiCredits() {
    const bal     = Math.max(0, parseFloat(document.getElementById('apiBalanceInput')?.value  || '0'));
    const warning = Math.max(0, parseFloat(document.getElementById('apiWarningInput')?.value  || '2'));
    const reload  = Math.max(0, parseFloat(document.getElementById('apiReloadInput')?.value   || '15'));
    driveSet('api_balance',          String(bal));
    driveSet('api_starting_balance', String(bal));
    driveSet('api_warning',          String(warning));
    driveSet('api_reload',           String(reload));
    driveSet('api_tokens_input',  '0');
    driveSet('api_tokens_output', '0');
    const status = document.getElementById('apiCreditsStatus');
    if (status) { status.className = 'settings-status settings-status-saved'; status.textContent = 'Saved'; }
    renderApiCreditSection();
}

function renderApiCreditSection() {
    const el = document.getElementById('apiCreditDisplay');
    if (!el) return;
    const balance  = parseFloat(driveGet('api_balance',          '0'));
    const starting = parseFloat(driveGet('api_starting_balance', '0'));
    const warning  = parseFloat(driveGet('api_warning',          '2'));
    const reload   = parseFloat(driveGet('api_reload',           '15'));
    const tokIn    = parseInt(driveGet('api_tokens_input',        '0'));
    const tokOut   = parseInt(driveGet('api_tokens_output',       '0'));
    const costUsed = (tokIn / 1e6) * 0.80 + (tokOut / 1e6) * 4.00;
    const pct      = starting > 0 ? Math.min(100, Math.max(0, (balance / starting) * 100)) : (balance > 0 ? 100 : 0);
    el.innerHTML = `
        <div class="api-balance-bar-wrap">
            <div class="api-balance-bar-fill" style="width:${pct.toFixed(1)}%"></div>
        </div>
        <div class="api-balance-meta">
            <span>$${balance.toFixed(4)} remaining</span>
            <span>${pct.toFixed(0)}%</span>
        </div>
        <div class="api-stats-grid">
            <div class="api-stat">
                <div class="api-stat-label">Tokens Used</div>
                <div class="api-stat-value">${(tokIn + tokOut).toLocaleString()}</div>
            </div>
            <div class="api-stat">
                <div class="api-stat-label">Est. Cost</div>
                <div class="api-stat-value">$${costUsed.toFixed(4)}</div>
            </div>
            <div class="api-stat">
                <div class="api-stat-label">Warning At</div>
                <div class="api-stat-value">$${warning.toFixed(2)}</div>
            </div>
            <div class="api-stat">
                <div class="api-stat-label">Auto-Reload</div>
                <div class="api-stat-value">$${reload.toFixed(2)}</div>
            </div>
        </div>`;
}

function msDelay(ms) { return new Promise(r => setTimeout(r, ms)); }

function startClawdLoopIfNeeded() {
    if (_clawdLoopStarted) return;
    _clawdLoopStarted = true;
    (async function loop() {
        while (true) {
            await msDelay(5000);
            const el = document.getElementById('clawdMascot');
            if (!el) { _clawdLoopStarted = false; return; }
            el.classList.add('clawd-waving');
            await msDelay(1200);
            el.classList.remove('clawd-waving');
            await msDelay(5000);
            const el2 = document.getElementById('clawdMascot');
            if (!el2) { _clawdLoopStarted = false; return; }
            el2.classList.add('clawd-jumping');
            await msDelay(650);
            el2.classList.remove('clawd-jumping');
        }
    })();
}

// ── Modals ────────────────────────────────────
function openModal(id) {
    document.getElementById(id)?.classList.add('open');
}

function closeModal(id) {
    document.getElementById(id)?.classList.remove('open');
}

// ── Nav Drag-to-Reorder ───────────────────────

function initNavDragSort() {
    const list = document.querySelector('.nav-links');
    if (!list) return;

    _applyNavOrder(_loadNavOrder());

    let dragging       = null;
    let ghost          = null;
    let indicator      = null;
    let pointerOffsetY = 0;
    let dragStarted    = false;
    let startY         = 0;

    const THRESHOLD = 6;

    function liveItems() {
        return Array.from(list.children).filter(el => el !== indicator);
    }

    list.addEventListener('pointerdown', e => {
        const handle = e.target.closest('.nav-drag-handle');
        if (!handle) return;
        const li = handle.closest('li');
        if (!li || !list.contains(li)) return;

        e.preventDefault();
        dragging       = li;
        dragStarted    = false;
        startY         = e.clientY;
        pointerOffsetY = e.clientY - li.getBoundingClientRect().top;
        list.setPointerCapture(e.pointerId);
    });

    list.addEventListener('pointermove', e => {
        if (!dragging) return;
        e.preventDefault();

        if (!dragStarted) {
            if (Math.abs(e.clientY - startY) < THRESHOLD) return;
            dragStarted = true;

            const rect = dragging.getBoundingClientRect();
            ghost = dragging.cloneNode(true);
            ghost.classList.add('nav-drag-ghost');
            ghost.style.cssText = [
                'position:fixed',
                `left:${rect.left}px`,
                `top:${rect.top}px`,
                `width:${rect.width}px`,
                'z-index:9999',
                'pointer-events:none',
                'margin:0',
                'padding:0',
            ].join(';');
            document.body.appendChild(ghost);
            dragging.classList.add('nav-item-dragging');

            indicator = document.createElement('li');
            indicator.className = 'nav-drop-line';
        }

        ghost.style.top = (e.clientY - pointerOffsetY) + 'px';

        const items = liveItems().filter(li => li !== dragging);
        let insertBefore = null;
        for (const item of items) {
            const r = item.getBoundingClientRect();
            if (e.clientY < r.top + r.height / 2) { insertBefore = item; break; }
        }

        indicator.remove();
        if (insertBefore) {
            list.insertBefore(indicator, insertBefore);
        } else {
            list.appendChild(indicator);
        }
    });

    function finishDrag() {
        if (!dragging) return;

        if (dragStarted) {
            if (indicator && indicator.parentNode === list) {
                list.insertBefore(dragging, indicator);
            }
            indicator?.remove();
            ghost?.remove();
            _saveNavOrder();
        }

        dragging.classList.remove('nav-item-dragging');
        dragging    = null;
        ghost       = null;
        indicator   = null;
        dragStarted = false;
    }

    list.addEventListener('pointerup',     finishDrag);
    list.addEventListener('pointercancel', finishDrag);
}

function _saveNavOrder() {
    const sections = Array.from(
        document.querySelectorAll('.nav-links [data-section]')
    ).map(a => a.dataset.section);
    try { localStorage.setItem('cbu_nav_order', JSON.stringify(sections)); } catch {}
}

function _loadNavOrder() {
    try {
        const raw = localStorage.getItem('cbu_nav_order');
        return (raw ? JSON.parse(raw) : []) || [];
    } catch { return []; }
}

function _applyNavOrder(order) {
    if (!order.length) return;
    const list = document.querySelector('.nav-links');
    if (!list) return;
    const items = Array.from(list.children);
    const ordered = [];
    order.forEach(section => {
        const item = items.find(li => li.querySelector?.(`[data-section="${section}"]`));
        if (item && !ordered.includes(item)) ordered.push(item);
    });
    // Append any new items not in saved order at the end
    items.forEach(li => { if (!ordered.includes(li)) ordered.push(li); });
    ordered.forEach(li => list.appendChild(li));
}

// ── Event Binding ─────────────────────────────
function bindEvents() {
    // Navigation
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', e => {
            e.preventDefault();
            showSection(link.dataset.section);
            closeSidebar();
        });
    });

    // Mobile sidebar
    document.getElementById('hamburger')?.addEventListener('click', () => {
        document.getElementById('sidebar')?.classList.toggle('open');
        document.getElementById('overlayBg')?.classList.toggle('open');
    });
    document.getElementById('overlayBg')?.addEventListener('click', closeSidebar);

    // Canvas settings (inline in Settings tab)
    document.getElementById('saveCanvasSettings')?.addEventListener('click', () => {
        state.canvasSettings = {
            url:   document.getElementById('canvasUrl')?.value.trim()   || '',
            token: document.getElementById('canvasToken')?.value.trim() || '',
        };
        save('canvasSettings', state.canvasSettings);
        const dot  = document.getElementById('canvasSettingsDot');
        const stat = document.getElementById('canvasSettingsStatus');
        const has  = !!(state.canvasSettings.url && state.canvasSettings.token);
        if (dot)  dot.className = `settings-status-dot${has ? ' connected' : ''}`;
        if (stat) {
            stat.className   = 'settings-status settings-status-saved';
            stat.textContent = 'Settings saved.';
            setTimeout(() => { stat.textContent = ''; stat.className = 'settings-status'; }, 3000);
        }
    });

    // Canvas sync
    document.getElementById('syncCanvas')?.addEventListener('click', syncCanvas);

    // Todos — day navigation
    document.getElementById('todoPrevDayBtn')?.addEventListener('click', () => todosGoDay(-1));
    document.getElementById('todoNextDayBtn')?.addEventListener('click', () => todosGoDay(1));
    document.getElementById('addTodoBtn')?.addEventListener('click', addTodo);
    document.getElementById('todoInput')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') addTodo();
    });

    // Studio projects
    document.getElementById('studioBackBtn')?.addEventListener('click', closeProject);
    document.getElementById('studioAddNoteBtn')?.addEventListener('click', addStudioNote);
    document.getElementById('studioNoteInput')?.addEventListener('keydown', e => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) addStudioNote();
    });
    document.getElementById('studioAddDeliverableBtn')?.addEventListener('click', addStudioDeliverable);
    document.getElementById('studioDeliverableName')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') addStudioDeliverable();
    });

    // Schedule — add event button
    document.getElementById('addScheduleEventBtn')?.addEventListener('click', openAddScheduleEvent);

    // Schedule custom event modal
    document.getElementById('closeSchedCustomModal')?.addEventListener('click',  () => closeModal('schedCustomEventModal'));
    document.getElementById('cancelSchedCustomModal')?.addEventListener('click', () => closeModal('schedCustomEventModal'));
    document.getElementById('saveSchedCustomEvent')?.addEventListener('click', saveCustomEvent);
    document.getElementById('schedCustomEventName')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') saveCustomEvent();
    });

    // Schedule navigation
    document.getElementById('prevWeekBtn')?.addEventListener('click', () => { scheduleWeekOffset--; renderSchedule(); });
    document.getElementById('nextWeekBtn')?.addEventListener('click', () => { scheduleWeekOffset++; renderSchedule(); });
    document.getElementById('todayBtn')?.addEventListener('click',    () => { scheduleWeekOffset = 0; renderSchedule(); });

    // Schedule edit
    document.getElementById('editScheduleBtn')?.addEventListener('click', toggleScheduleEdit);
    document.getElementById('closeScheduleModal')?.addEventListener('click',  () => closeModal('scheduleModal'));
    document.getElementById('cancelScheduleModal')?.addEventListener('click', () => closeModal('scheduleModal'));
    document.getElementById('saveScheduleSlot')?.addEventListener('click',  saveScheduleSlot);
    document.getElementById('clearScheduleSlot')?.addEventListener('click', clearScheduleSlot);
    document.getElementById('scheduleEventInput')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') saveScheduleSlot();
    });

    // Notes
    document.getElementById('addNoteBtn')?.addEventListener('click', addNote);

    // Thesis sub-tabs
    document.querySelectorAll('.thesis-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchThesisTab(btn.dataset.tab));
    });

    // Thesis notes
    document.getElementById('addThesisNoteBtn')?.addEventListener('click', addThesisNote);

    // Thesis links
    document.getElementById('addThesisLinkBtn')?.addEventListener('click', () => {
        document.getElementById('thesisLinkLabel').value = '';
        document.getElementById('thesisLinkUrl').value   = '';
        openModal('thesisLinkModal');
        setTimeout(() => document.getElementById('thesisLinkLabel').focus(), 60);
    });
    document.getElementById('closeThesisLinkModal')?.addEventListener('click',  () => closeModal('thesisLinkModal'));
    document.getElementById('cancelThesisLinkModal')?.addEventListener('click', () => closeModal('thesisLinkModal'));
    document.getElementById('saveThesisLinkBtn')?.addEventListener('click', addThesisLink);
    document.getElementById('thesisLinkUrl')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') addThesisLink();
    });

    // Thesis PDFs
    bindThesisPdfUpload();

    // Files
    document.getElementById('filesRefreshBtn')?.addEventListener('click', () => {
        loadFilesFolder(filesPathStack[filesPathStack.length - 1].id);
    });

    // Settings — PIN
    document.getElementById('changePinBtn')?.addEventListener('click', openChangePinFlow);

    // Settings — Anthropic
    document.getElementById('saveAnthropicKeyBtn')?.addEventListener('click', saveAnthropicKey);
    document.getElementById('anthropicKeyInput')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') saveAnthropicKey();
    });

    // Settings — API Credits
    document.getElementById('saveApiCreditsBtn')?.addEventListener('click', saveApiCredits);
    document.getElementById('apiBalanceInput')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') saveApiCredits();
    });

    // API Warning modal
    document.getElementById('apiWarningContinue')?.addEventListener('click', () => resolveApiWarning(true));
    document.getElementById('apiWarningCancel')?.addEventListener('click',   () => resolveApiWarning(false));
    document.getElementById('closeApiWarningModal')?.addEventListener('click', () => resolveApiWarning(false));
    document.getElementById('apiWarningModal')?.addEventListener('click', e => {
        if (e.target === document.getElementById('apiWarningModal')) resolveApiWarning(false);
    });

    // Claude assistant
    document.getElementById('claudeSimpleBtn')?.addEventListener('click', openSimpleMode);
    document.getElementById('claudeComplexBtn')?.addEventListener('click', openComplexMode);
    document.getElementById('claudeBackBtn')?.addEventListener('click', () => {
        dismissPdfCard();
        backToClaudeMenu();
    });
    document.getElementById('dismissPdfCardBtn')?.addEventListener('click', dismissPdfCard);
    document.getElementById('closePdfSummarizeModal')?.addEventListener('click', cancelSummarizePdf);
    document.getElementById('cancelPdfSummarize')?.addEventListener('click', cancelSummarizePdf);
    document.getElementById('confirmPdfSummarize')?.addEventListener('click', confirmSummarize);
    document.getElementById('claudeSendBtn')?.addEventListener('click', sendSimpleMessage);
    document.getElementById('claudeChatInput')?.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendSimpleMessage(); }
    });
    document.getElementById('claudeChatInput')?.addEventListener('input', e => {
        const ta = e.target;
        ta.style.height = '';
        ta.style.height = Math.min(ta.scrollHeight, 96) + 'px';
    });

    // Calendar
    document.getElementById('addCalEventBtn')?.addEventListener('click', () => {
        document.getElementById('calEventLabel').value    = '';
        document.getElementById('calEventDate').value     = '';
        document.getElementById('calEventEndDate').value  = '';
        document.getElementById('calEventCategory').value = 'personal';
        openModal('calEventModal');
        setTimeout(() => document.getElementById('calEventLabel').focus(), 60);
    });
    document.getElementById('closeCalEventModal')?.addEventListener('click',  () => closeModal('calEventModal'));
    document.getElementById('cancelCalEventModal')?.addEventListener('click', () => closeModal('calEventModal'));
    document.getElementById('saveCalEventBtn')?.addEventListener('click', addCalendarEvent);
    document.getElementById('calEventLabel')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') document.getElementById('calEventDate')?.focus();
    });

    // Close modals on backdrop click
    ['scheduleModal', 'schedCustomEventModal', 'thesisLinkModal', 'calEventModal',
     'sketchUploadModal', 'sketchExpandedModal', 'pdfSummarizeModal'].forEach(id => {
        document.getElementById(id)?.addEventListener('click', e => {
            if (e.target === document.getElementById(id)) closeModal(id);
        });
    });

    // Close modals on Escape key
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            ['scheduleModal', 'schedCustomEventModal', 'thesisLinkModal', 'calEventModal',
             'sketchUploadModal', 'sketchExpandedModal', 'pdfSummarizeModal'].forEach(id => {
                if (document.getElementById(id)?.classList.contains('open')) closeModal(id);
            });
            if (document.getElementById('apiWarningModal')?.classList.contains('open')) resolveApiWarning(false);
        }
    });

    // Files drag-and-drop upload
    bindFilesUpload();

    // Sketch Log
    bindSketchLog();

    // Nav drag-to-reorder
    initNavDragSort();
}

function closeSidebar() {
    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('overlayBg')?.classList.remove('open');
}

// Bootstrap is handled by drive.js — it calls init() after loading Drive data.
