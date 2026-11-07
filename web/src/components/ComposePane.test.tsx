// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IDLE, type LiveState } from "@/lib/live";

import { ComposePane } from "./ComposePane";

const state = { live: IDLE as LiveState };
const replace = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("./ComposeProvider", () => ({ useCompose: () => ({ live: state.live, stop: vi.fn(), clearLive: vi.fn() }) }));

beforeEach(() => {
  state.live = IDLE;
  replace.mockReset();
});
afterEach(cleanup);

describe("ComposePane", () => {
  it("goes to the history when no generation is in flight", () => {
    const { container } = render(<ComposePane />);
    expect(replace).toHaveBeenCalledWith("/history");
    expect(container.textContent).toBe("");
  });

  it("stays and shows the generation while one is live", () => {
    state.live = { ...IDLE, phase: "rendering" };
    render(<ComposePane />);
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Generate" })).toBeTruthy();
  });
});
