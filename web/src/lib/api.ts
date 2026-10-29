import { parseSseFrames } from "./sse";
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

export const getHealth = (): Promise<Health> => getJson("/health");
export const getPolicies = (): Promise<Policies> => getJson("/policies");
export const getModels = (): Promise<Models> => getJson("/models");
export const getRecord = (id: string): Promise<GenerationRecord> => getJson(`/record/${encodeURIComponent(id)}`);

export interface RecordQuery {
  outcome?: Outcome | null;
  mode?: Mode | null;
  page?: number;
  pageSize?: number;
}

export function getRecords(query: RecordQuery = {}): Promise<RecordPage> {
  const params = new URLSearchParams();
  if (query.outcome) params.set("outcome", query.outcome);
  if (query.mode) params.set("mode", query.mode);
  if (query.page) params.set("page", String(query.page));
  if (query.pageSize) params.set("page_size", String(query.pageSize));
  const suffix = params.size > 0 ? `?${params}` : "";
  return getJson(`/records${suffix}`);
}

/** Images load by record id only. A deleted, omitted or refused record answers 404 here. */
export const imageUrl = (id: string): string => `${darkroomUrl()}/image/${encodeURIComponent(id)}`;
export const archiveUrl = (): string => `${darkroomUrl()}/archive`;

export const preflight = (request: GenerateRequest): Promise<Preflight> => send("POST", "/preflight", request);
export const purge = (): Promise<PurgeResult> => send("POST", "/purge", { confirm: "purge" });
export const removeImage = (id: string): Promise<GenerationRecord> => send("DELETE", `/record/${encodeURIComponent(id)}`);

export async function readSse(response: Response, onEvent: (event: string, data: unknown) => void): Promise<void> {
  if (!response.body) throw new ApiError("Darkroom's response had no body.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let rest = "";
  while (true) {
    const { done, value } = await reader.read();
    rest += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const parsed = parseSseFrames(rest);
    rest = parsed.rest;
    for (const frame of parsed.events) onEvent(frame.event, frame.data);
    if (done) break;
  }
}

export interface GenerateHandlers {
  onPreflight: (preflight: Preflight) => void;
  onQueued: () => void;
  onProgress: (progress: ProgressEvent) => void;
  onScan: (scan: ScanEvent) => void;
}

/**
 * One generation over the SSE stream. Resolves with the record darkroom wrote,
 * whatever its outcome; a stream that ends without one is an error.
 */
export async function generate(request: GenerateRequest, handlers: GenerateHandlers, signal?: AbortSignal): Promise<GenerationRecord> {
  const response = await fetch(`${darkroomUrl()}/generate/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });
  if (!response.ok) throw new ApiError(await readError(response), response.status);
  let record: GenerationRecord | null = null;
  let failure: string | null = null;
  await readSse(response, (event, data) => {
    if (event === "preflight") handlers.onPreflight(data as Preflight);
    else if (event === "queued") handlers.onQueued();
    else if (event === "progress") handlers.onProgress(data as ProgressEvent);
    else if (event === "scan") handlers.onScan(data as ScanEvent);
    else if (event === "complete") record = (data as { record: GenerationRecord }).record;
    else if (event === "error") failure = (data as { detail?: string }).detail || "Darkroom reported an error.";
  });
  if (record) return record;
  throw new ApiError(failure ?? "Darkroom ended the stream without a record.");
}
