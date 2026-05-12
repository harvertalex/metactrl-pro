(() => {
/* =========================================================
   Creative Uploader -- FB Ads image + video uploader via Marketing API
   v0.4.3 -- back to fetch+credentials (XHR upload.progress forced CORS
            preflight which broke FB auth); indeterminate pulse bar
            during upload; verbose [CU] console logs; clickable error
            details panel under each failed file.
   ASCII-only source: index.html decodes B64 via atob() (Latin-1),
   so any multi-byte UTF-8 char (emoji/arrow/em-dash) would break.
   ========================================================= */

const VERSION = 'v0.4.3';
const LOG = (...args) => console.log('[CU]', ...args);
const WARN = (...args) => console.warn('[CU]', ...args);
const ERR  = (...args) => console.error('[CU]', ...args);

// Custom error that carries rich context (FB error fields, http status, response body)
class CUError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'CUError';
    this.details = details || {};
  }
}

// --Same config as MetaCtrl PRO ---------------------------
const HOST    = 'https://adsmanager-graph.facebook.com';
const API_VER = 'v23.0';
const BASE    = `${HOST}/${API_VER}`;

// Global token injected by FB on business.facebook.com -- identical to MetaCtrl PRO
const TOKEN = typeof __accessToken !== 'undefined' ? __accessToken : null;

// --API layer -----------------------------------------
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
  const url = buildUrl(path, qsObj);
  const safePath = path + (Object.keys(qsObj).length ? '?' + new URLSearchParams(qsObj).toString() : '');
  LOG('GET', safePath);
  const t0 = performance.now();
  let res, raw, json;
  try {
    res = await fetch(url, { ...BASE_OPTS, method: 'GET', headers: { Accept: 'application/json' } });
    raw = await res.text();
  } catch (netErr) {
    ERR('GET network failure', safePath, netErr);
    throw new CUError('Network failure: ' + netErr.message, { stage: 'get', url: safePath, netError: netErr.message });
  }
  try { json = JSON.parse(raw); } catch {
    ERR('GET non-JSON response', safePath, 'status', res.status, 'body:', raw.slice(0,500));
    throw new CUError(`HTTP ${res.status}: invalid JSON`, { stage: 'get', url: safePath, httpStatus: res.status, rawResponse: raw.slice(0,2000) });
  }
  const dt = (performance.now()-t0).toFixed(0);
  if (json.error) {
    const e = json.error;
    ERR('GET FB error', safePath, 'in', dt+'ms', e);
    throw new CUError(`[${e.code}${e.error_subcode?'/'+e.error_subcode:''}] ${e.message}`, {
      stage: 'get', url: safePath, httpStatus: res.status, durationMs: +dt,
      fbError: { code:e.code, subcode:e.error_subcode, type:e.type, message:e.message, fbtrace_id:e.fbtrace_id, user_title:e.error_user_title, user_msg:e.error_user_msg },
      rawResponse: raw.slice(0,2000),
    });
  }
  LOG('GET ok', safePath, 'in', dt+'ms');
  return json;
}

// fetch-based POST (credentialed). We CANNOT use XHR upload.progress here:
//   - Attaching xhr.upload.progress listener forces CORS preflight.
//   - FB preflight responds with Access-Control-Allow-Origin: * (no
//     Allow-Credentials). Browser then either:
//     (a) blocks if withCredentials=true (preflight policy violation), or
//     (b) sends POST without cookies if withCredentials=false, which FB
//         rejects with OAuthException code 1 "Invalid request".
//   So we trade real progress bar for working uploads. Caller can show
//   an indeterminate "pulse" bar during upload.
async function apiPostForm(path, formData) {
  formData.append('access_token', TOKEN);
  const url = `${BASE}/${path}`;
  LOG('POST', path, 'bytes:', estimateFormDataBytes(formData));
  const t0 = performance.now();
  let res, raw, json;
  try {
    res = await fetch(url, { ...BASE_OPTS, method: 'POST', body: formData });
    raw = await res.text();
  } catch (netErr) {
    ERR('POST network failure', path, netErr);
    throw new CUError('Network failure: ' + netErr.message, { stage: 'post', url: path, netError: netErr.message });
  }
  try { json = JSON.parse(raw); } catch {
    ERR('POST non-JSON response', path, 'status', res.status, 'body:', raw.slice(0,500));
    throw new CUError(`HTTP ${res.status}: invalid JSON`, { stage: 'post', url: path, httpStatus: res.status, rawResponse: raw.slice(0,2000) });
  }
  const dt = (performance.now()-t0).toFixed(0);
  if (json.error) {
    const e = json.error;
    ERR('POST FB error', path, 'in', dt+'ms', e);
    throw new CUError(`[${e.code}${e.error_subcode?'/'+e.error_subcode:''}] ${e.message}`, {
      stage: 'post', url: path, httpStatus: res.status, durationMs: +dt,
      fbError: { code:e.code, subcode:e.error_subcode, type:e.type, message:e.message, fbtrace_id:e.fbtrace_id, user_title:e.error_user_title, user_msg:e.error_user_msg },
      rawResponse: raw.slice(0,2000),
    });
  }
  LOG('POST ok', path, 'in', dt+'ms');
  return json;
}

