export interface SseFrame {
  event: string;
  data: unknown;
}

/**
 * Split a byte stream into SSE frames, keeping a trailing partial frame. Lines may end in LF, CRLF or a lone CR, as the
 * SSE spec allows (darkroom sends LF; a proxy in front of it may not). A frame whose data is not JSON (a keep-alive, a
 * proxy's plain-text note) is skipped rather than stopping the stream.
 */
export function parseSseFrames(buffer: string): { events: SseFrame[]; rest: string } {
  const events: SseFrame[] = [];
  // A CR at the very end may be the first half of a CRLF split across chunks: leave it for the next call.
  const held = buffer.endsWith("\r") ? "\r" : "";
  let rest = (held ? buffer.slice(0, -1) : buffer).replace(/\r\n?/g, "\n");
  while (true) {
    const split = rest.indexOf("\n\n");
    if (split === -1) break;
    const raw = rest.slice(0, split);
    rest = rest.slice(split + 2);
    if (!raw.trim()) continue;
    let event = "message";
    const dataLines: string[] = [];
    for (const line of raw.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).replace(/^ /, ""));
    }
    if (dataLines.length === 0) continue;
    let data: unknown;
    try {
      data = JSON.parse(dataLines.join("\n"));
    } catch {
      // Every darkroom event carries JSON; anything else is not one of them, and must not stop the frames after it.
      continue;
    }
    events.push({ event, data });
  }
  return { events, rest: rest + held };
}
