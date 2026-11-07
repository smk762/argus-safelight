"use client";

import { useEffect, useState } from "react";

import { removeImage } from "@/lib/api";
import { fromRecord } from "@/lib/compose";
import { hasImage } from "@/lib/outcome";
import type { GenerationRecord } from "@/lib/types";

import { useCompose } from "./ComposeProvider";
import { CheckIcon, CloseIcon, CopyIcon, RegenerateIcon, TrashIcon } from "./icons";
import { Button, IconButton } from "./ui";

type CopyState = "idle" | "copied" | "failed";

/** Every result offers Regenerate and Copy record; a record that still has an image also offers Remove image. */
export function RecordActions({ record, onRemoved }: { record: GenerationRecord; onRemoved?: (record: GenerationRecord) => void }) {
  const { compose, replace, running, openComposer } = useCompose();
  const [copy, setCopy] = useState<CopyState>("idle");
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  useEffect(() => {
    if (copy === "idle") return;
    const timer = window.setTimeout(() => setCopy("idle"), 2000);
    return () => window.clearTimeout(timer);
  }, [copy]);

  const regenerate = () => {
    replace(fromRecord(record, compose));
    openComposer();
  };

  const copyRecord = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(record, null, 2));
      setCopy("copied");
    } catch {
      setCopy("failed");
    }
  };

  const remove = async () => {
    setRemoving(true);
    setRemoveError(null);
    try {
      const updated = await removeImage(record.id);
      setConfirming(false);
      onRemoved?.(updated);
    } catch (caught) {
      setRemoveError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setRemoving(false);
    }
  };

  const copyLabel = copy === "copied" ? "Copied" : copy === "failed" ? "Copy failed" : "Copy record";

  return (
    <>
      <IconButton label="Regenerate" tip={running ? "Wait for the current generation to finish" : "Regenerate: refill the form from this record, seed held"} tone="primary" onClick={regenerate} disabled={running}>
        <RegenerateIcon />
      </IconButton>
      <IconButton label={copyLabel} tip={copy === "idle" ? "Copy the record as JSON" : copyLabel} tone={copy === "failed" ? "danger" : "neutral"} onClick={copyRecord}>
        {copy === "copied" ? <CheckIcon /> : copy === "failed" ? <CloseIcon /> : <CopyIcon />}
      </IconButton>
      <span className="sr-only" aria-live="polite">
        {copy === "idle" ? "" : copyLabel}
      </span>
      {hasImage(record) ? (
        confirming ? (
          <span role="group" aria-label="Confirm removing the image" className="inline-flex flex-wrap items-center gap-2 text-small text-text-secondary">
            <span>Delete the image file? The record stays.</span>
            <Button tone="danger" onClick={remove} disabled={removing}>
              {removing ? "Removing…" : "Delete image"}
            </Button>
            <Button onClick={() => setConfirming(false)} disabled={removing}>
              Keep
            </Button>
            {removeError ? <span className="text-error">{removeError}</span> : null}
          </span>
        ) : (
          <IconButton label="Remove image" tip="Remove image: darkroom deletes the file and keeps the record" tone="danger" onClick={() => setConfirming(true)}>
            <TrashIcon />
          </IconButton>
        )
      ) : null}
    </>
  );
}
