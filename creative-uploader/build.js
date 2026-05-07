#!/usr/bin/env node
// Encodes bookmarklet.js as Base64 and injects it into index.html
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const code = fs.readFileSync(path.join(dir, 'bookmarklet.js'), 'utf8');
const b64  = Buffer.from(code, 'utf8').toString('base64');
const tag  = `var B64 = '${b64}'`;

const htmlPath = path.join(dir, 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const updated = html.replace(/var B64 = '[^']*'/, tag);
fs.writeFileSync(htmlPath, updated, 'utf8');

console.log(`✓ B64 updated in index.html (${b64.length} chars)`);
console.log(`  Bookmarklet size: ${(code.length / 1024).toFixed(1)} KB`);
