import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { RECORD_INPUT_BLOCK, defaultCompose, fromRecord, generateBlock, preflightKey, toRequest, withCheckpoint, withoutPixels, type ComposeState } from "./compose";
import { fixtureRecord } from "./fixture.test-util";
import type { Health, Models } from "./types";
import { DEFAULT_GUIDANCE, familySampling, formWorkflow, loraAddBlock, modeBlock, usesSlot, workflowBlock, workflowFor } from "./workflows";

const FIXTURE = join(__dirname, "..", "..", "..", "fixture");
const models = JSON.parse(readFileSync(join(FIXTURE, "models.json"), "utf8")) as Models;

const SDXL = "sdxl/argus-photo-v2.safetensors";
const FLUX = "flux/argus-flux-dev.safetensors";
const KLEIN = "flux-klein/argus-klein-4b.safetensors";
const SD35 = "sd35/argus-sd35-medium.safetensors";
const PONY = "pony/argus-pony-v1.safetensors";

const health: Health = {
  version: "test",
  backends: { comfyui: true, ollama: true, singguard: true, nudenet: true, age: true },
  policies: ["default"],
  default_policy: "default",
  thinking: "cascade",
  nsfw_allowed: true,
  sfw_available: true,
  devmode: false,
};

function on(checkpoint: string, over: Partial<ComposeState> = {}): ComposeState {
  return { ...withCheckpoint(defaultCompose(health, null, models), checkpoint, models), userPrompt: "a flat blue field", ...over };
}

describe("choosing the workflow, as darkroom does", () => {
  it("picks by the checkpoint's family and the LoRA count", () => {
    expect(workflowFor(models, SDXL, 0)?.name).toBe("sdxl");
    expect(workflowFor(models, SDXL, 2)?.name).toBe("sdxl+lora2");
    expect(workflowFor(models, FLUX, 1)?.name).toBe("flux+lora1");
    expect(workflowFor(models, KLEIN, 1)).toBeNull();
    expect(workflowFor(models, PONY, 0)).toBeNull();
  });

  it("keeps following the family's slots when the LoRA count is one darkroom refuses", () => {
    expect(formWorkflow(models, KLEIN, 1)?.name).toBe("flux-klein");
    expect(formWorkflow(models, PONY, 0)).toBeNull();
  });

  it("reads which fields each family takes from its slots", () => {
    expect(usesSlot(workflowFor(models, FLUX, 0), "$guidance")).toBe(true);
    expect(usesSlot(workflowFor(models, FLUX, 0), "$negative")).toBe(false);
    expect(usesSlot(workflowFor(models, SDXL, 0), "$guidance")).toBe(false);
    expect(usesSlot(workflowFor(models, SDXL, 0), "$clip_skip")).toBe(true);
    expect(usesSlot(workflowFor(models, SD35, 0), "$negative")).toBe(true);
    expect(usesSlot(workflowFor(models, SD35, 0), "$clip_skip")).toBe(false);
    // No template known: the form as it was, with a negative prompt and no guidance.
    expect(usesSlot(null, "$negative")).toBe(true);
    expect(usesSlot(null, "$guidance")).toBe(false);
  });
});

