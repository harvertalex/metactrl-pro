#!/usr/bin/env bun
/**
 * test-watch-awake.ts — MetaWatch PRO v0.3.0: вотчдог держит вкладку активной.
 *
 *   1. СТАРТ → держится Web Lock metawatch-*; СТОП → снят.
 *   2. Заморозка вкладки (freeze/resume) → запись в журнале.
 *   3. Простой 40 мин (часы страницы сдвинуты) → «спала ~40 мин — пропущено тиков: 1».
 *   4. Перезапуск закладки при работающем вотчдоге → замок один, старый экземпляр
 *      не отвечает на resume (иначе было бы два тика на одно событие).
 *
 *   bun code/metactrl-pro/_visual-test/test-watch-awake.ts
 */
import puppeteer, { type Page } from "puppeteer-core";
import { resolve } from "path";

const dir = resolve(import.meta.dir);
const harness = "file:///" + resolve(dir, "harness-watch.html").replace(/\\/g, "/");
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

const results: { name: string; ok: boolean; detail?: string }[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? " — " + detail : ""}`);
};
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  headless: true,
  executablePath: CHROME,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage();
const errors: string[] = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

const heldLocks = (p: Page) => p.evaluate(async () =>
  ((await navigator.locks.query()).held || []).map((l) => l.name || "").filter((n) => n.startsWith("metawatch-")));
const journal = (p: Page): Promise<string[]> => p.evaluate(() =>
  (JSON.parse(localStorage.getItem("metawatch_v1") || "{}").journal || []).map((j: any) => j.msg || ""));
const freezeResume = (p: Page) => p.evaluate(async () => {
  document.dispatchEvent(new Event("freeze"));
  await new Promise((r) => setTimeout(r, 1200));
  document.dispatchEvent(new Event("resume"));
});

try {
  await page.goto(harness, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("#mw-run");
  await pause(800);

  // ── 1. старт / стоп ──
  await page.click("#mw-run");
  await pause(500);
  check("1. START holds a metawatch Web Lock", (await heldLocks(page)).length === 1, (await heldLocks(page)).join());
  await page.click("#mw-run");
  await pause(500);
  check("1. STOP releases it", (await heldLocks(page)).length === 0);

  // ── 2. заморозка ──
  await page.click("#mw-run");
  await pause(500);
  await freezeResume(page);
  await pause(300);
  const j2 = await journal(page);
  check("2. freeze/resume journaled", j2.some((m) => m.includes("была заморожена браузером")), j2[0]);

  // ── 3. простой 40 минут ──
  await page.evaluate(() => {
    const real = Date.now.bind(Date);
    Date.now = () => real() + 40 * 60e3;
  });
  const until = Date.now() + 30000;
  let slept = "";
  while (Date.now() < until && !slept) {
    slept = (await journal(page)).find((m) => m.includes("спала")) || "";
    await pause(1000);
  }
  check("3. 40-min stall journaled with missed ticks", /спала ~40 мин — пропущено тиков: 1/.test(slept), slept);

  // ── 4. перезапуск закладки при работающем вотчдоге ──
  await page.addScriptTag({ path: resolve(dir, "..", "watchdog.js") });
  await pause(1500);
  check("4. re-run: exactly one lock held", (await heldLocks(page)).length === 1, (await heldLocks(page)).join());
  const before = (await journal(page)).filter((m) => m.includes("была заморожена")).length;
  await freezeResume(page);
  await pause(300);
  const after = (await journal(page)).filter((m) => m.includes("была заморожена")).length;
  check("4. re-run: one resume → one journal entry (old instance silent)", after - before === 1, `+${after - before}`);
} catch (e: any) {
  check("run", false, e.message);
}

if (errors.length) check("no page errors", false, errors.join(" | "));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
