"use client";

import { useSyncExternalStore } from "react";

import { applyTheme, nextTheme, readTheme, serverTheme, subscribeTheme, type Theme } from "@/lib/theme";

import { MoonIcon, SunIcon, SystemIcon } from "./icons";
import { IconButton } from "./ui";

const LABEL: Record<Theme, string> = { system: "System theme", light: "Light theme", dark: "Dark theme" };
const ICON: Record<Theme, () => React.ReactNode> = { system: SystemIcon, light: SunIcon, dark: MoonIcon };

/** Cycles system → light → dark. The layout's boot script applies a saved choice before paint. */
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeTheme, readTheme, serverTheme);
  const next = nextTheme(theme);
  const title = `${LABEL[theme]}. Switch to ${LABEL[next].toLowerCase()}.`;
  const Current = ICON[theme];
  return (
    <IconButton label={title} onClick={() => applyTheme(next)}>
      <Current />
    </IconButton>
  );
}
