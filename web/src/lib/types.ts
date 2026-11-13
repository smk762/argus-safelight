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
  /** The words the request supplied for this LoRA, already in the final prompt. Older records have none. */
  trigger_words?: string[];
}

export interface SamplingParams {
  sampler: string;
  scheduler: string;
  steps: number;
  cfg: number;
  /** Flux's distilled guidance, for a workflow with a `$guidance` slot. Null or absent: not used, and darkroom 400s a value the workflow has no slot for. */
  guidance?: number | null;
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
  /** Null on a record refused in pre-flight unless the request held a seed: none was drawn. */
  seed: number | null;
  /** This and the fields below are null on a record refused in pre-flight: nothing was resolved or hashed. `loras` is empty. */
  sampling: SamplingParams | null;
  checkpoint: ModelRef | null;
  vae: ModelRef | null;
  loras: LoRARef[];
  workflow_sha256: string | null;
  /** The template darkroom chose by checkpoint family and LoRA count (its file stem, e.g. `flux+lora1`). Null on a record refused in pre-flight. */
  workflow: string | null;
  engine: string;
  engine_version: string | null;
  /** Image-to-image: the input's identity and denoise, never its pixels. Null (or absent, before darkroom's img2img) for text-to-image. */
  init_image?: InitImageRef | null;
}

/** An image-to-image input as darkroom judged and rendered it: decoded, upright, RGB, re-encoded as a PNG. */
export interface InitImageRef {
  sha256: string;
  phash: string;
  width: number;
  height: number;
  /** Of the bytes the caller sent, before darkroom re-encoded them. */
  source_sha256: string;
  denoise: number;
  /** Inpainting: the mask's identity, never its pixels. Null (or absent) for plain image-to-image. */
  mask?: MaskRef | null;
}

/** An inpainting mask as ComfyUI got it: upright, cut at 128, re-encoded as a 1-bit PNG. Not scanned: it carries no imagery. */
export interface MaskRef {
  sha256: string;
  /** Of the bytes the caller sent. */
  source_sha256: string;
  /** The share of the image repainted, 0 to 1. */
  masked_fraction: number;
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
  /** The image-to-image input's own scan, before anything reached ComfyUI. Null for text-to-image and when pre-flight refused first. */
  input?: InputScanBlock | null;
}

/** An input image gets an output's checks and goes on only when `outcome` is "passed"; anything else refuses the attempt ("input image: …"). */
export interface InputScanBlock {
  scans: Record<string, ScanPair>;
  nudenet: NudeNetBlock;
  age: AgeBlock | null;
  outcome: Outcome;
  reason: string | null;
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
  /**
   * Refused, deleted and review records join every reason with ", ": `policy:letter` codes, and for a deletion
   * "minor-exposed" and "unchecked" ("adult-granular:A, minor-exposed"). Read those with `reasonParts`. Otherwise
   * "unchecked", "sfw-exposed", "sfw-unchecked", the generation error, or null.
   */
  outcome_reason: string | null;
  critical: boolean;
  removed_at: string | null;
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
  /** Real darkroom only. Whether Ollama expansion is configured, and why the age check cannot run (null when it can). */
  expansion_enabled?: boolean;
  age_unavailable?: string | null;
  workflow_loaded?: boolean;
  /** Real darkroom only. The workflow templates it loaded, by name. */
  workflows?: string[];
  /** Real darkroom only. True when the server refuses every write, pre-flight included, with a 403. */
  read_only?: boolean;
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

/**
 * A model file under darkroom's models root. Darkroom sends the name only: hashing a checkpoint takes too long for
 * a list, and it cannot know a LoRA's trigger words, which each request supplies. A server that does know either
 * (the fixture mock) may send them, and the form uses them as suggestions.
 */
export interface ModelOption {
  name: string;
  sha256?: string;
  trigger_words?: string[];
}

export interface CheckpointOption extends ModelOption {
  /** Its top-level folder under `checkpoints/` (`sdxl`, `flux`, …). Null for a file at the top. */
  family: string | null;
  /** The LoRA counts a workflow renders it with. Empty: no workflow fits it, so darkroom refuses it. */
  lora_counts: number[];
  /** The LoRA counts an image-to-image workflow renders it with. Empty (or absent, before darkroom's img2img): no img2img. */
  img2img_lora_counts?: number[];
  /** The LoRA counts an inpainting workflow renders it with. Empty (or absent, before darkroom's inpainting): no masks. */
  inpaint_lora_counts?: number[];
}

/** A workflow template darkroom loaded. Darkroom picks one per request: the checkpoint's family and the LoRA count. */
export interface WorkflowInfo {
  name: string;
  /** Null: a single template used for every checkpoint. */
  family: string | null;
  loras: number;
  /** `txt2img`, `img2img` or `inpaint` (`<family>[+lora<N>][+img2img|+inpaint]`). Absent before darkroom's img2img. */
  mode?: "txt2img" | "img2img" | "inpaint";
  /** True for a plain image-to-image template only (false for inpaint). Prefer `mode`. */
  img2img?: boolean;
  /** The scalar placeholders it fills (`$negative`, `$guidance`, `$clip_skip`, `$vae`, …). Darkroom 400s a request that sets a value with no slot. */
  slots: string[];
}

export interface Models {
  checkpoints: CheckpointOption[];
  /** The one a form starts on, resolved by darkroom. Null when its setting matches nothing. */
  default_checkpoint: string | null;
  loras: ModelOption[];
  vaes: ModelOption[];
  workflows: WorkflowInfo[];
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
  /** Appended to the final prompt by darkroom, after the expansion. */
  trigger_words: string[];
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
  /** Image-to-image: the input as base64 (PNG, JPEG or WebP, at most 16 MiB and 4096 px a side) and the denoise (0.05 to 1). */
  init_image?: {
    data_base64: string;
    denoise: number;
    /** Inpainting: a mask the input's size, white repaints (base64 PNG, JPEG or WebP). Selects an inpaint template. */
    mask_base64?: string;
  };
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
  /** False from `POST /preflight`, which never expands: an expansion differs per run. Absent on the stream's `preflight` event, which judged the real one. */
  expansion_applied?: boolean;
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

/** The stream's `input_scan` event: one cell of the image-to-image input's scan, sent before `queued`. Same shape as `scan`. */
export type InputScanEvent = ScanEvent;

/** `POST /purge/{id}`, devmode only. */
export interface RecordPurgeResult {
  records: number;
  images: number;
}

export interface PurgeResult {
  records: number;
  images: number;
  comfyui_history: number;
}
