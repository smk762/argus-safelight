import { staticDemo } from "./demo";
import { parseSseFrames } from "./sse";
import * as demo from "./staticApi";
import {
  darkroomUrl,
  type GenerateRequest,
  type GenerationRecord,
  type Health,
  type Models,
  type Mode,
  type Outcome,
  type Policies,
  type Preflight,
  type ProgressEvent,
  type PurgeResult,
  type RecordPurgeResult,
  type RecordPage,
  type ScanEvent,
} from "./types";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number = 0,
  ) {
    super(message);
  }
}

export async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body.detail === "string") return body.detail;
    if (body.detail != null) return JSON.stringify(body.detail);
  } catch {
    // A non-JSON error body still needs a readable message.
  }
  return response.statusText || `HTTP ${response.status}`;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${darkroomUrl()}${path}`);
  if (!response.ok) throw new ApiError(await readError(response), response.status);
  return (await response.json()) as T;
}

async function send<T>(method: "POST" | "DELETE", path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${darkroomUrl()}${path}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new ApiError(await readError(response), response.status);
  return (await response.json()) as T;
}

// The static demo (lib/demo.ts) answers every read from the recorded tape and makes no write; `staticDemo()` is
// inlined at build time, so each build carries one branch.
export const getHealth = (): Promise<Health> => (staticDemo() ? demo.getHealth() : getJson("/health"));
export const getPolicies = (): Promise<Policies> => (staticDemo() ? demo.getPolicies() : getJson("/policies"));
export const getModels = (): Promise<Models> => (staticDemo() ? demo.getModels() : getJson("/models"));
export const getRecord = (id: string): Promise<GenerationRecord> => (staticDemo() ? demo.getRecord(id) : getJson(`/record/${encodeURIComponent(id)}`));

/** The most `GET /records` serves at once. Darkroom answers 422 above it. */
export const MAX_PAGE_SIZE = 200;

export interface RecordQuery {
  outcome?: Outcome | null;
  mode?: Mode | null;
  page?: number;
  pageSize?: number;
}

export function getRecords(query: RecordQuery = {}): Promise<RecordPage> {
  if (staticDemo()) return demo.getRecords(query);
  const params = new URLSearchParams();
  if (query.outcome) params.set("outcome", query.outcome);
  if (query.mode) params.set("mode", query.mode);
  if (query.page) params.set("page", String(query.page));
  if (query.pageSize) params.set("page_size", String(query.pageSize));
  const suffix = params.size > 0 ? `?${params}` : "";
  return getJson(`/records${suffix}`);
}

/**
 * Images load by record id only. A deleted, omitted or refused record answers 404 here. In the static demo only a
 * served record has a file on the tape; any other id gets "", and the page never renders an image for those anyway.
 */
export const imageUrl = (id: string): string => (staticDemo() ? demo.imageUrl(id) : `${darkroomUrl()}/image/${encodeURIComponent(id)}`);
/** The purge dialog's archive download. The static demo has no darkroom behind it, so "" there: no link. */
export const archiveUrl = (): string => (staticDemo() ? "" : `${darkroomUrl()}/archive`);

export const preflight = (request: GenerateRequest): Promise<Preflight> => (staticDemo() ? demo.preflight(request) : send("POST", "/preflight", request));
export const purge = (): Promise<PurgeResult> => (staticDemo() ? demo.notInDemo("Purge") : send("POST", "/purge", { confirm: "purge" }));
export const purgeRecord = (id: string): Promise<RecordPurgeResult> => (staticDemo() ? demo.notInDemo("Purge") : send("POST", `/purge/${encodeURIComponent(id)}`, { confirm: "purge" }));
export const removeImage = (id: string): Promise<GenerationRecord> => (staticDemo() ? demo.notInDemo("Removing an image") : send("DELETE", `/record/${encodeURIComponent(id)}`));

export async function readSse(response: Response, onEvent: (event: string, data: unknown) => void): Promise<void> {
  if (!response.body) throw new ApiError("Darkroom's response had no body.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let rest = "";
  while (true) {
    const { done, value } = await reader.read();
    rest += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    // At the end, a CR that parseSseFrames held back for a possible CRLF is a line end after all: the last frame
    // (`complete`) may end in one when a proxy sends lone-CR line endings.
    const parsed = parseSseFrames(done && rest.endsWith("\r") ? `${rest.slice(0, -1)}\n` : rest);
    rest = parsed.rest;
    for (const frame of parsed.events) onEvent(frame.event, frame.data);
    if (done) break;
  }
}

export interface GenerateHandlers {
  onPreflight: (preflight: Preflight) => void;
  onQueued: () => void;
  onProgress: (progress: ProgressEvent) => void;
  /** Image-to-image: one cell of the input image's own scan, before `queued`. */
  onInputScan: (scan: ScanEvent) => void;
  onScan: (scan: ScanEvent) => void;
}

/**
 * One generation over the SSE stream. Resolves with the record darkroom wrote,
 * whatever its outcome; a stream that ends without one is an error.
 */
export async function generate(request: GenerateRequest, handlers: GenerateHandlers, signal?: AbortSignal): Promise<GenerationRecord> {
  let record: GenerationRecord | null = null;
  let failure: string | null = null;
  const onEvent = (event: string, data: unknown) => {
    if (event === "preflight") handlers.onPreflight(data as Preflight);
    else if (event === "queued") handlers.onQueued();
    else if (event === "progress") handlers.onProgress(data as ProgressEvent);
    else if (event === "input_scan") handlers.onInputScan(data as ScanEvent);
    else if (event === "scan") handlers.onScan(data as ScanEvent);
    else if (event === "complete") record = (data as { record: GenerationRecord }).record;
    else if (event === "error") failure = (data as { detail?: string }).detail || "Darkroom reported an error.";
  };
  if (staticDemo()) {
    // The recorded stream for this prompt, replayed at about darkroom's pace.
    await demo.replay(request, onEvent, signal);
  } else {
    const response = await fetch(`${darkroomUrl()}/generate/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal,
    });
    if (!response.ok) throw new ApiError(await readError(response), response.status);
    await readSse(response, onEvent);
  }
  if (record) return record;
  throw new ApiError(failure ?? "Darkroom ended the stream without a record.");
}
