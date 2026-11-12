"use client";

import { healthSummary, type HealthTone } from "@/lib/health";
import { useEscapeDismiss } from "@/lib/useEscapeDismiss";

import { useDarkroom } from "./DarkroomProvider";
import { HealthCard } from "./HealthCard";
import { StatusIcon } from "./icons";
import { ICON_NEUTRAL } from "./ui";

const BADGE_TONE: Record<HealthTone, string> = {
  ok: "bg-success",
  warning: "bg-warning",
  error: "bg-error",
  loading: "bg-base-600",
};

/** Darkroom's health as a header icon: a badge with a mark for the summary, and `HealthCard` on hover, focus or tap. */
export function StatusMenu() {
  const { health, error } = useDarkroom();
  const { tone, mark, label } = healthSummary(health, error);
  // Escape hides the card without moving the pointer or the focus; it shows again once both have left.
  const { dismissed, bind } = useEscapeDismiss();
  return (
    <div className="group sm:relative" {...bind}>
      <button type="button" aria-label={`Darkroom status: ${label}`} aria-describedby="darkroom-status" className={`${ICON_NEUTRAL} relative`}>
        <StatusIcon />
        <span aria-hidden="true" className={`absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold leading-none text-base-900 ${BADGE_TONE[tone]}`}>
          {mark}
        </span>
      </button>
      {/* The top padding bridges the gap, so the pointer can reach Refresh without the panel closing. On a phone it spans the header, not the icon. */}
      <div id="darkroom-status" className={`absolute inset-x-4 top-full z-30 hidden pt-2 sm:left-auto sm:right-0 sm:w-[380px] ${dismissed ? "" : "group-focus-within:block group-hover:block"}`}>
        <HealthCard className="shadow-soft" />
      </div>
    </div>
  );
}
