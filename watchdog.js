/* ===========================================================================
 * MetaWatch PRO v0.1.0 — Bookmarklet
 *
 * In-browser watchdog for FB Ads Manager — redundancy layer that works even when
 * server-side infra (ARIA / SCAN watchdog) is down. Runs from an open AM tab on
 * the session token (same discovery ladder as MetaLaunch PRO).
 *
 * Scope v1 (approved 2026-07-13):
 *   - FB-only metrics (no tracker data): spend / imps / clicks / CTR / CPC / CPM /
 *     freq + pixel actions (regs / purchases / leads / installs) with cost-per.
 *   - Scenario engine ported from fb-ops watchdog DSL (AND conditions, fail-safe:
 *     incomputable metric → condition NOT met → no fire).
 *   - Per-scenario OBSERVE (log+alert only) / ARMED (actually pauses) toggle.
 *     Actions: pause | notify. NO auto-unpause ever (discipline rule).
 *   - Worker-based tick timer (survives background-tab throttling better than
 *     page timers; falls back to setInterval if CSP blocks blob workers).
 *   - State (accounts, scenarios, journal, fired-dedup) in localStorage — panel
 *     survives page reload: re-click the bookmark and it resumes.
 *   - Optional Telegram alerts straight from the browser (api.telegram.org has
 *     CORS *) — use a dedicated alert bot token, NOT the ARIA bot.
 * ===========================================================================
 */
