// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { fixtureRecord } from "@/lib/fixture.test-util";
import { IDLE, liveReducer, type LiveEvent } from "@/lib/live";
import type { GenerateRequest, Preflight } from "@/lib/types";

import { LiveView } from "./LiveView";

vi.mock("./PreflightPanel", () => ({ PreflightPanel: () => null }));
vi.mock("./ShieldGrid", () => ({ ShieldGrid: () => null }));

afterEach(cleanup);

/** Each stage's label and the bar's state: done, current (with its tone) or not reached. */
function bar(): string[] {
  return [...screen.getByRole("list", { name: "Stages" }).querySelectorAll("li")].map((item) => {
    const cls = item.querySelector("div")!.className;
    const state = cls.includes("bg-success") ? "done" : cls.includes("bg-error") ? "stopped" : cls.includes("bg-accent-primary") ? "current" : "-";
    return `${item.textContent}:${state}`;
  });
}

function streamed(id: string, events: (record: ReturnType<typeof fixtureRecord>) => LiveEvent[]) {
  const record = fixtureRecord(id);
  const request = { user_prompt: record.request.user_prompt, enforcing_policy: "default", advisory_policies: [] } as unknown as GenerateRequest;
  return events(record).reduce(liveReducer, liveReducer(IDLE, { type: "start", request, input: id === "fx-refused-input" ? { width: 512, height: 512, denoise: 0.6, maskFraction: null } : null }));
}

describe("the live view's stage bar", () => {
  it("marks nothing after a pre-flight refusal done, and the refused stage as stopped", () => {
    const live = streamed("fx-refused", (record) => [
      { type: "preflight", preflight: { enforcing_policy: "default", advisory_policies: [], outcome: "refused" } as unknown as Preflight },
      { type: "complete", record },
    ]);
    expect(live.phase).toBe("complete");
    render(<LiveView live={live} onStop={() => {}} onClear={() => {}} />);
    expect(bar()).toEqual(["Pre-flight:stopped", "Queued:-", "Rendering:-", "Scanning:-", "Done:-"]);
  });

  it("marks nothing after an input refusal done", () => {
    const live = streamed("fx-refused-input", (record) => [
      { type: "preflight", preflight: { enforcing_policy: "default", advisory_policies: [], outcome: "ok" } as unknown as Preflight },
      { type: "complete", record },
    ]);
    render(<LiveView live={live} onStop={() => {}} onClear={() => {}} />);
    expect(bar()).toEqual(["Pre-flight:done", "Input image:stopped", "Queued:-", "Rendering:-", "Scanning:-", "Done:-"]);
  });

  it("marks every stage done when a generation completes", () => {
    const live = streamed("fx-passed", (record) => [
      { type: "preflight", preflight: { enforcing_policy: "default", advisory_policies: [], outcome: "ok" } as unknown as Preflight },
      { type: "complete", record },
    ]);
    render(<LiveView live={live} onStop={() => {}} onClear={() => {}} />);
    expect(bar()).toEqual(["Pre-flight:done", "Queued:done", "Rendering:done", "Scanning:done", "Done:done"]);
  });
});
