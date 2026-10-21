#!/usr/bin/env bun
/**
 * test-launch-hang.ts — MetaLaunch PRO v0.31.0: повисший запрос к FB не вешает залив.
 *
 * Настоящий launcher.js (таймаут укорочен до 3 с) против подставного Graph API
 * (harness-launch-hang.html), где первый запрос создания не отвечает никогда:
 *   1. Кампания: FB её создал, ответ потерялся → лаунчер находит её по имени, второй POST не шлёт.
 *   2. Объявление: до FB не дошло → после проверки «не создано» шлёт повтор, залив доходит.
 *   3. Адсет: создан, ответ потерялся → берётся найденный, объявления падают в него.
 *   4. v0.31.1: загрузка видео застряла на мёртвом соединении → повтор, видео загружено, Web Lock держался.
 * v0.32.0:
 *   5. Кампания создана, соединение оборвалось (TypeError) → найдена по имени, второго POST нет.
 *   6. Объявление создано, шлюз ответил 502 HTML → найдено, второго POST нет.
 *   7. ABO: кампания уходит с is_adset_budget_sharing_enabled=false.
 *   8. Регионы: /search упал → штат из встроенной таблицы с верным ключом (Missouri 3868),
 *      сбой в ленте и не закэширован; регион не нашёлся нигде → адсет НЕ создаётся.
 *   9. Cab C в JPY: бюджет адсета без ×100.
 *  10. Видео в два каба: обе загрузки раньше опроса, опрос — одним Batch, без GET на каждое видео.
 * По ходу: в ленте «⌛ ответа нет», Web Lock держится и отпускается.
 *
 *   bun code/metactrl-pro/_visual-test/test-launch-hang.ts
 */
import puppeteer, { type Page } from "puppeteer-core";
import { resolve } from "path";
import { readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";

const dir = resolve(import.meta.dir);
const harness = "file:///" + resolve(dir, "harness-launch-hang.html").replace(/\\/g, "/");
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PAGE_ID = "1039445349258069";

// Таймауты из боевых 60 с / 20 с в 3 с / 1 с — иначе один прогон шёл бы минуты.
let src = readFileSync(resolve(dir, "../launcher.js"), "utf8");
for (const [from, to] of [["REQ_TIMEOUT_MS = 60000", "REQ_TIMEOUT_MS = 3000"], ["SLOW_REQ_LOG_MS = 20000", "SLOW_REQ_LOG_MS = 1000"],
  ["UPLOAD_BASE_MS = 60000", "UPLOAD_BASE_MS = 2000"]]) {
  if (!src.includes(from)) throw new Error(`launcher.js: "${from}" not found — test is out of date`);
  src = src.replace(from, to);
}

const csvPath = resolve(tmpdir(), "metalaunch-hang-test.csv");
const cols = ["Campaign Name", "Campaign Objective", "Buying Type", "Special Ad Categories", "Ad Set Name",
  "Ad Set Daily Budget", "Countries", "Age Min", "Age Max", "Optimization Goal", "Billing Event", "Pixel",
  "Custom Event Type", "Ad Name", "Title", "Body", "Link", "Call to Action", "Image Hash", "Link Object ID"];
const row = ["Hang test", "OUTCOME_SALES", "AUCTION", "", "AS 1", "20", "DE", "18", "65", "OFFSITE_CONVERSIONS",
  "IMPRESSIONS", "1451350725476785", "PURCHASE", "Ad 1", "Title", "Body", "https://example.com/", "LEARN_MORE",
  "abc123hash", PAGE_ID];
writeFileSync(csvPath, cols.join(",") + "\n" + row.join(",") + "\n", "utf8");
// v0.32.0: тот же план с регионами — штат США (запасная таблица) и регион, которого нет нигде.
const regCols = [...cols, "Regions"];
const csvRegUs = resolve(tmpdir(), "metalaunch-hang-regions-us.csv");
const csvRegNone = resolve(tmpdir(), "metalaunch-hang-regions-none.csv");
const withGeo = (countries: string, regions: string) =>
  regCols.join(",") + "\n" + [...row.slice(0, 6), `"${countries}"`, ...row.slice(7), regions].join(",") + "\n";
writeFileSync(csvRegUs, withGeo("US", "Missouri"), "utf8");
writeFileSync(csvRegNone, withGeo("US,DE", "Bavaria"), "utf8");

const results: { name: string; ok: boolean }[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  results.push({ name, ok });
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
const mock = (p: Page) => p.evaluate(() => JSON.parse(JSON.stringify((window as any).__mock)));

async function waitFor(p: Page, fn: () => Promise<boolean>, ms: number, what: string) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`timeout: ${what}\nlog:\n${(await logText(p)).slice(-2500)}`);
}

