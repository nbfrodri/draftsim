"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { useDraftStore } from "@/store/draftStore";
import { currentGame, requiredWins, seriesScore, winsByTeamName } from "@/lib/series";
import {
  chooseAIStrategyForGame,
  fitTier,
  recommendStrategy,
  strategyFit,
  strategyRationale,
  STRATEGY_GROUP_ORDER,
  STRATEGY_LEVERS,
  type FitTier,
  type PriorGameSummary,
  type TeamStrategy,
} from "@/lib/sim/strategies";
import type { Champion, Lane, Side } from "@/lib/types";
import LaneIcon from "./LaneIcon";
import TeamName from "./TeamName";
import Modal from "./Modal";

interface Props {
  champions: Champion[];
}

// Picks are stored in positional lane order after the draft finalizes roles,
// so slot index lines up 1:1 with this order.
const LANE_ORDER: readonly Lane[] = [
  "top",
  "jungle",
  "middle",
  "bottom",
  "support",
];

// Which sides the AI controls — mirrors the store's isAISide. AI sides get an
// auto-picked, read-only plan; human sides get editable levers.
function aiControlsSide(
  mode: "pvp" | "pvai" | "aivai",
  aiSide: Side | null,
  side: Side,
): boolean {
  if (mode === "aivai") return true;
  if (mode === "pvai") return aiSide === side;
  return false;
}

