"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { ApiError, getHealth, getModels, getPolicies } from "@/lib/api";
import { staticDemo } from "@/lib/demo";
import { loadTape } from "@/lib/staticApi";
import type { Tape } from "@/lib/tape";
import type { Health, Models, Policies } from "@/lib/types";

export interface Darkroom {
  health: Health | null;
  policies: Policies | null;
  models: Models | null;
  /** Null while the first `/health` is in flight; otherwise why darkroom cannot be reached. */
  error: string | null;
  loading: boolean;
  reload: () => void;
  /** The static demo's tape, once loaded: what the page replays. Always null in the live build. */
  tape: Tape | null;
}

const DarkroomContext = createContext<Darkroom | null>(null);

const HEALTH_POLL_MS = 30_000;

/**
 * `/health`, `/policies` and `/models` once, then `/health` again on a timer so a backend coming or going is noticed.
 * The timer fetches the catalogue again when it never loaded, or when ComfyUI is back: `/models` lists no samplers or
 * schedulers without it.
 */
export function DarkroomProvider({ children }: { children: ReactNode }) {
  const [health, setHealth] = useState<Health | null>(null);
  const [policies, setPolicies] = useState<Policies | null>(null);
  const [models, setModels] = useState<Models | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tape, setTape] = useState<Tape | null>(null);
  const [tick, setTick] = useState(0);
  const [loadedTick, setLoadedTick] = useState(-1);
  const loading = loadedTick !== tick;
  const catalogue = useRef({ loaded: false, comfyui: false });

  const reload = useCallback(() => setTick((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [nextHealth, nextPolicies, nextModels] = await Promise.all([getHealth(), getPolicies(), getModels()]);
        if (cancelled) return;
        setHealth(nextHealth);
        setPolicies(nextPolicies);
        setModels(nextModels);
        setError(null);
        catalogue.current = { loaded: true, comfyui: nextHealth.backends.comfyui };
        if (staticDemo()) setTape(await loadTape());
      } catch (caught) {
        if (cancelled) return;
        setError(caught instanceof ApiError || caught instanceof Error ? caught.message : String(caught));
      } finally {
        if (!cancelled) setLoadedTick(tick);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tick]);

  useEffect(() => {
    // A recording's /health never changes: nothing to poll.
    if (staticDemo()) return;
    const timer = setInterval(async () => {
      try {
        const next = await getHealth();
        setHealth(next);
        setError(null);
        if (!catalogue.current.loaded || (next.backends.comfyui && !catalogue.current.comfyui)) reload();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    }, HEALTH_POLL_MS);
    return () => clearInterval(timer);
  }, [reload]);

  const value = useMemo<Darkroom>(() => ({ health, policies, models, error, loading, reload, tape }), [health, policies, models, error, loading, reload, tape]);
  return <DarkroomContext.Provider value={value}>{children}</DarkroomContext.Provider>;
}

export function useDarkroom(): Darkroom {
  const value = useContext(DarkroomContext);
  if (!value) throw new Error("useDarkroom needs a DarkroomProvider");
  return value;
}
