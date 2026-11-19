// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { fixtureRecords } from "./fixture.test-util";
import { applyHistoryFilter, keyBelongsToField, neighbours, recordHref } from "./historyNav";
import { EMPTY_FILTER } from "./historyQuery";
import { promptChangedVerdict } from "./shields";

describe("neighbours", () => {
  const ids = ["a", "b", "c"];
  it("gives the position and both neighbours in the middle", () => {
    expect(neighbours(ids, "b")).toEqual({ position: 2, total: 3, previous: "a", next: "c" });
  });
  it("stops at the ends rather than wrapping", () => {
    expect(neighbours(ids, "a")).toEqual({ position: 1, total: 3, previous: null, next: "b" });
    expect(neighbours(ids, "c")).toEqual({ position: 3, total: 3, previous: "b", next: null });
  });
  it("is null for a record not in the list", () => {
    expect(neighbours(ids, "z")).toBeNull();
  });
});

describe("applyHistoryFilter", () => {
  it("keeps everything with no filter, in order", () => {
    const records = fixtureRecords();
    expect(applyHistoryFilter(records, EMPTY_FILTER)).toEqual(records);
  });
  it("narrows to Prompt changed the verdict, as History does", () => {
    const records = fixtureRecords();
    const kept = applyHistoryFilter(records, { ...EMPTY_FILTER, changed: true });
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.every(promptChangedVerdict)).toBe(true);
  });
});

describe("recordHref", () => {
  it("carries the history filter", () => {
    expect(recordHref("fx-passed", EMPTY_FILTER)).toBe("/record/fx-passed");
    expect(recordHref("fx-passed", { ...EMPTY_FILTER, outcome: "review", changed: true })).toBe("/record/fx-passed?outcome=review&changed=1");
  });
});

describe("keyBelongsToField", () => {
  it("leaves arrows to form fields and open dialogs", () => {
    document.body.innerHTML = `<input id="i"><textarea id="t"></textarea><select id="s"></select><button id="b"></button><dialog open><button id="d"></button></dialog>`;
    for (const id of ["i", "t", "s", "d"]) expect(keyBelongsToField(document.getElementById(id)), id).toBe(true);
    expect(keyBelongsToField(document.getElementById("b"))).toBe(false);
    expect(keyBelongsToField(document.body)).toBe(false);
    expect(keyBelongsToField(null)).toBe(false);
  });
});
