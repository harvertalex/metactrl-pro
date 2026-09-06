#!/usr/bin/env bun
/**
 * shot-launcher.ts — визуальная проверка панели MetaLaunch PRO.
 *
 * Близнец shot.ts, но для launcher.js: рендерит harness-launcher.html в headless
 * Chrome и снимает панель сверху и снизу (форма длинная — один кадр её не берёт).
 * Заведён 06.09.2026 вместе с переходом на тему TradingView: правка оформления
 * на сотни мест без картинки не проверяема.
 *
 *   bun code/metactrl-pro/_visual-test/shot-launcher.ts
 * Выход: _visual-test/launcher-top.png + launcher-bottom.png
 */
import puppeteer from "puppeteer-core";
import { resolve } from "path";

const dir = resolve(import.meta.dir);
const harness = "file:///" + resolve(dir, "harness-launcher.html").replace(/\\/g, "/");
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

const browser = await puppeteer.launch({
  headless: true,
  executablePath: CHROME,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });

const errors: string[] = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

await page.goto(harness, { waitUntil: "domcontentloaded", timeout: 20000 });
await new Promise((r) => setTimeout(r, 1500));

const panel = await page.$("#__fb_launcher_panel__");
if (!panel) {
  console.error("❌ панель не отрисовалась. Ошибки:\n" + errors.join("\n"));
  await page.screenshot({ path: resolve(dir, "launcher-FAILED.png"), fullPage: true });
  await browser.close();
  process.exit(1);
}

// Раскладка: журнал слева колонкой, форма справа — или всё свалилось в столбик.
const layout = await page.evaluate(() => {
  const rail = document.querySelector("#__fb_launcher_panel__ .fbl-lograil") as HTMLElement | null;
  const main = document.querySelector("#__fb_launcher_panel__ .fbl-main") as HTMLElement | null;
  const cols = document.querySelector("#__fb_launcher_panel__ .fbl-cols") as HTMLElement | null;
  if (!rail || !main || !cols) return { ok: false };
  const rb = rail.getBoundingClientRect(), mb = main.getBoundingClientRect();
  return {
    ok: true,
    flexDir: getComputedStyle(cols).flexDirection,
    railRect: { x: Math.round(rb.x), y: Math.round(rb.y), w: Math.round(rb.width), h: Math.round(rb.height) },
    mainRect: { x: Math.round(mb.x), y: Math.round(mb.y), w: Math.round(mb.width), h: Math.round(mb.height) },
    sideBySide: mb.x > rb.x + rb.width - 5,
  };
});
console.log("LAYOUT:", JSON.stringify(layout));

await panel.screenshot({ path: resolve(dir, "launcher-top.png") });

await page.evaluate(() => {
  const sc = document.querySelector("#__fb_launcher_panel__ .fbl-main") as HTMLElement | null;
  if (sc) sc.scrollTop = sc.scrollHeight;
});
await new Promise((r) => setTimeout(r, 400));
await panel.screenshot({ path: resolve(dir, "launcher-bottom.png") });

console.log("✅ saved launcher-top.png + launcher-bottom.png");
console.log(errors.length ? "JS errors:\n" + errors.slice(0, 15).join("\n") : "no JS errors");
await browser.close();
