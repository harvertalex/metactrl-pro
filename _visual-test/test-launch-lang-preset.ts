#!/usr/bin/env bun
/**
 * test-launch-lang-preset.ts — MetaLaunch PRO v0.33.1: таблица языков (6.1) живёт в пресетах.
 * Настоящий launcher.js в headless Chrome на подставном Graph API (harness-launch-lang.html).
 *
 *   P1. Заполнили 3 языка (видео из загрузок, второй язык — default, третий — video ID руками),
 *       сохранили пресет → в localStorage лежат режим, имя объявления, default, строки и videoName.
 *   P2. Перезагрузили панель (новая сессия, загрузок нет) → загрузка пресета возвращает режим и таблицу.
 *   P3. Новая загрузка файлов в ДРУГОМ порядке → строки сами берут свежий ID по имени файла;
 *       видео, вставленное руками, остаётся как было.
 *   P4. Боевой залив из пресета → креатив с новыми ID, default = English, title на месте.
 *   P5. Пресет без языков (старый формат) режим ВЫКЛЮЧАЕТ; возврат на языковой пресет включает снова.
 *
 *   bun code/metactrl-pro/_visual-test/test-launch-lang-preset.ts
 */
import puppeteer, { type Page } from "puppeteer-core";
import { resolve } from "path";
import { writeFileSync } from "fs";
import { tmpdir } from "os";

const dir = resolve(import.meta.dir);
const harness = "file:///" + resolve(dir, "harness-launch-lang.html").replace(/\\/g, "/");
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PAGE_ID = "1039445349258069";
const LINK = "https://offer.example/?utm=1";
const HAND_ID = "900000000000777";

const csvPath = resolve(tmpdir(), "metalaunch-lang-preset-test.csv");
const cols = ["Campaign Name", "Campaign Objective", "Buying Type", "Special Ad Categories", "Ad Set Name",
  "Ad Set Daily Budget", "Countries", "Age Min", "Age Max", "Optimization Goal", "Billing Event", "Pixel",
  "Custom Event Type", "Ad Name", "Title", "Body", "Link", "Call to Action", "Image Hash", "Link Object ID"];
const row = ["Lang preset test", "OUTCOME_SALES", "AUCTION", "", "AS 1", "20", "BR", "18", "65", "OFFSITE_CONVERSIONS",
  "IMPRESSIONS", "1451350725476785", "PURCHASE", "CSV Ad", "CSV Title", "CSV Body", LINK, "LEARN_MORE",
  "abc123hash", PAGE_ID];
writeFileSync(csvPath, cols.join(",") + "\n" + row.join(",") + "\n", "utf8");

const vidA = resolve(tmpdir(), "lang_a.mp4");
const vidB = resolve(tmpdir(), "lang_b.mp4");
writeFileSync(vidA, Buffer.from("fake-video-a"));
writeFileSync(vidB, Buffer.from("fake-video-b"));

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
await page.setViewport({ width: 1440, height: 1200 });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
let dialogAnswer = "";
page.on("dialog", (d) => { d.accept(dialogAnswer).catch(() => {}); });

const logText = (p: Page) => p.evaluate(() => document.getElementById("fbl-log")?.innerText || "");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor(p: Page, fn: () => Promise<boolean>, ms: number, what: string) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await fn()) return true;
    await sleep(300);
  }
  throw new Error(`timeout: ${what}\nlog:\n${(await logText(p)).slice(-2500)}`);
}

async function openBare(p: Page) {
  await p.goto(harness, { waitUntil: "domcontentloaded" });
  await waitFor(p, async () => /Loaded 2 accounts/.test(await logText(p)), 30000, "accounts loaded");
}
async function selectAcc111(p: Page) {
  if (!(await p.$("#fbl-acc-list"))) await p.click("#fbl-acc-toggle");
  await p.waitForSelector("#fbl-acc-list");
  await p.evaluate(() => {
    for (const id of ["111", "222"]) {
      const cb = document.querySelector(`.fbl-acc-cb[data-acc="${id}"]`) as HTMLInputElement | null;
      if (cb && cb.checked !== (id === "111")) cb.click();
    }
  });
  await sleep(400);
}

