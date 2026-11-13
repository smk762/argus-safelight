import type { CheckpointOption, Models, SamplingParams, WorkflowInfo } from "./types";

/**
 * What darkroom can render, from `/models`. Darkroom picks a workflow template per request by the checkpoint's family
 * (its folder) and the number of LoRAs, and refuses with a 400 a request that sets a value the template has no slot
 * for. The form reads the same template so it offers only what renders; darkroom still decides.
 */

export const DEFAULT_GUIDANCE = 3.5;

/** What a request renders from: text alone, an input image, or an input image with a mask. */
export type RenderMode = "txt2img" | "img2img" | "inpaint";

export const MODE_LABEL: Record<RenderMode, string> = { txt2img: "text-to-image", img2img: "image-to-image", inpaint: "inpainting" };

/** A template's mode. Absent before darkroom's img2img, when every template was text-to-image. */
export const workflowMode = (workflow: WorkflowInfo): RenderMode => workflow.mode ?? "txt2img";

/** The LoRA counts darkroom renders the checkpoint with in this mode (`lora_counts`, `img2img_lora_counts`, `inpaint_lora_counts`). */
export function modeCounts(checkpoint: CheckpointOption, mode: RenderMode): number[] {
  if (mode === "img2img") return checkpoint.img2img_lora_counts ?? [];
  if (mode === "inpaint") return checkpoint.inpaint_lora_counts ?? [];
  return checkpoint.lora_counts;
}

export function checkpointOf(models: Models | null, name: string): CheckpointOption | null {
  return models?.checkpoints.find((checkpoint) => checkpoint.name === name) ?? null;
}

/** Whether any workflow renders the checkpoint at all. */
export function renderable(checkpoint: CheckpointOption): boolean {
  return checkpoint.lora_counts.length > 0;
}

/** The template darkroom would choose, as its `WorkflowSet.select` does: the checkpoint's family, or a family-less one, in this mode, with exactly this many LoRA slots. */
export function workflowFor(models: Models | null, checkpoint: string, loras: number, mode: RenderMode = "txt2img"): WorkflowInfo | null {
  if (!models) return null;
  const family = checkpointOf(models, checkpoint)?.family ?? null;
  return models.workflows.find((workflow) => (workflow.family === null || workflow.family === family) && workflow.loras === loras && workflowMode(workflow) === mode) ?? null;
}

/**
 * The template whose slots the form follows. The exact one for this LoRA count, else any for the family, so a LoRA
 * count darkroom refuses (which blocks Generate with its own reason) does not also reshuffle the fields.
 */
export function formWorkflow(models: Models | null, checkpoint: string, loras: number, mode: RenderMode = "txt2img"): WorkflowInfo | null {
  const exact = workflowFor(models, checkpoint, loras, mode);
  if (exact || !models) return exact;
  const family = checkpointOf(models, checkpoint)?.family ?? null;
  const fits = models.workflows.filter((workflow) => workflow.family === null || workflow.family === family);
  return fits.find((workflow) => workflowMode(workflow) === mode) ?? fits.find((workflow) => workflowMode(workflow) === "txt2img") ?? null;
}

export type Slot = "$negative" | "$guidance" | "$clip_skip";

/**
 * Whether the template fills a slot. With no template known (darkroom has none loaded, or `/models` has not
 * arrived) the form behaves as it did before workflows were chosen per family: a negative prompt and clip skip, no guidance.
 */
export function usesSlot(workflow: WorkflowInfo | null, slot: Slot): boolean {
  if (workflow) return workflow.slots.includes(slot);
  return slot !== "$guidance";
}

function countList(counts: number[]): string {
  const words = counts.map(String);
  return words.length <= 1 ? (words[0] ?? "") : `${words.slice(0, -1).join(", ")} or ${words[words.length - 1]}`;
}

function familyName(checkpoint: CheckpointOption): string {
  return checkpoint.family ? `The ${checkpoint.family} family` : checkpoint.name;
}

