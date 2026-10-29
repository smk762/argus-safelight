"use client";

import { useId, useState } from "react";

import { ruleLetters, shieldLabel, type ShieldState } from "@/lib/shields";
import type { Cell } from "@/lib/types";

import { Shield } from "./Shield";

/**
 * One shield with its detail on hover, focus or tap: the rule, SingGuard's
 * explanation, the thinking mode that judged it, and the cascade's fast
 * verdict when there was one. The state and the words come from the cell;
 * nothing is reclassified here.
 */
export function ShieldCell({
  cell,
  heading,
  size = "h-9 w-9",
  outlined = false,
  withLabel = true,
  labelBelow = true,
}: {
  cell: Cell | null;
  heading: string;
  size?: string;
  outlined?: boolean;
  withLabel?: boolean;
  labelBelow?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const id = useId();
  const state: ShieldState = cell?.state ?? "pending";
  const letters = ruleLetters(cell?.result);
  const label = shieldLabel(state, letters);
  const show = open || pinned;
  return (
    <div className="relative inline-flex" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-expanded={show}
        aria-controls={id}
        aria-label={`${heading}: ${label}`}
        onClick={() => setPinned((value) => !value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setPinned(false);
        }}
        className={`rounded-md px-2 py-1 transition-colors hover:bg-base-700/70 ${outlined ? "outline-dashed outline-2 outline-offset-1 outline-warning/80" : ""}`}
      >
        <Shield state={state} letters={letters} size={size} withLabel={withLabel} labelBelow={labelBelow} />
      </button>
      {show ? (
        <div id={id} role="tooltip" className="absolute left-1/2 top-full z-20 mt-1 w-72 -translate-x-1/2 rounded-md border border-base-600 bg-base-800 p-3 text-left text-caption shadow-soft">
          <ShieldDetail cell={cell} heading={heading} />
        </div>
      ) : null}
    </div>
  );
}

export function ShieldDetail({ cell, heading }: { cell: Cell | null; heading: string }) {
  if (!cell) {
    return (
      <>
        <p className="font-semibold text-text-primary">{heading}</p>
        <p className="mt-1 text-text-secondary">Not scanned yet.</p>
      </>
    );
  }
  const result = cell.result;
  return (
    <>
      <p className="font-semibold text-text-primary">
        {heading} <span className="font-normal capitalize text-text-secondary">· {shieldLabel(cell.state, ruleLetters(result))}</span>
      </p>
      {cell.state === "unchecked" ? <p className="mt-1 text-text-secondary">{cell.error ?? "The check did not complete."}</p> : null}
      {result ? (
        <dl className="mt-1.5 space-y-1 text-text-secondary">
          {result.rules.length > 0 ? (
            <div>
              <dt className="inline text-text-muted">Rule: </dt>
              <dd className="inline text-text-primary">{result.rules.join("; ")}</dd>
            </div>
          ) : null}
          {result.explanation ? (
            <div>
              <dt className="sr-only">Explanation</dt>
              <dd className="whitespace-pre-wrap">{result.explanation}</dd>
            </div>
          ) : null}
          <div>
            <dt className="inline text-text-muted">Judged in: </dt>
            <dd className="inline">{result.thinking ?? "unknown mode"}</dd>
          </div>
          {result.fast_verdict ? (
            <div>
              <dt className="inline text-text-muted">Cascade fast pass: </dt>
              <dd className="inline">
                {result.fast_verdict}
                {result.fast_rule ? ` (${result.fast_rule})` : ""}
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}
    </>
  );
}
