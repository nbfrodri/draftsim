"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { useDraftStore } from "@/store/draftStore";
import { currentGame, maxGames, seriesScore } from "@/lib/series";
import {
  simulateMatch,
  type EventType,
  type MatchEvent,
  type MatchTimeline,
  type SimulationResult,
  type TeamScore,
} from "@/lib/matchSimulator";
import {
  getChampionMeta,
  type Archetype,
  type CC,
  type ChampionMeta,
  type Phase,
} from "@/lib/championMeta";
import type { Champion, Lane, Side } from "@/lib/types";
import LaneIcon from "./LaneIcon";
import EventIcon from "./EventIcon";
import AIRationaleHistory from "./AIRationaleHistory";
import TierListView from "./TierListView";
import SynergyView from "./SynergyView";
import Modal from "./Modal";

interface Props {
  champions: Champion[];
}

export default function BetweenGamesView({ champions }: Props) {
  const series = useDraftStore((s) => s.series)!;
  const declareWinner = useDraftStore((s) => s.declareWinner);
  const proceedToNextGame = useDraftStore((s) => s.proceedToNextGame);
  const swapPickSlots = useDraftStore((s) => s.swapPickSlots);
  const aiRationaleHistory = useDraftStore((s) => s.aiRationaleHistory);
  const resetAll = useDraftStore((s) => s.resetAll);
  // Reference panels — same modals used in CreateSimulationForm. Useful
  // post-draft when reviewing tier list / synergies in the context of
  // the just-finished game.
  const metaVersion = useDraftStore((s) => s.metaVersion);
  const [tierListOpen, setTierListOpen] = useState(false);
  const [synergyOpen, setSynergyOpen] = useState(false);
  // Main-menu confirm modal — abandoning a series mid-flow loses all
  // progress, so a confirmation guard is appropriate.
  const [exitOpen, setExitOpen] = useState(false);

  const game = currentGame(series);
  const gameIndex = series.games.length - 1;
  const winnerDeclared = game.winner != null;
  const [swapSides, setSwapSides] = useState(false);

  // Track a selected pick for role swapping. null when none.
  const [swapSel, setSwapSel] = useState<{ side: Side; slot: number } | null>(null);

  // Match simulation: when set, the panel replaces the manual winner buttons.
  const [simResult, setSimResult] = useState<SimulationResult | null>(null);

  const handleSimulate = () => {
    setSimResult(simulateMatch(game, champions));
  };

  // Re-simulate produces a fresh result object so the panel resets its
  // playback state (its useEffect keys on result identity).
  const handleResimulate = () => {
    setSimResult(simulateMatch(game, champions));
  };

  const handleApplySim = () => {
    if (!simResult) return;
    declareWinner(simResult.winner);
    setSimResult(null);
  };

  const byId = useMemo(() => new Map(champions.map((c) => [c.id, c])), [champions]);

  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!rootRef.current) return;
    const ctx = gsap.context(() => {
      gsap.from(".bg-fade", {
        opacity: 0,
        y: 24,
        duration: 0.7,
        stagger: 0.08,
        ease: "power3.out",
      });
    }, rootRef);
    return () => ctx.revert();
  }, []);

  const score = seriesScore(series);
  const isSeriesOver = series.status === "complete";
  const hasNextGame = series.games.length < maxGames(series.format);

  const handlePickClick = (side: Side, slot: number) => {
    if (!swapSel) {
      setSwapSel({ side, slot });
      return;
    }
    if (swapSel.side !== side) {
      // Can only swap within the same team; reset to new selection.
      setSwapSel({ side, slot });
      return;
    }
    if (swapSel.slot === slot) {
      // Clicked the same slot → cancel.
      setSwapSel(null);
      return;
    }
    swapPickSlots(gameIndex, side, swapSel.slot, slot);
    setSwapSel(null);
  };

  return (
    <div
      ref={rootRef}
      className="min-h-[100svh] overflow-y-auto flex items-start justify-center px-4 py-8 md:py-12 relative"
    >
      {/* Main-menu escape hatch — top-left, low-key. Confirms before
          destroying series progress. */}
      <button
        type="button"
        onClick={() => setExitOpen(true)}
        className="absolute top-3 left-3 md:top-4 md:left-4 inline-flex items-center gap-1.5 px-2.5 md:px-3 py-1.5 border border-rift-line text-rift-mutedbright hover:text-rift-goldbright hover:border-rift-gold/50 hover:bg-rift-gold/5 transition-all text-[9px] md:text-[10px] uppercase tracking-[0.3em] z-20"
        title="Return to main menu (loses series progress)"
      >
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="w-3 h-3"
          aria-hidden
        >
          <path d="M9 3l-5 5 5 5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 8h10" strokeLinecap="round" />
        </svg>
        Main Menu
      </button>

      <div className="w-full max-w-5xl">
        <div className="bg-fade text-center mb-6 md:mb-8">
          <div className="text-[10px] md:text-xs uppercase tracking-[0.5em] text-rift-gold/70">
            Game {game.gameNumber} · Draft Complete
          </div>
          <div className="mt-3 font-display text-3xl md:text-5xl text-rift-goldbright tracking-wider">
            {winnerDeclared ? (
              <>
                <span
                  className={
                    game.winner === "blue" ? "text-rift-blue" : "text-rift-red"
                  }
                >
                  {game.winner === "blue" ? series.blueTeam : series.redTeam}
                </span>
                <span className="text-rift-gold/70 text-xl md:text-3xl mx-2">
                  wins Game {game.gameNumber}
                </span>
              </>
            ) : (
              "Who won this game?"
            )}
          </div>
          <div className="ornament mt-4 max-w-md mx-auto">
            <span className="text-[10px] tracking-[0.4em] text-rift-gold/60 uppercase">
              {series.format.toUpperCase()} · Series {score.blue} — {score.red}
            </span>
          </div>
        </div>

        {/* Reference panels — tier list and synergies (same modals as the
            create-simulation form). Useful for reviewing meta context
            against the just-completed draft. */}
        <div className="bg-fade flex items-center justify-center gap-2 md:gap-3 mb-4">
          <button
            type="button"
            onClick={() => setTierListOpen(true)}
            className="px-3 md:px-4 py-2 border border-rift-gold/50 bg-rift-gold/5 text-rift-goldbright hover:bg-rift-gold/15 hover:border-rift-gold font-display text-[10px] md:text-xs tracking-[0.3em] uppercase transition-all flex items-center gap-2"
          >
            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-3.5 h-3.5 md:w-4 md:h-4"
              aria-hidden
            >
              <path d="M3 4h14v2H3zM3 9h10v2H3zM3 14h6v2H3z" />
              <path d="M15 11h2v2h-2zM12 14h5v2h-5z" opacity="0.6" />
            </svg>
            <span className="hidden sm:inline">Tier List</span>
            <span className="sm:hidden">Tiers</span>
          </button>
          <button
            type="button"
            onClick={() => setSynergyOpen(true)}
            className="px-3 md:px-4 py-2 border border-rift-gold/50 bg-rift-gold/5 text-rift-goldbright hover:bg-rift-gold/15 hover:border-rift-gold font-display text-[10px] md:text-xs tracking-[0.3em] uppercase transition-all flex items-center gap-2"
          >
            <svg
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="w-3.5 h-3.5 md:w-4 md:h-4"
              aria-hidden
            >
              <circle cx="6" cy="10" r="3" />
              <circle cx="14" cy="10" r="3" />
              <path d="M9 10h2" strokeLinecap="round" />
            </svg>
            <span className="hidden sm:inline">Synergies</span>
            <span className="sm:hidden">Syn</span>
          </button>
        </div>

        {/* Role swap hint */}
        <div className="bg-fade text-center mb-3 text-[10px] md:text-xs uppercase tracking-[0.3em] text-rift-muted">
          Tip · click two picks on the same team to swap their champions
        </div>

        <div className="bg-fade grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 mb-6">
          <CompletedSide
            name={series.blueTeam}
            side="blue"
            picks={game.bluePicks.map((id) => (id != null ? byId.get(id) : undefined))}
            bans={game.blueBans.map((id) => (id != null ? byId.get(id) : undefined))}
            roles={game.blueRoles}
            wins={game.winner === "blue"}
            selection={swapSel}
            onPickClick={handlePickClick}
          />
          <CompletedSide
            name={series.redTeam}
            side="red"
            picks={game.redPicks.map((id) => (id != null ? byId.get(id) : undefined))}
            bans={game.redBans.map((id) => (id != null ? byId.get(id) : undefined))}
            roles={game.redRoles}
            wins={game.winner === "red"}
            selection={swapSel}
            onPickClick={handlePickClick}
          />
        </div>

        {/* AI decisions recap — only when at least one AI action was
            recorded for the just-finished game. Skip-fast-forwarded actions
            don't appear here (skip path bypasses rationale capture). */}
        {aiRationaleHistory.length > 0 && (
          <div className="bg-fade mb-6">
            <AIRationaleHistory
              history={aiRationaleHistory}
              champions={champions}
            />
          </div>
        )}

        {!winnerDeclared && simResult ? (
          <div className="bg-fade">
            <SimulationPanel
              result={simResult}
              blueTeam={series.blueTeam}
              redTeam={series.redTeam}
              bluePicks={game.bluePicks}
              redPicks={game.redPicks}
              blueRoles={game.blueRoles}
              redRoles={game.redRoles}
              byId={byId}
              onApply={handleApplySim}
              onCancel={() => setSimResult(null)}
              onResimulate={handleResimulate}
            />
          </div>
        ) : !winnerDeclared ? (
          <div className="bg-fade space-y-3 md:space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
              <WinnerButton
                name={series.blueTeam}
                side="blue"
                onClick={() => declareWinner("blue")}
              />
              <WinnerButton
                name={series.redTeam}
                side="red"
                onClick={() => declareWinner("red")}
              />
            </div>
            <button
              type="button"
              onClick={handleSimulate}
              className="group relative w-full py-3 md:py-4 border border-rift-gold/40 bg-rift-gold/5 hover:bg-rift-gold/15 hover:border-rift-gold transition-all text-rift-goldbright font-display tracking-[0.3em] md:tracking-[0.4em] text-xs md:text-sm uppercase overflow-hidden"
            >
              {/* Animated sweep on hover — subtle "predicting" cue */}
              <span className="pointer-events-none absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out bg-gradient-to-r from-transparent via-rift-gold/20 to-transparent" />
              <span className="relative inline-flex items-center justify-center gap-2.5">
                <svg
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  className="w-3.5 h-3.5 md:w-4 md:h-4"
                  aria-hidden
                >
                  <circle cx="8" cy="8" r="6" />
                  <path d="M8 4v4l2.5 1.5" strokeLinecap="round" />
                </svg>
                Simulate Match
              </span>
            </button>
          </div>
        ) : (
          <div className="bg-fade space-y-3 md:space-y-4">
            {!isSeriesOver && hasNextGame && (
              <>
                <button
                  type="button"
                  onClick={() => setSwapSides((v) => !v)}
                  className={`w-full py-3 md:py-4 border transition-all ${
                    swapSides
                      ? "border-rift-gold bg-rift-gold/10 text-rift-goldbright"
                      : "border-rift-line text-rift-mutedbright hover:border-rift-gold/50 hover:bg-rift-gold/5"
                  }`}
                >
                  <div className="text-[10px] md:text-xs uppercase tracking-[0.35em]">
                    {swapSides ? "Sides will swap" : "Keep same sides"}
                  </div>
                  <div className="text-xs md:text-sm text-rift-muted mt-1">
                    <span className="text-rift-blue">
                      {swapSides ? series.redTeam : series.blueTeam}
                    </span>
                    <span className="mx-2">→ Blue · Red ←</span>
                    <span className="text-rift-red">
                      {swapSides ? series.blueTeam : series.redTeam}
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => proceedToNextGame(swapSides)}
                  className="btn-gold w-full py-4 md:py-5 font-display text-base md:text-lg tracking-[0.3em] md:tracking-[0.4em]"
                >
                  START GAME {series.games.length + 1}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <TierListView
        open={tierListOpen}
        champions={champions}
        overrideVersion={metaVersion}
        onClose={() => setTierListOpen(false)}
      />
      <SynergyView
        open={synergyOpen}
        champions={champions}
        onClose={() => setSynergyOpen(false)}
      />
      <Modal
        open={exitOpen}
        title="Return to Main Menu"
        message="Abandon this series and return to the main menu? Series progress will be lost."
        confirmLabel="Return"
        cancelLabel="Stay"
        tone="danger"
        onConfirm={() => {
          setExitOpen(false);
          resetAll();
        }}
        onCancel={() => setExitOpen(false)}
      />
    </div>
  );
}

function CompletedSide({
  name,
  side,
  picks,
  bans,
  roles,
  wins,
  selection,
  onPickClick,
}: {
  name: string;
  side: Side;
  picks: (Champion | undefined)[];
  bans: (Champion | undefined)[];
  roles: (Lane | null)[];
  wins: boolean;
  selection: { side: Side; slot: number } | null;
  onPickClick: (side: Side, slot: number) => void;
}) {
  const text = side === "blue" ? "text-rift-blue" : "text-rift-red";
  const border = side === "blue" ? "border-rift-blue/40" : "border-rift-red/40";
  const bgGrad =
    side === "blue"
      ? "from-rift-bluedeep/20 to-transparent"
      : "from-rift-reddeep/20 to-transparent";
  return (
    <div
      className={`relative border ${border} bg-gradient-to-br ${bgGrad} bg-rift-panel/40 p-4 ${
        wins ? "shadow-glow-gold" : ""
      }`}
    >
      {wins && (
        <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-rift-gold text-rift-bg text-[9px] font-display tracking-[0.4em]">
          WINNER
        </div>
      )}
      <div
        className={`font-display ${text} uppercase tracking-[0.25em] mb-3 truncate text-sm md:text-base`}
      >
        {name}
      </div>

      {/* Picks with role icons — clickable to swap */}
      <div className="grid grid-cols-5 gap-1.5 mb-3">
        {picks.map((c, i) => {
          const selected = selection?.side === side && selection.slot === i;
          const lane = roles[i];
          const isSwapCandidate =
            selection != null && selection.side === side && !selected;
          return (
            <button
              type="button"
              key={`p-${i}`}
              onClick={() => onPickClick(side, i)}
              aria-label={lane ? `${c?.name ?? "Empty"} (${lane})` : c?.name ?? "Empty"}
              className={`slot-frame aspect-square overflow-hidden relative transition-all ${
                selected
                  ? "ring-2 ring-rift-gold shadow-glow-gold scale-[1.05] z-10"
                  : isSwapCandidate
                  ? "ring-1 ring-rift-gold/60 hover:ring-rift-gold hover:scale-[1.03]"
                  : "hover:border-rift-gold/60"
              }`}
            >
              {c ? (
                <img
                  src={c.iconUrl}
                  alt={c.name}
                  className="w-full h-full object-cover"
                />
              ) : null}
              {lane && (
                <div className="absolute bottom-0.5 right-0.5 bg-black/70 rounded-sm p-0.5 flex items-center justify-center">
                  <LaneIcon lane={lane} size="xs" />
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div className="text-[9px] md:text-[10px] uppercase tracking-[0.35em] text-rift-muted mb-1.5">
        Bans
      </div>
      <div className="flex gap-1">
        {bans.map((c, i) => (
          <div
            key={`b-${i}`}
            className="slot-frame banned w-7 h-7 md:w-8 md:h-8 overflow-hidden relative"
            title={c?.name}
          >
            {c && (
              <>
                <img
                  src={c.iconUrl}
                  alt={c.name}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-[140%] h-[1.5px] bg-rift-red/80 rotate-45" />
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

type PlayMode = "playing" | "paused" | "finished";
type PlaySpeed = 1 | 2 | 4;

// Each event reveals after at least this many real-time seconds at 1x speed.
// Even closely-spaced in-game events get a breathing-room gap so users can
// read each line. Total playback ≈ events.length * SECONDS_PER_EVENT_AT_1X.
// For a typical ~16-event timeline that's ~80s at 1x, ~40s at 2x, ~20s at 4x.
const SECONDS_PER_EVENT_AT_1X = 5;

function matchPaceLabel(duration: number): string {
  if (duration < 26) return "Decisive";
  if (duration < 32) return "Standard";
  if (duration < 38) return "Scaling Battle";
  return "Marathon";
}

function SimulationPanel({
  result,
  blueTeam,
  redTeam,
  bluePicks,
  redPicks,
  blueRoles,
  redRoles,
  byId,
  onApply,
  onCancel,
  onResimulate,
}: {
  result: SimulationResult;
  blueTeam: string;
  redTeam: string;
  bluePicks: (number | null)[];
  redPicks: (number | null)[];
  blueRoles: (Lane | null)[];
  redRoles: (Lane | null)[];
  byId: Map<number, Champion>;
  onApply: () => void;
  onCancel: () => void;
  onResimulate: () => void;
}) {
  const duration = result.timeline.durationMinutes;
  const winnerIsBlue = result.winner === "blue";

  const [mode, setMode] = useState<PlayMode>("playing");
  const [speed, setSpeed] = useState<PlaySpeed>(1);
  const [currentMin, setCurrentMin] = useState(0);
  const [latestEventIdx, setLatestEventIdx] = useState(-1);

  const playStartRef = useRef<number | null>(null);
  const accumulatedRef = useRef(0); // seconds elapsed at last pause

  // Reset state every time a new result is provided (re-simulate).
  useEffect(() => {
    setMode("playing");
    setSpeed(1);
    setCurrentMin(0);
    setLatestEventIdx(-1);
    playStartRef.current = null;
    accumulatedRef.current = 0;
  }, [result]);

  // Animation loop: event-paced playback. Each event consumes a 5s real-time
  // slot at 1x; within a slot the in-game clock interpolates from the prior
  // event's minute up to the next event's minute. This guarantees ≥5s
  // between event reveals even when their in-game timestamps are tight
  // (e.g., first blood and grubs both early-game). Pauses freeze elapsed
  // time; speed changes recompute the start anchor so the clock doesn't jump.
  useEffect(() => {
    if (mode !== "playing") return;
    let raf = 0;
    playStartRef.current = performance.now();
    const baseAccumulated = accumulatedRef.current;
    const events = result.timeline.events;
    const totalSec = events.length * SECONDS_PER_EVENT_AT_1X;
    const tick = () => {
      const now = performance.now();
      const elapsedSec =
        baseAccumulated + ((now - (playStartRef.current ?? now)) / 1000) * speed;
      if (elapsedSec >= totalSec) {
        accumulatedRef.current = totalSec;
        setCurrentMin(duration);
        setMode("finished");
        return;
      }
      const slotIdx = Math.min(
        events.length - 1,
        Math.floor(elapsedSec / SECONDS_PER_EVENT_AT_1X),
      );
      const slotStart = slotIdx * SECONDS_PER_EVENT_AT_1X;
      const slotProgress =
        (elapsedSec - slotStart) / SECONDS_PER_EVENT_AT_1X;
      const fromMin = slotIdx === 0 ? 0 : events[slotIdx - 1].minutes;
      const toMin = events[slotIdx].minutes;
      setCurrentMin(fromMin + (toMin - fromMin) * slotProgress);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      // Capture elapsed at unmount (pause/speed change) so resume doesn't reset.
      const now = performance.now();
      accumulatedRef.current =
        baseAccumulated + ((now - (playStartRef.current ?? now)) / 1000) * speed;
    };
  }, [mode, speed, duration, result.timeline.events]);

  // Reveal events as the clock crosses their timestamps.
  const revealedCount = useMemo(() => {
    let n = 0;
    for (const e of result.timeline.events) {
      if (e.minutes <= currentMin + 0.001) n++;
      else break;
    }
    return n;
  }, [currentMin, result.timeline.events]);

  // Track the most recent reveal so we can flag "isNew" for entry animation.
  useEffect(() => {
    if (revealedCount - 1 !== latestEventIdx) {
      setLatestEventIdx(revealedCount - 1);
    }
  }, [revealedCount, latestEventIdx]);

  // Live probability — driven by the latest revealed event's winProbAfter.
  // Comebacks visibly swing the bar (a key teamfight win for the underdog
  // jumps the bar back toward them). Before any event fires, falls back to
  // the composition forecast.
  const t = Math.min(1, currentMin / duration);
  const liveBlueProb =
    revealedCount === 0
      ? result.blueProb
      : result.timeline.events[revealedCount - 1].winProbAfter;
  const bluePct = Math.round(liveBlueProb * 100);
  const redPct = 100 - bluePct;

  const winnerName = winnerIsBlue ? blueTeam : redTeam;
  const winnerCls = winnerIsBlue ? "text-rift-bluebright" : "text-rift-redbright";
  const isFinished = mode === "finished";

  const handleSkip = () => {
    accumulatedRef.current =
      result.timeline.events.length * SECONDS_PER_EVENT_AT_1X;
    setCurrentMin(duration);
    setMode("finished");
  };
  const handleTogglePause = () => {
    if (mode === "playing") setMode("paused");
    else if (mode === "paused") setMode("playing");
  };
  const handleSpeedToggle = () => {
    setSpeed((s) => (s === 1 ? 2 : s === 2 ? 4 : 1));
  };

  return (
    <div className="border border-rift-gold/40 bg-rift-panel/60 p-4 md:p-6 space-y-4 md:space-y-5">
      {/* Header — predicted winner reveals only after the simulation finishes;
          during play we show "Simulating..." to preserve the live feel. */}
      <div className="text-center">
        <div className="text-[10px] md:text-xs uppercase tracking-[0.5em] text-rift-gold/70 flex items-center justify-center gap-2">
          {!isFinished && mode === "playing" && (
            <span className="inline-flex items-center gap-1.5 text-rift-red">
              <span className="w-1.5 h-1.5 rounded-full bg-rift-red animate-breath" />
              LIVE
            </span>
          )}
          {!isFinished && mode === "paused" && (
            <span className="text-rift-mutedbright">PAUSED</span>
          )}
          <span>{isFinished ? "Match Simulation" : "Live Simulation"}</span>
        </div>
        <div className="mt-2 font-display text-xl md:text-2xl tracking-wider min-h-[2rem]">
          {isFinished ? (
            <>
              <span className={winnerCls}>{winnerName}</span>
              <span className="text-rift-gold/70 mx-2">wins</span>
            </>
          ) : (
            <span className="text-rift-gold/60 tracking-[0.4em] text-base md:text-lg">
              {formatClock(currentMin)}
            </span>
          )}
        </div>
        <div className="text-[9px] md:text-[10px] uppercase tracking-[0.3em] text-rift-mutedbright mt-1">
          Score · {result.blueScore.total} <span className="text-rift-muted">vs</span>{" "}
          {result.redScore.total}
          <span className="text-rift-muted mx-2">·</span>
          <span className="text-rift-goldbright">
            {matchPaceLabel(result.timeline.durationMinutes)}
          </span>
        </div>
      </div>

      <ProbabilityBar bluePct={bluePct} redPct={redPct} />

      {/* Live controls — only visible while sim is running. */}
      {!isFinished && (
        <PlayControls
          mode={mode}
          speed={speed}
          progress={t}
          onTogglePause={handleTogglePause}
          onSpeedToggle={handleSpeedToggle}
          onSkip={handleSkip}
        />
      )}

      <div className="grid grid-cols-2 gap-3 md:gap-4">
        <CompIdentityBadge
          side="blue"
          label={result.blueScore.identityLabel}
        />
        <CompIdentityBadge
          side="red"
          label={result.redScore.identityLabel}
        />
      </div>

      {(result.blueScore.synergyTags.length > 0 ||
        result.redScore.synergyTags.length > 0) && (
        <div className="grid grid-cols-2 gap-3 md:gap-4">
          <SynergyStrip
            side="blue"
            tags={result.blueScore.synergyTags}
            bonus={result.blueScore.synergyBonus}
          />
          <SynergyStrip
            side="red"
            tags={result.redScore.synergyTags}
            bonus={result.redScore.synergyBonus}
          />
        </div>
      )}

      <MatchTimelinePanel
        timeline={result.timeline}
        blueTeam={blueTeam}
        redTeam={redTeam}
        laneAdvantages={result.laneAdvantages}
        bluePicks={bluePicks}
        redPicks={redPicks}
        byId={byId}
        currentMin={currentMin}
        revealedCount={revealedCount}
        latestEventIdx={latestEventIdx}
        isFinished={isFinished}
      />

      <div className="grid grid-cols-2 gap-3 md:gap-4">
        <ChampionContributions
          side="blue"
          picks={bluePicks}
          lanes={blueRoles}
          byId={byId}
        />
        <ChampionContributions
          side="red"
          picks={redPicks}
          lanes={redRoles}
          byId={byId}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 md:gap-4">
        <ScoreBreakdown
          name={blueTeam}
          side="blue"
          score={result.blueScore}
        />
        <ScoreBreakdown
          name={redTeam}
          side="red"
          score={result.redScore}
        />
      </div>

      <div className="grid grid-cols-3 gap-2 md:gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="py-3 border border-rift-line text-rift-mutedbright hover:border-rift-gold/50 hover:bg-rift-gold/5 text-[10px] md:text-xs uppercase tracking-[0.3em] transition-all"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onResimulate}
          className="py-3 border border-rift-gold/40 text-rift-goldbright hover:bg-rift-gold/10 hover:border-rift-gold text-[10px] md:text-xs uppercase tracking-[0.3em] transition-all"
        >
          Re-Simulate
        </button>
        <button
          type="button"
          onClick={onApply}
          disabled={!isFinished}
          className={`py-3 font-display text-[11px] md:text-sm tracking-[0.3em] uppercase transition-all ${
            isFinished
              ? "btn-gold"
              : "border border-rift-line text-rift-muted cursor-not-allowed opacity-60"
          }`}
        >
          Apply
        </button>
      </div>
    </div>
  );
}

function formatClock(min: number): string {
  const m = Math.floor(min);
  const s = Math.floor((min - m) * 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function PlayControls({
  mode,
  speed,
  progress,
  onTogglePause,
  onSpeedToggle,
  onSkip,
}: {
  mode: PlayMode;
  speed: PlaySpeed;
  progress: number;
  onTogglePause: () => void;
  onSpeedToggle: () => void;
  onSkip: () => void;
}) {
  const playLabel = mode === "playing" ? "Pause" : "Resume";
  return (
    <div className="space-y-2">
      <div className="h-1 bg-rift-bg/80 border border-rift-line/50 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-rift-golddark via-rift-gold to-rift-goldbright"
          style={{ width: `${Math.min(100, progress * 100)}%` }}
        />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={onTogglePause}
          className="py-2 border border-rift-line/70 text-rift-mutedbright hover:border-rift-gold/50 hover:text-rift-goldbright text-[10px] uppercase tracking-[0.3em] transition-all"
        >
          {playLabel}
        </button>
        <button
          type="button"
          onClick={onSpeedToggle}
          className="py-2 border border-rift-line/70 text-rift-mutedbright hover:border-rift-gold/50 hover:text-rift-goldbright text-[10px] uppercase tracking-[0.3em] transition-all"
        >
          {speed}× speed
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="py-2 border border-rift-line/70 text-rift-mutedbright hover:border-rift-gold/50 hover:text-rift-goldbright text-[10px] uppercase tracking-[0.3em] transition-all"
        >
          Skip
        </button>
      </div>
    </div>
  );
}

function ProbabilityBar({ bluePct, redPct }: { bluePct: number; redPct: number }) {
  return (
    <div>
      <div className="flex justify-between text-[10px] md:text-xs uppercase tracking-[0.3em] mb-1.5">
        <span className="text-rift-bluebright">{bluePct}%</span>
        <span className="text-rift-redbright">{redPct}%</span>
      </div>
      <div className="h-3 md:h-4 bg-rift-bg/60 border border-rift-line flex overflow-hidden">
        <div
          className="bg-gradient-to-r from-rift-bluedeep to-rift-blue transition-[width] duration-700 ease-out"
          style={{ width: `${bluePct}%` }}
        />
        <div
          className="bg-gradient-to-l from-rift-reddeep to-rift-red transition-[width] duration-700 ease-out"
          style={{ width: `${redPct}%` }}
        />
      </div>
    </div>
  );
}

interface RunningStats {
  kills: { blue: number; red: number };
  drakes: { blue: number; red: number };
  barons: { blue: number; red: number };
  towers: { blue: number; red: number };
  inhibs: { blue: number; red: number };
  hasSoul: Side | null;
  // Net per-lane gold contributed by revealed events (positive = blue ahead).
  // Lane phase passive gold is added separately in computeLiveLaneGold().
  laneGoldEvent: Record<Lane, number>;
}

const LANE_ORDER: readonly Lane[] = ["top", "jungle", "middle", "bottom", "support"];

function computeRunningStats(events: MatchEvent[], upTo: number): RunningStats {
  const stats: RunningStats = {
    kills: { blue: 0, red: 0 },
    drakes: { blue: 0, red: 0 },
    barons: { blue: 0, red: 0 },
    towers: { blue: 0, red: 0 },
    inhibs: { blue: 0, red: 0 },
    hasSoul: null,
    laneGoldEvent: { top: 0, jungle: 0, middle: 0, bottom: 0, support: 0 },
  };
  for (let i = 0; i < upTo; i++) {
    const e = events[i];
    stats.kills.blue += e.kills.blue;
    stats.kills.red += e.kills.red;
    stats.towers.blue += e.towers.blue;
    stats.towers.red += e.towers.red;
    stats.inhibs.blue += e.inhibs.blue;
    stats.inhibs.red += e.inhibs.red;
    if (e.type === "dragon" || e.type === "soul") stats.drakes[e.side]++;
    if (e.type === "soul") stats.hasSoul = e.side;
    if (e.type === "baron") stats.barons[e.side]++;
    for (const lane of LANE_ORDER) {
      stats.laneGoldEvent[lane] += e.laneGoldDelta[lane] ?? 0;
    }
  }
  return stats;
}

// Live per-lane gold diff = lane phase passive (saturates when laning
// ends) + event-driven contributions from revealed events. Laning end is
// dynamic — set by the simulator to the minute the first turret fell, or
// 14 as a fallback if the lanes held that long.
function computeLiveLaneGold(
  laneAdvantages: Record<Lane, number>,
  laneGoldEvent: Record<Lane, number>,
  currentMin: number,
  laningEndMinute: number,
): Record<Lane, number> {
  const lanePhaseTime = Math.min(currentMin, laningEndMinute);
  const out: Record<Lane, number> = { top: 0, jungle: 0, middle: 0, bottom: 0, support: 0 };
  for (const lane of LANE_ORDER) {
    out[lane] = laneAdvantages[lane] * lanePhaseTime + laneGoldEvent[lane];
  }
  return out;
}

// Gold model: team gold lead = sum of per-lane gold differentials so the
// numbers stay numerically consistent with the lane gold strip displayed
// below. Each side's total is the team baseline (~2k g/min/team) split
// around the lead, so blue + red always sum to 2× baseline regardless of
// who's ahead, and the displayed diff matches what summing the 5 lane rows
// would produce.
function computeGold(
  laneGold: Record<Lane, number>,
  currentMin: number,
): { blue: number; red: number; lead: number } {
  const teamLead = LANE_ORDER.reduce((s, l) => s + laneGold[l], 0);
  const baseline = Math.round(currentMin * 2000);
  const halfLead = teamLead / 2;
  return {
    blue: Math.round(baseline + halfLead),
    red: Math.round(baseline - halfLead),
    lead: Math.round(teamLead),
  };
}

// Used for big team-total displays (~30k-60k range) where the `k` shorthand
// keeps the typography compact.
function formatGold(g: number): string {
  if (g >= 10000) return `${(g / 1000).toFixed(1)}k`;
  return `${(g / 1000).toFixed(2)}k`;
}

// Used for the per-lane live delta where values are typically 50-2500g and
// the user wants the actual integer (not "0.2k"). Commas group thousands
// for readability when the lead crosses 1000g.
function formatLaneGold(g: number): string {
  return Math.round(g).toLocaleString("en-US");
}

function MatchTimelinePanel({
  timeline,
  blueTeam,
  redTeam,
  laneAdvantages,
  bluePicks,
  redPicks,
  byId,
  currentMin,
  revealedCount,
  latestEventIdx,
  isFinished,
}: {
  timeline: MatchTimeline;
  blueTeam: string;
  redTeam: string;
  laneAdvantages: Record<Lane, number>;
  bluePicks: (number | null)[];
  redPicks: (number | null)[];
  byId: Map<number, Champion>;
  currentMin: number;
  revealedCount: number;
  latestEventIdx: number;
  isFinished: boolean;
}) {
  const visible = timeline.events.slice(0, revealedCount);
  const placeholderCount = isFinished ? 0 : Math.max(0, timeline.events.length - revealedCount);
  const stats = useMemo(
    () => computeRunningStats(timeline.events, revealedCount),
    [timeline.events, revealedCount],
  );
  const laneGold = useMemo(
    () =>
      computeLiveLaneGold(
        laneAdvantages,
        stats.laneGoldEvent,
        currentMin,
        timeline.laningEndMinute,
      ),
    [laneAdvantages, stats.laneGoldEvent, currentMin, timeline.laningEndMinute],
  );
  // Team gold derives from lane sum so the totals match what's displayed
  // below in the Lane Gold strip — no off-by-N gold inconsistencies.
  const gold = useMemo(() => computeGold(laneGold, currentMin), [laneGold, currentMin]);
  return (
    <div className="border border-rift-gold/30 bg-rift-bg/40 p-3 md:p-4">
      {/* Esports-style HUD: team identity strip + live gold + face-off metrics. */}
      <ScoreboardHeader
        blueTeam={blueTeam}
        redTeam={redTeam}
        currentMin={currentMin}
        durationLabel={timeline.durationLabel}
        isFinished={isFinished}
      />
      <Scoreboard stats={stats} gold={gold} />
      <LaneGoldStrip
        laneGold={laneGold}
        bluePicks={bluePicks}
        redPicks={redPicks}
        byId={byId}
      />

      {/* Event log header */}
      <div className="flex items-baseline justify-between mb-2 mt-4">
        <div className="text-[9px] md:text-[10px] uppercase tracking-[0.4em] text-rift-gold/70">
          Event Log
        </div>
        <div className="text-[9px] md:text-[10px] uppercase tracking-[0.3em] text-rift-mutedbright tabular-nums">
          {isFinished
            ? timeline.durationLabel
            : `${formatClock(currentMin)} / ${timeline.durationLabel}`}
        </div>
      </div>
      <div className="space-y-1">
        {visible.length === 0 && !isFinished && (
          <div className="text-[10px] uppercase tracking-[0.3em] text-rift-muted/70 italic py-2">
            Awaiting first action...
          </div>
        )}
        {visible.map((e, i) => (
          <TimelineRow
            key={`${e.type}-${i}`}
            event={e}
            blueTeam={blueTeam}
            redTeam={redTeam}
            isNew={i === latestEventIdx}
          />
        ))}
        {placeholderCount > 0 && (
          <div className="text-[9px] uppercase tracking-[0.3em] text-rift-muted/40 pt-1.5 italic">
            {placeholderCount} {placeholderCount === 1 ? "event" : "events"} unrevealed
          </div>
        )}
      </div>
    </div>
  );
}

function ScoreboardHeader({
  blueTeam,
  redTeam,
  currentMin,
  durationLabel,
  isFinished,
}: {
  blueTeam: string;
  redTeam: string;
  currentMin: number;
  durationLabel: string;
  isFinished: boolean;
}) {
  const clock = isFinished ? durationLabel : formatClock(currentMin);
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center mb-3 pb-2 border-b border-rift-line/40">
      <div className="flex items-center justify-end gap-2 truncate min-w-0">
        <span className="font-display text-rift-bluebright text-xs md:text-sm uppercase tracking-[0.2em] truncate">
          {blueTeam}
        </span>
        <span
          className="w-1.5 h-1.5 rounded-full bg-rift-blue shadow-glow-blue flex-shrink-0"
          aria-hidden
        />
      </div>
      <div className="text-rift-goldbright text-[11px] md:text-sm font-display tracking-[0.3em] tabular-nums px-2 md:px-4">
        {clock}
      </div>
      <div className="flex items-center justify-start gap-2 truncate min-w-0">
        <span
          className="w-1.5 h-1.5 rounded-full bg-rift-red shadow-glow-red flex-shrink-0"
          aria-hidden
        />
        <span className="font-display text-rift-redbright text-xs md:text-sm uppercase tracking-[0.2em] truncate">
          {redTeam}
        </span>
      </div>
    </div>
  );
}

// Live per-lane gold diff strip. Shows champion icons either side and the
// rolling gold differential between lane opponents — updates as events fire.
function LaneGoldStrip({
  laneGold,
  bluePicks,
  redPicks,
  byId,
}: {
  laneGold: Record<Lane, number>;
  bluePicks: (number | null)[];
  redPicks: (number | null)[];
  byId: Map<number, Champion>;
}) {
  return (
    <div className="border-t border-rift-line/40 mt-3 pt-3 space-y-1">
      <div className="text-[9px] md:text-[10px] uppercase tracking-[0.4em] text-rift-gold/70 mb-1.5 text-center">
        Lane Gold · Live
      </div>
      {LANE_ORDER.map((lane, i) => {
        const blueId = bluePicks[i];
        const redId = redPicks[i];
        const blueChamp = blueId != null ? byId.get(blueId) : null;
        const redChamp = redId != null ? byId.get(redId) : null;
        const diff = laneGold[lane];
        return (
          <LaneGoldRow
            key={lane}
            lane={lane}
            blueChamp={blueChamp ?? null}
            redChamp={redChamp ?? null}
            diff={diff}
          />
        );
      })}
    </div>
  );
}

function LaneGoldRow({
  lane,
  blueChamp,
  redChamp,
  diff,
}: {
  lane: Lane;
  blueChamp: Champion | null;
  redChamp: Champion | null;
  diff: number;
}) {
  const absDiff = Math.abs(diff);
  const leadSide: Side | "even" =
    diff > 100 ? "blue" : diff < -100 ? "red" : "even";
  const blueAhead = leadSide === "blue";
  const redAhead = leadSide === "red";
  // Always show the lead as +X (the leader's advantage). The colour conveys
  // which side is extracting gold from the rival; no minus signs.
  const diffLabel =
    leadSide === "even" ? "EVEN" : `+${formatLaneGold(absDiff)}`;
  const diffCls =
    leadSide === "blue"
      ? "text-rift-bluebright"
      : leadSide === "red"
      ? "text-rift-redbright"
      : "text-rift-muted";
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-[10px] md:text-[11px]">
      <div
        className={`flex items-center justify-end gap-1.5 truncate ${
          blueAhead ? "text-rift-bluebright" : "text-rift-mutedbright/80"
        }`}
      >
        <span className="truncate">{blueChamp?.name ?? "—"}</span>
        {blueChamp && (
          <img
            src={blueChamp.iconUrl}
            alt={blueChamp.name}
            className={`w-5 h-5 flex-shrink-0 border ${
              blueAhead ? "border-rift-blue" : "border-rift-line"
            }`}
          />
        )}
      </div>
      <div className="flex flex-col items-center min-w-[5.5rem] px-1">
        <span className="flex items-center gap-1 text-[8px] md:text-[9px] uppercase tracking-[0.25em] text-rift-muted">
          <LaneIcon lane={lane} size="xs" />
        </span>
        <span className={`text-[9px] md:text-[10px] tabular-nums uppercase tracking-[0.18em] ${diffCls}`}>
          {diffLabel}
        </span>
      </div>
      <div
        className={`flex items-center gap-1.5 truncate ${
          redAhead ? "text-rift-redbright" : "text-rift-mutedbright/80"
        }`}
      >
        {redChamp && (
          <img
            src={redChamp.iconUrl}
            alt={redChamp.name}
            className={`w-5 h-5 flex-shrink-0 border ${
              redAhead ? "border-rift-red" : "border-rift-line"
            }`}
          />
        )}
        <span className="truncate">{redChamp?.name ?? "—"}</span>
      </div>
    </div>
  );
}

function Scoreboard({
  stats,
  gold,
}: {
  stats: RunningStats;
  gold: { blue: number; red: number; lead: number };
}) {
  return (
    <div className="space-y-3">
      <GoldHUD blueGold={gold.blue} redGold={gold.red} />
      <div className="border-t border-rift-line/40 pt-2 space-y-1">
        <FaceOffRow
          icon="first-blood"
          label="Kills"
          blue={stats.kills.blue}
          red={stats.kills.red}
        />
        <FaceOffRow
          icon={stats.hasSoul ? "soul" : "dragon"}
          label="Drakes"
          blue={stats.drakes.blue}
          red={stats.drakes.red}
          soulSide={stats.hasSoul}
        />
        <FaceOffRow
          icon="baron"
          label="Barons"
          blue={stats.barons.blue}
          red={stats.barons.red}
        />
        <FaceOffRow
          icon="tower"
          label="Towers"
          blue={stats.towers.blue}
          red={stats.towers.red}
        />
        {(stats.inhibs.blue > 0 || stats.inhibs.red > 0) && (
          <FaceOffRow
            icon="inhibitor"
            label="Inhibs"
            blue={stats.inhibs.blue}
            red={stats.inhibs.red}
          />
        )}
      </div>
    </div>
  );
}

function FaceOffRow({
  icon,
  label,
  blue,
  red,
  soulSide,
}: {
  icon: EventType;
  label: string;
  blue: number;
  red: number;
  soulSide?: Side | null;
}) {
  const lead =
    blue > red ? "blue" : red > blue ? "red" : "even";
  const blueCls =
    soulSide === "blue"
      ? "text-rift-goldbright font-display"
      : lead === "blue"
      ? "text-rift-bluebright font-display"
      : "text-rift-mutedbright";
  const redCls =
    soulSide === "red"
      ? "text-rift-goldbright font-display"
      : lead === "red"
      ? "text-rift-redbright font-display"
      : "text-rift-mutedbright";
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
      <div
        className={`text-right text-base md:text-lg tabular-nums leading-tight ${blueCls}`}
      >
        {blue}
      </div>
      <div className="flex items-center gap-1.5 text-[9px] md:text-[10px] uppercase tracking-[0.25em] text-rift-muted px-2 min-w-[5rem] justify-center">
        <EventIcon type={icon} size={11} />
        <span>{label}</span>
      </div>
      <div
        className={`text-left text-base md:text-lg tabular-nums leading-tight ${redCls}`}
      >
        {red}
      </div>
    </div>
  );
}

// Esports-broadcast style gold display — big numbers each side, with a
// tug-of-war bar in between. The bar's center is the "even" mark; fill
// extends from center toward the leading team, magnitude scaled to a 10k
// reference lead (anything beyond fills the bar fully).
function GoldHUD({
  blueGold,
  redGold,
}: {
  blueGold: number;
  redGold: number;
}) {
  const lead = blueGold - redGold;
  const leadAbs = Math.abs(lead);
  const leadSide: Side | "even" =
    lead > 200 ? "blue" : lead < -200 ? "red" : "even";
  const fillPct = Math.min(50, (leadAbs / 10000) * 50);
  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 md:gap-4">
        <div className="text-right">
          <div className="text-rift-bluebright font-display text-2xl md:text-3xl tabular-nums leading-none">
            {formatGold(blueGold)}
          </div>
        </div>
        <div className="text-rift-goldbright/70 text-base md:text-lg" aria-hidden>
          ◆
        </div>
        <div className="text-left">
          <div className="text-rift-redbright font-display text-2xl md:text-3xl tabular-nums leading-none">
            {formatGold(redGold)}
          </div>
        </div>
      </div>

      {/* Tug-of-war: center marker + fill extending toward the leading side. */}
      <div className="relative h-2 bg-rift-bg/80 border border-rift-line/60 overflow-hidden">
        {leadSide === "blue" && (
          <div
            className="absolute top-0 bottom-0 right-1/2 bg-gradient-to-l from-rift-blue to-rift-bluedeep transition-[width] duration-300"
            style={{ width: `${fillPct}%` }}
          />
        )}
        {leadSide === "red" && (
          <div
            className="absolute top-0 bottom-0 left-1/2 bg-gradient-to-r from-rift-red to-rift-reddeep transition-[width] duration-300"
            style={{ width: `${fillPct}%` }}
          />
        )}
        <div
          className="absolute left-1/2 top-0 bottom-0 w-px bg-rift-goldbright/70 -translate-x-1/2"
          aria-hidden
        />
      </div>

      <div className="text-center text-[9px] md:text-[10px] uppercase tracking-[0.3em]">
        {leadSide === "even" ? (
          <span className="text-rift-muted">Gold even</span>
        ) : (
          <>
            <span className="text-rift-goldbright tabular-nums">
              +{formatGold(leadAbs)}
            </span>
            <span className="text-rift-muted mx-1.5">for</span>
            <span
              className={
                leadSide === "blue" ? "text-rift-bluebright" : "text-rift-redbright"
              }
            >
              {leadSide === "blue" ? "Blue" : "Red"}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

const EVENT_LABEL: Record<EventType, string> = {
  "first-blood": "First Blood",
  "solo-kill": "Solo Kill",
  gank: "Gank",
  "counter-gank": "Counter-gank",
  plates: "Plates",
  dragon: "Dragon",
  soul: "Soul",
  atakhan: "Atakhan",
  grubs: "Grubs",
  herald: "Herald",
  tower: "Tower",
  inhibitor: "Inhib",
  skirmish: "Skirmish",
  pick: "Pick",
  teamfight: "Teamfight",
  baron: "Baron",
  ace: "Ace",
  elder: "Elder",
  nexus: "Nexus",
  invade: "Invade",
  scuttle: "Scuttle",
  roam: "Roam",
  "buff-steal": "Buff Steal",
  shutdown: "Shutdown",
  backdoor: "Backdoor",
};

// Events that deserve extra emphasis in the timeline (gold tinted, larger).
const EMPHASIS_EVENTS: ReadonlySet<EventType> = new Set([
  "soul",
  "elder",
  "ace",
  "nexus",
  "shutdown",
  "backdoor",
]);

// Matchup tags that represent an advantage to *this* team. Anything not in
// the set is a disadvantage (carry without peel into dive, wombo into peel,
// etc.) and gets the red downward styling.
const POSITIVE_MATCHUP_TAGS: ReadonlySet<string> = new Set([
  "Mobile vs Poke",
  "Engage vs No Frontline",
  "Dive into Backline",
  "Slippery vs Skillshots",
  "Sustain vs Burst",
  "Engage Cancel",
  "Splitpush Pressure",
  "Full Lockdown",
  "DPS vs Soft Backline",
  "Tank Wall vs No DPS",
  "Mixed Damage Pressure",
]);

function TimelineRow({
  event,
  blueTeam,
  redTeam,
  isNew,
}: {
  event: MatchEvent;
  blueTeam: string;
  redTeam: string;
  isNew?: boolean;
}) {
  const isBlue = event.side === "blue";
  const accentBorder = isBlue ? "border-rift-blue" : "border-rift-red";
  const accentText = isBlue ? "text-rift-bluebright" : "text-rift-redbright";
  const isEmphasis = EMPHASIS_EVENTS.has(event.type);
  const teamLabel = isBlue ? blueTeam : redTeam;
  const totalKills = event.kills.blue + event.kills.red;
  return (
    <div
      className={`flex items-center gap-2 md:gap-3 border-l-2 ${accentBorder} pl-2.5 py-1 transition-all duration-300 ${
        isEmphasis ? "bg-rift-gold/5 border-l-[3px]" : ""
      } ${isNew ? "animate-[fadeSlide_400ms_ease-out]" : ""}`}
    >
      <span
        className={`font-display text-[11px] md:text-xs tabular-nums ${accentText} w-10 md:w-12 flex-shrink-0`}
      >
        {event.time}
      </span>
      <span
        className={`flex items-center gap-1.5 w-[5.5rem] md:w-[6.5rem] flex-shrink-0 ${
          isEmphasis ? "text-rift-goldbright" : accentText
        }`}
      >
        <EventIcon type={event.type} size={14} />
        <span
          className={`text-[8px] md:text-[9px] uppercase tracking-[0.2em] truncate ${
            isEmphasis ? "font-display" : ""
          }`}
        >
          {EVENT_LABEL[event.type]}
        </span>
      </span>
      <span className="text-[10px] md:text-xs text-rift-mutedbright flex-1 min-w-0">
        {event.description}
      </span>
      {totalKills > 0 && (
        <span
          className="text-[9px] md:text-[10px] tabular-nums flex-shrink-0 hidden md:inline-flex items-center gap-0.5"
          title="Kills this event (Blue—Red)"
        >
          <span className="text-rift-muted">
            <EventIcon type="first-blood" size={10} />
          </span>
          <span className={isBlue ? "text-rift-bluebright" : "text-rift-muted"}>
            +{event.kills.blue}
          </span>
          <span className="text-rift-muted/50 mx-0.5">/</span>
          <span className={!isBlue ? "text-rift-redbright" : "text-rift-muted"}>
            +{event.kills.red}
          </span>
        </span>
      )}
      <span
        className={`text-[8px] md:text-[9px] uppercase tracking-[0.2em] ${accentText} flex-shrink-0 hidden sm:inline truncate max-w-[5rem]`}
        title={teamLabel}
      >
        {teamLabel}
      </span>
    </div>
  );
}

function ChampionContributions({
  side,
  picks,
  lanes,
  byId,
}: {
  side: Side;
  picks: (number | null)[];
  lanes: (Lane | null)[];
  byId: Map<number, Champion>;
}) {
  const border = side === "blue" ? "border-rift-blue/30" : "border-rift-red/30";
  return (
    <div className={`border ${border} bg-rift-bg/40 p-3 md:p-4`}>
      <div className="text-[9px] md:text-[10px] uppercase tracking-[0.35em] text-rift-muted mb-2">
        Champion Contributions
      </div>
      <div className="space-y-1.5">
        {picks.map((id, i) => {
          const c = id != null ? byId.get(id) ?? null : null;
          if (!c) return null;
          const meta = getChampionMeta(c.alias);
          return (
            <ContributionRow
              key={`${c.id}-${i}`}
              champ={c}
              meta={meta}
              lane={lanes[i]}
              side={side}
            />
          );
        })}
      </div>
    </div>
  );
}

function ContributionRow({
  champ,
  meta,
  lane,
  side,
}: {
  champ: Champion;
  meta: ChampionMeta | null;
  lane: Lane | null;
  side: Side;
}) {
  const accent = side === "blue" ? "text-rift-bluebright" : "text-rift-redbright";
  return (
    <div className="flex items-start gap-2">
      <div className="w-7 h-7 md:w-8 md:h-8 flex-shrink-0 border border-rift-line overflow-hidden bg-rift-bg">
        <img
          src={champ.iconUrl}
          alt={champ.name}
          className="w-full h-full object-cover"
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {lane && <LaneIcon lane={lane} size="xs" />}
          <span
            className={`${accent} text-[11px] md:text-xs font-display tracking-wider truncate`}
          >
            {champ.name}
          </span>
        </div>
        {meta ? (
          <div className="flex items-center gap-1 flex-wrap mt-0.5">
            <PhasePill phase={meta.phase} />
            {meta.archetypes.slice(0, 3).map((a) => (
              <ArchetypePill key={a} archetype={a} />
            ))}
            <CCPill cc={meta.cc} />
          </div>
        ) : (
          <div className="text-[9px] uppercase tracking-[0.25em] text-rift-muted/70 mt-0.5">
            No data
          </div>
        )}
      </div>
    </div>
  );
}

function PhasePill({ phase }: { phase: Phase }) {
  // Phase colors are kept neutral on purpose — side colors (blue/red) are
  // reserved for team identity, so phase uses Riot's class palette.
  const cls =
    phase === "early"
      ? "border-rift-marksman/50 text-rift-marksman bg-rift-marksman/10"
      : phase === "late"
      ? "border-rift-mage/50 text-rift-mage bg-rift-mage/10"
      : phase === "mid-late"
      ? "border-rift-gold/50 text-rift-goldbright bg-rift-gold/10"
      : "border-rift-line text-rift-mutedbright";
  return (
    <span
      className={`text-[8px] md:text-[9px] uppercase tracking-[0.15em] px-1 py-px border ${cls}`}
    >
      {phase}
    </span>
  );
}

function ArchetypePill({ archetype }: { archetype: Archetype }) {
  return (
    <span className="text-[8px] md:text-[9px] uppercase tracking-[0.15em] px-1 py-px border border-rift-line/70 bg-rift-line/30 text-rift-mutedbright">
      {archetype}
    </span>
  );
}

function CCPill({ cc }: { cc: CC }) {
  if (cc === "none") {
    return (
      <span className="text-[8px] md:text-[9px] uppercase tracking-[0.15em] px-1 py-px border border-rift-line text-rift-muted">
        no cc
      </span>
    );
  }
  const cls =
    cc === "hard"
      ? "border-rift-gold/60 text-rift-goldbright"
      : "border-rift-line/70 text-rift-mutedbright";
  return (
    <span
      className={`text-[8px] md:text-[9px] uppercase tracking-[0.15em] px-1 py-px border ${cls}`}
    >
      {cc} cc
    </span>
  );
}

function SynergyStrip({
  side,
  tags,
  bonus,
}: {
  side: Side;
  tags: string[];
  bonus: number;
}) {
  const border = side === "blue" ? "border-rift-blue/30" : "border-rift-red/30";
  if (tags.length === 0) {
    return (
      <div
        className={`border ${border} bg-rift-bg/30 px-3 py-2 text-center opacity-50`}
      >
        <div className="text-[9px] md:text-[10px] uppercase tracking-[0.35em] text-rift-muted">
          Synergies
        </div>
        <div className="text-[10px] md:text-xs text-rift-muted/70 italic mt-1">
          None active
        </div>
      </div>
    );
  }
  return (
    <div className={`border ${border} bg-rift-bg/30 px-3 py-2`}>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[9px] md:text-[10px] uppercase tracking-[0.35em] text-rift-muted">
          Synergies
        </span>
        <span className="text-[9px] md:text-[10px] uppercase tracking-[0.25em] text-rift-goldbright">
          +{bonus}
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        {tags.map((tag, i) => (
          <span
            key={`${tag}-${i}`}
            className="text-[8px] md:text-[9px] uppercase tracking-[0.15em] px-1.5 py-px border border-rift-gold/50 bg-gradient-to-r from-rift-gold/10 to-rift-gold/5 text-rift-goldbright"
          >
            ★ {tag}
          </span>
        ))}
      </div>
    </div>
  );
}

function CompIdentityBadge({
  side,
  label,
}: {
  side: Side;
  label: string | null;
}) {
  const border = side === "blue" ? "border-rift-blue/40" : "border-rift-red/40";
  const text = side === "blue" ? "text-rift-bluebright" : "text-rift-redbright";
  const display = label ?? "No Clear Identity";
  return (
    <div
      className={`border ${border} bg-rift-bg/30 px-3 py-2 text-center ${
        label ? "" : "opacity-60"
      }`}
    >
      <div className="text-[9px] md:text-[10px] uppercase tracking-[0.35em] text-rift-muted">
        Composition
      </div>
      <div
        className={`font-display ${text} uppercase tracking-[0.2em] text-xs md:text-sm mt-1`}
      >
        {display}
      </div>
    </div>
  );
}

function ScoreBreakdown({
  name,
  side,
  score,
}: {
  name: string;
  side: Side;
  score: TeamScore;
}) {
  const text = side === "blue" ? "text-rift-bluebright" : "text-rift-redbright";
  const border = side === "blue" ? "border-rift-blue/30" : "border-rift-red/30";
  const rows: { label: string; value: number; max: number; min?: number }[] = [
    { label: "Damage Balance", value: score.damageBalance, max: 8 },
    { label: "Frontline", value: score.frontline, max: 6 },
    { label: "Engage", value: score.engagePresence, max: 3, min: -6 },
    { label: "Hard CC", value: score.ccQuality, max: 5 },
    { label: "Comp Identity", value: score.compIdentity, max: 6 },
    { label: "Phase Balance", value: score.phaseBalance, max: 3, min: -2 },
    { label: "Scaling vs Enemy", value: score.scalingAdvantage, max: 5, min: -5 },
    { label: "Matchup Edge", value: score.matchupEdge, max: 4, min: -4 },
    { label: "Pair Synergies", value: score.synergyBonus, max: 6 },
    { label: "Lane Synergy", value: score.laneSynergy, max: 4 },
  ];
  return (
    <div className={`border ${border} bg-rift-bg/40 p-3 md:p-4`}>
      <div className="flex items-baseline justify-between mb-2">
        <div className={`font-display ${text} uppercase tracking-[0.2em] text-xs md:text-sm truncate`}>
          {name}
        </div>
        <div className="text-[10px] md:text-xs font-display text-rift-goldbright">
          {score.total}
        </div>
      </div>
      <div className="text-[9px] md:text-[10px] uppercase tracking-[0.25em] text-rift-muted mb-3 flex flex-wrap gap-x-2 gap-y-0.5">
        <span>
          AP <span className="text-rift-mage">{score.apCount}</span>
        </span>
        <span>
          AD <span className="text-rift-marksman">{score.adCount}</span>
        </span>
        <span>
          Tank <span className="text-rift-tank">{score.frontCount}</span>
        </span>
        <span>
          CC <span className="text-rift-goldbright">{score.hardCcCount}</span>
        </span>
        <span>
          Late <span className="text-rift-mage">{score.lateCount}</span>
        </span>
        <span>
          Early <span className="text-rift-marksman">{score.earlyCount}</span>
        </span>
        <span>
          Mobile <span className="text-rift-bluebright">{score.highMobCount}</span>
          <span className="text-rift-muted/60">/</span>
          <span className="text-rift-redbright">{score.lowMobCount}</span>
        </span>
      </div>
      <div className="space-y-1.5">
        {rows.map((r) => {
          const hasNegativeRange = r.min != null;
          const min = r.min ?? 0;
          const range = r.max - min;
          const fillPct = range > 0 ? ((r.value - min) / range) * 100 : 0;
          const zeroPct = range > 0 ? ((0 - min) / range) * 100 : 0;
          const isNegative = r.value < 0;
          const fillCls = isNegative
            ? "bg-rift-red/70"
            : side === "blue"
            ? "bg-rift-blue"
            : "bg-rift-red";
          return (
            <div key={r.label}>
              <div className="flex justify-between text-[9px] md:text-[10px] uppercase tracking-[0.2em] text-rift-muted">
                <span>{r.label}</span>
                <span className={isNegative ? "text-rift-red" : "text-rift-mutedbright"}>
                  {hasNegativeRange
                    ? `${r.value > 0 ? "+" : ""}${r.value}`
                    : `${r.value}/${r.max}`}
                </span>
              </div>
              <div className="relative h-1 bg-rift-bg/80 mt-0.5">
                <div
                  className={`h-full ${fillCls}`}
                  style={{ width: `${Math.max(0, Math.min(100, fillPct))}%` }}
                />
                {hasNegativeRange && (
                  <div
                    className="absolute top-0 bottom-0 w-px bg-rift-mutedbright/60"
                    style={{ left: `${zeroPct}%` }}
                    aria-hidden
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
      {score.matchupTags.length > 0 && (
        <div className="mt-3 pt-2 border-t border-rift-line/40">
          <div className="text-[8px] md:text-[9px] uppercase tracking-[0.3em] text-rift-muted mb-1.5">
            Matchup interactions
          </div>
          <div className="flex flex-wrap gap-1">
            {score.matchupTags.map((tag) => {
              const isPositive = POSITIVE_MATCHUP_TAGS.has(tag);
              const cls = isPositive
                ? "border-rift-gold/40 text-rift-goldbright bg-rift-gold/10"
                : "border-rift-red/40 text-rift-redbright bg-rift-red/10";
              const prefix = isPositive ? "▲ " : "▼ ";
              return (
                <span
                  key={tag}
                  className={`text-[8px] md:text-[9px] uppercase tracking-[0.15em] px-1.5 py-px border ${cls}`}
                >
                  {prefix}
                  {tag}
                </span>
              );
            })}
          </div>
        </div>
      )}
      {score.synergyTags.length > 0 && (
        <div className="mt-3 pt-2 border-t border-rift-line/40">
          <div className="text-[8px] md:text-[9px] uppercase tracking-[0.3em] text-rift-muted mb-1.5">
            Active pair synergies
          </div>
          <div className="flex flex-wrap gap-1">
            {score.synergyTags.map((tag, i) => (
              <span
                key={`${tag}-${i}`}
                className="text-[8px] md:text-[9px] uppercase tracking-[0.15em] px-1.5 py-px border border-rift-gold/50 bg-gradient-to-r from-rift-gold/10 to-rift-gold/5 text-rift-goldbright"
              >
                ★ {tag}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function WinnerButton({
  name,
  side,
  onClick,
}: {
  name: string;
  side: Side;
  onClick: () => void;
}) {
  const cls =
    side === "blue"
      ? "border-rift-blue/50 hover:border-rift-blue hover:shadow-glow-blue text-rift-bluebright bg-gradient-to-br from-rift-bluedeep/20 to-transparent"
      : "border-rift-red/50 hover:border-rift-red hover:shadow-glow-red text-rift-redbright bg-gradient-to-br from-rift-reddeep/20 to-transparent";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative py-5 md:py-6 border-2 bg-rift-panel/50 font-display text-base md:text-lg tracking-[0.25em] uppercase transition-all hover:scale-[1.01] ${cls}`}
    >
      <div className="text-[10px] tracking-[0.4em] text-rift-muted mb-1">
        Declare Winner
      </div>
      {name}
    </button>
  );
}
