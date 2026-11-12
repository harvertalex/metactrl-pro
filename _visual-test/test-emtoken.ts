#!/usr/bin/env bun
/**
 * test-emtoken.ts — 🔑 CAPI-token block (Pixel Manager) against a fake Events Manager / Graph.
 *
 * harness-emtoken.html stubs fetch: pixel 111 page carries a FAKE token, 222 has none, 333 is HTTP 403.
 * Checks:
 *   A. single mode: Get token -> masked row, the full token is NOT in the DOM, Copy puts it in the clipboard,
 *      Check calls debug_token WITHOUT cookies;
 *   B. bulk mode: 3 pixels -> 1 token + 2 honest errors, Copy all = "pixelId<TAB>token";
 *   C. page mode: panel opened ON an Events Manager URL with no Ads token -> reads the token from the DOM.
 * Real FB is not reachable from here — this proves the wiring, not that FB still inlines the token.
 *   bun code/metactrl-pro/_visual-test/test-emtoken.ts
 * Output: em-single.png, em-bulk.png, em-page.png
 */
import puppeteer from "puppeteer-core";
import { resolve } from "path";
import { readFileSync } from "fs";

const dir = resolve(import.meta.dir);
const harnessPath = resolve(dir, "harness-emtoken.html");
const harness = "file:///" + harnessPath.replace(/\\/g, "/");
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const FAKE = "EAAB" + "x".repeat(60) + "ZDZD";

let fails = 0;
const ok = (c: boolean, msg: string) => { console.log((c ? "✅ " : "❌ ") + msg); if (!c) fails++; };

const browser = await puppeteer.launch({ headless: true, executablePath: CHROME, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const errors: string[] = [];
async function newPage() {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: (t: string) => { (window as any).__clip = t; return Promise.resolve(); } } });
  });
  return page;
}
const text = (p: any) => p.evaluate(() => (document.querySelector("#tab-px") ? document.body.innerText : ""));
const html = (p: any) => p.evaluate(() => document.body.innerHTML);

/* ---------- A + B: Ads Manager side, fake BM 999 ---------- */
const page = await newPage();
await page.goto(harness + "?business_id=999", { waitUntil: "domcontentloaded", timeout: 20000 });
await sleep(1500);
await page.click("#tab-px");
await sleep(600);

ok((await text(page)).includes("Get token (1)"), "A. single mode: button counts the selected pixel — «Get token (1)»");
await page.click('[data-em="run"]');
await sleep(700);
const afterRun = await text(page);
ok(afterRun.includes("EAABxxxx…xxxxZDZD (68)"), "A. masked token shown: first 8 … last 8 (length)");
ok(!(await html(page)).includes(FAKE), "A. the FULL token is not anywhere in the DOM");
await page.click('[data-em="copy"]');
await sleep(200);
ok((await page.evaluate(() => (window as any).__clip)) === FAKE, "A. Copy puts the full token into the clipboard");
await page.click('[data-em="check"]');
await sleep(700);
const chk = await text(page);
ok(/✓ valid · USER · expires: never · scopes: 3 \(ads\/bm\) · pixel: ✓ read/.test(chk), "A. Check: valid · USER · never · 3 scopes · pixel read");
const calls: { url: string; cookies: boolean }[] = await page.evaluate(() => (window as any).__calls);
const dbg = calls.find((c) => /debug_token/.test(c.url));
ok(!!dbg && dbg.cookies === false, "A. debug_token goes without cookies (token must work on its own)");
const emFetch = calls.find((c) => /events_manager2\/list\/pixel\/111/.test(c.url));
ok(!!emFetch && emFetch.cookies === true && /business_id=999/.test(emFetch.url), "A. Events Manager page fetched with cookies + business_id");
await page.screenshot({ path: resolve(dir, "em-single.png") });

await page.click('[data-pxaction="toggle-bulk"]');
await sleep(300);
await page.click('[data-pxaction="bulk-sel-all-px"]');
await sleep(300);
ok((await text(page)).includes("Get token (3)"), "B. bulk mode: «Get token (3)» after All pixels");
await page.click('[data-em="run"]');
await sleep(5200);                         // 3 fetches, 1.5 s pause between
const bulk = await text(page);
ok(bulk.includes("Токенов: 1/3."), "B. summary «Токенов: 1/3.»");
ok(bulk.includes("в HTML страницы токена нет") && bulk.includes("HTTP 403"), "B. pixel without token and 403 are reported honestly, not faked");
await page.click('[data-em="copyall"]');
await sleep(200);
ok((await page.evaluate(() => (window as any).__clip)) === "111\t" + FAKE, "B. Copy all = pixelId<TAB>token only for pixels that returned one");
await page.screenshot({ path: resolve(dir, "em-bulk.png") });

/* ---------- C: page mode — served as an Events Manager URL, no Ads token ---------- */
const page2 = await newPage();
const src = readFileSync(harnessPath, "utf8")
  // function replacers: the bookmarklet source is full of `$'` / `$&`, which a string replacement would expand
  .replace('<script src="../bookmarklet.js"></script>', () => `<script type="application/json" id="inl">{"accessToken":"${FAKE}"}</script><script>${readFileSync(resolve(dir, "../bookmarklet.js"), "utf8").replace(/<\/script/gi, () => "<\\/script")}</script>`)
  .replace("/pagemode/.test(location.search)", () => "true");
await page2.setRequestInterception(true);
page2.on("request", (req) => {
  if (req.url().startsWith("https://business.facebook.com/events_manager2/list/pixel/555")) req.respond({ status: 200, contentType: "text/html", body: src });
  else req.respond({ status: 204, body: "" });
});
await page2.goto("https://business.facebook.com/events_manager2/list/pixel/555?business_id=999", { waitUntil: "domcontentloaded", timeout: 20000 });
await sleep(1500);
const open = await page2.evaluate(() => (document.querySelector("#tab-px") as HTMLElement | null)?.classList.contains("active"));
ok(open === true, "C. on Events Manager without an Ads token the panel opens on the Pixel tab");
ok((await text(page2)).includes("Get token (1)"), "C. page mode: pixel id taken from the URL — «Get token (1)»");
await page2.click('[data-em="run"]');
await sleep(500);
const pg = await text(page2);
ok(pg.includes("EAABxxxx…xxxxZDZD (68)") && pg.includes("· page"), "C. token read from the page DOM (via=page)");
ok((await html(page2)).includes('data-em="copy"'), "C. Copy button present");
await page2.screenshot({ path: resolve(dir, "em-page.png") });

console.log(errors.length ? "JS errors:\n" + errors.slice(0, 15).join("\n") : "no JS errors");
if (errors.length) fails++;
await browser.close();
console.log(fails ? `\n❌ ${fails} failed` : "\n✅ all passed");
process.exit(fails ? 1 : 0);
