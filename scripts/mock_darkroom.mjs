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
 * With an input image (`init_image`, image-to-image or inpainting), the input gets its own scan first, one
 * `input_scan` event per cell, and goes on only if it passes:
 *
 *   [input-exposed]  NudeNet 0.41 on the input                                 -> refused "input image: sfw-exposed" (SFW); passes under NSFW
 *   [input-illegal]  the input's isolated scan hits an illegal rule            -> refused "input image: <policy>:<rule>", critical
 *
 * Markers combine. `[illegal] [minor]` under an adult policy is deleted with both reasons in `outcome_reason`.
 *
 * Workflows are chosen as darkroom chooses them, by the checkpoint's family (its folder) and the LoRA count, from
 * `workflows` in fixture/models.json. A generation darkroom would refuse is a 400 with darkroom's wording: a checkpoint
 * with no template, a LoRA count none renders, or a negative prompt, guidance or clip skip above 2 with no slot.
 * `/preflight` does not check, as darkroom's does not. An input image or mask that darkroom would not decode is a 400 too
 * (format, 16 MiB, 4096 px, the mask's size, a mask with nothing white); the mock reads sizes from the file headers
 * and ignores EXIF orientation. It decodes a PNG mask (8-bit, not interlaced) to measure it as darkroom does; any
 * other mask gets a pretend `masked_fraction` of 0.5.
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
// The darkroom version the fixture was recorded against (`make fixture`, from web/schema/pins.json).
const VERSION = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "fixture", "darkroom.json"), "utf8")).version;
const MODEL = "SingGuard-4b";
const SIZE = 512;
const MAX_PAGE = 200;

const policyFile = JSON.parse(readFileSync(join(ROOT, "policies.json"), "utf8"));
const models = JSON.parse(readFileSync(join(ROOT, "models.json"), "utf8"));
const POLICIES = new Map(policyFile.policies.map((p) => [p.name, p]));
const DEFAULT_POLICY = NSFW_ALLOWED ? policyFile.default : "default";

/** @type {Map<string, object>} */
const records = new Map();

const familyOf = (checkpoint) => {
  const [head, ...rest] = String(checkpoint).split("/");
  return rest.length > 0 && head ? head : null;
};

const MODE_KIND = { txt2img: "workflow", img2img: "image-to-image workflow", inpaint: "inpainting workflow" };
const requestMode = (body) => (body.init_image ? (body.init_image.mask_base64 ? "inpaint" : "img2img") : "txt2img");

/** The template darkroom's `WorkflowSet.select` picks, by family, LoRA count and mode, or the 400 it answers with. */
function chooseWorkflow(body) {
  const name = String(body.checkpoint ?? "");
  if (!models.checkpoints.some((checkpoint) => checkpoint.name === name)) return { error: `checkpoint ${JSON.stringify(name)} not found under the models root` };
  const family = familyOf(name);
  const count = (body.loras ?? []).length;
  const mode = requestMode(body);
  const fits = models.workflows.filter((workflow) => (workflow.family === null || workflow.family === family) && (workflow.mode ?? "txt2img") === mode);
  const workflow = fits.find((candidate) => candidate.loras === count);
  if (!workflow) {
    if (family === null && models.workflows.every((candidate) => candidate.family !== null)) {
      return { error: `checkpoint ${JSON.stringify(name)} is not in a family folder (checkpoints/<family>/...), so no workflow can be chosen for it` };
    }
    const counts = [...new Set(fits.map((candidate) => candidate.loras))].sort((a, b) => a - b);
    const offered = counts.length ? `it renders with ${counts.join(", ")} LoRA(s)` : `it has no ${MODE_KIND[mode]}`;
    return { error: `no ${MODE_KIND[mode]} renders ${family ? `the '${family}' family` : "this checkpoint"} with ${count} LoRA(s): ${offered}` };
  }
  const slots = new Set(workflow.slots);
  const sampling = body.sampling ?? {};
  if (String(body.negative_prompt ?? "").trim() && !slots.has("$negative")) return { error: "this run has a negative prompt but the workflow has no $negative slot" };
  if (sampling.guidance != null && !slots.has("$guidance")) return { error: "this run sets guidance but the workflow has no $guidance slot" };
  if (sampling.guidance == null && slots.has("$guidance")) return { error: "the workflow uses $guidance but this run has no value for it" };
  if (Number(sampling.clip_skip ?? 1) > 2 && !slots.has("$clip_skip")) return { error: "this run sets clip_skip above 2 but the workflow has no $clip_skip slot" };
  return { workflow };
}

