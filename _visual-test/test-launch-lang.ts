#!/usr/bin/env bun
/**
 * test-launch-lang.ts — функциональная проверка MetaLaunch PRO v0.33.0 (залив по языкам)
 * на подставном Graph API (harness-launch-lang.html). Гоняет настоящий launcher.js в headless Chrome.
 *
 *   1. Галка «Залив по языкам» → список языков грузится живьём (locale=en_US), ключи не из кода.
 *   2. Пустая таблица → LAUNCH заблокирован, причина названа.
 *   3. Дубль языка / нет видео / нет body → красный чек-лист, LAUNCH заблокирован.
 *   4. Загрузка двух видео → они появляются в выпадашке видео; выбор подставляет ID.
 *   5. Сухой прогон → в ленте asset_feed_spec, ничего не создано.
 *   6. Боевой залив 1 каб: форма креатива (LANGUAGE, ровно один is_default, метки сходятся,
 *      нет video_data/link_data в object_story_spec, у видео есть thumbnail, IG на месте).
 *   7. Одно видео на два языка → ОДНА запись видео с двумя метками.
 *   8. Два каба → в каждом свой ID видео (перевод по загрузкам), 1 объявление на адсет.
 *
 *   bun code/metactrl-pro/_visual-test/test-launch-lang.ts
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

const csvPath = resolve(tmpdir(), "metalaunch-lang-test.csv");
const cols = ["Campaign Name", "Campaign Objective", "Buying Type", "Special Ad Categories", "Ad Set Name",
  "Ad Set Daily Budget", "Countries", "Age Min", "Age Max", "Optimization Goal", "Billing Event", "Pixel",
  "Custom Event Type", "Ad Name", "Title", "Body", "Link", "Call to Action", "Image Hash", "Link Object ID"];
const row = ["Lang test", "OUTCOME_SALES", "AUCTION", "", "AS 1", "20", "BR", "18", "65", "OFFSITE_CONVERSIONS",
  "IMPRESSIONS", "1451350725476785", "PURCHASE", "CSV Ad", "CSV Title", "CSV Body", LINK, "LEARN_MORE",
  "abc123hash", PAGE_ID];
writeFileSync(csvPath, cols.join(",") + "\n" + row.join(",") + "\n", "utf8");

// два «видеофайла» — содержимое неважно, важны имя и расширение
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
await page.setViewport({ width: 1440, height: 1100 });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

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

async function openPanel(p: Page) {
  await p.goto(harness, { waitUntil: "domcontentloaded" });
  await waitFor(p, async () => /Loaded 2 accounts/.test(await logText(p)), 30000, "accounts loaded");
  const csvInput = await p.$("#fbl-csv");
  await (csvInput as any).uploadFile(csvPath);
  await waitFor(p, async () => /Parsed 1 rows/.test(await logText(p)), 10000, "csv parsed");
  await p.evaluate(() => {
    const el = document.getElementById("fbl-dsa-beneficiary") as HTMLInputElement;
    el.value = "Drrdasddds";
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function selectAccs(p: Page, want: string[]) {
  if (!(await p.$("#fbl-acc-list"))) await p.click("#fbl-acc-toggle");
  await p.waitForSelector("#fbl-acc-list");
  for (const id of ["111", "222"]) {
    await p.evaluate((id, on) => {
      const cb = document.querySelector(`.fbl-acc-cb[data-acc="${id}"]`) as HTMLInputElement | null;
      if (cb && cb.checked !== on) cb.click();
    }, id, want.includes(id));
    await sleep(300);
  }
}

// строка таблицы языков i
const rowSel = (i: number, f: string) => `.fbl-lang-row[data-i="${i}"] [data-lf="${f}"]`;
async function setLang(p: Page, i: number, key: string) {
  await p.select(rowSel(i, "key"), key);
  await sleep(250);
}
async function typeInto(p: Page, sel: string, text: string) {
  await p.evaluate((sel) => { const el = document.querySelector(sel) as HTMLInputElement; el.value = ""; }, sel);
  await p.click(sel);
  await p.type(sel, text);
}
const statusLine = (p: Page) => p.evaluate(() => (document.getElementById("fbl-lang-status") as HTMLElement | null)?.innerText || "");
const runState = (p: Page) => p.evaluate(() => {
  const b = document.getElementById("fbl-run") as HTMLButtonElement | null;
  return { disabled: !!b?.disabled, text: b?.innerText || "" };
});
const lastPost = (p: Page, acc?: string) => p.evaluate((acc) => {
  const posts = (window as any).__mock.posts.filter((x: any) => !acc || x.acc === acc);
  const x = posts[posts.length - 1];
  return x ? { acc: x.acc, oss: JSON.parse(x.body.object_story_spec || "{}"), feed: x.body.asset_feed_spec ? JSON.parse(x.body.asset_feed_spec) : null, body: x.body } : null;
}, acc ?? "");

async function launch(p: Page, done: RegExp) {
  const before = await logText(p);   // залив стирает ленту на старте: старый «✓» не должен засчитаться
  await p.click("#fbl-run");
  await waitFor(p, async () => { const t = await logText(p); return t !== before && done.test(t); }, 120000, `launch ${done}`);
  // Залив ещё дописывает сводку IG: пока он идёт, кнопка — «Стоп», и новый клик остановил бы его.
  // (в сухом режиме подпись «🟦 DRY RUN — Запустить…», пока идёт залив — «⏹ STOP LAUNCH»)
  await waitFor(p, async () => /Запустить/.test((await runState(p)).text), 60000, "run button idle again");
  return logText(p);
}

try {
  await openPanel(page);
  await selectAccs(page, ["111"]);

  // ── 1. включили режим: список языков грузится живьём ──
  await page.click("#fbl-lang-mode");
  await page.waitForSelector("#fbl-lang-rows", { timeout: 10000 });
  await waitFor(page, async () => (await page.$$(`${rowSel(0, "key")} option`)).length > 5, 10000, "locales in the picker");
  const mk = await page.evaluate(() => (window as any).__mock);
  check("1. language list requested live with locale=en_US", mk.locSearches >= 1 && mk.lastLocaleParams?.locale === "en_US",
    JSON.stringify(mk.lastLocaleParams));
  const optTexts: string[] = await page.$$eval(`${rowSel(0, "key")} option`, (os) => os.map((o) => (o as HTMLOptionElement).textContent || ""));
  check("1. picker has Portuguese (Brazil) and Armenian", optTexts.includes("Portuguese (Brazil)") && optTexts.includes("Armenian"));
  check("1. two empty rows seeded", (await page.$$(".fbl-lang-row")).length === 2);

  // ── 2. пустая таблица → LAUNCH заблокирован ──
  let rs = await runState(page);
  check("2. empty table blocks LAUNCH with a language reason", rs.disabled && /Языки/.test(rs.text), rs.text);

  // ── 3. красный чек-лист: дубль языка, нет видео, нет body ──
  await setLang(page, 0, "16");
  await setLang(page, 1, "16");
  let st = await statusLine(page);
  check("3. duplicate language is flagged", /язык уже есть выше/.test(st), st);
  check("3. missing video flagged", /нет видео/.test(st));
  check("3. missing body flagged", /нет body/.test(st));
  await setLang(page, 1, "6");

  // ── 4. загрузка двух видео → выпадашка видео ──
  const fileInput = await page.$("#fbl-upload-files");
  await (fileInput as any).uploadFile(vidA, vidB);
  await waitFor(page, async () => /Upload done: 2\/2/.test(await logText(page)), 90000, "videos uploaded");
  const pickOpts: Array<{ v: string; t: string }> = await page.$$eval(`${rowSel(0, "pick")} option`, (os) =>
    os.map((o) => ({ v: (o as HTMLOptionElement).value, t: o.textContent || "" })));
  check("4. both uploaded videos are in the video picker", pickOpts.filter((o) => o.v).length === 2 &&
    pickOpts.some((o) => o.t === "lang_a.mp4") && pickOpts.some((o) => o.t === "lang_b.mp4"), JSON.stringify(pickOpts));
  const vA = pickOpts.find((o) => o.t === "lang_a.mp4")!.v;
  const vB = pickOpts.find((o) => o.t === "lang_b.mp4")!.v;
  await page.select(rowSel(0, "pick"), vA);
  await sleep(250);
  await page.select(rowSel(1, "pick"), vB);
  await sleep(250);
  const idShown = await page.$eval(rowSel(0, "videoId"), (el) => (el as HTMLInputElement).value);
  check("4. picking a video fills its ID", idShown === vA, idShown);

  // тексты и default (default = второй язык, English)
  await typeInto(page, rowSel(0, "body"), "Corpo PT");
  await typeInto(page, rowSel(0, "title"), "Titulo PT");
  await typeInto(page, rowSel(1, "body"), "Body EN");
  await page.click(rowSel(1, "default"));
  await sleep(300);
  st = await statusLine(page);
  check("3→ table complete: green checklist", /✓ 2 языков · default: English \(US\)/.test(st), st);
  rs = await runState(page);
  check("3→ LAUNCH enabled", !rs.disabled, rs.text);
  const prev: string = await page.evaluate(() => (document.querySelector(".preview") as HTMLElement | null)?.innerText || "");
  check("3→ preview names the language ad and 1 ad per adset", /языки: каждый адсет получает 1 объявление «LANG» · 2 языков/.test(prev) && /= 1 ad/.test(prev),
    prev.split("\n").join(" | ").slice(0, 160));

  // ── 5. сухой прогон ──
  await page.evaluate(() => { const cb = document.getElementById("fbl-dry-run") as HTMLInputElement; if (!cb.checked) cb.click(); });
  await sleep(300);
  const dryLog = await launch(page, /DRY ad 1\/1/);
  check("5. dry run logs the asset_feed_spec", /asset_feed_spec \(языки\):.*"optimization_type":"LANGUAGE"/.test(dryLog));
  check("5. dry run created nothing", (await page.evaluate(() => (window as any).__mock.posts.length)) === 0);
  await page.evaluate(() => { const cb = document.getElementById("fbl-dry-run") as HTMLInputElement; if (cb.checked) cb.click(); });
  await sleep(300);

  // ── 6. боевой залив ──
  const log6 = await launch(page, /✓ ad 1\/1/);
  const p6 = await lastPost(page, "111");
  check("6. one creative POSTed", !!p6);
  const feed = p6?.feed;
  check("6. optimization_type LANGUAGE, one SINGLE_VIDEO format, one CTA",
    feed?.optimization_type === "LANGUAGE" && feed?.ad_formats?.join() === "SINGLE_VIDEO" && feed?.call_to_action_types?.join() === "LEARN_MORE",
    JSON.stringify([feed?.optimization_type, feed?.ad_formats, feed?.call_to_action_types]));
  check("6. no video_data / link_data anchor in object_story_spec", p6 && !p6.oss.video_data && !p6.oss.link_data && p6.oss.page_id === PAGE_ID,
    JSON.stringify(p6?.oss));
  check("6. IG identity kept", p6?.oss.instagram_user_id === "17841431636764372");
  const rules: any[] = feed?.asset_customization_rules ?? [];
  check("6. two rules, exactly one is_default", rules.length === 2 && rules.filter((r) => r.is_default).length === 1);
  const dflt = rules.find((r) => r.is_default);
  check("6. default rule = English (key 6)", dflt?.customization_spec?.locales?.join() === "6", JSON.stringify(dflt?.customization_spec));
  const pt = rules.find((r) => !r.is_default);
  check("6. other rule = Portuguese (Brazil) key 16 (not 31)", pt?.customization_spec?.locales?.join() === "16", JSON.stringify(pt?.customization_spec));
  // метки: каждая метка из правил есть на своём ассете
  const labelsOf = (arr: any[]) => new Set((arr || []).flatMap((a) => (a.adlabels || []).map((l: any) => l.name)));
  const vidL = labelsOf(feed?.videos), bodyL = labelsOf(feed?.bodies), titleL = labelsOf(feed?.titles), linkL = labelsOf(feed?.link_urls);
  const refsOk = rules.every((r) => vidL.has(r.video_label?.name) && bodyL.has(r.body_label?.name) && linkL.has(r.link_url_label?.name)
    && (!r.title_label || titleL.has(r.title_label.name)));
  check("6. every rule label exists on its asset (video/body/link/title)", refsOk);
  check("6. PT row has title, EN row has none → one title only, tied to PT", feed?.titles?.length === 1 && feed.titles[0].text === "Titulo PT" && !!pt?.title_label && !dflt?.title_label);
  check("6. link = shared offer link", feed?.link_urls?.[0]?.website_url === LINK, feed?.link_urls?.[0]?.website_url);
  check("6. videos carry thumbnails", (feed?.videos ?? []).every((v: any) => /scontent\.test\/t_/.test(v.thumbnail_url || "")));
  check("6. video ids = uploaded (cab 111)", feed?.videos?.map((v: any) => v.video_id).sort().join() === [vA, vB].sort().join());
  const adsMade = await page.evaluate(() => ((window as any).__mock.ads || []).length);
  check("6. exactly 1 ad created", adsMade === 1, String(adsMade));
  check("6. ad name defaults to LANG", /"LANG/.test(log6) || /ad 1\/1 "LANG/.test(log6));

  // ── 7. одно видео на два языка → одна запись с двумя метками ──
  await page.select(rowSel(1, "pick"), vA);
  await sleep(250);
  const before = await page.evaluate(() => (window as any).__mock.posts.length);
  await launch(page, /✓ ad 1\/1/);
  const p7 = await lastPost(page, "111");
  const postsNow = await page.evaluate(() => (window as any).__mock.posts.length);
  check("7. second launch posted another creative", postsNow === before + 1);
  check("7. one video entry carrying two language labels", p7?.feed?.videos?.length === 1 && p7.feed.videos[0].adlabels.length === 2,
    JSON.stringify(p7?.feed?.videos?.map((v: any) => v.adlabels)));

  // ── 8. два каба: ID видео переводятся на каб ──
  await page.select(rowSel(1, "pick"), vB);
  await sleep(250);
  await selectAccs(page, ["111", "222"]);
  await sleep(400);
  // первая загрузка шла в один каб — грузим файлы заново, теперь в оба (мок: хвост ID = каб)
  await (fileInput as any).uploadFile(vidA, vidB);
  await waitFor(page, async () => (await page.evaluate(() => (window as any).__mock.vid)) >= 6, 90000, "second upload round");
  await waitFor(page, async () => /Upload done: 2\/2.*across 2 accounts/.test(await logText(page)), 90000, "upload to 2 cabs done");
  const pick2: Array<{ v: string; t: string }> = await page.$$eval(`${rowSel(0, "pick")} option`, (os) =>
    os.map((o) => ({ v: (o as HTMLOptionElement).value, t: o.textContent || "" })));
  const nA = pick2.find((o) => o.t === "lang_a.mp4")!.v;
  const nB = pick2.find((o) => o.t === "lang_b.mp4")!.v;
  await page.select(rowSel(0, "pick"), nA);
  await sleep(250);
  await page.select(rowSel(1, "pick"), nB);
  await sleep(250);
  await page.evaluate(() => { (window as any).__mock.posts.length = 0; (window as any).__mock.ads = []; });
  await launch(page, /Multi-account done/);
  const c111 = await lastPost(page, "111");
  const c222 = await lastPost(page, "222");
  check("8. both cabs got a language creative", !!c111?.feed && !!c222?.feed);
  const ids111 = c111?.feed?.videos?.map((v: any) => v.video_id).sort() ?? [];
  const ids222 = c222?.feed?.videos?.map((v: any) => v.video_id).sort() ?? [];
  check("8. cab 222 uses ITS OWN video ids (remapped), not cab 111's", ids111.length === 2 && ids222.length === 2 && ids111.join() !== ids222.join()
    && ids111.every((x: string) => x.endsWith("111")) && ids222.every((x: string) => x.endsWith("222")),
    `111=${ids111.join("/")} 222=${ids222.join("/")}`);
  check("8. one ad per cab", (await page.evaluate(() => ((window as any).__mock.ads || []).length)) === 2);

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