function estimateFormDataBytes(fd) {
  let total = 0;
  for (const [, v] of fd.entries()) {
    if (v instanceof File || v instanceof Blob) total += v.size;
    else total += String(v).length;
  }
  return total;
}

// --Account detection -- same as MetaCtrl PRO -------------
function getAccountId() {
  try {
    const id = require('BusinessUnifiedNavigationContext').adAccountID;
    if (id) return String(id).replace('act_', '');
  } catch {}
  const m = location.href.match(/act_(\d+)/);
  return m ? m[1] : '';
}

// --Upload single image -----------------------------------
async function uploadImage(accountId, file) {
  LOG('uploadImage', file.name, file.size+'B', file.type);
  const fd = new FormData();
  fd.append('filename', file, file.name);
  const result = await apiPostForm(`act_${accountId}/adimages`, fd);
  const key = Object.keys(result.images || {})[0];
  const img = result.images?.[key];
  if (!img?.hash) throw new CUError('No hash in response', { stage: 'post', rawResponse: JSON.stringify(result).slice(0,2000) });
  LOG('uploadImage ok', file.name, 'hash:', img.hash);
  return img.hash;
}

// --Upload single video (non-resumable, simple POST) ------
async function uploadVideo(accountId, file) {
  LOG('uploadVideo', file.name, file.size+'B', file.type);
  const fd = new FormData();
  fd.append('source', file, file.name);
  const result = await apiPostForm(`act_${accountId}/advideos`, fd);
  if (!result?.id) throw new CUError('No video id in response', { stage: 'post', rawResponse: JSON.stringify(result).slice(0,2000) });
  LOG('uploadVideo ok', file.name, 'id:', result.id);
  return result.id;
}

// --Poll video processing status until ready --------------
// Returns when status.video_status === 'ready', throws on error/timeout.
async function waitForVideoReady(videoId, onTick) {
  const MAX_ATTEMPTS = 80;   // ~6.5 min @ 5s
  const INTERVAL_MS  = 5000;
  LOG('waitForVideoReady', videoId);
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const data = await apiGet(videoId, { fields: 'status' });
    const vs = data?.status?.video_status || 'unknown';
    LOG('poll', videoId, 'attempt', i+1, 'status:', vs);
    if (onTick) onTick(vs, i);
    if (vs === 'ready')  return;
    if (vs === 'error')  throw new CUError('FB rejected video (processing error)', { stage: 'process', videoId, rawResponse: JSON.stringify(data).slice(0,2000) });
    await sleep(INTERVAL_MS);
  }
  throw new CUError('Video processing timeout (>6 min)', { stage: 'process', videoId });
}

// --Verify token works ------------------------------------
async function verifyToken() {
  if (!TOKEN) throw new CUError('TOKEN not found -- open Ads Manager inside Business Manager (business.facebook.com)', { stage: 'auth' });
  const data = await apiGet('me', { fields: 'id,name' });
  return data; // { id, name }
}

// --State ---------------------------------------------
const state = {
  accountId: '',
  tokenOk: false,
  tokenUser: '',
  // file shape: { file, name, type, status, hash, videoId, processingStatus,
  //               error: string, errorDetails: object, expanded: bool }
  files: [],
  uploading: false,
};

