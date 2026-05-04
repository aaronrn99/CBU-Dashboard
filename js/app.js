// ================================================
//  CBU Dashboard — Architecture Fall 2026
//  app.js
// ================================================

// ── State ─────────────────────────────────────
const state = {
    todos: [],
    projects: [],
    notes: [],
    schedule: {},
    canvasSettings: { url: '', token: '' },
    assignments: [],
    thesis: { notes: [], links: [], pdfs: [] },
    calendarEvents: [],
    customEvents: [],   // shared store — synced between Schedule and Calendar tabs
};

// ── Persistence ───────────────────────────────
function save(key, data) {
    try {
        localStorage.setItem(`cbu_${key}`, JSON.stringify(data));
    } catch (e) {
        console.warn('localStorage write failed:', e);
    }
}

function load(key, fallback) {
    try {
        const raw = localStorage.getItem(`cbu_${key}`);
        return raw !== null ? JSON.parse(raw) : fallback;
    } catch {
        return fallback;
    }
}

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

// ── Init ──────────────────────────────────────
function init() {
    state.todos          = load('todos', []);
    state.projects       = load('projects', []);
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

    setDateDisplay();
    initBanner();
    initBannerImages();
    renderAssignments();
    renderTodos();
    renderProjects();
    renderSchedule();
    renderNotes();
    renderThesisNotes();
    renderThesisLinks();
    renderThesisPdfs();
    renderCalendar();
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
    schedule:    'Weekly Schedule',
    notes:       'Notes',
    thesis:      'Thesis',
    calendar:    'Calendar',
    files:       'Files',
    settings:    'Settings',
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

    if (id === 'files')    renderFiles();
    if (id === 'settings') renderSettingsSection();
}

// ── Canvas API ───────────────────────────────
async function syncCanvas() {
    const { url, token } = state.canvasSettings;
    const statusEl = document.getElementById('canvasStatus');
    const syncBtn  = document.getElementById('syncCanvas');

    if (!url || !token) {
        statusEl.className = 'canvas-status error';
        statusEl.textContent = '⚠ Canvas not configured — click "Canvas Settings" in the sidebar.';
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

        statusEl.className = 'canvas-status success';
        statusEl.textContent =
            `✓ Synced ${allAssignments.length} assignment(s) from ${courses.length} course(s) · ` +
            new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

    } catch (err) {
        statusEl.className = 'canvas-status error';
        statusEl.textContent = `⚠ ${err.message}`;
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
            <div class="empty-state-icon">📋</div>
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
                    <span>📅 ${fmtDue(a.dueAt)}</span>
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
function addTodo() {
    const input = document.getElementById('todoInput');
    const text  = input.value.trim();
    if (!text) return;

    state.todos.unshift({
        id:        Date.now(),
        text,
        priority:  document.getElementById('todoPriority').value,
        completed: false,
        createdAt: new Date().toISOString(),
    });
    save('todos', state.todos);
    input.value = '';
    renderTodos();
}

function toggleTodo(id) {
    const todo = state.todos.find(t => t.id === id);
    if (!todo) return;
    todo.completed = !todo.completed;
    save('todos', state.todos);
    renderTodos();
}

function deleteTodo(id) {
    state.todos = state.todos.filter(t => t.id !== id);
    save('todos', state.todos);
    renderTodos();
}

function renderTodos() {
    const el = document.getElementById('todoList');
    if (!el) return;

    if (!state.todos.length) {
        el.innerHTML = `<div class="empty-state">
            <div class="empty-state-icon">✓</div>
            <div class="empty-state-text">No tasks yet. Add one above!</div>
        </div>`;
        return;
    }

    const order = { high: 0, medium: 1, low: 2 };
    const sorted = [...state.todos].sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        return (order[a.priority] ?? 1) - (order[b.priority] ?? 1);
    });

    el.innerHTML = sorted.map(t => `
        <li class="todo-item${t.completed ? ' completed' : ''}">
            <div class="todo-checkbox${t.completed ? ' checked' : ''}"
                 onclick="toggleTodo(${t.id})" role="checkbox"
                 aria-checked="${t.completed}" tabindex="0"
                 onkeydown="if(event.key==='Enter'||event.key===' ')toggleTodo(${t.id})">
            </div>
            <div class="priority-dot priority-${esc(t.priority)}"></div>
            <span class="todo-text">${esc(t.text)}</span>
            <button class="btn btn-danger" onclick="deleteTodo(${t.id})" aria-label="Delete task">✕</button>
        </li>`
    ).join('');
}

