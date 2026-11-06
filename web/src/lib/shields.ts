import type { Cell, CellState, GenerationRecord, GuardResult, ScanContext } from "./types";

/** A cell's state, or `pending` while a generation has not reached that cell yet. */
export type ShieldState = CellState | "pending";

/** Worst last. An unchecked advisory cell is grey and changes nothing, so it ranks under a flag. */
const SEVERITY: Record<ShieldState, number> = { pending: -1, safe: 0, unchecked: 1, flagged: 2, illegal: 3 };

export function worstState(states: readonly ShieldState[]): ShieldState | null {
  let worst: ShieldState | null = null;
  for (const state of states) if (worst == null || SEVERITY[state] > SEVERITY[worst]) worst = state;
  return worst;
}

/** The letter of a rule as SingGuard names it: "H" for "H. Non-Consensual Sexual Content". A rule with no letter comes back whole. */
export function ruleLetter(rule: string): string {
  const match = rule.trim().match(/^([A-Za-z])(?:\.|\s|$)/);
  return match ? match[1].toUpperCase() : rule.trim();
}

export function ruleLetters(result: GuardResult | null | undefined): string[] {
  if (!result) return [];
  const letters: string[] = [];
  for (const rule of result.rules) {
    const letter = ruleLetter(rule);
    if (!letters.includes(letter)) letters.push(letter);
  }
  return letters;
}

/** The mark drawn inside the shield, so the state reads without colour. */
export function shieldMark(state: ShieldState, letters: readonly string[]): string {
  if (state === "safe") return "✓";
  if (state === "unchecked") return "?";
  if (state === "pending") return "…";
  return letters.join("") || (state === "illegal" ? "✕" : "!");
}

export function shieldLabel(state: ShieldState, letters: readonly string[] = []): string {
  if (state === "flagged" || state === "illegal") return letters.length > 0 ? `${state} ${letters.join(", ")}` : state;
  return state;
}

/** A row's cells; either may still be missing while a generation is in flight. */
export interface RowPair {
  isolated: Cell | null;
  with_prompt: Cell | null;
}

export interface PolicyRow {
  policy: string;
  enforcing: boolean;
  pair: RowPair | null;
}

/** The grid's rows: the enforcing policy first and labelled, then the advisory ones in the record's order. */
export function policyRows(guard: Pick<GenerationRecord["guard"], "enforcing_policy" | "advisory_policies" | "scans">): PolicyRow[] {
  const names = [guard.enforcing_policy, ...guard.advisory_policies.filter((name) => name !== guard.enforcing_policy)];
  for (const name of Object.keys(guard.scans ?? {})) if (!names.includes(name)) names.push(name);
  return names.map((policy) => ({ policy, enforcing: policy === guard.enforcing_policy, pair: guard.scans?.[policy] ?? null }));
}

/**
 * The two verdicts of a row disagree: the ≠ badge. Nothing is said until both
 * are in, and an unchecked cell is no verdict, so it cannot disagree with one.
 */
export function rowDisagrees(pair: RowPair | null): boolean {
  const a = pair?.isolated;
  const b = pair?.with_prompt;
  return a != null && b != null && a.state !== "unchecked" && b.state !== "unchecked" && a.state !== b.state;
}

/** The prompt alone turned a green into amber or red: the dashed outline on the with-prompt cell. */
export function promptTurned(pair: RowPair | null): boolean {
  return pair?.isolated?.state === "safe" && (pair.with_prompt?.state === "flagged" || pair.with_prompt?.state === "illegal");
}

/** The comparison the package exists to show: any policy whose isolated and with-prompt cells disagree. */
export function promptChangedVerdict(record: Pick<GenerationRecord, "guard">): boolean {
  return Object.values(record.guard.scans ?? {}).some((pair) => rowDisagrees(pair));
}

export function allCells(guard: Pick<GenerationRecord["guard"], "scans">): Cell[] {
  return Object.values(guard.scans ?? {}).flatMap((pair) => [pair.isolated, pair.with_prompt]);
}

/** The overall shield beside the image: the worst cell, or null before any scan. */
export function overallState(guard: Pick<GenerationRecord["guard"], "scans">): CellState | null {
  const worst = worstState(allCells(guard).map((cell) => cell.state));
  return worst === "pending" ? null : worst;
}

export interface FiredCell {
  policy: string;
  context: ScanContext;
  cell: Cell;
}

export interface FiredRule extends FiredCell {
  /** The rule as the policy names it: "H. Non-Consensual Sexual Content". */
  rule: string;
}

const CONTEXTS: readonly ScanContext[] = ["isolated", "with_prompt"];

/** A record's `outcome_reason`, which joins every reason that applied ("default:A, minor-exposed"). */
export function reasonParts(reason: string | null | undefined): string[] {
  return (reason ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

/** The first enforcing scan cell that could not be read, which is what the `unchecked` reason means. */
export function uncheckedCell(record: Pick<GenerationRecord, "guard">): FiredCell | null {
  for (const row of policyRows(record.guard)) {
    if (!row.enforcing || !row.pair) continue;
    for (const context of CONTEXTS) {
      const cell = row.pair[context];
      if (cell?.state === "unchecked") return { policy: row.policy, context, cell };
    }
  }
  return null;
}

/**
 * The scan cell behind one `policy:letter` code from `reasonParts`: an illegal cell before a flagged one. Only that
 * policy's row is read, because a letter means something different under each policy. Null for a word such as
 * "minor-exposed", and for a code no cell carries.
 */
export function firedCell(record: Pick<GenerationRecord, "guard">, code: string): FiredRule | null {
  const split = code.indexOf(":");
  if (split <= 0) return null;
  const policy = code.slice(0, split);
  const letter = ruleLetter(code.slice(split + 1));
  const pair = policyRows(record.guard).find((row) => row.policy === policy)?.pair;
  if (!pair) return null;
  for (const wanted of ["illegal", "flagged"] as const) {
    for (const context of CONTEXTS) {
      const cell = pair[context];
      const rule = cell?.state === wanted ? cell.result?.rules.find((name) => ruleLetter(name) === letter) : undefined;
      if (cell && rule) return { policy, context, cell, rule };
    }
  }
  return null;
}

export const CONTEXT_LABEL: Record<ScanContext, string> = { isolated: "Isolated", with_prompt: "With prompt" };
