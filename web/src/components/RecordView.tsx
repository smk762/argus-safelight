"use client";

import { useState } from "react";

import { ApiError, getRecord } from "@/lib/api";
import type { GenerationRecord } from "@/lib/types";
import { useLoad } from "@/lib/useLoad";

import { useCompose } from "./ComposeProvider";
import { RecordActions } from "./RecordActions";
import { ResultView } from "./ResultView";
import { Notice, Spinner } from "./ui";

/** `GET /record/{id}` and the result view for it. A generation that just finished shows its record while the fetch confirms it. */
export function RecordView({ id }: { id: string }) {
  const { live } = useCompose();
  const { data: fetched, error, loading } = useLoad(id, () =>
    getRecord(id).catch((caught: unknown) => {
      throw caught instanceof ApiError && caught.status === 404 ? new Error(`No record ${id}.`) : caught;
    }),
  );
  // The record darkroom returned from DELETE /record/{id}, which supersedes the fetched one until the page changes.
  const [updated, setUpdated] = useState<GenerationRecord | null>(null);
  const record = (updated?.id === id ? updated : null) ?? fetched ?? (live.record?.id === id ? live.record : null);
  if (error && !record) return <Notice tone="error">{error}</Notice>;
  if (!record) {
    return (
      <p className="flex items-center gap-2 text-small text-text-secondary">
        <Spinner /> Loading record…
      </p>
    );
  }
  return (
    <>
      {loading && !fetched ? <p className="sr-only">Confirming with darkroom…</p> : null}
      <ResultView record={record} actions={<RecordActions record={record} onRemoved={setUpdated} />} />
    </>
  );
}
