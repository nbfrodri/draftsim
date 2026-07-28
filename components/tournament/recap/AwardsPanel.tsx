"use client";

import { useMemo } from "react";
import { useDraftStore } from "@/store/draftStore";
import { computeTournamentAwards } from "@/lib/awards";
import type { TournamentAwards, PlayerAward, SpecialAward } from "@/lib/awards";
import type { TournamentState } from "@/lib/tournament";
import type { Lane } from "@/lib/types";
import LaneIcon from "../../LaneIcon";
import PlayerNameLink from "../../player/PlayerNameLink";

// ─── Rating badge (mirrors ContributionRow.tsx color logic exactly) ───────────

function RatingBadge({ rating }: { rating: number }) {
  const cls =
    rating >= 8
      ? "bg-rift-gold/20 border-rift-gold/60 text-rift-goldbright"
      : rating >= 6.5
      ? "bg-emerald-900/30 border-emerald-500/50 text-emerald-300"
      : rating >= 5
      ? "bg-rift-bg/60 border-rift-line text-rift-mutedbright"
      : "bg-rift-red/15 border-rift-red/40 text-rift-redbright/80";
  return (
    <span
      className={`inline-flex items-center px-1.5 py-px border text-[9px] tabular-nums font-semibold tracking-wide ${cls}`}
      title={`Avg rating: ${rating.toFixed(1)}/10`}
    >
      {rating.toFixed(1)}
    </span>
  );
}


// ─── MVP card ─────────────────────────────────────────────────────────────────

function MVPCard({ mvp }: { mvp: PlayerAward }) {
  return (
    <div className="border-2 border-rift-gold/50 bg-gradient-to-br from-rift-gold/[0.08] via-rift-bg/40 to-transparent p-4">
      <div className="text-[8px] uppercase tracking-[0.4em] text-rift-gold/70 mb-2">
        Tournament MVP
      </div>
      <div className="flex items-baseline gap-3 flex-wrap">
        <PlayerNameLink
          playerId={mvp.playerId}
          name={mvp.playerName ?? mvp.displayName}
          className="font-display text-xl tracking-wider text-rift-goldbright"
        />
        <RatingBadge rating={mvp.avgRating} />
        <span className="text-[9px] uppercase tracking-[0.25em] text-rift-mutedbright/60">
          {mvp.gamesPlayed} games
        </span>
      </div>
      <div className="mt-1 text-[9px] uppercase tracking-[0.3em] text-rift-mutedbright/55">
        {mvp.playerName ? mvp.displayName : mvp.teamName}
      </div>
    </div>
  );
}

// ─── All-Pro strip ────────────────────────────────────────────────────────────

function AllProStrip({ allPro }: { allPro: TournamentAwards["allPro"] }) {
  if (allPro.length === 0) return null;
  const laneOrder: Lane[] = ["top", "jungle", "middle", "bottom", "support"];
  const byLane = new Map(allPro.map((p) => [p.lane, p]));

  return (
    <div className="border border-rift-line/50 bg-rift-panel/40">
      <div className="px-3 py-2 border-b border-rift-line/40">
        <span className="text-[10px] uppercase tracking-[0.4em] text-rift-gold/70">
          All-Pro Team
        </span>
      </div>
      <div className="divide-y divide-rift-line/20">
        {laneOrder.map((lane) => {
          const player = byLane.get(lane);
          if (!player) return null;
          return (
            <div
              key={lane}
              className="flex items-center justify-between px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <LaneIcon lane={lane} size="sm" className="shrink-0" />
                <PlayerNameLink
                  playerId={player.playerId}
                  name={player.playerName ?? player.displayName}
                  className="font-display tracking-wider text-sm text-rift-mutedbright"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] uppercase tracking-[0.2em] text-rift-mutedbright/50">
                  {player.gamesPlayed}g
                </span>
                <RatingBadge rating={player.avgRating} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Award kind → display label ───────────────────────────────────────────────

const AWARD_ICON: Record<SpecialAward["kind"], string> = {
  performance: "★",
  consistent: "◆",
  carry_losing: "◈",
  hottest_streak: "▲",
};

// ─── Awards list ──────────────────────────────────────────────────────────────

function AwardsList({ awards }: { awards: SpecialAward[] }) {
  if (awards.length === 0) return null;
  return (
    <div className="border border-rift-line/50 bg-rift-panel/40">
      <div className="px-3 py-2 border-b border-rift-line/40">
        <span className="text-[10px] uppercase tracking-[0.4em] text-rift-gold/70">
          Individual Awards
        </span>
      </div>
      <div className="divide-y divide-rift-line/20">
        {awards.map((award) => (
          <div key={award.kind} className="px-3 py-2.5">
            <div className="flex items-baseline gap-2 mb-0.5">
              <span className="text-rift-goldbright/70 text-[10px]">
                {AWARD_ICON[award.kind]}
              </span>
              <span className="text-[9px] uppercase tracking-[0.3em] text-rift-mutedbright/70">
                {award.title}
              </span>
            </div>
            <div className="flex items-baseline gap-2 flex-wrap pl-4">
              <PlayerNameLink
                playerId={award.player.playerId}
                name={award.player.playerName ?? award.player.displayName}
                className="font-display tracking-wider text-sm text-rift-mutedbright"
              />
              <RatingBadge rating={award.player.avgRating} />
              <span className="text-[9px] uppercase tracking-[0.2em] text-rift-mutedbright/50">
                {award.context}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── AwardsPanel ─────────────────────────────────────────────────────────────

export function AwardsPanel({ tournament }: { tournament: TournamentState }) {
  // Read playerForms from the store so "Hottest Streak" can be included.
  const playerForms = useDraftStore((s) => s.playerForms);

  const awards = useMemo(
    () => computeTournamentAwards(tournament, playerForms),
    [tournament, playerForms],
  );

  // Hide the whole panel when there is no data (all-manual tournament or
  // no rated games yet).
  if (!awards.mvp && awards.allPro.length === 0 && awards.awards.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {awards.mvp && <MVPCard mvp={awards.mvp} />}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <AllProStrip allPro={awards.allPro} />
        <AwardsList awards={awards.awards} />
      </div>
    </div>
  );
}
