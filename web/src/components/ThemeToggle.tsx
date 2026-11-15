"use client";

import { useSyncExternalStore } from "react";

import { effectiveScheme, serverScheme, subscribeScheme } from "@/lib/theme";

import { MoonIcon, SunIcon } from "./icons";
import { ICON_NEUTRAL, Tip } from "./ui";

/**
 * The family's two-state theme toggle. public/dh-theme.js handles clicks on any `[data-dh-theme-toggle]`, stores the
 * choice in the shared cookie and keeps `aria-pressed` (pressed = dark) in step, so React renders it once and leaves
 * it alone. Both icons are in the markup and globals.css shows the right one from the first paint.
 */
export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribeScheme, effectiveScheme, serverScheme) === "dark";
  return (
    <Tip label={dark ? "Dark theme on" : "Dark theme off"}>
      <button
        type="button"
        data-dh-theme-toggle=""
        aria-label="Dark theme"
        // Owned by dh-theme.js, which corrects it before hydration; React never updates it.
        aria-pressed="false"
        suppressHydrationWarning
        className={ICON_NEUTRAL}
      >
        <span className="theme-icon-moon">
          <MoonIcon />
        </span>
        <span className="theme-icon-sun">
          <SunIcon />
        </span>
      </button>
    </Tip>
  );
}
