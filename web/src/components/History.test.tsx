// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { fixtureRecords } from "@/lib/fixture.test-util";
import type { GenerationRecord, RecordPage } from "@/lib/types";

import { History } from "./History";

let store: GenerationRecord[] = [];
let devmode = false;
let search = "";
const replace = vi.fn((href: string) => {
  search = href.includes("?") ? href.slice(href.indexOf("?")) : "";
});
const purge = vi.fn();
const removeImage = vi.fn();
const purgeRecord = vi.fn();

let extra = 0;

function page(records: GenerationRecord[]): RecordPage {
  return { records, total: records.length + extra, page: 1, page_size: 200 };
}

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => "/history",
  useSearchParams: () => new URLSearchParams(search),
}));
vi.mock("./DarkroomProvider", () => ({
  useDarkroom: () => ({ health: { devmode }, reload: vi.fn() }),
}));
vi.mock("./ComposeProvider", () => ({ useCompose: () => ({ running: false }) }));
vi.mock("@/lib/api", () => ({
  MAX_PAGE_SIZE: 200,
  getRecords: (query: { outcome?: string | null; mode?: string | null }) =>
    Promise.resolve(page(store.filter((record) => (!query.outcome || record.outcome === query.outcome) && (!query.mode || record.request.mode === query.mode)))),
  imageUrl: (id: string) => `/image/${id}`,
  archiveUrl: () => "http://darkroom/archive",
  purge: () => purge(),
  removeImage: (id: string) => removeImage(id),
  purgeRecord: (id: string) => purgeRecord(id),
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
  store = fixtureRecords();
  extra = 0;
  devmode = false;
  search = "";
  replace.mockClear();
  purge.mockReset();
  removeImage.mockReset();
  purgeRecord.mockReset();
});
afterEach(cleanup);

describe("History", () => {
  it("lists the fixture and writes the filter to the URL", async () => {
    render(<History />);
    await waitFor(() => expect(screen.getAllByRole("listitem").length).toBe(store.length));
    fireEvent.change(screen.getByLabelText("Outcome"), { target: { value: "review" } });
    expect(replace).toHaveBeenCalledWith("/history?outcome=review", { scroll: false });
  });

  it("removes the images of the ticked rows, after asking, and leaves a row with no image alone", async () => {
    removeImage.mockResolvedValue({});
    render(<History />);
    await waitFor(() => expect(screen.getAllByRole("listitem").length).toBe(store.length));
    const passed = store.find((record) => record.id === "fx-passed")!;
    const refused = store.find((record) => record.id === "fx-refused")!;
    fireEvent.click(screen.getByLabelText(`Select ${passed.request.user_prompt}`));
    fireEvent.click(screen.getByLabelText(`Select ${refused.request.user_prompt}`));
    expect(screen.getByText("2 selected")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove 1 image" }));
    expect(removeImage).not.toHaveBeenCalled();
    expect(screen.getByText("Delete 1 image file? The records stay.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.getByText("Select all")).toBeTruthy());
    expect(removeImage.mock.calls).toEqual([["fx-passed"]]);
  });

  it("offers to purge a single record only in devmode, and asks first", async () => {
    render(<History />);
    await waitFor(() => expect(screen.getAllByRole("listitem").length).toBe(store.length));
    const refused = store.find((record) => record.id === "fx-refused")!;
    fireEvent.click(screen.getByLabelText(`Select ${refused.request.user_prompt}`));
    expect(screen.queryByRole("button", { name: /^Purge \d/ })).toBeNull();
    cleanup();

    devmode = true;
    purgeRecord.mockImplementation((id: string) => {
      store = store.filter((record) => record.id !== id);
      return Promise.resolve({ records: 1, images: 0 });
    });
    render(<History />);
    await waitFor(() => expect(screen.getAllByRole("listitem").length).toBe(store.length));
    fireEvent.click(screen.getByLabelText(`Select ${refused.request.user_prompt}`));
    fireEvent.click(screen.getByRole("button", { name: "Purge 1 record" }));
    expect(purgeRecord).not.toHaveBeenCalled();
    expect(screen.getByText(/Permanently delete 1 record/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByText(refused.request.user_prompt)).toBeNull());
    expect(purgeRecord.mock.calls).toEqual([["fx-refused"]]);
  });

  it("will not remove anything when no ticked row has an image, and keeps a failure ticked and said", async () => {
    removeImage.mockRejectedValue(new Error("darkroom is read-only"));
    render(<History />);
    await waitFor(() => expect(screen.getAllByRole("listitem").length).toBe(store.length));
    const refused = store.find((record) => record.id === "fx-refused")!;
    fireEvent.click(screen.getByLabelText(`Select ${refused.request.user_prompt}`));
    expect((screen.getByRole("button", { name: "Remove 0 images" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: "1 selected" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove 4 images" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Removed 0 of 4: darkroom is read-only"));
    expect(await screen.findByText("4 selected")).toBeTruthy();
  });

  it("marks a record whose image was removed, with no img element, and filters to those", async () => {
    store = store.map((record) => (record.id === "fx-passed" ? { ...record, removed_at: "2026-10-21T00:00:00Z" } : record));
    search = "?removed=1";
    const { container } = render(<History />);
    await waitFor(() => expect(screen.getAllByRole("listitem").length).toBe(1));
    expect(screen.getByText("image removed")).toBeTruthy();
    expect(container.querySelector("main li img, li img")).toBeNull();
    expect((screen.getByLabelText("Image removed") as HTMLInputElement).checked).toBe(true);
  });

  it("offers the rules on the records, by policy, and filters by the one in the URL", async () => {
    search = "?rule=adult-granular:A";
    render(<History />);
    await waitFor(() => expect(screen.getAllByRole("listitem").length).toBe(1));
    expect(screen.getByRole("link", { name: /schoolgirl/ })).toBeTruthy();
    const select = screen.getByLabelText("Rule") as HTMLSelectElement;
    expect(select.value).toBe("adult-granular:A");
    expect([...select.querySelectorAll("optgroup")].map((group) => group.label)).toEqual(["adult-granular", "default", "Other reasons"]);
    fireEvent.change(select, { target: { value: "" } });
    expect(replace).toHaveBeenCalledWith("/history", { scroll: false });
  });

  it("Prompt changed the verdict lists exactly the records whose cells disagree", async () => {
    search = "?changed=1";
    render(<History />);
    const expected = ["fx-deleted-illegal", "fx-review-disagree"];
    await waitFor(() => expect(screen.getAllByRole("listitem").length).toBe(expected.length));
    for (const id of expected) expect(screen.getByRole("link", { name: new RegExp(store.find((r) => r.id === id)!.request.user_prompt) })).toBeTruthy();
    expect((screen.getByLabelText(/Prompt changed the verdict/) as HTMLInputElement).checked).toBe(true);
  });

  it("says when darkroom holds more records than one page shows", async () => {
    extra = 40;
    render(<History />);
    expect(await screen.findByText(new RegExp(`Showing ${store.length} of ${store.length + 40} records`))).toBeTruthy();
  });

  it("keeps the focus in the purge dialog when the history re-renders, and counts images only from a full page", async () => {
    devmode = true;
    extra = 40;
    const { rerender } = render(<History />);
    await waitFor(() => expect(screen.getAllByRole("listitem").length).toBe(store.length));
    fireEvent.click(screen.getByRole("button", { name: "Purge all" }));
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(dialog.textContent).toContain(`${store.length + 40} records`));
    expect(dialog.textContent).toContain("all images");
    const input = screen.getByLabelText(/Type/) as HTMLInputElement;
    input.focus();
    rerender(<History />);
    expect(document.activeElement).toBe(input);
  });

  it("opens the purge confirm as a native modal with the focus on Cancel, and Cancel closes it", async () => {
    devmode = true;
    render(<History />);
    await waitFor(() => expect(screen.getAllByRole("listitem").length).toBe(store.length));
    fireEvent.click(screen.getByRole("button", { name: "Purge all" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.tagName).toBe("DIALOG");
    expect(dialog.hasAttribute("open")).toBe(true);
    expect(dialog.getAttribute("aria-modal")).toBeNull();
    const cancel = screen.getByRole("button", { name: "Cancel" });
    expect(document.activeElement).toBe(cancel);
    fireEvent.click(cancel);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(purge).not.toHaveBeenCalled();
  });

  it("has no purge button in the DOM unless /health reports devmode", async () => {
    render(<History />);
    await waitFor(() => expect(screen.getAllByRole("listitem").length).toBe(store.length));
    expect(screen.queryByRole("button", { name: "Purge all" })).toBeNull();
  });

  it("purges only after the archive link is offered and the word is typed, then the history is empty", async () => {
    devmode = true;
    purge.mockImplementation(() => {
      const result = { records: store.length, images: 0, comfyui_history: 0 };
      store = [];
      return Promise.resolve(result);
    });
    render(<History />);
    await waitFor(() => expect(screen.getAllByRole("listitem").length).toBe(store.length));
    fireEvent.click(screen.getByRole("button", { name: "Purge all" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("ComfyUI history");
    await waitFor(() => expect(dialog.textContent).toContain(`${fixtureRecords().length} records`));
    const archive = screen.getByRole("link", { name: "Download archive" }) as HTMLAnchorElement;
    expect(archive.href).toBe("http://darkroom/archive");
    const button = screen.getByRole("button", { name: "Purge" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Type/), { target: { value: "purg" } });
    expect(button.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Type/), { target: { value: "purge" } });
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    await waitFor(() => expect(purge).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(screen.getByRole("button", { name: "Compose" })).toBeTruthy());
    expect(screen.queryAllByRole("listitem").length).toBe(0);
  });
});
