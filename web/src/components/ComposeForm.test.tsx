// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultCompose, withCheckpoint, type ComposeState } from "@/lib/compose";
import type { Models } from "@/lib/types";

import { ComposeForm } from "./ComposeForm";

const models = JSON.parse(readFileSync(join(__dirname, "..", "..", "..", "fixture", "models.json"), "utf8")) as Models;
const FLUX = "flux/argus-flux-dev.safetensors";
const KLEIN = "flux-klein/argus-klein-4b.safetensors";
const PONY = "pony/argus-pony-v1.safetensors";

const view = { compose: defaultCompose(null, null, models) as ComposeState };
const update = vi.fn();

vi.mock("./ComposeProvider", () => ({
  useCompose: () => ({ compose: view.compose, ready: true, update, check: vi.fn(), start: vi.fn(), stop: vi.fn(), running: false, preflight: { state: "idle", result: null, error: null, forRequest: null } }),
}));
vi.mock("./DarkroomProvider", () => ({
  useDarkroom: () => ({ health: null, policies: null, models, error: null }),
}));
vi.mock("./PolicyPicker", () => ({ PolicyPicker: () => null }));

afterEach(() => {
  cleanup();
  update.mockReset();
});

function on(checkpoint: string, over: Partial<ComposeState> = {}) {
  view.compose = { ...withCheckpoint(defaultCompose(null, null, models), checkpoint, models), userPrompt: "a flat blue field", ...over };
  render(<ComposeForm />);
}

describe("ComposeForm offers what darkroom can render", () => {
  it("groups checkpoints by family, and lists one with no workflow without letting it be picked", () => {
    on(models.default_checkpoint!);
    const groups = [...document.querySelectorAll("#checkpoint optgroup")].map((group) => group.getAttribute("label"));
    expect(groups).toEqual(["sdxl", "flux", "flux-klein", "sd35", "pony"]);
    const pony = screen.getByRole("option", { name: /argus-pony-v1/ }) as HTMLOptionElement;
    expect(pony.disabled).toBe(true);
    expect(pony.textContent).toContain("no workflow");
    expect(screen.getByText("sdxl", { selector: ".font-mono" })).toBeTruthy();
  });

  it("asks Flux for guidance and drops the negative prompt it has no slot for", () => {
    on(FLUX);
    expect((screen.getByLabelText("Guidance") as HTMLInputElement).value).toBe("3.5");
    expect(screen.queryByLabelText("Negative prompt")).toBeNull();
    expect(screen.getByText(/the flux workflow has no slot for one/)).toBeTruthy();
  });

  it("shows SDXL its negative prompt and no guidance", () => {
    on(models.default_checkpoint!);
    expect(screen.getByLabelText("Negative prompt")).toBeTruthy();
    expect(screen.queryByLabelText("Guidance")).toBeNull();
  });

  it("moves to the family's sampling when the checkpoint changes", () => {
    on(models.default_checkpoint!);
    fireEvent.change(screen.getByLabelText("Checkpoint"), { target: { value: FLUX } });
    const next = update.mock.calls[0][0](view.compose) as ComposeState;
    expect(next.checkpoint).toBe(FLUX);
    expect(next.sampling).toMatchObject({ sampler: "euler", scheduler: "simple", cfg: 1, guidance: 3.5 });
  });

  it("stops adding LoRAs where the family's templates stop, and blocks a count it cannot render", () => {
    on(KLEIN, { loras: [{ name: "argus-style-soft.safetensors", weight: 1, trigger_words: [] }] });
    expect(screen.queryByRole("combobox", { name: "Add a LoRA" })).toBeNull();
    expect(screen.getByText(/renders without LoRAs\. No more can be added/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Generate" }) as HTMLButtonElement).disabled).toBe(true);
    // Pre-flight is the text check, and darkroom runs it whatever the workflow: only Generate waits.
    expect((screen.getByRole("button", { name: /Check/ }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getAllByText("The flux-klein family renders without LoRAs. Remove 1.").length).toBeGreaterThan(0);
  });

  it("says why a checkpoint with no workflow cannot run", () => {
    on(PONY);
    expect(screen.getAllByText(/No workflow renders the pony family/).length).toBeGreaterThan(0);
  });
});