// ── Studio Projects ───────────────────────────
const PHASES = ['concept', 'schematic', 'dd', 'cd', 'final'];
const PHASE_LABELS = {
    concept:   'Concept',
    schematic: 'Schematic',
    dd:        'Design Dev',
    cd:        'Const. Docs',
    final:     'Final',
};

function phaseProgress(phase) {
    const i = PHASES.indexOf(phase);
    return Math.round(((i + 1) / PHASES.length) * 100);
}

function addProject() {
    const name = document.getElementById('projectName').value.trim();
    if (!name) {
        document.getElementById('projectName').focus();
        return;
    }
    state.projects.push({
        id:          Date.now(),
        name,
        course:      document.getElementById('projectCourse').value.trim(),
        phase:       document.getElementById('projectPhase').value,
        dueDate:     document.getElementById('projectDue').value,
        description: document.getElementById('projectDesc').value.trim(),
        createdAt:   new Date().toISOString(),
    });
    save('projects', state.projects);
    closeModal('projectModal');
    clearProjectForm();
    renderProjects();
}

function advancePhase(id) {
    const p = state.projects.find(x => x.id === id);
    if (!p) return;
    const i = PHASES.indexOf(p.phase);
    if (i < PHASES.length - 1) {
        p.phase = PHASES[i + 1];
        save('projects', state.projects);
        renderProjects();
    }
}

function deleteProject(id) {
    if (!confirm('Remove this project?')) return;
    state.projects = state.projects.filter(p => p.id !== id);
    save('projects', state.projects);
    renderProjects();
}

function renderProjects() {
    const el = document.getElementById('projectsGrid');
    if (!el) return;

    if (!state.projects.length) {
        el.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
            <div class="empty-state-icon">🏗</div>
            <div class="empty-state-text">No studio projects yet. Click "+ New Project" to add one.</div>
        </div>`;
        return;
    }

    el.innerHTML = state.projects.map(p => {
        const progress = phaseProgress(p.phase);
        const phaseIdx = PHASES.indexOf(p.phase);
        const steps    = PHASES.map((ph, i) => {
            const cls = i < phaseIdx ? 'done' : i === phaseIdx ? 'active' : '';
            return `<span class="phase-step ${cls}">${PHASE_LABELS[ph]}</span>`;
        }).join('');
        const due = p.dueDate
            ? new Date(`${p.dueDate}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : null;

        return `
        <div class="project-card">
            <div class="project-card-header">
                <div>
                    <div class="project-name">${esc(p.name)}</div>
                    <div class="project-course">${esc(p.course)}</div>
                </div>
                <button class="btn btn-danger" onclick="deleteProject(${p.id})" aria-label="Remove project">✕</button>
            </div>
            <div class="phase-stepper">${steps}</div>
            <div class="progress-bar">
                <div class="progress-fill" style="width:${progress}%"></div>
            </div>
            ${p.description ? `<p class="project-desc">${esc(p.description)}</p>` : ''}
            <div class="project-footer">
                <span class="project-due">${due ? `Due: ${due}` : ''}</span>
                ${phaseIdx < PHASES.length - 1
                    ? `<button class="btn btn-ghost" style="font-size:12px;padding:5px 10px" onclick="advancePhase(${p.id})">Next Phase →</button>`
                    : `<span class="badge badge-submitted">Complete ✓</span>`}
            </div>
        </div>`;
    }).join('');
}