async function openPanel(p: Page) {
  await p.goto(harness, { waitUntil: "domcontentloaded" });
  await p.addScriptTag({ content: src });
  await waitFor(p, async () => /Loaded 3 accounts/.test(await logText(p)), 30000, "accounts loaded");
  await ((await p.$("#fbl-csv")) as any).uploadFile(csvPath);
  await waitFor(p, async () => /Parsed 1 rows/.test(await logText(p)), 10000, "csv parsed");
  await p.evaluate(() => {
    const el = document.getElementById("fbl-dsa-beneficiary") as HTMLInputElement;
    el.value = "Drrdasddds";
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  if (!(await p.$("#fbl-acc-list"))) await p.click("#fbl-acc-toggle");
  await p.waitForSelector("#fbl-acc-list");
  for (const id of ["111", "222", "333"]) {
    await p.evaluate((id, want) => {
      const cb = document.querySelector(`.fbl-acc-cb[data-acc="${id}"]`) as HTMLInputElement | null;
      if (cb && cb.checked !== want) cb.click();
    }, id, id === "111");
    await new Promise((r) => setTimeout(r, 300));
  }
}

// Верхняя плашка статуса — div.status (#fbl-status — это выпадашка статуса создания, не она).
const statusText = (p: Page) => p.evaluate(() =>
  (document.querySelector("#__fb_launcher_panel__ div.status") as HTMLElement | null)?.innerText || "");

async function selectAccounts(p: Page, ids: string[]) {
  if (!(await p.$("#fbl-acc-list"))) await p.click("#fbl-acc-toggle");
  await p.waitForSelector("#fbl-acc-list");
  for (const id of ["111", "222", "333"]) {
    await p.evaluate((id, want) => {
      const cb = document.querySelector(`.fbl-acc-cb[data-acc="${id}"]`) as HTMLInputElement | null;
      if (cb && cb.checked !== want) cb.click();
    }, id, ids.includes(id));
    await new Promise((r) => setTimeout(r, 300));
  }
}

async function loadCsv(p: Page, path: string) {
  await ((await p.$("#fbl-csv")) as any).uploadFile(path);
  await waitFor(p, async () => (await logText(p)).includes(path.split(/[\\/]/).pop()!), 10000, "csv parsed");
}

/** done — конец залива: по умолчанию строка итога IG «📷» (её нет, если не создано ни одного объявления). */
async function launch(p: Page, hang: Record<string, string>, done: RegExp = /📷/) {
  await p.evaluate((h) => { (window as any).__mock.hang = h; }, hang);
  const before = await mock(p);
  await p.click("#fbl-run");
  let lockSeen = false;
  await waitFor(p, async () => {
    const held = await p.evaluate(async () => ((await navigator.locks.query()).held || []).map((l) => l.name));
    if (held.some((n) => n?.startsWith("metalaunch-run-"))) lockSeen = true;
    return done.test((await logText(p)) + "\n" + (await statusText(p)));
  }, 120000, "launch finished");
  await new Promise((r) => setTimeout(r, 800));
  const after = await mock(p);
  const heldAfter = await p.evaluate(async () =>
    ((await navigator.locks.query()).held || []).map((l) => l.name).filter((n) => n?.startsWith("metalaunch-run-")));
  const posts = (k: string) => after.posts[k] - before.posts[k];
  const bodies = after.bodies.slice(before.bodies.length);
  return { log: await logText(p), posts, objs: after.objs, bodies, before, after, lockSeen, lockReleased: heldAfter.length === 0 };
}

try {
  await openPanel(page);

  // ── 1. кампания создана, ответ потерялся → берём найденную ──
  const r1 = await launch(page, { campaign: "created" });
  check("1. slow call reported in feed", /⌛ POST act_111\/campaigns: ответа нет/.test(r1.log));
  check("1. timed-out campaign adopted, not re-sent", r1.posts("campaign") === 1, `campaign POSTs: ${r1.posts("campaign")}`);
  check("1. feed says it was adopted", /объект создан \(id=campaign_/.test(r1.log));
  check("1. ad created in the adopted campaign", r1.log.includes("✓ ad 1/1"));
  check("1. exactly one campaign exists", r1.objs.filter((o: any) => o.level === "campaign").length === 1);
  check("1. Web Lock held and released", r1.lockSeen && r1.lockReleased);

  // ── 2. объявление не дошло → повтор ──
  const r2 = await launch(page, { ad: "lost" });
  check("2. lost ad re-sent once", r2.posts("ad") === 2, `ad POSTs: ${r2.posts("ad")}`);
  check("2. feed shows the retry", /↺ POST act_111\/ads: повтор 2\/4/.test(r2.log));
  check("2. launch reached the ad", r2.log.includes("✓ ad 1/1"));

  // ── 3. адсет создан, ответ потерялся → объявления в найденный адсет ──
  const r3 = await launch(page, { adset: "created" });
  const adsets = r3.objs.filter((o: any) => o.level === "adset");
  const lastAdset = adsets[adsets.length - 1];
  const lastAd = r3.objs.filter((o: any) => o.level === "ad").pop();
  check("3. timed-out adset adopted, not re-sent", r3.posts("adset") === 1, `adset POSTs: ${r3.posts("adset")}`);
  check("3. ad went into the adopted adset", lastAd?.adset_id === lastAdset?.id, `${lastAd?.adset_id} vs ${lastAdset?.id}`);

  // ── 5. v0.32.0: кампания создана, соединение оборвалось (TypeError) → найдена, без дубля ──
  const r5 = await launch(page, { campaign: "reset-created" });
  check("5. dropped-connection campaign adopted, not re-sent", r5.posts("campaign") === 1, `campaign POSTs: ${r5.posts("campaign")}`);
  check("5. feed names the dropped connection", /соединение оборвалось.*объект создан \(id=campaign_/.test(r5.log));
  check("5. launch reached the ad", r5.log.includes("✓ ad 1/1"));

  // ── 6. объявление создано, шлюз ответил 502 HTML → найдено, без дубля ──
  const r6 = await launch(page, { ad: "gw-created" });
  check("6. 502-without-FB-error ad adopted, not re-sent", r6.posts("ad") === 1, `ad POSTs: ${r6.posts("ad")}`);
  check("6. feed names the 502", /FB ответил HTTP 502 без ошибки, но объект создан \(id=ad_/.test(r6.log));

  // ── 7. ABO-кампания несёт is_adset_budget_sharing_enabled=false ──
  const camp6 = r6.bodies.find((b: any) => b.level === "campaign")?.body || {};
  check("7. ABO campaign sends is_adset_budget_sharing_enabled=false", camp6.is_adset_budget_sharing_enabled === "false",
    JSON.stringify({ sharing: camp6.is_adset_budget_sharing_enabled, daily_budget: camp6.daily_budget }));
  const adset6 = r6.bodies.find((b: any) => b.level === "adset")?.body || {};
  check("7. USD ad set budget ×100", adset6.daily_budget === "2000", `daily_budget=${adset6.daily_budget}`);

  // ── 8. регионы: /search упал ──
  await page.evaluate(() => { (window as any).__mock.searchFail = true; });
  await loadCsv(page, csvRegUs);
  const r8 = await launch(page, {});
  const tg8 = JSON.parse(r8.bodies.find((b: any) => b.level === "adset")?.body?.targeting || "{}");
  const keys8 = (tg8.geo_locations?.regions || []).map((r: any) => r.key);
  check("8. search failure reported in feed", /Регионы US: FB не отдал список/.test(r8.log));
  check("8. Missouri from the static table with the right key 3868", keys8.join() === "3868", `regions: ${keys8.join() || "none"}`);
  const r8b = await (async () => { await loadCsv(page, csvRegNone); return launch(page, {}, /Done with errors/); })();
  check("8. failed /search not cached — asked again", r8b.after.searchCalls - r8b.before.searchCalls >= 1,
    `search calls in the 2nd launch: ${r8b.after.searchCalls - r8b.before.searchCalls}`);
  check("8. no region resolved → ad set NOT created", r8b.posts("adset") === 0, `adset POSTs: ${r8b.posts("adset")}`);
  check("8. feed says why", /ни один регион не найден \(Bavaria\)/.test(r8b.log));
  check("8. cab not reported as a clean success", /Done with errors/.test(await statusText(page)), await statusText(page));
  await page.evaluate(() => { (window as any).__mock.searchFail = false; });

  // ── 9. Cab C в JPY: бюджет без ×100 ──
  await loadCsv(page, csvPath);
  await selectAccounts(page, ["333"]);
  const r9 = await launch(page, {});
  const adset9 = r9.bodies.find((b: any) => b.level === "adset")?.body || {};
  check("9. JPY ad set budget sent as-is (no ×100)", adset9.daily_budget === "20", `daily_budget=${adset9.daily_budget}`);
  check("9. feed labels the budget in JPY", /ABO JPY 20\/d total/.test(r9.log));
  await selectAccounts(page, ["111"]);

  // ── 4. загрузка видео: первая попытка на мёртвом соединении → повтор ──
  const vidPath = resolve(tmpdir(), "hang-test-video.mp4");
  writeFileSync(vidPath, Buffer.alloc(2048, 1));
  await page.evaluate(() => { (window as any).__mock.hang = { video: true }; (window as any).__mock.videoPosts = 0; });
  await ((await page.$("#fbl-upload-files")) as any).uploadFile(vidPath);
  let upLock = false;
  await waitFor(page, async () => {
    const held = await page.evaluate(async () => ((await navigator.locks.query()).held || []).map((l) => l.name));
    if (held.some((n) => n?.startsWith("metalaunch-run-"))) upLock = true;
    return /↑ video "hang-test-video" → 111 :: vid_/.test(await logText(page));
  }, 60000, "video uploaded");
  const up = await logText(page);
  check("4. hung upload re-sent", /↺ upload act_111\/advideos: соединение умерло/.test(up));
  check("4. video uploaded on the retry", (await mock(page)).videoPosts === 2, `video POSTs: ${(await mock(page)).videoPosts}`);
  check("4. upload held the Web Lock", upLock);

  // ── 10. v0.32.0: видео в два каба — сначала обе загрузки, потом один опрос пачкой ──
  await selectAccounts(page, ["111", "222"]);
  await new Promise((r) => setTimeout(r, 1500));
  const vid2 = resolve(tmpdir(), "hang-test-video2.mp4");
  writeFileSync(vid2, Buffer.alloc(2048, 2));
  const m10 = await mock(page);
  await ((await page.$("#fbl-upload-files")) as any).uploadFile(vid2);
  await waitFor(page, async () => {
    const t = await logText(page);
    return /↑ video "hang-test-video2" → 111 :: vid_/.test(t) && /↑ video "hang-test-video2" → 222 :: vid_/.test(t);
  }, 60000, "video uploaded to both cabs");
  const a10 = await mock(page);
  const ev10: string[] = a10.events.slice(m10.events.length);
  const firstBatch = ev10.indexOf("batch");
  check("10. both uploads happen before the first status poll",
    firstBatch > ev10.indexOf("upload:111") && firstBatch > ev10.indexOf("upload:222") && ev10.indexOf("upload:222") >= 0,
    ev10.join(" → "));
  check("10. statuses read via Batch, no per-video GET", a10.batchCalls - m10.batchCalls >= 1 && a10.videoGets === m10.videoGets,
    `batch calls: ${a10.batchCalls - m10.batchCalls}, per-video GETs: ${a10.videoGets - m10.videoGets}`);

  check("no page errors", errors.length === 0, errors.join(" | "));
} catch (e: any) {
  check("scenario crashed", false, e.message);
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
