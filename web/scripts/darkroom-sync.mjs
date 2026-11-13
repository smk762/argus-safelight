#!/usr/bin/env node
// Keeps safelight in step with argus-darkroom's `dev` HEAD: the wire schema,
// the generated types, the imported docs, and the version the fixture records.
// One sync record, schema/pins.json, holds the commit, the package version at
// that commit and a sha256 per imported file.
//
//   node scripts/darkroom-sync.mjs           regenerate src/lib/generated/darkroom.ts from the committed schema
//   node scripts/darkroom-sync.mjs --check   offline: schema, types, docs, images and fixture all match the record
//   node scripts/darkroom-sync.mjs --pull    network: fetch darkroom at `dev` HEAD, gate it, write it, re-record
//       [--source <git url or path>]         clone from here instead of GitHub
//
// After --pull, `make fixture` re-records the fixture at the new version (`make sync` runs both).

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "json-schema-to-typescript";

import { denylistFromEnv, opsecHits } from "./opsec.mjs";

const web = dirname(dirname(fileURLToPath(import.meta.url)));
const repoRoot = dirname(web);
const pinsPath = join(web, "schema", "pins.json");
const schemaPath = join(web, "schema", "darkroom-wire.schema.json");
const typesPath = join(web, "src", "lib", "generated", "darkroom.ts");
const docsDir = join(web, "content", "darkroom");
const imagesDir = join(web, "public", "docs", "darkroom");
const fixtureDir = join(repoRoot, "fixture");

/** The allowlist: darkroom's public docs. Agent and planning files (CLAUDE.md, AGENTS.md, TODO.md) never go here. */
const DOCS = ["README.md", "spec.md"];
const SCHEMA = "schema/darkroom-wire.schema.json";
const BRANCH = "dev";

const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const rel = (path) => path.slice(repoRoot.length + 1);

/**
 * Pydantic titles every property ("Final Prompt"), which the compiler would
 * turn into a named alias per field. Only a model's own title names a type.
 */
function dropPropertyTitles(node) {
  if (Array.isArray(node)) return node.map(dropPropertyTitles);
  if (node === null || typeof node !== "object") return node;
  const out = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === "title" && typeof value === "string") continue;
    if (key === "default" || key === "enum" || key === "const") out[key] = value;
    // A 2020-12 tuple (`prefixItems`), which the compiler reads only in draft-07's form (`items` as an array).
    else if (key === "prefixItems") out.items = dropPropertyTitles(value);
    else if (key === "properties" || key === "$defs") out[key] = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, dropPropertyTitles(v)]));
    else out[key] = dropPropertyTitles(value);
  }
  return out;
}

/**
 * Darkroom's schema is Pydantic's validation view, where a field with a
 * default may be left out. What safelight reads is the serialized record
 * (`model_dump_json`, and every read is re-validated first), which always
 * carries every field. So every property is required here.
 */
function asSerialized(defs) {
  for (const def of Object.values(defs)) {
    if (def.properties) def.required = Object.keys(def.properties);
  }
  return defs;
}

async function generateTypes(pin, text) {
  const defs = asSerialized(dropPropertyTitles(JSON.parse(text).$defs));
  for (const [name, def] of Object.entries(defs)) def.title = name;
  const rooted = {
    title: "DarkroomWire",
    type: "object",
    additionalProperties: false,
    properties: Object.fromEntries(Object.keys(defs).map((name) => [name, { $ref: `#/$defs/${name}` }])),
    $defs: defs,
  };
  const banner = [
    `// Generated from ${pin.repo}@${pin.commit.slice(0, 7)} (${pin.version}) ${SCHEMA}.`,
    "// Do not edit: run `make sync` (or `npm run darkroom:pull`) to move to darkroom's dev HEAD.",
    "",
  ].join("\n");
  return compile(rooted, "DarkroomWire", { additionalProperties: false, bannerComment: banner, format: true, style: { printWidth: 120 } });
}

