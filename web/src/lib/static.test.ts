// @vitest-environment jsdom
// The static demo's data layer: with NEXT_PUBLIC_SAFELIGHT_STATIC=1 every call api.ts makes is answered from the tape,
// under /data-tape, and nothing reaches darkroom. (In a real build the flag is inlined; here it is read at call time.)
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "./api";
import { wait } from "./staticApi";
import type { GenerationRecord } from "./types";

// The fixture's sample tape (fixture/sample-tape), served here under /data-tape.
const DIR = join(__dirname, "..", "..", "..", "fixture", "sample-tape");
const requested: string[] = [];

beforeAll(() => {
  vi.stubEnv("NEXT_PUBLIC_SAFELIGHT_STATIC", "1");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      requested.push(url);
      if (!url.startsWith("/data-tape/")) return new Response("not on this site", { status: 404 });
      try {
        return new Response(readFileSync(join(DIR, url.slice("/data-tape/".length))), { status: 200, headers: { "Content-Type": "application/json" } });
      } catch {
        return new Response("missing", { status: 404 });
      }
    }),
  );
});
afterAll(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  requested.length = 0;
});

const request = (record: GenerationRecord) => ({
  user_prompt: record.request.user_prompt,
  negative_prompt: record.request.negative_prompt,
  expand: false,
  enforcing_policy: record.guard.enforcing_policy,
  advisory_policies: [...record.guard.advisory_policies],
  thinking: "cascade" as const,
  checkpoint: "sdxl/argus-base-v1.safetensors",
  loras: [],
  seed: null,
  sampling: { sampler: "euler", scheduler: "normal", steps: 20, cfg: 5, clip_skip: 1, width: 512, height: 512 },
  nsfw_threshold: 0.2,
});

describe("static api", () => {
  it("reads health, policies, models and records from the tape only", async () => {
    const health = await api.getHealth();
    expect(health.backends.singguard).toBe(true);
    expect((await api.getPolicies()).policies.length).toBeGreaterThan(0);
    expect((await api.getModels()).checkpoints.length).toBeGreaterThan(0);
    const page = await api.getRecords({ outcome: "deleted", pageSize: 200 });
    expect(page.records.map((record) => record.outcome)).toEqual(page.records.map(() => "deleted"));
    expect((await api.getRecord("fx-passed")).id).toBe("fx-passed");
    await expect(api.getRecord("nope")).rejects.toThrow(/No record nope/);
    expect(requested.every((url) => url.startsWith("/data-tape/"))).toBe(true);
  });

  it("gives an image URL to served records only, on the tape", async () => {
    await api.getHealth();
    expect(api.imageUrl("fx-passed")).toMatch(/^\/data-tape\/images\/[a-f0-9]{16}\.webp$/);
    for (const id of ["fx-deleted-illegal", "fx-deleted-minor", "fx-deleted-unchecked", "fx-refused-illegal", "fx-omitted-exposed", "fx-failed"]) expect(api.imageUrl(id)).toBe("");
  });

  it("answers Check with the recorded pre-flight, and refuses a prompt the tape does not hold", async () => {
    const record = await api.getRecord("fx-refused");
    const verdict = await api.preflight(request(record));
    expect(verdict.outcome).toBe("refused");
    expect(verdict.user_prompt).toBe(record.request.user_prompt);
    await expect(api.preflight({ ...request(record), user_prompt: "something else" })).rejects.toThrow(/needs a running darkroom/);
  });

  it("replays a take's stream into the same handlers, ending in its record", async () => {
    vi.useFakeTimers();
    try {
      const record = await api.getRecord("fx-deleted-illegal");
      const seen: string[] = [];
      const handlers = {
        onPreflight: () => seen.push("preflight"),
        onQueued: () => seen.push("queued"),
        onProgress: () => seen.push("progress"),
        onInputScan: () => seen.push("input_scan"),
        onScan: () => seen.push("scan"),
      };
      const done = api.generate(request(record), handlers);
      await vi.runAllTimersAsync();
      const landed = await done;
      expect(landed.id).toBe("fx-deleted-illegal");
      expect(landed.outcome).toBe("deleted");
      expect(seen[0]).toBe("preflight");
      expect(seen.filter((name) => name === "scan")).toHaveLength(4);
    } finally {
      vi.useRealTimers();
    }
    // Never darkroom, and never an image: a deleted take is metadata from start to finish.
    expect(requested.every((url) => url.startsWith("/data-tape/") && !/\/(images|thumbs|veils)\//.test(url))).toBe(true);
  });

  it("makes no write", async () => {
    await expect(api.removeImage("fx-passed")).rejects.toThrow(/needs a running darkroom/);
    await expect(api.purge()).rejects.toThrow(/needs a running darkroom/);
    await expect(api.purgeRecord("fx-passed")).rejects.toThrow(/needs a running darkroom/);
    expect(requested).toEqual([]);
  });

  it("offers no archive download, since no darkroom is behind it", () => {
    expect(api.archiveUrl()).toBe("");
  });

  it("leaves no abort listener on the signal after each replayed pause", async () => {
    const abort = new AbortController();
    const add = vi.spyOn(abort.signal, "addEventListener");
    const remove = vi.spyOn(abort.signal, "removeEventListener");
    for (let i = 0; i < 3; i++) await wait(0, abort.signal);
    expect(add).toHaveBeenCalledTimes(3);
    expect(remove.mock.calls.map(([, listener]) => listener)).toEqual(add.mock.calls.map(([, listener]) => listener));
  });
});
