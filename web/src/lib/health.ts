import type { Health } from "./types";

export type HealthTone = "ok" | "warning" | "error" | "loading";

export const BACKENDS: { key: keyof Health["backends"]; label: string; note: string }[] = [
  { key: "singguard", label: "SingGuard", note: "Darkroom never runs unguarded; Generate waits for this." },
  { key: "comfyui", label: "ComfyUI", note: "Renders the image." },
  { key: "nudenet", label: "NudeNet", note: "Exposure score. Without it SFW generation is refused." },
  { key: "ollama", label: "Ollama", note: "Optional prompt expansion. Never a guard." },
  { key: "age", label: "Age check", note: "MiVOLO estimate from detected faces, when the extra is installed." },
];

/** What `generateBlock` waits for. Any other backend missing leaves Generate on offer. */
const REQUIRED: readonly (keyof Health["backends"])[] = ["singguard", "comfyui"];

export interface HealthSummary {
  tone: HealthTone;
  /** Drawn on the status icon, so the state reads without colour. */
  mark: string;
  label: string;
}

/** The status icon's one-line reading of `/health`. */
export function healthSummary(health: Health | null, error: string | null): HealthSummary {
  if (error) return { tone: "error", mark: "✕", label: "Darkroom is not reachable" };
  if (!health) return { tone: "loading", mark: "…", label: "Waiting for darkroom" };
  const down = BACKENDS.filter(({ key }) => !health.backends[key]);
  if (down.length === 0) return { tone: "ok", mark: "✓", label: "All backends reachable" };
  const label = `${down.map(({ label: name }) => name).join(", ")} unreachable`;
  return down.some(({ key }) => REQUIRED.includes(key)) ? { tone: "error", mark: "✕", label } : { tone: "warning", mark: "!", label };
}
