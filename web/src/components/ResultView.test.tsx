// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
    for (const id of ["fx-deleted-illegal", "fx-deleted-minor", "fx-deleted-unchecked", "fx-omitted-exposed", "fx-omitted-unchecked", "fx-refused", "fx-refused-illegal", "fx-refused-input", "fx-failed"]) {
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

  it("shows the checkpoint as not resolved and leaves out the rows a refused record has no value for", () => {
    const { container } = render(<ResultView record={fixtureRecord("fx-refused")} />);
    const text = container.textContent ?? "";
    expect(text).toContain("not resolved");
    for (const label of ["Seed", "Sampler", "Size", "Engine", "Workflow"]) expect(screen.queryByText(label), label).toBeNull();
  });

  it("shows the sampling a refused record kept", () => {
    const record = fixtureRecord("fx-refused");
    const sampling = fixtureRecord("fx-passed").request.sampling;
    render(<ResultView record={{ ...record, request: { ...record.request, sampling } }} />);
    expect(screen.getByText("Sampler")).toBeTruthy();
    expect(screen.getByText("not resolved")).toBeTruthy();
  });

  it("says why a generation failed, from the record's reason", () => {
    render(<ResultView record={fixtureRecord("fx-failed")} />);
    expect(screen.getByRole("group", { name: "Failed generation" }).textContent).toContain("ComfyUI: websocket closed before the image arrived");
  });

  it("keeps the shields open and the record's details collapsed", () => {
    const { container } = render(<ResultView record={fixtureRecord("fx-review-disagree")} />);
    expect(screen.getByText("Output scans").closest("details")).toBeNull();
    for (const title of ["NudeNet and age estimate", "Prompts", "Parameters"]) {
      expect(screen.getByText(title).closest("details")?.open, title).toBe(false);
    }
    expect(container.textContent).toContain("MiVOLO estimate: 29");
  });

  it("opens a shield's detail in the top layer, so a scrolling grid cannot clip it", () => {
    render(<ResultView record={fixtureRecord("fx-review-disagree")} />);
    fireEvent.mouseEnter(screen.getByRole("button", { name: /adult-granular · With prompt/ }).parentElement!);
    const tip = screen.getByRole("tooltip");
    expect(tip.getAttribute("popover")).toBe("manual");
    expect(tip.textContent).toContain("B. Real-World Crimes & Public Safety");
  });

  it("keeps a refusal's rule in view and its reasoning folded", () => {
    render(<ResultView record={fixtureRecord("fx-refused")} />);
    const panel = screen.getByRole("group", { name: "Refused at pre-flight" });
    const reasoning = screen.getByText("SingGuard's reasoning").closest("details");
    expect(reasoning?.open).toBe(false);
    expect(reasoning?.textContent).toContain("boudoir photography");
    expect(reasoning?.textContent).not.toContain("fired under");
    expect(panel.textContent).toContain("A. Sexual Content Risk fired under");
  });

  it("says what the overall shield means, and credits SingGuard rather than the outcome", () => {
    render(<ResultView record={fixtureRecord("fx-passed")} />);
    expect(screen.getByText("SingGuard found no rule violations.")).toBeTruthy();
    cleanup();
    render(<ResultView record={fixtureRecord("fx-deleted-illegal")} />);
    expect(screen.getByText("SingGuard found an illegal rule. The scans show where.")).toBeTruthy();
    cleanup();
    // Deleted by the age rule with every cell safe: the note must not read as a clean bill of health.
    render(<ResultView record={fixtureRecord("fx-deleted-minor")} />);
    expect(screen.getByText("SingGuard found no rule violations.")).toBeTruthy();
    expect(screen.getByRole("group", { name: "Deleted image" }).textContent).toContain("destroyed");
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

  it("says a refused input image refused the attempt, on the input's own scan, with no picture of it", () => {
    const { container } = render(<ResultView record={fixtureRecord("fx-refused-input")} />);
    expect(screen.getByRole("group", { name: "Refused at the input image" })).toBeTruthy();
    expect(screen.getByText("The input image was refused. Nothing was generated.")).toBeTruthy();
    expect(screen.getByText(/NudeNet reported exposure in the input image \(score 0\.41\), which an SFW policy does not allow/)).toBeTruthy();
    expect(screen.getAllByText("input image: sfw-exposed").length).toBeGreaterThan(0);
    expect(container.querySelectorAll("img, picture, canvas, video").length).toBe(0);
    // The input card opens by itself, since it holds the reason.
    const card = screen.getByText("Input image").closest("details");
    expect(card?.open).toBe(true);
  });

  it("shows what darkroom kept of an inpainting input: size, denoise, hashes and the mask's share, and says it keeps no pixels", () => {
    const { container } = render(<ResultView record={fixtureRecord("fx-inpaint-passed")} />);
    const card = screen.getByText("Input image and mask").closest("details")!;
    expect(card.textContent).toContain("Darkroom never stores the input's pixels");
    expect(card.textContent).toContain("512 × 512");
    expect(card.textContent).toContain("0.9");
    expect(card.textContent).toContain("25%");
    expect(card.textContent).toContain("The mask was not scanned");
    // The only picture on the page is the output, by record id.
    expect([...container.querySelectorAll("img")].map((img) => img.getAttribute("src"))).toEqual([expect.stringContaining("/image/fx-inpaint-passed")]);
  });
});
