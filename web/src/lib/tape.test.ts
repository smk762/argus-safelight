// The tape logic the static demo runs on, against the fixture's sample tape (fixture/sample-tape, `make sample-tape`),
// and the published tape's invariants (web/public/data-tape, whatever it was recorded from).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { fixtureRecords } from "./fixture.test-util";
import { isWithheld, parseTape, recordPage, servedImage, takeFor, takeRecords, tapeFileUrl, type Take, type Tape } from "./tape";
import type { GenerationRecord } from "./types";

const DIR = join(__dirname, "..", "..", "..", "fixture", "sample-tape");
const PUBLISHED = join(__dirname, "..", "..", "public", "data-tape");
const raw = (dir = DIR) => JSON.parse(readFileSync(join(dir, "tape.json"), "utf8"));
const tape = parseTape(raw());
const take = (id: string, dir = DIR) => JSON.parse(readFileSync(join(dir, "takes", `${id}.json`), "utf8")) as Take;

/** The same rule as scripts/record_tape.py's blocked(). */
function blocked(record: GenerationRecord): boolean {
  const guard = record.guard;
  const cells = [...Object.values(guard.preflight), ...Object.values(guard.scans).flatMap((pair) => [pair.isolated, pair.with_prompt]), ...Object.values(guard.input?.scans ?? {}).flatMap((pair) => [pair.isolated, pair.with_prompt])];
  const reasons = (record.outcome_reason ?? "").replace("input image:", "").split(",").map((part) => part.trim());
  return record.critical || reasons.includes("minor-exposed") || cells.some((cell) => cell?.state === "illegal");
}

describe("the sample tape", () => {
  it("holds every fixture record, labelled sample data", () => {
    expect(tape.provenance.kind).toBe("sample");
    expect(tape.records.map((record) => record.id).sort()).toEqual(fixtureRecords().map((record) => record.id).sort());
  });

  it("has an image file for served records only", () => {
    for (const record of tape.records) expect(record.id in tape.files, record.id).toBe(servedImage(record));
    for (const id of tape.veiled) expect(servedImage(tape.records.find((record) => record.id === id)!)).toBe(true);
  });

  it("withholds every blocked request's words, in the record and in its take", () => {
    const fixture = new Map(fixtureRecords().map((record) => [record.id, record]));
    const hidden = tape.records.filter((record) => blocked(fixture.get(record.id)!));
    expect(hidden.map((record) => record.id).sort()).toEqual(["fx-deleted-illegal", "fx-deleted-minor", "fx-refused-illegal"]);
    for (const record of hidden) {
      const original = fixture.get(record.id)!;
      expect(isWithheld(record.request.user_prompt)).toBe(true);
      expect(record.request.final_prompt).toBe(record.request.user_prompt);
      // Verdict, rule, reason, timestamps and state stay.
      expect([record.outcome, record.outcome_reason, record.created_at, record.critical]).toEqual([original.outcome, original.outcome_reason, original.created_at, original.critical]);
      const text = JSON.stringify(record) + JSON.stringify(take(record.id));
      // The fixture's own text for these is already neutral ("[withheld: …]" in #46); a real prompt must not survive.
      if (!isWithheld(original.request.user_prompt)) expect(text).not.toContain(original.request.user_prompt);
      for (const cell of Object.values(record.guard.preflight)) if (cell.result) expect(cell.result.explanation).toBe("[withheld]");
    }
  });

  it("shows the words of a request nobody blocked", () => {
    const record = tape.records.find((entry) => entry.id === "fx-passed")!;
    expect(record.request.user_prompt).toBe("portrait of a lighthouse keeper at dusk");
    expect(record.image?.path).toBeNull();
  });

  it("replays each take's stream ending in its own record", () => {
    for (const id of tape.takes) {
      const { events, preflight } = take(id);
      expect(events[0][0]).toBe("preflight");
      const [last, data] = events.at(-1)!;
      expect(last).toBe("complete");
      expect((data as { record: GenerationRecord }).record.id).toBe(id);
      expect(preflight?.expansion_applied).toBe(false);
    }
  });
});

