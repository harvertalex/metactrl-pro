// FB Switchboard — регенератор B64 + version-stamp.
// Читает switchboard.js → base64 (UTF-8) → вставляет в install-switchboard.html.
// Версия — source of truth = `const VERSION = 'vX.Y.Z'` в switchboard.js.
// Запуск: node regen-switchboard.mjs
import { readFileSync, writeFileSync } from 'fs';

const SRC = new URL('./switchboard.js', import.meta.url);
const HTML = new URL('./install-switchboard.html', import.meta.url);

const code = readFileSync(SRC, 'utf8');
const b64 = Buffer.from(code, 'utf8').toString('base64');

const ver = (code.match(/const VERSION\s*=\s*'([^']+)'/) || [])[1] || 'v0.0.0';

let html = readFileSync(HTML, 'utf8');
html = html.replace(/var B64 = '[^']*'/, "var B64 = '" + b64 + "'");
// Version-stamp: badge + title
html = html.replace(/FB Switchboard v[\d.]+ — Bookmarklet/g, `FB Switchboard ${ver} — Bookmarklet`);

writeFileSync(HTML, html, 'utf8');
console.log(`✅ B64 updated (${b64.length} chars), version ${ver}`);