describe("what renders", () => {
  it("says why a checkpoint with no workflow cannot be used", () => {
    expect(workflowBlock(models, PONY, 0)).toContain("pony");
    expect(generateBlock(health, null, on(PONY), null, models)).toBe(workflowBlock(models, PONY, 0));
    expect(generateBlock(health, null, on(SDXL), null, models)).toBeNull();
  });

  it("blocks a LoRA count the family has no template for, and says what to remove", () => {
    expect(workflowBlock(models, KLEIN, 1)).toBe("The flux-klein family renders without LoRAs. Remove 1.");
    expect(workflowBlock(models, SDXL, 3)).toBe("The sdxl family renders with 0, 1 or 2 LoRAs. Remove 1.");
    expect(workflowBlock(models, FLUX, 2)).toBeNull();
  });

  it("stops offering LoRAs once the next count would not render", () => {
    expect(loraAddBlock(models, SDXL, 1)).toBeNull();
    expect(loraAddBlock(models, SDXL, 2)).toBe("The sdxl family renders with at most 2 LoRAs.");
    expect(loraAddBlock(models, KLEIN, 0)).toBe("The flux-klein family renders without LoRAs.");
    const gap = { ...models, checkpoints: models.checkpoints.map((checkpoint) => (checkpoint.name === SDXL ? { ...checkpoint, lora_counts: [0, 2] } : checkpoint)) };
    expect(loraAddBlock(gap, SDXL, 0)).toBeNull();
    expect(loraAddBlock(gap, SDXL, 2)).toBe("The sdxl family renders with at most 2 LoRAs.");
  });

  it("starts on a checkpoint that renders", () => {
    const unrenderableDefault = { ...models, default_checkpoint: PONY };
    expect(defaultCompose(health, null, unrenderableDefault).checkpoint).toBe(models.checkpoints[0].name);
  });
});

describe("the request, shaped to the workflow", () => {
  it("sends guidance to Flux and no negative prompt, which its templates have no slot for", () => {
    const request = toRequest(on(FLUX, { negativePrompt: "blurry" }), true, models);
    expect(request.sampling.guidance).toBe(DEFAULT_GUIDANCE);
    expect(request.negative_prompt).toBe("");
  });

  it("sends no guidance to SDXL, and keeps its negative prompt", () => {
    const request = toRequest(on(SDXL, { negativePrompt: "blurry" }), true, models);
    expect("guidance" in request.sampling).toBe(false);
    expect(request.negative_prompt).toBe("blurry");
  });

  it("keeps the negative prompt in the form across a family with no slot for it", () => {
    const klein = withCheckpoint(on(SDXL, { negativePrompt: "blurry" }), KLEIN, models);
    expect(toRequest(klein, true, models).negative_prompt).toBe("");
    expect(toRequest(withCheckpoint(klein, SDXL, models), true, models).negative_prompt).toBe("blurry");
  });

  it("sends clip skip above 2 only to a template that has the slot", () => {
    const deep = (checkpoint: string) => {
      const state = on(checkpoint);
      return toRequest({ ...state, sampling: { ...state.sampling, clip_skip: 3 } }, true, models).sampling.clip_skip;
    };
    expect(deep(SDXL)).toBe(3);
    expect(deep(SD35)).toBe(1);
    const two = on(SD35);
    expect(toRequest({ ...two, sampling: { ...two.sampling, clip_skip: 2 } }, true, models).sampling.clip_skip).toBe(2);
  });

  it("refills a Flux record's guidance and leaves its negative prompt empty", () => {
    const record = fixtureRecord("fx-passed-noage");
    expect(record.request.workflow).toBe("flux");
    const state = fromRecord(record, on(SDXL));
    expect(state.checkpoint).toBe(FLUX);
    expect(toRequest(state, true, models).sampling.guidance).toBe(3.5);
    expect(toRequest(state, true, models).negative_prompt).toBe("");
  });
});

describe("per-family sampling", () => {
  it("moves to the family's starting values when the family changes, and keeps the size", () => {
    const sdxl = on(SDXL);
    const flux = withCheckpoint({ ...sdxl, sampling: { ...sdxl.sampling, width: 768 } }, FLUX, models);
    expect(flux.sampling).toMatchObject({ sampler: "euler", scheduler: "simple", steps: 20, cfg: 1, guidance: 3.5, width: 768 });
    expect(withCheckpoint(flux, SD35, models).sampling).toMatchObject({ sampler: "euler", scheduler: "sgm_uniform", cfg: 4, guidance: null });
    expect(withCheckpoint(flux, KLEIN, models).sampling.steps).toBe(4);
  });

  it("leaves the sampling alone within a family", () => {
    const tuned = { ...on(SDXL), sampling: { ...on(SDXL).sampling, steps: 40 } };
    expect(withCheckpoint(tuned, "sdxl/argus-base-v1.safetensors", models).sampling.steps).toBe(40);
  });

  it("does not pick a sampler or scheduler the server does not offer", () => {
    const narrow = { ...models, schedulers: ["karras"] };
    const current = on(SDXL).sampling;
    expect(familySampling(current, narrow.checkpoints.find((c) => c.name === FLUX)!, narrow).scheduler).toBe("karras");
  });

  it("gives schnell a few steps", () => {
    const schnell = { name: "flux/flux1-schnell.safetensors", family: "flux", lora_counts: [0] };
    expect(familySampling(on(SDXL).sampling, schnell, models).steps).toBe(4);
  });
});

