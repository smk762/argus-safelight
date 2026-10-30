#!/usr/bin/env node
/**
 * A small mock of argus-darkroom's API, serving the committed fixture, so the
 * UI can be worked on without a GPU. Node only, no dependencies.
 *
 *   node scripts/mock_darkroom.mjs        # :8106
 *
 * Generation is pretend: a solid-colour PNG from the seed, a step bar, and
 * verdicts chosen by markers in the prompt so every outcome can be reached:
 *
 *   [flag]       with-prompt scan flagged (rule B) under the enforcing policy -> review, scans disagree
 *   [flag-both]  both scans flagged                                            -> review, scans agree
 *   [illegal]    with-prompt scan hits an illegal rule                         -> deleted
 *   [unchecked]  the enforcing with-prompt scan fails                          -> deleted (fails closed)
 *   [exposed]    NudeNet 0.41                                                  -> omitted (SFW) or blurred (NSFW)
 *   [nonude]     NudeNet does not answer                                       -> omitted (SFW) or blurred (NSFW)
 *   [minor]      a MiVOLO estimate of 17 with NudeNet 0.45                     -> deleted, minor-exposed
 *   [noage]      no age check on this record
 *   [refuse]     pre-flight flags a non-illegal rule                           -> refused (SFW) or a warning (NSFW)
 *   [refuse-illegal]  pre-flight hits an illegal rule                          -> refused under any mode
 *   [preflight-unchecked]  the pre-flight check fails                          -> refused, unchecked
 *   [fail]       ComfyUI fails mid-way                                         -> failed
 *
 * Environment: MOCK_PORT (8106), MOCK_NSFW_ALLOWED (1), MOCK_DEVMODE (1),
 * MOCK_OLLAMA (1), MOCK_SINGGUARD (1), MOCK_NUDENET (1), MOCK_AGE (1),
 * MOCK_STEP_MS (60), MOCK_SCAN_MS (350).
 */

import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "fixture");
const flag = (name, fallback = "1") => (process.env[name] ?? fallback) !== "0" && (process.env[name] ?? fallback) !== "";
const PORT = Number(process.env.MOCK_PORT || 8106);
const NSFW_ALLOWED = flag("MOCK_NSFW_ALLOWED");
const DEVMODE = flag("MOCK_DEVMODE");
const OLLAMA = flag("MOCK_OLLAMA");
const SINGGUARD = flag("MOCK_SINGGUARD");
const NUDENET = flag("MOCK_NUDENET");
const AGE = flag("MOCK_AGE");
const STEP_MS = Number(process.env.MOCK_STEP_MS || 60);
const SCAN_MS = Number(process.env.MOCK_SCAN_MS || 350);
const VERSION = "0.0.0+mock";
const MODEL = "SingGuard-4b";
const SIZE = 512;

const policyFile = JSON.parse(readFileSync(join(ROOT, "policies.json"), "utf8"));
const models = JSON.parse(readFileSync(join(ROOT, "models.json"), "utf8"));
const POLICIES = new Map(policyFile.policies.map((p) => [p.name, p]));
const DEFAULT_POLICY = NSFW_ALLOWED ? policyFile.default : "default";

/** @type {Map<string, object>} */
const records = new Map();
/** @type {Map<string, Buffer>} */
const images = new Map();
let comfyHistory = 0;
let generating = false;

function loadFixture() {
  records.clear();
  images.clear();
  for (const name of readdirSync(join(ROOT, "records")).sort()) {
    if (!name.endsWith(".json")) continue;
    const record = JSON.parse(readFileSync(join(ROOT, "records", name), "utf8"));
    records.set(record.id, record);
  }
  for (const name of readdirSync(join(ROOT, "images"))) {
    if (name.endsWith(".png")) images.set(name.slice(0, -4), readFileSync(join(ROOT, "images", name)));
  }
}
loadFixture();

// ---------------------------------------------------------------------------
// Policy helpers

