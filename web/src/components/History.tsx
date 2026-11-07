"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { getRecords, imageUrl } from "@/lib/api";
import { historyQuery, parseHistoryFilter, type HistoryFilter } from "@/lib/historyQuery";
import { OUTCOME_LABEL, OUTCOME_TONE, hasImage } from "@/lib/outcome";
import { REASON_WORDS, matchesRule, promptChangedVerdict, reasonParts, recordRules, rowVerdict, type RuleHit } from "@/lib/shields";
import { ago, formatWhen } from "@/lib/time";
import { OUTCOMES, type GenerationRecord, type Mode, type Outcome } from "@/lib/types";
import { useLoad } from "@/lib/useLoad";

import { ComposeButton } from "./ComposeDialog";
import { useDarkroom } from "./DarkroomProvider";
import { HistorySelection } from "./HistorySelection";
import { ImageRemovedIcon } from "./icons";
import { PurgeButton } from "./PurgeDialog";
import { Shield } from "./Shield";
import { Badge, Notice, Spinner } from "./ui";

const PAGE_SIZE = 200;
const SELECT = "rounded-md border border-base-600/60 bg-base-800 px-2 py-1 text-small text-text-primary";

/** Where a new server starts: the app opens on the history, so this says how to fill it. */
function EmptyHistory() {
  return (
    <div className="max-w-prose space-y-3">
      <p className="text-small text-text-secondary">
        No records yet. <strong>Compose</strong> opens the form. Write a prompt, pick the policies, then <strong>Check</strong> for the pre-flight verdict: a text-only SingGuard check of the final prompt and the negative prompt under every selected policy, before anything is generated. <strong>Generate</strong> runs the same check first, regardless.
      </p>
      <ComposeButton />
    </div>
  );
}

