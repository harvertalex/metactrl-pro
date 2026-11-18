// Снимок блока «6.1 Залив по языкам» с заполненной таблицей → _visual-test/lang-block.png
//   bun code/metactrl-pro/_visual-test/shot-lang.ts
import puppeteer from "puppeteer-core";
import { resolve } from "path";
import { writeFileSync } from "fs";
import { tmpdir } from "os";

const dir = resolve(import.meta.dir);
const harness = "file:///" + resolve(dir, "harness-launch-lang.html").replace(/\\/g, "/");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const vidA = resolve(tmpdir(), "lang_a.mp4");
const vidB = resolve(tmpdir(), "lang_b.mp4");
writeFileSync(vidA, Buffer.from("a"));
writeFileSync(vidB, Buffer.from("b"));

const browser = await puppeteer.launch({ headless: true, executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1400 });
await page.goto(harness, { waitUntil: "domcontentloaded" });
await sleep(3500);
if (!(await page.$("#fbl-acc-list"))) await page.click("#fbl-acc-toggle");
await page.evaluate(() => { const cb = document.querySelector('.fbl-acc-cb[data-acc="111"]') as HTMLInputElement; if (cb && !cb.checked) cb.click(); });
await sleep(400);
await ((await page.$("#fbl-upload-files")) as any).uploadFile(vidA, vidB);
await page.waitForFunction(() => /Upload done: 2\/2/.test(document.getElementById("fbl-log")?.innerText || ""), { timeout: 60000 });
await page.click("#fbl-lang-mode");
await page.waitForSelector("#fbl-lang-rows");
await sleep(900);
const rowSel = (i: number, f: string) => `.fbl-lang-row[data-i="${i}"] [data-lf="${f}"]`;
await page.click("[data-lf=add]");
await sleep(300);
const opts: Array<{ v: string; t: string }> = await page.$$eval(`${rowSel(0, "pick")} option`, (os) => os.map((o) => ({ v: (o as HTMLOptionElement).value, t: o.textContent || "" })));
const ids = opts.filter((o) => o.v).map((o) => o.v);
await page.select(rowSel(0, "key"), "16"); await sleep(200);
await page.select(rowSel(1, "key"), "6"); await sleep(200);
await page.select(rowSel(2, "key"), "5"); await sleep(200);
await page.select(rowSel(0, "pick"), ids[0]!); await sleep(200);
await page.select(rowSel(1, "pick"), ids[1]!); await sleep(200);
await page.select(rowSel(2, "pick"), ids[1]!); await sleep(200);
await page.type(rowSel(0, "title"), "Bônus exclusivo");
await page.type(rowSel(0, "body"), "Texto principal em português");
await page.type(rowSel(1, "body"), "Main text in English");
await page.click(rowSel(1, "default"));
await sleep(500);
const box = await page.$("#fbl-lang-mode");
const field = await page.evaluateHandle((el) => (el as HTMLElement).closest(".field"), box);
await (field as any).asElement().screenshot({ path: resolve(dir, "lang-block.png") });
console.log("saved", resolve(dir, "lang-block.png"));
await browser.close();
