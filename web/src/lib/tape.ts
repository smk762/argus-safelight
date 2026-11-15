/**
 * The recorded data tape the static demo reads (scripts/record_tape.py writes it). Pure: parsing, lookups and the
 * replay schedule are here and unit-tested; staticApi.ts does the fetching.
 *
 * The tape is the whole of what the demo knows. A record that darkroom did not serve (deleted, omitted, refused,
 * failed) has no entry in `files`, so there is no URL to ask for: the page cannot load an image of it even by
 * mistake. A blocked record's words were replaced before the tape was written; the page shows them as they are.
 */
import type { RecordQuery } from "./api";
import type { GenerateRequest, GenerationRecord, Health, Models, Policies, Preflight, RecordPage } from "./types";

export const TAPE_FORMAT = "argus-safelight-tape";
export const TAPE_VERSION = 1;

export type TapeKind = "recorded" | "sample";

export interface Tape {
  format: typeof TAPE_FORMAT;
  version: number;
  generated_at: string;
  provenance: {
    /** `recorded`: a real darkroom run, replayed. `sample`: the fixture's hand-written records and placeholders. */
    kind: TapeKind;
    source: string;
    darkroom: { version: string | null; commit: string | null };
    note: string | null;
  };
  health: Health;
  policies: Policies;
  models: Models;
  /** Newest first, as `GET /records` serves them. */
  records: GenerationRecord[];
  /** Record ids the compose form can replay (takes/<id>.json). */
  takes: string[];
  /** Record id -> file id, for served records only: images/<f>.webp, thumbs/<f>.webp. */
  files: Record<string, string>;
  /** Served records shown behind the veil until revealed: darkroom asked for blur, or a policy flagged them. */
  veiled: string[];
  /** Cells across the long side of veils/<f>-medium.webp. */
  veils: { medium: number };
  /**
   * Hand-written records on a recorded tape, never generated: the outcomes a real recording must not produce (an
   * illegal-rule or minor-exposed deletion, an illegal refusal). The page labels each one Sample data.
   */
  illustrative?: string[];
}

/** One recorded take: what `POST /preflight` answered for its request, and the stream's events in order. */
export interface Take {
  preflight: Preflight | null;
  events: [string, unknown][];
}

export const SERVED_OUTCOMES = ["passed", "review"] as const;

function fail(problem: string): never {
  throw new Error(`The data tape is not usable: ${problem}.`);
}

function object(value: unknown, where: string): Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) fail(`${where} must be an object`);
  return value as Record<string, unknown>;
}

/** Check tape.json enough that the page can trust its shape; throws with the first problem. */
export function parseTape(raw: unknown): Tape {
  const tape = object(raw, "tape.json");
  if (tape.format !== TAPE_FORMAT) fail(`format is ${JSON.stringify(tape.format)}, not ${TAPE_FORMAT}`);
  if (tape.version !== TAPE_VERSION) fail(`version ${String(tape.version)} is not ${TAPE_VERSION}; re-record it or update the page`);
  if (typeof tape.generated_at !== "string" || Number.isNaN(Date.parse(tape.generated_at))) fail("generated_at must be a date");
  const provenance = object(tape.provenance, "provenance");
  if (provenance.kind !== "recorded" && provenance.kind !== "sample") fail("provenance.kind must be recorded or sample");
  object(tape.health, "health");
  object(tape.policies, "policies");
  object(tape.models, "models");
  if (!Array.isArray(tape.records)) fail("records must be a list");
  const records = tape.records as GenerationRecord[];
  const ids = new Set(records.map((record) => record.id));
  if (!Array.isArray(tape.takes) || !tape.takes.every((id) => typeof id === "string" && ids.has(id))) fail("takes must list record ids");
  if (!Array.isArray(tape.veiled) || !tape.veiled.every((id) => typeof id === "string" && ids.has(id))) fail("veiled must list record ids");
  const files = object(tape.files, "files");
  for (const [id, file] of Object.entries(files)) {
    // File ids become URLs.
    if (typeof file !== "string" || !/^[a-f0-9]{8,64}$/.test(file)) fail(`files[${JSON.stringify(id)}] is not a file id`);
    const record = records.find((entry) => entry.id === id);
    if (!record) fail(`files names ${id}, which is not on the tape`);
    if (!servedImage(record)) fail(`files names ${id}, a ${record.outcome} record: only a served image may have a file`);
  }
  if (tape.illustrative != null && (!Array.isArray(tape.illustrative) || !tape.illustrative.every((id) => typeof id === "string" && ids.has(id) && !(id in files)))) fail("illustrative must list record ids that have no file");
  const veils = object(tape.veils, "veils");
  if (typeof veils.medium !== "number" || !Number.isInteger(veils.medium) || veils.medium < 4 || veils.medium > 64) fail("veils.medium must be a cell count from 4 to 64");
  return raw as Tape;
}

