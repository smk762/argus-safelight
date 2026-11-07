// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Health } from "@/lib/types";

import { Shell } from "./Shell";

const state = { pathname: "/", running: false, health: null as Health | null, error: null as string | null };
const openComposer = vi.fn();

vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));
vi.mock("./ComposeProvider", () => ({ useCompose: () => ({ openComposer, running: state.running }) }));
vi.mock("./DarkroomProvider", () => ({ useDarkroom: () => ({ health: state.health, error: state.error, loading: false, reload: vi.fn() }) }));

const health = (comfyui: boolean) => ({ version: "1", default_policy: "default", thinking: "cascade", backends: { comfyui, ollama: true, singguard: true, nudenet: true, age: true } }) as Health;

beforeEach(() => {
  Object.assign(state, { pathname: "/", running: false, health: health(true), error: null });
  openComposer.mockReset();
});
afterEach(cleanup);

describe("Shell", () => {
  it("has one way to the form: no Generate page in the header", () => {
    render(<Shell>page</Shell>);
    expect(screen.queryByRole("link", { name: "Generate" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Compose" }));
    expect(openComposer).toHaveBeenCalledTimes(1);
  });

  it("names every header icon and marks the page it is on", () => {
    state.pathname = "/history";
    render(<Shell>page</Shell>);
    expect(screen.getByRole("link", { name: "History" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("button", { name: /theme/ })).toBeTruthy();
  });

  it("summarises darkroom in the status icon's name, with the detail beside it", () => {
    state.health = health(false);
    render(<Shell>page</Shell>);
    expect(screen.getByRole("button", { name: "Darkroom status: ComfyUI unreachable" })).toBeTruthy();
    expect(document.getElementById("darkroom-status")?.textContent).toContain("Renders the image.");
  });

  it("offers the way back to a running generation from another page, and only then", () => {
    state.pathname = "/history";
    render(<Shell>page</Shell>);
    expect(screen.queryByRole("link", { name: "Generation running" })).toBeNull();
    cleanup();
    state.running = true;
    render(<Shell>page</Shell>);
    expect(screen.getByRole("link", { name: "Generation running" }).getAttribute("href")).toBe("/");
    cleanup();
    state.pathname = "/";
    render(<Shell>page</Shell>);
    expect(screen.queryByRole("link", { name: "Generation running" })).toBeNull();
  });
});