const rowSel = (i: number, f: string) => `.fbl-lang-row[data-i="${i}"] [data-lf="${f}"]`;
async function typeInto(p: Page, sel: string, text: string) {
  await p.evaluate((sel) => { (document.querySelector(sel) as HTMLInputElement).value = ""; }, sel);
  await p.click(sel);
  await p.type(sel, text);
}
const val = (p: Page, sel: string) => p.$eval(sel, (el) => (el as HTMLInputElement).value);
const statusLine = (p: Page) => p.evaluate(() => (document.getElementById("fbl-lang-status") as HTMLElement | null)?.innerText || "");
const runState = (p: Page) => p.evaluate(() => {
  const b = document.getElementById("fbl-run") as HTMLButtonElement | null;
  return { disabled: !!b?.disabled, text: b?.innerText || "" };
});
const storedPresets = (p: Page) => p.evaluate(() => JSON.parse(localStorage.getItem("fbl_presets_v1") || "[]"));
const pickOptions = (p: Page, i: number): Promise<Array<{ v: string; t: string }>> =>
  p.$$eval(`${rowSel(i, "pick")} option`, (os) => os.map((o) => ({ v: (o as HTMLOptionElement).value, t: o.textContent || "" })));

async function launch(p: Page, done: RegExp) {
  const before = await logText(p);
  await p.click("#fbl-run");
  await waitFor(p, async () => { const t = await logText(p); return t !== before && done.test(t); }, 120000, `launch ${done}`);
  await waitFor(p, async () => /Запустить/.test((await runState(p)).text), 60000, "run button idle again");
  return logText(p);
}

