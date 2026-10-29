"use client";

import { useSyncExternalStore } from "react";

import { applyTheme, nextTheme, readTheme, serverTheme, subscribeTheme, type Theme } from "@/lib/theme";

const LABEL: Record<Theme, string> = { system: "System theme", light: "Light theme", dark: "Dark theme" };
const SHORT: Record<Theme, string> = { system: "Auto", light: "Light", dark: "Dark" };

/** Cycles system → light → dark. The layout's boot script applies a saved choice before paint. */
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeTheme, readTheme, serverTheme);
  const next = nextTheme(theme);
  const title = `${LABEL[theme]}. Switch to ${LABEL[next].toLowerCase()}.`;
  return (
    <button type="button" onClick={() => applyTheme(next)} title={title} aria-label={title} className="rounded-md border border-base-600/60 px-2 py-1 text-caption text-text-secondary hover:bg-base-700">
      {SHORT[theme]}
    </button>
  );
}
