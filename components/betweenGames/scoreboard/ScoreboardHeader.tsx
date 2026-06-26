"use client";

import { memo } from "react";
import TeamName from "@/components/TeamName";
import { formatClock } from "../shared";

// Subtle "N in a row" label shown when a team has won 2+ consecutive games
// within this series (blueWinStreak / redWinStreak from SeriesState).
function InARowBadge({
  streak,
  side,
}: {
  streak: number | undefined;
  side: "blue" | "red";
}) {
  if (!streak || streak < 2) return null;
  const cls =
    side === "blue"
      ? "text-rift-blue/70"
      : "text-rift-red/70";
  return (
    <span
      className={`text-[9px] md:text-[10px] font-display tracking-wide tabular-nums shrink-0 ${cls}`}
      title={`Won ${streak} games in a row this series`}
    >
      {streak} in a row
    </span>
  );
}

export const ScoreboardHeader = memo(function ScoreboardHeader({
  blueTeam,
  redTeam,
  currentMin,
  durationLabel,
  isFinished,
  blueWinStreak,
  redWinStreak,
}: {
  blueTeam: string;
  redTeam: string;
  currentMin: number;
  durationLabel: string;
  isFinished: boolean;
  /** Cross-game win streak for the blue side within this series (from SeriesState). Optional / legacy-safe. */
  blueWinStreak?: number;
  /** Cross-game win streak for the red side within this series (from SeriesState). Optional / legacy-safe. */
  redWinStreak?: number;
}) {
  const clock = isFinished ? durationLabel : formatClock(currentMin);
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center mb-3 pb-2 border-b border-rift-line/40">
      <div className="flex flex-col items-end truncate min-w-0">
        <div className="flex items-center gap-2 truncate min-w-0">
          <span className="font-display text-rift-bluebright text-xs md:text-sm uppercase tracking-[0.2em] truncate">
            <TeamName name={blueTeam} size={18} />
          </span>
          <span
            className="w-1.5 h-1.5 rounded-full bg-rift-blue shadow-glow-blue flex-shrink-0"
            aria-hidden
          />
        </div>
        <InARowBadge streak={blueWinStreak} side="blue" />
      </div>
      <div className="text-rift-goldbright text-[11px] md:text-sm font-display tracking-[0.3em] tabular-nums px-2 md:px-4">
        {clock}
      </div>
      <div className="flex flex-col items-start truncate min-w-0">
        <div className="flex items-center gap-2 truncate min-w-0">
          <span
            className="w-1.5 h-1.5 rounded-full bg-rift-red shadow-glow-red flex-shrink-0"
            aria-hidden
          />
          <span className="font-display text-rift-redbright text-xs md:text-sm uppercase tracking-[0.2em] truncate">
            <TeamName name={redTeam} size={18} />
          </span>
        </div>
        <InARowBadge streak={redWinStreak} side="red" />
      </div>
    </div>
  );
});
