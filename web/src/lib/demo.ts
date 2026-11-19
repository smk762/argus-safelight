/**
 * The static demo build (`SAFELIGHT_STATIC=1`, `make pages`): a pure static export that replays a recorded data
 * tape (scripts/record_tape.py) instead of calling darkroom.
 *
 * Both reads are literal `process.env.NEXT_PUBLIC_*` expressions on purpose: Next inlines them at build time, so
 * the live build (Docker, `npm run build`) never takes the tape's code paths and the demo build never calls
 * darkroom. next.config.ts maps SAFELIGHT_STATIC=1 onto NEXT_PUBLIC_SAFELIGHT_STATIC.
 */
export function staticDemo(): boolean {
  return process.env.NEXT_PUBLIC_SAFELIGHT_STATIC === "1";
}

/** Where the tape is served from: a path on this site (default `/data-tape`). */
export function tapeBase(): string {
  return (process.env.NEXT_PUBLIC_SAFELIGHT_TAPE_URL || "/data-tape").replace(/\/+$/, "");
}

export const REPO_URL = "https://github.com/smk762/argus-safelight";
export const DARKROOM_REPO_URL = "https://github.com/smk762/argus-darkroom";

/** Thrown by the static data layer for anything that needs darkroom: a write, or a request the tape did not record. */
export class NotInDemo extends Error {
  constructor(what: string) {
    super(`${what} needs a running darkroom; this demo replays a recording.`);
    this.name = "NotInDemo";
  }
}
