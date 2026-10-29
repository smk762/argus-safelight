import { describe, expect, it } from "vitest";

import { fixtureRecords } from "./fixture.test-util";
import { EMPTY_FILTER, historyQuery, parseHistoryFilter } from "./historyQuery";
import { promptChangedVerdict, rowDisagrees, policyRows } from "./shields";

describe("history filter in the URL", () => {
  it("round-trips every field", () => {
    const filter = { outcome: "review" as const, mode: "nsfw" as const, changed: true };
    expect(historyQuery(filter)).toBe("?outcome=review&mode=nsfw&changed=1");
    expect(parseHistoryFilter(new URLSearchParams(historyQuery(filter)))).toEqual(filter);
  });

  it("is empty for no filter, and ignores unknown values", () => {
    expect(historyQuery(EMPTY_FILTER)).toBe("");
    expect(parseHistoryFilter(new URLSearchParams(""))).toEqual(EMPTY_FILTER);
    expect(parseHistoryFilter(new URLSearchParams("outcome=bogus&mode=loud&changed=maybe"))).toEqual(EMPTY_FILTER);
  });
});

describe("Prompt changed the verdict", () => {
  it("lists exactly the records whose isolated and with-prompt cells disagree", () => {
    const records = fixtureRecords();
    const listed = records.filter(promptChangedVerdict).map((record) => record.id);
    const expected = records.filter((record) => policyRows(record.guard).some((row) => row.pair && rowDisagrees(row.pair))).map((record) => record.id);
    expect(listed).toEqual(expected);
    expect(listed.sort()).toEqual(["fx-deleted-illegal", "fx-review-disagree"]);
  });
});
