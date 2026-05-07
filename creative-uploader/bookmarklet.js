(() => {
/* =========================================================
   Creative Uploader — FB Ads image uploader via Marketing API
   v0.3 — uses same API layer & token/account detection as MetaCtrl PRO
   ========================================================= */

const VERSION = 'v0.3';

// ── Same config as MetaCtrl PRO ───────────────────────────
const HOST    = 'https://adsmanager-graph.facebook.com';
const API_VER = 'v23.0';
const BASE    = `${HOST}/${API_VER}`;

// Global token injected by FB on business.facebook.com — identical to MetaCtrl PRO
const TOKEN = typeof __accessToken !== 'undefined' ? __accessToken : null;

// ── API layer — copied exactly from MetaCtrl PRO ──────────
const BASE_OPTS = {
  mode: 'cors',
  credentials: 'include',
  referrer: 'https://business.facebook.com/',
  referrerPolicy: 'origin-when-cross-origin',
};

function buildUrl(path, qsObj = {}) {
  const qs = new URLSearchParams({ ...qsObj, access_token: TOKEN }).toString();
  return `${BASE}/${path}?${qs}`;
}

async function apiGet(path, qsObj = {}) {
  const res = await fetch(buildUrl(path, qsObj), {
    ...BASE_OPTS, method: 'GET', headers: { Accept: 'application/json' },
  });
  const json = await res.json();
  if (json.error) throw new Error(`[${json.error.code}] ${json.error.message}`);
  return json;
}

async function apiPostForm(path, formData) {
  // For file uploads — FormData body, access_token appended to FormData
  formData.append('access_token', TOKEN);
  const res = await fetch(`${BASE}/${path}`, {
    ...BASE_OPTS, method: 'POST', body: formData,
  });
  const json = await res.json();
  if (json.error) throw new Error(`[${json.error.code}] ${json.error.message}`);
  return json;
}

// ── Account detection — same as MetaCtrl PRO ─────────────
function getAccountId() {
  try {
    const id = require('BusinessUnifiedNavigationContext').adAccountID;
    if (id) return String(id).replace('act_', '');
  } catch {}
  const m = location.href.match(/act_(\d+)/);
  return m ? m[1] : '';
}

// ── Upload single image ───────────────────────────────────
async function uploadImage(accountId, file) {
  const fd = new FormData();
  fd.append('filename', file, file.name);
  const result = await apiPostForm(`act_${accountId}/adimages`, fd);
  const key = Object.keys(result.images || {})[0];
  const img = result.images?.[key];
  if (!img?.hash) throw new Error('No hash in response');
  return img.hash;
}

// ── Verify token works ────────────────────────────────────
async function verifyToken() {
  if (!TOKEN) throw new Error('TOKEN not found — open Ads Manager inside Business Manager (business.facebook.com)');
  const data = await apiGet('me', { fields: 'id,name' });
  return data; // { id, name }
}

// ── State ─────────────────────────────────────────────────
const state = {
  accountId: '',
  tokenOk: false,
  tokenUser: '',
  files: [],    // { file, name, status, hash, error }
  uploading: false,
};

// ── Styles ────────────────────────────────────────────────
const STYLES = `
  #cu-wrap * { box-sizing: border-box; margin: 0; padding: 0; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  #cu-wrap {
    position: fixed; top: 0; right: 0; width: 460px; height: 100vh;
    background: #0f172a; color: #e2e8f0; border-left: 1px solid #1e293b;
    box-shadow: -8px 0 32px rgba(0,0,0,.6); z-index: 2147483647;
    display: flex; flex-direction: column; font-size: 13px;
  }
  #cu-header {
    display: flex; align-items: center; gap: 8px;
    padding: 12px 14px; border-bottom: 1px solid #1e293b;
    background: #0a0f1e; flex-shrink: 0;
  }
  #cu-title { font-size: 14px; font-weight: 600; color: #f8fafc; flex: 1; }
  #cu-version { font-size: 10px; color: #475569; }
  #cu-close {
    background: #1e293b; border: 1px solid #334155; color: #94a3b8;
    border-radius: 6px; padding: 3px 9px; cursor: pointer; font-size: 12px;
  }
  #cu-close:hover { background: #ef4444; color: #fff; border-color: #ef4444; }
  #cu-body { flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 10px; }

  /* Token + account status banner */
  #cu-auth {
    border-radius: 8px; padding: 10px 12px; font-size: 12px;
    display: flex; flex-direction: column; gap: 4px; border: 1px solid #334155;
    background: #1e293b;
  }
  #cu-auth.ok  { border-color: #16a34a; background: rgba(22,163,74,.08); }
  #cu-auth.err { border-color: #dc2626; background: rgba(220,38,38,.08); }
  #cu-auth.checking { border-color: #ca8a04; background: rgba(202,138,4,.08); }
  #cu-auth-row { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  #cu-auth-status { font-weight: 600; }
  #cu-auth-user { font-size: 11px; color: #64748b; }
  #cu-auth-acc { font-size: 11px; }
  #cu-auth-acc span { color: #60a5fa; }
  #cu-btn-recheck {
    background: #1e293b; border: 1px solid #334155; color: #94a3b8;
    border-radius: 5px; padding: 2px 8px; cursor: pointer; font-size: 11px; white-space: nowrap;
  }
  #cu-btn-recheck:hover { background: #334155; color: #e2e8f0; }

  #cu-acc-override { display: flex; gap: 6px; align-items: center; }
  #cu-acc-override label { font-size: 11px; color: #64748b; white-space: nowrap; }
  #cu-acc-input {
    flex: 1; background: #1e293b; border: 1px solid #334155; color: #e2e8f0;
    border-radius: 6px; padding: 5px 8px; font-size: 12px; outline: none;
  }
  #cu-acc-input:focus { border-color: #3b82f6; }

  #cu-drop {
    border: 2px dashed #334155; border-radius: 10px; padding: 24px 16px;
    text-align: center; cursor: pointer; transition: border-color .2s, background .2s;
    color: #475569; font-size: 12px; user-select: none;
  }
  #cu-drop.over { border-color: #3b82f6; background: rgba(59,130,246,.06); color: #93c5fd; }
  #cu-drop.has-files { border-color: #22c55e; background: rgba(34,197,94,.04); color: #86efac; }
  #cu-file-input { display: none; }

  #cu-queue { display: flex; flex-direction: column; gap: 4px; max-height: 280px; overflow-y: auto; }
  .cu-item {
    display: grid; grid-template-columns: 1fr auto auto; align-items: center;
    gap: 8px; padding: 5px 8px; background: #1e293b; border-radius: 6px;
    border: 1px solid #334155;
  }
  .cu-item-name { font-size: 11px; color: #cbd5e1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cu-item-hash { font-size: 10px; color: #475569; max-width: 110px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cu-item-status { font-size: 11px; min-width: 54px; text-align: right; }
  .s-pending   { color: #475569; }
  .s-uploading { color: #60a5fa; }
  .s-done      { color: #4ade80; }
  .s-error     { color: #f87171; }

  #cu-actions { display: flex; gap: 6px; flex-shrink: 0; flex-wrap: wrap; }
  .cu-btn {
    flex: 1; min-width: 80px; padding: 8px; border-radius: 8px; border: none; cursor: pointer;
    font-size: 12px; font-weight: 600; transition: background .15s;
  }
  .cu-btn-primary { background: #2563eb; color: #fff; }
  .cu-btn-primary:hover:not(:disabled) { background: #1d4ed8; }
  .cu-btn-primary:disabled { background: #1e3a6e; color: #475569; cursor: not-allowed; }
  .cu-btn-secondary { background: #1e293b; color: #94a3b8; border: 1px solid #334155; }
  .cu-btn-secondary:hover:not(:disabled) { background: #334155; color: #e2e8f0; }
  .cu-btn-secondary:disabled { opacity: .4; cursor: not-allowed; }
  .cu-btn-danger:hover { background: #7f1d1d; color: #fca5a5; border-color: #991b1b; }

  #cu-results {
    background: #020617; border: 1px solid #1e293b; border-radius: 6px;
    padding: 8px; font-size: 11px; color: #64748b;
    max-height: 100px; overflow-y: auto; white-space: pre; display: none;
  }

  #cu-footer { padding: 8px 14px; border-top: 1px solid #1e293b; flex-shrink: 0; }
  #cu-status-line { font-size: 11px; color: #475569; min-height: 16px; }
`;

function injectStyles() {
  if (document.getElementById('cu-styles')) return;
  const s = document.createElement('style');
  s.id = 'cu-styles';
  s.textContent = STYLES;
  document.head.appendChild(s);
}

// ── Build UI ──────────────────────────────────────────────
let wrap = null;

function buildUI() {
  injectStyles();
  document.getElementById('cu-wrap')?.remove();

  wrap = document.createElement('div');
  wrap.id = 'cu-wrap';
  wrap.innerHTML = `
    <div id="cu-header">
      <span id="cu-title">📤 Creative Uploader</span>
      <span id="cu-version">${VERSION}</span>
      <button id="cu-close">✕</button>
    </div>
    <div id="cu-body">

      <div id="cu-auth" class="checking">
        <div id="cu-auth-row">
          <span id="cu-auth-status">⟳ Checking token…</span>
          <button id="cu-btn-recheck">↺ Recheck</button>
        </div>
        <div id="cu-auth-user"></div>
        <div id="cu-auth-acc">Account: <span id="cu-auth-acc-val">detecting…</span></div>
      </div>

      <div id="cu-acc-override">
        <label>Override account ID:</label>
        <input id="cu-acc-input" type="text" placeholder="e.g. 756788239711136" />
      </div>

      <div id="cu-drop">
        <div style="font-size:22px;margin-bottom:6px">📁</div>
        Drop images here<br>
        <span style="font-size:11px;color:#334155">PNG / JPG — or click to browse</span>
      </div>
      <input type="file" id="cu-file-input" multiple accept="image/png,image/jpeg,image/gif" />

      <div id="cu-queue"></div>
      <div id="cu-results"></div>

      <div id="cu-actions">
        <button class="cu-btn cu-btn-primary" id="cu-btn-upload">⬆ Upload</button>
        <button class="cu-btn cu-btn-secondary" id="cu-btn-copy" disabled>📋 Copy hashes</button>
        <button class="cu-btn cu-btn-secondary cu-btn-danger" id="cu-btn-clear">🗑 Clear</button>
      </div>
    </div>
    <div id="cu-footer">
      <div id="cu-status-line">Creative Uploader ${VERSION}</div>
    </div>
  `;
  document.body.appendChild(wrap);
  bindEvents();
}

// ── Events ────────────────────────────────────────────────
function bindEvents() {
  wrap.querySelector('#cu-close').addEventListener('click', () => wrap.remove());

  wrap.querySelector('#cu-btn-recheck').addEventListener('click', checkAuth);

  wrap.querySelector('#cu-acc-input').addEventListener('change', e => {
    const val = e.target.value.trim().replace(/^act_/, '');
    if (val) { state.accountId = val; updateAuthPanel(); }
  });

  const drop = wrap.querySelector('#cu-drop');
  const fileInput = wrap.querySelector('#cu-file-input');
  drop.addEventListener('click', () => fileInput.click());
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); addFiles([...e.dataTransfer.files]); });
  fileInput.addEventListener('change', e => { addFiles([...e.target.files]); e.target.value = ''; });

  wrap.querySelector('#cu-btn-upload').addEventListener('click', startUpload);
  wrap.querySelector('#cu-btn-copy').addEventListener('click', copyHashes);
  wrap.querySelector('#cu-btn-clear').addEventListener('click', () => { state.files = []; renderQueue(); });
}

