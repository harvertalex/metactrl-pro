(() => {
/* =========================================================
   Creative Uploader — FB Ads image uploader via Marketing API
   v0.1 — MVP: images only (PNG/JPG), drag & drop, copy hashes
   ========================================================= */

const VERSION = 'v0.2';
const API_VER = 'v23.0';
// Ads Manager uses its own graph host — required for session-auth to work
const GRAPH = 'https://adsmanager-graph.facebook.com/' + API_VER;

// ── Token extraction (4 methods, same priority as MetaCtrl PRO) ──
async function getToken() {
  // 1. FB global injected variable (most reliable on business.facebook.com)
  if (typeof __accessToken !== 'undefined' && __accessToken) return __accessToken;

  // 2. Scan all inline scripts on the page for EAAI token pattern
  for (const s of document.querySelectorAll('script:not([src])')) {
    const m = s.textContent.match(/"access_token":"(EAAI[^"]+)"/);
    if (m) return m[1];
  }

  // 3. Bootloader endpoint (works on some BM pages)
  try {
    const res = await fetch(
      'https://business.facebook.com/ajax/bootloader-endpoint/?modules=AdsCanvasComposerDialog.react&__a=1',
      { credentials: 'include' }
    );
    const txt = await res.text();
    const m = txt.match(/"access_token":"(EAAI[^"]+)"/);
    if (m) return m[1];
  } catch {}

  // 4. adsmanager async config endpoint
  try {
    const res = await fetch(
      'https://adsmanager.facebook.com/async/store/initdata/?__a=1',
      { credentials: 'include' }
    );
    const txt = await res.text();
    const m = txt.match(/"access_token":"(EAAI[^"]+)"/);
    if (m) return m[1];
  } catch {}

  return '';
}

function getAccountId() {
  // Try FB internal navigation context first (most accurate)
  try {
    for (const mod of ['AdsManagerNavigationContext','AdsManagerContext','AdsManagerRouterContext']) {
      try {
        const ctx = require(mod);
        if (ctx?.accountId) return String(ctx.accountId).replace('act_','');
        if (ctx?.selectedAccountId) return String(ctx.selectedAccountId).replace('act_','');
      } catch {}
    }
  } catch {}
  // Fallback: URL pattern ?act=123 or /act_123
  const m = location.href.match(/[?&]act=(\d+)|\/act_(\d+)/);
  if (m) return m[1] || m[2];
  return '';
}

// ── API helper ────────────────────────────────────────────
async function apiPost(path, formData) {
  const url = `${GRAPH}${path}`;
  const res = await fetch(url, { method: 'POST', body: formData });
  const json = await res.json();
  if (json.error) throw new Error(`[${json.error.code}] ${json.error.message}`);
  return json;
}

// ── Upload single image ───────────────────────────────────
async function uploadImage(token, accountId, file) {
  const fd = new FormData();
  fd.append('access_token', token);
  fd.append('filename', file, file.name);
  const result = await apiPost(`/act_${accountId}/adimages`, fd);
  // Response: { images: { filename: { hash, url, ... } } }
  const key = Object.keys(result.images || {})[0];
  const img = result.images?.[key];
  if (!img?.hash) throw new Error('No hash in response');
  return img.hash;
}

