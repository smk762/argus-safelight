// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { fixtureRecord, fixtureRecords } from "@/lib/fixture.test-util";

import { ResultView } from "./ResultView";

afterEach(cleanup);

describe("ResultView", () => {
  it("renders every fixture outcome", () => {
    for (const record of fixtureRecords()) {
      const { unmount } = render(<ResultView record={record} />);
      expect(screen.getByRole("article")).toBeTruthy();
      unmount();
    }
  });

  it("puts no image element in the DOM for a deleted, omitted, refused or failed record", () => {
    for (const id of ["fx-deleted-illegal", "fx-deleted-minor", "fx-deleted-unchecked", "fx-omitted-exposed", "fx-omitted-unchecked", "fx-refused", "fx-refused-illegal", "fx-failed"]) {
      const { container, unmount } = render(<ResultView record={fixtureRecord(id)} />);
      expect(container.querySelectorAll("img, picture, canvas, video").length, id).toBe(0);
      unmount();
    }
  });

  it("loads a served image by record id, never by path", () => {
    const { container } = render(<ResultView record={fixtureRecord("fx-passed")} />);
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toMatch(/\/image\/fx-passed$/);
    for (const element of container.querySelectorAll("[src], [href]")) {
      expect(element.getAttribute("src") ?? element.getAttribute("href")).not.toContain(".png");
    }
  });

  it("makes deleted and omitted read differently", () => {
    render(<ResultView record={fixtureRecord("fx-deleted-illegal")} />);
    expect(screen.getByRole("group", { name: "Deleted image" }).textContent).toContain("destroyed");
    cleanup();
    render(<ResultView record={fixtureRecord("fx-omitted-exposed")} />);
    const omitted = screen.getByRole("group", { name: "Omitted image" });
    expect(omitted.textContent).toContain("withheld");
    expect(omitted.textContent).not.toContain("destroyed");
    expect(omitted.textContent).toContain("0.41");
  });

  it("names the rule, policy and context on a deleted tile, and the tools on a minor-exposed one", () => {
    render(<ResultView record={fixtureRecord("fx-deleted-illegal")} />);
    expect(screen.getByRole("group", { name: "Deleted image" }).textContent).toContain("H. Non-Consensual Sexual Content fired under adult-granular, in the with prompt scan");
    cleanup();
    render(<ResultView record={fixtureRecord("fx-deleted-minor")} />);
    const tile = screen.getByRole("group", { name: "Deleted image" });
    expect(tile.textContent).toContain("MiVOLO age estimate under 18 together with NudeNet exposure");
    expect(tile.textContent?.toLowerCase()).not.toContain("a minor");
  });

  it("never shows an age without MiVOLO beside it", () => {
    const { container } = render(<ResultView record={fixtureRecord("fx-deleted-minor")} />);
    const text = container.textContent ?? "";
    for (const line of ["MiVOLO estimate: 24", "MiVOLO estimate: 17", "MiVOLO estimate: 26"]) expect(text).toContain(line);
    expect(container.querySelector('[title*="can be wrong"]')).toBeTruthy();
    expect(text).not.toMatch(/\bAge\b\s*:/);
  });

  it("shows the refusing rule and the judged prompt for a refused record", () => {
    render(<ResultView record={fixtureRecord("fx-refused")} />);
    const panel = screen.getByRole("group", { name: "Refused at pre-flight" });
    expect(panel.textContent).toContain("A. Sexual Content Risk");
    expect(panel.textContent).toContain("default");
    expect(panel.textContent).toContain("boudoir photo set, silk sheets");
  });

  it("marks a row whose scans disagree and outlines the with-prompt cell that turned", () => {
    render(<ResultView record={fixtureRecord("fx-review-disagree")} />);
    expect(screen.getAllByLabelText("scans disagree").length).toBe(1);
    const turned = screen.getByRole("button", { name: "adult-granular · With prompt: flagged B" });
    expect(turned.className).toContain("outline-dashed");
  });

  it("keeps a blurred review image in the DOM behind a Reveal button", () => {
    const { container } = render(<ResultView record={fixtureRecord("fx-review-disagree")} />);
    expect(container.querySelector("img")?.className).toContain("blur");
    expect(screen.getByRole("button", { name: "Reveal" })).toBeTruthy();
  });
});
