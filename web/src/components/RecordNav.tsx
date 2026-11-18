"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { MAX_PAGE_SIZE, getRecords } from "@/lib/api";
import type { GenerationRecord } from "@/lib/types";
import { applyHistoryFilter, keyBelongsToField, neighbours, recordHref } from "@/lib/historyNav";
import { EMPTY_FILTER, historyQuery, parseHistoryFilter } from "@/lib/historyQuery";
import { useLoad } from "@/lib/useLoad";

const STEP = "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-caption font-medium";
const LIVE = `${STEP} bg-base-700 text-text-primary hover:bg-base-600`;
const OFF = `${STEP} bg-base-800 text-text-muted opacity-60`;

/** Every record, page after page until darkroom's total is reached (or a page comes back empty). */
async function wholeHistory(): Promise<GenerationRecord[]> {
  const records: GenerationRecord[] = [];
  for (let page = 1; ; page++) {
    const answer = await getRecords({ page, pageSize: MAX_PAGE_SIZE });
    records.push(...answer.records);
    if (answer.records.length === 0 || records.length >= answer.total) return records;
  }
}

/**
 * Previous / Next through History's list, in its order (newest first) and under the filter the record was reached
 * with (carried in the URL), with the position. Disabled at the ends, never wrapping. ← and → step too, unless
 * focus is in a form field or a dialog is open. The links are real hrefs, so the static export's prerendered pages
 * are what they reach.
 */
export function RecordNav({ id }: { id: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const asked = parseHistoryFilter(params);
  // The whole history, once: outcome and mode are applied here as darkroom applies them, so a record outside the
  // filter it was linked with can fall back to the plain history order without a second request.
  const { data } = useLoad("record-nav", wholeHistory);
  const all = data ?? [];
  const filtered = applyHistoryFilter(
    all.filter((record) => (!asked.outcome || record.outcome === asked.outcome) && (!asked.mode || record.request.mode === asked.mode)),
    asked,
  );
  const inFilter = neighbours(filtered.map((record) => record.id), id);
  const filter = inFilter ? asked : EMPTY_FILTER;
  const nav = inFilter ?? neighbours(all.map((record) => record.id), id);
  const previous = nav?.previous ? recordHref(nav.previous, filter) : null;
  const next = nav?.next ? recordHref(nav.next, filter) : null;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      if (keyBelongsToField(event.target) || document.querySelector("dialog[open]")) return;
      const href = event.key === "ArrowLeft" ? previous : next;
      if (!href) return;
      event.preventDefault();
      router.push(href);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previous, next, router]);

  if (!nav) return null;
  const narrowed = historyQuery(filter) !== "";
  return (
    <nav aria-label="Records in history order" className="flex items-center justify-end gap-2">
      {previous ? (
        <Link href={previous} rel="prev" className={LIVE} aria-label="Previous record (newer)" aria-keyshortcuts="ArrowLeft">
          <span aria-hidden="true">‹</span> Previous
        </Link>
      ) : (
        <a aria-disabled="true" className={OFF}>
          <span aria-hidden="true">‹</span> Previous
        </a>
      )}
      <span className="min-w-[4.5rem] text-center text-caption text-text-secondary" aria-live="polite">
        {nav.position} of {nav.total}
        {narrowed ? <span className="sr-only"> (filtered history)</span> : null}
      </span>
      {next ? (
        <Link href={next} rel="next" className={LIVE} aria-label="Next record (older)" aria-keyshortcuts="ArrowRight">
          Next <span aria-hidden="true">›</span>
        </Link>
      ) : (
        <a aria-disabled="true" className={OFF}>
          Next <span aria-hidden="true">›</span>
        </a>
      )}
    </nav>
  );
}
