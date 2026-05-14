// ================================================
//  CBU Dashboard — Google Drive Storage Layer
//  Stores all state in cbu-dashboard.json in the
//  Drive AppData folder (hidden from Drive UI).
// ================================================

const DRIVE_FILE  = 'cbu-dashboard.json';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

let _token      = null;
let _fileId     = null;
let _cache      = {};
let _connected  = false;
let _flushTimer = null;

// ── Public API ─────────────────────────────────

function driveGet(key, fallback) {
    if (!_connected) {
        // Fall back to localStorage while Drive is unavailable
        const raw = localStorage.getItem('cbu_' + key);
        if (raw !== null) { try { return JSON.parse(raw); } catch { return raw; } }
        return fallback;
    }
    const v = _cache[key];
    return v !== undefined ? v : fallback;
}

function driveSet(key, data) {
    _cache[key] = data;
    if (!_connected) {
        // Mirror to localStorage so data isn't lost if Drive connects later
        try { localStorage.setItem('cbu_' + key, JSON.stringify(data)); } catch {}
        return;
    }
    _scheduleFlush();
}

// ── Boot ───────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('driveOverlayBtn')?.addEventListener('click', driveConnect);
    document.getElementById('driveSettingsConnectBtn')?.addEventListener('click', driveConnect);
    _driveInit();
});

async function _driveInit() {
    _setStatus('connecting');
    try {
        await _waitForGIS();
        await _getToken(true); // silent only — never auto-popup
        await _loadOrCreateFile();
        _migrateFromLocalStorage();
        _connected = true;
        _setStatus('connected');
        _hideOverlay();
    } catch {
        // No existing session — show overlay, let user initiate
        _setStatus('disconnected');
        _showOverlay();
    }
    // Boot the app (falls back to localStorage if Drive not connected)
    init();
    // Proactively refresh token every 45 min
    setInterval(() => _getToken(true).catch(() => {}), 45 * 60 * 1000);
}

async function driveConnect() {
    _setStatus('connecting');
    try {
        await _waitForGIS();
        await _getToken(false); // user-initiated — show account picker
        await _loadOrCreateFile();
        _migrateFromLocalStorage();
        _connected = true;
        _setStatus('connected');
        _hideOverlay();
        init(); // re-init to populate state from Drive data
    } catch (err) {
        console.warn('[Drive] Connect failed:', err.message);
        _setStatus('error');
    }
}

// ── OAuth ──────────────────────────────────────

function _waitForGIS() {
    return new Promise(resolve => {
        if (typeof google !== 'undefined') { resolve(); return; }
        const t = setInterval(() => {
            if (typeof google !== 'undefined') { clearInterval(t); resolve(); }
        }, 50);
    });
}

function _getToken(silent) {
    return new Promise((resolve, reject) => {
        const client = google.accounts.oauth2.initTokenClient({
            client_id:      CONFIG.GOOGLE_CLIENT_ID,
            scope:          DRIVE_SCOPE,
            callback:       resp => {
                if (resp.error) { reject(new Error(resp.error)); return; }
                _token = resp.access_token;
                resolve();
            },
            error_callback: err => reject(new Error(err.type || 'auth_error')),
        });
        client.requestAccessToken({ prompt: silent ? 'none' : 'select_account' });
    });
}

// ── Drive File Operations ──────────────────────

async function _loadOrCreateFile() {
    const res = await _req(
        `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name%3D%22${DRIVE_FILE}%22&fields=files(id)`,
        { method: 'GET' }
    );
    if (!res.ok) throw new Error('Drive search failed: ' + res.status);
    const { files } = await res.json();

    if (files.length) {
        _fileId = files[0].id;
        const content = await _req(
            `https://www.googleapis.com/drive/v3/files/${_fileId}?alt=media`,
            { method: 'GET' }
        );
        if (!content.ok) throw new Error('Drive read failed: ' + content.status);
        _cache = await content.json();
    } else {
        _fileId = await _createFile();
        _cache  = {};
    }
}

