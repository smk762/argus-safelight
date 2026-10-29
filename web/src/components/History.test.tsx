// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

function page(records: GenerationRecord[]): RecordPage {
  return { records, total: records.length, page: 1, page_size: 500 };
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
  getRecords: (query: { outcome?: string | null; mode?: string | null }) =>
    Promise.resolve(page(store.filter((record) => (!query.outcome || record.outcome === query.outcome) && (!query.mode || record.request.mode === query.mode)))),
  imageUrl: (id: string) => `/image/${id}`,
  archiveUrl: () => "http://darkroom/archive",
  purge: () => purge(),
}));

beforeEach(() => {
  store = fixtureRecords();
  devmode = false;
  search = "";
  replace.mockClear();
  purge.mockReset();
});
afterEach(cleanup);

describe("History", () => {
  it("lists the fixture and writes the filter to the URL", async () => {
    render(<History />);
    await waitFor(() => expect(screen.getAllByRole("listitem").length).toBe(store.length));
    fireEvent.change(screen.getByLabelText("Outcome"), { target: { value: "review" } });
    expect(replace).toHaveBeenCalledWith("/history?outcome=review", { scroll: false });
  });

  it("Prompt changed the verdict lists exactly the records whose cells disagree", async () => {
    search = "?changed=1";
    render(<History />);
    const expected = ["fx-deleted-illegal", "fx-review-disagree"];
    await waitFor(() => expect(screen.getAllByRole("listitem").length).toBe(expected.length));
    for (const id of expected) expect(screen.getByRole("link", { name: new RegExp(store.find((r) => r.id === id)!.request.user_prompt) })).toBeTruthy();
    expect((screen.getByLabelText(/Prompt changed the verdict/) as HTMLInputElement).checked).toBe(true);
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
    await waitFor(() => expect(screen.getByText("No records match.")).toBeTruthy());
    expect(screen.queryAllByRole("listitem").length).toBe(0);
  });
});
