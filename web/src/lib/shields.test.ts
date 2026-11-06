import { describe, expect, it } from "vitest";

import { fixtureRecord, fixtureRecords } from "./fixture.test-util";
import { firedCell, overallState, policyRows, promptChangedVerdict, promptTurned, reasonParts, rowDisagrees, ruleLetter, ruleLetters, shieldLabel, shieldMark, uncheckedCell, worstState } from "./shields";
import type { Cell, ScanPair } from "./types";

const cell = (state: Cell["state"], rules: string[] = []): Cell => ({
  state,
  result: state === "unchecked" ? null : { safe: state === "safe", rules, explanation: null, model: null, thinking: "fast" },
  error: state === "unchecked" ? "timeout" : null,
});
const pair = (isolated: Cell, with_prompt: Cell): ScanPair => ({ isolated, with_prompt });

describe("rule letters", () => {
  it("reads the letter off a rule as SingGuard names it", () => {
    expect(ruleLetter("H. Non-Consensual Sexual Content")).toBe("H");
    expect(ruleLetter("a. minors")).toBe("A");
    expect(ruleLetter("house style")).toBe("house style");
  });
  it("keeps each letter once, in order", () => {
    expect(ruleLetters(cell("flagged", ["B. Crimes", "C. Unethical", "B. Crimes"]).result)).toEqual(["B", "C"]);
    expect(ruleLetters(null)).toEqual([]);
  });
});

describe("marks and labels", () => {
  it("gives every state a mark that is not a colour", () => {
    expect(shieldMark("safe", [])).toBe("✓");
    expect(shieldMark("unchecked", [])).toBe("?");
    expect(shieldMark("pending", [])).toBe("…");
    expect(shieldMark("flagged", ["B"])).toBe("B");
    expect(shieldMark("illegal", ["A", "H"])).toBe("AH");
    expect(shieldMark("illegal", [])).toBe("✕");
  });
  it("labels flagged and illegal with their letters", () => {
    expect(shieldLabel("flagged", ["B"])).toBe("flagged B");
    expect(shieldLabel("illegal", ["A", "H"])).toBe("illegal A, H");
    expect(shieldLabel("safe")).toBe("safe");
  });
});

describe("worst state", () => {
  it("ranks illegal over flagged over unchecked over safe", () => {
    expect(worstState(["safe", "unchecked"])).toBe("unchecked");
    expect(worstState(["unchecked", "flagged"])).toBe("flagged");
    expect(worstState(["flagged", "illegal", "safe"])).toBe("illegal");
    expect(worstState([])).toBeNull();
  });
});

describe("rows", () => {
  it("puts the enforcing policy first and labels it", () => {
    const rows = policyRows(fixtureRecord("fx-review-agree").guard);
    expect(rows.map((row) => [row.policy, row.enforcing])).toEqual([
      ["default", true],
      ["adult-granular", false],
    ]);
  });
  it("flags a disagreement and a prompt that turned a green", () => {
    const disagree = pair(cell("safe"), cell("flagged", ["B. Crimes"]));
    expect(rowDisagrees(disagree)).toBe(true);
    expect(promptTurned(disagree)).toBe(true);
    const other = pair(cell("flagged", ["B. Crimes"]), cell("safe"));
    expect(rowDisagrees(other)).toBe(true);
    expect(promptTurned(other)).toBe(false);
    expect(rowDisagrees(pair(cell("safe"), cell("safe")))).toBe(false);
    expect(rowDisagrees(pair(cell("unchecked"), cell("safe"))), "no verdict cannot disagree").toBe(false);
    expect(rowDisagrees(pair(cell("safe"), cell("unchecked")))).toBe(false);
    expect(rowDisagrees(null)).toBe(false);
  });
});

describe("prompt changed the verdict", () => {
  it("lists exactly the fixture records whose isolated and with-prompt cells disagree", () => {
    const changed = fixtureRecords()
      .filter((record) => promptChangedVerdict(record))
      .map((record) => record.id)
      .sort();
    // fx-review-agree and fx-deleted-unchecked each have an unchecked cell, which is no verdict to disagree with.
    expect(changed).toEqual(["fx-deleted-illegal", "fx-review-disagree"]);
  });
});

describe("overall state", () => {
  it("takes the worst cell, and is null before any scan", () => {
    expect(overallState(fixtureRecord("fx-passed").guard)).toBe("safe");
    expect(overallState(fixtureRecord("fx-review-disagree").guard)).toBe("flagged");
    expect(overallState(fixtureRecord("fx-deleted-illegal").guard)).toBe("illegal");
    expect(overallState(fixtureRecord("fx-refused").guard)).toBeNull();
  });
});

describe("fired cell", () => {
  it("finds the illegal cell behind a rule code", () => {
    const fired = firedCell(fixtureRecord("fx-deleted-illegal"), "adult-granular:H");
    expect(fired?.policy).toBe("adult-granular");
    expect(fired?.context).toBe("with_prompt");
    expect(fired?.rule).toBe("H. Non-Consensual Sexual Content");
  });
  it("reads only the code's own policy, since a letter means something else under each", () => {
    const record = fixtureRecord("fx-review-agree");
    expect(firedCell(record, "default:A")?.rule).toBe("A. Sexual Content Risk");
    expect(firedCell(record, "adult-granular:A")).toBeNull();
  });
  it("names the rule the code gives, not the cell's first", () => {
    const record = structuredClone(fixtureRecord("fx-deleted-illegal"));
    record.guard.scans["adult-granular"].with_prompt.result!.rules = ["B. Real-World Crimes & Public Safety", "H. Non-Consensual Sexual Content"];
    expect(firedCell(record, "adult-granular:H")?.rule).toBe("H. Non-Consensual Sexual Content");
  });
  it("has nothing to find for a word, a bare letter or a code no cell carries", () => {
    const record = fixtureRecord("fx-deleted-illegal");
    expect(firedCell(record, "minor-exposed")).toBeNull();
    expect(firedCell(record, "H")).toBeNull();
    expect(firedCell(record, "adult-granular:I")).toBeNull();
    expect(firedCell(record, "adult:H")).toBeNull();
  });
  it("finds the enforcing unchecked cell behind an unchecked deletion", () => {
    const unchecked = uncheckedCell(fixtureRecord("fx-deleted-unchecked"));
    expect(unchecked?.policy).toBe("adult-granular");
    expect(unchecked?.cell.error).toBe("SingGuard timed out after 90s");
    expect(uncheckedCell(fixtureRecord("fx-passed"))).toBeNull();
  });
  it("ignores an unchecked advisory cell", () => {
    expect(uncheckedCell(fixtureRecord("fx-review-agree"))).toBeNull();
  });
});

describe("reason parts", () => {
  it("splits darkroom's joined reason", () => {
    expect(reasonParts("default:A, adult:H, minor-exposed")).toEqual(["default:A", "adult:H", "minor-exposed"]);
    expect(reasonParts("unchecked")).toEqual(["unchecked"]);
  });
  it("is empty when there is no reason", () => {
    expect(reasonParts(null)).toEqual([]);
    expect(reasonParts("")).toEqual([]);
  });
});
