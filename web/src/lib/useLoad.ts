"use client";

import { useCallback, useEffect, useState } from "react";

interface Loaded<T> {
  key: string;
  data: T | null;
  error: string | null;
}

export interface Load<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

/**
 * Run `fetcher` whenever `key` changes, keeping the result tagged with the key
 * it belongs to. A stale result for an old key is ignored, and a new key reads
 * as loading without any state being reset inside the effect.
 */
export function useLoad<T>(key: string, fetcher: () => Promise<T>): Load<T> {
  const [loaded, setLoaded] = useState<Loaded<T>>({ key: "", data: null, error: null });
  const [attempt, setAttempt] = useState(0);
  const effectiveKey = `${key}#${attempt}`;
  useEffect(() => {
    let cancelled = false;
    fetcher()
      .then((data) => {
        if (!cancelled) setLoaded({ key: effectiveKey, data, error: null });
      })
      .catch((caught: unknown) => {
        if (!cancelled) setLoaded({ key: effectiveKey, data: null, error: caught instanceof Error ? caught.message : String(caught) });
      });
    return () => {
      cancelled = true;
    };
    // The fetcher is read fresh on every key change; callers key it on its inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveKey]);
  const reload = useCallback(() => setAttempt((value) => value + 1), []);
  const current = loaded.key === effectiveKey;
  return { data: current ? loaded.data : null, error: current ? loaded.error : null, loading: !current, reload };
}