// ── UI ────────────────────────────────────────────────────
const STYLES = `
  #cu-wrap * { box-sizing: border-box; margin: 0; padding: 0; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  #cu-wrap {
    position: fixed; top: 0; right: 0; width: 480px; height: 100vh;
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
  #cu-body { flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 12px; }

  .cu-field label { display: block; font-size: 11px; color: #64748b; margin-bottom: 4px; text-transform: uppercase; letter-spacing: .5px; }
  .cu-field input {
    width: 100%; background: #1e293b; border: 1px solid #334155; color: #e2e8f0;
    border-radius: 6px; padding: 7px 10px; font-size: 12px; outline: none;
  }
  .cu-field input:focus { border-color: #3b82f6; }
  .cu-field input.ok  { border-color: #22c55e; }
  .cu-field input.err { border-color: #ef4444; }

  #cu-drop {
    border: 2px dashed #334155; border-radius: 10px; padding: 28px 16px;
    text-align: center; cursor: pointer; transition: border-color .2s, background .2s;
    color: #475569; font-size: 12px; user-select: none;
  }
  #cu-drop.over { border-color: #3b82f6; background: rgba(59,130,246,.06); color: #93c5fd; }
  #cu-drop.has-files { border-color: #22c55e; background: rgba(34,197,94,.04); color: #86efac; }
  #cu-file-input { display: none; }

  #cu-queue { display: flex; flex-direction: column; gap: 4px; }
  .cu-item {
    display: grid; grid-template-columns: 1fr auto auto; align-items: center;
    gap: 8px; padding: 6px 8px; background: #1e293b; border-radius: 6px;
    border: 1px solid #334155;
  }
  .cu-item-name { font-size: 11px; color: #cbd5e1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cu-item-status { font-size: 11px; min-width: 52px; text-align: right; }
  .cu-item-hash { font-size: 10px; color: #475569; font-family: monospace; max-width: 120px; overflow: hidden; text-overflow: ellipsis; }
  .s-pending  { color: #475569; }
  .s-uploading{ color: #60a5fa; }
  .s-done     { color: #4ade80; }
  .s-error    { color: #f87171; }

  #cu-actions { display: flex; gap: 8px; flex-shrink: 0; }
  #cu-btn-upload, #cu-btn-copy, #cu-btn-clear, #cu-btn-test {
    flex: 1; padding: 9px; border-radius: 8px; border: none; cursor: pointer;
    font-size: 12px; font-weight: 600; transition: background .15s;
  }
  #cu-btn-upload { background: #2563eb; color: #fff; }
  #cu-btn-upload:hover { background: #1d4ed8; }
  #cu-btn-upload:disabled { background: #1e3a6e; color: #475569; cursor: not-allowed; }
  #cu-btn-copy { background: #1e293b; color: #94a3b8; border: 1px solid #334155; }
  #cu-btn-copy:hover { background: #334155; color: #e2e8f0; }
  #cu-btn-copy:disabled { opacity: .4; cursor: not-allowed; }
  #cu-btn-clear { background: #1e293b; color: #94a3b8; border: 1px solid #334155; }
  #cu-btn-clear:hover { background: #7f1d1d; color: #fca5a5; border-color: #991b1b; }
  #cu-btn-test { background: #1e293b; color: #94a3b8; border: 1px solid #334155; }
  #cu-btn-test:hover { background: #334155; color: #e2e8f0; }

  #cu-footer { padding: 8px 14px; border-top: 1px solid #1e293b; flex-shrink: 0; }
  #cu-status-line { font-size: 11px; color: #475569; min-height: 16px; }

  #cu-results {
    background: #020617; border: 1px solid #1e293b; border-radius: 6px;
    padding: 8px; font-size: 11px; color: #64748b; max-height: 120px; overflow-y: auto;
    font-family: monospace; white-space: pre; display: none;
  }
`;

function injectStyles() {
  if (document.getElementById('cu-styles')) return;
  const s = document.createElement('style');
  s.id = 'cu-styles';
  s.textContent = STYLES;
  document.head.appendChild(s);
}

// ── State ─────────────────────────────────────────────────
const state = {
  token: '',
  accountId: '',
  files: [],    // { file, name, status: 'pending'|'uploading'|'done'|'error', hash, error }
  uploading: false,
};

// ── Render ────────────────────────────────────────────────
let wrap = null;

