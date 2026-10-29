"use client";

import { useCompose } from "./ComposeProvider";
import { PreflightPanel } from "./PreflightPanel";
import { Notice, Spinner } from "./ui";

/** The main pane for `/`: the pre-flight verdict for the form as it stands. */
export function ComposePane() {
  const { preflight, preflightCurrent } = useCompose();
  return (
    <section className="space-y-4" aria-labelledby="compose-title">
      <h1 id="compose-title" className="font-display text-heading font-semibold text-text-primary">
        Compose
      </h1>
      {preflight.state === "idle" ? (
        <p className="max-w-prose text-small text-text-secondary">
          Write a prompt, pick the policies, then <strong>Check</strong> for the pre-flight verdict: a text-only SingGuard check of the final prompt and the negative prompt under every selected policy, before anything is generated.
        </p>
      ) : null}
      {preflight.state === "checking" ? (
        <p className="flex items-center gap-2 text-small text-text-secondary">
          <Spinner /> Checking the prompt…
        </p>
      ) : null}
      {preflight.state === "error" ? <Notice tone="error">Pre-flight failed: {preflight.error}</Notice> : null}
      {preflight.state === "done" && preflight.result ? <PreflightPanel preflight={preflight.result} stale={!preflightCurrent} /> : null}
    </section>
  );
}
