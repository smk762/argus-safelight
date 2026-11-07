"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useCompose } from "./ComposeProvider";
import { LiveView } from "./LiveView";

/** The main pane for `/`: the generation in flight. With none, the page has nothing of its own and goes to the history. */
export function ComposePane() {
  const { live, stop, clearLive } = useCompose();
  const router = useRouter();
  const idle = live.phase === "idle";

  useEffect(() => {
    if (idle) router.replace("/history");
  }, [idle, router]);

  if (idle) return null;
  return (
    <section className="space-y-4" aria-labelledby="compose-title">
      <h1 id="compose-title" className="font-display text-heading font-semibold text-text-primary">
        Generate
      </h1>
      <LiveView live={live} onStop={stop} onClear={clearLive} />
    </section>
  );
}
