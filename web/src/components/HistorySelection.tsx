"use client";

import { useState } from "react";

import { purgeRecord, removeImage } from "@/lib/api";
import { hasImage } from "@/lib/outcome";
import type { GenerationRecord } from "@/lib/types";

import { useCompose } from "./ComposeProvider";
import { Button, Notice } from "./ui";

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

type Action = "images" | "records";

/**
 * Select all, and what can be done to the rows ticked in the current view. Removing an image keeps its record, and a
 * ticked row with no image is left alone. Purging deletes the record too, which only a devmode darkroom offers:
 * refused and deleted records are the audit trail.
 */
export function HistorySelection({ records, picked, devmode, onPick, onChanged }: { records: GenerationRecord[]; picked: ReadonlySet<string>; devmode: boolean; onPick: (ids: ReadonlySet<string>) => void; onChanged: () => void }) {
  const { running } = useCompose();
  const [confirming, setConfirming] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const selected = records.filter((record) => picked.has(record.id));
  const removable = selected.filter(hasImage);
  const all = selected.length === records.length;

  const run = async (action: Action) => {
    const targets = action === "images" ? removable : selected;
    setBusy(true);
    setFailure(null);
    const failed: string[] = [];
    let message = "";
    for (const record of targets) {
      try {
        await (action === "images" ? removeImage(record.id) : purgeRecord(record.id));
      } catch (caught) {
        failed.push(record.id);
        message = caught instanceof Error ? caught.message : String(caught);
      }
    }
    if (failed.length > 0) setFailure(`${action === "images" ? "Removed" : "Purged"} ${targets.length - failed.length} of ${targets.length}: ${message}`);
    onPick(new Set(failed));
    setBusy(false);
    setConfirming(null);
    onChanged();
  };

  const notice = failure ? <Notice tone="error">{failure}</Notice> : null;
  if (records.length === 0) return notice;

  return (
    <div role="group" aria-label="Selection" className="space-y-2">
      <div className="flex min-h-9 flex-wrap items-center gap-x-3 gap-y-2 pl-1 text-small text-text-secondary">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={selected.length > 0 && all}
            ref={(node) => {
              if (node) node.indeterminate = selected.length > 0 && !all;
            }}
            onChange={() => onPick(all ? new Set() : new Set(records.map((record) => record.id)))}
            className="accent-accent-primary"
          />
          <span>{selected.length > 0 ? `${selected.length} selected` : "Select all"}</span>
        </label>
        {selected.length > 0 && confirming ? (
          <>
            <span>{confirming === "images" ? `Delete ${plural(removable.length, "image file")}? The records stay.` : `Permanently delete ${plural(selected.length, "record")} and any images? This cannot be undone.`}</span>
            <Button small tone="danger" onClick={() => void run(confirming)} disabled={busy}>
              {busy ? "Working…" : "Delete"}
            </Button>
            <Button small onClick={() => setConfirming(null)} disabled={busy}>
              Keep
            </Button>
          </>
        ) : selected.length > 0 ? (
          <>
            <Button small tone="danger" onClick={() => setConfirming("images")} disabled={removable.length === 0} title={removable.length === 0 ? "None of these has a stored image." : "Darkroom deletes the files and keeps the records, marked removed."}>
              Remove {plural(removable.length, "image")}
            </Button>
            {devmode ? (
              <Button small tone="danger" onClick={() => setConfirming("records")} disabled={running} title={running ? "Darkroom refuses to purge until the generation finishes." : "Devmode: delete these records and their images."}>
                Purge {plural(selected.length, "record")}
              </Button>
            ) : null}
            <Button small onClick={() => onPick(new Set())}>
              Clear
            </Button>
          </>
        ) : null}
      </div>
      {notice}
    </div>
  );
}
