#!/usr/bin/env bun
/**
 * test-targeting.ts — 🎯 Targeting tab (account_controls) against a fake Graph API.
 *
 * harness-targeting.html stubs me/adaccounts + Batch API with an in-memory store. Checks:
 *   - the panel opens on 🔎 Accounts (not Autorules);
 *   - the table reads existing controls, an unreadable account is flagged;
 *   - a write keeps untouched controls, skips the unreadable account, flags "FB didn't apply";
 *   - no JS errors.
 *   bun code/metactrl-pro/_visual-test/test-targeting.ts
 * Output: tgt-default.png, tgt-read.png, tgt-applied.png
 */
import puppeteer from "puppeteer-core";
import { resolve } from "path";

const dir = resolve(import.meta.dir);
const harness = "file:///" + resolve(dir, "harness-targeting.html").replace(/\\/g, "/");
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ headless: true, executablePath: CHROME, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

await page.goto(harness, { waitUntil: "domcontentloaded", timeout: 20000 });
await sleep(1000);

const fails: string[] = [];
const check = (ok: boolean, what: string) => { console.log((ok ? "✓ " : "✗ ") + what); if (!ok) fails.push(what); };

const panel = await page.$("#ar-modal");
if (!panel) { console.error("❌ #ar-modal not rendered\n" + errors.join("\n")); await browser.close(); process.exit(1); }

const first = await page.evaluate(() => ({
  active: document.querySelector(".ar-tab.active")?.id,
  inspShown: (document.querySelector("#ar-insp") as HTMLElement).style.display,
  arShown: (document.querySelector("#ar-ar") as HTMLElement).style.display,
}));
check(first.active === "tab-insp" && first.inspShown === "block" && first.arShown === "none", `opens on Accounts (${JSON.stringify(first)})`);
await panel.screenshot({ path: resolve(dir, "tgt-default.png") });

await page.click("#tab-tgt");
await sleep(800);
const cell = (id: string, col: number) => page.$eval(`#tgt-body tr[data-id="${id}"] td:nth-child(${col})`, (td) => td.textContent?.trim() || "");
check((await page.$$("#tgt-body tr[data-id]")).length === 5, "5 accounts in the table");
check((await cell("act_101", 3)) === "18+" && (await cell("act_101", 4)) === "US" && (await cell("act_101", 6)) === "AN", "act_101 shows 18+ / US / AN");
check((await cell("act_104", 7)).includes("не прочитала"), "act_104 flagged unreadable");
await panel.screenshot({ path: resolve(dir, "tgt-read.png") });

// form: age 21, exclude Ontario (add), AN-R → exclude, AN → allow (two clicks)
await page.click("#tgt-all");
await page.select("#tgt-age-mode", "set");
await page.$eval("#tgt-age-val", (el) => { (el as HTMLInputElement).value = "21"; });
await page.select("#tgt-ex-mode", "add");
await page.type("#tgt-ex-val", "CA:533");
await page.click('.tgt-chip[data-pl="audience_network_rewarded_video"]');
await page.click('.tgt-chip[data-pl="audience_network_classic"]');
await page.click('.tgt-chip[data-pl="audience_network_classic"]');
await page.click("#tgt-apply");
await sleep(3000);

const posts: any[] = await page.evaluate(() => (window as any).__posts);
check(JSON.stringify(posts.map((p) => p.id).sort()) === JSON.stringify(["act_101", "act_102", "act_103", "act_105"]),`written to 101/102/103/105, 104 skipped (${posts.map((p) => p.id)})`);
const p101 = posts.find((p) => p.id === "act_101");
check(p101?.audience_controls.age_min === 21 && p101?.is_age_restriction_enabled === "true", "act_101 age 21+");
check(JSON.stringify(p101?.audience_controls.geo_locations.countries) === '["US"]', "act_101 keeps geo US (untouched field)");
check(JSON.stringify(p101?.audience_controls.excluded_geo_locations) === '{"regions":[{"key":"533"}]}', "act_101 excludes region 533");
check(JSON.stringify(p101?.placement_controls.placement_exclusions) === '["audience_network_rewarded_video"]', "act_101 placements: AN back, AN-R excluded");
const p102 = posts.find((p) => p.id === "act_102");
check(JSON.stringify(p102?.audience_controls.geo_locations.country_groups) === '["worldwide"]', "act_102 clean account gets worldwide geo base");
check((await cell("act_101", 7)).includes("записано") && (await cell("act_101", 5)).includes("Ontario"), "act_101 ✓ written, Ontario shown after re-read");
check((await cell("act_103", 7)).includes("частично"), "act_103 flagged partial (FB dropped excluded geo)");
check((await cell("act_105", 7)).includes("Кабинет отключён"), "act_105 shows FB error");
await panel.screenshot({ path: resolve(dir, "tgt-applied.png") });

check(errors.length === 0, "no JS errors" + (errors.length ? ":\n" + errors.slice(0, 10).join("\n") : ""));
await browser.close();
console.log(fails.length ? `\n❌ ${fails.length} failed` : "\n✅ all passed — tgt-default.png / tgt-read.png / tgt-applied.png");
process.exit(fails.length ? 1 : 0);
