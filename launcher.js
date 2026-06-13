/* ===========================================================================
 * FB Launcher v0.7.0 — Bookmarklet
 *
 * Launches FB Ads Manager campaigns from CSV through Marketing API (no bulk-upload).
 * Supports: multi-adset (1×M×N), CBO/ABO budget, Special Ad Categories (Financial, etc.),
 * tab+comma CSV auto-detect, video+image ads, US state region targeting.
 * v0.2: Link override, URL Tags override, token engine, pixel placeholder substitution.
 * v0.7.0: name markers (CTRL/etc. → campaign+adset+ad names, autorule opt-in root-fix),
 *         in-tool targeting overrides (geo/states/age/gender/placements, override CSV),
 *         budget & bidding overrides (CBO/ABO mode, budget amount, bid strategy + cap),
 *         wider panel (920px) + responsive 2-3-col grid layout.
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

  // v0.7.0: name-marker chip presets. FB-safe codenames only (no gambling keywords — see
  // feedback_fb_gambling_keywords). CTRL = autorule opt-in marker (cascade filters name CONTAIN "CTRL").
  const MARKER_PRESETS = ['CTRL', 'PWA-A', 'PWA-B', 'EU12', 'IB', 'CSC'];

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
    targetAccIds: [],         // v0.6: array of selected account IDs (1+ for multi-account launch)
    pageIdOverride: '',
    instagramOverride: '',    // v0.6.1: forces instagram_user_id (skips CSV "Instagram Account ID")
    usePageAsActor: false,    // v0.6.12: explicit "use Facebook Page as IG identity" — skips IG resolution + CSV/override IG entirely; sets identity to page in Ads Manager UI
    linkOverride: '',         // v0.2: replaces CSV Link column (with token substitution)
    urlTagsOverride: '',      // v0.2: replaces CSV URL Tags column (with token substitution)
    titleOverride: '',        // v0.2.2: replaces CSV Title (headline) for all ads
    bodyOverride: '',         // v0.2.2: replaces CSV Body (primary text) for all ads
    ctaOverride: '',          // v0.2.2: replaces CSV Call to Action for all ads (e.g. GET_QUOTE)
    pixelOverride: '',        // v0.2.3: forces pixel_id (skips CSV "Pixel"/"Optimized Conversion Tracking Pixels")
    customEventOverride: '',  // v0.2.3: forces custom_event_type (PURCHASE/LEAD/etc)
    pixelsList: [],           // v0.2.3: legacy — kept for backward refs; in v0.6 we read from pixelsByAccount per account
    pixelsLoading: false,
    pagesList: [],            // v0.2.5: legacy — kept for backward refs; in v0.6 we read from pagesByAccount per account
    pagesLoading: false,
    pixelsByAccount: {},      // v0.6: { accId: [{id,name}] } — pixels fetched per selected account
    pagesByAccount: {},       // v0.6: { accId: [{id,name}] } — pages fetched per selected account
    accountsLoadingMap: {},   // v0.6: { accId: true } while pixel/page lookup is in flight
    showAccountPicker: false, // v0.6: expanded state of multi-account picker dropdown
    pageIgMap: {},            // v0.6.2: { pageId: { igId, igName, pageName } } — auto-detected IG per page
    pageIgLoading: {},        // v0.6.2: { pageId: true } while IG lookup is in flight
    dsaBeneficiary: '',       // v0.2.6: EU DSA — name of person/org being advertised
    dsaPayer: '',             // v0.2.6: EU DSA — name of who pays (optional, defaults to beneficiary)
    campNamePrefix: '',       // v0.3: user's prefix; launcher appends "| CBO $X/d | Nads | MMDDYY | acc_id"
    uploads: [],              // v0.3: [{name, type:'image'|'video', status:'pending'|'uploading'|'done'|'error', hash?, videoId?, error?}]
    uploading: false,         // v0.3: true while batch upload in progress
    presets: [],              // v0.4: [{id, name, createdAt, csvText, fileName, settings:{...}}]
    selectedPresetId: '',     // v0.4: currently loaded preset
    autoSavePreset: false,    // v0.5: when true, success launch creates a timestamped preset
    adsetAssignments: {},     // v0.4: { adsetName: [creativeIndex, ...] } — empty = all creatives go to all adsets
    showAssignments: false,   // v0.4: collapse state for per-adset assignment UI
    matrixPaintValue: null,   // v0.5.3: paint-drag value (true=set, false=unset) while mouse button held over cells
    creativesInput: '',       // v0.2: raw user input (textarea)
    creativesParsed: null,    // v0.2: { mode: 'list'|'map'|'single', list?, map?, value? }
    creativesError: '',
    urlTagParam: 'sub2',      // legacy: single-param replacement in URL Tags
    urlTagMode: 'acc_id',
    urlTagCustom: '',
    createStatus: 'PAUSED',
    campNameTpl: '',
    adsetNameTpl: '',
    // v0.7.0: name markers — appended as " | <marker>" to campaign/adset/ad names at creation.
    // Root-fix for autorule opt-in (e.g. CTRL): cascade rules filter on name CONTAIN "CTRL".
    // Markers touch ONLY FB entity names — token context (ad_name/adset_name → URL Tags/tracker)
    // stays clean so markers never pollute sub_id reporting.
    markers: [],              // v0.7.0: active marker strings, e.g. ['CTRL','PWA-A']
    markersFreeform: '',      // v0.7.0: raw free-form input "X | Y" (parsed into markers on input)
    // v0.7.0: in-tool targeting — when set, override the matching CSV column for ALL adsets.
    // Empty = fall back to CSV (same pattern as pixelOverride). SAC still disables region targeting.
    geoCountriesOverride: '', // v0.7.0: comma list of country codes (e.g. "US,CA"); empty = CSV
    geoStatesOverride: '',    // v0.7.0: comma list of US state names; resolved via resolveRegions; empty = CSV
    ageMinOverride: '',       // v0.7.0: empty = CSV (default 18)
    ageMaxOverride: '',       // v0.7.0: empty = CSV (default 65)
    genderOverride: '',       // v0.7.0: '' = CSV | 'all' | 'men' | 'women'
    advantageAudienceOverride: '', // v0.7.0: '' = CSV | '0' (off) | '1' (on)
    placementPreset: '',      // v0.7.0: '' = CSV | all | fb_ig | fb_only | feeds_only | reels_only
    // v0.7.0: budget & bidding — override CSV. budgetModeOverride drives CBO vs ABO structure.
    budgetModeOverride: '',   // '' = CSV auto-detect | 'cbo' (campaign budget) | 'abo' (adset budget)
    cboBudgetOverride: '',    // campaign daily budget $ (when mode=cbo)
    adsetBudgetOverride: '',  // per-adset daily budget $ (when mode=abo) — applied to every adset
    bidStrategyOverride: '',  // '' = CSV | LOWEST_COST_WITHOUT_CAP | COST_CAP | LOWEST_COST_WITH_BID_CAP
    bidAmountOverride: '',    // bid/cost cap $ (only used when strategy is COST_CAP or BID_CAP)
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

  // v0.5.2: locale-aware numeric parse — handles EU "520,99" / "1.234,56" alongside US "520.99" / "1,234.56".
  // Power Editor exports use the OS locale of whoever clicked Export, so a single launcher
  // sees both flavors. JS `+"520,99"` returns NaN and we silently treated it as 0 → budgets dropped.
  function parseNum(v) {
    if (v == null) return NaN;
    let s = String(v).trim();
    if (!s) return NaN;
    // Strip currency symbols / whitespace / non-numeric prefixes that may leak from the source
    s = s.replace(/[^\d.,\-]/g, '');
    if (!s) return NaN;
    const lastDot = s.lastIndexOf('.');
    const lastComma = s.lastIndexOf(',');
    if (lastDot >= 0 && lastComma >= 0) {
      // Both present → rightmost is decimal separator, the other is thousands.
      if (lastComma > lastDot) return +s.replace(/\./g, '').replace(',', '.');
      return +s.replace(/,/g, '');
    }
    if (lastComma >= 0) {
      // Only comma. If exactly 3 digits follow it (e.g. "1,234") treat as US thousands;
      // otherwise it's an EU decimal ("520,99" / "5,5").
      const after = s.length - lastComma - 1;
      if (after === 3 && !/^,/.test(s)) return +s.replace(/,/g, '');
      return +s.replace(',', '.');
    }
    return +s;
  }
  const SC = { info:'#3b82f6', success:'#22c55e', error:'#ef4444', warning:'#f59e0b' };

  function setStatus(type, text) { state.status = { type, text }; render(); }
  function addLog(type, msg) {
    state.log.push({ type, msg, ts: new Date().toLocaleTimeString() });
    render();
  }

  // Render expandable error details for failed upload items
  function renderErrorPanel(u) {
    const d = u.errorDetails || {};
    const fb = d.fbError || {};
    const lines = [];
    lines.push(`<b style="color:#fbbf24">${esc(u.error || 'Error')}</b>`);
    if (d.stage)        lines.push(`<span style="color:#94a3b8">stage:</span> ${esc(d.stage)}`);
    if (d.url)          lines.push(`<span style="color:#94a3b8">url:</span> ${esc(d.url)}`);
    if (d.httpStatus)   lines.push(`<span style="color:#94a3b8">http:</span> ${d.httpStatus}`);
    if (fb.code != null) lines.push(`<span style="color:#94a3b8">fb code:</span> ${fb.code}${fb.subcode ? '/' + fb.subcode : ''}`);
    if (fb.type)        lines.push(`<span style="color:#94a3b8">fb type:</span> ${esc(fb.type)}`);
    if (fb.message)     lines.push(`<span style="color:#94a3b8">fb msg:</span> ${esc(fb.message)}`);
    if (fb.user_title)  lines.push(`<span style="color:#94a3b8">user title:</span> ${esc(fb.user_title)}`);
    if (fb.user_msg)    lines.push(`<span style="color:#94a3b8">user msg:</span> ${esc(fb.user_msg)}`);
    if (fb.fbtrace_id)  lines.push(`<span style="color:#94a3b8">fbtrace_id:</span> ${esc(fb.fbtrace_id)}`);
    if (d.netError)     lines.push(`<span style="color:#94a3b8">net err:</span> ${esc(d.netError)}`);
    if (d.rawResponse)  lines.push(`<div style="color:#64748b;font-size:10px;margin-top:6px;padding-top:6px;border-top:1px solid #1e293b">raw response:\n${esc(d.rawResponse)}</div>`);
    return lines.join('\n');
  }

  // ─── FB API CLIENT ──────────────────────────────────────────────────────
  // Build a rich error message from FB's error object — used in logs everywhere
  function fbErrorMsg(err, httpStatus) {
    if (!err) return `API error (${httpStatus || '?'})`;
    const codePart = err.code != null
      ? `[${err.code}${err.error_subcode ? '/' + err.error_subcode : ''}] `
      : '';
    const msg = err.error_user_msg || err.message || 'Unknown error';
    const trace = err.fbtrace_id ? ` · trace=${err.fbtrace_id}` : '';
    return `${codePart}${msg}${trace}`;
  }

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
        const fbErr = json?.error;
        const code = fbErr?.code;
        // 4: rate limit, 17: user request limit, 32: page rate, 80004: too many calls
        if ([4, 17, 32, 80004].includes(code) && attempt < MAX_RETRIES) {
          const wait = BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
          await sleep(wait);
          continue;
        }
        // Build rich error — attaches FB details so caller can show them in log
        const richMsg = fbErrorMsg(fbErr, res.status);
        const err = new Error(richMsg);
        err.fbError = fbErr || null;
        err.httpStatus = res.status;
        err.path = path;
        throw err;
      } catch (e) {
        lastErr = e;
        // Don't retry if it's a structured FB error (not transient network issue)
        if (e.fbError || attempt >= MAX_RETRIES) break;
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

  // ─── PRESETS (localStorage) ─────────────────────────────────────────────
  const PRESETS_KEY = 'fbl_presets_v1';

  function loadPresets() {
    try {
      const raw = localStorage.getItem(PRESETS_KEY);
      if (raw) state.presets = JSON.parse(raw) || [];
    } catch (e) {
      addLog('warning', `Could not load presets: ${e.message}`);
      state.presets = [];
    }
  }

  function savePresetsToStorage() {
    try {
      localStorage.setItem(PRESETS_KEY, JSON.stringify(state.presets));
    } catch (e) {
      addLog('error', `Could not save presets: ${e.message}`);
    }
  }

  // v0.7.0: single source of truth for what a preset persists (shared by manual + auto save).
  // Excludes creatives (need fresh hashes) and target accounts (chosen per session) by design.
  function collectSettings() {
    return {
      campNamePrefix: state.campNamePrefix,
      linkOverride: state.linkOverride,
      urlTagsOverride: state.urlTagsOverride,
      titleOverride: state.titleOverride,
      bodyOverride: state.bodyOverride,
      ctaOverride: state.ctaOverride,
      pixelOverride: state.pixelOverride,
      customEventOverride: state.customEventOverride,
      pageIdOverride: state.pageIdOverride,
      instagramOverride: state.instagramOverride,
      usePageAsActor: state.usePageAsActor,
      dsaBeneficiary: state.dsaBeneficiary,
      dsaPayer: state.dsaPayer,
      urlTagParam: state.urlTagParam,
      urlTagMode: state.urlTagMode,
      urlTagCustom: state.urlTagCustom,
      adsetAssignments: state.adsetAssignments,
      // v0.7.0
      markers: state.markers,
      markersFreeform: state.markersFreeform,
      geoCountriesOverride: state.geoCountriesOverride,
      geoStatesOverride: state.geoStatesOverride,
      ageMinOverride: state.ageMinOverride,
      ageMaxOverride: state.ageMaxOverride,
      genderOverride: state.genderOverride,
      advantageAudienceOverride: state.advantageAudienceOverride,
      placementPreset: state.placementPreset,
      budgetModeOverride: state.budgetModeOverride,
      cboBudgetOverride: state.cboBudgetOverride,
      adsetBudgetOverride: state.adsetBudgetOverride,
      bidStrategyOverride: state.bidStrategyOverride,
      bidAmountOverride: state.bidAmountOverride,
    };
  }

  function savePreset() {
    if (!state.rows.length) { setStatus('error', 'Load CSV first before saving preset.'); return; }
    const defaultName = state.campNamePrefix || state.fileName.replace(/\.[^.]+$/, '') || 'Preset';
    const name = prompt('Preset name:', defaultName);
    if (!name) return;
    const preset = {
      id: 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      name: name.trim(),
      createdAt: new Date().toISOString(),
      fileName: state.fileName,
      csvText: state.rows.length ? JSON.stringify(state.rows) : '',  // pre-parsed rows
      settings: collectSettings(),
    };
    state.presets.unshift(preset);  // newest first
    state.selectedPresetId = preset.id;
    savePresetsToStorage();
    setStatus('success', `Preset "${name}" saved.`);
    render();
  }

  function loadPreset(presetId) {
    const preset = state.presets.find(p => p.id === presetId);
    if (!preset) return;
    try {
      const rows = preset.csvText ? JSON.parse(preset.csvText) : [];
      state.rows = rows;
      state.fileName = preset.fileName || '(from preset)';
    } catch {
      state.rows = [];
    }
    const s = preset.settings || {};
    state.campNamePrefix = s.campNamePrefix || '';
    state.linkOverride = s.linkOverride || '';
    state.urlTagsOverride = s.urlTagsOverride || '';
    state.titleOverride = s.titleOverride || '';
    state.bodyOverride = s.bodyOverride || '';
    state.ctaOverride = s.ctaOverride || '';
    state.pixelOverride = s.pixelOverride || '';
    state.customEventOverride = s.customEventOverride || '';
    state.pageIdOverride = s.pageIdOverride || '';
    state.instagramOverride = s.instagramOverride || '';
    state.usePageAsActor = !!s.usePageAsActor;
    state.dsaBeneficiary = s.dsaBeneficiary || '';
    state.dsaPayer = s.dsaPayer || '';
    state.urlTagParam = s.urlTagParam || 'sub2';
    state.urlTagMode = s.urlTagMode || 'acc_id';
    state.urlTagCustom = s.urlTagCustom || '';
    state.adsetAssignments = s.adsetAssignments || {};
    // v0.7.0
    state.markers = Array.isArray(s.markers) ? s.markers : [];
    state.markersFreeform = s.markersFreeform || '';
    state.geoCountriesOverride = s.geoCountriesOverride || '';
    state.geoStatesOverride = s.geoStatesOverride || '';
    state.ageMinOverride = s.ageMinOverride || '';
    state.ageMaxOverride = s.ageMaxOverride || '';
    state.genderOverride = s.genderOverride || '';
    state.advantageAudienceOverride = s.advantageAudienceOverride || '';
    state.placementPreset = s.placementPreset || '';
    state.budgetModeOverride = s.budgetModeOverride || '';
    state.cboBudgetOverride = s.cboBudgetOverride || '';
    state.adsetBudgetOverride = s.adsetBudgetOverride || '';
    state.bidStrategyOverride = s.bidStrategyOverride || '';
    state.bidAmountOverride = s.bidAmountOverride || '';
    state.selectedPresetId = presetId;
    // Reset creatives — must be fresh per launch
    state.creativesInput = '';
    state.creativesParsed = null;
    state.uploads = [];
    setStatus('success', `Loaded preset "${preset.name}". Upload fresh creatives and launch.`);
    render();
  }

  // v0.5.3: shared assignment mutator used by checkbox click, paint-drag, shift-click bulk,
  // and the Clear/Fill buttons. `checked=true` adds the creative idx, `false` removes it.
  // Maintains the "empty array = all selected" invariant of state.adsetAssignments.
  function setAssignment(adsetName, idx, checked, totalCreatives) {
    let arr = state.adsetAssignments[adsetName];
    if (!arr) {
      // First customization for this adset: start from the implicit "all" state.
      arr = [];
      for (let i = 0; i < totalCreatives; i++) arr.push(i);
      state.adsetAssignments[adsetName] = arr;
    }
    const pos = arr.indexOf(idx);
    if (checked && pos === -1) arr.push(idx);
    else if (!checked && pos !== -1) arr.splice(pos, 1);
    // Renormalize: if all checked again, drop the per-adset entry (back to default).
    if (arr.length === totalCreatives) delete state.adsetAssignments[adsetName];
  }

  function deletePreset() {
    if (!state.selectedPresetId) return;
    const preset = state.presets.find(p => p.id === state.selectedPresetId);
    if (!preset) return;
    if (!confirm(`Delete preset "${preset.name}"?`)) return;
    state.presets = state.presets.filter(p => p.id !== state.selectedPresetId);
    state.selectedPresetId = '';
    savePresetsToStorage();
    setStatus('info', `Preset "${preset.name}" deleted.`);
    render();
  }

  // v0.5: auto-save current state as preset after a successful launch.
  // Name: "<prefix or fileName> | DD MMM HH:MM". Silent (no prompt, no render).
  function autoSavePresetSilent() {
    if (!state.rows.length) return;
    const base = (state.campNamePrefix || state.fileName.replace(/\.[^.]+$/, '') || 'Launch').trim();
    const d = new Date();
    const mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()];
    const stamp = `${String(d.getDate()).padStart(2,'0')} ${mon} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    const name = `${base} | ${stamp}`;
    const preset = {
      id: 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      name,
      createdAt: d.toISOString(),
      fileName: state.fileName,
      csvText: JSON.stringify(state.rows),
      auto: true,
      settings: collectSettings(),
    };
    state.presets.unshift(preset);
    savePresetsToStorage();
    addLog('info', `💾 Auto-saved preset "${name}"`);
  }

  // v0.5: export all presets to a JSON file the user can stash/share.
  function exportPresets() {
    if (!state.presets.length) { setStatus('warning', 'No presets to export.'); return; }
    const payload = {
      kind: 'fb-launcher-presets',
      version: 1,
      exportedAt: new Date().toISOString(),
      count: state.presets.length,
      presets: state.presets,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}_${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}`;
    a.href = url;
    a.download = `fb-launcher-presets_${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setStatus('success', `Exported ${state.presets.length} preset(s).`);
  }

  // v0.5: import presets from JSON. Merges by id; duplicates → renamed "(imported)".
  function importPresets(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = JSON.parse(e.target.result);
        const incoming = Array.isArray(data) ? data : (data && Array.isArray(data.presets) ? data.presets : null);
        if (!incoming) throw new Error('JSON must be { presets: [...] } or [ ... ]');
        const existingIds = new Set(state.presets.map(p => p.id));
        const existingNames = new Set(state.presets.map(p => p.name));
        let added = 0, skipped = 0, renamed = 0;
        for (const p of incoming) {
          if (!p || !p.id || !p.name || !p.settings) { skipped++; continue; }
          if (existingIds.has(p.id)) { skipped++; continue; }
          const clone = { ...p };
          if (existingNames.has(clone.name)) { clone.name = `${clone.name} (imported)`; renamed++; }
          state.presets.unshift(clone);
          existingIds.add(clone.id);
          existingNames.add(clone.name);
          added++;
        }
        savePresetsToStorage();
        const parts = [`+${added} added`];
        if (renamed) parts.push(`${renamed} renamed`);
        if (skipped) parts.push(`${skipped} skipped`);
        setStatus(added ? 'success' : 'warning', `Import done: ${parts.join(', ')}.`);
        render();
      } catch (err) {
        setStatus('error', `Import failed: ${err.message}`);
      }
    };
    reader.onerror = () => setStatus('error', 'Could not read file.');
    reader.readAsText(file);
  }

  // ─── MULTI-ACCOUNT HELPERS (v0.6) ───────────────────────────────────────
  // Toggle an account in/out of the selected set; loads its pixels+pages on add.
  function toggleAccount(accId) {
    if (!accId) return;
    const i = state.targetAccIds.indexOf(accId);
    if (i >= 0) {
      state.targetAccIds.splice(i, 1);
      // If we removed the primary, mirror the next one (or clear).
      const newPrimary = state.targetAccIds[0];
      if (newPrimary) {
        state.pixelsList = state.pixelsByAccount[newPrimary] || [];
        state.pagesList = state.pagesByAccount[newPrimary] || [];
      } else {
        state.pixelsList = [];
        state.pagesList = [];
      }
    } else {
      state.targetAccIds.push(accId);
      // Auto-load pixels+pages for the newly selected account.
      loadPixelsForAccount(accId);
      loadPagesForAccount(accId);
    }
    render();
  }

  // Resolve user-supplied pixel reference for a specific account.
  // Accepts: numeric ID (used as-is if it lives in this account), or a name
  // / partial name (matched case-insensitively against pixelsByAccount[accId]).
  function resolvePixelForAccount(accId, ref) {
    const list = state.pixelsByAccount[accId] || [];
    if (!ref) return '';
    const s = String(ref).trim();
    if (!s) return '';
    if (/^\d{8,20}$/.test(s)) {
      // Numeric ID — confirm membership only if we have the list; otherwise pass through.
      if (!list.length) return s;
      return list.find(p => p.id === s) ? s : '';
    }
    // Treat as name pattern.
    const needle = s.toLowerCase();
    const exact = list.find(p => (p.name || '').toLowerCase() === needle);
    if (exact) return exact.id;
    const partial = list.find(p => (p.name || '').toLowerCase().includes(needle));
    return partial ? partial.id : '';
  }

  function resolvePageForAccount(accId, ref) {
    const list = state.pagesByAccount[accId] || [];
    if (!ref) return '';
    const s = String(ref).trim();
    if (!s) return '';
    if (/^\d{10,20}$/.test(s)) {
      if (!list.length) return s;
      return list.find(p => p.id === s) ? s : '';
    }
    const needle = s.toLowerCase();
    const exact = list.find(p => (p.name || '').toLowerCase() === needle);
    if (exact) return exact.id;
    const partial = list.find(p => (p.name || '').toLowerCase().includes(needle));
    return partial ? partial.id : '';
  }

  // ─── PIXEL LOADER (v0.6: per-account, cached) ───────────────────────────
  // Caches into state.pixelsByAccount[accId]; also mirrors the primary account
  // into legacy state.pixelsList for code that still reads it.
  async function loadPixelsForAccount(accId) {
    if (!accId) return;
    if (state.pixelsByAccount[accId]) {
      state.pixelsList = state.pixelsByAccount[accId];
      render();
      return;
    }
    state.pixelsLoading = true;
    render();
    try {
      const items = await apiAll(`/act_${accId}/adspixels`, { fields: 'id,name', limit: 100 });
      const list = items.map(p => ({ id: String(p.id), name: p.name || 'Untitled' }));
      state.pixelsByAccount[accId] = list;
      // Mirror to legacy single-account list when this is the primary account.
      if (state.targetAccIds[0] === accId) state.pixelsList = list;
      addLog('info', `Pixels for ${accId}: ${list.length} found`);
    } catch (e) {
      addLog('warning', `Pixel fetch failed (${accId}): ${e.message}`);
      state.pixelsByAccount[accId] = [];
    } finally {
      state.pixelsLoading = false;
      render();
    }
  }

  // ─── CREATIVE UPLOADER (two-phase: upload → poll until ready) ───────────
  class CUError extends Error {
    constructor(message, details) {
      super(message);
      this.name = 'CUError';
      this.details = details || {};
    }
  }

  async function postForm(path, formData) {
    formData.append('access_token', TOKEN);
    const url = `${HOST_GRAPH}/${path}`;
    let res, raw, json;
    try {
      res = await fetch(url, {
        method: 'POST',
        body: formData,
        credentials: 'include',
        mode: 'cors',
        referrer: 'https://business.facebook.com/',
        referrerPolicy: 'origin-when-cross-origin',
      });
      raw = await res.text();
    } catch (netErr) {
      throw new CUError('Network failure: ' + netErr.message, { stage: 'post', url: path, netError: netErr.message });
    }
    try { json = JSON.parse(raw); } catch {
      throw new CUError(`HTTP ${res.status}: invalid JSON`, { stage: 'post', url: path, httpStatus: res.status, rawResponse: raw.slice(0, 2000) });
    }
    if (json?.error) {
      const e = json.error;
      throw new CUError(`[${e.code}${e.error_subcode ? '/' + e.error_subcode : ''}] ${e.message}`, {
        stage: 'post', url: path, httpStatus: res.status,
        fbError: { code: e.code, subcode: e.error_subcode, type: e.type, message: e.message, fbtrace_id: e.fbtrace_id, user_title: e.error_user_title, user_msg: e.error_user_msg },
        rawResponse: raw.slice(0, 2000),
      });
    }
    return json;
  }

  async function uploadImage(accId, file) {
    const fd = new FormData();
    fd.append('filename', file, file.name);
    const result = await postForm(`act_${accId}/adimages`, fd);
    const key = Object.keys(result.images || {})[0];
    const hash = result.images?.[key]?.hash;
    if (!hash) throw new CUError('No hash in response', { stage: 'post', rawResponse: JSON.stringify(result).slice(0, 2000) });
    return hash;
  }

  async function uploadVideo(accId, file) {
    const fd = new FormData();
    fd.append('source', file, file.name);
    const result = await postForm(`act_${accId}/advideos`, fd);
    if (!result?.id) throw new CUError('No video id in response', { stage: 'post', rawResponse: JSON.stringify(result).slice(0, 2000) });
    return String(result.id);
  }

  // Poll /videoId until video_status === 'ready'. FB needs ~10-60s to process.
  async function waitForVideoReady(videoId, onTick) {
    const MAX_ATTEMPTS = 80;   // ~6.5 min @ 5s
    const INTERVAL_MS = 5000;
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      let data;
      try {
        data = await apiFetch(videoId, { params: { fields: 'status' } });
      } catch (e) {
        // Transient API error during polling — retry next tick
        if (onTick) onTick('polling-error', i);
        await sleep(INTERVAL_MS);
        continue;
      }
      const vs = data?.status?.video_status || 'unknown';
      if (onTick) onTick(vs, i);
      if (vs === 'ready') return;
      if (vs === 'error') {
        throw new CUError('FB rejected video (processing error)', {
          stage: 'process', videoId, rawResponse: JSON.stringify(data).slice(0, 2000),
        });
      }
      await sleep(INTERVAL_MS);
    }
    throw new CUError('Video processing timeout (>6 min)', { stage: 'process', videoId });
  }

  // v0.6: each upload entry holds per-account results so the launch loop can
  // pick the right hash / videoId for whichever account it's working on.
  // u.perAccount[accId] = { status, hash?, videoId?, error?, errorDetails?, processingStatus? }
  async function runUploads(files) {
    const accIds = state.targetAccIds.slice();
    if (!accIds.length) { setStatus('error', 'Select at least one target account first.'); return; }
    if (!files.length) return;
    state.uploading = true;
    state.uploads = Array.from(files).map(f => ({
      name: f.name,
      size: f.size,
      type: (f.type.startsWith('video/') || /\.(mp4|mov|avi|webm|mkv|m4v)$/i.test(f.name)) ? 'video' : 'image',
      perAccount: Object.fromEntries(accIds.map(a => [a, { status: 'pending' }])),
      // Aggregated status for the legacy UI row — done if all done, error if any fails, etc.
      status: 'pending',
      processingStatus: '',
      error: '',
      errorDetails: null,
      expanded: false,
    }));
    render();

    // Pick the BASELINE account whose upload result goes into the creatives JSON.
    // For single-account launches this is just that one. For multi-account this is
    // the first one — the launch loop uses u.perAccount[accId] per iteration anyway.
    const primaryAcc = accIds[0];
    const primaryResults = [];

    for (let i = 0; i < files.length; i++) {
      const u = state.uploads[i];
      const baseName = files[i].name.replace(/\.[^.]+$/, '');
      let anyOk = false;
      let anyErr = false;

      for (const accId of accIds) {
        const pa = u.perAccount[accId];
        pa.status = 'uploading';
        u.status = accIds.length > 1 ? `uploading (${accId})` : 'uploading';
        render();
        try {
          if (u.type === 'video') {
            const vidId = await uploadVideo(accId, files[i]);
            pa.videoId = vidId;
            pa.status = 'processing';
            pa.processingStatus = 'processing';
            u.processingStatus = `processing (${accId})`;
            render();
            await waitForVideoReady(vidId, (vs) => {
              pa.processingStatus = vs;
              u.processingStatus = accIds.length > 1 ? `${vs} (${accId})` : vs;
              render();
            });
            pa.status = 'done';
            addLog('success', `↑ video "${baseName}" → ${accId} :: ${vidId}`);
            if (accId === primaryAcc) {
              u.videoId = vidId;  // legacy mirror
              primaryResults.push({ name: baseName, videoId: vidId });
            }
          } else {
            const hash = await uploadImage(accId, files[i]);
            pa.hash = hash;
            pa.status = 'done';
            addLog('success', `↑ image "${baseName}" → ${accId} :: ${hash.slice(0, 16)}…`);
            if (accId === primaryAcc) {
              u.imageHash = hash;  // legacy mirror
              primaryResults.push({ name: baseName, imageHash: hash });
            }
          }
          anyOk = true;
        } catch (e) {
          pa.status = 'error';
          pa.error = e.message;
          pa.errorDetails = (e instanceof CUError) ? e.details : { message: e.message };
          if (accId === primaryAcc) {
            u.error = e.message;
            u.errorDetails = pa.errorDetails;
          }
          addLog('error', `↑ FAIL "${files[i].name}" → ${accId}: ${e.message}`);
          anyErr = true;
        }
        await sleep(200);
      }
      // Aggregate row status: prefer most informative state.
      u.status = anyErr && !anyOk ? 'error' : anyErr ? 'partial' : 'done';
      render();
    }

    // Auto-pair videos + images with same base name (uses primary account's results — the
    // launch loop maps thumbnail by base name on each account from perAccount).
    let pairedCount = 0;
    const videos = primaryResults.filter(r => r.videoId);
    const images = primaryResults.filter(r => r.imageHash);
    const consumedImageNames = new Set();
    for (const v of videos) {
      const match = images.find(img => img.name === v.name && !consumedImageNames.has(img.name));
      if (match) {
        v.thumbnailHash = match.imageHash;
        consumedImageNames.add(match.name);
        pairedCount++;
        addLog('info', `🔗 paired: ${v.name}.mp4 ← ${v.name}.jpg as thumbnail`);
      }
    }
    const finalResults = primaryResults.filter(r => !(r.imageHash && consumedImageNames.has(r.name)));

    if (finalResults.length) {
      const json = JSON.stringify(finalResults, null, 2);
      state.creativesInput = json;
      state.creativesParsed = parseCreatives(json);
    }
    state.uploading = false;
    const okCount = state.uploads.filter(u => u.status === 'done').length;
    const partialCount = state.uploads.filter(u => u.status === 'partial').length;
    const pairedSuffix = pairedCount ? ` · ${pairedCount} thumbnail${pairedCount > 1 ? 's' : ''} paired` : '';
    const accSuffix = accIds.length > 1 ? ` across ${accIds.length} accounts` : '';
    const partialSuffix = partialCount ? ` · ${partialCount} partial` : '';
    setStatus(okCount ? (partialCount ? 'warning' : 'success') : 'error',
      `Upload done: ${okCount}/${files.length} fully successful${partialSuffix}${accSuffix}${pairedSuffix}.`);
    render();
  }

  // ─── PAGES LOADER (v0.6: per-account, cached) ───────────────────────────
  async function loadPagesForAccount(accId) {
    if (!accId) return;
    if (state.pagesByAccount[accId]) {
      state.pagesList = state.pagesByAccount[accId];
      render();
      return;
    }
    state.pagesLoading = true;
    render();
    const found = new Map();
    // Primary: pages connected to this ad account (most accurate)
    try {
      const items = await apiAll(`/act_${accId}/promote_pages`, { fields: 'id,name', limit: 100 });
      items.forEach(p => found.set(String(p.id), p.name || 'Untitled'));
      if (items.length) addLog('info', `Pages (promote_pages): ${items.length} for ${accId}`);
    } catch (e) {
      addLog('warning', `promote_pages failed (${accId}): ${e.message}`);
    }
    // Fallback: pages owned by user (broader pool; only used if no account-bound pages found).
    if (!found.size) {
      try {
        const items = await apiAll('/me/accounts', { fields: 'id,name', limit: 100 });
        items.forEach(p => found.set(String(p.id), p.name || 'Untitled'));
        if (items.length) addLog('info', `Pages (/me/accounts): ${items.length}`);
      } catch (e) {
        addLog('warning', `/me/accounts failed: ${e.message}`);
      }
    }
    const list = [...found.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
    state.pagesByAccount[accId] = list;
    if (state.targetAccIds[0] === accId) state.pagesList = list;
    state.pagesLoading = false;
    render();
  }

  // v0.6.4: fetch an Instagram actor that's guaranteed promotable in the chosen ad account.
  //
  // The lookup order changed from v0.6.3 — account-level FIRST, page-level fallback.
  // Reason: /<page>/instagram_accounts returns actors connected to the Page across
  // ALL BMs the page lives in. If the launch account's BM doesn't have rights to
  // that actor, FB rejects the creative with "instagram_user_id must be valid".
  // /act_<accId>/instagram_accounts only ever returns actors promotable in THAT
  // account, so its IDs are guaranteed to work for adcreatives POST in that account.
  //
  // Cache is keyed by (accId, pageId) since the same page can resolve differently
  // in different accounts.
  async function loadIgForAccount(accId, pageId) {
    const key = `${accId || ''}__${pageId || ''}`;
    if (key in state.pageIgMap) return state.pageIgMap[key]?.igId || '';
    if (state.pageIgLoading[key]) return '';
    state.pageIgLoading[key] = true;
    let pageName = '';
    try {
      if (pageId) {
        try {
          const r = await apiFetch(`/${pageId}`, { params: { fields: 'name' } });
          pageName = r?.name || '';
          // v0.6.6: auto-fill DSA Beneficiary from the Page name if the user hasn't
          // set one. FB now requires dsa_beneficiary for almost all ad sets, not
          // just EU targeting, so we lean on the page identity to keep launches moving.
          if (pageName && !state.dsaBeneficiary) {
            state.dsaBeneficiary = pageName;
            addLog('info', `🔖 Auto-filled DSA Beneficiary from page: "${pageName}"`);
          }
        } catch {}
      }

      // 1) Actors promotable in THIS account — these are guaranteed to work.
      if (accId) {
        try {
          const r = await apiFetch(`/act_${accId}/instagram_accounts`, { params: { fields: 'id,username', limit: 25 } });
          const actors = r?.data || [];
          if (actors.length) {
            const item = actors[0];
            const entry = { igId: String(item.id), igName: item.username || '', pageName, source: 'account', count: actors.length };
            state.pageIgMap[key] = entry;
            const extra = actors.length > 1 ? ` (${actors.length} available)` : '';
            addLog('info', `🔗 IG actor for acc ${accId}: ${entry.igId}${entry.igName ? ' @' + entry.igName : ''}${extra}`);
            return entry.igId;
          }
        } catch (e) {
          addLog('warning', `Account ${accId} /instagram_accounts lookup failed: ${e.message}`);
        }
      }

      // 2) v0.6.11: Page-level IG lookup. Three approaches in order:
      //    a) Modern field `connected_instagram_account` — IG linked via Page
      //       Settings (this is the one Ads Manager UI dropdown actually shows).
      //    b) `instagram_business_account` — IG Business Account linked to page.
      //    c) Legacy edge `/page/instagram_accounts` — older, often returns
      //       "nonexisting field" if user lacks page admin role, but free try.
      // Any one of these will let us pass instagram_user_id and have it show
      // properly in the Ads Manager UI for review.
      if (pageId) {
        try {
          const pf = await apiFetch(`/${pageId}`, {
            params: { fields: 'connected_instagram_account{id,username},instagram_business_account{id,username}' },
          });
          const candidates = [
            { obj: pf?.connected_instagram_account, label: 'connected_instagram_account' },
            { obj: pf?.instagram_business_account, label: 'instagram_business_account' },
          ];
          for (const c of candidates) {
            if (c.obj?.id) {
              const entry = { igId: String(c.obj.id), igName: c.obj.username || '', pageName, source: c.label };
              state.pageIgMap[key] = entry;
              addLog('info', `🔗 Found IG via page.${c.label}: ${entry.igId}${entry.igName ? ' @' + entry.igName : ''}`);
              return entry.igId;
            }
          }
        } catch (e) {
          addLog('warning', `Page ${pageId} connected/business IG lookup failed: ${e.message}`);
        }
        try {
          const r = await apiFetch(`/${pageId}/instagram_accounts`, { params: { fields: 'id,username', limit: 5 } });
          const item = r?.data?.[0];
          if (item?.id) {
            const entry = { igId: String(item.id), igName: item.username || '', pageName, source: 'page' };
            state.pageIgMap[key] = entry;
            addLog('info', `🔗 Found IG via legacy /page/instagram_accounts: ${entry.igId}${entry.igName ? ' @' + entry.igName : ''}`);
            return entry.igId;
          }
        } catch (e) {
          // Common: "nonexisting field" when user token lacks page admin role.
          // Quietly drop to PBIA — we'll surface actionable guidance later if all paths fail.
          if (!/nonexisting field/i.test(String(e.message || ''))) {
            addLog('warning', `Page ${pageId} /instagram_accounts lookup failed: ${e.message}`);
          }
        }
      }

      // 3) v0.6.7: Final fallback — Page-Backed Instagram Account (PBIA).
      const pbia = await loadPbiaForPage(pageId, pageName);
      if (pbia?.igId) {
        state.pageIgMap[key] = { ...pbia, source: 'pbia' };
        return pbia.igId;
      }

      state.pageIgMap[key] = { igId: '', igName: '', pageName, source: 'none' };
      // v0.6.11: actionable guidance instead of just "no IG available".
      addLog('warning', `⚠ Page "${pageName || pageId}" has no Instagram identity linked (no connected IG, no Business IG, no admin rights for PBIA). Ads will run on Facebook only. To fix: link an Instagram account in Page Settings (https://business.facebook.com/settings/instagram-accounts), then re-launch. Or paste a promotable IG actor ID in step 3.`);
      return '';
    } finally {
      state.pageIgLoading[key] = false;
      render();
    }
  }

  // v0.6.9: PBIA (Page-Backed Instagram Account) helper, separate from
  // loadIgForAccount so the per-ad rejection safety net can call it directly.
  // PBIA is what "Use Facebook Page" identity in Ads Manager UI uses under the
  // hood — auto-created stub IG tied to the Page, always promotable for that
  // page's creatives. GET returns existing PBIA, POST creates one on the fly.
  // Cache key is `__pbia__<pageId>` since PBIA is per-page, not per-account.
  // v0.6.10: verbose logging — every branch logs its outcome so silent nulls
  // can't happen anymore.
  async function loadPbiaForPage(pageId, pageName = '') {
    if (!pageId) {
      addLog('warning', `PBIA: no pageId provided, skipping`);
      return null;
    }
    const cacheKey = `__pbia__${pageId}`;
    if (state.pageIgMap[cacheKey] !== undefined) {
      const cached = state.pageIgMap[cacheKey];
      addLog('info', `PBIA cache hit for page ${pageId}: ${cached?.igId || 'none'}`);
      return cached || null;
    }
    addLog('info', `🔍 PBIA: looking up Page-Backed IG for page ${pageId}...`);
    try {
      let pbia = null;
      try {
        const g = await apiFetch(`/${pageId}/page_backed_instagram_accounts`, { params: { fields: 'id,username', limit: 1 } });
        const items = g?.data || [];
        if (items.length && items[0]?.id) {
          pbia = items[0];
          addLog('info', `PBIA GET returned existing: ${pbia.id}${pbia.username ? ' @' + pbia.username : ''}`);
        } else {
          addLog('info', `PBIA GET returned empty — will attempt POST to create one`);
        }
      } catch (e) {
        addLog('warning', `PBIA GET failed: ${e.message}`);
      }
      if (!pbia?.id) {
        try {
          const c = await apiFetch(`/${pageId}/page_backed_instagram_accounts`, { method: 'POST' });
          if (c?.id) {
            pbia = c;
            addLog('info', `PBIA POST created: ${c.id}${c.username ? ' @' + c.username : ''}`);
          } else {
            addLog('warning', `PBIA POST succeeded but returned no id — body: ${JSON.stringify(c).slice(0, 200)}`);
          }
        } catch (e) {
          addLog('warning', `PBIA POST failed: ${e.message}`);
        }
      }
      if (pbia?.id) {
        const entry = { igId: String(pbia.id), igName: pbia.username || '', pageName };
        state.pageIgMap[cacheKey] = entry;
        addLog('info', `🔗 Using Page-Backed IG (PBIA) for page "${pageName || pageId}": ${entry.igId}${entry.igName ? ' @' + entry.igName : ''}`);
        return entry;
      }
    } catch (e) {
      addLog('warning', `Page ${pageId} PBIA lookup outer error: ${e.message}`);
    }
    state.pageIgMap[cacheKey] = null;
    addLog('warning', `PBIA: no PBIA found or created for page ${pageId}`);
    return null;
  }

  // v0.6.3 compatibility shim: older callers pass just pageId. Resolve via primary
  // selected account if we have one.
  function loadIgForPage(pageId, accId) {
    return loadIgForAccount(accId || state.targetAccIds[0] || '', pageId);
  }

  // v0.6.5: full list of IG actor IDs promotable in an account. Used to pre-validate
  // a user-supplied IG (CSV column or override) before the launch loop starts, so we
  // don't pay a rejection round-trip on every single ad.
  async function loadAccountIgIds(accId) {
    if (!accId) return new Set();
    const cacheKey = `__set__${accId}`;
    if (state.pageIgMap[cacheKey]?.set) return state.pageIgMap[cacheKey].set;
    try {
      const r = await apiFetch(`/act_${accId}/instagram_accounts`, { params: { fields: 'id', limit: 50 } });
      const ids = new Set((r?.data || []).map(x => String(x.id)));
      state.pageIgMap[cacheKey] = { set: ids };
      return ids;
    } catch (e) {
      addLog('warning', `Could not list IG actors for acc ${accId}: ${e.message}`);
      return new Set();
    }
  }

  // v0.6.5: decide which IG actor (if any) to use for the whole launch in this account.
  // Priority: UI override > CSV first-row value > account's first IG.
  // Whichever we pick is verified against the account's actual IG list — if it isn't
  // there we either swap to a valid one or omit instagram_user_id entirely.
  async function resolveAccountIg(accId, pageId) {
    // v0.6.12: explicit "Use Page as Actor" — skip the whole IG resolution dance
    // and let FB use the Page as the IG identity (equivalent to omitting
    // instagram_user_id at ad creation). Ads Manager UI will show
    // "Use Facebook Page" in the IG profile field.
    if (state.usePageAsActor) {
      return { igId: '', source: 'page-as-actor' };
    }
    const csvIg = stripPfx(state.rows[0]?.['Instagram Account ID'] || '');
    const desired = state.instagramOverride || csvIg;
    const validIds = await loadAccountIgIds(accId);
    if (desired && validIds.has(desired)) {
      return { igId: desired, source: 'desired-valid' };
    }
    if (desired && validIds.size === 0) {
      // Can't verify (no access / empty list). Trust the user-supplied value — the
      // per-ad safety net will catch it if FB rejects.
      return { igId: desired, source: 'desired-unverified' };
    }
    if (desired && !validIds.has(desired)) {
      // The user/CSV value isn't promotable here. Pick something that is, or skip.
      const fallback = await loadIgForAccount(accId, pageId);
      if (fallback) return { igId: fallback, source: 'fallback', wantedButRejected: desired };
      return { igId: '', source: 'omitted-cannot-use', wantedButRejected: desired };
    }
    // No desired value at all — try account's first IG (auto-detect).
    const auto = await loadIgForAccount(accId, pageId);
    return { igId: auto, source: auto ? 'auto' : 'none' };
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
      // v0.6.2: warm the IG cache for whichever page the CSV references first.
      // If the user later overrides the page in step 3 that triggers its own fetch.
      const csvPageId = stripPfx(rows[0]?.['Link Object ID'] || '');
      if (/^\d{10,20}$/.test(csvPageId)) loadIgForPage(csvPageId);
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

    // Budget mode — CSV auto-detect, then v0.7.0 UI override (mode forces CBO/ABO + amount).
    const campBudgetRaw = String(first['Campaign Daily Budget'] || '').trim();
    const adsetBudgetRaw = String(first['Ad Set Daily Budget'] || '').trim();
    const campBudgetNum = parseNum(campBudgetRaw);
    let isCBO = !!campBudgetRaw && campBudgetRaw.toUpperCase() !== 'UNDEFINED' && campBudgetNum > 0;
    let cboBudget = isCBO ? campBudgetNum : 0;
    if (state.budgetModeOverride === 'cbo') {
      isCBO = true;
      cboBudget = parseNum(state.cboBudgetOverride) || campBudgetNum || 0;
    } else if (state.budgetModeOverride === 'abo') {
      isCBO = false;
      cboBudget = 0;
    }

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

    // Adset budgets sum for ABO. v0.7.0: per-adset override applies the same budget to every adset.
    let aboTotal = 0;
    if (!isCBO) {
      const ov = parseNum(state.adsetBudgetOverride);
      if (state.adsetBudgetOverride && ov > 0) {
        aboTotal = ov * groups.size;
      } else {
        for (const [, gr] of groups) {
          const ab = String(gr[0]['Ad Set Daily Budget'] || '').trim();
          const n = (ab && ab.toUpperCase() !== 'UNDEFINED') ? parseNum(ab) : 0;
          if (n > 0) aboTotal += n;
        }
      }
    }

    // Ads-mode (creatives override defines new ads per adset)
    const adsMode = state.creativesParsed?.mode === 'ads';
    const adsModeItems = adsMode ? state.creativesParsed.items : null;
    let adCount;
    if (adsMode) {
      const hasAssignments = Object.keys(state.adsetAssignments || {}).length > 0;
      if (hasAssignments) {
        adCount = 0;
        for (const [adsetName] of groups) {
          const assigned = state.adsetAssignments[adsetName];
          adCount += (assigned && assigned.length) ? assigned.length : adsModeItems.length;
        }
      } else {
        adCount = groups.size * adsModeItems.length;
      }
    } else {
      adCount = state.rows.length;
    }

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

  // v0.7.0: UI bid-strategy override (already an FB enum) wins over CSV's free-text "Campaign Bid Strategy".
  function effectiveBidStrategy(row) {
    return state.bidStrategyOverride || mapBidStrategy(row && row['Campaign Bid Strategy']);
  }

  function renderTpl(tpl, ctx) {
    return String(tpl || '').replace(/\{(\w+)\}|\$\{(\w+)\}/g, (_, a, b) => String(ctx[a || b] ?? ''));
  }

  // v0.7.0: append active name markers (" | CTRL", " | PWA-A", ...) to a campaign/adset/ad name.
  // Dedup-aware: skips a marker already present as a substring (case-insensitive), so re-launches
  // and CSV names that already carry the marker don't double it (mirrors gambling-add-ctrl.ts).
  // Applied ONLY to FB entity names — never to the token context that feeds URL Tags / tracker.
  function applyMarkers(name) {
    let out = String(name || '');
    for (const raw of state.markers) {
      const m = String(raw || '').trim();
      if (!m) continue;
      if (new RegExp(m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(out)) continue;
      out += ` | ${m}`;
    }
    return out;
  }

  // v0.7.0: parse the free-form markers field ("CTRL | PWA-A") into deduped trimmed tokens,
  // merging with any chip-toggled markers already in state.markers from chips.
  function parseFreeformMarkers(raw) {
    return String(raw || '')
      .split('|')
      .map(s => s.trim())
      .filter(Boolean);
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
              thumbnailHash: String(o.thumbnailHash || o.thumbnail_hash || o.thumb_hash || '').trim() || null,
              title: String(o.title || o.headline || '').trim() || null,
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

  // v0.6: remap a creative reference (which always points to the PRIMARY account's
  // upload result) to the equivalent hash/videoId in another account. For single-
  // account launches or when no uploads exist this is a passthrough — important so
  // legacy flows where the user pastes raw hashes still work.
  // Returns { imageHash, videoId, remapFailed?: <uploadName> } — remapFailed means
  // we found a matching upload entry but its per-account result isn't ready, so
  // the launch loop should skip the ad and log it instead of sending a bad hash.
  function remapCreativeForAccount(imageHash, videoId, accId) {
    if (!accId || state.targetAccIds.length <= 1 || state.targetAccIds[0] === accId) {
      return { imageHash, videoId };
    }
    if (!state.uploads?.length) return { imageHash, videoId };
    const u = state.uploads.find(u =>
      (imageHash && u.imageHash === imageHash) ||
      (videoId && u.videoId === videoId)
    );
    if (!u) return { imageHash, videoId };  // pasted ref unrelated to any upload → leave it
    const pa = u.perAccount?.[accId];
    if (!pa || pa.status !== 'done') {
      return { imageHash: '', videoId: '', remapFailed: u.name };
    }
    return {
      imageHash: imageHash && pa.hash ? pa.hash : '',
      videoId: videoId && pa.videoId ? pa.videoId : '',
    };
  }

  function transformUrlTags(raw, accId, adName) {
    if (!raw) return raw;
    const target = String(state.urlTagParam || '').trim();
    if (!target || state.urlTagMode === 'keep') return raw;
    const pairs = String(raw).split('&').map(p => {
      const [k, ...rest] = p.split('=');
      return [k, rest.join('=')];
    });
    const newVal = state.urlTagMode === 'acc_id' ? accId
      : state.urlTagMode === 'ad_name' ? String(adName || '')
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

  // ─── EU COUNTRIES (DSA compliance) ──────────────────────────────────────
  const EU_COUNTRIES = new Set([
    'AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT',
    'LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE',
    // EEA + UK (DSA-equivalent)
    'NO','IS','LI','GB','UK',
  ]);

  function hasEuTargeting(rows) {
    for (const r of rows) {
      const countries = String(r['Countries'] || '').split(',').map(s => s.trim().toUpperCase());
      if (countries.some(c => EU_COUNTRIES.has(c))) return true;
    }
    return false;
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

  // v0.7.0: placement preset → FB targeting fields. Mirrors the all|fb_ig|fb_only|feeds_only|reels_only
  // convention used by fb-campaign-generator. Returns null for '' (= fall back to CSV columns) and
  // for 'all' (= omit platform/position fields → FB automatic/Advantage+ placements).
  function placementSpec(preset) {
    switch (preset) {
      case 'fb_ig':      return { publisher_platforms: ['facebook', 'instagram'] };
      case 'fb_only':    return { publisher_platforms: ['facebook'] };
      case 'feeds_only': return { publisher_platforms: ['facebook', 'instagram'], facebook_positions: ['feed'], instagram_positions: ['stream'] };
      case 'reels_only': return { publisher_platforms: ['facebook', 'instagram'], facebook_positions: ['facebook_reels'], instagram_positions: ['reels'] };
      case 'all':        return {};   // explicit "all" → no restriction (automatic placements)
      default:           return null; // '' → use CSV
    }
  }

  // ─── LAUNCHER ───────────────────────────────────────────────────────────
  // v0.6: orchestrator — pre-flight CSV-wide checks once, then run the per-account
  // pipeline for each selected account sequentially. For single-account this still
  // produces exactly one campaign; for N accounts it produces N independent campaigns.
  async function runLaunch() {
    if (!state.rows.length) { setStatus('error', 'Load a CSV first.'); return; }
    if (!state.targetAccIds.length) { setStatus('error', 'Select at least one target ad account.'); return; }
    const plan = analyzePlan();
    if (!plan) { setStatus('error', 'Cannot analyze plan from CSV.'); return; }

    // Pre-flight: DSA Beneficiary required. FB used to enforce this only for EU
    // targeting, but in 2026 they expanded the rule to almost all ad sets — error
    // [100/3858079] "Specify a person or organization..." now hits non-EU launches
    // too. Always require the field; auto-fill keeps it painless.
    if (!state.dsaBeneficiary) {
      setStatus('error', '⚠ DSA Advertiser (step 5) required. FB rejects ad sets without it. Type your business name or page name (or pick a Page in step 3 to auto-fill).');
      return;
    }

    // Pre-flight: validate Page ID (against PRIMARY account's list — same value sent to every account)
    if (state.pageIdOverride) {
      if (!/^\d{10,20}$/.test(state.pageIdOverride)) {
        setStatus('error', `Invalid Page ID "${state.pageIdOverride}". Must be 10-20 digits. Pick from dropdown in step 3.`);
        return;
      }
      if (state.pagesList.length && !state.pagesList.find(p => p.id === state.pageIdOverride)) {
        const ok = confirm(
          `Page ${state.pageIdOverride} is NOT in the primary account's page list.\n\n` +
          `Available pages:\n${state.pagesList.slice(0, 5).map(p => `  ${p.id} — ${p.name}`).join('\n')}\n\n` +
          `Launch anyway? (FB may reject ads with subcode 1815813)`
        );
        if (!ok) { setStatus('warning', 'Launch cancelled. Pick a page from the dropdown in step 3.'); return; }
      }
    }

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
    if (state.pixelsList.length && !state.pixelsList.find(p => p.id === effectivePixel)) {
      const ok = confirm(
        `Pixel ${effectivePixel} is NOT in the primary account's pixel list.\n\n` +
        `Available pixels:\n${state.pixelsList.slice(0, 5).map(p => `  ${p.id} — ${p.name}`).join('\n')}\n\n` +
        `Launch anyway? (FB may reject adsets with subcode 1487429)`
      );
      if (!ok) { setStatus('warning', 'Launch cancelled. Pick a pixel from the dropdown in step 4.'); return; }
    }

    const now = new Date();
    const dateStr = String(now.getMonth() + 1).padStart(2, '0')
      + String(now.getDate()).padStart(2, '0')
      + String(now.getFullYear()).slice(-2);
    const accIds = state.targetAccIds.slice();
    // Total units = N accounts × (campaign + adsets + ads)
    const perAccountUnits = 1 + plan.adsetCount + plan.adCount;
    const totalUnits = perAccountUnits * accIds.length;

    state.running = true;
    state.log = [];
    state.progress = { done: 0, total: totalUnits };
    render();

    if (accIds.length > 1) {
      addLog('info', `🌐 Multi-account launch: ${accIds.length} accounts × ${plan.adsetCount} adsets × ${plan.adCount} ads = ${totalUnits} ops`);
    }

    let okAccounts = 0, errAccounts = 0;
    for (const accId of accIds) {
      try {
        const ok = await runLaunchForAccount(accId, plan, dateStr);
        if (ok) okAccounts++; else errAccounts++;
      } catch (e) {
        errAccounts++;
        addLog('error', `[${accId}] launch failed: ${e.message}`);
      }
    }

    state.running = false;
    if (accIds.length > 1) {
      const summary = errAccounts
        ? `Multi-account done: ${okAccounts}/${accIds.length} accounts succeeded, ${errAccounts} failed.`
        : `🎉 Multi-account done: all ${okAccounts} accounts launched successfully.`;
      setStatus(errAccounts ? 'warning' : 'success', summary);
    }
    // v0.5.3: auto-save preset only when EVERY account succeeded.
    if (state.autoSavePreset && !errAccounts && okAccounts > 0) autoSavePresetSilent();
    render();
  }

  // v0.6: extracted per-account pipeline. Same logic that runLaunch had before,
  // now keyed off the accId param instead of state.targetAccId. Returns true on
  // full success, false on any ad-level error inside this account.
  async function runLaunchForAccount(accId, plan, dateStr) {
    const acc = ACCOUNTS.find(a => a.id === accId);
    const accLabel = acc?.name || accId;
    const firstRow = state.rows[0];

    const sacLabel = plan.sacList.length ? ` SAC:${plan.sacList[0]}` : '';
    const budgetLabel = plan.isCBO ? `CBO $${plan.cboBudget}/d` : `ABO $${plan.aboTotal}/d total`;
    addLog('info', `[${accLabel}] Launching ${plan.adsetCount} adsets × ${plan.adCount} ads (${budgetLabel})${sacLabel}`);
    render();

    // v0.6.5: resolve the Instagram actor ONCE for the whole launch in this account.
    // Pre-validating against /act_<id>/instagram_accounts means the per-ad loop just
    // uses this value verbatim — no more retry-per-ad when CSV's IG doesn't fit.
    const probePage = state.pageIdOverride || stripPfx(firstRow?.['Link Object ID'] || '');
    const igResolution = await resolveAccountIg(accId, probePage);
    let resolvedIg = igResolution.igId;
    if (igResolution.source === 'page-as-actor') {
      addLog('info', `[${accLabel}] 🔗 Use Page as Actor — ads will use Facebook Page identity (no Instagram actor)`);
    } else if (igResolution.source === 'desired-valid') {
      addLog('info', `[${accLabel}] 🔗 IG actor ${resolvedIg} validated for this account`);
    } else if (igResolution.source === 'desired-unverified') {
      addLog('info', `[${accLabel}] 🔗 IG actor ${resolvedIg} from CSV/override (no list permission to verify)`);
    } else if (igResolution.source === 'fallback') {
      addLog('warning', `[${accLabel}] 🔗 IG ${igResolution.wantedButRejected} not promotable here → using account actor ${resolvedIg} instead`);
    } else if (igResolution.source === 'omitted-cannot-use') {
      addLog('warning', `[${accLabel}] 🔗 IG ${igResolution.wantedButRejected} not promotable here and no account actor available → instagram_user_id omitted (FB default)`);
    } else if (igResolution.source === 'auto') {
      // 'auto' from resolveAccountIg includes any of: account, page, pbia.
      // The granular source label was logged once already inside loadIgForAccount,
      // so here we just confirm the final pick at account scope.
      addLog('info', `[${accLabel}] 🔗 IG actor auto-detected: ${resolvedIg}`);
    } else {
      addLog('info', `[${accLabel}] 🔗 no IG actor — FB will use default`);
    }
    render();

    let campaignId;
    try {
      // ── Campaign ──
      const budgetForName = plan.isCBO ? plan.cboBudget : plan.aboTotal;
      const budgetMode = plan.isCBO ? 'CBO' : 'ABO';
      let campName;
      if (state.campNamePrefix) {
        // User-provided prefix: launcher auto-appends budget/count/date/acc_id
        campName = `${state.campNamePrefix} | ${budgetMode} $${budgetForName}/d | ${plan.adsetCount}as${plan.adCount}ads | ${dateStr} | ${accId}`;
      } else if (state.campNameTpl) {
        // Legacy template support
        campName = renderTpl(state.campNameTpl, {
          budget: budgetForName, ad_count: plan.adCount, adset_count: plan.adsetCount,
          date: dateStr, acc_id: accId, source_name: firstRow['Campaign Name'] || '',
        });
      } else {
        campName = firstRow['Campaign Name'] || `FB Launcher ${dateStr}`;
      }
      // v0.7.0: markers on campaign name (campaign name is NOT used in token context, so safe here)
      campName = applyMarkers(campName);

      const campBody = {
        name: campName,
        objective: mapObjective(firstRow['Campaign Objective']),
        status: state.createStatus,
        special_ad_categories: JSON.stringify(plan.sacList),
        buying_type: firstRow['Buying Type'] || 'AUCTION',
      };
      // v0.5.1: bid_strategy only on CBO campaign-level. For ABO it lives on adset-level —
      // sending it on a budget-less campaign trips FB error [100/1885737] "campaign budget not set".
      if (plan.isCBO) {
        campBody.daily_budget = String(Math.round(plan.cboBudget * 100));
        campBody.bid_strategy = effectiveBidStrategy(firstRow);
      }

      addLog('info', `[${accLabel}] creating campaign "${campName}"...`);
      const camp = await apiFetch(`/act_${accId}/campaigns`, { method: 'POST', body: campBody });
      campaignId = camp.id;
      state.progress.done++;
      addLog('success', `[${accLabel}] ✓ campaign id=${campaignId}`);
    } catch (e) {
      addLog('error', `[${accLabel}] ✗ campaign failed: ${e.message}`);
      // Don't stop multi-account run on one campaign failure; the orchestrator
      // aggregates per-account results and reports them at the end.
      return false;
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
      // Per-adset assignment (v0.4): if state.adsetAssignments[adsetSourceName] is set,
      // filter creativesItems to only those indices for this adset.
      let activeItems = plan.adsModeItems;
      if (plan.adsMode && state.adsetAssignments && state.adsetAssignments[adsetSourceName]) {
        const indices = state.adsetAssignments[adsetSourceName];
        if (indices.length) activeItems = indices.map(i => plan.adsModeItems[i]).filter(Boolean);
      }
      const adsToCreate = plan.adsMode
        ? activeItems.map(item => ({
            csvRow: groupRows[0],
            forcedName: item.name,
            forcedImageHash: item.imageHash,
            forcedVideoId: item.videoId,
            forcedItem: item,  // full reference for title/body/cta/thumbnailHash overrides
          }))
        : groupRows.map(r => ({
            csvRow: r,
            forcedName: null,
            forcedImageHash: null,
            forcedVideoId: null,
            forcedItem: null,
          }));

      const adsetName = state.adsetNameTpl
        ? renderTpl(state.adsetNameTpl, {
            date: dateStr, acc_id: accId,
            source_name: adsetSourceName,
            ad_count: adsToCreate.length,
            n: String(adsetIdx).padStart(2, '0'),
          })
        : (adsetSourceName !== '__default__' ? adsetSourceName : `Ad Set ${adsetIdx}`);

      // v0.7.0: targeting — UI override (state.*) wins over CSV column; empty override falls back to CSV.
      const countriesRaw = (state.geoCountriesOverride || String(aFirst['Countries'] || ''))
        .split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
      const fbRegions = await resolveRegions(state.geoStatesOverride || aFirst['Regions']);
      const countries = countriesRaw.length ? countriesRaw : ['US'];
      const ageMin = state.ageMinOverride ? (+state.ageMinOverride || 18) : (+aFirst['Age Min'] || 18);
      const ageMax = state.ageMaxOverride ? (+state.ageMaxOverride || 65) : (+aFirst['Age Max'] || 65);
      const gender = (state.genderOverride || String(aFirst['Gender'] || '')).toLowerCase();
      const genders = gender.includes('men') && !gender.includes('women') ? [1]
        : gender.includes('women') && !gender.includes('men') ? [2] : [1, 2];
      // Placements: UI preset override (placementSpec) wins; else CSV columns.
      const placePreset = placementSpec(state.placementPreset);
      const publisherPlatforms = placePreset
        ? (placePreset.publisher_platforms || [])
        : String(aFirst['Publisher Platforms'] || '').split(',').map(s => s.trim()).filter(Boolean);
      const fbPositions = placePreset
        ? (placePreset.facebook_positions || [])
        : String(aFirst['Facebook Positions'] || '').split(',').map(s => s.trim()).filter(Boolean);
      const igPositions = placePreset
        ? (placePreset.instagram_positions || [])
        : String(aFirst['Instagram Positions'] || '').split(',').map(s => s.trim()).filter(Boolean);
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
      const bidStrategy = effectiveBidStrategy(firstRow);

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
        targeting_automation: { advantage_audience: state.advantageAudienceOverride !== '' ? +state.advantageAudienceOverride : +(aFirst['Advantage Audience'] || 0) },
      };
      if (publisherPlatforms.length) targeting.publisher_platforms = publisherPlatforms;
      if (devicePlatforms.length) targeting.device_platforms = devicePlatforms;
      if (fbPositions.length) targeting.facebook_positions = fbPositions;
      if (igPositions.length) targeting.instagram_positions = igPositions;

      const promoted = { pixel_id: pixelId, custom_event_type: customEventType };

      const bidAmountRaw = state.bidAmountOverride || aFirst['Bid Amount'];  // v0.7.0: UI override > CSV
      const bidAmountNum = parseNum(bidAmountRaw);
      const bidNeedsCap = bidStrategy === 'COST_CAP' || bidStrategy === 'LOWEST_COST_WITH_BID_CAP';
      const bidAmountCents = bidNeedsCap && bidAmountNum > 0
        ? String(Math.round(bidAmountNum * 100)) : null;

      // v0.7.0: markers on FB adset name only; adsetName stays clean for token context (URL Tags)
      const adsetNameFinal = applyMarkers(adsetName);
      const adsetBody = {
        name: adsetNameFinal,
        campaign_id: campaignId,
        status: state.createStatus,
        optimization_goal: optGoal,
        billing_event: billingEvent,
        targeting: JSON.stringify(targeting),
        promoted_object: JSON.stringify(promoted),
        attribution_spec: aFirst['Attribution Spec'] || '[{"event_type":"CLICK_THROUGH","window_days":1}]',
      };
      // EU DSA on adset level — required for some EU geos (esp. CEE: PL/CZ/HU/...)
      if (state.dsaBeneficiary) {
        adsetBody.dsa_beneficiary = state.dsaBeneficiary;
        adsetBody.dsa_payer = state.dsaPayer || state.dsaBeneficiary;
      }
      if (!plan.isCBO) {
        // v0.7.0: per-adset budget override applies to every adset; else CSV column.
        const ovNum = parseNum(state.adsetBudgetOverride);
        const ab = String(aFirst['Ad Set Daily Budget'] || '').trim();
        const csvNum = (ab && ab.toUpperCase() !== 'UNDEFINED') ? parseNum(ab) : 0;
        const abNum = (state.adsetBudgetOverride && ovNum > 0) ? ovNum : csvNum;
        if (abNum > 0) adsetBody.daily_budget = String(Math.round(abNum * 100));
        // v0.5.1: bid_strategy belongs on the adset for ABO. CBO inherits it from campaign.
        adsetBody.bid_strategy = bidStrategy;
      }
      if (bidAmountCents) adsetBody.bid_amount = bidAmountCents;

      addLog('info', `[${accLabel}] creating adset ${adsetIdx}/${plan.adsetCount} "${adsetNameFinal}"...`);
      let adsetId;
      try {
        const adset = await apiFetch(`/act_${accId}/adsets`, { method: 'POST', body: adsetBody });
        adsetId = adset.id;
        state.progress.done++;
        addLog('success', `[${accLabel}] ✓ adset ${adsetIdx}/${plan.adsetCount} id=${adsetId} (${adsToCreate.length} ads coming)`);
      } catch (e) {
        addLog('error', `[${accLabel}] ✗ adset ${adsetIdx} "${adsetNameFinal}": ${e.message}`);
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
          // Reuse `pixelId` (line 1738) so {pixel_id} in URL always matches the pixel
          // we put in promoted_object. UI override (state.pixelOverride) wins over CSV.
          const firstGeo = (String(aFirst['Countries'] || '').split(',').map(s => s.trim()).filter(Boolean)[0]) || '';
          const tokenCtx = {
            pixel_id: pixelId,
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
            : transformUrlTags(tagsResolved, accId, adName);

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
          // v0.6: remap to per-account hash/videoId for multi-account launches.
          const remap = remapCreativeForAccount(imageHash, videoId, accId);
          if (remap.remapFailed) {
            totalAdErr++;
            state.progress.done++;
            addLog('error', `[${accLabel}] ✗ ad "${adName}": creative "${remap.remapFailed}" not uploaded to this account, skipped`);
            adGlobalIdx++;
            continue;
          }
          imageHash = remap.imageHash;
          videoId = remap.videoId;

          // Resolve copy text — priority: per-item (ads-mode JSON) > UI override > CSV row
          const itemTitle = adInfo.forcedItem?.title || null;
          const itemBody  = adInfo.forcedItem?.body  || null;
          const itemCta   = adInfo.forcedItem?.cta   || null;
          const adTitle = itemTitle || state.titleOverride || r['Title'] || '';
          const adBody  = itemBody  || state.bodyOverride  || r['Body']  || '';
          const cta     = itemCta   || state.ctaOverride   || r['Call to Action'] || 'LEARN_MORE';

          // v0.6.5: use the IG actor resolved once for this account (above the adset loop).
          // Per-ad lookup was removing all the value of caching when CSV had its own IG
          // column, so we just trust the pre-validated value here.
          const objectStorySpec = { page_id: pageId };
          if (resolvedIg) objectStorySpec.instagram_user_id = resolvedIg;
          if (videoId) {
            // Thumbnail priority: per-item thumbnailHash (from upload pairing or JSON) > FB auto-thumbnail
            let itemThumb = adInfo.forcedItem?.thumbnailHash || null;
            // v0.6: remap thumbnail hash for non-primary accounts.
            if (itemThumb) {
              const thumbRemap = remapCreativeForAccount(itemThumb, '', accId);
              itemThumb = thumbRemap.remapFailed ? null : (thumbRemap.imageHash || itemThumb);
            }
            objectStorySpec.video_data = {
              video_id: videoId,
              call_to_action: { type: cta, value: { link } },
            };
            if (adBody) objectStorySpec.video_data.message = adBody;
            if (adTitle) objectStorySpec.video_data.title = adTitle;
            if (itemThumb) {
              objectStorySpec.video_data.image_hash = itemThumb;
            } else {
              // Fallback: fetch auto-thumbnail from FB
              let thumbUrl = '';
              try {
                const vInfo = await apiFetch(`/${videoId}`, { params: { fields: 'picture,thumbnails{uri,is_preferred}' } });
                const prefThumb = vInfo?.thumbnails?.data?.find(t => t.is_preferred)?.uri;
                thumbUrl = prefThumb || vInfo?.thumbnails?.data?.[0]?.uri || vInfo?.picture || '';
              } catch {}
              if (thumbUrl) objectStorySpec.video_data.image_url = thumbUrl;
            }
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

          // v0.6.4 safety net — if FB rejects the creative because of IG.
          // v0.6.10: instead of going straight to PBIA, run the full ladder
          // (loadIgForAccount: account → page → PBIA). The page-level step
          // (/page/instagram_accounts) often returns a REAL connected IG that
          // FB Ads Manager UI will then display in the IG identity dropdown —
          // PBIA, while functional, leaves that dropdown empty.
          let creative;
          try {
            creative = await apiFetch(`/act_${accId}/adcreatives`, { method: 'POST', body: creativeBody });
          } catch (e) {
            const msg = String(e.message || '');
            // v0.6.12: when user explicitly chose Use Page as Actor, never attempt
            // the IG fallback dance — that's the whole point of the checkbox.
            if (msg.includes('instagram_user_id') && objectStorySpec.instagram_user_id && !state.usePageAsActor) {
              const rejectedIg = objectStorySpec.instagram_user_id;
              addLog('warning', `[${accLabel}] FB rejected IG ${rejectedIg} — running full IG fallback (account → page → PBIA)...`);
              // Bust any stale cache entry from initial resolveAccountIg so the
              // ladder runs fresh instead of returning the rejected value again.
              const ladderKey = `${accId || ''}__${pageId || ''}`;
              delete state.pageIgMap[ladderKey];
              const fallbackIg = await loadIgForAccount(accId, pageId);
              if (fallbackIg && fallbackIg !== rejectedIg) {
                addLog('info', `[${accLabel}] IG fallback found ${fallbackIg} — retrying "${adName}", remaining ads will reuse it`);
                const retrySpec = { ...objectStorySpec, instagram_user_id: fallbackIg };
                const retryBody = { object_story_spec: JSON.stringify(retrySpec) };
                if (urlTags) retryBody.url_tags = urlTags;
                try {
                  creative = await apiFetch(`/act_${accId}/adcreatives`, { method: 'POST', body: retryBody });
                  resolvedIg = fallbackIg;
                } catch (e2) {
                  addLog('warning', `[${accLabel}] IG fallback ${fallbackIg} also rejected: ${e2.message} — dropping IG entirely for remaining ads`);
                  const noIgSpec = { ...objectStorySpec };
                  delete noIgSpec.instagram_user_id;
                  const noIgBody = { object_story_spec: JSON.stringify(noIgSpec) };
                  if (urlTags) noIgBody.url_tags = urlTags;
                  creative = await apiFetch(`/act_${accId}/adcreatives`, { method: 'POST', body: noIgBody });
                  resolvedIg = '';
                }
              } else {
                addLog('warning', `[${accLabel}] No IG fallback available (account/page/PBIA all empty or same as rejected) — retrying "${adName}" without IG, and skipping IG for remaining ads in this account`);
                const retrySpec = { ...objectStorySpec };
                delete retrySpec.instagram_user_id;
                const retryBody = { object_story_spec: JSON.stringify(retrySpec) };
                if (urlTags) retryBody.url_tags = urlTags;
                creative = await apiFetch(`/act_${accId}/adcreatives`, { method: 'POST', body: retryBody });
                resolvedIg = '';
              }
            } else {
              throw e;
            }
          }
          // v0.7.0: markers on FB ad name only; adName stays clean for token context (sub5/ad_name)
          const adNameFinal = applyMarkers(adName);
          const adBodyPost = {
            name: adNameFinal,
            adset_id: adsetId,
            creative: JSON.stringify({ creative_id: creative.id }),
            status: state.createStatus,
          };
          // EU DSA fields (required when targeting EU; safe to send for all)
          if (state.dsaBeneficiary) {
            adBodyPost.dsa_beneficiary = state.dsaBeneficiary;
            adBodyPost.dsa_payer = state.dsaPayer || state.dsaBeneficiary;  // payer defaults to beneficiary
          }
          await apiFetch(`/act_${accId}/ads`, { method: 'POST', body: adBodyPost });
          totalAdOk++;
          state.progress.done++;
          addLog('success', `[${accLabel}] ✓ ad ${i + 1}/${adsToCreate.length} "${adNameFinal}"`);
        } catch (e) {
          totalAdErr++;
          state.progress.done++;
          addLog('error', `[${accLabel}] ✗ ad "${adName}": ${e.message}`);
        }
        adGlobalIdx++;
        await sleep(RATE_AD_MS);
      }
    }

    const okMsg = totalAdErr
      ? `[${accLabel}] Done with errors: ${totalAdOk}/${plan.adCount} ads succeeded, ${totalAdErr} failed.`
      : `[${accLabel}] ✓ ${totalAdOk}/${plan.adCount} ads created (${state.createStatus}).`;
    // For single-account launches we mirror status here so existing UX feels the same;
    // multi-account aggregates a single status message after the loop.
    if (state.targetAccIds.length === 1) {
      setStatus(totalAdErr ? 'warning' : 'success', okMsg);
      // v0.5.3 auto-save lives here only for single-account; multi-account version
      // is handled inside the orchestrator so it triggers exactly once.
      if (state.autoSavePreset && !totalAdErr && totalAdOk > 0) autoSavePresetSilent();
    } else {
      addLog(totalAdErr ? 'warning' : 'success', okMsg);
    }
    render();
    return !totalAdErr;
  }

  // ─── UI PANEL ───────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('__fb_launcher_styles__')) return;
    const style = document.createElement('style');
    style.id = '__fb_launcher_styles__';
    style.textContent = `
      #${PANEL_ID} { position:fixed; top:0; right:0; width:920px; max-width:94vw; height:100vh;
        background:#0f172a; color:#e2e8f0; z-index:2147483646;
        border-left:1px solid #334155; box-shadow:-8px 0 24px rgba(0,0,0,.4);
        font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
        font-size:13px; overflow-y:auto; padding:14px 18px; box-sizing:border-box; }
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
      #${PANEL_ID} .log div { word-break:break-word; line-height:1.45; margin-bottom:2px;
        padding:1px 0; }
      #${PANEL_ID} .log div.error-line { background:rgba(239,68,68,.08);
        border-left:2px solid #ef4444; padding-left:4px; margin:2px 0; }
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
      /* v0.7.0: responsive grids — settings flow 2-3 per row, collapse to 1 col on narrow panels */
      #${PANEL_ID} .grid2 { display:grid; grid-template-columns:repeat(2,1fr); gap:10px 14px; }
      #${PANEL_ID} .grid3 { display:grid; grid-template-columns:repeat(3,1fr); gap:10px 14px; }
      #${PANEL_ID} .grid2 > .field, #${PANEL_ID} .grid3 > .field { margin-bottom:0; min-width:0; }
      @media (max-width:760px) {
        #${PANEL_ID} .grid2, #${PANEL_ID} .grid3 { grid-template-columns:1fr; }
      }
      /* v0.7.0: marker chips */
      #${PANEL_ID} .chips { display:flex; flex-wrap:wrap; gap:5px; }
      #${PANEL_ID} .chip { padding:3px 10px; border-radius:12px; font-size:11px; cursor:pointer;
        border:1px solid #334155; background:#1e293b; color:#94a3b8; user-select:none; transition:all .12s; }
      #${PANEL_ID} .chip:hover { border-color:#475569; color:#cbd5e1; }
      #${PANEL_ID} .chip.on { background:rgba(59,130,246,.15); border-color:#3b82f6; color:#bfdbfe; font-weight:600; }
      #${PANEL_ID} hr { border:none; border-top:1px solid #334155; margin:14px 0; }
      #${PANEL_ID} .s-pending { color:#475569; }
      #${PANEL_ID} .s-uploading { color:#60a5fa; }
      #${PANEL_ID} .s-processing { color:#fbbf24; }
      #${PANEL_ID} .s-done { color:#4ade80; }
      #${PANEL_ID} .s-error { color:#f87171; }
      #${PANEL_ID} .fbl-bar { height:100%; width:0%; background:#3b82f6; transition:width .15s linear; }
      #${PANEL_ID} .fbl-bar.uploading,
      #${PANEL_ID} .fbl-bar.processing {
        width:100% !important; background-size:200% 100%; animation:fbl-pulse 1.5s linear infinite;
      }
      #${PANEL_ID} .fbl-bar.uploading {
        background:linear-gradient(90deg, #3b82f6 0%, #60a5fa 50%, #3b82f6 100%);
      }
      #${PANEL_ID} .fbl-bar.processing {
        background:linear-gradient(90deg, #fbbf24 0%, #f59e0b 50%, #fbbf24 100%);
      }
      #${PANEL_ID} .fbl-bar.done  { background:#22c55e; width:100% !important; }
      #${PANEL_ID} .fbl-bar.error { background:#ef4444; width:100% !important; }
      @keyframes fbl-pulse { 0% { background-position:200% 0; } 100% { background-position:-200% 0; } }
      #${PANEL_ID} #fbl-drop.over { border-color:#3b82f6 !important; background:rgba(59,130,246,.06); color:#93c5fd; }
      #${PANEL_ID} #fbl-drop.has-files { border-color:#22c55e; background:rgba(34,197,94,.04); color:#86efac; }
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
      `<div class="${l.type === 'error' ? 'error-line' : ''}" style="color:${SC[l.type] || SC.info}"><span class="ts">${esc(l.ts)}</span>${esc(l.msg)}</div>`
    ).join('');
  }

  function render() {
    if (!panel) return;

    // Preserve focus + cursor position across innerHTML rebuild
    // (otherwise typing in any input loses focus after each keystroke)
    const active = document.activeElement;
    const activeId = active && active.id && panel.contains(active) ? active.id : null;
    let activeSelStart = null, activeSelEnd = null, activeScrollTop = null;
    if (activeId) {
      try {
        activeSelStart = active.selectionStart;
        activeSelEnd = active.selectionEnd;
      } catch {} // not all inputs support selection
      activeScrollTop = active.scrollTop || null;
    }

    // Preserve scroll positions of ANY scrollable element with id in the panel
    // (matrix horizontal scroll, log scroll, account list, uploads list, etc.)
    const scrollSnapshot = new Map();
    panel.querySelectorAll('[id]').forEach(el => {
      if (el.scrollLeft > 0 || el.scrollTop > 0) {
        scrollSnapshot.set(el.id, { left: el.scrollLeft, top: el.scrollTop });
      }
    });
    // Also snapshot panel's own scroll (the right-side side panel itself)
    const panelScrollTop = panel.scrollTop;

    const plan = analyzePlan();
    const accFilter = state.accFilter.toLowerCase();
    const visibleAccs = accFilter
      ? ACCOUNTS.filter(a => a.name.toLowerCase().includes(accFilter) || a.id.includes(accFilter) || a.bm.toLowerCase().includes(accFilter))
      : ACCOUNTS;

    const selectedAccs = state.targetAccIds.map(id => ACCOUNTS.find(a => a.id === id)).filter(Boolean);
    const hasAccounts = state.targetAccIds.length > 0;
    const isMulti = state.targetAccIds.length > 1;
    const primaryAcc = state.targetAccIds[0];

    // Effective pixel: override > CSV
    const effPixel = state.pixelOverride || plan?.pixel || '';
    const effEvent = state.customEventOverride || plan?.event || 'PURCHASE';
    const pixelValid = /^\d{8,20}$/.test(effPixel);
    const pixelInAccount = !state.pixelsList.length || !!state.pixelsList.find(p => p.id === effPixel);

    // v0.7.0: budget & bidding UI helpers
    const bMode = state.budgetModeOverride;
    const budgetAmtVal = bMode === 'cbo' ? state.cboBudgetOverride : bMode === 'abo' ? state.adsetBudgetOverride : '';
    const budgetAmtLabel = bMode === 'cbo' ? 'Campaign daily budget ($)'
      : bMode === 'abo' ? `Ad set daily budget ($ × ${plan ? plan.adsetCount : 'N'} adsets)`
      : 'Budget ($) — pick a mode first';
    // Bid amount only meaningful for cap strategies; disable when explicitly "no cap".
    const bidNeedsCapUI = state.bidStrategyOverride !== 'LOWEST_COST_WITHOUT_CAP';

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
    else if (!hasAccounts) blockReason = '⬆ Select at least one target account (step 2)';
    else if (!state.pageIdOverride && !state.rows.some(r => r['Link Object ID'])) blockReason = '⬆ Set Page ID (step 3)';
    else if (state.pageIdOverride && !/^\d{10,20}$/.test(state.pageIdOverride)) blockReason = `⚠ Page ID "${state.pageIdOverride}" invalid (10-20 digits)`;
    else if (state.pageIdOverride && state.pagesList.length && !state.pagesList.find(p => p.id === state.pageIdOverride)) blockReason = `⚠ Page ${state.pageIdOverride} not in primary account`;
    else if (!effPixel) blockReason = '⬆ Set Pixel (step 4)';
    else if (!state.dsaBeneficiary) blockReason = '⚠ Set DSA Advertiser (step 5) — FB requires it for almost all ads now';
    else if (!pixelValid) blockReason = `⚠ Pixel "${effPixel}" invalid format (8-20 digits)`;
    else if (state.pixelsList.length && !pixelInAccount) blockReason = `⚠ Pixel ${effPixel} not in primary account`;
    // v0.7.0: a zero budget is a guaranteed FB rejection — catch it before launch.
    else if (plan && plan.isCBO && !plan.cboBudget) blockReason = '⚠ Campaign budget is 0 — set it (1b) or in CSV';
    else if (plan && !plan.isCBO && !plan.aboTotal) blockReason = '⚠ Ad set budget is 0 — set it (1b) or in CSV';
    const runDisabled = !!blockReason;
    const totalAds = plan?.adCount || 0;
    const buttonLabel = blockReason
      ? blockReason
      : isMulti
        ? `🚀 Launch ${totalAds} ads × ${state.targetAccIds.length} accounts (${totalAds * state.targetAccIds.length} ops)`
        : `🚀 Launch ${totalAds} ads to ${esc(selectedAccs[0]?.name || 'account')}`;
    const progressPct = state.progress.total ? Math.round(state.progress.done / state.progress.total * 100) : 0;

    panel.innerHTML = `
      <h2>🚀 FB Launcher v0.7.0
        <button class="close" id="fbl-close" title="Close">×</button>
      </h2>
      <div class="sub">CSV/TSV → FB Marketing API. Bypasses bulk-upload bugs.</div>

      <div class="status ${state.status.type}">${esc(state.status.text)}</div>

      ${state.presets.length || state.rows.length ? `
      <div class="field" style="background:rgba(168,85,247,.06);border:1px solid rgba(168,85,247,.2);border-radius:6px;padding:8px 10px">
        <label style="color:#c084fc">⭐ Presets <span style="color:#6e7681">— ${state.presets.length} saved</span></label>
        <div style="display:flex;gap:5px;align-items:center">
          <select id="fbl-preset-select" style="flex:1">
            <option value="">— select preset to load —</option>
            ${state.presets.map(p => {
              const dt = new Date(p.createdAt);
              const dStr = `${String(dt.getMonth()+1).padStart(2,'0')}/${String(dt.getDate()).padStart(2,'0')}`;
              const tag = p.auto ? ' 🤖' : '';
              return `<option value="${esc(p.id)}" ${state.selectedPresetId === p.id ? 'selected' : ''}>${esc(p.name)} · ${dStr}${tag}</option>`;
            }).join('')}
          </select>
          <button id="fbl-preset-save" ${!state.rows.length ? 'disabled' : ''} title="Save current CSV + settings as preset">💾</button>
          <button id="fbl-preset-delete" ${!state.selectedPresetId ? 'disabled' : ''} title="Delete selected preset">🗑</button>
        </div>
        <div style="display:flex;gap:8px;align-items:center;margin-top:6px;flex-wrap:wrap">
          <label style="display:flex;align-items:center;gap:4px;margin:0;cursor:pointer;font-size:11px;color:#cbd5e1">
            <input type="checkbox" id="fbl-auto-save" ${state.autoSavePreset ? 'checked' : ''} style="width:auto;margin:0">
            🤖 Auto-save preset on successful launch
          </label>
          <span style="flex:1"></span>
          <button id="fbl-preset-export" ${!state.presets.length ? 'disabled' : ''} title="Download all presets as JSON" style="padding:4px 8px;font-size:11px">📤 Export</button>
          <button id="fbl-preset-import-btn" title="Load presets from JSON" style="padding:4px 8px;font-size:11px">📥 Import</button>
          <input type="file" id="fbl-preset-import" accept=".json,application/json" style="display:none">
        </div>
        <div style="font-size:10px;color:#6e7681;margin-top:4px">Saves: CSV, all overrides, prefix, DSA, assignments. Excludes: creatives, account.</div>
      </div>` : ''}

      <div class="field" ${!state.rows.length ? 'style="background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.25);border-radius:6px;padding:8px 10px"' : ''}>
        <label>1. CSV file ${!state.rows.length ? '<span style="color:#ef4444">⚠ required — defines campaign, adsets, geo, budget</span>' : ''}</label>
        <input type="file" id="fbl-csv" accept=".csv,.tsv,.txt">
        ${state.fileName ? `<div style="font-size:11px;color:#22c55e;margin-top:4px">📄 ${esc(state.fileName)} · ${state.rows.length} rows parsed</div>` : ''}
        <div style="margin-top:8px">
          <div style="font-size:11px;color:#94a3b8;margin-bottom:3px">Campaign name prefix (optional) <span style="color:#6e7681">— launcher appends "| ${plan?.isCBO ? 'CBO' : 'ABO'} $X/d | Nas Mads | MMDDYY | acc_id"</span></div>
          <input type="text" id="fbl-camp-prefix" value="${esc(state.campNamePrefix)}" placeholder="e.g. VERT | Multi | COLD TEST">
          ${state.campNamePrefix && plan ? `<div style="font-size:10px;color:#22c55e;margin-top:3px;font-family:ui-monospace,monospace;word-break:break-all">Preview: ${esc(state.campNamePrefix)} | ${plan.isCBO ? 'CBO' : 'ABO'} $${plan.isCBO ? plan.cboBudget : plan.aboTotal}/d | ${plan.adsetCount}as${plan.adCount}ads | ${(() => { const n = new Date(); return String(n.getMonth()+1).padStart(2,'0') + String(n.getDate()).padStart(2,'0') + String(n.getFullYear()).slice(-2); })()} | ${esc(isMulti ? '<acc_id>' : (primaryAcc || '<acc_id>'))}</div>` : ''}
        </div>
        <div style="margin-top:10px">
          <div style="font-size:11px;color:#94a3b8;margin-bottom:4px">Name markers <span style="color:#6e7681">— appended " | X" to campaign + adset + ad names. CTRL = autorule opt-in.</span></div>
          <div class="chips">
            ${MARKER_PRESETS.map(m => `<span class="chip ${state.markers.includes(m) ? 'on' : ''}" data-marker="${esc(m)}">${esc(m)}</span>`).join('')}
          </div>
          <input type="text" id="fbl-markers-freeform" value="${esc(state.markersFreeform)}" placeholder="extra markers, pipe-separated — e.g. COLD | Q2" style="margin-top:6px">
          ${state.markers.length ? `<div style="font-size:10px;color:#22c55e;margin-top:4px;font-family:ui-monospace,monospace;word-break:break-all">Names get: <b>${esc(state.markers.map(m => '| ' + m).join(' '))}</b> ${state.markers.includes('CTRL') ? '' : '<span style="color:#fbbf24">· no CTRL → autorules skip these</span>'}</div>` : ''}
        </div>
      </div>

      <div class="field">
        <label>1b. Budget &amp; Bidding <span style="color:#6e7681">— fill to override CSV. Mode sets CBO (campaign budget) vs ABO (per-adset).</span></label>
        <div class="grid2">
          <div class="field">
            <label>Budget mode</label>
            <select id="fbl-budget-mode">
              <option value="" ${bMode === '' ? 'selected' : ''}>— CSV auto-detect —</option>
              <option value="cbo" ${bMode === 'cbo' ? 'selected' : ''}>CBO — campaign budget</option>
              <option value="abo" ${bMode === 'abo' ? 'selected' : ''}>ABO — ad set budget</option>
            </select>
          </div>
          <div class="field">
            <label>${budgetAmtLabel}</label>
            <input type="text" id="fbl-budget-amount" value="${esc(budgetAmtVal)}" placeholder="${bMode ? 'e.g. 50' : 'select mode →'}"${bMode ? '' : ' disabled style="opacity:.4"'}>
          </div>
        </div>
        <div class="grid2" style="margin-top:10px">
          <div class="field">
            <label>Bid strategy</label>
            <select id="fbl-bid-strategy">
              <option value="" ${state.bidStrategyOverride === '' ? 'selected' : ''}>— CSV —</option>
              <option value="LOWEST_COST_WITHOUT_CAP" ${state.bidStrategyOverride === 'LOWEST_COST_WITHOUT_CAP' ? 'selected' : ''}>Highest volume (no cap)</option>
              <option value="COST_CAP" ${state.bidStrategyOverride === 'COST_CAP' ? 'selected' : ''}>Cost cap</option>
              <option value="LOWEST_COST_WITH_BID_CAP" ${state.bidStrategyOverride === 'LOWEST_COST_WITH_BID_CAP' ? 'selected' : ''}>Bid cap</option>
            </select>
          </div>
          <div class="field">
            <label>Bid / cost cap ($) <span style="color:#6e7681">${bidNeedsCapUI ? '' : '(no cap → unused)'}</span></label>
            <input type="text" id="fbl-bid-amount" value="${esc(state.bidAmountOverride)}" placeholder="${bidNeedsCapUI ? 'e.g. 12.50' : 'n/a for highest-volume'}"${bidNeedsCapUI ? '' : ' disabled style="opacity:.4"'}>
          </div>
        </div>
      </div>

      ${previewHtml}

      <div class="field">
        <label>2. Target accounts <span style="color:#6e7681">— ${hasAccounts ? `<b style="color:#22c55e">${state.targetAccIds.length} selected</b>` : 'pick one or more'}</span></label>
        <div class="row">
          <input type="text" id="fbl-acc-filter" placeholder="Filter by name, ID, BM..." value="${esc(state.accFilter)}" style="flex:2">
          <button id="fbl-reload-acc" ${accountsLoading ? 'disabled' : ''}>${accountsLoading ? '⏳' : '↻'}</button>
          <button id="fbl-acc-toggle" title="Show/hide accounts list">${state.showAccountPicker ? '▼' : '▶'} List</button>
        </div>
        ${selectedAccs.length ? `
        <div style="margin-top:6px;display:flex;gap:4px;flex-wrap:wrap">
          ${selectedAccs.map(a => `
            <span style="background:rgba(34,197,94,.12);border:1px solid rgba(34,197,94,.35);border-radius:12px;padding:2px 8px;font-size:11px;color:#d1fae5;display:inline-flex;align-items:center;gap:5px" title="${esc(a.id)} · BM: ${esc(a.bm)}">
              ${esc(a.label)}
              <button class="fbl-acc-remove" data-acc="${esc(a.id)}" style="background:none;border:none;color:#fca5a5;padding:0 2px;cursor:pointer;font-size:13px;line-height:1" title="Remove">✕</button>
            </span>
          `).join('')}
        </div>` : ''}
        ${state.showAccountPicker ? `
        <div id="fbl-acc-list" style="margin-top:6px;max-height:240px;overflow:auto;border:1px solid #334155;border-radius:5px;background:#1e293b">
          ${visibleAccs.length ? visibleAccs.map(a => {
            const isSel = state.targetAccIds.includes(a.id);
            return `<label style="display:flex;align-items:center;gap:8px;padding:5px 10px;cursor:pointer;font-size:12px;${isSel ? 'background:rgba(34,197,94,.08)' : ''};border-bottom:1px solid #0f172a">
              <input type="checkbox" class="fbl-acc-cb" data-acc="${esc(a.id)}" ${isSel ? 'checked' : ''}>
              <span style="flex:1;color:#cbd5e1"><span style="color:#94a3b8">${esc(a.bm)}</span> · ${esc(a.label)} <span style="color:#64748b;font-size:10px">${esc(a.id)}</span></span>
            </label>`;
          }).join('') : '<div style="padding:8px 10px;color:#64748b;font-size:11px">No accounts match filter</div>'}
        </div>` : ''}
      </div>

      <div class="grid2">
      <div class="field">
        <label>3. Page ID <span style="color:#6e7681">— ${state.pagesLoading ? 'loading pages...' : `${state.pagesList.length} pages found`}</span></label>
        ${state.pagesList.length ? `
        <select id="fbl-page-select" style="margin-bottom:5px">
          <option value="">— from CSV "Link Object ID" —</option>
          ${state.pagesList.map(p => `<option value="${esc(p.id)}" ${state.pageIdOverride === p.id ? 'selected' : ''}>${esc(p.name)} (${esc(p.id)})</option>`).join('')}
        </select>` : ''}
        <input type="text" id="fbl-page-id" value="${esc(state.pageIdOverride)}" placeholder="${state.pagesList.length ? 'or paste custom page ID' : 'page ID (14-20 digits) — empty = use CSV'}" style="margin-bottom:8px">
        <label style="display:flex;align-items:center;gap:6px;margin-top:5px;cursor:pointer">
          <input type="checkbox" id="fbl-use-page-as-actor" ${state.usePageAsActor ? 'checked' : ''}>
          <span><b>Use Facebook Page as IG identity</b> <span style="color:#6e7681">— skips Instagram lookup; ads inherit Page identity for IG placements (Ads Manager shows "Use Facebook Page")</span></span>
        </label>
        <label style="margin-top:5px;${state.usePageAsActor ? 'opacity:.4;pointer-events:none' : ''}">Instagram Account ID <span style="color:#6e7681">— empty = auto-fetch from Page's connected IG${isMulti ? ' · ⚠ same ID for all accounts' : ''}</span></label>
        <input type="text" id="fbl-ig-id" value="${esc(state.instagramOverride)}" placeholder="leave empty → launcher auto-detects from Page · or paste IG actor ID to override"${state.usePageAsActor ? ' disabled style="opacity:.4"' : ''}>
        ${(() => {
          // v0.6.4: cache key changed to "acc__page" since same page can resolve differently
          // per account. Hint shows status for the primary selected account.
          const probePage = state.pageIdOverride || (state.rows[0] && stripPfx(state.rows[0]['Link Object ID'] || '')) || '';
          const probeAcc = primaryAcc || '';
          if (!probePage && !probeAcc) return '';
          const key = `${probeAcc}__${probePage}`;
          const ig = state.pageIgMap[key];
          if (state.pageIgLoading[key]) {
            return `<div style="font-size:11px;color:#94a3b8;margin-top:4px">🔄 fetching Instagram actor for account ${esc(probeAcc || '?')}...</div>`;
          }
          if (!ig) return '';
          if (state.instagramOverride) {
            return `<div style="font-size:11px;color:#6e7681;margin-top:4px">Override active — auto-detected (${esc(ig.igId || 'none')}) ignored</div>`;
          }
          if (ig.igId) {
            const srcLabel = ig.source === 'account' ? `account actor${ig.count > 1 ? ` · 1 of ${ig.count}` : ''}` : ig.source === 'page' ? '⚠ page actor (may not be promotable here)' : 'detected';
            const color = ig.source === 'account' ? '#22c55e' : '#fbbf24';
            return `<div style="font-size:11px;color:${color};margin-top:4px">🔗 Auto-detected (${srcLabel}): <b>${esc(ig.igId)}</b>${ig.igName ? ` @${esc(ig.igName)}` : ''}${isMulti ? ' · Note: lookup runs per account at launch' : ''}</div>`;
          }
          return `<div style="font-size:11px;color:#fbbf24;margin-top:4px">⚠ No IG actor available for account ${esc(probeAcc || '?')} — instagram_user_id omitted at launch (FB uses default)</div>`;
        })()}
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
      </div>

      <div class="field" ${!state.dsaBeneficiary ? 'style="background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.25);border-radius:6px;padding:8px 10px"' : ''}>
        <label>5. DSA Advertiser <span style="color:${state.dsaBeneficiary ? '#22c55e' : '#fbbf24'}">${state.dsaBeneficiary ? '✓ set' : '⚠ required — FB rejects ad sets without it'}</span>${hasEuTargeting(state.rows) ? ' <span style="color:#fbbf24">· EU targeting detected</span>' : ''}</label>
        <div class="grid2">
          <div class="field"><input type="text" id="fbl-dsa-beneficiary" value="${esc(state.dsaBeneficiary)}" placeholder="Beneficiary — business or page name"></div>
          <div class="field"><input type="text" id="fbl-dsa-payer" value="${esc(state.dsaPayer)}" placeholder="Payer (optional — defaults to beneficiary)"></div>
        </div>
      </div>

      <div class="field">
        <label>5b. Targeting <span style="color:#6e7681">— fill to override CSV for ALL adsets; empty = use CSV column</span>${plan?.sacList.length ? ' <span style="color:#fbbf24">· SAC active — state targeting disabled (country-level only)</span>' : ''}</label>
        <div class="grid2">
          <div class="field">
            <label>Countries <span style="color:#6e7681">(codes, e.g. US,CA)</span></label>
            <input type="text" id="fbl-geo-countries" value="${esc(state.geoCountriesOverride)}" placeholder="empty = CSV (default US)">
          </div>
          <div class="field">
            <label>US states <span style="color:#6e7681">${plan?.sacList.length ? '(disabled under SAC)' : '(names, e.g. Texas,Florida)'}</span></label>
            <input type="text" id="fbl-geo-states" value="${esc(state.geoStatesOverride)}" placeholder="empty = CSV"${plan?.sacList.length ? ' disabled style="opacity:.4"' : ''}>
          </div>
        </div>
        <div class="grid3" style="margin-top:10px">
          <div class="field">
            <label>Age min</label>
            <input type="text" id="fbl-age-min" value="${esc(state.ageMinOverride)}" placeholder="CSV/18">
          </div>
          <div class="field">
            <label>Age max</label>
            <input type="text" id="fbl-age-max" value="${esc(state.ageMaxOverride)}" placeholder="CSV/65">
          </div>
          <div class="field">
            <label>Gender</label>
            <select id="fbl-gender">
              <option value="" ${state.genderOverride === '' ? 'selected' : ''}>— CSV —</option>
              <option value="all" ${state.genderOverride === 'all' ? 'selected' : ''}>All</option>
              <option value="men" ${state.genderOverride === 'men' ? 'selected' : ''}>Men</option>
              <option value="women" ${state.genderOverride === 'women' ? 'selected' : ''}>Women</option>
            </select>
          </div>
        </div>
        <div class="grid2" style="margin-top:10px">
          <div class="field">
            <label>Placements</label>
            <select id="fbl-placement">
              <option value="" ${state.placementPreset === '' ? 'selected' : ''}>— CSV —</option>
              <option value="all" ${state.placementPreset === 'all' ? 'selected' : ''}>All (automatic)</option>
              <option value="fb_ig" ${state.placementPreset === 'fb_ig' ? 'selected' : ''}>FB + IG</option>
              <option value="fb_only" ${state.placementPreset === 'fb_only' ? 'selected' : ''}>FB only</option>
              <option value="feeds_only" ${state.placementPreset === 'feeds_only' ? 'selected' : ''}>Feeds only</option>
              <option value="reels_only" ${state.placementPreset === 'reels_only' ? 'selected' : ''}>Reels only</option>
            </select>
          </div>
          <div class="field">
            <label>Advantage Audience</label>
            <select id="fbl-advantage">
              <option value="" ${state.advantageAudienceOverride === '' ? 'selected' : ''}>— CSV —</option>
              <option value="0" ${state.advantageAudienceOverride === '0' ? 'selected' : ''}>Off</option>
              <option value="1" ${state.advantageAudienceOverride === '1' ? 'selected' : ''}>On</option>
            </select>
          </div>
        </div>
      </div>

      <div class="field">
        <label>6. Creatives — upload files OR paste hashes/JSON <span style="color:#6e7681">— overrides CSV Image Hash &amp; Video ID</span></label>
        <div style="margin-bottom:8px">
          <div style="font-size:10px;color:#6e7681;margin-bottom:5px">💡 Upload <code>video1.mp4</code> + <code>video1.jpg</code> (same base name) → auto-pairs as video + thumbnail</div>
          ${!hasAccounts ? '<div style="font-size:11px;color:#fbbf24;padding:6px 8px;background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.25);border-radius:5px;margin-bottom:5px">⚠ Select at least one target account (step 2) before uploading</div>' : ''}
          ${isMulti ? `<div style="font-size:11px;color:#22c55e;padding:6px 8px;background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.25);border-radius:5px;margin-bottom:5px">🌐 Multi-account: each file will be uploaded into all ${state.targetAccIds.length} selected accounts (sequential)</div>` : ''}
          <div id="fbl-drop" style="border:2px dashed #334155;border-radius:8px;padding:20px 12px;text-align:center;cursor:${hasAccounts && !state.uploading ? 'pointer' : 'not-allowed'};color:#475569;font-size:12px;user-select:none;transition:border-color .15s,background .15s;${hasAccounts && !state.uploading ? '' : 'opacity:.5'}">
            <div style="font-size:13px;font-weight:600;letter-spacing:2px;margin-bottom:4px;color:#475569">[ DROP ZONE ]</div>
            Drop images or videos here<br>
            <span style="font-size:10px;color:#334155">PNG / JPG / MP4 / MOV — or click to browse</span>
          </div>
          <input type="file" id="fbl-upload-files" multiple accept="image/*,video/*" ${!hasAccounts || state.uploading ? 'disabled' : ''} style="display:none">
          ${state.uploads.length ? `<div style="margin-top:8px;display:flex;flex-direction:column;gap:4px">${state.uploads.map((u, idx) => {
            const fmtSize = (b) => b < 1024 ? b + 'B' : b < 1048576 ? (b/1024).toFixed(0)+'KB' : (b/1048576).toFixed(1)+'MB';
            const iconBg = u.type === 'video' ? '#c084fc' : '#60a5fa';
            const statusMap = {
              pending: { text: 'pending', cls: 's-pending', barCls: '' },
              uploading: { text: 'uploading', cls: 's-uploading', barCls: 'uploading' },
              processing: { text: u.processingStatus || 'processing', cls: 's-processing', barCls: 'processing' },
              done: { text: 'done', cls: 's-done', barCls: 'done' },
              error: { text: 'error', cls: 's-error', barCls: 'error' },
            };
            const s = statusMap[u.status] || statusMap.pending;
            const wasPairedThumb = u.type === 'image' && u.status === 'done' && state.creativesParsed?.mode === 'ads'
              && state.creativesParsed.items.some(it => it.videoId && it.thumbnailHash === u.imageHash);
            const meta = u.status === 'done'
              ? wasPairedThumb ? '<span style="color:#a78bfa">🔗 thumb</span>' : `<code style="font-size:10px;color:#64748b">${esc((u.imageHash || u.videoId || '').slice(0, 12))}…</code>`
              : u.status === 'error' ? `<span style="color:#f87171;font-size:10px">${esc((u.error || '').slice(0, 22))}</span>`
              : `<span style="color:#475569;font-size:10px">${fmtSize(u.size || 0)}</span>`;
            const showBar = u.status !== 'pending';
            const showErrToggle = u.status === 'error';
            return `
            <div class="fbl-uitem ${u.status === 'error' ? 'has-error' : ''}" style="padding:5px 8px;background:#1e293b;border-radius:5px;border:1px solid ${u.status === 'error' ? '#7f1d1d' : '#334155'}">
              <div style="display:grid;grid-template-columns:24px 1fr auto auto;align-items:center;gap:6px">
                <div style="font-size:9px;font-weight:700;text-align:center;padding:1px 3px;border-radius:3px;border:1px solid ${iconBg};color:${iconBg}">${u.type === 'video' ? 'VID' : 'IMG'}</div>
                <div style="font-size:11px;color:#cbd5e1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(u.name)}">${esc(u.name)}</div>
                <div style="font-size:10px;max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${meta}</div>
                <div class="${s.cls}" style="font-size:11px;min-width:60px;text-align:right">${esc(s.text)}</div>
              </div>
              ${showBar ? `<div style="height:3px;background:#0f172a;border-radius:2px;overflow:hidden;margin-top:3px"><div class="fbl-bar ${s.barCls}"></div></div>` : ''}
              ${showErrToggle ? `<div class="fbl-err-toggle" data-idx="${idx}" style="font-size:10px;color:#94a3b8;cursor:pointer;margin-top:4px;background:#0f172a;padding:2px 6px;border-radius:3px;border:1px solid #334155;display:inline-block">${u.expanded ? '[−] hide details' : '[+] show details'}</div>` : ''}
              ${showErrToggle && u.expanded ? `<div style="margin-top:6px;padding:8px;background:#020617;border:1px solid #7f1d1d;border-radius:4px;font-size:10.5px;line-height:1.5;color:#cbd5e1;white-space:pre-wrap;word-break:break-all;font-family:ui-monospace,monospace">${renderErrorPanel(u)}</div>` : ''}
            </div>`;
          }).join('')}</div>` : ''}
        </div>
        <div style="font-size:11px;color:#94a3b8;margin-bottom:4px">Or paste manually:</div>
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

      ${plan?.adsMode && plan.adsModeItems.length > 1 && plan.adsetCount > 1 ? `
      <div class="field" style="background:rgba(34,197,94,.05);border:1px solid rgba(34,197,94,.2);border-radius:6px;padding:8px 10px">
        <label style="cursor:pointer" id="fbl-assign-toggle">
          ${state.showAssignments ? '▼' : '▶'} 6.5. Per-adset creative assignment (optional)
          <span style="color:#6e7681">— ${Object.keys(state.adsetAssignments).length ? `${Object.keys(state.adsetAssignments).length} adset(s) customized` : 'all creatives → all adsets'}</span>
        </label>
        ${state.showAssignments ? `
        <div style="margin-top:8px;font-size:11px;color:#94a3b8">
          Click+drag to paint cells · Shift+click column/row header to toggle whole column/row · Use buttons below for bulk actions.
        </div>
        <div id="fbl-matrix-scroll" style="margin-top:6px;max-height:280px;overflow:auto;border:1px solid #334155;border-radius:5px;user-select:none">
          <table style="border-collapse:collapse;font-size:11px;min-width:100%">
            <thead style="position:sticky;top:0;background:#1e293b;z-index:2">
              <tr>
                <th style="text-align:left;padding:5px 8px;border-bottom:1px solid #334155;color:#94a3b8;font-weight:600;position:sticky;left:0;background:#1e293b;z-index:3;min-width:180px">Adset <span style="color:#64748b;font-weight:400">(shift+click = whole row)</span></th>
                ${plan.adsModeItems.map((it, i) => `<th class="fbl-col-header" data-col="${i}" style="padding:5px 6px;border-bottom:1px solid #334155;border-left:1px solid #334155;color:${it.videoId ? '#c084fc' : '#60a5fa'};font-weight:600;font-size:10px;text-align:center;white-space:nowrap;cursor:pointer" title="Shift+click to toggle whole column: ${esc(it.name)}">${esc(it.name.length > 14 ? it.name.slice(0, 14) + '…' : it.name)}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${[...plan.groups.keys()].map(adsetName => {
                const assigned = state.adsetAssignments[adsetName] || [];
                const allChecked = assigned.length === 0; // empty = all
                return `<tr>
                  <td class="fbl-row-header" data-adset="${esc(adsetName)}" style="padding:5px 8px;border-bottom:1px solid #1e293b;color:#cbd5e1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;position:sticky;left:0;background:#0f172a;z-index:1;max-width:220px;cursor:pointer" title="Shift+click to toggle whole row: ${esc(adsetName)}">${esc(adsetName)}</td>
                  ${plan.adsModeItems.map((_, i) => {
                    const checked = allChecked || assigned.includes(i);
                    return `<td class="fbl-assign-cell" data-adset="${esc(adsetName)}" data-idx="${i}" style="padding:3px 6px;border-bottom:1px solid #1e293b;border-left:1px solid #1e293b;text-align:center;cursor:pointer;background:${checked ? 'rgba(34,197,94,.12)' : 'transparent'}"><input type="checkbox" class="fbl-assign-cb" data-adset="${esc(adsetName)}" data-idx="${i}" ${checked ? 'checked' : ''} style="pointer-events:none"></td>`;
                  }).join('')}
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
        <div style="margin-top:6px;display:flex;gap:5px;flex-wrap:wrap">
          <button id="fbl-assign-fill" style="font-size:11px;padding:3px 8px">✓ Fill all</button>
          <button id="fbl-assign-clear" style="font-size:11px;padding:3px 8px">○ Clear all</button>
          <button id="fbl-assign-reset" style="font-size:11px;padding:3px 8px" title="Drops all per-adset customization → defaults to 'all creatives to all adsets'">↺ Reset to default</button>
        </div>
        ` : ''}
      </div>` : ''}

      <div class="field">
        <label>7. Link override (optional) <span style="color:#6e7681">— tokens: {pixel_id} {account_id} {adset_name} {ad_name} {geo} {date}</span></label>
        <input type="text" id="fbl-link-override" value="${esc(state.linkOverride)}" placeholder="empty = use CSV Link column. e.g. https://t.com/click?p={pixel_id}&amp;geo={geo}">
      </div>

      <div class="field">
        <label>8. URL Tags override (optional) <span style="color:#6e7681">— same tokens; {{fb.macros}} preserved</span></label>
        <input type="text" id="fbl-tags-override" value="${esc(state.urlTagsOverride)}" placeholder="empty = use CSV URL Tags. e.g. keyword={pixel_id}&amp;sub2={account_id}&amp;sub5={{ad.name}}">
      </div>

      <div class="field">
        <label>9. Ad copy override (optional) <span style="color:#6e7681">— same for all ads; per-creative title/body/cta in ads-mode JSON wins</span></label>
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
        <label>10. Quick: replace single URL Tag param <span style="color:#6e7681">— skipped if step 8 is set</span></label>
        <div class="row">
          <input type="text" id="fbl-tag-param" value="${esc(state.urlTagParam)}" placeholder="sub2" style="flex:1">
          <select id="fbl-tag-mode" style="flex:1.5">
            <option value="acc_id" ${state.urlTagMode === 'acc_id' ? 'selected' : ''}>= account ID</option>
            <option value="ad_name" ${state.urlTagMode === 'ad_name' ? 'selected' : ''}>= creative name (file)</option>
            <option value="keep" ${state.urlTagMode === 'keep' ? 'selected' : ''}>keep as-is</option>
            <option value="empty" ${state.urlTagMode === 'empty' ? 'selected' : ''}>empty</option>
            <option value="custom" ${state.urlTagMode === 'custom' ? 'selected' : ''}>custom...</option>
          </select>
        </div>
        ${state.urlTagMode === 'custom' ? `<input type="text" id="fbl-tag-custom" value="${esc(state.urlTagCustom)}" placeholder="custom value" style="margin-top:5px">` : ''}
      </div>

      <div class="field">
        <label>11. Create status</label>
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

    // Restore scroll positions on previously-scrolled elements (must come BEFORE focus
    // restore — focus() can trigger scroll-into-view which would overwrite scrollLeft)
    scrollSnapshot.forEach((pos, id) => {
      const el = document.getElementById(id);
      if (el) {
        if (pos.left) el.scrollLeft = pos.left;
        if (pos.top) el.scrollTop = pos.top;
      }
    });
    if (panelScrollTop) panel.scrollTop = panelScrollTop;

    // Restore focus + cursor position to the same input/textarea after re-render
    if (activeId) {
      const el = document.getElementById(activeId);
      if (el) {
        // preventScroll avoids jumping the parent containers when focusing a checkbox
        try { el.focus({ preventScroll: true }); } catch { el.focus(); }
        try {
          if (activeSelStart != null && typeof el.setSelectionRange === 'function') {
            el.setSelectionRange(activeSelStart, activeSelEnd ?? activeSelStart);
          }
        } catch {}
        if (activeScrollTop != null) el.scrollTop = activeScrollTop;
      }
    }
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
    // Presets
    document.getElementById('fbl-preset-select')?.addEventListener('change', e => {
      if (e.target.value) loadPreset(e.target.value);
      else state.selectedPresetId = '';
    });
    document.getElementById('fbl-preset-save')?.addEventListener('click', savePreset);
    document.getElementById('fbl-preset-delete')?.addEventListener('click', deletePreset);
    document.getElementById('fbl-auto-save')?.addEventListener('change', e => { state.autoSavePreset = e.target.checked; });
    document.getElementById('fbl-preset-export')?.addEventListener('click', exportPresets);
    document.getElementById('fbl-preset-import-btn')?.addEventListener('click', () => document.getElementById('fbl-preset-import')?.click());
    document.getElementById('fbl-preset-import')?.addEventListener('change', e => {
      const f = e.target.files && e.target.files[0];
      if (f) importPresets(f);
      e.target.value = '';  // allow re-import same file
    });
    // Per-adset assignment (v0.5.3: paint-drag + shift+click + bulk buttons)
    document.getElementById('fbl-assign-toggle')?.addEventListener('click', () => {
      state.showAssignments = !state.showAssignments;
      render();
    });
    document.getElementById('fbl-assign-reset')?.addEventListener('click', () => {
      state.adsetAssignments = {};
      render();
    });

    // Bulk Clear / Fill — operate on every adset in plan.
    const bulkApply = (allOn) => {
      const p = analyzePlan();
      if (!p?.adsMode) return;
      const total = p.adsModeItems.length;
      const adsets = [...p.groups.keys()];
      for (const adsetName of adsets) {
        if (allOn) {
          delete state.adsetAssignments[adsetName];  // empty = all
        } else {
          state.adsetAssignments[adsetName] = [];  // explicit empty = none
        }
      }
      // If clearing, we keep [] entries so the user can see they're customized.
      // If filling, we drop entries so state stays clean.
      render();
    };
    document.getElementById('fbl-assign-fill')?.addEventListener('click', () => bulkApply(true));
    document.getElementById('fbl-assign-clear')?.addEventListener('click', () => bulkApply(false));

    // Helper: is a cell currently checked? Reads state directly so paint-drag sees fresh values.
    const isCellChecked = (adsetName, idx, total) => {
      const arr = state.adsetAssignments[adsetName];
      if (!arr) return true;       // implicit "all"
      return arr.includes(idx);
    };

    // Shift+click on column header → toggle whole column. Determines new value from the first row.
    panel.querySelectorAll('.fbl-col-header').forEach(th => {
      th.addEventListener('click', e => {
        if (!e.shiftKey) return;
        const p = analyzePlan();
        if (!p?.adsMode) return;
        const idx = +th.dataset.col;
        const total = p.adsModeItems.length;
        const adsets = [...p.groups.keys()];
        const anyChecked = adsets.some(a => isCellChecked(a, idx, total));
        const newVal = !anyChecked;  // if all unchecked → check all, otherwise uncheck all
        for (const a of adsets) setAssignment(a, idx, newVal, total);
        render();
      });
    });

    // Shift+click on row header → toggle whole row.
    panel.querySelectorAll('.fbl-row-header').forEach(td => {
      td.addEventListener('click', e => {
        if (!e.shiftKey) return;
        const p = analyzePlan();
        if (!p?.adsMode) return;
        const adsetName = td.dataset.adset;
        const total = p.adsModeItems.length;
        const anyChecked = Array.from({ length: total }, (_, i) => isCellChecked(adsetName, i, total)).some(Boolean);
        const newVal = !anyChecked;
        for (let i = 0; i < total; i++) setAssignment(adsetName, i, newVal, total);
        render();
      });
    });

    // Paint-drag: mousedown sets the paint value (= opposite of current cell),
    // mouseenter on other cells while button held applies the same value.
    // During the drag we update DOM in-place (no full render) to keep it snappy —
    // a synchronizing render() runs on mouseup. Excel-style; most intuitive at 5×5+.
    const paintTotal = () => {
      const p = analyzePlan();
      return p?.adsMode ? p.adsModeItems.length : 0;
    };
    const paintCellInPlace = (td, checked) => {
      td.style.background = checked ? 'rgba(34,197,94,.12)' : 'transparent';
      const cb = td.querySelector('input.fbl-assign-cb');
      if (cb) cb.checked = checked;
    };
    panel.querySelectorAll('.fbl-assign-cell').forEach(td => {
      td.addEventListener('mousedown', e => {
        e.preventDefault();
        const total = paintTotal();
        if (!total) return;
        const adsetName = td.dataset.adset;
        const idx = +td.dataset.idx;
        const wasChecked = isCellChecked(adsetName, idx, total);
        state.matrixPaintValue = !wasChecked;
        setAssignment(adsetName, idx, state.matrixPaintValue, total);
        paintCellInPlace(td, state.matrixPaintValue);
      });
      td.addEventListener('mouseenter', () => {
        if (state.matrixPaintValue === null) return;
        const total = paintTotal();
        if (!total) return;
        const adsetName = td.dataset.adset;
        const idx = +td.dataset.idx;
        if (isCellChecked(adsetName, idx, total) === state.matrixPaintValue) return;
        setAssignment(adsetName, idx, state.matrixPaintValue, total);
        paintCellInPlace(td, state.matrixPaintValue);
      });
    });
    document.getElementById('fbl-camp-prefix')?.addEventListener('input', e => {
      state.campNamePrefix = e.target.value;
      render();  // re-render to update preview
    });
    const uploadInput = document.getElementById('fbl-upload-files');
    const dropZone = document.getElementById('fbl-drop');
    uploadInput?.addEventListener('change', e => {
      const files = Array.from(e.target.files || []);
      if (files.length) runUploads(files);
      e.target.value = '';
    });
    if (dropZone) {
      const accReady = () => state.targetAccIds.length > 0;
      dropZone.addEventListener('click', () => {
        if (accReady() && !state.uploading) uploadInput?.click();
      });
      dropZone.addEventListener('dragover', e => {
        e.preventDefault();
        if (accReady() && !state.uploading) dropZone.classList.add('over');
      });
      dropZone.addEventListener('dragleave', () => dropZone.classList.remove('over'));
      dropZone.addEventListener('drop', e => {
        e.preventDefault();
        dropZone.classList.remove('over');
        if (!accReady() || state.uploading) return;
        const files = Array.from(e.dataTransfer?.files || []);
        if (files.length) runUploads(files);
      });
    }
    // Per-file error details toggle
    panel.querySelectorAll('.fbl-err-toggle').forEach(el => {
      el.addEventListener('click', () => {
        const idx = +el.dataset.idx;
        if (state.uploads[idx]) {
          state.uploads[idx].expanded = !state.uploads[idx].expanded;
          render();
        }
      });
    });
    document.getElementById('fbl-reload-acc')?.addEventListener('click', () => loadAccounts());
    document.getElementById('fbl-acc-filter')?.addEventListener('input', e => {
      state.accFilter = e.target.value;
      render();
    });
    // v0.6: multi-select account picker.
    document.getElementById('fbl-acc-toggle')?.addEventListener('click', () => {
      state.showAccountPicker = !state.showAccountPicker;
      render();
    });
    panel.querySelectorAll('.fbl-acc-cb').forEach(cb => {
      cb.addEventListener('change', e => {
        const accId = e.target.dataset.acc;
        toggleAccount(accId);
      });
    });
    panel.querySelectorAll('.fbl-acc-remove').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        toggleAccount(btn.dataset.acc);
      });
    });
    document.getElementById('fbl-page-select')?.addEventListener('change', e => {
      state.pageIdOverride = e.target.value;
      // Auto-suggest DSA beneficiary from page name (only if empty)
      if (!state.dsaBeneficiary && e.target.value) {
        const page = state.pagesList.find(p => p.id === e.target.value);
        if (page?.name) state.dsaBeneficiary = page.name;
      }
      // v0.6.2: auto-fetch connected IG so we can show it in the UI hint.
      if (e.target.value) loadIgForPage(e.target.value);
      render();
    });
    document.getElementById('fbl-dsa-beneficiary')?.addEventListener('input', e => {
      state.dsaBeneficiary = e.target.value;
    });
    document.getElementById('fbl-dsa-payer')?.addEventListener('input', e => {
      state.dsaPayer = e.target.value;
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
      const v = e.target.value.trim();
      state.pageIdOverride = v;
      // v0.6.2: when user types a full Page ID, prefetch its connected IG for the UI hint.
      if (/^\d{10,20}$/.test(v)) loadIgForPage(v);
    });
    document.getElementById('fbl-ig-id')?.addEventListener('input', e => {
      // Strip "x:" / similar Power-Editor prefixes the user may paste from a CSV cell.
      state.instagramOverride = stripPfx(e.target.value.trim());
    });
    document.getElementById('fbl-use-page-as-actor')?.addEventListener('change', e => {
      state.usePageAsActor = e.target.checked;
      render();
    });
    // v0.7.0: name marker chips — toggle preset in/out of state.markers
    panel.querySelectorAll('.chip[data-marker]').forEach(el => {
      el.addEventListener('click', () => {
        const m = el.dataset.marker;
        const i = state.markers.indexOf(m);
        if (i >= 0) state.markers.splice(i, 1); else state.markers.push(m);
        render();
      });
    });
    // v0.7.0: free-form markers — rebuild markers = (still-selected chips) + freeform tokens
    document.getElementById('fbl-markers-freeform')?.addEventListener('input', e => {
      state.markersFreeform = e.target.value;
      const chipSel = state.markers.filter(m => MARKER_PRESETS.includes(m));
      const ff = parseFreeformMarkers(e.target.value);
      state.markers = [...new Set([...chipSel, ...ff])];
      render();  // update preview (focus preserved by render snapshot)
    });
    // v0.7.0: targeting overrides — set state, no re-render (preserves input focus naturally)
    document.getElementById('fbl-geo-countries')?.addEventListener('input', e => { state.geoCountriesOverride = e.target.value; });
    document.getElementById('fbl-geo-states')?.addEventListener('input', e => { state.geoStatesOverride = e.target.value; });
    document.getElementById('fbl-age-min')?.addEventListener('input', e => { state.ageMinOverride = e.target.value.trim(); });
    document.getElementById('fbl-age-max')?.addEventListener('input', e => { state.ageMaxOverride = e.target.value.trim(); });
    document.getElementById('fbl-gender')?.addEventListener('change', e => { state.genderOverride = e.target.value; });
    document.getElementById('fbl-placement')?.addEventListener('change', e => { state.placementPreset = e.target.value; });
    document.getElementById('fbl-advantage')?.addEventListener('change', e => { state.advantageAudienceOverride = e.target.value; });
    // v0.7.0: budget & bidding
    document.getElementById('fbl-budget-mode')?.addEventListener('change', e => {
      state.budgetModeOverride = e.target.value;
      render();  // swap amount field label + enable/disable
    });
    document.getElementById('fbl-budget-amount')?.addEventListener('input', e => {
      const v = e.target.value.trim();
      if (state.budgetModeOverride === 'cbo') state.cboBudgetOverride = v;
      else if (state.budgetModeOverride === 'abo') state.adsetBudgetOverride = v;
      render();  // preview reflects new budget (focus preserved by snapshot)
    });
    document.getElementById('fbl-bid-strategy')?.addEventListener('change', e => {
      state.bidStrategyOverride = e.target.value;
      render();  // enable/disable bid-amount field
    });
    document.getElementById('fbl-bid-amount')?.addEventListener('input', e => { state.bidAmountOverride = e.target.value.trim(); });
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
  loadPresets();
  render();

  // v0.5.3: end paint-drag on mouseup anywhere. One window-level listener that survives
  // the panel's innerHTML rewrites in render(), so we don't re-attach it every time.
  window.addEventListener('mouseup', () => {
    if (state.matrixPaintValue !== null) {
      state.matrixPaintValue = null;
      render();  // sync UI (badges, preset state, etc.) after drag finishes
    }
  });

  TOKEN = await getToken();
  if (!TOKEN) {
    setStatus('error', 'Could not retrieve FB session token. Are you logged in to business.facebook.com?');
    return;
  }
  setStatus('info', 'Token loaded. Click ↻ to load ad accounts.');
  loadAccounts();
})();
