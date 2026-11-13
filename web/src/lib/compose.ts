import { DEFAULT_DENOISE, clampDenoise, type InputImage, type InputMask } from "./initImage";
import type { GenerateRequest, GenerationRecord, Health, InitImageRef, LoRAChoice, Mode, Models, Policies, PolicyInfo, RequestSampling, ThinkingMode } from "./types";
import { DEFAULT_GUIDANCE, checkpointOf, familySampling, formWorkflow, renderable, usesSlot, workflowBlock, type RenderMode } from "./workflows";

/** The compose form. Everything a request needs, plus whether the seed is held. */
export interface ComposeState {
  userPrompt: string;
  negativePrompt: string;
  expand: boolean;
  checkpoint: string;
  loras: LoRAChoice[];
  sampling: RequestSampling;
  /** Null means darkroom picks a random seed. */
  seed: number | null;
  seedLocked: boolean;
  enforcingPolicy: string;
  advisoryPolicies: string[];
  thinking: ThinkingMode;
  nsfwThreshold: number;
  /** Image-to-image: how much of the input the sampler replaces. Kept when the image goes, so a draft holds it. */
  denoise: number;
  /** The input image, in memory only. Never written to browser storage. */
  initImage: InputImage | null;
  /** The inpainting mask, the input's size. Only with an input image. */
  mask: InputMask | null;
  /**
   * The input a refilled record was made from. Darkroom keeps no input pixels, so the form cannot refill the image:
   * Generate waits until the image is chosen again or the user goes on from text.
   */
  recordInput: InitImageRef | null;
}

export const DEFAULT_NEGATIVE = "blurry, low quality, text, watermark";
export const DEFAULT_SAMPLING: RequestSampling = { sampler: "dpmpp_2m", scheduler: "karras", steps: 28, cfg: 5.5, clip_skip: 1, width: 512, height: 512 };
export const NSFW_THRESHOLD_MIN = 0.2;
export const NSFW_THRESHOLD_MAX = 1;
export const SIZES = [512, 576, 640, 704, 768, 832, 896, 960, 1024] as const;

export function policyByName(policies: Policies | null, name: string): PolicyInfo | null {
  return policies?.policies.find((policy) => policy.name === name) ?? null;
}

/** The mode a policy sets. By name, as cortex does, when the catalogue has not loaded; from the catalogue when it has. */
export function policyMode(policies: Policies | null, name: string): Mode {
  const known = policyByName(policies, name);
  if (known) return known.mode;
  return name === "default" || name.startsWith("sfw-") ? "sfw" : "nsfw";
}

/** Why a policy cannot enforce on this server, or null when it can. */
export function enforceBlock(policy: PolicyInfo): string | null {
  if (policy.enforceable) return null;
  if (policy.mode === "nsfw") return "NSFW policies enforce only on a server started with --allow-nsfw. It can still run as advisory.";
  return "SFW generation needs NudeNet, which this server does not have.";
}

/** Darkroom's default when a workflow renders it, else the first that renders, else whatever there is. */
function startingCheckpoint(models: Models | null): string {
  const preferred = checkpointOf(models, models?.default_checkpoint ?? "");
  if (preferred && renderable(preferred)) return preferred.name;
  return models?.checkpoints.find(renderable)?.name ?? models?.default_checkpoint ?? models?.checkpoints[0]?.name ?? "";
}

/** The form on another checkpoint. A change of family moves the sampling to that family's starting values. */
export function withCheckpoint(state: ComposeState, name: string, models: Models | null): ComposeState {
  const before = checkpointOf(models, state.checkpoint);
  const after = checkpointOf(models, name);
  const sampling = before?.family === after?.family ? state.sampling : familySampling(state.sampling, after, models);
  return { ...state, checkpoint: name, sampling };
}

