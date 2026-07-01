#!/usr/bin/env node
/**
 * regen-launcher.mjs — single source of truth для версии FB Launcher.
 *
 * Берёт версию из шапки launcher.js ("FB Launcher vX.Y.Z — Bookmarklet") и:
 *   1) регенерит B64 бакмарклета в install-launcher.html
 *   2) стемпит эту версию во ВСЕ видимые лейблы страницы (badge + footer)
 *   3) sanity-чек: in-panel заголовок ("FB LAUNCHER // vX.Y.Z") обязан совпадать
 *      с шапкой — иначе дрейф (был баг: шапка v0.18.1, заголовок v0.18.3).
 *
 * Запуск: node regen-launcher.mjs   (дёргается из `deploy.bat regen`)
 * Идемпотентен: если версия уже проставлена — файл не меняется.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const LAUNCHER = 'launcher.js';
const PAGE = 'install-launcher.html';

const code = readFileSync(LAUNCHER, 'utf8');

// 1) Каноническая версия = баннер в шапке файла.
const vm = code.match(/FB Launcher v(\d+\.\d+\.\d+) — Bookmarklet/);
if (!vm) { console.error(`✗ version banner not found in ${LAUNCHER}`); process.exit(1); }
const ver = vm[1];

// 2) Sanity: in-panel заголовок ">FB LAUNCHER // vX.Y.Z<" должен совпадать с баннером.
//    Матчим именно заголовок (в угловых скобках), а не упоминания в changelog-комментах.
const tm = code.match(/>FB LAUNCHER \/\/ v(\d+\.\d+\.\d+)</);
if (!tm) {
  console.warn('⚠ in-panel title ">FB LAUNCHER // vX.Y.Z<" not found — skip drift check');
} else if (tm[1] !== ver) {
  console.warn(`⚠ VERSION DRIFT: banner v${ver} vs in-panel title v${tm[1]} in ${LAUNCHER} — fix the title span.`);
}

// 3) Регенерация B64.
const b64 = Buffer.from(code, 'utf8').toString('base64');
let page = readFileSync(PAGE, 'utf8');
// Check the placeholder EXISTS (не путать с "replace ничего не поменял" — при
// неизменном launcher.js B64 тот же, замена = no-op, но это не ошибка).
if (!/var B64 = '[^']*'/.test(page)) { console.error(`✗ "var B64 = '...'" placeholder not found in ${PAGE}`); process.exit(1); }
page = page.replace(/var B64 = '[^']*'/, `var B64 = '${b64}'`);

// 4) Стемп версии в видимые лейблы. Global — но плейнтекст "FB Launcher vX — Bookmarklet"
//    в B64 не встречается (blob — base64), так что бьёт только по HTML-вывескам.
page = page
  .replace(/FB Launcher v\d+\.\d+\.\d+ — Bookmarklet/g, `FB Launcher v${ver} — Bookmarklet`)
  .replace(/Bookmarklet v\d+\.\d+\.\d+/g, `Bookmarklet v${ver}`);

writeFileSync(PAGE, page, 'utf8');

// Integrity: decode назад == source.
const roundtrip = Buffer.from(page.match(/var B64 = '([^']*)'/)[1], 'base64').toString('utf8') === code;
console.log(`✓ Launcher regen: v${ver} · B64 ${b64.length} chars · labels stamped · decode==source: ${roundtrip}`);
if (!roundtrip) process.exit(1);
