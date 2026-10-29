// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { defaultCompose } from "@/lib/compose";
import { fixtureRecord } from "@/lib/fixture.test-util";

import { RecordActions } from "./RecordActions";

const push = vi.fn();
const replace = vi.fn();
const removeImage = vi.fn();
const running = { value: false };

vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));
vi.mock("./ComposeProvider", () => ({
  useCompose: () => ({ compose: defaultCompose(null, null, null), replace, running: running.value }),
}));
vi.mock("@/lib/api", () => ({ removeImage: (id: string) => removeImage(id) }));

beforeEach(() => {
  push.mockReset();
  replace.mockReset();
  removeImage.mockReset();
  running.value = false;
});
afterEach(cleanup);

describe("RecordActions", () => {
  it("Regenerate from a deleted record refills the form with the same seed and parameters, then goes to Compose", () => {
    const record = fixtureRecord("fx-deleted-illegal");
    render(<RecordActions record={record} />);
    fireEvent.click(screen.getByRole("button", { name: "Regenerate" }));
    expect(replace).toHaveBeenCalledTimes(1);
    const state = replace.mock.calls[0][0];
    expect(state.seed).toBe(record.request.seed);
    expect(state.seedLocked).toBe(true);
    expect(state.userPrompt).toBe(record.request.user_prompt);
    expect(state.sampling).toEqual(record.request.sampling);
    expect(state.checkpoint).toBe(record.request.checkpoint.name);
    expect(state.enforcingPolicy).toBe(record.guard.enforcing_policy);
    expect(state.advisoryPolicies).toEqual(record.guard.advisory_policies);
    expect(push).toHaveBeenCalledWith("/");
  });

  it("does not offer Regenerate while a generation runs", () => {
    running.value = true;
    render(<RecordActions record={fixtureRecord("fx-passed")} />);
    expect((screen.getByRole("button", { name: "Regenerate" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("Copy record puts the record JSON on the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const record = fixtureRecord("fx-review-disagree");
    render(<RecordActions record={record} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy record" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy());
    expect(JSON.parse(writeText.mock.calls[0][0])).toEqual(record);
  });

  it("offers Remove image only for a record that still has an image, and asks first", async () => {
    for (const id of ["fx-deleted-illegal", "fx-omitted-exposed", "fx-refused", "fx-failed"]) {
      const { unmount } = render(<RecordActions record={fixtureRecord(id)} />);
      expect(screen.queryByRole("button", { name: "Remove image" }), id).toBeNull();
      unmount();
    }
    const record = fixtureRecord("fx-passed");
    const removed = { ...record, removed_at: "2026-01-01T00:00:00Z" };
    removeImage.mockResolvedValue(removed);
    const onRemoved = vi.fn();
    render(<RecordActions record={record} onRemoved={onRemoved} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove image" }));
    expect(removeImage).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Delete image" }));
    await waitFor(() => expect(onRemoved).toHaveBeenCalledWith(removed));
    expect(removeImage).toHaveBeenCalledWith(record.id);
  });
});
