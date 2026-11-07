"use client";

import { useRef } from "react";

import { ComposeForm } from "./ComposeForm";
import { useCompose } from "./ComposeProvider";
import { CloseIcon } from "./icons";
import { PreflightPanel } from "./PreflightPanel";
import { Button, IconButton, Notice, Spinner } from "./ui";

/**
 * The compose form in a modal, with the pre-flight verdict beside it so a
 * prompt can be checked and changed without leaving the dialog. The dialog
 * widens for the verdict, so the form keeps its two columns. Generate closes
 * it and the live view takes over.
 */
export function ComposeDialog() {
  const { composerOpen, closeComposer } = useCompose();
  if (!composerOpen) return null;
  return <OpenDialog onClose={closeComposer} />;
}

function OpenDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const { preflight, preflightCurrent } = useCompose();
  const hasVerdict = preflight.state !== "idle";
  return (
    <dialog
      ref={(node) => {
        ref.current = node;
        if (node && !node.open) node.showModal();
      }}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      aria-labelledby="compose-dialog-title"
      className={`m-auto ${hasVerdict ? "w-[min(1560px,94vw)]" : "w-[min(1200px,94vw)]"} rounded-lg border border-base-600 bg-base-800 p-0 text-text-primary shadow-soft backdrop:bg-base-900/70`}
    >
      <div className="flex items-center justify-between gap-3 border-b border-base-600/60 px-5 py-3">
        <h2 id="compose-dialog-title" className="font-display text-subheading font-semibold">
          Compose
        </h2>
        <IconButton label="Close" onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </div>
      <div className={`max-h-[80vh] overflow-auto px-5 pt-4 ${hasVerdict ? "grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" : ""}`}>
        <ComposeForm />
        {hasVerdict ? (
          <aside aria-label="Pre-flight verdict" className="space-y-3 pb-4 lg:sticky lg:top-0 lg:self-start">
            {preflight.state === "checking" ? (
              <p className="flex items-center gap-2 text-small text-text-secondary">
                <Spinner /> Checking the prompt…
              </p>
            ) : null}
            {preflight.state === "error" ? <Notice tone="error">Pre-flight failed: {preflight.error}</Notice> : null}
            {preflight.state === "done" && preflight.result ? <PreflightPanel preflight={preflight.result} stale={!preflightCurrent} /> : null}
          </aside>
        ) : null}
      </div>
    </dialog>
  );
}

/** The button that opens the composer from an empty history. The header has its own icon for it. */
export function ComposeButton() {
  const { openComposer } = useCompose();
  return (
    <Button tone="primary" onClick={openComposer} title="Write a prompt, pick the policies, check and generate.">
      Compose
    </Button>
  );
}
