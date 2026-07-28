"use client";

import { useMemo } from "react";
import type { MatchTimeline } from "@/lib/matchSimulator";
import type { Champion, Lane, Side } from "@/lib/types";
import LaneIcon from "@/components/LaneIcon";
import TeamName from "@/components/TeamName";
import PlayerNameLink from "@/components/player/PlayerNameLink";
import {
  LANE_ORDER,
  computeRunningStats,
  computeLiveLaneGold,
  formatLaneGold,
  type SideLaneKDA,
} from "./shared";
import type { LaneKDA } from "@/lib/matchSimulator";

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
export function MVPCard({
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
  bluePlayerNames,
  redPlayerNames,
  bluePlayerIds,
  redPlayerIds,
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
  // Optional per-lane player handles (positional order) for each side.
  bluePlayerNames?: (string | null)[];
  redPlayerNames?: (string | null)[];
  // Stable player ids parallel to the handle arrays.
  bluePlayerIds?: (string | null)[];
  redPlayerIds?: (string | null)[];
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
  const mvpHandle =
    (mvp.side === "blue" ? bluePlayerNames : redPlayerNames)?.[
      LANE_ORDER.indexOf(mvp.lane)
    ] ?? null;
  const mvpPlayerId =
    (mvp.side === "blue" ? bluePlayerIds : redPlayerIds)?.[
      LANE_ORDER.indexOf(mvp.lane)
    ] ?? undefined;
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
              <TeamName name={sideName} size={13} />
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
          {mvpHandle && (
            <div className="mt-0.5">
              <PlayerNameLink
                playerId={mvpPlayerId ?? undefined}
                name={mvpHandle}
                className="text-[11px] font-medium text-rift-mutedbright tracking-wider truncate"
              />
            </div>
          )}
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
