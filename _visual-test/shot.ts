#!/usr/bin/env bun
/**
 * shot.ts — visual regression check for the MetaCtrl PRO bookmarklet panel.
 *
 * Renders harness.html (which loads bookmarklet.js with a stub token) in headless
 * Chrome and screenshots the panel — top of the Autorules tab AND scrolled to the
 * bottom (the Generate Rules / TARGET ACCOUNTS area). Reports JS errors.
 *
 * Run BEFORE every deploy of a UI change (per Alexander: "visual test like prelanders").
 *   bun code/metactrl-pro/_visual-test/shot.ts
 * Output: _visual-test/panel-top.png + panel-bottom.png
 */
import puppeteer from "puppeteer-core";
import { resolve } from "path";

const dir = resolve(import.meta.dir);
const harness = "file:///" + resolve(dir, "harness.html").replace(/\\/g, "/");
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

const panel = await page.$("#ar-modal");
if (!panel) {
  console.error("❌ #ar-modal not found — panel did not render. Errors:\n" + errors.join("\n"));
  await page.screenshot({ path: resolve(dir, "panel-FAILED.png"), fullPage: true });
  await browser.close();
  process.exit(1);
}

// Report rail layout: is it a LEFT column (side-by-side) or stacked on top?
const layout = await page.evaluate(() => {
  const rail = document.querySelector("#ar-lograil") as HTMLElement | null;
  const right = document.querySelector("#ar-right") as HTMLElement | null;
  const body = document.querySelector(".ar-body") as HTMLElement | null;
  if (!rail || !right || !body) return { ok: false };
  const rb = rail.getBoundingClientRect(), gb = right.getBoundingClientRect();
  return {
    ok: true,
    flexDir: getComputedStyle(body).flexDirection,
    railRect: { x: Math.round(rb.x), y: Math.round(rb.y), w: Math.round(rb.width), h: Math.round(rb.height) },
    rightRect: { x: Math.round(gb.x), y: Math.round(gb.y), w: Math.round(gb.width), h: Math.round(gb.height) },
    sideBySide: gb.x > rb.x + rb.width - 5, // right column starts to the right of the rail
  };
});
console.log("LAYOUT:", JSON.stringify(layout));

await panel.screenshot({ path: resolve(dir, "panel-top.png") });

// Scroll the AR tab content to the bottom to capture the Generate Rules / TARGET ACCOUNTS area.
await page.evaluate(() => {
  const sc = document.querySelector("#ar-scroll") as HTMLElement | null;
  if (sc) sc.scrollTop = sc.scrollHeight;
});
await new Promise((r) => setTimeout(r, 400));
await panel.screenshot({ path: resolve(dir, "panel-bottom.png") });

console.log("✅ saved panel-top.png + panel-bottom.png");
console.log(errors.length ? "JS errors:\n" + errors.slice(0, 15).join("\n") : "no JS errors");
await browser.close();
