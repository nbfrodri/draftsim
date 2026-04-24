"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { useDraftStore } from "@/store/draftStore";
import { currentGame } from "@/lib/series";
import { currentAction } from "@/lib/draftEngine";
import { phaseLabel, TOTAL_ACTIONS } from "@/lib/draftOrder";
import type { Champion } from "@/lib/types";
import DraftHeader from "./DraftHeader";
import TeamPanel from "./TeamPanel";
import ChampionGrid from "./ChampionGrid";

interface Props {
  champions: Champion[];
}

export default function DraftView({ champions }: Props) {
  const series = useDraftStore((s) => s.series)!;
  const secondsLeft = useDraftStore((s) => s.secondsLeft);
  const tickTimer = useDraftStore((s) => s.tickTimer);
  const timeout = useDraftStore((s) => s.timeout);

  const game = currentGame(series);
  const action = currentAction(game);

  useEffect(() => {
    if (!series.timerEnabled) return;
    if (secondsLeft == null) return;
    if (secondsLeft <= 0) {
      timeout();
      return;
    }
    const handle = window.setTimeout(tickTimer, 1000);
    return () => window.clearTimeout(handle);
  }, [series.timerEnabled, secondsLeft, tickTimer, timeout]);

  const phase = phaseLabel(game.actionIndex);
  const phaseRef = useRef<HTMLDivElement | null>(null);
  const lastPhaseRef = useRef(phase);

  useEffect(() => {
    if (lastPhaseRef.current !== phase && phaseRef.current) {
      gsap.fromTo(
        phaseRef.current,
        { opacity: 0, letterSpacing: "0.1em" },
        { opacity: 1, letterSpacing: "0.4em", duration: 0.8, ease: "power2.out" },
      );
    }
    lastPhaseRef.current = phase;
  }, [phase]);

  return (
    <div className="h-[100svh] overflow-hidden flex flex-col">
      <DraftHeader />

      <div
        ref={phaseRef}
        role="status"
        aria-live="polite"
        className="phase-banner py-1 md:py-1.5 text-center text-[10px] md:text-[11px] uppercase tracking-[0.35em] md:tracking-[0.4em] text-rift-gold shrink-0"
      >
        <span className="relative z-10">{phase}</span>
        {action && (
          <span className="relative z-10 ml-2 text-rift-muted">
            · action {game.actionIndex + 1} / {TOTAL_ACTIONS}
          </span>
        )}
      </div>

      <main className="flex-1 min-h-0 flex flex-col md:flex-row gap-2 md:gap-3 lg:gap-4 p-2 md:p-3 lg:p-4 overflow-hidden">
        <TeamPanel champions={champions} side="blue" />
        <ChampionGrid champions={champions} />
        <TeamPanel champions={champions} side="red" />
      </main>
    </div>
  );
}
