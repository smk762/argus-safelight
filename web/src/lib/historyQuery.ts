import { OUTCOMES, type Mode, type Outcome } from "./types";

/** The history view's filter, held in its URL: `?outcome=review&mode=nsfw&changed=1`. */
export interface HistoryFilter {
  outcome: Outcome | null;
  mode: Mode | null;
  /** Only records where the prompt changed the verdict: the isolated and with-prompt scans disagree. */
  changed: boolean;
}

export const EMPTY_FILTER: HistoryFilter = { outcome: null, mode: null, changed: false };

const MODES: readonly Mode[] = ["sfw", "nsfw"];

/** Reads a filter from query parameters, dropping anything that is not a known value. */
export function parseHistoryFilter(params: URLSearchParams | Readonly<URLSearchParams>): HistoryFilter {
  const outcome = params.get("outcome");
  const mode = params.get("mode");
  const changed = params.get("changed");
  return {
    outcome: OUTCOMES.includes(outcome as Outcome) ? (outcome as Outcome) : null,
    mode: MODES.includes(mode as Mode) ? (mode as Mode) : null,
    changed: changed === "1" || changed === "true",
  };
}

/** The query string for a filter, empty when nothing is set, so an unfiltered history has a clean URL. */
export function historyQuery(filter: HistoryFilter): string {
  const params = new URLSearchParams();
  if (filter.outcome) params.set("outcome", filter.outcome);
  if (filter.mode) params.set("mode", filter.mode);
  if (filter.changed) params.set("changed", "1");
  const query = params.toString();
  return query ? `?${query}` : "";
}
