import { describe, expect, it } from "vitest";

import { defaultCompose, toRequest, withCheckpoint } from "./compose";
import type { Health, Models, Policies } from "./types";
import { workflowBlock } from "./workflows";

/**
 * Against a running darkroom, not the fixture: every checkpoint it lists, with 0 to 3 LoRAs, sent as the form sends
 * it. Darkroom chooses the workflow when a generation begins, so this posts to `/generate/stream`: darkroom must accept
 * exactly what the form offers and 400 exactly what it blocks. Each accepted request is a generation, so point it at
 * darkroom's demo (fake backends), never a server with a GPU. Skipped unless DARKROOM_CONTRACT_URL is set:
 *
 *   DARKROOM_CONTRACT_URL=http://127.0.0.1:8116 npx vitest run src/lib/workflows.contract.test.ts
 */
const BASE = process.env.DARKROOM_CONTRACT_URL;

describe.skipIf(!BASE)("the form against a live darkroom", () => {
  it("is refused by darkroom exactly where the form blocks Generate", async () => {
    const get = async <T>(path: string) => (await (await fetch(`${BASE}${path}`)).json()) as T;
    const idle = async () => {
      for (let tries = 0; tries < 300 && (await get<Health>("/health")).generating; tries++) await new Promise((resolve) => setTimeout(resolve, 200));
    };
    const [health, policies, models] = await Promise.all([get<Health>("/health"), get<Policies>("/policies"), get<Models>("/models")]);
    expect(models.workflows.length).toBeGreaterThan(0);
    const base = { ...defaultCompose(health, policies, models), userPrompt: "a flat blue field", negativePrompt: "blurry" };
    const mismatches: string[] = [];
    for (const checkpoint of models.checkpoints) {
      for (let count = 0; count <= 3; count++) {
        const loras = Array.from({ length: count }, (_, i) => ({ name: models.loras[i % models.loras.length].name, weight: 1, trigger_words: [] }));
        const state = { ...withCheckpoint(base, checkpoint.name, models), loras };
        const block = workflowBlock(models, checkpoint.name, count);
        await idle();
        const abort = new AbortController();
        const response = await fetch(`${BASE}/generate/stream`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(toRequest(state, false, models)), signal: abort.signal });
        const detail = response.ok ? "" : JSON.stringify(await response.json());
        abort.abort();
        if ((response.status === 400) !== (block != null) || (response.status !== 400 && !response.ok)) {
          mismatches.push(`${checkpoint.name} with ${count} LoRA(s): darkroom ${response.status} ${detail}, form ${block ?? "offers it"}`);
        }
      }
    }
    await idle();
    expect(mismatches).toEqual([]);
  }, 300_000);
});
