"use client";

import { ApiError, getRecord } from "@/lib/api";
import { useLoad } from "@/lib/useLoad";

import { ResultView } from "./ResultView";
import { Notice, Spinner } from "./ui";

/** `GET /record/{id}` and the result view for it. */
export function RecordView({ id }: { id: string }) {
  const { data: record, error, loading } = useLoad(id, () =>
    getRecord(id).catch((caught: unknown) => {
      throw caught instanceof ApiError && caught.status === 404 ? new Error(`No record ${id}.`) : caught;
    }),
  );
  if (error) return <Notice tone="error">{error}</Notice>;
  if (loading || !record) {
    return (
      <p className="flex items-center gap-2 text-small text-text-secondary">
        <Spinner /> Loading record…
      </p>
    );
  }
  return <ResultView record={record} />;
}