const MAX_INPUT_BYTES = 16 * 1024 * 1024;
const MAX_INPUT_EDGE = 4096;

/** Width and height from a PNG, JPEG or WebP header, or null when the bytes are none of those. */
function imageSize(data) {
  if (data.length >= 24 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
  if (data.length >= 4 && data[0] === 0xff && data[1] === 0xd8) {
    let i = 2;
    while (i + 9 < data.length) {
      if (data[i] !== 0xff) return null;
      const marker = data[i + 1];
      const length = data.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { width: data.readUInt16BE(i + 7), height: data.readUInt16BE(i + 5) };
      i += 2 + length;
    }
    return null;
  }
  if (data.length >= 30 && data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP") {
    const chunk = data.toString("ascii", 12, 16);
    if (chunk === "VP8 ") return { width: data.readUInt16LE(26) & 0x3fff, height: data.readUInt16LE(28) & 0x3fff };
    if (chunk === "VP8L") {
      const bits = data.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (chunk === "VP8X") return { width: 1 + data.readUIntLE(24, 3), height: 1 + data.readUIntLE(27, 3) };
  }
  return null;
}

/** The share of a PNG mask darkroom would repaint (grey at or above 128), or null when the mock cannot decode it. */
function pngMaskFraction(data) {
  if (data.length < 33 || data.readUInt32BE(8) !== 13) return null;
  const width = data.readUInt32BE(16);
  const height = data.readUInt32BE(20);
  const [depth, colour, , , interlace] = data.subarray(24, 29);
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colour];
  if (depth !== 8 || interlace !== 0 || !channels) return null;
  const parts = [];
  for (let at = 8; at + 8 <= data.length; ) {
    const length = data.readUInt32BE(at);
    if (data.toString("ascii", at + 4, at + 8) === "IDAT") parts.push(data.subarray(at + 8, at + 8 + length));
    at += 12 + length;
  }
  let raw;
  try {
    raw = zlib.inflateSync(Buffer.concat(parts));
  } catch {
    return null;
  }
  const stride = width * channels;
  let previous = Buffer.alloc(stride);
  let masked = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? line[x - channels] : 0;
      const up = previous[x];
      const corner = x >= channels ? previous[x - channels] : 0;
      const p = left + up - corner;
      const paeth = Math.abs(p - left) <= Math.abs(p - up) && Math.abs(p - left) <= Math.abs(p - corner) ? left : Math.abs(p - up) <= Math.abs(p - corner) ? up : corner;
      line[x] = (line[x] + [0, left, up, (left + up) >> 1, paeth][filter]) & 0xff;
    }
    for (let x = 0; x < width; x++) {
      const i = x * channels;
      // Pillow's "L" conversion, rounded in fixed point.
      const grey = channels >= 3 ? (line[i] * 19595 + line[i + 1] * 38470 + line[i + 2] * 7471 + 0x8000) >> 16 : line[i];
      if (grey >= 128) masked += 1;
    }
    previous = line;
  }
  return masked / (width * height);
}

function decodeInput(base64, what) {
  if (base64.length > 4 * Math.ceil(MAX_INPUT_BYTES / 3)) return { error: `${what} is over 16 MiB` };
  const data = Buffer.from(base64, "base64");
  if (data.length === 0) return { error: `${what} is empty` };
  if (data.length > MAX_INPUT_BYTES) return { error: `${what} is over 16 MiB` };
  const size = imageSize(data);
  if (!size) return { error: `${what} cannot be decoded as PNG, JPEG or WebP` };
  if (Math.max(size.width, size.height) > MAX_INPUT_EDGE) return { error: `${what} is ${size.width}x${size.height}; an edge may be ${MAX_INPUT_EDGE} at most` };
  return { data, ...size };
}

