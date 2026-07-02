/* ===========================================================================
 * MetaLaunch PRO v0.20.0 — Bookmarklet
 *
 * Builds & launches FB Ads Manager campaigns — in-panel or from CSV — through Marketing API (no bulk-upload).
 * Supports: multi-adset (1×M×N), CBO/ABO budget, Special Ad Categories (Financial, etc.),
 * tab+comma CSV auto-detect, video+image ads, US state region targeting.
 * v0.2: Link override, URL Tags override, token engine, pixel placeholder substitution.
 * v0.7.0: name markers (CTRL/etc. → campaign+adset+ad names, autorule opt-in root-fix),
 *         in-tool targeting overrides (geo/states/age/gender/placements, override CSV),
 *         budget & bidding overrides (CBO/ABO mode, budget amount, bid strategy + cap),
 *         wider panel (920px) + responsive 2-3-col grid layout.
 * v0.8.0: default ACTIVE status, daily/lifetime budget (+end_time), placement checkboxes
 *         (platforms + position groups) with presets, SafeX HOME geo-cluster presets,
 *         AIDA phrase library (title/body/description) per vertical, link description override.
 * v0.9.0: visual refresh (section cards, gradient header, custom scrollbar), gambling phrase
 *         set (user-supplied US app angles), gambling country geo presets (EN-T1/DACH/Nordic/
 *         SW-EU/MID-CEE/DEEP-CEE), Special Ad Category selector (Financial/Housing/etc).
 * v0.10.0: CSV-less launch (objective selector + creatives → synthetic 1-adset plan),
 *          multi-adset split by geo cluster (one-click waterfall), delayed start_time,
 *          non-US region resolution (per-country), Advantage Audience default OFF, dry-run mode.
 * v0.10.1: clearer cluster-split UX (per-adset preview + grey single geo fields).
 * v0.10.2: uploaded-hashes JSON panel in step 6 with one-click Copy (upload→hash→copy).
 * v0.11.0: IG identity fix — resolve the Page's connected IG FIRST (was account-actor first),
 *          post-create readback that flags FB silently dropping an unusable instagram_user_id,
 *          no more empty-IG cache poisoning (terminal vs retryable), actionable PBIA #10 log.
 * v0.12.0: manual attribution window — dropdown in step 4 (1d/7d click ± 1d view). Was hardcoded
 *          to 1-day click. UI override > CSV "Attribution Spec" column > 1-day click default.
 * v0.13.0: CSV-less adset count — "number of ad sets" field makes N identical adsets without CSV
 *          (same targeting on each); unlocks the 6.5 creative-distribution matrix for CSV-less
 *          launches + adds a "1 per ad set" round-robin button (ad set i → creative i, cycling).
 * v0.14.0: layout — two-column body. Logs moved from a cramped strip at the bottom into a
 *          full-height left rail (collapsible, auto-sticks to newest line); form scrolls on the
 *          right. Header spans both columns. Wider panel (1140px). In-panel version label fixed.
 * v0.15.0: IG identity reliability — never silently lose Instagram. "Use Page as IG identity"
 *          now resolves to a Page-Backed IG (PBIA), created on demand, instead of omitting
 *          instagram_user_id (the old omit relied on FB auto-backing → flaky, IG sometimes got
 *          no representative). On per-ad IG rejection, fall back straight to PBIA (always
 *          promotable) instead of re-laddering to the same rejected page IG. If no IG can be
 *          secured and IG placements are targeted → loud warning, IG kept in targeting (no block).
 * v0.16.0: "Ops Cockpit" visual refresh (no logic change). Header → black command bar with a
 *          monospaced "FB LAUNCHER // v0.16.0" title and a status LED (green/amber/red, pulsing,
 *          driven by state.status.type). Cards → instrument panels (#0d1626 on #1a2740 hairlines)
 *          with a cyan telemetry tick (#38bdf8, NEW token = read-only/state, never on clickables).
 *          Log rail → "◉ LIVE FEED" telemetry feed: darkest surface #05080f, cyan timestamps,
 *          faint scanline texture, segmented glowing progress strip. Metrics/counts/budgets get
 *          tabular mono numerals (preview readout). Launch button → "🚀 LAUNCH ▸", loud action-blue
 *          gradient kept (the one allowed accent on a clickable) + confirm-feel :active inset.
 * v0.17.0: Holographic HUD layer over the Ops Cockpit (no logic change). Active step card (.field
 *          :focus-within) gets glowing cyan #38bdf8 L-shaped corner brackets (lock-on cue) + brighter
 *          lift. Panel frame gets faint cyan interior corner brackets (TL+BL, clear of close button).
 *          Animated cyan dot-grid mesh drifts behind the right form column (.fbl-main only, ~30s, very
 *          low opacity — inputs/cards sit on solid bg so text stays crisp). Input/select :focus glow
 *          re-tuned to cyan HUD lock-on (telemetry accent; launch button stays action-blue).
 * v0.17.1: HUD dialed up — brackets visible at rest on all step cards, grid + panel brackets stronger;
 *          v0.17.0 was too subtle. Corner brackets now sit on EVERY top-level .field at rest (faint
 *          rgba(56,189,248,.4), 15px legs, no glow) and brighten to full #38bdf8 + glow on :focus-within,
 *          so the form reads as a stack of framed HUD modules at a glance. Dot-grid alpha .06→.13 + dot
 *          1px→1.4px (clearly visible in the gaps). Panel frame brackets 18px→26px legs, alpha .45→.7,
 *          glow .4→.6. Subtle cyan inset top hairline on cards at rest. No logic change.
 * v0.18.0: FULL Cyberpunk HUD redesign (CSS/skin pass — no logic change, all form ids/handlers/DOM intact).
 * v0.18.1: DSA payor fix — FB API field is `dsa_payor`, not `dsa_payer`. The typo was silently
 *          dropped; once FB made payor mandatory (2026, EU/gambling) it rejected every adset with
 *          [100/3858079] blame_field_specs:[["dsa_payor"]]. Fixed on adset + ad POST bodies.
 *          Matches the "Cyberpunk HUD control panel" reference, boldly this time. Six areas:
 *          (1) Palette shifted navy → dark teal-black (panel #061a22→#04141a, cards #082530, inputs #06222d);
 *              cyan accents brightened (#38bdf8 / #5eead4); green #22c55e kept for online/ok.
 *          (2) BOLD corner brackets — per-card legs 15→20px @ alpha .55 at rest, full #38bdf8 + glow on focus;
 *              panel-frame brackets on ALL 4 corners (38px legs, alpha .9, glow), framing the body "screen"
 *              (top brackets start ~54px down → clear of the header close button + rail toggle).
 *          (3) HUD module headers — top-level step titles (.fbl-main > .field > label) UPPERCASE + letter-spacing
 *              + leading glowing cyan ▸ glyph; grey hint spans keep sentence-case (text-transform:none).
 *          (4) [bracketed] cyan readouts on READ-ONLY values only — preview metrics (.preview b), account/page/pixel
 *              counts (.fbl-readout), selected-account chips → cyan bracketed mono. Editable inputs untouched.
 *          (5) Segmented glowing meter — .progress now discrete cells (cyan→blue fill + track-stripe ::after gaps + glow).
 *          (6) GIANT glowing launch hero — .primary big (18px pad / 15px / uppercase), cyan→blue gradient, layered
 *              outer glow rings + white corner brackets; functional readiness subtitle under it (.fbl-launch-sub,
 *              reuses run state: ready / awaiting-setup / dry-run / running). LIVE FEED rail gained a "● STATUS: ONLINE"
 *              line (mirrors header LED). Secondary buttons → thin cyan-outline transparent (ref look). Chips → cyan
 *              active cells. Levers to dial back kept inline (bracket alpha/legs, card bg, grid alpha, hero glow rings).
 * v0.18.2: "Page-only" identity mode (logic). The step-3 checkbox (was "Use Facebook Page as IG identity")
 *          is now PURE page-only: sends object_story_spec.page_id ONLY, omits instagram_user_id entirely,
 *          and makes ZERO Instagram calls — no /instagram_accounts lookup, no PBIA GET/POST, no readback,
 *          no "NO Instagram representative" warning. Hard-sets the Facebook Page as identity (Ads Manager
 *          shows "Use Facebook Page"). Reverts v0.15.0's PBIA-on-demand for this toggle: that was an
 *          unwanted IG side-effect when the operator explicitly wants page-only. Untick = full IG ladder
 *          (auto-resolve real IG + PBIA fallback) unchanged.
 * v0.18.3: step-3 checkbox relabel only (no logic change) — the v0.18.2 label "use Facebook Page"
 *          misled (read as "use the Page as IG identity" = good) when it actually OMITS Instagram.
 *          Now "⛔ FB-only — БЕЗ Instagram" + amber when active + "⚠ IG выключен" note, and a green
 *          hint on the UNticked state: "дефолт: ФП авто-используется и в Instagram (page-backed IG)".
 *          Makes clear: untick = Page delivers on FB AND IG (PBIA); tick = FB-only, IG dropped.
 * v0.19.0: step-3 page dropdown now shows ALL pages available to the account, not just 2.
 *          Root cause: loader used /act_<id>/promote_pages ONLY, with a fallback to /me/accounts
 *          that fired only when promote_pages returned ZERO — so any account with ≥1 promotable
 *          page hid the entire broader pool the operator sees in Ads Manager. Now the loader UNIONS
 *          four sources — promote_pages (safe/account-bound) + the owning BM's owned_pages & client_pages
 *          + /me/accounts (personal) — and tags each page `promotable` (present in this account's
 *          promote_pages). Dropdown splits into two optgroups: "✓ Promotable from this account" and
 *          "⚠ Broader pool — may be rejected from this account" (⚠-prefixed, sorted below). Readout
 *          shows "N pages (M promotable + K broader)". Selecting/typing a broader-pool page shows an
 *          amber inline note + a launch-time confirm (FB may reject with subcode 1815813 unless the
 *          Page is linked to the account in Business Settings). Promotable-only picks are unchanged.
 * v0.19.1: removed the decorative HUD corner brackets (CSS only, no logic) — the bright-cyan L-shaped
 *          brackets on every step card (.field::after) and the 4-corner panel frame (#panel::before).
 *          They read as visual clutter. Kept: each card's left cyan tick (border-left), the focus lift
 *          glow, the [bracketed] read-only readouts (.fbl-readout / .preview b), and the launch-button
 *          corner frame. Net: cleaner cards, same information.
 * v0.19.2: de-escalated the promotable/broader page split after live proof that a broader-pool page
 *          (in the account's BM but outside its promote_pages) launches fine. Removed the launch-time
 *          confirm() and the amber "may be rejected" note for such pages; ⚠ prefix dropped from options;
 *          the second optgroup is now the neutral "Also available to this token" (still promotable-first
 *          so the safe picks sit on top). Only a Page ID totally unknown to the token still gets a light
 *          typo-guard confirm. Pick any page the token can see.
 * v0.20.0: Devices dropdown (— CSV/auto — | All | Mobile only | Desktop only) → targeting.device_platforms,
 *          UI override wins over CSV "Device Platforms" column; persisted in presets.
 *          Advantage Audience → On now auto-fills Age min/max to 18/65 (visible, editable after).
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

  // v0.8.0: SafeX HOME geo tier clusters (live setup, geo memory v4.1 2026-06-10).
  // Picking one fills the US-states field; edit/remove states after. ALL-LIVE = all 31 included states.
  const PROVEN_HIGH = 'Missouri, Colorado, Ohio, Tennessee, Illinois, Minnesota, Kansas, Utah';
  const PROVEN_VOLUME = 'Texas, Georgia, Arizona, Indiana, New Mexico, Pennsylvania, Michigan, Washington, Alabama, New Jersey, Massachusetts, Kentucky, Connecticut, Nebraska, Maine, Idaho, Montana, Alaska';
  const VOLUME_CAPPED = 'North Carolina, Louisiana, Oklahoma';
  const CONTAINMENT = 'Florida, California';
  // field: 'states' fills the US-states box, 'countries' fills the Countries box (codes).
  // Gambling pools from currency split / PWA banner memory: EN-T1 (UK=GB,CA,AU,IE), EU12.
  const GEO_PRESETS = [
    { group: 'Lead-gen — US states', label: 'PROVEN-HIGH (8 · cap $10-11)', field: 'states', value: PROVEN_HIGH },
    { group: 'Lead-gen — US states', label: 'PROVEN-VOLUME (18 · cap $8)', field: 'states', value: PROVEN_VOLUME },
    { group: 'Lead-gen — US states', label: 'VOLUME-CAPPED (3 · cap $4)', field: 'states', value: VOLUME_CAPPED },
    { group: 'Lead-gen — US states', label: 'CONTAINMENT (2 · cap $4-5)', field: 'states', value: CONTAINMENT },
    { group: 'Lead-gen — US states', label: 'ALL-LIVE (31 states)', field: 'states', value: [PROVEN_HIGH, PROVEN_VOLUME, VOLUME_CAPPED, CONTAINMENT].join(', ') },
    { group: 'Gambling — countries', label: 'A1 · EN-T1 (CA/AU/IE/NZ)', field: 'countries', value: 'CA, AU, IE, NZ' },
    { group: 'Gambling — countries', label: 'B1 · DACH (DE/AT/CH)', field: 'countries', value: 'DE, AT, CH' },
    { group: 'Gambling — countries', label: 'B2 · NORDIC (NO/DK/FI)', field: 'countries', value: 'NO, DK, FI' },
    { group: 'Gambling — countries', label: 'B3 · SW-EU (FR/BE/ES/IT/NL)', field: 'countries', value: 'FR, BE, ES, IT, NL' },
    { group: 'Gambling — countries', label: 'C1 · MID-CEE (PT/GR/PL/CZ)', field: 'countries', value: 'PT, GR, PL, CZ' },
    { group: 'Gambling — countries', label: 'C2 · DEEP-CEE (SK/SI/HR/RO/HU)', field: 'countries', value: 'SK, SI, HR, RO, HU' },
    { group: 'Gambling — countries', label: 'ALL gambling (24 countries)', field: 'countries', value: 'CA, AU, IE, NZ, DE, AT, CH, NO, DK, FI, FR, BE, ES, IT, NL, PT, GR, PL, CZ, SK, SI, HR, RO, HU' },
    { group: 'Gambling — countries', label: 'USA only', field: 'countries', value: 'US' },
  ];

  // v0.8.0: placement building blocks. Platform checkboxes + position-group checkboxes; presets fill both.
  const PLACEMENT_PLATFORMS = [['facebook', 'Facebook'], ['instagram', 'Instagram'], ['audience_network', 'Audience Network'], ['messenger', 'Messenger']];
  const PLACEMENT_POSITION_GROUPS = {
    feeds:    { label: 'Feeds',           facebook: ['feed'],            instagram: ['stream'] },
    stories:  { label: 'Stories',         facebook: ['story'],           instagram: ['story'] },
    reels:    { label: 'Reels',           facebook: ['facebook_reels'],  instagram: ['reels'] },
    instream: { label: 'In-stream video', facebook: ['instream_video'],  instagram: [] },
    search:   { label: 'Search',          facebook: ['search'],          instagram: [] },
    explore:  { label: 'Explore',         facebook: [],                  instagram: ['explore'] },
  };
  const PLACEMENT_PRESETS = {
    all:        { platforms: ['facebook', 'instagram', 'audience_network', 'messenger'], groups: [] },
    fb_ig:      { platforms: ['facebook', 'instagram'], groups: [] },
    fb_only:    { platforms: ['facebook'], groups: [] },
    feeds_only: { platforms: ['facebook', 'instagram'], groups: ['feeds'] },
    reels_only: { platforms: ['facebook', 'instagram'], groups: ['reels'] },
  };

  // v0.8.0: AIDA copy library per vertical — title = Attention, body = Interest+Desire,
  // desc = Action (short CTA line for the link description). Picking a suggestion fills the
  // field (editable after). Gambling kept FB-policy-safe (no explicit casino/bet claims).
  const PHRASE_LIB = {
    insurance: {
      label: 'Insurance (Home/Auto)',
      title: ['See How Much You Could Save', 'New 2026 Insurance Rates Are Here', 'Homeowners Are Switching & Saving', 'Compare Rates in Under 2 Minutes', 'Most Homeowners Overpay — Do You?'],
      body: [
        'Compare home insurance rates from top providers. Most homeowners save $600+/year. Takes 2 minutes.',
        'Your rate may have dropped this year. See updated quotes from top-rated insurers in your state — free, no obligation.',
        'Stop overpaying for coverage you already have. One quick search compares every major provider side by side.',
      ],
      desc: ['Free quote — no obligation', 'Compare in 2 minutes', 'See your new rate today', 'Check your savings now'],
    },
    gambling: {
      label: 'Gambling / Casino',
      title: [
        "🎉 Unleash the Winning Spirit! 🏆",
        "🚀 Elevate Your Wins: Install Now! 💸",
        "🌟 Discover Limitless Prizes! 🔓",
        "🃏 Play Like a Pro: Win Big! 💰",
        "🔥 Ignite Your Fortunes: Get Started! 🎁",
        "🍀 Try Your Luck: Spin to Win! 🎯",
        "🎲 Roll the Dice of Success! 💥",
        "🏆 Triumph Today: Play and Win! ✨",
        "🚀 Win Big! 💰 #1 in USA 🏆",
        "🔥 Feel the Heat! 🎲 USA's Finest 🌟",
        "🎁 Your Lucky Break! 🏅 #1 App in USA 🍒",
        "🔝 The Ultimate Gaming Experience! 🃏",
      ],
      body: [
        "💸 Boost Your Bankroll: Get Welcome Bonus & up to 125 Free Spins Now! 🎲🔥",
        "🇺🇸 Exclusive for the USA! 🎁 Best Welcome Bonus Pack Guaranteed 🎉🎊",
        "⚡️ Only 20 Hours Left! 💰 Get Welcome Bonus & up to 125 Free Spins Today! 🎉💵 in the Mobile App 📱🎉",
        "💎 Bet Big, Win Bigger! 🎁 Best Welcome Bonus Pack Guaranteed 🎉🎊",
        "🎁 Your Luck Awaits! 🍀 Sign Up and get Welcome Bonus 🤑💫",
        "🚀 Take a Chance, Hit the Jackpot! 🔝 Get 250 Free Spins 🎯💥",
        "🏆 Join the Winners' Club! 🌟 Get a 200% Deposit Match 💎💪",
        "🌟 Start Winning Today! 🏆 100% Match Bonus for New Players 💸💎",
        "💎 Go All In, Go All Out! 💰 Get 300% Bonus on Your First Deposit 💥🃏",
        "🎲 Feel the Rush of Victory! 🚀 Get 500 Free Spins Today 🎁💫",
        "💰 Get in on the Action! 🎰 Join Now for a $1000 Welcome Bonus 🤑🚀",
        "🌟 Discover Limitless Prizes: Unlock up to 100% & 125 Free Spins! 🎁💰",
        "💎 Claim Your Jackpot Journey: Boost Your Bankroll with up to 100% & 125 Free Spins! 💸🚀",
        "🔓 Unleash Epic Rewards: Up to 100% & 125 Free Spins Await Your Victory! 🎉🔥",
      ],
      desc: [
        "🚀 Boost Your Odds: Install for Maximum Wins Today!",
        "🎯 Aim for Victory: Install Now and Conquer the Game!",
        "💰 Fortune Favors the Bold: Install and Win Now!",
        "🎲 Roll the Dice of Success: Install for Big Wins Today!",
        "🔥 Ignite Your Winning Streak: Install Now and Prevail!",
        "🎰 Spin Your Way to Success: Install Now and Score Big!",
        "💎 Unlock the Path to Riches: Install for Mega Wins Now!",
        "🍀 Embrace the Winning Vibe: Install and Conquer Today!",
      ],
    },
    crypto: {
      label: 'Crypto / Trading',
      title: ['Start Trading in Minutes', 'AI-Powered Market Signals', 'The Platform Traders Trust', 'Your First Trade Is Waiting', 'Smarter Trading Starts Here'],
      body: [
        'Join a platform built for modern traders. Real-time data, low fees, fast withdrawals. Capital at risk.',
        'AI-driven signals help you spot moves earlier. Start with as little as you like. Trading involves risk.',
        'Open an account in minutes and trade major markets from one dashboard. Your capital is at risk.',
      ],
      desc: ['Start trading today', 'Open free account', 'Capital at risk', 'Trade in minutes'],
    },
    nutra: {
      label: 'Nutra / Health',
      title: ['The Simple Daily Habit', 'What Experts Are Talking About', 'Support Your Body Naturally', 'A Smarter Way to Feel Better', 'Thousands Made the Switch'],
      body: [
        'A natural approach people are adding to their daily routine. Results vary. Not medical advice.',
        'Backed by a simple idea and clean ingredients. See what the buzz is about. Individual results vary.',
        'Thousands are rethinking their daily routine with this natural option. Results may vary.',
      ],
      desc: ['Learn more', 'See the method', 'Results may vary', 'Try it today'],
    },
  };

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
    usePageAsActor: false,    // v0.18.2: PURE page-only — page_id only, instagram_user_id omitted, ZERO IG/PBIA calls. Hard-set Facebook Page as identity.
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
    logRailCollapsed: false,  // v0.14.0: left log rail collapse toggle (session-only UI pref)
    matrixPaintValue: null,   // v0.5.3: paint-drag value (true=set, false=unset) while mouse button held over cells
    creativesInput: '',       // v0.2: raw user input (textarea)
    creativesParsed: null,    // v0.2: { mode: 'list'|'map'|'single', list?, map?, value? }
    creativesError: '',
    urlTagParam: 'sub2',      // legacy: single-param replacement in URL Tags
    urlTagMode: 'acc_id',
    urlTagCustom: '',
    createStatus: 'ACTIVE',   // v0.8.0: default ACTIVE (launch immediately) per Alexander
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
    advantageAudienceOverride: '0', // v0.10.0: default OFF — geo-strict launches must not leak (was '')
    objectiveOverride: '',    // v0.10.0: '' = CSV | OUTCOME_SALES | OUTCOME_LEADS | ... (needed for CSV-less)
    adsetSplitClusters: [],   // v0.10.0: GEO_PRESETS indices → one adset per cluster (waterfall in one click)
    adsetCountOverride: '',   // v0.12.0: CSV-less only — N identical synthetic adsets (''/1 = single). Ignored when CSV loaded or cluster-split active.
    startDate: '',            // v0.10.0: datetime-local; adset start_time (delayed start / Kyiv→US timing)
    dryRun: false,            // v0.10.0: build + log payloads without POSTing
    sacOverride: '',          // v0.9.0: '' = CSV | NONE | FINANCIAL_PRODUCTS_SERVICES | HOUSING | EMPLOYMENT | CREDIT | ISSUES_ELECTIONS_POLITICS | ONLINE_GAMBLING_AND_GAMING
    // v0.7.0: budget & bidding — override CSV. budgetModeOverride drives CBO vs ABO structure.
    budgetModeOverride: '',   // '' = CSV auto-detect | 'cbo' (campaign budget) | 'abo' (adset budget)
    cboBudgetOverride: '',    // campaign daily budget $ (when mode=cbo)
    adsetBudgetOverride: '',  // per-adset daily budget $ (when mode=abo) — applied to every adset
    bidStrategyOverride: '',  // '' = CSV | LOWEST_COST_WITHOUT_CAP | COST_CAP | LOWEST_COST_WITH_BID_CAP
    bidAmountOverride: '',    // bid/cost cap $ (only used when strategy is COST_CAP or BID_CAP)
    budgetTypeOverride: '',   // v0.8.0: '' = CSV (daily) | 'daily' | 'lifetime'
    budgetEndDate: '',        // v0.8.0: datetime-local string; required for lifetime budget (end_time)
    attributionOverride: '',  // v0.12.0: '' = CSV/default (1d click) | '1d_click' | '7d_click' | '1d_click_1d_view' | '7d_click_1d_view'
    // v0.8.0: placements — checkboxes (platforms + position groups). Presets fill both. Empty = CSV.
    placementPlatforms: [],   // subset of facebook/instagram/audience_network/messenger
    placementPositionGroups: [], // subset of PLACEMENT_POSITION_GROUPS keys; empty = all positions
    devicePlatformsOverride: '', // v0.20.0: '' = CSV/auto | 'mobile' | 'desktop' | 'all' (explicit mobile+desktop)
    descriptionOverride: '',  // v0.8.0: link/video description (Action line); empty = CSV
    phraseVertical: 'insurance', // v0.8.0: selected vertical for the AIDA phrase dropdowns
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
      sacOverride: state.sacOverride,
      objectiveOverride: state.objectiveOverride,
      adsetSplitClusters: state.adsetSplitClusters,
      adsetCountOverride: state.adsetCountOverride,
      startDate: state.startDate,
      placementPlatforms: state.placementPlatforms,
      placementPositionGroups: state.placementPositionGroups,
      devicePlatformsOverride: state.devicePlatformsOverride,
      budgetModeOverride: state.budgetModeOverride,
      cboBudgetOverride: state.cboBudgetOverride,
      adsetBudgetOverride: state.adsetBudgetOverride,
      bidStrategyOverride: state.bidStrategyOverride,
      bidAmountOverride: state.bidAmountOverride,
      budgetTypeOverride: state.budgetTypeOverride,
      budgetEndDate: state.budgetEndDate,
      attributionOverride: state.attributionOverride,
      descriptionOverride: state.descriptionOverride,
      phraseVertical: state.phraseVertical,
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
    state.sacOverride = s.sacOverride || '';
    state.objectiveOverride = s.objectiveOverride || '';
    state.adsetSplitClusters = Array.isArray(s.adsetSplitClusters) ? s.adsetSplitClusters : [];
    state.adsetCountOverride = s.adsetCountOverride || '';
    state.startDate = s.startDate || '';
    state.placementPlatforms = Array.isArray(s.placementPlatforms) ? s.placementPlatforms : [];
    state.placementPositionGroups = Array.isArray(s.placementPositionGroups) ? s.placementPositionGroups : [];
    state.devicePlatformsOverride = s.devicePlatformsOverride || '';
    state.budgetModeOverride = s.budgetModeOverride || '';
    state.cboBudgetOverride = s.cboBudgetOverride || '';
    state.adsetBudgetOverride = s.adsetBudgetOverride || '';
    state.bidStrategyOverride = s.bidStrategyOverride || '';
    state.bidAmountOverride = s.bidAmountOverride || '';
    state.budgetTypeOverride = s.budgetTypeOverride || '';
    state.budgetEndDate = s.budgetEndDate || '';
    state.attributionOverride = s.attributionOverride || '';
    state.descriptionOverride = s.descriptionOverride || '';
    state.phraseVertical = s.phraseVertical || 'insurance';
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

  // ─── PAGES LOADER (v0.19: merge all sources, tag promotable) ─────────────
  // v0.19.0: was promote_pages-only with a zero-fallback to /me/accounts — so an
  // account that returned even ONE promote_pages result HID every other page the
  // operator sees in Ads Manager. Now we UNION four sources and tag each page
  // `promotable` (present in THIS account's promote_pages edge = safe to launch).
  // Non-promotable pages are still shown (broader pool) but flagged in the UI,
  // since launching with them from this account may be rejected by FB (subcode 1815813).
  async function loadPagesForAccount(accId) {
    if (!accId) return;
    if (state.pagesByAccount[accId]) {
      state.pagesList = state.pagesByAccount[accId];
      render();
      return;
    }
    state.pagesLoading = true;
    render();
    const found = new Map();       // id -> name (union of all sources)
    const promotable = new Set();  // ids FB confirms THIS account can promote

    // 1) promote_pages — the safe, account-bound set (guaranteed launchable here).
    try {
      const items = await apiAll(`/act_${accId}/promote_pages`, { fields: 'id,name', limit: 100 });
      items.forEach(p => { const id = String(p.id); found.set(id, p.name || 'Untitled'); promotable.add(id); });
      if (items.length) addLog('info', `Pages (promote_pages): ${items.length} for ${accId}`);
    } catch (e) {
      addLog('warning', `promote_pages failed (${accId}): ${e.message}`);
    }

    // 2) BM owned/client pages — the broader pool Ads Manager shows. Resolve the
    //    account's owning business first, then pull its page inventory.
    try {
      const acc = await apiFetch(`/act_${accId}`, { params: { fields: 'business{id,name}' } });
      const bizId = acc && acc.business && acc.business.id;
      if (bizId) {
        for (const edge of ['owned_pages', 'client_pages']) {
          try {
            const items = await apiAll(`/${bizId}/${edge}`, { fields: 'id,name', limit: 100 });
            items.forEach(p => { const id = String(p.id); if (!found.has(id)) found.set(id, p.name || 'Untitled'); });
            if (items.length) addLog('info', `Pages (${edge}): ${items.length} for BM ${bizId}`);
          } catch (e) { addLog('warning', `${edge} failed (BM ${bizId}): ${e.message}`); }
        }
      }
    } catch (e) {
      addLog('warning', `business lookup failed (${accId}): ${e.message}`);
    }

    // 3) /me/accounts — personal pool (pages where the session user holds a role).
    try {
      const items = await apiAll('/me/accounts', { fields: 'id,name', limit: 100 });
      items.forEach(p => { const id = String(p.id); if (!found.has(id)) found.set(id, p.name || 'Untitled'); });
      if (items.length) addLog('info', `Pages (/me/accounts): ${items.length}`);
    } catch (e) {
      addLog('warning', `/me/accounts failed: ${e.message}`);
    }

    // Promotable first, then alpha — the safe picks sit at the top of the dropdown.
    const list = [...found.entries()]
      .map(([id, name]) => ({ id, name, promotable: promotable.has(id) }))
      .sort((a, b) => (a.promotable === b.promotable ? a.name.localeCompare(b.name) : (a.promotable ? -1 : 1)));
    state.pagesByAccount[accId] = list;
    if (state.targetAccIds[0] === accId) state.pagesList = list;
    state.pagesLoading = false;
    addLog('info', `Pages total for ${accId}: ${list.length} (${promotable.size} promotable, ${list.length - promotable.size} broader pool)`);
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
    if (key in state.pageIgMap) {
      // v0.11.0: short-circuit ONLY on a positive hit or a definitive "no IG" (terminal).
      // Errored/transient entries fall through and re-resolve — kills the in-session cache
      // poisoning where one transient failure locked every later ad to an empty IG.
      const e = state.pageIgMap[key];
      if (e && (e.igId || e.terminal)) return e.igId || '';
    }
    if (state.pageIgLoading[key]) return '';
    state.pageIgLoading[key] = true;
    let pageName = '';
    let anyError = false;
    try {
      if (pageId) {
        try {
          const r = await apiFetch(`/${pageId}`, { params: { fields: 'name' } });
          pageName = r?.name || '';
          // v0.6.6: auto-fill DSA Beneficiary from the Page name if the user hasn't set one.
          if (pageName && !state.dsaBeneficiary) {
            state.dsaBeneficiary = pageName;
            addLog('info', `🔖 Auto-filled DSA Beneficiary from page: "${pageName}"`);
          }
        } catch {}
      }

      // v0.11.0: the PAGE's connected Instagram is the identity Ads Manager shows in the
      // dropdown — resolve it FIRST (was below the account-actor lookup, which returned an
      // arbitrary/empty actor and left the IG field wrong/blank for pages that DO have a linked IG).
      let pageIg = null;
      if (pageId) {
        try {
          const pf = await apiFetch(`/${pageId}`, {
            params: { fields: 'connected_instagram_account{id,username},instagram_business_account{id,username}' },
          });
          if (pf?.connected_instagram_account?.id) pageIg = { id: String(pf.connected_instagram_account.id), username: pf.connected_instagram_account.username || '', label: 'connected_instagram_account' };
          else if (pf?.instagram_business_account?.id) pageIg = { id: String(pf.instagram_business_account.id), username: pf.instagram_business_account.username || '', label: 'instagram_business_account' };
        } catch (e) { anyError = true; addLog('warning', `Page ${pageId} connected/business IG lookup failed: ${e.message}`); }
        if (!pageIg) {
          try {
            const r = await apiFetch(`/${pageId}/instagram_accounts`, { params: { fields: 'id,username', limit: 5 } });
            const item = r?.data?.[0];
            if (item?.id) pageIg = { id: String(item.id), username: item.username || '', label: 'page' };
          } catch (e) {
            // "nonexisting field" = token lacks page admin role; not a real error, drop quietly.
            if (!/nonexisting field/i.test(String(e.message || ''))) { anyError = true; addLog('warning', `Page ${pageId} /instagram_accounts lookup failed: ${e.message}`); }
          }
        }
      }

      // Account's promotable actors — used to VERIFY the page IG (guaranteed to stick) and as fallback.
      let accountActors = [];
      let validIds = new Set();
      if (accId) {
        try {
          const r = await apiFetch(`/act_${accId}/instagram_accounts`, { params: { fields: 'id,username', limit: 25 } });
          accountActors = r?.data || [];
          validIds = new Set(accountActors.map(a => String(a.id)));
        } catch (e) { anyError = true; addLog('warning', `Account ${accId} /instagram_accounts lookup failed: ${e.message}`); }
      }

      // Decide (v0.11.0 ladder): page-connected IG > account actor substitute > PBIA > page-only.
      if (pageIg) {
        const promotable = validIds.has(pageIg.id);
        const entry = { igId: pageIg.id, igName: pageIg.username, pageName, source: promotable ? pageIg.label + '+promotable' : pageIg.label + '-unverified' };
        state.pageIgMap[key] = entry;
        addLog('info', `🔗 Page IG ${pageIg.id}${pageIg.username ? ' @' + pageIg.username : ''} via ${pageIg.label}${promotable ? ' (promotable ✓)' : ' (not in this account — will verify after create)'}`);
        return entry.igId;
      }
      if (accountActors.length) {
        const item = accountActors[0];
        const entry = { igId: String(item.id), igName: item.username || '', pageName, source: 'account-substitute', count: accountActors.length };
        state.pageIgMap[key] = entry;
        addLog('info', `🔗 No IG on page — using account actor ${entry.igId}${entry.igName ? ' @' + entry.igName : ''}${accountActors.length > 1 ? ` (1 of ${accountActors.length})` : ''} as identity`);
        return entry.igId;
      }
      const pbia = await loadPbiaForPage(pageId, pageName);
      if (pbia?.igId) { state.pageIgMap[key] = { ...pbia, source: 'pbia' }; return pbia.igId; }

      // No IG anywhere. Cache as terminal ONLY if nothing errored (so transient fails retry).
      state.pageIgMap[key] = { igId: '', igName: '', pageName, source: anyError ? 'error' : 'none', terminal: !anyError };
      addLog('warning', `⚠ Page "${pageName || pageId}" has no Instagram identity (no connected IG, no account actor, PBIA unavailable). Ads run Facebook-only — IG field empty. Fix: link an IG in Page Settings (business.facebook.com/settings/instagram-accounts), OR paste a promotable IG ID in step 3, OR tick "Use Facebook Page as IG identity".`);
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
      if (!pbia?.id && state.dryRun) {
        // v0.15.0: dry run must not create anything. Log intent, return null (preview shows page-only).
        addLog('info', `🟦 DRY: would create a Page-Backed IG for page ${pageId} (skipped in dry run)`);
      } else if (!pbia?.id) {
        try {
          const c = await apiFetch(`/${pageId}/page_backed_instagram_accounts`, { method: 'POST' });
          if (c?.id) {
            pbia = c;
            addLog('info', `PBIA POST created: ${c.id}${c.username ? ' @' + c.username : ''}`);
          } else {
            addLog('warning', `PBIA POST succeeded but returned no id — body: ${JSON.stringify(c).slice(0, 200)}`);
          }
        } catch (e) {
          const m = String(e.message || '');
          if (/\b10\b|permission/i.test(m)) {
            addLog('warning', `PBIA POST denied (#10): token lacks ADVERTISER+ role on this Page, or the Page is restricted, or Page+IG+ad-account aren't all assigned to the same Business. Can't create a Page-Backed IG with this token → identity will be page-only.`);
          } else {
            addLog('warning', `PBIA POST failed: ${m}`);
          }
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

  // v0.11.0: post-create readback. FB frequently CREATES the creative even when it
  // silently discards an unusable instagram_user_id (IG not promotable by this token/
  // account), leaving the Ads Manager IG field empty while the launch "succeeds". Read
  // the creative back and warn if the IG we sent didn't stick — you can't patch it onto
  // an existing creative, so the user must fix access/identity and relaunch.
  async function verifyCreativeIg(creativeId, expectedIg, accLabel, adName) {
    if (state.dryRun || !creativeId || !expectedIg || String(creativeId).startsWith('DRY')) return;
    try {
      const c = await apiFetch(`/${creativeId}`, { params: { fields: 'object_story_spec{instagram_user_id}' } });
      const got = c?.object_story_spec?.instagram_user_id ? String(c.object_story_spec.instagram_user_id) : '';
      if (got !== String(expectedIg)) {
        addLog('warning', `[${accLabel}] ⚠ FB dropped IG ${expectedIg} on "${adName}" → IG field will be EMPTY (page-only). The IG isn't promotable by this account/token (BM claim / asset assignment / page role). Link a real IG or accept page-only.`);
      }
    } catch { /* best-effort */ }
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
      // v0.18.2: PURE page-only. Send ONLY page_id, omit instagram_user_id entirely.
      // No IG endpoint calls, no PBIA create, no readback, no warnings — the Facebook
      // Page is the identity, full stop. Ads Manager shows "Use Facebook Page".
      // (v0.15.0 made this create a PBIA on demand — reverted: that's an unwanted
      // Instagram side-effect when the operator explicitly wants page-only.)
      return { igId: '', source: 'page-only' };
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
    // v0.10.0: ads-mode = creatives (uploaded or pasted JSON) define new ads per adset.
    const adsMode = state.creativesParsed?.mode === 'ads';
    const adsModeItems = adsMode ? state.creativesParsed.items : null;
    const hasRows = state.rows.length > 0;
    const splitClusters = (state.adsetSplitClusters || []).map(i => GEO_PRESETS[i]).filter(Boolean);
    // CSV-less / cluster-split both need uploaded/pasted creatives to have any ads.
    const csvless = !hasRows;
    if (csvless && !(adsMode && adsModeItems && adsModeItems.length)) return null;

    const first = hasRows ? state.rows[0] : {};

    // Build adset groups — three sources, in priority:
    //  1) cluster split  → one synthetic adset per selected geo cluster (carries its own geo)
    //  2) CSV rows       → group by "Ad Set Name"
    //  3) CSV-less       → single synthetic adset
    const groups = new Map();
    if (splitClusters.length) {
      splitClusters.forEach((c, i) => {
        const row = hasRows ? { ...state.rows[0] } : {};
        if (c.field === 'states') row._geoStates = c.value; else row._geoCountries = c.value;
        groups.set(`${String(i + 1).padStart(2, '0')} ${c.label}`, [row]);
      });
    } else if (hasRows) {
      for (const r of state.rows) {
        const key = r['Ad Set Name'] || '__default__';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(r);
      }
    } else {
      // v0.12.0: CSV-less — N identical synthetic adsets; UI targeting/budget overrides apply to each.
      const nAdsets = Math.max(1, Math.min(50, parseInt(state.adsetCountOverride, 10) || 1));
      if (nAdsets === 1) {
        groups.set('__default__', [{}]);
      } else {
        for (let i = 1; i <= nAdsets; i++) groups.set(`Ad Set ${i}`, [{}]);
      }
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
    let sacList = (sacRaw && sacRaw !== 'NONE') ? [sacMap[sacRaw] || sacRaw] : [];
    // v0.9.0: UI Special Ad Category override wins over CSV ('NONE' clears it).
    if (state.sacOverride) sacList = state.sacOverride === 'NONE' ? [] : [state.sacOverride];

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

    // Ad count (adsMode/adsModeItems computed at top of function)
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
      csvless,
      isCBO,
      cboBudget,
      aboTotal,
      sacList,
      objective: state.objectiveOverride || first['Campaign Objective'] || '',
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

  // v0.10.0: UI objective override (FB enum) wins over CSV; required for CSV-less launches.
  function effectiveObjective(row) {
    return state.objectiveOverride || mapObjective(row && row['Campaign Objective']);
  }
  // v0.10.0: optional adset start_time (delayed start). datetime-local → unix seconds.
  function startTimeUnix() {
    if (!state.startDate) return null;
    const t = Date.parse(state.startDate);
    return isNaN(t) ? null : Math.floor(t / 1000);
  }

  // v0.7.0: UI bid-strategy override (already an FB enum) wins over CSV's free-text "Campaign Bid Strategy".
  function effectiveBidStrategy(row) {
    return state.bidStrategyOverride || mapBidStrategy(row && row['Campaign Bid Strategy']);
  }

  // v0.12.0: adset attribution_spec. UI override > CSV "Attribution Spec" column > 1-day click default.
  const ATTRIBUTION_SPECS = {
    '1d_click': '[{"event_type":"CLICK_THROUGH","window_days":1}]',
    '7d_click': '[{"event_type":"CLICK_THROUGH","window_days":7}]',
    '1d_click_1d_view': '[{"event_type":"CLICK_THROUGH","window_days":1},{"event_type":"VIEW_THROUGH","window_days":1}]',
    '7d_click_1d_view': '[{"event_type":"CLICK_THROUGH","window_days":7},{"event_type":"VIEW_THROUGH","window_days":1}]',
  };
  function attributionSpec(row) {
    if (state.attributionOverride) return ATTRIBUTION_SPECS[state.attributionOverride] || ATTRIBUTION_SPECS['1d_click'];
    return (row && row['Attribution Spec']) || ATTRIBUTION_SPECS['1d_click'];
  }

  // v0.8.0: lifetime vs daily budget. Lifetime requires an end_time on the budget-carrying entity
  // (campaign for CBO, adset for ABO); FB also needs end_time on adsets when CBO uses a lifetime budget.
  function isLifetimeBudget() { return state.budgetTypeOverride === 'lifetime'; }
  function budgetEndTimeUnix() {
    if (!state.budgetEndDate) return null;
    const t = Date.parse(state.budgetEndDate);  // datetime-local "YYYY-MM-DDTHH:mm" → ms
    return isNaN(t) ? null : Math.floor(t / 1000);
  }

  // v0.8.0: resolve checkbox placements → FB targeting fields. Returns null when nothing selected
  // (→ fall back to CSV columns). publisher_platforms from checkboxes; positions from group checkboxes.
  function resolvePlacements() {
    const platforms = state.placementPlatforms.slice();
    const groups = state.placementPositionGroups.slice();
    if (!platforms.length && !groups.length) return null;  // CSV fallback
    const out = {};
    if (platforms.length) out.publisher_platforms = platforms;
    if (groups.length) {
      const fb = [], ig = [];
      for (const g of groups) {
        const def = PLACEMENT_POSITION_GROUPS[g];
        if (!def) continue;
        if (!platforms.length || platforms.includes('facebook')) fb.push(...def.facebook);
        if (!platforms.length || platforms.includes('instagram')) ig.push(...def.instagram);
      }
      if (fb.length) out.facebook_positions = [...new Set(fb)];
      if (ig.length) out.instagram_positions = [...new Set(ig)];
    }
    return out;
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

  // v0.10.0: per-country region map cache. fetchFbRegionMap('GB') etc.
  const _fbRegionMapCache = {};
  async function fetchFbRegionMap(cc) {
    if (_fbRegionMapCache[cc]) return _fbRegionMapCache[cc];
    try {
      const res = await apiFetch('/search', {
        params: { type: 'adgeolocation', location_types: '["region"]', country_code: cc, limit: 500 },
      });
      const map = {};
      (res?.data || []).forEach(r => { map[r.name.toLowerCase()] = r.key; });
      _fbRegionMapCache[cc] = map;
      return map;
    } catch {
      _fbRegionMapCache[cc] = {};
      return {};
    }
  }

  // v0.10.0: resolve region names against the launch's target countries (was US-only).
  // Tries each target country's FB region map, then the static US table as a fast fallback.
  async function resolveRegions(regionsRaw, countries) {
    if (!regionsRaw) return [];
    const names = String(regionsRaw).split(',').map(s => s.trim().replace(/\s+US$/i, '').trim()).filter(Boolean);
    if (!names.length) return [];
    const ctys = (countries && countries.length) ? countries : ['US'];
    const out = [];
    for (const name of names) {
      const lc = name.toLowerCase();
      let matched = null;
      for (const cc of ctys) {
        const map = await fetchFbRegionMap(cc);
        if (map[lc]) { matched = { key: String(map[lc]), name, country: cc }; break; }
      }
      if (!matched && US_STATE_KEYS[lc]) matched = { key: String(US_STATE_KEYS[lc]), name, country: 'US' };
      if (matched) out.push(matched);
      else addLog('warning', `Region not found in ${ctys.join('/')}: "${name}" — skipped`);
    }
    return out;
  }

  // ─── LAUNCHER ───────────────────────────────────────────────────────────
  // v0.6: orchestrator — pre-flight CSV-wide checks once, then run the per-account
  // pipeline for each selected account sequentially. For single-account this still
  // produces exactly one campaign; for N accounts it produces N independent campaigns.
  async function runLaunch() {
    if (!state.targetAccIds.length) { setStatus('error', 'Select at least one target ad account.'); return; }
    const plan = analyzePlan();
    if (!plan) { setStatus('error', 'Load a CSV, or upload creatives + set objective/link for a CSV-less launch.'); return; }
    // v0.10.0: CSV-less needs objective + destination link in the UI (CSV normally supplies these).
    if (plan.csvless) {
      if (!plan.objective) { setStatus('error', 'CSV-less: pick a Campaign Objective (step 1b/9 area).'); return; }
      if (!state.linkOverride) { setStatus('error', 'CSV-less: set a destination Link (step 7).'); return; }
    }

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
      // v0.19.2: only guard a Page ID totally unknown to the token (typo catch). Broader-pool
      // pages (in the list but outside this account's promote_pages) launch fine in practice —
      // same-BM pages are accepted even when promote_pages doesn't list them (verified live) —
      // so no confirm/alarm for those. Just pick any page the token can see.
      const inList = state.pagesList.find(p => p.id === state.pageIdOverride);
      if (state.pagesList.length && !inList) {
        const ok = confirm(
          `Page ${state.pageIdOverride} is not in this token's page list.\n\n` +
          `Available pages:\n${state.pagesList.slice(0, 5).map(p => `  ${p.id} — ${p.name}`).join('\n')}\n\n` +
          `Launch anyway?`
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
    const firstRow = state.rows[0] || {};  // v0.10.0: {} for CSV-less launches

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
    if (igResolution.source === 'page-only') {
      addLog('info', `[${accLabel}] 🟦 Page-only identity — using Facebook Page ${probePage || '(from CSV)'} as identity, Instagram skipped entirely (instagram_user_id omitted, no IG/PBIA calls)`);
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
    // v0.15.0: never lose Instagram silently. If IG placements are targeted but we
    // couldn't secure a representative, warn LOUDLY and keep IG in targeting anyway
    // (Alexander's call — warn, don't block, don't strip IG placement).
    if (!resolvedIg && !state.usePageAsActor) {
      const place = resolvePlacements();
      const igTargeted = !place || !(place.publisher_platforms || []).length || place.publisher_platforms.includes('instagram');
      if (igTargeted) {
        addLog('warning', `[${accLabel}] ⚠⚠ NO Instagram representative secured — IG stays in targeting but may NOT deliver. Fix: link an IG to the page (Page Settings → Linked accounts), grant this token ADVERTISER+ on the page so a Page-Backed IG can be created, or paste a promotable IG ID in step 3. Launch continues.`);
      }
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
        campName = firstRow['Campaign Name'] || `MetaLaunch ${dateStr}`;
      }
      // v0.7.0: markers on campaign name (campaign name is NOT used in token context, so safe here)
      campName = applyMarkers(campName);

      const campBody = {
        name: campName,
        objective: effectiveObjective(firstRow),
        status: state.createStatus,
        special_ad_categories: JSON.stringify(plan.sacList),
        buying_type: firstRow['Buying Type'] || 'AUCTION',
      };
      // v0.5.1: bid_strategy only on CBO campaign-level. For ABO it lives on adset-level —
      // sending it on a budget-less campaign trips FB error [100/1885737] "campaign budget not set".
      if (plan.isCBO) {
        if (isLifetimeBudget()) {
          campBody.lifetime_budget = String(Math.round(plan.cboBudget * 100));
          const et = budgetEndTimeUnix();
          if (et) campBody.end_time = String(et);  // lifetime needs a schedule end
        } else {
          campBody.daily_budget = String(Math.round(plan.cboBudget * 100));
        }
        campBody.bid_strategy = effectiveBidStrategy(firstRow);
      }

      addLog('info', `[${accLabel}] ${state.dryRun ? '🟦 DRY ' : ''}creating campaign "${campName}"...`);
      let camp;
      if (state.dryRun) {
        addLog('info', `[${accLabel}] 🟦 campaign payload: ${JSON.stringify(campBody)}`);
        camp = { id: 'DRY_CAMPAIGN' };
      } else {
        camp = await apiFetch(`/act_${accId}/campaigns`, { method: 'POST', body: campBody });
      }
      campaignId = camp.id;
      state.progress.done++;
      addLog('success', `[${accLabel}] ${state.dryRun ? '🟦 DRY ' : '✓ '}campaign id=${campaignId}`);
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

      // v0.7.0/v0.10.0: targeting — per-adset cluster geo (_geoCountries/_geoStates) wins, then UI
      // override (state.*), then CSV column.
      const countriesRaw = (aFirst._geoCountries || state.geoCountriesOverride || String(aFirst['Countries'] || ''))
        .split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
      const countries = countriesRaw.length ? countriesRaw : ['US'];
      const fbRegions = await resolveRegions(aFirst._geoStates || state.geoStatesOverride || aFirst['Regions'], countries);
      const ageMin = state.ageMinOverride ? (+state.ageMinOverride || 18) : (+aFirst['Age Min'] || 18);
      const ageMax = state.ageMaxOverride ? (+state.ageMaxOverride || 65) : (+aFirst['Age Max'] || 65);
      const gender = (state.genderOverride || String(aFirst['Gender'] || '')).toLowerCase();
      const genders = gender.includes('men') && !gender.includes('women') ? [1]
        : gender.includes('women') && !gender.includes('men') ? [2] : [1, 2];
      // Placements: UI checkboxes (platforms + position groups) win; else CSV columns. (v0.8.0)
      const placeUI = resolvePlacements();
      const publisherPlatforms = placeUI
        ? (placeUI.publisher_platforms || [])
        : String(aFirst['Publisher Platforms'] || '').split(',').map(s => s.trim()).filter(Boolean);
      const fbPositions = placeUI
        ? (placeUI.facebook_positions || [])
        : String(aFirst['Facebook Positions'] || '').split(',').map(s => s.trim()).filter(Boolean);
      const igPositions = placeUI
        ? (placeUI.instagram_positions || [])
        : String(aFirst['Instagram Positions'] || '').split(',').map(s => s.trim()).filter(Boolean);
      // v0.20.0: UI device override wins; 'all' = explicit mobile+desktop; '' = CSV column / FB auto
      const devicePlatforms = state.devicePlatformsOverride
        ? (state.devicePlatformsOverride === 'all' ? ['mobile', 'desktop'] : [state.devicePlatformsOverride])
        : String(aFirst['Device Platforms'] || '').split(',').map(s => s.trim()).filter(Boolean);

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
        attribution_spec: attributionSpec(aFirst),
      };
      // EU DSA on adset level — required for some EU geos (esp. CEE: PL/CZ/HU/...)
      // FB API field is `dsa_payor` (American spelling). `dsa_payer` is silently
      // ignored → FB then rejects with [100/3858079] blame_field_specs:[["dsa_payor"]].
      if (state.dsaBeneficiary) {
        adsetBody.dsa_beneficiary = state.dsaBeneficiary;
        adsetBody.dsa_payor = state.dsaPayer || state.dsaBeneficiary;
      }
      if (!plan.isCBO) {
        // v0.7.0: per-adset budget override applies to every adset; else CSV column.
        const ovNum = parseNum(state.adsetBudgetOverride);
        const ab = String(aFirst['Ad Set Daily Budget'] || '').trim();
        const csvNum = (ab && ab.toUpperCase() !== 'UNDEFINED') ? parseNum(ab) : 0;
        const abNum = (state.adsetBudgetOverride && ovNum > 0) ? ovNum : csvNum;
        if (abNum > 0) {
          if (isLifetimeBudget()) {
            adsetBody.lifetime_budget = String(Math.round(abNum * 100));  // v0.8.0
            const et = budgetEndTimeUnix();
            if (et) adsetBody.end_time = String(et);
          } else {
            adsetBody.daily_budget = String(Math.round(abNum * 100));
          }
        }
        // v0.5.1: bid_strategy belongs on the adset for ABO. CBO inherits it from campaign.
        adsetBody.bid_strategy = bidStrategy;
      } else if (isLifetimeBudget()) {
        // v0.8.0: CBO + lifetime — FB requires each adset to carry the schedule end_time.
        const et = budgetEndTimeUnix();
        if (et) adsetBody.end_time = String(et);
      }
      if (bidAmountCents) adsetBody.bid_amount = bidAmountCents;
      // v0.10.0: optional delayed start (Kyiv→US timing). Lifetime already set end_time above.
      { const st = startTimeUnix(); if (st) adsetBody.start_time = String(st); }

      addLog('info', `[${accLabel}] creating adset ${adsetIdx}/${plan.adsetCount} "${adsetNameFinal}"...`);
      let adsetId;
      try {
        if (state.dryRun) {
          addLog('info', `[${accLabel}] 🟦 adset payload: ${JSON.stringify(adsetBody)}`);
          adsetId = `DRY_ADSET_${adsetIdx}`;
        } else {
          const adset = await apiFetch(`/act_${accId}/adsets`, { method: 'POST', body: adsetBody });
          adsetId = adset.id;
        }
        state.progress.done++;
        addLog('success', `[${accLabel}] ${state.dryRun ? '🟦 DRY ' : '✓ '}adset ${adsetIdx}/${plan.adsetCount} id=${adsetId} (${adsToCreate.length} ads coming)`);
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
          const itemDesc  = adInfo.forcedItem?.description || null;
          const adTitle = itemTitle || state.titleOverride || r['Title'] || '';
          const adBody  = itemBody  || state.bodyOverride  || r['Body']  || '';
          const cta     = itemCta   || state.ctaOverride   || r['Call to Action'] || 'LEARN_MORE';
          const adDesc  = itemDesc  || state.descriptionOverride || r['Link Description'] || r['Description'] || '';  // v0.8.0

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
            if (adDesc) objectStorySpec.video_data.link_description = adDesc;  // v0.8.0
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
            if (adDesc) objectStorySpec.link_data.description = adDesc;  // v0.8.0
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
          if (state.dryRun) {
            addLog('info', `[${accLabel}] 🟦 creative: ${JSON.stringify(objectStorySpec).slice(0, 500)}`);
            creative = { id: 'DRY_CREATIVE' };
          } else {
          try {
            creative = await apiFetch(`/act_${accId}/adcreatives`, { method: 'POST', body: creativeBody });
          } catch (e) {
            const msg = String(e.message || '');
            // v0.6.12: when user explicitly chose Use Page as Actor, never attempt
            // the IG fallback dance — that's the whole point of the checkbox.
            if (msg.includes('instagram_user_id') && objectStorySpec.instagram_user_id && !state.usePageAsActor) {
              const rejectedIg = objectStorySpec.instagram_user_id;
              addLog('warning', `[${accLabel}] FB rejected IG ${rejectedIg} — falling back to Page-Backed IG (always promotable for this page)...`);
              // Bust any stale cache entry from initial resolveAccountIg so the
              // ladder runs fresh instead of returning the rejected value again.
              const ladderKey = `${accId || ''}__${pageId || ''}`;
              delete state.pageIgMap[ladderKey];
              // v0.15.0: the rejected value was usually the page's connected IG (not promotable
              // in THIS account). Re-running the full ladder returns it again → same rejection.
              // PBIA is the page's own IG, guaranteed promotable here, so go straight to it.
              const fallbackIg = (pageId ? (await loadPbiaForPage(pageId))?.igId : '') || await loadIgForAccount(accId, pageId);
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
          }  // end else (non-dry-run creative)
          // v0.11.0: confirm the IG identity actually stuck (catches FB's silent drop).
          await verifyCreativeIg(creative?.id, resolvedIg, accLabel, adName);
          // v0.7.0: markers on FB ad name only; adName stays clean for token context (sub5/ad_name)
          const adNameFinal = applyMarkers(adName);
          const adBodyPost = {
            name: adNameFinal,
            adset_id: adsetId,
            creative: JSON.stringify({ creative_id: creative.id }),
            status: state.createStatus,
          };
          // EU DSA fields (required when targeting EU; safe to send for all)
          // FB API field is `dsa_payor` (not `dsa_payer`) — see adset note above.
          if (state.dsaBeneficiary) {
            adBodyPost.dsa_beneficiary = state.dsaBeneficiary;
            adBodyPost.dsa_payor = state.dsaPayer || state.dsaBeneficiary;  // payor defaults to beneficiary
          }
          if (state.dryRun) {
            addLog('info', `[${accLabel}] 🟦 ad payload: ${JSON.stringify(adBodyPost)}`);
          } else {
            await apiFetch(`/act_${accId}/ads`, { method: 'POST', body: adBodyPost });
          }
          totalAdOk++;
          state.progress.done++;
          addLog('success', `[${accLabel}] ${state.dryRun ? '🟦 DRY ' : '✓ '}ad ${i + 1}/${adsToCreate.length} "${adNameFinal}"`);
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
      /* v0.18.0 Cyberpunk HUD: palette nudged from navy → dark teal-black so the whole console reads
         as the reference. Cyan accents brightened. Levers: TEAL bg pair + .field/.fbl-main bg below. */
      #${PANEL_ID} { position:fixed; top:0; right:0; width:1140px; max-width:96vw; height:100vh;
        background:linear-gradient(180deg,#061a22 0%,#04141a 100%); color:#e2e8f0; z-index:2147483646;
        border-left:1px solid #0e3a47; box-shadow:-10px 0 30px rgba(0,0,0,.5),inset 1px 0 0 rgba(56,189,248,.12);
        font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
        font-size:13px; display:flex; flex-direction:column; overflow:hidden; box-sizing:border-box; }
      /* v0.19.1: panel-frame HUD corner brackets removed (visual clutter — user request). */
      /* v0.14.0: custom scrollbar on the inner scroll panes (left log rail + right form) */
      #${PANEL_ID} .fbl-scroll::-webkit-scrollbar { width:10px; }
      #${PANEL_ID} .fbl-scroll::-webkit-scrollbar-track { background:transparent; }
      #${PANEL_ID} .fbl-scroll::-webkit-scrollbar-thumb { background:#243049; border-radius:5px; border:2px solid #0a0f1c; }
      #${PANEL_ID} .fbl-scroll::-webkit-scrollbar-thumb:hover { background:#3b4a66; }
      /* v0.14.0: two-column body — left log rail, right scrolling form. Header spans both. */
      #${PANEL_ID} .fbl-cols { display:flex; flex:1; min-height:0; overflow:hidden; }
      #${PANEL_ID} .fbl-lograil { width:330px; flex-shrink:0; display:flex; flex-direction:column;
        border-right:1px solid #0e3a47; background:#03101a; transition:width .15s; }
      #${PANEL_ID} .fbl-lograil.collapsed { width:38px; }
      #${PANEL_ID} .fbl-railhead { flex-shrink:0; display:flex; align-items:center; justify-content:space-between;
        padding:9px 11px; font-size:12px; font-weight:700; color:#7dd3fc; border-bottom:1px solid #0e3a47;
        font-family:ui-monospace,monospace; letter-spacing:.5px; text-shadow:0 0 7px rgba(56,189,248,.5); }
      /* v0.18.0 Cyberpunk HUD: "● STATUS: ONLINE" line above the live feed — green dot + green mono text. */
      #${PANEL_ID} .fbl-railstatus { flex-shrink:0; display:flex; align-items:center; gap:7px;
        padding:8px 11px 6px; font-family:ui-monospace,monospace; font-size:10.5px; font-weight:700;
        letter-spacing:1px; color:#4ade80; }
      #${PANEL_ID} .fbl-railstatus .dot { width:8px; height:8px; border-radius:50%; background:#22c55e;
        box-shadow:0 0 8px #22c55e; animation:fbl-led-pulse 2.4s ease-in-out infinite; }
      #${PANEL_ID} .fbl-railstatus.warn { color:#fbbf24; } #${PANEL_ID} .fbl-railstatus.warn .dot { background:#fbbf24; box-shadow:0 0 8px #fbbf24; }
      #${PANEL_ID} .fbl-railstatus.err { color:#f87171; } #${PANEL_ID} .fbl-railstatus.err .dot { background:#ef4444; box-shadow:0 0 8px #ef4444; }
      #${PANEL_ID} .fbl-lograil.collapsed .fbl-railstatus { display:none; }
      #${PANEL_ID} .fbl-railbody { flex:1; min-height:0; display:flex; flex-direction:column; padding:10px 11px; overflow:hidden; }
      #${PANEL_ID} .fbl-lograil.collapsed .fbl-railbody, #${PANEL_ID} .fbl-lograil.collapsed .fbl-railhead .ttl { display:none; }
      /* v0.17.1 Holographic HUD: cyan dot-grid mesh behind the right form column only — clearly visible
         in the gaps between cards (rail stays #05080f telemetry). Cards/inputs have solid bg, so
         labels/values stay crisp over it; the grid only reads in the negative space. */
      #${PANEL_ID} .fbl-main { flex:1; min-width:0; overflow-y:auto; padding:0 18px 18px;
        background-image:radial-gradient(circle, rgba(56,189,248,.13) 1.4px, transparent 1.4px);
        background-size:22px 22px; animation:fbl-mesh-drift 36s linear infinite; }
      @keyframes fbl-mesh-drift { from { background-position:0 0; } to { background-position:22px 44px; } }
      /* v0.16.0 Ops Cockpit: header → black command bar, mono title, status LED */
      #${PANEL_ID} h2 { margin:0; padding:14px 18px; font-size:14px; font-weight:700; color:#e8eef7; flex-shrink:0;
        background:#080d18; border-bottom:1px solid #1a2740;
        font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
        display:flex; align-items:center; justify-content:space-between; z-index:5;
        box-shadow:0 2px 12px rgba(0,0,0,.4); letter-spacing:1px; }
      #${PANEL_ID} h2 .fbl-title { display:flex; align-items:center; gap:9px; }
      #${PANEL_ID} .fbl-led { width:9px; height:9px; border-radius:50%; flex-shrink:0;
        background:#22c55e; box-shadow:0 0 6px currentColor; animation:fbl-led-pulse 2.4s ease-in-out infinite; }
      #${PANEL_ID} .fbl-led.warn { background:#fbbf24; }
      #${PANEL_ID} .fbl-led.err { background:#ef4444; }
      @keyframes fbl-led-pulse { 0%,100% { opacity:1; } 50% { opacity:.45; } }
      #${PANEL_ID} .sub { color:#94a3b8; font-size:11px; margin:14px 0; }
      /* v0.18.0 Cyberpunk HUD: cards = framed instrument modules. Teal-black surface, cyan telemetry tick (read-only/state, NOT clickable).
         Faint cyan inset top hairline at rest = module edge. Lever: card bg #082530 → #0a1b26 if too bright over the grid. */
      #${PANEL_ID} .field { position:relative; background:#082530; border:1px solid #103a47; border-left:3px solid #38bdf8;
        border-radius:9px; padding:11px 13px; margin-bottom:11px; transition:border-color .15s,box-shadow .15s;
        box-shadow:inset 0 1px 0 rgba(56,189,248,.12); }
      #${PANEL_ID} .field:hover { border-left-color:#7dd3fc; }
      /* v0.19.1: per-card HUD corner brackets removed (visual clutter — user request).
         Card keeps its left cyan tick (border-left) + focus lift below. */
      #${PANEL_ID} .field::after { content:none; }
      /* v0.18.0 Cyberpunk HUD: active step card = lock-on (border + surface lift; corner brackets removed v0.19.1). */
      #${PANEL_ID} .field:focus-within { border-color:#2b6e8a; border-left-color:#7dd3fc; box-shadow:0 0 16px rgba(56,189,248,.16),inset 0 1px 0 rgba(56,189,248,.2); }
      /* nested .field stays bracket-free + edge-free — only the outer numbered step cards get the HUD frame */
      #${PANEL_ID} .field .field { position:static; background:none; border:none; border-radius:0; padding:0; margin:0; box-shadow:none; }
      #${PANEL_ID} .field .field::after { content:none; }
      #${PANEL_ID} .field .field:focus-within { box-shadow:none; }
      #${PANEL_ID} .field > label { font-size:12px; font-weight:600; color:#e8eef7; margin-bottom:7px; letter-spacing:.2px; }
      /* v0.18.0 Cyberpunk HUD: top-level step-card titles → HUD module headers (uppercase + tracking + leading cyan glyph).
         Scoped to .fbl-main > .field > label so nested grid sub-labels stay sentence-case. Grey hint spans keep their case (text-transform:none). */
      #${PANEL_ID} .fbl-main > .field > label { text-transform:uppercase; letter-spacing:.9px; font-size:11.5px; color:#d6f3ff;
        display:flex; align-items:baseline; flex-wrap:wrap; gap:5px; }
      #${PANEL_ID} .fbl-main > .field > label::before { content:'▸'; color:#38bdf8; font-weight:700;
        text-shadow:0 0 6px rgba(56,189,248,.7); margin-right:1px; text-transform:none; }
      #${PANEL_ID} .fbl-main > .field > label span, #${PANEL_ID} .fbl-main > .field > label code,
      #${PANEL_ID} .fbl-main > .field > label b { text-transform:none; letter-spacing:0; }
      #${PANEL_ID} label { display:block; font-size:11px; color:#94a3b8; margin-bottom:3px; }
      #${PANEL_ID} input[type=text], #${PANEL_ID} input[type=file], #${PANEL_ID} input[type=datetime-local], #${PANEL_ID} select, #${PANEL_ID} textarea {
        width:100%; padding:7px 9px; background:#06222d; border:1px solid #1a4a5a;
        border-radius:6px; color:#e2e8f0; font-size:12px; box-sizing:border-box;
        font-family:inherit; transition:border-color .12s,box-shadow .12s; }
      /* v0.17.0 Holographic HUD: focus = cyan lock-on (telemetry accent; a state, not a default clickable affordance). Launch button stays action-blue. */
      #${PANEL_ID} input:focus, #${PANEL_ID} select:focus, #${PANEL_ID} textarea:focus { outline:none; border-color:#38bdf8; box-shadow:0 0 0 2px rgba(56,189,248,.25),0 0 10px rgba(56,189,248,.15); }
      /* v0.18.0 Cyberpunk HUD: secondary buttons → thin cyan-outlined transparent (cyan text), per the ref.
         (Accent-split normally keeps cyan off clickables; this ref pass intentionally allows it on secondary actions.) */
      #${PANEL_ID} button { padding:7px 12px; border-radius:6px; border:1px solid rgba(56,189,248,.45);
        background:rgba(56,189,248,.06); color:#7dd3fc; font-size:12px; cursor:pointer; font-family:inherit; transition:background .12s,border-color .12s,box-shadow .12s; }
      #${PANEL_ID} button:hover { background:rgba(56,189,248,.14); border-color:#38bdf8; box-shadow:0 0 8px rgba(56,189,248,.25); }
      /* v0.18.0 Cyberpunk HUD: the LAUNCH hero — giant, bright cyan→blue gradient, intense layered glow, framed with brackets.
         Lever: shrink padding 18px→13px / drop the two outer box-shadow rings to dial back the glow. */
      #${PANEL_ID} button.primary { position:relative; padding:18px 20px; font-size:15px; border-radius:11px;
        background:linear-gradient(100deg,#0ea5e9,#2563eb 55%,#3b82f6); border:none; color:#f0fbff; font-weight:800;
        letter-spacing:1.2px; text-transform:uppercase; text-shadow:0 0 10px rgba(8,30,60,.6);
        box-shadow:0 0 0 1px rgba(125,211,252,.6),0 0 22px rgba(56,189,248,.55),0 0 46px rgba(37,99,235,.4),0 6px 18px rgba(0,0,0,.45);
        transition:background .12s,box-shadow .12s,transform .05s; overflow:visible; }
      #${PANEL_ID} button.primary:hover:not(:disabled) { background:linear-gradient(100deg,#38bdf8,#2563eb 55%,#4f8df9);
        box-shadow:0 0 0 1px rgba(125,211,252,.85),0 0 30px rgba(56,189,248,.75),0 0 60px rgba(37,99,235,.5),0 6px 18px rgba(0,0,0,.45); }
      /* corner brackets framing the hero (cyan, glowing) */
      #${PANEL_ID} button.primary::after { content:''; position:absolute; inset:5px; border-radius:7px; pointer-events:none;
        background:
          linear-gradient(rgba(224,247,255,.95),rgba(224,247,255,.95)) left 0 top 0/16px 2.5px no-repeat,
          linear-gradient(rgba(224,247,255,.95),rgba(224,247,255,.95)) left 0 top 0/2.5px 16px no-repeat,
          linear-gradient(rgba(224,247,255,.95),rgba(224,247,255,.95)) right 0 top 0/16px 2.5px no-repeat,
          linear-gradient(rgba(224,247,255,.95),rgba(224,247,255,.95)) right 0 top 0/2.5px 16px no-repeat,
          linear-gradient(rgba(224,247,255,.95),rgba(224,247,255,.95)) left 0 bottom 0/16px 2.5px no-repeat,
          linear-gradient(rgba(224,247,255,.95),rgba(224,247,255,.95)) left 0 bottom 0/2.5px 16px no-repeat,
          linear-gradient(rgba(224,247,255,.95),rgba(224,247,255,.95)) right 0 bottom 0/16px 2.5px no-repeat,
          linear-gradient(rgba(224,247,255,.95),rgba(224,247,255,.95)) right 0 bottom 0/2.5px 16px no-repeat;
        filter:drop-shadow(0 0 4px rgba(224,247,255,.6)); }
      /* v0.16.0: confirm-feel press on the launch trigger */
      #${PANEL_ID} button.primary:active:not(:disabled) { transform:translateY(1px); box-shadow:inset 0 2px 10px rgba(0,0,0,.5),0 0 18px rgba(56,189,248,.4); }
      #${PANEL_ID} button.primary:disabled { background:linear-gradient(100deg,#16384a,#1b3a52); color:#7da8c0;
        box-shadow:0 0 0 1px rgba(56,189,248,.2),0 0 10px rgba(56,189,248,.1); }
      #${PANEL_ID} button.primary:disabled::after { filter:none; opacity:.45; }
      /* v0.18.0 Cyberpunk HUD: functional readiness subtitle under the launch hero (reuses blockReason / ready text). */
      #${PANEL_ID} .fbl-launch-sub { text-align:center; font-family:ui-monospace,monospace; font-size:10.5px; letter-spacing:1.5px;
        text-transform:uppercase; margin-top:9px; color:#5eead4; text-shadow:0 0 7px rgba(94,234,212,.4); }
      #${PANEL_ID} .fbl-launch-sub.blocked { color:#fbbf24; text-shadow:0 0 7px rgba(251,191,36,.35); }
      #${PANEL_ID} button:disabled:not(.primary) { opacity:.4; cursor:not-allowed; }
      #${PANEL_ID} .close { background:rgba(255,255,255,.12); border:none; color:#fff; font-size:18px; padding:0 8px; line-height:1.4; border-radius:5px; cursor:pointer; }
      #${PANEL_ID} .close:hover { background:rgba(255,255,255,.25); }
      #${PANEL_ID} .preview { background:linear-gradient(100deg,rgba(56,189,248,.1),rgba(37,99,235,.06)); border:1px solid #1a4a5a;
        border-left:3px solid #22c55e; border-radius:9px; padding:9px 12px; font-size:11px; color:#cbd5e1; line-height:1.9;
        margin-bottom:11px; }
      /* v0.18.0 Cyberpunk HUD: preview metrics = [bracketed] cyan readouts (read-only telemetry). Brackets via pseudo-els, CSS-only.
         Inline color:#22c55e/#ef4444 on the pixel <b> still wins (status), so only the neutral metric <b>s turn cyan-bracketed. */
      #${PANEL_ID} .preview b { font-family:ui-monospace,monospace; font-variant-numeric:tabular-nums; color:#5eead4;
        background:rgba(56,189,248,.08); border:1px solid rgba(56,189,248,.3); border-radius:4px; padding:0 5px;
        text-shadow:0 0 6px rgba(94,234,212,.3); white-space:nowrap; }
      #${PANEL_ID} .preview b::before { content:'['; color:#38bdf8; margin-right:3px; opacity:.8; }
      #${PANEL_ID} .preview b::after { content:']'; color:#38bdf8; margin-left:3px; opacity:.8; }
      /* v0.18.0 Cyberpunk HUD: reusable [bracketed] cyan readout for inline readonly counts (accounts/pages/pixels etc). */
      #${PANEL_ID} .fbl-readout { font-family:ui-monospace,monospace; font-variant-numeric:tabular-nums; color:#5eead4;
        background:rgba(56,189,248,.08); border:1px solid rgba(56,189,248,.3); border-radius:4px; padding:0 5px; white-space:nowrap;
        text-shadow:0 0 6px rgba(94,234,212,.3); }
      #${PANEL_ID} .fbl-readout::before { content:'['; color:#38bdf8; margin-right:3px; opacity:.8; }
      #${PANEL_ID} .fbl-readout::after { content:']'; color:#38bdf8; margin-left:3px; opacity:.8; }
      /* v0.16.0 Ops Cockpit: log rail = telemetry feed (the hero). Darkest surface + faint scanlines. */
      #${PANEL_ID} .log { flex:1; min-height:0; overflow-y:auto; background:#020a10;
        background-image:repeating-linear-gradient(0deg, rgba(56,189,248,.035) 0, rgba(56,189,248,.035) 1px, transparent 1px, transparent 3px);
        border:1px solid #0e3a47; border-radius:6px; padding:8px 10px;
        font-family:ui-monospace,monospace; font-size:11px; font-variant-numeric:tabular-nums; }
      #${PANEL_ID} .log div { word-break:break-word; line-height:1.45; margin-bottom:2px;
        padding:1px 0; }
      #${PANEL_ID} .log div.error-line { background:rgba(239,68,68,.08);
        border-left:2px solid #ef4444; padding-left:4px; margin:2px 0; }
      #${PANEL_ID} .log .ts { color:#38bdf8; opacity:.85; margin-right:6px; }
      /* v0.18.0 Cyberpunk HUD: segmented glowing meter — discrete cells (▮▮▮▮▯▯) not a smooth fill.
         The fill is a bright cyan→blue gradient; a ::after overlay of track-colored stripes punches the gaps between cells. */
      #${PANEL_ID} .progress { position:relative; height:11px; border-radius:3px; background:#031019;
        border:1px solid #103a47; overflow:hidden; margin:6px 0; box-shadow:inset 0 0 6px rgba(0,0,0,.5); }
      #${PANEL_ID} .progress > div { height:100%; background:linear-gradient(90deg,#38bdf8,#2563eb);
        box-shadow:0 0 10px rgba(56,189,248,.7),inset 0 0 4px rgba(224,247,255,.5); transition:width .3s; }
      #${PANEL_ID} .progress::after { content:''; position:absolute; inset:0; pointer-events:none;
        background:repeating-linear-gradient(90deg, transparent 0 9px, #031019 9px 12px); }
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
        #${PANEL_ID} .fbl-cols { flex-direction:column; }
        #${PANEL_ID} .fbl-lograil { width:auto; max-height:30vh; border-right:none; border-bottom:1px solid #1e2a44; }
        #${PANEL_ID} .fbl-lograil.collapsed { width:auto; }
      }
      /* v0.7.0: marker chips · v0.18.0 HUD: resting = dim teal cell, "on" = bright cyan active cell (a selected state). */
      #${PANEL_ID} .chips { display:flex; flex-wrap:wrap; gap:5px; }
      #${PANEL_ID} .chip { padding:3px 10px; border-radius:6px; font-size:11px; cursor:pointer;
        border:1px solid #1a4a5a; background:#06222d; color:#94a3b8; user-select:none; transition:all .12s; }
      #${PANEL_ID} .chip:hover { border-color:#2b6e8a; color:#cbd5e1; }
      #${PANEL_ID} .chip.on { background:rgba(56,189,248,.18); border-color:#38bdf8; color:#cffafe; font-weight:600; box-shadow:0 0 8px rgba(56,189,248,.3); }
      #${PANEL_ID} hr { border:none; border-top:1px solid #103a47; margin:16px 0 12px; }
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

  // v0.10.2: the upload→hash JSON (our standard {name, imageHash|videoId, thumbnailHash} format),
  // for copy-paste into ARIA / fb-campaign-generator / CSV. Prefers the auto-paired ads-mode items;
  // falls back to building from completed uploads. Returns '' when nothing usable is uploaded.
  function uploadedHashesJson() {
    if (state.creativesParsed?.mode === 'ads' && state.creativesParsed.items?.length) {
      return JSON.stringify(state.creativesParsed.items, null, 2);
    }
    const done = state.uploads.filter(u => u.status === 'done' && (u.imageHash || u.videoId));
    if (!done.length) return '';
    return JSON.stringify(done.map(u => {
      const o = { name: String(u.name || '').replace(/\.[^.]+$/, '') };
      if (u.videoId) o.videoId = u.videoId; else o.imageHash = u.imageHash;
      return o;
    }), null, 2);
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
    // v0.14.0: keep the log rail pinned to the newest line unless the user scrolled up to read history
    const logEl0 = document.getElementById('fbl-log');
    const logStick = logEl0 ? (logEl0.scrollHeight - logEl0.scrollTop - logEl0.clientHeight < 60) : true;

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

    // v0.7.0/v0.8.0: budget & bidding UI helpers
    const bMode = state.budgetModeOverride;
    const isLifetimeUI = state.budgetTypeOverride === 'lifetime';
    const budgetWord = isLifetimeUI ? 'lifetime' : 'daily';
    const budgetAmtVal = bMode === 'cbo' ? state.cboBudgetOverride : bMode === 'abo' ? state.adsetBudgetOverride : '';
    const budgetAmtLabel = bMode === 'cbo' ? `Campaign ${budgetWord} budget ($)`
      : bMode === 'abo' ? `Ad set ${budgetWord} budget ($ × ${plan ? plan.adsetCount : 'N'} adsets)`
      : 'Budget ($) — pick a mode first';
    // Bid amount only meaningful for cap strategies; disable when explicitly "no cap".
    const bidNeedsCapUI = state.bidStrategyOverride !== 'LOWEST_COST_WITHOUT_CAP';
    const phr = PHRASE_LIB[state.phraseVertical] || PHRASE_LIB.insurance;
    // v0.10.1: cluster split active → single geo fields are ignored (each adset uses its own geo)
    const splitClustersSel = (state.adsetSplitClusters || []).map(i => GEO_PRESETS[i]).filter(Boolean);
    const splitActive = splitClustersSel.length > 0;

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
    else if (!plan) blockReason = '⬆ Load CSV (step 1) or upload creatives for a CSV-less launch';
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
    else if (isLifetimeBudget() && !budgetEndTimeUnix()) blockReason = '⚠ Lifetime budget needs an end date (1b)';
    // v0.10.0: CSV-less needs objective + destination link from the UI.
    else if (plan && plan.csvless && !plan.objective) blockReason = '⬆ CSV-less: pick a Campaign Objective (1b)';
    else if (plan && plan.csvless && !state.linkOverride) blockReason = '⬆ CSV-less: set destination Link (step 7)';
    const runDisabled = !!blockReason;
    const totalAds = plan?.adCount || 0;
    const buttonLabel = blockReason
      ? blockReason
      : isMulti
        ? `🚀 LAUNCH ▸ ${totalAds} ads × ${state.targetAccIds.length} accounts (${totalAds * state.targetAccIds.length} ops)`
        : `🚀 LAUNCH ▸ ${totalAds} ads to ${esc(selectedAccs[0]?.name || 'account')}`;
    const progressPct = state.progress.total ? Math.round(state.progress.done / state.progress.total * 100) : 0;

    const ledClass = state.status.type === 'error' ? 'err' : state.status.type === 'warning' ? 'warn' : '';
    // v0.18.0 Cyberpunk HUD: rail status mirrors the header LED (online / standby / alert).
    const railStatusWord = ledClass === 'err' ? 'ALERT' : ledClass === 'warn' ? 'STANDBY' : 'ONLINE';
    panel.innerHTML = `
      <h2>
        <span class="fbl-title"><span class="fbl-led ${ledClass}"></span>METALAUNCH PRO // v0.20.0</span>
        <button class="close" id="fbl-close" title="Close">×</button>
      </h2>
      <div class="fbl-cols">
        <aside class="fbl-lograil${state.logRailCollapsed ? ' collapsed' : ''}">
          <div class="fbl-railhead">
            <span class="ttl">◉ LIVE FEED${state.log.length ? ` · ${state.log.length}` : ''}</span>
            <button id="fbl-rail-toggle" title="${state.logRailCollapsed ? 'Expand log' : 'Collapse log'}" style="padding:1px 7px;font-size:12px;border-radius:5px">${state.logRailCollapsed ? '▶' : '◀'}</button>
          </div>
          <div class="fbl-railstatus ${ledClass}"><span class="dot"></span>STATUS: ${railStatusWord}</div>
          <div class="fbl-railbody">
            ${state.progress.total ? `<div class="progress" style="margin:0 0 8px"><div style="width:${progressPct}%"></div></div>` : ''}
            <div class="log fbl-scroll" id="fbl-log">${state.log.length ? logHtml() : '<div style="color:#475569">Logs appear here when you launch.<br><br>Build &amp; preview the campaign on the right →</div>'}</div>
          </div>
        </aside>
        <div class="fbl-main fbl-scroll" id="fbl-main">
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
        <label>1b. Campaign · objective, budget, schedule <span style="color:#6e7681">— fill to override CSV. Objective required for CSV-less.</span></label>
        <div class="grid2">
          <div class="field">
            <label>Campaign objective ${plan?.csvless ? '<span style="color:#fbbf24">⚠ required (no CSV)</span>' : ''}</label>
            <select id="fbl-objective">
              <option value="" ${state.objectiveOverride === '' ? 'selected' : ''}>— CSV —</option>
              <option value="OUTCOME_SALES" ${state.objectiveOverride === 'OUTCOME_SALES' ? 'selected' : ''}>Sales (conversions)</option>
              <option value="OUTCOME_LEADS" ${state.objectiveOverride === 'OUTCOME_LEADS' ? 'selected' : ''}>Leads</option>
              <option value="OUTCOME_TRAFFIC" ${state.objectiveOverride === 'OUTCOME_TRAFFIC' ? 'selected' : ''}>Traffic</option>
              <option value="OUTCOME_APP_PROMOTION" ${state.objectiveOverride === 'OUTCOME_APP_PROMOTION' ? 'selected' : ''}>App promotion</option>
              <option value="OUTCOME_ENGAGEMENT" ${state.objectiveOverride === 'OUTCOME_ENGAGEMENT' ? 'selected' : ''}>Engagement</option>
              <option value="OUTCOME_AWARENESS" ${state.objectiveOverride === 'OUTCOME_AWARENESS' ? 'selected' : ''}>Awareness</option>
            </select>
          </div>
          <div class="field">
            <label>Start time <span style="color:#6e7681">— empty = now (Kyiv→US timing)</span></label>
            <input type="datetime-local" id="fbl-start-date" value="${esc(state.startDate)}">
          </div>
        </div>
        <div class="grid3" style="margin-top:10px">
          <div class="field">
            <label>Budget mode</label>
            <select id="fbl-budget-mode">
              <option value="" ${bMode === '' ? 'selected' : ''}>— CSV —</option>
              <option value="cbo" ${bMode === 'cbo' ? 'selected' : ''}>CBO (campaign)</option>
              <option value="abo" ${bMode === 'abo' ? 'selected' : ''}>ABO (ad set)</option>
            </select>
          </div>
          <div class="field">
            <label>Budget type</label>
            <select id="fbl-budget-type">
              <option value="" ${state.budgetTypeOverride === '' ? 'selected' : ''}>— CSV (daily) —</option>
              <option value="daily" ${state.budgetTypeOverride === 'daily' ? 'selected' : ''}>Daily</option>
              <option value="lifetime" ${state.budgetTypeOverride === 'lifetime' ? 'selected' : ''}>Lifetime</option>
            </select>
          </div>
          <div class="field">
            <label>${budgetAmtLabel}</label>
            <input type="text" id="fbl-budget-amount" value="${esc(budgetAmtVal)}" placeholder="${bMode ? 'e.g. 50' : 'pick mode'}"${bMode ? '' : ' disabled style="opacity:.4"'}>
          </div>
        </div>
        ${isLifetimeUI ? `
        <div class="field" style="margin-top:10px">
          <label>Lifetime end date <span style="color:${budgetEndTimeUnix() ? '#22c55e' : '#fbbf24'}">${budgetEndTimeUnix() ? '✓' : '⚠ required for lifetime budget'}</span></label>
          <input type="datetime-local" id="fbl-budget-end" value="${esc(state.budgetEndDate)}">
        </div>` : ''}
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
        <label>2. Target accounts <span style="color:#6e7681">— ${hasAccounts ? `<span class="fbl-readout">${state.targetAccIds.length}</span> selected` : 'pick one or more'}</span></label>
        <div class="row">
          <input type="text" id="fbl-acc-filter" placeholder="Filter by name, ID, BM..." value="${esc(state.accFilter)}" style="flex:2">
          <button id="fbl-reload-acc" ${accountsLoading ? 'disabled' : ''}>${accountsLoading ? '⏳' : '↻'}</button>
          <button id="fbl-acc-toggle" title="Show/hide accounts list">${state.showAccountPicker ? '▼' : '▶'} List</button>
        </div>
        ${selectedAccs.length ? `
        <div style="margin-top:6px;display:flex;gap:4px;flex-wrap:wrap">
          ${selectedAccs.map(a => `
            <span style="background:rgba(56,189,248,.12);border:1px solid rgba(56,189,248,.4);border-radius:6px;padding:2px 8px;font-size:11px;color:#cffafe;display:inline-flex;align-items:center;gap:5px;font-family:ui-monospace,monospace;box-shadow:0 0 8px rgba(56,189,248,.2)" title="${esc(a.id)} · BM: ${esc(a.bm)}">
              <span style="color:#38bdf8;opacity:.8">[</span>${esc(a.label)}<span style="color:#38bdf8;opacity:.8">]</span>
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
        <label>3. Page ID <span style="color:#6e7681">— ${state.pagesLoading ? 'loading pages...' : (() => {
          const promo = state.pagesList.filter(p => p.promotable).length;
          const other = state.pagesList.length - promo;
          return `<span class="fbl-readout">${state.pagesList.length}</span> pages found${other ? ` (<span class="fbl-readout">${promo}</span> promotable + ${other} more)` : ''}`;
        })()}</span></label>
        ${state.pagesList.length ? (() => {
          const promo = state.pagesList.filter(p => p.promotable);
          const other = state.pagesList.filter(p => !p.promotable);
          const opt = p => `<option value="${esc(p.id)}" ${state.pageIdOverride === p.id ? 'selected' : ''}>${esc(p.name)} (${esc(p.id)})</option>`;
          return `
        <select id="fbl-page-select" style="margin-bottom:5px">
          <option value="">— from CSV "Link Object ID" —</option>
          ${promo.length ? `<optgroup label="✓ Promotable from this account">${promo.map(opt).join('')}</optgroup>` : ''}
          ${other.length ? `<optgroup label="Also available to this token">${other.map(opt).join('')}</optgroup>` : ''}
        </select>`;
        })() : ''}
        <input type="text" id="fbl-page-id" value="${esc(state.pageIdOverride)}" placeholder="${state.pagesList.length ? 'or paste custom page ID' : 'page ID (14-20 digits) — empty = use CSV'}" style="margin-bottom:8px">
        <label style="display:flex;align-items:center;gap:6px;margin-top:5px;cursor:pointer">
          <input type="checkbox" id="fbl-use-page-as-actor" ${state.usePageAsActor ? 'checked' : ''}>
          <span><b style="color:${state.usePageAsActor ? '#fbbf24' : 'inherit'}">⛔ FB-only — БЕЗ Instagram</b> <span style="color:#6e7681">— ставь ТОЛЬКО если IG не нужен совсем: шлёт один page_id, instagram_user_id НЕ отправляется → объявление НЕ крутится в Instagram, IG-слот пустой. ${state.usePageAsActor ? '<b style="color:#fbbf24">⚠ сейчас включено — IG выключен</b>' : ''}</span></span>
        </label>
        ${!state.usePageAsActor ? `<div style="font-size:11px;color:#22c55e;margin-top:3px;padding-left:22px">✅ дефолт (галка снята): ФП авто-используется и в Instagram (page-backed IG) — крутится в FB <b>и</b> IG под именем Страницы</div>` : ''}
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
            // v0.11.0 sources: connected_instagram_account+promotable / *-unverified / account-substitute / pbia / page
            const s = ig.source || '';
            const promotable = /\+promotable|account-substitute/.test(s);
            const srcLabel = s.includes('connected_instagram_account') ? (promotable ? 'page IG (promotable ✓)' : '⚠ page IG (not in this account — verified after create)')
              : s.includes('instagram_business_account') ? (promotable ? 'page Business IG (promotable ✓)' : '⚠ page Business IG (unverified)')
              : s === 'account-substitute' ? `⚠ account actor — page has no IG${ig.count > 1 ? ` · 1 of ${ig.count}` : ''}`
              : s === 'pbia' ? 'page-backed IG (PBIA)'
              : s === 'page' ? '⚠ page actor (may not be promotable here)' : 'detected';
            const color = promotable ? '#22c55e' : '#fbbf24';
            return `<div style="font-size:11px;color:${color};margin-top:4px">🔗 ${srcLabel}: <b>${esc(ig.igId)}</b>${ig.igName ? ` @${esc(ig.igName)}` : ''}${isMulti ? ' · lookup runs per account at launch' : ''}</div>`;
          }
          return `<div style="font-size:11px;color:#fbbf24;margin-top:4px">⚠ No IG actor available for account ${esc(probeAcc || '?')} — instagram_user_id omitted at launch (FB uses default)</div>`;
        })()}
      </div>

      <div class="field">
        <label>4. Pixel &amp; Conversion event <span style="color:#6e7681">— ${state.pixelsLoading ? 'loading pixels...' : `<span class="fbl-readout">${state.pixelsList.length}</span> pixels in account`}</span></label>
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
        <label style="margin-top:6px">Attribution window <span style="color:#6e7681">— how FB credits conversions to clicks/views</span></label>
        <select id="fbl-attribution">
          <option value="" ${state.attributionOverride === '' ? 'selected' : ''}>— CSV / default (1-day click) —</option>
          <option value="1d_click" ${state.attributionOverride === '1d_click' ? 'selected' : ''}>1-day click</option>
          <option value="7d_click" ${state.attributionOverride === '7d_click' ? 'selected' : ''}>7-day click</option>
          <option value="1d_click_1d_view" ${state.attributionOverride === '1d_click_1d_view' ? 'selected' : ''}>1-day click + 1-day view</option>
          <option value="7d_click_1d_view" ${state.attributionOverride === '7d_click_1d_view' ? 'selected' : ''}>7-day click + 1-day view</option>
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
        <label>5b. Targeting <span style="color:#6e7681">— fill to override CSV for ALL adsets; empty = use CSV column</span>${plan?.sacList.length ? ` <span style="color:#fbbf24">· SAC: ${esc(plan.sacList[0])} — state targeting disabled</span>` : ''}</label>
        <div class="field">
          <label>Special Ad Category <span style="color:#6e7681">— lead-gen insurance = Financial; restricts state targeting</span></label>
          <select id="fbl-sac">
            <option value="" ${state.sacOverride === '' ? 'selected' : ''}>— CSV —</option>
            <option value="NONE" ${state.sacOverride === 'NONE' ? 'selected' : ''}>None (no restriction)</option>
            <option value="FINANCIAL_PRODUCTS_SERVICES" ${state.sacOverride === 'FINANCIAL_PRODUCTS_SERVICES' ? 'selected' : ''}>Financial products &amp; services</option>
            <option value="CREDIT" ${state.sacOverride === 'CREDIT' ? 'selected' : ''}>Credit</option>
            <option value="HOUSING" ${state.sacOverride === 'HOUSING' ? 'selected' : ''}>Housing</option>
            <option value="EMPLOYMENT" ${state.sacOverride === 'EMPLOYMENT' ? 'selected' : ''}>Employment</option>
            <option value="ISSUES_ELECTIONS_POLITICS" ${state.sacOverride === 'ISSUES_ELECTIONS_POLITICS' ? 'selected' : ''}>Social issues / elections / politics</option>
            <option value="ONLINE_GAMBLING_AND_GAMING" ${state.sacOverride === 'ONLINE_GAMBLING_AND_GAMING' ? 'selected' : ''}>Online gambling &amp; gaming</option>
          </select>
        </div>
        <div class="field">
          <label>Geo preset <span style="color:#6e7681">— lead-gen tiers fill US states · gambling pools fill countries (editable after)</span></label>
          <select id="fbl-geo-cluster">
            <option value="">— pick a preset to fill geo —</option>
            ${['Lead-gen — US states', 'Gambling — countries'].map(g => `<optgroup label="${esc(g)}">${GEO_PRESETS.map((p, i) => p.group === g ? `<option value="${i}">${esc(p.label)}</option>` : '').join('')}</optgroup>`).join('')}
          </select>
        </div>
        <div class="field" ${splitActive ? 'style="border-left-color:#22c55e"' : ''}>
          <label>Split into ad sets by cluster <span style="color:#6e7681">— click clusters → one ad set EACH, own geo. Waterfall in one launch.</span></label>
          <div class="chips">
            ${GEO_PRESETS.map((p, i) => `<span class="chip ${state.adsetSplitClusters.includes(i) ? 'on' : ''}" data-clusteridx="${i}" title="${esc(p.value)}">${esc(p.label.replace(/ \(.*\)$/, '').replace(/ · .*/, ''))}</span>`).join('')}
          </div>
          ${splitActive ? `
          <div style="margin-top:8px;background:rgba(34,197,94,.07);border:1px solid rgba(34,197,94,.25);border-radius:6px;padding:7px 9px">
            <div style="font-size:11px;color:#4ade80;font-weight:600;margin-bottom:5px">→ ${splitClustersSel.length} ad set${splitClustersSel.length > 1 ? 's' : ''} will be created (creatives go into each):</div>
            ${splitClustersSel.map((p, i) => `<div style="font-size:11px;color:#cbd5e1;line-height:1.5;margin-bottom:3px"><b style="color:#fff">${String(i + 1).padStart(2, '0')} ${esc(p.label.replace(/ \(.*\)$/, '').replace(/ · .*/, ''))}</b> <span style="color:#6e7681">${p.field === 'states' ? 'states' : 'countries'}:</span> ${esc(p.value)}</div>`).join('')}
            <div style="font-size:10px;color:#fbbf24;margin-top:4px">↑ single Countries / US-states fields below are ignored while split is on. Click a chip again to remove.</div>
          </div>` : ''}
        </div>
        <div class="field">
          <label>Or — number of ad sets <span style="color:#6e7681">${
            !plan?.csvless ? '(driven by CSV ad-set names — ignored here)'
            : splitActive ? '(ignored — cluster split defines ad sets)'
            : '— CSV-less: make N identical ad sets (same targeting). Distribute creatives in 6.5 below.'
          }</span></label>
          <input type="number" min="1" max="50" id="fbl-adset-count" value="${esc(state.adsetCountOverride)}" placeholder="1"${(!plan?.csvless || splitActive) ? ' disabled style="opacity:.4"' : ''}>
        </div>
        <div class="grid2" style="margin-top:10px">
          <div class="field">
            <label>Countries <span style="color:#6e7681">${splitActive ? '(ignored — cluster split on)' : '(codes, e.g. US,CA)'}</span></label>
            <input type="text" id="fbl-geo-countries" value="${esc(state.geoCountriesOverride)}" placeholder="${splitActive ? 'using cluster split ↑' : 'empty = CSV (default US)'}"${splitActive ? ' disabled style="opacity:.4"' : ''}>
          </div>
          <div class="field">
            <label>US states <span style="color:#6e7681">${splitActive ? '(ignored — cluster split on)' : plan?.sacList.length ? '(disabled under SAC)' : '(names, comma-separated)'}</span></label>
            <input type="text" id="fbl-geo-states" value="${esc(state.geoStatesOverride)}" placeholder="${splitActive ? 'using cluster split ↑' : 'empty = CSV'}"${(splitActive || plan?.sacList.length) ? ' disabled style="opacity:.4"' : ''}>
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
        <div class="field" style="margin-top:10px">
          <label>Placements <span style="color:#6e7681">— preset fills the boxes, then toggle. Empty = CSV / automatic.</span></label>
          <div class="grid3">
            <div class="field">
              <label style="font-size:10px">Quick preset</label>
              <select id="fbl-placement-preset">
                <option value="">— preset —</option>
                <option value="all">All platforms</option>
                <option value="fb_ig">FB + IG</option>
                <option value="fb_only">FB only</option>
                <option value="feeds_only">Feeds only</option>
                <option value="reels_only">Reels only</option>
              </select>
            </div>
            <div class="field">
              <label style="font-size:10px">Devices</label>
              <select id="fbl-devices">
                <option value="" ${state.devicePlatformsOverride === '' ? 'selected' : ''}>— CSV / auto —</option>
                <option value="all" ${state.devicePlatformsOverride === 'all' ? 'selected' : ''}>All (mobile + desktop)</option>
                <option value="mobile" ${state.devicePlatformsOverride === 'mobile' ? 'selected' : ''}>📱 Mobile only</option>
                <option value="desktop" ${state.devicePlatformsOverride === 'desktop' ? 'selected' : ''}>🖥️ Desktop only</option>
              </select>
            </div>
            <div class="field">
              <label style="font-size:10px">Advantage Audience <span style="color:#475569">(On → age 18-65)</span></label>
              <select id="fbl-advantage">
                <option value="" ${state.advantageAudienceOverride === '' ? 'selected' : ''}>— CSV —</option>
                <option value="0" ${state.advantageAudienceOverride === '0' ? 'selected' : ''}>Off</option>
                <option value="1" ${state.advantageAudienceOverride === '1' ? 'selected' : ''}>On</option>
              </select>
            </div>
          </div>
          <div style="font-size:10px;color:#6e7681;margin:6px 0 3px">Platforms</div>
          <div class="chips">
            ${PLACEMENT_PLATFORMS.map(([id, label]) => `<span class="chip ${state.placementPlatforms.includes(id) ? 'on' : ''}" data-platform="${esc(id)}">${esc(label)}</span>`).join('')}
          </div>
          <div style="font-size:10px;color:#6e7681;margin:6px 0 3px">Position groups <span style="color:#475569">(none = all positions)</span></div>
          <div class="chips">
            ${Object.entries(PLACEMENT_POSITION_GROUPS).map(([k, def]) => `<span class="chip ${state.placementPositionGroups.includes(k) ? 'on' : ''}" data-posgroup="${esc(k)}">${esc(def.label)}</span>`).join('')}
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
        ${(() => {
          const hj = uploadedHashesJson();
          if (!hj) return '';
          const n = (() => { try { return JSON.parse(hj).length; } catch { return ''; } })();
          return `
          <div class="field" style="border-left-color:#a78bfa;margin-bottom:8px">
            <label style="display:flex;align-items:center;justify-content:space-between">
              <span>📋 Hashes <span style="color:#6e7681">— ${n} item(s), ready to copy</span></span>
              <button id="fbl-copy-hashes" style="padding:4px 10px;font-size:11px">Copy JSON</button>
            </label>
            <textarea id="fbl-hashes-out" readonly style="width:100%;min-height:70px;padding:6px 8px;background:#0d1726;border:1px solid #2b3a55;border-radius:6px;color:#a5b4fc;font-size:11px;font-family:ui-monospace,monospace;box-sizing:border-box;resize:vertical">${esc(hj)}</textarea>
          </div>`;
        })()}
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
          <button id="fbl-assign-roundrobin" style="font-size:11px;padding:3px 8px" title="Round-robin: ad set 1 → creative 1, ad set 2 → creative 2, … cycling. One creative per ad set.">↔ 1 per ad set</button>
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
        <div class="field">
          <label style="font-size:10px">AIDA phrase library <span style="color:#6e7681">— pick to fill a field, then edit. Attention=title · Interest+Desire=body · Action=description</span></label>
          <select id="fbl-phrase-vertical">
            ${Object.entries(PHRASE_LIB).map(([k, v]) => `<option value="${esc(k)}" ${state.phraseVertical === k ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}
          </select>
        </div>
        <div class="grid2">
          <div class="field">
            <input type="text" id="fbl-title-override" value="${esc(state.titleOverride)}" placeholder="Title (headline) — empty = use CSV Title">
          </div>
          <div class="field">
            <select id="fbl-phrase-title">
              <option value="">↳ insert headline (Attention)…</option>
              ${phr.title.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('')}
            </select>
          </div>
        </div>
        <textarea id="fbl-body-override" placeholder="Body (primary text) — empty = use CSV Body" style="width:100%;min-height:50px;padding:6px 8px;background:#1e293b;border:1px solid #334155;border-radius:5px;color:#e2e8f0;font-size:12px;font-family:inherit;box-sizing:border-box;resize:vertical;margin:5px 0">${esc(state.bodyOverride)}</textarea>
        <select id="fbl-phrase-body" style="margin-bottom:5px">
          <option value="">↳ insert primary text (Interest+Desire)…</option>
          ${phr.body.map(b => `<option value="${esc(b)}">${esc(b.length > 70 ? b.slice(0, 70) + '…' : b)}</option>`).join('')}
        </select>
        <div class="grid2">
          <div class="field">
            <input type="text" id="fbl-description-override" value="${esc(state.descriptionOverride)}" placeholder="Description (link) — empty = use CSV">
          </div>
          <div class="field">
            <select id="fbl-phrase-desc">
              <option value="">↳ insert description (Action/CTA)…</option>
              ${phr.desc.map(d => `<option value="${esc(d)}">${esc(d)}</option>`).join('')}
            </select>
          </div>
        </div>
        <select id="fbl-cta-override" style="margin-top:5px">
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
        <label style="display:flex;align-items:center;gap:6px;margin-top:8px;cursor:pointer">
          <input type="checkbox" id="fbl-dry-run" ${state.dryRun ? 'checked' : ''} style="width:auto;margin:0">
          <span><b>🟦 Dry run</b> <span style="color:#6e7681">— build &amp; log API payloads, don't actually create anything</span></span>
        </label>
      </div>

      <hr>

      <button class="primary" id="fbl-run" ${runDisabled ? 'disabled' : ''} style="width:100%">
        ${state.dryRun && !runDisabled ? '🟦 DRY RUN — ' : ''}${buttonLabel}
      </button>
      <div class="fbl-launch-sub${runDisabled && !state.running ? ' blocked' : ''}">${
        state.running ? '◉ LAUNCH SEQUENCE RUNNING…'
        : runDisabled ? '▲ AWAITING SETUP — RESOLVE STEP ABOVE'
        : state.dryRun ? '◇ DRY RUN ARMED — NO LIVE WRITES'
        : '● SYSTEM READY — AWAITING COMMAND'
      }</div>
        </div>
      </div>
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
    // v0.14.0: log auto-stick to bottom (overrides the generic restore above for #fbl-log)
    const logEl = document.getElementById('fbl-log');
    if (logEl && logStick) logEl.scrollTop = logEl.scrollHeight;

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
    // v0.14.0: collapse/expand the left log rail
    document.getElementById('fbl-rail-toggle')?.addEventListener('click', () => {
      state.logRailCollapsed = !state.logRailCollapsed;
      render();
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
    // v0.12.0: round-robin — ad set i gets creative (i mod total). One creative per ad set, cycling.
    document.getElementById('fbl-assign-roundrobin')?.addEventListener('click', () => {
      const p = analyzePlan();
      if (!p?.adsMode) return;
      const total = p.adsModeItems.length;
      [...p.groups.keys()].forEach((adsetName, i) => { state.adsetAssignments[adsetName] = [i % total]; });
      render();
    });

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
    document.getElementById('fbl-devices')?.addEventListener('change', e => { state.devicePlatformsOverride = e.target.value; });
    // v0.20.0: Advantage ON → default age 18-65 (visible in the inputs, still editable after)
    document.getElementById('fbl-advantage')?.addEventListener('change', e => {
      state.advantageAudienceOverride = e.target.value;
      if (e.target.value === '1') {
        state.ageMinOverride = '18';
        state.ageMaxOverride = '65';
        const mn = document.getElementById('fbl-age-min'), mx = document.getElementById('fbl-age-max');
        if (mn) mn.value = '18';
        if (mx) mx.value = '65';
      }
    });
    document.getElementById('fbl-sac')?.addEventListener('change', e => { state.sacOverride = e.target.value; render(); });  // v0.9.0: SAC gates state targeting → re-render
    // v0.8.0/v0.9.0: geo preset — fills states OR countries depending on the preset's field
    document.getElementById('fbl-geo-cluster')?.addEventListener('change', e => {
      const p = GEO_PRESETS[+e.target.value];
      if (p) {
        if (p.field === 'states') state.geoStatesOverride = p.value;
        else state.geoCountriesOverride = p.value;
      }
      render();
    });
    // v0.10.0: cluster-split chips — one adset per selected cluster
    panel.querySelectorAll('.chip[data-clusteridx]').forEach(el => {
      el.addEventListener('click', () => {
        const idx = +el.dataset.clusteridx;
        const i = state.adsetSplitClusters.indexOf(idx);
        if (i >= 0) state.adsetSplitClusters.splice(i, 1); else state.adsetSplitClusters.push(idx);
        render();
      });
    });
    // v0.10.0: objective / start time / dry run
    document.getElementById('fbl-objective')?.addEventListener('change', e => { state.objectiveOverride = e.target.value; render(); });
    // v0.12.0: CSV-less adset count — re-render to update preview + show/hide the 6.5 distribution matrix
    document.getElementById('fbl-adset-count')?.addEventListener('input', e => { state.adsetCountOverride = e.target.value.trim(); render(); });
    document.getElementById('fbl-start-date')?.addEventListener('input', e => { state.startDate = e.target.value; });
    document.getElementById('fbl-dry-run')?.addEventListener('change', e => { state.dryRun = e.target.checked; render(); });
    // v0.8.0: placement preset fills the checkbox arrays
    document.getElementById('fbl-placement-preset')?.addEventListener('change', e => {
      const p = PLACEMENT_PRESETS[e.target.value];
      if (p) { state.placementPlatforms = p.platforms.slice(); state.placementPositionGroups = p.groups.slice(); }
      render();
    });
    // v0.8.0: placement platform + position-group chips
    panel.querySelectorAll('.chip[data-platform]').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.dataset.platform;
        const i = state.placementPlatforms.indexOf(id);
        if (i >= 0) state.placementPlatforms.splice(i, 1); else state.placementPlatforms.push(id);
        render();
      });
    });
    panel.querySelectorAll('.chip[data-posgroup]').forEach(el => {
      el.addEventListener('click', () => {
        const g = el.dataset.posgroup;
        const i = state.placementPositionGroups.indexOf(g);
        if (i >= 0) state.placementPositionGroups.splice(i, 1); else state.placementPositionGroups.push(g);
        render();
      });
    });
    // v0.7.0: budget & bidding
    document.getElementById('fbl-budget-mode')?.addEventListener('change', e => {
      state.budgetModeOverride = e.target.value;
      render();  // swap amount field label + enable/disable
    });
    document.getElementById('fbl-budget-type')?.addEventListener('change', e => {
      state.budgetTypeOverride = e.target.value;
      render();  // toggle lifetime end-date field + relabel amount
    });
    document.getElementById('fbl-budget-end')?.addEventListener('input', e => {
      state.budgetEndDate = e.target.value;
      render();  // update ✓/⚠ on end-date label
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
    document.getElementById('fbl-attribution')?.addEventListener('change', e => { state.attributionOverride = e.target.value; });
    const creativesEl = document.getElementById('fbl-creatives');
    if (creativesEl) {
      creativesEl.addEventListener('input', e => {
        state.creativesInput = e.target.value;
        state.creativesParsed = parseCreatives(state.creativesInput);
        // Don't re-render on each keystroke — would lose focus on textarea
      });
      creativesEl.addEventListener('blur', () => render());
    }
    // v0.10.2: copy uploaded-hashes JSON to clipboard (fallback to selecting the textarea)
    document.getElementById('fbl-copy-hashes')?.addEventListener('click', async () => {
      const json = uploadedHashesJson();
      if (!json) return;
      try {
        await navigator.clipboard.writeText(json);
        setStatus('success', '📋 Hashes JSON copied to clipboard.');
      } catch {
        const ta = document.getElementById('fbl-hashes-out');
        if (ta) { ta.focus(); ta.select(); document.execCommand('copy'); setStatus('success', '📋 Hashes selected — Ctrl+C to copy.'); }
      }
      render();
    });
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
    document.getElementById('fbl-description-override')?.addEventListener('input', e => {
      state.descriptionOverride = e.target.value;
    });
    // v0.8.0: AIDA phrase library — vertical switch + insert-into-field dropdowns
    document.getElementById('fbl-phrase-vertical')?.addEventListener('change', e => {
      state.phraseVertical = e.target.value;
      render();  // refresh suggestion lists
    });
    document.getElementById('fbl-phrase-title')?.addEventListener('change', e => {
      if (e.target.value) { state.titleOverride = e.target.value; render(); }
    });
    document.getElementById('fbl-phrase-body')?.addEventListener('change', e => {
      if (e.target.value) { state.bodyOverride = e.target.value; render(); }
    });
    document.getElementById('fbl-phrase-desc')?.addEventListener('change', e => {
      if (e.target.value) { state.descriptionOverride = e.target.value; render(); }
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
