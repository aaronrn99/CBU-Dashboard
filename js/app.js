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
    state.schedule = load('schedule', {});
    state.canvasSettings = load('canvasSettings', { url: '', token: '' });
    state.assignments    = load('assignments', []);

    setDateDisplay();
    renderAssignments();
    renderTodos();
    renderProjects();
    renderSchedule();
    renderNotes();
    bindEvents();
}

// ── Date ──────────────────────────────────────
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

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const DAY_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const TIMES = [
    '7:00 AM','8:00 AM','9:00 AM','10:00 AM','11:00 AM',
    '12:00 PM','1:00 PM','2:00 PM','3:00 PM','4:00 PM',
    '5:00 PM','6:00 PM','7:00 PM','8:00 PM',
];

let scheduleEditing = false;
let pendingSlotKey  = null;

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

    // Map each time string to its row index
    const timeIndex = {};
    TIMES.forEach((t, i) => { timeIndex[t] = i; });

    // coverage[dayIdx][timeIdx] = { block, isStart: bool }
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

    const thead = `<tr>
        <th style="min-width:72px">Time</th>
        ${DAY_FULL.map(d => `<th>${d}</th>`).join('')}
    </tr>`;

    const tbody = TIMES.map((time, ti) => {
        const cells = DAY_FULL.map((day, di) => {
            const info = coverage[di][ti];

            // This row is interior to a rowspan block above — emit nothing
            if (info && !info.isStart) return '';

            // First row of a course block — emit a spanning cell
            if (info && info.isStart) {
                const { block } = info;
                const meta = [
                    `${block.displayStart}–${block.displayEnd}`,
                    block.room,
                ].filter(Boolean).join(' · ');
                return `<td rowspan="${block.slots}" style="background:${block.bg};border-left:3px solid ${block.color};vertical-align:top;padding:10px 10px 8px;">
                    <div style="color:${block.color};font-size:11.5px;font-weight:700;letter-spacing:0.02em;line-height:1">${esc(block.code)}</div>
                    <div style="color:var(--text-1);font-size:12px;margin-top:4px;line-height:1.3">${esc(block.title)}</div>
                    <div style="color:var(--text-2);font-size:10.5px;margin-top:5px">${esc(meta)}</div>
                </td>`;
            }

            // Empty slot — editable by the user
            const key = `${day}|${time}`;
            const events = (state.schedule[key] || []).filter(Boolean);
            const evHtml = events.map(e =>
                `<div class="schedule-event ${editCls}"
                      ${scheduleEditing ? `onclick="event.stopPropagation();openScheduleSlot('${key}')"` : ''}
                 >${esc(e)}</div>`
            ).join('');
            return `<td class="${editCls}" ${scheduleEditing ? `onclick="openScheduleSlot('${key}')"` : ''}>${evHtml}</td>`;
        }).join('');
        return `<tr><td>${time}</td>${cells}</tr>`;
    }).join('');

    el.innerHTML = `
        <div class="schedule-wrapper">
            <table class="schedule-table">
                <thead>${thead}</thead>
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

    // Schedule
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

    // Close modals on backdrop click
    ['canvasModal', 'projectModal', 'scheduleModal'].forEach(id => {
        document.getElementById(id)?.addEventListener('click', e => {
            if (e.target === document.getElementById(id)) closeModal(id);
        });
    });

    // Close modals on Escape key
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            ['canvasModal', 'projectModal', 'scheduleModal'].forEach(id => {
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
