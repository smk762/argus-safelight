// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fixtureRecords } from "@/lib/fixture.test-util";
import { promptChangedVerdict } from "@/lib/shields";
import type { GenerationRecord } from "@/lib/types";

import { RecordNav } from "./RecordNav";

let store: GenerationRecord[] = [];
let search = "";
const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(search),
}));
vi.mock("@/lib/api", () => ({
  MAX_PAGE_SIZE: 200,
  getRecords: () => Promise.resolve({ records: store, total: store.length, page: 1, page_size: 200 }),
}));

beforeEach(() => {
  store = fixtureRecords().sort((a, b) => b.created_at.localeCompare(a.created_at));
  search = "";
  push.mockClear();
});
afterEach(cleanup);

const ids = () => store.map((record) => record.id);

describe("RecordNav", () => {
  it("shows the position and links both neighbours in history order", async () => {
    const id = ids()[2];
    render(<RecordNav id={id} />);
    expect(await screen.findByText(`3 of ${store.length}`)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Previous record/ }).getAttribute("href")).toBe(`/record/${ids()[1]}`);
    expect(screen.getByRole("link", { name: /Next record/ }).getAttribute("href")).toBe(`/record/${ids()[3]}`);
  });

  it("disables Previous on the first record and Next on the last, without wrapping", async () => {
    const { unmount } = render(<RecordNav id={ids()[0]} />);
    await screen.findByText(`1 of ${store.length}`);
    expect(screen.queryByRole("link", { name: /Previous record/ })).toBeNull();
    expect(screen.getByText("Previous").closest("a")?.getAttribute("aria-disabled")).toBe("true");
    unmount();
    render(<RecordNav id={ids().at(-1)!} />);
    await screen.findByText(`${store.length} of ${store.length}`);
    expect(screen.queryByRole("link", { name: /Next record/ })).toBeNull();
  });

  it("keeps to the history filter carried in the URL, and carries it on", async () => {
    search = "?changed=1";
    const changed = store.filter(promptChangedVerdict).map((record) => record.id);
    expect(changed.length).toBeGreaterThan(1);
    render(<RecordNav id={changed[0]} />);
    expect(await screen.findByText(`1 of ${changed.length}`)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Next record/ }).getAttribute("href")).toBe(`/record/${changed[1]}?changed=1`);
  });

  it("falls back to plain history order for a record outside the filter", async () => {
    search = "?outcome=failed";
    const id = store.find((record) => record.outcome === "passed")!.id;
    render(<RecordNav id={id} />);
    expect(await screen.findByText(`${ids().indexOf(id) + 1} of ${store.length}`)).toBeTruthy();
  });

  it("steps with the arrow keys, but not from a form field", async () => {
    render(
      <>
        <input aria-label="field" />
        <RecordNav id={ids()[2]} />
      </>,
    );
    await screen.findByText(`3 of ${store.length}`);
    fireEvent.keyDown(screen.getByLabelText("field"), { key: "ArrowRight" });
    expect(push).not.toHaveBeenCalled();
    fireEvent.keyDown(document.body, { key: "ArrowRight" });
    expect(push).toHaveBeenLastCalledWith(`/record/${ids()[3]}`);
    fireEvent.keyDown(document.body, { key: "ArrowLeft" });
    expect(push).toHaveBeenLastCalledWith(`/record/${ids()[1]}`);
    fireEvent.keyDown(document.body, { key: "ArrowLeft", metaKey: true });
    expect(push).toHaveBeenCalledTimes(2);
  });
});
