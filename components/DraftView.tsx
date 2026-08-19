"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { useDraftStore } from "@/store/draftStore";
import { currentGame, fearlessLockedSet } from "@/lib/series";
import {
  computeTournamentChampionWR,
  computeTeamChampionWR,
  effectiveLockedSet,
} from "@/lib/tournament";
import { currentAction } from "@/lib/draftEngine";
import {
  chooseAIActionWithRationale,
  getPersonality,
  isAITurn,
  isNeuralPolicyLoaded,
  seriesAIContextFrom,
} from "@/lib/draftAI";
import { phaseLabel, TOTAL_ACTIONS } from "@/lib/draftOrder";
import { playTimerTick } from "@/lib/sounds";
import type { Champion } from "@/lib/types";
import DraftHeader from "./DraftHeader";
import TeamPanel from "./TeamPanel";
import ChampionGrid from "./ChampionGrid";

interface Props {
  champions: Champion[];
}

// The AI no longer auto-locks. As soon as it computes its decision the
// chosen champion is hovered (highlighted in the grid + shown in the
// rationale panel), and a "Lock AI Pick" button replaces the disabled
// "AI ON CLOCK" button. The user clicks to commit, controlling the pace
// of the draft. The Skip button still fast-forwards in AI vs AI mode for
// users who don't want to click through every action.

export default function DraftView({ champions }: Props) {
  const series = useDraftStore((s) => s.series)!;
  const tournament = useDraftStore((s) => s.tournament);
  const secondsLeft = useDraftStore((s) => s.secondsLeft);
  const tickTimer = useDraftStore((s) => s.tickTimer);
  const timeout = useDraftStore((s) => s.timeout);
  // triggerAIAction is invoked from ChampionGrid's lock-in button (manual
  // advance — no auto-timer in DraftView anymore).
  const completeAIDraft = useDraftStore((s) => s.completeAIDraft);
  const selectChampion = useDraftStore((s) => s.selectChampion);
  const setAIRationale = useDraftStore((s) => s.setAIRationale);
  const playerForms = useDraftStore((s) => s.playerForms);

  const game = currentGame(series);
  const action = currentAction(game);
  const aiOnClock = isAITurn(game, series.mode, series.aiSide);

  // AI auto-lock with a hover-then-lock cadence. We decide the champion id
  // synchronously when the AI's turn begins, then schedule TWO timers:
  // one to "hover" (preview in the grid) shortly before the lock, and one
  // to actually lock with the SAME pre-decided id. Computing once is
  // critical: chooseAIAction has random jitter, so re-deciding at lock time
  // would risk the locked champion differing from the previewed one.
  useEffect(() => {
    if (!aiOnClock) {
      // Clear stale rationale when control returns to a human.
      setAIRationale(null);
      return;
    }
    if (!action) return;
    const tournamentWR = tournament
      ? computeTournamentChampionWR(tournament)
      : undefined;
    const personality = getPersonality(
      action.side === "blue" ? series.bluePersonalityId : series.redPersonalityId,
    );
    const decision = chooseAIActionWithRationale(
      game,
      champions,
      effectiveLockedSet(tournament, fearlessLockedSet(series)),
      seriesAIContextFrom(
        series,
        action.side,
        champions,
        tournamentWR,
        {
          map: playerForms,
          keyFor: tournament
            ? (n) => tournament.teams.find((t) => t.name === n)?.id ?? n
            : undefined,
        },
        tournament ? computeTeamChampionWR(tournament) : undefined,
      ),
      Math.random,
      personality,
    );
    if (!decision) return;
    // Surface rationale + hover the chosen champion immediately. The
    // user must click "Lock AI Pick" to commit (no auto-lock). This lets
    // the user read the breakdown at their own pace.
    setAIRationale(decision);
    selectChampion(decision.championId);
  }, [
    aiOnClock,
    action,
    game,
    series,
    champions,
    tournament,
    playerForms,
    selectChampion,
    setAIRationale,
  ]);

  // Existing 30s timer. Pause ticking while the AI is on the clock — the
  // human shouldn't see a frantic countdown for a turn they aren't taking.
  useEffect(() => {
    if (!series.timerEnabled) return;
    if (aiOnClock) return;
    if (secondsLeft == null) return;
    if (secondsLeft <= 0) {
      timeout();
      return;
    }
    const handle = window.setTimeout(tickTimer, 1000);
    return () => window.clearTimeout(handle);
  }, [series.timerEnabled, aiOnClock, secondsLeft, tickTimer, timeout]);

  // Countdown tick — plays the Riot client's actual tick SFX once per
  // second during the last 5 seconds. Watches secondsLeft transitions so
  // it fires exactly once per integer change (no double-plays from
  // re-renders, no plays during AI turns).
  useEffect(() => {
    if (!series.timerEnabled) return;
    if (aiOnClock) return;
    if (secondsLeft == null) return;
    if (secondsLeft >= 1 && secondsLeft <= 5) {
      playTimerTick();
    }
  }, [secondsLeft, series.timerEnabled, aiOnClock]);

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

  const showSkipButton = series.mode === "aivai" && !!action;
  const aiRationale = useDraftStore((s) => s.aiRationale);

  return (
    <div className="h-[100svh] overflow-hidden flex flex-col">
      <DraftHeader />

      <div
        ref={phaseRef}
        role="status"
        aria-live="polite"
        className="phase-banner py-1 md:py-1.5 px-3 md:px-4 text-[10px] md:text-[11px] uppercase tracking-[0.35em] md:tracking-[0.4em] text-rift-gold shrink-0 relative flex items-center justify-center gap-3"
      >
        <span className="relative z-10">{phase}</span>
        {action && (
          <span className="relative z-10 text-rift-muted">
            · action {game.actionIndex + 1} / {TOTAL_ACTIONS}
          </span>
        )}
        <span
          className="relative z-10 inline-flex items-center gap-1 px-1.5 py-px text-[8px] md:text-[9px] uppercase tracking-[0.2em] border border-rift-line/50 bg-rift-bg/40 text-rift-mutedbright"
          title={
            isNeuralPolicyLoaded()
              ? "Neural policy model is driving AI decisions"
              : "Heuristic scoring AI is driving decisions"
          }
        >
          {isNeuralPolicyLoaded() ? "Neural" : "Heuristic"}
        </span>
        {aiOnClock && action && (
          <span
            className={`relative z-10 inline-flex items-center gap-1.5 ${
              action.side === "blue"
                ? "text-rift-bluebright"
                : "text-rift-redbright"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full animate-breath ${
                action.side === "blue" ? "bg-rift-blue" : "bg-rift-red"
              }`}
            />
            {action.side === "blue" ? "Blue" : "Red"} AI thinking…
            {aiRationale?.identityLabel && (
              <span className="text-rift-gold/80 ml-1.5">
                · targeting {aiRationale.identityLabel}
              </span>
            )}
          </span>
        )}
        {showSkipButton && (
          <button
            type="button"
            onClick={completeAIDraft}
            className="absolute right-3 md:right-4 top-1/2 -translate-y-1/2 z-20 px-2.5 md:px-3 py-1 border border-rift-gold/40 text-rift-goldbright bg-rift-gold/5 hover:bg-rift-gold/15 hover:border-rift-gold transition-all text-[9px] md:text-[10px] tracking-[0.3em]"
            title="Resolve the rest of the AI draft instantly"
          >
            Skip Draft »
          </button>
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
