import { historyQuery, type HistoryFilter } from "./historyQuery";
import { matchesRule, promptChangedVerdict } from "./shields";
import type { GenerationRecord } from "./types";

/**
 * The filters History applies on its side of the request (outcome and mode go to `GET /records`): "Prompt changed
 * the verdict", removed images and the rule. History and the record page's Previous/Next share it, so both walk the
 * same list in the same order.
 */
export function applyHistoryFilter(records: readonly GenerationRecord[], filter: HistoryFilter): GenerationRecord[] {
  return records.filter((record) => (!filter.changed || promptChangedVerdict(record)) && (!filter.removed || record.removed_at != null) && (!filter.rule || matchesRule(record, filter.rule)));
}

/** A record page's path, carrying the history filter it was reached from so Previous/Next keep to that list. */
export function recordHref(id: string, filter: HistoryFilter): string {
  return `/record/${encodeURIComponent(id)}${historyQuery(filter)}`;
}

export interface Neighbours {
  /** 1-based position in the list. */
  position: number;
  total: number;
  previous: string | null;
  next: string | null;
}

/** Where `id` sits in `ids` (History's order, newest first) and its neighbours; null when it is not in the list. Never wraps. */
export function neighbours(ids: readonly string[], id: string): Neighbours | null {
  const index = ids.indexOf(id);
  if (index < 0) return null;
  return { position: index + 1, total: ids.length, previous: index > 0 ? ids[index - 1] : null, next: index < ids.length - 1 ? ids[index + 1] : null };
}

/** True when an arrow key should stay with what has focus: a form field, an editable region, or an open dialog. */
export function keyBelongsToField(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element || typeof element.closest !== "function") return false;
  if (element.isContentEditable) return true;
  return element.closest("input, textarea, select, [contenteditable=''], [contenteditable='true'], [role=slider], [role=listbox], dialog[open]") != null;
}
