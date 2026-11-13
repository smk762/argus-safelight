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

export type CellState = Cell["state"];

/*
 * The record, as darkroom serializes it: generated from darkroom's wire schema at the commit in `schema/pins.json`
 * (`npm run darkroom:types`), never edited by hand. Re-exported under the names the app uses. The rest of this file
 * (health, policies, models, requests, pre-flight, stream events) is not in darkroom's schema yet and is written
 * against its README.
 */
import type {
  AgeRecord,
  Cell,
  FaceAge,
  GenerationRecord,
  GuardRecord,
  GuardResult,
  ImageRecord,
  InitImageRef,
  InputScanRecord,
  LoRARef,
  MaskRef,
  ModelRef,
  NudeNetRecord,
  RequestRecord,
  SamplingParams,
  ScanCells,
} from "./generated/darkroom";

export type { Cell, GenerationRecord, GuardResult, InitImageRef, LoRARef, MaskRef, ModelRef, SamplingParams };
export type ScanPair = ScanCells;
export type RecordRequest = RequestRecord;
export type NudeNetBlock = NudeNetRecord;
/** A tool's estimate from a face. Shown only as "MiVOLO estimate", never as an age. */
export type AgeFace = FaceAge;
export type AgeBlock = AgeRecord;
export type GuardBlock = GuardRecord;
/** An input image gets an output's checks and goes on only when `outcome` is "passed"; anything else refuses the attempt ("input image: …"). */
export type InputScanBlock = InputScanRecord;
export type ImageBlock = ImageRecord;

/** Sampling as a request sends it: `guidance` only for a workflow with a `$guidance` slot, since darkroom 400s a value with no slot. */
export type RequestSampling = Omit<SamplingParams, "guidance"> & { guidance?: number | null };

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
  sampling: RequestSampling;
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
