#!/usr/bin/env bun
/**
 * test-launch-hang.ts — MetaLaunch PRO v0.31.0: повисший запрос к FB не вешает залив.
 *
 * Настоящий launcher.js (таймаут укорочен до 3 с) против подставного Graph API
 * (harness-launch-hang.html), где первый запрос создания не отвечает никогда:
 *   1. Кампания: FB её создал, ответ потерялся → лаунчер находит её по имени, второй POST не шлёт.
 *   2. Объявление: до FB не дошло → после проверки «не создано» шлёт повтор, залив доходит.
 *   3. Адсет: создан, ответ потерялся → берётся найденный, объявления падают в него.
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
for (const [from, to] of [["REQ_TIMEOUT_MS = 60000", "REQ_TIMEOUT_MS = 3000"], ["SLOW_REQ_LOG_MS = 20000", "SLOW_REQ_LOG_MS = 1000"]]) {
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

async function launch(p: Page, hang: Record<string, string>) {
  await p.evaluate((h) => { (window as any).__mock.hang = h; }, hang);
  const before = await mock(p);
  await p.click("#fbl-run");
  let lockSeen = false;
  await waitFor(p, async () => {
    const held = await p.evaluate(async () => ((await navigator.locks.query()).held || []).map((l) => l.name));
    if (held.some((n) => n?.startsWith("metalaunch-run-"))) lockSeen = true;
    return /📷/.test(await logText(p));
  }, 120000, "launch finished");
  await new Promise((r) => setTimeout(r, 800));
  const after = await mock(p);
  const heldAfter = await p.evaluate(async () =>
    ((await navigator.locks.query()).held || []).map((l) => l.name).filter((n) => n?.startsWith("metalaunch-run-")));
  const posts = (k: string) => after.posts[k] - before.posts[k];
  return { log: await logText(p), posts, objs: after.objs, lockSeen, lockReleased: heldAfter.length === 0 };
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

  check("no page errors", errors.length === 0, errors.join(" | "));
} catch (e: any) {
  check("scenario crashed", false, e.message);
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
