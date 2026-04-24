"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { useDraftStore } from "@/store/draftStore";
import { currentGame, maxGames, seriesScore } from "@/lib/series";
import type { Champion, Lane, Side } from "@/lib/types";
import LaneIcon from "./LaneIcon";

interface Props {
  champions: Champion[];
}

export default function BetweenGamesView({ champions }: Props) {
  const series = useDraftStore((s) => s.series)!;
  const declareWinner = useDraftStore((s) => s.declareWinner);
  const proceedToNextGame = useDraftStore((s) => s.proceedToNextGame);
  const swapPickSlots = useDraftStore((s) => s.swapPickSlots);

  const game = currentGame(series);
  const gameIndex = series.games.length - 1;
  const winnerDeclared = game.winner != null;
  const [swapSides, setSwapSides] = useState(false);

  // Track a selected pick for role swapping. null when none.
  const [swapSel, setSwapSel] = useState<{ side: Side; slot: number } | null>(null);

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
      className="min-h-[100svh] overflow-y-auto flex items-start justify-center px-4 py-8 md:py-12"
    >
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

        {!winnerDeclared ? (
          <div className="bg-fade grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
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