/** The input image and mask as darkroom checks them before anything runs: `{error}` for a 400, or what the record keeps. */
function checkInput(body) {
  const init = body.init_image;
  if (!init) return { input: null };
  const denoise = init.denoise ?? 0.5;
  if (typeof denoise !== "number" || denoise < 0.05 || denoise > 1) return { error: "init_image.denoise must be from 0.05 to 1" };
  const image = decodeInput(String(init.data_base64 ?? ""), "the init image");
  if (image.error) return image;
  let mask = null;
  if (init.mask_base64 != null) {
    const read = decodeInput(String(init.mask_base64), "the mask");
    if (read.error) return read;
    if (read.width !== image.width || read.height !== image.height) return { error: `the mask is ${read.width}x${read.height} but the init image is ${image.width}x${image.height}: they must match` };
    const fraction = imageSize(read.data) && read.data[0] === 0x89 ? pngMaskFraction(read.data) : null;
    if (fraction === 0) return { error: "the mask masks nothing: paint the region to repaint white" };
    mask = { sha256: sha256(read.data), source_sha256: sha256(read.data), masked_fraction: fraction == null ? 0.5 : Math.max(fraction, 1e-6) };
  }
  const digest = sha256(image.data);
  return { input: { sha256: digest, phash: "f0f0e0e0c0c08080", width: image.width, height: image.height, source_sha256: digest, denoise, mask } };
}
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
// adult-cinematic's letters do not line up with the others: its B is another rule.
const nonIllegalRule = (name) => (name === "default" ? "A. Sexual Content Risk" : name === "adult-cinematic" ? "B. Unethical Behavior" : "B. Real-World Crimes & Public Safety");
/** `policy:letter`, as darkroom writes a rule into `outcome_reason`. */
const ruleCode = (policy, rule) => `${policy}:${rule.slice(0, 1)}`;

/** How cortex's GuardResult names the policy it judged against: `default`, or `custom-` and a sha256 prefix of the text. */
const policyName = (name) => {
  const text = POLICIES.get(name)?.text;
  return text == null ? "default" : `custom-${createHash("sha256").update(text.trim()).digest("hex").slice(0, 12)}`;
};
/** A cell as judged under `name`: its result carries that policy, as darkroom's records do. */
const judgedBy = (name, cell) => (cell.result ? { ...cell, result: { ...cell.result, policy: policyName(name) } } : cell);

const guard = (safe, rules, explanation, thinking) => ({ safe, rules, explanation, model: MODEL, policy: "default", thinking });
const safeCell = (thinking) => ({ state: "safe", result: guard(true, [], "No rule matched.", thinking === "cascade" ? "fast" : thinking), error: null });
const flaggedCell = (rule, why, thinking) => ({ state: "flagged", result: guard(false, [rule], why, thinking === "cascade" ? "slow" : thinking), error: null });
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
    results[name] = judgedBy(name, results[name]);
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
  const known = models.checkpoints.find((c) => c.name === body.checkpoint) ?? models.checkpoints[0];
  const checkpoint = { name: known.name, sha256: known.sha256 };
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
      guidance: sampling.guidance == null ? null : Number(sampling.guidance),
      clip_skip: Number(sampling.clip_skip ?? 1),
      width: Number(sampling.width ?? SIZE),
      height: Number(sampling.height ?? SIZE),
    },
    checkpoint,
    vae: null,
    loras,
    workflow_sha256: "5b".repeat(32),
    workflow: chooseWorkflow(body).workflow?.name ?? null,
    engine: "comfyui",
    engine_version: "0.3.60",
  };
}

/** `outcome_reason` for a refusal: every illegal rule under any policy, else the enforcing cell. */
function refusalReason(pre) {
  const illegal = Object.entries(pre.results).filter(([, cell]) => cell.state === "illegal");
  if (illegal.length > 0) return illegal.map(([name, cell]) => ruleCode(name, cell.result.rules[0])).join(", ");
  return pre.refusal.rule ? ruleCode(pre.refusal.policy, pre.refusal.rule) : pre.refusal.reason;
}

function baseRecord(id, outcome, reason, critical, request, guardBlock, image) {
  return {
    record_version: "1.0",
    id,
    created_at: new Date().toISOString(),
    darkroom_version: VERSION,
    outcome,
    outcome_reason: reason,
    critical,
    removed_at: null,
    request,
    guard: guardBlock,
    image,
  };
}

