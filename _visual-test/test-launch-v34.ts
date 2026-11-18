#!/usr/bin/env bun
/**
 * test-launch-v34.ts — функциональная проверка MetaLaunch PRO v0.34.0 на подставном Graph API
 * (harness-launch-v34.html). Гоняет настоящий launcher.js в headless Chrome.
 *
 *   A. Копии объявлений («1-1-5»): 1 видео × 5 → 5 объявлений, имена -1…-5, ОДИН креатив;
 *      с {ad_name} в URL Tags креативы разные; 51 → блок; CSV-объявления — поле выключено; пресет.
 *   B. Ссылка на язык: своя + общая → две записи link_urls; одинаковые → одна; токены; невалидная → красный чек-лист.
 *   C. Ссылка в JSON креатива (`link`) выигрывает у общей.
 *   D. Instagram: галка FB-only + Instagram в плейсментах → игнорируется (флаг personality, не чистый page-only);
 *      галка + плейсменты только Facebook → честный page-only; FB отвечает 1772103 → каб стоп, второй адсет не создан;
 *      галка не сохраняется в пресете.
 *
 *   bun code/metactrl-pro/_visual-test/test-launch-v34.ts
 */
import puppeteer, { type Page } from "puppeteer-core";
import { resolve } from "path";
import { writeFileSync } from "fs";
import { tmpdir } from "os";

const dir = resolve(import.meta.dir);
const harness = "file:///" + resolve(dir, "harness-launch-v34.html").replace(/\\/g, "/");
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PAGE_ID = "1039445349258069";
const PIXEL = "1451350725476785";
const LINK = "https://offer.example/?utm=1";

const cols = ["Campaign Name", "Campaign Objective", "Buying Type", "Special Ad Categories", "Ad Set Name",
  "Ad Set Daily Budget", "Countries", "Age Min", "Age Max", "Optimization Goal", "Billing Event", "Pixel",
  "Custom Event Type", "Ad Name", "Title", "Body", "Link", "Call to Action", "Image Hash", "Link Object ID"];
const mkRow = (adset: string) => ["V34 test", "OUTCOME_SALES", "AUCTION", "", adset, "20", "BR", "18", "65", "OFFSITE_CONVERSIONS",
  "IMPRESSIONS", PIXEL, "PURCHASE", "CSV Ad", "CSV Title", "CSV Body", LINK, "LEARN_MORE", "abc123hash", PAGE_ID].join(",");
const csv1 = resolve(tmpdir(), "metalaunch-v34-1.csv");
const csv2 = resolve(tmpdir(), "metalaunch-v34-2.csv");
writeFileSync(csv1, cols.join(",") + "\n" + mkRow("AS 1") + "\n", "utf8");
writeFileSync(csv2, cols.join(",") + "\n" + mkRow("AS 1") + "\n" + mkRow("AS 2") + "\n", "utf8");

const vidA = resolve(tmpdir(), "v34_a.mp4");
const vidB = resolve(tmpdir(), "v34_b.mp4");
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
await page.setViewport({ width: 1440, height: 1300 });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("dialog", (d) => { d.accept("preset-v34").catch(() => {}); });

const logText = (p: Page) => p.evaluate(() => document.getElementById("fbl-log")?.innerText || "");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor(p: Page, fn: () => Promise<boolean>, ms: number, what: string) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await fn()) return true;
    await sleep(250);
  }
  throw new Error(`timeout: ${what}\nlog:\n${(await logText(p)).slice(-2500)}`);
}
const runState = (p: Page) => p.evaluate(() => {
  const b = document.getElementById("fbl-run") as HTMLButtonElement | null;
  return { disabled: !!b?.disabled, text: b?.innerText || "" };
});
const mock = (p: Page) => p.evaluate(() => {
  const m = (window as any).__mock;
  return { posts: m.posts, ads: m.ads, adsets: m.adsets, rejected: m.rejected };
});
const preview = (p: Page) => p.evaluate(() => (document.querySelector(".preview") as HTMLElement | null)?.innerText || "");