/** hatch-vcs's version for a commit, from `git describe`: the tag itself, or the next patch's dev release. */
export function versionFromDescribe(describe) {
  const found = /^v?(\d+)\.(\d+)\.(\d+)-(\d+)-g([0-9a-f]+)$/.exec(describe.trim());
  if (!found) throw new Error(`cannot read a version from git describe: ${describe}`);
  const [, major, minor, patch, distance, sha] = found;
  if (distance === "0") return `${major}.${minor}.${patch}`;
  return `${major}.${minor}.${Number(patch) + 1}.dev${distance}+g${sha}`;
}

/** Relative images a doc references; remote ones (badges) are dropped at render, never fetched. */
function relativeImages(markdown) {
  const found = new Set();
  for (const match of markdown.matchAll(/!\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) found.add(match[1]);
  for (const match of markdown.matchAll(/<img[^>]*\ssrc=["']([^"']+)["']/gi)) found.add(match[1]);
  return [...found].filter((src) => !/^[a-z][a-z0-9+.-]*:|^\/\/|^#/i.test(src)).map((src) => posix.normalize(src.split(/[?#]/)[0]));
}

function gateOrThrow(label, text) {
  const hits = opsecHits(text, denylistFromEnv());
  if (hits.length === 0) return;
  const lines = hits.map((hit) => `  ${label}:${hit.line}: ${hit.kind}: ${hit.match}`);
  throw new Error(`opsec gate refused ${label}; fix it in darkroom, nothing is redacted here:\n${lines.join("\n")}`);
}

async function pull(listed, source) {
  const work = await mkdtemp(join(tmpdir(), "darkroom-sync-"));
  try {
    const git = (...args) => execFileSync("git", ["-C", work, ...args], { maxBuffer: 64 << 20 });
    execFileSync("git", ["clone", "--quiet", "--filter=blob:none", "--no-checkout", "--branch", BRANCH, source ?? `https://github.com/${listed.repo}.git`, work], { stdio: "inherit" });
    const commit = git("rev-parse", "HEAD").toString().trim();
    const version = versionFromDescribe(git("describe", "--tags", "--long", "--match", "v[0-9]*", "HEAD").toString());
    const show = (path) => git("show", `HEAD:${path}`);

    // Gate everything first, so a refusal writes nothing.
    const schemaText = show(SCHEMA).toString();
    gateOrThrow(SCHEMA, schemaText);
    const docs = Object.fromEntries(DOCS.map((path) => [path, show(path).toString()]));
    for (const [path, text] of Object.entries(docs)) gateOrThrow(path, text);
    const images = {};
    for (const [path, text] of Object.entries(docs)) {
      for (const src of relativeImages(text)) images[posix.join(posix.dirname(path), src)] = show(posix.join(posix.dirname(path), src));
    }

    await writeFile(schemaPath, schemaText);
    await rm(docsDir, { recursive: true, force: true });
    await rm(imagesDir, { recursive: true, force: true });
    for (const [path, text] of Object.entries(docs)) {
      await mkdir(dirname(join(docsDir, path)), { recursive: true });
      await writeFile(join(docsDir, path), text);
    }
    for (const [path, bytes] of Object.entries(images)) {
      await mkdir(dirname(join(imagesDir, path)), { recursive: true });
      await writeFile(join(imagesDir, path), bytes);
    }
    const pin = {
      repo: listed.repo,
      branch: BRANCH,
      commit,
      version,
      pypi: listed.pypi,
      schema: { path: SCHEMA, sha256: sha256(schemaText) },
      docs: Object.fromEntries(Object.entries(docs).map(([path, text]) => [path, sha256(text)])),
      images: Object.fromEntries(Object.entries(images).map(([path, bytes]) => [path, sha256(bytes)])),
    };
    console.log(listed.commit === commit ? `darkroom ${BRANCH} is still ${commit.slice(0, 7)} (${version}).` : `darkroom ${BRANCH}: ${listed.commit.slice(0, 7)} -> ${commit.slice(0, 7)} (${version}).`);
    return pin;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

async function listFiles(dir, base = dir) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(path, base)));
    else files.push(posix.normalize(path.slice(base.length + 1).split("\\").join("/")));
  }
  return files.sort();
}

