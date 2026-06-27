"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";

import { useDraftStore } from "@/store/draftStore";
import { currentGame, maxGames, seriesScore, starRatingBias } from "@/lib/series";
import {
  buildGameRecap,
  simulateMatch,
  type SimulationResult,
} from "@/lib/matchSimulator";
import type { Champion, Side } from "@/lib/types";
import AIRationaleHistory from "./AIRationaleHistory";
import TeamName from "./TeamName";
import TierListView from "./TierListView";
import SynergyView from "./SynergyView";
import Modal from "./Modal";

import { CompletedSide, StrategyRecap, WinnerButton } from "./betweenGames/CompletedSide";
import { SimulationPanel } from "./betweenGames/playback/SimulationPanel";

interface Props {
  champions: Champion[];
}

export default function BetweenGamesView({ champions }: Props) {
  const series = useDraftStore((s) => s.series)!;
  const declareWinner = useDraftStore((s) => s.declareWinner);
  const proceedToNextGame = useDraftStore((s) => s.proceedToNextGame);
  const chooseSide = useDraftStore((s) => s.chooseSide);
  const sideChoicePending = useDraftStore((s) => s.sideChoicePending);
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
  const tournament = useDraftStore((s) => s.tournament);
  const playerForms = useDraftStore((s) => s.playerForms);
  const LANES = ["top", "jungle", "middle", "bottom", "support"] as const;

  const simOptions = useMemo(() => {
    // Determine team keys for form lookup (tournament uses team id; single-
    // series uses team name).
    const game = currentGame(series);
    const blueKey = tournament
      ? (tournament.teams.find((t) => t.name === game.blueTeam)?.id ?? game.blueTeam)
      : game.blueTeam;
    const redKey = tournament
      ? (tournament.teams.find((t) => t.name === game.redTeam)?.id ?? game.redTeam)
      : game.redTeam;
    // Inline sideFormsFor to avoid extra import (it's trivially small).
    const sideFormsFor = (key: string) => {
      const out: Partial<Record<string, number>> = {};
      for (const lane of LANES) {
        const v = playerForms[`${key}:${lane}`];
        if (typeof v === "number") out[lane] = v;
      }
      return out;
    };
    return {
      scoreBias: starRatingBias(series),
      bluePlayers: series.bluePlayers,
      redPlayers: series.redPlayers,
      playerForms: {
        blue: sideFormsFor(blueKey) as import("@/lib/playerForm").SideForms,
        red: sideFormsFor(redKey) as import("@/lib/playerForm").SideForms,
      },
      adaptiveMidgame: true,
      // Interactive single-match view: estimate the pregame win % by Monte-
      // Carlo over the ACTUAL causal sim (snowball, objective fight edge, comp
      // pursuit) rather than the analytic approximation. Cheap for one game;
      // bulk/season auto-resolve never sets this so it stays fast.
      forecastSamples: 160,
    };
  }, [series, tournament, playerForms]);

  // Pre-compute lane-ordered form arrays for the SimulationPanel contribution view.
  const sideForms = useMemo(() => {
    const game = currentGame(series);
    const blueKey = tournament
      ? (tournament.teams.find((t) => t.name === game.blueTeam)?.id ?? game.blueTeam)
      : game.blueTeam;
    const redKey = tournament
      ? (tournament.teams.find((t) => t.name === game.redTeam)?.id ?? game.redTeam)
      : game.redTeam;
    const toArr = (key: string): number[] | undefined => {
      const vals = LANES.map((l) => playerForms[`${key}:${l}`]);
      // Only return array if at least one lane has form data.
      if (vals.every((v) => v == null)) return undefined;
      return vals.map((v) => (typeof v === "number" ? v : 0));
    };
    return { blue: toArr(blueKey), red: toArr(redKey) };
  }, [series, tournament, playerForms]);

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
    const recap = buildGameRecap(
      game,
      champions,
      simResult,
      series.bluePlayers,
      series.redPlayers,
    );
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
                  <TeamName
                    name={game.winner === "blue" ? series.blueTeam : series.redTeam}
                    size={40}
                  />
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

        {/* Side choice panel — shown when loser-picks rule is active and
            the human team is the chooser. Replaces the next-game control
            until the choice is made. Defensive: also catches the edge case
            where sideChoicePending is true but no chooser is set. */}
        {sideChoicePending && series.sideChooser && (
          <div className="bg-fade mb-4">
            <SideChoicePanel
              chooserName={series.sideChooser}
              nextGameNumber={series.games.length + 1}
              onChoose={chooseSide}
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
              blueForms={sideForms.blue}
              redForms={sideForms.red}
              bluePlayerNames={series.bluePlayers?.map((p) => p.name ?? null)}
              redPlayerNames={series.redPlayers?.map((p) => p.name ?? null)}
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
            {!isSeriesOver && hasNextGame && !sideChoicePending && (
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
                      <TeamName name={swapSides ? series.redTeam : series.blueTeam} size={14} />
                    </span>
                    <span className="mx-2">→ Blue · Red ←</span>
                    <span className="text-rift-red">
                      <TeamName name={swapSides ? series.blueTeam : series.redTeam} size={14} />
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
            {/* Waiting for loser-picks choice (AI-controlled chooser resolves
                automatically, but show a pulse so the user sees the system
                is working rather than appearing stuck). */}
            {!isSeriesOver && hasNextGame && sideChoicePending && !series.sideChooser && (
              <div className="w-full py-3 border border-rift-line/50 text-center text-[10px] uppercase tracking-[0.3em] text-rift-muted animate-pulse">
                Resolving side choice...
              </div>
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

// ─── SideChoicePanel ────────────────────────────────────────────────────────

function SideChoicePanel({
  chooserName,
  nextGameNumber,
  onChoose,
}: {
  chooserName: string;
  nextGameNumber: number;
  onChoose: (side: "blue" | "red") => void;
}) {
  return (
    <div className="border border-rift-gold/50 bg-rift-gold/5 p-4 md:p-6 text-center">
      {/* Ornamental corners */}
      <span className="absolute -top-1 -left-1 w-2 h-2 rotate-45 bg-rift-gold hidden" aria-hidden />
      <div className="text-[10px] uppercase tracking-[0.45em] text-rift-gold/70 mb-2">
        Loser Picks Side
      </div>
      <div className="font-display text-xl md:text-2xl text-rift-goldbright tracking-wider mb-1">
        <span className="text-rift-gold">
          <TeamName name={chooserName} size={20} />
        </span>
        <span className="text-rift-goldbright/80">, choose your side for Game {nextGameNumber}</span>
      </div>
      <div className="text-[10px] uppercase tracking-[0.3em] text-rift-muted mb-5">
        Blue = first pick · Red = last pick
      </div>
      <div className="grid grid-cols-2 gap-3 max-w-sm mx-auto">
        <button
          type="button"
          onClick={() => onChoose("blue")}
          className="group relative py-4 md:py-5 border border-rift-blue bg-rift-blue/10 hover:bg-rift-blue/20 text-rift-bluebright font-display text-base md:text-lg tracking-[0.3em] uppercase transition-all overflow-hidden"
        >
          <span className="pointer-events-none absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out bg-gradient-to-r from-transparent via-rift-blue/15 to-transparent" />
          <span className="relative">Blue Side</span>
          <div className="text-[9px] uppercase tracking-[0.2em] text-rift-bluebright/60 mt-1 normal-case font-sans">
            First pick
          </div>
        </button>
        <button
          type="button"
          onClick={() => onChoose("red")}
          className="group relative py-4 md:py-5 border border-rift-red bg-rift-red/10 hover:bg-rift-red/20 text-rift-redbright font-display text-base md:text-lg tracking-[0.3em] uppercase transition-all overflow-hidden"
        >
          <span className="pointer-events-none absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out bg-gradient-to-r from-transparent via-rift-red/15 to-transparent" />
          <span className="relative">Red Side</span>
          <div className="text-[9px] uppercase tracking-[0.2em] text-rift-redbright/60 mt-1 normal-case font-sans">
            Last pick
          </div>
        </button>
      </div>
    </div>
  );
}
