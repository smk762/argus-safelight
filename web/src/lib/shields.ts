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

export interface RowVerdict {
  state: CellState;
  letters: string[];
  title: string;
}

/** The prefix darkroom puts on `outcome_reason` when the input image refused the attempt. */
export const INPUT_REFUSAL = "input image: ";

/** Refused by the image-to-image input's own scan, after the text pre-flight let it through. Read from `guard.input`, not the reason's wording. */
export function inputRefused(record: Pick<GenerationRecord, "outcome" | "guard">): boolean {
  const input = record.guard.input;
  return record.outcome === "refused" && input != null && input.outcome !== "passed";
}

/** The input image's scan cells, as a guard block the grid and `firedCell` can read. Null for text-to-image. */
export function inputGuard(record: Pick<GenerationRecord, "guard">): Pick<GenerationRecord["guard"], "enforcing_policy" | "advisory_policies" | "scans"> | null {
  const input = record.guard.input;
  return input ? { enforcing_policy: record.guard.enforcing_policy, advisory_policies: record.guard.advisory_policies, scans: input.scans } : null;
}

/**
 * The shield on a history row: the worst scan cell. A refusal has no output scans, so it shows the worst pre-flight
 * cell, or the worst input-scan cell when the input image refused it.
 */
export function rowVerdict(record: Pick<GenerationRecord, "outcome" | "guard">): RowVerdict | null {
  const refused = record.outcome === "refused";
  const byInput = inputRefused(record);
  const cells = byInput ? allCells({ scans: record.guard.input?.scans ?? {} }) : refused ? Object.values(record.guard.preflight ?? {}) : allCells(record.guard);
  const state = worstState(cells.map((cell) => cell.state));
  if (state == null || state === "pending") return null;
  return { state, letters: ruleLetters(cells.find((cell) => cell.state === state)?.result), title: `${byInput ? "Input image" : refused ? "Pre-flight" : "Overall"}: ${state}` };
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

/** A record's `outcome_reason`, which joins every reason that applied ("default:A, minor-exposed"). An input refusal's prefix ("input image: ") is dropped; `inputRefused` says whose reasons they are. */
export function reasonParts(reason: string | null | undefined): string[] {
  const text = reason ?? "";
  return (text.startsWith(INPUT_REFUSAL) ? text.slice(INPUT_REFUSAL.length) : text)
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

export interface RuleHit {
  /** `policy:letter`, as darkroom writes a rule into `outcome_reason`. */
  code: string;
  policy: string;
  /** The rule as the policy names it. */
  rule: string;
}

/** The reasons a record can carry that are not a policy's rule. */
export const REASON_WORDS: readonly string[] = ["minor-exposed", "unchecked", "sfw-exposed", "sfw-unchecked"];

/** Every rule that fired on a record, in any cell: pre-flight, the input image's scan or the output's, enforcing or advisory. */
export function recordRules(record: Pick<GenerationRecord, "guard">): RuleHit[] {
  const { preflight, scans, input } = record.guard;
  const pairs = (from: Record<string, RowPair> | undefined) =>
    Object.entries(from ?? {}).flatMap(([policy, pair]): [string, Cell | null][] => [
      [policy, pair.isolated],
      [policy, pair.with_prompt],
    ]);
  const cells: [string, Cell | null][] = [...Object.entries(preflight ?? {}), ...pairs(input?.scans), ...pairs(scans)];
  const hits = new Map<string, RuleHit>();
  for (const [policy, cell] of cells) {
    for (const rule of cell?.result?.rules ?? []) {
      const code = `${policy}:${ruleLetter(rule)}`;
      if (!hits.has(code)) hits.set(code, { code, policy, rule });
    }
  }
  return [...hits.values()];
}

/** Whether a record matches the history's rule filter: a rule that fired on it, or a word in its reason. */
export function matchesRule(record: Pick<GenerationRecord, "outcome_reason" | "guard">, wanted: string): boolean {
  if (REASON_WORDS.includes(wanted)) return reasonParts(record.outcome_reason).includes(wanted);
  return recordRules(record).some((hit) => hit.code === wanted);
}

export const CONTEXT_LABEL: Record<ScanContext, string> = { isolated: "Isolated", with_prompt: "With prompt" };