function render() {
  if (!wrap) return;

  // Token field
  const tokenInput = wrap.querySelector('#cu-token');
  if (tokenInput && document.activeElement !== tokenInput) {
    tokenInput.value = state.token;
    tokenInput.className = state.token ? 'ok' : '';
  }

  // Account field
  const accInput = wrap.querySelector('#cu-account');
  if (accInput && document.activeElement !== accInput) {
    accInput.value = state.accountId;
    accInput.className = state.accountId ? 'ok' : '';
  }

  // Drop zone
  const drop = wrap.querySelector('#cu-drop');
  if (drop) {
    if (state.files.length) {
      drop.className = 'has-files';
      drop.innerHTML = `<strong style="font-size:13px;color:#4ade80">${state.files.length} file${state.files.length>1?'s':''} selected</strong><br><span style="font-size:11px">drop more to add</span>`;
    } else {
      drop.className = '';
      drop.innerHTML = `<div style="font-size:24px;margin-bottom:6px">📁</div>Drop images here<br><span style="font-size:11px;color:#334155">PNG / JPG — or click to browse</span>`;
    }
  }

  // Queue
  const queue = wrap.querySelector('#cu-queue');
  if (queue) {
    queue.innerHTML = '';
    state.files.forEach((f, i) => {
      const item = document.createElement('div');
      item.className = 'cu-item';
      const statusText = { pending: '—', uploading: '⟳ uploading', done: '✓ done', error: '✗ error' }[f.status];
      const statusClass = `s-${f.status}`;
      const hashText = f.hash ? f.hash.slice(0,16)+'…' : (f.error ? f.error.slice(0,24) : '');
      item.innerHTML = `
        <div class="cu-item-name" title="${esc(f.name)}">${esc(f.name)}</div>
        <div class="cu-item-hash" title="${esc(f.hash||f.error||'')}">${esc(hashText)}</div>
        <div class="cu-item-status ${statusClass}">${statusText}</div>
      `;
      queue.appendChild(item);
    });
  }

  // Results box
  const results = wrap.querySelector('#cu-results');
  const done = state.files.filter(f => f.status === 'done');
  if (results) {
    if (done.length) {
      results.style.display = 'block';
      results.textContent = done.map(f => `${f.name}\n  hash: ${f.hash}`).join('\n\n');
    } else {
      results.style.display = 'none';
    }
  }

  // Buttons
  const btnUpload = wrap.querySelector('#cu-btn-upload');
  const btnCopy   = wrap.querySelector('#cu-btn-copy');
  if (btnUpload) btnUpload.disabled = state.uploading || !state.files.length || !state.token || !state.accountId;
  if (btnCopy)   btnCopy.disabled   = done.length === 0;

  // Status line
  const statusLine = wrap.querySelector('#cu-status-line');
  if (statusLine) {
    const total = state.files.length;
    const ok    = state.files.filter(f=>f.status==='done').length;
    const err   = state.files.filter(f=>f.status==='error').length;
    const prog  = state.files.filter(f=>f.status==='uploading').length;
    if (state.uploading) statusLine.textContent = `Uploading… ${ok+err}/${total} (${prog} active)`;
    else if (total) statusLine.textContent = `${ok} uploaded${err?' · '+err+' failed':''}${total-ok-err?' · '+(total-ok-err)+' pending':''}`;
    else statusLine.textContent = `Creative Uploader ${VERSION} — token auto-detected from page`;
  }
}

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