function clearProjectForm() {
    ['projectName', 'projectCourse', 'projectDue', 'projectDesc'].forEach(id => {
        document.getElementById(id).value = '';
    });
    document.getElementById('projectPhase').value = 'concept';
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
    const allCal = [...CBU_FALL_2026, ...state.calendarEvents];

    // ── Course-block coverage map ──────────────
    const timeIndex = {};
    TIMES.forEach((t, i) => { timeIndex[t] = i; });
    const coverage = Array.from({ length: DAY_FULL.length }, () => ({}));
    COURSE_BLOCKS.forEach(block => {
        const si = timeIndex[block.startTime];
        if (si === undefined) return;
        block.days.forEach(day => {
            const di = DAY_FULL.indexOf(day);
            if (di < 0) return;
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
            return `<div class="sched-day-badge cat-${esc(e.category)}">${esc(label)}</div>`;
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
            <div class="empty-state-icon">📝</div>
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

// IndexedDB helpers for PDF binary storage
let _pdfDB = null;

function openPdfDB() {
    return new Promise((resolve, reject) => {
        if (_pdfDB) { resolve(_pdfDB); return; }
        const req = indexedDB.open('cbu_thesis', 1);
        req.onupgradeneeded = e => e.target.result.createObjectStore('pdfs', { keyPath: 'id' });
        req.onsuccess = e => { _pdfDB = e.target.result; resolve(_pdfDB); };
        req.onerror   = () => reject(req.error);
    });
}

function idbPut(record) {
    return openPdfDB().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction('pdfs', 'readwrite');
        tx.objectStore('pdfs').put(record);
        tx.oncomplete = resolve;
        tx.onerror    = () => reject(tx.error);
    }));
}

function idbGet(id) {
    return openPdfDB().then(db => new Promise((resolve, reject) => {
        const tx  = db.transaction('pdfs', 'readonly');
        const req = tx.objectStore('pdfs').get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror   = () => reject(req.error);
    }));
}

function idbDelete(id) {
    return openPdfDB().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction('pdfs', 'readwrite');
        tx.objectStore('pdfs').delete(id);
        tx.oncomplete = resolve;
        tx.onerror    = () => reject(tx.error);
    }));
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
            <div class="empty-state-icon">📝</div>
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
            <div class="empty-state-icon">🔗</div>
            <div class="empty-state-text">No links yet. Click "+ Add Link" to save a research URL.</div>
        </div>`;
        return;
    }
    el.innerHTML = state.thesis.links.map(l => `
        <div class="link-item">
            <span class="link-icon">🔗</span>
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

// Thesis PDFs
function fmtFileSize(bytes) {
    if (bytes < 1024)    return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
}

async function handlePdfUpload(file) {
    if (!file || file.type !== 'application/pdf') {
        alert('Please select a PDF file.');
        return;
    }
    const id   = Date.now();
    const meta = { id, name: file.name, size: file.size, addedAt: new Date().toISOString() };
    try {
        const buf = await file.arrayBuffer();
        await idbPut({ id, data: buf });
        state.thesis.pdfs.unshift(meta);
        save('thesis_pdfs', state.thesis.pdfs);
        renderThesisPdfs();
    } catch (err) {
        alert(`Failed to store PDF: ${err.message}`);
    }
}

async function openThesisPdf(id) {
    try {
        const rec = await idbGet(id);
        if (!rec) { alert('PDF data not found — it may have been cleared from IndexedDB.'); return; }
        const url = URL.createObjectURL(new Blob([rec.data], { type: 'application/pdf' }));
        window.open(url, '_blank', 'noopener');
    } catch (err) {
        alert(`Could not open PDF: ${err.message}`);
    }
}

async function downloadThesisPdf(id) {
    const meta = state.thesis.pdfs.find(p => p.id === id);
    if (!meta) return;
    try {
        const rec = await idbGet(id);
        if (!rec) { alert('PDF data not found.'); return; }
        const url = URL.createObjectURL(new Blob([rec.data], { type: 'application/pdf' }));
        const a   = Object.assign(document.createElement('a'), { href: url, download: meta.name });
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
        alert(`Download failed: ${err.message}`);
    }
}

async function deleteThesisPdf(id) {
    if (!confirm('Remove this PDF from the library?')) return;
    try {
        await idbDelete(id);
        state.thesis.pdfs = state.thesis.pdfs.filter(p => p.id !== id);
        save('thesis_pdfs', state.thesis.pdfs);
        renderThesisPdfs();
    } catch (err) {
        alert(`Delete failed: ${err.message}`);
    }
}

function renderThesisPdfs() {
    const el = document.getElementById('thesisPdfsList');
    if (!el) return;
    if (!state.thesis.pdfs.length) {
        el.innerHTML = `<div class="empty-state">
            <div class="empty-state-icon">📄</div>
            <div class="empty-state-text">No PDFs yet. Click "+ Upload PDF" to add one.</div>
        </div>`;
        return;
    }
    el.innerHTML = state.thesis.pdfs.map(p => `
        <div class="pdf-item">
            <span class="pdf-icon">📄</span>
            <div class="pdf-info">
                <div class="pdf-name">${esc(p.name)}</div>
                <div class="pdf-meta">${fmtFileSize(p.size)} · Added ${fmtNoteDate(p.addedAt)}</div>
            </div>
            <div class="pdf-actions">
                <button class="btn btn-ghost" style="font-size:12px;padding:5px 10px"
                    onclick="openThesisPdf(${p.id})">Open</button>
                <button class="btn btn-ghost" style="font-size:12px;padding:5px 10px"
                    onclick="downloadThesisPdf(${p.id})">↓ Save</button>
                <button class="btn btn-danger" onclick="deleteThesisPdf(${p.id})" aria-label="Remove PDF">✕</button>
            </div>
        </div>`
    ).join('');
}