export function defaultCompose(health: Health | null, policies: Policies | null, models: Models | null): ComposeState {
  const enforcing = policies?.default ?? health?.default_policy ?? "default";
  const thinking = (THINKING.includes(health?.thinking as ThinkingMode) ? health?.thinking : "cascade") as ThinkingMode;
  const checkpoint = startingCheckpoint(models);
  const sampling: RequestSampling = {
    ...DEFAULT_SAMPLING,
    sampler: models?.samplers.includes(DEFAULT_SAMPLING.sampler) ? DEFAULT_SAMPLING.sampler : (models?.samplers[0] ?? DEFAULT_SAMPLING.sampler),
    scheduler: models?.schedulers.includes(DEFAULT_SAMPLING.scheduler) ? DEFAULT_SAMPLING.scheduler : (models?.schedulers[0] ?? DEFAULT_SAMPLING.scheduler),
  };
  return {
    userPrompt: "",
    negativePrompt: DEFAULT_NEGATIVE,
    expand: false,
    checkpoint,
    loras: [],
    sampling: familySampling(sampling, checkpointOf(models, checkpoint), models),
    seed: null,
    seedLocked: false,
    enforcingPolicy: enforcing,
    advisoryPolicies: [],
    thinking,
    nsfwThreshold: NSFW_THRESHOLD_MIN,
    denoise: DEFAULT_DENOISE,
    initImage: null,
    mask: null,
    recordInput: null,
  };
}

/** What the form renders from: text, an input image, or an input image with a mask. */
export function renderMode(state: Pick<ComposeState, "initImage" | "mask">): RenderMode {
  if (!state.initImage) return "txt2img";
  return state.mask ? "inpaint" : "img2img";
}

const THINKING: readonly ThinkingMode[] = ["fast", "fast-slow", "slow", "cascade"];

/**
 * Keep the form consistent with what the server offers: an enforcing policy
 * that exists and can enforce, advisory policies that exist and are not the
 * enforcing one, a checkpoint and LoRAs the models root has.
 */
export function normaliseCompose(state: ComposeState, policies: Policies | null, models: Models | null): ComposeState {
  let next = state;
  if (policies) {
    const own = policyByName(policies, state.enforcingPolicy);
    if (!own || enforceBlock(own)) {
      const fallback = policies.policies.find((policy) => policy.name === policies.default && !enforceBlock(policy)) ?? policies.policies.find((policy) => !enforceBlock(policy));
      if (fallback && fallback.name !== state.enforcingPolicy) next = { ...next, enforcingPolicy: fallback.name };
    }
    const advisory = state.advisoryPolicies.filter((name) => name !== next.enforcingPolicy && policyByName(policies, name));
    if (advisory.length !== state.advisoryPolicies.length || advisory.some((name, index) => name !== state.advisoryPolicies[index])) next = { ...next, advisoryPolicies: advisory };
  }
  if (models) {
    if (!models.checkpoints.some((checkpoint) => checkpoint.name === next.checkpoint)) next = { ...next, checkpoint: startingCheckpoint(models) };
    const loras = next.loras.filter((lora) => models.loras.some((known) => known.name === lora.name));
    if (loras.length !== next.loras.length) next = { ...next, loras };
  }
  return next;
}

/** Whether a request may ask for expansion. The checkbox and `toRequest` both read this, so what the form shows is what is sent. */
export function canExpand(health: Health | null): boolean {
  return health == null || health.backends.ollama;
}

/**
 * The request for the form as it stands, shaped to the workflow darkroom will choose: no negative prompt, guidance or
 * clip skip above the default for a template without that slot, which darkroom would refuse, and guidance for one with
 * it, which darkroom requires. The form hides the same fields, so what it shows is what is sent.
 */