try {
  // ── P1. собрали таблицу и сохранили пресет ──
  await openBare(page);
  await page.evaluate(() => localStorage.removeItem("fbl_presets_v1"));
  await (await page.$("#fbl-csv") as any).uploadFile(csvPath);
  await waitFor(page, async () => /Parsed 1 rows/.test(await logText(page)), 10000, "csv parsed");
  await page.evaluate(() => {
    const el = document.getElementById("fbl-dsa-beneficiary") as HTMLInputElement;
    el.value = "Drrdasddds";
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await selectAcc111(page);
  await (await page.$("#fbl-upload-files") as any).uploadFile(vidA, vidB);
  await waitFor(page, async () => /Upload done: 2\/2/.test(await logText(page)), 90000, "videos uploaded");
  await page.click("#fbl-lang-mode");
  await page.waitForSelector("#fbl-lang-rows");
  await waitFor(page, async () => (await page.$$(`${rowSel(0, "key")} option`)).length > 5, 10000, "locales");
  const opts1 = await pickOptions(page, 0);
  const savedA = opts1.find((o) => o.t === "lang_a.mp4")!.v;
  const savedB = opts1.find((o) => o.t === "lang_b.mp4")!.v;
  await page.click("[data-lf=add]");
  await sleep(300);
  await page.select(rowSel(0, "key"), "16"); await sleep(200);
  await page.select(rowSel(1, "key"), "6"); await sleep(200);
  await page.select(rowSel(2, "key"), "68"); await sleep(200);
  await page.select(rowSel(0, "pick"), savedA); await sleep(200);
  await page.select(rowSel(1, "pick"), savedB); await sleep(200);
  await typeInto(page, rowSel(2, "videoId"), HAND_ID);
  await typeInto(page, rowSel(0, "title"), "Titulo PT");
  await typeInto(page, rowSel(0, "body"), "Corpo PT");
  await typeInto(page, rowSel(1, "body"), "Body EN");
  await typeInto(page, rowSel(2, "body"), "Body HY");
  await page.click(rowSel(1, "default"));
  await sleep(250);
  await typeInto(page, "#fbl-lang-adname", "MyLang");
  await page.click("#fbl-lang-status");      // уходим из блока — перерисовка
  await sleep(300);
  check("P1. table is complete before saving", /✓ 3 языков · default: English \(US\)/.test(await statusLine(page)), await statusLine(page));

  dialogAnswer = "LangPreset";
  await page.click("#fbl-preset-save");
  await waitFor(page, async () => (await storedPresets(page)).length === 1, 5000, "preset stored");

  // ── P2. что реально лежит в хранилище ──
  const [stored] = await storedPresets(page);
  const s = stored.settings;
  check("P2. mode, ad name, default saved", s.langMode === true && s.langAdName === "MyLang" && s.langDefault === 1,
    JSON.stringify([s.langMode, s.langAdName, s.langDefault]));
  check("P2. 3 rows saved with key/name/title/body", Array.isArray(s.langRows) && s.langRows.length === 3
    && s.langRows[0].key === "16" && s.langRows[0].name === "Portuguese (Brazil)" && s.langRows[0].title === "Titulo PT"
    && s.langRows[1].key === "6" && s.langRows[2].key === "68" && s.langRows[2].body === "Body HY", JSON.stringify(s.langRows).slice(0, 220));
  check("P2. uploaded rows remember the file name, hand-typed ID has none",
    s.langRows[0].videoName === "lang_a.mp4" && s.langRows[1].videoName === "lang_b.mp4" && s.langRows[2].videoName === "" && s.langRows[2].videoId === HAND_ID,
    JSON.stringify(s.langRows.map((r: any) => [r.videoName, r.videoId])));
  const tagText = await page.$eval("#fbl-preset-select", (sel) => Array.from((sel as HTMLSelectElement).options).map((o) => o.textContent).join(" | "));
  check("P2. preset list shows the 🌐 mark", /LangPreset.*🌐/.test(tagText), tagText);

  // старый пресет без языков — для P5
  await page.evaluate(() => {
    const list = JSON.parse(localStorage.getItem("fbl_presets_v1") || "[]");
    list.push({ id: "p_old", name: "OldPreset", createdAt: new Date().toISOString(), fileName: "", csvText: "", manual: true, settings: { campNamePrefix: "old" } });
    localStorage.setItem("fbl_presets_v1", JSON.stringify(list));
  });

  // ── P3. новая сессия: перезагрузка, загрузок нет ──
  await openBare(page);
  const loadedId = (await storedPresets(page)).find((p: any) => p.name === "LangPreset").id;
  await page.select("#fbl-preset-select", loadedId);
  await page.waitForSelector("#fbl-lang-rows", { timeout: 10000 });
  await waitFor(page, async () => (await page.$$(`${rowSel(0, "key")} option`)).length > 5, 10000, "locales after preset load");
  await sleep(300);
  check("P3. mode is ON after loading the preset", await page.$eval("#fbl-lang-mode", (el) => (el as HTMLInputElement).checked));
  check("P3. 3 rows restored", (await page.$$(".fbl-lang-row")).length === 3);
  const keys = [await val(page, rowSel(0, "key")), await val(page, rowSel(1, "key")), await val(page, rowSel(2, "key"))];
  check("P3. language pickers show the saved languages", keys.join() === "16,6,68", keys.join());
  check("P3. title/body restored", (await val(page, rowSel(0, "title"))) === "Titulo PT" && (await val(page, rowSel(0, "body"))) === "Corpo PT"
    && (await val(page, rowSel(1, "body"))) === "Body EN" && (await val(page, rowSel(2, "body"))) === "Body HY");
  check("P3. default radio on row 2 (English)", await page.$eval(rowSel(1, "default"), (el) => (el as HTMLInputElement).checked));
  check("P3. ad name restored", (await val(page, "#fbl-lang-adname")) === "MyLang");
  check("P3. warning tells to re-upload videos", /языки \(3\) восстановлены/.test(await logText(page)));
  const staleRow0 = await val(page, rowSel(0, "videoId"));
  check("P3. video id is the old one until a fresh upload", staleRow0 === savedA, `${staleRow0} vs ${savedA}`);

  // ── P4. свежая загрузка в обратном порядке → подтяжка по имени файла ──
  await selectAcc111(page);
  await (await page.$("#fbl-upload-files") as any).uploadFile(vidB, vidA);
  await waitFor(page, async () => /Upload done: 2\/2/.test(await logText(page)), 90000, "videos re-uploaded");
  await sleep(300);
  const opts2 = await pickOptions(page, 0);
  const newA = opts2.find((o) => o.t === "lang_a.mp4")!.v;
  const newB = opts2.find((o) => o.t === "lang_b.mp4")!.v;
  check("P4. fresh upload really gave different ids (order swapped)", newA !== savedA && newB !== savedB, `A ${savedA}→${newA} · B ${savedB}→${newB}`);
  const r0 = await val(page, rowSel(0, "videoId")), r1 = await val(page, rowSel(1, "videoId")), r2 = await val(page, rowSel(2, "videoId"));
  check("P4. rows re-linked to the new uploads by file name", r0 === newA && r1 === newB, `row0=${r0} (want ${newA}) row1=${r1} (want ${newB})`);
  check("P4. hand-typed video ID untouched", r2 === HAND_ID, r2);
  check("P4. log says how many videos were re-linked", /Языки: 2 видео подтянуто по имени файла/.test(await logText(page)));
  const rs = await runState(page);
  check("P4. LAUNCH enabled", !rs.disabled, rs.text);

  // ── P4b. боевой залив из пресета ──
  await launch(page, /✓ ad 1\/1/);
  const p = await page.evaluate(() => {
    const posts = (window as any).__mock.posts;
    const x = posts[posts.length - 1];
    return x ? { feed: JSON.parse(x.body.asset_feed_spec || "null"), oss: JSON.parse(x.body.object_story_spec || "{}") } : null;
  });
  const feed = p?.feed;
  check("P4b. creative is a LANGUAGE feed", feed?.optimization_type === "LANGUAGE" && !p?.oss.video_data);
  check("P4b. feed carries the NEW video ids + the hand-typed one",
    feed?.videos?.map((v: any) => v.video_id).sort().join() === [newA, newB, HAND_ID].sort().join(),
    JSON.stringify(feed?.videos?.map((v: any) => v.video_id)));
  const rules: any[] = feed?.asset_customization_rules ?? [];
  check("P4b. 3 rules, default = English (6)", rules.length === 3 && rules.filter((r) => r.is_default).length === 1
    && rules.find((r) => r.is_default)?.customization_spec?.locales?.join() === "6");
  check("P4b. PT title restored into the feed", feed?.titles?.length === 1 && feed.titles[0].text === "Titulo PT");
  check("P4b. link = shared offer link", feed?.link_urls?.[0]?.website_url === LINK);
  const adName = await page.evaluate(() => ((window as any).__mock.ads || [])[0]?.name || "");
  check("P4b. ad created under the restored name", /MyLang/.test(adName) || /MyLang/.test(await logText(page)), adName);

  // ── P5. пресет без языков режим выключает; обратно — включает ──
  await page.select("#fbl-preset-select", "p_old");
  await sleep(500);
  check("P5. old preset (no language keys) switches the mode OFF", !(await page.$eval("#fbl-lang-mode", (el) => (el as HTMLInputElement).checked)) && !(await page.$("#fbl-lang-rows")));
  await page.select("#fbl-preset-select", loadedId);
  await page.waitForSelector("#fbl-lang-rows", { timeout: 10000 });
  await sleep(300);
  check("P5. back on the language preset → mode ON, 3 rows", (await page.$$(".fbl-lang-row")).length === 3);

  check("no page errors", errors.length === 0, errors.join(" | "));
} catch (e) {
  console.log("❌ ABORTED:", (e as Error).message);
  results.push({ name: "run completed", ok: false, detail: (e as Error).message.slice(0, 300) });
} finally {
  await browser.close();
}

const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} passed`);
process.exit(bad.length ? 1 : 0);