/** value + input + blur (blur → panel re-render, как после ухода из поля) */
async function setVal(p: Page, sel: string, value: string) {
  await p.evaluate((sel, value) => {
    const el = document.querySelector(sel) as HTMLInputElement | HTMLTextAreaElement;
    el.focus();
    el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.blur();
  }, sel, value);
  await sleep(250);
}

async function prep(p: Page, opts: { csv?: string; mock?: Record<string, unknown> } = {}) {
  await p.goto(harness, { waitUntil: "domcontentloaded" });
  await waitFor(p, async () => /Loaded 2 accounts/.test(await logText(p)), 30000, "accounts loaded");
  await p.evaluate((m) => Object.assign((window as any).__mock, m), opts.mock ?? {});
  // presets and the per-page IG memory live in localStorage and outlive the scenarios — start clean
  await p.evaluate(() => { localStorage.removeItem("fbl_presets_v1"); localStorage.removeItem("fbl_ig_by_page_v1"); });
  const rows = opts.csv === csv2 ? 2 : 1;
  await (await p.$("#fbl-csv") as any).uploadFile(opts.csv ?? csv1);
  await waitFor(p, async () => new RegExp(`Parsed ${rows} rows`).test(await logText(p)), 10000, "csv parsed");
  await setVal(p, "#fbl-dsa-beneficiary", "Drrdasddds");
  if (!(await p.$("#fbl-acc-list"))) await p.click("#fbl-acc-toggle");
  await p.waitForSelector("#fbl-acc-list");
  for (const id of ["111", "222"]) {
    await p.evaluate((id, on) => {
      const cb = document.querySelector(`.fbl-acc-cb[data-acc="${id}"]`) as HTMLInputElement | null;
      if (cb && cb.checked !== on) cb.click();
    }, id, id === "111");
    await sleep(250);
  }
}
async function upload(p: Page, files: string[]) {
  const n = files.length;
  await (await p.$("#fbl-upload-files") as any).uploadFile(...files);
  await waitFor(p, async () => new RegExp(`Upload done: ${n}/${n}`).test(await logText(p)), 90000, "videos uploaded");
}
// Однокабовый итог идёт в статус-бар, не в ленту → конец залива = кнопка снова «Запустить»
// (state.running ставится синхронно по клику, до первого await).
async function launch(p: Page, _done?: RegExp) {
  const before = await logText(p);
  await p.click("#fbl-run");
  await waitFor(p, async () => (await logText(p)) !== before, 20000, "launch started");
  await waitFor(p, async () => /Запустить/.test((await runState(p)).text), 150000, "run finished (button idle again)");
  return logText(p);
}
const DONE = undefined;
const adNames = (ads: any[]) => ads.map((a) => String(a.name));

const rowSel = (i: number, f: string) => `.fbl-lang-row[data-i="${i}"] [data-lf="${f}"]`;
const pickOptions = (p: Page, i: number): Promise<Array<{ v: string; t: string }>> =>
  p.$$eval(`${rowSel(i, "pick")} option`, (os) => os.map((o) => ({ v: (o as HTMLOptionElement).value, t: o.textContent || "" })));
const statusLine = (p: Page) => p.evaluate(() => (document.getElementById("fbl-lang-status") as HTMLElement | null)?.innerText || "");

