import { describe, expect, it } from "vitest";

import { ageEstimateLines, minorExposedText } from "./age";
import { fixtureRecord, fixtureRecords } from "./fixture.test-util";
import { deletedSummary, hasImage, omittedSummary } from "./outcome";

describe("age estimate wording", () => {
  it("names the tool on every line and never a bare age", () => {
    expect(ageEstimateLines(fixtureRecord("fx-deleted-minor").guard.age)).toEqual(["MiVOLO estimate: 24", "MiVOLO estimate: 17", "MiVOLO estimate: 26"]);
    expect(ageEstimateLines(null)).toEqual([]);
    expect(ageEstimateLines(fixtureRecord("fx-passed-noage").guard.age)).toEqual([]);
  });
  it("explains minor-exposed by the tools, not by a person", () => {
    const text = minorExposedText(fixtureRecord("fx-deleted-minor").guard.age);
    expect(text).toContain("MiVOLO age estimate under 18");
    expect(text).toContain("NudeNet exposure");
    expect(text.toLowerCase()).not.toContain("a minor");
  });
});

describe("deleted and omitted wording", () => {
  it("names the rule, policy and context for an illegal deletion", () => {
    const summary = deletedSummary(fixtureRecord("fx-deleted-illegal"));
    expect(summary.lines[0]).toBe("Rule H. Non-Consensual Sexual Content fired under adult-granular, in the with prompt scan.");
  });
  it("says a minor-exposed deletion came from the estimate and the exposure", () => {
    expect(deletedSummary(fixtureRecord("fx-deleted-minor")).lines[0]).toContain("MiVOLO age estimate under 18");
  });
  it("says an unchecked deletion failed closed", () => {
    const summary = deletedSummary(fixtureRecord("fx-deleted-unchecked"));
    expect(summary.lines[0]).toContain("with prompt scan under adult-granular");
    expect(summary.lines[0]).toContain("fails closed");
  });
  it("gives omitted its own words, with the score or the missing answer", () => {
    expect(omittedSummary(fixtureRecord("fx-omitted-exposed")).lines[0]).toBe("NudeNet reported exposure (score 0.41), so the image was not kept.");
    expect(omittedSummary(fixtureRecord("fx-omitted-unchecked")).lines[0]).toBe("NudeNet did not respond, so the image was not kept.");
    expect(omittedSummary(fixtureRecord("fx-omitted-exposed")).headline).not.toContain("destroyed");
  });
});

describe("hasImage", () => {
  it("is true only for passed and review records the user has not removed", () => {
    const withImage = fixtureRecords()
      .filter((record) => hasImage(record))
      .map((record) => record.id)
      .sort();
    expect(withImage).toEqual(["fx-passed", "fx-passed-noage", "fx-review-agree", "fx-review-disagree"]);
    expect(hasImage({ ...fixtureRecord("fx-passed"), removed_at: "2026-10-21T00:00:00Z" })).toBe(false);
  });
});
