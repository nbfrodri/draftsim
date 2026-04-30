"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { useDraftStore } from "@/store/draftStore";
import { fearlessLocksBeforeGame, winsByTeamName } from "@/lib/series";
import type { Champion, GameDraft, Lane, Side } from "@/lib/types";
import LaneIcon from "./LaneIcon";

interface Props {
  champions: Champion[];
}

type SwapSel = { gameId: string; side: Side; slot: number } | null;

export default function SeriesCompleteView({ champions }: Props) {
  const series = useDraftStore((s) => s.series)!;
  const resetAll = useDraftStore((s) => s.resetAll);
  const swapPickSlots = useDraftStore((s) => s.swapPickSlots);

  const byId = useMemo(
    () => new Map(champions.map((c) => [c.id, c])),
    [champions],
  );
  // Use each team's fixed identity (who started on which side in Game 1) for
  // the recap score line — side-swap-proof and broadcast-style.
  const firstGame = series.games[0];
  const leftTeam = firstGame.blueTeam;
  const rightTeam = firstGame.redTeam;
  const wins = winsByTeamName(series);
  const leftWins = wins.get(leftTeam) ?? 0;
  const rightWins = wins.get(rightTeam) ?? 0;
  const winnerName =
    series.winner === "blue" ? series.blueTeam : series.redTeam;
  const winnerIsLeft = winnerName === leftTeam;
  const winnerColor = winnerIsLeft ? "text-rift-blue" : "text-rift-red";
  const winnerGlow = winnerIsLeft
    ? "drop-shadow-[0_0_30px_rgba(10,200,185,0.5)]"
    : "drop-shadow-[0_0_30px_rgba(232,64,87,0.5)]";

  const [swapSel, setSwapSel] = useState<SwapSel>(null);

  const handleSwap = (gameIndex: number, gameId: string, side: Side, slot: number) => {
    if (!swapSel) {
      setSwapSel({ gameId, side, slot });
      return;
    }
    if (swapSel.gameId !== gameId || swapSel.side !== side) {
      setSwapSel({ gameId, side, slot });
      return;
    }
    if (swapSel.slot === slot) {
      setSwapSel(null);
      return;
    }
    swapPickSlots(gameIndex, side, swapSel.slot, slot);
    setSwapSel(null);
  };

  const rootRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!rootRef.current) return;
    const ctx = gsap.context(() => {
      gsap.from(titleRef.current, {
        opacity: 0,
        scale: 0.65,
        rotationX: 60,
        duration: 1.1,
        ease: "back.out(1.6)",
      });
      gsap.from(".sc-fade", {
        opacity: 0,
        y: 24,
        stagger: 0.08,
        delay: 0.3,
        duration: 0.6,
        ease: "power3.out",
      });
    }, rootRef);
    return () => ctx.revert();
  }, []);

  return (
    <div
      ref={rootRef}
      className="min-h-[100svh] overflow-y-auto px-4 py-8 md:py-12"
    >
      <div className="w-full max-w-5xl mx-auto">
        <div className="text-center mb-8 md:mb-10">
          <div className="sc-fade text-[10px] md:text-xs uppercase tracking-[0.5em] text-rift-gold/70">
            Series Complete · {series.format.toUpperCase()}
            {series.fearless && " · Fearless"}
          </div>
          <div
            ref={titleRef}
            className={`mt-4 font-display text-5xl md:text-7xl tracking-[0.1em] ${winnerColor} ${winnerGlow}`}
          >
            {winnerName}
          </div>
          <div className="sc-fade mt-3 flex items-center justify-center gap-3 md:gap-4 text-sm md:text-base font-display uppercase tracking-[0.25em]">
            <span
              className={`truncate max-w-[140px] md:max-w-[220px] ${
                leftWins > rightWins ? "text-rift-goldbright" : "text-rift-muted"
              }`}
            >
              {leftTeam}
            </span>
            <span className="text-rift-goldbright tnum text-base md:text-xl">
              {leftWins}
            </span>
            <span className="text-rift-gold/70">—</span>
            <span className="text-rift-goldbright tnum text-base md:text-xl">
              {rightWins}
            </span>
            <span
              className={`truncate max-w-[140px] md:max-w-[220px] ${
                rightWins > leftWins ? "text-rift-goldbright" : "text-rift-muted"
              }`}
            >
              {rightTeam}
            </span>
          </div>
        </div>

        <div className="sc-fade text-center mb-3 text-[10px] md:text-xs uppercase tracking-[0.3em] text-rift-muted">
          Tip · click two picks on the same team to swap their champions
        </div>

        <div className="sc-fade space-y-4 mb-8">
          {series.games.map((g, idx) => {
            const lockedBefore = fearlessLocksBeforeGame(series, idx);
            return (
              <GameCard
                key={g.id}
                game={g}
                gameIndex={idx}
                blueTeam={g.blueTeam}
                redTeam={g.redTeam}
                fearless={series.fearless}
                fearlessLocked={lockedBefore}
                byId={byId}
                swapSel={swapSel}
                onSwap={handleSwap}
              />
            );
          })}
        </div>

        <button
          type="button"
          onClick={resetAll}
          className="sc-fade btn-gold w-full py-4 md:py-5 font-display text-base md:text-lg tracking-[0.3em] md:tracking-[0.4em] inline-flex items-center justify-center gap-3"
        >
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            className="w-4 h-4 md:w-5 md:h-5"
            aria-hidden
          >
            <path d="M9 3l-5 5 5 5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 8h10" strokeLinecap="round" />
          </svg>
          MAIN MENU
        </button>
      </div>
    </div>
  );
}

