#!/usr/bin/env node
// Browser check of the static demo (the export in web/out): at 1440 and 390 px, light and dark, every page loads with
// no console error and no CSP violation, and the image rules hold in a real browser:
//
//   - no request ever fetches an image, thumbnail or veil of a record darkroom did not serve (every file request
//     under the tape maps to a passed or review record), and no request leaves this origin
//   - a veiled frame loads its veil only; its thumbnail and full view are requested only after Reveal
//   - Compose replays a recorded take: Check shows the recorded verdict, Generate fills the grid and lands on the record
//
//   make pages && PLAYWRIGHT_DIR=<dir with node_modules/playwright> node web/scripts/demo-e2e.mjs [web/out]
//
// SHOTS=<dir> saves screenshots there (safelight-<page>-<width>-<theme>.png). Playwright is not a dependency of the
// app: point PLAYWRIGHT_DIR at a folder whose node_modules holds it (CHROMIUM at a browser binary if needed).
import { createServer } from "node:http";
import { mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve(process.argv[2] ?? new URL("../out", import.meta.url).pathname);
const shots = process.env.SHOTS ? resolve(process.env.SHOTS) : null;
if (shots) mkdirSync(shots, { recursive: true });
const require = createRequire(join(resolve(process.env.PLAYWRIGHT_DIR ?? "."), "node_modules/"));
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  console.error("demo-e2e: playwright not found; set PLAYWRIGHT_DIR to a folder with node_modules/playwright");
  process.exit(2);
}

const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".webp": "image/webp", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json", ".txt": "text/plain" };
const server = createServer(async (req, res) => {
  let path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (path.endsWith("/")) path += "index.html";
  for (const candidate of [path, `${path}.html`, `${path}/index.html`]) {
    try {
      const body = await readFile(join(root, candidate));
      res.writeHead(200, { "content-type": TYPES[extname(candidate)] ?? "application/octet-stream" });
      res.end(body);
      return;
    } catch {
      // next candidate
    }
  }
  res.writeHead(404, { "content-type": "text/html" });
  res.end(await readFile(join(root, "404.html")).catch(() => ""));
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${server.address().port}`;

const tape = JSON.parse(await readFile(join(root, "data-tape", "tape.json"), "utf8"));
const recordOfFile = new Map(Object.entries(tape.files).map(([id, file]) => [file, id]));
const byId = new Map(tape.records.map((record) => [record.id, record]));
const served = (id) => ["passed", "review"].includes(byId.get(id)?.outcome) && byId.get(id)?.removed_at == null;

const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});

async function session(width, theme) {
  const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, colorScheme: theme, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const tag = `${width}-${theme}`;
  const errors = [];
  const files = [];
  page.on("console", (message) => {
    if (message.type() === "error" || /Content.Security.Policy|Refused to/i.test(message.text())) errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== origin && !url.protocol.startsWith("data")) errors.push(`request left the site: ${request.url()}`);
    const hit = /^\/data-tape\/(images|thumbs|veils)\/([a-f0-9]+)(?:-medium)?\.webp$/.exec(url.pathname);
    if (hit) {
      const id = recordOfFile.get(hit[2]);
      files.push({ kind: hit[1], id, at: Date.now() });
      check(id && served(id), `${tag}: requested ${url.pathname}, which is no served record's file`);
    }
  });
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) => console.error(`CSP violation: ${event.violatedDirective} ${event.blockedURI}`));
  });
  const shot = async (name) => {
    if (shots) await page.screenshot({ path: join(shots, `safelight-${name}-${tag}.png`), fullPage: false });
  };
  return { context, page, errors, files, shot, tag };
}