async function _createFile() {
    const form = new FormData();
    form.append('metadata', new Blob(
        [JSON.stringify({ name: DRIVE_FILE, parents: ['appDataFolder'] })],
        { type: 'application/json' }
    ));
    form.append('file', new Blob([JSON.stringify({})], { type: 'application/json' }));

    const res = await _req(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
        { method: 'POST', body: form }
    );
    if (!res.ok) throw new Error('Drive create failed: ' + res.status);
    const { id } = await res.json();
    return id;
}

function _scheduleFlush() {
    clearTimeout(_flushTimer);
    _flushTimer = setTimeout(_flush, 2000);
}

async function _flush() {
    if (!_token || !_fileId) return;
    _setStatus('saving');
    try {
        const res = await _req(
            `https://www.googleapis.com/upload/drive/v3/files/${_fileId}?uploadType=media`,
            {
                method:  'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify(_cache),
            }
        );
        if (!res.ok) throw new Error('HTTP ' + res.status);
        _setStatus('connected');
    } catch (err) {
        console.warn('[Drive] Flush failed:', err.message);
        _setStatus('error');
    }
}

async function _req(url, opts = {}) {
    const headers = Object.assign({ Authorization: 'Bearer ' + _token }, opts.headers || {});
    const res = await fetch(url, { ...opts, headers });
    if (res.status === 401) {
        // Token expired — silent refresh once, then retry
        try { await _getToken(true); } catch { return res; }
        return fetch(url, { ...opts, headers: { ...headers, Authorization: 'Bearer ' + _token } });
    }
    return res;
}

// ── Migration ──────────────────────────────────

function _migrateFromLocalStorage() {
    if (Object.keys(_cache).length > 0) return; // Drive already has data
    const skip = new Set(['cbu_anthropicKey', 'cbu_dropboxToken']);
    let migrated = false;
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith('cbu_') || skip.has(k)) continue;
        const raw = localStorage.getItem(k);
        if (raw === null) continue;
        const shortKey = k.slice(4); // strip 'cbu_' prefix
        try { _cache[shortKey] = JSON.parse(raw); } catch { _cache[shortKey] = raw; }
        migrated = true;
    }
    if (migrated) {
        console.info('[Drive] Migrated existing data from localStorage → Drive');
        _scheduleFlush();
    }
}

// ── Overlay ────────────────────────────────────

function _showOverlay() {
    const el = document.getElementById('driveOverlay');
    if (el) el.style.display = '';
}

function _hideOverlay() {
    const el = document.getElementById('driveOverlay');
    if (el) el.style.display = 'none';
}

// ── Status UI ──────────────────────────────────

function _setStatus(s) {
    const dot   = document.getElementById('driveStatusDot');
    const label = document.getElementById('driveStatusLabel');
    const sDot  = document.getElementById('driveSettingsDot');
    const sMsg  = document.getElementById('driveSettingsStatus');

    const titles = {
        connecting:   'Connecting to Google Drive…',
        connected:    'Google Drive synced',
        saving:       'Saving to Google Drive…',
        disconnected: 'Not connected to Google Drive',
        error:        'Google Drive error',
    };
    const labels = {
        connecting: 'Drive…', connected: 'Drive',
        saving: 'Saving…', disconnected: 'Drive', error: 'Drive error',
    };
    const sMsgs = {
        connecting:   'Connecting…',
        connected:    'Connected and syncing.',
        saving:       'Saving…',
        disconnected: 'Not connected. Click Reconnect to sign in.',
        error:        'Connection error. Click Reconnect to try again.',
    };

    if (dot)   { dot.className = 'drive-dot drive-dot--' + s; dot.title = titles[s] || ''; }
    if (label) { label.textContent = labels[s] || 'Drive'; }
    if (sDot)  { sDot.className = `settings-status-dot${s === 'connected' || s === 'saving' ? ' connected' : s === 'error' ? ' error' : ''}`; }
    if (sMsg)  { sMsg.className = `settings-status${s === 'connected' ? ' settings-status-saved' : s === 'error' ? ' settings-status-error' : ''}`; sMsg.textContent = sMsgs[s] || ''; }
}
