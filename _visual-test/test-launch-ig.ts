#!/usr/bin/env bun
/**
 * test-launch-ig.ts — функциональная проверка MetaLaunch PRO v0.29.0 на подставном Graph API.
 *
 * Гоняет настоящий launcher.js (harness-launch-ig.html) в headless Chrome и жмёт «Запуск»:
 *   1. Cab A — IG из истории каба → FB его сохранил → IG запомнен по странице.
 *   2. Cab B — страница для каба новая → IG берётся из памяти.
 *   3. Cab C — FB выкидывает IG → итог «FB выкинул IG», залив не остановлен.
 *   4. Перезагрузка, память стёрта, Cab B → IG нет нигде → итог «IG не найден»,
 *      кампания всё равно залита; 📋 отдаёт журнал прошлого залива; итог — «нет роли на странице».
 *   5. v0.30.0: роль на странице есть → токен страницы → PBIA создан → IG прикреплён.
 * По ходу: во время залива держится Web Lock; заморозка вкладки пишется в ленту.
 *
 *   bun code/metactrl-pro/_visual-test/test-launch-ig.ts
 */
import puppeteer, { type Page } from "puppeteer-core";
import { resolve } from "path";
import { writeFileSync } from "fs";
import { tmpdir } from "os";

const dir = resolve(import.meta.dir);
const harness = "file:///" + resolve(dir, "harness-launch-ig.html").replace(/\\/g, "/");
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PAGE_ID = "1039445349258069";
const IG = "17841431636764372";

const csvPath = resolve(tmpdir(), "metalaunch-ig-test.csv");
const cols = ["Campaign Name", "Campaign Objective", "Buying Type", "Special Ad Categories", "Ad Set Name",
  "Ad Set Daily Budget", "Countries", "Age Min", "Age Max", "Optimization Goal", "Billing Event", "Pixel",
  "Custom Event Type", "Ad Name", "Title", "Body", "Link", "Call to Action", "Image Hash", "Link Object ID"];
const row = ["IG test", "OUTCOME_SALES", "AUCTION", "", "AS 1", "20", "DE", "18", "65", "OFFSITE_CONVERSIONS",
  "IMPRESSIONS", "1451350725476785", "PURCHASE", "Ad 1", "Title", "Body", "https://example.com/", "LEARN_MORE",
  "abc123hash", PAGE_ID];
writeFileSync(csvPath, cols.join(",") + "\n" + row.join(",") + "\n", "utf8");

