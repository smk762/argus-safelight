import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { defaultCompose, enforceBlock, fromRecord, generateBlock, normaliseCompose, policyMode, toRequest } from "./compose";
import { fixtureRecord } from "./fixture.test-util";
import type { Health, Models, Policies } from "./types";

const FIXTURE = join(__dirname, "..", "..", "..", "fixture");
const policyFile = JSON.parse(readFileSync(join(FIXTURE, "policies.json"), "utf8")) as { default: string; policies: Omit<Policies["policies"][number], "enforceable">[] };
const models = JSON.parse(readFileSync(join(FIXTURE, "models.json"), "utf8")) as Models;

const health = (over: Partial<Health> = {}): Health => ({
  version: "test",
  backends: { comfyui: true, ollama: true, singguard: true, nudenet: true, age: true },
  policies: policyFile.policies.map((policy) => policy.name),
  default_policy: "adult-granular",
  thinking: "cascade",
  nsfw_allowed: true,
  sfw_available: true,
  devmode: false,
  ...over,
});

const policies = (nsfwAllowed = true, nudenet = true): Policies => ({
  default: nsfwAllowed ? "adult-granular" : "default",
  policies: policyFile.policies.map((policy) => ({ ...policy, enforceable: policy.mode === "nsfw" ? nsfwAllowed : nudenet })),
});

describe("defaults", () => {
  it("takes the enforcing default and thinking mode from the server", () => {
    const state = defaultCompose(health(), policies(), models);
    expect(state.enforcingPolicy).toBe("adult-granular");
    expect(state.thinking).toBe("cascade");
    expect(state.checkpoint).toBe(models.checkpoints[0].name);
    expect(state.seed).toBeNull();
    expect(state.seedLocked).toBe(false);
  });
  it("reads the mode from the catalogue, and by name before it loads", () => {
    expect(policyMode(policies(), "adult")).toBe("nsfw");
    expect(policyMode(null, "default")).toBe("sfw");
    expect(policyMode(null, "sfw-strict")).toBe("sfw");
    expect(policyMode(null, "anything-else")).toBe("nsfw");
  });
});

describe("normalise", () => {
  it("moves an NSFW enforcing policy off a server without --allow-nsfw, keeping it available as advisory", () => {
    const base = { ...defaultCompose(health(), policies(), models), enforcingPolicy: "adult-granular", advisoryPolicies: ["adult-granular", "default"] };
    const next = normaliseCompose(base, policies(false), models);
    expect(next.enforcingPolicy).toBe("default");
    expect(next.advisoryPolicies).toEqual(["adult-granular"]);
    expect(enforceBlock(policies(false).policies.find((policy) => policy.name === "adult")!)).toContain("--allow-nsfw");
  });
  it("drops advisory repeats and unknown models", () => {
    const base = { ...defaultCompose(health(), policies(), models), advisoryPolicies: ["adult-granular", "nope"], checkpoint: "gone.safetensors", loras: [{ name: "gone", weight: 1 }] };
    const next = normaliseCompose(base, policies(), models);
    expect(next.advisoryPolicies).toEqual([]);
    expect(next.checkpoint).toBe(models.checkpoints[0].name);
    expect(next.loras).toEqual([]);
  });
  it("returns the same object when nothing changes", () => {
    const base = defaultCompose(health(), policies(), models);
    expect(normaliseCompose(base, policies(), models)).toBe(base);
  });
});

describe("request", () => {
  it("sends a null seed unless it is locked", () => {
    const base = { ...defaultCompose(health(), policies(), models), seed: 42 };
    expect(toRequest(base).seed).toBeNull();
    expect(toRequest({ ...base, seedLocked: true }).seed).toBe(42);
  });
});

describe("from a record", () => {
  it("refills the form with the same seed and parameters from a deleted record", () => {
    const record = fixtureRecord("fx-deleted-illegal");
    const state = fromRecord(record, defaultCompose(health(), policies(), models));
    expect(state.seed).toBe(31337);
    expect(state.seedLocked).toBe(true);
    expect(state.userPrompt).toBe("sleeping figure, bedroom, candid");
    expect(state.expand).toBe(true);
    expect(state.sampling).toEqual(record.request.sampling);
    expect(state.enforcingPolicy).toBe("adult-granular");
    expect(state.advisoryPolicies).toEqual(["default"]);
    expect(toRequest(state).seed).toBe(31337);
  });
  it("carries LoRA weights and the NudeNet threshold", () => {
    const state = fromRecord(fixtureRecord("fx-review-disagree"), defaultCompose(health(), policies(), models));
    expect(state.loras).toEqual([{ name: "argus-light-studio.safetensors", weight: 0.5 }]);
    expect(state.nsfwThreshold).toBe(0.2);
  });
});

describe("generate gating", () => {
  const ready = { ...defaultCompose(health(), policies(), models), userPrompt: "a lemon" };
  it("needs health, SingGuard and a prompt", () => {
    expect(generateBlock(null, null, ready, policies())).toContain("/health");
    expect(generateBlock(null, "ECONNREFUSED", ready, policies())).toContain("not reachable");
    expect(generateBlock(health({ backends: { comfyui: true, ollama: true, singguard: false, nudenet: true, age: true } }), null, ready, policies())).toContain("SingGuard");
    expect(generateBlock(health(), null, { ...ready, userPrompt: " " }, policies())).toContain("prompt");
    expect(generateBlock(health(), null, ready, policies())).toBeNull();
  });
  it("refuses SFW generation without NudeNet", () => {
    expect(generateBlock(health({ sfw_available: false }), null, { ...ready, enforcingPolicy: "default" }, policies())).toContain("NudeNet");
    expect(generateBlock(health({ sfw_available: false }), null, ready, policies())).toBeNull();
  });
});