export default function StrategyView({ champions }: Props) {
  const series = useDraftStore((s) => s.series)!;
  const confirmStrategies = useDraftStore((s) => s.confirmStrategies);
  const resetAll = useDraftStore((s) => s.resetAll);
  const [exitOpen, setExitOpen] = useState(false);

  const game = currentGame(series);
  const score = seriesScore(series);

  const byId = useMemo(
    () => new Map(champions.map((c) => [c.id, c])),
    [champions],
  );
  const toChamps = useMemo(
    () => (ids: (number | null)[]) =>
      ids.map((id) => (id != null ? byId.get(id) ?? null : null)),
    [byId],
  );

  const bluePicks = useMemo(() => toChamps(game.bluePicks), [toChamps, game.bluePicks]);
  const redPicks = useMemo(() => toChamps(game.redPicks), [toChamps, game.redPicks]);

  // The single "ideal" plan — drives the ◆ suggested markers on human sides.
  const blueRec = useMemo(() => recommendStrategy(bluePicks), [bluePicks]);
  const redRec = useMemo(() => recommendStrategy(redPicks), [redPicks]);

  const blueIsAI = aiControlsSide(series.mode, series.aiSide, "blue");
  const redIsAI = aiControlsSide(series.mode, series.aiSide, "red");
  const gamesToWin = requiredWins(series.format);

  // Initial plan per side, rolled ONCE (lazy initializer): AI sides get the
  // varied, context-aware, series-adaptive plan (adapts to enemy draft +
  // roster + scoreline + how the team's prior games went); human sides start
  // from the stable recommendation. AI controls are read-only so their state
  // never changes after this.
  const [blueStrategy, setBlueStrategy] = useState<TeamStrategy>(() => {
    if (!blueIsAI) return blueRec;
    // Build prior-game history for the blue team (follows team by name across
    // side swaps). Skips the current game (last in the array).
    const wins = winsByTeamName(series);
    const priorGames: PriorGameSummary[] = (series.games
      .slice(0, -1)
      .filter((g) => g.winner != null)
      .map((g): PriorGameSummary | null => {
        const blueWasBlue = g.blueTeam === series.blueTeam;
        const side = blueWasBlue ? "blue" : "red";
        const won = g.winner === side;
        const strat = blueWasBlue ? g.blueStrategy : g.redStrategy;
        if (!strat) return null;
        const oppStrat = blueWasBlue ? g.redStrategy : g.blueStrategy;
        const finalGold = g.recap?.goldLeadTimeline?.at(-1)?.goldLead ?? null;
        const goldDiff = finalGold != null ? (blueWasBlue ? finalGold : -finalGold) : undefined;
        const entry: PriorGameSummary = {
          strategy: strat,
          won,
          opponentName: series.redTeam,
        };
        if (goldDiff != null) entry.goldDiff = goldDiff;
        if (goldDiff != null) entry.stomp = Math.abs(goldDiff) >= 7000;
        if (g.recap?.durationMinutes != null) entry.durationMinutes = g.recap.durationMinutes;
        if (oppStrat) entry.opponentStrategy = oppStrat;
        return entry;
      })
      .filter((g) => g != null)) as PriorGameSummary[];
    return chooseAIStrategyForGame({
      picks: bluePicks,
      context: {
        enemyPicks: redPicks,
        roster: series.bluePlayers,
        enemyRoster: series.redPlayers,
        selfWins: wins.get(series.blueTeam) ?? score.blue,
        oppWins: wins.get(series.redTeam) ?? score.red,
        gamesToWin,
        rng: Math.random,
      },
      priorGames,
      opponentName: series.redTeam,
      rng: Math.random,
    });
  });
  const [redStrategy, setRedStrategy] = useState<TeamStrategy>(() => {
    if (!redIsAI) return redRec;
    const wins = winsByTeamName(series);
    const priorGames: PriorGameSummary[] = (series.games
      .slice(0, -1)
      .filter((g) => g.winner != null)
      .map((g): PriorGameSummary | null => {
        const redWasRed = g.redTeam === series.redTeam;
        const side = redWasRed ? "red" : "blue";
        const won = g.winner === side;
        const strat = redWasRed ? g.redStrategy : g.blueStrategy;
        if (!strat) return null;
        const oppStrat = redWasRed ? g.blueStrategy : g.redStrategy;
        const finalGold = g.recap?.goldLeadTimeline?.at(-1)?.goldLead ?? null;
        const goldDiff = finalGold != null ? (redWasRed ? -finalGold : finalGold) : undefined;
        const entry: PriorGameSummary = {
          strategy: strat,
          won,
          opponentName: series.blueTeam,
        };
        if (goldDiff != null) entry.goldDiff = goldDiff;
        if (goldDiff != null) entry.stomp = Math.abs(goldDiff) >= 7000;
        if (g.recap?.durationMinutes != null) entry.durationMinutes = g.recap.durationMinutes;
        if (oppStrat) entry.opponentStrategy = oppStrat;
        return entry;
      })
      .filter((g) => g != null)) as PriorGameSummary[];
    return chooseAIStrategyForGame({
      picks: redPicks,
      context: {
        enemyPicks: bluePicks,
        roster: series.redPlayers,
        enemyRoster: series.bluePlayers,
        selfWins: wins.get(series.redTeam) ?? score.red,
        oppWins: wins.get(series.blueTeam) ?? score.blue,
        gamesToWin,
        rng: Math.random,
      },
      priorGames,
      opponentName: series.blueTeam,
      rng: Math.random,
    });
  });

  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!rootRef.current) return;
    const ctx = gsap.context(() => {
      gsap.from(".sv-stagger", {
        opacity: 0,
        y: 18,
        duration: 0.6,
        stagger: 0.07,
        ease: "power3.out",
      });
    }, rootRef);
    return () => ctx.revert();
  }, []);

  const handleConfirm = () => {
    confirmStrategies(blueStrategy, redStrategy);
  };

  return (
    <div
      ref={rootRef}
      className="min-h-[100svh] overflow-y-auto flex items-start justify-center px-4 py-8 md:py-12 relative"
    >
      {/* Main-menu escape hatch — abandoning here loses series progress. */}
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
        <div className="sv-stagger text-center mb-6 md:mb-8">
          <div className="text-[10px] md:text-xs uppercase tracking-[0.5em] text-rift-gold/70">
            War Room · Game {game.gameNumber}
          </div>
          <h1 className="mt-2 font-display text-3xl md:text-5xl tracking-[0.12em] text-rift-goldbright">
            <span className="bg-gold-sheen bg-clip-text text-transparent">
              STRATEGY
            </span>
          </h1>
          <div className="ornament mt-4 max-w-md mx-auto">
            <span className="text-[10px] tracking-[0.4em] text-rift-gold/60 uppercase">
              {series.format.toUpperCase()} · Series {score.blue} — {score.red}
            </span>
          </div>
          <div className="mt-3 text-[11px] md:text-xs text-rift-mutedbright">
            Set each team&apos;s game plan before the match simulates. Plans that
            fit your comp give an edge; mismatched plans backfire.
          </div>
        </div>

        <div className="sv-stagger grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4 mb-6">
          <TeamStrategyColumn
            side="blue"
            name={series.blueTeam}
            picks={bluePicks}
            roles={game.blueRoles}
            isAI={blueIsAI}
            strategy={blueStrategy}
            recommended={blueRec}
            rationale={strategyRationale(bluePicks)}
            onChange={(key, value) =>
              setBlueStrategy((s) => ({ ...s, [key]: value }))
            }
            onResetToSuggested={() => setBlueStrategy(blueRec)}
          />
          <TeamStrategyColumn
            side="red"
            name={series.redTeam}
            picks={redPicks}
            roles={game.redRoles}
            isAI={redIsAI}
            strategy={redStrategy}
            recommended={redRec}
            rationale={strategyRationale(redPicks)}
            onChange={(key, value) =>
              setRedStrategy((s) => ({ ...s, [key]: value }))
            }
            onResetToSuggested={() => setRedStrategy(redRec)}
          />
        </div>

        <div className="sv-stagger">
          <button
            type="button"
            onClick={handleConfirm}
            className="btn-gold w-full py-4 md:py-5 font-display text-base md:text-lg tracking-[0.3em] md:tracking-[0.4em]"
          >
            CONFIRM STRATEGY → SIMULATE
          </button>
        </div>
      </div>

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

function TeamStrategyColumn({
  side,
  name,
  picks,
  roles,
  isAI,
  strategy,
  recommended,
  rationale,
  onChange,
  onResetToSuggested,
}: {
  side: Side;
  name: string;
  picks: (Champion | null)[];
  roles: (Lane | null)[];
  isAI: boolean;
  strategy: TeamStrategy;
  recommended: TeamStrategy;
  rationale: string;
  onChange: (key: keyof TeamStrategy, value: string) => void;
  onResetToSuggested: () => void;
}) {
  const text = side === "blue" ? "text-rift-blue" : "text-rift-red";
  const border = side === "blue" ? "border-rift-blue/40" : "border-rift-red/40";
  const bgGrad =
    side === "blue"
      ? "from-rift-bluedeep/20 to-transparent"
      : "from-rift-reddeep/20 to-transparent";

  return (
    <div
      className={`relative border ${border} bg-gradient-to-br ${bgGrad} bg-rift-panel/40 p-4 md:p-5`}
    >
      <div className="flex items-center justify-between mb-3">
        <div
          className={`font-display ${text} uppercase tracking-[0.25em] truncate text-sm md:text-base`}
        >
          <TeamName name={name} size={18} />
        </div>
        {isAI ? (
          <span className="px-2 py-0.5 border border-rift-gold/50 bg-rift-gold/10 text-rift-goldbright text-[8px] md:text-[9px] uppercase tracking-[0.3em]">
            AI Plan
          </span>
        ) : (
          <button
            type="button"
            onClick={onResetToSuggested}
            className="text-[8px] md:text-[9px] uppercase tracking-[0.3em] text-rift-mutedbright/70 hover:text-rift-goldbright transition-colors"
          >
            Use Suggested
          </button>
        )}
      </div>

      {/* Drafted comp — picks in lane order. */}
      <div className="grid grid-cols-5 gap-1.5 mb-2">
        {picks.map((c, i) => {
          const lane = roles[i] ?? LANE_ORDER[i];
          return (
            <div
              key={`p-${i}`}
              className="slot-frame aspect-square overflow-hidden relative"
              title={c?.name}
            >
              {c ? (
                <img
                  src={c.iconUrl}
                  alt={c.name}
                  className="w-full h-full object-cover"
                />
              ) : null}
              {lane && (
                <div className="absolute bottom-0.5 right-0.5 bg-black/70 rounded-sm p-0.5">
                  <LaneIcon lane={lane} size="xs" />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="text-[10px] md:text-[11px] text-rift-mutedbright italic mb-2">
        {rationale}
      </div>

      {/* Plan fit — live feedback on how well the chosen plan suits the comp.
          Updates as the user toggles levers (human sides). */}
      <PlanFitBar fit={strategyFit(strategy, picks)} className="mb-4" />

      {/* Levers — grouped into sections; interactive for human sides,
          read-only for AI sides. */}
      <div className="space-y-4">
        {STRATEGY_GROUP_ORDER.map((group) => (
          <div key={group}>
            <div className="text-[8px] uppercase tracking-[0.45em] text-rift-gold/50 border-b border-rift-line/40 pb-1 mb-2">
              {group}
            </div>
            <div className="space-y-3">
              {STRATEGY_LEVERS.filter((l) => l.group === group).map((lever) => {
                const current = strategy[lever.key];
                const recValue = recommended[lever.key];
                return (
                  <div key={lever.key}>
              <div className="flex items-baseline justify-between mb-1">
                <div className="text-[9px] uppercase tracking-[0.35em] text-rift-gold/70">
                  {lever.label}
                </div>
                {!isAI && (
                  <div className="text-[8px] uppercase tracking-[0.25em] text-rift-muted">
                    ◆ suggested
                  </div>
                )}
              </div>
              {isAI ? (
                <ReadOnlyLeverValue
                  optionLabel={
                    lever.options.find((o) => o.value === current)?.label ??
                    current
                  }
                  blurb={
                    lever.options.find((o) => o.value === current)?.blurb ?? ""
                  }
                />
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {lever.options.map((opt) => {
                    const active = current === opt.value;
                    const isRec = recValue === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => onChange(lever.key, opt.value)}
                        title={opt.blurb}
                        className={`relative flex-1 basis-[30%] min-w-[72px] px-1.5 py-1.5 border text-left transition-all ${
                          active
                            ? "border-rift-gold bg-rift-gold/10 text-rift-goldbright"
                            : "border-rift-line text-rift-mutedbright hover:border-rift-gold/50 hover:bg-rift-gold/5"
                        }`}
                      >
                        {isRec && (
                          <span
                            className="absolute top-1 right-1 text-rift-gold/80 text-[8px] leading-none"
                            aria-hidden
                          >
                            ◆
                          </span>
                        )}
                        <div className="text-[9px] md:text-[10px] uppercase tracking-[0.12em] leading-tight pr-2">
                          {opt.label}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const FIT_TIER_META: Record<
  FitTier,
  { label: string; text: string; bar: string; pct: number }
> = {
  strong: {
    label: "Strong — plan suits the comp",
    text: "text-rift-bluebright",
    bar: "bg-rift-blue",
    pct: 100,
  },
  balanced: {
    label: "Balanced — workable plan",
    text: "text-rift-goldbright",
    bar: "bg-rift-gold",
    pct: 60,
  },
  poor: {
    label: "Poor — plan fights the comp",
    text: "text-rift-redbright",
    bar: "bg-rift-red",
    pct: 30,
  },
};

function PlanFitBar({ fit, className = "" }: { fit: number; className?: string }) {
  const meta = FIT_TIER_META[fitTier(fit)];
  return (
    <div className={className}>
      <div className="flex items-baseline justify-between mb-1">
        <div className="text-[9px] uppercase tracking-[0.35em] text-rift-gold/70">
          Plan Fit
        </div>
        <div className={`text-[9px] uppercase tracking-[0.2em] ${meta.text}`}>
          {meta.label}
        </div>
      </div>
      <div className="h-1.5 bg-rift-bg/80 border border-rift-line/50 overflow-hidden">
        <div
          className={`h-full ${meta.bar} transition-[width] duration-300`}
          style={{ width: `${meta.pct}%` }}
        />
      </div>
    </div>
  );
}

function ReadOnlyLeverValue({
  optionLabel,
  blurb,
}: {
  optionLabel: string;
  blurb: string;
}) {
  return (
    <div className="border border-rift-gold/30 bg-rift-bg/40 px-2.5 py-1.5">
      <div className="text-[10px] md:text-[11px] uppercase tracking-[0.15em] text-rift-goldbright">
        {optionLabel}
      </div>
      {blurb && (
        <div className="text-[9px] text-rift-mutedbright/80 mt-0.5">{blurb}</div>
      )}
    </div>
  );
}
