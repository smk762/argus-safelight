import { describe, expect, it } from "vitest";

import { parseSseFrames } from "./sse";

describe("parseSseFrames", () => {
  it("reads LF frames and keeps a partial one", () => {
    const { events, rest } = parseSseFrames('event: queued\ndata: {"position":0}\n\nevent: progress\ndata: {"st');
    expect(events).toEqual([{ event: "queued", data: { position: 0 } }]);
    expect(rest).toBe('event: progress\ndata: {"st');
  });

  it("reads CRLF and lone-CR line endings", () => {
    expect(parseSseFrames('event: queued\r\ndata: {"a":1}\r\n\r\nevent: progress\rdata: {"b":2}\r\revent: next').events).toEqual([
      { event: "queued", data: { a: 1 } },
      { event: "progress", data: { b: 2 } },
    ]);
  });

  it("holds a CR at the end of a chunk until it knows whether an LF follows", () => {
    const first = parseSseFrames('event: queued\r\ndata: {"a":1}\r\n\r');
    expect(first.events).toEqual([]);
    const second = parseSseFrames(`${first.rest}\nevent: scan\r\n`);
    expect(second.events).toEqual([{ event: "queued", data: { a: 1 } }]);
    expect(second.rest).toBe("event: scan\n");
  });

  it("skips a frame that is not JSON and goes on past it", () => {
    const { events, rest } = parseSseFrames('data: [DONE]\n\ndata: ping\n\nevent: complete\ndata: {"ok":true}\n\n');
    expect(events).toEqual([{ event: "complete", data: { ok: true } }]);
    expect(rest).toBe("");
  });
});

describe("readSse", () => {
  it("delivers a last frame that ends in lone CRs when the stream closes", async () => {
    const { readSse } = await import("./api");
    const body = 'event: queued\rdata: {"position":0}\r\revent: complete\rdata: {"record":{"id":"r1"}}\r\r';
    const seen: [string, unknown][] = [];
    await readSse(new Response(body), (event, data) => seen.push([event, data]));
    expect(seen).toEqual([
      ["queued", { position: 0 }],
      ["complete", { record: { id: "r1" } }],
    ]);
  });
});
