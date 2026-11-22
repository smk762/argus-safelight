import { afterEach, describe, expect, it, vi } from "vitest";

import { getRecords } from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("getRecords", () => {
  it("sends its filters on an engine whose URLSearchParams has no size", async () => {
    vi.spyOn(URLSearchParams.prototype, "size", "get").mockReturnValue(undefined as unknown as number);
    const fetch = vi.fn(async () => new Response(JSON.stringify({ records: [], total: 0, page: 2, page_size: 50 })));
    vi.stubGlobal("fetch", fetch);
    await getRecords({ outcome: "refused", page: 2, pageSize: 50 });
    expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/\/records\?outcome=refused&page=2&page_size=50$/));
  });

  it("asks for /records with no query string when nothing is filtered", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ records: [], total: 0, page: 1, page_size: 50 })));
    vi.stubGlobal("fetch", fetch);
    await getRecords();
    expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/\/records$/));
  });
});