// ── Auth check ────────────────────────────────────────────
async function checkAuth() {
  const authEl  = wrap?.querySelector('#cu-auth');
  const statusEl = wrap?.querySelector('#cu-auth-status');
  const userEl  = wrap?.querySelector('#cu-auth-user');

  if (!authEl) return;
  authEl.className = 'checking';
  if (statusEl) statusEl.textContent = '⟳ Checking token…';
  if (userEl)   userEl.textContent = '';

  if (!TOKEN) {
    setAuth('err', '❌ Token not found', 'Open Ads Manager inside Business Manager (business.facebook.com)');
    return;
  }

  try {
    const me = await verifyToken();
    state.tokenOk = true;
    state.tokenUser = me.name;
    setAuth('ok', `✅ Token OK`, `Logged in as: ${me.name} (${me.id})`);
  } catch(e) {
    state.tokenOk = false;
    setAuth('err', `❌ Token invalid`, e.message);
  }

  // Detect account ID
  const accId = getAccountId();
  if (accId) state.accountId = accId;
  updateAuthPanel();
}

function setAuth(cls, status, user) {
  const authEl   = wrap?.querySelector('#cu-auth');
  const statusEl = wrap?.querySelector('#cu-auth-status');
  const userEl   = wrap?.querySelector('#cu-auth-user');
  if (authEl)   authEl.className = cls;
  if (statusEl) statusEl.textContent = status;
  if (userEl)   userEl.textContent = user || '';
}

