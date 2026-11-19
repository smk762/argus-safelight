import { describe, expect, it } from "vitest";

import { ago, formatUtc } from "./time";

describe("time", () => {
  it("formats a recorded time as absolute UTC", () => {
    expect(formatUtc("2026-11-15T10:12:44.376220Z")).toBe("2026-11-15 10:12 UTC");
    expect(formatUtc("not a date")).toBe("not a date");
  });
  it("keeps relative times for the live app", () => {
    expect(ago("2026-11-15T10:00:00Z", new Date("2026-11-15T10:13:00Z"))).toBe("13 min ago");
  });
});