// ── Build UI ──────────────────────────────────────────────
function buildUI() {
  injectStyles();

  // Remove existing instance
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
      <div class="cu-field">
        <label>Access Token</label>
        <input id="cu-token" type="password" placeholder="auto-detected from page…" />
      </div>
      <div class="cu-field">
        <label>Ad Account ID</label>
        <input id="cu-account" type="text" placeholder="auto-detected from URL…" />
      </div>
      <div id="cu-drop">
        <div style="font-size:24px;margin-bottom:6px">📁</div>
        Drop images here<br>
        <span style="font-size:11px;color:#334155">PNG / JPG — or click to browse</span>
      </div>
      <input type="file" id="cu-file-input" multiple accept="image/png,image/jpeg,image/gif" />
      <div id="cu-queue"></div>
      <div id="cu-results"></div>
      <div id="cu-actions" style="flex-wrap:wrap;gap:6px">
        <button id="cu-btn-test">🔑 Test token</button>
        <button id="cu-btn-upload">⬆ Upload</button>
        <button id="cu-btn-copy">📋 Copy hashes</button>
        <button id="cu-btn-clear">🗑 Clear</button>
      </div>
    </div>
    <div id="cu-footer">
      <div id="cu-status-line"></div>
    </div>
  `;
  document.body.appendChild(wrap);

  bindEvents();
  render();
}

// ── Event binding ─────────────────────────────────────────
function bindEvents() {
  // Close
  wrap.querySelector('#cu-close').addEventListener('click', () => wrap.remove());

  // Token input
  wrap.querySelector('#cu-token').addEventListener('input', e => {
    state.token = e.target.value.trim();
    render();
  });

  // Account input
  wrap.querySelector('#cu-account').addEventListener('input', e => {
    state.accountId = e.target.value.trim().replace(/^act_/,'');
    render();
  });

  // Drop zone click → open file picker
  const drop = wrap.querySelector('#cu-drop');
  const fileInput = wrap.querySelector('#cu-file-input');
  drop.addEventListener('click', () => fileInput.click());
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', e => {
    e.preventDefault();
    drop.classList.remove('over');
    addFiles([...e.dataTransfer.files]);
  });

  // File picker
  fileInput.addEventListener('change', e => {
    addFiles([...e.target.files]);
    e.target.value = '';
  });

  // Test token button
  wrap.querySelector('#cu-btn-test').addEventListener('click', testToken);

  // Upload button
  wrap.querySelector('#cu-btn-upload').addEventListener('click', startUpload);

  // Copy hashes
  wrap.querySelector('#cu-btn-copy').addEventListener('click', copyHashes);

  // Clear
  wrap.querySelector('#cu-btn-clear').addEventListener('click', () => {
    state.files = [];
    render();
  });
}

// ── File management ───────────────────────────────────────
const ALLOWED = ['image/png','image/jpeg','image/gif'];

function addFiles(files) {
  const valid = files.filter(f => ALLOWED.includes(f.type));
  const skipped = files.length - valid.length;
  if (skipped) setStatus(`Skipped ${skipped} non-image file(s)`);
  const existing = new Set(state.files.map(f=>f.name));
  valid.forEach(f => {
    if (!existing.has(f.name)) state.files.push({ file: f, name: f.name, status: 'pending', hash: '', error: '' });
  });
  render();
}

// ── Test token ────────────────────────────────────────────
async function testToken() {
  setStatus('🔍 Detecting token…');
  const token = state.token || await getToken();
  if (!token) {
    setStatus('❌ Token not found. Try opening Ads Manager inside Business Manager (business.facebook.com)');
    return;
  }
  state.token = token;
  render();
  setStatus('🔍 Validating token with FB API…');
  try {
    const url = `${GRAPH}/me?fields=id,name&access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url, { credentials: 'include' });
    const json = await res.json();
    if (json.error) {
      setStatus(`❌ Token invalid: [${json.error.code}] ${json.error.message}`);
      const inp = wrap?.querySelector('#cu-token');
      if (inp) inp.classList.replace('ok','err');
    } else {
      setStatus(`✅ Token OK — logged in as: ${json.name} (${json.id})`);
      const inp = wrap?.querySelector('#cu-token');
      if (inp) { inp.classList.remove('err'); inp.classList.add('ok'); }
    }
  } catch(e) {
    setStatus(`❌ Network error: ${e.message}`);
  }
}

// ── Upload logic ──────────────────────────────────────────
async function startUpload() {
  if (state.uploading) return;

  const token = state.token || await getToken();
  if (!token) { setStatus('❌ No token — open Ads Manager inside Business Manager'); return; }
  state.token = token;

  const accountId = state.accountId || getAccountId();
  if (!accountId) { setStatus('❌ No account ID — open Ads Manager on an account page'); return; }
  state.accountId = accountId;

  const pending = state.files.filter(f => f.status === 'pending' || f.status === 'error');
  if (!pending.length) { setStatus('Nothing to upload'); return; }

  state.uploading = true;
  render();

  // Upload sequentially to avoid rate limits
  for (const item of pending) {
    item.status = 'uploading';
    item.error = '';
    render();
    try {
      item.hash = await uploadImage(token, accountId, item.file);
      item.status = 'done';
    } catch(e) {
      item.status = 'error';
      item.error = e.message;
    }
    render();
    await sleep(300);
  }

  state.uploading = false;
  render();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function setStatus(msg) {
  const el = wrap?.querySelector('#cu-status-line');
  if (el) el.textContent = msg;
}

// ── Copy hashes ───────────────────────────────────────────
function copyHashes() {
  const done = state.files.filter(f => f.status === 'done');
  if (!done.length) return;

  // Format: JSON array of objects for easy use in config
  const data = done.map(f => ({ name: f.name.replace(/\.[^.]+$/,''), hash: f.hash }));
  const text = JSON.stringify(data, null, 2);
  navigator.clipboard.writeText(text).then(() => {
    const btn = wrap?.querySelector('#cu-btn-copy');
    if (btn) { btn.textContent = '✅ Copied!'; setTimeout(() => { btn.textContent = '📋 Copy hashes'; }, 2000); }
  });
}

// ── Init ──────────────────────────────────────────────────
buildUI();

// Auto-detect token and account after render
getToken().then(t => { if (t) { state.token = t; render(); } });
const accId = getAccountId();
if (accId) { state.accountId = accId; render(); }

})();