export function toRequest(state: ComposeState, expandable = true, models: Models | null = null): GenerateRequest {
  const workflow = formWorkflow(models, state.checkpoint, state.loras.length, renderMode(state));
  const { guidance, ...rest } = state.sampling;
  const sampling: RequestSampling = {
    ...rest,
    clip_skip: usesSlot(workflow, "$clip_skip") ? rest.clip_skip : DEFAULT_SAMPLING.clip_skip,
    ...(usesSlot(workflow, "$guidance") ? { guidance: guidance ?? DEFAULT_GUIDANCE } : {}),
  };
  return {
    user_prompt: state.userPrompt,
    negative_prompt: usesSlot(workflow, "$negative") ? state.negativePrompt : "",
    expand: state.expand && expandable,
    enforcing_policy: state.enforcingPolicy,
    advisory_policies: state.advisoryPolicies,
    thinking: state.thinking,
    checkpoint: state.checkpoint,
    loras: state.loras,
    seed: state.seedLocked ? state.seed : null,
    sampling,
    nsfw_threshold: state.nsfwThreshold,
    ...(state.initImage
      ? { init_image: { data_base64: state.initImage.dataBase64, denoise: clampDenoise(state.denoise), ...(state.mask ? { mask_base64: state.mask.dataBase64 } : {}) } }
      : {}),
  };
}

/**
 * The request without the input's pixels: what `POST /preflight` gets (darkroom's pre-flight judges the text alone, so
 * the image need not travel), and what the form compares and keeps, so a 16 MiB string is not copied on every render.
 */
export function withoutPixels(request: GenerateRequest): GenerateRequest {
  if (!request.init_image) return request;
  const { init_image: _pixels, ...rest } = request;
  void _pixels;
  return rest;
}

/** Whether a pre-flight verdict still answers the form: the same text, policies and settings. Never holds pixels. */
export const preflightKey = (request: GenerateRequest): string => JSON.stringify(withoutPixels(request));

/**
 * The form refilled from a record, seed held, so Regenerate repeats the run exactly. A record refused in pre-flight
 * resolved no models and may hold no seed or sampling, so for those the form keeps what it has and the seed stays free.
 */
export function fromRecord(record: GenerationRecord, base: ComposeState): ComposeState {
  const { request, guard } = record;
  return {
    ...base,
    userPrompt: request.user_prompt,
    negativePrompt: request.negative_prompt,
    expand: request.expanded_prompt != null,
    checkpoint: request.checkpoint?.name ?? base.checkpoint,
    loras: request.checkpoint ? request.loras.map((lora) => ({ name: lora.name, weight: lora.weight, trigger_words: [...(lora.trigger_words ?? [])] })) : base.loras,
    sampling: request.sampling ? { ...request.sampling } : base.sampling,
    seed: request.seed,
    seedLocked: request.seed != null,
    enforcingPolicy: guard.enforcing_policy,
    advisoryPolicies: [...guard.advisory_policies],
    thinking: (THINKING.includes(guard.thinking as ThinkingMode) ? guard.thinking : base.thinking) as ThinkingMode,
    nsfwThreshold: guard.nudenet?.threshold ?? base.nsfwThreshold,
    // The record names its input by hashes only: the image has to be chosen again, and the mask painted again.
    denoise: request.init_image?.denoise ?? base.denoise,
    initImage: null,
    mask: null,
    recordInput: request.init_image ?? null,
  };
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 32);
}

export const RECORD_INPUT_BLOCK = "This record was made from an input image, and darkroom keeps no input pixels. Choose the image again, or go on from text.";

export const READ_ONLY_BLOCK = "Darkroom is read-only: it refuses every write, pre-flight included.";

/** Generate is offered only when darkroom answers and SingGuard is reachable. The reason otherwise. */
export function generateBlock(health: Health | null, error: string | null, state: ComposeState, policies: Policies | null, models: Models | null = null): string | null {
  if (error) return `Darkroom is not reachable: ${error}`;
  if (!health) return "Waiting for darkroom's /health.";
  if (health.read_only) return READ_ONLY_BLOCK;
  if (!health.backends.singguard) return "SingGuard is unreachable. Darkroom never runs unguarded.";
  if (!health.backends.comfyui) return "ComfyUI is unreachable.";
  if (policyMode(policies, state.enforcingPolicy) === "sfw" && !health.sfw_available) return "SFW generation needs NudeNet, which this server does not have.";
  if (state.recordInput && !state.initImage) return RECORD_INPUT_BLOCK;
  const workflow = workflowBlock(models, state.checkpoint, state.loras.length, renderMode(state));
  if (workflow) return workflow;
  if (!state.userPrompt.trim()) return "Write a prompt first.";
  return null;
}