const modeOf = (name) => POLICIES.get(name)?.mode ?? (name === "default" || name.startsWith("sfw-") ? "sfw" : "nsfw");
const illegalRules = (name) => POLICIES.get(name)?.illegal_rules ?? [];
const ruleName = (rule) => `${rule.code}. ${rule.name}`;
const firstIllegal = (name) => (illegalRules(name)[0] ? ruleName(illegalRules(name)[0]) : null);
const nonIllegalRule = (name) => (name === "default" ? "A. Sexual Content Risk" : "B. Real-World Crimes & Public Safety");

function guard(safe, rules, explanation, thinking, fast) {
  const out = { safe, rules, explanation, model: MODEL, thinking };
  if (fast != null) {
    out.fast_verdict = fast;
    out.fast_rule = fast === "unsafe" ? rules[0] ?? null : null;
  }
  return out;
}
const safeCell = (thinking) => ({ state: "safe", result: guard(true, [], "No rule matched.", thinking === "cascade" ? "fast" : thinking, thinking === "cascade" ? "safe" : null), error: null });
const flaggedCell = (rule, why, thinking) => ({ state: "flagged", result: guard(false, [rule], why, thinking === "cascade" ? "slow" : thinking, thinking === "cascade" ? "unsafe" : null), error: null });
const illegalCell = (rule, why, thinking) => ({ ...flaggedCell(rule, why, thinking), state: "illegal" });
const uncheckedCell = (error) => ({ state: "unchecked", result: null, error });

// ---------------------------------------------------------------------------
// Prompt assembly and pre-flight

function assemble(body) {
  const user = String(body.user_prompt ?? "").trim();
  const negative = String(body.negative_prompt ?? "").trim();
  const expand = Boolean(body.expand) && OLLAMA;
  const expanded = expand ? `${user}, finely detailed, natural light, 35mm, shallow depth of field` : null;
  const triggers = [];
  for (const lora of body.loras ?? []) {
    for (const word of lora.trigger_words ?? []) triggers.push(word);
  }
  const final = [expanded ?? user, ...triggers].filter(Boolean).join(", ");
  return { user, negative, expanded, final, expansion: expanded ? { model: "qwen2.5:7b", system_prompt_sha256: "ab".repeat(32) } : null };
}

const framed = (final, negative) => `Image generation request.\nPrompt: ${final}\nNegative prompt (what the image must not show): ${negative}`;

function preflight(body) {
  const { user, negative, expanded, final } = assemble(body);
  const enforcing = body.enforcing_policy || DEFAULT_POLICY;
  const advisory = (body.advisory_policies ?? []).filter((name) => name !== enforcing && POLICIES.has(name));
  const thinking = body.thinking || "cascade";
  const mode = modeOf(enforcing);
  const names = [enforcing, ...advisory];
  const results = {};
  for (const name of names) {
    if (!SINGGUARD || user.includes("[preflight-unchecked]")) {
      results[name] = uncheckedCell(SINGGUARD ? "SingGuard timed out after 90s" : "SingGuard unreachable");
    } else if (user.includes("[refuse-illegal]")) {
      const rule = firstIllegal(name);
      results[name] = rule
        ? illegalCell(rule, `The request asks for what rule ${rule.slice(0, 1)} forbids under this policy.`, thinking)
        : flaggedCell(nonIllegalRule(name), "Sexual content is requested; the default rules do not separate the illegal from the adult.", thinking);
    } else if (user.includes("[refuse]")) {
      results[name] = name === enforcing ? flaggedCell(nonIllegalRule(name), `The request matches rule ${nonIllegalRule(name).slice(0, 1)} as this policy words it.`, thinking) : safeCell(thinking);
    } else {
      results[name] = safeCell(thinking);
    }
  }
  let outcome = "ok";
  let refusal = null;
  const warnings = [];
  for (const name of names) {
    const cell = results[name];
    if (cell.state === "illegal") {
      outcome = "refused";
      refusal ??= { policy: name, reason: cell.result.rules[0].slice(0, 1), rule: cell.result.rules[0], explanation: cell.result.explanation };
    }
  }
  const own = results[enforcing];
  if (outcome !== "refused" && own.state === "unchecked") {
    outcome = "refused";
    refusal = { policy: enforcing, reason: "unchecked", rule: null, explanation: own.error };
  }
  if (outcome !== "refused" && own.state === "flagged") {
    if (mode === "sfw") {
      outcome = "refused";
      refusal = { policy: enforcing, reason: own.result.rules[0].slice(0, 1), rule: own.result.rules[0], explanation: own.result.explanation };
    } else {
      outcome = "warning";
      warnings.push({ policy: enforcing, rule: own.result.rules[0], explanation: own.result.explanation });
    }
  }
  return {
    mode,
    enforcing_policy: enforcing,
    advisory_policies: advisory,
    thinking,
    user_prompt: user,
    expanded_prompt: expanded,
    final_prompt: final,
    negative_prompt: negative,
    framed_text: framed(final, negative),
    outcome,
    refusal,
    warnings,
    results,
  };
}