function updateAuthPanel() {
  const accEl    = wrap?.querySelector('#cu-auth-acc-val');
  const accInput = wrap?.querySelector('#cu-acc-input');
  if (accEl) accEl.textContent = state.accountId ? `act_${state.accountId}` : 'not detected';
  if (accInput && !accInput.value) accInput.placeholder = state.accountId || 'e.g. 756788239711136';
  updateUploadBtn();
}

function updateUploadBtn() {
  const btn = wrap?.querySelector('#cu-btn-upload');
  if (btn) btn.disabled = state.uploading || !state.files.length || !state.tokenOk || !state.accountId;
}

// ── Files ─────────────────────────────────────────────────
const ALLOWED = new Set(['image/png','image/jpeg','image/gif']);

function addFiles(files) {
  const valid = files.filter(f => ALLOWED.has(f.type));
  if (valid.length < files.length) setStatus(`Skipped ${files.length - valid.length} non-image file(s)`);
  const existing = new Set(state.files.map(f => f.name));
  valid.forEach(f => {
    if (!existing.has(f.name)) state.files.push({ file: f, name: f.name, status: 'pending', hash: '', error: '' });
  });
  renderQueue();
  updateUploadBtn();
}

// ── Render queue ──────────────────────────────────────────
function renderQueue() {
  const drop = wrap?.querySelector('#cu-drop');
  if (drop) {
    if (state.files.length) {
      drop.className = 'has-files';
      drop.innerHTML = `<strong style="font-size:13px;color:#4ade80">${state.files.length} file${state.files.length>1?'s':''} selected</strong><br><span style="font-size:11px">drop more to add</span>`;
    } else {
      drop.className = '';
      drop.innerHTML = `<div style="font-size:22px;margin-bottom:6px">📁</div>Drop images here<br><span style="font-size:11px;color:#334155">PNG / JPG — or click to browse</span>`;
    }
  }

  const queue = wrap?.querySelector('#cu-queue');
  if (queue) {
    queue.innerHTML = '';
    state.files.forEach(f => {
      const item = document.createElement('div');
      item.className = 'cu-item';
      const statusText = { pending:'—', uploading:'⟳', done:'✓ done', error:'✗ error' }[f.status];
      const hashText = f.hash ? f.hash.slice(0,14)+'…' : (f.error ? f.error.slice(0,22) : '');
      item.innerHTML = `
        <div class="cu-item-name" title="${esc(f.name)}">${esc(f.name)}</div>
        <div class="cu-item-hash" title="${esc(f.hash||f.error||'')}">${esc(hashText)}</div>
        <div class="cu-item-status s-${f.status}">${statusText}</div>
      `;
      queue.appendChild(item);
    });
  }

  const done = state.files.filter(f => f.status === 'done');

  const results = wrap?.querySelector('#cu-results');
  if (results) {
    if (done.length) {
      results.style.display = 'block';
      results.textContent = done.map(f => `${f.name.replace(/\.[^.]+$/,'')}\n  hash: ${f.hash}`).join('\n\n');
    } else {
      results.style.display = 'none';
    }
  }

  const btnCopy = wrap?.querySelector('#cu-btn-copy');
  if (btnCopy) btnCopy.disabled = done.length === 0;

  const total = state.files.length;
  const ok    = done.length;
  const err   = state.files.filter(f => f.status === 'error').length;
  if (total) {
    setStatus(state.uploading
      ? `Uploading… ${ok+err}/${total}`
      : `${ok} uploaded${err ? ' · '+err+' failed' : ''}${total-ok-err ? ' · '+(total-ok-err)+' pending' : ''}`
    );
  }
}

