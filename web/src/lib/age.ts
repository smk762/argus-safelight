import type { AgeBlock } from "./types";

/** Hover text for every estimate. The number is never shown without the tool's name beside it. */
export const AGE_HOVER = "An automated guess from a face by MiVOLO. It can be wrong.";

export const TOOL_LABEL: Record<string, string> = { mivolo: "MiVOLO" };

export function toolName(source: string): string {
  return TOOL_LABEL[source] ?? source;
}

/** One line per face: "MiVOLO estimate: 34". Empty when there is no age block or no face. */
export function ageEstimateLines(age: AgeBlock | null | undefined): string[] {
  if (!age) return [];
  return age.faces.map((face) => `${toolName(age.source)} estimate: ${face.age_estimate_years}`);
}

/** Why a `minor-exposed` record was deleted, in words that name the tools rather than a person. */
export function minorExposedText(age: AgeBlock | null | undefined): string {
  return `Triggered by a ${toolName(age?.source ?? "mivolo")} age estimate under 18 together with NudeNet exposure.`;
}
