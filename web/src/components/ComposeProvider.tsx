"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { ApiError, preflight as runPreflight } from "@/lib/api";
import { defaultCompose, normaliseCompose, toRequest, type ComposeState } from "@/lib/compose";
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
}

const ComposeContext = createContext<Compose | null>(null);

export function ComposeProvider({ children }: { children: ReactNode }) {
  const { health, policies, models } = useDarkroom();
  const [compose, setCompose] = useState<ComposeState>(() => defaultCompose(null, null, null));
  const [ready, setReady] = useState(false);
  const [preflight, setPreflight] = useState<PreflightStatus>({ state: "idle", result: null, error: null, forRequest: null });
  const touched = useRef(false);

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

  const preflightCurrent = preflight.forRequest === JSON.stringify(toRequest(compose));

  const value = useMemo<Compose>(() => ({ compose, ready, update, replace, preflight, check, preflightCurrent }), [compose, ready, update, replace, preflight, check, preflightCurrent]);
  return <ComposeContext.Provider value={value}>{children}</ComposeContext.Provider>;
}

export function useCompose(): Compose {
  const value = useContext(ComposeContext);
  if (!value) throw new Error("useCompose needs a ComposeProvider");
  return value;
}
