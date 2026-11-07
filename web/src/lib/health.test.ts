import { describe, expect, it } from "vitest";

import { healthSummary } from "./health";
import type { Health } from "./types";

const health = (down: (keyof Health["backends"])[] = []): Health =>
  ({ backends: { comfyui: !down.includes("comfyui"), ollama: !down.includes("ollama"), singguard: !down.includes("singguard"), nudenet: !down.includes("nudenet"), age: !down.includes("age") } }) as Health;

describe("health summary", () => {
  it("is ok when every backend answers", () => {
    expect(healthSummary(health(), null)).toEqual({ tone: "ok", mark: "✓", label: "All backends reachable" });
  });
  it("is an error when Generate cannot run, and names what is missing", () => {
    expect(healthSummary(health(["comfyui"]), null)).toEqual({ tone: "error", mark: "✕", label: "ComfyUI unreachable" });
    expect(healthSummary(health(["singguard", "ollama"]), null).tone).toBe("error");
  });
  it("is a warning when only an optional backend is missing", () => {
    expect(healthSummary(health(["ollama", "age"]), null)).toEqual({ tone: "warning", mark: "!", label: "Ollama, Age check unreachable" });
  });
  it("says so when darkroom itself does not answer, or has not yet", () => {
    expect(healthSummary(health(), "fetch failed").tone).toBe("error");
    expect(healthSummary(null, null).tone).toBe("loading");
  });
});
