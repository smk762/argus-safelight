import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { GenerationRecord } from "./types";

const RECORDS = join(__dirname, "..", "..", "..", "fixture", "records");

/** The committed fixture, read by the tests so the UI's logic is checked against the records the mock serves. */
export function fixtureRecords(): GenerationRecord[] {
  return readdirSync(RECORDS)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => JSON.parse(readFileSync(join(RECORDS, name), "utf8")) as GenerationRecord);
}

export function fixtureRecord(id: string): GenerationRecord {
  const record = fixtureRecords().find((entry) => entry.id === id);
  if (!record) throw new Error(`no fixture record ${id}`);
  return record;
}
