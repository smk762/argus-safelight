"use client";

import { OUTCOME_LABEL, OUTCOME_TONE, hasImage } from "@/lib/outcome";
import { allCells, overallState, ruleLetters } from "@/lib/shields";
import { ago, formatWhen } from "@/lib/time";
import type { GenerationRecord } from "@/lib/types";

import { DeletedTile, FailedTile, ImageTile, OmittedTile, RefusedPanel } from "./OutcomeTiles";
import { ChecksCard, ParametersCard, PromptsCard, RecordJson } from "./RecordDetails";
import { Shield } from "./Shield";
import { ShieldGrid } from "./ShieldGrid";
import { Badge, Card, SectionTitle } from "./ui";

/** One record, whatever its outcome. Pixels only for passed and review; the others show their record. */
export function ResultView({ record, actions }: { record: GenerationRecord; actions?: React.ReactNode }) {
  const worst = overallState(record.guard);
  const worstLetters = worst ? ruleLetters(allCells(record.guard).find((cell) => cell.state === worst)?.result) : [];
  const scanned = Object.keys(record.guard.scans ?? {}).length > 0;
  return (
    <article className="space-y-4" aria-labelledby="result-title">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 id="result-title" className="font-display text-heading font-semibold text-text-primary">
          {OUTCOME_LABEL[record.outcome]}
        </h1>
        <Badge className={OUTCOME_TONE[record.outcome]}>{record.outcome}</Badge>
        <Badge className={record.request.mode === "nsfw" ? "border-warm-primary/60 text-warm-primary" : "border-base-600 text-text-secondary"}>{record.request.mode}</Badge>
        {record.critical ? <Badge className="border-error/60 text-error">critical</Badge> : null}
        {record.removed_at ? <Badge className="border-base-600 text-text-secondary" title={`Removed by the user ${formatWhen(record.removed_at)}`}>image removed</Badge> : null}
        <span className="text-small text-text-secondary" title={formatWhen(record.created_at)}>
          {ago(record.created_at)}
        </span>
        <span className="font-mono text-caption text-text-muted">{record.id}</span>
        {actions ? <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div> : null}
      </header>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,560px)_minmax(320px,1fr)]">
        <div className="space-y-3">
          {record.outcome === "refused" ? (
            <RefusedPanel record={record} />
          ) : record.outcome === "failed" ? (
            <FailedTile record={record} />
          ) : record.outcome === "deleted" ? (
            <DeletedTile record={record} />
          ) : record.outcome === "omitted" ? (
            <OmittedTile record={record} />
          ) : hasImage(record) ? (
            <ImageTile record={record} />
          ) : (
            <div className="flex aspect-square w-full max-w-[512px] items-center justify-center rounded-lg border border-dashed border-base-600 p-6 text-center text-small text-text-secondary">The user removed this image. The record stays.</div>
          )}
          {worst ? (
            <div className="flex items-center gap-3">
              <Shield state={worst} letters={worstLetters} size="h-10 w-10" title={`Overall: ${worst}`} />
              <div>
                <p className="text-small font-medium capitalize text-text-primary">Overall: {worst}</p>
                <p className="text-caption text-text-muted">The worst cell in the grid.</p>
              </div>
            </div>
          ) : null}
        </div>

        <div className="space-y-4">
          {scanned ? (
            <Card>
              <SectionTitle>Output scans</SectionTitle>
              <p className="mt-1 text-caption text-text-muted">Each policy judged the image alone, then with the final prompt. Hover or tap a shield for the rule and SingGuard&apos;s words.</p>
              <div className="mt-3 overflow-x-auto">
                <ShieldGrid guard={record.guard} />
              </div>
            </Card>
          ) : null}
          <ChecksCard record={record} />
          <PromptsCard record={record} />
          <ParametersCard record={record} />
        </div>
      </div>
      <RecordJson record={record} />
    </article>
  );
}
