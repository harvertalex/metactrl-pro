/* ===========================================================================
 * FB Launcher v0.2.4.0 — Bookmarklet
 *
 * Launches FB Ads Manager campaigns from CSV through Marketing API (no bulk-upload).
 * Supports: multi-adset (1×M×N), CBO/ABO budget, Special Ad Categories (Financial, etc.),
 * tab+comma CSV auto-detect, video+image ads, US state region targeting.
 * v0.2: Link override, URL Tags override, token engine, pixel placeholder substitution.
 *
 * Use from business.facebook.com or adsmanager.facebook.com (logged in).
 * Standalone — does NOT depend on MetaCtrl PRO.
 * ===========================================================================
 */
(async () => {
  'use strict';

  // ─── KILL OLD INSTANCE ──────────────────────────────────────────────────
  const PANEL_ID = '__fb_launcher_panel__';
  document.getElementById(PANEL_ID)?.remove();

  // ─── CONFIG ─────────────────────────────────────────────────────────────
  const GRAPH_VER = 'v23.0';
  const HOST_GRAPH = `https://graph.facebook.com/${GRAPH_VER}`;
  const RATE_AD_MS = 400;
  const RATE_ADSET_MS = 800;
  const RATE_ACCOUNT_MS = 1500;
  const MAX_RETRIES = 4;
  const BACKOFF_BASE_MS = 5000;

  // ─── STATE ──────────────────────────────────────────────────────────────
  let TOKEN = '';
  const ACCOUNTS = [];
  let accountsLoading = false;

  const state = {
    rows: [],
    fileName: '',
    accFilter: '',
    targetAccId: '',
    pageIdOverride: '',
    linkOverride: '',         // v0.2: replaces CSV Link column (with token substitution)
    urlTagsOverride: '',      // v0.2: replaces CSV URL Tags column (with token substitution)
    titleOverride: '',        // v0.2.2: replaces CSV Title (headline) for all ads
    bodyOverride: '',         // v0.2.2: replaces CSV Body (primary text) for all ads
    ctaOverride: '',          // v0.2.2: replaces CSV Call to Action for all ads (e.g. GET_QUOTE)
    pixelOverride: '',        // v0.2.3: forces pixel_id (skips CSV "Pixel"/"Optimized Conversion Tracking Pixels")
    customEventOverride: '',  // v0.2.3: forces custom_event_type (PURCHASE/LEAD/etc)
    pixelsList: [],           // v0.2.3: pixels fetched for selected account ([{id, name}])
    pixelsLoading: false,
    creativesInput: '',       // v0.2: raw user input (textarea)
    creativesParsed: null,    // v0.2: { mode: 'list'|'map'|'single', list?, map?, value? }
    creativesError: '',
    urlTagParam: 'sub2',      // legacy: single-param replacement in URL Tags
    urlTagMode: 'acc_id',
    urlTagCustom: '',
    createStatus: 'PAUSED',
    campNameTpl: '',
    adsetNameTpl: '',
    running: false,
    log: [],
    progress: { done: 0, total: 0 },
    status: { type: 'info', text: 'Loading FB session token...' },
  };

  // ─── UTILS ──────────────────────────────────────────────────────────────
  const esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[m]));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const stripPfx = v => String(v || '').replace(/^[a-z]+:/, '');
  const SC = { info:'#3b82f6', success:'#22c55e', error:'#ef4444', warning:'#f59e0b' };

  function setStatus(type, text) { state.status = { type, text }; render(); }
  function addLog(type, msg) {
    state.log.push({ type, msg, ts: new Date().toLocaleTimeString() });
    render();
  }

  // ─── FB API CLIENT ──────────────────────────────────────────────────────
  async function apiFetch(path, opts = {}) {
    const method = opts.method || 'GET';
    const isFull = /^https?:\/\//i.test(path);
    const url = isFull ? new URL(path) : new URL(`${HOST_GRAPH}/${path.replace(/^\/+/, '')}`);
    if (!isFull) {
      Object.entries(opts.params || {}).forEach(([k, v]) => {
        if (v != null && v !== '') url.searchParams.set(k, v);
      });
      url.searchParams.set('access_token', TOKEN);
    }
    const fo = {
      method,
      credentials: 'include',
      mode: 'cors',
      referrer: 'https://business.facebook.com/',
      referrerPolicy: 'origin-when-cross-origin',
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
        const code = json?.error?.code;
        // 4: rate limit, 17: user request limit, 32: page rate, 80004: too many calls
        if ([4, 17, 32, 80004].includes(code) && attempt < MAX_RETRIES) {
          const wait = BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
          await sleep(wait);
          continue;
        }
        throw new Error(json?.error?.error_user_msg || json?.error?.message || `API error (${res.status})`);
      } catch (e) {
        lastErr = e;
        if (attempt >= MAX_RETRIES) break;
        await sleep(1000 * attempt);
      }
    }
    throw lastErr || new Error('API call failed');
  }

  async function apiAll(path, params = {}) {
    const rows = [];
    let next = path;
    let np = params;
    while (next) {
      const p = await apiFetch(next, { params: np });
      rows.push(...(p?.data || []));
      next = p?.paging?.next || '';
      np = {};
    }
    return rows;
  }

  // ─── TOKEN DISCOVERY ────────────────────────────────────────────────────
  async function getToken() {
    if (TOKEN) return TOKEN;

    // 1. FB native global on adsmanager.facebook.com and business.facebook.com
    try {
      if (typeof __accessToken !== 'undefined' && __accessToken) {
        addLog('info', 'Token source: __accessToken global');
        return __accessToken;
      }
    } catch {}
    try {
      if (window.__accessToken) {
        addLog('info', 'Token source: window.__accessToken');
        return window.__accessToken;
      }
    } catch {}

    // 2. Scrape from script tags on current page
    try {
      const scripts = document.querySelectorAll('script');
      for (const s of scripts) {
        const m = (s.textContent || '').match(/"access_token":"(EAA[A-Za-z0-9_-]+)"/);
        if (m) {
          addLog('info', 'Token source: scraped from current page script tag');
          return m[1];
        }
      }
    } catch {}

    // 3. Scrape from full document.documentElement.outerHTML
    try {
      const m = (document.documentElement.outerHTML || '').match(/"access_token":"(EAA[A-Za-z0-9_-]+)"/);
      if (m) {
        addLog('info', 'Token source: scraped from documentElement');
        return m[1];
      }
    } catch {}

    // 4. Fetch from FB endpoints (fallback — may have limited scope)
    const candidates = [
      'https://business.facebook.com/ajax/bootloader-endpoint/?modules=AdsCanvasComposerDialog.react&__a=1',
      'https://adsmanager.facebook.com/adsmanager/',
      'https://business.facebook.com/business/loginpage/',
    ];
    for (const u of candidates) {
      try {
        const res = await fetch(u, { credentials: 'include' });
        const txt = await res.text();
        const m = txt.match(/"access_token":"(EAA[A-Za-z0-9_-]+)"/);
        if (m) {
          addLog('info', `Token source: fetch ${new URL(u).hostname}`);
          return m[1];
        }
      } catch {}
    }
    return '';
  }

  // ─── ACCOUNT LOADER ─────────────────────────────────────────────────────
  async function loadAccounts() {
    if (accountsLoading) return;
    accountsLoading = true;
    setStatus('info', 'Loading ad accounts...');
    render();

    const fields = 'id,account_id,name,account_status,currency';
    const rows = [];
    let bmCount = 0;
    let personalErr = null;
    let bizErr = null;

    // 1. Personal accounts via /me/adaccounts (catches accounts not in any BM,
    //    and works even when /me/businesses scope is missing)
    try {
      const personal = await apiAll('/me/adaccounts', { fields, limit: 200 });
      personal.forEach(a => rows.push({ ...a, _bm_id: '', _bm_name: 'Personal' }));
      addLog('info', `/me/adaccounts: ${personal.length} accounts`);
    } catch (e) {
      personalErr = e;
      addLog('warning', `/me/adaccounts failed: ${e.message}`);
    }

    // 2. Multi-BM via /me/businesses
    let businesses = [];
    try {
      businesses = await apiAll('/me/businesses', { fields: 'id,name', limit: 200 });
      addLog('info', `/me/businesses: ${businesses.length} BMs`);
    } catch (e) {
      bizErr = e;
      addLog('warning', `/me/businesses failed: ${e.message}`);
    }

    // Also try /me?fields=businesses{id,name} as alternate
    if (!businesses.length) {
      try {
        const p = await apiFetch('/me', { params: { fields: 'businesses{id,name}' } });
        const altBiz = p?.businesses?.data || [];
        if (altBiz.length) {
          businesses = altBiz;
          addLog('info', `/me?businesses: ${altBiz.length} BMs (alt path)`);
        }
      } catch (e) {
        addLog('warning', `/me?businesses failed: ${e.message}`);
      }
    }

    const seenBiz = new Set();
    businesses = businesses.filter(b => b?.id && !seenBiz.has(b.id) && seenBiz.add(b.id));
    bmCount = businesses.length;

    if (businesses.length) {
      await Promise.all(businesses.map(async biz => {
        await Promise.all(['owned_ad_accounts', 'client_ad_accounts'].map(async edge => {
          try {
            const items = await apiAll(`/${biz.id}/${edge}`, { fields, limit: 200 });
            items.forEach(a => rows.push({ ...a, _bm_id: biz.id, _bm_name: biz.name }));
            if (items.length) addLog('info', `${biz.name} (${edge.replace('_ad_accounts','')}): ${items.length}`);
          } catch (e) {
            addLog('warning', `${biz.name}/${edge}: ${e.message}`);
          }
        }));
      }));
    }

    // Dedupe by id
    const seen = new Set();
    ACCOUNTS.length = 0;
    rows.filter(a => {
      const id = String(a.account_id || a.id || '').replace(/^act_/, '');
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    }).forEach(a => {
      const id = String(a.account_id || a.id || '').replace(/^act_/, '');
      ACCOUNTS.push({
        id,
        name: a.name || 'Untitled',
        bm: a._bm_name || 'Personal',
        status: a.account_status,
        currency: a.currency || 'USD',
        label: `${a.name || 'Untitled'} (${id})`,
      });
    });
    ACCOUNTS.sort((a, b) => a.bm.localeCompare(b.bm) || a.name.localeCompare(b.name));

    accountsLoading = false;
    if (ACCOUNTS.length) {
      setStatus('success', `Loaded ${ACCOUNTS.length} accounts across ${bmCount} BMs + personal.`);
    } else if (personalErr && bizErr) {
      setStatus('error', `Both /me/adaccounts and /me/businesses failed. Token scope issue? Try opening business.facebook.com first, then click bookmark again.`);
    } else {
      setStatus('warning', `No accounts found. Token may have limited scope. Are you logged in to FB with admin access?`);
    }
    render();
  }

  // ─── PIXEL LOADER (for selected account) ────────────────────────────────
  async function loadPixelsForAccount(accId) {
    if (!accId) { state.pixelsList = []; render(); return; }
    state.pixelsLoading = true;
    state.pixelsList = [];
    render();
    try {
      const items = await apiAll(`/act_${accId}/adspixels`, { fields: 'id,name', limit: 100 });
      state.pixelsList = items.map(p => ({ id: String(p.id), name: p.name || 'Untitled' }));
      addLog('info', `Pixels for ${accId}: ${state.pixelsList.length} found`);
    } catch (e) {
      addLog('warning', `Pixel fetch failed: ${e.message}`);
    } finally {
      state.pixelsLoading = false;
      render();
    }
  }

  // ─── CSV PARSER (auto-detect tab vs comma) ──────────────────────────────
  function parseCsv(buf) {
    let text;
    const view = new Uint8Array(buf);
    if (view[0] === 0xFF && view[1] === 0xFE) text = new TextDecoder('utf-16le').decode(buf.slice(2));
    else if (view[0] === 0xFE && view[1] === 0xFF) text = new TextDecoder('utf-16be').decode(buf.slice(2));
    else if (view[0] === 0xEF && view[1] === 0xBB && view[2] === 0xBF) text = new TextDecoder('utf-8').decode(buf.slice(3));
    else text = new TextDecoder('utf-8').decode(buf);

    // Detect separator on first line outside quotes
    const firstLine = text.split(/\r?\n/, 1)[0] || '';
    let tabs = 0, commas = 0, q = false;
    for (let i = 0; i < firstLine.length; i++) {
      const c = firstLine[i];
      if (c === '"') { q = !q; continue; }
      if (q) continue;
      if (c === '\t') tabs++;
      else if (c === ',') commas++;
    }
    const SEP = tabs >= commas ? '\t' : ',';

    const rows = [];
    let row = [], cur = '', inQ = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQ) {
        if (ch === '"' && text[i+1] === '"') { cur += '"'; i++; }
        else if (ch === '"') inQ = false;
        else cur += ch;
      } else {
        if (ch === '"') inQ = true;
        else if (ch === SEP) { row.push(cur); cur = ''; }
        else if (ch === '\r') { /* skip */ }
        else if (ch === '\n') { row.push(cur); cur = ''; rows.push(row); row = []; }
        else cur += ch;
      }
    }
    if (cur || row.length) { row.push(cur); rows.push(row); }
    if (rows.length < 2) return { rows: [], sep: SEP };
    const header = rows[0].map(h => String(h).trim());
    const data = rows.slice(1).filter(r => r.some(c => c && c.trim())).map(r => {
      const o = {};
      header.forEach((h, i) => o[h] = (r[i] || '').trim());
      return o;
    });
    return { rows: data, sep: SEP };
  }

  async function onCsvFile(file) {
    try {
      const buf = await file.arrayBuffer();
      const { rows, sep } = parseCsv(buf);
      if (!rows.length) { setStatus('error', 'CSV is empty or has no data rows.'); return; }
      state.rows = rows;
      state.fileName = file.name;
      const sepLabel = sep === '\t' ? 'TSV' : 'CSV';
      setStatus('success', `Parsed ${rows.length} rows from ${file.name} (${sepLabel})`);
    } catch (e) {
      setStatus('error', `CSV parse error: ${e.message}`);
    }
  }

  // ─── LAUNCH PLAN ANALYSIS ───────────────────────────────────────────────
  function analyzePlan() {
    if (!state.rows.length) return null;
    const first = state.rows[0];

    // Group rows by Ad Set Name
    const groups = new Map();
    for (const r of state.rows) {
      const key = r['Ad Set Name'] || '__default__';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    }

    // Budget mode
    const campBudgetRaw = String(first['Campaign Daily Budget'] || '').trim();
    const adsetBudgetRaw = String(first['Ad Set Daily Budget'] || '').trim();
    const isCBO = !!campBudgetRaw && campBudgetRaw.toUpperCase() !== 'UNDEFINED' && +campBudgetRaw > 0;
    const cboBudget = isCBO ? +campBudgetRaw : 0;

    // SAC
    const sacRaw = String(first['Special Ad Categories'] || 'NONE').trim().toUpperCase();
    const sacMap = {
      'FINANCIAL_PRODUCTS_SERVICES': 'FINANCIAL_PRODUCTS_SERVICES',
      'EMPLOYMENT': 'EMPLOYMENT',
      'HOUSING': 'HOUSING',
      'CREDIT': 'CREDIT',
      'ISSUES_ELECTIONS_POLITICS': 'ISSUES_ELECTIONS_POLITICS',
      'ONLINE_GAMBLING_AND_GAMING': 'ONLINE_GAMBLING_AND_GAMING',
    };
    const sacList = (sacRaw && sacRaw !== 'NONE') ? [sacMap[sacRaw] || sacRaw] : [];

    // Adset budgets sum for ABO
    let aboTotal = 0;
    if (!isCBO) {
      for (const [, gr] of groups) {
        const ab = String(gr[0]['Ad Set Daily Budget'] || '').trim();
        const n = (ab && ab.toUpperCase() !== 'UNDEFINED') ? +ab : 0;
        if (n > 0) aboTotal += n;
      }
    }

    // Ads-mode (creatives override defines new ads per adset)
    const adsMode = state.creativesParsed?.mode === 'ads';
    const adsModeItems = adsMode ? state.creativesParsed.items : null;
    const adCount = adsMode
      ? groups.size * adsModeItems.length
      : state.rows.length;

    return {
      groups,
      adsetCount: groups.size,
      adCount,
      adsMode,
      adsModeItems,
      isCBO,
      cboBudget,
      aboTotal,
      sacList,
      objective: first['Campaign Objective'] || '',
      pixel: stripPfx(first['Optimized Conversion Tracking Pixels'] || first['Pixel'] || ''),
      event: first['Optimized Event'] || first['Custom Event Type'] || '',
    };
  }

  // ─── ENUM MAPPERS ───────────────────────────────────────────────────────
  function mapObjective(o) {
    const n = String(o || '').toUpperCase().trim();
    const m = {
      'OUTCOME SALES':'OUTCOME_SALES','SALES':'OUTCOME_SALES',
      'OUTCOME LEADS':'OUTCOME_LEADS','LEADS':'OUTCOME_LEADS',
      'OUTCOME TRAFFIC':'OUTCOME_TRAFFIC','TRAFFIC':'OUTCOME_TRAFFIC',
      'OUTCOME ENGAGEMENT':'OUTCOME_ENGAGEMENT','ENGAGEMENT':'OUTCOME_ENGAGEMENT',
      'OUTCOME AWARENESS':'OUTCOME_AWARENESS','AWARENESS':'OUTCOME_AWARENESS',
      'OUTCOME APP PROMOTION':'OUTCOME_APP_PROMOTION','APP PROMOTION':'OUTCOME_APP_PROMOTION',
    };
    return m[n] || n.replace(/\s+/g, '_');
  }

  function mapBidStrategy(b) {
    const n = String(b || '').toLowerCase();
    if (n.includes('cost per result') || n.includes('cost cap')) return 'COST_CAP';
    if (n.includes('bid cap')) return 'LOWEST_COST_WITH_BID_CAP';
    if (n.includes('cost_cap') || n === 'cost_cap') return 'COST_CAP';
    if (n === 'lowest_cost_with_bid_cap') return 'LOWEST_COST_WITH_BID_CAP';
    return 'LOWEST_COST_WITHOUT_CAP';
  }

  function renderTpl(tpl, ctx) {
    return String(tpl || '').replace(/\{(\w+)\}|\$\{(\w+)\}/g, (_, a, b) => String(ctx[a || b] ?? ''));
  }

  /**
   * Resolve tokens in a URL or URL Tag string.
   * - Single-brace tokens {pixel_id}, {account_id}, etc. → replaced from ctx
   * - Literal "pixelID" (case-sensitive, our gen-gambling-csv.ts convention) → pixel_id
   * - Double-brace FB macros {{campaign.id}} → LEFT AS-IS (FB substitutes at runtime)
   */
  function resolveTokens(str, ctx) {
    if (!str) return str;
    let out = String(str);
    // Preserve FB {{...}} macros: protect them, then restore after single-brace replace
    const fbMacros = [];
    out = out.replace(/\{\{[^}]+\}\}/g, m => {
      fbMacros.push(m);
      return `\x00FBM${fbMacros.length - 1}\x00`;
    });
    // Replace single-brace tokens
    out = out.replace(/\{(\w+)\}/g, (_, k) => {
      const v = ctx[k];
      return v == null ? '' : String(v);
    });
    // Legacy: literal "pixelID" → ctx.pixel_id (from gen-gambling-csv.ts placeholder)
    if (ctx.pixel_id) {
      out = out.replace(/\bpixelID\b/g, String(ctx.pixel_id));
    }
    // Restore FB macros
    out = out.replace(/\x00FBM(\d+)\x00/g, (_, i) => fbMacros[+i] || '');
    return out;
  }

  /**
   * Parse creatives input from textarea.
   * Returns one of:
   *   - { mode: 'ads',    items: [{name, imageHash?, videoId?}, ...] }  ← ads-mode: each item = 1 new ad, replicated per adset
   *   - { mode: 'map',    map: {adName: hash} }                          ← override CSV per ad by name
   *   - { mode: 'list',   list: [hash, ...] }                            ← override CSV per ad by index
   *   - { mode: 'single', value: hash }                                  ← same creative for every CSV ad
   *   - null (empty input)
   *
   * Sets state.creativesError on parse failure.
   *
   * Detection priority (JSON array of objects):
   *   - If items have explicit imageHash/image_hash OR videoId/video_id fields → 'ads' mode
   *     (each item creates a new ad; CSV Ad Name/Image Hash/Video ID columns ignored)
   *   - Else fall back to 'map'/'list' (objects with just {hash, name})
   */
  function parseCreatives(input) {
    state.creativesError = '';
    if (!input || !input.trim()) return null;
    const trimmed = input.trim();

    // Try JSON
    try {
      const json = JSON.parse(trimmed);
      if (Array.isArray(json)) {
        if (json.length && typeof json[0] === 'object' && json[0] !== null) {
          // Detect ads-mode: items have explicit imageHash or videoId
          const hasExplicitType = json.every(o =>
            o && typeof o === 'object' &&
            (o.imageHash !== undefined || o.image_hash !== undefined ||
             o.videoId !== undefined || o.video_id !== undefined)
          );
          if (hasExplicitType) {
            const items = json.map((o, i) => ({
              name: String(o.name || o.ad_name || o.filename || `Ad ${i + 1}`).trim(),
              imageHash: String(o.imageHash || o.image_hash || '').trim(),
              videoId: String(o.videoId || o.video_id || '').trim(),
              title: String(o.title || o.headline || '').trim() || null,   // optional per-item override
              body: String(o.body || o.message || '').trim() || null,
              cta: String(o.cta || o.call_to_action || '').trim() || null,
            })).filter(o => o.imageHash || o.videoId);
            if (items.length) return { mode: 'ads', items };
          }

          // Fallback: legacy {hash, name} format → map by name + list by index
          const map = {}; const list = [];
          for (const o of json) {
            const val = o.hash || o.image_hash || o.video_id || o.videoId || o.id || '';
            if (!val) continue;
            const v = String(val);
            list.push(v);
            const key = o.name || o.filename || o.ad_name || '';
            if (key) map[String(key).trim()] = v;
          }
          if (Object.keys(map).length) return { mode: 'map', map, list };
          if (list.length) return { mode: 'list', list };
        } else {
          return { mode: 'list', list: json.map(String) };
        }
      } else if (typeof json === 'object' && json !== null) {
        const map = {};
        for (const k of Object.keys(json)) map[k.trim()] = String(json[k]);
        return { mode: 'map', map };
      } else if (typeof json === 'string') {
        return { mode: 'single', value: json };
      }
    } catch {}

    // Newline/comma-separated
    const lines = trimmed.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
    if (lines.length > 1) return { mode: 'list', list: lines };
    if (lines.length === 1) return { mode: 'single', value: lines[0] };

    state.creativesError = 'Could not parse creatives input';
    return null;
  }

  /**
   * Detect creative type from raw value.
   * Returns { type: 'image' | 'video' | 'none', value }.
   * Rules:
   *   - "vid:XXX" or "v:XXX" → video, strip prefix
   *   - "img:XXX" or "hash:XXX" → image, strip prefix
   *   - All digits, 13-18 chars → video_id (FB IDs are ~15 digits)
   *   - Otherwise → image_hash (FB image hashes are 32-char hex)
   */
  function detectCreativeType(value) {
    if (!value) return { type: 'none', value: '' };
    const v = String(value).trim();
    if (/^v(id)?:/i.test(v)) return { type: 'video', value: v.replace(/^v(id)?:/i, '') };
    if (/^(img|hash):/i.test(v)) return { type: 'image', value: v.replace(/^(img|hash):/i, '') };
    if (/^\d{13,18}$/.test(v)) return { type: 'video', value: v };
    return { type: 'image', value: v };
  }

  /**
   * Resolve creative for an ad given override state + CSV row.
   * Priority: UI override (map by name → list by index → single) > CSV row.
   * Returns { imageHash, videoId } (one or the other, or both empty).
   */
  function resolveCreative(adGlobalIdx, adName, csvRow) {
    let raw = '';
    const p = state.creativesParsed;
    if (p) {
      if (p.mode === 'map') {
        // Exact match first, then substring
        if (p.map[adName]) raw = p.map[adName];
        else {
          const key = Object.keys(p.map).find(k => adName.includes(k) || k.includes(adName));
          if (key) raw = p.map[key];
        }
      } else if (p.mode === 'list') {
        raw = p.list[adGlobalIdx] || '';
      } else if (p.mode === 'single') {
        raw = p.value || '';
      }
    }
    if (raw) {
      const det = detectCreativeType(raw);
      if (det.type === 'video') return { imageHash: '', videoId: det.value };
      if (det.type === 'image') return { imageHash: det.value, videoId: '' };
    }
    // Fallback to CSV columns
    const csvVideo = csvRow['Video ID'] ? stripPfx(csvRow['Video ID']) : '';
    const csvImage = (csvRow['Image Hash'] || '').split(':').pop();
    return { imageHash: csvImage, videoId: csvVideo };
  }

  function transformUrlTags(raw, accId) {
    if (!raw) return raw;
    const target = String(state.urlTagParam || '').trim();
    if (!target || state.urlTagMode === 'keep') return raw;
    const pairs = String(raw).split('&').map(p => {
      const [k, ...rest] = p.split('=');
      return [k, rest.join('=')];
    });
    const newVal = state.urlTagMode === 'acc_id' ? accId
      : state.urlTagMode === 'empty' ? ''
      : state.urlTagMode === 'custom' ? String(state.urlTagCustom || '') : '';
    let saw = false;
    const out = pairs.map(([k, v]) => {
      if (k === target) { saw = true; return [k, newVal]; }
      return [k, v];
    });
    if (!saw) out.push([target, newVal]);
    return out.map(([k, v]) => v === '' ? `${k}=` : `${k}=${v}`).join('&');
  }

  // ─── US STATES (for SafeX HI region targeting) ──────────────────────────
  const US_STATE_KEYS = {
    'alabama':3847,'alaska':3848,'arizona':3849,'arkansas':3850,'california':3851,
    'colorado':3852,'connecticut':3853,'delaware':3854,'florida':3855,'georgia':3856,
    'hawaii':3857,'idaho':3858,'illinois':3859,'indiana':3860,'iowa':3861,
    'kansas':3862,'kentucky':3863,'louisiana':3864,'maine':3865,'maryland':3866,
    'massachusetts':3867,'michigan':3868,'minnesota':3869,'mississippi':3870,'missouri':3871,
    'montana':3872,'nebraska':3873,'nevada':3874,'new hampshire':3875,'new jersey':3876,
    'new mexico':3877,'new york':3878,'north carolina':3879,'north dakota':3880,'ohio':3881,
    'oklahoma':3882,'oregon':3883,'pennsylvania':3884,'rhode island':3885,'south carolina':3886,
    'south dakota':3887,'tennessee':3888,'texas':3889,'utah':3890,'vermont':3891,
    'virginia':3892,'washington':3893,'west virginia':3894,'wisconsin':3895,'wyoming':3896,
    'district of columbia':3853,'washington dc':3893,
  };

  let _fbStateMapCache = null;
  async function fetchFbStateMap() {
    if (_fbStateMapCache) return _fbStateMapCache;
    try {
      const res = await apiFetch('/search', {
        params: { type: 'adgeolocation', location_types: '["region"]', country_code: 'US', limit: 200 },
      });
      const map = {};
      (res?.data || []).forEach(r => { map[r.name.toLowerCase()] = r.key; });
      _fbStateMapCache = map;
      return map;
    } catch {
      _fbStateMapCache = {};
      return {};
    }
  }

  async function resolveRegions(regionsRaw) {
    if (!regionsRaw) return [];
    const stateNames = String(regionsRaw).split(',').map(s => s.trim().replace(/\s+US$/i, '').trim()).filter(Boolean);
    if (!stateNames.length) return [];
    const fbMap = await fetchFbStateMap();
    const out = [];
    for (const name of stateNames) {
      const lc = name.toLowerCase();
      const key = fbMap[lc] || US_STATE_KEYS[lc];
      if (key) out.push({ key: String(key), name, country: 'US' });
      else addLog('warning', `Region not found: "${name}" — skipped`);
    }
    return out;
  }

  // ─── LAUNCHER ───────────────────────────────────────────────────────────
  async function runLaunch() {
    if (!state.rows.length) { setStatus('error', 'Load a CSV first.'); return; }
    if (!state.targetAccId) { setStatus('error', 'Select a target ad account.'); return; }
    const plan = analyzePlan();
    if (!plan) { setStatus('error', 'Cannot analyze plan from CSV.'); return; }

    // Pre-flight: validate effective pixel for first adset
    const firstAdsetRow = [...plan.groups.values()][0]?.[0];
    const csvPixelFirst = stripPfx(firstAdsetRow?.['Optimized Conversion Tracking Pixels'] || firstAdsetRow?.['Pixel'] || '');
    const effectivePixel = state.pixelOverride || csvPixelFirst;
    if (!effectivePixel) {
      setStatus('error', 'No pixel ID. Set "Pixel" override in step 4, or fill it in CSV.');
      return;
    }
    if (!/^\d{8,20}$/.test(effectivePixel)) {
      setStatus('error', `Invalid pixel ID "${effectivePixel}". Must be 8-20 digits (e.g. 1451350725476785). Got placeholder or wrong format. Set override in step 4.`);
      return;
    }
    // Sanity check: pixel should be in account's pixel list if list was loaded
    if (state.pixelsList.length && !state.pixelsList.find(p => p.id === effectivePixel)) {
      const ok = confirm(
        `Pixel ${effectivePixel} is NOT in this account's pixel list.\n\n` +
        `Available pixels:\n${state.pixelsList.slice(0, 5).map(p => `  ${p.id} — ${p.name}`).join('\n')}\n\n` +
        `Launch anyway? (FB may reject all adsets with subcode 1487429)`
      );
      if (!ok) { setStatus('warning', 'Launch cancelled. Pick a pixel from the dropdown in step 4.'); return; }
    }

    const accId = state.targetAccId;
    const acc = ACCOUNTS.find(a => a.id === accId);
    const accLabel = acc?.name || accId;
    const now = new Date();
    const dateStr = String(now.getMonth() + 1).padStart(2, '0')
      + String(now.getDate()).padStart(2, '0')
      + String(now.getFullYear()).slice(-2);
    const firstRow = state.rows[0];
    const totalUnits = 1 + plan.adsetCount + plan.adCount;

    state.running = true;
    state.log = [];
    state.progress = { done: 0, total: totalUnits };

    const sacLabel = plan.sacList.length ? ` SAC:${plan.sacList[0]}` : '';
    const budgetLabel = plan.isCBO ? `CBO $${plan.cboBudget}/d` : `ABO $${plan.aboTotal}/d total`;
    addLog('info', `[${accLabel}] Launching ${plan.adsetCount} adsets × ${plan.adCount} ads (${budgetLabel})${sacLabel}`);
    render();

    let campaignId;
    try {
      // ── Campaign ──
      const budgetForName = plan.isCBO ? plan.cboBudget : plan.aboTotal;
      const campName = state.campNameTpl
        ? renderTpl(state.campNameTpl, {
            budget: budgetForName, ad_count: plan.adCount, adset_count: plan.adsetCount,
            date: dateStr, acc_id: accId, source_name: firstRow['Campaign Name'] || '',
          })
        : (firstRow['Campaign Name'] || `FB Launcher ${dateStr}`);

      const campBody = {
        name: campName,
        objective: mapObjective(firstRow['Campaign Objective']),
        status: state.createStatus,
        special_ad_categories: JSON.stringify(plan.sacList),
        buying_type: firstRow['Buying Type'] || 'AUCTION',
        bid_strategy: mapBidStrategy(firstRow['Campaign Bid Strategy']),
      };
      if (plan.isCBO) campBody.daily_budget = String(Math.round(plan.cboBudget * 100));

      addLog('info', `[${accLabel}] creating campaign "${campName}"...`);
      const camp = await apiFetch(`/act_${accId}/campaigns`, { method: 'POST', body: campBody });
      campaignId = camp.id;
      state.progress.done++;
      addLog('success', `[${accLabel}] ✓ campaign id=${campaignId}`);
    } catch (e) {
      addLog('error', `[${accLabel}] ✗ campaign failed: ${e.message}`);
      state.running = false;
      setStatus('error', `Launch failed at campaign step. See log.`);
      return;
    }

    // ── Adsets + Ads (loop) ──
    let adsetIdx = 0;
    let adGlobalIdx = 0;  // 0-based across all adsets, for creatives list mode
    let totalAdOk = 0, totalAdErr = 0;
    for (const [adsetSourceName, groupRows] of plan.groups) {
      adsetIdx++;
      const aFirst = groupRows[0];

      // Build ads list for this adset early (needed for progress + logs).
      // ads-mode: items from creatives override become NEW ads (CSV Ad Name/Image Hash/Video ID ignored)
      // legacy: 1 ad per CSV row in this group
      const adsToCreate = plan.adsMode
        ? plan.adsModeItems.map(item => ({
            csvRow: groupRows[0],
            forcedName: item.name,
            forcedImageHash: item.imageHash,
            forcedVideoId: item.videoId,
          }))
        : groupRows.map(r => ({
            csvRow: r,
            forcedName: null,
            forcedImageHash: null,
            forcedVideoId: null,
          }));

      const adsetName = state.adsetNameTpl
        ? renderTpl(state.adsetNameTpl, {
            date: dateStr, acc_id: accId,
            source_name: adsetSourceName,
            ad_count: adsToCreate.length,
            n: String(adsetIdx).padStart(2, '0'),
          })
        : (adsetSourceName !== '__default__' ? adsetSourceName : `Ad Set ${adsetIdx}`);

      const countriesRaw = String(aFirst['Countries'] || '').split(',').map(s => s.trim()).filter(Boolean);
      const fbRegions = await resolveRegions(aFirst['Regions']);
      const countries = countriesRaw.length ? countriesRaw : ['US'];
      const ageMin = +aFirst['Age Min'] || 18;
      const ageMax = +aFirst['Age Max'] || 65;
      const gender = String(aFirst['Gender'] || '').toLowerCase();
      const genders = gender.includes('men') && !gender.includes('women') ? [1]
        : gender.includes('women') && !gender.includes('men') ? [2] : [1, 2];
      const publisherPlatforms = String(aFirst['Publisher Platforms'] || '').split(',').map(s => s.trim()).filter(Boolean);
      const fbPositions = String(aFirst['Facebook Positions'] || '').split(',').map(s => s.trim()).filter(Boolean);
      const igPositions = String(aFirst['Instagram Positions'] || '').split(',').map(s => s.trim()).filter(Boolean);
      const devicePlatforms = String(aFirst['Device Platforms'] || '').split(',').map(s => s.trim()).filter(Boolean);

      // Pixel: UI override (highest) > CSV columns
      const csvPixel = stripPfx(aFirst['Optimized Conversion Tracking Pixels'] || aFirst['Pixel'] || '');
      const pixelId = state.pixelOverride || csvPixel;
      const customEventType = state.customEventOverride
        || aFirst['Optimized Event']
        || aFirst['Custom Event Type']
        || 'PURCHASE';
      const optGoal = aFirst['Optimization Goal'] || 'OFFSITE_CONVERSIONS';
      const billingEvent = aFirst['Billing Event'] || 'IMPRESSIONS';
      const bidStrategy = mapBidStrategy(firstRow['Campaign Bid Strategy']);

      const geoLocations = {
        location_types: String(aFirst['Location Types'] || 'home,recent').split(',').map(s => s.trim()).filter(Boolean),
      };
      // Region-level targeting only when SAC is NOT set (SAC restricts to country-level)
      if (fbRegions.length && !plan.sacList.length) geoLocations.regions = fbRegions;
      else geoLocations.countries = countries;

      const targeting = {
        geo_locations: geoLocations,
        age_min: ageMin,
        age_max: ageMax,
        genders,
        targeting_automation: { advantage_audience: +(aFirst['Advantage Audience'] || 0) },
      };
      if (publisherPlatforms.length) targeting.publisher_platforms = publisherPlatforms;
      if (devicePlatforms.length) targeting.device_platforms = devicePlatforms;
      if (fbPositions.length) targeting.facebook_positions = fbPositions;
      if (igPositions.length) targeting.instagram_positions = igPositions;

      const promoted = { pixel_id: pixelId, custom_event_type: customEventType };

      const bidAmountRaw = aFirst['Bid Amount'];
      const bidNeedsCap = bidStrategy === 'COST_CAP' || bidStrategy === 'LOWEST_COST_WITH_BID_CAP';
      const bidAmountCents = bidNeedsCap && bidAmountRaw && +bidAmountRaw > 0
        ? String(Math.round(+bidAmountRaw * 100)) : null;

      const adsetBody = {
        name: adsetName,
        campaign_id: campaignId,
        status: state.createStatus,
        optimization_goal: optGoal,
        billing_event: billingEvent,
        targeting: JSON.stringify(targeting),
        promoted_object: JSON.stringify(promoted),
        attribution_spec: aFirst['Attribution Spec'] || '[{"event_type":"CLICK_THROUGH","window_days":1}]',
      };
      if (!plan.isCBO) {
        const ab = String(aFirst['Ad Set Daily Budget'] || '').trim();
        const abNum = (ab && ab.toUpperCase() !== 'UNDEFINED') ? +ab : 0;
        if (abNum > 0) adsetBody.daily_budget = String(Math.round(abNum * 100));
      }
      if (bidAmountCents) adsetBody.bid_amount = bidAmountCents;

      addLog('info', `[${accLabel}] creating adset ${adsetIdx}/${plan.adsetCount} "${adsetName}"...`);
      let adsetId;
      try {
        const adset = await apiFetch(`/act_${accId}/adsets`, { method: 'POST', body: adsetBody });
        adsetId = adset.id;
        state.progress.done++;
        addLog('success', `[${accLabel}] ✓ adset ${adsetIdx}/${plan.adsetCount} id=${adsetId} (${adsToCreate.length} ads coming)`);
      } catch (e) {
        addLog('error', `[${accLabel}] ✗ adset ${adsetIdx} "${adsetName}": ${e.message}`);
        state.progress.done += 1 + adsToCreate.length; // skip this adset's ads in progress
        continue;
      }

      await sleep(RATE_ADSET_MS);

      // ── Ads in this adset ──
      for (let i = 0; i < adsToCreate.length; i++) {
        const adInfo = adsToCreate[i];
        const r = adInfo.csvRow;
        const adName = adInfo.forcedName || r['Ad Name'] || `Ad ${adsetIdx}.${i + 1}`;
        try {
          const pageId = state.pageIdOverride || (r['Link Object ID'] ? stripPfx(r['Link Object ID']) : '');
          if (!pageId) throw new Error('No page_id (provide override or fill "Link Object ID" in CSV)');

          // Build token context for Link/URL Tags substitution
          const rowPixelId = stripPfx(r['Optimized Conversion Tracking Pixels'] || r['Pixel'] || '') || plan.pixel || '';
          const firstGeo = (String(aFirst['Countries'] || '').split(',').map(s => s.trim()).filter(Boolean)[0]) || '';
          const tokenCtx = {
            pixel_id: rowPixelId,
            account_id: accId,
            adset_name: adsetName,
            ad_name: adName,
            geo: firstGeo,
            date: dateStr,
            adset_idx: String(adsetIdx).padStart(2, '0'),
          };

          // Link: override template or CSV (always run through resolveTokens for pixelID literal)
          const rawLink = state.linkOverride || (r['Link'] || '');
          const link = resolveTokens(rawLink, tokenCtx);

          // URL Tags: override template OR CSV → resolveTokens → transformUrlTags (single-param replace)
          const rawTags = state.urlTagsOverride || (r['URL Tags'] || '');
          const tagsResolved = resolveTokens(rawTags, tokenCtx);
          const urlTags = state.urlTagsOverride
            ? tagsResolved   // override mode: skip single-param replace (full template wins)
            : transformUrlTags(tagsResolved, accId);

          // Resolve creative
          let imageHash, videoId;
          if (adInfo.forcedImageHash || adInfo.forcedVideoId) {
            // ads-mode: use creative from item directly (CSV Image Hash/Video ID ignored)
            imageHash = adInfo.forcedImageHash || '';
            videoId = adInfo.forcedVideoId || '';
          } else {
            // legacy mode: UI override (map/list/single) > CSV row
            const resolved = resolveCreative(adGlobalIdx, adName, r);
            imageHash = resolved.imageHash;
            videoId = resolved.videoId;
          }

          // Resolve copy text — priority: per-item (ads-mode JSON) > UI override > CSV row
          const itemTitle = plan.adsMode ? (plan.adsModeItems[i]?.title || null) : null;
          const itemBody  = plan.adsMode ? (plan.adsModeItems[i]?.body  || null) : null;
          const itemCta   = plan.adsMode ? (plan.adsModeItems[i]?.cta   || null) : null;
          const adTitle = itemTitle || state.titleOverride || r['Title'] || '';
          const adBody  = itemBody  || state.bodyOverride  || r['Body']  || '';
          const cta     = itemCta   || state.ctaOverride   || r['Call to Action'] || 'LEARN_MORE';

          const objectStorySpec = { page_id: pageId };
          if (videoId) {
            let thumbUrl = '';
            try {
              const vInfo = await apiFetch(`/${videoId}`, { params: { fields: 'picture,thumbnails{uri,is_preferred}' } });
              const prefThumb = vInfo?.thumbnails?.data?.find(t => t.is_preferred)?.uri;
              thumbUrl = prefThumb || vInfo?.thumbnails?.data?.[0]?.uri || vInfo?.picture || '';
            } catch {}
            objectStorySpec.video_data = {
              video_id: videoId,
              call_to_action: { type: cta, value: { link } },
            };
            if (adBody) objectStorySpec.video_data.message = adBody;
            if (adTitle) objectStorySpec.video_data.title = adTitle;
            if (thumbUrl) objectStorySpec.video_data.image_url = thumbUrl;
          } else if (imageHash) {
            objectStorySpec.link_data = {
              image_hash: imageHash,
              link,
              call_to_action: { type: cta, value: { link } },
            };
            if (adBody) objectStorySpec.link_data.message = adBody;
            if (adTitle) objectStorySpec.link_data.name = adTitle;
          } else {
            throw new Error('No Image Hash or Video ID — cannot create creative');
          }

          const creativeBody = { object_story_spec: JSON.stringify(objectStorySpec) };
          if (urlTags) creativeBody.url_tags = urlTags;

          const creative = await apiFetch(`/act_${accId}/adcreatives`, { method: 'POST', body: creativeBody });
          await apiFetch(`/act_${accId}/ads`, {
            method: 'POST',
            body: {
              name: adName,
              adset_id: adsetId,
              creative: JSON.stringify({ creative_id: creative.id }),
              status: state.createStatus,
            },
          });
          totalAdOk++;
          state.progress.done++;
          addLog('success', `[${accLabel}] ✓ ad ${i + 1}/${adsToCreate.length} "${adName}"`);
        } catch (e) {
          totalAdErr++;
          state.progress.done++;
          addLog('error', `[${accLabel}] ✗ ad "${adName}": ${e.message}`);
        }
        adGlobalIdx++;
        await sleep(RATE_AD_MS);
      }
    }

    state.running = false;
    const okMsg = totalAdErr
      ? `Done with errors: ${totalAdOk}/${plan.adCount} ads succeeded, ${totalAdErr} failed.`
      : `Done. ${totalAdOk}/${plan.adCount} ads created. All ${state.createStatus}.`;
    setStatus(totalAdErr ? 'warning' : 'success', okMsg);
    render();
  }

  // ─── UI PANEL ───────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('__fb_launcher_styles__')) return;
    const style = document.createElement('style');
    style.id = '__fb_launcher_styles__';
    style.textContent = `
      #${PANEL_ID} { position:fixed; top:0; right:0; width:420px; height:100vh;
        background:#0f172a; color:#e2e8f0; z-index:2147483646;
        border-left:1px solid #334155; box-shadow:-8px 0 24px rgba(0,0,0,.4);
        font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
        font-size:13px; overflow-y:auto; padding:14px 16px; box-sizing:border-box; }
      #${PANEL_ID} h2 { margin:0 0 4px 0; font-size:15px; font-weight:700; color:#fff;
        display:flex; align-items:center; justify-content:space-between; }
      #${PANEL_ID} .sub { color:#94a3b8; font-size:11px; margin-bottom:12px; }
      #${PANEL_ID} .field { margin-bottom:10px; }
      #${PANEL_ID} label { display:block; font-size:11px; color:#94a3b8; margin-bottom:3px; }
      #${PANEL_ID} input[type=text], #${PANEL_ID} input[type=file], #${PANEL_ID} select, #${PANEL_ID} textarea {
        width:100%; padding:6px 8px; background:#1e293b; border:1px solid #334155;
        border-radius:5px; color:#e2e8f0; font-size:12px; box-sizing:border-box;
        font-family:inherit; }
      #${PANEL_ID} input:focus, #${PANEL_ID} select:focus, #${PANEL_ID} textarea:focus { outline:1px solid #3b82f6; border-color:#3b82f6; }
      #${PANEL_ID} button { padding:7px 12px; border-radius:5px; border:1px solid #334155;
        background:#1e293b; color:#e2e8f0; font-size:12px; cursor:pointer; font-family:inherit; }
      #${PANEL_ID} button:hover { background:#334155; }
      #${PANEL_ID} button.primary { background:#3b82f6; border-color:#3b82f6; color:#fff; font-weight:600; }
      #${PANEL_ID} button.primary:hover { background:#2563eb; }
      #${PANEL_ID} button:disabled { opacity:.4; cursor:not-allowed; }
      #${PANEL_ID} .close { background:none; border:none; color:#64748b; font-size:20px; padding:0 4px; line-height:1; }
      #${PANEL_ID} .preview { background:rgba(0,0,0,.2); border:1px solid #334155;
        border-radius:6px; padding:8px 10px; font-size:11px; color:#cbd5e1; line-height:1.6;
        margin-bottom:10px; }
      #${PANEL_ID} .preview b { color:#fff; }
      #${PANEL_ID} .log { background:rgba(0,0,0,.3); border:1px solid #334155; border-radius:6px;
        padding:8px 10px; max-height:240px; overflow-y:auto; font-family:ui-monospace,monospace;
        font-size:11px; }
      #${PANEL_ID} .log div { white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
        margin-bottom:1px; }
      #${PANEL_ID} .log .ts { opacity:.5; margin-right:6px; }
      #${PANEL_ID} .progress { height:5px; border-radius:3px; background:#334155; overflow:hidden; margin:6px 0; }
      #${PANEL_ID} .progress > div { height:100%; background:#3b82f6; transition:width .3s; }
      #${PANEL_ID} .status { padding:8px 10px; border-radius:6px; font-size:12px; margin:8px 0;
        background:rgba(59,130,246,.1); border:1px solid rgba(59,130,246,.3); color:#dbeafe; }
      #${PANEL_ID} .status.success { background:rgba(34,197,94,.1); border-color:rgba(34,197,94,.3); color:#bbf7d0; }
      #${PANEL_ID} .status.error { background:rgba(239,68,68,.1); border-color:rgba(239,68,68,.3); color:#fecaca; }
      #${PANEL_ID} .status.warning { background:rgba(245,158,11,.1); border-color:rgba(245,158,11,.3); color:#fde68a; }
      #${PANEL_ID} .row { display:flex; gap:6px; }
      #${PANEL_ID} .row > * { flex:1; }
      #${PANEL_ID} hr { border:none; border-top:1px solid #334155; margin:14px 0; }
    `;
    document.head.appendChild(style);
  }

  let panel;
  function createPanel() {
    injectStyles();
    panel = document.createElement('div');
    panel.id = PANEL_ID;
    document.body.appendChild(panel);
  }

  function logHtml() {
    return state.log.slice(-100).map(l =>
      `<div style="color:${SC[l.type] || SC.info}"><span class="ts">${esc(l.ts)}</span>${esc(l.msg)}</div>`
    ).join('');
  }

  function render() {
    if (!panel) return;
    const plan = analyzePlan();
    const accFilter = state.accFilter.toLowerCase();
    const visibleAccs = accFilter
      ? ACCOUNTS.filter(a => a.name.toLowerCase().includes(accFilter) || a.id.includes(accFilter) || a.bm.toLowerCase().includes(accFilter))
      : ACCOUNTS;

    const accOptions = visibleAccs.length
      ? ['<option value="">— select account —</option>',
         ...visibleAccs.map(a => `<option value="${a.id}" ${state.targetAccId === a.id ? 'selected' : ''}>${esc(a.bm)} · ${esc(a.label)}</option>`)
        ].join('')
      : '<option value="">No accounts loaded</option>';

    // Effective pixel: override > CSV
    const effPixel = state.pixelOverride || plan?.pixel || '';
    const effEvent = state.customEventOverride || plan?.event || 'PURCHASE';
    const pixelValid = /^\d{8,20}$/.test(effPixel);
    const pixelInAccount = !state.pixelsList.length || !!state.pixelsList.find(p => p.id === effPixel);

    const previewHtml = plan ? `
      <div class="preview">
        <div><b>${plan.adsetCount}</b> adset${plan.adsetCount > 1 ? 's' : ''} ${plan.adsMode ? `× <b>${plan.adsModeItems.length}</b> creatives = <b>${plan.adCount}</b> ads` : `· <b>${plan.adCount}</b> ad${plan.adCount > 1 ? 's' : ''}`} · <b>${plan.isCBO ? 'CBO' : 'ABO'}</b> ${plan.isCBO ? `$${plan.cboBudget}/d` : `$${plan.aboTotal}/d total`}</div>
        <div>Objective: <b>${esc(plan.objective || '?')}</b> · Event: <b>${esc(effEvent)}</b></div>
        <div>Pixel: <b style="color:${pixelValid && pixelInAccount ? '#22c55e' : '#ef4444'}">${esc(effPixel || 'MISSING')}</b> ${state.pixelOverride ? '<span style="color:#6e7681">(override)</span>' : '<span style="color:#6e7681">(from CSV)</span>'} ${!pixelValid && effPixel ? '<span style="color:#ef4444">⚠ invalid format</span>' : ''} ${pixelValid && state.pixelsList.length && !pixelInAccount ? '<span style="color:#ef4444">⚠ not in this account</span>' : ''}</div>
        ${plan.adsMode ? `<div style="color:#22c55e">⚡ ads-mode: each adset gets ${plan.adsModeItems.length} new ads from creatives JSON (CSV Ad Name/Image Hash/Video ID ignored)</div>` : ''}
        ${plan.sacList.length ? `<div style="color:#fbbf24">SAC: <b>${esc(plan.sacList[0])}</b> (region-targeting disabled)</div>` : ''}
      </div>` : '';

    // Determine launch button state + label (tells user what's missing)
    let blockReason = '';
    if (state.running) blockReason = `Running ${state.progress.done}/${state.progress.total}...`;
    else if (!state.rows.length) blockReason = '⬆ Load CSV first (step 1)';
    else if (!state.targetAccId) blockReason = '⬆ Select target account (step 2)';
    else if (!state.pageIdOverride && !state.rows.some(r => r['Link Object ID'])) blockReason = '⬆ Set Page ID (step 3)';
    else if (!effPixel) blockReason = '⬆ Set Pixel (step 4)';
    else if (!pixelValid) blockReason = `⚠ Pixel "${effPixel}" invalid format (8-20 digits)`;
    else if (state.pixelsList.length && !pixelInAccount) blockReason = `⚠ Pixel ${effPixel} not in this account`;
    const runDisabled = !!blockReason;
    const buttonLabel = blockReason || `🚀 Launch ${plan?.adCount || 0} ads to ${esc(ACCOUNTS.find(a => a.id === state.targetAccId)?.name || 'account')}`;
    const progressPct = state.progress.total ? Math.round(state.progress.done / state.progress.total * 100) : 0;

    panel.innerHTML = `
      <h2>🚀 FB Launcher v0.2.4
        <button class="close" id="fbl-close" title="Close">×</button>
      </h2>
      <div class="sub">CSV/TSV → FB Marketing API. Bypasses bulk-upload bugs.</div>

      <div class="status ${state.status.type}">${esc(state.status.text)}</div>

      <div class="field" ${!state.rows.length ? 'style="background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.25);border-radius:6px;padding:8px 10px"' : ''}>
        <label>1. CSV file ${!state.rows.length ? '<span style="color:#ef4444">⚠ required — defines campaign, adsets, geo, budget</span>' : ''}</label>
        <input type="file" id="fbl-csv" accept=".csv,.tsv,.txt">
        ${state.fileName ? `<div style="font-size:11px;color:#22c55e;margin-top:4px">📄 ${esc(state.fileName)} · ${state.rows.length} rows parsed</div>` : ''}
      </div>

      ${previewHtml}

      <div class="field">
        <label>2. Target account</label>
        <div class="row">
          <input type="text" id="fbl-acc-filter" placeholder="Filter by name, ID, BM..." value="${esc(state.accFilter)}" style="flex:2">
          <button id="fbl-reload-acc" ${accountsLoading ? 'disabled' : ''}>${accountsLoading ? '⏳' : '↻'}</button>
        </div>
        <select id="fbl-acc-select" style="margin-top:5px">${accOptions}</select>
      </div>

      <div class="field">
        <label>3. Page ID override (req. if "Link Object ID" not in CSV)</label>
        <input type="text" id="fbl-page-id" value="${esc(state.pageIdOverride)}" placeholder="e.g. 102345678901234">
      </div>

      <div class="field">
        <label>4. Pixel &amp; Conversion event <span style="color:#6e7681">— ${state.pixelsLoading ? 'loading pixels...' : `${state.pixelsList.length} pixels in account`}</span></label>
        ${state.pixelsList.length ? `
        <select id="fbl-pixel-select" style="margin-bottom:5px">
          <option value="">— from CSV column —</option>
          ${state.pixelsList.map(p => `<option value="${esc(p.id)}" ${state.pixelOverride === p.id ? 'selected' : ''}>${esc(p.name)} (${esc(p.id)})</option>`).join('')}
        </select>` : ''}
        <input type="text" id="fbl-pixel-override" value="${esc(state.pixelOverride)}" placeholder="${state.pixelsList.length ? 'or paste custom pixel ID' : 'pixel ID (8-20 digits) — empty = use CSV'}" style="margin-bottom:5px">
        <select id="fbl-event-override">
          <option value="">— event from CSV (or PURCHASE default) —</option>
          <option value="PURCHASE" ${state.customEventOverride === 'PURCHASE' ? 'selected' : ''}>PURCHASE</option>
          <option value="LEAD" ${state.customEventOverride === 'LEAD' ? 'selected' : ''}>LEAD (most lead-gen)</option>
          <option value="COMPLETE_REGISTRATION" ${state.customEventOverride === 'COMPLETE_REGISTRATION' ? 'selected' : ''}>COMPLETE_REGISTRATION</option>
          <option value="SUBSCRIBE" ${state.customEventOverride === 'SUBSCRIBE' ? 'selected' : ''}>SUBSCRIBE</option>
          <option value="ADD_TO_CART" ${state.customEventOverride === 'ADD_TO_CART' ? 'selected' : ''}>ADD_TO_CART</option>
          <option value="INITIATE_CHECKOUT" ${state.customEventOverride === 'INITIATE_CHECKOUT' ? 'selected' : ''}>INITIATE_CHECKOUT</option>
          <option value="ADD_PAYMENT_INFO" ${state.customEventOverride === 'ADD_PAYMENT_INFO' ? 'selected' : ''}>ADD_PAYMENT_INFO</option>
          <option value="VIEW_CONTENT" ${state.customEventOverride === 'VIEW_CONTENT' ? 'selected' : ''}>VIEW_CONTENT</option>
          <option value="SEARCH" ${state.customEventOverride === 'SEARCH' ? 'selected' : ''}>SEARCH</option>
          <option value="CONTACT" ${state.customEventOverride === 'CONTACT' ? 'selected' : ''}>CONTACT</option>
        </select>
      </div>

      <div class="field">
        <label>5. Creatives override (optional) <span style="color:#6e7681">— hashes/video IDs; overrides CSV Image Hash &amp; Video ID columns</span></label>
        <textarea id="fbl-creatives" placeholder='Paste any of:

ADS-MODE (each item = new ad, replicated per adset, CSV ads ignored):
[{"name":"creative-1","imageHash":"abc123"},{"name":"video-1","videoId":"3934499366843210"}]

Override CSV per-ad creative (legacy, keeps CSV ad count):
JSON list:  ["abc123", "vid:567890"]
JSON map:   {"GMB-ROM-01": "abc123", "GMB-DACH": "vid:567890"}
Newline:    abc123\nvid:567890
Single:     abc123 (applied to all ads)' style="width:100%;min-height:90px;padding:6px 8px;background:#1e293b;border:1px solid #334155;border-radius:5px;color:#e2e8f0;font-size:11px;font-family:ui-monospace,monospace;box-sizing:border-box;resize:vertical">${esc(state.creativesInput)}</textarea>
        ${state.creativesError ? `<div style="color:#ef4444;font-size:11px;margin-top:4px">⚠ ${esc(state.creativesError)}</div>` : ''}
        ${state.creativesParsed ? `<div style="color:#22c55e;font-size:11px;margin-top:4px">✓ ${
          state.creativesParsed.mode === 'ads' ? `Ads-mode: ${state.creativesParsed.items.length} new ads per adset`
          : state.creativesParsed.mode === 'map' ? `Map: ${Object.keys(state.creativesParsed.map).length} entries (per ad name)`
          : state.creativesParsed.mode === 'list' ? `List: ${state.creativesParsed.list.length} items (per ad index)`
          : 'Single value (all ads same creative)'
        }</div>` : ''}
      </div>

      <div class="field">
        <label>6. Link override (optional) <span style="color:#6e7681">— tokens: {pixel_id} {account_id} {adset_name} {ad_name} {geo} {date}</span></label>
        <input type="text" id="fbl-link-override" value="${esc(state.linkOverride)}" placeholder="empty = use CSV Link column. e.g. https://t.com/click?p={pixel_id}&amp;geo={geo}">
      </div>

      <div class="field">
        <label>7. URL Tags override (optional) <span style="color:#6e7681">— same tokens; {{fb.macros}} preserved</span></label>
        <input type="text" id="fbl-tags-override" value="${esc(state.urlTagsOverride)}" placeholder="empty = use CSV URL Tags. e.g. keyword={pixel_id}&amp;sub2={account_id}&amp;sub5={{ad.name}}">
      </div>

      <div class="field">
        <label>8. Ad copy override (optional) <span style="color:#6e7681">— same for all ads; per-creative title/body/cta in ads-mode JSON wins</span></label>
        <input type="text" id="fbl-title-override" value="${esc(state.titleOverride)}" placeholder="Title (headline) — empty = use CSV Title" style="margin-bottom:5px">
        <textarea id="fbl-body-override" placeholder="Body (primary text) — empty = use CSV Body" style="width:100%;min-height:50px;padding:6px 8px;background:#1e293b;border:1px solid #334155;border-radius:5px;color:#e2e8f0;font-size:12px;font-family:inherit;box-sizing:border-box;resize:vertical;margin-bottom:5px">${esc(state.bodyOverride)}</textarea>
        <select id="fbl-cta-override">
          <option value="">— CTA from CSV (or LEARN_MORE if empty) —</option>
          <option value="LEARN_MORE" ${state.ctaOverride === 'LEARN_MORE' ? 'selected' : ''}>LEARN_MORE</option>
          <option value="GET_QUOTE" ${state.ctaOverride === 'GET_QUOTE' ? 'selected' : ''}>GET_QUOTE (insurance)</option>
          <option value="SIGN_UP" ${state.ctaOverride === 'SIGN_UP' ? 'selected' : ''}>SIGN_UP</option>
          <option value="APPLY_NOW" ${state.ctaOverride === 'APPLY_NOW' ? 'selected' : ''}>APPLY_NOW</option>
          <option value="SHOP_NOW" ${state.ctaOverride === 'SHOP_NOW' ? 'selected' : ''}>SHOP_NOW</option>
          <option value="GET_OFFER" ${state.ctaOverride === 'GET_OFFER' ? 'selected' : ''}>GET_OFFER</option>
          <option value="PLAY_GAME" ${state.ctaOverride === 'PLAY_GAME' ? 'selected' : ''}>PLAY_GAME (gambling)</option>
          <option value="SUBSCRIBE" ${state.ctaOverride === 'SUBSCRIBE' ? 'selected' : ''}>SUBSCRIBE</option>
          <option value="BUY_NOW" ${state.ctaOverride === 'BUY_NOW' ? 'selected' : ''}>BUY_NOW</option>
          <option value="DOWNLOAD" ${state.ctaOverride === 'DOWNLOAD' ? 'selected' : ''}>DOWNLOAD</option>
          <option value="INSTALL_NOW" ${state.ctaOverride === 'INSTALL_NOW' ? 'selected' : ''}>INSTALL_NOW</option>
          <option value="CONTACT_US" ${state.ctaOverride === 'CONTACT_US' ? 'selected' : ''}>CONTACT_US</option>
          <option value="MESSAGE_PAGE" ${state.ctaOverride === 'MESSAGE_PAGE' ? 'selected' : ''}>MESSAGE_PAGE</option>
          <option value="BOOK_TRAVEL" ${state.ctaOverride === 'BOOK_TRAVEL' ? 'selected' : ''}>BOOK_TRAVEL</option>
        </select>
      </div>

      <div class="field">
        <label>9. Quick: replace single URL Tag param <span style="color:#6e7681">— skipped if step 7 is set</span></label>
        <div class="row">
          <input type="text" id="fbl-tag-param" value="${esc(state.urlTagParam)}" placeholder="sub2" style="flex:1">
          <select id="fbl-tag-mode" style="flex:1.5">
            <option value="acc_id" ${state.urlTagMode === 'acc_id' ? 'selected' : ''}>= account ID</option>
            <option value="keep" ${state.urlTagMode === 'keep' ? 'selected' : ''}>keep as-is</option>
            <option value="empty" ${state.urlTagMode === 'empty' ? 'selected' : ''}>empty</option>
            <option value="custom" ${state.urlTagMode === 'custom' ? 'selected' : ''}>custom...</option>
          </select>
        </div>
        ${state.urlTagMode === 'custom' ? `<input type="text" id="fbl-tag-custom" value="${esc(state.urlTagCustom)}" placeholder="custom value" style="margin-top:5px">` : ''}
      </div>

      <div class="field">
        <label>10. Create status</label>
        <select id="fbl-status">
          <option value="PAUSED" ${state.createStatus === 'PAUSED' ? 'selected' : ''}>PAUSED (review before launch)</option>
          <option value="ACTIVE" ${state.createStatus === 'ACTIVE' ? 'selected' : ''}>ACTIVE (launch immediately)</option>
        </select>
      </div>

      <hr>

      <button class="primary" id="fbl-run" ${runDisabled ? 'disabled' : ''} style="width:100%">
        ${buttonLabel}
      </button>

      ${state.progress.total ? `<div class="progress"><div style="width:${progressPct}%"></div></div>` : ''}

      ${state.log.length ? `<div style="margin-top:12px"><div class="log">${logHtml()}</div></div>` : ''}
    `;

    bindEvents();
  }

  function bindEvents() {
    document.getElementById('fbl-close')?.addEventListener('click', () => {
      panel.remove();
      document.getElementById('__fb_launcher_styles__')?.remove();
    });
    document.getElementById('fbl-csv')?.addEventListener('change', e => {
      const f = e.target.files?.[0];
      if (f) onCsvFile(f);
    });
    document.getElementById('fbl-reload-acc')?.addEventListener('click', () => loadAccounts());
    document.getElementById('fbl-acc-filter')?.addEventListener('input', e => {
      state.accFilter = e.target.value;
      render();
    });
    document.getElementById('fbl-acc-select')?.addEventListener('change', e => {
      state.targetAccId = e.target.value;
      state.pixelsList = [];          // reset pixels on account change
      state.pixelOverride = '';
      render();
      if (state.targetAccId) loadPixelsForAccount(state.targetAccId);
    });
    document.getElementById('fbl-pixel-select')?.addEventListener('change', e => {
      state.pixelOverride = e.target.value;
      render();
    });
    document.getElementById('fbl-pixel-override')?.addEventListener('input', e => {
      state.pixelOverride = e.target.value.trim();
    });
    document.getElementById('fbl-event-override')?.addEventListener('change', e => {
      state.customEventOverride = e.target.value;
    });
    document.getElementById('fbl-page-id')?.addEventListener('input', e => {
      state.pageIdOverride = e.target.value.trim();
    });
    const creativesEl = document.getElementById('fbl-creatives');
    if (creativesEl) {
      creativesEl.addEventListener('input', e => {
        state.creativesInput = e.target.value;
        state.creativesParsed = parseCreatives(state.creativesInput);
        // Don't re-render on each keystroke — would lose focus on textarea
      });
      creativesEl.addEventListener('blur', () => render());
    }
    document.getElementById('fbl-link-override')?.addEventListener('input', e => {
      state.linkOverride = e.target.value.trim();
    });
    document.getElementById('fbl-tags-override')?.addEventListener('input', e => {
      state.urlTagsOverride = e.target.value.trim();
    });
    document.getElementById('fbl-title-override')?.addEventListener('input', e => {
      state.titleOverride = e.target.value;
    });
    document.getElementById('fbl-body-override')?.addEventListener('input', e => {
      state.bodyOverride = e.target.value;
    });
    document.getElementById('fbl-cta-override')?.addEventListener('change', e => {
      state.ctaOverride = e.target.value;
    });
    document.getElementById('fbl-tag-param')?.addEventListener('input', e => {
      state.urlTagParam = e.target.value.trim();
    });
    document.getElementById('fbl-tag-mode')?.addEventListener('change', e => {
      state.urlTagMode = e.target.value;
      render();
    });
    document.getElementById('fbl-tag-custom')?.addEventListener('input', e => {
      state.urlTagCustom = e.target.value;
    });
    document.getElementById('fbl-status')?.addEventListener('change', e => {
      state.createStatus = e.target.value;
    });
    document.getElementById('fbl-run')?.addEventListener('click', () => runLaunch());
  }

  // ─── INIT ───────────────────────────────────────────────────────────────
  createPanel();
  render();

  TOKEN = await getToken();
  if (!TOKEN) {
    setStatus('error', 'Could not retrieve FB session token. Are you logged in to business.facebook.com?');
    return;
  }
  setStatus('info', 'Token loaded. Click ↻ to load ad accounts.');
  loadAccounts();
})();