const results: { name: string; ok: boolean; detail?: string }[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? " — " + detail : ""}`);
};

const browser = await puppeteer.launch({
  headless: true,
  executablePath: CHROME,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1000 });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

const logText = (p: Page) => p.evaluate(() => document.getElementById("fbl-log")?.innerText || "");
const statusText = (p: Page) => p.evaluate(() => document.getElementById("fbl-status")?.innerText || "");

async function waitFor(p: Page, fn: () => Promise<boolean>, ms: number, what: string) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`timeout: ${what}\nstatus: ${await statusText(p)}\nlog:\n${(await logText(p)).slice(-2500)}`);
}

async function openPanel(p: Page) {
  await p.goto(harness, { waitUntil: "domcontentloaded" });
  await waitFor(p, async () => /Loaded 3 accounts/.test(await logText(p)), 30000, "accounts loaded");
  const csvInput = await p.$("#fbl-csv");
  await (csvInput as any).uploadFile(csvPath);
  await waitFor(p, async () => /Parsed 1 rows/.test(await logText(p)), 10000, "csv parsed");
  await p.evaluate(() => {
    const el = document.getElementById("fbl-dsa-beneficiary") as HTMLInputElement;
    el.value = "Drrdasddds";
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function selectOnly(p: Page, accId: string) {
  if (!(await p.$("#fbl-acc-list"))) await p.click("#fbl-acc-toggle");
  await p.waitForSelector("#fbl-acc-list");
  // Click from inside the page: every toggle re-renders the panel, and a puppeteer handle
  // grabbed a moment earlier can already be detached.
  for (const id of ["111", "222", "333"]) {
    await p.evaluate((id, want) => {
      const cb = document.querySelector(`.fbl-acc-cb[data-acc="${id}"]`) as HTMLInputElement | null;
      if (cb && cb.checked !== want) cb.click();
    }, id, id === accId);
    await new Promise((r) => setTimeout(r, 300));
  }
  const picked = await p.evaluate(() =>
    [...document.querySelectorAll(".fbl-acc-cb")].filter((c) => (c as HTMLInputElement).checked)
      .map((c) => (c as HTMLElement).dataset.acc));
  if (picked.join() !== accId) throw new Error(`account picker: wanted ${accId}, got ${picked.join()}`);
}

/** Жмёт «Запуск», во время залива смотрит Web Lock и (по флагу) имитирует заморозку. */
async function launch(p: Page, opts: { freeze?: boolean } = {}) {
  await p.click("#fbl-run");
  let lockSeen = false;
  let froze = false;
  await waitFor(p, async () => {
    const held = await p.evaluate(async () =>
      ((await navigator.locks.query()).held || []).map((l) => l.name));
    if (held.some((n) => n?.startsWith("metalaunch-run-"))) lockSeen = true;
    if (opts.freeze && lockSeen && !froze) {
      froze = true;
      await p.evaluate(async () => {
        document.dispatchEvent(new Event("freeze"));
        await new Promise((r) => setTimeout(r, 1600));
        document.dispatchEvent(new Event("resume"));
      });
    }
    return /📷/.test(await logText(p));
  }, 180000, "launch finished with IG summary");
  await new Promise((r) => setTimeout(r, 800));
  const heldAfter = await p.evaluate(async () =>
    ((await navigator.locks.query()).held || []).map((l) => l.name).filter((n) => n?.startsWith("metalaunch-run-")));
  return { log: await logText(p), lockSeen, lockReleased: heldAfter.length === 0 };
}

try {
  await openPanel(page);
  check("secure context (Web Locks available)", await page.evaluate(() => !!navigator.locks && isSecureContext));

  // ── 1. Cab A: IG из истории → сохранён → запомнен ──
  await selectOnly(page, "111");
  const r1 = await launch(page, { freeze: true });
  check("1. Cab A: IG found in cab history", r1.log.includes("IG from account history"));
  check("1. Cab A: creative sent with IG", await page.evaluate((ig) =>
    (window as any).__mock.sentIg.some((s: any) => s.acc === "111" && s.ig === ig), IG));
  check("1. Cab A: summary says IG attached", /📷 Instagram прикреплён: Cab A/.test(r1.log));
  const mem1 = await page.evaluate(() => JSON.parse(localStorage.getItem("fbl_ig_by_page_v1") || "{}"));
  check("1. IG remembered by page", mem1[PAGE_ID]?.igId === IG, JSON.stringify(mem1[PAGE_ID] || null));
  check("1. Web Lock held during launch", r1.lockSeen);
  check("1. Web Lock released after launch", r1.lockReleased);
  check("1. freeze/resume reported in feed", /⏸ Вкладка была заморожена браузером/.test(r1.log));

  // ── 2. Cab B: страница новая → IG из памяти ──
  await selectOnly(page, "222");
  const r2 = await launch(page);
  check("2. Cab B: IG taken from memory", r2.log.includes("IG from memory: " + IG));
  check("2. Cab B: creative sent with IG", await page.evaluate((ig) =>
    (window as any).__mock.sentIg.some((s: any) => s.acc === "222" && s.ig === ig), IG));
  check("2. Cab B: summary says IG attached", /📷 Instagram прикреплён: Cab B/.test(r2.log));

  // ── 3. Cab C: FB выкидывает IG → итог, залив прошёл ──
  await selectOnly(page, "333");
  const r3 = await launch(page);
  check("3. Cab C: ad still created", r3.log.includes("✓ ad 1/1"));
  check("3. Cab C: summary names the drop", /📷 Instagram НЕ прикреплён.*Cab C — FB выкинул IG/.test(r3.log));
  const mem3 = await page.evaluate(() => JSON.parse(localStorage.getItem("fbl_ig_by_page_v1") || "{}"));
  check("3. memory untouched by a dropped IG", mem3[PAGE_ID]?.igId === IG);

  // ── 4. новая сессия, память стёрта, Cab B → IG нет нигде ──
  const savedBefore = await page.evaluate(() => JSON.parse(localStorage.getItem("fbl_last_log_v1") || "null"));
  check("4. last launch journal saved", !!savedBefore?.lines?.length && /Cab C/.test(JSON.stringify(savedBefore.lines)),
    `${savedBefore?.lines?.length || 0} lines`);
  await page.evaluate(() => localStorage.removeItem("fbl_ig_by_page_v1"));
  await openPanel(page);
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: (t: string) => { (window as any).__copied = t; return Promise.resolve(); } },
    });
  });
  await page.click("#fbl-log-copy");
  await new Promise((r) => setTimeout(r, 300));
  const copied: string = await page.evaluate(() => (window as any).__copied || "");
  check("4. 📋 copies the previous session's launch", copied.includes("Прошлый залив") && copied.includes("Cab C"),
    `${copied.split("\n").length} lines`);
  await selectOnly(page, "222");
  const r4 = await launch(page);
  check("4. Cab B cold: no memory used", !r4.log.includes("IG from memory"));
  check("4. Cab B cold: campaign still launched", r4.log.includes("✓ ad 1/1"));
  check("4. Cab B cold: summary says IG not found", /📷 Instagram НЕ прикреплён.*Cab B — IG не найден/.test(r4.log));
  check("4. Cab B cold: summary names the missing page role", /Cab B — IG не найден, у профиля нет роли на странице/.test(r4.log));
  check("4. Cab B cold: log says no page token", r4.log.includes("no page token"));

  // ── 5. v0.30.0: роль на странице есть → токен страницы → PBIA создан → IG прикреплён ──
  await page.evaluate(() => localStorage.removeItem("fbl_ig_by_page_v1"));
  await openPanel(page);
  await page.evaluate(() => { (window as any).__mock.pageRole = true; });
  await selectOnly(page, "222");
  const r5 = await launch(page);
  const PBIA_NEW = "17841499999999999";
  const calls5 = await page.evaluate(() => (window as any).__mock.pbiaCalls);
  check("5. page token obtained", r5.log.includes("page token ✓"));
  check("5. PBIA GET+POST went with the page token", calls5.length >= 2 && calls5.every((c: any) => c.pageToken),
    JSON.stringify(calls5));
  check("5. Cab B: creative sent with the new PBIA", await page.evaluate((ig) =>
    (window as any).__mock.sentIg.some((s: any) => s.acc === "222" && s.ig === ig), PBIA_NEW));
  check("5. Cab B: summary says IG attached", /📷 Instagram прикреплён: Cab B → 17841499999999999/.test(r5.log));
} catch (e: any) {
  check("run", false, e.message);
}

if (errors.length) check("no page errors", false, errors.join(" | "));
await page.screenshot({ path: resolve(dir, "launch-ig-last.png") });
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