/** `GET /records`, filtered by outcome and mode on darkroom's side and by "Prompt changed the verdict" and the rule here. The URL holds the filter. */
export function History() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const filter = parseHistoryFilter(params);
  const { health } = useDarkroom();
  const { data, error, reload } = useLoad(`${filter.outcome ?? ""}|${filter.mode ?? ""}`, () => getRecords({ outcome: filter.outcome, mode: filter.mode, pageSize: PAGE_SIZE }));
  const fetched = data?.records ?? null;
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());
  const narrowed = filter.changed || filter.removed || filter.rule != null;
  const records = fetched?.filter((record) => (!filter.changed || promptChangedVerdict(record)) && (!filter.removed || record.removed_at != null) && (!filter.rule || matchesRule(record, filter.rule))) ?? null;

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
          {records && fetched ? (narrowed && fetched.length > 0 ? `${records.length} of ${fetched.length} record${fetched.length === 1 ? "" : "s"}` : `${records.length} record${records.length === 1 ? "" : "s"}`) : ""}
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
        <RuleSelect records={fetched ?? []} value={filter.rule} onChange={(rule) => setFilter({ rule })} />
        <label className="flex items-center gap-1.5 text-small text-text-primary" title="Only records where a policy's isolated and with-prompt scans disagree.">
          <input type="checkbox" checked={filter.changed} onChange={(event) => setFilter({ changed: event.target.checked })} className="accent-accent-primary" />
          <span>Prompt changed the verdict</span>
          <span aria-hidden="true" className="rounded-sm border border-warning/60 px-1 text-caption font-bold text-warning">
            ≠
          </span>
        </label>
        <label className="flex items-center gap-1.5 text-small text-text-primary" title="Only records whose image was removed. The record stays.">
          <input type="checkbox" checked={filter.removed} onChange={(event) => setFilter({ removed: event.target.checked })} className="accent-accent-primary" />
          <span>Image removed</span>
        </label>
      </div>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {!records && !error ? (
        <p className="flex items-center gap-2 text-small text-text-secondary">
          <Spinner /> Loading records…
        </p>
      ) : null}
      {records && records.length === 0 ? (
        !filter.outcome && !filter.mode && !narrowed ? (
          <EmptyHistory />
        ) : (
          <p className="text-small text-text-secondary">{fetched && fetched.length > 0 && filter.removed ? "No record here has had its image removed." : fetched && fetched.length > 0 && filter.rule ? "No record here matches that rule." : fetched && fetched.length > 0 && filter.changed ? "No record here where the prompt changed the verdict." : "No records match."}</p>
        )
      ) : null}
      {/* Outside the list: a reload empties it for a moment, and a failure must outlive that. */}
      <HistorySelection records={records ?? []} picked={picked} devmode={health?.devmode ?? false} onPick={setPicked} onChanged={reload} />
      {records && records.length > 0 ? (
        <ul className="space-y-2">
          {records.map((record) => (
            <HistoryRow
              key={record.id}
              record={record}
              selected={picked.has(record.id)}
              onSelect={(on) => {
                const next = new Set(picked);
                if (on) next.add(record.id);
                else next.delete(record.id);
                setPicked(next);
              }}
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/** The rules on the records in view, grouped by policy because a letter means something different under each one. */
function RuleSelect({ records, value, onChange }: { records: GenerationRecord[]; value: string | null; onChange: (rule: string | null) => void }) {
  const byPolicy = new Map<string, Map<string, RuleHit>>();
  for (const record of records) {
    for (const hit of recordRules(record)) {
      if (!byPolicy.has(hit.policy)) byPolicy.set(hit.policy, new Map());
      byPolicy.get(hit.policy)?.set(hit.code, hit);
    }
  }
  const words = REASON_WORDS.filter((word) => records.some((record) => reasonParts(record.outcome_reason).includes(word)));
  const known = words.includes(value ?? "") || [...byPolicy.values()].some((hits) => value != null && hits.has(value));
  return (
    <label className="flex items-center text-small">
      <span className="sr-only">Rule</span>
      <select value={value ?? ""} onChange={(event) => onChange(event.target.value || null)} className={`max-w-[320px] ${SELECT}`}>
        <option value="">All rules</option>
        {value && !known ? <option value={value}>{value}</option> : null}
        {[...byPolicy.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([policy, hits]) => (
            <optgroup key={policy} label={policy}>
              {[...hits.values()]
                .sort((a, b) => a.rule.localeCompare(b.rule))
                .map((hit) => (
                  <option key={hit.code} value={hit.code}>
                    {hit.policy} · {hit.rule}
                  </option>
                ))}
            </optgroup>
          ))}
        {words.length > 0 ? (
          <optgroup label="Other reasons">
            {words.map((word) => (
              <option key={word} value={word}>
                {word}
              </option>
            ))}
          </optgroup>
        ) : null}
      </select>
    </label>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: [string, string][] }) {
  return (
    <label className="flex items-center gap-1.5 text-small text-text-secondary">
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className={SELECT}>
        {options.map(([optionValue, text]) => (
          <option key={optionValue} value={optionValue}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

export function HistoryRow({ record, selected, onSelect }: { record: GenerationRecord; selected: boolean; onSelect: (on: boolean) => void }) {
  const verdict = rowVerdict(record);
  const changed = promptChangedVerdict(record);
  return (
    <li className="flex items-center gap-2">
      <input type="checkbox" checked={selected} onChange={(event) => onSelect(event.target.checked)} aria-label={`Select ${record.request.user_prompt || record.id}`} className="ml-1 shrink-0 accent-accent-primary" />
      <Link href={`/record/${encodeURIComponent(record.id)}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg border border-base-600/60 bg-base-800 p-2 transition-colors hover:border-accent-primary/60 hover:bg-base-700/60">
        <Thumb record={record} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-small text-text-primary">{record.request.user_prompt || <span className="text-text-muted">(empty prompt)</span>}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-text-muted">
            <Badge className={OUTCOME_TONE[record.outcome]}>{record.outcome}</Badge>
            {record.removed_at ? <Badge className="border-base-600 text-text-secondary">image removed</Badge> : null}
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
        {verdict ? <Shield state={verdict.state} letters={verdict.letters} size="h-7 w-7" title={verdict.title} /> : <span className="w-7" />}
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
  if (record.removed_at) {
    return (
      <span title="Image removed. The record stays." className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-dashed border-base-600 text-text-muted">
        <ImageRemovedIcon />
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
