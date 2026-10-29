import { minorExposedText } from "./age";
import { CONTEXT_LABEL, firedCell } from "./shields";
import type { GenerationRecord, Outcome } from "./types";

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

export interface DeletedSummary {
  headline: string;
  lines: string[];
}

/** What a deleted tile says: the rule, the policy and the scan context that fired, or the age rule, or the failed check. */
export function deletedSummary(record: GenerationRecord): DeletedSummary {
  const reason = record.outcome_reason;
  if (reason === "minor-exposed") {
    return { headline: "This image was destroyed.", lines: [minorExposedText(record.guard.age)] };
  }
  if (reason === "unchecked") {
    const fired = firedCell(record);
    const where = fired ? `${CONTEXT_LABEL[fired.context].toLowerCase()} scan under ${fired.policy}` : "a scan under the enforcing policy";
    const error = fired?.cell.error ? ` (${fired.cell.error})` : "";
    return {
      headline: "This image was destroyed.",
      lines: [`The ${where} did not complete${error}. Darkroom fails closed: an unchecked enforcing cell deletes the image.`],
    };
  }
  const fired = firedCell(record);
  if (fired?.cell.result) {
    const rule = fired.cell.result.rules[0] ?? reason ?? "a rule";
    return {
      headline: "This image was destroyed.",
      lines: [`Rule ${rule} fired under ${fired.policy}, in the ${CONTEXT_LABEL[fired.context].toLowerCase()} scan.`],
    };
  }
  return { headline: "This image was destroyed.", lines: reason ? [`Reason: ${reason}.`] : [] };
}

/** What an omitted tile says. It must not read like a deletion. */
export function omittedSummary(record: GenerationRecord): DeletedSummary {
  const score = record.guard.nudenet?.exposed_score;
  if (record.outcome_reason === "sfw-unchecked" || score == null) {
    return { headline: "SFW output withheld.", lines: ["NudeNet did not respond, so the image was not kept."] };
  }
  return { headline: "SFW output withheld.", lines: [`NudeNet reported exposure (score ${score.toFixed(2)}), so the image was not kept.`] };
}

export function hasImage(record: GenerationRecord): boolean {
  return (record.outcome === "passed" || record.outcome === "review") && record.removed_at == null;
}