for (const width of [1440, 390]) {
  for (const theme of ["light", "dark"]) {
    const { context, page, errors, files, shot, tag } = await session(width, theme);

    // History: every record, a thumbnail for served ones (veils for veiled), a plain mark for the rest.
    await page.goto(`${origin}/history/`);
    await page.waitForSelector("main ul li a[href^='/record/']");
    await page.waitForLoadState("networkidle");
    check((await page.locator("main ul li").count()) === tape.records.length, `${tag}: history lists ${await page.locator("main ul li").count()} of ${tape.records.length}`);
    check((await page.locator("main input[type=checkbox][aria-label^='Select']").count()) === 0, `${tag}: history offers row selection`);
    check((await page.locator(".dh-strip").count()) === 1, `${tag}: no family strip`);
    check((await page.locator(".dh-badge").first().textContent())?.trim() === (tape.provenance.kind === "sample" ? "Sample data" : "Recorded"), `${tag}: wrong tape badge`);
    for (const id of tape.veiled) check(!files.some((file) => file.id === id && file.kind !== "veils"), `${tag}: history fetched a veiled frame's ${files.find((f) => f.id === id && f.kind !== "veils")?.kind}`);
    check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${tag}: history scrolls sideways`);
    await shot("history");

    // A veiled review record: the veil only, until Reveal.
    const veiled = tape.veiled.find((id) => byId.get(id).outcome === "review") ?? tape.veiled[0];
    if (veiled) {
      files.length = 0;
      await page.goto(`${origin}/record/${veiled}/`);
      await page.waitForSelector("figure img");
      await page.waitForLoadState("networkidle");
      check(files.length > 0 && files.every((file) => file.kind === "veils"), `${tag}: the veiled record fetched ${files.map((f) => f.kind).join(",")} before Reveal`);
      await shot("record-veiled");
      await page.getByRole("button", { name: "Reveal" }).click();
      await page.waitForLoadState("networkidle");
      check(files.some((file) => file.kind === "images" && file.id === veiled), `${tag}: Reveal did not load the image`);
    }

    // Blocked records: metadata only, no image element and no file request.
    for (const id of tape.records.filter((record) => !served(record.id)).map((record) => record.id)) {
      files.length = 0;
      await page.goto(`${origin}/record/${id}/`);
      await page.waitForSelector("main [role=group]");
      await page.waitForLoadState("networkidle");
      check((await page.locator("main img, main picture, main canvas, main video").count()) === 0, `${tag}: ${id} renders an image element`);
      check(files.length === 0, `${tag}: ${id} requested ${files.map((f) => f.kind).join(",")}`);
      if (id === "fx-deleted-illegal") await shot("record-deleted");
      if (id === "fx-refused-illegal") await shot("record-refused");
    }

    // Compose: a recorded take, Check, then Generate's replay landing on the record.
    files.length = 0;
    await page.goto(`${origin}/history/`);
    await page.waitForSelector("main ul li");
    await page.getByRole("button", { name: "Compose" }).click();
    const take = tape.takes.includes("fx-review-disagree") ? "fx-review-disagree" : tape.takes[0];
    await page.locator("select#take").selectOption(take);
    await page.getByRole("button", { name: "Check", exact: true }).click();
    await page.waitForTimeout(400);
    await shot("compose");
    await page.getByRole("button", { name: "Generate", exact: true }).click();
    await page.waitForURL(`${origin}/`);
    await page.waitForTimeout(2600);
    await shot("generate-live");
    await page.waitForURL(new RegExp(`/record/${take}/?$`), { timeout: 30_000 });
    await page.waitForLoadState("networkidle");
    check(!files.some((file) => !served(file.id)), `${tag}: the replay fetched a file of an unserved record`);

    // An unserved take (the sample's blocked one, or a recorded refusal) replays as metadata only.
    const unserved = tape.takes.includes("fx-deleted-minor") ? "fx-deleted-minor" : tape.takes.find((id) => !served(id));
    if (unserved) {
      files.length = 0;
      await page.getByRole("button", { name: "Compose" }).click();
      await page.locator("select#take").selectOption(unserved);
      await page.getByRole("button", { name: "Generate", exact: true }).click();
      await page.waitForURL(new RegExp(`/record/${unserved}/?$`), { timeout: 30_000 });
      await page.waitForLoadState("networkidle");
      check(files.length === 0, `${tag}: the unserved replay requested ${files.map((f) => f.kind).join(",")}`);
    }

    // Docs render from the build, with no request beyond the site.
    await page.goto(`${origin}/docs/`);
    await page.waitForSelector("main h1");
    if (width === 1440) await shot("docs");

    check(errors.length === 0, `${tag}: console or CSP errors:\n    ${errors.join("\n    ")}`);
    await context.close();
  }
}

await browser.close();
server.close();
if (failures.length) {
  console.error(`demo-e2e: ${failures.length} failure(s)\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log(`demo-e2e: 1440 and 390 px, light and dark: no console or CSP errors, images for served records only${shots ? `; screenshots in ${shots}` : ""}`);
