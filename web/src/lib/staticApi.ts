/**
 * The static demo's data layer: the same calls as api.ts, answered from the recorded tape (lib/tape.ts) under
 * NEXT_PUBLIC_SAFELIGHT_TAPE_URL. Reads only same-origin static files; nothing here reaches darkroom. Anything that
 * would write throws NotInDemo, and the page leaves those controls out before it gets that far.
 */
import { NotInDemo, tapeBase } from "./demo";
import { parseTape, recordPage, replayDelay, takeFor, tapeFileUrl, type Take, type Tape } from "./tape";
import type { RecordQuery } from "./api";
import type { GenerateRequest, GenerationRecord, Health, Models, Policies, Preflight, RecordPage } from "./types";

let loading: Promise<Tape> | null = null;
/** Set once the tape has loaded, for the synchronous image URL lookups. */
let loaded: Tape | null = null;
const takes = new Map<string, Promise<Take>>();

async function fetchJson(name: string): Promise<unknown> {
  const response = await fetch(`${tapeBase()}/${name}`);
  if (!response.ok) throw new Error(`Could not read the data tape (${name}: HTTP ${response.status}).`);
  return response.json();
}

export function loadTape(): Promise<Tape> {
  if (!loading) {
    loading = (async () => {
      loaded = parseTape(await fetchJson("tape.json"));
      return loaded;
    })();
    loading.catch(() => {
      loading = null;
    });
  }
  return loading;
}

/** The tape, once loaded; null before. */
export function loadedTape(): Tape | null {
  return loaded;
}

export const getHealth = async (): Promise<Health> => (await loadTape()).health;
export const getPolicies = async (): Promise<Policies> => (await loadTape()).policies;
export const getModels = async (): Promise<Models> => (await loadTape()).models;
export const getRecords = async (query: RecordQuery = {}): Promise<RecordPage> => recordPage(await loadTape(), query);

export async function getRecord(id: string): Promise<GenerationRecord> {
  const record = (await loadTape()).records.find((entry) => entry.id === id);
  if (!record) throw new Error(`No record ${id} on this demo's tape.`);
  return record;
}

/** A served record's full view; "" for any other record (there is no file to name). */
export const imageUrl = (id: string): string => tapeFileUrl(tapeBase(), loaded, id, "images");
export const thumbUrl = (id: string): string => tapeFileUrl(tapeBase(), loaded, id, "thumbs");
/** The veil of a veiled served record; "" when it is not veiled or has no image. */
export const veilUrl = (id: string): string => tapeFileUrl(tapeBase(), loaded, id, "veils");
export const isVeiled = (id: string): boolean => loaded?.veiled.includes(id) ?? false;
/** A hand-written record on a recorded tape: never generated, labelled Sample data. */
export const isIllustrative = (id: string): boolean => loaded?.illustrative?.includes(id) ?? false;

function readTake(id: string): Promise<Take> {
  let hit = takes.get(id);
  if (!hit) {
    hit = fetchJson(`takes/${encodeURIComponent(id)}.json`) as Promise<Take>;
    takes.set(id, hit);
    hit.catch(() => takes.delete(id));
  }
  return hit;
}

async function takeRecord(request: GenerateRequest, what: string): Promise<GenerationRecord> {
  const record = takeFor(await loadTape(), request);
  if (!record) throw new NotInDemo(`${what} for a prompt the recording does not hold`);
  return record;
}

/** "Check": what `POST /preflight` answered for this prompt when the take was recorded. */
export async function preflight(request: GenerateRequest): Promise<Preflight> {
  const take = await readTake((await takeRecord(request, "Pre-flight")).id);
  if (!take.preflight) throw new NotInDemo("Pre-flight for this take");
  return take.preflight;
}

/** A pause that Stop ends early. Its abort listener goes when the pause ends, so a long take leaves none behind. */
export const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Stopped", "AbortError"));
    const onAbort = () => {
      window.clearTimeout(timer);
      reject(new DOMException("Stopped", "AbortError"));
    };
    const timer = window.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });

/** "Generate": the recorded stream for this prompt, event by event at about darkroom's pace. */
export async function replay(request: GenerateRequest, onEvent: (event: string, data: unknown) => void, signal?: AbortSignal): Promise<void> {
  const take = await readTake((await takeRecord(request, "Generation")).id);
  for (const [event, data] of take.events) {
    await wait(replayDelay(event), signal);
    onEvent(event, data);
  }
}

/** Every call the demo cannot make: a rejected promise, as a refused request would be. */
export function notInDemo(what: string): Promise<never> {
  return Promise.reject(new NotInDemo(what));
}