describe("the published tape", () => {
  const published = parseTape(raw(PUBLISHED));
  const words = (record: GenerationRecord) => [record.request.user_prompt, record.request.final_prompt];

  it("has an image file for served records only, and no file for a sample record", () => {
    for (const record of published.records) expect(record.id in published.files, record.id).toBe(servedImage(record) && !(published.illustrative ?? []).includes(record.id));
  });

  it("withholds every blocked request's words, in the record and in its take", () => {
    for (const record of published.records.filter(blocked)) {
      for (const text of words(record)) expect(isWithheld(text), record.id).toBe(true);
      if (published.takes.includes(record.id)) expect(JSON.stringify(take(record.id, PUBLISHED))).not.toMatch(/"user_prompt":"(?!\[withheld)/);
    }
  });

  it("replays each take's stream ending in its own record", () => {
    for (const id of published.takes) {
      const [last, data] = take(id, PUBLISHED).events.at(-1)!;
      expect(last).toBe("complete");
      expect((data as { record: GenerationRecord }).record.id).toBe(id);
    }
  });
});

describe("parseTape", () => {
  it("refuses an image file for a record darkroom did not serve", () => {
    const bad = raw();
    bad.files["fx-deleted-minor"] = "0123456789abcdef";
    expect(() => parseTape(bad)).toThrow(/only a served image may have a file/);
  });

  it("refuses another format or version", () => {
    expect(() => parseTape({ ...raw(), format: "argus-cull-tape" })).toThrow(/format/);
    expect(() => parseTape({ ...raw(), version: 2 })).toThrow(/version 2/);
  });
});

describe("tape lookups", () => {
  it("names no file for a record without a served image", () => {
    expect(tapeFileUrl("/t", tape, "fx-deleted-minor", "images")).toBe("");
    expect(tapeFileUrl("/t", tape, "fx-refused-illegal", "thumbs")).toBe("");
    expect(tapeFileUrl("/t", tape, "fx-passed", "images")).toMatch(/^\/t\/images\/[a-f0-9]{16}\.webp$/);
    expect(tapeFileUrl("/t", tape, "fx-passed", "veils")).toBe("");
    expect(tapeFileUrl("/t", tape, "fx-review-agree", "veils")).toMatch(/^\/t\/veils\/[a-f0-9]{16}-medium\.webp$/);
  });

  it("pages and filters the records as darkroom does", () => {
    const all = recordPage(tape, { pageSize: 200 });
    expect(all.total).toBe(tape.records.length);
    expect(recordPage(tape, { outcome: "deleted" }).records.every((record) => record.outcome === "deleted")).toBe(true);
    expect(recordPage(tape, { mode: "sfw" }).records.every((record) => record.request.mode === "sfw")).toBe(true);
    expect(recordPage(tape, { pageSize: 5, page: 2 }).records).toEqual(all.records.slice(5, 10));
  });

  it("finds a take by prompt and policies, and nothing for an edit", () => {
    const record = tape.records.find((entry) => entry.id === "fx-deleted-illegal")!;
    const request = { user_prompt: record.request.user_prompt, enforcing_policy: record.guard.enforcing_policy, advisory_policies: [...record.guard.advisory_policies] };
    expect(takeFor(tape, request)?.id).toBe("fx-deleted-illegal");
    expect(takeFor(tape, { ...request, user_prompt: `${request.user_prompt} more` })).toBeNull();
    expect(takeFor(tape, { ...request, advisory_policies: [] })).toBeNull();
    expect(takeFor(tape, { ...request, enforcing_policy: "default" })).toBeNull();
    expect(takeFor(null, request)).toBeNull();
  });

  it("offers text-to-image takes only", () => {
    const offered = takeRecords(tape as Tape);
    expect(offered.length).toBeGreaterThan(0);
    expect(offered.every((record) => !record.request.init_image)).toBe(true);
  });
});