function GameCard({
  game,
  gameIndex,
  blueTeam,
  redTeam,
  fearless,
  fearlessLocked,
  byId,
  swapSel,
  onSwap,
}: {
  game: GameDraft;
  gameIndex: number;
  blueTeam: string;
  redTeam: string;
  fearless: boolean;
  fearlessLocked: Set<number>;
  byId: Map<number, Champion>;
  swapSel: SwapSel;
  onSwap: (gameIndex: number, gameId: string, side: Side, slot: number) => void;
}) {
  const winnerSide = game.winner;
  const winnerLabel =
    winnerSide === "blue" ? blueTeam : winnerSide === "red" ? redTeam : "—";

  return (
    <div className="relative border border-rift-gold/25 bg-rift-panel/40 p-3 md:p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-baseline gap-2">
          <span className="text-[10px] uppercase tracking-[0.3em] text-rift-muted">
            Game
          </span>
          <span className="font-display text-2xl md:text-3xl text-rift-goldbright">
            {game.gameNumber}
          </span>
        </div>
        {winnerSide && (
          <div className="flex items-center gap-2">
            <span className="text-[9px] uppercase tracking-[0.3em] text-rift-muted">
              Winner
            </span>
            <span
              className={`font-display text-sm md:text-base tracking-[0.15em] ${
                winnerSide === "blue" ? "text-rift-blue" : "text-rift-red"
              }`}
            >
              {winnerLabel}
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
        <TeamLine
          label={blueTeam}
          side="blue"
          picks={game.bluePicks}
          bans={game.blueBans}
          roles={game.blueRoles}
          byId={byId}
          won={winnerSide === "blue"}
          swapSel={
            swapSel && swapSel.gameId === game.id && swapSel.side === "blue"
              ? swapSel
              : null
          }
          onPickClick={(slot) => onSwap(gameIndex, game.id, "blue", slot)}
        />
        <TeamLine
          label={redTeam}
          side="red"
          picks={game.redPicks}
          bans={game.redBans}
          roles={game.redRoles}
          byId={byId}
          won={winnerSide === "red"}
          swapSel={
            swapSel && swapSel.gameId === game.id && swapSel.side === "red"
              ? swapSel
              : null
          }
          onPickClick={(slot) => onSwap(gameIndex, game.id, "red", slot)}
        />
      </div>

      {fearless && fearlessLocked.size > 0 && (
        <div className="mt-3 pt-3 border-t border-rift-gold/15">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] uppercase tracking-[0.35em] text-rift-gold/70">
              Fearless Pool
            </span>
            <span className="text-[10px] text-rift-muted">
              {fearlessLocked.size} champion{fearlessLocked.size === 1 ? "" : "s"} locked entering Game {game.gameNumber}
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {[...fearlessLocked].map((id) => {
              const c = byId.get(id);
              if (!c) return null;
              return (
                <div
                  key={id}
                  className="slot-frame w-6 h-6 md:w-7 md:h-7 overflow-hidden"
                  title={c.name}
                >
                  <img
                    src={c.iconUrl}
                    alt={c.name}
                    className="w-full h-full object-cover opacity-75"
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function TeamLine({
  label,
  side,
  picks,
  bans,
  roles,
  byId,
  won,
  swapSel,
  onPickClick,
}: {
  label: string;
  side: Side;
  picks: (number | null)[];
  bans: (number | null)[];
  roles: (Lane | null)[];
  byId: Map<number, Champion>;
  won: boolean;
  swapSel: SwapSel;
  onPickClick: (slot: number) => void;
}) {
  const textColor = side === "blue" ? "text-rift-blue" : "text-rift-red";
  const borderColor =
    side === "blue" ? "border-rift-blue/30" : "border-rift-red/30";
  const bgGrad =
    side === "blue"
      ? "from-rift-bluedeep/10 to-transparent"
      : "from-rift-reddeep/10 to-transparent";
  return (
    <div
      className={`relative border ${borderColor} bg-gradient-to-br ${bgGrad} p-2.5 md:p-3 ${
        won ? "" : "opacity-80"
      }`}
    >
      {won && (
        <span className="absolute -top-1 -left-1 px-1.5 text-[8px] font-display tracking-[0.3em] bg-rift-gold text-rift-bg">
          WON
        </span>
      )}
      <div
        className={`text-xs md:text-sm ${textColor} uppercase tracking-[0.25em] font-display mb-2 truncate`}
      >
        {label}
      </div>
      <div className="grid grid-cols-5 gap-1 md:gap-1.5 mb-2">
        {picks.map((id, i) => {
          const c = id != null ? byId.get(id) : undefined;
          const lane = roles[i];
          const selected = swapSel?.slot === i;
          const isCandidate = swapSel != null && !selected;
          return (
            <button
              type="button"
              key={`p-${i}`}
              onClick={() => onPickClick(i)}
              aria-label={lane ? `${c?.name ?? "Empty"} (${lane})` : c?.name ?? "Empty"}
              className={`slot-frame aspect-square overflow-hidden relative transition-all ${
                selected
                  ? "ring-2 ring-rift-gold shadow-glow-gold scale-[1.05] z-10"
                  : isCandidate
                  ? "ring-1 ring-rift-gold/60 hover:ring-rift-gold hover:scale-[1.03]"
                  : "hover:border-rift-gold/60"
              }`}
            >
              {c && (
                <img
                  src={c.iconUrl}
                  alt={c.name}
                  className="w-full h-full object-cover"
                />
              )}
              {lane && (
                <div className="absolute bottom-0.5 right-0.5 bg-black/70 rounded-sm p-0.5 flex items-center justify-center">
                  <LaneIcon lane={lane} size="xs" />
                </div>
              )}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-[9px] uppercase tracking-[0.3em] text-rift-muted">
          Bans
        </span>
        <div className="flex gap-1">
          {bans.map((id, i) => {
            const c = id != null ? byId.get(id) : undefined;
            return (
              <div
                key={`b-${i}`}
                className="slot-frame banned w-6 h-6 md:w-7 md:h-7 overflow-hidden relative"
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
            );
          })}
        </div>
      </div>
    </div>
  );
}
