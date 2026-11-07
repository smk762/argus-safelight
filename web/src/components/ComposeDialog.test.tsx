// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { defaultCompose } from "@/lib/compose";

import { ComposeDialog } from "./ComposeDialog";

const state = { composerOpen: false, preflight: { state: "idle", result: null, error: null, forRequest: null } as { state: string; result: unknown; error: string | null; forRequest: string | null } };
const closeComposer = vi.fn();

vi.mock("./ComposeProvider", () => ({
  useCompose: () => ({
    compose: defaultCompose(null, null, null),
    ready: true,
    update: vi.fn(),
    check: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    running: false,
    preflight: state.preflight,
    preflightCurrent: true,
    composerOpen: state.composerOpen,
    closeComposer,
  }),
}));
vi.mock("./DarkroomProvider", () => ({
  useDarkroom: () => ({ health: null, policies: null, models: null, error: null }),
}));

beforeAll(() => {
  // jsdom has no <dialog> implementation.
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});
beforeEach(() => {
  state.composerOpen = false;
  state.preflight = { state: "idle", result: null, error: null, forRequest: null };
  closeComposer.mockReset();
});
afterEach(cleanup);

describe("ComposeDialog", () => {
  it("puts no form in the DOM while closed", () => {
    render(<ComposeDialog />);
    expect(screen.queryByLabelText("Prompt")).toBeNull();
  });

  it("shows the form when open, and Close closes it", () => {
    state.composerOpen = true;
    render(<ComposeDialog />);
    expect(screen.getByLabelText("Prompt")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Generate" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(closeComposer).toHaveBeenCalledTimes(1);
  });

  it("shows the pre-flight error beside the form", () => {
    state.composerOpen = true;
    state.preflight = { state: "error", result: null, error: "darkroom is down", forRequest: "{}" };
    render(<ComposeDialog />);
    expect(screen.getByRole("alert").textContent).toContain("darkroom is down");
  });
});
