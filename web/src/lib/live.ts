import type { RowPair } from "./shields";
import type { GenerateRequest, GenerationRecord, Preflight, ProgressEvent, ScanContext, ScanEvent } from "./types";

export type LivePhase = "idle" | "preflight" | "input" | "queued" | "rendering" | "scanning" | "complete" | "error";

/** One generation as the SSE stream reports it: the pre-flight verdict, the step bar, then the grid filling cell by cell. */
export interface LiveState {
  phase: LivePhase;
  request: GenerateRequest | null;
  enforcing: string;
  policies: string[];
  preflight: Preflight | null;
  progress: ProgressEvent | null;
  cells: Record<string, RowPair>;
  /** Image-to-image: what was sent, without its pixels. Null for text-to-image. */
  input: LiveInput | null;
  /** Image-to-image: the input image's own scan, filled from `input_scan` before anything renders. Empty for text-to-image. */
  inputCells: Record<string, RowPair>;
  record: GenerationRecord | null;
  error: string | null;
}

/** The input image of a running generation, as the live view describes it. Never the pixels. */
export interface LiveInput {
  width: number;
  height: number;
  denoise: number;
  /** Inpainting: the share the mask repaints. Null for plain image-to-image. */
  maskFraction: number | null;
}

export type LiveEvent =
  | { type: "start"; request: GenerateRequest; input?: LiveInput | null }
  | { type: "preflight"; preflight: Preflight }
  | { type: "queued" }
  | { type: "progress"; progress: ProgressEvent }
  | { type: "input_scan"; scan: ScanEvent }
  | { type: "scan"; scan: ScanEvent }
  | { type: "complete"; record: GenerationRecord }
  | { type: "error"; error: string }
  | { type: "reset" };

export const IDLE: LiveState = { phase: "idle", request: null, enforcing: "", policies: [], preflight: null, progress: null, cells: {}, input: null, inputCells: {}, record: null, error: null };

export const PHASE_LABEL: Record<LivePhase, string> = {
  idle: "Idle",
  preflight: "Pre-flight",
  input: "Input image",
  queued: "Queued",
  rendering: "Rendering",
  scanning: "Scanning",
  complete: "Done",
  error: "Failed",
};

function emptyCells(policies: string[]): Record<string, RowPair> {
  return Object.fromEntries(policies.map((name) => [name, { isolated: null, with_prompt: null }]));
}

export function liveReducer(state: LiveState, event: LiveEvent): LiveState {
  switch (event.type) {
    case "start": {
      const policies = [event.request.enforcing_policy, ...event.request.advisory_policies.filter((name) => name !== event.request.enforcing_policy)];
      return { ...IDLE, phase: "preflight", request: event.request, enforcing: event.request.enforcing_policy, policies, cells: emptyCells(policies), input: event.input ?? null, inputCells: event.input ? emptyCells(policies) : {} };
    }
    case "preflight": {
      const policies = [event.preflight.enforcing_policy, ...event.preflight.advisory_policies.filter((name) => name !== event.preflight.enforcing_policy)];
      const input = state.input != null;
      return {
        ...state,
        preflight: event.preflight,
        enforcing: event.preflight.enforcing_policy,
        policies,
        cells: emptyCells(policies),
        inputCells: input ? emptyCells(policies) : {},
        phase: event.preflight.outcome === "refused" ? state.phase : input ? "input" : "queued",
      };
    }
    case "input_scan": {
      const { policy, context, cell } = event.scan;
      const pair = state.inputCells[policy] ?? { isolated: null, with_prompt: null };
      return { ...state, phase: "input", inputCells: { ...state.inputCells, [policy]: { ...pair, [context]: cell } } };
    }
    case "queued":
      return { ...state, phase: "queued" };
    case "progress":
      return { ...state, phase: "rendering", progress: event.progress };
    case "scan": {
      const { policy, context, cell } = event.scan;
      const pair = state.cells[policy] ?? { isolated: null, with_prompt: null };
      const policies = state.policies.includes(policy) ? state.policies : [...state.policies, policy];
      return { ...state, phase: "scanning", policies, cells: { ...state.cells, [policy]: { ...pair, [context]: cell } } };
    }
    case "complete":
      return { ...state, phase: "complete", record: event.record };
    case "error":
      return { ...state, phase: "error", error: event.error };
    case "reset":
      return IDLE;
  }
}

export function scannedCount(state: LiveState, which: "cells" | "inputCells" = "cells"): { done: number; total: number } {
  const contexts: ScanContext[] = ["isolated", "with_prompt"];
  const cells = state[which];
  let done = 0;
  for (const name of state.policies) for (const context of contexts) if (cells[name]?.[context]) done += 1;
  return { done, total: state.policies.length * 2 };
}

export const RUNNING: readonly LivePhase[] = ["preflight", "input", "queued", "rendering", "scanning"];
export const isRunning = (state: LiveState): boolean => RUNNING.includes(state.phase);