/** Why darkroom would refuse this checkpoint with this many LoRAs in this mode, or null when a workflow renders it. */
export function workflowBlock(models: Models | null, checkpoint: string, loras: number, mode: RenderMode = "txt2img"): string | null {
  const known = checkpointOf(models, checkpoint);
  if (!known) return null;
  if (!renderable(known)) {
    return known.family ? `No workflow renders the ${known.family} family on this server. Pick another checkpoint.` : `${known.name} is not in a family folder (checkpoints/<family>/…), so darkroom has no workflow for it. Pick another checkpoint.`;
  }
  const counts = modeCounts(known, mode);
  if (counts.includes(loras)) return null;
  // Darkroom never falls back to text-to-image, or from inpainting to plain image-to-image.
  if (counts.length === 0) return `${familyName(known)} has no ${MODE_LABEL[mode]} workflow on this server. ${mode === "inpaint" ? "Remove the mask, or pick" : "Remove the input image, or pick"} another checkpoint.`;
  const most = Math.max(...counts);
  const fix = loras > most ? `Remove ${loras - most}.` : `Add ${Math.min(...counts.filter((count) => count > loras)) - loras}.`;
  const what = mode === "txt2img" ? "" : ` ${MODE_LABEL[mode]}`;
  return counts.length === 1 && counts[0] === 0 ? `${familyName(known)} renders${what} without LoRAs. ${fix}` : `${familyName(known)} renders${what} with ${countList(counts)} LoRAs. ${fix}`;
}

/** Whether one more LoRA still renders in this mode; the reason when not. */
export function loraAddBlock(models: Models | null, checkpoint: string, loras: number, mode: RenderMode = "txt2img"): string | null {
  const known = checkpointOf(models, checkpoint);
  if (!known || !renderable(known)) return null;
  const counts = modeCounts(known, mode);
  if (counts.length === 0 || counts.includes(loras + 1)) return null;
  const what = mode === "txt2img" ? "" : ` ${MODE_LABEL[mode]}`;
  return counts.length === 1 && counts[0] === 0 ? `${familyName(known)} renders${what} without LoRAs.` : `${familyName(known)} renders${what} with at most ${Math.max(...counts)} LoRA${Math.max(...counts) === 1 ? "" : "s"}.`;
}

/**
 * Why the form cannot offer this mode for the checkpoint and LoRA count, or null when it can. Shown beside the input
 * image and mask controls before anything is chosen; `workflowBlock` blocks Generate once something is.
 */
export function modeBlock(models: Models | null, checkpoint: string, loras: number, mode: Exclude<RenderMode, "txt2img">): string | null {
  const known = checkpointOf(models, checkpoint);
  if (!known || !renderable(known)) return null;
  const counts = modeCounts(known, mode);
  if (counts.includes(loras)) return null;
  if (counts.length === 0) return `${familyName(known)} has no ${MODE_LABEL[mode]} workflow on this server.`;
  return `${familyName(known)} renders ${MODE_LABEL[mode]} with ${countList(counts)} LoRAs, and this form has ${loras}.`;
}

/** Where a family's sampling starts when the form switches to it. A starting point only: every field stays editable. */
const FAMILY_SAMPLING: Record<string, Partial<SamplingParams>> = {
  sdxl: { sampler: "dpmpp_2m", scheduler: "karras", steps: 28, cfg: 5.5, guidance: null },
  flux: { sampler: "euler", scheduler: "simple", steps: 20, cfg: 1, guidance: DEFAULT_GUIDANCE },
  "flux-klein": { sampler: "euler", scheduler: "simple", steps: 4, cfg: 1, guidance: null },
  sd35: { sampler: "euler", scheduler: "sgm_uniform", steps: 28, cfg: 4, guidance: null },
};

/**
 * The sampling to switch to for a checkpoint's family, keeping the size, clip skip and anything the server does not
 * offer. An unknown family keeps the current values. Schnell is distilled to a few steps.
 */
export function familySampling(current: SamplingParams, checkpoint: CheckpointOption | null, models: Models | null): SamplingParams {
  const preset = checkpoint?.family ? FAMILY_SAMPLING[checkpoint.family] : undefined;
  if (!preset) return current;
  const next: SamplingParams = { ...current, ...preset };
  if (checkpoint?.family === "flux" && /schnell/i.test(checkpoint.name)) next.steps = 4;
  if (models?.samplers.length && !models.samplers.includes(next.sampler)) next.sampler = current.sampler;
  if (models?.schedulers.length && !models.schedulers.includes(next.scheduler)) next.scheduler = current.scheduler;
  return next;
}
