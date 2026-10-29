"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { removeImage } from "@/lib/api";
import { fromRecord } from "@/lib/compose";
import { hasImage } from "@/lib/outcome";
import type { GenerationRecord } from "@/lib/types";

import { useCompose } from "./ComposeProvider";
import { Button } from "./ui";

type CopyState = "idle" | "copied" | "failed";

/** Every result offers Regenerate and Copy record; a record that still has an image also offers Remove image. */
export function RecordActions({ record, onRemoved }: { record: GenerationRecord; onRemoved?: (record: GenerationRecord) => void }) {
  const router = useRouter();
  const { compose, replace, running } = useCompose();
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
    router.push("/");
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

  return (
    <>
      <Button tone="primary" onClick={regenerate} disabled={running} title={running ? "Wait for the current generation to finish." : "Refill the form from this record, seed held, and go to Compose."}>
        Regenerate
      </Button>
      <Button onClick={copyRecord} title="Copy the record as JSON." aria-live="polite">
        {copy === "copied" ? "Copied" : copy === "failed" ? "Copy failed" : "Copy record"}
      </Button>
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
          <Button tone="danger" onClick={() => setConfirming(true)} title="Ask darkroom to delete the image file. The record is kept, marked removed.">
            Remove image
          </Button>
        )
      ) : null}
    </>
  );
}
