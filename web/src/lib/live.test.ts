import { describe, expect, it } from "vitest";

import { fixtureRecord } from "./fixture.test-util";
import { IDLE, isRunning, liveReducer, scannedCount, type LiveState } from "./live";
import type { Cell, GenerateRequest, Preflight } from "./types";

const request: GenerateRequest = {
  user_prompt: "a lemon",
  negative_prompt: "",
  expand: false,
  enforcing_policy: "adult-granular",
  advisory_policies: ["default", "adult-granular"],
  thinking: "cascade",
  checkpoint: "x",
  loras: [],
  seed: null,
  sampling: { sampler: "euler", scheduler: "normal", steps: 4, cfg: 5, clip_skip: 1, width: 512, height: 512 },
  nsfw_threshold: 0.2,
};

const safe: Cell = { state: "safe", result: { safe: true, rules: [], explanation: null, model: null, policy: "default", thinking: "fast" }, error: null };
const flagged: Cell = { state: "flagged", result: { safe: false, rules: ["B. Crimes"], explanation: "why", model: null, policy: "default", thinking: "slow" }, error: null };

const preflight = (outcome: Preflight["outcome"]): Preflight => ({
  mode: "nsfw",
  enforcing_policy: "adult-granular",
  advisory_policies: ["default"],
  thinking: "cascade",
  user_prompt: "a lemon",
  expanded_prompt: null,
  final_prompt: "a lemon",
  negative_prompt: "",
  framed_text: "",
  outcome,
  refusal: null,
  warnings: [],
  results: { "adult-granular": safe, default: safe },
});

describe("live reducer", () => {
  it("lays out the grid from the request, enforcing first and without repeats", () => {
    const state = liveReducer(IDLE, { type: "start", request });
    expect(state.phase).toBe("preflight");
    expect(state.policies).toEqual(["adult-granular", "default"]);
    expect(scannedCount(state)).toEqual({ done: 0, total: 4 });
    expect(isRunning(state)).toBe(true);
  });

  it("moves through queued, rendering and scanning as events arrive, filling cells one by one", () => {
    let state: LiveState = liveReducer(IDLE, { type: "start", request });
    state = liveReducer(state, { type: "preflight", preflight: preflight("ok") });
    expect(state.phase).toBe("queued");
    state = liveReducer(state, { type: "progress", progress: { step: 2, total: 4 } });
    expect(state.phase).toBe("rendering");
    state = liveReducer(state, { type: "scan", scan: { policy: "adult-granular", context: "isolated", cell: safe } });
    state = liveReducer(state, { type: "scan", scan: { policy: "adult-granular", context: "with_prompt", cell: flagged } });
    expect(state.phase).toBe("scanning");
    expect(scannedCount(state)).toEqual({ done: 2, total: 4 });
    expect(state.cells["adult-granular"].with_prompt?.state).toBe("flagged");
    expect(state.cells.default.isolated).toBeNull();
    const record = fixtureRecord("fx-review-disagree");
    state = liveReducer(state, { type: "complete", record });
    expect(state.phase).toBe("complete");
    expect(state.record?.id).toBe("fx-review-disagree");
    expect(isRunning(state)).toBe(false);
  });

  it("stays at pre-flight when the verdict refuses, and records an error", () => {
    let state = liveReducer(IDLE, { type: "start", request });
    state = liveReducer(state, { type: "preflight", preflight: preflight("refused") });
    expect(state.phase).toBe("preflight");
    state = liveReducer(state, { type: "error", error: "boom" });
    expect(state.phase).toBe("error");
    expect(state.error).toBe("boom");
    expect(liveReducer(state, { type: "reset" })).toEqual(IDLE);
  });
});

describe("the input image in the live view", () => {
  const input = { width: 512, height: 512, denoise: 0.5, maskFraction: null };

  it("adds the input's stage only when the request carried one, and fills its cells before queued", () => {
    let state = liveReducer(IDLE, { type: "start", request, input });
    expect(Object.keys(state.inputCells)).toEqual(["adult-granular", "default"]);
    state = liveReducer(state, { type: "preflight", preflight: preflight("ok") });
    expect(state.phase).toBe("input");
    state = liveReducer(state, { type: "input_scan", scan: { policy: "default", context: "isolated", cell: flagged } });
    expect(state.inputCells.default.isolated).toEqual(flagged);
    expect(state.cells.default.isolated).toBeNull();
    expect(scannedCount(state, "inputCells")).toEqual({ done: 1, total: 4 });
    expect(isRunning(state)).toBe(true);
    state = liveReducer(state, { type: "queued" });
    expect(state.phase).toBe("queued");
  });

  it("goes straight to queued for text-to-image", () => {
    const state = liveReducer(liveReducer(IDLE, { type: "start", request }), { type: "preflight", preflight: preflight("ok") });
    expect(state.phase).toBe("queued");
    expect(state.input).toBeNull();
    expect(state.inputCells).toEqual({});
  });
});