// ---------------------------------------------------------------------------
// A PNG from a seed: one flat colour. sha256 follows the seed, like a real render.

function crcChunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(Buffer.concat([typeBuf, data])) >>> 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function seedColour(seed) {
  const h = ((seed * 2654435761) % 360 + 360) % 360;
  const s = 0.45;
  const l = 0.42;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [r, g, b].map((v) => Math.round((v + m) * 255));
}

function renderPng(seed, width, height) {
  const [r, g, b] = seedColour(seed);
  const row = Buffer.alloc(1 + width * 3);
  for (let i = 0; i < width; i += 1) {
    row[1 + i * 3] = r;
    row[2 + i * 3] = g;
    row[3 + i * 3] = b;
  }
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    crcChunk("IHDR", ihdr),
    crcChunk("IDAT", zlib.deflateSync(raw)),
    crcChunk("IEND", Buffer.alloc(0)),
  ]);
}

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

// ---------------------------------------------------------------------------
// Generation

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const newId = () => `gen-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

function requestBlock(body, pre, seed) {
  const sampling = body.sampling ?? {};
  const checkpoint = models.checkpoints.find((c) => c.name === body.checkpoint) ?? models.checkpoints[0];
  const loras = (body.loras ?? []).flatMap((l) => {
    const ref = models.loras.find((m) => m.name === l.name);
    return ref ? [{ name: ref.name, sha256: ref.sha256, weight: Number(l.weight ?? 1), trigger_words: l.trigger_words ?? [] }] : [];
  });
  return {
    mode: pre.mode,
    user_prompt: pre.user_prompt,
    expanded_prompt: pre.expanded_prompt,
    final_prompt: pre.final_prompt,
    negative_prompt: pre.negative_prompt,
    expansion: pre.expanded_prompt ? { model: "qwen2.5:7b", system_prompt_sha256: "ab".repeat(32) } : null,
    seed,
    sampling: {
      sampler: sampling.sampler ?? "dpmpp_2m",
      scheduler: sampling.scheduler ?? "karras",
      steps: Number(sampling.steps ?? 28),
      cfg: Number(sampling.cfg ?? 5.5),
      clip_skip: Number(sampling.clip_skip ?? 1),
      width: Number(sampling.width ?? SIZE),
      height: Number(sampling.height ?? SIZE),
    },
    checkpoint,
    vae: null,
    loras,
    workflow_sha256: "5b".repeat(32),
    engine: "comfyui",
    engine_version: "0.3.60",
  };
}

function baseRecord(id, outcome, reason, critical, request, guardBlock, image, error = null) {
  return {
    record_version: "1.0",
    id,
    created_at: new Date().toISOString(),
    darkroom_version: VERSION,
    outcome,
    outcome_reason: reason,
    critical,
    removed_at: null,
    error,
    request,
    guard: guardBlock,
    image,
  };
}

async function generate(body, send) {
  const pre = preflight(body);
  const enforcing = pre.enforcing_policy;
  const names = [enforcing, ...pre.advisory_policies];
  const thinking = pre.thinking;
  const seed = Number.isInteger(body.seed) && body.seed >= 0 ? body.seed : Math.floor(Math.random() * 2 ** 32);
  const nsfwThreshold = typeof body.nsfw_threshold === "number" ? body.nsfw_threshold : 0.2;
  const request = requestBlock(body, pre, seed);
  const guardBase = { enforcing_policy: enforcing, advisory_policies: pre.advisory_policies, thinking, preflight: pre.results, scans: {}, nudenet: null, age: null };
  const id = newId();
  const user = pre.user_prompt;

  send("preflight", pre);
  if (pre.outcome === "refused") {
    const critical = pre.results[pre.refusal.policy]?.state === "illegal";
    const record = baseRecord(id, "refused", pre.refusal.reason, critical, request, guardBase, null);
    records.set(id, record);
    send("complete", { record });
    return;
  }

  await sleep(STEP_MS * 3);
  send("queued", { prompt_id: `comfy-${id}`, position: 0 });
  comfyHistory += 1;
  const total = request.sampling.steps;
  for (let step = 1; step <= total; step += 1) {
    await sleep(STEP_MS);
    if (user.includes("[fail]") && step === Math.ceil(total / 2)) {
      const message = "ComfyUI: websocket closed before the image arrived";
      const record = baseRecord(id, "failed", message, false, request, guardBase, null, message);
      records.set(id, record);
      send("error", { detail: message, record_id: id });
      send("complete", { record });
      return;
    }
    send("progress", { step, total });
  }

  const png = renderPng(seed, request.sampling.width, request.sampling.height);
  comfyHistory -= 1; // darkroom clears its prompt from ComfyUI's history once it has the bytes
  const image = { sha256: sha256(png), phash: "0000000000000000", width: request.sampling.width, height: request.sampling.height, path: null };

  const scans = {};
  for (const name of names) scans[name] = { isolated: null, with_prompt: null };
  const cellFor = (name, context) => {
    if (!SINGGUARD) return uncheckedCell("SingGuard unreachable");
    const own = name === enforcing;
    if (user.includes("[illegal]") && context === "with_prompt") {
      const rule = firstIllegal(name);
      if (rule) return illegalCell(rule, `[Step 1] Alone the image is unremarkable. [Step 2] Read with the prompt it matches rule ${rule.slice(0, 1)} under this policy.`, thinking);
      return flaggedCell(nonIllegalRule(name), "Sexual content; the default rules do not separate consent.", thinking);
    }
    if (user.includes("[unchecked]") && own && context === "with_prompt") return uncheckedCell("SingGuard timed out after 90s");
    if (user.includes("[flag-both]") && own) return flaggedCell(nonIllegalRule(name), `Rule ${nonIllegalRule(name).slice(0, 1)} matches with or without the prompt.`, thinking);
    if (user.includes("[flag]") && own && context === "with_prompt") {
      return flaggedCell(nonIllegalRule(name), `[Step 1] The image alone passes. [Step 2] Read with the prompt it matches rule ${nonIllegalRule(name).slice(0, 1)}.`, thinking);
    }
    return safeCell(thinking);
  };
  for (const name of names) {
    for (const context of ["isolated", "with_prompt"]) {
      await sleep(SCAN_MS);
      const cell = cellFor(name, context);
      scans[name][context] = cell;
      send("scan", { policy: name, context, cell });
    }
  }

  const exposed = user.includes("[minor]") ? 0.45 : user.includes("[exposed]") ? 0.41 : 0.02;
  const nudenetDown = !NUDENET || user.includes("[nonude]");
  // NSFW keeps a block with no score and blur on when NudeNet did not answer;
  // SFW records null and the outcome says sfw-unchecked.
  const nudenet = nudenetDown
    ? pre.mode === "nsfw"
      ? { exposed_score: null, labels: {}, threshold: nsfwThreshold, blur: true }
      : null
    : { exposed_score: exposed, labels: exposed >= 0.2 ? { FEMALE_BREAST_EXPOSED: exposed } : {}, threshold: nsfwThreshold, blur: pre.mode === "nsfw" && exposed >= nsfwThreshold };
  const ageBlock = !AGE || user.includes("[noage]")
    ? null
    : user.includes("[minor]")
      ? { source: "mivolo", faces: [{ age_estimate_years: 24, bbox: [120, 90, 300, 330] }, { age_estimate_years: 17, bbox: [160, 90, 340, 330] }], minor_exposed: true }
      : { source: "mivolo", faces: [{ age_estimate_years: 20 + (seed % 40), bbox: [120, 90, 300, 330] }], minor_exposed: false };

  const cells = Object.values(scans).flatMap((pair) => [pair.isolated, pair.with_prompt]);
  let outcome = "passed";
  let reason = null;
  let critical = false;
  const illegal = Object.entries(scans).flatMap(([name, pair]) => [["isolated", pair.isolated], ["with_prompt", pair.with_prompt]].filter(([, c]) => c.state === "illegal").map(([ctx, c]) => ({ name, ctx, c })));
  if (illegal.length > 0) {
    outcome = "deleted";
    reason = illegal[0].c.result.rules[0].slice(0, 1);
    critical = true;
  } else if (ageBlock?.minor_exposed && exposed >= 0.2) {
    outcome = "deleted";
    reason = "minor-exposed";
    critical = true;
  } else if (scans[enforcing].isolated.state === "unchecked" || scans[enforcing].with_prompt.state === "unchecked") {
    outcome = "deleted";
    reason = "unchecked";
  } else if (pre.mode === "sfw" && nudenetDown) {
    outcome = "omitted";
    reason = "sfw-unchecked";
  } else if (pre.mode === "sfw" && exposed >= 0.2) {
    outcome = "omitted";
    reason = "sfw-exposed";
  } else if (cells.some((c) => c.state === "flagged")) {
    outcome = "review";
    reason = cells.find((c) => c.state === "flagged").result.rules[0].slice(0, 1);
  }
  const served = outcome === "passed" || outcome === "review";
  if (served) {
    images.set(id, png);
    image.path = `${id}.png`;
  }
  const record = baseRecord(id, outcome, reason, critical, request, { ...guardBase, scans, nudenet, age: ageBlock }, image);
  records.set(id, record);
  send("complete", { record });
}

// ---------------------------------------------------------------------------
// Archive: a stored zip, written by hand.

function zipStore(entries) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const crc = zlib.crc32(data) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x21, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    parts.push(local, nameBuf, data);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(0, 10);
    entry.writeUInt16LE(0, 12);
    entry.writeUInt16LE(0x21, 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(nameBuf.length, 28);
    entry.writeUInt16LE(0, 30);
    entry.writeUInt16LE(0, 32);
    entry.writeUInt16LE(0, 34);
    entry.writeUInt16LE(0, 36);
    entry.writeUInt32LE(0, 38);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBuf);
    offset += local.length + nameBuf.length + data.length;
  }
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, centralBuf, end]);
}

// ---------------------------------------------------------------------------
// HTTP

function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) });
  res.end(data);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const sorted = () => [...records.values()].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

const server = createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  try {
    if (req.method === "GET" && path === "/health") {
      return json(res, 200, {
        version: VERSION,
        mock: true,
        backends: { comfyui: true, ollama: OLLAMA, singguard: SINGGUARD, nudenet: NUDENET, age: AGE },
        policies: [...POLICIES.keys()],
        default_policy: DEFAULT_POLICY,
        thinking: "cascade",
        nsfw_allowed: NSFW_ALLOWED,
        sfw_available: NUDENET,
        devmode: DEVMODE,
        generating,
      });
    }
    if (req.method === "GET" && path === "/policies") {
      return json(res, 200, {
        default: DEFAULT_POLICY,
        policies: policyFile.policies.map((p) => ({ ...p, enforceable: p.mode === "sfw" ? NUDENET : NSFW_ALLOWED })),
      });
    }
    if (req.method === "GET" && path === "/models") return json(res, 200, models);
    if (req.method === "POST" && path === "/preflight") {
      const body = await readBody(req);
      const enforcing = body.enforcing_policy || DEFAULT_POLICY;
      if (!POLICIES.has(enforcing)) return json(res, 400, { detail: `unknown policy ${enforcing}` });
      if (modeOf(enforcing) === "nsfw" && !NSFW_ALLOWED) return json(res, 400, { detail: `${enforcing} is an NSFW policy and the server was not started with --allow-nsfw` });
      return json(res, 200, preflight(body));
    }
    if (req.method === "POST" && path === "/generate/stream") {
      const body = await readBody(req);
      const enforcing = body.enforcing_policy || DEFAULT_POLICY;
      if (!POLICIES.has(enforcing)) return json(res, 400, { detail: `unknown policy ${enforcing}` });
      if (modeOf(enforcing) === "nsfw" && !NSFW_ALLOWED) return json(res, 400, { detail: `${enforcing} is an NSFW policy and the server was not started with --allow-nsfw` });
      if (modeOf(enforcing) === "sfw" && !NUDENET) return json(res, 400, { detail: "SFW generation needs a NudeNet server (NUDENET_URL is empty)" });
      if (!SINGGUARD) return json(res, 503, { detail: "SingGuard is unreachable; darkroom never runs unguarded" });
      if (generating) return json(res, 409, { detail: "a generation is already running" });
      generating = true;
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
      const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      try {
        await generate(body, send);
      } catch (error) {
        send("error", { detail: String(error?.message ?? error) });
      } finally {
        generating = false;
        res.end();
      }
      return;
    }
    if (req.method === "GET" && path === "/records") {
      const outcome = url.searchParams.get("outcome");
      const mode = url.searchParams.get("mode");
      const page = Math.max(1, Number(url.searchParams.get("page") || 1));
      const pageSize = Math.min(500, Math.max(1, Number(url.searchParams.get("page_size") || 50)));
      const all = sorted().filter((r) => (!outcome || r.outcome === outcome) && (!mode || r.request.mode === mode));
      return json(res, 200, { records: all.slice((page - 1) * pageSize, page * pageSize), total: all.length, page, page_size: pageSize });
    }
    const recordMatch = path.match(/^\/record\/([^/]+)$/);
    if (recordMatch) {
      const id = decodeURIComponent(recordMatch[1]);
      const record = records.get(id);
      if (!record) return json(res, 404, { detail: "no such record", id });
      if (req.method === "GET") return json(res, 200, record);
      if (req.method === "DELETE") {
        images.delete(id);
        record.removed_at = new Date().toISOString();
        if (record.image) record.image.path = null;
        return json(res, 200, record);
      }
    }
    const imageMatch = path.match(/^\/image\/([^/]+)$/);
    if (req.method === "GET" && imageMatch) {
      const id = decodeURIComponent(imageMatch[1]);
      const png = images.get(id);
      if (!png) return json(res, 404, { detail: records.has(id) ? "this record has no image" : "no such record", id });
      res.writeHead(200, { "Content-Type": "image/png", "Content-Length": png.length, "Cache-Control": "no-store" });
      return res.end(png);
    }
    if (req.method === "GET" && path === "/archive") {
      const entries = [];
      for (const record of sorted()) entries.push({ name: `records/${record.id}.json`, data: Buffer.from(JSON.stringify(record, null, 2) + "\n") });
      for (const [id, png] of images) entries.push({ name: `images/${id}.png`, data: png });
      const zip = zipStore(entries);
      res.writeHead(200, { "Content-Type": "application/zip", "Content-Disposition": 'attachment; filename="darkroom-archive.zip"', "Content-Length": zip.length });
      return res.end(zip);
    }
    if (req.method === "POST" && path === "/purge") {
      if (!DEVMODE) return json(res, 404, { detail: "Not Found" });
      if (generating) return json(res, 409, { detail: "a generation is running" });
      const body = await readBody(req);
      if (body?.confirm !== "purge") return json(res, 400, { detail: 'the body must be {"confirm": "purge"}' });
      const counts = { records: records.size, images: images.size, comfyui_history: comfyHistory };
      records.clear();
      images.clear();
      comfyHistory = 0;
      return json(res, 200, counts);
    }
    if (req.method === "POST" && path === "/mock/reset") {
      loadFixture();
      return json(res, 200, { records: records.size, images: images.size });
    }
    return json(res, 404, { detail: "Not Found" });
  } catch (error) {
    console.error(error);
    if (!res.headersSent) json(res, 500, { detail: String(error?.message ?? error) });
    else res.end();
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`mock darkroom on http://0.0.0.0:${PORT}  records=${records.size} images=${images.size} nsfw_allowed=${NSFW_ALLOWED} devmode=${DEVMODE}`);
});
