/* ============================================================================
   FB Switchboard v0.2.0 — Bookmarklet
   Кампании / Адсеты / Объявления в одной панели: статус + тумблер Pause/Start.
   Работает ТОЛЬКО на adsmanager/business.facebook.com. Graph API v23.0.
   FB-клиент (токен-лесенка, credentials:include, мультиисточник кабов, ретраи)
   портирован из MetaWatch/MetaLaunch — проверенный паттерн для этой среды.
   Regen: node regen-switchboard.mjs
   ========================================================================== */
(async function () {
  'use strict';

  const VERSION = 'v0.2.0';
  const HOST_GRAPH = 'https://graph.facebook.com/v23.0';
  const MAX_RETRIES = 4;
  const BACKOFF_BASE_MS = 4000;
  const ROW_CAP = 5000; // потолок строк на уровень, чтобы не улететь на гигантском кабе

  // Повторный клик по закладке — закрыть панель
  const existing = document.getElementById('fbsb-root');
  if (existing) { existing.remove(); return; }

  let TOKEN = null; // выставляется через getToken() на старте

  /* -------------------- state -------------------- */
  const LEVELS = {
    campaign: { label: 'Кампании',  edge: 'campaigns' },
    adset:    { label: 'Адсеты',    edge: 'adsets'    },
    ad:       { label: 'Объявления', edge: 'ads'      },
  };
  const state = {
    act: null,               // 'act_123...'
    accounts: [],            // [{id:'act_..', name}]
    level: 'campaign',
    filter: 'ACTIVE_PAUSED', // ACTIVE | ACTIVE_PAUSED | ALL
    search: '',
    cache: { campaign: null, adset: null, ad: null }, // fetched arrays per level
    loading: false,
  };

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  /* -------------------- token ladder (из MetaWatch) -------------------- */
  async function getToken() {
    try { if (typeof __accessToken !== 'undefined' && __accessToken) return __accessToken; } catch {}
    try { if (window.__accessToken) return window.__accessToken; } catch {}
    try {
      for (const s of document.querySelectorAll('script')) {
        const m = (s.textContent || '').match(/"access_token":"(EAA[A-Za-z0-9_-]+)"/);
        if (m) return m[1];
      }
    } catch {}
    try {
      const m = (document.documentElement.outerHTML || '').match(/"access_token":"(EAA[A-Za-z0-9_-]+)"/);
      if (m) return m[1];
    } catch {}
    for (const u of ['https://adsmanager.facebook.com/adsmanager/', 'https://business.facebook.com/business/loginpage/']) {
      try {
        const txt = await (await fetch(u, { credentials: 'include' })).text();
        const m = txt.match(/"access_token":"(EAA[A-Za-z0-9_-]+)"/);
        if (m) return m[1];
      } catch {}
    }
    return '';
  }

  /* -------------------- api (из MetaWatch) -------------------- */
  function fbErrorMsg(err, httpStatus) {
    if (!err) return `API error (${httpStatus || '?'})`;
    const codePart = err.code != null ? `[${err.code}${err.error_subcode ? '/' + err.error_subcode : ''}] ` : '';
    return `${codePart}${err.error_user_msg || err.message || 'Unknown error'}`;
  }

  async function apiFetch(path, opts = {}) {
    const method = opts.method || 'GET';
    const isFull = /^https?:\/\//i.test(path);
    const url = isFull ? new URL(path) : new URL(`${HOST_GRAPH}/${path.replace(/^\/+/, '')}`);
    if (!isFull) {
      Object.entries(opts.params || {}).forEach(([k, v]) => { if (v != null && v !== '') url.searchParams.set(k, v); });
      url.searchParams.set('access_token', TOKEN);
    }
    const fo = {
      method, credentials: 'include', mode: 'cors',
      referrer: 'https://business.facebook.com/', referrerPolicy: 'origin-when-cross-origin',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    };
    if (opts.body) {
      const b = new URLSearchParams();
      Object.entries(opts.body).forEach(([k, v]) => { if (v != null) b.append(k, v); });
      b.append('access_token', TOKEN);
      fo.body = b;
    }
    let lastErr;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await fetch(url.toString(), fo);
        const json = await res.json().catch(() => ({}));
        if (res.ok && !json?.error) return json;
        const fbErr = json?.error;
        if ([4, 17, 32, 80004].includes(fbErr?.code) && attempt < MAX_RETRIES) {
          await sleep(BACKOFF_BASE_MS * Math.pow(2, attempt - 1));
          continue;
        }
        const err = new Error(fbErrorMsg(fbErr, res.status));
        err.fbError = fbErr || null;
        throw err;
      } catch (e) {
        lastErr = e;
        if (e.fbError || attempt >= MAX_RETRIES) break;
        await sleep(1000 * attempt);
      }
    }
    throw lastErr || new Error('API call failed');
  }

  async function apiAll(path, params = {}) {
    const rows = [];
    let next = path, np = params;
    while (next && rows.length < ROW_CAP) {
      const p = await apiFetch(next, { params: np });
      rows.push(...(p?.data || []));
      next = p?.paging?.next || '';
      np = {};
    }
    return rows;
  }

  /* -------------------- data -------------------- */
  function detectAct() {
    const q = new URLSearchParams(location.search).get('act');
    if (q) return 'act_' + q.replace(/^act_/, '');
    const m = location.href.match(/act[=/_](\d{5,})/);
    return m ? 'act_' + m[1] : null;
  }

  // Мультиисточник (как MetaWatch): personal + businesses→owned/client. Всё best-effort.
  async function loadAccounts() {
    const fields = 'id,name';
    const seen = new Set();
    const push = a => { if (a && a.id && !seen.has(a.id)) { seen.add(a.id); state.accounts.push({ id: a.id, name: a.name || a.id }); } };
    // текущий каб из URL — держим первым, даже если ниже не придёт
    if (state.act) push({ id: state.act, name: state.act + ' (текущий)' });
    try { (await apiAll('/me/adaccounts', { fields, limit: 200 })).forEach(push); } catch {}
    let businesses = [];
    try { businesses = await apiAll('/me/businesses', { fields: 'id,name', limit: 100 }); } catch {}
    for (const b of businesses) {
      try { (await apiAll(`/${b.id}/owned_ad_accounts`, { fields, limit: 200 })).forEach(push); } catch {}
      try { (await apiAll(`/${b.id}/client_ad_accounts`, { fields, limit: 200 })).forEach(push); } catch {}
    }
    if (!state.act) state.act = state.accounts[0] && state.accounts[0].id || null;
  }

  async function loadLevel(level, force) {
    if (!state.act) return;
    if (state.cache[level] && !force) return;
    const { edge } = LEVELS[level];
    const fields = 'name,status,effective_status' +
      (level === 'campaign' ? ',daily_budget,lifetime_budget,objective'
        : level === 'adset' ? ',daily_budget,lifetime_budget,campaign_id'
          : ',adset_id');
    state.cache[level] = await apiAll('/' + state.act + '/' + edge, { fields, limit: 500 });
  }

  // одиночный ре-фетч сущности после тумблера — показать реальный effective_status
  async function refreshEntity(id) {
    const j = await apiFetch('/' + id, { params: { fields: 'status,effective_status' } });
    const arr = state.cache[state.level] || [];
    const e = arr.find(x => x.id === id);
    if (e) { e.status = j.status; e.effective_status = j.effective_status; }
  }

  /* -------------------- filtering -------------------- */
  function visibleRows() {
    let rows = state.cache[state.level] || [];
    if (state.filter === 'ACTIVE') {
      rows = rows.filter(r => r.effective_status === 'ACTIVE');
    } else if (state.filter === 'ACTIVE_PAUSED') {
      rows = rows.filter(r => r.status === 'ACTIVE' || r.status === 'PAUSED');
    } // ALL — как есть
    const q = state.search.trim().toLowerCase();
    if (q) rows = rows.filter(r => (r.name || '').toLowerCase().includes(q));
    return rows;
  }

  /* -------------------- ui helpers -------------------- */
  const esc = s => ('' + s).replace(/[&<>"']/g, m =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

  function dotColor(eff) {
    if (eff === 'ACTIVE') return '#22c55e';
    if (eff === 'PAUSED' || eff === 'CAMPAIGN_PAUSED' || eff === 'ADSET_PAUSED') return '#94a3b8';
    if (eff === 'WITH_ISSUES' || eff === 'DISAPPROVED') return '#ef4444';
    if (eff === 'PENDING_REVIEW' || eff === 'IN_PROCESS' || eff === 'PENDING_BILLING_INFO') return '#f59e0b';
    return '#64748b';
  }
  function money(v) { return v ? '$' + (Number(v) / 100).toFixed(0) : ''; }

  function toast(msg, ok) {
    const t = document.getElementById('fbsb-toast');
    if (!t) return;
    t.textContent = msg;
    t.style.background = ok ? '#134e2b' : '#5b1717';
    t.style.borderColor = ok ? '#22c55e' : '#ef4444';
    t.style.opacity = '1';
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.style.opacity = '0'; }, 3200);
  }

  // Персистентная ошибка прямо в теле панели (не исчезает как тост)
  function showError(msg) {
    const body = document.getElementById('fbsb-body');
    if (body) body.innerHTML =
      `<div class="fbsb-err">⚠️ ${esc(msg)}</div>`;
  }

  /* -------------------- render -------------------- */
  function render() {
    const body = document.getElementById('fbsb-body');
    if (!body) return;
    if (state.loading) { body.innerHTML = '<div class="fbsb-msg">Загружаю…</div>'; return; }
    const rows = visibleRows();
    const total = (state.cache[state.level] || []).length;
    if (!rows.length) {
      body.innerHTML = `<div class="fbsb-msg">Пусто${total ? ' (по фильтру из ' + total + ')' : ''}.</div>`;
      return;
    }
    body.innerHTML = rows.map(r => {
      const isActive = r.status === 'ACTIVE';
      const sub = [];
      if (r.effective_status && r.effective_status !== r.status) sub.push(r.effective_status.toLowerCase());
      const budget = money(r.daily_budget) || money(r.lifetime_budget);
      if (budget) sub.push(budget + (r.daily_budget ? '/day' : ''));
      return `
        <div class="fbsb-row" data-id="${r.id}">
          <span class="fbsb-dot" style="background:${dotColor(r.effective_status)}"></span>
          <div class="fbsb-name">
            <div class="fbsb-nm">${esc(r.name || r.id)}</div>
            ${sub.length ? `<div class="fbsb-sub">${esc(sub.join(' · '))}</div>` : ''}
          </div>
          <button class="fbsb-btn ${isActive ? 'pause' : 'start'}" data-id="${r.id}">
            ${isActive ? '⏸ Пауза' : '▶ Старт'}
          </button>
        </div>`;
    }).join('');

    body.querySelectorAll('.fbsb-btn').forEach(btn => {
      btn.onclick = async () => {
        const id = btn.dataset.id;
        const arr = state.cache[state.level] || [];
        const e = arr.find(x => x.id === id);
        if (!e) return;
        const next = e.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
        btn.disabled = true; btn.textContent = '…';
        try {
          await apiFetch('/' + id, { method: 'POST', body: { status: next } });
          await refreshEntity(id);
          toast((next === 'PAUSED' ? 'Пауза' : 'Старт') + ': ' + (e.name || id), true);
        } catch (err) {
          toast('Ошибка: ' + err.message, false);
        } finally {
          render();
        }
      };
    });
  }

  async function switchLevel(level) {
    state.level = level;
    document.querySelectorAll('.fbsb-tab').forEach(t =>
      t.classList.toggle('on', t.dataset.level === level));
    if (!state.cache[level]) {
      state.loading = true; render();
      try { await loadLevel(level); }
      catch (e) { showError(LEVELS[level].label + ' не загрузились:\n' + e.message); state.loading = false; return; }
      state.loading = false;
    }
    render();
  }

  async function reloadCurrent() {
    state.loading = true; render();
    try { await loadLevel(state.level, true); }
    catch (e) { showError(LEVELS[state.level].label + ' не загрузились:\n' + e.message); state.loading = false; return; }
    state.loading = false; render();
  }

  async function switchAccount(act) {
    state.act = act;
    state.cache = { campaign: null, adset: null, ad: null };
    await switchLevel(state.level);
  }

  function fillAccountSelect() {
    const acct = document.getElementById('fbsb-acct');
    if (!acct) return;
    if (!state.accounts.length) {
      acct.innerHTML = state.act ? `<option value="${esc(state.act)}" selected>${esc(state.act)}</option>` : '';
      return;
    }
    acct.innerHTML = state.accounts.map(a =>
      `<option value="${esc(a.id)}"${a.id === state.act ? ' selected' : ''}>${esc(a.name)} · ${esc(a.id)}</option>`).join('');
  }

  /* -------------------- mount -------------------- */
  function mount() {
    const root = document.createElement('div');
    root.id = 'fbsb-root';
    root.innerHTML = `
      <style>
        #fbsb-root{position:fixed;top:0;right:0;width:420px;height:100vh;z-index:2147483647;
          font:13px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;color:#e2e8f0;
          background:#0f172a;border-left:1px solid #1e3a4c;box-shadow:-8px 0 24px rgba(0,0,0,.4);
          display:flex;flex-direction:column}
        #fbsb-root *{box-sizing:border-box}
        .fbsb-hd{padding:12px 14px;background:#0b2530;border-bottom:1px solid #1e3a4c;
          display:flex;align-items:center;gap:8px}
        .fbsb-title{font-weight:700;color:#5eead4;letter-spacing:.5px;font-size:13px}
        .fbsb-ver{color:#475569;font-size:10px;font-weight:600}
        .fbsb-x{margin-left:auto;cursor:pointer;color:#94a3b8;font-size:18px;line-height:1;
          background:none;border:none;padding:2px 6px}
        .fbsb-x:hover{color:#fca5a5}
        .fbsb-tools{padding:8px 12px;border-bottom:1px solid #1e293b;display:flex;
          flex-direction:column;gap:8px;background:#0e1a2b}
        .fbsb-sel{width:100%;background:#0b1220;color:#e2e8f0;border:1px solid #334155;
          border-radius:6px;padding:6px 8px;font-size:12px}
        .fbsb-search{width:100%;background:#0b1220;color:#e2e8f0;border:1px solid #334155;
          border-radius:6px;padding:6px 8px;font-size:12px}
        .fbsb-frow{display:flex;gap:6px;align-items:center}
        .fbsb-fbtn{flex:1;background:#0b1220;color:#94a3b8;border:1px solid #334155;
          border-radius:6px;padding:5px 4px;font-size:11px;cursor:pointer}
        .fbsb-fbtn.on{background:#134e4a;color:#5eead4;border-color:#0d9488}
        .fbsb-refresh{background:#0b1220;color:#94a3b8;border:1px solid #334155;border-radius:6px;
          padding:5px 9px;cursor:pointer;font-size:13px}
        .fbsb-refresh:hover{color:#5eead4;border-color:#0d9488}
        .fbsb-tabs{display:flex;border-bottom:1px solid #1e293b;background:#0e1a2b}
        .fbsb-tab{flex:1;text-align:center;padding:9px 4px;cursor:pointer;color:#64748b;
          font-size:12px;font-weight:600;border-bottom:2px solid transparent}
        .fbsb-tab.on{color:#5eead4;border-bottom-color:#14b8a6;background:#0f2733}
        #fbsb-body{flex:1;overflow-y:auto;padding:4px 0}
        .fbsb-row{display:flex;align-items:center;gap:9px;padding:8px 12px;
          border-bottom:1px solid #16202f}
        .fbsb-row:hover{background:#0f2030}
        .fbsb-dot{width:9px;height:9px;border-radius:50%;flex:0 0 auto}
        .fbsb-name{flex:1;min-width:0}
        .fbsb-nm{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .fbsb-sub{color:#64748b;font-size:10.5px;margin-top:1px}
        .fbsb-btn{flex:0 0 auto;border:1px solid;border-radius:6px;padding:5px 9px;
          font-size:11px;cursor:pointer;font-weight:600;min-width:66px}
        .fbsb-btn.pause{background:#3a1414;color:#fca5a5;border-color:#7f1d1d}
        .fbsb-btn.pause:hover{background:#5b1717}
        .fbsb-btn.start{background:#0f2e1c;color:#86efac;border-color:#166534}
        .fbsb-btn.start:hover{background:#134e2b}
        .fbsb-btn:disabled{opacity:.5;cursor:default}
        .fbsb-msg{padding:24px 14px;text-align:center;color:#64748b}
        .fbsb-err{padding:16px 14px;color:#fca5a5;white-space:pre-wrap;font-size:12px;line-height:1.5}
        #fbsb-toast{position:absolute;left:12px;right:12px;bottom:12px;padding:9px 12px;
          border:1px solid;border-radius:8px;font-size:12px;opacity:0;transition:opacity .2s;
          pointer-events:none;text-align:center}
      </style>
      <div class="fbsb-hd">
        <span class="fbsb-title">FB SWITCHBOARD</span>
        <span class="fbsb-ver">${VERSION}</span>
        <button class="fbsb-x" id="fbsb-close">✕</button>
      </div>
      <div class="fbsb-tools">
        <select class="fbsb-sel" id="fbsb-acct"></select>
        <input class="fbsb-search" id="fbsb-q" placeholder="Фильтр по названию…">
        <div class="fbsb-frow">
          <button class="fbsb-fbtn" data-filter="ACTIVE">Активные</button>
          <button class="fbsb-fbtn on" data-filter="ACTIVE_PAUSED">Актив+Пауза</button>
          <button class="fbsb-fbtn" data-filter="ALL">Все</button>
          <button class="fbsb-refresh" id="fbsb-reload" title="Обновить">⟳</button>
        </div>
      </div>
      <div class="fbsb-tabs">
        ${Object.entries(LEVELS).map(([k, v]) =>
          `<div class="fbsb-tab${k === state.level ? ' on' : ''}" data-level="${k}">${v.label}</div>`).join('')}
      </div>
      <div id="fbsb-body"><div class="fbsb-msg">Загружаю…</div></div>
      <div id="fbsb-toast"></div>`;
    document.body.appendChild(root);

    document.getElementById('fbsb-close').onclick = () => root.remove();
    document.getElementById('fbsb-reload').onclick = () => reloadCurrent();
    document.getElementById('fbsb-q').oninput = e => { state.search = e.target.value; render(); };
    root.querySelectorAll('.fbsb-fbtn').forEach(b => {
      b.onclick = () => {
        state.filter = b.dataset.filter;
        root.querySelectorAll('.fbsb-fbtn').forEach(x => x.classList.toggle('on', x === b));
        render();
      };
    });
    root.querySelectorAll('.fbsb-tab').forEach(t => {
      t.onclick = () => switchLevel(t.dataset.level);
    });
    document.getElementById('fbsb-acct').onchange = e => switchAccount(e.target.value);
  }

  /* -------------------- boot -------------------- */
  mount();
  state.loading = true; render();

  TOKEN = await getToken();
  if (!TOKEN) {
    state.loading = false;
    showError('Не нашла access_token на странице.\nОткрой adsmanager.facebook.com (с логином) и запусти закладку там.');
    return;
  }

  // 1. Каб из URL — сразу пригоден, кампании грузим не дожидаясь списка кабинетов
  state.act = detectAct();
  if (state.act) {
    fillAccountSelect();
    try { await loadLevel('campaign'); state.loading = false; render(); }
    catch (e) { state.loading = false; showError('Кампании не загрузились:\n' + e.message); }
  } else {
    state.loading = false;
    showError('Не нашла ad account в URL.\nОткрой в Ads Manager список кампаний/адсетов (в адресе должен быть act=…) и запусти закладку заново.');
  }

  // 2. Дропдаун всех кабинетов — best-effort, панель не фейлит
  try { await loadAccounts(); fillAccountSelect(); }
  catch (e) { toast('Список кабинетов не подтянулся: ' + e.message, false); }
})();