describe("image-to-image and inpainting templates", () => {
  const image = { id: 1, name: "in.png", format: "png" as const, bytes: 10, width: 512, height: 512, dataBase64: "AAAA", previewUrl: "data:image/png;base64,AAAA" };
  const mask = { origin: "painted" as const, width: 512, height: 512, dataBase64: "BBBB", previewUrl: "data:image/png;base64,BBBB", fraction: 0.25 };

  it("chooses by mode, so text-to-image never lands on an img2img template and back", () => {
    expect(workflowFor(models, SDXL, 0)?.name).toBe("sdxl");
    expect(workflowFor(models, SDXL, 0, "img2img")?.name).toBe("sdxl+img2img");
    expect(workflowFor(models, SDXL, 1, "inpaint")?.name).toBe("sdxl+lora1+inpaint");
    expect(workflowFor(models, FLUX, 0, "img2img")).toBeNull();
  });

  it("offers an input image only where the checkpoint has a template for it at this LoRA count, and says why not", () => {
    expect(modeBlock(models, SDXL, 1, "img2img")).toBeNull();
    expect(modeBlock(models, SDXL, 2, "img2img")).toBe("The sdxl family renders image-to-image with 0 or 1 LoRAs, and this form has 2.");
    expect(modeBlock(models, FLUX, 0, "inpaint")).toBe("The flux family has no inpainting workflow on this server.");
  });

  it("blocks Generate where darkroom would refuse the mode, and never falls back to text", () => {
    expect(generateBlock(health, null, on(FLUX, { initImage: image }), null, models)).toBe("The flux family has no image-to-image workflow on this server. Remove the input image, or pick another checkpoint.");
    expect(generateBlock(health, null, on(SDXL, { initImage: image, mask }), null, models)).toBeNull();
    expect(workflowBlock(models, SDXL, 2, "inpaint")).toBe("The sdxl family renders inpainting with 0 or 1 LoRAs. Remove 1.");
    expect(loraAddBlock(models, SDXL, 1, "img2img")).toBe("The sdxl family renders image-to-image with at most 1 LoRA.");
  });

  it("sends the input and mask with Generate, and never to pre-flight or into the compared key", () => {
    const state = on(SDXL, { initImage: image, mask, denoise: 0.9 });
    const request = toRequest(state, true, models);
    expect(request.init_image).toEqual({ data_base64: "AAAA", denoise: 0.9, mask_base64: "BBBB" });
    expect(withoutPixels(request).init_image).toBeUndefined();
    expect(preflightKey(request)).not.toContain("AAAA");
    expect(preflightKey(request)).toBe(preflightKey(toRequest(on(SDXL, { denoise: 0.9 }), true, models)));
    expect(toRequest(on(SDXL, { initImage: image }), true, models).init_image).toEqual({ data_base64: "AAAA", denoise: 0.5 });
  });

  it("asks for the input again when Regenerate refills an image-to-image record, which keeps no pixels", () => {
    const record = fixtureRecord("fx-inpaint-passed");
    const state = fromRecord(record, on(SDXL));
    expect(state.initImage).toBeNull();
    expect(state.denoise).toBe(0.9);
    expect(state.recordInput?.mask?.masked_fraction).toBe(0.25);
    expect(generateBlock(health, null, state, null, models)).toBe(RECORD_INPUT_BLOCK);
    expect(generateBlock(health, null, { ...state, recordInput: null }, null, models)).toBeNull();
    expect(generateBlock(health, null, { ...state, initImage: image }, null, models)).toBeNull();
  });
});
