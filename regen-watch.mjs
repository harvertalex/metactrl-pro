#!/usr/bin/env node
/**
 * regen-watch.mjs — single source of truth для версии MetaWatch PRO.
 * Копия схемы regen-launcher.mjs: версия из шапки watchdog.js →
 *   1) регенерит B64 бакмарклета в install-watch.html
 *   2) стемпит версию в видимые лейблы страницы (badge + footer)
 *   3) sanity-чек дрейфа с in-panel заголовком (&gt;METAWATCH PRO // vX.Y.Z&lt;)
 *
 * Запуск: node regen-watch.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';

const SRC = 'watchdog.js';
const PAGE = 'install-watch.html';

const code = readFileSync(SRC, 'utf8');

const vm = code.match(/MetaWatch PRO v(\d+\.\d+\.\d+) — Bookmarklet/);
if (!vm) { console.error(`✗ version banner not found in ${SRC}`); process.exit(1); }
const ver = vm[1];

// In-panel заголовок живёт в JS как template string: >METAWATCH PRO // v${VERSION}<
// поэтому дрейф ловим по константе VERSION.
const tm = code.match(/const VERSION = '(\d+\.\d+\.\d+)'/);
if (!tm) {
  console.warn(`⚠ "const VERSION = '...'" not found — skip drift check`);
} else if (tm[1] !== ver) {
  console.warn(`⚠ VERSION DRIFT: banner v${ver} vs const VERSION v${tm[1]} in ${SRC} — fix one of them.`);
}

const b64 = Buffer.from(code, 'utf8').toString('base64');
let page = readFileSync(PAGE, 'utf8');
if (!/var B64 = '[^']*'/.test(page)) { console.error(`✗ "var B64 = '...'" placeholder not found in ${PAGE}`); process.exit(1); }
page = page.replace(/var B64 = '[^']*'/, `var B64 = '${b64}'`);

page = page
  .replace(/MetaWatch PRO v\d+\.\d+\.\d+ — Bookmarklet/g, `MetaWatch PRO v${ver} — Bookmarklet`)
  .replace(/Bookmarklet v\d+\.\d+\.\d+/g, `Bookmarklet v${ver}`);

writeFileSync(PAGE, page, 'utf8');

const roundtrip = Buffer.from(page.match(/var B64 = '([^']*)'/)[1], 'base64').toString('utf8') === code;
console.log(`✓ Watchdog regen: v${ver} · B64 ${b64.length} chars · labels stamped · decode==source: ${roundtrip}`);
if (!roundtrip) process.exit(1);
