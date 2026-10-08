"use client";

import { useEffect, useState } from "react";
import type { Champion } from "@/lib/types";
import type { SeasonState } from "@/lib/season/types";
import type { OutlookProgress, RosterOutlook } from "@/lib/season/rosterOutlookView";

type Calculation = {
  source: SeasonState;
  champions: Champion[];
  attempt: number;
  result?: RosterOutlook;
  error?: string;
  progress?: OutlookProgress;
};

// One completed snapshot only: bounded memory, no serialization on render and
// no saves. Strict immutable input identity prevents reuse after roster edits.
let lastCompleted: Calculation | null = null;

export function useRosterOutlook(season: SeasonState, champions: Champion[], enabled: boolean) {
  const [attempt, setAttempt] = useState(0);
  const [calculation, setCalculation] = useState<Calculation | null>(() =>
    lastCompleted?.source === season && lastCompleted.champions === champions
      ? { ...lastCompleted, attempt: 0 } : null);
  const cached = lastCompleted?.source === season && lastCompleted.champions === champions ? lastCompleted : null;
  const current = calculation?.source === season && calculation.champions === champions && calculation.attempt === attempt ? calculation : cached;
  useEffect(() => {
    if (!enabled || !champions.length) return;
    if (lastCompleted?.source === season && lastCompleted.champions === champions) {
      return;
    }
    // Once a new snapshot is requested, release the previous season reference.
    lastCompleted = null;
    let worker: Worker | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    const publish = (value: Pick<Calculation, "result" | "error" | "progress">) => {
      if (cancelled) return;
      const calculation = { source: season, champions, attempt, ...value };
      if (value.result) lastCompleted = calculation;
      setCalculation(calculation);
      if (value.result || value.error) {
        worker?.terminate();
        clearTimeout(timeout);
      }
    };
    // Short debounce coalesces rapid season updates; the simulation pause is
    // handled by enabled, so opening an idle panel need not wait 300 ms.
    const debounce = setTimeout(() => {
      try {
        worker = new Worker("/workers/rosterOutlook.worker.js");
        worker.onmessage = (event: MessageEvent<Pick<Calculation, "result" | "error" | "progress">>) => {
          const value = event.data;
          publish(value.result || value.progress || value.error ? value : { error: "The forecast returned no result." });
        };
        worker.onerror = () => publish({ error: "The forecast could not run. Your season is unchanged." });
        worker.onmessageerror = () => publish({ error: "The forecast response could not be read." });
        timeout = setTimeout(() => publish({ error: "The forecast took too long. Try again." }), 120_000);
        worker.postMessage({ season, champions });
      } catch {
        publish({ error: "Could not start the forecast. Try again." });
      }
    }, 100);
    return () => { cancelled = true; clearTimeout(debounce); clearTimeout(timeout); worker?.terminate(); };
  }, [season, champions, enabled, attempt]);
  return { current, retry: () => setAttempt(value => value + 1) };
}