(async () => {
  'use strict';

  // ─── KILL OLD INSTANCE ──────────────────────────────────────────────────
  const PANEL_ID = '__metawatch_panel__';
  document.getElementById(PANEL_ID)?.remove();
  try { window.__mwWorker?.terminate(); } catch {}
  try { clearInterval(window.__mwFallbackTimer); } catch {}

  // ─── CONFIG ─────────────────────────────────────────────────────────────
  const VERSION = '0.1.0';
  const GRAPH_VER = 'v23.0';
  const HOST_GRAPH = `https://graph.facebook.com/${GRAPH_VER}`;
  const MAX_RETRIES = 4;
  const BACKOFF_BASE_MS = 5000;
  const LS_KEY = 'metawatch_v1';
  const LS_LOCK = 'metawatch_lock';
  const JOURNAL_CAP = 500;
  const HEARTBEAT_MS = 20000;          // worker wake period; tick fires when interval elapsed
  const FIRED_TTL_MS = 48 * 3600e3;    // prune dedup entries older than 2 days
  const INSTANCE_ID = Math.random().toString(36).slice(2, 10);

  // ─── METRICS (FB-only DSL) ──────────────────────────────────────────────
  // Fail-safe как в серверном DSL: метрику нельзя вычислить → условие НЕ met.
  const METRICS = {
    spend:     { label: 'спенд $',        },
    impressions:{ label: 'показы',        },
    clicks:    { label: 'клики (link)',   },
    ctr:       { label: 'CTR(link) %',    },
    cpc:       { label: 'CPC $',          },
    cpm:       { label: 'CPM $',          },
    freq:      { label: 'частота',        },
    regs:      { label: 'реги (FB)',      },
    cpr:       { label: 'цена реги $',    },
    purchases: { label: 'покупки (FB)',   },
    cpp:       { label: 'цена покупки $', },
    leads:     { label: 'лиды (FB)',      },
    cpl:       { label: 'цена лида $',    },
    installs:  { label: 'инсталы (FB)',   },
  };
  const OPS = { gt: '>', gte: '≥', lt: '<', lte: '≤', eq: '=' };

  // Приоритетные action_type для каждой FB-конверсии (первый найденный — не суммируем,
  // omni_* уже включает pixel+app: сумма даст двойной счёт).
  const ACTION_KEYS = {
    regs:      ['omni_complete_registration', 'complete_registration', 'offsite_conversion.fb_pixel_complete_registration'],
    purchases: ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase'],
    leads:     ['lead', 'offsite_conversion.fb_pixel_lead'],
    installs:  ['omni_app_install', 'mobile_app_install', 'app_install'],
  };

  // ─── PRESETS ────────────────────────────────────────────────────────────
  // Всё вставляется в observe (armed=false). Пороги — стартовые, правь под кабы.
  const PRESETS = [
    { name: 'Без кликов', when: [c('spend','gt',12), c('clicks','lt',1)], action: 'pause', filt: nf('not_contains','CTRL'), note: 'спенд идёт, кликов ноль' },
    { name: 'Дорогой CPC', when: [c('spend','gt',15), c('cpc','gt',3)], action: 'notify', filt: nf('off',''), note: 'клик дороже потолка' },
    { name: 'CTR умер', when: [c('impressions','gt',3000), c('ctr','lt',0.5)], action: 'notify', filt: nf('off',''), note: 'крео не цепляет' },
    { name: 'Частота выжгла', when: [c('freq','gt',2.5), c('spend','gt',30)], action: 'notify', filt: nf('off',''), note: 'аудитория заезжена' },
    { name: 'K1-lite: спенд без рег', when: [c('spend','gt',120), c('regs','lt',1)], action: 'pause', filt: nf('not_contains','CTRL'), note: 'FB-реги по пикселю/CAPI' },
    { name: 'K4-lite: цена тира без покупки', when: [c('spend','gt',250), c('purchases','lt',1)], action: 'pause', filt: nf('not_contains','CTRL'), note: 'FB purchase = деп по CAPI' },
    { name: 'CPM шторм', when: [c('cpm','gt',120), c('spend','gt',20)], action: 'notify', filt: nf('off',''), note: 'аукцион аномальный' },
    { name: 'Спенд-предохранитель', when: [c('spend','gt',400)], action: 'notify', filt: nf('off',''), note: 'кампания сожгла больше лимита — глянь' },
  ];
  function c(metric, op, value) { return { metric, op, value }; }
  function nf(mode, text) { return { mode, text }; }

  // ─── STATE ──────────────────────────────────────────────────────────────
  let TOKEN = '';
  const ACCOUNTS = [];               // {id: 'act_..', account_id, name, currency, status}
  let accountsLoading = false;
  let panel, worker = null;
  let ticking = false;
  const baseTitle = document.title.replace(/^[🟢🔴] MW · /u, '');

  const state = {
    sel: [],                         // выбранные act_ id
    scenarios: [],                   // {id,name,enabled,armed,when[],action,scope,filt{mode,text},cooldownMin}
    settings: { intervalMin: 15, tgToken: '', tgChat: '', sound: true },
    journal: [],                     // новые в начало
    firedMap: {},                    // 'scId:entityId' → ts (dedup/cooldown)
    running: false,
    lastTickTs: 0,
    ui: { tab: 'cabs', editing: null, draft: null, accFilter: '', status: { type: 'idle', msg: 'готова' }, lastErr: '' },
  };

  function save() {
    try {
      const { ui, stats, ...persist } = state; // stats объёмные и пересчитываются тиком — не персистим
      localStorage.setItem(LS_KEY, JSON.stringify({ v: 1, ...persist }));
    } catch {}
  }
  function load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (s?.v !== 1) return;
      Object.assign(state, {
        sel: s.sel || [], scenarios: s.scenarios || [],
        settings: { ...state.settings, ...(s.settings || {}) },
        journal: s.journal || [], firedMap: s.firedMap || {},
        running: !!s.running, lastTickTs: s.lastTickTs || 0,
      });
      const now = Date.now();
      for (const k of Object.keys(state.firedMap)) if (now - state.firedMap[k] > FIRED_TTL_MS) delete state.firedMap[k];
    } catch {}
  }

  // ─── UTILS ──────────────────────────────────────────────────────────────
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const hhmm = (ts) => ts ? new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '—';
  const fmt = (n, d = 2) => (n == null || !isFinite(n)) ? '—' : (Math.abs(n) >= 100 ? String(Math.round(n)) : Number(n).toFixed(Math.abs(n) < 10 ? d : 1));
  const scId = () => 'sc' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  function setStatus(type, msg) {
    state.ui.status = { type, msg };
    const led = panel?.querySelector('#mw-led');
    const txt = panel?.querySelector('#mw-status');
    if (led) led.dataset.t = type;
    if (txt) txt.textContent = msg;
  }

  function beep() {
    if (!state.settings.sound) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = 880; g.gain.value = 0.06;
      o.start(); o.stop(ctx.currentTime + 0.18);
      setTimeout(() => ctx.close().catch(() => {}), 500);
    } catch {}
  }

  function updateTitle() {
    if (!state.running) { document.title = baseTitle; return; }
    const overdue = state.lastTickTs && (Date.now() - state.lastTickTs > state.settings.intervalMin * 60e3 * 2.5);
    document.title = `${overdue ? '🔴' : '🟢'} MW · ${baseTitle}`;
  }

  // ─── FB API CLIENT (тот же паттерн что MetaLaunch) ──────────────────────
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
    while (next) {
      const p = await apiFetch(next, { params: np });
      rows.push(...(p?.data || []));
      next = p?.paging?.next || '';
      np = {};
    }
    return rows;
  }

  // ─── TOKEN DISCOVERY (ladder из MetaLaunch) ─────────────────────────────
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

  // ─── ACCOUNTS ───────────────────────────────────────────────────────────
  async function loadAccounts() {
    if (accountsLoading) return;
    accountsLoading = true;
    setStatus('busy', 'гружу кабинеты…');
    const fields = 'id,account_id,name,account_status,currency';
    const seen = new Set();
    const push = (a, bm) => {
      if (seen.has(a.id)) return;
      seen.add(a.id);
      ACCOUNTS.push({ id: a.id, account_id: a.account_id, name: a.name || a.id, currency: a.currency || '', status: a.account_status, bm });
    };
    try {
      (await apiAll('/me/adaccounts', { fields, limit: 200 })).forEach((a) => push(a, 'Personal'));
    } catch (e) { state.ui.lastErr = `/me/adaccounts: ${e.message}`; }
    let businesses = [];
    try { businesses = await apiAll('/me/businesses', { fields: 'id,name', limit: 200 }); } catch {}
    for (const b of businesses) {
      try { (await apiAll(`/${b.id}/owned_ad_accounts`, { fields, limit: 200 })).forEach((a) => push(a, b.name)); } catch {}
      try { (await apiAll(`/${b.id}/client_ad_accounts`, { fields, limit: 200 })).forEach((a) => push(a, b.name)); } catch {}
    }
    ACCOUNTS.sort((a, b) => (a.bm + a.name).localeCompare(b.bm + b.name));
    accountsLoading = false;
    setStatus(ACCOUNTS.length ? 'ok' : 'err', ACCOUNTS.length ? `кабинетов: ${ACCOUNTS.length}` : 'кабинеты не загрузились');
    render();
  }

  // ─── DATA FETCH (per tick) ──────────────────────────────────────────────
  function pickAction(actions, keys) {
    if (!Array.isArray(actions)) return 0;
    for (const k of keys) {
      const hit = actions.find((a) => a.action_type === k);
      if (hit) return Number(hit.value) || 0;
    }
    return 0;
  }

  function buildRow(ins, status, name, id) {
    const spend = Number(ins?.spend) || 0;
    const imps = Number(ins?.impressions) || 0;
    const clicks = Number(ins?.inline_link_clicks) || 0;
    return {
      id, name, status,
      spend, imps, clicks,
      freq: Number(ins?.frequency) || 0,
      regs: pickAction(ins?.actions, ACTION_KEYS.regs),
      purchases: pickAction(ins?.actions, ACTION_KEYS.purchases),
      leads: pickAction(ins?.actions, ACTION_KEYS.leads),
      installs: pickAction(ins?.actions, ACTION_KEYS.installs),
    };
  }

  // rows: campaign level всегда; ad level — только если есть enabled ad-scope сценарий.
  async function fetchAccount(accId, needAds) {
    const insFields = 'campaign_id,campaign_name,spend,impressions,inline_link_clicks,frequency,actions';
    const [camps, ins] = await Promise.all([
      apiAll(`/${accId}/campaigns`, { fields: 'id,name,effective_status', limit: 500 }),
      apiAll(`/${accId}/insights`, { level: 'campaign', date_preset: 'today', fields: insFields, limit: 500 }),
    ]);
    const insById = new Map(ins.map((r) => [r.campaign_id, r]));
    const campaigns = camps
      .filter((cp) => ['ACTIVE', 'PAUSED'].includes(cp.effective_status))
      .map((cp) => buildRow(insById.get(cp.id), cp.effective_status, cp.name, cp.id));

    let ads = [];
    if (needAds) {
      const adFields = 'ad_id,ad_name,campaign_id,campaign_name,spend,impressions,inline_link_clicks,frequency,actions';
      const [adList, adIns] = await Promise.all([
        apiAll(`/${accId}/ads`, { fields: 'id,name,effective_status,campaign{id,name}', limit: 500 }),
        apiAll(`/${accId}/insights`, { level: 'ad', date_preset: 'today', fields: adFields, limit: 500 }),
      ]);
      const adInsById = new Map(adIns.map((r) => [r.ad_id, r]));
      ads = adList
        .filter((a) => a.effective_status === 'ACTIVE')
        .map((a) => {
          const row = buildRow(adInsById.get(a.id), a.effective_status, a.name, a.id);
          row.campaignName = a.campaign?.name || '';
          return row;
        });
    }
    return { campaigns, ads };
  }

  // ─── SCENARIO ENGINE (порт fb-ops watchdog DSL, FB-only) ────────────────
  function metricValue(row, m) {
    switch (m) {
      case 'spend': return row.spend;
      case 'impressions': return row.imps;
      case 'clicks': return row.clicks;
      case 'freq': return row.freq || null;
      case 'ctr': return row.imps > 0 ? (row.clicks / row.imps) * 100 : null;
      case 'cpc': return row.clicks > 0 ? row.spend / row.clicks : null;
      case 'cpm': return row.imps > 0 ? (row.spend / row.imps) * 1000 : null;
      case 'regs': return row.regs;
      case 'cpr': return row.regs > 0 ? row.spend / row.regs : null;
      case 'purchases': return row.purchases;
      case 'cpp': return row.purchases > 0 ? row.spend / row.purchases : null;
      case 'leads': return row.leads;
      case 'cpl': return row.leads > 0 ? row.spend / row.leads : null;
      case 'installs': return row.installs;
      default: return null;
    }
  }
  function satisfies(v, op, t) {
    switch (op) {
      case 'gt': return v > t; case 'gte': return v >= t;
      case 'lt': return v < t; case 'lte': return v <= t;
      case 'eq': return v === t; default: return false;
    }
  }
  function nameMatches(sc, row) {
    const f = sc.filt || { mode: 'off' };
    if (f.mode === 'off' || !f.text) return true;
    const hay = (sc.scope === 'ad' ? (row.campaignName || row.name) : row.name).toUpperCase();
    const has = hay.includes(f.text.toUpperCase());
    return f.mode === 'contains' ? has : !has;
  }
  function evaluateScenario(sc, row) {
    if (!Array.isArray(sc.when) || !sc.when.length) return null;
    if (sc.action === 'pause' && row.status !== 'ACTIVE') return null;
    if (!nameMatches(sc, row)) return null;
    const parts = [];
    for (const cond of sc.when) {
      const v = metricValue(row, cond.metric);
      if (v === null || !satisfies(v, cond.op, Number(cond.value))) return null;
      parts.push(`${METRICS[cond.metric]?.label || cond.metric} ${OPS[cond.op]} ${cond.value} (${fmt(v)})`);
    }
    return parts.join(' и ');
  }
  function describeScenario(sc) {
    const conds = (sc.when || []).map((x) => `${METRICS[x.metric]?.label || x.metric} ${OPS[x.op]} ${x.value}`).join(' И ');
    const act = sc.action === 'pause' ? 'ПАУЗА' : 'уведомить';
    const scope = sc.scope === 'ad' ? 'ад' : 'кампания';
    const f = sc.filt || {};
    const filt = f.mode === 'off' || !f.text ? '' : ` · имя ${f.mode === 'contains' ? 'содержит' : 'БЕЗ'} "${f.text}"`;
    return `${conds} → ${act} [${scope}]${filt}`;
  }

  // ─── JOURNAL + TG ───────────────────────────────────────────────────────
  function journal(entry) {
    state.journal.unshift({ ts: Date.now(), ...entry });
    if (state.journal.length > JOURNAL_CAP) state.journal.length = JOURNAL_CAP;
  }

  async function sendTg(text) {
    const { tgToken, tgChat } = state.settings;
    if (!tgToken || !tgChat) return false;
    try {
      const res = await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: tgChat, text, disable_web_page_preview: true }),
      });
      return (await res.json())?.ok === true;
    } catch { return false; }
  }

  // ─── TICK ENGINE ────────────────────────────────────────────────────────
  function refreshLock() {
    try { localStorage.setItem(LS_LOCK, JSON.stringify({ id: INSTANCE_ID, ts: Date.now() })); } catch {}
  }
  function foreignLockFresh() {
    try {
      const l = JSON.parse(localStorage.getItem(LS_LOCK) || 'null');
      return l && l.id !== INSTANCE_ID && Date.now() - l.ts < 90e3;
    } catch { return false; }
  }

  async function runTick(manual) {
    if (ticking) return;
    if (!TOKEN) { setStatus('err', 'нет токена — тик пропущен'); return; }
    if (!state.sel.length) { setStatus('err', 'кабы не выбраны'); return; }
    ticking = true;
    refreshLock();
    setStatus('busy', `тик… (${manual ? 'ручной' : 'таймер'})`);
    const enabled = state.scenarios.filter((s) => s.enabled && s.when?.length);
    const needAds = enabled.some((s) => s.scope === 'ad');
    const tgLines = [];
    let fired = 0, paused = 0, errs = 0;

    for (const accId of state.sel) {
      const acc = ACCOUNTS.find((a) => a.id === accId) || { id: accId, name: accId };
      let data;
      try {
        data = await fetchAccount(accId, needAds);
      } catch (e) {
        errs++;
        journal({ kind: 'error', acc: acc.name, msg: `стата не загрузилась: ${e.message}` });
        continue;
      }
      state.stats = state.stats || {};
      state.stats[accId] = { ts: Date.now(), rows: data.campaigns };

      for (const sc of enabled) {
        const rows = sc.scope === 'ad' ? data.ads : data.campaigns;
        for (const row of rows) {
          const reason = evaluateScenario(sc, row);
          if (!reason) continue;
          const key = `${sc.id}:${row.id}`;
          const cool = (sc.cooldownMin ?? 240) * 60e3;
          if (state.firedMap[key] && Date.now() - state.firedMap[key] < cool) continue;
          state.firedMap[key] = Date.now();
          fired++;

          const wantPause = sc.action === 'pause';
          const doPause = wantPause && sc.armed;
          let ok = true, err = '';
          if (doPause) {
            try {
              await apiFetch(`/${row.id}`, { method: 'POST', body: { status: 'PAUSED' } });
              row.status = 'PAUSED';
              paused++;
            } catch (e) { ok = false; err = e.message; errs++; }
          }
          const mode = doPause ? 'armed' : 'observe';
          journal({
            kind: 'fire', acc: acc.name, scName: sc.name, mode,
            action: sc.action, scope: sc.scope || 'campaign',
            entity: row.name, entityId: row.id, reason, ok, err,
          });
          const tag = doPause ? (ok ? '⛔ PAUSED' : `⚠ pause FAIL: ${err}`) : (wantPause ? '👁 observe (не armed)' : '🔔 notify');
          tgLines.push(`${tag}\n${acc.name} · ${sc.name}\n${row.name}\n${reason}`);
        }
      }
    }

    state.lastTickTs = Date.now();
    if (tgLines.length) {
      beep();
      const sent = await sendTg(`🐕 MetaWatch тик ${hhmm(Date.now())}\n\n${tgLines.slice(0, 20).join('\n\n')}${tgLines.length > 20 ? `\n\n…и ещё ${tgLines.length - 20}` : ''}`);
      if (state.settings.tgToken && !sent) journal({ kind: 'error', acc: '', msg: 'TG alert не отправился (токен/чат?)' });
    }
    save();
    ticking = false;
    setStatus(errs ? 'warn' : 'ok', `тик ${hhmm(state.lastTickTs)}: сработок ${fired}, пауз ${paused}${errs ? `, ошибок ${errs}` : ''}`);
    updateTitle();
    render();
  }

  function startTimer() {
    stopTimer();
    const code = `setInterval(() => postMessage(1), ${HEARTBEAT_MS});`;
    try {
      worker = new Worker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
      worker.onmessage = onHeartbeat;
      window.__mwWorker = worker;
    } catch {
      // CSP заблокировал blob worker → page timer (в фоне троттлится до ~1/мин — для тиков ≥5 мин ок)
      window.__mwFallbackTimer = setInterval(onHeartbeat, HEARTBEAT_MS);
    }
  }
  function stopTimer() {
    try { worker?.terminate(); } catch {}
    worker = null;
    try { clearInterval(window.__mwFallbackTimer); } catch {}
  }
  function onHeartbeat() {
    if (!state.running) return;
    refreshLock();
    updateTitle();
    const due = !state.lastTickTs || Date.now() - state.lastTickTs >= state.settings.intervalMin * 60e3;
    if (due && !ticking) runTick(false);
    const hb = panel?.querySelector('#mw-next');
    if (hb) hb.textContent = nextTickLabel();
  }
  function nextTickLabel() {
    if (!state.running) return 'стоп';
    if (!state.lastTickTs) return 'сейчас…';
    const next = state.lastTickTs + state.settings.intervalMin * 60e3;
    const mins = Math.max(0, Math.round((next - Date.now()) / 60e3));
    return `тик ${hhmm(state.lastTickTs)} · след ~${mins} мин`;
  }

  function setRunning(on) {
    if (on && foreignLockFresh()) {
      journal({ kind: 'error', acc: '', msg: 'похоже, вотчдог уже крутится в другой вкладке — риск двойных действий!' });
    }
    state.running = on;
    if (on) { startTimer(); refreshLock(); runTick(false); }
    else { stopTimer(); setStatus('idle', 'остановлена'); }
    save();
    updateTitle();
    render();
  }

  // ─── UI ─────────────────────────────────────────────────────────────────
  const CSS = `
  #${PANEL_ID}{position:fixed;top:0;right:0;bottom:0;width:600px;max-width:96vw;z-index:2147483646;
    background:#04141a;color:#cbd5e1;font:12px/1.45 -apple-system,"Segoe UI",Arial,sans-serif;
    border-left:1px solid #0e3a4a;box-shadow:-12px 0 40px rgba(0,0,0,.55);display:flex;flex-direction:column}
  #${PANEL_ID} *{box-sizing:border-box}
  #${PANEL_ID} .mw-head{display:flex;align-items:center;gap:10px;padding:10px 14px;background:#020c10;
    border-bottom:1px solid #0e3a4a;flex-shrink:0}
  #${PANEL_ID} .mw-title{font:700 13px/1 ui-monospace,Menlo,monospace;color:#e2f4fb;letter-spacing:.06em}
  #${PANEL_ID} .mw-led{width:9px;height:9px;border-radius:50%;background:#475569;flex-shrink:0}
  #${PANEL_ID} .mw-led[data-t=ok]{background:#22c55e;box-shadow:0 0 8px #22c55e}
  #${PANEL_ID} .mw-led[data-t=busy]{background:#38bdf8;box-shadow:0 0 8px #38bdf8;animation:mwpulse 1s infinite}
  #${PANEL_ID} .mw-led[data-t=warn]{background:#f59e0b;box-shadow:0 0 8px #f59e0b}
  #${PANEL_ID} .mw-led[data-t=err]{background:#ef4444;box-shadow:0 0 8px #ef4444}
  @keyframes mwpulse{50%{opacity:.4}}
  #${PANEL_ID} .mw-x{margin-left:auto;cursor:pointer;color:#64748b;font-size:18px;background:none;border:none;padding:2px 6px}
  #${PANEL_ID} .mw-x:hover{color:#e2e8f0}
  #${PANEL_ID} .mw-bar{display:flex;align-items:center;gap:8px;padding:8px 14px;background:#031920;
    border-bottom:1px solid #0e3a4a;flex-shrink:0;flex-wrap:wrap}
  #${PANEL_ID} .mw-run{padding:7px 18px;border-radius:6px;border:none;cursor:pointer;font-weight:800;font-size:12px;
    letter-spacing:.05em;color:#04141a;background:linear-gradient(135deg,#38bdf8,#2563eb);color:#fff}
  #${PANEL_ID} .mw-run.on{background:linear-gradient(135deg,#ef4444,#b91c1c)}
  #${PANEL_ID} .mw-next{font:11px ui-monospace,Menlo,monospace;color:#7dd3fc}
  #${PANEL_ID} .mw-status{font-size:11px;color:#94a3b8;flex-basis:100%;min-height:14px}
  #${PANEL_ID} select,#${PANEL_ID} input[type=text],#${PANEL_ID} input[type=number]{
    background:#06222d;border:1px solid #0e3a4a;border-radius:5px;color:#e2e8f0;padding:5px 7px;font-size:12px;outline:none}
  #${PANEL_ID} select:focus,#${PANEL_ID} input:focus{border-color:#38bdf8;box-shadow:0 0 0 2px rgba(56,189,248,.18)}
  #${PANEL_ID} .mw-tabs{display:flex;gap:2px;padding:0 14px;background:#031920;border-bottom:1px solid #0e3a4a;flex-shrink:0}
  #${PANEL_ID} .mw-tab{padding:8px 14px;cursor:pointer;color:#94a3b8;border:none;background:none;font-size:12px;
    font-weight:700;border-bottom:2px solid transparent}
  #${PANEL_ID} .mw-tab.act{color:#7dd3fc;border-bottom-color:#38bdf8}
  #${PANEL_ID} .mw-body{flex:1;overflow-y:auto;padding:12px 14px}
  #${PANEL_ID} .mw-body::-webkit-scrollbar{width:8px}
  #${PANEL_ID} .mw-body::-webkit-scrollbar-thumb{background:#0e3a4a;border-radius:4px}
  #${PANEL_ID} .mw-card{background:#082530;border:1px solid #0e3a4a;border-left:2px solid #164e63;
    border-radius:7px;padding:10px 12px;margin-bottom:9px}
  #${PANEL_ID} .mw-card.armed{border-left-color:#ef4444}
  #${PANEL_ID} .mw-card.dis{opacity:.5}
  #${PANEL_ID} .mw-btn{padding:5px 11px;border-radius:5px;border:1px solid #155e75;background:transparent;
    color:#7dd3fc;cursor:pointer;font-size:11px;font-weight:600}
  #${PANEL_ID} .mw-btn:hover{background:rgba(56,189,248,.1)}
  #${PANEL_ID} .mw-btn.danger{border-color:#7f1d1d;color:#fca5a5}
  #${PANEL_ID} .mw-btn.danger:hover{background:rgba(239,68,68,.1)}
  #${PANEL_ID} .mw-toggle{display:inline-flex;align-items:center;gap:5px;cursor:pointer;user-select:none;font-size:11px}
  #${PANEL_ID} .mw-toggle .tr{width:28px;height:15px;border-radius:8px;background:#1e3a45;position:relative;transition:.15s}
  #${PANEL_ID} .mw-toggle .tr::after{content:'';position:absolute;top:2px;left:2px;width:11px;height:11px;border-radius:50%;
    background:#64748b;transition:.15s}
  #${PANEL_ID} .mw-toggle.on .tr{background:#0e7490}
  #${PANEL_ID} .mw-toggle.on .tr::after{left:15px;background:#7dd3fc}
  #${PANEL_ID} .mw-toggle.red.on .tr{background:#b91c1c}
  #${PANEL_ID} .mw-toggle.red.on .tr::after{background:#fecaca}
  #${PANEL_ID} table{width:100%;border-collapse:collapse;font-size:11px}
  #${PANEL_ID} th{color:#64748b;text-align:right;padding:4px 6px;border-bottom:1px solid #0e3a4a;font-weight:600;white-space:nowrap}
  #${PANEL_ID} td{padding:4px 6px;border-bottom:1px solid rgba(14,58,74,.4);text-align:right;
    font-family:ui-monospace,Menlo,monospace;font-variant-numeric:tabular-nums;white-space:nowrap}
  #${PANEL_ID} th:first-child,#${PANEL_ID} td:first-child{text-align:left;font-family:inherit;white-space:normal}
  #${PANEL_ID} .mw-dot{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:5px}
  #${PANEL_ID} .mw-dot.a{background:#22c55e}
  #${PANEL_ID} .mw-dot.p{background:#64748b}
  #${PANEL_ID} .mw-muted{color:#64748b}
  #${PANEL_ID} .mw-badge{display:inline-block;padding:1px 7px;border-radius:9px;font-size:10px;font-weight:700}
  #${PANEL_ID} .mw-badge.obs{background:rgba(100,116,139,.25);color:#cbd5e1}
  #${PANEL_ID} .mw-badge.arm{background:rgba(239,68,68,.22);color:#fca5a5}
  #${PANEL_ID} .mw-badge.ntf{background:rgba(56,189,248,.18);color:#7dd3fc}
  #${PANEL_ID} .mw-badge.err{background:rgba(245,158,11,.2);color:#fcd34d}
  #${PANEL_ID} .mw-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  #${PANEL_ID} .mw-cond{display:flex;align-items:center;gap:6px;margin:4px 0}
  #${PANEL_ID} label.mw-lbl{display:block;color:#7dd3fc;font-size:10px;font-weight:700;letter-spacing:.05em;
    text-transform:uppercase;margin:10px 0 4px}
  #${PANEL_ID} .mw-acc{display:flex;align-items:center;gap:8px;padding:5px 8px;border-radius:5px;cursor:pointer}
  #${PANEL_ID} .mw-acc:hover{background:rgba(56,189,248,.06)}
  #${PANEL_ID} .mw-acc input{accent-color:#0ea5e9}
  #${PANEL_ID} .mw-jr{padding:7px 0;border-bottom:1px solid rgba(14,58,74,.4);font-size:11px}
  #${PANEL_ID} .mw-jr .t{font-family:ui-monospace,Menlo,monospace;color:#7dd3fc;margin-right:8px}
  `;

  function tglHtml(on, red, act, id) {
    return `<span class="mw-toggle ${on ? 'on' : ''} ${red ? 'red' : ''}" data-act="${act}" data-id="${id}">
      <span class="tr"></span></span>`;
  }

  function renderCabs() {
    const f = state.ui.accFilter.toLowerCase();
    const list = ACCOUNTS.filter((a) => !f || (a.name + a.account_id + a.bm).toLowerCase().includes(f));
    const rows = list.map((a) => `
      <label class="mw-acc">
        <input type="checkbox" data-act="selacc" data-id="${a.id}" ${state.sel.includes(a.id) ? 'checked' : ''}>
        <span>${esc(a.name)} <span class="mw-muted">· ${esc(a.currency)} · ${esc(a.bm)} · ${esc(a.account_id)}</span></span>
      </label>`).join('');
    return `
      <div class="mw-row" style="margin-bottom:10px">
        <input type="text" placeholder="фильтр по имени / id / BM" data-act="accfilter" value="${esc(state.ui.accFilter)}" style="flex:1">
        <button class="mw-btn" data-act="reload-acc">↻ обновить</button>
      </div>
      <div class="mw-muted" style="margin-bottom:8px">выбрано: <b style="color:#7dd3fc">${state.sel.length}</b> из ${ACCOUNTS.length}${accountsLoading ? ' · грузятся…' : ''}</div>
      ${rows || `<div class="mw-muted">${accountsLoading ? 'кабинеты грузятся…' : 'пусто — нажми ↻ обновить'}</div>`}`;
  }

  function condEditor(cond, i) {
    const mOpts = Object.entries(METRICS).map(([k, m]) => `<option value="${k}" ${cond.metric === k ? 'selected' : ''}>${m.label}</option>`).join('');
    const oOpts = Object.entries(OPS).map(([k, s]) => `<option value="${k}" ${cond.op === k ? 'selected' : ''}>${s}</option>`).join('');
    return `<div class="mw-cond">
      <select data-act="d-metric" data-i="${i}" style="flex:1">${mOpts}</select>
      <select data-act="d-op" data-i="${i}">${oOpts}</select>
      <input type="number" step="any" data-act="d-val" data-i="${i}" value="${esc(cond.value)}" style="width:80px">
      <button class="mw-btn danger" data-act="d-delcond" data-i="${i}">×</button>
    </div>`;
  }

  function renderEditor() {
    const d = state.ui.draft;
    return `<div class="mw-card" style="border-left-color:#38bdf8">
      <label class="mw-lbl">Название сценария</label>
      <input type="text" data-act="d-name" value="${esc(d.name)}" style="width:100%">
      <label class="mw-lbl">Условия (все должны выполниться — AND)</label>
      ${d.when.map(condEditor).join('')}
      <button class="mw-btn" data-act="d-addcond" style="margin-top:4px">+ условие</button>
      <div class="mw-row" style="margin-top:10px">
        <div>
          <label class="mw-lbl" style="margin-top:0">Действие</label>
          <select data-act="d-action">
            <option value="notify" ${d.action === 'notify' ? 'selected' : ''}>уведомить</option>
            <option value="pause" ${d.action === 'pause' ? 'selected' : ''}>пауза</option>
          </select>
        </div>
        <div>
          <label class="mw-lbl" style="margin-top:0">Уровень</label>
          <select data-act="d-scope">
            <option value="campaign" ${d.scope !== 'ad' ? 'selected' : ''}>кампания</option>
            <option value="ad" ${d.scope === 'ad' ? 'selected' : ''}>ад</option>
          </select>
        </div>
        <div>
          <label class="mw-lbl" style="margin-top:0">Кулдаун, мин</label>
          <input type="number" data-act="d-cool" value="${esc(d.cooldownMin ?? 240)}" style="width:70px">
        </div>
      </div>
      <label class="mw-lbl">Фильтр по имени ${d.scope === 'ad' ? 'кампании ада' : 'кампании'}</label>
      <div class="mw-row">
        <select data-act="d-fmode">
          <option value="off" ${d.filt.mode === 'off' ? 'selected' : ''}>все</option>
          <option value="contains" ${d.filt.mode === 'contains' ? 'selected' : ''}>имя содержит</option>
          <option value="not_contains" ${d.filt.mode === 'not_contains' ? 'selected' : ''}>имя НЕ содержит</option>
        </select>
        <input type="text" data-act="d-ftext" value="${esc(d.filt.text)}" placeholder="напр. CTRL" style="flex:1">
      </div>
      <div class="mw-row" style="margin-top:12px">
        <button class="mw-btn" data-act="d-save" style="background:rgba(56,189,248,.15);font-weight:800">💾 сохранить</button>
        <button class="mw-btn" data-act="d-cancel">отмена</button>
      </div>
    </div>`;
  }

  function renderScenarios() {
    if (state.ui.editing) return renderEditor();
    const presetOpts = PRESETS.map((p, i) => `<option value="${i}">${esc(p.name)} — ${esc(p.note)}</option>`).join('');
    const cards = state.scenarios.map((sc) => `
      <div class="mw-card ${sc.armed && sc.enabled ? 'armed' : ''} ${sc.enabled ? '' : 'dis'}">
        <div class="mw-row">
          <b style="color:#e2f4fb">${esc(sc.name)}</b>
          <span style="margin-left:auto" class="mw-row">
            <span class="mw-toggle-wrap" title="включён">${tglHtml(sc.enabled, false, 'sc-en', sc.id)} <span class="mw-muted">вкл</span></span>
            <span class="mw-toggle-wrap" title="armed = реально паузит">${tglHtml(sc.armed, true, 'sc-arm', sc.id)} <span style="color:${sc.armed ? '#fca5a5' : '#64748b'}">ARMED</span></span>
          </span>
        </div>
        <div class="mw-muted" style="margin:5px 0 7px">${esc(describeScenario(sc))}</div>
        <div class="mw-row">
          <button class="mw-btn" data-act="sc-edit" data-id="${sc.id}">✎ править</button>
          <button class="mw-btn" data-act="sc-dup" data-id="${sc.id}">⧉ дубль</button>
          <button class="mw-btn danger" data-act="sc-del" data-id="${sc.id}">✕ удалить</button>
        </div>
      </div>`).join('');
    return `
      <div class="mw-row" style="margin-bottom:10px">
        <button class="mw-btn" data-act="sc-new" style="font-weight:800">+ новый сценарий</button>
        <select data-act="sc-preset" style="flex:1">
          <option value="">+ из пресета…</option>${presetOpts}
        </select>
      </div>
      <div class="mw-muted" style="margin-bottom:10px">наблюдение по умолчанию: сценарий с «пауза» без <b style="color:#fca5a5">ARMED</b> только пишет в журнал. Авто-возврата из паузы нет и не будет.</div>
      ${cards || '<div class="mw-muted">сценариев нет — добавь свой или возьми пресет</div>'}`;
  }

  function renderStats() {
    if (!state.sel.length) return '<div class="mw-muted">выбери кабы на вкладке КАБЫ</div>';
    const blocks = state.sel.map((accId) => {
      const acc = ACCOUNTS.find((a) => a.id === accId);
      const st = state.stats?.[accId];
      if (!st) return `<div class="mw-card"><b>${esc(acc?.name || accId)}</b><div class="mw-muted">нет данных — запусти тик</div></div>`;
      const rows = st.rows.filter((r) => r.spend > 0).sort((a, b) => b.spend - a.spend);
      const hidden = st.rows.length - rows.length;
      const total = rows.reduce((s, r) => s + r.spend, 0);
      const trs = rows.map((r) => `<tr>
        <td><span class="mw-dot ${r.status === 'ACTIVE' ? 'a' : 'p'}"></span>${esc(r.name.length > 34 ? r.name.slice(0, 33) + '…' : r.name)}</td>
        <td>${fmt(r.spend)}</td><td>${fmt(metricValue(r, 'ctr'))}</td><td>${fmt(metricValue(r, 'cpc'))}</td>
        <td>${fmt(metricValue(r, 'cpm'))}</td><td>${fmt(r.freq, 1)}</td><td>${r.regs}</td><td>${r.purchases}</td>
      </tr>`).join('');
      return `<div class="mw-card">
        <div class="mw-row"><b style="color:#e2f4fb">${esc(acc?.name || accId)}</b>
          <span class="mw-muted" style="margin-left:auto">today · спенд <b style="color:#7dd3fc">$${fmt(total)}</b> · ${hhmm(st.ts)}</span></div>
        <table style="margin-top:6px">
          <tr><th>кампания</th><th>спенд</th><th>CTR</th><th>CPC</th><th>CPM</th><th>частота</th><th>реги</th><th>покупки</th></tr>
          ${trs || '<tr><td colspan="8" class="mw-muted">нет кампаний со спендом</td></tr>'}
        </table>
        ${hidden > 0 ? `<div class="mw-muted" style="margin-top:4px">+ ${hidden} без спенда скрыто</div>` : ''}
      </div>`;
    }).join('');
    return `<div class="mw-row" style="margin-bottom:10px"><button class="mw-btn" data-act="tick-now">⟳ тикнуть сейчас</button></div>${blocks}`;
  }

  function renderJournal() {
    const items = state.journal.slice(0, 200).map((j) => {
      if (j.kind === 'error') return `<div class="mw-jr"><span class="t">${hhmm(j.ts)}</span><span class="mw-badge err">ERR</span> ${esc(j.acc)} ${esc(j.msg)}</div>`;
      if (j.kind === 'info') return `<div class="mw-jr"><span class="t">${hhmm(j.ts)}</span><span class="mw-badge obs">ⓘ</span> ${esc(j.msg)}</div>`;
      const badge = j.mode === 'armed'
        ? `<span class="mw-badge arm">${j.ok ? '⛔ PAUSED' : 'PAUSE FAIL'}</span>`
        : (j.action === 'pause' ? '<span class="mw-badge obs">👁 OBSERVE</span>' : '<span class="mw-badge ntf">🔔 NOTIFY</span>');
      return `<div class="mw-jr"><span class="t">${hhmm(j.ts)}</span>${badge}
        <b style="color:#e2f4fb">${esc(j.scName)}</b> · ${esc(j.acc)}<br>
        <span style="color:#94a3b8">${esc(j.entity)}</span> — ${esc(j.reason)}${j.err ? `<br><span style="color:#fca5a5">${esc(j.err)}</span>` : ''}</div>`;
    }).join('');
    return `
      <div class="mw-row" style="margin-bottom:8px">
        <button class="mw-btn" data-act="jr-export">⇩ экспорт JSON</button>
        <button class="mw-btn danger" data-act="jr-clear">очистить</button>
        <span class="mw-muted" style="margin-left:auto">записей: ${state.journal.length}</span>
      </div>
      ${items || '<div class="mw-muted">пусто — сработок ещё не было</div>'}`;
  }

  function renderSettings() {
    const s = state.settings;
    return `
      <label class="mw-lbl">Telegram-алерты (опционально)</label>
      <div class="mw-muted" style="margin-bottom:6px">отдельный алерт-бот (НЕ токен Арии). api.telegram.org отдаёт CORS — шлётся прямо из браузера, инфра не нужна.</div>
      <div class="mw-row"><input type="text" data-act="set-tgtoken" value="${esc(s.tgToken)}" placeholder="bot token 123456:ABC…" style="flex:1"></div>
      <div class="mw-row" style="margin-top:6px"><input type="text" data-act="set-tgchat" value="${esc(s.tgChat)}" placeholder="chat_id (свой DM или канал)" style="flex:1">
        <button class="mw-btn" data-act="set-tgtest">тест</button></div>
      <label class="mw-lbl">Звук при сработке</label>
      ${tglHtml(s.sound, false, 'set-sound', '')}
      <label class="mw-lbl">Гигиена вкладки</label>
      <div class="mw-muted">панель живёт пока открыта вкладка: запинь её, выключи Memory Saver для facebook.com. Троттлинг фоновой вкладки учтён (worker-таймер + догоняющий тик), но выгруженную вкладку не спасти — после reload кликни закладку снова, всё поднимется из localStorage.</div>
      <label class="mw-lbl">Хранилище</label>
      <div class="mw-muted">настройки/журнал per-domain: ${esc(location.hostname)}. Пользуйся вотчдогом с одного домена (business или adsmanager), иначе два независимых стейта.</div>`;
  }

  const TABS = [
    ['cabs', 'КАБЫ'], ['scen', 'СЦЕНАРИИ'], ['stats', 'СТАТА'], ['jr', 'ЖУРНАЛ'], ['set', '⚙'],
  ];

  function render() {
    if (!panel) return;
    const nav = panel.querySelector('#mw-tabs');
    nav.innerHTML = TABS.map(([k, l]) => `<button class="mw-tab ${state.ui.tab === k ? 'act' : ''}" data-act="tab" data-id="${k}">${l}${k === 'scen' && state.scenarios.some((s) => s.enabled && s.armed) ? ' 🔴' : ''}</button>`).join('');
    const body = panel.querySelector('#mw-body');
    body.innerHTML = { cabs: renderCabs, scen: renderScenarios, stats: renderStats, jr: renderJournal, set: renderSettings }[state.ui.tab]();
    const run = panel.querySelector('#mw-run');
    run.textContent = state.running ? '■ СТОП' : '▶ СТАРТ';
    run.className = 'mw-run' + (state.running ? ' on' : '');
    panel.querySelector('#mw-next').textContent = nextTickLabel();
    panel.querySelector('#mw-int').value = String(state.settings.intervalMin);
    const st = state.ui.status;
    panel.querySelector('#mw-led').dataset.t = st.type;
    panel.querySelector('#mw-status').textContent = st.msg;
  }

  function buildPanel() {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <div class="mw-head">
        <span class="mw-led" id="mw-led"></span>
        <span class="mw-title">&gt;METAWATCH PRO // v${VERSION}&lt;</span>
        <button class="mw-x" title="закрыть (вотчдог остановится!)">✕</button>
      </div>
      <div class="mw-bar">
        <button class="mw-run" id="mw-run">▶ СТАРТ</button>
        <select id="mw-int" title="интервал тика">
          ${[5, 10, 15, 30, 60].map((m) => `<option value="${m}">${m} мин</option>`).join('')}
        </select>
        <span class="mw-next" id="mw-next">стоп</span>
        <span class="mw-status" id="mw-status"></span>
      </div>
      <div class="mw-tabs" id="mw-tabs"></div>
      <div class="mw-body" id="mw-body"></div>`;
    document.body.appendChild(panel);

    panel.querySelector('.mw-x').addEventListener('click', () => {
      if (state.running && !confirm('Вотчдог работает. Закрыть панель = остановить мониторинг. Точно?')) return;
      setRunning(false);
      panel.remove();
      document.title = baseTitle;
    });
    panel.querySelector('#mw-run').addEventListener('click', () => setRunning(!state.running));
    panel.querySelector('#mw-int').addEventListener('change', (e) => {
      state.settings.intervalMin = Number(e.target.value) || 15;
      save(); render();
    });

    panel.addEventListener('click', onClick);
    panel.addEventListener('change', onChange);
    panel.addEventListener('input', (e) => {
      if (e.target.dataset.act === 'accfilter') { state.ui.accFilter = e.target.value; renderBodyKeepFocus(); }
    });
  }

  // Перерисовать body без потери фокуса в фильтре кабов
  function renderBodyKeepFocus() {
    const body = panel.querySelector('#mw-body');
    const pos = body.querySelector('[data-act=accfilter]')?.selectionStart;
    body.innerHTML = renderCabs();
    const inp = body.querySelector('[data-act=accfilter]');
    if (inp && pos != null) { inp.focus(); inp.setSelectionRange(pos, pos); }
  }

  function findSc(id) { return state.scenarios.find((s) => s.id === id); }

  function onClick(e) {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const { act, id, i } = el.dataset;
    switch (act) {
      case 'tab': state.ui.tab = id; render(); break;
      case 'reload-acc': ACCOUNTS.length = 0; loadAccounts(); break;
      case 'tick-now': runTick(true); break;
      case 'sc-new':
        state.ui.editing = 'new';
        state.ui.draft = { id: scId(), name: 'Новый сценарий', enabled: true, armed: false, when: [c('spend', 'gt', 50)], action: 'notify', scope: 'campaign', filt: nf('off', ''), cooldownMin: 240 };
        render(); break;
      case 'sc-edit': {
        const sc = findSc(id); if (!sc) break;
        state.ui.editing = id;
        state.ui.draft = JSON.parse(JSON.stringify(sc));
        render(); break;
      }
      case 'sc-dup': {
        const sc = findSc(id); if (!sc) break;
        state.scenarios.push({ ...JSON.parse(JSON.stringify(sc)), id: scId(), name: sc.name + ' (копия)', armed: false });
        save(); render(); break;
      }
      case 'sc-del': {
        const sc = findSc(id); if (!sc) break;
        if (!confirm(`Удалить сценарий "${sc.name}"?`)) break;
        state.scenarios = state.scenarios.filter((s) => s.id !== id);
        save(); render(); break;
      }
      case 'sc-en': { const sc = findSc(id); if (sc) { sc.enabled = !sc.enabled; save(); render(); } break; }
      case 'sc-arm': {
        const sc = findSc(id); if (!sc) break;
        if (!sc.armed && !confirm(`ARMED для "${sc.name}": сценарий будет РЕАЛЬНО ставить паузу. Включить?`)) break;
        sc.armed = !sc.armed;
        journal({ kind: 'info', msg: `сценарий "${sc.name}" → ${sc.armed ? 'ARMED (боевой)' : 'observe'}` });
        save(); render(); break;
      }
      case 'd-addcond': state.ui.draft.when.push(c('spend', 'gt', 0)); render(); break;
      case 'd-delcond': state.ui.draft.when.splice(Number(i), 1); render(); break;
      case 'd-save': {
        const d = state.ui.draft;
        if (!d.name.trim() || !d.when.length) break;
        d.when = d.when.map((x) => ({ ...x, value: Number(x.value) || 0 }));
        const idx = state.scenarios.findIndex((s) => s.id === d.id);
        if (idx >= 0) state.scenarios[idx] = d; else state.scenarios.push(d);
        state.ui.editing = null; state.ui.draft = null;
        save(); render(); break;
      }
      case 'd-cancel': state.ui.editing = null; state.ui.draft = null; render(); break;
      case 'set-sound': state.settings.sound = !state.settings.sound; save(); render(); break;
      case 'set-tgtest':
        sendTg(`🐕 MetaWatch PRO v${VERSION} — тест связи ок (${location.hostname})`).then((ok) => setStatus(ok ? 'ok' : 'err', ok ? 'TG тест: доставлено' : 'TG тест: не ушло — проверь токен/chat_id'));
        break;
      case 'jr-export': {
        const blob = new Blob([JSON.stringify(state.journal, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `metawatch-journal-${new Date().toISOString().slice(0, 10)}.json`;
        a.click(); break;
      }
      case 'jr-clear':
        if (confirm('Очистить журнал?')) { state.journal = []; save(); render(); }
        break;
    }
  }

  function onChange(e) {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const { act, id, i } = el.dataset;
    const d = state.ui.draft;
    switch (act) {
      case 'selacc':
        if (el.checked) { if (!state.sel.includes(id)) state.sel.push(id); }
        else state.sel = state.sel.filter((x) => x !== id);
        save(); render();
        break;
      case 'sc-preset': {
        if (el.value === '') break; // placeholder: Number('')===0 взял бы PRESETS[0]
        const p = PRESETS[Number(el.value)];
        el.value = '';
        if (!p) break;
        state.scenarios.push({ id: scId(), name: p.name, enabled: true, armed: false, when: JSON.parse(JSON.stringify(p.when)), action: p.action, scope: 'campaign', filt: { ...p.filt }, cooldownMin: 240 });
        save(); render(); break;
      }
      case 'd-name': d.name = el.value; break;
      case 'd-metric': d.when[Number(i)].metric = el.value; break;
      case 'd-op': d.when[Number(i)].op = el.value; break;
      case 'd-val': d.when[Number(i)].value = el.value; break;
      case 'd-action': d.action = el.value; break;
      case 'd-scope': d.scope = el.value; break;
      case 'd-cool': d.cooldownMin = Number(el.value) || 240; break;
      case 'd-fmode': d.filt.mode = el.value; break;
      case 'd-ftext': d.filt.text = el.value; break;
      case 'set-tgtoken': state.settings.tgToken = el.value.trim(); save(); break;
      case 'set-tgchat': state.settings.tgChat = el.value.trim(); save(); break;
    }
  }

  // ─── INIT ───────────────────────────────────────────────────────────────
  load();
  buildPanel();
  render();
  setStatus('busy', 'ищу токен…');
  TOKEN = await getToken();
  if (!TOKEN) {
    setStatus('err', 'токен не найден — открой adsmanager/business.facebook.com под логином');
  } else {
    setStatus('ok', 'токен найден');
    loadAccounts();
  }
  if (state.running) {
    // букмарклет перекликнут после reload при активном вотчдоге → возобновляю
    journal({ kind: 'info', msg: 'панель переоткрыта — вотчдог возобновлён' });
    startTimer();
    updateTitle();
    render();
  }
})();
