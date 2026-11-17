// Post-build check for the static demo (`make pages`): the export is pure static files, and the tape holds nothing
// it must not.
//
//   - every page carries the hash-based CSP <meta>, and _headers is there for the host
//   - no page HTML points at darkroom (its port, :8106); the imported docs may name it in prose, not in a link
//   - the tape is in the export, with every file it lists (and the veil of every veiled frame)
//   - only a served record (passed or review, image not removed) has a file; there is no image, thumbnail or veil
//     on disk that the tape does not list, so nothing of a deleted, omitted, refused or failed record can be fetched
//   - a blocked record (critical, judged illegal anywhere, or minor-exposed) shows "[withheld: …]" for its prompts,
//     in tape.json and in its take, and SingGuard's explanations and NudeNet's classes on it are withheld too
//   - no home or server path, private address or email address anywhere in the tape's JSON
//
//   node scripts/check-static.mjs [outDir]   (run by `npm run build:pages`)
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { denylistFromEnv, opsecHits } from "./opsec.mjs";

const out = process.argv[2] ?? "out";
const tapeDir = (process.env.NEXT_PUBLIC_SAFELIGHT_TAPE_URL || "/data-tape").replace(/^\/+|\/+$/g, "");
const problems = [];
const list = (dir) => (existsSync(dir) ? readdirSync(dir, { withFileTypes: true, recursive: true }).filter((e) => e.isFile()).map((e) => join(e.parentPath, e.name)) : []);
const files = list(out);

for (const file of files.filter((f) => f.endsWith(".html"))) {
  const html = readFileSync(file, "utf8");
  if (!html.includes('http-equiv="Content-Security-Policy"')) problems.push(`${file} has no CSP <meta>`);
  const port = file.startsWith(join(out, "docs")) ? /(?:href|src)="[^"]*:8106/ : /:8106/;
  if (port.test(html)) problems.push(`${file} references darkroom (:8106)`);
}
if (!existsSync(join(out, "_headers"))) problems.push("no _headers file");

const SERVED = new Set(["passed", "review"]);
const WITHHELD = /^\[withheld: [^\]]*\]$/;
const cellsOf = (record) => {
  const guard = record.guard ?? {};
  const pairs = [...Object.values(guard.scans ?? {}), ...Object.values(guard.input?.scans ?? {})];
  return [...Object.values(guard.preflight ?? {}), ...pairs.flatMap((pair) => Object.values(pair ?? {}))].filter(Boolean);
};
// The same rule as scripts/record_tape.py's blocked().
const blocked = (record) => {
  const reasons = (record.outcome_reason ?? "").replace("input image:", "").split(",").map((part) => part.trim());
  return Boolean(record.critical) || reasons.includes("minor-exposed") || cellsOf(record).some((cell) => cell.state === "illegal");
};
const explained = (cell) => cell?.result?.explanation && cell.result.explanation !== "[withheld]";

const root = join(out, tapeDir);
const tapeJson = join(root, "tape.json");
if (!existsSync(tapeJson)) problems.push(`no tape at ${tapeJson}`);
else {
  const tape = JSON.parse(readFileSync(tapeJson, "utf8"));
  const byId = new Map(tape.records.map((record) => [record.id, record]));
  const listed = new Set();
  for (const [id, file] of Object.entries(tape.files)) {
    const record = byId.get(id);
    if (!record) problems.push(`files names ${id}, which is not on the tape`);
    else if (!SERVED.has(record.outcome) || record.removed_at != null) problems.push(`${id} is ${record.outcome}${record.removed_at ? " (removed)" : ""} but has an image file`);
    for (const part of [`images/${file}.webp`, `thumbs/${file}.webp`]) {
      listed.add(part);
      if (!existsSync(join(root, part))) problems.push(`tape file missing: ${part}`);
    }
    if (tape.veiled.includes(id)) {
      listed.add(`veils/${file}-medium.webp`);
      if (!existsSync(join(root, `veils/${file}-medium.webp`))) problems.push(`tape file missing: veils/${file}-medium.webp`);
    }
  }
  for (const sub of ["images", "thumbs", "veils"]) {
    for (const path of list(join(root, sub))) {
      const rel = `${sub}/${path.slice(join(root, sub).length + 1)}`;
      if (!listed.has(rel)) problems.push(`${rel} is on disk but the tape lists no served record for it`);
    }
  }
  for (const record of tape.records) {
    if (!blocked(record)) continue;
    const { request } = record;
    for (const key of ["user_prompt", "final_prompt"]) if (!WITHHELD.test(request[key] ?? "")) problems.push(`${record.id} is blocked but its ${key} is not withheld`);
    if (request.expanded_prompt != null && !WITHHELD.test(request.expanded_prompt)) problems.push(`${record.id} is blocked but its expanded_prompt is not withheld`);
    if (cellsOf(record).some(explained)) problems.push(`${record.id} is blocked but keeps SingGuard's explanations`);
    for (const nude of [record.guard?.nudenet, record.guard?.input?.nudenet]) {
      if (Object.keys(nude?.labels ?? {}).length > 0 || (nude?.detections ?? []).length > 0) problems.push(`${record.id} is blocked but keeps NudeNet's classes (labels or detections)`);
    }
    if (tape.takes.includes(record.id)) {
      const take = readFileSync(join(root, "takes", `${record.id}.json`), "utf8");
      for (const event of JSON.parse(take).events) {
        const [name, data] = event;
        if (name === "preflight" && !WITHHELD.test(data.user_prompt)) problems.push(`take ${record.id}: the preflight event keeps the prompt`);
        if ((name === "scan" || name === "input_scan") && explained(data.cell)) problems.push(`take ${record.id}: a scan keeps SingGuard's explanation`);
        if (name === "complete" && !WITHHELD.test(data.record.request.user_prompt)) problems.push(`take ${record.id}: the complete event keeps the prompt`);
      }
    }
  }
  for (const id of tape.takes) if (!existsSync(join(root, "takes", `${id}.json`))) problems.push(`tape file missing: takes/${id}.json`);
  const denylist = denylistFromEnv();
  for (const path of list(root).filter((f) => f.endsWith(".json"))) {
    for (const hit of opsecHits(readFileSync(path, "utf8"), denylist)) problems.push(`${path}:${hit.line}: ${hit.kind} (${hit.match})`);
  }
}

if (problems.length) {
  console.error(`check-static: ${problems.length} problem(s)\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log(`check-static: ${files.length} files, pure static, CSP on every page, tape in ${tapeDir}/ with images for served records only`);
