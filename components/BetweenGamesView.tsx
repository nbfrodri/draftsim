"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import {
  Area,
  ComposedChart,
  ReferenceLine,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useDraftStore } from "@/store/draftStore";
import { currentGame, maxGames, seriesScore, starRatingBias } from "@/lib/series";
import {
  buildGameRecap,
  simulateMatch,
  type EventType,
  type LaneKDA,
  type MatchEvent,
  type MatchTimeline,
  type SimulationResult,
  type TeamScore,
} from "@/lib/matchSimulator";
import { getKeyPowerSpike } from "@/lib/championBuilds";
import { metaFor } from "@/lib/sim/descriptions";
import { syntheticDamage } from "@/lib/sim/descriptions";
import {
  getIdentityProfile,
  identityMatchupEdge,
  type IdentityProfile,
} from "@/lib/sim/identities";
import { playEventBlip, type EventBlipSeverity } from "@/lib/sounds";
import {
  getChampionMeta,
  type Archetype,
  type CC,
  type ChampionMeta,
  type Phase,
} from "@/lib/championMeta";
import { strategySummary, type TeamStrategy } from "@/lib/sim/strategies";
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
  // Auto side-swap rule: loser of the just-finished game plays blue
  // next. (Pro convention: loser picks side, always picks blue.) The
  // checkbox below lets the user force the opposite if they want a
  // manual override.
  const autoSwap = game.winner === "blue";
  const [overrideSwap, setOverrideSwap] = useState<boolean | null>(null);
  const swapSides = overrideSwap ?? autoSwap;

  // Track a selected pick for role swapping. null when none.
  const [swapSel, setSwapSel] = useState<{ side: Side; slot: number } | null>(null);

  // Match simulation: when set, the panel replaces the manual winner buttons.
  const [simResult, setSimResult] = useState<SimulationResult | null>(null);

  // Tournament star ratings (when present) bias the sim toward the
  // higher-rated roster. starRatingBias() returns 0 outside tournament
  // context so single-series sims behave identically.
  const simOptions = useMemo(
    () => ({
      scoreBias: starRatingBias(series),
      bluePlayers: series.bluePlayers,
      redPlayers: series.redPlayers,
    }),
    [series],
  );

  const handleSimulate = () => {
    setSimResult(simulateMatch(game, champions, simOptions));
  };

  // Re-simulate produces a fresh result object so the panel resets its
  // playback state (its useEffect keys on result identity).
  const handleResimulate = () => {
    setSimResult(simulateMatch(game, champions, simOptions));
  };

  const handleApplySim = () => {
    if (!simResult) return;
    // Persist a compact recap (MVP + biggest swing) on the game so the
    // post-series narrative can synthesize a per-game storyline.
    const recap = buildGameRecap(game, champions, simResult);
    declareWinner(simResult.winner, recap);
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

      <div className="w-full max-w-6xl">
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

        {/* Committed game plans — echoes what each team chose on the
            StrategyView so the user can read the simulation against the plan.
            Only present once strategies have been confirmed onto the game. */}
        {game.blueStrategy && game.redStrategy && (
          <div className="bg-fade grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 mb-6">
            <StrategyRecap
              side="blue"
              name={series.blueTeam}
              strategy={game.blueStrategy}
            />
            <StrategyRecap
              side="red"
              name={series.redTeam}
              strategy={game.redStrategy}
            />
          </div>
        )}

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
                  onClick={() =>
                    setOverrideSwap((v) => (v === null ? !autoSwap : null))
                  }
                  className={`w-full py-3 md:py-4 border transition-all ${
                    overrideSwap !== null
                      ? "border-rift-gold bg-rift-gold/10 text-rift-goldbright"
                      : "border-rift-line text-rift-mutedbright hover:border-rift-gold/50 hover:bg-rift-gold/5"
                  }`}
                  title="Click to force the opposite side assignment"
                >
                  <div className="text-[10px] md:text-xs uppercase tracking-[0.35em]">
                    {overrideSwap !== null ? "Manual override" : "Loser → blue (auto)"}
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

// Compact echo of a team's committed game plan, shown above the simulation
// so the user can read the match story against what the team set out to do.
function StrategyRecap({
  side,
  name,
  strategy,
}: {
  side: Side;
  name: string;
  strategy: TeamStrategy;
}) {
  const text = side === "blue" ? "text-rift-blue" : "text-rift-red";
  const border = side === "blue" ? "border-rift-blue/30" : "border-rift-red/30";
  return (
    <div className={`border ${border} bg-rift-bg/40 p-3`}>
      <div className="flex items-baseline justify-between mb-2">
        <div
          className={`font-display ${text} uppercase tracking-[0.2em] text-xs truncate`}
        >
          {name}
        </div>
        <div className="text-[8px] uppercase tracking-[0.35em] text-rift-gold/60">
          Game Plan
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {strategySummary(strategy).map((s) => (
          <span
            key={s.label}
            title={s.label}
            className="px-1.5 py-0.5 border border-rift-line bg-rift-panel/40 text-[9px] uppercase tracking-[0.15em] text-rift-mutedbright"
          >
            {s.value}
          </span>
        ))}
      </div>
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

  // Track the most recent reveal so we can flag "isNew" for entry animation,
  // and play the matching audio cue. The severity → event-type map decides
  // which blip plays. We only fire when latestEventIdx ADVANCES (not on
  // every render), and we skip the synthetic "Match start" anchor at idx 0
  // by checking that an actual event exists.
  useEffect(() => {
    if (revealedCount - 1 !== latestEventIdx) {
      const nextIdx = revealedCount - 1;
      setLatestEventIdx(nextIdx);
      if (nextIdx >= 0 && nextIdx < result.timeline.events.length) {
        const ev = result.timeline.events[nextIdx];
        playEventBlip(EVENT_BLIP_SEVERITY[ev.type] ?? "minor");
      }
    }
  }, [revealedCount, latestEventIdx, result.timeline.events]);

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

  // Final per-lane KDA (post-match). Only computed when the match is over
  // so the in-progress UI stays cheap. ChampionContributions and the
  // damage-share bars below consume this.
  const finalLaneKDA = useMemo(() => {
    if (!isFinished) return null;
    const stats = computeRunningStats(
      result.timeline.events,
      result.timeline.events.length,
    );
    return stats.laneKDA;
  }, [isFinished, result.timeline.events]);

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

      {isFinished && (
        <MVPCard
          timeline={result.timeline}
          laneAdvantages={result.laneAdvantages}
          bluePicks={bluePicks}
          redPicks={redPicks}
          blueRoles={blueRoles}
          redRoles={redRoles}
          byId={byId}
          winner={result.winner}
          blueTeam={blueTeam}
          redTeam={redTeam}
        />
      )}

      <div className="grid grid-cols-2 gap-3 md:gap-4">
        <ChampionContributions
          side="blue"
          picks={bluePicks}
          lanes={blueRoles}
          byId={byId}
          laneKDA={isFinished ? finalLaneKDA?.blue : undefined}
        />
        <ChampionContributions
          side="red"
          picks={redPicks}
          lanes={redRoles}
          byId={byId}
          laneKDA={isFinished ? finalLaneKDA?.red : undefined}
        />
      </div>

      <TeamComparison
        blueName={blueTeam}
        redName={redTeam}
        blueScore={result.blueScore}
        redScore={result.redScore}
      />

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
  // Mute toggle reads from / writes to the same global `soundEnabled` flag
  // the DraftHeader uses, so the user has one conceptual setting across
  // both views. The button is visible only here (during playback) since
  // that's when event-reveal blips actually fire.
  const soundEnabled = useDraftStore((s) => s.soundEnabled);
  const setSoundEnabled = useDraftStore((s) => s.setSoundEnabled);
  const playLabel = mode === "playing" ? "Pause" : "Resume";
  return (
    <div className="space-y-2">
      <div className="h-1 bg-rift-bg/80 border border-rift-line/50 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-rift-golddark via-rift-gold to-rift-goldbright"
          style={{ width: `${Math.min(100, progress * 100)}%` }}
        />
      </div>
      {/* 3 text buttons + 1 icon-only mute button. The auto column keeps
          the mute compact while the others fill evenly. */}
      <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
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
        <button
          type="button"
          onClick={() => setSoundEnabled(!soundEnabled)}
          aria-label={
            soundEnabled
              ? "Mute event sound effects"
              : "Unmute event sound effects"
          }
          aria-pressed={!soundEnabled}
          title={soundEnabled ? "Mute events" : "Unmute events"}
          className={`px-3 py-2 border transition-all ${
            soundEnabled
              ? "border-rift-line/70 text-rift-mutedbright hover:border-rift-gold/50 hover:text-rift-goldbright"
              : "border-rift-red/40 text-rift-redbright/80 hover:border-rift-red/70 hover:text-rift-redbright bg-rift-red/5"
          }`}
        >
          {soundEnabled ? (
            // Speaker with sound waves
            <svg
              viewBox="0 0 16 16"
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M3 6h2l3-2.5v9L5 10H3z" fill="currentColor" fillOpacity="0.3" />
              <path d="M11 5.5c1 1 1 4 0 5" />
              <path d="M13 4c1.5 1.5 1.5 6.5 0 8" opacity="0.7" />
            </svg>
          ) : (
            // Speaker with X (muted)
            <svg
              viewBox="0 0 16 16"
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M3 6h2l3-2.5v9L5 10H3z" fill="currentColor" fillOpacity="0.3" />
              <path d="M11 5l4 4M15 5l-4 4" />
            </svg>
          )}
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

type SideLaneKDA = Record<Lane, LaneKDA>;

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
  // Per-lane K/D/A accumulated across revealed events. Mirrors laneGoldEvent
  // but split by side so the live scoreboard can render each champion's KDA.
  laneKDA: { blue: SideLaneKDA; red: SideLaneKDA };
}

const LANE_ORDER: readonly Lane[] = ["top", "jungle", "middle", "bottom", "support"];

function emptySideKDA(): SideLaneKDA {
  return {
    top: { k: 0, d: 0, a: 0 },
    jungle: { k: 0, d: 0, a: 0 },
    middle: { k: 0, d: 0, a: 0 },
    bottom: { k: 0, d: 0, a: 0 },
    support: { k: 0, d: 0, a: 0 },
  };
}

function computeRunningStats(events: MatchEvent[], upTo: number): RunningStats {
  const stats: RunningStats = {
    kills: { blue: 0, red: 0 },
    drakes: { blue: 0, red: 0 },
    barons: { blue: 0, red: 0 },
    towers: { blue: 0, red: 0 },
    inhibs: { blue: 0, red: 0 },
    hasSoul: null,
    laneGoldEvent: { top: 0, jungle: 0, middle: 0, bottom: 0, support: 0 },
    laneKDA: { blue: emptySideKDA(), red: emptySideKDA() },
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
      const blueLane = e.kdaDelta.blue[lane];
      if (blueLane) {
        stats.laneKDA.blue[lane].k += blueLane.k;
        stats.laneKDA.blue[lane].d += blueLane.d;
        stats.laneKDA.blue[lane].a += blueLane.a;
      }
      const redLane = e.kdaDelta.red[lane];
      if (redLane) {
        stats.laneKDA.red[lane].k += redLane.k;
        stats.laneKDA.red[lane].d += redLane.d;
        stats.laneKDA.red[lane].a += redLane.a;
      }
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

  // Keep the newest event in view while the log is a bounded scroll column
  // (large screens). During live playback we pin to the bottom as events
  // reveal; once finished we leave it so the user can read from the top.
  const logRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = logRef.current;
    if (el && !isFinished) el.scrollTop = el.scrollHeight;
  }, [revealedCount, isFinished]);

  return (
    <div className="border border-rift-gold/30 bg-rift-bg/40 p-3 md:p-4">
      {/* Esports-style HUD: team identity strip + live gold (full width). */}
      <ScoreboardHeader
        blueTeam={blueTeam}
        redTeam={redTeam}
        currentMin={currentMin}
        durationLabel={timeline.durationLabel}
        isFinished={isFinished}
      />

      {/* Bento layout: the objective scoreboard, the win-prob / gold-lead
          graphs, and the lane-gold strip occupy a wide main column, while the
          event log sits ALONGSIDE them (large screens) in a column that fills
          the same height and scrolls internally. This way the curves, scores,
          drakes/towers, gold and the log are all on screen at once — no
          scrolling up for the graph and down for the log. Below lg it falls
          back to the original top-to-bottom stack. */}
      <div className="mt-3 grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-4 lg:items-stretch">
        {/* Main column — scores + graphs + lane gold */}
        <div className="lg:col-span-7 min-w-0 flex flex-col">
          <Scoreboard stats={stats} gold={gold} />
          {/* Graphs side-by-side only on the widest screens (2xl); below that
              they stack so each keeps a readable width and the event-log
              column can stay wide. */}
          <div className="grid grid-cols-1 2xl:grid-cols-2 gap-x-4">
            <WinProbSparkline
              events={timeline.events}
              revealedCount={revealedCount}
              durationMinutes={timeline.durationMinutes}
            />
            <GoldLeadSparkline
              events={timeline.events}
              revealedCount={revealedCount}
              durationMinutes={timeline.durationMinutes}
              currentMin={currentMin}
              laneAdvantages={laneAdvantages}
              laningEndMinute={timeline.laningEndMinute}
              blueTeam={blueTeam}
              redTeam={redTeam}
            />
          </div>
          <LaneGoldStrip
            laneGold={laneGold}
            laneKDA={stats.laneKDA}
            bluePicks={bluePicks}
            redPicks={redPicks}
            byId={byId}
            currentMin={currentMin}
            latestEvent={
              latestEventIdx >= 0 && latestEventIdx < revealedCount
                ? timeline.events[latestEventIdx]
                : null
            }
            flashKey={latestEventIdx}
          />
        </div>

        {/* Event log — alongside the graphs, fills the row height and scrolls.
            Gets a wide 5/12 column so full event descriptions fit. */}
        <div className="lg:col-span-5 min-w-0 relative lg:min-h-[340px]">
          <div className="lg:absolute lg:inset-0 flex flex-col border-t lg:border-t-0 lg:border-l border-rift-line/40 mt-4 lg:mt-0 pt-3 lg:pt-0 lg:pl-3 xl:pl-4">
            <div className="flex items-baseline justify-between mb-2 shrink-0">
              <div className="text-[9px] md:text-[10px] uppercase tracking-[0.4em] text-rift-gold/70">
                Event Log
              </div>
              <div className="text-[9px] md:text-[10px] uppercase tracking-[0.3em] text-rift-mutedbright tabular-nums">
                {isFinished
                  ? timeline.durationLabel
                  : `${formatClock(currentMin)} / ${timeline.durationLabel}`}
              </div>
            </div>
            <div
              ref={logRef}
              className="space-y-1 lg:flex-1 lg:overflow-y-auto custom-scroll lg:pr-1"
            >
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
        </div>
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

// Win-probability chart powered by Recharts. The chart shows blue's win
// probability over time as a smoothed area, with split gradient fills
// (blue above 50%, red below) so the lead always reads at a glance. Major
// events (soul, baron, elder, ace, nexus, shutdowns) appear as ReferenceDots
// pinned to where the prob spiked, with a custom tooltip on hover.
const SPARKLINE_MARKER_EVENTS: ReadonlySet<EventType> = new Set([
  "soul",
  "baron",
  "elder",
  "ace",
  "shutdown",
  "power-spike",
  "nexus",
]);

interface ChartPoint {
  minute: number;
  // Stored as 0..100 so axis labels & tooltip values are readable percents.
  // Two series so we can stack split gradients above/below the 50 baseline.
  blueAbove: number | null; // value when blue ≥ 50 else null
  redBelow: number | null; // value when blue < 50 else null
  blue: number; // raw value for the line
  side: Side;
  desc: string;
  type: EventType;
}

interface MarkerPoint {
  minute: number;
  blue: number;
  side: Side;
  desc: string;
  type: EventType;
}

// Custom Y-axis tick that flips labels by side: top half reads as Blue's
// percentage (positive), bottom half reads as Red's percentage (also
// positive). The 50% baseline reads "EVEN" in gold. Result: no negative
// percentages and viewers can read each side's prob directly off its half
// of the chart.
//
// Typed loosely because Recharts' tick prop accepts coordinates as
// string | number; we only ever read numeric values from the chart.
function SideAwareYTick(props: {
  x?: number | string;
  y?: number | string;
  payload?: { value?: number };
}) {
  const v = props.payload?.value ?? 0;
  const isMid = v === 50;
  const isBlueSide = v > 50;
  const display = isMid ? "EVEN" : `${isBlueSide ? v : 100 - v}%`;
  const color = isMid
    ? "rgb(214 173 99)"
    : isBlueSide
    ? "rgb(96 165 250)"
    : "rgb(248 113 113)";
  return (
    <text
      x={props.x}
      y={props.y}
      dy={3}
      textAnchor="end"
      fill={color}
      fontSize={9}
      opacity={0.85}
      style={{ fontVariantNumeric: "tabular-nums" }}
    >
      {display}
    </text>
  );
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload?: ChartPoint }[] }) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  const bluePct = Math.round(p.blue);
  const labelCls =
    p.side === "blue" ? "text-rift-bluebright" : "text-rift-redbright";
  return (
    <div className="border border-rift-gold/40 bg-rift-bg/95 backdrop-blur px-2 py-1.5 text-[10px] shadow-lg">
      <div className="flex items-baseline gap-2">
        <span className="font-display tabular-nums tracking-[0.15em] text-rift-goldbright">
          {formatClock(p.minute)}
        </span>
        <span className={`tabular-nums tracking-[0.1em] ${labelCls}`}>
          {bluePct >= 50 ? `Blue ${bluePct}%` : `Red ${100 - bluePct}%`}
        </span>
      </div>
      <div className="text-rift-mutedbright text-[9px] mt-0.5 max-w-[220px] truncate">
        {p.desc}
      </div>
    </div>
  );
}

function WinProbSparkline({
  events,
  revealedCount,
  durationMinutes,
}: {
  events: MatchEvent[];
  revealedCount: number;
  durationMinutes: number;
}) {
  // Build chart data. We anchor a 50/50 starting point so the curve has
  // somewhere to begin, then append each revealed event in time order.
  // blueAbove/redBelow are the same curve clamped to one side of the
  // baseline — Recharts then draws two stacked Areas with different
  // gradients, producing the split blue/red coloring naturally.
  const data = useMemo<ChartPoint[]>(() => {
    const pts: ChartPoint[] = [
      {
        minute: 0,
        blue: 50,
        blueAbove: 50,
        redBelow: 50,
        side: "blue",
        desc: "Match start — even",
        type: "first-blood",
      },
    ];
    for (let i = 0; i < revealedCount; i++) {
      const e = events[i];
      const v = e.winProbAfter * 100;
      pts.push({
        minute: e.minutes,
        blue: v,
        blueAbove: v >= 50 ? v : 50,
        redBelow: v < 50 ? v : 50,
        side: e.side,
        desc: e.description,
        type: e.type,
      });
    }
    return pts;
  }, [events, revealedCount]);

  const markers = useMemo<MarkerPoint[]>(() => {
    const out: MarkerPoint[] = [];
    for (let i = 0; i < revealedCount; i++) {
      const e = events[i];
      if (SPARKLINE_MARKER_EVENTS.has(e.type)) {
        out.push({
          minute: e.minutes,
          blue: e.winProbAfter * 100,
          side: e.side,
          desc: e.description,
          type: e.type,
        });
      }
    }
    return out;
  }, [events, revealedCount]);

  // ─── Dynamic Y-domain (the "zoom") ─────────────────────────────────────
  // The simulator clamps winProb to ~18–82%, so a fixed [0,100] domain
  // wastes 2/5 of the vertical space and makes 5pp shifts (a normal kill
  // event) look like tiny ripples. Compute the actual data range and pad
  // ±8pp around it. The 50% baseline is always within the domain so the
  // viewer can see "is blue or red ahead?" at a glance.
  const yDomain = useMemo<[number, number]>(() => {
    if (data.length === 0) return [25, 75];
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of data) {
      if (p.blue < lo) lo = p.blue;
      if (p.blue > hi) hi = p.blue;
    }
    // Always bracket 50 so the baseline is visible — a one-sided stomp
    // shouldn't push the midline off-screen.
    lo = Math.min(lo, 50);
    hi = Math.max(hi, 50);
    // Pad +/- 8 percentage points so the curve doesn't kiss the edges,
    // then clamp to chart-legal [0, 100].
    lo = Math.max(0, Math.floor(lo) - 8);
    hi = Math.min(100, Math.ceil(hi) + 8);
    // Enforce a minimum span so very-tight first events don't render the
    // chart as a horizontal strip.
    if (hi - lo < 40) {
      const center = (lo + hi) / 2;
      lo = Math.max(0, center - 20);
      hi = Math.min(100, center + 20);
    }
    return [lo, hi];
  }, [data]);

  // Y-axis labels positioned at meaningful percent values within the
  // current domain — gives the viewer scale reference without cluttering
  // the chart.
  const yTicks = useMemo<number[]>(() => {
    const [lo, hi] = yDomain;
    const candidates = [10, 25, 35, 50, 65, 75, 90];
    return candidates.filter((v) => v >= lo + 2 && v <= hi - 2);
  }, [yDomain]);

  const last = data[data.length - 1];
  const probPct = Math.round(last.blue);
  const leadingSide: Side | "even" =
    last.blue > 55 ? "blue" : last.blue < 45 ? "red" : "even";
  const headerLabel =
    leadingSide === "blue"
      ? `Blue favored ${probPct}%`
      : leadingSide === "red"
      ? `Red favored ${100 - probPct}%`
      : "Coin flip";
  const labelCls =
    leadingSide === "blue"
      ? "text-rift-bluebright"
      : leadingSide === "red"
      ? "text-rift-redbright"
      : "text-rift-mutedbright";
  const dotColor =
    leadingSide === "blue"
      ? "rgb(96 165 250)"
      : leadingSide === "red"
      ? "rgb(248 113 113)"
      : "rgb(180 180 180)";

  // X-axis ticks: every 5 minutes for long games, 3 for short.
  const tickStep = durationMinutes >= 30 ? 5 : durationMinutes >= 18 ? 4 : 3;
  const xTicks: number[] = [0];
  for (let m = tickStep; m <= durationMinutes; m += tickStep) xTicks.push(m);

  return (
    <div className="border-t border-rift-line/40 mt-3 pt-2">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[9px] md:text-[10px] uppercase tracking-[0.4em] text-rift-gold/70">
          Win Probability
        </span>
        <span className={`font-display text-[10px] md:text-[11px] tabular-nums tracking-[0.18em] ${labelCls}`}>
          {headerLabel}
        </span>
      </div>
      <div className="relative h-40 md:h-48 -mx-1">
        {/* Side-attribution badges. The chart's vertical axis is split at
            the 50% baseline: above is blue's territory, below is red's.
            These pinned labels make the convention obvious without
            requiring legend lookup. */}
        <span
          className="pointer-events-none absolute top-1.5 right-2 text-[8px] font-display tracking-[0.3em] text-rift-bluebright/70 z-10"
          aria-hidden
        >
          BLUE
        </span>
        <span
          className="pointer-events-none absolute bottom-5 right-2 text-[8px] font-display tracking-[0.3em] text-rift-redbright/70 z-10"
          aria-hidden
        >
          RED
        </span>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 8, right: 12, left: 8, bottom: 4 }}
          >
            <defs>
              <linearGradient id="wp-blue-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgb(96 165 250)" stopOpacity={0.55} />
                <stop offset="100%" stopColor="rgb(96 165 250)" stopOpacity={0.04} />
              </linearGradient>
              <linearGradient id="wp-red-fill" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor="rgb(248 113 113)" stopOpacity={0.55} />
                <stop offset="100%" stopColor="rgb(248 113 113)" stopOpacity={0.04} />
              </linearGradient>
              {/* Curve gradient: gold center, slightly cooler at extremes */}
              <linearGradient id="wp-curve" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgb(150 200 255)" />
                <stop offset="50%" stopColor="rgb(228 192 122)" />
                <stop offset="100%" stopColor="rgb(255 160 160)" />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="minute"
              type="number"
              domain={[0, durationMinutes]}
              ticks={xTicks}
              tickFormatter={(m) => `${m}'`}
              tick={{ fill: "rgb(160 160 170)", fontSize: 10, opacity: 0.7 }}
              tickLine={false}
              axisLine={{ stroke: "rgb(120 120 130)", strokeOpacity: 0.3 }}
              interval={0}
              minTickGap={10}
            />
            <YAxis
              domain={yDomain}
              ticks={yTicks}
              tick={SideAwareYTick}
              tickLine={false}
              axisLine={false}
              width={36}
            />
            <ReferenceLine
              y={50}
              stroke="rgb(214 173 99)"
              strokeOpacity={0.45}
              strokeDasharray="3 3"
              label={{
                value: "EVEN",
                position: "insideRight",
                fill: "rgb(214 173 99)",
                fontSize: 8,
                opacity: 0.6,
                offset: 4,
              }}
            />
            <ReferenceLine
              y={75}
              stroke="rgb(96 165 250)"
              strokeOpacity={0.18}
              strokeDasharray="1.5 4"
            />
            <ReferenceLine
              y={25}
              stroke="rgb(248 113 113)"
              strokeOpacity={0.18}
              strokeDasharray="1.5 4"
            />
            {/* Blue area: only when blue ≥ 50, clamped to 50 floor */}
            <Area
              type="monotone"
              dataKey="blueAbove"
              stroke="none"
              fill="url(#wp-blue-fill)"
              fillOpacity={1}
              isAnimationActive={false}
              connectNulls
              baseValue={50}
            />
            {/* Red area: only when blue < 50, clamped down from 50 ceiling */}
            <Area
              type="monotone"
              dataKey="redBelow"
              stroke="none"
              fill="url(#wp-red-fill)"
              fillOpacity={1}
              isAnimationActive={false}
              connectNulls
              baseValue={50}
            />
            {/* Primary curve — thicker now that the chart is bigger */}
            <Area
              type="monotone"
              dataKey="blue"
              stroke="url(#wp-curve)"
              strokeWidth={2.4}
              fill="none"
              dot={false}
              activeDot={{
                r: 5,
                stroke: "rgb(228 192 122)",
                strokeWidth: 2,
                fill: "rgb(20 22 30)",
              }}
              isAnimationActive={false}
            />
            {/* Pinned markers for game-defining events */}
            {markers.map((m, i) => (
              <ReferenceDot
                key={`marker-${i}`}
                x={m.minute}
                y={m.blue}
                r={4.5}
                fill={
                  m.side === "blue" ? "rgb(96 165 250)" : "rgb(248 113 113)"
                }
                stroke="rgb(20 22 30)"
                strokeWidth={1.5}
                ifOverflow="visible"
              />
            ))}
            {/* Pulse dot at the trailing revealed point */}
            {revealedCount > 0 && (
              <ReferenceDot
                x={last.minute}
                y={last.blue}
                r={4}
                fill={dotColor}
                stroke={dotColor}
                strokeOpacity={0.5}
                strokeWidth={4}
                ifOverflow="visible"
              />
            )}
            <Tooltip
              content={<ChartTooltip />}
              cursor={{
                stroke: "rgb(214 173 99)",
                strokeOpacity: 0.5,
                strokeDasharray: "2 3",
                strokeWidth: 1.2,
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// Pinned-marker event types for the gold chart. Power-spikes are flagged
// here too so the "I'm online" moment is easy to spot on the gold curve
// (typically followed by a fight that swings the lead).
const GOLD_MARKER_EVENTS: ReadonlySet<EventType> = new Set([
  "soul",
  "baron",
  "elder",
  "ace",
  "shutdown",
  "power-spike",
  "nexus",
]);

interface GoldChartPoint {
  minute: number;
  blueAbove: number | null; // value when blue ahead (>=0) else null
  redBelow: number | null; // value when red ahead (<0) else null
  goldLead: number; // raw signed value, blue-positive
  side: Side;
  desc: string;
  type: EventType;
}

interface GoldMarkerPoint {
  minute: number;
  goldLead: number;
  side: Side;
  desc: string;
  type: EventType;
}

// Format a signed gold lead into a compact string like "+3.2k" or "−850".
// Sub-1k leads show as integers; 1k+ leads use the k shorthand. The sign
// is rendered separately by the caller (color cues which side leads), so
// this helper returns just the magnitude.
function formatGoldLeadAbs(g: number): string {
  const abs = Math.abs(Math.round(g));
  if (abs >= 1000) return `${(abs / 1000).toFixed(1)}k`;
  return `${abs}`;
}

function GoldChartTooltip({
  active,
  payload,
  blueTeam,
  redTeam,
}: {
  active?: boolean;
  payload?: { payload?: GoldChartPoint }[];
  blueTeam: string;
  redTeam: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  const isBlueAhead = p.goldLead >= 0;
  const leaderName = isBlueAhead ? blueTeam : redTeam;
  const leaderCls = isBlueAhead ? "text-rift-bluebright" : "text-rift-redbright";
  return (
    <div className="border border-rift-gold/40 bg-rift-bg/95 backdrop-blur px-2 py-1.5 text-[10px] shadow-lg">
      <div className="flex items-baseline gap-2">
        <span className="font-display tabular-nums tracking-[0.15em] text-rift-goldbright">
          {formatClock(p.minute)}
        </span>
        <span className={`tabular-nums tracking-[0.1em] ${leaderCls}`}>
          {leaderName} +{formatGoldLeadAbs(p.goldLead)}g
        </span>
      </div>
      <div className="text-rift-mutedbright text-[9px] mt-0.5 max-w-[220px] truncate">
        {p.desc}
      </div>
    </div>
  );
}

// Side-aware Y tick for the gold chart. Positive values render in blue,
// negative in red, both as positive magnitudes (no minus signs to parse
// — color carries which side is ahead). The 0 baseline reads "EVEN" in
// gold, mirroring the win-prob chart's visual convention.
function GoldYTick(props: {
  x?: number | string;
  y?: number | string;
  payload?: { value?: number };
}) {
  const v = props.payload?.value ?? 0;
  const isMid = v === 0;
  const isBlue = v > 0;
  const display = isMid ? "EVEN" : `${formatGoldLeadAbs(v)}g`;
  const color = isMid
    ? "rgb(214 173 99)"
    : isBlue
    ? "rgb(96 165 250)"
    : "rgb(248 113 113)";
  return (
    <text
      x={props.x}
      y={props.y}
      dy={3}
      textAnchor="end"
      fill={color}
      fontSize={9}
      opacity={0.85}
      style={{ fontVariantNumeric: "tabular-nums" }}
    >
      {display}
    </text>
  );
}

// Gold-lead-over-time chart. Same visual language as WinProbSparkline:
// blue area above the 0 baseline, red below, dynamic Y domain, pinned
// markers for game-defining events. Reads goldLeadAfter snapshotted on
// each MatchEvent by the simulator (so the curve reflects the same
// kill/tower/inhib economy that drives win-prob).
function GoldLeadSparkline({
  events,
  revealedCount,
  durationMinutes,
  currentMin,
  laneAdvantages,
  laningEndMinute,
  blueTeam,
  redTeam,
}: {
  events: MatchEvent[];
  revealedCount: number;
  durationMinutes: number;
  currentMin: number;
  laneAdvantages: Record<Lane, number>;
  laningEndMinute: number;
  blueTeam: string;
  redTeam: string;
}) {
  // Lane-economy gold model: gold lead at any minute t equals
  //   Σ(laneAdvantages) × min(t, laningEnd) + Σ(laneGoldDelta from events at ≤t)
  // This is the same formula the scoreboard / lane-gold strip uses, so
  // the chart agrees with the displayed totals at every minute, not just
  // at event boundaries. Computing it on the client lets us interpolate
  // intermediate points (smoothly-rising laning phase) and follow the
  // live cursor (the curve advances every animation frame, not only on
  // event reveals).
  const laneAdvSum = useMemo(() => {
    let s = 0;
    for (const lane of LANE_ORDER) s += laneAdvantages[lane];
    return s;
  }, [laneAdvantages]);

  const data = useMemo<GoldChartPoint[]>(() => {
    // Cumulative event gold contribution per event index. Walking events
    // once gives us cumulative[i] = total laneGoldDelta-summed gold from
    // events 0..i, which we can then look up at any minute t.
    const cumulativeAt: number[] = [];
    let running = 0;
    for (let i = 0; i < revealedCount; i++) {
      const e = events[i];
      for (const lane of LANE_ORDER) running += e.laneGoldDelta[lane] ?? 0;
      cumulativeAt.push(running);
    }
    // Compute the displayed gold lead at any minute t. The lookup walks
    // events backwards to find the most recent one at or before t — its
    // index gives us the cumulative event gold to add to passive lane
    // gold. Returns the same value that goldLeadAfter snapshots at
    // event boundaries; smoothly interpolates between them.
    const goldAt = (t: number): number => {
      // Most recent event index whose minute <= t. Linear scan is fine —
      // events count is bounded (~30) and this runs once per render.
      let idx = -1;
      for (let i = 0; i < revealedCount; i++) {
        if (events[i].minutes <= t) idx = i;
        else break;
      }
      const eventGold = idx >= 0 ? cumulativeAt[idx] : 0;
      const lanePhaseTime = Math.min(t, laningEndMinute);
      return Math.round(laneAdvSum * lanePhaseTime + eventGold);
    };

    const pts: GoldChartPoint[] = [
      {
        minute: 0,
        goldLead: 0,
        blueAbove: 0,
        redBelow: 0,
        side: "blue",
        desc: "Match start — even gold",
        type: "first-blood",
      },
    ];

    // Anchor minute(s) we want represented in the chart. We dedupe by
    // minute (rounded to one decimal) so an event firing at exactly the
    // same time as an interpolation tick doesn't draw two points.
    const seen = new Set<string>();
    const pushPoint = (
      minute: number,
      side: Side,
      desc: string,
      type: EventType,
    ) => {
      const key = minute.toFixed(1);
      if (seen.has(key)) return;
      seen.add(key);
      const v = goldAt(minute);
      pts.push({
        minute,
        goldLead: v,
        blueAbove: v >= 0 ? v : 0,
        redBelow: v < 0 ? v : 0,
        side,
        desc,
        type,
      });
    };

    // Per-minute interpolation across the laning phase. The lane-economy
    // model has its only continuous component (laneAdvSum × t) here, so
    // before laningEnd we want a point per minute to see the slope. After
    // laning, gold lead is piecewise-constant between events — events
    // alone are enough.
    const interpEnd = Math.min(currentMin, laningEndMinute);
    for (let m = 1; m <= Math.floor(interpEnd); m++) {
      pushPoint(m, "blue", `Min ${m} — laning gold drift`, "first-blood");
    }

    // All revealed events in order. Each one snaps its actual goldLead
    // (matches goldLeadAfter exactly via goldAt() since the same
    // formula is used).
    for (let i = 0; i < revealedCount; i++) {
      const e = events[i];
      pushPoint(e.minutes, e.side, e.description, e.type);
    }

    // Live cursor — appends "now" so the curve tip advances every
    // animation frame, not just on event reveals. Skip if there's
    // already an event point exactly at currentMin (rare; the dedupe
    // would catch it anyway).
    if (currentMin > 0) {
      pushPoint(currentMin, "blue", "Live", "first-blood");
    }

    pts.sort((a, b) => a.minute - b.minute);
    return pts;
  }, [events, revealedCount, currentMin, laneAdvSum, laningEndMinute]);

  const markers = useMemo<GoldMarkerPoint[]>(() => {
    const out: GoldMarkerPoint[] = [];
    for (let i = 0; i < revealedCount; i++) {
      const e = events[i];
      if (GOLD_MARKER_EVENTS.has(e.type)) {
        out.push({
          minute: e.minutes,
          goldLead: e.goldLeadAfter ?? 0,
          side: e.side,
          desc: e.description,
          type: e.type,
        });
      }
    }
    return out;
  }, [events, revealedCount]);

  // Symmetric Y-domain anchored at 0 so the baseline is always visible
  // and a comeback shows as a clear cross of the midline. Padded ±15%
  // beyond the data extreme; minimum span ±2k so a tense early game still
  // renders with vertical movement.
  const yDomain = useMemo<[number, number]>(() => {
    let extreme = 2000;
    for (const p of data) {
      const a = Math.abs(p.goldLead);
      if (a > extreme) extreme = a;
    }
    extreme = Math.ceil(extreme * 1.15);
    return [-extreme, extreme];
  }, [data]);

  const yTicks = useMemo<number[]>(() => {
    const [lo, hi] = yDomain;
    // 5 ticks: extremes, halfway, and 0. Round halfway values to a clean
    // increment based on magnitude (500 / 1k / 2.5k / 5k).
    const mag = Math.max(Math.abs(lo), Math.abs(hi));
    const step =
      mag > 12000 ? 5000 : mag > 6000 ? 2500 : mag > 2500 ? 1000 : 500;
    const ticks: number[] = [0];
    for (let v = step; v <= hi - step / 2; v += step) ticks.push(v);
    for (let v = -step; v >= lo + step / 2; v -= step) ticks.push(v);
    return ticks.sort((a, b) => a - b);
  }, [yDomain]);

  const last = data[data.length - 1];
  const lead = last.goldLead;
  const leadingSide: Side | "even" =
    Math.abs(lead) < 250 ? "even" : lead > 0 ? "blue" : "red";
  const headerLabel =
    leadingSide === "blue"
      ? `Blue +${formatGoldLeadAbs(lead)}g`
      : leadingSide === "red"
      ? `Red +${formatGoldLeadAbs(lead)}g`
      : "Even gold";
  const labelCls =
    leadingSide === "blue"
      ? "text-rift-bluebright"
      : leadingSide === "red"
      ? "text-rift-redbright"
      : "text-rift-mutedbright";
  const dotColor =
    leadingSide === "blue"
      ? "rgb(96 165 250)"
      : leadingSide === "red"
      ? "rgb(248 113 113)"
      : "rgb(180 180 180)";

  const tickStep = durationMinutes >= 30 ? 5 : durationMinutes >= 18 ? 4 : 3;
  const xTicks: number[] = [0];
  for (let m = tickStep; m <= durationMinutes; m += tickStep) xTicks.push(m);

  return (
    <div className="border-t border-rift-line/40 mt-3 pt-2">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[9px] md:text-[10px] uppercase tracking-[0.4em] text-rift-gold/70">
          Gold Lead
        </span>
        <span
          className={`font-display text-[10px] md:text-[11px] tabular-nums tracking-[0.18em] ${labelCls}`}
        >
          {headerLabel}
        </span>
      </div>
      <div className="relative h-32 md:h-40 -mx-1">
        <span
          className="pointer-events-none absolute top-1.5 right-2 text-[8px] font-display tracking-[0.3em] text-rift-bluebright/70 z-10"
          aria-hidden
        >
          BLUE
        </span>
        <span
          className="pointer-events-none absolute bottom-5 right-2 text-[8px] font-display tracking-[0.3em] text-rift-redbright/70 z-10"
          aria-hidden
        >
          RED
        </span>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 8, right: 12, left: 8, bottom: 4 }}
          >
            <defs>
              <linearGradient id="gold-blue-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgb(96 165 250)" stopOpacity={0.55} />
                <stop offset="100%" stopColor="rgb(96 165 250)" stopOpacity={0.04} />
              </linearGradient>
              <linearGradient id="gold-red-fill" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor="rgb(248 113 113)" stopOpacity={0.55} />
                <stop offset="100%" stopColor="rgb(248 113 113)" stopOpacity={0.04} />
              </linearGradient>
              <linearGradient id="gold-curve" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgb(150 200 255)" />
                <stop offset="50%" stopColor="rgb(228 192 122)" />
                <stop offset="100%" stopColor="rgb(255 160 160)" />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="minute"
              type="number"
              domain={[0, durationMinutes]}
              ticks={xTicks}
              tickFormatter={(m) => `${m}'`}
              tick={{ fill: "rgb(160 160 170)", fontSize: 10, opacity: 0.7 }}
              tickLine={false}
              axisLine={{ stroke: "rgb(120 120 130)", strokeOpacity: 0.3 }}
              interval={0}
              minTickGap={10}
            />
            <YAxis
              domain={yDomain}
              ticks={yTicks}
              tick={GoldYTick}
              tickLine={false}
              axisLine={false}
              width={42}
            />
            <ReferenceLine
              y={0}
              stroke="rgb(214 173 99)"
              strokeOpacity={0.45}
              strokeDasharray="3 3"
              label={{
                value: "EVEN",
                position: "insideRight",
                fill: "rgb(214 173 99)",
                fontSize: 8,
                opacity: 0.6,
                offset: 4,
              }}
            />
            <Area
              type="monotone"
              dataKey="blueAbove"
              stroke="none"
              fill="url(#gold-blue-fill)"
              fillOpacity={1}
              isAnimationActive={false}
              connectNulls
              baseValue={0}
            />
            <Area
              type="monotone"
              dataKey="redBelow"
              stroke="none"
              fill="url(#gold-red-fill)"
              fillOpacity={1}
              isAnimationActive={false}
              connectNulls
              baseValue={0}
            />
            <Area
              type="monotone"
              dataKey="goldLead"
              stroke="url(#gold-curve)"
              strokeWidth={2.4}
              fill="none"
              dot={false}
              activeDot={{
                r: 5,
                stroke: "rgb(228 192 122)",
                strokeWidth: 2,
                fill: "rgb(20 22 30)",
              }}
              isAnimationActive={false}
            />
            {markers.map((m, i) => (
              <ReferenceDot
                key={`gold-marker-${i}`}
                x={m.minute}
                y={m.goldLead}
                r={m.type === "power-spike" ? 3.5 : 4.5}
                fill={
                  m.type === "power-spike"
                    ? "rgb(228 192 122)"
                    : m.side === "blue"
                    ? "rgb(96 165 250)"
                    : "rgb(248 113 113)"
                }
                stroke="rgb(20 22 30)"
                strokeWidth={1.5}
                ifOverflow="visible"
              />
            ))}
            {revealedCount > 0 && (
              <ReferenceDot
                x={last.minute}
                y={last.goldLead}
                r={4}
                fill={dotColor}
                stroke={dotColor}
                strokeOpacity={0.5}
                strokeWidth={4}
                ifOverflow="visible"
              />
            )}
            <Tooltip
              content={
                <GoldChartTooltip blueTeam={blueTeam} redTeam={redTeam} />
              }
              cursor={{
                stroke: "rgb(214 173 99)",
                strokeOpacity: 0.5,
                strokeDasharray: "2 3",
                strokeWidth: 1.2,
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// Per-lane involvement classification for the most recent event. Used by
// LaneGoldRow to decide which champion icons to flash and what color.
type FlashKind = "kill" | "death" | "objective" | null;
interface LaneInvolvement {
  blue: FlashKind;
  red: FlashKind;
}

// Derive involvement from an event's kdaDelta. A lane with a kill (or
// assist) flashes in blue/red depending on side; a lane with a death
// flashes red regardless of side. For events with no kills (towers, drakes
// without smite-steal, plates), every lane on the event's side gets a
// gold "objective" flash since the team contributed to the take.
function involvementFor(
  event: MatchEvent,
  lane: Lane,
): { blue: FlashKind; red: FlashKind } {
  const blueLane = event.kdaDelta.blue[lane];
  const redLane = event.kdaDelta.red[lane];
  let blueKind: FlashKind = null;
  let redKind: FlashKind = null;
  if (blueLane && (blueLane.k > 0 || blueLane.a > 0)) blueKind = "kill";
  else if (blueLane && blueLane.d > 0) blueKind = "death";
  if (redLane && (redLane.k > 0 || redLane.a > 0)) redKind = "kill";
  else if (redLane && redLane.d > 0) redKind = "death";

  // Objective events (drake/baron/tower/herald with no per-lane kills)
  // attribute to the event's side as a team-wide flash. We detect this by
  // "no kdaDelta entries on either side" and an event type that's an
  // objective — the row that matches the event's side gets a gold flash.
  if (
    !blueKind &&
    !redKind &&
    OBJECTIVE_FLASH_TYPES.has(event.type)
  ) {
    if (event.side === "blue") blueKind = "objective";
    else redKind = "objective";
  }
  return { blue: blueKind, red: redKind };
}

// Events without per-champion kills that should still pulse the team that
// took them — e.g. the side that secured a drake/herald/tower.
const OBJECTIVE_FLASH_TYPES: ReadonlySet<EventType> = new Set([
  "dragon",
  "soul",
  "elder",
  "baron",
  "atakhan",
  "herald",
  "grubs",
  "tower",
  "inhibitor",
  "plates",
  "scuttle",
  "wave-crash",
  "objective-trade",
  "power-spike",
  "vision",
]);

// Live per-lane gold diff strip. Shows champion icons either side and the
// rolling gold differential between lane opponents — updates as events fire.
// Also shows live K/D/A under each champion's name, accumulated from event
// kdaDelta attributions. When a new event reveals, the rows whose
// champions were involved get a brief flash (blue/red glow if it was a
// kill/death; gold if it was a team-wide objective).
function LaneGoldStrip({
  laneGold,
  laneKDA,
  bluePicks,
  redPicks,
  byId,
  currentMin,
  latestEvent,
  flashKey,
}: {
  laneGold: Record<Lane, number>;
  laneKDA: { blue: SideLaneKDA; red: SideLaneKDA };
  bluePicks: (number | null)[];
  redPicks: (number | null)[];
  byId: Map<number, Champion>;
  currentMin: number;
  latestEvent: MatchEvent | null;
  flashKey: number;
}) {
  return (
    <div className="border-t border-rift-line/40 mt-4 pt-3 space-y-2">
      <div className="flex items-baseline justify-center gap-2 mb-2">
        <span className="text-[10px] md:text-xs uppercase tracking-[0.45em] text-rift-gold/80 font-display">
          Lane Gold
        </span>
        <span className="text-[8px] uppercase tracking-[0.3em] text-rift-mutedbright/60">
          live
        </span>
      </div>
      {LANE_ORDER.map((lane, i) => {
        const blueId = bluePicks[i];
        const redId = redPicks[i];
        const blueChamp = blueId != null ? byId.get(blueId) : null;
        const redChamp = redId != null ? byId.get(redId) : null;
        const diff = laneGold[lane];
        const inv = latestEvent
          ? involvementFor(latestEvent, lane)
          : { blue: null, red: null };
        return (
          <LaneGoldRow
            key={lane}
            lane={lane}
            blueChamp={blueChamp ?? null}
            redChamp={redChamp ?? null}
            blueKDA={laneKDA.blue[lane]}
            redKDA={laneKDA.red[lane]}
            diff={diff}
            currentMin={currentMin}
            blueFlash={inv.blue}
            redFlash={inv.red}
            flashKey={flashKey}
          />
        );
      })}
    </div>
  );
}

// Per-champion power-spike badge. Shows the minute the champion's first
// major item lands, sourced from the same getKeyPowerSpike() data the
// simulator uses for its power-spike events. Two states:
//   - pending: rendered dim, label reads "SPIKE 14'" — the carry isn't
//     online yet, viewer knows when to expect them
//   - live: when currentMin >= spike minute, badge brightens to gold and
//     reads "ONLINE 14'+" — the threat window is now open
// Carry spikes (hyper/burst/assassin/marksman) get prominent gold
// styling; non-carry spikes (tanks/enchanters/peel) get a muted treatment
// since their "spike" is utility, not a fight-flipper.
function ChampSpikeBadge({
  champ,
  currentMin,
  side,
}: {
  champ: Champion;
  currentMin: number;
  side: Side;
}) {
  // The power-spike override is module-level state that the useMemo dep
  // array can't observe directly, so subscribe to the store's version
  // counter to recompute when randomization swaps the override in/out.
  const powerSpikeVersion = useDraftStore((s) => s.powerSpikeVersion);
  const spike = useMemo(() => {
    const m = metaFor(champ);
    return getKeyPowerSpike(m, champ.alias);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [champ, powerSpikeVersion]);
  const live = currentMin >= spike.minute;
  const isCarry = spike.isCarrySpike;
  const baseCls = live
    ? isCarry
      ? "bg-rift-gold/15 border-rift-gold/60 text-rift-goldbright"
      : "bg-rift-gold/5 border-rift-gold/30 text-rift-gold/80"
    : isCarry
    ? "bg-rift-bg/40 border-rift-line text-rift-mutedbright/80"
    : "bg-rift-bg/40 border-rift-line/60 text-rift-muted/70";
  const label = live ? `ONLINE ${spike.minute}'` : `SPIKE ${spike.minute}'`;
  const align = side === "blue" ? "justify-end" : "justify-start";
  return (
    <div className={`flex ${align} mt-0.5`}>
      <span
        className={`inline-flex items-center gap-1 px-1.5 py-[1px] border text-[8px] md:text-[9px] uppercase tracking-[0.2em] tabular-nums ${baseCls}`}
        title={`Key item: ${spike.keyItem}`}
      >
        <svg
          viewBox="0 0 16 16"
          className="w-2 h-2 md:w-2.5 md:h-2.5"
          fill="currentColor"
          aria-hidden
        >
          <path d="M8 1L3 9h4l-1 6 5-8H7l1-6z" />
        </svg>
        {label}
      </span>
    </div>
  );
}

function formatKDA(k: LaneKDA): string {
  return `${k.k}/${k.d}/${k.a}`;
}

// Map an involvement kind + ally side to the right CSS animation class.
// Kill flashes use the player's own side color (blue ally got a kill =
// blue glow). Death always flashes red, regardless of side, since the
// red ring reads as "this player died" universally. Objective flashes
// (drake/baron/tower with no per-champion kill) use gold.
function flashClassFor(kind: FlashKind, side: Side): string {
  if (kind == null) return "";
  if (kind === "death") return "animate-event-flash-red";
  if (kind === "objective") return "animate-event-flash-gold";
  // kill/assist
  return side === "blue" ? "animate-event-flash-blue" : "animate-event-flash-red";
}

function LaneGoldRow({
  lane,
  blueChamp,
  redChamp,
  blueKDA,
  redKDA,
  diff,
  currentMin,
  blueFlash,
  redFlash,
  flashKey,
}: {
  lane: Lane;
  blueChamp: Champion | null;
  redChamp: Champion | null;
  blueKDA: LaneKDA;
  redKDA: LaneKDA;
  diff: number;
  currentMin: number;
  blueFlash: FlashKind;
  redFlash: FlashKind;
  flashKey: number;
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
  // The flash animation only retriggers when the React key changes —
  // attaching `flashKey` to the icon wrapper means each new event reveal
  // remounts the wrapper and the keyframe restarts. The `blueFlash`/
  // `redFlash` classification is sticky for that single reveal cycle.
  const blueFlashCls = flashClassFor(blueFlash, "blue");
  const redFlashCls = flashClassFor(redFlash, "red");
  // Gold-diff bar: visualizes lead magnitude. Anchored at center, fills
  // toward the leading side. Saturates at ~3000g lead so a roughly even
  // game still shows movement (small leads are visible) without making
  // every snowball look like a stomp.
  const barFillPct = Math.min(50, (Math.abs(diff) / 3000) * 50);

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 md:gap-3 text-xs md:text-sm py-1">
      {/* Blue (left) cell */}
      <div
        className={`flex items-center justify-end gap-2 md:gap-2.5 truncate ${
          blueAhead ? "text-rift-bluebright" : "text-rift-mutedbright/85"
        }`}
      >
        <div className="flex flex-col items-end min-w-0">
          <span className="truncate font-display tracking-wider text-[11px] md:text-[13px]">
            {blueChamp?.name ?? "—"}
          </span>
          {blueChamp && (
            <span className="text-[10px] md:text-[11px] tabular-nums tracking-tight text-rift-mutedbright/85 leading-tight mt-0.5">
              <span className="text-rift-bluebright">{blueKDA.k}</span>
              <span className="text-rift-muted/60">/</span>
              <span className="text-rift-redbright/80">{blueKDA.d}</span>
              <span className="text-rift-muted/60">/</span>
              <span className="text-rift-bluebright">{blueKDA.a}</span>
            </span>
          )}
          {blueChamp && (
            <ChampSpikeBadge
              champ={blueChamp}
              currentMin={currentMin}
              side="blue"
            />
          )}
        </div>
        {blueChamp && (
          <span
            key={`blue-${flashKey}-${blueFlash ?? "none"}`}
            className={`inline-block ${blueFlashCls}`}
          >
            <img
              src={blueChamp.iconUrl}
              alt={blueChamp.name}
              className={`w-10 h-10 md:w-11 md:h-11 flex-shrink-0 border-2 ${
                blueAhead ? "border-rift-blue shadow-glow-blue" : "border-rift-line"
              }`}
            />
          </span>
        )}
      </div>

      {/* Center gauge: lane label, gold delta, mini bar */}
      <div className="flex flex-col items-center min-w-[7rem] md:min-w-[8.5rem] px-1">
        <span className="flex items-center gap-1 text-[8px] md:text-[9px] uppercase tracking-[0.3em] text-rift-mutedbright/70">
          <LaneIcon lane={lane} size="xs" />
        </span>
        <span
          className={`font-display text-sm md:text-base tabular-nums uppercase tracking-[0.15em] mt-0.5 ${diffCls}`}
        >
          {diffLabel}
        </span>
        <div className="relative w-full h-1 bg-rift-bg/80 rounded-sm mt-1">
          <div
            className="absolute top-0 bottom-0 bg-rift-line/40"
            style={{ left: "50%", transform: "translateX(-50%)", width: "1px" }}
          />
          {leadSide === "blue" && (
            <div
              className="absolute top-0 bottom-0 right-1/2 bg-rift-blue rounded-sm"
              style={{ width: `${barFillPct}%` }}
            />
          )}
          {leadSide === "red" && (
            <div
              className="absolute top-0 bottom-0 left-1/2 bg-rift-red rounded-sm"
              style={{ width: `${barFillPct}%` }}
            />
          )}
        </div>
      </div>

      {/* Red (right) cell */}
      <div
        className={`flex items-center gap-2 md:gap-2.5 truncate ${
          redAhead ? "text-rift-redbright" : "text-rift-mutedbright/85"
        }`}
      >
        {redChamp && (
          <span
            key={`red-${flashKey}-${redFlash ?? "none"}`}
            className={`inline-block ${redFlashCls}`}
          >
            <img
              src={redChamp.iconUrl}
              alt={redChamp.name}
              className={`w-10 h-10 md:w-11 md:h-11 flex-shrink-0 border-2 ${
                redAhead ? "border-rift-red shadow-glow-red" : "border-rift-line"
              }`}
            />
          </span>
        )}
        <div className="flex flex-col items-start min-w-0">
          <span className="truncate font-display tracking-wider text-[11px] md:text-[13px]">
            {redChamp?.name ?? "—"}
          </span>
          {redChamp && (
            <span className="text-[10px] md:text-[11px] tabular-nums tracking-tight text-rift-mutedbright/85 leading-tight mt-0.5">
              <span className="text-rift-redbright">{redKDA.k}</span>
              <span className="text-rift-muted/60">/</span>
              <span className="text-rift-redbright/80">{redKDA.d}</span>
              <span className="text-rift-muted/60">/</span>
              <span className="text-rift-redbright">{redKDA.a}</span>
            </span>
          )}
          {redChamp && (
            <ChampSpikeBadge
              champ={redChamp}
              currentMin={currentMin}
              side="red"
            />
          )}
        </div>
      </div>
    </div>
  );
}

// MVP card. Shown after the match finishes. Picks the player with the
// highest composite score across the 10 champions:
//
//   score = K + 0.7·A − 0.5·D + (laneGoldDiffSigned / 1000) + winnerBonus
//
// The lane-gold term is signed FROM THE PLAYER'S PERSPECTIVE: a blue
// player gets +diff, a red player gets −diff (where diff is blue-positive).
// This makes lane gold an additive merit signal (you outperformed your
// rival), not a side-biased noise term. winnerBonus (+1.5) gently nudges
// MVP toward the winning team in close ties — losing-team MVPs still happen
// when a player vastly outperforms (high KDA + crushed their lane).
function MVPCard({
  timeline,
  laneAdvantages,
  bluePicks,
  redPicks,
  blueRoles,
  redRoles,
  byId,
  winner,
  blueTeam,
  redTeam,
}: {
  timeline: MatchTimeline;
  laneAdvantages: Record<Lane, number>;
  bluePicks: (number | null)[];
  redPicks: (number | null)[];
  blueRoles: (Lane | null)[];
  redRoles: (Lane | null)[];
  byId: Map<number, Champion>;
  winner: Side;
  blueTeam: string;
  redTeam: string;
}) {
  const mvp = useMemo(() => {
    // Final stats = stats accumulated across ALL events.
    const finalStats = computeRunningStats(timeline.events, timeline.events.length);
    // Final lane gold uses the closing minute (= duration) so passive
    // lane-phase gold is fully baked in.
    const finalLaneGold = computeLiveLaneGold(
      laneAdvantages,
      finalStats.laneGoldEvent,
      timeline.durationMinutes,
      timeline.laningEndMinute,
    );

    type Candidate = {
      side: Side;
      lane: Lane;
      championId: number;
      kda: LaneKDA;
      laneGoldDiff: number; // signed from this player's perspective
      score: number;
    };

    // MVP is the Player of the Game — by convention it always goes to the
    // WINNING team, so only the winning side's players are candidates. This
    // keeps the award off a fed losing-team carry and matches buildGameRecap.
    const candidates: Candidate[] = [];
    for (let i = 0; i < LANE_ORDER.length; i++) {
      const lane = LANE_ORDER[i];
      if (winner === "blue") {
        const blueId = bluePicks[i];
        if (blueId != null) {
          const kda = finalStats.laneKDA.blue[lane];
          const diff = finalLaneGold[lane]; // blue-positive
          candidates.push({
            side: "blue",
            lane,
            championId: blueId,
            kda,
            laneGoldDiff: diff,
            score: kda.k + kda.a * 0.7 - kda.d * 0.5 + diff / 1000,
          });
        }
      } else {
        const redId = redPicks[i];
        if (redId != null) {
          const kda = finalStats.laneKDA.red[lane];
          const diff = -finalLaneGold[lane]; // red player: negate so + = ahead
          candidates.push({
            side: "red",
            lane,
            championId: redId,
            kda,
            laneGoldDiff: diff,
            score: kda.k + kda.a * 0.7 - kda.d * 0.5 + diff / 1000,
          });
        }
      }
    }
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0];
  }, [
    timeline,
    laneAdvantages,
    bluePicks,
    redPicks,
    blueRoles,
    redRoles,
    winner,
  ]);

  if (!mvp) return null;
  const champ = byId.get(mvp.championId);
  if (!champ) return null;
  const sideName = mvp.side === "blue" ? blueTeam : redTeam;
  const sideBorderHex =
    mvp.side === "blue" ? "border-rift-blue" : "border-rift-red";
  const sideAccentText =
    mvp.side === "blue" ? "text-rift-bluebright" : "text-rift-redbright";
  const sideGlow =
    mvp.side === "blue" ? "shadow-glow-blue" : "shadow-glow-red";
  const sideGradient =
    mvp.side === "blue"
      ? "from-rift-bluedeep/30 via-rift-blue/5 to-transparent"
      : "from-rift-reddeep/30 via-rift-red/5 to-transparent";
  // Display the lane gold diff. Always positive — color encodes sign.
  const laneGoldAbs = formatLaneGold(Math.abs(mvp.laneGoldDiff));
  const laneGoldText =
    mvp.laneGoldDiff > 100
      ? `+${laneGoldAbs}`
      : mvp.laneGoldDiff < -100
      ? `−${laneGoldAbs}`
      : "EVEN";
  const laneGoldCls =
    mvp.laneGoldDiff > 100
      ? "text-rift-goldbright"
      : mvp.laneGoldDiff < -100
      ? "text-rift-redbright/80"
      : "text-rift-muted";
  // KDA ratio for the headline ("8.0 KDA"). Treat 0 deaths specially —
  // "Perfect" reads more like a broadcast.
  const kdaRatio =
    mvp.kda.d === 0
      ? mvp.kda.k + mvp.kda.a > 0
        ? "Perfect"
        : "—"
      : ((mvp.kda.k + mvp.kda.a) / mvp.kda.d).toFixed(1);

  return (
    <div
      className={`relative border-2 ${sideBorderHex} ${sideGlow} bg-gradient-to-r ${sideGradient} bg-rift-panel/40 overflow-hidden`}
    >
      {/* Decorative chevron banner top-left — broadcast feel */}
      <div className="absolute top-0 left-0 px-2 py-0.5 bg-rift-gold text-rift-bg font-display text-[9px] md:text-[10px] uppercase tracking-[0.4em] z-10">
        ★ Player of the Game
      </div>

      <div className="flex items-center gap-3 md:gap-5 p-4 md:p-5 pt-7 md:pt-8">
        {/* Champion portrait — substantially larger for visual weight */}
        <div className="relative flex-shrink-0">
          <img
            src={champ.iconUrl}
            alt={champ.name}
            className={`w-20 h-20 md:w-24 md:h-24 border-2 ${sideBorderHex} object-cover`}
          />
        </div>

        {/* Champion identity + meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-[10px] md:text-[11px] font-display uppercase tracking-[0.35em] ${sideAccentText}`}>
              {sideName}
            </span>
            <span className="text-rift-mutedbright/40">·</span>
            <span className="flex items-center gap-1 text-[10px] uppercase tracking-[0.25em] text-rift-mutedbright/70">
              <LaneIcon lane={mvp.lane} size="xs" />
              {mvp.lane}
            </span>
          </div>
          <div className="font-display text-2xl md:text-3xl tracking-wider truncate text-rift-goldbright leading-tight">
            {champ.name}
          </div>
          <div className="flex items-baseline gap-3 md:gap-4 mt-2 flex-wrap">
            {/* KDA cluster */}
            <div className="flex items-baseline gap-1">
              <span className="text-[9px] uppercase tracking-[0.3em] text-rift-mutedbright/60 mr-1">
                K/D/A
              </span>
              <span className="font-display text-base md:text-lg tabular-nums">
                {/* KDA uses fixed semantic colors, not side-derived
                    ones, so the values read consistently across both
                    teams' rosters: kills (good) = emerald, deaths
                    (bad) = red, assists = neutral gold. */}
                <span className="text-emerald-300">{mvp.kda.k}</span>
                <span className="text-rift-muted/50 mx-0.5">/</span>
                <span className="text-rift-redbright/85">{mvp.kda.d}</span>
                <span className="text-rift-muted/50 mx-0.5">/</span>
                <span className="text-rift-goldbright/85">{mvp.kda.a}</span>
              </span>
              <span className="text-[10px] tabular-nums text-rift-goldbright/80 font-display ml-1">
                {kdaRatio}
              </span>
            </div>
          </div>
        </div>

        {/* Lane gold diff stat block — emphasized, the "why this MVP" */}
        <div className="hidden md:flex flex-col items-end flex-shrink-0 border-l border-rift-line/40 pl-4">
          <span className="text-[9px] uppercase tracking-[0.3em] text-rift-mutedbright/60">
            Lane Gold
          </span>
          <span className={`font-display text-xl tabular-nums tracking-tight ${laneGoldCls} mt-0.5`}>
            {laneGoldText}
          </span>
          <span className="text-[8px] uppercase tracking-[0.25em] text-rift-mutedbright/50 mt-0.5">
            vs lane opp
          </span>
        </div>
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
  // Stat counts use a fixed palette that doesn't depend on side colors:
  //   • leading side → bright gold (highlights the bigger number)
  //   • trailing side → muted
  // Soul still gets emphasized gold + display font.
  const blueCls =
    soulSide === "blue"
      ? "text-rift-goldbright font-display"
      : lead === "blue"
      ? "text-rift-goldbright font-display"
      : "text-rift-mutedbright";
  const redCls =
    soulSide === "red"
      ? "text-rift-goldbright font-display"
      : lead === "red"
      ? "text-rift-goldbright font-display"
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
  vision: "Vision",
  outplay: "Outplay",
  "objective-trade": "Trade",
  "wave-crash": "Wave Crash",
  "power-spike": "Spike",
};

// Events that deserve extra emphasis in the timeline (gold tinted, larger).
// Event → audio severity. Three buckets:
//   minor — single-target / no-objective events (kills, plates, scuttle, etc.)
//   mid   — objective takes and team fights (drake/herald/tower/teamfight)
//   major — game-defining moments (soul/baron/elder/ace/shutdown/backdoor/nexus)
// Anything not listed defaults to "minor". Synced with EMPHASIS_EVENTS but
// we keep them separate so audio can be slightly broader than visual emphasis
// (e.g. a drake should chime even though it doesn't get a gold border).
const EVENT_BLIP_SEVERITY: Partial<Record<EventType, EventBlipSeverity>> = {
  // minor (default — kills and small plays)
  "first-blood": "minor",
  "solo-kill": "minor",
  gank: "minor",
  "counter-gank": "minor",
  plates: "minor",
  scuttle: "minor",
  invade: "minor",
  roam: "minor",
  "buff-steal": "minor",
  vision: "minor",
  outplay: "minor",
  "wave-crash": "minor",
  "objective-trade": "minor",
  "power-spike": "minor",
  // mid (objective + fight)
  dragon: "mid",
  atakhan: "mid",
  grubs: "mid",
  herald: "mid",
  tower: "mid",
  inhibitor: "mid",
  skirmish: "mid",
  pick: "mid",
  teamfight: "mid",
  // major (game-defining)
  soul: "major",
  baron: "major",
  elder: "major",
  ace: "major",
  shutdown: "major",
  backdoor: "major",
  nexus: "major",
};

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
  const accentText = isBlue ? "text-rift-bluebright" : "text-rift-redbright";
  const sideTintBg = isBlue
    ? "bg-gradient-to-r from-rift-blue/10 via-rift-blue/[0.03] to-transparent"
    : "bg-gradient-to-l from-rift-red/10 via-rift-red/[0.03] to-transparent";
  const isEmphasis = EMPHASIS_EVENTS.has(event.type);
  const teamLabel = isBlue ? blueTeam : redTeam;
  const totalKills = event.kills.blue + event.kills.red;
  // Side-anchored layout: blue events read left-to-right (icon left, team
  // right); red events read right-to-left. Subtle but it makes the log
  // feel like a broadcast scroll where each side has territory.
  return (
    <div
      className={`relative flex items-center gap-2 md:gap-3 px-2.5 py-1.5 ${sideTintBg} ${
        isEmphasis
          ? "border border-rift-gold/40 bg-rift-gold/5"
          : "border-l-2 border-r border-r-transparent " +
            (isBlue ? "border-l-rift-blue" : "border-l-rift-red")
      } ${isNew ? "animate-[fadeSlide_400ms_ease-out]" : ""} transition-all`}
    >
      {/* Time + event-type capsule */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <span
          className={`font-display text-xs md:text-sm tabular-nums tracking-tight ${
            isEmphasis ? "text-rift-goldbright" : accentText
          } w-11 md:w-12 text-right`}
        >
          {event.time}
        </span>
        <span
          className={`flex items-center justify-center w-7 h-7 md:w-8 md:h-8 border ${
            isEmphasis
              ? "border-rift-gold/60 bg-rift-gold/15 text-rift-goldbright"
              : isBlue
              ? "border-rift-blue/40 bg-rift-blue/10 text-rift-bluebright"
              : "border-rift-red/40 bg-rift-red/10 text-rift-redbright"
          }`}
        >
          <EventIcon type={event.type} size={16} />
        </span>
      </div>

      {/* Description block: type label + flavor text */}
      <div className="flex-1 min-w-0 leading-tight">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span
            className={`text-[9px] md:text-[10px] uppercase tracking-[0.25em] ${
              isEmphasis ? "text-rift-goldbright font-display" : accentText
            }`}
          >
            {EVENT_LABEL[event.type]}
          </span>
          {totalKills > 0 && (
            <span className="text-[9px] md:text-[10px] tabular-nums">
              {/* Kill counts no longer tinted by side; use a single
                  fixed palette so K/D/A reads consistently regardless
                  of who scored. Active kills = emerald (good thing
                  happening), zeros stay muted. */}
              <span className={event.kills.blue > 0 ? "text-emerald-300" : "text-rift-muted/60"}>
                {event.kills.blue}K
              </span>
              <span className="text-rift-muted/50 mx-1">·</span>
              <span className={event.kills.red > 0 ? "text-emerald-300" : "text-rift-muted/60"}>
                {event.kills.red}K
              </span>
            </span>
          )}
        </div>
        <div
          title={event.description}
          className={`text-[11px] md:text-xs mt-0.5 break-words ${
            isEmphasis ? "text-rift-goldbright/95" : "text-rift-mutedbright"
          }`}
        >
          {event.description}
        </div>
      </div>

      {/* Trailing team label */}
      <span
        className={`text-[9px] md:text-[10px] font-display uppercase tracking-[0.2em] ${accentText} flex-shrink-0 hidden sm:inline truncate max-w-[6rem]`}
        title={teamLabel}
      >
        {teamLabel}
      </span>
    </div>
  );
}

// Champion contributions panel. After a match finishes (laneKDA provided),
// each row displays a synthetic damage-share bar derived from KDA +
// archetype damage profile. During pre-sim or live playback (laneKDA
// undefined), it shows just the meta tags — same panel, two states.
function ChampionContributions({
  side,
  picks,
  lanes,
  byId,
  laneKDA,
}: {
  side: Side;
  picks: (number | null)[];
  lanes: (Lane | null)[];
  byId: Map<number, Champion>;
  laneKDA?: SideLaneKDA;
}) {
  const border = side === "blue" ? "border-rift-blue/40" : "border-rift-red/40";
  const accentBg = side === "blue" ? "bg-rift-blue/5" : "bg-rift-red/5";
  const sideLabel = side === "blue" ? "Blue" : "Red";
  const sideAccent =
    side === "blue" ? "text-rift-bluebright" : "text-rift-redbright";

  // Compute team total damage so each row knows its share %.
  const totalDamage = useMemo(() => {
    if (!laneKDA) return 0;
    let total = 0;
    for (let i = 0; i < picks.length; i++) {
      const id = picks[i];
      if (id == null) continue;
      const c = byId.get(id);
      if (!c) continue;
      const lane = LANE_ORDER[i];
      const kda = laneKDA[lane];
      const meta = getChampionMeta(c.alias);
      if (!meta) continue;
      total += syntheticDamage(kda, meta);
    }
    return total;
  }, [laneKDA, picks, byId]);

  return (
    <div className={`border-2 ${border} ${accentBg} p-3 md:p-4`}>
      <div className="flex items-baseline justify-between mb-3 pb-2 border-b border-rift-line/40">
        <div className="flex items-baseline gap-2">
          <span className="text-[9px] md:text-[10px] uppercase tracking-[0.4em] text-rift-gold/70">
            Roster
          </span>
          <span
            className={`font-display text-[11px] md:text-xs tracking-[0.2em] uppercase ${sideAccent}`}
          >
            {sideLabel}
          </span>
        </div>
        {laneKDA != null && (
          <span className="text-[8px] md:text-[9px] uppercase tracking-[0.3em] text-rift-mutedbright/70">
            damage share
          </span>
        )}
      </div>
      <div className="space-y-2 md:space-y-2.5">
        {picks.map((id, i) => {
          const c = id != null ? byId.get(id) ?? null : null;
          if (!c) return null;
          const meta = getChampionMeta(c.alias);
          const lane = LANE_ORDER[i];
          const kda = laneKDA?.[lane];
          // Damage share per champion (only shown post-match).
          let damageShare = 0;
          if (laneKDA && meta && kda && totalDamage > 0) {
            damageShare = syntheticDamage(kda, meta) / totalDamage;
          }
          return (
            <ContributionRow
              key={`${c.id}-${i}`}
              champ={c}
              meta={meta}
              lane={lanes[i] ?? lane}
              side={side}
              kda={kda ?? null}
              damageShare={laneKDA ? damageShare : null}
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
  kda,
  damageShare,
}: {
  champ: Champion;
  meta: ChampionMeta | null;
  lane: Lane | null;
  side: Side;
  kda: LaneKDA | null;
  // Null = pre-match; number = 0..1 share of team damage.
  damageShare: number | null;
}) {
  const accent = side === "blue" ? "text-rift-bluebright" : "text-rift-redbright";
  const barCls = side === "blue" ? "bg-rift-blue" : "bg-rift-red";
  const barTrackCls =
    side === "blue" ? "bg-rift-blue/15" : "bg-rift-red/15";
  const sharePct = damageShare != null ? Math.round(damageShare * 100) : null;
  return (
    <div className="flex items-center gap-2.5 md:gap-3">
      <div className="w-10 h-10 md:w-12 md:h-12 flex-shrink-0 border-2 border-rift-line overflow-hidden bg-rift-bg">
        <img
          src={champ.iconUrl}
          alt={champ.name}
          className="w-full h-full object-cover"
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <div className="flex items-center gap-1.5 min-w-0">
            {lane && <LaneIcon lane={lane} size="xs" />}
            <span
              className={`${accent} text-xs md:text-sm font-display tracking-wider truncate`}
            >
              {champ.name}
            </span>
          </div>
          {kda && (
            <span className="text-[10px] md:text-[11px] tabular-nums tracking-tight text-rift-mutedbright flex-shrink-0">
              {/* Fixed KDA palette so colors carry meaning instead of
                  side identity: kills = emerald (good), deaths = red
                  (bad), assists = gold. */}
              <span className="text-emerald-300">{kda.k}</span>
              <span className="text-rift-muted">/</span>
              <span className="text-rift-redbright/80">{kda.d}</span>
              <span className="text-rift-muted">/</span>
              <span className="text-rift-goldbright/85">{kda.a}</span>
            </span>
          )}
        </div>
        {/* Damage-share bar — only post-match. Bar uses the team's accent
            color; track is a faded version. Percentage label sits inside
            the track so we don't waste vertical space. */}
        {sharePct != null ? (
          <div className={`relative h-2.5 ${barTrackCls} rounded-sm`}>
            <div
              className={`h-full ${barCls} rounded-sm transition-all`}
              style={{ width: `${Math.max(2, Math.min(100, sharePct))}%` }}
            />
            <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[8px] tabular-nums text-rift-mutedbright/90 leading-none">
              {sharePct}%
            </span>
          </div>
        ) : meta ? (
          <div className="flex items-center gap-1 flex-wrap">
            <PhasePill phase={meta.phase} />
            {meta.archetypes.slice(0, 3).map((a) => (
              <ArchetypePill key={a} archetype={a} />
            ))}
            <CCPill cc={meta.cc} />
          </div>
        ) : (
          <div className="text-[9px] uppercase tracking-[0.25em] text-rift-muted/70">
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

// Single comparison panel that replaces the prior two-card breakdown. The
// previous layout asked the user to mentally diff two columns of identical
// bars — confusing and slow. This panel shows ONE bar per metric, anchored
// at center, that grows toward the stronger team. Reads like a tug-of-war:
// at a glance the user sees "Blue dominates frontline, Red wins scaling."
//
// Architecture:
//   1. Header: TEAM A : SCORE — VS — SCORE : TEAM B with the leading total
//      enlarged. Plus a 1-line narrative verdict synthesized from the
//      score deltas.
//   2. Composition strip: count chips on each side (AP/AD/Tank/CC/etc.)
//      mirrored around a central "vs" axis.
//   3. Tug-of-war bars: one per stat. Side label + value on each end,
//      centered bar that fills toward the stronger team in that team's
//      accent color. Effectively zero-info-loss vs the old two-card format
//      but immediate to read.
//   4. Side-grouped tags: matchup interactions and synergies shown as
//      pills under each team header at the bottom.

interface ComparisonRow {
  label: string;
  blue: number;
  red: number;
  // Maximum theoretical diff between the two values — used to scale the
  // tug-of-war bar so a small lead doesn't render as a full pull.
  maxDiff: number;
  // Optional helper text shown only when one side is meaningfully ahead.
  tooltip?: string;
}

function buildComparisonRows(
  blue: TeamScore,
  red: TeamScore,
): { label: string; rows: ComparisonRow[] }[] {
  return [
    {
      label: "Composition",
      rows: [
        {
          label: "Damage Balance",
          blue: blue.damageBalance,
          red: red.damageBalance,
          maxDiff: 8,
        },
        {
          label: "Frontline",
          blue: blue.frontline,
          red: red.frontline,
          maxDiff: 6,
        },
        {
          label: "Hard CC",
          blue: blue.ccQuality,
          red: red.ccQuality,
          maxDiff: 5,
        },
        {
          label: "Comp Identity",
          blue: blue.compIdentity,
          red: red.compIdentity,
          maxDiff: 6,
        },
      ],
    },
    {
      label: "Macro Edge",
      rows: [
        {
          label: "Engage",
          blue: blue.engagePresence,
          red: red.engagePresence,
          maxDiff: 9,
        },
        {
          label: "Phase Balance",
          blue: blue.phaseBalance,
          red: red.phaseBalance,
          maxDiff: 5,
        },
        {
          label: "Scaling",
          blue: blue.scalingAdvantage,
          red: red.scalingAdvantage,
          maxDiff: 10,
        },
        {
          label: "Matchup Edge",
          blue: blue.matchupEdge,
          red: red.matchupEdge,
          maxDiff: 8,
        },
      ],
    },
    {
      label: "Synergy",
      rows: [
        {
          label: "Pair Synergies",
          blue: blue.synergyBonus,
          red: red.synergyBonus,
          maxDiff: 6,
        },
        {
          label: "Lane Synergy",
          blue: blue.laneSynergy,
          red: red.laneSynergy,
          maxDiff: 4,
        },
      ],
    },
  ];
}

// Synthesize a 1-2 line narrative verdict from the score deltas. Picks the
// 1-2 most decisive differences and phrases them naturally. Keeps it short
// — this is a tagline, not an essay.
function buildVerdict(
  blueName: string,
  redName: string,
  blue: TeamScore,
  red: TeamScore,
): string[] {
  const lines: string[] = [];
  const totalDiff = blue.total - red.total;
  const ahead = totalDiff > 0 ? blueName : redName;
  const behind = totalDiff > 0 ? redName : blueName;
  if (Math.abs(totalDiff) > 12) {
    lines.push(`${ahead} clearly favored on draft strength.`);
  } else if (Math.abs(totalDiff) > 5) {
    lines.push(`${ahead} edges the draft, but ${behind} can play to its strengths.`);
  } else {
    lines.push("Drafts roughly even — the game will be decided in-game.");
  }
  // Find the single most-decisive metric difference.
  type Diff = { metric: string; delta: number; favors: string };
  const diffs: Diff[] = [
    { metric: "scaling", delta: blue.scalingAdvantage - red.scalingAdvantage, favors: "" },
    { metric: "frontline", delta: blue.frontline - red.frontline, favors: "" },
    { metric: "engage presence", delta: blue.engagePresence - red.engagePresence, favors: "" },
    { metric: "hard CC", delta: blue.ccQuality - red.ccQuality, favors: "" },
    { metric: "phase tempo", delta: blue.phaseBalance - red.phaseBalance, favors: "" },
  ];
  for (const d of diffs) d.favors = d.delta > 0 ? blueName : redName;
  diffs.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const top = diffs[0];
  if (top && Math.abs(top.delta) >= 2) {
    lines.push(`${top.favors} wins ${top.metric}.`);
  }
  return lines;
}

// Identity scouting panel — surfaces the strategic playstyle data for both
// teams' comp identities (loaded from IDENTITY_PROFILES) plus an identity-
// vs-identity matchup line. Reads as a broadcast pre-fight scout: "Blue is
// running Wombo Combo (wants 5v5 fights, weak to disengage); Red is running
// Pick Comp (wants single catches). Pick Comp edges Wombo Combo here."
function IdentityScoutingPanel({
  blueName,
  redName,
  blueIdentity,
  redIdentity,
}: {
  blueName: string;
  redName: string;
  blueIdentity: string | null;
  redIdentity: string | null;
}) {
  const blueProfile = getIdentityProfile(blueIdentity);
  const redProfile = getIdentityProfile(redIdentity);
  // If neither side has a recognized identity, hide the panel — it would
  // just be empty boxes.
  if (!blueProfile && !redProfile) return null;
  const matchup = identityMatchupEdge(blueIdentity, redIdentity);
  // Color the matchup line by who's favored.
  const matchupCls =
    matchup.edge >= 0.5
      ? "text-rift-bluebright"
      : matchup.edge <= -0.5
      ? "text-rift-redbright"
      : "text-rift-mutedbright";
  return (
    <div>
      <div className="text-[9px] md:text-[10px] uppercase tracking-[0.4em] text-rift-gold/55 mb-2 text-center">
        Scouting Report
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-3">
        <ScoutingCard side="blue" name={blueName} profile={blueProfile} />
        <ScoutingCard side="red" name={redName} profile={redProfile} />
      </div>
      {/* Identity matchup verdict — only shown when both sides have a
          recognized identity, since that's when the matrix has a real
          edge value. */}
      {blueProfile && redProfile && (
        <div className="mt-3 px-3 py-2 border border-rift-gold/30 bg-rift-bg/50 text-center">
          <div className="text-[8px] md:text-[9px] uppercase tracking-[0.4em] text-rift-mutedbright/60 mb-0.5">
            Identity Matchup
          </div>
          <div className={`text-[11px] md:text-xs font-display tracking-[0.1em] ${matchupCls}`}>
            {matchup.phrase}
          </div>
        </div>
      )}
    </div>
  );
}

// One scouting card per team. Renders the comp identity name as a header,
// then the tagline, win condition, and weakness. Compact but rich — every
// line conveys one strategic concept.
function ScoutingCard({
  side,
  name,
  profile,
}: {
  side: Side;
  name: string;
  profile: IdentityProfile | null;
}) {
  const sideAccent =
    side === "blue" ? "text-rift-bluebright" : "text-rift-redbright";
  const sideBorder =
    side === "blue" ? "border-rift-blue/40" : "border-rift-red/40";
  const sideBg =
    side === "blue" ? "bg-rift-blue/5" : "bg-rift-red/5";
  if (!profile) {
    return (
      <div className={`border ${sideBorder} ${sideBg} p-3`}>
        <div
          className={`text-[10px] md:text-[11px] font-display uppercase tracking-[0.25em] ${sideAccent} mb-1 truncate`}
        >
          {name}
        </div>
        <div className="text-[10px] md:text-[11px] text-rift-mutedbright/60 italic">
          No clear identity — flex draft
        </div>
      </div>
    );
  }
  return (
    <div className={`border ${sideBorder} ${sideBg} p-3 space-y-1.5`}>
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <span
          className={`text-[10px] md:text-[11px] font-display uppercase tracking-[0.25em] ${sideAccent} truncate`}
        >
          {name}
        </span>
        <span className="text-[8px] uppercase tracking-[0.3em] text-rift-mutedbright/55 flex-shrink-0">
          peaks {profile.peakMinutes.min}–{profile.peakMinutes.max}'
        </span>
      </div>
      <div className="text-[11px] md:text-xs font-display tracking-[0.1em] text-rift-goldbright">
        {profile.label}
      </div>
      <div className="text-[10px] md:text-[11px] text-rift-mutedbright/85 italic leading-snug">
        {profile.tagline}
      </div>
      <div className="pt-1 border-t border-rift-line/30 space-y-1">
        <div className="text-[9px] md:text-[10px] leading-snug">
          <span className="uppercase tracking-[0.2em] text-rift-goldbright/70 mr-1">
            Wants:
          </span>
          <span className="text-rift-mutedbright/85">{profile.winCondition}</span>
        </div>
        <div className="text-[9px] md:text-[10px] leading-snug">
          <span className="uppercase tracking-[0.2em] text-rift-redbright/70 mr-1">
            Weak to:
          </span>
          <span className="text-rift-mutedbright/85">{profile.weakness}</span>
        </div>
      </div>
    </div>
  );
}

function TeamComparison({
  blueName,
  redName,
  blueScore,
  redScore,
}: {
  blueName: string;
  redName: string;
  blueScore: TeamScore;
  redScore: TeamScore;
}) {
  const sections = useMemo(
    () => buildComparisonRows(blueScore, redScore),
    [blueScore, redScore],
  );
  const verdict = useMemo(
    () => buildVerdict(blueName, redName, blueScore, redScore),
    [blueName, redName, blueScore, redScore],
  );
  const totalDiff = blueScore.total - redScore.total;
  const blueAhead = totalDiff > 0;
  const redAhead = totalDiff < 0;

  // Composition chips — same data points as before, displayed mirrored
  // (blue right-aligned, red left-aligned) so the eye reads them as
  // facing each other across the central axis.
  const compRows: {
    label: string;
    blue: number;
    red: number;
    color: string;
  }[] = [
    { label: "AP", blue: blueScore.apCount, red: redScore.apCount, color: "text-rift-mage" },
    { label: "AD", blue: blueScore.adCount, red: redScore.adCount, color: "text-rift-marksman" },
    { label: "Tank", blue: blueScore.frontCount, red: redScore.frontCount, color: "text-rift-tank" },
    { label: "Hard CC", blue: blueScore.hardCcCount, red: redScore.hardCcCount, color: "text-rift-goldbright" },
    { label: "Late", blue: blueScore.lateCount, red: redScore.lateCount, color: "text-rift-mage" },
    { label: "Early", blue: blueScore.earlyCount, red: redScore.earlyCount, color: "text-rift-marksman" },
  ];

  return (
    <div className="border-2 border-rift-gold/40 bg-rift-panel/50">
      {/* ─── Header: team identity strip with totals ──────────────── */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-3 border-b border-rift-line/50 bg-gradient-to-r from-rift-bluedeep/15 via-rift-bg/40 to-rift-reddeep/15">
        <div className="flex items-center justify-end gap-3 min-w-0">
          <div className="text-right min-w-0">
            <div
              className={`font-display text-sm md:text-base uppercase tracking-[0.25em] truncate ${
                blueAhead ? "text-rift-bluebright" : "text-rift-mutedbright/85"
              }`}
            >
              {blueName}
            </div>
            <div className="text-[9px] uppercase tracking-[0.3em] text-rift-mutedbright/55">
              Blue Side
            </div>
          </div>
          <div
            className={`font-display tabular-nums tracking-tight ${
              blueAhead
                ? "text-3xl md:text-4xl text-rift-bluebright"
                : "text-2xl md:text-3xl text-rift-mutedbright/70"
            }`}
          >
            {blueScore.total}
          </div>
        </div>
        <div className="flex flex-col items-center px-2 md:px-3">
          <span className="text-[9px] md:text-[10px] uppercase tracking-[0.4em] text-rift-gold/70">
            VS
          </span>
          {totalDiff !== 0 && (
            <span className="text-[9px] md:text-[10px] tabular-nums tracking-[0.15em] text-rift-goldbright/70 font-display mt-0.5">
              {blueAhead ? "+" : "−"}
              {Math.abs(totalDiff)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`font-display tabular-nums tracking-tight ${
              redAhead
                ? "text-3xl md:text-4xl text-rift-redbright"
                : "text-2xl md:text-3xl text-rift-mutedbright/70"
            }`}
          >
            {redScore.total}
          </div>
          <div className="min-w-0">
            <div
              className={`font-display text-sm md:text-base uppercase tracking-[0.25em] truncate ${
                redAhead ? "text-rift-redbright" : "text-rift-mutedbright/85"
              }`}
            >
              {redName}
            </div>
            <div className="text-[9px] uppercase tracking-[0.3em] text-rift-mutedbright/55">
              Red Side
            </div>
          </div>
        </div>
      </div>

      {/* ─── Verdict ──────────────────────────────────────────────── */}
      <div className="px-4 py-2.5 border-b border-rift-line/30 text-center">
        {verdict.map((line, i) => (
          <div
            key={i}
            className={`text-[11px] md:text-xs tracking-[0.05em] ${
              i === 0 ? "text-rift-goldbright" : "text-rift-mutedbright/85"
            }`}
          >
            {line}
          </div>
        ))}
      </div>

      <div className="p-3 md:p-5 space-y-5">
        {/* ─── Identity scouting reports + matchup line ──────────── */}
        <IdentityScoutingPanel
          blueName={blueName}
          redName={redName}
          blueIdentity={blueScore.identityLabel}
          redIdentity={redScore.identityLabel}
        />

        {/* ─── Composition mirror ────────────────────────────────── */}
        <div>
          <div className="text-[9px] md:text-[10px] uppercase tracking-[0.4em] text-rift-gold/55 mb-2 text-center">
            Composition Snapshot
          </div>
          <div className="space-y-1">
            {compRows.map((c) => {
              const diff = c.blue - c.red;
              const blueWins = diff > 0;
              const redWins = diff < 0;
              return (
                <div
                  key={c.label}
                  className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-[11px] md:text-xs"
                >
                  <div
                    className={`text-right font-display tabular-nums tracking-tight ${
                      blueWins ? c.color : "text-rift-mutedbright/55"
                    }`}
                  >
                    {c.blue}
                  </div>
                  <div className="text-[9px] md:text-[10px] uppercase tracking-[0.25em] text-rift-mutedbright/70 text-center min-w-[5.5rem] md:min-w-[7rem]">
                    {c.label}
                  </div>
                  <div
                    className={`font-display tabular-nums tracking-tight ${
                      redWins ? c.color : "text-rift-mutedbright/55"
                    }`}
                  >
                    {c.red}
                  </div>
                </div>
              );
            })}
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-[11px] md:text-xs">
              <div
                className={`text-right font-display tabular-nums ${
                  blueScore.highMobCount > redScore.highMobCount
                    ? "text-rift-bluebright"
                    : "text-rift-mutedbright/55"
                }`}
              >
                {blueScore.highMobCount}
                <span className="text-rift-muted/60 text-[9px] mx-0.5">/</span>
                <span className="text-rift-mutedbright/70 text-[10px]">
                  {blueScore.lowMobCount}
                </span>
              </div>
              <div className="text-[9px] uppercase tracking-[0.25em] text-rift-mutedbright/70 text-center min-w-[5.5rem] md:min-w-[7rem]">
                Mobility
              </div>
              <div
                className={`font-display tabular-nums ${
                  redScore.highMobCount > blueScore.highMobCount
                    ? "text-rift-redbright"
                    : "text-rift-mutedbright/55"
                }`}
              >
                {redScore.highMobCount}
                <span className="text-rift-muted/60 text-[9px] mx-0.5">/</span>
                <span className="text-rift-mutedbright/70 text-[10px]">
                  {redScore.lowMobCount}
                </span>
              </div>
            </div>
          </div>
          <div className="text-[8px] uppercase tracking-[0.3em] text-rift-mutedbright/40 text-center mt-1.5">
            Mobility shows high-mobility / low-mobility champions
          </div>
        </div>

        {/* ─── Tug-of-war metric bars ────────────────────────────── */}
        {sections.map((section) => (
          <div key={section.label}>
            <div className="text-[9px] md:text-[10px] uppercase tracking-[0.4em] text-rift-gold/55 mb-2">
              {section.label}
            </div>
            <div className="space-y-2">
              {section.rows.map((row) => (
                <TugOfWarRow key={row.label} row={row} />
              ))}
            </div>
          </div>
        ))}

        {/* ─── Tags grouped by side ──────────────────────────────── */}
        {(blueScore.matchupTags.length > 0 ||
          redScore.matchupTags.length > 0 ||
          blueScore.synergyTags.length > 0 ||
          redScore.synergyTags.length > 0) && (
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-rift-line/40">
            <SideTagColumn
              side="blue"
              name={blueName}
              matchupTags={blueScore.matchupTags}
              synergyTags={blueScore.synergyTags}
            />
            <SideTagColumn
              side="red"
              name={redName}
              matchupTags={redScore.matchupTags}
              synergyTags={redScore.synergyTags}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// One tug-of-war row. The bar is anchored at the center; a positive diff
// (blue ahead) fills LEFT in blue, a negative diff fills RIGHT in red. The
// magnitude of the fill scales by `|diff| / maxDiff` so a 1-point lead
// looks like a small pull and a 5-point lead looks decisive. Each side's
// numeric value sits at the outer edge in the team accent color (faded
// when that team is behind).
function TugOfWarRow({ row }: { row: ComparisonRow }) {
  const diff = row.blue - row.red;
  const blueAhead = diff > 0;
  const redAhead = diff < 0;
  // Bar fill width as a percent of the half-bar (50% max).
  const fillPct = Math.min(50, (Math.abs(diff) / row.maxDiff) * 100);
  // Show the values with a sign when either side has a negative number,
  // so the user understands "engage = -2" is a real outcome.
  const showSign = row.blue < 0 || row.red < 0;
  const fmt = (n: number): string =>
    showSign && n > 0 ? `+${n}` : `${n}`;
  return (
    <div className="grid grid-cols-[2.5rem_1fr_2.5rem] md:grid-cols-[3rem_1fr_3rem] items-center gap-2 md:gap-3">
      {/* Blue value */}
      <div
        className={`text-right font-display tabular-nums text-sm md:text-base tracking-tight ${
          blueAhead
            ? "text-rift-bluebright"
            : redAhead
            ? "text-rift-mutedbright/45"
            : "text-rift-mutedbright/70"
        }`}
      >
        {fmt(row.blue)}
      </div>

      {/* Center bar with metric label above */}
      <div className="flex flex-col gap-0.5">
        <div className="text-[9px] md:text-[10px] uppercase tracking-[0.2em] text-rift-mutedbright/70 text-center">
          {row.label}
        </div>
        <div className="relative h-2 bg-rift-bg/80 rounded-sm overflow-hidden">
          {/* Center divider */}
          <div
            className="absolute top-0 bottom-0 w-px bg-rift-mutedbright/40 z-10"
            style={{ left: "50%" }}
            aria-hidden
          />
          {/* Blue side fill (grows leftward from center) */}
          {blueAhead && (
            <div
              className="absolute top-0 bottom-0 right-1/2 bg-rift-blue rounded-l-sm"
              style={{ width: `${fillPct}%` }}
            />
          )}
          {/* Red side fill (grows rightward from center) */}
          {redAhead && (
            <div
              className="absolute top-0 bottom-0 left-1/2 bg-rift-red rounded-r-sm"
              style={{ width: `${fillPct}%` }}
            />
          )}
        </div>
      </div>

      {/* Red value */}
      <div
        className={`font-display tabular-nums text-sm md:text-base tracking-tight ${
          redAhead
            ? "text-rift-redbright"
            : blueAhead
            ? "text-rift-mutedbright/45"
            : "text-rift-mutedbright/70"
        }`}
      >
        {fmt(row.red)}
      </div>
    </div>
  );
}

// One column of side-specific tags (matchup edges + synergies). Used in
// the bottom row of the comparison panel so each side's flavor cluster
// stays visually attached to its accent color.
function SideTagColumn({
  side,
  name,
  matchupTags,
  synergyTags,
}: {
  side: Side;
  name: string;
  matchupTags: string[];
  synergyTags: string[];
}) {
  const headerCls =
    side === "blue" ? "text-rift-bluebright" : "text-rift-redbright";
  return (
    <div>
      <div
        className={`text-[9px] md:text-[10px] uppercase tracking-[0.3em] mb-1.5 truncate font-display ${headerCls}`}
      >
        {name}
      </div>
      <div className="flex flex-wrap gap-1">
        {matchupTags.map((tag) => {
          const isPositive = POSITIVE_MATCHUP_TAGS.has(tag);
          const cls = isPositive
            ? "border-rift-gold/50 text-rift-goldbright bg-rift-gold/10"
            : "border-rift-red/50 text-rift-redbright bg-rift-red/10";
          return (
            <span
              key={tag}
              className={`inline-flex items-center gap-1 text-[9px] md:text-[10px] uppercase tracking-[0.15em] px-1.5 py-0.5 border ${cls}`}
            >
              <span className="text-[8px]">{isPositive ? "▲" : "▼"}</span>
              {tag}
            </span>
          );
        })}
        {synergyTags.map((tag, i) => (
          <span
            key={`${tag}-${i}`}
            className="inline-flex items-center gap-1 text-[9px] md:text-[10px] uppercase tracking-[0.15em] px-1.5 py-0.5 border border-rift-gold/50 bg-gradient-to-r from-rift-gold/15 to-rift-gold/5 text-rift-goldbright"
          >
            <span className="text-[8px]">★</span>
            {tag}
          </span>
        ))}
        {matchupTags.length === 0 && synergyTags.length === 0 && (
          <span className="text-[9px] uppercase tracking-[0.25em] text-rift-mutedbright/40 italic">
            No notable interactions
          </span>
        )}
      </div>
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
