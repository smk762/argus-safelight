"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { getRecords, imageUrl } from "@/lib/api";
import { historyQuery, parseHistoryFilter, type HistoryFilter } from "@/lib/historyQuery";
import { OUTCOME_LABEL, OUTCOME_TONE, hasImage } from "@/lib/outcome";
import { allCells, overallState, promptChangedVerdict, ruleLetters } from "@/lib/shields";
import { ago, formatWhen } from "@/lib/time";
import { OUTCOMES, type GenerationRecord, type Mode, type Outcome } from "@/lib/types";
import { useLoad } from "@/lib/useLoad";

import { useDarkroom } from "./DarkroomProvider";
import { PurgeButton } from "./PurgeDialog";
import { Shield } from "./Shield";
import { Badge, Notice, Spinner } from "./ui";

const PAGE_SIZE = 200;

/** `GET /records`, filtered by outcome and mode on darkroom's side and by "Prompt changed the verdict" here. The URL holds the filter. */
export function History() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const filter = parseHistoryFilter(params);
  const { health } = useDarkroom();
  const { data, error, reload } = useLoad(`${filter.outcome ?? ""}|${filter.mode ?? ""}`, () => getRecords({ outcome: filter.outcome, mode: filter.mode, pageSize: PAGE_SIZE }));
  const fetched = data?.records ?? null;
  const records = fetched && filter.changed ? fetched.filter(promptChangedVerdict) : fetched;

  const setFilter = (patch: Partial<HistoryFilter>) => {
    router.replace(`${pathname}${historyQuery({ ...filter, ...patch })}`, { scroll: false });
  };

  return (
    <section className="space-y-4" aria-labelledby="history-title">
      <header className="flex flex-wrap items-center gap-3">
        <h1 id="history-title" className="font-display text-heading font-semibold text-text-primary">
          History
        </h1>
        <span className="text-small text-text-secondary" aria-live="polite">
          {records && fetched ? (filter.changed && fetched.length > 0 ? `${records.length} of ${fetched.length} record${fetched.length === 1 ? "" : "s"}` : `${records.length} record${records.length === 1 ? "" : "s"}`) : ""}
        </span>
        {health?.devmode ? (
          <span className="ml-auto">
            <PurgeButton onPurged={reload} />
          </span>
        ) : null}
      </header>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2" role="group" aria-label="Filters">
        <FilterSelect label="Outcome" value={filter.outcome ?? ""} onChange={(value) => setFilter({ outcome: (value || null) as Outcome | null })} options={[["", "All outcomes"], ...OUTCOMES.map((value): [string, string] => [value, OUTCOME_LABEL[value]])]} />
        <FilterSelect
          label="Mode"
          value={filter.mode ?? ""}
          onChange={(value) => setFilter({ mode: (value || null) as Mode | null })}
          options={[
            ["", "Both modes"],
            ["sfw", "SFW"],
            ["nsfw", "NSFW"],
          ]}
        />
        <label className="flex items-center gap-1.5 text-small text-text-primary" title="Only records where a policy's isolated and with-prompt scans disagree.">
          <input type="checkbox" checked={filter.changed} onChange={(event) => setFilter({ changed: event.target.checked })} className="accent-accent-primary" />
          <span>Prompt changed the verdict</span>
          <span aria-hidden="true" className="rounded-sm border border-warning/60 px-1 text-caption font-bold text-warning">
            ≠
          </span>
        </label>
      </div>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {!records && !error ? (
        <p className="flex items-center gap-2 text-small text-text-secondary">
          <Spinner /> Loading records…
        </p>
      ) : null}
      {records && records.length === 0 ? (
        <p className="text-small text-text-secondary">{fetched && fetched.length > 0 && filter.changed ? "No record here where the prompt changed the verdict." : "No records match."}</p>
      ) : null}
      {records && records.length > 0 ? (
        <ul className="space-y-2">
          {records.map((record) => (
            <HistoryRow key={record.id} record={record} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: [string, string][] }) {
  return (
    <label className="flex items-center gap-1.5 text-small text-text-secondary">
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="rounded-md border border-base-600/60 bg-base-800 px-2 py-1 text-small text-text-primary">
        {options.map(([optionValue, text]) => (
          <option key={optionValue} value={optionValue}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

export function HistoryRow({ record }: { record: GenerationRecord }) {
  const worst = overallState(record.guard);
  const letters = worst ? ruleLetters(allCells(record.guard).find((cell) => cell.state === worst)?.result) : [];
  const changed = promptChangedVerdict(record);
  return (
    <li>
      <Link href={`/record/${encodeURIComponent(record.id)}`} className="flex items-center gap-3 rounded-lg border border-base-600/60 bg-base-800 p-2 transition-colors hover:border-accent-primary/60 hover:bg-base-700/60">
        <Thumb record={record} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-small text-text-primary">{record.request.user_prompt || <span className="text-text-muted">(empty prompt)</span>}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-text-muted">
            <Badge className={OUTCOME_TONE[record.outcome]}>{record.outcome}</Badge>
            <span className="uppercase">{record.request.mode}</span>
            <span className="font-mono">{record.guard.enforcing_policy}</span>
            {record.outcome_reason ? <span>· {record.outcome_reason}</span> : null}
            <span title={formatWhen(record.created_at)}>· {ago(record.created_at)}</span>
          </p>
        </div>
        {changed ? (
          <span title="The prompt changed the verdict: the isolated and with-prompt scans disagree" className="rounded-sm border border-warning/60 px-1 text-caption font-bold text-warning">
            ≠
          </span>
        ) : null}
        {worst ? <Shield state={worst} letters={letters} size="h-7 w-7" title={`Overall: ${worst}`} /> : <span className="w-7" />}
      </Link>
    </li>
  );
}

/** A thumbnail for a served image. Anything else gets a plain mark and no img element. */
function Thumb({ record }: { record: GenerationRecord }) {
  if (hasImage(record)) {
    const blur = record.guard.nudenet?.blur ?? false;
    return (
      <span className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-base-700">
        {/* eslint-disable-next-line @next/next/no-img-element -- loaded by record id from darkroom */}
        <img src={imageUrl(record.id)} alt="" className={`h-full w-full object-cover ${blur ? "blur-md" : ""}`} draggable={false} />
      </span>
    );
  }
  const mark = record.outcome === "deleted" ? "✕" : record.outcome === "omitted" ? "–" : record.outcome === "refused" ? "⊘" : record.outcome === "failed" ? "!" : "·";
  return (
    <span aria-hidden="true" className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-md border text-subheading ${record.outcome === "deleted" || record.outcome === "refused" ? "border-error/40 text-error" : "border-dashed border-base-600 text-text-muted"}`}>
      {mark}
    </span>
  );
}
