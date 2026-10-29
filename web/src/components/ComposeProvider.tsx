"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";

import { ApiError, generate, preflight as runPreflight } from "@/lib/api";
import { defaultCompose, normaliseCompose, toRequest, type ComposeState } from "@/lib/compose";
import { IDLE, isRunning, liveReducer, type LiveState } from "@/lib/live";
import type { Preflight } from "@/lib/types";

import { useDarkroom } from "./DarkroomProvider";

export interface PreflightStatus {
  state: "idle" | "checking" | "done" | "error";
  result: Preflight | null;
  error: string | null;
  /** The request the result answers, to tell a stale verdict from a current one. */
  forRequest: string | null;
}

export interface Compose {
  compose: ComposeState;
  /** False until the server's catalogue has set the defaults. */
  ready: boolean;
  update: (patch: Partial<ComposeState> | ((current: ComposeState) => ComposeState)) => void;
  replace: (next: ComposeState) => void;
  preflight: PreflightStatus;
  /** `POST /preflight` for the form as it stands. */
  check: () => Promise<Preflight | null>;
  /** Whether the shown verdict still matches the form. */
  preflightCurrent: boolean;
  /** The generation in flight, or the last one. */
  live: LiveState;
  running: boolean;
  /** `POST /generate/stream` for the form as it stands. Pre-flight runs on the server first, regardless. */
  start: () => void;
  /** Close the stream. Darkroom finishes on its own; the record still lands in history. */
  stop: () => void;
  clearLive: () => void;
}

const ComposeContext = createContext<Compose | null>(null);

export function ComposeProvider({ children }: { children: ReactNode }) {
  const { health, policies, models } = useDarkroom();
  const router = useRouter();
  const [compose, setCompose] = useState<ComposeState>(() => defaultCompose(null, null, null));
  const [ready, setReady] = useState(false);
  const [preflight, setPreflight] = useState<PreflightStatus>({ state: "idle", result: null, error: null, forRequest: null });
  const [live, dispatch] = useReducer(liveReducer, IDLE);
  const touched = useRef(false);
  const controller = useRef<AbortController | null>(null);

  // Server defaults the first time the catalogue arrives; afterwards only keep the form consistent with it.
  useEffect(() => {
    if (!policies || !models) return;
    setCompose((current) => {
      const base = touched.current ? current : defaultCompose(health, policies, models);
      return normaliseCompose(base, policies, models);
    });
    setReady(true);
  }, [health, policies, models]);

  const update = useCallback<Compose["update"]>((patch) => {
    touched.current = true;
    setCompose((current) => (typeof patch === "function" ? patch(current) : { ...current, ...patch }));
  }, []);

  const replace = useCallback((next: ComposeState) => {
    touched.current = true;
    setCompose(next);
  }, []);

  const check = useCallback(async () => {
    const request = toRequest(compose);
    const key = JSON.stringify(request);
    setPreflight({ state: "checking", result: null, error: null, forRequest: key });
    try {
      const result = await runPreflight(request);
      setPreflight({ state: "done", result, error: null, forRequest: key });
      return result;
    } catch (caught) {
      setPreflight({ state: "error", result: null, error: caught instanceof ApiError || caught instanceof Error ? caught.message : String(caught), forRequest: key });
      return null;
    }
  }, [compose]);

  const running = isRunning(live);

  const start = useCallback(() => {
    if (controller.current) return;
    const request = toRequest(compose);
    const abort = new AbortController();
    controller.current = abort;
    dispatch({ type: "start", request });
    setPreflight({ state: "idle", result: null, error: null, forRequest: null });
    router.push("/");
    generate(
      request,
      {
        onPreflight: (result) => {
          dispatch({ type: "preflight", preflight: result });
          setPreflight({ state: "done", result, error: null, forRequest: JSON.stringify(request) });
        },
        onQueued: () => dispatch({ type: "queued" }),
        onProgress: (progress) => dispatch({ type: "progress", progress }),
        onScan: (scan) => dispatch({ type: "scan", scan }),
      },
      abort.signal,
    )
      .then((record) => {
        dispatch({ type: "complete", record });
        router.replace(`/record/${encodeURIComponent(record.id)}`);
      })
      .catch((caught: unknown) => {
        if (abort.signal.aborted) dispatch({ type: "error", error: "Stopped. Darkroom finishes the generation on its own; its record will appear in the history." });
        else dispatch({ type: "error", error: caught instanceof Error ? caught.message : String(caught) });
      })
      .finally(() => {
        controller.current = null;
      });
  }, [compose, router]);

  const stop = useCallback(() => controller.current?.abort(), []);
  const clearLive = useCallback(() => {
    if (!controller.current) dispatch({ type: "reset" });
  }, []);

  const preflightCurrent = preflight.forRequest === JSON.stringify(toRequest(compose));

  const value = useMemo<Compose>(
    () => ({ compose, ready, update, replace, preflight, check, preflightCurrent, live, running, start, stop, clearLive }),
    [compose, ready, update, replace, preflight, check, preflightCurrent, live, running, start, stop, clearLive],
  );
  return <ComposeContext.Provider value={value}>{children}</ComposeContext.Provider>;
}

export function useCompose(): Compose {
  const value = useContext(ComposeContext);
  if (!value) throw new Error("useCompose needs a ComposeProvider");
  return value;
}
