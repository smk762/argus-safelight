import { minorExposedText } from "./age";
import { CONTEXT_LABEL, firedCell, inputGuard, reasonParts, uncheckedCell } from "./shields";
import type { CellState, GenerationRecord, Outcome } from "./types";

export const OUTCOME_LABEL: Record<Outcome, string> = {
  passed: "Passed",
  review: "Review",
  deleted: "Deleted",
  omitted: "Omitted",
  refused: "Refused",
  failed: "Failed",
};

/** Token classes for an outcome badge. Each badge also carries its word, so colour is never the only signal. */
export const OUTCOME_TONE: Record<Outcome, string> = {
  passed: "text-success border-success/50",
  review: "text-warning border-warning/50",
  deleted: "text-error border-error/50",
  omitted: "text-text-secondary border-base-600",
  refused: "text-error border-error/50",
  failed: "text-text-secondary border-base-600",
};

/**
 * The line under the overall shield, for the worst cell in the grid. It speaks for SingGuard only: a record can be
 * safe here and still be deleted or omitted, by the age rule or NudeNet.
 */
export const OVERALL_NOTE: Record<CellState, string> = {
  safe: "SingGuard found no rule violations.",
  unchecked: "SingGuard found no violations, but at least one scan did not complete.",
  flagged: "SingGuard flagged a rule. The scans show where.",
  illegal: "SingGuard found an illegal rule. The scans show where.",
};

export interface DeletedSummary {
  headline: string;
  lines: string[];
}

function reasonLine(record: GenerationRecord, part: string): string {
  if (part === "minor-exposed") return minorExposedText(record.guard.age);
  if (part === "unchecked") {
    const unchecked = uncheckedCell(record);
    const where = unchecked ? `${CONTEXT_LABEL[unchecked.context].toLowerCase()} scan under ${unchecked.policy}` : "a scan under the enforcing policy";
    const error = unchecked?.cell.error ? ` (${unchecked.cell.error})` : "";
    return `The ${where} did not complete${error}. Darkroom fails closed: an unchecked enforcing cell deletes the image.`;
  }
  const fired = firedCell(record, part);
  if (fired) return `Rule ${fired.rule} fired under ${fired.policy}, in the ${CONTEXT_LABEL[fired.context].toLowerCase()} scan.`;
  return `Reason: ${part}.`;
}

/** What a deleted tile says: a line per reason, since rules, the age rule and a failed check can land together. */
export function deletedSummary(record: GenerationRecord): DeletedSummary {
  return { headline: "This image was destroyed.", lines: reasonParts(record.outcome_reason).map((part) => reasonLine(record, part)) };
}

/** What an omitted tile says. It must not read like a deletion. */
export function omittedSummary(record: GenerationRecord): DeletedSummary {
  const score = record.guard.nudenet?.exposed_score;
  if (record.outcome_reason === "sfw-unchecked" || score == null) {
    return { headline: "SFW output withheld.", lines: ["NudeNet did not respond, so the image was not kept."] };
  }
  return { headline: "SFW output withheld.", lines: [`NudeNet reported exposure (score ${score.toFixed(2)}), so the image was not kept.`] };
}

/** One reason of an input refusal, read against the input image's own scan, never the output's (there is none). */
function inputReasonLine(record: GenerationRecord, part: string): string {
  const input = record.guard.input;
  const guard = inputGuard(record);
  const scanned = guard ? { guard: { ...record.guard, ...guard } } : null;
  if (part === "minor-exposed") return `${minorExposedText(input?.age)} The input image showed it.`;
  if (part === "unchecked") {
    const unchecked = scanned ? uncheckedCell(scanned) : null;
    const where = unchecked ? `${CONTEXT_LABEL[unchecked.context].toLowerCase()} scan of the input under ${unchecked.policy}` : "input's scan under the enforcing policy";
    const error = unchecked?.cell.error ? ` (${unchecked.cell.error})` : "";
    return `The ${where} did not complete${error}. An input image goes on only when every enforcing check passes.`;
  }
  if (part === "sfw-exposed") {
    const score = input?.nudenet.exposed_score;
    return `NudeNet reported exposure in the input image${score != null ? ` (score ${score.toFixed(2)})` : ""}, which an SFW policy does not allow.`;
  }
  if (part === "sfw-unchecked") return "NudeNet did not respond about the input image, and an SFW policy needs its answer.";
  const fired = scanned ? firedCell(scanned, part) : null;
  if (fired) return `Rule ${fired.rule} fired under ${fired.policy}, in the ${CONTEXT_LABEL[fired.context].toLowerCase()} scan of the input image.`;
  return `Reason: ${part}.`;
}

/**
 * What a record refused by its input image says. The text pre-flight passed; the input then got an output's checks and
 * was refused, because only a "passed" input goes on (one an output would show behind a shield, as review, does not).
 */
export function inputRefusalSummary(record: GenerationRecord): DeletedSummary {
  const outcome = record.guard.input?.outcome;
  const lines = reasonParts(record.outcome_reason).map((part) => inputReasonLine(record, part));
  if (outcome === "review") lines.push("As an output this would have been review, shown behind a shield. An input image must pass outright.");
  return { headline: "The input image was refused. Nothing was generated.", lines };
}

export function hasImage(record: GenerationRecord): boolean {
  return (record.outcome === "passed" || record.outcome === "review") && record.removed_at == null;
}
