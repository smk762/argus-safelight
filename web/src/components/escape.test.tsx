// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ShieldCell } from "./ShieldCell";
import { Tip } from "./ui";

afterEach(cleanup);

// WCAG 1.4.13: what hover or focus shows, Escape hides, without the pointer or the focus moving.
describe("Escape dismisses hover and focus content", () => {
  it("hides a Tip until the pointer and the focus have left", () => {
    render(
      <Tip label="Compose">
        <button type="button">C</button>
      </Tip>,
    );
    const tip = screen.getByText("Compose");
    const wrapper = tip.parentElement!;
    fireEvent.mouseEnter(wrapper);
    expect(tip.className).toContain("group-hover:block");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(tip.className).not.toContain("group-hover:block");
    fireEvent.mouseLeave(wrapper);
    expect(tip.className).toContain("group-hover:block");
  });

  it("closes a shield's detail opened by hover, and the Escape goes no further", () => {
    render(<ShieldCell cell={null} heading="adult-granular" />);
    const button = screen.getByRole("button");
    fireEvent.mouseEnter(button.parentElement!);
    expect(screen.getByRole("tooltip")).toBeTruthy();
    const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    act(() => {
      document.dispatchEvent(escape);
    });
    expect(escape.defaultPrevented).toBe(true);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("closes a pinned shield's detail too", () => {
    render(<ShieldCell cell={null} heading="adult-granular" />);
    const button = screen.getByRole("button");
    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });
});
