/**
 * The wire shapes argus-darkroom serves, as its build doc describes them
 * (record_version "1.0"). The fixture under `fixture/` and the mock in
 * `scripts/mock_darkroom.mjs` follow the same shapes; change all three together.
 */

export const DARKROOM_URL = process.env.NEXT_PUBLIC_DARKROOM_URL || "http://localhost:8106";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "0.0.0.0"]);

/**
 * Darkroom origin for the page the browser actually opened. The port and
 * scheme come from DARKROOM_URL. When that URL names a loopback host (the
 * default), the host follows the page, so a page opened as a LAN address
 * calls darkroom at that same address. A URL naming another machine is used
 * as written.
 */
export function darkroomUrl(pageHost?: string, configured: string = DARKROOM_URL): string {
  const host = pageHost ?? (typeof window === "undefined" ? "" : window.location.hostname);
  if (!host) return configured;
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    return configured;
  }
  if (!LOOPBACK_HOSTS.has(url.hostname)) return url.origin;
  url.hostname = host;
  return url.origin;
}

export type Outcome = "refused" | "passed" | "review" | "deleted" | "omitted" | "failed";
export const OUTCOMES: readonly Outcome[] = ["passed", "review", "deleted", "omitted", "refused", "failed"];

export type Mode = "sfw" | "nsfw";
export type ScanContext = "isolated" | "with_prompt";
export const SCAN_CONTEXTS: readonly ScanContext[] = ["isolated", "with_prompt"];

export type ThinkingMode = "fast" | "fast-slow" | "slow" | "cascade";
export const THINKING_MODES: readonly ThinkingMode[] = ["fast", "fast-slow", "slow", "cascade"];

export type CellState = "safe" | "flagged" | "illegal" | "unchecked";

/** SingGuard's verdict, as argus-cortex records it, plus the cascade's fast pass when the server reports one. */
export interface GuardResult {
  safe: boolean;
  /** The rules that fired, as the policy names them ("H. Non-Consensual Sexual Content"); empty when safe. */
  rules: string[];
  explanation: string | null;
  model: string | null;
  thinking: ThinkingMode | string | null;
  fast_verdict?: "safe" | "unsafe" | null;
  fast_rule?: string | null;
}

/** One policy × one context. The state is darkroom's classification; the browser does not redo it. */
export interface Cell {
  state: CellState;
  result: GuardResult | null;
  error: string | null;
}

export interface ScanPair {
  isolated: Cell;
  with_prompt: Cell;
}

export interface ModelRef {
  name: string;
  sha256: string;
}

export interface LoRARef extends ModelRef {
  weight: number;
}

export interface SamplingParams {
  sampler: string;
  scheduler: string;
  steps: number;
  cfg: number;
  clip_skip: number;
  width: number;
  height: number;
}

export interface RecordRequest {
  mode: Mode;
  user_prompt: string;
  expanded_prompt: string | null;
  final_prompt: string;
  negative_prompt: string;
  expansion: { model: string; system_prompt_sha256: string } | null;
  seed: number;
  sampling: SamplingParams;
  checkpoint: ModelRef;
  vae: ModelRef | null;
  loras: LoRARef[];
  workflow_sha256: string;
  engine: string;
  engine_version: string;
}

export interface NudeNetBlock {
  /** Null when NudeNet did not answer (an NSFW record keeps the block with blur on). */
  exposed_score: number | null;
  labels: Record<string, number>;
  threshold: number;
  blur: boolean;
}

/** A tool's estimate from a face. Shown only as "MiVOLO estimate", never as an age. */
export interface AgeFace {
  age_estimate_years: number;
  bbox: [number, number, number, number];
}

export interface AgeBlock {
  source: "mivolo" | string;
  faces: AgeFace[];
  minor_exposed: boolean;
}

export interface GuardBlock {
  enforcing_policy: string;
  advisory_policies: string[];
  thinking: ThinkingMode | string;
  preflight: Record<string, Cell>;
  /** Empty for refused and failed records. */
  scans: Record<string, ScanPair>;
  nudenet: NudeNetBlock | null;
  age: AgeBlock | null;
}

export interface ImageBlock {
  sha256: string;
  phash: string;
  width: number;
  height: number;
  /** Only when passed or review and not removed by the user. The browser never uses it; images load by id. */
  path: string | null;
}

export interface GenerationRecord {
  record_version: string;
  id: string;
  created_at: string;
  darkroom_version: string;
  outcome: Outcome;
  /** A rule letter, "minor-exposed", "unchecked", "sfw-exposed", "sfw-unchecked", the generation error, or null. */
  outcome_reason: string | null;
  critical: boolean;
  removed_at: string | null;
  error: string | null;
  request: RecordRequest;
  guard: GuardBlock;
  /** Null for refused and failed records: nothing was rendered. */
  image: ImageBlock | null;
}

export interface Health {
  version: string;
  mock?: boolean;
  backends: { comfyui: boolean; ollama: boolean; singguard: boolean; nudenet: boolean; age: boolean };
  policies: string[];
  default_policy: string;
  thinking: ThinkingMode | string;
  nsfw_allowed: boolean;
  sfw_available: boolean;
  devmode: boolean;
  generating?: boolean;
}

export interface IllegalRule {
  code: string;
  name: string;
}

export interface PolicyInfo {
  name: string;
  mode: Mode;
  /** Null for `default`: SingGuard's own rules, nothing is sent. */
  text: string | null;
  summary: string;
  illegal_rules: IllegalRule[];
  /** False when this policy cannot enforce on this server (NSFW without --allow-nsfw, SFW without NudeNet). */
  enforceable: boolean;
}

export interface Policies {
  default: string;
  policies: PolicyInfo[];
}

export interface LoRAModel extends ModelRef {
  trigger_words: string[];
}

export interface Models {
  checkpoints: ModelRef[];
  loras: LoRAModel[];
  vaes: ModelRef[];
  samplers: string[];
  schedulers: string[];
}

export interface RecordPage {
  records: GenerationRecord[];
  total: number;
  page: number;
  page_size: number;
}

export interface LoRAChoice {
  name: string;
  weight: number;
}

/** What `POST /preflight` and `POST /generate/stream` take. */
export interface GenerateRequest {
  user_prompt: string;
  negative_prompt: string;
  expand: boolean;
  enforcing_policy: string;
  advisory_policies: string[];
  thinking: ThinkingMode;
  checkpoint: string;
  loras: LoRAChoice[];
  seed: number | null;
  sampling: SamplingParams;
  nsfw_threshold: number;
}

export interface PreflightRefusal {
  policy: string;
  reason: string;
  rule: string | null;
  explanation: string | null;
}

export interface PreflightWarning {
  policy: string;
  rule: string;
  explanation: string | null;
}

export interface Preflight {
  mode: Mode;
  enforcing_policy: string;
  advisory_policies: string[];
  thinking: ThinkingMode | string;
  user_prompt: string;
  expanded_prompt: string | null;
  final_prompt: string;
  negative_prompt: string;
  framed_text: string;
  outcome: "ok" | "warning" | "refused";
  refusal: PreflightRefusal | null;
  warnings: PreflightWarning[];
  results: Record<string, Cell>;
}

export interface ProgressEvent {
  step: number;
  total: number;
}

export interface ScanEvent {
  policy: string;
  context: ScanContext;
  cell: Cell;
}

export interface PurgeResult {
  records: number;
  images: number;
  comfyui_history: number;
}
