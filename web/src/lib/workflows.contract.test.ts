import { deflateSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { defaultCompose, toRequest, withCheckpoint, type ComposeState } from "./compose";
import { maskSizeBlock, maskedFraction, type InputImage, type InputMask } from "./initImage";
import type { Health, Models, Policies } from "./types";
import { workflowBlock, type RenderMode } from "./workflows";

/**
 * Against a running darkroom, not the fixture: every checkpoint it lists, with 0 to 3 LoRAs, in every mode (text, an
 * input image, an input image with a mask), sent as the form sends it. Darkroom chooses the workflow when a generation
 * begins, so this posts to `/generate/stream`: darkroom must accept exactly what the form offers and 400 exactly what
 * it blocks. Each accepted request is a generation, so point it at darkroom's demo (fake backends), never a server
 * with a GPU. Skipped unless DARKROOM_CONTRACT_URL is set:
 *
 *   DARKROOM_CONTRACT_URL=http://127.0.0.1:8116 npx vitest run src/lib/workflows.contract.test.ts
 */
const BASE = process.env.DARKROOM_CONTRACT_URL;

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (data: Buffer) => {
  let c = 0xffffffff;
  for (const byte of data) c = CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

/** A flat greyscale PNG: an input image (mid grey) or a mask (white repaints, black keeps). */
function png(width: number, height: number, grey: number): string {
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(4);
    head.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(crc32(body));
    return Buffer.concat([head, body, tail]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // greyscale
  const rows = Buffer.concat(Array.from({ length: height }, () => Buffer.concat([Buffer.from([0]), Buffer.alloc(width, grey)])));
  const file = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
  return file.toString("base64");
}

const SIDE = 64;
const image: InputImage = { id: 1, name: "grey.png", format: "png", bytes: 0, width: SIDE, height: SIDE, dataBase64: png(SIDE, SIDE, 128), previewUrl: "" };
const mask = (side = SIDE, grey = 255): InputMask => ({ origin: "upload", width: side, height: side, dataBase64: png(side, side, grey), previewUrl: "", fraction: grey >= 128 ? 1 : 0 });

describe.skipIf(!BASE)("the form against a live darkroom", () => {
  const get = async <T>(path: string) => (await (await fetch(`${BASE}${path}`)).json()) as T;
  const idle = async () => {
    for (let tries = 0; tries < 300 && (await get<Health>("/health")).generating; tries++) await new Promise((resolve) => setTimeout(resolve, 200));
  };
  const send = async (state: ComposeState, models: Models) => {
    await idle();
    const abort = new AbortController();
    const response = await fetch(`${BASE}/generate/stream`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(toRequest(state, false, models)), signal: abort.signal });
    const detail = response.ok ? "" : JSON.stringify(await response.json());
    abort.abort();
    return { status: response.status, detail };
  };

  it("is refused by darkroom exactly where the form blocks Generate, in every mode", async () => {
    const [health, policies, models] = await Promise.all([get<Health>("/health"), get<Policies>("/policies"), get<Models>("/models")]);
    expect(models.workflows.length).toBeGreaterThan(0);
    const base = { ...defaultCompose(health, policies, models), userPrompt: "a flat blue field", negativePrompt: "blurry" };
    const modes: [RenderMode, Partial<ComposeState>][] = [
      ["txt2img", {}],
      ["img2img", { initImage: image }],
      ["inpaint", { initImage: image, mask: mask() }],
    ];
    const mismatches: string[] = [];
    for (const checkpoint of models.checkpoints) {
      for (const [mode, extra] of modes) {
        for (let count = 0; count <= 3; count++) {
          const loras = Array.from({ length: count }, (_, i) => ({ name: models.loras[i % models.loras.length].name, weight: 1, trigger_words: [] }));
          const state = { ...withCheckpoint(base, checkpoint.name, models), loras, ...extra };
          const block = workflowBlock(models, checkpoint.name, count, mode);
          const { status, detail } = await send(state, models);
          if ((status === 400) !== (block != null) || (status !== 400 && status !== 200)) {
            mismatches.push(`${checkpoint.name}, ${mode}, ${count} LoRA(s): darkroom ${status} ${detail}, form ${block ?? "offers it"}`);
          }
        }
      }
    }
    await idle();
    expect(mismatches).toEqual([]);
  }, 600_000);

  it("refuses the masks the form refuses: another size, or nothing white", async () => {
    const [health, policies, models] = await Promise.all([get<Health>("/health"), get<Policies>("/policies"), get<Models>("/models")]);
    const inpaints = models.checkpoints.find((checkpoint) => (checkpoint.inpaint_lora_counts ?? []).includes(0));
    if (!inpaints) return;
    const base = { ...withCheckpoint(defaultCompose(health, policies, models), inpaints.name, models), userPrompt: "a flat blue field" };
    const small = mask(SIDE / 2);
    expect(maskSizeBlock(small, image)).not.toBeNull();
    const wrongSize = await send({ ...base, initImage: image, mask: small }, models);
    expect(wrongSize.status).toBe(400);
    expect(wrongSize.detail).toContain("must match");
    const black = mask(SIDE, 0);
    expect(maskedFraction(new Uint8ClampedArray([0, 0, 0, 255]))).toBe(0);
    const nothing = await send({ ...base, initImage: image, mask: black }, models);
    expect(nothing.status).toBe(400);
    expect(nothing.detail).toContain("masks nothing");
  }, 60_000);
});
