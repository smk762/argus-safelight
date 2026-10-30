import type { GenerateRequest, GenerationRecord, Health, LoRAChoice, Mode, Models, Policies, PolicyInfo, SamplingParams, ThinkingMode } from "./types";

/** The compose form. Everything a request needs, plus whether the seed is held. */
export interface ComposeState {
  userPrompt: string;
  negativePrompt: string;
  expand: boolean;
  checkpoint: string;
  loras: LoRAChoice[];
  sampling: SamplingParams;
  /** Null means darkroom picks a random seed. */
  seed: number | null;
  seedLocked: boolean;
  enforcingPolicy: string;
  advisoryPolicies: string[];
  thinking: ThinkingMode;
  nsfwThreshold: number;
}

export const DEFAULT_NEGATIVE = "blurry, low quality, text, watermark";
export const DEFAULT_SAMPLING: SamplingParams = { sampler: "dpmpp_2m", scheduler: "karras", steps: 28, cfg: 5.5, clip_skip: 1, width: 512, height: 512 };
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

export function defaultCompose(health: Health | null, policies: Policies | null, models: Models | null): ComposeState {
  const enforcing = policies?.default ?? health?.default_policy ?? "default";
  const thinking = (THINKING.includes(health?.thinking as ThinkingMode) ? health?.thinking : "cascade") as ThinkingMode;
  return {
    userPrompt: "",
    negativePrompt: DEFAULT_NEGATIVE,
    expand: false,
    checkpoint: models?.checkpoints[0]?.name ?? "",
    loras: [],
    sampling: {
      ...DEFAULT_SAMPLING,
      sampler: models?.samplers.includes(DEFAULT_SAMPLING.sampler) ? DEFAULT_SAMPLING.sampler : (models?.samplers[0] ?? DEFAULT_SAMPLING.sampler),
      scheduler: models?.schedulers.includes(DEFAULT_SAMPLING.scheduler) ? DEFAULT_SAMPLING.scheduler : (models?.schedulers[0] ?? DEFAULT_SAMPLING.scheduler),
    },
    seed: null,
    seedLocked: false,
    enforcingPolicy: enforcing,
    advisoryPolicies: [],
    thinking,
    nsfwThreshold: NSFW_THRESHOLD_MIN,
  };
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
    if (!models.checkpoints.some((checkpoint) => checkpoint.name === next.checkpoint)) next = { ...next, checkpoint: models.checkpoints[0]?.name ?? "" };
    const loras = next.loras.filter((lora) => models.loras.some((known) => known.name === lora.name));
    if (loras.length !== next.loras.length) next = { ...next, loras };
  }
  return next;
}

export function toRequest(state: ComposeState): GenerateRequest {
  return {
    user_prompt: state.userPrompt,
    negative_prompt: state.negativePrompt,
    expand: state.expand,
    enforcing_policy: state.enforcingPolicy,
    advisory_policies: state.advisoryPolicies,
    thinking: state.thinking,
    checkpoint: state.checkpoint,
    loras: state.loras,
    seed: state.seedLocked ? state.seed : null,
    sampling: state.sampling,
    nsfw_threshold: state.nsfwThreshold,
  };
}

/** The form refilled from a record, seed held, so Regenerate repeats the run exactly. */
export function fromRecord(record: GenerationRecord, base: ComposeState): ComposeState {
  const { request, guard } = record;
  return {
    ...base,
    userPrompt: request.user_prompt,
    negativePrompt: request.negative_prompt,
    expand: request.expanded_prompt != null,
    checkpoint: request.checkpoint.name,
    loras: request.loras.map((lora) => ({ name: lora.name, weight: lora.weight, trigger_words: [...(lora.trigger_words ?? [])] })),
    sampling: { ...request.sampling },
    seed: request.seed,
    seedLocked: true,
    enforcingPolicy: guard.enforcing_policy,
    advisoryPolicies: [...guard.advisory_policies],
    thinking: (THINKING.includes(guard.thinking as ThinkingMode) ? guard.thinking : base.thinking) as ThinkingMode,
    nsfwThreshold: guard.nudenet?.threshold ?? base.nsfwThreshold,
  };
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 32);
}

/** Generate is offered only when darkroom answers and SingGuard is reachable. The reason otherwise. */
export function generateBlock(health: Health | null, error: string | null, state: ComposeState, policies: Policies | null): string | null {
  if (error) return `Darkroom is not reachable: ${error}`;
  if (!health) return "Waiting for darkroom's /health.";
  if (!health.backends.singguard) return "SingGuard is unreachable. Darkroom never runs unguarded.";
  if (!health.backends.comfyui) return "ComfyUI is unreachable.";
  if (policyMode(policies, state.enforcingPolicy) === "sfw" && !health.sfw_available) return "SFW generation needs NudeNet, which this server does not have.";
  if (!state.userPrompt.trim()) return "Write a prompt first.";
  return null;
}