/** Every disagreement between the committed copies, the fixture and the sync record. Reads no network. */
async function check(pin) {
  const problems = [];
  const schemaText = await readFile(schemaPath, "utf8").catch(() => "");
  if (sha256(schemaText) !== pin.schema.sha256) problems.push(`${rel(schemaPath)} is not darkroom's ${pin.schema.path} at ${pin.commit.slice(0, 7)}`);
  else {
    const committed = await readFile(typesPath, "utf8").catch(() => null);
    if (committed !== (await generateTypes(pin, schemaText))) problems.push(`${rel(typesPath)} does not match the schema; run \`npm run darkroom:types\``);
  }

  for (const [label, dir, listed, binary] of [
    ["doc", docsDir, pin.docs, false],
    ["image", imagesDir, pin.images, true],
  ]) {
    const present = await listFiles(dir);
    for (const path of present) if (!(path in listed)) problems.push(`${rel(join(dir, path))} is not in the sync record`);
    for (const [path, hash] of Object.entries(listed)) {
      const data = await readFile(join(dir, path), binary ? undefined : "utf8").catch(() => null);
      if (data === null) problems.push(`${rel(join(dir, path))} is missing`);
      else if (sha256(data) !== hash) problems.push(`${rel(join(dir, path))} is not darkroom's ${label} at ${pin.commit.slice(0, 7)}`);
      else if (!binary) for (const hit of opsecHits(data, denylistFromEnv())) problems.push(`${rel(join(dir, path))}:${hit.line}: opsec: ${hit.kind}: ${hit.match}`);
    }
  }

  const recorded = JSON.parse(await readFile(join(fixtureDir, "darkroom.json"), "utf8").catch(() => "{}"));
  if (recorded.commit !== pin.commit || recorded.version !== pin.version || recorded.repo !== pin.repo) {
    problems.push(`fixture/darkroom.json records ${recorded.repo ?? "?"}@${recorded.commit?.slice(0, 7) ?? "?"} (${recorded.version ?? "?"}), not ${pin.repo}@${pin.commit.slice(0, 7)} (${pin.version}); run \`make fixture\``);
  }
  for (const name of await listFiles(join(fixtureDir, "records"))) {
    const record = JSON.parse(await readFile(join(fixtureDir, "records", name), "utf8"));
    if (record.darkroom_version !== pin.version) problems.push(`fixture/records/${name} says darkroom ${record.darkroom_version}, not ${pin.version}; run \`make fixture\``);
  }
  return problems;
}

async function main() {
  const args = process.argv.slice(2);
  const mode = args.find((arg) => arg.startsWith("--") && arg !== "--source");
  if (mode !== undefined && mode !== "--check" && mode !== "--pull") throw new Error(`unknown option ${mode}`);
  const sourceAt = args.indexOf("--source");
  const source = sourceAt >= 0 ? args[sourceAt + 1] : undefined;

  const pins = JSON.parse(await readFile(pinsPath, "utf8"));
  if (mode === "--check") {
    const problems = await check(pins.darkroom);
    if (problems.length > 0) {
      for (const problem of problems) console.error(problem);
      console.error("Run `make sync` to move everything to darkroom's dev HEAD, or the command named above.");
      process.exit(1);
    }
    console.log(`Schema, types, docs and fixture all match darkroom ${pins.darkroom.version} @ ${pins.darkroom.commit.slice(0, 7)}.`);
    return;
  }

  if (mode === "--pull") {
    pins.darkroom = await pull(pins.darkroom, source);
    await writeFile(pinsPath, `${JSON.stringify(pins, null, 2)}\n`);
  }
  const text = await readFile(schemaPath, "utf8");
  if (sha256(text) !== pins.darkroom.schema.sha256) throw new Error(`${rel(schemaPath)} is not the file in the sync record; run with --pull`);
  await mkdir(dirname(typesPath), { recursive: true });
  await writeFile(typesPath, await generateTypes(pins.darkroom, text));
  console.log(`Wrote ${rel(typesPath)}.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