// ── Calendar ──────────────────────────────────

const CBU_FALL_2026 = [
    // Milestones — blue
    { id: 'cbu-classes-begin', date: '2026-09-08',                        label: 'Classes Begin',                  category: 'milestone', builtin: true },
    { id: 'cbu-resume',        date: '2026-12-01',                        label: 'Classes Resume',                 category: 'milestone', builtin: true },
    { id: 'cbu-closes',        date: '2026-12-11',                        label: 'Semester Closes',                category: 'milestone', builtin: true },
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
            <div class="empty-state-icon">🗓</div>
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
                    <span class="cal-label">${esc(e.label)}</span>
                    <span class="cal-cat-badge cat-${cat}">${esc(CAL_CAT_LABELS[e.category] || e.category)}</span>
                    <span class="cal-countdown ${cd.cls}">${cd.text}</span>
                    ${!e.builtin
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

// ── Files & Dropbox ───────────────────────────

let filesPathStack = [{ path: '', label: 'Dropbox' }];

function getDropboxToken() { return load('dropboxToken', ''); }

// POST to api.dropboxapi.com (JSON → JSON)
async function dropboxAPI(endpoint, body = {}) {
    const token = getDropboxToken();
    if (!token) throw new Error('No Dropbox token — go to Settings to connect.');
    const res = await fetch(`https://api.dropboxapi.com/2/${endpoint}`, {
        method:  'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
    });
    if (!res.ok) {
        let msg = `Dropbox ${res.status}`;
        try { const j = await res.json(); msg = j.error_summary || j.user_message || msg; } catch {}
        throw new Error(msg);
    }
    return res.json();
}

// POST to content.dropboxapi.com — returns raw image blob for thumbnails
async function dropboxThumbnail(path) {
    const token = getDropboxToken();
    const res = await fetch('https://content.dropboxapi.com/2/files/get_thumbnail', {
        method:  'POST',
        headers: {
            'Authorization':   `Bearer ${token}`,
            'Dropbox-API-Arg': JSON.stringify({ path, format: 'jpeg', size: 'w256h256', mode: 'strict' }),
        },
    });
    if (!res.ok) return null;
    return URL.createObjectURL(await res.blob());
}

async function dropboxTempLink(path) {
    const data = await dropboxAPI('files/get_temporary_link', { path });
    return data.link;
}

const FILE_ICONS = {
    jpg:'🖼', jpeg:'🖼', png:'🖼', gif:'🖼', webp:'🖼', svg:'🖼', heic:'🖼',
    pdf:'📄',
    doc:'📝', docx:'📝', txt:'📝', rtf:'📝', md:'📝',
    xls:'📊', xlsx:'📊', csv:'📊', numbers:'📊',
    ppt:'📊', pptx:'📊', key:'📊',
    ai:'🎨', psd:'🎨', indd:'🎨', sketch:'🎨', fig:'🎨', xd:'🎨',
    dwg:'📐', dxf:'📐', rvt:'📐',
    mp4:'🎬', mov:'🎬', avi:'🎬', mkv:'🎬',
    mp3:'🎵', wav:'🎵', aac:'🎵',
    zip:'📦', rar:'📦', '7z':'📦',
};

function fileTypeIcon(entry) {
    if (entry['.tag'] === 'folder') return '📁';
    const ext = (entry.name.split('.').pop() || '').toLowerCase();
    return FILE_ICONS[ext] || '📄';
}

function isThumbable(name) { return /\.(jpg|jpeg|png|webp|gif)$/i.test(name); }

// ── Render entry point ─────────────────────────
function renderFiles() {
    const noToken    = document.getElementById('filesNoToken');
    const browser    = document.getElementById('filesBrowser');
    const refreshBtn = document.getElementById('filesRefreshBtn');
    const hasToken   = !!getDropboxToken();
    if (noToken)    noToken.style.display    = hasToken ? 'none'  : 'block';
    if (browser)    browser.style.display    = hasToken ? 'block' : 'none';
    if (refreshBtn) refreshBtn.style.display = hasToken ? ''      : 'none';
    if (hasToken) {
        filesPathStack = [{ path: '', label: 'Dropbox' }];
        loadFilesFolder('');
    }
}

// ── Folder loading ─────────────────────────────
async function loadFilesFolder(path) {
    const grid = document.getElementById('filesGrid');
    if (!grid) return;
    grid.innerHTML = `<div class="files-loading">
        <div class="files-loading-dots"><span></span><span></span><span></span></div>Loading…</div>`;
    updateFilesBreadcrumb();
    try {
        // Dropbox requires path="" for root (not "/" or null); recursive must be explicit false
        const result = await dropboxAPI('files/list_folder', {
            path:      path === '' ? '' : path,
            recursive: false,
            limit:     100,
        });
        renderFilesGrid(result.entries || []);
    } catch (err) {
        grid.innerHTML = `<div class="empty-state">
            <div class="empty-state-icon">⚠</div>
            <div class="empty-state-text">${esc(err.message)}</div>
        </div>`;
    }
}

// ── Grid rendering ────────────────────────────
let _filesEntries = [];  // cached so the click handler can look up by idx

function renderFilesGrid(entries) {
    const grid = document.getElementById('filesGrid');
    if (!grid) return;
    if (!entries.length) {
        grid.innerHTML = `<div class="empty-state">
            <div class="empty-state-icon">📁</div>
            <div class="empty-state-text">This folder is empty.</div>
        </div>`;
        return;
    }
    const sorted = [...entries].sort((a, b) => {
        const af = a['.tag'] === 'folder', bf = b['.tag'] === 'folder';
        if (af !== bf) return af ? -1 : 1;
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
    _filesEntries = sorted;

    grid.innerHTML = sorted.map((entry, idx) => {
        const isFolder = entry['.tag'] === 'folder';
        const modified = entry.server_modified
            ? new Date(entry.server_modified).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })
            : '';
        const meta = [modified, entry.size ? fmtFileSize(entry.size) : ''].filter(Boolean).join(' · ');
        const footer = isFolder
            ? `<div class="files-card-meta">${meta}</div>`
            : `<div class="files-card-footer">
                   <span class="files-card-meta">${meta}</span>
                   <button class="files-dl-btn" data-dl-idx="${idx}" title="Download ${esc(entry.name)}" aria-label="Download">↓</button>
               </div>`;
        return `
        <div class="files-card" data-idx="${idx}"
             data-path="${esc(entry.path_lower || '')}"
             data-name="${esc(entry.name)}"
             data-folder="${isFolder ? '1' : ''}"
             title="${esc(entry.name)}">
            <div class="files-card-preview">${fileTypeIcon(entry)}</div>
            <div class="files-card-info">
                <div class="files-card-name">${esc(entry.name)}</div>
                ${footer}
            </div>
        </div>`;
    }).join('');

    // Persistent onclick — download clicks must not consume the listener
    grid.onclick = filesGridClick;

    // Async thumbnails for images
    sorted.forEach((entry, idx) => {
        if (isThumbable(entry.name) && entry.path_lower) loadThumbnailCard(entry.path_lower, idx);
    });
}

function filesGridClick(e) {
    // Download button takes priority over card navigation
    const dlBtn = e.target.closest('.files-dl-btn');
    if (dlBtn) {
        const entry = _filesEntries[+dlBtn.dataset.dlIdx];
        if (entry) downloadDropboxFile(entry.path_lower, entry.name, dlBtn);
        return;
    }
    const card = e.target.closest('.files-card');
    if (!card) return;
    const path = card.dataset.path;
    const name = card.dataset.name;
    if (card.dataset.folder) {
        filesPathStack.push({ path, label: name });
        loadFilesFolder(path);
    } else {
        openDropboxFile(path, name);
    }
}

// ── Thumbnail loading ─────────────────────────
async function loadThumbnailCard(path, idx) {
    const grid = document.getElementById('filesGrid');
    if (!grid) return;
    const preview = grid.querySelector(`[data-idx="${idx}"] .files-card-preview`);
    if (!preview) return;
    try {
        const url = await dropboxThumbnail(path);
        if (url && preview.isConnected) {
            preview.innerHTML =
                `<img src="${url}" alt="" class="files-card-thumb"
                    onerror="this.parentNode.textContent='🖼'">`;
        }
    } catch { /* keep icon */ }
}

// ── Breadcrumb ────────────────────────────────
function updateFilesBreadcrumb() {
    const el = document.getElementById('filesBreadcrumb');
    if (!el) return;
    el.innerHTML = filesPathStack.map((bc, i) => {
        const isLast = i === filesPathStack.length - 1;
        const label  = i === 0 ? `☁ ${bc.label}` : esc(bc.label);
        if (isLast) return `<span class="files-bc-item files-bc-current">${label}</span>`;
        return `<span class="files-bc-item files-bc-link" data-bc-idx="${i}">${label}</span>`
             + `<span class="files-bc-sep">›</span>`;
    }).join('');

    // Delegate breadcrumb clicks
    el.onclick = null;
    el.addEventListener('click', e => {
        const item = e.target.closest('.files-bc-link');
        if (!item) return;
        const idx = +item.dataset.bcIdx;
        filesPathStack = filesPathStack.slice(0, idx + 1);
        loadFilesFolder(filesPathStack[idx].path);
    }, { once: true });
}

// ── Open file ─────────────────────────────────
async function openDropboxFile(path, name) {
    const grid = document.getElementById('filesGrid');
    const showErr = msg => {
        if (!grid) return;
        const t = document.createElement('div');
        t.className = 'files-error-toast';
        t.textContent = `⚠ Could not open "${name}": ${msg}`;
        grid.prepend(t);
        setTimeout(() => t.remove(), 5000);
    };
    try {
        const link = await dropboxTempLink(path);
        window.open(link, '_blank', 'noopener');
    } catch (err) { showErr(err.message); }
}

// ── Download file ──────────────────────────────
async function downloadDropboxFile(path, name, btn) {
    const grid    = document.getElementById('filesGrid');
    const origLabel = btn?.textContent;

    const showErr = msg => {
        if (!grid) return;
        const t = document.createElement('div');
        t.className = 'files-error-toast';
        t.textContent = `⚠ Could not download "${name}": ${msg}`;
        grid.prepend(t);
        setTimeout(() => t.remove(), 6000);
    };

    try {
        if (btn) { btn.textContent = '…'; btn.disabled = true; }

        const token = getDropboxToken();
        if (!token) throw new Error('No Dropbox token — go to Settings to connect.');

        const res = await fetch('https://content.dropboxapi.com/2/files/download', {
            method:  'POST',
            headers: {
                'Authorization':   `Bearer ${token}`,
                'Dropbox-API-Arg': JSON.stringify({ path }),
            },
        });

        if (!res.ok) {
            let msg = `Dropbox ${res.status}`;
            try { const j = await res.json(); msg = j.error_summary || j.user_message || msg; } catch {}
            throw new Error(msg);
        }

        const blob = await res.blob();
        const url  = URL.createObjectURL(blob);
        const a    = Object.assign(document.createElement('a'), { href: url, download: name });
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
        showErr(err.message);
    } finally {
        if (btn) { btn.textContent = origLabel; btn.disabled = false; }
    }
}

// ── Settings ──────────────────────────────────

function renderSettingsSection() {
    const input = document.getElementById('dropboxTokenInput');
    const dot   = document.getElementById('dropboxDot');
    const token = getDropboxToken();
    if (input) {
        input.value       = '';
        input.placeholder = token ? 'Token saved — paste new token to replace' : 'Paste your Dropbox access token';
    }
    if (dot) dot.className = `settings-status-dot${token ? ' connected' : ''}`;
    setDropboxStatus(token ? 'saved' : '', token ? '✓ Token saved' : '');
}

function setDropboxStatus(cls, msg) {
    const el  = document.getElementById('dropboxStatusMsg');
    const dot = document.getElementById('dropboxDot');
    if (el)  { el.className = `settings-status${cls ? ' settings-status-' + cls : ''}`; el.textContent = msg; }
    if (dot) { dot.className = `settings-status-dot${cls === 'success' || cls === 'saved' ? ' connected' : cls === 'error' ? ' error' : ''}`; }
}

async function saveDropboxToken() {
    const input = document.getElementById('dropboxTokenInput');
    const raw   = input?.value?.trim();
    if (!raw) { setDropboxStatus('error', '⚠ Paste a token above first.'); return; }
    save('dropboxToken', raw);
    if (input) { input.value = ''; input.placeholder = 'Token saved — paste new token to replace'; }
    setDropboxStatus('saved', '✓ Token saved. Testing connection…');
    await testDropboxConnection();
}

async function testDropboxConnection() {
    setDropboxStatus('loading', 'Connecting to Dropbox…');
    try {
        const token = getDropboxToken();
        if (!token) throw new Error('No token saved.');
        const res = await fetch('https://api.dropboxapi.com/2/users/get_current_account', {
            method:  'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body:    'null',
        });
        if (!res.ok) {
            const j = await res.json().catch(() => ({}));
            throw new Error(j.error_summary || `Status ${res.status}`);
        }
        const user = await res.json();
        const name = user.name?.display_name || user.email || 'your account';
        setDropboxStatus('success', `✓ Connected as ${name}`);
    } catch (err) {
        setDropboxStatus('error', `⚠ ${err.message}`);
    }
}

// ── Modals ────────────────────────────────────
function openModal(id) {
    document.getElementById(id)?.classList.add('open');
}

function closeModal(id) {
    document.getElementById(id)?.classList.remove('open');
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

    // Canvas settings modal
    document.getElementById('canvasSettingsBtn')?.addEventListener('click', () => {
        document.getElementById('canvasUrl').value   = state.canvasSettings.url;
        document.getElementById('canvasToken').value = state.canvasSettings.token;
        openModal('canvasModal');
    });
    document.getElementById('closeCanvasModal')?.addEventListener('click',  () => closeModal('canvasModal'));
    document.getElementById('cancelCanvasModal')?.addEventListener('click', () => closeModal('canvasModal'));
    document.getElementById('saveCanvasSettings')?.addEventListener('click', () => {
        state.canvasSettings = {
            url:   document.getElementById('canvasUrl').value.trim(),
            token: document.getElementById('canvasToken').value.trim(),
        };
        save('canvasSettings', state.canvasSettings);
        closeModal('canvasModal');
    });

    // Canvas sync
    document.getElementById('syncCanvas')?.addEventListener('click', syncCanvas);

    // Todos
    document.getElementById('addTodoBtn')?.addEventListener('click', addTodo);
    document.getElementById('todoInput')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') addTodo();
    });

    // Projects
    document.getElementById('addProjectBtn')?.addEventListener('click', () => openModal('projectModal'));
    document.getElementById('closeProjectModal')?.addEventListener('click',  () => closeModal('projectModal'));
    document.getElementById('cancelProjectModal')?.addEventListener('click', () => closeModal('projectModal'));
    document.getElementById('saveProjectBtn')?.addEventListener('click', addProject);
    document.getElementById('projectName')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') addProject();
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
    document.getElementById('pdfUploadInput')?.addEventListener('change', e => {
        const file = e.target.files[0];
        if (file) handlePdfUpload(file);
        e.target.value = '';  // reset so the same file can be re-uploaded
    });

    // Files
    document.getElementById('filesRefreshBtn')?.addEventListener('click', () => {
        loadFilesFolder(filesPathStack[filesPathStack.length - 1].path);
    });

    // Settings — Dropbox
    document.getElementById('saveDropboxTokenBtn')?.addEventListener('click', saveDropboxToken);
    document.getElementById('testDropboxBtn')?.addEventListener('click', testDropboxConnection);
    document.getElementById('dropboxTokenInput')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') saveDropboxToken();
    });

    // Settings — Canvas (opens existing modal)
    document.getElementById('settingsCanvasBtn')?.addEventListener('click', () => {
        document.getElementById('canvasUrl').value   = state.canvasSettings.url;
        document.getElementById('canvasToken').value = state.canvasSettings.token;
        openModal('canvasModal');
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
    ['canvasModal', 'projectModal', 'scheduleModal', 'schedCustomEventModal', 'thesisLinkModal', 'calEventModal'].forEach(id => {
        document.getElementById(id)?.addEventListener('click', e => {
            if (e.target === document.getElementById(id)) closeModal(id);
        });
    });

    // Close modals on Escape key
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            ['canvasModal', 'projectModal', 'scheduleModal', 'schedCustomEventModal', 'thesisLinkModal', 'calEventModal'].forEach(id => {
                if (document.getElementById(id)?.classList.contains('open')) closeModal(id);
            });
        }
    });
}

function closeSidebar() {
    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('overlayBg')?.classList.remove('open');
}

// ── Bootstrap ────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