// ── Upload ────────────────────────────────────────────────
async function startUpload() {
  if (state.uploading || !state.tokenOk || !state.accountId) return;

  const pending = state.files.filter(f => f.status === 'pending' || f.status === 'error');
  if (!pending.length) return;

  state.uploading = true;
  updateUploadBtn();

  for (const item of pending) {
    item.status = 'uploading';
    item.error = '';
    renderQueue();
    try {
      item.hash = await uploadImage(state.accountId, item.file);
      item.status = 'done';
    } catch(e) {
      item.status = 'error';
      item.error = e.message;
    }
    renderQueue();
    await sleep(300);
  }

  state.uploading = false;
  updateUploadBtn();
}

// ── Copy hashes ───────────────────────────────────────────
function copyHashes() {
  const done = state.files.filter(f => f.status === 'done');
  if (!done.length) return;
  const data = done.map(f => ({ name: f.name.replace(/\.[^.]+$/, ''), hash: f.hash }));
  navigator.clipboard.writeText(JSON.stringify(data, null, 2)).then(() => {
    const btn = wrap?.querySelector('#cu-btn-copy');
    if (btn) { btn.textContent = '✅ Copied!'; setTimeout(() => { btn.textContent = '📋 Copy hashes'; }, 2000); }
  });
}

// ── Helpers ───────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function setStatus(msg) { const el = wrap?.querySelector('#cu-status-line'); if (el) el.textContent = msg; }
function esc(v) { return String(v??'').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

// ── Init ──────────────────────────────────────────────────
buildUI();
checkAuth();

})();
