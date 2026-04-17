(() => {
/* =========================================================
   FB Autorules — PRO Rules Generator + Rules Manager (2026-03, v24.0)
   Fixes vs v23:
   ▸ Dark UI theme throughout (consistent with Status Center)
   ▸ Collapsible sections + rule cards with descriptions
   ▸ Quick presets: Conservative / Moderate / Aggressive
   ▸ RECOVERY_MULT exposed in UI (was hardcoded 0.9)
   ▸ New rules: CTR Guard, Frequency Burn
   ▸ withEntityKeyword() — single return type, removes 80+ lines of branching
   ▸ API.getAllPages — injects access_token into paginated URLs
   ▸ Rules.delete — uses HTTP DELETE instead of POST method override
   ▸ require("BusinessUnifiedNavigationContext") wrapped in try/catch
   ▸ execIncreaseBudgetByAmount — fixed mixed indentation
   ========================================================= */

/* -------------------- CONFIG -------------------- */
const CONFIG = {
  VERSION: 'v23.0',
  HOST:    'https://adsmanager-graph.facebook.com',
  RATE_MS: 3000,          // delay between each rule POST (increased to avoid #17 on 5+ accounts)
  ACCOUNT_PAUSE_MS: 8000,       // extra pause between accounts
  ACCOUNT_BATCH_SIZE: 5,        // pause for longer every N accounts
  ACCOUNT_BATCH_PAUSE_MS: 300000, // 5 min pause after every BATCH_SIZE accounts
  BACKOFF_BASE_MS: 20000,
  MAX_RETRIES: 5
};

const TOKEN = typeof __accessToken !== 'undefined' ? __accessToken : null;

/* -------------------- HELPERS -------------------- */
function escapeHtml(s) {
  return (''+s).replace(/[&<>"']/g, m =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[m])
  );
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* -------------------- STATUS CENTER -------------------- */
function createStatusCenter() {
  const wrap = document.createElement('div');
  Object.assign(wrap.style, {
    position:'fixed', right:'18px', bottom:'18px', width:'520px',
    maxWidth:'96vw', maxHeight:'60vh', display:'none',
    background:'#0f172a', color:'#e5e7eb', border:'1px solid #334155',
    borderRadius:'12px', boxShadow:'0 14px 40px rgba(0,0,0,.5)', zIndex:'2000000002',
    font:'12px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace'
  });
  wrap.innerHTML = `
    <div id="sc-head" style="display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #334155;cursor:move">
      <strong id="sc-title" style="font-size:12px">Status</strong>
      <span id="sc-count" style="opacity:.6;font-size:11px"></span>
      <div style="margin-left:auto;display:flex;gap:6px">
        <button id="sc-collapse" style="background:#1e293b;border:1px solid #334155;color:#e5e7eb;border-radius:6px;padding:2px 8px;cursor:pointer;font-size:12px">–</button>
        <button id="sc-clear"    style="background:#1e293b;border:1px solid #334155;color:#e5e7eb;border-radius:6px;padding:2px 8px;cursor:pointer;font-size:12px">Clear</button>
        <button id="sc-close"   style="background:#ef4444;border:1px solid #b91c1c;color:#fff;border-radius:6px;padding:2px 8px;cursor:pointer;font-size:12px">✕</button>
      </div>
    </div>
    <div id="sc-body" style="padding:8px 10px;overflow:auto;max-height:40vh"></div>
    <div id="sc-foot" style="padding:6px 10px;border-top:1px solid #334155;font-size:11px;opacity:.5">OK=green  WARN=orange  ERROR=red — drag by header</div>`;
  document.body.appendChild(wrap);

  const body   = wrap.querySelector('#sc-body');
  const title  = wrap.querySelector('#sc-title');
  const countEl= wrap.querySelector('#sc-count');
  let total=0, ok=0, warn=0, err=0;

  const colorFor = t => t==='error'?'#fca5a5':t==='warning'?'#fcd34d':t==='success'?'#86efac':'#cbd5e1';
  const iconFor  = t => t==='error'?'⛔':t==='warning'?'⚠️':t==='success'?'✅':'·';

  const sc = {
    show(t){ title.textContent=t||'Status'; wrap.style.display='block'; sc._upd(); },
    hide(){ wrap.style.display='none'; },
    clear(){ body.innerHTML=''; total=ok=warn=err=0; sc._upd(); },
    setTitle(t){ title.textContent=t; },
    _upd(){ countEl.textContent=`${ok}✅ ${warn}⚠️ ${err}⛔ / ${total} total`; },
    log(msg, type='info'){
      total++;
      if (type==='success') ok++; else if (type==='warning') warn++; else if (type==='error') err++;
      const ln = document.createElement('div');
      ln.style.cssText = 'margin:3px 0;white-space:pre-wrap';
      ln.innerHTML = `<span style="opacity:.45">${new Date().toLocaleTimeString()}</span> ${iconFor(type)} <span style="color:${colorFor(type)}">${escapeHtml(msg)}</span>`;
      body.appendChild(ln);
      body.scrollTop = body.scrollHeight;
      sc._upd();
    },
    mountDrag(){
      const head = wrap.querySelector('#sc-head');
      let sx=0,sy=0,ox=0,oy=0,dragging=false;
      head.addEventListener('mousedown', e => {
        dragging=true; sx=e.clientX; sy=e.clientY;
        const r=wrap.getBoundingClientRect(); ox=r.left; oy=r.top; e.preventDefault();
      });
      window.addEventListener('mousemove', e => {
        if (!dragging) return;
        Object.assign(wrap.style, { left:(ox+e.clientX-sx)+'px', top:(oy+e.clientY-sy)+'px', right:'auto', bottom:'auto' });
      });
      window.addEventListener('mouseup', () => dragging=false);
    },
    mountButtons(){
      wrap.querySelector('#sc-close').onclick = () => sc.hide();
      wrap.querySelector('#sc-clear').onclick = () => sc.clear();
      const bodyEl = wrap.querySelector('#sc-body');
      const footEl = wrap.querySelector('#sc-foot');
      let col = false;
      wrap.querySelector('#sc-collapse').onclick = () => {
        col = !col;
        bodyEl.style.display = col ? 'none' : 'block';
        footEl.style.display = col ? 'none' : 'block';
      };
    }
  };
  return sc;
}

const STATUS = createStatusCenter();
STATUS.mountButtons();
STATUS.mountDrag();

/* -------------------- CURRENCY -------------------- */
const CURRENCY_FIELDS = [
  'spent','today_spent','cost_per_purchase_fb','cost_per_add_to_cart_fb',
  'cost_per_complete_registration_fb','cost_per_view_content_fb','cost_per_search_fb',
  'cost_per_initiate_checkout_fb','cost_per_lead_fb','cost_per_add_payment_info_fb',
  'cost_per_link_click','cpc','cpm','budget','daily_budget'
];
const CURRENCY_OFFSETS = {
  'DZD':100,'ARS':100,'AUD':100,'BHD':100,'BDT':100,'BOB':100,'BGN':100,'BRL':100,'GBP':100,
  'CAD':100,'CLP':1,'CNY':100,'COP':1,'CRC':1,'HRK':100,'CZK':100,'DKK':100,'EGP':100,'EUR':100,
  'GTQ':100,'HNL':100,'HKD':100,'HUF':1,'ISK':1,'INR':100,'IDR':1,'ILS':100,'JPY':1,'JOD':100,
  'KES':100,'KRW':1,'LVL':100,'LTL':100,'MOP':100,'MYR':100,'MXN':100,'NZD':100,'NIO':100,'NGN':100,
  'NOK':100,'PKR':100,'PYG':1,'PEN':100,'PHP':100,'PLN':100,'QAR':100,'RON':100,'RUB':100,'SAR':100,
  'RSD':100,'SGD':100,'SKK':100,'ZAR':100,'SEK':100,'CHF':100,'TWD':1,'THB':100,'TRY':100,'AED':100,
  'UAH':100,'USD':100,'UYU':100,'VEF':100,'VND':1,'FBZ':100,'VES':100
};

/* -------------------- API LAYER -------------------- */
const API = {
  baseUrl: `${CONFIG.HOST}/${CONFIG.VERSION}`,

  _rewriteHost(url) {
    try {
      const u = new URL(url);
      if (u.hostname === 'graph.facebook.com') u.hostname = 'adsmanager-graph.facebook.com';
      return u.toString();
    } catch { return url; }
  },

  // FIX: build URL correctly for both absolute (paginated) and relative paths,
  //      and ensure access_token is always present
  _buildUrl(pathOrUrl, qsObj = {}) {
    if (pathOrUrl.startsWith('http')) {
      try {
        const u = new URL(this._rewriteHost(pathOrUrl));
        if (!u.searchParams.has('access_token')) u.searchParams.set('access_token', TOKEN);
        Object.entries(qsObj).forEach(([k, v]) => u.searchParams.set(k, v));
        return u.toString();
      } catch { return pathOrUrl; }
    }
    const qs = new URLSearchParams({ ...qsObj, access_token: TOKEN }).toString();
    return `${this.baseUrl}/${pathOrUrl}?${qs}`;
  },

  _baseOpts: {
    mode: 'cors',
    credentials: 'include',
    referrer: 'https://business.facebook.com/',
    referrerPolicy: 'origin-when-cross-origin'
  },

  async get(pathOrUrl, qsObj = {}) {
    const res = await fetch(this._buildUrl(pathOrUrl, qsObj), {
      ...this._baseOpts, method: 'GET', headers: { 'Accept': 'application/json' }
    });
    return res.json();
  },

  // getRaw: passes rawQs literally (no URLSearchParams encoding).
  // Required for Facebook's fields=["..."] array notation which breaks when encoded.
  async getRaw(path, rawQs) {
    const url = `${this.baseUrl}/${path}?${rawQs}&access_token=${encodeURIComponent(TOKEN)}`;
    const res = await fetch(url, {
      ...this._baseOpts, method: 'GET', headers: { 'Accept': 'application/json' }
    });
    return res.json();
  },

  async post(path, bodyObj = {}) {
    const body = new URLSearchParams({ ...bodyObj, access_token: TOKEN }).toString();
    const res = await fetch(`${this.baseUrl}/${path}`, {
      ...this._baseOpts, method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body
    });
    return res.json();
  },

  // FIX: use proper HTTP DELETE instead of POST method override
  async del(ruleId) {
    const url = `${this.baseUrl}/${ruleId}?access_token=${encodeURIComponent(TOKEN)}`;
    const res = await fetch(url, {
      ...this._baseOpts, method: 'DELETE', headers: { 'Accept': 'application/json' }
    });
    return res.json();
  },

  async getAllPages(path, qsObj = {}) {
    let items = [], page = await this.get(path, qsObj);
    items = items.concat(page.data || []);
    while (page?.paging?.next) {
      // FIX: _buildUrl now injects token into paginated absolute URLs
      page = await this.get(page.paging.next);
      items = items.concat(page.data || []);
    }
    return items;
  }
};

/* -------------------- RULES CRUD -------------------- */
const Rules = {
  async list(accountId) {
    const data = await API.getAllPages(`act_${accountId}/adrules_library`, {
      fields: 'id,name,evaluation_spec,execution_spec,schedule_spec,status', limit: 100
    });
    return { data };
  },

  async delete(_accountId, ruleId) {
    return API.del(ruleId); // FIX: was POST with method=delete override
  },

  async clear(accountId, logFn = (() => {})) {
    const { data: list = [] } = await this.list(accountId);
    if (!list.length) return;
    logFn(`Deleting ${list.length} rules from act_${accountId}…`);
    for (const r of list) {
      const res = await this.delete(accountId, r.id);
      if (res?.error) logFn(`Error deleting ${r.name || r.id}: ${res.error.message}`, 'error');
      else            logFn(`Deleted: ${r.name || r.id}`, 'success');
    }
  },

  async addWithBackoff(accountId, name, evaluation_spec, execution_spec, schedule_spec, logFn = (() => {})) {
    const body = {
      locale: 'en_US', name,
      evaluation_spec: JSON.stringify(evaluation_spec),
      execution_spec:  JSON.stringify(execution_spec),
      schedule_spec:   JSON.stringify(schedule_spec),
      status: 'ENABLED'
    };
    await sleep(CONFIG.RATE_MS + Math.random() * 800);
    for (let attempt = 0; attempt < CONFIG.MAX_RETRIES; attempt++) {
      try {
        const json = await API.post(`act_${accountId}/adrules_library`, body);
        if (!json?.error) { logFn(`OK   ${name}`, 'success'); return json; }
        const msg = json.error?.error_user_msg || json.error?.message || '';
        if (/misusing this feature|temporarily blocked|too fast|rate|user request limit|#17|code.*17\b/i.test(msg) || json.error?.code === 17 || json.error?.error_subcode === 17) {
          const wait = CONFIG.BACKOFF_BASE_MS * (attempt + 1);
          logFn(`RATE-LIMIT "${name}". Retry ${attempt+1}/${CONFIG.MAX_RETRIES} in ~${Math.round(wait/1000)}s…`, 'warning');
          await sleep(wait + Math.random() * 5000);
          continue;
        }
        logFn(`ERROR ${name}: ${msg}`, 'error');
        return json;
      } catch (e) {
        const wait = CONFIG.BACKOFF_BASE_MS * (attempt + 1);
        logFn(`NETWORK "${name}": ${e.message}. Retry in ~${Math.round(wait/1000)}s…`, 'warning');
        await sleep(wait);
      }
    }
    logFn(`ERROR ${name}: retries exhausted.`, 'error');
    return { error: { message: 'retries exhausted' } };
  }
};

/* -------------------- SCHEDULE UTILS -------------------- */
function parseTimeToMinutes(val) {
  const s = (val || '').trim();
  if (!s) return null;
  if (/^\d{1,2}$/.test(s)) return Math.floor(parseInt(s, 10) * 60 / 30) * 30;
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = +m[1], mi = +m[2];
  if (h < 0 || h > 23 || mi < 0 || mi > 59) return null;
  return Math.floor((h * 60 + mi) / 30) * 30;
}

const META_MIN = 0, META_MAX = 1410, META_LAST_START = 1380, STEP = 30;

function clampToSlotStart(m) {
  if (m == null || isNaN(m)) return null;
  let x = ((m % 1440) + 1440) % 1440;
  x = Math.floor(x / STEP) * STEP;
  return Math.min(Math.max(x, META_MIN), META_LAST_START);
}
function clampToEnd(m) {
  if (m == null || isNaN(m)) return null;
  let x = ((m % 1440) + 1440) % 1440;
  x = Math.floor(x / STEP) * STEP;
  return Math.min(Math.max(x, META_MIN), META_MAX);
}

function allWeekCustomSchedule(minute) {
  const start = clampToSlotStart(minute);
  const end = Math.min(start + STEP, META_MAX);
  return {
    schedule_type: 'CUSTOM',
    schedule: [0,1,2,3,4,5,6].map(d => ({ start_minute: start, end_minute: end, days: [d] }))
  };
}

function scheduleAtHours(hoursArr) {
  return {
    schedule_type: 'CUSTOM',
    schedule: hoursArr.flatMap(h => {
      const st = clampToSlotStart(h * 60);
      const en = Math.min(st + STEP, META_MAX);
      return [0,1,2,3,4,5,6].map(d => ({ start_minute: st, end_minute: en, days: [d] }));
    })
  };
}

// Convert total minutes → "HH:MM" string for rule title display
function minutesToTimeStr(m) {
  if (m == null) return '??:??';
  const h = Math.floor(m / 60) % 24;
  const mi = m % 60;
  return `${String(h).padStart(2,'0')}:${String(mi).padStart(2,'0')}`;
}

// One-shot daily schedule: fires once per day at the given minute slot
function scheduleAtMinute(minute) {
  return allWeekCustomSchedule(minute);
}

function semiHourlyWindow(onMinute, offMinute) {
  const hasOn  = onMinute  != null && !isNaN(onMinute);
  const hasOff = offMinute != null && !isNaN(offMinute);
  if (!hasOn && !hasOff) return { schedule_type: 'SEMI_HOURLY' };

  const start = hasOn  ? clampToSlotStart(onMinute) : META_MIN;
  const end   = hasOff ? clampToEnd(offMinute)       : META_MAX;
  const slots = [];
  const addSlot = (day, st) => {
    const s = clampToSlotStart(st);
    slots.push({ start_minute: s, end_minute: Math.min(s + STEP, META_MAX), days: [day] });
  };
  for (let d = 0; d < 7; d++) {
    if (hasOn && hasOff && start > end) {
      for (let m = start; m <= META_LAST_START; m += STEP) addSlot(d, m);
      for (let m = META_MIN; m < end; m += STEP) addSlot(d, m);
    } else {
      for (let m = start; m < end; m += STEP) addSlot(d, m);
    }
  }
  return { schedule_type: 'CUSTOM', schedule: slots };
}

function normalizeScheduleSpec(spec) {
  try {
    const s = typeof spec === 'string' ? JSON.parse(spec) : spec;
    if (!s || s.schedule_type !== 'CUSTOM' || !Array.isArray(s.schedule)) return spec;
    s.schedule = s.schedule.map(win => {
      let st = clampToSlotStart(+win.start_minute || 0);
      let en = clampToEnd(+win.end_minute || 0);
      if (en <= st) en = Math.min(st + STEP, META_MAX);
      if (en > META_MAX) en = META_MAX;
      return { start_minute: st, end_minute: en, days: Array.isArray(win.days) ? win.days : [0] };
    });
    return s;
  } catch { return spec; }
}

/* -------------------- CURRENCY HELPERS -------------------- */
function toUSDMinor(valMinor, rate, accCur) {
  const off = CURRENCY_OFFSETS[accCur] ?? 100;
  return Math.round((valMinor / off) / (rate || 1) * (CURRENCY_OFFSETS['USD'] ?? 100));
}
function fromUSDMinor(valUSDMinor, rate, accCur) {
  const off = CURRENCY_OFFSETS[accCur] ?? 100;
  return Math.round((valUSDMinor / 100) * (rate || 1) * off);
}
function convertRuleToUSD(rule, rate = 1, currency = 'USD') {
  if (rate === 1 && currency === 'USD') return rule;
  const r = JSON.parse(JSON.stringify(rule));
  const ev = typeof r.evaluation_spec === 'string' ? JSON.parse(r.evaluation_spec) : r.evaluation_spec;
  ev?.filters?.forEach(f => {
    if (CURRENCY_FIELDS.includes(f.field) && isFinite(+f.value))
      f.value = toUSDMinor(+f.value, rate, currency);
  });
  r.evaluation_spec = ev;
  return r;
}
function convertRuleFromUSD(rule, rate = 1, currency = 'USD') {
  if (rate === 1 && currency === 'USD') return rule;
  const r = JSON.parse(JSON.stringify(rule));
  const ev = typeof r.evaluation_spec === 'string' ? JSON.parse(r.evaluation_spec) : r.evaluation_spec;
  ev?.filters?.forEach(f => {
    if (CURRENCY_FIELDS.includes(f.field) && isFinite(+f.value))
      f.value = fromUSDMinor(+f.value, rate, currency);
  });
  r.evaluation_spec = ev;
  r.schedule_spec = normalizeScheduleSpec(r.schedule_spec);
  return r;
}

/* -------------------- GLOBAL STATE -------------------- */
let ACCOUNTS_CACHE = [];

/* -------------------- ACCOUNTS LOADING -------------------- */
async function loadAllAccountsWithRules(log = (() => {})) {
  log('Loading accounts…');
  const items = await API.getAllPages('me/adaccounts', {
    fields: 'id,name,account_status,currency,account_currency_ratio_to_usd,adrules_library.limit(100){id}',
    limit: 100
  });
  ACCOUNTS_CACHE = (items || []).map(acc => ({
    id: (acc.id || '').replace('act_', ''),
    name: acc.name || acc.id,
    status: acc.account_status,
    currency: acc.currency || 'USD',
    conversionRate: acc.account_currency_ratio_to_usd || 1,
    ruleCount: acc.adrules_library?.data?.length || 0
  }));
  log(`Loaded ${ACCOUNTS_CACHE.length} accounts.`, 'success');
  return ACCOUNTS_CACHE;
}

/* -------------------- EXPORT / IMPORT -------------------- */
async function exportAutorules(accountId, log = (() => {})) {
  const acc = ACCOUNTS_CACHE.find(a => a.id === accountId);
  const currency = acc?.currency || 'USD';
  const rate     = acc?.conversionRate || 1;
  log(`Exporting rules from act_${accountId} (${currency}, rate=${rate})…`);
  const { data: list = [] } = await Rules.list(accountId);
  if (!list.length) { log('No autorules found.', 'warning'); return; }
  const rulesInUSD = list.map(rule => convertRuleToUSD({
    id: rule.id, name: rule.name, status: rule.status || 'ENABLED',
    evaluation_spec: typeof rule.evaluation_spec === 'string' ? JSON.parse(rule.evaluation_spec) : rule.evaluation_spec,
    execution_spec:  typeof rule.execution_spec  === 'string' ? JSON.parse(rule.execution_spec)  : rule.execution_spec,
    schedule_spec:   normalizeScheduleSpec(typeof rule.schedule_spec === 'string' ? JSON.parse(rule.schedule_spec) : rule.schedule_spec)
  }, rate, currency));
  const payload = {
    rules: rulesInUSD,
    metadata: { exportDate: new Date().toISOString(), sourceAccountId: accountId, sourceCurrency: currency, conversionRate: rate, apiVersion: CONFIG.VERSION }
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: `autorules_${accountId}_${new Date().toISOString().slice(0,10)}.json` });
  a.click(); URL.revokeObjectURL(url);
  log(`Exported ${rulesInUSD.length} rules to JSON.`, 'success');
}

async function importRulesToAccount(accountId, rules, clearExisting, log = (() => {})) {
  const acc = ACCOUNTS_CACHE.find(a => a.id === accountId);
  const currency = acc?.currency || 'USD';
  const rate     = acc?.conversionRate || 1;
  const name     = acc?.name || accountId;
  log(`Import → act_${accountId} (${name}), currency=${currency}, rate=${rate}`);
  if (clearExisting) await Rules.clear(accountId, log);
  let ok = 0;
  for (const rule of rules) {
    try {
      const conv = convertRuleFromUSD(rule, rate, currency);
      delete conv.id;
      const { evaluation_spec: ev, execution_spec: ex, name: title = 'Imported Rule' } = conv;
      const sc = normalizeScheduleSpec(conv.schedule_spec);
      if (!ev || !ex || !sc) { log(`Skip "${title}": missing specs`, 'warning'); continue; }
      const res = await Rules.addWithBackoff(accountId, title, ev, ex, sc, log);
      if (!res?.error) ok++;
    } catch (e) { log(`Error: ${e.message || e}`, 'error'); }
  }
  log(`Imported ${ok}/${rules.length} rules into ${name}`, 'success');
  const idx = ACCOUNTS_CACHE.findIndex(a => a.id === accountId);
  if (idx >= 0) ACCOUNTS_CACHE[idx].ruleCount = clearExisting ? ok : ACCOUNTS_CACHE[idx].ruleCount + ok;
}

/* -------------------- INJECT STYLES -------------------- */
if (!document.getElementById('ar-styles')) {
  const st = document.createElement('style');
  st.id = 'ar-styles';
  st.textContent = `
    #ar-modal { --bg:#0f172a; --surf:#1e293b; --card:#162032; --bdr:#334155; --txt:#e2e8f0; --muted:#94a3b8; --acc:#3b82f6; --ok:#22c55e; --warn:#f59e0b; --err:#ef4444; }
    #ar-modal,#ar-modal * { box-sizing:border-box; }
    #ar-modal input,#ar-modal select { background:var(--card); color:var(--txt); border:1px solid var(--bdr); border-radius:8px; padding:7px 10px; font-size:13px; outline:none; width:100%; transition:border-color .15s; }
    #ar-modal input[type="checkbox"],#ar-modal input[type="radio"] { width:auto; padding:0; background:transparent; border:none; border-radius:0; flex-shrink:0; }
    #ar-modal input:focus,#ar-modal select:focus { border-color:var(--acc); box-shadow:0 0 0 2px rgba(59,130,246,.18); }
    #ar-modal input::placeholder { color:var(--muted); }
    #ar-modal select option { background:var(--surf); }
    .ar-label { font-size:12px; color:var(--muted); display:block; margin-bottom:4px; }
    .ar-btn { padding:9px 16px; border:none; border-radius:8px; font-weight:600; font-size:13px; cursor:pointer; transition:opacity .15s,transform .1s; }
    .ar-btn:hover { opacity:.85; } .ar-btn:active { transform:scale(.97); }
    .ar-btn-primary { background:var(--acc); color:#fff; }
    .ar-btn-danger  { background:var(--err); color:#fff; }
    .ar-btn-ghost   { background:var(--surf); color:var(--txt); border:1px solid var(--bdr); }
    .ar-btn-success { background:#16a34a; color:#fff; }
    .ar-btn-sm      { padding:5px 12px; font-size:12px; }
    .ar-tab { padding:8px 16px; border:none; border-radius:8px; background:transparent; color:var(--muted); font-weight:600; font-size:13px; cursor:pointer; transition:all .15s; }
    .ar-tab:hover { color:var(--txt); background:var(--surf); }
    .ar-tab.active { background:var(--acc); color:#fff; }
    .ar-sec-hdr { display:flex; align-items:center; gap:8px; padding:10px 0 8px; margin-top:10px; border-bottom:1px solid var(--bdr); cursor:pointer; user-select:none; }
    .ar-sec-hdr .ar-sec-title { flex:1; font-weight:700; font-size:13px; color:var(--txt); }
    .ar-sec-hdr .ar-sec-ico   { font-size:15px; }
    .ar-sec-hdr .ar-chev      { color:var(--muted); font-size:10px; transition:transform .2s; }
    .ar-sec-hdr.open .ar-chev { transform:rotate(180deg); }
    .ar-sec-body { padding-top:8px; }
    .ar-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px 16px; }
    .ar-grid .col2 { grid-column:span 2; }
    .ar-field { display:flex; flex-direction:column; }
    .ar-rule-new { font-size:10px; font-weight:700; color:#f59e0b; background:rgba(245,158,11,.12); padding:1px 5px; border-radius:4px; margin-left:5px; vertical-align:middle; }
    .ar-preset-row { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px; }
    .ar-preset-btn { padding:5px 13px; border:1px solid var(--bdr); border-radius:6px; background:var(--surf); color:var(--txt); font-size:12px; font-weight:600; cursor:pointer; transition:all .15s; }
    .ar-preset-btn:hover { border-color:var(--acc); color:var(--acc); }
    .ar-entity-row { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:4px; }
    .ar-entity-pill { padding:6px 16px; border:1px solid var(--bdr); border-radius:20px; background:var(--surf); color:var(--muted); font-size:13px; font-weight:600; cursor:pointer; transition:all .15s; }
    .ar-entity-pill.sel { background:var(--acc); color:#fff; border-color:var(--acc); }
    .ar-info { background:rgba(59,130,246,.07); border:1px solid rgba(59,130,246,.25); border-radius:8px; padding:10px 14px; font-size:12px; color:var(--muted); line-height:1.6; }
    .ar-divider { border:none; border-top:1px solid var(--bdr); margin:12px 0; }
    .ar-logbox { background:var(--card); border:1px solid var(--bdr); border-radius:8px; padding:8px 10px; height:120px; overflow:auto; font:11px/1.4 ui-monospace,monospace; color:var(--txt); }
    .ar-badge { display:inline-block; padding:2px 8px; border-radius:10px; font-size:11px; font-weight:600; background:var(--surf); color:var(--muted); }
    .ar-badge-ok   { background:rgba(34,197,94,.12); color:#22c55e; }
    .ar-badge-warn { background:rgba(245,158,11,.12); color:#f59e0b; }
    .ar-acc-item   { padding:9px 12px; border-radius:8px; border:1px solid var(--bdr); margin-bottom:6px; background:var(--card); cursor:pointer; display:flex; align-items:center; gap:10px; transition:border-color .15s; }
    .ar-acc-item:hover,.ar-acc-item.sel { border-color:var(--acc); }
    .ar-progress { height:3px; background:var(--bdr); border-radius:2px; overflow:hidden; margin-top:8px; }
    .ar-progress-bar { height:100%; background:var(--acc); width:0%; transition:width .3s; }
  `;
  document.head.appendChild(st);
}

/* -------------------- UI: SHELL -------------------- */
function makeModal() {
  // Remove existing modal if present
  const old = document.getElementById('ar-modal');
  if (old) old.remove();

  const wrap = document.createElement('div');
  wrap.id = 'ar-modal';
  Object.assign(wrap.style, {
    position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)',
    width:'1040px', maxWidth:'97vw', maxHeight:'93vh', overflow:'auto',
    background:'var(--bg)', color:'var(--txt)', borderRadius:'14px',
    padding:'20px 22px', boxShadow:'0 24px 70px rgba(0,0,0,.6)',
    zIndex:'2000000001', fontFamily:'system-ui,-apple-system,Segoe UI,Roboto,Arial',
    border:'1px solid var(--bdr)'
  });

  wrap.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <div style="display:flex;align-items:center;gap:10px">
        <h2 style="margin:0;font-size:17px;font-weight:700;color:var(--txt)">MetaCtrl PRO</h2>
        <span class="ar-badge" style="font-size:10px">${CONFIG.VERSION}</span>
        <span class="ar-badge" style="font-size:10px;opacity:.6">${CONFIG.HOST.replace('https://','')}</span>
      </div>
      <button id="ar-close" class="ar-btn ar-btn-danger ar-btn-sm">✕ Close</button>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid var(--bdr)">
      <button id="tab-gen" class="ar-tab active">⚙️Rules Generator</button>
      <button id="tab-mgr" class="ar-tab">📁 Rules Manager</button>
      <button id="tab-col" class="ar-tab">📋 Column Presets</button>
      <button id="tab-anl" class="ar-tab">📊 Analytics</button>
      <button id="tab-insp" class="ar-tab">🔍 Inspector</button>
    </div>
  `;

  const gen = document.createElement('div'); gen.id = 'ar-gen';
  const mgr = document.createElement('div'); mgr.id = 'ar-mgr';
  const col = document.createElement('div'); col.id = 'ar-col';
  const anl  = document.createElement('div'); anl.id  = 'ar-anl';
  const insp = document.createElement('div'); insp.id = 'ar-insp';
  wrap.appendChild(gen);
  wrap.appendChild(mgr);
  wrap.appendChild(col);
  wrap.appendChild(anl);
  wrap.appendChild(insp);
  document.body.appendChild(wrap);

  wrap.querySelector('#ar-close').onclick = () => wrap.remove();
  wrap.querySelector('#tab-gen').onclick  = () => { setTab('gen'); };
  wrap.querySelector('#tab-mgr').onclick  = () => { setTab('mgr'); };
  wrap.querySelector('#tab-col').onclick  = () => { setTab('col'); };
  wrap.querySelector('#tab-anl').onclick  = () => { setTab('anl'); };
  wrap.querySelector('#tab-insp').onclick = () => { setTab('insp'); };

  function setTab(t) {
    gen.style.display = t === 'gen' ? 'block' : 'none';
    mgr.style.display = t === 'mgr' ? 'block' : 'none';
    col.style.display = t === 'col' ? 'block' : 'none';
    anl.style.display  = t === 'anl'  ? 'block' : 'none';
    insp.style.display = t === 'insp' ? 'block' : 'none';
    wrap.querySelector('#tab-gen').classList.toggle('active', t === 'gen');
    wrap.querySelector('#tab-mgr').classList.toggle('active', t === 'mgr');
    wrap.querySelector('#tab-col').classList.toggle('active', t === 'col');
    wrap.querySelector('#tab-anl').classList.toggle('active', t === 'anl');
    wrap.querySelector('#tab-insp').classList.toggle('active', t === 'insp');
  }
  setTab('gen');
  return { wrap, gen, mgr, col, anl, insp };
}

/* -------------------- UI: GENERATOR -------------------- */
function mountGenerator(container) {
  container.innerHTML = '';

  // ---- helpers ----
  function section(container, ico, title, startOpen = true) {
    const hdr = document.createElement('div');
    hdr.className = 'ar-sec-hdr' + (startOpen ? ' open' : '');
    hdr.innerHTML = `<span class="ar-sec-ico">${ico}</span><span class="ar-sec-title">${title}</span><span class="ar-chev">▼</span>`;
    container.appendChild(hdr);
    const body = document.createElement('div');
    body.className = 'ar-sec-body';
    body.style.display = startOpen ? 'block' : 'none';
    container.appendChild(body);
    hdr.addEventListener('click', () => {
      const open = body.style.display !== 'none';
      body.style.display = open ? 'none' : 'block';
      hdr.classList.toggle('open', !open);
    });
    return body;
  }

  function field(parent, labelText, inputEl, hint = '') {
    const wrap = document.createElement('div');
    wrap.className = 'ar-field';
    const lbl = document.createElement('label');
    lbl.className = 'ar-label';
    lbl.textContent = labelText;
    if (hint) lbl.title = hint;
    wrap.appendChild(lbl);
    wrap.appendChild(inputEl);
    parent.appendChild(wrap);
    return inputEl;
  }

  function inp(val = '', ph = '') {
    const el = document.createElement('input');
    el.value = val; el.placeholder = ph;
    return el;
  }

  function ruleCard(parent, name, desc, isNew = false) {
    const lbl = document.createElement('label');
    lbl.title = desc;
    lbl.style.cssText = 'display:flex;align-items:flex-start;gap:7px;padding:4px 8px;cursor:pointer;border-radius:4px;font-size:12px;color:var(--txt);font-weight:400;line-height:1.6;user-select:none;width:100%;max-width:100%;box-sizing:border-box;overflow:hidden;';
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.value = name;
    cb.style.cssText = 'accent-color:var(--acc);cursor:pointer;flex-shrink:0;width:13px;height:13px;margin-top:3px;padding:0;border:none;background:transparent;';
    const textWrap = document.createElement('span');
    textWrap.style.cssText = 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    textWrap.title = name;
    textWrap.textContent = name;
    lbl.appendChild(cb);
    lbl.appendChild(textWrap);
    if (isNew) {
      const badge = document.createElement('span');
      badge.className = 'ar-rule-new';
      badge.textContent = 'NEW';
      textWrap.appendChild(badge);
    }
    lbl.addEventListener('mouseenter', () => { lbl.style.background = 'rgba(59,130,246,.08)'; });
    lbl.addEventListener('mouseleave', () => { lbl.style.background = cb.checked ? 'rgba(59,130,246,.1)' : ''; });
    cb.addEventListener('change', () => { lbl.style.background = cb.checked ? 'rgba(59,130,246,.1)' : ''; });
    parent.appendChild(lbl);
    return cb;
  }

  // ---- presets ----
  const PRESETS = {
    conservative: { maxCPC:'7.00', maxLeadCost:'7.00', maxCPARegistration:'7.00', maxDepositCost:'40.00', roasHigh:'1.6', roasBoostPct:'15', roasBoostCap:'200.00', roasLowCut:'0.8', roasCutPct:'15', roasMinDailyBudget:'15.00', roasMinSpend:'10.00', roasLowPause:'0.6', roasSpendLimitPause:'80.00', roasRecover:'1.1', recoveryMult:'0.85', minCTR:'0.3', maxFrequency:'5.0' },
    moderate:     { maxCPC:'5.00', maxLeadCost:'5.00', maxCPARegistration:'5.00', maxDepositCost:'30.00', roasHigh:'1.4', roasBoostPct:'20', roasBoostCap:'300.00', roasLowCut:'0.9', roasCutPct:'20', roasMinDailyBudget:'10.00', roasMinSpend:'5.00',  roasLowPause:'0.7', roasSpendLimitPause:'50.00', roasRecover:'1.0', recoveryMult:'0.9',  minCTR:'0.5', maxFrequency:'3.5' },
    aggressive:   { maxCPC:'3.00', maxLeadCost:'3.00', maxCPARegistration:'3.00', maxDepositCost:'20.00', roasHigh:'1.2', roasBoostPct:'30', roasBoostCap:'500.00', roasLowCut:'1.0', roasCutPct:'25', roasMinDailyBudget:'8.00',  roasMinSpend:'3.00',  roasLowPause:'0.9', roasSpendLimitPause:'30.00', roasRecover:'1.0', recoveryMult:'0.95', minCTR:'0.7', maxFrequency:'2.5' },
    leadgen: {
      // thresholds
      maxCPC:'5.00', maxLeadCost:'0', maxCPARegistration:'0', maxDepositCost:'9.00',
      // ROAS pause/unpause
      roasLowPause:'0.6', roasSpendLimitPause:'29.00', roasRecover:'1.0', recoveryMult:'0.9',
      // ROAS budget boost/cut
      roasHigh:'1.4', roasBoostPct:'20', roasBoostCap:'7000.00', roasLowCut:'0.9', roasCutPct:'20',
      roasMinDailyBudget:'10.00', roasMinSpend:'5.00',
      // CTR Guard
      minCTR:'2', minSpendCTR:'10.00',
      // Frequency Burn
      maxFrequency:'2', minSpendFreq:'20.00', minImpressionsFreq:'100',
      // Impressions Guard
      minImpressionsLead:'1000', minSpendImpressions:'15.00',
      // Daily Spend Cap
      budgetExhaustion:'80.00',
      // CPM Guard
      maxCPM:'200.00', minSpendCPM:'5.00',
      // Budget boost % purchases
      boostPurchCount:'5', boostPurchCap:'7000.00', boostPurchPct:'20',
      // Budget boost % leads
      boostLeadCount:'5', boostLeadCap:'200.00', boostLeadPct:'20',
      // Budget fixed: +$2100 after 30 purchases
      _pbCount:'30', _pbAmount:'2100.00',
      // entity
      _entity: 'AD',
      _entityKeyword: 'CTRL',
      // schedule
      _onName: 'RESUME', _onTime: '05',
      _offName: 'HOLD',  _offTime: '20',
      _killTime: '20',
      _morningResetTime: '05',
      _morningResetWindow: 'LAST_7D',
      _mrCntClick: '1',
      // Morning Reset spend-based: [checked, N, mult]
      _mrSpA: { click: [true, '1', '2'],  lead: [false,'1','1.5'], reg: [false,'1','1.5'], purch: [false,'1','1'] },
      _mrSpB: { click: [true, '1', '1.5'], lead: [false,'1','1'],  reg: [false,'1','1'],   purch: [false,'1','1'] },
      // rules to enable (all others disabled)
      _rules: [
        'TurnOff Without Clicks with spent maxCPC',
        'TurnOff With Expensive CPC',
        'TurnOff Without Purchases',
        'TurnOff With Expensive Purchases',
        'TurnOff High Impressions No Purchases',
        'TurnOff Daily Budget Exhaustion',
        'CPM Guard',
        'CTR Guard',
        'Frequency Burn',
        'TurnOn If Cheap Click (CPC)',
        'TurnOn If Cheap Purchase (CPP)',
        'TurnOn If Clicks Present (>0)',
        'TurnOn If Purchases Present (>0)',
        'TurnOn by Name at Time',
        'TurnOff by Name at Time',
        'Kill Switch: TurnOff All at Time',
        'Morning Reset: TurnOn by 7-day CPL',
        'Budget: Increase budget by amount after N purchases',
        'Budget: Boost % after N purchases with good CPP',
        'Budget: Boost % after N leads with good CPL',
        'ROAS: Pause if low & spend reached',
        'ROAS: Unpause if recovered',
      ]
    }
  };

  // ---- preset row ----
  const presetRow = document.createElement('div');
  presetRow.className = 'ar-preset-row';
  presetRow.innerHTML = `<span style="font-size:12px;color:var(--muted);line-height:28px">Quick presets:</span>`;
  container.appendChild(presetRow);

  // ---- info ----
  const infoBox = document.createElement('div');
  infoBox.className = 'ar-info col2';
  infoBox.innerHTML = `
    <b>How it works</b> · All checks use <b>TODAY</b> (account timezone).<br>
    Budget Rules — boost 09:00/12:00 · cut 13:00/16:00 (30-min windows).<br>
    Switch Rules — SEMI_HOURLY (~30–60 min). UNPAUSE restricted to [ON;OFF] window if set.<br>
    Active keyword — applies rules only to entities whose name contains the keyword.
  `;
  container.appendChild(infoBox);

  // ---- 1. Entity & Scope ----
  const entSec = section(container, '🎯', 'Entity & Scope', true);
  const entityRow = document.createElement('div');
  entityRow.className = 'ar-entity-row';
  const entityPills = {};
  ['CAMPAIGN','ADSET','AD'].forEach(t => {
    const pill = document.createElement('div');
    pill.className = 'ar-entity-pill';
    pill.textContent = t;
    pill.dataset.val = t;
    pill.onclick = () => {
      Object.values(entityPills).forEach(p => p.classList.remove('sel'));
      pill.classList.add('sel');
    };
    entityPills[t] = pill;
    entityRow.appendChild(pill);
  });
  entityPills['CAMPAIGN'].classList.add('sel');
  entSec.appendChild(entityRow);

  const entGrid = document.createElement('div');
  entGrid.className = 'ar-grid';
  entGrid.style.marginTop = '10px';
  entSec.appendChild(entGrid);

  let entityKwInput = field(entGrid, 'Apply rules only to entities whose name contains (CTRL keyword)', inp('CTRL', 'e.g. CTRL — leave empty to apply to all'));
  Object.assign(entityKwInput.parentElement.style, { gridColumn: 'span 2' });
  const entKwInfo = document.createElement('div');
  entKwInfo.className = 'ar-info';
  entKwInfo.style.gridColumn = 'span 2';
  entKwInfo.textContent = 'CTRL keyword — if set, all generated rules will only fire on entities whose name contains this keyword. Leave empty to apply rules to all entities.';
  entGrid.appendChild(entKwInfo);

  // ---- 2. Cost Thresholds ----
  const thrSec  = section(container, '💰', 'Cost Thresholds (account currency)', true);
  const thrGrid = document.createElement('div');
  thrGrid.className = 'ar-grid';
  thrSec.appendChild(thrGrid);

  let maxCPCInput         = field(thrGrid, 'Max CPC', inp('5.00'));
  let maxLeadCostInput    = field(thrGrid, 'Max Cost per Lead (CPL)', inp('5.00'));
  let maxCPARegInput      = field(thrGrid, 'Max Cost per Registration (CPA)', inp('5.00'));
  let maxDepositCostInput = field(thrGrid, 'Max Cost per Purchase (CPP)', inp('30.00'));

  // ---- 3. Schedule (ON/OFF by Name) ----
  const schSec  = section(container, '📅', 'Schedule — ON / OFF by Name at Time', true);
  const schGrid = document.createElement('div');
  schGrid.className = 'ar-grid';
  schSec.appendChild(schGrid);

  let onNameInput  = field(schGrid, 'Turn ON if name contains', inp('RESUME', 'e.g. RESUME'));
  let onTimeInput  = field(schGrid, 'Turn ON at time (HH or HH:MM)', inp('08', '08 or 08:00'));
  let offNameInput = field(schGrid, 'Turn OFF if name contains', inp('HOLD', 'e.g. HOLD'));
  let offTimeInput = field(schGrid, 'Turn OFF at time (HH or HH:MM)', inp('20', '20 or 20:00'));

  // TurnOff All at Time (no name filter)
  const schAllHdr = document.createElement('div');
  schAllHdr.style.cssText = 'grid-column:span 2;font-weight:700;font-size:12px;color:var(--muted);margin-top:8px';
  schAllHdr.textContent = '— Kill Switch — turn OFF all entities at time (no name filter) —';
  schGrid.appendChild(schAllHdr);
  const schAllInfo = document.createElement('div');
  schAllInfo.className = 'ar-info';
  schAllInfo.style.gridColumn = 'span 2';
  schAllInfo.textContent = 'Safety rule: pauses ALL entities of selected type at specified time. No name filter. Use as end-of-day kill switch.';
  schGrid.appendChild(schAllInfo);

  let killTimeInput = field(schGrid, 'Kill switch time (HH or HH:MM)', inp('23', '23 or 23:00'));
  Object.assign(killTimeInput.parentElement.style, { gridColumn: 'span 2' });

  // Morning Reset — configurable conditions
  const schResetHdr = document.createElement('div');
  schResetHdr.style.cssText = 'grid-column:span 2;font-weight:700;font-size:12px;color:var(--muted);margin-top:8px';
  schResetHdr.textContent = '— Morning Reset — unpause if performance metrics are within target —';
  schGrid.appendChild(schResetHdr);
  const schResetInfo = document.createElement('div');
  schResetInfo.className = 'ar-info';
  schResetInfo.style.gridColumn = 'span 2';
  schResetInfo.textContent = 'Unpause at set time if ALL checked conditions are met. Cost conditions: CPC any level, CPL/CPA/CPP — CAMPAIGN only. Count conditions: work on all levels.';
  schGrid.appendChild(schResetInfo);

  let morningResetTimeInput = field(schGrid, 'Fire at time (HH or HH:MM)', inp('08', '08 or 08:00'));

  // Time window selector (YESTERDAY / LAST_3D / LAST_7D)
  const mrWindowWrap = document.createElement('div');
  mrWindowWrap.className = 'ar-field';
  const mrWindowLbl = document.createElement('label');
  mrWindowLbl.className = 'ar-label';
  mrWindowLbl.textContent = 'Evaluation window';
  const mrWindowSel = document.createElement('select');
  mrWindowSel.style.cssText = 'width:100%;background:var(--card);color:var(--txt);border:1px solid var(--bdr);border-radius:6px;padding:3px 6px;font-size:12px';
  [['YESTERDAY','Yesterday'],['LAST_3D','Last 3 days'],['LAST_7D','Last 7 days']].forEach(([v,t]) => {
    const o = document.createElement('option');
    o.value = v; o.textContent = t;
    if (v === 'LAST_7D') o.selected = true;
    mrWindowSel.appendChild(o);
  });
  mrWindowWrap.appendChild(mrWindowLbl);
  mrWindowWrap.appendChild(mrWindowSel);
  schGrid.appendChild(mrWindowWrap);

  // Condition rows: [cbVar, inputVar, label, placeholder, field_key]
  const mrCondDefs = [
    ['mrCpcCb',  'mrCpcInput',  'Max CPC (any level)',         'e.g. 0.50', 'cost_per_link_click'],
    ['mrCplCb',  'mrCplInput',  'Max CPL — CAMPAIGN only',    'e.g. 5.00',  'cost_per_lead_fb'],
    ['mrCpaCb',  'mrCpaInput',  'Max CPA registration — CAMPAIGN only', 'e.g. 8.00', 'cost_per_complete_registration_fb'],
    ['mrCppCb',  'mrCppInput',  'Max CPP (purchase) — CAMPAIGN only',   'e.g. 25.00', 'cost_per_purchase_fb'],
  ];
  const mrCondVars = {};
  const mrCondBlock = document.createElement('div');
  mrCondBlock.style.cssText = 'grid-column:span 2;display:flex;flex-direction:column;gap:4px;margin-top:2px';
  mrCondDefs.forEach(([cbKey, inpKey, lbl, ph]) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;';
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.style.cssText = 'accent-color:var(--acc);flex-shrink:0;width:13px;height:13px';
    const labelEl = document.createElement('span');
    labelEl.style.cssText = 'font-size:12px;color:var(--txt);flex:1;min-width:0';
    labelEl.textContent = lbl;
    const inputEl = document.createElement('input');
    inputEl.placeholder = ph;
    inputEl.style.cssText = 'width:80px;flex-shrink:0;background:var(--card);color:var(--txt);border:1px solid var(--bdr);border-radius:6px;padding:3px 6px;font-size:12px';
    inputEl.disabled = true;
    cb.onchange = () => { inputEl.disabled = !cb.checked; };
    row.appendChild(cb); row.appendChild(labelEl); row.appendChild(inputEl);
    mrCondBlock.appendChild(row);
    mrCondVars[cbKey] = cb;
    mrCondVars[inpKey] = inputEl;
  });
  schGrid.appendChild(mrCondBlock);

  // Count conditions subheader
  const mrCountHdr = document.createElement('div');
  mrCountHdr.style.cssText = 'grid-column:span 2;font-size:11px;font-weight:700;color:var(--muted);margin-top:8px;letter-spacing:.03em';
  mrCountHdr.textContent = 'MIN COUNT CONDITIONS (all levels: CAMPAIGN / ADSET / AD)';
  schGrid.appendChild(mrCountHdr);

  // Count condition rows: [cbKey, inpKey, label, placeholder, fb_field, operator]
  const mrCntDefs = [
    ['mrCntClickCb',  'mrCntClickInput',  'Min clicks',        'e.g. 1',  'link_click',                                       'GREATER_THAN'],
    ['mrCntLeadCb',   'mrCntLeadInput',   'Min leads',         'e.g. 1',  'offsite_conversion.fb_pixel_lead',                  'GREATER_THAN'],
    ['mrCntRegCb',    'mrCntRegInput',    'Min registrations', 'e.g. 1',  'offsite_conversion.fb_pixel_complete_registration', 'GREATER_THAN'],
    ['mrCntPurchCb',  'mrCntPurchInput',  'Min purchases',     'e.g. 1',  'offsite_conversion.fb_pixel_purchase',              'GREATER_THAN'],
  ];
  const mrCntVars = {};
  const mrCntBlock = document.createElement('div');
  mrCntBlock.style.cssText = 'grid-column:span 2;display:flex;flex-direction:column;gap:4px;margin-top:2px';
  mrCntDefs.forEach(([cbKey, inpKey, lbl, ph]) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;';
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.style.cssText = 'accent-color:var(--acc);flex-shrink:0;width:13px;height:13px';
    const labelEl = document.createElement('span');
    labelEl.style.cssText = 'font-size:12px;color:var(--txt);flex:1;min-width:0';
    labelEl.textContent = lbl;
    const inputEl = document.createElement('input');
    inputEl.placeholder = ph; inputEl.value = '1';
    inputEl.style.cssText = 'width:80px;flex-shrink:0;background:var(--card);color:var(--txt);border:1px solid var(--bdr);border-radius:6px;padding:3px 6px;font-size:12px';
    inputEl.disabled = true;
    cb.onchange = () => { inputEl.disabled = !cb.checked; };
    row.appendChild(cb); row.appendChild(labelEl); row.appendChild(inputEl);
    mrCntBlock.appendChild(row);
    mrCntVars[cbKey] = cb;
    mrCntVars[inpKey] = inputEl;
  });
  schGrid.appendChild(mrCntBlock);

  // Spend-based conditions subheader
  const mrSpendHdr = document.createElement('div');
  mrSpendHdr.style.cssText = 'grid-column:span 2;font-size:11px;font-weight:700;color:var(--muted);margin-top:8px;letter-spacing:.03em';
  mrSpendHdr.textContent = 'SPEND-BASED CONDITIONS (all levels — AD-safe, uses YESTERDAY window)';
  schGrid.appendChild(mrSpendHdr);

  // --- Scenario A: "gave results, not expensive" ---
  // clicks >= minN AND spent < threshold × mult  →  cheap result, worth waking up
  const mrSpAHdr = document.createElement('div');
  mrSpAHdr.style.cssText = 'grid-column:span 2;font-size:11px;color:#60a5fa;font-weight:600;margin-top:6px';
  mrSpAHdr.textContent = 'A — Good result / cheap: clicks ≥ N  AND  spent < threshold × mult';
  schGrid.appendChild(mrSpAHdr);

  // [cbKey, multKey, cntKey, label, thresholdRef, defaultMult, defaultCnt]
  const mrSpADefs = [
    ['mrSpAClickCb',  'mrSpAClickMult',  'mrSpAClickCnt',  'clicks ≥ N  AND  spent < maxCPC × mult',       'maxCPC',             '2',   '1'],
    ['mrSpALeadCb',   'mrSpALeadMult',   'mrSpALeadCnt',   'leads ≥ N  AND  spent < maxLeadCost × mult',   'maxLeadCost',        '1.5', '1'],
    ['mrSpARegCb',    'mrSpARegMult',    'mrSpARegCnt',    'regs ≥ N  AND  spent < maxCPA × mult',         'maxCPARegistration', '1.5', '1'],
    ['mrSpAPurchCb',  'mrSpAPurchMult',  'mrSpAPurchCnt',  'purchases ≥ N  AND  spent < maxCPP × mult',    'maxDepositCost',     '1',   '1'],
  ];
  const mrSpAVars = {};
  const mrSpABlock = document.createElement('div');
  mrSpABlock.style.cssText = 'grid-column:span 2;display:flex;flex-direction:column;gap:5px';
  mrSpADefs.forEach(([cbKey, multKey, cntKey, lbl,, defaultMult, defaultCnt]) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:6px;flex-wrap:wrap';
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.style.cssText = 'accent-color:var(--acc);flex-shrink:0;width:13px;height:13px';
    const labelEl = document.createElement('span');
    labelEl.style.cssText = 'font-size:12px;color:var(--txt);flex:1;min-width:140px';
    labelEl.textContent = lbl;
    const cntWrap = document.createElement('span');
    cntWrap.style.cssText = 'display:flex;align-items:center;gap:3px;font-size:11px;color:var(--muted)';
    cntWrap.textContent = 'N≥';
    const cntEl = document.createElement('input');
    cntEl.value = defaultCnt; cntEl.placeholder = 'N';
    cntEl.style.cssText = 'width:42px;background:var(--card);color:var(--txt);border:1px solid var(--bdr);border-radius:6px;padding:3px 5px;font-size:12px';
    cntEl.disabled = true;
    cntWrap.appendChild(cntEl);
    const multWrap = document.createElement('span');
    multWrap.style.cssText = 'display:flex;align-items:center;gap:3px;font-size:11px;color:var(--muted)';
    multWrap.textContent = '×=';
    const multEl = document.createElement('input');
    multEl.value = defaultMult; multEl.placeholder = '×';
    multEl.style.cssText = 'width:42px;background:var(--card);color:var(--txt);border:1px solid var(--bdr);border-radius:6px;padding:3px 5px;font-size:12px';
    multEl.disabled = true;
    multWrap.appendChild(multEl);
    cb.onchange = () => { cntEl.disabled = !cb.checked; multEl.disabled = !cb.checked; };
    row.appendChild(cb); row.appendChild(labelEl); row.appendChild(cntWrap); row.appendChild(multWrap);
    mrSpABlock.appendChild(row);
    mrSpAVars[cbKey] = cb; mrSpAVars[multKey] = multEl; mrSpAVars[cntKey] = cntEl;
  });
  schGrid.appendChild(mrSpABlock);

  // --- Scenario B: "barely ran, give another chance" ---
  // clicks < maxN AND spent < threshold × mult  →  almost no activity, retry
  const mrSpBHdr = document.createElement('div');
  mrSpBHdr.style.cssText = 'grid-column:span 2;font-size:11px;color:#a78bfa;font-weight:600;margin-top:8px';
  mrSpBHdr.textContent = 'B — Barely ran / give chance: clicks < N  AND  spent < threshold × mult';
  schGrid.appendChild(mrSpBHdr);

  const mrSpBDefs = [
    ['mrSpBClickCb',  'mrSpBClickMult',  'mrSpBClickCnt',  'clicks < N  AND  spent < maxCPC × mult',       'maxCPC',             '1',   '2'],
    ['mrSpBLeadCb',   'mrSpBLeadMult',   'mrSpBLeadCnt',   'leads < N  AND  spent < maxLeadCost × mult',   'maxLeadCost',        '1',   '1'],
    ['mrSpBRegCb',    'mrSpBRegMult',    'mrSpBRegCnt',    'regs < N  AND  spent < maxCPA × mult',         'maxCPARegistration', '1',   '1'],
    ['mrSpBPurchCb',  'mrSpBPurchMult',  'mrSpBPurchCnt',  'purchases < N  AND  spent < maxCPP × mult',    'maxDepositCost',     '1',   '1'],
  ];
  const mrSpBVars = {};
  const mrSpBBlock = document.createElement('div');
  mrSpBBlock.style.cssText = 'grid-column:span 2;display:flex;flex-direction:column;gap:5px';
  mrSpBDefs.forEach(([cbKey, multKey, cntKey, lbl,, defaultMult, defaultCnt]) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:6px;flex-wrap:wrap';
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.style.cssText = 'accent-color:var(--acc);flex-shrink:0;width:13px;height:13px';
    const labelEl = document.createElement('span');
    labelEl.style.cssText = 'font-size:12px;color:var(--txt);flex:1;min-width:140px';
    labelEl.textContent = lbl;
    const cntWrap = document.createElement('span');
    cntWrap.style.cssText = 'display:flex;align-items:center;gap:3px;font-size:11px;color:var(--muted)';
    cntWrap.textContent = 'N<';
    const cntEl = document.createElement('input');
    cntEl.value = defaultCnt; cntEl.placeholder = 'N';
    cntEl.style.cssText = 'width:42px;background:var(--card);color:var(--txt);border:1px solid var(--bdr);border-radius:6px;padding:3px 5px;font-size:12px';
    cntEl.disabled = true;
    cntWrap.appendChild(cntEl);
    const multWrap = document.createElement('span');
    multWrap.style.cssText = 'display:flex;align-items:center;gap:3px;font-size:11px;color:var(--muted)';
    multWrap.textContent = '×=';
    const multEl = document.createElement('input');
    multEl.value = defaultMult; multEl.placeholder = '×';
    multEl.style.cssText = 'width:42px;background:var(--card);color:var(--txt);border:1px solid var(--bdr);border-radius:6px;padding:3px 5px;font-size:12px';
    multEl.disabled = true;
    multWrap.appendChild(multEl);
    cb.onchange = () => { cntEl.disabled = !cb.checked; multEl.disabled = !cb.checked; };
    row.appendChild(cb); row.appendChild(labelEl); row.appendChild(cntWrap); row.appendChild(multWrap);
    mrSpBBlock.appendChild(row);
    mrSpBVars[cbKey] = cb; mrSpBVars[multKey] = multEl; mrSpBVars[cntKey] = cntEl;
  });
  schGrid.appendChild(mrSpBBlock);

  // ---- 4. Pause Triggers ----
  const protSec  = section(container, '⏸️', 'Pause Triggers', false);
  const protGrid = document.createElement('div');
  protGrid.className = 'ar-grid';
  protSec.appendChild(protGrid);

  // CTR Guard
  const ctrHdr = document.createElement('div');
  ctrHdr.style.cssText = 'grid-column:span 2;font-weight:700;font-size:12px;color:var(--muted);margin-top:2px';
  ctrHdr.textContent = '— CTR Guard — pause if CTR is too low (weak creative) —';
  protGrid.appendChild(ctrHdr);

  let minCTRInput          = field(protGrid, 'Min CTR % (pause if below)', inp('0.5', '0.5'));
  let minSpendCTRInput     = field(protGrid, 'Min spend before firing (currency)', inp('10.00', 'e.g. 10.00'));

  // Frequency Burn
  const freqHdr = document.createElement('div');
  freqHdr.style.cssText = 'grid-column:span 2;font-weight:700;font-size:12px;color:var(--muted);margin-top:8px';
  freqHdr.textContent = '— Frequency Burn — pause if audience is over-exposed —';
  protGrid.appendChild(freqHdr);

  let maxFrequencyInput    = field(protGrid, 'Max frequency (pause if above)', inp('3.5', '3.5'));
  let minSpendFreqInput    = field(protGrid, 'Min spend before firing (currency)', inp('20.00', 'e.g. 20.00'));
  let minImpressionsFreqInput = field(protGrid, 'Min impressions before firing', inp('100', 'e.g. 100'));

  // Impressions Guard
  const impHdr = document.createElement('div');
  impHdr.style.cssText = 'grid-column:span 2;font-weight:700;font-size:12px;color:var(--muted);margin-top:8px';
  impHdr.textContent = '— Impressions Guard — pause if N+ impressions but zero conversions —';
  protGrid.appendChild(impHdr);

  let minImpressionsLeadInput     = field(protGrid, 'Min impressions before firing', inp('3000', 'e.g. 3000'));
  let minSpendImpressionsInput    = field(protGrid, 'Min spend before firing (currency)', inp('15.00', 'e.g. 15.00'));

  // Daily Spend Cap
  const budgetExhHdr = document.createElement('div');
  budgetExhHdr.style.cssText = 'grid-column:span 2;font-weight:700;font-size:12px;color:var(--muted);margin-top:8px';
  budgetExhHdr.textContent = '— Daily Spend Cap — pause when total spend for today exceeds threshold —';
  protGrid.appendChild(budgetExhHdr);

  const budgetExhInfo = document.createElement('div');
  budgetExhInfo.className = 'ar-info';
  budgetExhInfo.style.gridColumn = 'span 2';
  budgetExhInfo.textContent = 'Use this as a manual daily budget cap: if the entity spends more than the threshold in a single day, it gets paused. Useful when you need per-entity spend control without relying on FB campaign budgets.';
  protGrid.appendChild(budgetExhInfo);

  let budgetExhaustionInput = field(protGrid, 'Pause if spent today exceeds (currency)', inp('80.00', 'e.g. 80.00'));
  Object.assign(budgetExhaustionInput.parentElement.style, { gridColumn: 'span 2' });

  // CPM Guard
  const cpmHdr = document.createElement('div');
  cpmHdr.style.cssText = 'grid-column:span 2;font-weight:700;font-size:12px;color:var(--muted);margin-top:8px';
  cpmHdr.textContent = '— CPM Guard — pause if CPM is too high (expensive traffic) —';
  protGrid.appendChild(cpmHdr);
  const cpmInfo = document.createElement('div');
  cpmInfo.className = 'ar-info';
  cpmInfo.style.gridColumn = 'span 2';
  cpmInfo.textContent = 'Works on all levels (CAMPAIGN / ADSET / AD). Fires every 30 min. Recommended: maxCPM $100–150 for leadgen.';
  protGrid.appendChild(cpmInfo);
  let maxCPMInput       = field(protGrid, 'Max CPM — pause if above (currency)', inp('150.00', 'e.g. 150.00'));
  let minSpendCPMInput  = field(protGrid, 'Min spend before firing (currency)', inp('5.00', 'e.g. 5.00'));
  const cpmLimitInfo = document.createElement('div');
  cpmLimitInfo.className = 'ar-info';
  cpmLimitInfo.style.gridColumn = 'span 2';
  cpmLimitInfo.textContent = '⚠️ CPM Guard works on CAMPAIGN level only — will be skipped on ADSET/AD due to FB API limitations.';
  protGrid.appendChild(cpmLimitInfo);

  // ---- 5. Budget Scaling ----
  const pbSec  = section(container, '🚀', 'Budget Scaling', false);
  const pbGrid = document.createElement('div');
  pbGrid.className = 'ar-grid';
  pbSec.appendChild(pbGrid);

  // Boost by fixed amount on N purchases
  const pbAmtHdr = document.createElement('div');
  pbAmtHdr.style.cssText = 'grid-column:span 2;font-weight:700;font-size:12px;color:var(--muted);margin-top:2px';
  pbAmtHdr.textContent = '— Increase budget by fixed amount after N purchases —';
  pbGrid.appendChild(pbAmtHdr);

  let pbCountInput   = field(pbGrid, 'Purchases needed to trigger (N)', inp('1', 'e.g. 1'));
  let pbAmountInput  = field(pbGrid, 'Increase budget by (currency)', inp('10.00', 'e.g. 10.00'));
  let pbCapInput     = field(pbGrid, 'Max daily budget cap (prevents repeated boosts)', inp('', 'e.g. 100.00'));
  Object.assign(pbCapInput.parentElement.style, { gridColumn: 'span 2' });

  // Boost by % on good CPP
  const boostPurchHdr = document.createElement('div');
  boostPurchHdr.style.cssText = 'grid-column:span 2;font-weight:700;font-size:12px;color:var(--muted);margin-top:8px';
  boostPurchHdr.textContent = '— Increase budget by % when N+ purchases at good CPP —';
  pbGrid.appendChild(boostPurchHdr);

  let boostPurchCountInput  = field(pbGrid, 'Min purchases to trigger', inp('3', 'e.g. 3'));
  let boostPurchAmtInput    = field(pbGrid, 'Increase budget by %', inp('20', 'e.g. 20'));
  let boostPurchCapInput    = field(pbGrid, 'Max daily budget cap (currency)', inp('200.00', 'e.g. 200.00'));

  // Boost by % on good CPL (leads)
  const boostLeadHdr = document.createElement('div');
  boostLeadHdr.style.cssText = 'grid-column:span 2;font-weight:700;font-size:12px;color:var(--muted);margin-top:8px';
  boostLeadHdr.textContent = '— Increase budget by % when N+ leads at good CPL —';
  pbGrid.appendChild(boostLeadHdr);

  let boostLeadCountInput = field(pbGrid, 'Min leads to trigger', inp('5', 'e.g. 5'));
  let boostLeadAmtInput   = field(pbGrid, 'Increase budget by %', inp('20', 'e.g. 20'));
  let boostLeadCapInput   = field(pbGrid, 'Max daily budget cap (currency)', inp('200.00', 'e.g. 200.00'));

  // ROAS Budget Boost/Cut
  const roasBudScaleHdr = document.createElement('div');
  roasBudScaleHdr.style.cssText = 'grid-column:span 2;font-weight:700;font-size:12px;color:var(--muted);margin-top:8px';
  roasBudScaleHdr.textContent = '— ROAS-based budget boost / cut (website_purchase_roas, TODAY) —';
  pbGrid.appendChild(roasBudScaleHdr);

  let roasCampNameInput     = field(pbGrid, 'Apply only if Campaign name contains (optional)', inp('', 'e.g. SCALE_'));
  Object.assign(roasCampNameInput.parentElement.style, { gridColumn: 'span 2' });

  let roasMinSpendInput      = field(pbGrid, 'Min spend before ROAS checks', inp('5.00'));
  let roasHighInput          = field(pbGrid, 'ROAS high threshold — boost if >', inp('1.4'));
  let roasBoostPctInput      = field(pbGrid, 'Budget boost %', inp('20'));
  let roasBoostCapInput      = field(pbGrid, 'Boost daily cap (currency)', inp('300.00'));
  let roasLowCutInput        = field(pbGrid, 'ROAS low threshold — cut if <', inp('0.9'));
  let roasCutPctInput        = field(pbGrid, 'Budget cut %', inp('20'));
  let roasMinDailyBudgInput  = field(pbGrid, 'Min daily budget floor (currency)', inp('10.00'));

  // ---- 6. ROAS Pause / Unpause ----
  const roasSec  = section(container, '📊', 'ROAS Pause / Unpause', false);
  const roasGrid = document.createElement('div');
  roasGrid.className = 'ar-grid';
  roasSec.appendChild(roasGrid);

  let roasLowPauseInput     = field(roasGrid, 'Pause if ROAS <', inp('0.7'));
  let roasSpendLimitInput   = field(roasGrid, 'Min spend before pause triggers (currency)', inp('50.00'));
  let roasRecoverInput      = field(roasGrid, 'Unpause if ROAS recovers >', inp('1.0'));
  let recovMultInput = field(roasGrid, 'Price-based unpause threshold (0.9 = 90% of CPL/CPA/CPP limit)', inp('0.9', '0.0–1.0'), 'Price-based UNPAUSE rules trigger at this fraction of the pause threshold');
  Object.assign(recovMultInput.parentElement.style, { gridColumn: 'span 2' });

  // ---- rule checklist ----
  const rulesSec = section(container, '☑️', 'Choose Rules', true);
  const rulesWrap = document.createElement('div');
  rulesWrap.style.cssText = 'display:block;width:100%;';
  rulesSec.appendChild(rulesWrap);

  // RULE_DEFS: [name, desc, isNew] — or ['__group__', label] for visual dividers
  const RULE_DEFS = [
    // ⏸️ Pause / Protection
    ['__group__', '⏸️ Pause / Protection'],
    ['TurnOff Without Clicks with spent maxCPC',              '0 link clicks after spending max CPC budget', false],
    ['TurnOff With Expensive CPC',                            'CAMPAIGN: CPC>max & no conversions. ADSET/AD: spent≥maxCPC×2 & clicks<2', false],
    ['TurnOff Without Leads',                                 '5+ clicks but zero leads today', false],
    ['TurnOff With Expensive Leads and No Registrations or Purchase', 'CAMPAIGN: CPL>max & no regs/purch. ADSET/AD: spent≥maxCPL×2.5 & leads<2', false],
    ['TurnOff Without Registrations',                         '5+ leads but zero registrations', false],
    ['TurnOff With Expensive Registrations',                  'CAMPAIGN: CPA>max & 1+ reg & no purch. ADSET/AD: spent≥maxCPA×2.5 & regs<2', false],
    ['TurnOff Without Purchases',                             'Spent ≥ target CPP with zero purchases', false],
    ['TurnOff With Expensive Purchases',                      'CAMPAIGN: CPP>max & 1+ purchase. ADSET/AD: spent≥maxCPP×2.5 & purchases<2', false],
    ['CTR Guard',                                             'Pause if CTR is too low after min spend — weak creative', true],
    ['Frequency Burn',                                        'Pause if frequency too high & no leads/purchases — audience fatigue', true],
    ['TurnOff High Impressions No Leads',                     'Pause if N+ impressions & min spend but zero leads — traffic without conversions', true],
    ['TurnOff High Impressions No Purchases',                 'Pause if N+ impressions & min spend but zero purchases — traffic without deposits', true],
    ['TurnOff Daily Budget Exhaustion',                       'Pause when total spend today exceeds your set threshold — acts as a manual per-entity daily budget cap', true],
    ['CPM Guard',                                             'Pause if CPM is too high after min spend — weak creative — CAMPAIGN only', true],
    // ▶️ Resume / Unpause — smart (cost check on CAMPAIGN, spend guard on ADSET/AD)
    ['__group__', '▶️ Resume / Unpause — smart (cost on CAMPAIGN · spend guard on ADSET/AD)'],
    ['TurnOn If Cheap Click (CPC)',                           'CAMPAIGN: clicks>0 & CPC≤max×recovMult. ADSET/AD: clicks>1 & spent<maxCPC×2', false],
    ['TurnOn If Cheap Lead (CPL)',                            'CAMPAIGN: leads>0 & CPL≤max×recovMult. ADSET/AD: leads>1 & spent<maxCPL×2', false],
    ['TurnOn If Cheap Registration (CPA)',                    'CAMPAIGN: regs>0 & CPA≤max×recovMult. ADSET/AD: regs>1 & spent<maxCPA×2', false],
    ['TurnOn If Cheap Purchase (CPP)',                        'CAMPAIGN: purchases>0 & CPP≤max×recovMult. ADSET/AD: purchases>1 & spent<maxCPP×2', false],
    ['TurnOn If Clicks Present (>0)',                         'CAMPAIGN: clicks>0 & CPC≤max. ADSET/AD: clicks>0 & spent<maxCPC×1.5', false],
    ['TurnOn If Leads Present (>0)',                          'CAMPAIGN: leads>0 & CPL≤max. ADSET/AD: leads>0 & spent<maxCPL×1.5', false],
    ['TurnOn If Registrations Present (>0)',                  'CAMPAIGN: regs>0 & CPA≤max. ADSET/AD: regs>0 & spent<maxCPA×1.5', false],
    ['TurnOn If Purchases Present (>0)',                      'CAMPAIGN: purchases>0 & CPP≤max. ADSET/AD: purchases>0 & spent<maxCPP×1.5', false],
    // 📅 Schedule
    ['__group__', '📅 Schedule'],
    ['TurnOn by Name at Time',                                'Enable entities whose name contains ON keyword at set time', false],
    ['TurnOff by Name at Time',                               'Pause entities whose name contains OFF keyword at set time', false],
    ['Kill Switch: TurnOff All at Time',                      'Safety: pause ALL entities of selected type at set time — no name filter', true],
    ['Morning Reset: TurnOn by 7-day CPL',                    'Unpause at set time if selected metrics (CPC/CPL/CPA/CPP) are within target — window: yesterday / 3d / 7d', true],
    // 💰 Budget Scaling
    ['__group__', '💰 Budget Scaling'],
    ['Budget: Increase budget by amount after N purchases',   'Scale budget by fixed amount when purchase count hits N', false],
    ['Budget: Boost % after N purchases with good CPP',       'Scale budget % when N+ purchases arrive at acceptable CPP', true],
    ['Budget: Boost % after N leads with good CPL',           'Scale budget % when N+ leads arrive at acceptable CPL — CAMPAIGN only', true],
    ['ROAS: Boost budget if high',                            'Boost budget at 09:00 & 12:00 when ROAS exceeds high threshold', false],
    ['ROAS: Cut budget if low',                               'Cut budget at 13:00 when ROAS is below low threshold', false],
    // 📊 ROAS Pause / Unpause
    ['__group__', '📊 ROAS Pause / Unpause'],
    ['ROAS: Pause if low & spend reached',                    'Pause when ROAS is critically low after minimum spend', false],
    ['ROAS: Unpause if recovered',                            'Resume paused entities when ROAS recovers above threshold', false],
  ];

  const ruleCbs = {};
  RULE_DEFS.forEach(entry => {
    if (entry[0] === '__group__') {
      const grp = document.createElement('div');
      grp.style.cssText = 'width:100%;font-size:11px;font-weight:700;color:var(--muted);padding:8px 8px 4px;letter-spacing:.04em;text-transform:uppercase;border-top:1px solid var(--bdr);margin-top:4px';
      grp.textContent = entry[1];
      rulesWrap.appendChild(grp);
    } else {
      const [name, desc, isNew] = entry;
      ruleCbs[name] = ruleCard(rulesWrap, name, desc, isNew);
    }
  });

  const selRow = document.createElement('div');
  selRow.style.cssText = 'display:flex;gap:8px;margin-top:10px';
  const btnAll  = document.createElement('button');
  btnAll.className = 'ar-btn ar-btn-ghost ar-btn-sm';
  btnAll.textContent = 'Select All';
  const btnNone = document.createElement('button');
  btnNone.className = 'ar-btn ar-btn-ghost ar-btn-sm';
  btnNone.textContent = 'Deselect All';
  selRow.appendChild(btnAll);
  selRow.appendChild(btnNone);
  rulesSec.appendChild(selRow);

  btnAll.onclick  = () => Object.entries(ruleCbs).forEach(([,cb]) => { cb.checked=true;  cb.dispatchEvent(new Event('change')); });
  btnNone.onclick = () => Object.entries(ruleCbs).forEach(([,cb]) => { cb.checked=false; cb.dispatchEvent(new Event('change')); });

  // ---- target accounts ----
  const accSec = section(container, '🏦', 'Target Accounts (optional — defaults to current account)', false);
  const accSecInfo = document.createElement('div');
  accSecInfo.className = 'ar-info';
  accSecInfo.style.marginBottom = '10px';
  accSecInfo.textContent = 'By default rules are generated for the current account from the URL. Load all accounts to target multiple accounts at once.';
  accSec.appendChild(accSecInfo);

  const accActRow = document.createElement('div');
  accActRow.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap';
  const btnLoadAccs = document.createElement('button');
  btnLoadAccs.className = 'ar-btn ar-btn-ghost ar-btn-sm';
  btnLoadAccs.textContent = '🔄 Load All Accounts';
  const accSelAllWrap = document.createElement('label');
  accSelAllWrap.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted);cursor:pointer;display:none';
  const accSelAllCb = document.createElement('input');
  accSelAllCb.type = 'checkbox'; accSelAllCb.style.accentColor = 'var(--acc)';
  accSelAllWrap.appendChild(accSelAllCb);
  accSelAllWrap.appendChild(document.createTextNode('Select all'));
  accActRow.appendChild(btnLoadAccs);
  accActRow.appendChild(accSelAllWrap);
  accSec.appendChild(accActRow);

  const accList = document.createElement('select');
  accList.multiple = true;
  accList.size = 4;
  accList.style.cssText = 'display:none;width:100%;background:var(--card);color:var(--txt);border:1px solid var(--bdr);border-radius:8px;padding:4px';
  accSec.appendChild(accList);

  btnLoadAccs.onclick = async () => {
    btnLoadAccs.disabled = true; btnLoadAccs.textContent = '⏳ Loading…';
    try {
      await loadAllAccountsWithRules((m,t) => STATUS.log(m,t));
      accList.innerHTML = '';
      ACCOUNTS_CACHE.forEach(a => {
        const o = document.createElement('option');
        o.value = a.id;
        o.textContent = `${a.status === 1 ? '🟢' : '🔴'} ${a.id} — ${a.name} [${a.ruleCount} rules] ${a.currency}`;
        accList.appendChild(o);
      });
      accList.style.display = ACCOUNTS_CACHE.length ? 'block' : 'none';
      accList.size = Math.min(8, Math.max(3, ACCOUNTS_CACHE.length));
      accSelAllWrap.style.display = ACCOUNTS_CACHE.length ? 'flex' : 'none';
      btnLoadAccs.textContent = '🔄 Reload Accounts';
    } catch(e) { STATUS.log(`Load error: ${e.message}`, 'error'); }
    finally { btnLoadAccs.disabled = false; }
  };
  accSelAllCb.onchange = () => Array.from(accList.options).forEach(o => o.selected = accSelAllCb.checked);

  // ---- actions ----
  const hr = document.createElement('hr'); hr.className = 'ar-divider';
  container.appendChild(hr);
  const actRow = document.createElement('div');
  actRow.style.cssText = 'display:flex;gap:12px;align-items:center';
  const btnGen = document.createElement('button');
  btnGen.className = 'ar-btn ar-btn-primary';
  btnGen.style.minWidth = '140px';
  btnGen.textContent = '⚡ Generate Rules';
  const progress = document.createElement('div');
  progress.className = 'ar-progress';
  progress.style.cssText = 'flex:1;display:none';
  const progressBar = document.createElement('div');
  progressBar.className = 'ar-progress-bar';
  progress.appendChild(progressBar);
  actRow.appendChild(btnGen);
  actRow.appendChild(progress);
  container.appendChild(actRow);

  // ---- wire up presets ----
  const inputMap = {
    maxCPC: maxCPCInput, maxLeadCost: maxLeadCostInput, maxCPARegistration: maxCPARegInput,
    maxDepositCost: maxDepositCostInput, roasHigh: roasHighInput, roasBoostPct: roasBoostPctInput,
    roasBoostCap: roasBoostCapInput, roasLowCut: roasLowCutInput, roasCutPct: roasCutPctInput,
    roasMinDailyBudget: roasMinDailyBudgInput, roasMinSpend: roasMinSpendInput,
    roasLowPause: roasLowPauseInput, roasSpendLimitPause: roasSpendLimitInput,
    roasRecover: roasRecoverInput, recoveryMult: recovMultInput,
    minCTR: minCTRInput, maxFrequency: maxFrequencyInput,
    minImpressionsLead: minImpressionsLeadInput, minSpendImpressions: minSpendImpressionsInput,
    maxCPM: maxCPMInput, minSpendCPM: minSpendCPMInput,
    budgetExhaustion: budgetExhaustionInput,
    boostPurchCount: boostPurchCountInput, boostPurchCap: boostPurchCapInput, boostPurchPct: boostPurchAmtInput,
    boostLeadCount: boostLeadCountInput, boostLeadCap: boostLeadCapInput, boostLeadPct: boostLeadAmtInput,
    minSpendCTR: minSpendCTRInput, minSpendFreq: minSpendFreqInput, minImpressionsFreq: minImpressionsFreqInput
  };

  function applyPreset(level) {
    const p = PRESETS[level];
    // numeric/text inputs
    Object.entries(p).forEach(([k, v]) => { if (!k.startsWith('_') && inputMap[k]) inputMap[k].value = v; });
    // entity type
    if (p._entity) {
      Object.values(entityPills).forEach(pl => pl.classList.remove('sel'));
      if (entityPills[p._entity]) entityPills[p._entity].classList.add('sel');
    }
    // entity keyword
    if (p._entityKeyword !== undefined) entityKwInput.value = p._entityKeyword;
    // schedule fields
    if (p._onName   !== undefined) onNameInput.value   = p._onName;
    if (p._onTime   !== undefined) onTimeInput.value   = p._onTime;
    if (p._offName  !== undefined) offNameInput.value  = p._offName;
    if (p._offTime  !== undefined) offTimeInput.value  = p._offTime;
    if (p._killTime !== undefined) killTimeInput.value = p._killTime;
    if (p._morningResetTime   !== undefined) morningResetTimeInput.value = p._morningResetTime;
    if (p._morningResetWindow !== undefined) mrWindowSel.value = p._morningResetWindow;
    // morning reset count conditions
    if (p._mrCntClick !== undefined) {
      mrCntVars.mrCntClickCb.checked = true; mrCntVars.mrCntClickInput.disabled = false; mrCntVars.mrCntClickInput.value = p._mrCntClick;
      mrCntVars.mrCntLeadCb.checked  = false; mrCntVars.mrCntLeadInput.disabled  = true;
      mrCntVars.mrCntRegCb.checked   = false; mrCntVars.mrCntRegInput.disabled   = true;
      mrCntVars.mrCntPurchCb.checked = false; mrCntVars.mrCntPurchInput.disabled = true;
    }
    // morning reset spend-based conditions (Scenario A and B)
    // Format: { A: { click:[checked, N, mult], lead:..., reg:..., purch:... }, B: { ... } }
    if (p._mrSpA !== undefined) {
      const defs = { click: ['mrSpAClickCb','mrSpAClickMult','mrSpAClickCnt'], lead: ['mrSpALeadCb','mrSpALeadMult','mrSpALeadCnt'], reg: ['mrSpARegCb','mrSpARegMult','mrSpARegCnt'], purch: ['mrSpAPurchCb','mrSpAPurchMult','mrSpAPurchCnt'] };
      Object.entries(defs).forEach(([key, [cbK, multK, cntK]]) => {
        const val = p._mrSpA[key];
        const checked = !!(val && val[0]);
        mrSpAVars[cbK].checked = checked;
        mrSpAVars[multK].disabled = !checked; mrSpAVars[cntK].disabled = !checked;
        if (val) { mrSpAVars[cntK].value = val[1]; mrSpAVars[multK].value = val[2]; }
      });
    }
    if (p._mrSpB !== undefined) {
      const defs = { click: ['mrSpBClickCb','mrSpBClickMult','mrSpBClickCnt'], lead: ['mrSpBLeadCb','mrSpBLeadMult','mrSpBLeadCnt'], reg: ['mrSpBRegCb','mrSpBRegMult','mrSpBRegCnt'], purch: ['mrSpBPurchCb','mrSpBPurchMult','mrSpBPurchCnt'] };
      Object.entries(defs).forEach(([key, [cbK, multK, cntK]]) => {
        const val = p._mrSpB[key];
        const checked = !!(val && val[0]);
        mrSpBVars[cbK].checked = checked;
        mrSpBVars[multK].disabled = !checked; mrSpBVars[cntK].disabled = !checked;
        if (val) { mrSpBVars[cntK].value = val[1]; mrSpBVars[multK].value = val[2]; }
      });
    }
    // budget fixed boost fields
    if (p._pbCount  !== undefined) pbCountInput.value  = p._pbCount;
    if (p._pbAmount !== undefined) pbAmountInput.value = p._pbAmount;
    // rule checkboxes
    if (p._rules) {
      const enabledSet = new Set(p._rules);
      Object.entries(ruleCbs).forEach(([name, cb]) => {
        cb.checked = enabledSet.has(name);
        cb.dispatchEvent(new Event('change'));
      });
    }
  }

  ['conservative','moderate','aggressive'].forEach(level => {
    const btn = document.createElement('button');
    btn.className = 'ar-preset-btn';
    btn.textContent = level.charAt(0).toUpperCase() + level.slice(1);
    btn.onclick = () => applyPreset(level);
    presetRow.appendChild(btn);
  });

  // Leadgen preset button (highlighted)
  const leadgenBtn = document.createElement('button');
  leadgenBtn.className = 'ar-preset-btn';
  leadgenBtn.style.cssText = 'border-color:#3b82f6;color:#3b82f6;font-weight:700';
  leadgenBtn.textContent = '🎯 Leadgen';
  leadgenBtn.onclick = () => applyPreset('leadgen');
  presetRow.appendChild(leadgenBtn);

  // ---- generate ----
  btnGen.onclick = async () => {
    STATUS.clear();
    STATUS.show('Generating rules…');
    const log = (m, t='info') => STATUS.log(m, t);

    const artype = Object.values(entityPills).find(p => p.classList.contains('sel'))?.dataset?.val;
    if (!artype) { alert('Select entity type.'); return; }

    const selectedRules = RULE_DEFS.map(([n]) => n).filter(n => ruleCbs[n]?.checked);
    if (!selectedRules.length) { alert('Select at least one rule.'); return; }

    btnGen.disabled = true;
    btnGen.textContent = '⏳ Working…';
    progress.style.display = 'block';
    progressBar.style.width = '0%';

    try {
      const ctx = {
        artype,
        thresholds: {
          maxCPC:             Math.round(+(maxCPCInput.value||'0') * 100),
          maxLeadCost:        Math.round(+(maxLeadCostInput.value||'0') * 100),
          maxCPARegistration: Math.round(+(maxCPARegInput.value||'0') * 100),
          maxDepositCost:     Math.round(+(maxDepositCostInput.value||'0') * 100)
        },
        entityKeyword: (entityKwInput.value||'').trim(),
        nameTime: {
          onName:    (onNameInput.value||'').trim(),
          onMinute:  parseTimeToMinutes(onTimeInput.value),
          offName:   (offNameInput.value||'').trim(),
          offMinute: parseTimeToMinutes(offTimeInput.value)
        },
        selectedRules,
        recoveryMult: Math.min(1, Math.max(0.1, +(recovMultInput.value||'0.9'))),
        roas: {
          campaignName: (roasCampNameInput.value||'').trim(),
          budget: {
            roasMinSpend:       Math.round(+(roasMinSpendInput.value||'0') * 100),
            roasHigh:           +(roasHighInput.value||'0'),
            roasBoostPct:       +(roasBoostPctInput.value||'0'),
            roasBoostCap:       Math.round(+(roasBoostCapInput.value||'0') * 100),
            roasLowCut:         +(roasLowCutInput.value||'0'),
            roasCutPct:         +(roasCutPctInput.value||'0'),
            roasMinDailyBudget: Math.round(+(roasMinDailyBudgInput.value||'0') * 100)
          },
          sw: {
            roasLowPause:        +(roasLowPauseInput.value||'0'),
            roasSpendLimitPause: Math.round(+(roasSpendLimitInput.value||'0') * 100),
            roasRecover:         +(roasRecoverInput.value||'0')
          }
        },
        purchaseBudgetBoost: {
          purchasesN:   Math.max(1, parseInt(pbCountInput.value||'1', 10) || 1),
          raiseAmount:  Math.round(+(pbAmountInput.value||'0') * 100),
          maxBudgetCap: (pbCapInput.value||'').trim() ? Math.round(+(pbCapInput.value) * 100) : null
        },
        protection: {
          minCTR:                +(minCTRInput.value||'0.5'),
          minSpendCTR:           Math.round(+(minSpendCTRInput.value||'10') * 100),
          maxFrequency:          +(maxFrequencyInput.value||'3.5'),
          minSpendFreq:          Math.round(+(minSpendFreqInput.value||'20') * 100),
          minImpressionsFreq:    Math.max(1, parseInt(minImpressionsFreqInput.value||'100', 10) || 100),
          minImpressionsLead:    Math.max(1, parseInt(minImpressionsLeadInput.value||'3000', 10) || 3000),
          minSpendImpressions:   Math.round(+(minSpendImpressionsInput.value||'15') * 100),
          budgetExhaustion:      Math.round(+(budgetExhaustionInput.value||'80') * 100),
          maxCPM:                Math.round(+(maxCPMInput.value||'150') * 100),
          minSpendCPM:           Math.round(+(minSpendCPMInput.value||'5') * 100),
          boostPurchCount:       Math.max(1, parseInt(boostPurchCountInput.value||'3', 10) || 3),
          boostPurchCap:         Math.round(+(boostPurchCapInput.value||'200') * 100),
          boostPurchPct:         Math.max(1, +(boostPurchAmtInput.value||'20')),
          boostLeadCount:        Math.max(1, parseInt(boostLeadCountInput.value||'5', 10) || 5),
          boostLeadCap:          Math.round(+(boostLeadCapInput.value||'200') * 100),
          boostLeadPct:          Math.max(1, +(boostLeadAmtInput.value||'20')),
          killMinute:            parseTimeToMinutes(killTimeInput.value),
          morningResetMinute:    parseTimeToMinutes(morningResetTimeInput.value),
          morningResetWindow:    mrWindowSel.value,
          morningResetConditions: mrCondDefs
            .filter(([cbKey]) => mrCondVars[cbKey].checked)
            .map(([cbKey, inpKey,, , fbField]) => ({
              field: fbField,
              value: Math.round(+(mrCondVars[inpKey].value||'0') * 100),
              isCost: true
            }))
            .filter(c => c.value > 0),
          morningResetCountConditions: mrCntDefs
            .filter(([cbKey]) => mrCntVars[cbKey].checked)
            .map(([cbKey, inpKey,, , fbField, op]) => ({
              field: fbField,
              operator: op,
              value: Math.max(0, parseInt(mrCntVars[inpKey].value||'1', 10) || 1) - 1
            })),
          morningResetSpendConditions: [
            // Scenario A: cnt >= N AND spent < threshold*mult  (good result, cheap)
            ...mrSpADefs
              .filter(([cbKey]) => mrSpAVars[cbKey].checked)
              .map(([cbKey, multKey, cntKey,, thresholdRef, defaultMult, defaultCnt]) => ({
                scenario: 'A',
                thresholdRef,
                mult:   Math.max(0.1, +(mrSpAVars[multKey].value || defaultMult)),
                cntVal: Math.max(1,   parseInt(mrSpAVars[cntKey].value || defaultCnt, 10) || 1)
              })),
            // Scenario B: cnt < N AND spent < threshold*mult  (barely ran, retry)
            ...mrSpBDefs
              .filter(([cbKey]) => mrSpBVars[cbKey].checked)
              .map(([cbKey, multKey, cntKey,, thresholdRef, defaultMult, defaultCnt]) => ({
                scenario: 'B',
                thresholdRef,
                mult:   Math.max(0.1, +(mrSpBVars[multKey].value || defaultMult)),
                cntVal: Math.max(1,   parseInt(mrSpBVars[cntKey].value || defaultCnt, 10) || 1)
              }))
          ]
        }
      };

      // Collect target accounts: selected from list, or fallback to current
      const selectedAccIds = Array.from(accList.selectedOptions).map(o => o.value);
      const targetAccIds = selectedAccIds.length ? selectedAccIds : [null]; // null = current account

      for (let i = 0; i < targetAccIds.length; i++) {
        const accId = targetAccIds[i];
        if (targetAccIds.length > 1) log(`\n[${i+1}/${targetAccIds.length}] Account ${accId ? 'act_'+accId : '(current)'}…`);
        await runGenerator({ ...ctx, accountId: accId }, log, pct => {
          // Weight progress across accounts
          const base = i / targetAccIds.length * 100;
          progressBar.style.width = (base + pct / targetAccIds.length) + '%';
        });
        if (i < targetAccIds.length - 1) {
          const accountsDone = i + 1;
          if (accountsDone % CONFIG.ACCOUNT_BATCH_SIZE === 0) {
            const mins = CONFIG.ACCOUNT_BATCH_PAUSE_MS / 60000;
            log(`⏳ Processed ${accountsDone} accounts — pausing ${mins} min to avoid FB rate limit…`, 'warning');
            await sleep(CONFIG.ACCOUNT_BATCH_PAUSE_MS);
          } else {
            log(`⏳ Pausing ${CONFIG.ACCOUNT_PAUSE_MS / 1000}s before next account…`, 'warning');
            await sleep(CONFIG.ACCOUNT_PAUSE_MS);
          }
        }
      }

      progressBar.style.width = '100%';
      STATUS.log(`✅ Done! ${targetAccIds.length > 1 ? targetAccIds.length + ' accounts processed.' : ''}`, 'success');
    } catch (e) {
      STATUS.log(`Generator error: ${e.message || e}`, 'error');
    } finally {
      btnGen.disabled = false;
      btnGen.textContent = '⚡ Generate Rules';
      setTimeout(() => { progress.style.display = 'none'; progressBar.style.width = '0%'; }, 1500);
    }
  };
}

/* -------------------- GENERATOR CORE -------------------- */
async function runGenerator(ctx, log = (() => {}), onProgress = (() => {})) {
  // Use explicit accountId from ctx (multi-account mode), or detect current account
  let accountId = ctx.accountId || null;
  if (!accountId) {
    try {
      accountId = require('BusinessUnifiedNavigationContext').adAccountID;
    } catch (e) {
      const m = location.href.match(/act_(\d+)/);
      accountId = m ? m[1] : null;
    }
  }
  if (!accountId) {
    log('Cannot detect account ID. Open a specific ad account in Ads Manager and retry.', 'error');
    return;
  }
  accountId = String(accountId).replace('act_', '');

  const existing = await Rules.list(accountId);
  const cnt = existing?.data?.length || 0;
  if (cnt > 0 && confirm(`Clear ${cnt} existing autorules first?`)) {
    await Rules.clear(accountId, log);
  }

  const {
    artype, thresholds, selectedRules, nameTime, roas,
    entityKeyword, purchaseBudgetBoost, recoveryMult, protection
  } = ctx;

  const presetToday = { field: 'time_preset', value: 'TODAY', operator: 'EQUAL' };
  const guardedUnpauseSchedule = semiHourlyWindow(nameTime.onMinute, nameTime.offMinute);

  // Injects entity-name keyword filter when set.
  // FB UI uses campaign.name / adset.name / ad.name — NOT the generic 'name' field.
  const _kwField = artype === 'CAMPAIGN' ? 'campaign.name' : artype === 'ADSET' ? 'adset.name' : 'ad.name';
  function kw(filters) {
    if (!entityKeyword) return filters;
    return [{ field: _kwField, operator: 'CONTAIN', value: entityKeyword }, ...filters];
  }

  // Shorthand to add a rule
  async function add(title, filters, execSpec, schedSpec) {
    return Rules.addWithBackoff(
      accountId, title,
      { evaluation_type: 'SCHEDULE', filters },
      execSpec, schedSpec, log
    );
  }

  const execPause = () => ({
    execution_type: 'PAUSE',
    execution_options: [{ field:'alert_preferences', value:{ instant:{ trigger:'CHANGE' } }, operator:'EQUAL' }]
  });
  const execUnpause = () => ({
    execution_type: 'UNPAUSE',
    execution_options: [{ field:'alert_preferences', value:{ instant:{ trigger:'CHANGE' } }, operator:'EQUAL' }]
  });

  function execChangeBudgetPct(etype, pct, limitCents) {
    if (etype === 'AD') return null;
    return {
      execution_type: etype === 'CAMPAIGN' ? 'CHANGE_CAMPAIGN_BUDGET' : 'CHANGE_BUDGET',
      execution_options: [{ field:'change_spec', operator:'EQUAL', value: { amount:+pct, unit:'PERCENTAGE', ...(limitCents ? { limit:limitCents } : {}) } }]
    };
  }

  // FIX: consistent indentation
  function execIncreaseBudgetByAmount(etype, addCents, maxCapCents) {
    if (etype === 'AD') return null;
    return {
      execution_type: etype === 'CAMPAIGN' ? 'CHANGE_CAMPAIGN_BUDGET' : 'CHANGE_BUDGET',
      execution_options: [{
        field: 'change_spec', operator: 'EQUAL',
        value: { amount: +addCents, unit: 'ACCOUNT_CURRENCY', ...(maxCapCents != null ? { limit: +maxCapCents } : {}) }
      }]
    };
  }

  const schedSemi = { schedule_type: 'SEMI_HOURLY' };

  // Count total selected rules for progress tracking
  let done = 0;
  const total = selectedRules.length;
  async function addRule(title, filters, execSpec, schedSpec) {
    const res = await add(title, filters, execSpec, schedSpec);
    done++;
    onProgress(Math.round(done / total * 100));
    return res;
  }

  const { maxCPC, maxLeadCost, maxCPARegistration, maxDepositCost } = thresholds;

  /* ------- PAUSE rules ------- */
  if (selectedRules.includes('TurnOff Without Clicks with spent maxCPC')) {
    const spendForClickRule = maxCPC * 2;
    await addRule(
      `TurnOff ${artype} Without Clicks with spent ≥ ${(spendForClickRule/100).toFixed(2)}`,
      kw([{ field:'link_click',operator:'LESS_THAN',value:1 },{ field:'spent',operator:'GREATER_THAN',value:spendForClickRule },{ field:'entity_type',operator:'EQUAL',value:artype },presetToday]),
      execPause(), schedSemi
    );
  }

  if (selectedRules.includes('TurnOff With Expensive CPC')) {
    const spendForCPCRule = maxCPC * 2;
    if (artype === 'CAMPAIGN') {
      await addRule(
        `TurnOff ${artype} With Expensive CPC (CPC>${(maxCPC/100).toFixed(2)} & spend≥${(spendForCPCRule/100).toFixed(2)})`,
        kw([{ field:'link_click',operator:'GREATER_THAN',value:0 },{ field:'spent',operator:'GREATER_THAN',value:spendForCPCRule },{ field:'cost_per_link_click',operator:'GREATER_THAN',value:maxCPC },{ field:'offsite_conversion.fb_pixel_lead',operator:'LESS_THAN',value:1 },{ field:'offsite_conversion.fb_pixel_complete_registration',operator:'LESS_THAN',value:1 },{ field:'offsite_conversion.fb_pixel_purchase',operator:'LESS_THAN',value:1 },{ field:'entity_type',operator:'EQUAL',value:artype },presetToday]),
        execPause(), schedSemi
      );
    } else {
      await addRule(
        `TurnOff ${artype} With Expensive CPC (spent≥${(spendForCPCRule/100).toFixed(2)} & clicks<2)`,
        kw([{ field:'spent',operator:'GREATER_THAN',value:spendForCPCRule },{ field:'link_click',operator:'LESS_THAN',value:2 },{ field:'offsite_conversion.fb_pixel_lead',operator:'LESS_THAN',value:1 },{ field:'offsite_conversion.fb_pixel_complete_registration',operator:'LESS_THAN',value:1 },{ field:'offsite_conversion.fb_pixel_purchase',operator:'LESS_THAN',value:1 },{ field:'entity_type',operator:'EQUAL',value:artype },presetToday]),
        execPause(), schedSemi
      );
    }
  }

  if (selectedRules.includes('TurnOff Without Leads')) {
    const spendForLeadRule = Math.round(maxLeadCost * 1.5);
    await addRule(
      `TurnOff ${artype} Without Leads (spend≥${(spendForLeadRule/100).toFixed(2)} & 0 leads)`,
      kw([{ field:'spent',operator:'GREATER_THAN',value:spendForLeadRule },{ field:'offsite_conversion.fb_pixel_lead',operator:'LESS_THAN',value:1 },{ field:'entity_type',operator:'EQUAL',value:artype },presetToday]),
      execPause(), schedSemi
    );
  }

  if (selectedRules.includes('TurnOff With Expensive Leads and No Registrations or Purchase')) {
    const spendForLeadRule = Math.round(maxLeadCost * 1.5);
    if (artype === 'CAMPAIGN') {
      await addRule(
        `TurnOff ${artype} With Expensive Leads (CPL>${(maxLeadCost/100).toFixed(2)} & spend≥${(spendForLeadRule/100).toFixed(2)})`,
        kw([{ field:'offsite_conversion.fb_pixel_lead',operator:'GREATER_THAN',value:1 },{ field:'spent',operator:'GREATER_THAN',value:spendForLeadRule },{ field:'cost_per_lead_fb',operator:'GREATER_THAN',value:maxLeadCost },{ field:'offsite_conversion.fb_pixel_complete_registration',operator:'LESS_THAN',value:1 },{ field:'offsite_conversion.fb_pixel_purchase',operator:'LESS_THAN',value:1 },{ field:'entity_type',operator:'EQUAL',value:artype },presetToday]),
        execPause(), schedSemi
      );
    } else {
      await addRule(
        `TurnOff ${artype} With Expensive Leads (spent≥${(Math.round(maxLeadCost*2.5)/100).toFixed(2)} & leads<2 & no regs/purch)`,
        kw([{ field:'spent',operator:'GREATER_THAN',value:Math.round(maxLeadCost*2.5) },{ field:'offsite_conversion.fb_pixel_lead',operator:'LESS_THAN',value:2 },{ field:'offsite_conversion.fb_pixel_complete_registration',operator:'LESS_THAN',value:1 },{ field:'offsite_conversion.fb_pixel_purchase',operator:'LESS_THAN',value:1 },{ field:'entity_type',operator:'EQUAL',value:artype },presetToday]),
        execPause(), schedSemi
      );
    }
  }

  if (selectedRules.includes('TurnOff Without Registrations')) {
    const spendForRegRule = Math.round(maxCPARegistration * 1.5);
    await addRule(
      `TurnOff ${artype} Without Registrations (1+ lead & spend≥${(spendForRegRule/100).toFixed(2)} & 0 regs)`,
      kw([{ field:'offsite_conversion.fb_pixel_lead',operator:'GREATER_THAN',value:0 },{ field:'spent',operator:'GREATER_THAN',value:spendForRegRule },{ field:'offsite_conversion.fb_pixel_complete_registration',operator:'LESS_THAN',value:1 },{ field:'entity_type',operator:'EQUAL',value:artype },presetToday]),
      execPause(), schedSemi
    );
  }

  if (selectedRules.includes('TurnOff With Expensive Registrations')) {
    const spendForRegExpRule = Math.round(maxCPARegistration * 2.5);
    if (artype === 'CAMPAIGN') {
      await addRule(
        `TurnOff ${artype} With Expensive Registrations (CPA>${(maxCPARegistration/100).toFixed(2)} & 1+ reg & no purchases)`,
        kw([{ field:'offsite_conversion.fb_pixel_complete_registration',operator:'GREATER_THAN',value:0 },{ field:'cost_per_complete_registration_fb',operator:'GREATER_THAN',value:maxCPARegistration },{ field:'offsite_conversion.fb_pixel_purchase',operator:'LESS_THAN',value:1 },{ field:'entity_type',operator:'EQUAL',value:artype },presetToday]),
        execPause(), schedSemi
      );
    } else {
      await addRule(
        `TurnOff ${artype} With Expensive Registrations (spent≥${(spendForRegExpRule/100).toFixed(2)} & regs<2 & no purchases)`,
        kw([{ field:'spent',operator:'GREATER_THAN',value:spendForRegExpRule },{ field:'offsite_conversion.fb_pixel_complete_registration',operator:'LESS_THAN',value:2 },{ field:'offsite_conversion.fb_pixel_purchase',operator:'LESS_THAN',value:1 },{ field:'entity_type',operator:'EQUAL',value:artype },presetToday]),
        execPause(), schedSemi
      );
    }
  }

  if (selectedRules.includes('TurnOff Without Purchases')) {
    await addRule(
      `TurnOff ${artype} Without Purchases (spent ≥ CPP & purchases = 0)`,
      kw([{ field:'spent',operator:'GREATER_THAN',value:maxDepositCost },{ field:'offsite_conversion.fb_pixel_purchase',operator:'LESS_THAN',value:1 },{ field:'entity_type',operator:'EQUAL',value:artype },presetToday]),
      execPause(), schedSemi
    );
  }

  if (selectedRules.includes('TurnOff With Expensive Purchases')) {
    if (artype === 'CAMPAIGN') {
      await addRule(
        `TurnOff ${artype} With Expensive Purchases (CPP>${(maxDepositCost/100).toFixed(2)} & 1+ purchase)`,
        kw([{ field:'offsite_conversion.fb_pixel_purchase',operator:'GREATER_THAN',value:0 },{ field:'cost_per_purchase_fb',operator:'GREATER_THAN',value:maxDepositCost },{ field:'entity_type',operator:'EQUAL',value:artype },presetToday]),
        execPause(), schedSemi
      );
    } else {
      await addRule(
        `TurnOff ${artype} With Expensive Purchases (spent≥${(Math.round(maxDepositCost*2.5)/100).toFixed(2)} & purchases<2)`,
        kw([{ field:'spent',operator:'GREATER_THAN',value:Math.round(maxDepositCost*2.5) },{ field:'offsite_conversion.fb_pixel_purchase',operator:'LESS_THAN',value:2 },{ field:'entity_type',operator:'EQUAL',value:artype },presetToday]),
        execPause(), schedSemi
      );
    }
  }

  /* ------- NEW: CTR Guard ------- */
  if (selectedRules.includes('CTR Guard')) {
    if (artype !== 'CAMPAIGN') {
      log(`⚠️ CTR Guard — skipped for ${artype}: FB API does not allow ctr conditions on ADSET/AD level.`, 'warning');
    } else {
      await addRule(
        `TurnOff ${artype} CTR Guard (CTR < ${protection.minCTR}% & no conversions)`,
        kw([
          { field:'entity_type', operator:'EQUAL',        value: artype },
          { field:'ctr',         operator:'LESS_THAN',    value: protection.minCTR },
          { field:'spent',       operator:'GREATER_THAN', value: protection.minSpendCTR },
          { field:'offsite_conversion.fb_pixel_lead',    operator:'LESS_THAN', value:1 },
          { field:'offsite_conversion.fb_pixel_purchase',operator:'LESS_THAN', value:1 },
          presetToday
        ]),
        execPause(), schedSemi
      );
    }
  }

  /* ------- NEW: Frequency Burn ------- */
  if (selectedRules.includes('Frequency Burn')) {
    if (artype !== 'CAMPAIGN') {
      log(`⚠️ Frequency Burn — skipped for ${artype}: FB API does not allow frequency conditions on ADSET/AD level.`, 'warning');
    } else {
      const freqMinImpr = protection.minImpressionsFreq || 100;
      await addRule(
        `TurnOff ${artype} Frequency Burn (freq > ${protection.maxFrequency}, ${freqMinImpr}+ impr)`,
        kw([
          { field:'entity_type', operator:'EQUAL',        value: artype },
          { field:'frequency',   operator:'GREATER_THAN', value: protection.maxFrequency },
          { field:'spent',       operator:'GREATER_THAN', value: protection.minSpendFreq },
          { field:'impressions', operator:'GREATER_THAN', value: freqMinImpr - 1 },
          { field:'offsite_conversion.fb_pixel_lead',     operator:'LESS_THAN', value:1 },
          { field:'offsite_conversion.fb_pixel_purchase', operator:'LESS_THAN', value:1 },
          presetToday
        ]),
        execPause(), schedSemi
      );
    }
  }

  /* ------- NEW: Impressions Guard ------- */
  if (selectedRules.includes('TurnOff High Impressions No Leads')) {
    await addRule(
      `TurnOff ${artype} High Impressions No Leads (${protection.minImpressionsLead}+ impr, zero leads)`,
      kw([
        { field:'entity_type',  operator:'EQUAL',        value: artype },
        { field:'impressions',  operator:'GREATER_THAN', value: protection.minImpressionsLead },
        { field:'spent',        operator:'GREATER_THAN', value: protection.minSpendImpressions },
        { field:'offsite_conversion.fb_pixel_lead',    operator:'LESS_THAN', value: 1 },
        { field:'offsite_conversion.fb_pixel_purchase',operator:'LESS_THAN', value: 1 },
        presetToday
      ]),
      execPause(), schedSemi
    );
  }

  if (selectedRules.includes('TurnOff High Impressions No Purchases')) {
    await addRule(
      `TurnOff ${artype} High Impressions No Purchases (${protection.minImpressionsLead}+ impr, zero purchases)`,
      kw([
        { field:'entity_type',  operator:'EQUAL',        value: artype },
        { field:'impressions',  operator:'GREATER_THAN', value: protection.minImpressionsLead },
        { field:'spent',        operator:'GREATER_THAN', value: protection.minSpendImpressions },
        { field:'offsite_conversion.fb_pixel_purchase', operator:'LESS_THAN', value: 1 },
        presetToday
      ]),
      execPause(), schedSemi
    );
  }

  /* ------- NEW: Daily Budget Exhaustion ------- */
  if (selectedRules.includes('TurnOff Daily Budget Exhaustion')) {
    await addRule(
      `TurnOff ${artype} Daily Budget Exhaustion (spent > ${(protection.budgetExhaustion/100).toFixed(2)})`,
      kw([
        { field:'entity_type', operator:'EQUAL',        value: artype },
        { field:'spent',       operator:'GREATER_THAN', value: protection.budgetExhaustion },
        presetToday
      ]),
      execPause(), schedSemi
    );
  }

  /* ------- CPM Guard ------- */
  if (selectedRules.includes('CPM Guard')) {
    if (artype !== 'CAMPAIGN') {
      log(`⚠️ CPM Guard — skipped for ${artype}: FB API does not allow cpm conditions on ADSET/AD level.`, 'warning');
    } else {
      await addRule(
        `TurnOff ${artype} CPM Guard (CPM > ${(protection.maxCPM/100).toFixed(2)})`,
        kw([
          { field:'entity_type', operator:'EQUAL',        value: artype },
          { field:'cpm',         operator:'GREATER_THAN', value: protection.maxCPM },
          { field:'spent',       operator:'GREATER_THAN', value: protection.minSpendCPM },
          presetToday
        ]),
        execPause(), schedSemi
      );
    }
  }

  /* ------- Name / Time ON/OFF ------- */
  // NOTE: kw() NOT used here — these rules already filter by name, adding entityKeyword
  // would create duplicate 'name' fields which FB API rejects with "Duplicate filter fields are not allowed: name"
  // Name field per entity type — matches FB UI behavior (campaign.name, adset.name, ad.name)
  const nameField = artype === 'CAMPAIGN' ? 'campaign.name' : artype === 'ADSET' ? 'adset.name' : 'ad.name';

  if (selectedRules.includes('TurnOn by Name at Time')) {
    if (!nameTime.onName || nameTime.onMinute == null) {
      alert('TurnOn: fill both name keyword and time.');
    } else {
      await addRule(
        `TurnON ${artype} if name contains "${nameTime.onName}" at ${clampToSlotStart(nameTime.onMinute)}m`,
        [{ field:nameField,operator:'CONTAIN',value:nameTime.onName },{ field:'entity_type',operator:'EQUAL',value:artype },{ field:'time_preset',operator:'EQUAL',value:'TODAY' }],
        execUnpause(), allWeekCustomSchedule(nameTime.onMinute)
      );
    }
  }

  if (selectedRules.includes('TurnOff by Name at Time')) {
    if (!nameTime.offName || nameTime.offMinute == null) {
      alert('TurnOff: fill both name keyword and time.');
    } else {
      await addRule(
        `TurnOFF ${artype} if name contains "${nameTime.offName}" at ${clampToSlotStart(nameTime.offMinute)}m`,
        [{ field:nameField,operator:'CONTAIN',value:nameTime.offName },{ field:'entity_type',operator:'EQUAL',value:artype },{ field:'time_preset',operator:'EQUAL',value:'TODAY' }],
        execPause(), allWeekCustomSchedule(nameTime.offMinute)
      );
    }
  }

  /* ------- ROAS rules ------- */
  const roasBase = [
    { field:'entity_type', operator:'EQUAL', value:artype },
    { field:'time_preset', operator:'EQUAL', value:'TODAY' },
    ...(roas.campaignName ? [{ field:'campaign.name', operator:'CONTAIN', value:roas.campaignName }] : [])
  ];

  if (selectedRules.includes('ROAS: Boost budget if high')) {
    const exec = execChangeBudgetPct(artype, +roas.budget.roasBoostPct, roas.budget.roasBoostCap || undefined);
    if (exec) {
      await addRule(
        `ROAS Boost ${artype} if website_purchase_roas > ${roas.budget.roasHigh}`,
        [...roasBase, { field:'spent',operator:'GREATER_THAN',value:roas.budget.roasMinSpend }, { field:'website_purchase_roas',operator:'GREATER_THAN',value:roas.budget.roasHigh }],
        exec, scheduleAtHours([0, 14])
      );
    }
  }

  if (selectedRules.includes('ROAS: Cut budget if low')) {
    const exec = execChangeBudgetPct(artype, -Math.abs(+roas.budget.roasCutPct), roas.budget.roasMinDailyBudget || undefined);
    if (exec) {
      await addRule(
        `ROAS Cut ${artype} if website_purchase_roas < ${roas.budget.roasLowCut}`,
        [...roasBase, { field:'spent',operator:'GREATER_THAN',value:roas.budget.roasMinSpend }, { field:'website_purchase_roas',operator:'LESS_THAN',value:roas.budget.roasLowCut }],
        exec, scheduleAtHours([13])
      );
    }
  }

  if (selectedRules.includes('ROAS: Pause if low & spend reached')) {
    if (artype !== 'CAMPAIGN') {
      log(`⚠️ ROAS: Pause if low — skipped for ${artype}: FB API does not allow website_purchase_roas conditions on ADSET/AD level.`, 'warning');
    } else {
      await addRule(
        `ROAS Pause ${artype} if low < ${roas.sw.roasLowPause} & spend > ${(roas.sw.roasSpendLimitPause/100).toFixed(2)}`,
        [...roasBase, { field:'spent',operator:'GREATER_THAN',value:roas.sw.roasSpendLimitPause }, { field:'website_purchase_roas',operator:'LESS_THAN',value:roas.sw.roasLowPause }],
        execPause(), schedSemi
      );
    }
  }

  if (selectedRules.includes('ROAS: Unpause if recovered')) {
    if (artype !== 'CAMPAIGN') {
      log(`⚠️ ROAS: Unpause if recovered — skipped for ${artype}: FB API does not allow website_purchase_roas conditions on ADSET/AD level.`, 'warning');
    } else {
      await addRule(
        `ROAS Unpause ${artype} if website_purchase_roas > ${roas.sw.roasRecover}`,
        [...roasBase, { field:'website_purchase_roas',operator:'GREATER_THAN',value:roas.sw.roasRecover }],
        execUnpause(), guardedUnpauseSchedule
      );
    }
  }

  /* ------- Unpause price-based ------- */
  // FIX: RECOVERY_MULT is now passed from UI, not hardcoded
  const cheapCPL = Math.round(maxLeadCost        * recoveryMult);
  const cheapCPA = Math.round(maxCPARegistration * recoveryMult);
  const cheapCPP = Math.round(maxDepositCost     * recoveryMult);
  const tdy = presetToday;

  if (selectedRules.includes('TurnOn If Cheap Click (CPC)')) {
    if (artype === 'CAMPAIGN') {
      const cheapCPC = Math.round(maxCPC * recoveryMult);
      await addRule(
        `UNPAUSE ${artype} — Cheap CPC ≤ ${(cheapCPC/100).toFixed(2)} & no leads/regs/purch`,
        kw([{ field:'entity_type',operator:'EQUAL',value:artype },{ field:'link_click',operator:'GREATER_THAN',value:0 },{ field:'cost_per_link_click',operator:'LESS_THAN',value:cheapCPC },{ field:'offsite_conversion.fb_pixel_lead',operator:'LESS_THAN',value:1 },{ field:'offsite_conversion.fb_pixel_complete_registration',operator:'LESS_THAN',value:1 },{ field:'offsite_conversion.fb_pixel_purchase',operator:'LESS_THAN',value:1 },tdy]),
        execUnpause(), guardedUnpauseSchedule
      );
    } else {
      const spendGuard = Math.round(maxCPC * 2);
      await addRule(
        `UNPAUSE ${artype} — 2+ clicks & spent<${(spendGuard/100).toFixed(2)}`,
        kw([{ field:'entity_type',operator:'EQUAL',value:artype },{ field:'link_click',operator:'GREATER_THAN',value:1 },{ field:'spent',operator:'LESS_THAN',value:spendGuard },tdy]),
        execUnpause(), guardedUnpauseSchedule
      );
    }
  }

  if (selectedRules.includes('TurnOn If Cheap Lead (CPL)')) {
    if (artype === 'CAMPAIGN') {
      await addRule(
        `UNPAUSE ${artype} — Cheap CPL ≤ ${(cheapCPL/100).toFixed(2)} & no regs/purch`,
        kw([{ field:'entity_type',operator:'EQUAL',value:artype },{ field:'offsite_conversion.fb_pixel_lead',operator:'GREATER_THAN',value:0 },{ field:'offsite_conversion.fb_pixel_complete_registration',operator:'LESS_THAN',value:1 },{ field:'offsite_conversion.fb_pixel_purchase',operator:'LESS_THAN',value:1 },{ field:'cost_per_lead_fb',operator:'LESS_THAN',value:cheapCPL },tdy]),
        execUnpause(), guardedUnpauseSchedule
      );
    } else {
      const spendGuard = Math.round(maxLeadCost * 2);
      await addRule(
        `UNPAUSE ${artype} — 2+ leads & spent<${(spendGuard/100).toFixed(2)}`,
        kw([{ field:'entity_type',operator:'EQUAL',value:artype },{ field:'offsite_conversion.fb_pixel_lead',operator:'GREATER_THAN',value:1 },{ field:'spent',operator:'LESS_THAN',value:spendGuard },tdy]),
        execUnpause(), guardedUnpauseSchedule
      );
    }
  }

  if (selectedRules.includes('TurnOn If Cheap Registration (CPA)')) {
    if (artype === 'CAMPAIGN') {
      await addRule(
        `UNPAUSE ${artype} — Cheap CPA(Reg) ≤ ${(cheapCPA/100).toFixed(2)} & no purchases`,
        kw([{ field:'entity_type',operator:'EQUAL',value:artype },{ field:'offsite_conversion.fb_pixel_complete_registration',operator:'GREATER_THAN',value:0 },{ field:'offsite_conversion.fb_pixel_purchase',operator:'LESS_THAN',value:1 },{ field:'cost_per_complete_registration_fb',operator:'LESS_THAN',value:cheapCPA },tdy]),
        execUnpause(), guardedUnpauseSchedule
      );
    } else {
      const spendGuard = Math.round(maxCPARegistration * 2);
      await addRule(
        `UNPAUSE ${artype} — 2+ regs & spent<${(spendGuard/100).toFixed(2)}`,
        kw([{ field:'entity_type',operator:'EQUAL',value:artype },{ field:'offsite_conversion.fb_pixel_complete_registration',operator:'GREATER_THAN',value:1 },{ field:'spent',operator:'LESS_THAN',value:spendGuard },tdy]),
        execUnpause(), guardedUnpauseSchedule
      );
    }
  }

  if (selectedRules.includes('TurnOn If Cheap Purchase (CPP)')) {
    if (artype === 'CAMPAIGN') {
      await addRule(
        `UNPAUSE ${artype} — Cheap CPP ≤ ${(cheapCPP/100).toFixed(2)}`,
        kw([{ field:'entity_type',operator:'EQUAL',value:artype },{ field:'offsite_conversion.fb_pixel_purchase',operator:'GREATER_THAN',value:0 },{ field:'cost_per_purchase_fb',operator:'LESS_THAN',value:cheapCPP },tdy]),
        execUnpause(), guardedUnpauseSchedule
      );
    } else {
      const spendGuard = Math.round(maxDepositCost * 2);
      await addRule(
        `UNPAUSE ${artype} — 2+ purchases & spent<${(spendGuard/100).toFixed(2)}`,
        kw([{ field:'entity_type',operator:'EQUAL',value:artype },{ field:'offsite_conversion.fb_pixel_purchase',operator:'GREATER_THAN',value:1 },{ field:'spent',operator:'LESS_THAN',value:spendGuard },tdy]),
        execUnpause(), guardedUnpauseSchedule
      );
    }
  }

  /* ------- Unpause activity-based (smart: cost check on CAMPAIGN, spend guard on ADSET/AD) ------- */
  if (selectedRules.includes('TurnOn If Clicks Present (>0)')) {
    if (artype === 'CAMPAIGN') {
      const spendForClickRule = maxCPC * 2;
      await addRule(
        `UNPAUSE ${artype} — Clicks>0 & CPC≤${(maxCPC/100).toFixed(2)} & no leads/regs/purch`,
        kw([{ field:'entity_type',operator:'EQUAL',value:artype },{ field:'link_click',operator:'GREATER_THAN',value:0 },{ field:'cost_per_link_click',operator:'LESS_THAN',value:maxCPC },{ field:'offsite_conversion.fb_pixel_lead',operator:'LESS_THAN',value:1 },{ field:'offsite_conversion.fb_pixel_complete_registration',operator:'LESS_THAN',value:1 },{ field:'offsite_conversion.fb_pixel_purchase',operator:'LESS_THAN',value:1 },tdy]),
        execUnpause(), guardedUnpauseSchedule
      );
    } else {
      const spendGuard = maxCPC * 1.5;
      await addRule(
        `UNPAUSE ${artype} — Clicks>0 & spent<${(spendGuard/100).toFixed(2)}`,
        kw([{ field:'entity_type',operator:'EQUAL',value:artype },{ field:'link_click',operator:'GREATER_THAN',value:0 },{ field:'spent',operator:'LESS_THAN',value:spendGuard },tdy]),
        execUnpause(), guardedUnpauseSchedule
      );
    }
  }

  if (selectedRules.includes('TurnOn If Leads Present (>0)')) {
    if (artype === 'CAMPAIGN') {
      await addRule(
        `UNPAUSE ${artype} — Leads>0 & CPL≤${(maxLeadCost/100).toFixed(2)} & no regs/purch`,
        kw([{ field:'entity_type',operator:'EQUAL',value:artype },{ field:'offsite_conversion.fb_pixel_lead',operator:'GREATER_THAN',value:0 },{ field:'cost_per_lead_fb',operator:'LESS_THAN',value:maxLeadCost },{ field:'offsite_conversion.fb_pixel_complete_registration',operator:'LESS_THAN',value:1 },{ field:'offsite_conversion.fb_pixel_purchase',operator:'LESS_THAN',value:1 },tdy]),
        execUnpause(), guardedUnpauseSchedule
      );
    } else {
      const spendGuard = Math.round(maxLeadCost * 1.5); // matches TurnOff Without Leads threshold
      await addRule(
        `UNPAUSE ${artype} — Leads>0 & spent<${(spendGuard/100).toFixed(2)}`,
        kw([{ field:'entity_type',operator:'EQUAL',value:artype },{ field:'offsite_conversion.fb_pixel_lead',operator:'GREATER_THAN',value:0 },{ field:'spent',operator:'LESS_THAN',value:spendGuard },tdy]),
        execUnpause(), guardedUnpauseSchedule
      );
    }
  }

  if (selectedRules.includes('TurnOn If Registrations Present (>0)')) {
    if (artype === 'CAMPAIGN') {
      await addRule(
        `UNPAUSE ${artype} — Reg>0 & CPA≤${(maxCPARegistration/100).toFixed(2)} & no purchases`,
        kw([{ field:'entity_type',operator:'EQUAL',value:artype },{ field:'offsite_conversion.fb_pixel_complete_registration',operator:'GREATER_THAN',value:0 },{ field:'cost_per_complete_registration_fb',operator:'LESS_THAN',value:maxCPARegistration },{ field:'offsite_conversion.fb_pixel_purchase',operator:'LESS_THAN',value:1 },tdy]),
        execUnpause(), guardedUnpauseSchedule
      );
    } else {
      const spendGuard = Math.round(maxCPARegistration * 2.5); // matches TurnOff Expensive Registrations threshold
      await addRule(
        `UNPAUSE ${artype} — Reg>0 & spent<${(spendGuard/100).toFixed(2)}`,
        kw([{ field:'entity_type',operator:'EQUAL',value:artype },{ field:'offsite_conversion.fb_pixel_complete_registration',operator:'GREATER_THAN',value:0 },{ field:'spent',operator:'LESS_THAN',value:spendGuard },tdy]),
        execUnpause(), guardedUnpauseSchedule
      );
    }
  }

  if (selectedRules.includes('TurnOn If Purchases Present (>0)')) {
    if (artype === 'CAMPAIGN') {
      await addRule(
        `UNPAUSE ${artype} — Purchases>0 & CPP≤${(maxDepositCost/100).toFixed(2)}`,
        kw([{ field:'entity_type',operator:'EQUAL',value:artype },{ field:'offsite_conversion.fb_pixel_purchase',operator:'GREATER_THAN',value:0 },{ field:'cost_per_purchase_fb',operator:'LESS_THAN',value:maxDepositCost },tdy]),
        execUnpause(), guardedUnpauseSchedule
      );
    } else {
      const spendGuard = Math.round(maxDepositCost * 2.5); // matches TurnOff Expensive Purchases threshold
      await addRule(
        `UNPAUSE ${artype} — Purchases>0 & spent<${(spendGuard/100).toFixed(2)}`,
        kw([{ field:'entity_type',operator:'EQUAL',value:artype },{ field:'offsite_conversion.fb_pixel_purchase',operator:'GREATER_THAN',value:0 },{ field:'spent',operator:'LESS_THAN',value:spendGuard },tdy]),
        execUnpause(), guardedUnpauseSchedule
      );
    }
  }

  /* ------- Budget boost on purchases ------- */
  if (selectedRules.includes('Budget: Increase budget by amount after N purchases')) {
    if (artype === 'AD') {
      log('Skip "Budget: Increase after purchases" — AD entity cannot change budget.', 'warning');
    } else {
      const N         = Math.max(1, purchaseBudgetBoost.purchasesN || 1);
      const addAmount = Math.max(0, purchaseBudgetBoost.raiseAmount || 0);
      const cap       = purchaseBudgetBoost.maxBudgetCap ?? null;
      if (!addAmount) {
        log('Skip purchase budget boost: raise amount is 0.', 'warning');
      } else {
        if (!cap) log('Purchase budget boost: no max cap set — rule may fire multiple times per day.', 'warning');
        const exec = execIncreaseBudgetByAmount(artype, addAmount, cap);
        if (exec) {
          await addRule(
            `BUDGET +${(addAmount/100).toFixed(2)} after ${N} purchase(s)${cap ? ` (cap ${(cap/100).toFixed(2)})` : ''}`,
            kw([{ field:'entity_type',operator:'EQUAL',value:artype },{ field:'offsite_conversion.fb_pixel_purchase',operator:'GREATER_THAN',value:Math.max(0,N-1) },presetToday]),
            exec, guardedUnpauseSchedule
          );
        }
      }
    }
  }

  /* ------- NEW: Budget Boost % after N purchases with good CPP ------- */
  if (selectedRules.includes('Budget: Boost % after N purchases with good CPP')) {
    if (artype === 'AD') {
      log('Skip "Budget Boost % after N purchases" — AD entity cannot change budget.', 'warning');
    } else if (artype !== 'CAMPAIGN') {
      log(`⚠️ Budget Boost % after N purchases — skipped for ${artype}: FB API does not allow cost_per_purchase_fb conditions on ADSET/AD level.`, 'warning');
    } else {
      const N   = Math.max(1, protection.boostPurchCount || 3);
      const pct = protection.boostPurchPct || 20;
      const cap = protection.boostPurchCap || null;
      const exec = execChangeBudgetPct(artype, pct, cap || undefined);
      if (exec) {
        if (!cap) log('⚠️ Budget Boost % after N purchases: no cap set — rule will fire every 30 min until end of day!', 'warning');
        await addRule(
          `BUDGET +${pct}% after ${N} purchase(s) good CPP ≤ ${(maxDepositCost/100).toFixed(2)}${cap ? ` (cap ${(cap/100).toFixed(2)})` : ''}`,
          kw([
            { field:'entity_type',                        operator:'EQUAL',        value: artype },
            { field:'offsite_conversion.fb_pixel_purchase',operator:'GREATER_THAN', value: Math.max(0, N-1) },
            { field:'cost_per_purchase_fb',               operator:'LESS_THAN',    value: maxDepositCost },
            presetToday
          ]),
          exec, schedSemi
        );
      }
    }
  }

  /* ------- NEW: Budget Boost % after N leads with good CPL ------- */
  if (selectedRules.includes('Budget: Boost % after N leads with good CPL')) {
    if (artype === 'AD') {
      log('Skip "Budget Boost % after N leads" — AD entity cannot change budget.', 'warning');
    } else if (artype !== 'CAMPAIGN') {
      log(`⚠️ Budget Boost % after N leads — skipped for ${artype}: FB API does not allow cost_per_lead_fb conditions on ADSET/AD level.`, 'warning');
    } else {
      const N   = Math.max(1, protection.boostLeadCount || 5);
      const pct = protection.boostLeadPct || 20;
      const cap = protection.boostLeadCap || null;
      const exec = execChangeBudgetPct(artype, pct, cap || undefined);
      if (exec) {
        await addRule(
          `BUDGET +${pct}% after ${N} lead(s) good CPL ≤ ${(maxLeadCost/100).toFixed(2)}${cap ? ` (cap ${(cap/100).toFixed(2)})` : ''}`,
          kw([
            { field:'entity_type',                     operator:'EQUAL',       value: artype },
            { field:'offsite_conversion.fb_pixel_lead', operator:'GREATER_THAN', value: Math.max(0, N-1) },
            { field:'cost_per_lead_fb',                operator:'LESS_THAN',   value: maxLeadCost },
            presetToday
          ]),
          exec, schedSemi
        );
        if (!cap) log('⚠️ Budget Boost % after N leads: no cap set — rule will fire every 30 min until end of day!', 'warning');
      }
    }
  }

  /* ------- NEW: Kill Switch — TurnOff ALL at time ------- */
  if (selectedRules.includes('Kill Switch: TurnOff All at Time')) {
    const km = protection.killMinute;
    if (!km && km !== 0) {
      log('⚠️ Kill Switch — no time set, skipped.', 'warning');
    } else {
      await addRule(
        `KILL SWITCH — Pause ALL ${artype}s at ${minutesToTimeStr(km)}`,
        [
          { field:'entity_type', operator:'EQUAL', value: artype },
          presetToday
        ],
        execPause(),
        scheduleAtMinute(km)
      );
    }
  }

  /* ------- Morning Reset — configurable conditions ------- */
  if (selectedRules.includes('Morning Reset: TurnOn by 7-day CPL')) {
    const mm         = protection.morningResetMinute;
    const costConds  = protection.morningResetConditions || [];
    const cntConds   = protection.morningResetCountConditions || [];
    const spendConds = protection.morningResetSpendConditions || [];
    const win        = protection.morningResetWindow || 'LAST_7D';

    if (!mm && mm !== 0) {
      log('⚠️ Morning Reset — no time set, skipped.', 'warning');
    } else if (!costConds.length && !cntConds.length && !spendConds.length) {
      log('⚠️ Morning Reset — no conditions selected, skipped.', 'warning');
    } else {
      // Cost conditions: filter out campaign-only fields on ADSET/AD
      const campaignOnlyFields = ['cost_per_lead_fb','cost_per_complete_registration_fb','cost_per_purchase_fb'];
      const allowedCost = costConds.filter(c => {
        if (campaignOnlyFields.includes(c.field) && artype !== 'CAMPAIGN') {
          log(`⚠️ Morning Reset — cost condition "${c.field}" skipped for ${artype} (CAMPAIGN only).`, 'warning');
          return false;
        }
        return true;
      });

      // Cost/count rule (existing behaviour)
      const allAllowed = [...allowedCost, ...cntConds];
      if (allAllowed.length) {
        const winLabel = { YESTERDAY: 'yesterday', LAST_3D: 'last 3d', LAST_7D: 'last 7d' }[win] || win;
        const costDesc = allowedCost.map(c => {
          const label = { cost_per_link_click:'CPC', cost_per_lead_fb:'CPL', cost_per_complete_registration_fb:'CPA', cost_per_purchase_fb:'CPP' }[c.field] || c.field;
          return `${label}≤${(c.value/100).toFixed(2)}`;
        });
        const cntDesc = cntConds.map(c => {
          const label = { link_click:'clicks', 'offsite_conversion.fb_pixel_lead':'leads', 'offsite_conversion.fb_pixel_complete_registration':'regs', 'offsite_conversion.fb_pixel_purchase':'purch' }[c.field] || c.field;
          return `${label}≥${c.value + 1}`;
        });
        const condDesc = [...costDesc, ...cntDesc].join(', ');
        const presetWin = { field: 'time_preset', value: win, operator: 'EQUAL' };
        await addRule(
          `MORNING RESET — Unpause ${artype} at ${minutesToTimeStr(mm)} [${winLabel}]: ${condDesc}`,
          kw([
            { field:'entity_type', operator:'EQUAL', value: artype },
            ...allowedCost.map(c => ({ field: c.field, operator: 'LESS_THAN',  value: c.value })),
            ...cntConds.map(c =>    ({ field: c.field, operator: c.operator,   value: c.value })),
            presetWin
          ]),
          execUnpause(),
          scheduleAtMinute(mm)
        );
      }

      // Spend-based rules — one rule per condition, all levels including AD
      // Always uses YESTERDAY window
      const thresholdMap = { maxCPC, maxLeadCost, maxCPARegistration, maxDepositCost };
      const cntFieldMap  = {
        maxCPC:             { field: 'link_click',                                        label: 'clicks'    },
        maxLeadCost:        { field: 'offsite_conversion.fb_pixel_lead',                  label: 'leads'     },
        maxCPARegistration: { field: 'offsite_conversion.fb_pixel_complete_registration', label: 'regs'      },
        maxDepositCost:     { field: 'offsite_conversion.fb_pixel_purchase',              label: 'purchases' },
      };
      const threshLabelMap = { maxCPC:'maxCPC', maxLeadCost:'maxLeadCost', maxCPARegistration:'maxCPA', maxDepositCost:'maxCPP' };
      const presetYesterday = { field: 'time_preset', value: 'YESTERDAY', operator: 'EQUAL' };

      for (const sc of spendConds) {
        const baseThreshold = thresholdMap[sc.thresholdRef];
        if (!baseThreshold) { log(`⚠️ Morning Reset Spend — unknown threshold ref "${sc.thresholdRef}", skipped.`, 'warning'); continue; }
        const spendLimit  = Math.round(baseThreshold * sc.mult);
        const cntInfo     = cntFieldMap[sc.thresholdRef];
        const threshLabel = threshLabelMap[sc.thresholdRef] || sc.thresholdRef;

        if (sc.scenario === 'A') {
          // Scenario A: cnt >= N AND spent < threshold*mult — good result, cheap
          const title = `MR Unpause ${artype} [A: cheap result] ${cntInfo.label}≥${sc.cntVal} & spent<${threshLabel}×${sc.mult}(${(spendLimit/100).toFixed(2)})`;
          await addRule(
            title,
            kw([
              { field:'entity_type',  operator:'EQUAL',        value: artype },
              { field: cntInfo.field, operator:'GREATER_THAN', value: sc.cntVal - 1 },
              { field:'spent',        operator:'LESS_THAN',    value: spendLimit },
              presetYesterday
            ]),
            execUnpause(),
            scheduleAtMinute(mm)
          );
        } else {
          // Scenario B: cnt < N AND spent < threshold*mult — barely ran, retry
          const title = `MR Unpause ${artype} [B: barely ran] ${cntInfo.label}<${sc.cntVal} & spent<${threshLabel}×${sc.mult}(${(spendLimit/100).toFixed(2)})`;
          await addRule(
            title,
            kw([
              { field:'entity_type',  operator:'EQUAL',     value: artype },
              { field: cntInfo.field, operator:'LESS_THAN', value: sc.cntVal },
              { field:'spent',        operator:'LESS_THAN', value: spendLimit },
              presetYesterday
            ]),
            execUnpause(),
            scheduleAtMinute(mm)
          );
        }
      }
    }
  }
}

/* -------------------- UI: RULES MANAGER -------------------- */
function mountManager(container) {
  container.innerHTML = '';

  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:16px';
  container.appendChild(grid);

  // export panel
  const expPanel = document.createElement('div');
  expPanel.style.cssText = 'background:var(--surf);border:1px solid var(--bdr);border-radius:10px;padding:16px';
  expPanel.innerHTML = `<div style="font-weight:700;font-size:14px;margin-bottom:12px">📤 Export / Delete</div><div id="mgr-exp"></div>`;
  grid.appendChild(expPanel);

  // import panel
  const impPanel = document.createElement('div');
  impPanel.style.cssText = 'background:var(--surf);border:1px solid var(--bdr);border-radius:10px;padding:16px';
  impPanel.innerHTML = `<div style="font-weight:700;font-size:14px;margin-bottom:12px">📥 Import</div><div id="mgr-imp"></div>`;
  grid.appendChild(impPanel);

  const logWrap = document.createElement('div');
  logWrap.style.gridColumn = 'span 2';
  logWrap.innerHTML = '<div class="ar-logbox" id="mgr-log"></div>';
  grid.appendChild(logWrap);

  const logEl = logWrap.querySelector('#mgr-log');
  const localLog = (msg, type = 'info') => {
    const d = document.createElement('div');
    d.style.margin = '2px 0';
    const color = type==='error'?'#fca5a5':type==='warning'?'#fcd34d':type==='success'?'#86efac':'#cbd5e1';
    d.innerHTML = `<span style="opacity:.45">${new Date().toLocaleTimeString()}</span> <span style="color:${color}">${escapeHtml(msg)}</span>`;
    logEl.appendChild(d);
    logEl.scrollTop = logEl.scrollHeight;
  };

  function buildExport() {
    const host = expPanel.querySelector('#mgr-exp');
    host.innerHTML = '';

    const sel = Object.assign(document.createElement('select'), { style: 'width:100%;margin-bottom:10px' });
    const def = Object.assign(document.createElement('option'), { value:'', textContent:'— choose account —', disabled:true, selected:true });
    sel.appendChild(def);
    ACCOUNTS_CACHE.forEach(a => {
      const o = document.createElement('option');
      o.value = a.id;
      const statusBadge = a.status === 1 ? '🟢' : '🔴';
      o.textContent = `${statusBadge} ${a.id} — ${a.name} [${a.ruleCount} rules] ${a.currency}`;
      sel.appendChild(o);
    });
    host.appendChild(sel);

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';

    const btnExp = document.createElement('button');
    btnExp.className = 'ar-btn ar-btn-primary ar-btn-sm';
    btnExp.textContent = '⬇️ Export JSON';

    const btnDel = document.createElement('button');
    btnDel.className = 'ar-btn ar-btn-danger ar-btn-sm';
    btnDel.textContent = '🗑 Delete All Rules';

    row.appendChild(btnExp);
    row.appendChild(btnDel);
    host.appendChild(row);

    btnExp.onclick = async () => {
      if (!sel.value) { alert('Select account.'); return; }
      STATUS.clear(); STATUS.show('Exporting…');
      await exportAutorules(sel.value, (m,t) => { localLog(m,t); STATUS.log(m,t); });
    };

    btnDel.onclick = async () => {
      if (!sel.value) { alert('Select account.'); return; }
      if (!confirm('Delete ALL rules from selected account?')) return;
      STATUS.clear(); STATUS.show('Deleting…');
      await Rules.clear(sel.value, (m,t) => { localLog(m,t); STATUS.log(m,t); });
      const idx = ACCOUNTS_CACHE.findIndex(a => a.id === sel.value);
      if (idx >= 0) ACCOUNTS_CACHE[idx].ruleCount = 0;
      buildExport(); buildImport();
    };
  }

  function buildImport() {
    const host = impPanel.querySelector('#mgr-imp');
    host.innerHTML = '';

    const lbl = document.createElement('div');
    lbl.style.cssText = 'font-size:12px;color:var(--muted);margin-bottom:6px';
    lbl.textContent = 'Select target account(s):';
    host.appendChild(lbl);

    const sel = document.createElement('select');
    sel.multiple = true;
    sel.size = Math.min(8, Math.max(3, ACCOUNTS_CACHE.length));
    sel.style.cssText = 'width:100%;margin-bottom:8px;background:var(--card);color:var(--txt);border:1px solid var(--bdr);border-radius:8px;padding:4px';
    ACCOUNTS_CACHE.forEach(a => {
      const o = document.createElement('option');
      o.value = a.id;
      o.textContent = `${a.id} — ${a.name} [${a.ruleCount}] ${a.currency}`;
      sel.appendChild(o);
    });
    host.appendChild(sel);

    const selAllWrap = document.createElement('label');
    selAllWrap.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted);margin-bottom:8px;cursor:pointer';
    const selAllCb = document.createElement('input');
    selAllCb.type = 'checkbox';
    selAllCb.style.accentColor = 'var(--acc)';
    selAllWrap.appendChild(selAllCb);
    selAllWrap.appendChild(document.createTextNode('Select all accounts'));
    host.appendChild(selAllWrap);
    selAllCb.onchange = () => Array.from(sel.options).forEach(o => o.selected = selAllCb.checked);

    const clearWrap = document.createElement('label');
    clearWrap.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted);margin-bottom:10px;cursor:pointer';
    const clearCb = document.createElement('input');
    clearCb.type = 'checkbox'; clearCb.style.accentColor = 'var(--acc)';
    clearWrap.appendChild(clearCb);
    clearWrap.appendChild(document.createTextNode('Delete existing rules before import'));
    host.appendChild(clearWrap);

    const btnImp = document.createElement('button');
    btnImp.className = 'ar-btn ar-btn-success ar-btn-sm';
    btnImp.textContent = '📂 Import from JSON file…';
    host.appendChild(btnImp);

    btnImp.onclick = () => {
      const ids = Array.from(sel.selectedOptions).map(o => o.value);
      if (!ids.length) { alert('Select at least one account.'); return; }
      const fi = Object.assign(document.createElement('input'), { type:'file', accept:'.json' });
      fi.onchange = async () => {
        if (!fi.files?.[0]) return;
        let json;
        try { json = JSON.parse(await fi.files[0].text()); }
        catch { alert('Invalid JSON file.'); return; }
        const rules = Array.isArray(json.rules) ? json.rules : null;
        if (!rules) { alert("File must contain a 'rules' array."); return; }

        STATUS.clear(); STATUS.show('Importing…');
        for (let i = 0; i < ids.length; i++) {
          const accId = ids[i];
          const pLog = (m,t) => { localLog(`[${i+1}/${ids.length}] ${m}`, t); STATUS.log(`[act_${accId}] ${m}`, t); };
          await importRulesToAccount(accId, rules, clearCb.checked, pLog);
        }
        buildExport(); buildImport();
        STATUS.log('Import finished.', 'success');
      };
      fi.click();
    };
  }

  (async () => {
    const loadMsg = document.createElement('div');
    loadMsg.style.cssText = 'color:var(--muted);font-size:13px;padding:8px 0';
    loadMsg.textContent = '⏳ Loading accounts…';
    expPanel.querySelector('#mgr-exp').appendChild(loadMsg);
    try {
      await loadAllAccountsWithRules(localLog);
    } finally {
      loadMsg.remove();
      buildExport();
      buildImport();
    }
  })();
}

/* ================== COLUMN PRESETS MODULE ================== */

/* --- CP: API helpers (use existing API layer) --- */
async function cpGetAccountId() {
  try { return require('BusinessUnifiedNavigationContext').adAccountID; }
  catch { const m = location.href.match(/act_(\d+)/); return m ? m[1] : null; }
}

async function cpFetchUserSettingsId(accId, log = (() => {})) {
  // Facebook requires ["..."] array notation for nested fields on act_XXXXX endpoint
  // Use getRaw so fields=["..."] is NOT URL-encoded (Facebook requires literal brackets)
  let js = await API.getRaw(`act_${accId}`, `fields=[]`);
  let usId = js?.user_settings?.id;
  if (!usId) {
    log(`No user_settings for ${accId}, creating…`, 'warning');
    js = await API.post(`act_${accId}/user_settings`, {});
    usId = js?.id;
  }
  if (!usId) throw new Error(`Cannot get user_settings for act_${accId}`);
  return usId;
}

async function cpUploadPreset(userSettingsId, presetData) {
  const js = await API.post(`${userSettingsId}/column_presets`, {
    name: presetData.name,
    attribution_windows: JSON.stringify(presetData.attribution_windows || []),
    columns: JSON.stringify(presetData.columns || []),
  });
  if (js?.error) throw new Error(js.error.message || JSON.stringify(js.error));
  return js.id;
}

async function cpSetDefault(accId, presetId) {
  return API.post(`act_${accId}/user_settings`, {
    default_column_preset: JSON.stringify({ id: presetId }),
    default_column_preset_id: presetId,
  });
}

async function cpUploadSize(accId, size) {
  const columns = (size.columns || []).reduce((a, { key, value }) => {
    a[key] = parseInt(value, 10); return a;
  }, {});
  const data = { page: size.page, tab: size.tab, columns: JSON.stringify(columns) };
  const js = await API.post(`act_${accId}/ad_column_sizes`, data);
  if (js?.id) await API.post(js.id, data);
}

async function cpFetchPresetsForAccount(accId, log = (() => {})) {
  // Use getRaw: fields=["..."] must NOT be URL-encoded — Facebook requires literal bracket notation
  // NOTE: default_column_preset_id removed — not available in v23.0, causes (#100) error
  const js = await API.getRaw(`act_${accId}`,
    `fields=["user_settings{id,column_presets{id,name,columns,attribution_windows,time_updated}},ad_column_sizes{page,tab,report,view,columns}"]`
  );
  if (js?.error) {
    log(`API error: ${js.error.message || JSON.stringify(js.error)}`, 'error');
    // Fallback: try without ad_column_sizes in case that field also causes issues
    const js2 = await API.getRaw(`act_${accId}`,
      `fields=["user_settings{id,column_presets{id,name,columns,attribution_windows,time_updated}}"]`
    );
    if (js2?.error) {
      log(`Fallback error: ${js2.error.message || JSON.stringify(js2.error)}`, 'error');
      log(`user_settings raw: ${JSON.stringify(js2?.user_settings)?.slice(0,300) || 'undefined'}`);
      return { userSettingsId: null, defaultId: null, presets: [], sizes: [] };
    }
    log(`Fallback OK. user_settings: ${JSON.stringify(js2?.user_settings)?.slice(0,200)}`);
    const us2 = js2?.user_settings ?? null;
    return {
      userSettingsId: us2?.id ?? null,
      defaultId:      null,
      presets:        us2?.column_presets?.data || [],
      sizes:          [],
    };
  }
  const us = js?.user_settings ?? null;
  log(`user_settings id: ${us?.id || 'none'}, presets: ${us?.column_presets?.data?.length ?? 0}`);
  return {
    userSettingsId: us?.id ?? null,
    defaultId:      null,
    presets:        us?.column_presets?.data || [],
    sizes:          js?.ad_column_sizes?.data || [],
  };
}

async function cpDeletePreset(presetId) {
  return API.del(presetId);
}

async function cpGetAllAccountIds(log = (() => {})) {
  let ids = [];
  const personal = await API.getAllPages('me/personal_ad_accounts', { fields: 'id' });
  ids = (personal || []).map(x => x.id.replace('act_', ''));
  log(`Personal accounts: ${ids.length}`);
  const bms = await API.getAllPages('me/businesses', { fields: 'id' });
  for (const bm of (bms || [])) {
    const owned  = await API.getAllPages(`${bm.id}/owned_ad_accounts`,  { fields: 'id' });
    const client = await API.getAllPages(`${bm.id}/client_ad_accounts`, { fields: 'id' });
    ids.push(...(owned  || []).map(x => x.id.replace('act_', '')));
    ids.push(...(client || []).map(x => x.id.replace('act_', '')));
  }
  const unique = [...new Set(ids)];
  log(`Total unique accounts: ${unique.length}`);
  return unique;
}

function cpSaveLocal(jsFile) {
  const key = 'ar_preset:' + (jsFile?.preset?.id || Date.now());
  localStorage.setItem(key, JSON.stringify(jsFile));
  return key;
}
function cpListLocalKeys() {
  return Object.keys(localStorage).filter(k => k.startsWith('ar_preset:'));
}
function cpValidate(obj) {
  if (!obj?.preset?.name || !Array.isArray(obj?.preset?.columns))
    throw new Error('Invalid preset file: missing preset.name or preset.columns[]');
  return obj;
}
function cpJsonDownload(filename, obj) {
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' })),
    download: filename
  });
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 0);
}
function cpPickFile() {
  return new Promise((resolve, reject) => {
    const fi = Object.assign(document.createElement('input'), { type: 'file', accept: '.json' });
    fi.onchange = async () => {
      try {
        if (!fi.files?.[0]) return reject(new Error('No file selected'));
        resolve(JSON.parse(await fi.files[0].text()));
      } catch (e) { reject(e); }
    };
    fi.click();
  });
}

/* --- CP: UI --- */
function mountColumnManager(container) {
  container.innerHTML = '';

  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:16px';
  container.appendChild(grid);

  /* ---- Left: preset list ---- */
  const leftPanel = document.createElement('div');
  leftPanel.style.cssText = 'background:var(--surf);border:1px solid var(--bdr);border-radius:10px;padding:16px';
  leftPanel.innerHTML = `
    <div style="font-weight:700;font-size:14px;margin-bottom:4px">📋 Presets — Current Account</div>
    <div id="cp-acc-id" style="font-size:11px;color:var(--muted);margin-bottom:10px">—</div>
    <div id="cp-preset-list" style="min-height:60px;margin-bottom:10px"></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button id="cp-refresh"     class="ar-btn ar-btn-ghost ar-btn-sm">🔄 Refresh</button>
      <button id="cp-export"      class="ar-btn ar-btn-primary ar-btn-sm">⬇️ Export</button>
      <button id="cp-set-default" class="ar-btn ar-btn-success ar-btn-sm">✅ Set Default</button>
      <button id="cp-delete"      class="ar-btn ar-btn-danger ar-btn-sm">🗑 Delete</button>
    </div>`;
  grid.appendChild(leftPanel);

  /* ---- Right: import actions ---- */
  const rightPanel = document.createElement('div');
  rightPanel.style.cssText = 'background:var(--surf);border:1px solid var(--bdr);border-radius:10px;padding:16px';
  rightPanel.innerHTML = `
    <div style="font-weight:700;font-size:14px;margin-bottom:10px">📤 Import / Apply</div>
    <div style="display:flex;flex-direction:column;gap:8px">
      <div style="font-size:11px;color:var(--muted)">This account:</div>
      <button id="cp-imp-this"  class="ar-btn ar-btn-primary ar-btn-sm">📂 Import preset → This account</button>
      <button id="cp-imp-sizes" class="ar-btn ar-btn-ghost ar-btn-sm">📐 Import column sizes → This account</button>
      <hr class="ar-divider" style="margin:4px 0">
      <div style="font-size:11px;color:var(--muted)">All accounts (from BM):</div>
      <button id="cp-imp-all" class="ar-btn ar-btn-ghost ar-btn-sm">🌐 Import preset → ALL accounts</button>
      <div id="cp-imp-prog" style="display:none">
        <div class="ar-progress"><div id="cp-imp-bar" class="ar-progress-bar"></div></div>
        <div id="cp-imp-status" style="font-size:11px;color:var(--muted);margin-top:4px"></div>
      </div>
      <hr class="ar-divider" style="margin:4px 0">
      <div style="font-size:11px;color:var(--muted)">Local cache:</div>
      <button id="cp-imp-local"   class="ar-btn ar-btn-ghost ar-btn-sm">💾 Apply from localStorage</button>
      <button id="cp-clear-local" class="ar-btn ar-btn-ghost ar-btn-sm">🗑 Clear local cache</button>
    </div>`;
  grid.appendChild(rightPanel);

  /* ---- Log ---- */
  const logWrap = document.createElement('div');
  logWrap.style.gridColumn = 'span 2';
  logWrap.innerHTML = '<div class="ar-logbox" id="cp-log"></div>';
  grid.appendChild(logWrap);

  const logEl = logWrap.querySelector('#cp-log');
  const log = (msg, type = 'info') => {
    const d = document.createElement('div');
    d.style.margin = '2px 0';
    const c = type==='error'?'#fca5a5':type==='warning'?'#fcd34d':type==='success'?'#86efac':'#cbd5e1';
    d.innerHTML = `<span style="opacity:.45">${new Date().toLocaleTimeString()}</span> <span style="color:${c}">${escapeHtml(String(msg))}</span>`;
    logEl.appendChild(d);
    logEl.scrollTop = logEl.scrollHeight;
  };

  /* ---- State ---- */
  let currentAccId  = null;
  let currentData   = null;
  let selectedPresetId = null;

  /* ---- Render preset list ---- */
  function renderPresets(data) {
    const listEl = leftPanel.querySelector('#cp-preset-list');
    listEl.innerHTML = '';
    selectedPresetId = null;
    if (!data.presets.length) {
      listEl.innerHTML = '<div style="color:var(--muted);font-size:12px;padding:8px 0">No presets found</div>';
      return;
    }
    data.presets.forEach(p => {
      const isDefault = p.id === data.defaultId;
      const cols = (p.columns || []).length;
      const date = p.time_updated ? new Date(p.time_updated * 1000).toLocaleDateString() : '';
      const lbl = document.createElement('label');
      lbl.dataset.pid = p.id;
      lbl.style.cssText = 'display:block;padding:5px 8px;border-radius:5px;border:1px solid var(--bdr);margin-bottom:4px;cursor:pointer;background:var(--card);line-height:1.4;';
      const rb = document.createElement('input');
      rb.type = 'radio'; rb.name = 'cp-preset-radio'; rb.value = p.id;
      rb.style.cssText = 'accent-color:var(--acc);cursor:pointer;margin-right:7px;vertical-align:middle;';
      lbl.appendChild(rb);
      const nameSpan = document.createElement('span');
      nameSpan.textContent = p.name;
      nameSpan.style.cssText = 'font-size:12px;font-weight:600;color:var(--txt);vertical-align:middle;';
      lbl.appendChild(nameSpan);
      if (isDefault) {
        const badge = document.createElement('span');
        badge.textContent = '✅ default';
        badge.style.cssText = 'font-size:10px;font-weight:600;color:#22c55e;background:rgba(34,197,94,.12);padding:1px 6px;border-radius:4px;margin-left:6px;vertical-align:middle;';
        lbl.appendChild(badge);
      }
      const meta = document.createElement('div');
      meta.textContent = `${p.id} · ${cols} cols${date ? ' · ' + date : ''}`;
      meta.style.cssText = 'font-size:10px;color:var(--muted);margin-left:22px;margin-top:1px;';
      lbl.appendChild(meta);
      lbl.addEventListener('mouseenter', () => { if (selectedPresetId !== p.id) lbl.style.borderColor = '#4b80c8'; });
      lbl.addEventListener('mouseleave', () => { if (selectedPresetId !== p.id) lbl.style.borderColor = 'var(--bdr)'; });
      lbl.addEventListener('click', () => {
        listEl.querySelectorAll('[data-pid]').forEach(r => { r.style.borderColor = 'var(--bdr)'; r.style.background = 'var(--card)'; });
        lbl.style.borderColor = 'var(--acc)';
        lbl.style.background = 'rgba(59,130,246,.07)';
        rb.checked = true;
        selectedPresetId = p.id;
      });
      listEl.appendChild(lbl);
    });
  }

  /* ---- Load presets ---- */
  async function loadPresets() {
    const accEl  = leftPanel.querySelector('#cp-acc-id');
    const listEl = leftPanel.querySelector('#cp-preset-list');
    listEl.innerHTML = '<div style="color:var(--muted);font-size:12px;padding:8px 0">⏳ Loading…</div>';
    try {
      currentAccId = await cpGetAccountId();
      if (!currentAccId) { log('Cannot detect account ID. Open a specific ad account.', 'error'); return; }
      accEl.textContent = `Account: act_${currentAccId}`;
      log(`Loading presets for act_${currentAccId}…`);
      currentData = await cpFetchPresetsForAccount(currentAccId, log);
      renderPresets(currentData);
      log(`Loaded ${currentData.presets.length} preset(s). Default: ${currentData.defaultId || 'none'}. user_settings id: ${currentData.userSettingsId || '⚠️ not found'}`,
        currentData.presets.length > 0 ? 'success' : 'warning');
    } catch (e) { log(`Load error: ${e.message || e}`, 'error'); listEl.innerHTML = ''; }
  }

  /* ---- Buttons: left panel ---- */
  leftPanel.querySelector('#cp-refresh').onclick = loadPresets;

  leftPanel.querySelector('#cp-export').onclick = async () => {
    if (!selectedPresetId) { log('Select a preset first', 'warning'); return; }
    try {
      const found = currentData?.presets.find(p => p.id === selectedPresetId);
      if (!found) { log('Preset not found in list', 'error'); return; }
      const jsFile = { preset: found, sizes: currentData?.sizes || [] };
      cpJsonDownload(`${found.name}.json`, jsFile);
      cpSaveLocal(jsFile);
      log(`Exported & cached: ${found.name}`, 'success');
    } catch (e) { log(`Export error: ${e.message || e}`, 'error'); }
  };

  leftPanel.querySelector('#cp-set-default').onclick = async () => {
    if (!selectedPresetId) { log('Select a preset first', 'warning'); return; }
    try {
      await cpSetDefault(currentAccId, selectedPresetId);
      log(`Default preset → ${selectedPresetId}`, 'success');
      await loadPresets();
    } catch (e) { log(`Error: ${e.message || e}`, 'error'); }
  };

  leftPanel.querySelector('#cp-delete').onclick = async () => {
    if (!selectedPresetId) { log('Select a preset first', 'warning'); return; }
    const found = currentData?.presets.find(p => p.id === selectedPresetId);
    if (!confirm(`Delete preset "${found?.name || selectedPresetId}"?`)) return;
    try {
      await cpDeletePreset(selectedPresetId);
      log(`Deleted: ${found?.name || selectedPresetId}`, 'success');
      selectedPresetId = null;
      await loadPresets();
    } catch (e) { log(`Delete error: ${e.message || e}`, 'error'); }
  };

  /* ---- Buttons: right panel ---- */
  rightPanel.querySelector('#cp-imp-this').onclick = async () => {
    try {
      log('Pick JSON file…');
      const jsFile = cpValidate(await cpPickFile());
      log(`Importing "${jsFile.preset.name}" to act_${currentAccId}…`);
      const usId     = await cpFetchUserSettingsId(currentAccId, log);
      const presetId = await cpUploadPreset(usId, jsFile.preset);
      await cpSetDefault(currentAccId, presetId);
      log(`Done: preset "${jsFile.preset.name}" set as default (${presetId})`, 'success');
      await loadPresets();
      if (confirm('Reload page with new preset?')) {
        const u = new URL(location.href);
        u.searchParams.set('column_preset', presetId);
        location.href = u.toString();
      }
    } catch (e) { log(`Import error: ${e.message || e}`, 'error'); }
  };

  rightPanel.querySelector('#cp-imp-sizes').onclick = async () => {
    try {
      log('Pick JSON file with sizes…');
      const jsFile = await cpPickFile();
      const sizes = jsFile?.sizes || [];
      if (!sizes.length) { log('No sizes[] found in file', 'warning'); return; }
      log(`Uploading ${sizes.length} size(s) to act_${currentAccId}…`);
      for (let i = 0; i < sizes.length; i++) {
        await cpUploadSize(currentAccId, sizes[i]);
        await sleep(150);
      }
      log(`Column sizes imported: ${sizes.length}`, 'success');
    } catch (e) { log(`Sizes error: ${e.message || e}`, 'error'); }
  };

  rightPanel.querySelector('#cp-imp-all').onclick = async () => {
    try {
      log('Pick JSON file…');
      const jsFile = cpValidate(await cpPickFile());
      log('Fetching all account IDs from BM…');
      const allIds = await cpGetAllAccountIds(log);

      const progWrap  = rightPanel.querySelector('#cp-imp-prog');
      const bar       = rightPanel.querySelector('#cp-imp-bar');
      const statusEl  = rightPanel.querySelector('#cp-imp-status');
      progWrap.style.display = 'block';
      bar.style.width = '0%';

      let ok = 0, fail = 0;
      for (let i = 0; i < allIds.length; i++) {
        const acc = allIds[i];
        statusEl.textContent = `${i+1}/${allIds.length} — act_${acc}`;
        bar.style.width = `${Math.round((i+1)/allIds.length*100)}%`;
        try {
          const usId     = await cpFetchUserSettingsId(acc, log);
          const presetId = await cpUploadPreset(usId, jsFile.preset);
          await cpSetDefault(acc, presetId);
          log(`act_${acc} ✅ ${jsFile.preset.name}`, 'success');
          ok++;
        } catch (e) {
          log(`act_${acc} ❌ ${e.message || e}`, 'error');
          fail++;
        }
        await sleep(400);
      }
      bar.style.width = '100%';
      statusEl.textContent = `Done: ${ok} ok / ${fail} failed`;
      log(`Import to ALL done: ${ok} success, ${fail} failed`, ok > 0 ? 'success' : 'error');
      setTimeout(() => { progWrap.style.display = 'none'; bar.style.width = '0%'; }, 4000);
    } catch (e) { log(`Error: ${e.message || e}`, 'error'); }
  };

  rightPanel.querySelector('#cp-imp-local').onclick = async () => {
    const keys = cpListLocalKeys();
    if (!keys.length) { log('No local presets in cache', 'warning'); return; }
    const list = keys.map((k, i) => `${i+1}. ${k.replace('ar_preset:', '')}`).join('\n');
    const n = parseInt(prompt('Select local preset:\n' + list), 10) - 1;
    if (isNaN(n) || n < 0 || n >= keys.length) return;
    try {
      const jsFile = cpValidate(JSON.parse(localStorage.getItem(keys[n])));
      const usId     = await cpFetchUserSettingsId(currentAccId, log);
      const presetId = await cpUploadPreset(usId, jsFile.preset);
      await cpSetDefault(currentAccId, presetId);
      log(`Imported from cache: ${jsFile.preset.name} (${presetId})`, 'success');
      await loadPresets();
    } catch (e) { log(`Error: ${e.message || e}`, 'error'); }
  };

  rightPanel.querySelector('#cp-clear-local').onclick = () => {
    const keys = cpListLocalKeys();
    if (!keys.length) { log('Cache is already empty', 'warning'); return; }
    if (!confirm(`Delete ${keys.length} cached preset(s) from localStorage?`)) return;
    keys.forEach(k => localStorage.removeItem(k));
    log(`Cleared ${keys.length} cached preset(s)`, 'success');
  };

  /* ---- Auto-load on tab mount ---- */
  loadPresets();
}

/* -------------------- UI: ANALYTICS -------------------- */
function mountAnalytics(container) {
  container.innerHTML = '';

  const PERIODS = [
    { label: '📅 Today',        preset: 'today',      defaultOn: true  },
    { label: '🕐 Yesterday',    preset: 'yesterday',  defaultOn: false },
    { label: '3️⃣ Last 3 days', preset: 'last_3d',   defaultOn: false },
    { label: '7️⃣ Last 7 days', preset: 'last_7d',   defaultOn: true  },
    { label: '📆 This month',   preset: 'this_month', defaultOn: false },
    { label: '🗓️ Last month',  preset: 'last_month', defaultOn: false },
  ];

  /* ---- layout ---- */
  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:280px 1fr;gap:16px;align-items:start;';

  /* ---- left: settings ---- */
  const left = document.createElement('div');
  left.style.cssText = 'background:var(--card);border:1px solid var(--bdr);border-radius:10px;padding:16px;';

  function sectionLabel(text) {
    const d = document.createElement('div');
    d.style.cssText = 'font-size:10px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.6px;margin:12px 0 5px;';
    d.textContent = text;
    return d;
  }

  const title = document.createElement('div');
  title.style.cssText = 'font-size:13px;font-weight:700;color:var(--txt);margin-bottom:4px;';
  title.textContent = '⚙️ Settings';
  left.appendChild(title);

  /* scope */
  left.appendChild(sectionLabel('Account scope'));
  const scopeWrap = document.createElement('div');
  [['current','Current account'],['all','All accounts (BM)']].forEach(([val, lbl], i) => {
    const label = document.createElement('label');
    label.style.cssText = 'display:block;padding:2px 0;cursor:pointer;font-size:12px;color:var(--txt);line-height:1.8;';
    const rb = document.createElement('input');
    rb.type='radio'; rb.name='anl-scope'; rb.value=val; if(i===0) rb.checked=true;
    rb.style.cssText = 'accent-color:var(--acc);margin-right:7px;cursor:pointer;vertical-align:middle;';
    label.appendChild(rb);
    label.appendChild(document.createTextNode(lbl));
    scopeWrap.appendChild(label);
  });
  left.appendChild(scopeWrap);

  /* level */
  left.appendChild(sectionLabel('Data level'));
  const levelWrap = document.createElement('div');
  [['account','Account total'],['campaign','Per campaign'],['adset','Per adset'],['ad','Per ad (full hierarchy)']].forEach(([val, lbl], i) => {
    const label = document.createElement('label');
    label.style.cssText = 'display:block;padding:2px 0;cursor:pointer;font-size:12px;color:var(--txt);line-height:1.8;';
    const rb = document.createElement('input');
    rb.type='radio'; rb.name='anl-level'; rb.value=val; if(i===0) rb.checked=true;
    rb.style.cssText = 'accent-color:var(--acc);margin-right:7px;cursor:pointer;vertical-align:middle;';
    label.appendChild(rb);
    label.appendChild(document.createTextNode(lbl));
    levelWrap.appendChild(label);
  });
  left.appendChild(levelWrap);

  /* periods */
  left.appendChild(sectionLabel('Time periods'));
  const periodsWrap = document.createElement('div');
  PERIODS.forEach(p => {
    const label = document.createElement('label');
    label.style.cssText = 'display:block;padding:2px 0;cursor:pointer;font-size:12px;color:var(--txt);line-height:1.8;';
    const cb = document.createElement('input');
    cb.type='checkbox'; cb.value=p.preset; cb.checked=p.defaultOn;
    cb.style.cssText = 'accent-color:var(--acc);margin-right:7px;cursor:pointer;vertical-align:middle;';
    label.appendChild(cb);
    label.appendChild(document.createTextNode(p.label));
    periodsWrap.appendChild(label);
  });
  left.appendChild(periodsWrap);

  /* select all / none */
  const selRow = document.createElement('div');
  selRow.style.cssText = 'display:flex;gap:6px;margin:8px 0 14px;';
  ['Select All','Deselect All'].forEach((txt, i) => {
    const btn = document.createElement('button');
    btn.className = 'ar-btn ar-btn-ghost ar-btn-sm'; btn.textContent = txt;
    btn.onclick = () => periodsWrap.querySelectorAll('input').forEach(cb => cb.checked = !i);
    selRow.appendChild(btn);
  });
  left.appendChild(selRow);

  /* fetch button */
  const fetchBtn = document.createElement('button');
  fetchBtn.className = 'ar-btn ar-btn-primary';
  fetchBtn.style.cssText = 'width:100%;font-size:13px;padding:10px;';
  fetchBtn.textContent = '📊 Fetch & Export CSV';
  left.appendChild(fetchBtn);

  /* ---- right: log ---- */
  const right = document.createElement('div');
  right.style.cssText = 'background:var(--card);border:1px solid var(--bdr);border-radius:10px;padding:16px;';
  const rightTitle = document.createElement('div');
  rightTitle.style.cssText = 'font-size:13px;font-weight:700;color:var(--txt);margin-bottom:10px;';
  rightTitle.textContent = '📋 Progress';
  right.appendChild(rightTitle);
  const logEl = document.createElement('div');
  logEl.style.cssText = 'background:var(--bg);border:1px solid var(--bdr);border-radius:6px;padding:8px 10px;height:320px;overflow:auto;font:11px/1.5 ui-monospace,monospace;color:var(--txt);';
  right.appendChild(logEl);

  grid.appendChild(left);
  grid.appendChild(right);
  container.appendChild(grid);

  /* ---- helpers ---- */
  function log(msg, type='info') {
    const colors = {info:'var(--txt)',success:'#22c55e',warning:'#f59e0b',error:'#ef4444'};
    const line = document.createElement('div');
    line.style.color = colors[type] || colors.info;
    line.textContent = new Date().toLocaleTimeString() + ' ' + msg;
    logEl.appendChild(line); logEl.scrollTop = logEl.scrollHeight;
  }
  function getAct(arr, type) {
    if (!Array.isArray(arr)) return '';
    const x = arr.find(a => a.action_type === type);
    return x ? x.value : '';
  }
  function getCPA(arr, type) {
    if (!Array.isArray(arr)) return '';
    const x = arr.find(a => a.action_type === type);
    return x ? parseFloat(x.value).toFixed(2) : '';
  }
  function getRoas(arr) {
    if (!Array.isArray(arr) || !arr.length) return '';
    return parseFloat(arr[0].value).toFixed(3);
  }
  function n(v, dec=2) { return v != null && v !== '' ? parseFloat(v).toFixed(dec) : ''; }

  function buildRow(preset, d, level) {
    const acts  = d.actions || [];
    const cpa   = d.cost_per_action_type || [];
    const wctr  = d.website_ctr || [];
    const oc    = d.outbound_clicks || [];
    const ulpv  = d.unique_actions || [];
    const v3s   = d.video_thruplay_watched_actions || [];
    const v25   = d.video_p25_watched_actions || [];

    // Outbound link clicks (to external site, excludes "More" / carousel arrows)
    const outClicks  = oc.find(x => x.action_type === 'outbound_click')?.value || '';
    const outCTR     = wctr.find(x => x.action_type === 'link_click')?.value   || '';
    // ThruPlay (video watched to end or 15s)
    const thruplay   = v3s.find(x => x.action_type === 'video_view')?.value    || '';
    // Hook rate source: 25% video watched
    const v25val     = v25.find(x => x.action_type === 'video_view')?.value    || '';

    const row = {
      'Account ID':    d.account_id   || '',
      'Account Name':  d.account_name || '',
    };
    // Hierarchy columns
    if (level === 'campaign' || level === 'adset' || level === 'ad') {
      row['Campaign ID']  = d.campaign_id   || '';
      row['Campaign']     = d.campaign_name || '';
    }
    if (level === 'adset' || level === 'ad') {
      // adset_name fallback: FB sometimes returns ID as name — use dedicated field
      row['Adset ID']  = d.adset_id   || '';
      row['Adset']     = (d.adset_name && d.adset_name !== d.adset_id) ? d.adset_name : '';
    }
    if (level === 'ad') {
      row['Ad ID']  = d.ad_id   || '';
      row['Ad']     = d.ad_name || '';
    }
    Object.assign(row, {
      'Period':             preset,
      // ---- Spend & Volume ----
      'Spend':              n(d.spend, 2),
      'Impressions':        d.impressions || '',
      'Reach':              d.reach       || '',
      'Frequency':          n(d.frequency, 2),
      // ---- Click metrics ----
      'Clicks (all)':       d.clicks      || '',
      'Outbound Clicks':    outClicks,
      'CTR% (all)':         n(d.ctr, 2),
      'Outbound CTR%':      outCTR ? n(outCTR, 2) : '',
      'CPC (all)':          n(d.cpc, 3),
      // ---- Landing ----
      'LPV':                getAct(acts, 'omni_landing_page_view'),
      'Cost/LPV':           getCPA(cpa, 'omni_landing_page_view'),
      // ---- Cost & Efficiency ----
      'CPM':                n(d.cpm, 2),
      // ---- Quality Rankings (FB signal vs competitors) ----
      'Quality Rank':       d.quality_ranking            || '',
      'Engagement Rank':    d.engagement_rate_ranking    || '',
      'Conversion Rank':    d.conversion_rate_ranking    || '',
      // ---- Conversions ----
      'Leads':              getAct(acts, 'lead'),
      'CPL':                getCPA(cpa,  'lead'),
      'Registrations':      getAct(acts, 'omni_complete_registration'),
      'CPA(Reg)':           getCPA(cpa,  'omni_complete_registration'),
      'Purchases':          getAct(acts, 'purchase'),
      'CPP':                getCPA(cpa,  'purchase'),
      'ROAS':               getRoas(d.website_purchase_roas),
      // ---- Video ----
      'ThruPlay':           thruplay,
      'Video 25%':          v25val,
    });
    return row;
  }

  /* ---- CSV generator (UTF-8 BOM — Excel opens without issues on any OS) ---- */
  function generateCSV(rows) {
    if (!rows.length) return '';
    const headers = Object.keys(rows[0]);
    const escCell = v => {
      const s = String(v ?? '');
      // Wrap in quotes if value contains comma, quote, or newline
      return (s.includes(',') || s.includes('"') || s.includes('\n'))
        ? '"' + s.replace(/"/g, '""') + '"'
        : s;
    };
    const lines = [headers.map(escCell).join(',')];
    rows.forEach(row => lines.push(headers.map(h => escCell(row[h] ?? '')).join(',')));
    // UTF-8 BOM (\uFEFF) ensures Excel reads Cyrillic/Unicode correctly
    return '\uFEFF' + lines.join('\r\n');
  }

  function downloadCSV(csv, filename) {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }

  /* ---- main fetch ---- */
  fetchBtn.onclick = async () => {
    const periods = [...periodsWrap.querySelectorAll('input:checked')].map(cb => cb.value);
    if (!periods.length) { log('Select at least one time period', 'warning'); return; }
    const scope = left.querySelector('input[name="anl-scope"]:checked').value;
    const level = left.querySelector('input[name="anl-level"]:checked').value;

    fetchBtn.disabled = true; fetchBtn.textContent = '⏳ Fetching…';
    logEl.innerHTML = '';
    const allRows = [];

    try {
      let accountIds = [];
      if (scope === 'all') {
        log('Collecting all account IDs from BM…');
        accountIds = await cpGetAllAccountIds(log);
        log(`Found ${accountIds.length} account(s)`, 'success');
      } else {
        const id = await cpGetAccountId();
        if (!id) { log('Cannot detect current account ID', 'error'); return; }
        accountIds = [id];
        log(`Using current account: act_${id}`);
      }

      const hierarchyFields = {
        account:  [],
        campaign: ['campaign_id','campaign_name'],
        adset:    ['campaign_id','campaign_name','adset_id','adset_name'],
        ad:       ['campaign_id','campaign_name','adset_id','adset_name','ad_id','ad_name'],
      };
      const fields = [
        'account_id','account_name',
        ...(hierarchyFields[level] || []),
        // Spend & volume
        'spend','impressions','reach','frequency',
        // Clicks
        'clicks','ctr','cpc','outbound_clicks','website_ctr',
        // CPM
        'cpm',
        // Landing page views
        'actions','cost_per_action_type',
        // Quality rankings
        'quality_ranking','engagement_rate_ranking','conversion_rate_ranking',
        // ROAS
        'website_purchase_roas',
        // Video
        'video_thruplay_watched_actions','video_p25_watched_actions',
      ].join(',');

      for (const accId of accountIds) {
        for (const preset of periods) {
          try {
            const js = await API.get(`act_${accId}/insights`, { fields, date_preset: preset, level });
            if (js?.error) { log(`⚠ act_${accId}/${preset}: ${js.error.message}`, 'warning'); continue; }
            const data = js?.data || [];
            if (!data.length) { log(`act_${accId}/${preset}: no data`); continue; }
            data.forEach(d => allRows.push(buildRow(preset, d, level)));
            log(`✓ act_${accId} / ${preset} — ${data.length} row(s)`, 'success');
          } catch(e) { log(`✗ act_${accId}/${preset}: ${e.message}`, 'error'); }
          await sleep(300);
        }
      }

      if (!allRows.length) { log('No data collected — nothing to export', 'warning'); return; }
      log(`Total: ${allRows.length} row(s). Generating Excel file…`);
      const csv = generateCSV(allRows);
      const date = new Date().toISOString().slice(0,10);
      downloadCSV(csv, `fb_stats_${date}.csv`);
      log(`✅ Downloaded: fb_stats_${date}.csv`, 'success');
    } catch(e) {
      log(`Fatal: ${e.message}`, 'error');
    } finally {
      fetchBtn.disabled = false; fetchBtn.textContent = '📊 Fetch & Export CSV';
    }
  };
}

/* -------------------- UI: INSPECTOR -------------------- */
function mountInspector(container) {

/* =========================================================
   FB Account Inspector v1.0 (2026-03)
   Standalone bookmarklet - shows all info for the current token:
   > User profile
   > Ad Accounts (status, limit, spent, balance)
   > Pages (status, likes, category)
   > Business Managers (verification status)
   Links to navigate to every node.
   ========================================================= */

const HOST_GRAPH = 'https://graph.facebook.com/v23.0';

if (!TOKEN) {
  alert('Token (__accessToken) not found.\nOpen Ads Manager inside Business Manager and try again.');
  return;
}

/* -- API -------------------------------------------------- */
async function apiGet(path, params) {
  params = params || {};
  params.access_token = TOKEN;
  const url = HOST_GRAPH + '/' + path + '?' + new URLSearchParams(params);
  const r = await fetch(url, { credentials: 'include' });
  const j = await r.json();
  if (j.error) throw new Error('[' + j.error.code + '] ' + j.error.message);
  return j;
}

async function fetchAll(path, params) {
  params = params || {};
  const p = Object.assign({}, params, { limit: 200, access_token: TOKEN });
  let url = HOST_GRAPH + '/' + path + '?' + new URLSearchParams(p);
  let data = [];
  while (url) {
    const r = await fetch(url, { credentials: 'include' });
    const j = await r.json();
    if (j.error) throw new Error('[' + j.error.code + '] ' + j.error.message);
    data = data.concat(j.data || []);
    url = (j.paging && j.paging.next) || null;
  }
  return data;
}

/* -- STATUS MAPS ------------------------------------------ */
const ACC_STATUS = {
  1:'ACTIVE', 2:'DISABLED', 3:'UNSETTLED', 7:'PENDING_RISK_REVIEW',
  8:'PENDING_SETTLEMENT', 9:'IN_GRACE_PERIOD', 100:'PENDING_CLOSURE',
  101:'CLOSED', 201:'ANY_ACTIVE', 202:'ANY_CLOSED'
};

function statusBadge(code) {
  const label = ACC_STATUS[code] || ('Status ' + code);
  const color = code === 1 ? '#22c55e' : (code === 2 || code === 101) ? '#ef4444' : '#f59e0b';
  const bg    = code === 1 ? 'rgba(34,197,94,.12)' : (code === 2 || code === 101) ? 'rgba(239,68,68,.12)' : 'rgba(245,158,11,.12)';
  return '<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;background:' + bg + ';color:' + color + '">' + label + '</span>';
}

function verBadge(v) {
  const ok    = v === 'verified';
  const color = ok ? '#22c55e' : '#94a3b8';
  const bg    = ok ? 'rgba(34,197,94,.12)' : 'rgba(148,163,184,.08)';
  return '<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;background:' + bg + ';color:' + color + '">' + (v || 'n/a') + '</span>';
}

function cents(val, currency) {
  if (val === undefined || val === null || val === '') return '-';
  const n = parseFloat(val) / 100;
  if (isNaN(n)) return '-';
  try {
    return n.toLocaleString('en-US', { style: 'currency', currency: currency || 'USD', maximumFractionDigits: 0 });
  } catch(e) { return '$' + Math.round(n).toLocaleString(); }
}

function esc(s) {
  return String(s || '').replace(/[&<>"']/g, function(m) {
    return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'": '&#39;' }[m];
  });
}

function tzOffset(tzName) {
  if (!tzName) return '-';
  try {
    const now = new Date();
    const utc = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
    const loc = new Date(now.toLocaleString('en-US', { timeZone: tzName }));
    const off = (loc - utc) / 3600000;
    const h   = Math.floor(Math.abs(off));
    const m   = Math.round((Math.abs(off) - h) * 60);
    const s   = off >= 0 ? '+' : '-';
    return s + h + (m ? ':' + String(m).padStart(2,'0') : '');
  } catch(e) { return '?'; }
}

function miniBar(spentN, capN, cur, label) {
  var spentFmt = spentN.toLocaleString('en-US', { style:'currency', currency:cur, maximumFractionDigits:0 });
  if (!capN) return '<div style="margin-bottom:6px">'
    + '<div style="font-size:10px;color:#64748b;margin-bottom:2px">' + label + '</div>'
    + '<span style="color:#22c55e;font-weight:600;font-size:12px">' + spentFmt + '</span>'
    + '<span style="color:#64748b;font-size:10px"> / no limit</span>'
    + '</div>';
  var pct      = Math.min(100, Math.round(spentN / capN * 100));
  var capFmt   = capN.toLocaleString('en-US', { style:'currency', currency:cur, maximumFractionDigits:0 });
  var rem      = Math.max(0, capN - spentN);
  var remFmt   = rem.toLocaleString('en-US', { style:'currency', currency:cur, maximumFractionDigits:0 });
  var barColor = pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#22c55e';
  return '<div style="margin-bottom:8px">'
    + '<div style="font-size:10px;color:#64748b;margin-bottom:3px;font-weight:600;text-transform:uppercase;letter-spacing:.03em">' + label + '</div>'
    + '<div style="white-space:nowrap;margin-bottom:3px">'
    + '<span style="color:#22c55e;font-weight:700;font-size:13px">' + spentFmt + '</span>'
    + '<span style="color:#64748b;font-size:11px"> / ' + capFmt + '</span>'
    + '</div>'
    + '<div style="background:#374151;border-radius:3px;height:5px;width:140px;margin-bottom:2px">'
    + '<div style="height:5px;border-radius:3px;background:' + barColor + ';width:' + pct + '%"></div>'
    + '</div>'
    + '<div style="font-size:10px;color:' + barColor + '">' + pct + '% used &middot; left: ' + remFmt + '</div>'
    + '</div>';
}

/* -- CSS -------------------------------------------------- */

  const _inspSt = document.getElementById('fbi-style');
  if (_inspSt) _inspSt.remove();
  const _st = document.createElement('style');
  _st.id = 'fbi-style';
  _st.textContent = [
    '#ar-insp *{box-sizing:border-box;margin:0;padding:0;font-family:inherit}',
    '#ar-insp{color:#e2e8f0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;padding:4px 0}',
    '#ar-insp .fbi-tabs{display:flex;gap:2px;padding-bottom:12px;margin-bottom:16px;border-bottom:1px solid #1f2937;flex-shrink:0;flex-wrap:wrap}',
    '#ar-insp .fbi-tab{padding:7px 18px;border:none;border-radius:8px 8px 0 0;background:transparent;color:#64748b;font-size:13px;font-weight:600;cursor:pointer;transition:all .15s;border-bottom:2px solid transparent}',
    '#ar-insp .fbi-tab.active{color:#fff;border-bottom-color:#3b82f6;background:#1f2937}',
    '#ar-insp .fbi-tab:hover:not(.active){color:#94a3b8;background:#1a2433}',
    '#ar-insp .fbi-body{overflow:auto;max-height:70vh;padding:4px 2px}',
    '#ar-insp .fbi-stats{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px}',
    '#ar-insp .fbi-stat{background:#1f2937;border:1px solid #374151;border-radius:10px;padding:12px 18px;min-width:130px}',
    '#ar-insp .fbi-stat-v{font-size:28px;font-weight:700;color:#fff;line-height:1}',
    '#ar-insp .fbi-stat-l{font-size:11px;color:#64748b;margin-top:5px}',
    '#ar-insp .fbi-warn-box{background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.2);border-radius:8px;padding:9px 13px;font-size:12px;color:#f59e0b;margin-bottom:10px}',
    '#ar-insp .fbi-info-box{background:#1f2937;border-radius:10px;padding:13px 16px;margin-bottom:14px;display:flex;align-items:center;gap:14px}',
    '#ar-insp .fbi-avatar{width:40px;height:40px;border-radius:50%;background:#374151;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0}',
    '#ar-insp .fbi-table-wrap{overflow-x:auto}',
    '#ar-insp .fbi-table{width:100%;border-collapse:collapse;font-size:13px}',
    '#ar-insp .fbi-table th{text-align:left;padding:9px 12px;background:#1f2937;color:#64748b;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.04em;position:sticky;top:0;z-index:1;white-space:nowrap}',
    '#ar-insp .fbi-table td{padding:10px 12px;border-bottom:1px solid #1f2937;color:#e2e8f0;vertical-align:middle}',
    '#ar-insp .fbi-table tr:hover td{background:rgba(59,130,246,.05)}',
    '#ar-insp .fbi-name{font-weight:500}',
    '#ar-insp .fbi-sub{font-size:11px;color:#64748b;margin-top:2px}',
    '#ar-insp .fbi-link{color:#3b82f6;text-decoration:none;font-size:11px;font-weight:600;padding:3px 8px;border:1px solid rgba(59,130,246,.3);border-radius:5px;transition:all .12s;white-space:nowrap}',
    '#ar-insp .fbi-link:hover{background:rgba(59,130,246,.12)}',
    '#ar-insp .fbi-links{display:flex;gap:5px;flex-wrap:wrap}',
    '#ar-insp .fbi-empty{color:#64748b;font-size:13px;padding:24px;text-align:center}',
    '#ar-insp .fbi-search{width:100%;background:#1f2937;border:1px solid #374151;border-radius:7px;padding:7px 11px;color:#e2e8f0;font-size:13px;margin-bottom:10px;outline:none}',
    '#ar-insp .fbi-search:focus{border-color:#3b82f6}',
    '#ar-insp #fbi-loader{position:absolute;inset:0;background:rgba(17,24,39,.85);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;z-index:10;border-radius:10px}',
    '#ar-insp .fbi-spinner{width:32px;height:32px;border:3px solid #374151;border-top-color:#3b82f6;border-radius:50%;animation:fbi-spin .8s linear infinite}',
    '@keyframes fbi-spin{to{transform:rotate(360deg)}}',
    '#ar-insp #fbi-loader p{color:#94a3b8;font-size:13px}'
  ].join(' ');
  document.head.appendChild(_st);


/* -- MODAL SHELL ------------------------------------------ */

  /* ---- Inspector shell inside container ---- */
  const localWrap = container;

  const tabsDiv = document.createElement('div');
  tabsDiv.className = 'fbi-tabs';
  [
    { t:'overview', label:'Overview'                      },
    { t:'adaccs',   label:'Ad Accounts', cnt:'fbi-n-aa'   },
    { t:'pages',    label:'Pages',       cnt:'fbi-n-pg'   },
    { t:'bm',       label:'Business Mgrs',cnt:'fbi-n-bm'  },
    { t:'pixels',   label:'🔵 Pixels',   cnt:'fbi-n-px'   }
  ].forEach(function(tab, i) {
    const btn = document.createElement('button');
    btn.className = 'fbi-tab' + (i === 0 ? ' active' : '');
    btn.dataset.t = tab.t;
    btn.textContent = tab.label;
    if (tab.cnt) {
      const sp = document.createElement('span');
      sp.id = tab.cnt;
      sp.style.cssText = 'font-size:11px;opacity:.6;margin-left:4px';
      btn.appendChild(sp);
    }
    tabsDiv.appendChild(btn);
  });
  localWrap.appendChild(tabsDiv);

  const bodyDiv = document.createElement('div');
  bodyDiv.className = 'fbi-body';
  bodyDiv.style.position = 'relative';

  const loaderDiv = document.createElement('div');
  loaderDiv.id = 'fbi-loader';
  loaderDiv.innerHTML = '<div class="fbi-spinner"></div><p id="fbi-loader-msg">Loading...</p>';
  bodyDiv.appendChild(loaderDiv);

  ['overview','adaccs','pages','bm','pixels'].forEach(function(t, i) {
    const d = document.createElement('div');
    d.id = 'fbi-tab-' + t;
    if (i > 0) d.style.display = 'none';
    bodyDiv.appendChild(d);
  });
  localWrap.appendChild(bodyDiv);

  function setTab(t) {
    localWrap.querySelectorAll('.fbi-tab').forEach(function(b) {
      b.classList.toggle('active', b.dataset.t === t);
    });
    bodyDiv.querySelectorAll('div[id^="fbi-tab"]').forEach(function(d) {
      d.style.display = (d.id === 'fbi-tab-' + t) ? '' : 'none';
    });
  }
  localWrap.querySelectorAll('.fbi-tab').forEach(function(b) {
    b.onclick = function() { setTab(b.dataset.t); };
  });

  function setLoaderMsg(msg) {
    const el = document.getElementById('fbi-loader-msg');
    if (el) el.textContent = msg;
  }
  function hideLoader() {
    const l = document.getElementById('fbi-loader');
    if (l) l.style.display = 'none';
  }
  function setCnt(id, n) {
    const el = document.getElementById(id);
    if (el) el.textContent = '(' + n + ')';
  }


/* -- CONTROLS --------------------------------------------- */
/* controls defined in shell above */

/* -- CURRENT ACCOUNT ID ----------------------------------- */
function getCurrentActId() {
  try {
    var n = require('BusinessUnifiedNavigationContext');
    var id = n && (n.adAccountID || (n.getState && n.getState().adAccountID));
    if (id) return String(id).replace('act_','');
  } catch(e) {}
  var m = window.location.href.match(/[?&]act=(\d+)/);
  if (m) return m[1];
  var m2 = window.location.href.match(/\/act_(\d+)/);
  if (m2) return m2[1];
  return null;
}

/* -- DATA -------------------------------------------------- */
(async function() {
  try {
    setLoaderMsg('Loading profile...');
    const me = await apiGet('me', { fields: 'id,name,email,picture.width(80).height(80)' });

    setLoaderMsg('Loading ad accounts...');
    const adAccounts = await fetchAll('me/adaccounts', {
      fields: 'id,name,account_status,balance,amount_spent,spend_cap,currency,timezone_name,disable_reason'
    });

    /* current account lookup */
    const curActId = getCurrentActId();
    let curAcc = null;
    if (curActId) {
      curAcc = adAccounts.find(function(a){ return a.id.replace('act_','') === curActId; }) || null;
      if (!curAcc) {
        try {
          curAcc = await apiGet('act_' + curActId, {
            fields: 'id,name,account_status,balance,amount_spent,spend_cap,currency,timezone_name,disable_reason'
          });
        } catch(e) { curAcc = null; }
      }
    }

    setLoaderMsg('Loading pages...');
    const pages = await fetchAll('me/accounts', {
      fields: 'id,name,fan_count,is_published,link,category,tasks,page_token,verification_status'
    });

    setLoaderMsg('Loading Business Managers...');
    const businesses = await fetchAll('me/businesses', {
      fields: 'id,name,verification_status,business_status,created_time,owned_ad_accounts.limit(1){id},client_ad_accounts.limit(1){id},owned_pages.limit(1){id}'
    });

    /* ---- PIXELS: collect from all BMs + ad accounts ---- */
    setLoaderMsg('Loading pixels (BM owned + client)...');
    const pixelMap = new Map(); /* pixel_id → enriched pixel object */
    const PX_FIELDS = 'id,name,owner_business,is_created_by_business,last_fired_time,match_rate_approx,is_unavailable,creation_time';

    /* BM owned + client pixels */
    const bmPixelJobs = businesses.flatMap(function(bm) {
      return [
        fetchAll(bm.id + '/owned_pixels', { fields: PX_FIELDS }).then(function(list) {
          list.forEach(function(px) {
            if (!pixelMap.has(px.id)) {
              px._source = 'owned'; px._bm_name = bm.name; px._bm_id = bm.id;
              pixelMap.set(px.id, px);
            }
          });
        }).catch(function() {}),
        fetchAll(bm.id + '/client_pixels', { fields: PX_FIELDS }).then(function(list) {
          list.forEach(function(px) {
            if (!pixelMap.has(px.id)) {
              px._source = 'client'; px._bm_name = bm.name; px._bm_id = bm.id;
              pixelMap.set(px.id, px);
            }
          });
        }).catch(function() {})
      ];
    });
    await Promise.all(bmPixelJobs);

    /* Non-BM pixels: scan all ad accounts */
    setLoaderMsg('Loading pixels (ad accounts without BM)...');
    const accPixelJobs = adAccounts.map(function(acc) {
      return fetchAll(acc.id + '/adspixels', { fields: PX_FIELDS }).then(function(list) {
        list.forEach(function(px) {
          if (!pixelMap.has(px.id)) {
            px._source = 'account'; px._acc_name = acc.name; px._acc_id = acc.id;
            pixelMap.set(px.id, px);
          }
        });
      }).catch(function() {});
    });
    await Promise.all(accPixelJobs);

    const pixels = Array.from(pixelMap.values())
      .sort(function(a, b) { return (a.name || '').localeCompare(b.name || ''); });

    hideLoader();
    setCnt('fbi-n-aa', adAccounts.length);
    setCnt('fbi-n-pg', pages.length);
    setCnt('fbi-n-bm', businesses.length);
    setCnt('fbi-n-px', pixels.length);

    /* ---- OVERVIEW ---------------------------------------- */
    const active      = adAccounts.filter(function(a){ return a.account_status === 1; });
    const disabled    = adAccounts.filter(function(a){ return a.account_status === 2 || a.account_status === 101; });
    const appeal      = adAccounts.filter(function(a){ return [3,7,8,9].indexOf(a.account_status) > -1; });
    const totalSpent  = adAccounts.reduce(function(s,a){ return s + parseFloat(a.amount_spent||0)/100; }, 0);
    const totalBal    = adAccounts.reduce(function(s,a){ return s + parseFloat(a.balance||0)/100; }, 0);
    const totalCap    = adAccounts.reduce(function(s,a){ return s + parseFloat(a.spend_cap||0)/100; }, 0);
    const capPct      = totalCap > 0 ? Math.round(totalSpent / totalCap * 100) : 0;

    const ovDiv  = document.getElementById('fbi-tab-overview');
    const picUrl = me.picture && me.picture.data && me.picture.data.url;

    /* current account card */
    var curHtml = '';
    if (curAcc) {
      var cCur     = curAcc.currency || 'USD';
      var cActId   = (curAcc.id || '').replace('act_','');
      var cSpentN  = parseFloat(curAcc.amount_spent || 0) / 100;
      var cCapN    = parseFloat(curAcc.spend_cap    || 0) / 100;
      var cDayCapN = 0; /* daily_spend_limit not available in API v23 */
      var cBalN    = parseFloat(curAcc.balance      || 0) / 100;
      var cTz      = tzOffset(curAcc.timezone_name);
      var cTzFull  = (curAcc.timezone_name || '').replace(/_/g,' ');
      var cPct     = cCapN > 0 ? Math.min(100, Math.round(cSpentN / cCapN * 100)) : 0;
      var cBarC    = cPct >= 90 ? '#ef4444' : cPct >= 70 ? '#f59e0b' : '#3b82f6';
      var cAdsUrl  = 'https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=' + cActId;
      var cBillUrl = 'https://business.facebook.com/billing_hub/accounts/details/?asset_id=' + cActId + '&payment_account_id=' + cActId + '&placement=ads_manager';
      var cQualUrl = 'https://www.facebook.com/accountquality?act=' + cActId;
      var cSpentFmt = cSpentN.toLocaleString('en-US',{style:'currency',currency:cCur,maximumFractionDigits:0});
      var cCapFmt   = cCapN   > 0 ? cCapN.toLocaleString('en-US',{style:'currency',currency:cCur,maximumFractionDigits:0}) : 'no limit';
      var cBalFmt   = cBalN.toLocaleString('en-US',{style:'currency',currency:cCur,maximumFractionDigits:2});
      var cDayFmt   = cDayCapN > 0 ? cDayCapN.toLocaleString('en-US',{style:'currency',currency:cCur,maximumFractionDigits:0}) : null;
      curHtml = '<div style="background:linear-gradient(135deg,#1e3a5f 0%,#1f2937 100%);border:1px solid #2563eb;border-radius:12px;padding:16px 20px;margin-bottom:18px">'
        + '<div style="font-size:11px;font-weight:700;color:#3b82f6;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">Current Account</div>'
        + '<div style="display:flex;align-items:flex-start;gap:20px;flex-wrap:wrap">'
        /* left: name + status + tz */
        + '<div style="flex:1;min-width:220px">'
        + '<div style="font-size:15px;font-weight:700;color:#fff;margin-bottom:4px">' + esc(curAcc.name || 'act_' + cActId) + '</div>'
        + '<div style="font-size:11px;color:#64748b;margin-bottom:8px">' + (curAcc.id || 'act_' + cActId) + ' &middot; ' + cCur + '</div>'
        + statusBadge(curAcc.account_status)
        + '<div style="margin-top:8px;font-size:13px;color:#e2e8f0"><span style="font-size:18px;font-weight:700">' + cTz + '</span> <span style="color:#64748b;font-size:11px">' + esc(cTzFull) + '</span></div>'
        + '</div>'
        /* middle: spend bars */
        + '<div style="flex:1;min-width:200px">'
        + '<div style="font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px">Account Limit</div>'
        + '<div style="margin-bottom:4px"><span style="font-size:16px;font-weight:700;color:#22c55e">' + cSpentFmt + '</span><span style="color:#64748b;font-size:12px"> / ' + cCapFmt + '</span></div>'
        + (cCapN > 0 ? '<div style="background:#374151;border-radius:4px;height:6px;margin-bottom:3px"><div style="height:6px;border-radius:4px;background:' + cBarC + ';width:' + cPct + '%"></div></div>'
          + '<div style="font-size:11px;color:' + cBarC + '">' + cPct + '% used</div>' : '')
        + (cDayFmt ? '<div style="margin-top:10px"><div style="font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.04em;margin-bottom:3px">Daily Limit</div>'
          + '<div style="font-size:14px;font-weight:700;color:#f59e0b">' + cDayFmt + '</div></div>' : '')
        + '</div>'
        /* right: balance + links */
        + '<div style="min-width:140px">'
        + '<div style="font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px">Balance</div>'
        + '<div style="font-size:18px;font-weight:700;color:#3b82f6;margin-bottom:12px">' + cBalFmt + '</div>'
        + '<div class="fbi-links">'
        + '<a class="fbi-link" href="' + cAdsUrl  + '" target="_blank">Ads</a>'
        + '<a class="fbi-link" href="' + cBillUrl + '" target="_blank">Billing</a>'
        + ([2,3,7,8,9,101].indexOf(curAcc.account_status) > -1 ? '<a class="fbi-link" href="' + cQualUrl + '" target="_blank" style="color:#f59e0b;border-color:rgba(245,158,11,.3)">Quality</a>' : '')
        + '</div>'
        + '</div>'
        + '</div>'
        + '</div>';
    } else if (curActId) {
      curHtml = '<div style="background:#1f2937;border:1px solid #374151;border-radius:10px;padding:12px 16px;margin-bottom:16px;font-size:12px;color:#64748b">Current account: act_' + curActId + ' (not in accessible accounts list)</div>';
    }

    let html = curHtml + '<div class="fbi-info-box">'
      + '<div class="fbi-avatar">' + (picUrl ? '<img src="' + picUrl + '" width="42" height="42" style="border-radius:50%">' : '') + '</div>'
      + '<div><div style="font-size:16px;font-weight:700;color:#fff">' + esc(me.name) + '</div>'
      + '<div style="font-size:12px;color:#64748b;margin-top:3px">ID: ' + me.id + (me.email ? ' - ' + esc(me.email) : '') + '</div></div></div>';

    if (disabled.length > 0) html += '<div class="fbi-warn-box">[!] ' + disabled.length + ' ad account(s) DISABLED</div>';
    if (appeal.length > 0)   html += '<div class="fbi-warn-box">[~] ' + appeal.length + ' account(s) pending review / appeal</div>';

    html += '<div class="fbi-stats">'
      + '<div class="fbi-stat"><div class="fbi-stat-v">' + adAccounts.length + '</div><div class="fbi-stat-l">Total Ad Accounts</div></div>'
      + '<div class="fbi-stat"><div class="fbi-stat-v" style="color:#22c55e">' + active.length   + '</div><div class="fbi-stat-l">Active</div></div>'
      + '<div class="fbi-stat"><div class="fbi-stat-v" style="color:#ef4444">' + disabled.length + '</div><div class="fbi-stat-l">Disabled</div></div>'
      + '<div class="fbi-stat"><div class="fbi-stat-v" style="color:#f59e0b">' + appeal.length   + '</div><div class="fbi-stat-l">In Appeal</div></div>'
      + '<div class="fbi-stat"><div class="fbi-stat-v">' + pages.length      + '</div><div class="fbi-stat-l">Pages</div></div>'
      + '<div class="fbi-stat"><div class="fbi-stat-v">' + businesses.length + '</div><div class="fbi-stat-l">Business Mgrs</div></div>'
      + '<div class="fbi-stat"><div class="fbi-stat-v" style="color:#3b82f6">$' + Math.round(totalSpent).toLocaleString() + '</div><div class="fbi-stat-l">Total Spend (all)</div></div>'
      + '<div class="fbi-stat"><div class="fbi-stat-v" style="color:#22c55e">$' + Math.round(totalBal).toLocaleString()   + '</div><div class="fbi-stat-l">Total Balance</div></div>'
      + (totalCap > 0 ? '<div class="fbi-stat"><div class="fbi-stat-v" style="color:' + (capPct >= 90 ? '#ef4444' : capPct >= 70 ? '#f59e0b' : '#e2e8f0') + '">' + capPct + '%</div><div class="fbi-stat-l">Cap used (avg)</div></div>' : '')
      + '</div>'
      + (totalCap > 0 ? '<div style="background:#1f2937;border-radius:8px;padding:10px 16px;margin-bottom:16px">'
        + '<div style="display:flex;justify-content:space-between;font-size:12px;color:#64748b;margin-bottom:6px"><span>Total spend vs cap</span><span>$' + Math.round(totalSpent).toLocaleString() + ' / $' + Math.round(totalCap).toLocaleString() + '</span></div>'
        + '<div style="background:#374151;border-radius:4px;height:6px"><div style="height:6px;border-radius:4px;background:' + (capPct >= 90 ? '#ef4444' : capPct >= 70 ? '#f59e0b' : '#3b82f6') + ';width:' + capPct + '%"></div></div>'
        + '</div>' : '');

    if (disabled.length > 0) {
      html += '<div style="margin-top:4px"><div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px">Disabled Accounts</div>';
      disabled.forEach(function(a) {
        const actId = a.id.replace('act_','');
        html += '<div style="display:flex;align-items:center;gap:10px;padding:7px 10px;background:#1f2937;border-radius:7px;margin-bottom:5px;font-size:12px">'
          + '<span style="color:#ef4444">[X]</span>'
          + '<span style="flex:1;font-weight:500">' + esc(a.name) + '</span>'
          + '<span style="color:#64748b;font-size:11px">' + a.id + '</span>'
          + '<a class="fbi-link" href="https://www.facebook.com/accountquality?act=' + actId + '" target="_blank" style="color:#f59e0b;border-color:rgba(245,158,11,.3)">Appeal</a>'
          + '</div>';
      });
      html += '</div>';
    }
    ovDiv.innerHTML = html;

    /* ---- AD ACCOUNTS ------------------------------------- */
    const aaDiv = document.getElementById('fbi-tab-adaccs');

    function renderAA(list) {
      if (!list.length) return '<div class="fbi-empty">No ad accounts found</div>';
      let rows = '';
      list.forEach(function(a) {
        const cur     = a.currency || 'USD';
        const actId   = a.id.replace('act_','');
        const adsUrl  = 'https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=' + actId;
        const billUrl = 'https://business.facebook.com/billing_hub/accounts/details/?asset_id=' + actId + '&payment_account_id=' + actId + '&placement=ads_manager';
        const qualUrl = 'https://www.facebook.com/accountquality?act=' + actId;
        const needQ   = [2,3,7,8,9,101].indexOf(a.account_status) > -1;
        const tz      = tzOffset(a.timezone_name);
        const tzFull  = (a.timezone_name || '').replace(/_/g,' ');
        const balN    = parseFloat(a.balance || 0) / 100;
        const balFmt  = balN > 0
          ? '<span style="color:#3b82f6;font-weight:600">' + balN.toLocaleString('en-US',{style:'currency',currency:cur,maximumFractionDigits:0}) + '</span>'
          : '<span style="color:#64748b">-</span>';
        const disReason   = a.disable_reason ? '<div style="font-size:10px;color:#ef4444;margin-top:2px">' + esc(a.disable_reason) + '</div>' : '';
        const spentN      = parseFloat(a.amount_spent || 0) / 100;
        const capN        = parseFloat(a.spend_cap || 0) / 100;
        const spendCell   = miniBar(spentN, capN, cur, 'Account Limit');
        rows += '<tr>'
          + '<td><div class="fbi-name">' + esc(a.name) + '</div><div class="fbi-sub">' + a.id + ' &middot; ' + cur + '</div>' + disReason + '</td>'
          + '<td>' + statusBadge(a.account_status) + '</td>'
          + '<td>' + spendCell + '</td>'
          + '<td>' + balFmt + '</td>'
          + '<td><span style="font-size:15px;font-weight:700;color:#e2e8f0" title="' + esc(tzFull) + '">' + tz + '</span><div style="font-size:10px;color:#64748b;margin-top:2px">' + esc(tzFull) + '</div></td>'
          + '<td><div class="fbi-links">'
          + '<a class="fbi-link" href="' + adsUrl  + '" target="_blank">Ads</a>'
          + '<a class="fbi-link" href="' + billUrl + '" target="_blank">Billing</a>'
          + (needQ ? '<a class="fbi-link" href="' + qualUrl + '" target="_blank" style="color:#f59e0b;border-color:rgba(245,158,11,.3)">Quality</a>' : '')
          + '</div></td>'
          + '</tr>';
      });
      return '<div class="fbi-table-wrap"><table class="fbi-table">'
        + '<thead><tr><th>Account</th><th>Status</th><th>Spent / Limit</th><th>Balance</th><th>UTC</th><th>Links</th></tr></thead>'
        + '<tbody>' + rows + '</tbody></table></div>';
    }

    const aaSearch = document.createElement('input');
    aaSearch.className = 'fbi-search';
    aaSearch.placeholder = 'Search by name or ID...';
    const aaTable = document.createElement('div');
    aaTable.innerHTML = renderAA(adAccounts);
    aaSearch.oninput = function() {
      const q = this.value.toLowerCase();
      aaTable.innerHTML = renderAA(q ? adAccounts.filter(function(a) {
        return a.name.toLowerCase().indexOf(q) > -1 || a.id.indexOf(q) > -1;
      }) : adAccounts);
    };
    aaDiv.appendChild(aaSearch);
    aaDiv.appendChild(aaTable);

    /* ---- PAGES ------------------------------------------- */
    const pgDiv = document.getElementById('fbi-tab-pages');

    function renderPages(list) {
      if (!list.length) return '<div class="fbi-empty">No pages found</div>';
      let rows = '';
      list.forEach(function(p) {
        const pageUrl  = p.link || 'https://www.facebook.com/' + p.id;
        const adsUrl   = 'https://adsmanager.facebook.com/?page_id=' + p.id;
        const role     = (p.tasks || []).join(', ') || '-';
        const pubBadge = p.is_published
          ? '<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;background:rgba(34,197,94,.12);color:#22c55e">PUBLISHED</span>'
          : '<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;background:rgba(239,68,68,.12);color:#ef4444">UNPUBLISHED</span>';
        const verRaw  = (p.verification_status || '').toUpperCase();
        const verBadgePg = verRaw === 'BLUE_VERIFIED' || verRaw === 'VERIFIED'
          ? '<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;background:rgba(59,130,246,.12);color:#3b82f6;margin-top:4px">VERIFIED</span>'
          : verRaw && verRaw !== 'NOT_VERIFIED'
            ? '<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;background:rgba(148,163,184,.1);color:#94a3b8;margin-top:4px">' + verRaw + '</span>'
            : '';
        rows += '<tr>'
          + '<td><div class="fbi-name">' + esc(p.name) + '</div><div class="fbi-sub">ID: ' + p.id + '</div></td>'
          + '<td>' + pubBadge + (verBadgePg ? '<br>' + verBadgePg : '') + '</td>'
          + '<td style="font-size:12px">' + (p.fan_count||0).toLocaleString() + '</td>'
          + '<td style="color:#64748b;font-size:11px">' + esc(p.category||'-') + '</td>'
          + '<td style="color:#64748b;font-size:11px">' + esc(role) + '</td>'
          + '<td><div class="fbi-links">'
          + '<a class="fbi-link" href="' + pageUrl + '" target="_blank">Page</a>'
          + '<a class="fbi-link" href="' + adsUrl  + '" target="_blank">Ads</a>'
          + '<a class="fbi-link" href="https://www.facebook.com/' + p.id + '/settings" target="_blank">Settings</a>'
          + '</div></td>'
          + '</tr>';
      });
      return '<div class="fbi-table-wrap"><table class="fbi-table">'
        + '<thead><tr><th>Page</th><th>Status</th><th>Likes</th><th>Category</th><th>Role</th><th>Links</th></tr></thead>'
        + '<tbody>' + rows + '</tbody></table></div>';
    }

    const pgSearch = document.createElement('input');
    pgSearch.className = 'fbi-search';
    pgSearch.placeholder = 'Search pages...';
    const pgTable = document.createElement('div');
    pgTable.innerHTML = renderPages(pages);
    pgSearch.oninput = function() {
      const q = this.value.toLowerCase();
      pgTable.innerHTML = renderPages(q ? pages.filter(function(p) {
        return p.name.toLowerCase().indexOf(q) > -1 || p.id.indexOf(q) > -1;
      }) : pages);
    };
    pgDiv.appendChild(pgSearch);
    pgDiv.appendChild(pgTable);

    /* ---- BUSINESS MANAGERS ------------------------------- */
    const bmDiv = document.getElementById('fbi-tab-bm');
    if (!businesses.length) {
      bmDiv.innerHTML = '<div class="fbi-empty">No Business Managers found</div>';
    } else {
      let rows = '';
      businesses.forEach(function(b) {
        const bmUrl  = 'https://business.facebook.com/home/accounts?business_id=' + b.id;
        const adsUrl = 'https://business.facebook.com/adsmanager/manage/campaigns?business_id=' + b.id;
        const setUrl = 'https://business.facebook.com/settings/ad-accounts?business_id=' + b.id;
        const created   = b.created_time ? new Date(b.created_time).toLocaleDateString('en-US') : '-';
        const bsRaw     = (b.business_status || '').toUpperCase();
        const bsOk      = !bsRaw || bsRaw === 'ACTIVE';
        const bsBadge   = '<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;background:' + (bsOk ? 'rgba(34,197,94,.12)' : 'rgba(239,68,68,.12)') + ';color:' + (bsOk ? '#22c55e' : '#ef4444') + '">' + (bsRaw || 'ACTIVE') + '</span>';
        const ownedAcc  = b.owned_ad_accounts  && b.owned_ad_accounts.data  ? b.owned_ad_accounts.data.length  : '?';
        const clientAcc = b.client_ad_accounts && b.client_ad_accounts.data ? b.client_ad_accounts.data.length : '?';
        const ownedPg   = b.owned_pages && b.owned_pages.data ? b.owned_pages.data.length : '?';
        rows += '<tr>'
          + '<td><div class="fbi-name">' + esc(b.name) + '</div><div class="fbi-sub">ID: ' + b.id + '</div></td>'
          + '<td>' + bsBadge + '</td>'
          + '<td>' + verBadge(b.verification_status) + '</td>'
          + '<td style="font-size:12px;line-height:1.8">'
          + 'Own accs: <strong>' + ownedAcc + '</strong><br>'
          + 'Client accs: <strong>' + clientAcc + '</strong><br>'
          + 'Pages: <strong>' + ownedPg + '</strong>'
          + '</td>'
          + '<td style="color:#64748b;font-size:12px">' + created + '</td>'
          + '<td><div class="fbi-links">'
          + '<a class="fbi-link" href="' + bmUrl  + '" target="_blank">BM</a>'
          + '<a class="fbi-link" href="' + adsUrl + '" target="_blank">Ads</a>'
          + '<a class="fbi-link" href="' + setUrl + '" target="_blank">Settings</a>'
          + '</div></td>'
          + '</tr>';
      });
      bmDiv.innerHTML = '<div class="fbi-table-wrap"><table class="fbi-table">'
        + '<thead><tr><th>Business Manager</th><th>BM Status</th><th>Verification</th><th>Assets</th><th>Created</th><th>Links</th></tr></thead>'
        + '<tbody>' + rows + '</tbody></table></div>';
    }

    /* ---- PIXELS ------------------------------------------ */
    const pxDiv = document.getElementById('fbi-tab-pixels');

    function pixelTypeBadge(src) {
      if (src === 'owned')   return '<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;background:rgba(34,197,94,.12);color:#22c55e">Owned</span>';
      if (src === 'client')  return '<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;background:rgba(59,130,246,.12);color:#3b82f6">Client</span>';
      return '<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;background:rgba(245,158,11,.12);color:#f59e0b">No BM</span>';
    }

    function renderPixels(list) {
      if (!list.length) return '<div class="fbi-empty">No pixels found</div>';
      let rows = '';
      list.forEach(function(px) {
        const lastFired = px.last_fired_time
          ? new Date(px.last_fired_time).toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' })
          : '<span style="color:#64748b">never</span>';
        const created = px.creation_time
          ? new Date(px.creation_time).toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' })
          : '-';
        const _mr = px.match_rate_approx;
        const matchRate = (_mr !== undefined && _mr !== null && _mr >= 0)
          ? '<span style="color:' + (_mr >= 70 ? '#22c55e' : _mr >= 40 ? '#f59e0b' : '#ef4444') + ';font-weight:700">' + _mr + '%</span>'
          : '<span style="color:#64748b">n/a</span>';
        const statusBadgePx = px.is_unavailable
          ? '<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;background:rgba(239,68,68,.12);color:#ef4444">Unavailable</span>'
          : '<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;background:rgba(34,197,94,.12);color:#22c55e">Active</span>';
        let ownerHtml = '';
        if (px._source === 'owned' || px._source === 'client') {
          ownerHtml = '<div class="fbi-name" style="font-size:12px">' + esc(px._bm_name) + '</div>'
            + '<div class="fbi-sub">BM: ' + px._bm_id + '</div>';
        } else {
          ownerHtml = '<div class="fbi-name" style="font-size:12px">' + esc(px._acc_name || '-') + '</div>'
            + '<div class="fbi-sub">' + (px._acc_id || '') + '</div>';
        }
        const evMgrUrl = 'https://business.facebook.com/events_manager2/list/pixel/' + px.id;
        rows += '<tr>'
          + '<td><div class="fbi-name">' + esc(px.name || 'Untitled') + '</div><div class="fbi-sub">' + px.id + '</div></td>'
          + '<td>' + pixelTypeBadge(px._source) + '</td>'
          + '<td>' + ownerHtml + '</td>'
          + '<td>' + statusBadgePx + '</td>'
          + '<td style="font-size:12px">' + lastFired + '</td>'
          + '<td style="font-size:12px">' + matchRate + '</td>'
          + '<td style="color:#64748b;font-size:11px">' + created + '</td>'
          + '<td><div class="fbi-links"><a class="fbi-link" href="' + evMgrUrl + '" target="_blank">Events Mgr</a></div></td>'
          + '</tr>';
      });
      return '<div class="fbi-table-wrap"><table class="fbi-table">'
        + '<thead><tr><th>Pixel</th><th>Type</th><th>Owner (BM / Account)</th><th>Status</th><th>Last Fired</th><th>Match %</th><th>Created</th><th>Links</th></tr></thead>'
        + '<tbody>' + rows + '</tbody></table></div>';
    }

    const pxSearch = document.createElement('input');
    pxSearch.className = 'fbi-search';
    pxSearch.placeholder = 'Search pixels by name or ID...';
    const pxTable = document.createElement('div');
    pxTable.innerHTML = renderPixels(pixels);
    pxSearch.oninput = function() {
      const q = this.value.toLowerCase();
      pxTable.innerHTML = renderPixels(q ? pixels.filter(function(px) {
        return (px.name || '').toLowerCase().indexOf(q) > -1 || px.id.indexOf(q) > -1
          || (px._bm_name || '').toLowerCase().indexOf(q) > -1
          || (px._acc_name || '').toLowerCase().indexOf(q) > -1;
      }) : pixels);
    };
    pxDiv.appendChild(pxSearch);
    pxDiv.appendChild(pxTable);

  } catch (err) {
    hideLoader();
    const ovDiv = document.getElementById('fbi-tab-overview');
    ovDiv.innerHTML = '<div class="fbi-warn-box">Error loading data: ' + esc(err.message) + '</div>'
      + '<div style="font-size:12px;color:#64748b;margin-top:8px">Make sure you opened Ads Manager inside Business Manager and the token is valid.</div>';
  }
})();


}

/* -------------------- BOOT -------------------- */
if (!TOKEN) {
  alert('Access token (__accessToken) not found.\nOpen Ads Manager inside Business Manager and run again.');
} else {
  const ui = makeModal();
  mountGenerator(ui.gen);
  mountManager(ui.mgr);
  mountColumnManager(ui.col);
  mountAnalytics(ui.anl);
  mountInspector(ui.insp);
}

})();