// --MIME -> type mapping -----------------------------------
const IMAGE_TYPES = new Set(['image/png','image/jpeg','image/gif','image/webp']);
const VIDEO_TYPES = new Set(['video/mp4','video/quicktime','video/webm','video/x-m4v']);
function classify(mime) {
  if (IMAGE_TYPES.has(mime)) return 'image';
  if (VIDEO_TYPES.has(mime)) return 'video';
  return null;
}

// --Styles --------------------------------------------
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

  #cu-queue { display: flex; flex-direction: column; gap: 4px; max-height: 320px; overflow-y: auto; }
  .cu-item {
    display: flex; flex-direction: column; gap: 3px;
    padding: 6px 8px; background: #1e293b; border-radius: 6px;
    border: 1px solid #334155;
  }
  .cu-item-row {
    display: grid; grid-template-columns: 28px 1fr auto auto; align-items: center; gap: 8px;
  }
  .cu-item-icon {
    font-size: 9px; font-weight: 700; letter-spacing: .5px;
    text-align: center; padding: 1px 3px; border-radius: 3px;
    border: 1px solid currentColor;
  }
  .cu-item-icon.t-image { color: #60a5fa; }
  .cu-item-icon.t-video { color: #c084fc; }
  .cu-item-name { font-size: 11px; color: #cbd5e1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cu-item-meta { font-size: 10px; color: #475569; max-width: 110px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cu-item-status { font-size: 11px; min-width: 64px; text-align: right; }
  .s-pending    { color: #475569; }
  .s-uploading  { color: #60a5fa; }
  .s-processing { color: #fbbf24; }
  .s-done       { color: #4ade80; }
  .s-error      { color: #f87171; }

  /* Progress bar */
  .cu-bar {
    height: 3px; background: #0f172a; border-radius: 2px; overflow: hidden;
    margin-top: 2px;
  }
  .cu-bar-fill {
    height: 100%; width: 0%; background: #3b82f6;
    transition: width .15s linear;
  }
  .cu-bar-fill.uploading,
  .cu-bar-fill.processing {
    width: 100% !important;
    background-size: 200% 100%;
    animation: cu-pulse 1.5s linear infinite;
  }
  .cu-bar-fill.uploading {
    background: linear-gradient(90deg, #3b82f6 0%, #60a5fa 50%, #3b82f6 100%);
  }
  .cu-bar-fill.processing {
    background: linear-gradient(90deg, #fbbf24 0%, #f59e0b 50%, #fbbf24 100%);
  }
  .cu-bar-fill.done  { background: #22c55e; width: 100% !important; }
  .cu-bar-fill.error { background: #ef4444; width: 100% !important; }
  @keyframes cu-pulse { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

  /* Error details panel */
  .cu-item.has-error { border-color: #7f1d1d; }
  .cu-item-toggle {
    font-size: 10px; color: #94a3b8; cursor: pointer; margin-top: 4px;
    user-select: none; display: inline-block;
    background: #0f172a; padding: 2px 6px; border-radius: 3px;
    border: 1px solid #334155;
  }
  .cu-item-toggle:hover { background: #1e293b; color: #e2e8f0; }
  .cu-err-panel {
    margin-top: 6px; padding: 8px; background: #020617;
    border: 1px solid #7f1d1d; border-radius: 4px;
    font-size: 10.5px; line-height: 1.5; color: #cbd5e1;
    white-space: pre-wrap; word-break: break-all;
  }
  .cu-err-panel b { color: #fbbf24; font-weight: 600; }
  .cu-err-panel .k { color: #94a3b8; }
  .cu-err-panel .v { color: #e2e8f0; }
  .cu-err-panel .raw { color: #64748b; font-size: 10px; margin-top: 6px; padding-top: 6px; border-top: 1px solid #1e293b; }

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

// --Build UI ------------------------------------------
let wrap = null;

function buildUI() {
  injectStyles();
  document.getElementById('cu-wrap')?.remove();

  wrap = document.createElement('div');
  wrap.id = 'cu-wrap';
  wrap.innerHTML = `
    <div id="cu-header">
      <span id="cu-title">Creative Uploader</span>
      <span id="cu-version">${VERSION}</span>
      <button id="cu-close">X</button>
    </div>
    <div id="cu-body">

      <div id="cu-auth" class="checking">
        <div id="cu-auth-row">
          <span id="cu-auth-status">Checking token...</span>
          <button id="cu-btn-recheck">Recheck</button>
        </div>
        <div id="cu-auth-user"></div>
        <div id="cu-auth-acc">Account: <span id="cu-auth-acc-val">detecting...</span></div>
      </div>

      <div id="cu-acc-override">
        <label>Override account ID:</label>
        <input id="cu-acc-input" type="text" placeholder="e.g. 756788239711136" />
      </div>

      <div id="cu-drop">
        <div style="font-size:14px;font-weight:600;letter-spacing:2px;margin-bottom:6px;color:#475569">[ DROP ZONE ]</div>
        Drop images or videos here<br>
        <span style="font-size:11px;color:#334155">PNG / JPG / GIF / MP4 / MOV -- or click to browse</span>
      </div>
      <input type="file" id="cu-file-input" multiple accept="image/png,image/jpeg,image/gif,image/webp,video/mp4,video/quicktime,video/webm,video/x-m4v" />

      <div id="cu-queue"></div>
      <div id="cu-results"></div>

      <div id="cu-actions">
        <button class="cu-btn cu-btn-primary" id="cu-btn-upload">Upload</button>
        <button class="cu-btn cu-btn-secondary" id="cu-btn-copy" disabled>Copy hashes</button>
        <button class="cu-btn cu-btn-secondary cu-btn-danger" id="cu-btn-clear">Clear</button>
      </div>
    </div>
    <div id="cu-footer">
      <div id="cu-status-line">Creative Uploader ${VERSION}</div>
    </div>
  `;
  document.body.appendChild(wrap);
  bindEvents();
}

// --Events --------------------------------------------
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

// --Auth check --------------------------------------------
async function checkAuth() {
  const authEl  = wrap?.querySelector('#cu-auth');
  const statusEl = wrap?.querySelector('#cu-auth-status');
  const userEl  = wrap?.querySelector('#cu-auth-user');

  if (!authEl) return;
  authEl.className = 'checking';
  if (statusEl) statusEl.textContent = 'Checking token...';
  if (userEl)   userEl.textContent = '';

  if (!TOKEN) {
    setAuth('err', '[ERR] Token not found', 'Open Ads Manager inside Business Manager (business.facebook.com)');
    return;
  }

  try {
    const me = await verifyToken();
    state.tokenOk = true;
    state.tokenUser = me.name;
    setAuth('ok', `[OK] Token OK`, `Logged in as: ${me.name} (${me.id})`);
  } catch(e) {
    state.tokenOk = false;
    setAuth('err', `[ERR] Token invalid`, e.message);
  }

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
  // (no non-ASCII chars below this line)
  if (accInput && !accInput.value) accInput.placeholder = state.accountId || 'e.g. 756788239711136';
  updateUploadBtn();
}

function updateUploadBtn() {
  const btn = wrap?.querySelector('#cu-btn-upload');
  if (btn) btn.disabled = state.uploading || !state.files.length || !state.tokenOk || !state.accountId;
}

// --Files ---------------------------------------------
function addFiles(files) {
  const tagged = files.map(f => ({ file: f, type: classify(f.type) })).filter(x => x.type);
  const skipped = files.length - tagged.length;
  if (skipped) setStatus(`Skipped ${skipped} unsupported file(s)`);

  const existing = new Set(state.files.map(f => f.name));
  tagged.forEach(({ file, type }) => {
    if (existing.has(file.name)) return;
    state.files.push({
      file, name: file.name, type,
      status: 'pending',
      hash: '', videoId: '',
      processingStatus: '',
      error: '',
      errorDetails: null,
      expanded: false,
    });
  });
  LOG('addFiles +', tagged.length, 'total:', state.files.length);
  renderQueue();
  updateUploadBtn();
}

// --Render queue ------------------------------------------
function fmtSize(bytes) {
  if (bytes < 1024) return bytes + 'B';
  if (bytes < 1024*1024) return (bytes/1024).toFixed(0) + 'KB';
  return (bytes/1024/1024).toFixed(1) + 'MB';
}

function renderErrorDetails(f) {
  const d = f.errorDetails || {};
  const fb = d.fbError || {};
  const lines = [];
  lines.push(`<b>${esc(f.error || 'Error')}</b>`);
  if (d.stage)       lines.push(`<span class="k">stage:</span> <span class="v">${esc(d.stage)}</span>`);
  if (d.url)         lines.push(`<span class="k">url:</span> <span class="v">${esc(d.url)}</span>`);
  if (d.httpStatus)  lines.push(`<span class="k">http:</span> <span class="v">${d.httpStatus}</span>`);
  if (d.durationMs)  lines.push(`<span class="k">took:</span> <span class="v">${d.durationMs}ms</span>`);
  if (fb.code != null)       lines.push(`<span class="k">fb code:</span> <span class="v">${fb.code}${fb.subcode?'/'+fb.subcode:''}</span>`);
  if (fb.type)               lines.push(`<span class="k">fb type:</span> <span class="v">${esc(fb.type)}</span>`);
  if (fb.message)            lines.push(`<span class="k">fb msg:</span> <span class="v">${esc(fb.message)}</span>`);
  if (fb.user_title)         lines.push(`<span class="k">user title:</span> <span class="v">${esc(fb.user_title)}</span>`);
  if (fb.user_msg)           lines.push(`<span class="k">user msg:</span> <span class="v">${esc(fb.user_msg)}</span>`);
  if (fb.fbtrace_id)         lines.push(`<span class="k">fbtrace_id:</span> <span class="v">${esc(fb.fbtrace_id)}</span>`);
  if (d.netError)            lines.push(`<span class="k">net err:</span> <span class="v">${esc(d.netError)}</span>`);
  if (d.rawResponse) lines.push(`<div class="raw">raw response:\n${esc(d.rawResponse)}</div>`);
  return lines.join('\n');
}

function renderQueue() {
  const drop = wrap?.querySelector('#cu-drop');
  if (drop) {
    if (state.files.length) {
      const imgs = state.files.filter(f => f.type === 'image').length;
      const vids = state.files.filter(f => f.type === 'video').length;
      const parts = [];
      if (imgs) parts.push(`${imgs} image${imgs>1?'s':''}`);
      if (vids) parts.push(`${vids} video${vids>1?'s':''}`);
      drop.className = 'has-files';
      drop.innerHTML = `<strong style="font-size:13px;color:#4ade80">${parts.join(' + ')} selected</strong><br><span style="font-size:11px">drop more to add</span>`;
    } else {
      drop.className = '';
      drop.innerHTML = `<div style="font-size:14px;font-weight:600;letter-spacing:2px;margin-bottom:6px;color:#475569">[ DROP ZONE ]</div>Drop images or videos here<br><span style="font-size:11px;color:#334155">PNG / JPG / GIF / MP4 / MOV -- or click to browse</span>`;
    }
  }

  const queue = wrap?.querySelector('#cu-queue');
  if (queue) {
    queue.innerHTML = '';
    state.files.forEach(f => {
      const item = document.createElement('div');
      item.className = 'cu-item';

      const icon = f.type === 'video' ? 'VID' : 'IMG';
      let statusText, statusClass, barClass;
      switch (f.status) {
        case 'pending':
          statusText = '-'; statusClass = 's-pending'; barClass = ''; break;
        case 'uploading':
          statusText = 'uploading'; statusClass = 's-uploading'; barClass = 'uploading'; break;
        case 'processing':
          statusText = f.processingStatus || 'processing'; statusClass = 's-processing'; barClass = 'processing'; break;
        case 'done':
          statusText = 'done'; statusClass = 's-done'; barClass = 'done'; break;
        case 'error':
          statusText = 'error'; statusClass = 's-error'; barClass = 'error'; break;
      }

      let metaText = '';
      if (f.status === 'done') {
        metaText = f.type === 'video'
          ? `id:${f.videoId.slice(0,10)}...`
          : `${f.hash.slice(0,10)}...`;
      } else if (f.error) {
        metaText = f.error.slice(0,22);
      } else {
        metaText = fmtSize(f.file.size);
      }

      if (f.status === 'error') item.classList.add('has-error');
      const showBar = (f.status !== 'pending');
      const showErrToggle = (f.status === 'error');
      item.innerHTML = `
        <div class="cu-item-row">
          <div class="cu-item-icon t-${f.type}">${icon}</div>
          <div class="cu-item-name" title="${esc(f.name)}">${esc(f.name)}</div>
          <div class="cu-item-meta" title="${esc(f.hash||f.videoId||f.error||'')}">${esc(metaText)}</div>
          <div class="cu-item-status ${statusClass}">${statusText}</div>
        </div>
        ${showBar ? `<div class="cu-bar"><div class="cu-bar-fill ${barClass}"></div></div>` : ''}
        ${showErrToggle ? `<div class="cu-item-toggle" data-name="${esc(f.name)}">${f.expanded ? '[-] hide details' : '[+] show details'}</div>` : ''}
        ${showErrToggle && f.expanded ? `<div class="cu-err-panel">${renderErrorDetails(f)}</div>` : ''}
      `;
      if (showErrToggle) {
        item.querySelector('.cu-item-toggle')?.addEventListener('click', () => {
          f.expanded = !f.expanded;
          renderQueue();
        });
      }
      queue.appendChild(item);
    });
  }

  const done = state.files.filter(f => f.status === 'done');

  const results = wrap?.querySelector('#cu-results');
  if (results) {
    if (done.length) {
      results.style.display = 'block';
      results.textContent = done.map(f => {
        const id = f.type === 'video' ? `videoId: ${f.videoId}` : `hash: ${f.hash}`;
        return `${f.name.replace(/\.[^.]+$/,'')}\n  ${id}`;
      }).join('\n\n');
    } else {
      results.style.display = 'none';
    }
  }

  const btnCopy = wrap?.querySelector('#cu-btn-copy');
  if (btnCopy) btnCopy.disabled = done.length === 0 || state.uploading;

  const total = state.files.length;
  const ok    = done.length;
  const err   = state.files.filter(f => f.status === 'error').length;
  if (total) {
    setStatus(state.uploading
      ? `Working... ${ok+err}/${total}`
      : `${ok} done${err ? ' | '+err+' failed' : ''}${total-ok-err ? ' | '+(total-ok-err)+' pending' : ''}`
    );
  }
}

// --Upload --------------------------------------------
async function startUpload() {
  if (state.uploading || !state.tokenOk || !state.accountId) return;

  const pending = state.files.filter(f => f.status === 'pending' || f.status === 'error');
  if (!pending.length) return;

  state.uploading = true;
  updateUploadBtn();

  for (const item of pending) {
    item.status = 'uploading';
    item.error = '';
    item.errorDetails = null;
    renderQueue();
    try {
      if (item.type === 'video') {
        const vidId = await uploadVideo(state.accountId, item.file);
        item.videoId = vidId;
        item.status = 'processing';
        item.processingStatus = 'processing';
        renderQueue();
        await waitForVideoReady(vidId, vs => {
          item.processingStatus = vs;
          renderQueue();
        });
        item.status = 'done';
      } else {
        item.hash = await uploadImage(state.accountId, item.file);
        item.status = 'done';
      }
    } catch(e) {
      item.status = 'error';
      item.error = e.message;
      item.errorDetails = (e instanceof CUError) ? e.details : { message: e.message, stack: e.stack };
      ERR('upload failed', item.name, item.error, item.errorDetails);
    }
    renderQueue();
    await sleep(200);
  }

  state.uploading = false;
  updateUploadBtn();
  renderQueue();
}

// --Copy hashes -------------------------------------------
function copyHashes() {
  const done = state.files.filter(f => f.status === 'done');
  if (!done.length) return;
  const data = done.map(f => {
    const base = { name: f.name.replace(/\.[^.]+$/, '') };
    return f.type === 'video'
      ? { ...base, videoId: f.videoId }
      : { ...base, imageHash: f.hash };
  });
  navigator.clipboard.writeText(JSON.stringify(data, null, 2)).then(() => {
    const btn = wrap?.querySelector('#cu-btn-copy');
    if (btn) { btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = 'Copy hashes'; }, 2000); }
  });
}

// --Helpers -------------------------------------------
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function setStatus(msg) { const el = wrap?.querySelector('#cu-status-line'); if (el) el.textContent = msg; }
function esc(v) { return String(v??'').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

// --Init ----------------------------------------------
buildUI();
checkAuth();

})();
