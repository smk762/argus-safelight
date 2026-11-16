// Generated from smk762/argus-darkroom@0cf2f71 (0.1.4.dev52+g0cf2f71) schema/darkroom-wire.schema.json.
// Do not edit: run `make sync` (or `npm run darkroom:pull`) to move to darkroom's dev HEAD.

export interface DarkroomWire {
  AgeRecord?: AgeRecord;
  Cell?: Cell;
  DepthRecord?: DepthRecord;
  Expansion?: Expansion;
  FaceAge?: FaceAge;
  GenerationRecord?: GenerationRecord;
  GuardRecord?: GuardRecord;
  GuardResult?: GuardResult;
  ImageRecord?: ImageRecord;
  InitImageRef?: InitImageRef;
  InputScanRecord?: InputScanRecord;
  LoRARef?: LoRARef;
  MaskRef?: MaskRef;
  ModelRef?: ModelRef;
  NudeNetBox?: NudeNetBox;
  NudeNetRecord?: NudeNetRecord;
  PersonAge?: PersonAge;
  RequestRecord?: RequestRecord;
  SamplingParams?: SamplingParams;
  ScanCells?: ScanCells;
}
export interface AgeRecord {
  faces: FaceAge[];
  minor_exposed: boolean;
  minor_exposed_rule: "frame" | "overlap";
  people: PersonAge[];
  source: "mivolo";
}
/**
 * A MiVOLO age estimate for one detected face. A tool's estimate, never a stated age.
 */
export interface FaceAge {
  age_estimate_years: number;
  /**
   * @minItems 4
   * @maxItems 4
   */
  bbox: [number, number, number, number];
}
/**
 * One person (body) box from curator's person detector, with its MiVOLO estimate when it has one.
 *
 * ``face_index`` is the face in :attr:`AgeRecord.faces` this person was matched to, or ``None`` for a body with
 * no face. A matched person's estimate may be ``None``: the face carries it. An unmatched person's estimate is
 * also in :attr:`AgeRecord.faces`, so ``faces`` alone still holds every estimate.
 */
export interface PersonAge {
  age_estimate_years: number | null;
  /**
   * @minItems 4
   * @maxItems 4
   */
  bbox: [number, number, number, number];
  face_index: number | null;
}
/**
 * One policy's verdict in one context: a state, and the SingGuard answer or the error behind it.
 */
export interface Cell {
  error: string | null;
  result: GuardResult | null;
  state: "safe" | "flagged" | "illegal" | "unchecked";
}
/**
 * SingGuard's verdict on one image. A verdict, not a score: SingGuard
 * reports which policy rules fired, not how confident it is.
 */
export interface GuardResult {
  explanation: string | null;
  model: string | null;
  policy: string;
  rules: string[];
  safe: boolean;
  thinking: string | null;
}
/**
 * A depth map derived from the record's stored image (``POST /depth/{id}``), never from a new prompt.
 *
 * The PNG is 8-bit greyscale at the image's size, near bright (255) and far dark (0), stretched min to max per image,
 * with no metadata. ``sha256`` is of the stored PNG's bytes. ``workflow`` names darkroom's built-in depth graph.
 */
export interface DepthRecord {
  created_at: string;
  engine_version: string | null;
  height: number;
  model: string;
  model_license: string;
  /**
   * lowercase hex SHA256 digest
   */
  sha256: string;
  width: number;
  workflow: string;
}
/**
 * How Ollama expanded the prompt: enough to know which system prompt was used.
 */
export interface Expansion {
  model: string;
  /**
   * lowercase hex SHA256 digest
   */
  system_prompt_sha256: string;
}
export interface GenerationRecord {
  created_at: string;
  critical: boolean;
  darkroom_version: string;
  depth: DepthRecord | null;
  guard: GuardRecord;
  id: string;
  image: ImageRecord | null;
  outcome: "refused" | "passed" | "review" | "deleted" | "omitted" | "failed";
  outcome_reason: string | null;
  record_version: string;
  removed_at: string | null;
  request: RequestRecord;
}
export interface GuardRecord {
  advisory_policies: string[];
  age: AgeRecord | null;
  enforcing_policy: string;
  input: InputScanRecord | null;
  nudenet: NudeNetRecord | null;
  preflight: {
    [k: string]: Cell;
  };
  scans: {
    [k: string]: ScanCells;
  };
  thinking: string;
}
/**
 * The image-to-image input's own scan: the same checks an output gets, before anything reaches ComfyUI.
 *
 * The input goes on only when ``outcome`` is ``passed``; anything else refuses the attempt. ``outcome`` and
 * ``reason`` are what the outcome table said of the input, as if it were an output.
 */