/** Darkroom served this record's image and it was not removed since. */
export function servedImage(record: Pick<GenerationRecord, "outcome" | "removed_at">): boolean {
  return (SERVED_OUTCOMES as readonly string[]).includes(record.outcome) && record.removed_at == null;
}

/** The URL of a served record's image, thumbnail or veil; "" for anything else, which the page never renders. */
export function tapeFileUrl(base: string, tape: Pick<Tape, "files" | "veiled"> | null, id: string, kind: "images" | "thumbs" | "veils"): string {
  const file = tape?.files[id];
  if (!file) return "";
  if (kind === "veils") return tape.veiled.includes(id) ? `${base}/veils/${file}-medium.webp` : "";
  return `${base}/${kind}/${file}.webp`;
}

/** `GET /records` against the tape: outcome and mode filtered, newest first, paged as darkroom pages. */
export function recordPage(tape: Pick<Tape, "records">, query: RecordQuery = {}): RecordPage {
  const matching = tape.records.filter((record) => (!query.outcome || record.outcome === query.outcome) && (!query.mode || record.request.mode === query.mode));
  const pageSize = query.pageSize ?? 50;
  const page = Math.max(1, query.page ?? 1);
  return { records: matching.slice((page - 1) * pageSize, page * pageSize), total: matching.length, page, page_size: pageSize };
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  const left = new Set(a);
  const right = new Set(b);
  return left.size === right.size && [...left].every((name) => right.has(name));
}

/**
 * The recorded take a request replays: the same prompt under the same enforcing and advisory policies. The rest of
 * the form (sampling, seed, checkpoint) does not pick a take; the record that lands says what was really used.
 */
export function takeFor(tape: Pick<Tape, "records" | "takes"> | null, request: Pick<GenerateRequest, "user_prompt" | "enforcing_policy" | "advisory_policies">): GenerationRecord | null {
  if (!tape) return null;
  const prompt = request.user_prompt.trim();
  const advisory = request.advisory_policies.filter((name) => name !== request.enforcing_policy);
  for (const id of tape.takes) {
    const record = tape.records.find((entry) => entry.id === id);
    if (!record) continue;
    const { guard } = record;
    if (record.request.user_prompt.trim() === prompt && guard.enforcing_policy === request.enforcing_policy && sameSet(guard.advisory_policies.filter((name) => name !== guard.enforcing_policy), advisory)) return record;
  }
  return null;
}

/** The takes the compose form offers, newest first. */
export function takeRecords(tape: Pick<Tape, "records" | "takes"> | null): GenerationRecord[] {
  if (!tape) return [];
  return tape.records.filter((record) => tape.takes.includes(record.id));
}

export const WITHHELD = /^\[withheld: [^\]]*\]$/;

/** A blocked record's prompt, replaced on the tape by "[withheld: <reason>]". */
export function isWithheld(text: string | null | undefined): boolean {
  return text != null && WITHHELD.test(text.trim());
}

/** Milliseconds before each event when a take is replayed: the step bar quick, each scan a beat, as darkroom streams them. */
export function replayDelay(event: string, stepMs = 45, scanMs = 380): number {
  if (event === "progress") return stepMs;
  if (event === "scan" || event === "input_scan") return scanMs;
  if (event === "queued") return 400;
  if (event === "complete") return 250;
  return 300;
}
