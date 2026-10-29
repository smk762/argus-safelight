"use client";

import { useEffect, useId, useRef, useState } from "react";

import { archiveUrl, getRecords, purge } from "@/lib/api";
import { hasImage } from "@/lib/outcome";
import type { PurgeResult } from "@/lib/types";
import { useLoad } from "@/lib/useLoad";

import { useCompose } from "./ComposeProvider";
import { useDarkroom } from "./DarkroomProvider";
import { Button, Notice, Spinner } from "./ui";

const CONFIRM_WORD = "purge";

/**
 * Purge all, dev only. The caller renders this only when `/health` reports
 * `devmode`; darkroom refuses the request otherwise, so the hidden button is
 * not the only safeguard.
 */
export function PurgeButton({ onPurged }: { onPurged?: (result: PurgeResult) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button tone="danger" small onClick={() => setOpen(true)} title="Delete every record and image darkroom holds, and its ComfyUI history. Dev only.">
        Purge all
      </Button>
      {open ? (
        <PurgeDialog
          onClose={() => setOpen(false)}
          onPurged={(result) => {
            setOpen(false);
            onPurged?.(result);
          }}
        />
      ) : null}
    </>
  );
}

function PurgeDialog({ onClose, onPurged }: { onClose: () => void; onPurged: (result: PurgeResult) => void }) {
  const titleId = useId();
  const inputId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const { reload: reloadDarkroom } = useDarkroom();
  const { running } = useCompose();
  const { data: page, error: countError } = useLoad("purge-counts", () => getRecords({ pageSize: 500 }));
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLElement>("a, button, input")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [onClose]);

  const records = page?.total ?? null;
  const images = page ? page.records.filter(hasImage).length : null;
  const armed = typed.trim().toLowerCase() === CONFIRM_WORD && !busy && !running;

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await purge();
      reloadDarkroom();
      onPurged(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-base-900/70 p-4" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="w-full max-w-md space-y-4 rounded-lg border border-error/50 bg-base-800 p-5 shadow-xl">
        <h2 id={titleId} className="font-display text-subheading font-semibold text-text-primary">
          Purge everything darkroom holds?
        </h2>
        <p className="text-small text-text-primary">
          This deletes{" "}
          {records == null && !countError ? (
            <span className="inline-flex items-center gap-1">
              <Spinner /> counting…
            </span>
          ) : (
            <>
              <strong>{records ?? "all"} record{records === 1 ? "" : "s"}</strong>, <strong>{images ?? "all"} image{images === 1 ? "" : "s"}</strong>
            </>
          )}{" "}
          and darkroom&apos;s ComfyUI history. It cannot be undone.
        </p>
        {countError ? <Notice tone="warning">Could not count the records: {countError}</Notice> : null}
        <ol className="space-y-3 text-small text-text-primary">
          <li className="flex flex-wrap items-center gap-2">
            <span className="text-text-secondary">1.</span>
            <a href={archiveUrl()} download className="inline-flex items-center rounded-md border border-base-600 bg-base-700/60 px-3.5 py-2 font-medium text-text-primary transition-colors hover:border-accent-primary/60">
              Download archive
            </a>
            <span className="text-text-secondary">every record and image, as a zip</span>
          </li>
          <li className="space-y-1.5">
            <label htmlFor={inputId} className="flex items-center gap-2">
              <span className="text-text-secondary">2.</span>
              <span>
                Type <code className="rounded-sm bg-base-700 px-1 font-mono">{CONFIRM_WORD}</code> to enable the button
              </span>
            </label>
            <input id={inputId} value={typed} onChange={(event) => setTyped(event.target.value)} autoComplete="off" spellCheck={false} className="w-full rounded-md border border-base-600/60 bg-base-900 px-2 py-1.5 font-mono text-small text-text-primary" />
          </li>
        </ol>
        {running ? <Notice tone="warning">A generation is running; darkroom refuses to purge until it finishes.</Notice> : null}
        {error ? <Notice tone="error">{error}</Notice> : null}
        <div className="flex items-center justify-end gap-2">
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button tone="danger" onClick={confirm} disabled={!armed}>
            {busy ? "Purging…" : "Purge"}
          </Button>
        </div>
      </div>
    </div>
  );
}