export interface InputScanRecord {
  age: AgeRecord | null;
  nudenet: NudeNetRecord;
  outcome: "refused" | "passed" | "review" | "deleted" | "omitted" | "failed";
  reason: string | null;
  scans: {
    [k: string]: ScanCells;
  };
}
/**
 * What NudeNet said, kept for every rendered image. *exposed_score* is null when it did not answer (or is not
 * configured), and the labels are then empty: under an NSFW policy that blurs the image, under SFW it omits it.
 */
export interface NudeNetRecord {
  blur: boolean;
  detections: NudeNetBox[];
  detector: string | null;
  detector_model: string | null;
  exposed_score: number | null;
  labels: {
    [k: string]: number;
  };
  threshold: number;
}
/**
 * One NudeNet detection: a class, its score and where it is. A box, never pixels.
 */
export interface NudeNetBox {
  /**
   * @minItems 4
   * @maxItems 4
   */
  bbox: [number, number, number, number];
  label: string;
  score: number;
}
/**
 * One policy's two image scans: alone, and alongside the prompt that made the image.
 */
export interface ScanCells {
  isolated: Cell;
  with_prompt: Cell;
}
/**
 * The identity of the output. The hashes are kept even when the pixels are not.
 */
export interface ImageRecord {
  height: number;
  path: string | null;
  phash: string;
  /**
   * lowercase hex SHA256 digest
   */
  sha256: string;
  width: number;
}
/**
 * What was asked for. ``final_prompt`` is the exact string ComfyUI receives.
 */
export interface RequestRecord {
  checkpoint: ModelRef | null;
  engine: "comfyui";
  engine_version: string | null;
  expanded_prompt: string | null;
  expansion: Expansion | null;
  final_prompt: string;
  init_image: InitImageRef | null;
  loras: LoRARef[];
  mode: "sfw" | "nsfw";
  negative_prompt: string;
  sampling: SamplingParams | null;
  seed: number | null;
  user_prompt: string;
  vae: ModelRef | null;
  workflow: string | null;
  workflow_sha256: string | null;
}
/**
 * A model file pinned by content: the name the engine loads and its sha256.
 */
export interface ModelRef {
  name: string;
  /**
   * lowercase hex SHA256 digest
   */
  sha256: string;
}
/**
 * The identity of an image-to-image input, never its pixels: the caller keeps its own input.
 *
 * The hashes and size are of the image as darkroom judged it and sent it to ComfyUI: decoded, turned upright, made
 * RGB and re-encoded as a PNG with no metadata. ``source_sha256`` is of the bytes the caller sent.
 */
export interface InitImageRef {
  denoise: number;
  height: number;
  mask: MaskRef | null;
  phash: string;
  /**
   * lowercase hex SHA256 digest
   */
  sha256: string;
  /**
   * lowercase hex SHA256 digest
   */
  source_sha256: string;
  width: number;
}
/**
 * The identity of an inpainting mask, never its pixels. The mask selects the region of the input that is
 * repainted; it carries no imagery, so it is not scanned.
 *
 * ``sha256`` is of the mask as ComfyUI got it: turned upright, cut into black and white at 128 and re-encoded as a
 * 1-bit PNG with no metadata. ``source_sha256`` is of the bytes the caller sent.
 */
export interface MaskRef {
  masked_fraction: number;
  /**
   * lowercase hex SHA256 digest
   */
  sha256: string;
  /**
   * lowercase hex SHA256 digest
   */
  source_sha256: string;
}
export interface LoRARef {
  name: string;
  /**
   * lowercase hex SHA256 digest
   */
  sha256: string;
  trigger_words: string[];
  weight: number;
}
export interface SamplingParams {
  cfg: number;
  clip_skip: number;
  guidance: number | null;
  height: number;
  sampler: string;
  scheduler: string;
  steps: number;
  width: number;
}
