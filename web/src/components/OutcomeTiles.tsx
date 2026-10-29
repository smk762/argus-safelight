"use client";

import { useState } from "react";

import { imageUrl } from "@/lib/api";
import { deletedSummary, omittedSummary } from "@/lib/outcome";
import { ruleLetters } from "@/lib/shields";
import type { Cell, GenerationRecord } from "@/lib/types";

import { PreflightColumn } from "./ShieldGrid";
import { Badge, Button, Notice } from "./ui";

const TILE = "aspect-square w-full max-w-[512px] rounded-lg";

/** A served image. Blurred when darkroom set `blur`, until the user reveals it; the img stays in the DOM. */
export function ImageTile({ record }: { record: GenerationRecord }) {
  const blur = record.guard.nudenet?.blur ?? false;
  const [revealed, setRevealed] = useState(false);
  const hidden = blur && !revealed;
  return (
    <figure className={`relative overflow-hidden border border-base-600/60 bg-base-700 ${TILE}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- loaded by record id from darkroom, not a static asset */}
      <img
        src={imageUrl(record.id)}
        alt={`Image for record ${record.id}: ${record.request.user_prompt}`}
        width={record.image?.width}
        height={record.image?.height}
        className={`h-full w-full object-contain transition-[filter] ${hidden ? "scale-105 blur-2xl" : ""}`}
        draggable={false}
      />
      {hidden ? (
        <figcaption className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-base-900/40 p-4 text-center">
          <p className="text-small text-text-primary">Blurred: NudeNet scored exposure at or above the threshold.</p>
          <Button onClick={() => setRevealed(true)}>Reveal</Button>
        </figcaption>
      ) : blur ? (
        <figcaption className="absolute bottom-2 right-2">
          <Button small onClick={() => setRevealed(false)}>
            Blur again
          </Button>
        </figcaption>
      ) : null}
    </figure>
  );
}

/** No image element at all. The record is all that is left, and that is what the tile shows. */
export function DeletedTile({ record }: { record: GenerationRecord }) {
  const summary = deletedSummary(record);
  return (
    <div role="group" aria-label="Deleted image" className={`flex flex-col justify-center gap-3 border-2 border-error/60 bg-error/5 p-6 ${TILE}`}>
      <div className="flex items-center gap-2">
        <Badge className="border-error/60 text-error">deleted</Badge>
        {record.critical ? <Badge className="border-error/60 text-error">critical</Badge> : null}
      </div>
      <p className="font-display text-subheading font-semibold text-text-primary">{summary.headline}</p>
      {summary.lines.map((line, index) => (
        <p key={index} className="text-small text-text-secondary">
          {line}
        </p>
      ))}
      <p className="text-caption text-text-muted">The bytes were never written. There is nothing to reveal; the record below is all that remains.</p>
    </div>
  );
}

/** Plainer than deleted, so withheld nudity is not read as illegal content. No image element. */
export function OmittedTile({ record }: { record: GenerationRecord }) {
  const summary = omittedSummary(record);
  return (
    <div role="group" aria-label="Omitted image" className={`flex flex-col justify-center gap-3 border border-dashed border-base-600 bg-base-800 p-6 ${TILE}`}>
      <Badge className="w-fit border-base-600 text-text-secondary">omitted</Badge>
      <p className="font-display text-subheading font-semibold text-text-primary">{summary.headline}</p>
      {summary.lines.map((line, index) => (
        <p key={index} className="text-small text-text-secondary">
          {line}
        </p>
      ))}
      <p className="text-caption text-text-muted">An SFW request does not return nudity. This is housekeeping, not a judgement that the content was criminal; the record is kept.</p>
    </div>
  );
}

export function FailedTile({ record }: { record: GenerationRecord }) {
  return (
    <div role="group" aria-label="Failed generation" className={`flex flex-col justify-center gap-3 border border-base-600 bg-base-800 p-6 ${TILE}`}>
      <Badge className="w-fit border-base-600 text-text-secondary">failed</Badge>
      <p className="font-display text-subheading font-semibold text-text-primary">Generation failed.</p>
      <p className="break-words text-small text-text-secondary">{record.error ?? record.outcome_reason ?? "Darkroom did not say why."}</p>
      <p className="text-caption text-text-muted">No image was produced. The record keeps the request, so the same seed can be run again.</p>
    </div>
  );
}

/** Which pre-flight cell refused: the illegal one under any policy, else the enforcing one. */
export function refusingCell(record: GenerationRecord): { policy: string; cell: Cell } | null {
  const { preflight, enforcing_policy } = record.guard;
  const names = [enforcing_policy, ...Object.keys(preflight).filter((name) => name !== enforcing_policy)];
  for (const name of names) if (preflight[name]?.state === "illegal") return { policy: name, cell: preflight[name] };
  const own = preflight[enforcing_policy];
  if (own && own.state !== "safe") return { policy: enforcing_policy, cell: own };
  return null;
}

/** The pre-flight panel for a refused record: which rule fired, under which policy, in SingGuard's own words, and the prompt that was judged. */
export function RefusedPanel({ record }: { record: GenerationRecord }) {
  const refusing = refusingCell(record);
  const result = refusing?.cell.result;
  return (
    <div role="group" aria-label="Refused at pre-flight" className="space-y-4 rounded-lg border-2 border-error/60 bg-error/5 p-5">
      <div className="flex items-center gap-2">
        <Badge className="border-error/60 text-error">refused</Badge>
        {record.critical ? <Badge className="border-error/60 text-error">critical</Badge> : null}
        <span className="text-small text-text-secondary">Nothing was generated.</span>
      </div>
      {refusing ? (
        <Notice tone="error">
          {refusing.cell.state === "unchecked" ? (
            <>
              The pre-flight check under <span className="font-mono">{refusing.policy}</span> did not complete{refusing.cell.error ? `: ${refusing.cell.error}` : ""}. A failed check is a refusal.
            </>
          ) : (
            <>
              Rule <strong>{result?.rules.join("; ") || ruleLetters(result).join(", ") || record.outcome_reason}</strong> fired under <span className="font-mono">{refusing.policy}</span>
              {refusing.cell.state === "illegal" ? " (an illegal rule, refused in every mode)" : record.request.mode === "sfw" ? " (a non-illegal flag; refused because the enforcing policy is SFW)" : ""}.
            </>
          )}
        </Notice>
      ) : null}
      {result?.explanation ? <blockquote className="whitespace-pre-wrap border-l-2 border-base-600 pl-3 text-small text-text-secondary">{result.explanation}</blockquote> : null}
      <PreflightColumn results={record.guard.preflight} enforcing={record.guard.enforcing_policy} />
      <div>
        <p className="text-caption uppercase tracking-wide text-text-muted">Final prompt that was judged</p>
        <p className="mt-1 whitespace-pre-wrap text-small text-text-primary">{record.request.final_prompt}</p>
        {record.request.negative_prompt ? (
          <p className="mt-1 text-small text-text-secondary">
            <span className="text-text-muted">Negative (what the image must not show): </span>
            {record.request.negative_prompt}
          </p>
        ) : null}
      </div>
    </div>
  );
}