async function generate(body, send, input = null) {
  const pre = preflight(body);
  const enforcing = pre.enforcing_policy;
  const names = [enforcing, ...pre.advisory_policies];
  const thinking = pre.thinking;
  const seed = Number.isInteger(body.seed) && body.seed >= 0 ? body.seed : Math.floor(Math.random() * 2 ** 32);
  const nsfwThreshold = typeof body.nsfw_threshold === "number" ? body.nsfw_threshold : 0.2;
  const request = { ...requestBlock(body, pre, seed), init_image: input };
  const guardBase = { enforcing_policy: enforcing, advisory_policies: pre.advisory_policies, thinking, preflight: pre.results, scans: {}, nudenet: null, age: null, input: null };
  const id = newId();
  const user = pre.user_prompt;

  send("preflight", pre);
  if (pre.outcome === "refused") {
    // Nothing was resolved or hashed, and the seed and sampling are only what the request sent.
    // The input image was not scanned: the record names it by its hashes only.
    const unresolved = { ...request, seed: Number.isInteger(body.seed) ? body.seed : null, sampling: body.sampling ? request.sampling : null, checkpoint: null, vae: null, loras: [], workflow_sha256: null, workflow: null, engine_version: null };
    const record = baseRecord(id, "refused", refusalReason(pre), false, unresolved, guardBase, null);
    records.set(id, record);
    send("complete", { record });
    return;
  }

  // Image-to-image: the input gets an output's checks first, and goes on only if it passes outright.
  let inputBlock = null;
  if (input) {
    const inputScans = {};
    for (const name of names) {
      inputScans[name] = { isolated: null, with_prompt: null };
      for (const context of ["isolated", "with_prompt"]) {
        await sleep(SCAN_MS);
        let cell = SINGGUARD ? safeCell(thinking) : uncheckedCell("SingGuard unreachable");
        const rule = firstIllegal(name);
        if (user.includes("[input-illegal]") && context === "isolated" && rule) cell = illegalCell(rule, `[Step 1] The input image alone matches rule ${rule.slice(0, 1)} under this policy.`, thinking);
        cell = judgedBy(name, cell);
        inputScans[name][context] = cell;
        send("input_scan", { policy: name, context, cell });
      }
    }
    const exposedInput = user.includes("[input-exposed]") ? 0.41 : 0.0;
    const inputNude = { exposed_score: exposedInput, labels: exposedInput >= 0.2 ? { FEMALE_BREAST_EXPOSED: exposedInput } : {}, threshold: nsfwThreshold, blur: false };
    const illegalCodes = Object.entries(inputScans).flatMap(([name, pair]) => [pair.isolated, pair.with_prompt].filter((c) => c.state === "illegal").map((c) => ruleCode(name, c.result.rules[0])));
    const uncheckedInput = inputScans[enforcing].isolated.state === "unchecked" || inputScans[enforcing].with_prompt.state === "unchecked";
    let inputOutcome = "passed";
    let inputReason = null;
    if (illegalCodes.length > 0 || uncheckedInput) {
      inputOutcome = "deleted";
      inputReason = [...new Set(illegalCodes), ...(uncheckedInput ? ["unchecked"] : [])].join(", ");
    } else if (pre.mode === "sfw" && exposedInput >= 0.2) {
      inputOutcome = "omitted";
      inputReason = "sfw-exposed";
    }
    inputBlock = { scans: inputScans, nudenet: inputNude, age: null, outcome: inputOutcome, reason: inputReason };
    if (inputOutcome !== "passed") {
      const record = baseRecord(id, "refused", `input image: ${inputReason}`, illegalCodes.length > 0, request, { ...guardBase, input: inputBlock }, null);
      records.set(id, record);
      send("complete", { record });
      return;
    }
  }

  await sleep(STEP_MS * 3);
  send("queued", { prompt_id: `comfy-${id}`, position: 0 });
  comfyHistory += 1;
  const total = request.sampling.steps;
  for (let step = 1; step <= total; step += 1) {
    await sleep(STEP_MS);
    if (user.includes("[fail]") && step === Math.ceil(total / 2)) {
      const message = "ComfyUI: websocket closed before the image arrived";
      const record = baseRecord(id, "failed", message, false, request, guardBase, null);
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
      const cell = judgedBy(name, cellFor(name, context));
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
  const codesFor = (state) => [...new Set(Object.entries(scans).flatMap(([name, pair]) => [pair.isolated, pair.with_prompt].filter((c) => c.state === state).map((c) => ruleCode(name, c.result.rules[0]))))];
  const illegal = codesFor("illegal");
  const minor = Boolean(ageBlock?.minor_exposed) && exposed >= 0.2;
  const enforcingUnchecked = scans[enforcing].isolated.state === "unchecked" || scans[enforcing].with_prompt.state === "unchecked";
  if (illegal.length > 0 || minor || enforcingUnchecked) {
    outcome = "deleted";
    reason = [...illegal, ...(minor ? ["minor-exposed"] : []), ...(enforcingUnchecked ? ["unchecked"] : [])].join(", ");
    critical = illegal.length > 0 || minor;
  } else if (pre.mode === "sfw" && nudenetDown) {
    outcome = "omitted";
    reason = "sfw-unchecked";
  } else if (pre.mode === "sfw" && exposed >= 0.2) {
    outcome = "omitted";
    reason = "sfw-exposed";
  } else if (cells.some((c) => c.state === "flagged")) {
    outcome = "review";
    reason = codesFor("flagged").join(", ");
  }
  const served = outcome === "passed" || outcome === "review";
  if (served) {
    images.set(id, png);
    image.path = `${id}.png`;
  }
  const record = baseRecord(id, outcome, reason, critical, request, { ...guardBase, scans, nudenet, age: ageBlock, input: inputBlock }, image);
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
        workflow_loaded: true,
        workflows: models.workflows.map((workflow) => workflow.name),
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
      // No workflow check here: darkroom chooses the template when a generation begins, so pre-flight accepts any.
      // Darkroom's /preflight never expands: an expansion differs per run, so it judges the prompt as written.
      return json(res, 200, { ...preflight({ ...body, expand: false }), expansion_applied: false });
    }
    if (req.method === "POST" && path === "/generate/stream") {
      const body = await readBody(req);
      const enforcing = body.enforcing_policy || DEFAULT_POLICY;
      if (!POLICIES.has(enforcing)) return json(res, 400, { detail: `unknown policy ${enforcing}` });
      if (modeOf(enforcing) === "nsfw" && !NSFW_ALLOWED) return json(res, 400, { detail: `${enforcing} is an NSFW policy and the server was not started with --allow-nsfw` });
      if (modeOf(enforcing) === "sfw" && !NUDENET) return json(res, 400, { detail: "SFW generation needs a NudeNet server (NUDENET_URL is empty)" });
      const chosen = chooseWorkflow(body);
      if (chosen.error) return json(res, 400, { detail: chosen.error });
      const checked = checkInput(body);
      if (checked.error) return json(res, 400, { detail: checked.error });
      if (!SINGGUARD) return json(res, 503, { detail: "SingGuard is unreachable; darkroom never runs unguarded" });
      if (generating) return json(res, 409, { detail: "a generation is already running" });
      generating = true;
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
      const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      try {
        await generate(body, send, checked.input);
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
      const pageSize = Math.max(1, Number(url.searchParams.get("page_size") || 50));
      if (pageSize > MAX_PAGE) return json(res, 422, { detail: `page_size must be at most ${MAX_PAGE}` });
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
    if (req.method === "POST" && path.startsWith("/purge/")) {
      if (!DEVMODE) return json(res, 404, { detail: "Not Found" });
      const body = await readBody(req);
      if (body?.confirm !== "purge") return json(res, 400, { detail: 'the body must be {"confirm": "purge"}' });
      if (generating) return json(res, 409, { detail: "a generation is running" });
      const id = decodeURIComponent(path.slice("/purge/".length));
      if (!records.has(id)) return json(res, 404, { detail: "no such record" });
      records.delete(id);
      return json(res, 200, { records: 1, images: images.delete(id) ? 1 : 0 });
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