try {
  // ═══ A. копии объявлений ═══
  await prep(page);
  await upload(page, [vidA]);
  await setVal(page, "#fbl-ad-copies", "5");
  let pv = await preview(page);
  check("A1. preview shows 1 adset × 5 copies = 5 ads (1-1-5)", /= 5 ads/.test(pv) && /копии: каждый креатив × 5/.test(pv) && /1-1-5/.test(pv), pv.split("\n").join(" | ").slice(0, 200));
  let rs = await runState(page);
  check("A1. launch button counts 5 ads", !rs.disabled && /5 ads/.test(rs.text), rs.text);
  let log = await launch(page, DONE);
  let mk = await mock(page);
  const names = adNames(mk.ads);
  check("A2. 5 ads created", mk.ads.length === 5, String(mk.ads.length));
  check("A2. names are -1…-5 and unique", new Set(names).size === 5 && [1, 2, 3, 4, 5].every((k) => names.some((n) => n.endsWith(`-${k}`))), names.join(" / "));
  check("A2. the copies share ONE creative (1 POST /adcreatives)", mk.posts.length === 1, `creative POSTs=${mk.posts.length}`);
  check("A2. all 5 ads point to the same creative", new Set(mk.ads.map((a: any) => a.creative)).size === 1);
  check("A2. log says the creative was reused 4 times", (log.match(/reused for the copy/g) || []).length === 4);

  // {ad_name} в URL Tags → креативы у копий разные
  await prep(page);
  await upload(page, [vidA]);
  await setVal(page, "#fbl-ad-copies", "3");
  await setVal(page, "#fbl-tags-override", "sub5={ad_name}&sub2={account_id}");
  await launch(page, DONE);
  mk = await mock(page);
  const tags = mk.posts.map((p: any) => p.body.url_tags);
  check("A3. with {ad_name} in URL Tags every copy gets its own creative", mk.posts.length === 3 && new Set(tags).size === 3 && mk.ads.length === 3, tags.join(" | "));

  // 51 → блок
  await setVal(page, "#fbl-ad-copies", "50");
  await setVal(page, "#fbl-ad-copies", "51");   // поле клампит до 50, FB-лимит — 50
  rs = await runState(page);
  check("A4. 51 in the field is clamped to 50 (never above FB's cap)", !rs.disabled && /50 ads/.test(rs.text), rs.text);

  // CSV-объявления: поле выключено
  await prep(page);
  const dis = await page.$eval("#fbl-ad-copies", (el) => (el as HTMLInputElement).disabled);
  pv = await preview(page);
  check("A5. plain CSV ads (no creatives) → copies field disabled", dis === true, `disabled=${dis}`);

  // пресет: копии едут, FB-only — нет
  await prep(page);
  await upload(page, [vidA]);
  await setVal(page, "#fbl-ad-copies", "5");
  await page.evaluate(() => { const cb = document.getElementById("fbl-use-page-as-actor") as HTMLInputElement; if (!cb.checked) cb.click(); });
  await sleep(300);
  await page.click("#fbl-preset-save");
  await sleep(400);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("fbl_presets_v1") || "[]"));
  check("A6. preset stores the copies", saved[0]?.settings?.adCopiesOverride === "5", JSON.stringify(saved[0]?.settings?.adCopiesOverride));
  check("A6. preset does NOT store the FB-only tick", !("usePageAsActor" in (saved[0]?.settings || {})), "key absent");
  await setVal(page, "#fbl-ad-copies", "2");
  await page.evaluate(() => { const cb = document.getElementById("fbl-use-page-as-actor") as HTMLInputElement; if (!cb.checked) cb.click(); });
  await sleep(300);
  await page.select("#fbl-preset-select", saved[0].id);
  await sleep(500);
  const afterLoad = await page.evaluate(() => ({
    copies: (document.getElementById("fbl-ad-copies") as HTMLInputElement).value,
    fbOnly: (document.getElementById("fbl-use-page-as-actor") as HTMLInputElement).checked,
  }));
  check("A6. loading the preset restores copies=5 and clears the FB-only tick", afterLoad.copies === "5" && afterLoad.fbOnly === false, JSON.stringify(afterLoad));
  // ═══ B. ссылка на язык ═══
  await prep(page);
  await upload(page, [vidA, vidB]);
  await page.click("#fbl-lang-mode");
  await page.waitForSelector("#fbl-lang-rows");
  await waitFor(page, async () => (await page.$$(`${rowSel(0, "key")} option`)).length > 5, 10000, "locales");
  const opts = await pickOptions(page, 0);
  const vA = opts.find((o) => o.t === "v34_a.mp4")!.v;
  const vB = opts.find((o) => o.t === "v34_b.mp4")!.v;
  await page.select(rowSel(0, "key"), "16"); await sleep(200);
  await page.select(rowSel(1, "key"), "6"); await sleep(200);
  await page.select(rowSel(0, "pick"), vA); await sleep(200);
  await page.select(rowSel(1, "pick"), vB); await sleep(200);
  await setVal(page, rowSel(0, "body"), "Corpo PT");
  await setVal(page, rowSel(1, "body"), "Body EN");
  await page.click(rowSel(1, "default"));
  await sleep(250);

  check("B0. every language row has a link field", (await page.$$('.fbl-lang-row [data-lf="link"]')).length === 2);
  await setVal(page, rowSel(0, "link"), "ftp://nope");
  let st = await statusLine(page);
  rs = await runState(page);
  check("B1. a non-http link is flagged and blocks LAUNCH", /ссылка должна начинаться с http/.test(st) && rs.disabled, st);

  await setVal(page, rowSel(0, "link"), "https://pt.example/?acc={account_id}&px={pixel_id}");
  st = await statusLine(page);
  check("B2. checklist counts 1 own link + 1 shared", /ссылки: 1 своих \+ 1 общая/.test(st), st);
  log = await launch(page, DONE);
  mk = await mock(page);
  let feed = JSON.parse(mk.posts[mk.posts.length - 1].body.asset_feed_spec);
  const lu: any[] = feed.link_urls;
  const ptUrl = `https://pt.example/?acc=111&px=${PIXEL}`;
  check("B3. two link_urls: PT's own (tokens resolved) and the shared one", lu.length === 2
    && lu.some((x) => x.website_url === ptUrl) && lu.some((x) => x.website_url === LINK), JSON.stringify(lu.map((x) => x.website_url)));
  const rules: any[] = feed.asset_customization_rules;
  const ptRule = rules.find((r) => r.customization_spec.locales[0] === 16);
  const enRule = rules.find((r) => r.customization_spec.locales[0] === 6);
  const labelsOfUrl = (u: string) => lu.find((x) => x.website_url === u)?.adlabels.map((l: any) => l.name) ?? [];
  check("B3. each rule's link label sits on ITS link entry only", labelsOfUrl(ptUrl).join() === ptRule.link_url_label.name && labelsOfUrl(LINK).join() === enRule.link_url_label.name,
    `pt=${labelsOfUrl(ptUrl)} en=${labelsOfUrl(LINK)}`);
  check("B3. the ad was created", mk.ads.length === 1);

  // обе строки на одной ссылке → одна запись с двумя метками (как в v0.33)
  await setVal(page, rowSel(1, "link"), "https://pt.example/?acc={account_id}&px={pixel_id}");
  await launch(page, DONE);
  mk = await mock(page);
  feed = JSON.parse(mk.posts[mk.posts.length - 1].body.asset_feed_spec);
  check("B4. both languages on one link → ONE link_urls entry carrying both labels", feed.link_urls.length === 1 && feed.link_urls[0].adlabels.length === 2, JSON.stringify(feed.link_urls));

  // обе пусто → как v0.33: общая ссылка на обе
  await setVal(page, rowSel(0, "link"), "");
  await setVal(page, rowSel(1, "link"), "");
  await launch(page, DONE);
  mk = await mock(page);
  feed = JSON.parse(mk.posts[mk.posts.length - 1].body.asset_feed_spec);
  check("B5. no own links → single shared entry (same as v0.33)", feed.link_urls.length === 1 && feed.link_urls[0].website_url === LINK && feed.link_urls[0].adlabels.length === 2);

  // языки × копии
  await setVal(page, "#fbl-ad-copies", "3");
  const before = (await mock(page)).ads.length;
  await launch(page, DONE);
  mk = await mock(page);
  check("B6. language ad × 3 copies → 3 ads from ONE feed creative", mk.ads.length - before === 3, `+${mk.ads.length - before} ads`);

  // ═══ C. link в JSON креатива ═══
  await prep(page);
  const json = JSON.stringify([
    { name: "A", videoId: "1111111111111111", link: "https://a.example/?p={pixel_id}" },
    { name: "B", videoId: "2222222222222222" },
  ]);
  await setVal(page, "#fbl-creatives", json);
  await launch(page, DONE);
  mk = await mock(page);
  const linkOf = (p: any) => JSON.parse(p.body.object_story_spec).video_data.call_to_action.value.link;
  const l0 = linkOf(mk.posts[0]), l1 = linkOf(mk.posts[1]);
  check("C1. creative A goes to its own link (tokens resolved)", l0 === `https://a.example/?p=${PIXEL}`, l0);
  check("C1. creative B goes to the shared link", l1 === LINK, l1);

  // ═══ D. Instagram ═══
  // D1. IG взять неоткуда, FB требует личность (#1772103 без неё), галка FB-only ВКЛ, Instagram в плейсментах (авто)
  await prep(page, { mock: { hist: false, identity: "flag" } });
  await upload(page, [vidA]);
  await page.evaluate(() => { const cb = document.getElementById("fbl-use-page-as-actor") as HTMLInputElement; if (!cb.checked) cb.click(); });
  await sleep(300);
  const hint = await page.evaluate(() => document.getElementById("fbl-use-page-as-actor")!.closest("label")!.innerText);
  check("D0. UI says the tick is ignored while Instagram is in the placements", /игнорируется/.test(hint), hint.slice(-90));
  log = await launch(page, DONE);
  mk = await mock(page);
  check("D1. tick ON + Instagram targeted → tick ignored, log says why", /галка НЕ действует/.test(log));
  check("D1. creative carries the page-identity flag (not bare page-only) → FB accepts, ad created",
    mk.rejected === 0 && mk.ads.length === 1 && mk.posts[0].body.use_page_actor_override === "true", `rejected=${mk.rejected} ads=${mk.ads.length}`);

  // D2. те же условия, но плейсменты только Facebook → галка действует: чистый page-only, без флага, без поиска IG
  await prep(page, { mock: { hist: false, identity: "off" } });
  await upload(page, [vidA]);
  await page.evaluate(() => { const c = document.querySelector('.chip[data-platform="facebook"]') as HTMLElement; c.click(); });
  await sleep(300);
  await page.evaluate(() => { const cb = document.getElementById("fbl-use-page-as-actor") as HTMLInputElement; if (!cb.checked) cb.click(); });
  await sleep(300);
  log = await launch(page, DONE);
  mk = await mock(page);
  const oss2 = JSON.parse(mk.posts[0].body.object_story_spec);
  check("D2. tick ON + Facebook-only placements → honest page-only", /Page-only identity/.test(log) && !oss2.instagram_user_id && !mk.posts[0].body.use_page_actor_override && mk.ads.length === 1);

  // D3. FB не принимает и флаг (#1772103) → каб останавливается, второй адсет не создаётся
  await prep(page, { csv: csv2, mock: { hist: false, identity: "always" } });
  await upload(page, [vidA]);
  log = await launch(page, DONE);
  mk = await mock(page);
  check("D3. FB 1772103 → exactly one refusal, no ads", mk.rejected === 1 && mk.ads.length === 0, `rejected=${mk.rejected} ads=${mk.ads.length}`);
  check("D3. the second ad set is NOT created (no empty groups)", mk.adsets === 1 && /adset 2\/2 не создаю/.test(log), `adsets=${mk.adsets}`);
  check("D3. log explains what to do (role / IG ID / drop Instagram)", /🛑 FB требует личность/.test(log) && /ADVERTISER/.test(log) && /Placements/.test(log));

  // D4. IG найден в истории → уходит явным instagram_user_id даже с галкой (Instagram в плейсментах)
  await prep(page, { mock: { hist: true, identity: "flag" } });
  await upload(page, [vidA]);
  await page.evaluate(() => { const cb = document.getElementById("fbl-use-page-as-actor") as HTMLInputElement; if (!cb.checked) cb.click(); });
  await sleep(300);
  await launch(page, DONE);
  mk = await mock(page);
  check("D4. IG known + tick ON + Instagram targeted → explicit instagram_user_id", JSON.parse(mk.posts[0].body.object_story_spec).instagram_user_id === "17841431636764372");

  check("no page errors", errors.length === 0, errors.join(" | "));
} catch (e) {
  console.log("❌ ABORTED:", (e as Error).message);
  results.push({ name: "run completed", ok: false, detail: (e as Error).message.slice(0, 400) });
} finally {
  await browser.close();
}

const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} passed`);
process.exit(bad.length ? 1 : 0);
