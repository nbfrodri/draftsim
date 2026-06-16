"use client";

import { useMemo } from "react";
import {
  computeGroupStandings,
  computeStandings,
  computeSwissStandings,
} from "@/lib/tournament";
import type {
  TeamStanding,
  TournamentState,
  TournamentTeam,
} from "@/lib/tournament";
import type { TeamStreak } from "@/lib/streaks";
import TeamIcon from "@/components/TeamIcon";
import { teamStreaksFor } from "./MatchCard";

// Compact streak chip for standings rows. Only shown when count >= 2.
function StreakChip({ streak }: { streak: TeamStreak | undefined }) {
  if (!streak || streak.count < 2) return null;
  const isWin = streak.kind === "W";
  const cls = isWin
    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
    : "bg-rift-red/20 text-rift-redbright border-rift-red/40";
  const label = `${streak.kind}${streak.count}`;
  const tooltip = isWin
    ? `Won last ${streak.count} series`
    : `Lost last ${streak.count} series`;
  return (
    <span
      className={`inline-flex items-center text-[8px] font-display tracking-tight px-1 py-px border ml-1.5 ${cls}`}
      title={tooltip}
    >
      {label}
    </span>
  );
}

// Team cell shared by all standings tables: seed, identity icon painted
// in the team's brand color, name, streak chip. The icon keeps its brand
// color regardless of the row's lead/advancing tint — same convention as
// the match cards, where it acts as a stable identity mark.
function TeamCell({
  team,
  streak,
}: {
  team: TournamentTeam;
  streak: TeamStreak | undefined;
}) {
  return (
    <span className="truncate flex items-center gap-0" title={team.name}>
      <span className="text-rift-mutedbright/60 mr-2 tabular-nums text-[9px]">
        #{team.seed}
      </span>
      <span className="mr-1.5 shrink-0 self-center">
        <TeamIcon iconKey={team.iconKey} logoUrl={team.logoUrl} size={12} color={team.color ?? undefined} />
      </span>
      <span className="truncate">{team.name}</span>
      <StreakChip streak={streak} />
    </span>
  );
}

// ─── Round-robin standings table ──────────────────────────────────────

export function StandingsTable({ tournament }: { tournament: TournamentState }) {
  // Memoize the standings computation per tournament state; streaks come
  // from the shared per-tournament WeakMap cache (one compute for ALL
  // bracket components instead of one per table/card).
  const standings = useMemo(() => computeStandings(tournament), [tournament]);
  const streaks = teamStreaksFor(tournament);
  return (
    <div className="border border-rift-line/50 bg-rift-panel/40 overflow-x-auto">
      <div className="min-w-[560px]">
      <div className="grid grid-cols-[2.5rem_1fr_2.5rem_2.5rem_2.5rem_3.5rem_3rem] gap-2 px-3 py-2 border-b border-rift-line/40 text-[8px] uppercase tracking-[0.3em] text-rift-gold/60">
        <span>#</span>
        <span>Team</span>
        <span className="text-center" title="Played: total matches played">P</span>
        <span className="text-center" title="Match wins (entire matches won)">W</span>
        <span className="text-center" title="Match losses (entire matches lost)">L</span>
        <span className="text-center" title="Games W-L: individual games won and lost across all matches (a Bo3 win 2-1 contributes 2 wins and 1 loss)">G W-L</span>
        <span className="text-center" title="Game differential (gamesWon − gamesLost). Tiebreaker after head-to-head.">+/-</span>
      </div>
      {standings.map((row) => {
        const isLead = row.rank === 1 && row.played > 0;
        const isDecided = tournament.status === "complete" && row.rank === 1;
        const rowCls = isDecided
          ? "bg-rift-gold/10 text-rift-goldbright"
          : isLead
          ? "text-rift-bluebright"
          : "text-rift-mutedbright";
        return (
          <div
            key={row.team.id}
            className={`grid grid-cols-[2.5rem_1fr_2.5rem_2.5rem_2.5rem_3.5rem_3rem] gap-2 px-3 py-1.5 border-b border-rift-line/20 last:border-b-0 text-[11px] md:text-xs items-baseline ${rowCls}`}
          >
            <span className="font-display tabular-nums text-rift-goldbright/80">
              {row.rank}
            </span>
            <TeamCell team={row.team} streak={streaks[row.team.id]} />
            <span className="text-center tabular-nums">{row.played}</span>
            <span className="text-center tabular-nums text-rift-bluebright">
              {row.wins}
            </span>
            <span className="text-center tabular-nums text-rift-redbright">
              {row.losses}
            </span>
            <span className="text-center tabular-nums text-rift-mutedbright/85">
              {row.gamesWon}-{row.gamesLost}
            </span>
            <span
              className={`text-center tabular-nums ${
                row.gameDiff > 0
                  ? "text-rift-bluebright"
                  : row.gameDiff < 0
                  ? "text-rift-redbright"
                  : ""
              }`}
            >
              {row.gameDiff > 0 ? "+" : ""}
              {row.gameDiff}
            </span>
          </div>
        );
      })}
      </div>
    </div>
  );
}

// Group standings: like the round-robin table but with an explicit
// horizontal divider after row N (advancingTeams), with the advancing
// rows tinted gold and the eliminated rows tinted muted.
export function GroupStandingsTable({
  standings,
  advancingTeams,
  tournament,
}: {
  standings: TeamStanding[];
  advancingTeams: number;
  tournament: TournamentState;
}) {
  const streaks = teamStreaksFor(tournament);
  return (
    <div className="border border-rift-line/50 bg-rift-panel/40">
      <div className="grid grid-cols-[2.5rem_1fr_3rem_3rem_3.5rem_3.5rem] gap-2 px-3 py-2 border-b border-rift-line/40 text-[8px] uppercase tracking-[0.3em] text-rift-gold/60">
        <span>#</span>
        <span>Team</span>
        <span className="text-center" title="Played: matches played">P</span>
        <span className="text-center" title="Match wins">W</span>
        <span className="text-center" title="Match losses">L</span>
        <span className="text-center" title="Game differential (gamesWon − gamesLost). Tiebreaker after head-to-head.">+/-</span>
      </div>
      {standings.map((row, idx) => {
        const isAdvancing = row.rank <= advancingTeams;
        const isCutLine = row.rank === advancingTeams;
        const rowCls = isAdvancing
          ? row.rank === 1 && tournament.status === "complete"
            ? "bg-rift-gold/15 text-rift-goldbright"
            : "text-rift-bluebright bg-rift-blue/[0.04]"
          : "text-rift-mutedbright/65";
        return (
          <div key={row.team.id}>
            <div
              className={`grid grid-cols-[2.5rem_1fr_3rem_3rem_3.5rem_3.5rem] gap-2 px-3 py-1.5 border-b border-rift-line/20 last:border-b-0 text-[11px] md:text-xs items-baseline ${rowCls}`}
            >
              <span className="font-display tabular-nums">
                {row.rank}
                {isAdvancing && (
                  <span className="text-emerald-300/80 ml-0.5">▲</span>
                )}
              </span>
              <TeamCell team={row.team} streak={streaks[row.team.id]} />
              <span className="text-center tabular-nums">{row.played}</span>
              <span className="text-center tabular-nums text-rift-bluebright">
                {row.wins}
              </span>
              <span className="text-center tabular-nums text-rift-redbright">
                {row.losses}
              </span>
              <span
                className={`text-center tabular-nums ${
                  row.gameDiff > 0
                    ? "text-emerald-300"
                    : row.gameDiff < 0
                    ? "text-rift-redbright"
                    : "text-rift-mutedbright/60"
                }`}
              >
                {row.gameDiff > 0 ? "+" : ""}
                {row.gameDiff}
              </span>
            </div>
            {isCutLine && idx < standings.length - 1 && (
              <div className="px-3 py-0.5 text-[8px] uppercase tracking-[0.4em] text-rift-mutedbright/50 border-b border-dashed border-rift-gold/40 bg-rift-bg/40 text-center">
                — playoff cutline —
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Inline legend explaining the abbreviated column headers. Sits below
// the table so users have a glanceable reference for "G W-L", "Bch",
// and "M-Bch" without needing to hover for tooltips.
function SwissStandingsLegend() {
  return (
    <div className="px-3 py-1.5 border-t border-rift-line/30 grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-0.5 text-[9px] text-rift-mutedbright/60">
      <span>
        <span className="text-rift-gold/70 font-display tracking-wider">G W-L</span>{" "}
        — games won-lost (within Bo3/Bo5)
      </span>
      <span>
        <span className="text-rift-gold/70 font-display tracking-wider">Bch</span>{" "}
        — Buchholz: sum of opponents&rsquo; wins
      </span>
      <span>
        <span className="text-rift-gold/70 font-display tracking-wider">M-Bch</span>{" "}
        — Median Buchholz (high/low dropped)
      </span>
    </div>
  );
}

export function SwissStandingsTable({
  tournament,
  // When set (swiss-playoffs variants), the top-N rows are tinted as the
  // qualification zone with a cutline, mirroring the groups view.
  advancing = 0,
}: {
  tournament: TournamentState;
  advancing?: number;
}) {
  const standings = useMemo(() => computeSwissStandings(tournament), [tournament]);
  const streaks = teamStreaksFor(tournament);
  // Threshold mode (modern Worlds Swiss): qualification/elimination is by
  // record (X wins → qualified, X losses → out), not by rank. It takes
  // precedence over the fixed top-N cutline.
  // Symmetric threshold (modern Worlds Swiss): X wins qualify / X losses out.
  const winTarget = tournament.swissWinTarget ?? null;
  const showCut = winTarget == null && advancing > 0 && advancing < standings.length;
  const cols =
    "grid-cols-[2.5rem_1fr_2.5rem_2.5rem_2.5rem_3.5rem_2.75rem_3rem]";
  return (
    <div className="border border-rift-line/50 bg-rift-panel/40">
      {winTarget != null && (
        <div className="flex items-center justify-center gap-4 px-3 py-1.5 border-b border-rift-line/40 bg-rift-bg/40 text-[9px] uppercase tracking-[0.25em]">
          <span className="text-emerald-300/80">▲ {winTarget}W → Qualify</span>
          <span className="text-rift-redbright/70">✕ {winTarget}L → Eliminated</span>
        </div>
      )}
      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          <div className={`grid ${cols} gap-2 px-3 py-2 border-b border-rift-line/40 text-[8px] uppercase tracking-[0.3em] text-rift-gold/60`}>
            <span>#</span>
            <span>Team</span>
            <span className="text-center" title="Played: total matches played">P</span>
            <span className="text-center" title="Match wins (entire matches won)">W</span>
            <span className="text-center" title="Match losses (entire matches lost)">L</span>
            <span className="text-center" title="Games W-L: individual games won and lost across all matches (a Bo3 win 2-1 contributes 2 wins and 1 loss)">G W-L</span>
            <span className="text-center" title="Buchholz: sum of every opponent's match wins. Higher = harder schedule.">Bch</span>
            <span className="text-center" title="Median Buchholz: Buchholz with the highest and lowest opponent dropped. Less swayed by extreme schedules.">M-Bch</span>
          </div>
        {standings.map((row, idx) => {
          const isLead = row.rank === 1 && row.played > 0;
          const isDecided = tournament.status === "complete" && row.rank === 1;
          const isAdvancing = showCut && row.rank <= advancing;
          const isQualified = winTarget != null && row.wins >= winTarget;
          const isEliminated = winTarget != null && row.losses >= winTarget;
          const rowCls = isDecided
            ? "bg-rift-gold/10 text-rift-goldbright"
            : isQualified
            ? "text-emerald-300 bg-emerald-500/[0.06]"
            : isEliminated
            ? "text-rift-redbright/55 bg-rift-red/[0.04]"
            : isAdvancing
            ? "text-rift-bluebright bg-rift-blue/[0.04]"
            : isLead
            ? "text-rift-bluebright"
            : showCut
            ? "text-rift-mutedbright/65"
            : "text-rift-mutedbright";
          return (
            <div key={row.team.id}>
              <div
                className={`grid ${cols} gap-2 px-3 py-1.5 border-b border-rift-line/20 last:border-b-0 text-[11px] md:text-xs items-baseline ${rowCls}`}
              >
                <span className="font-display tabular-nums text-rift-goldbright/80">
                  {row.rank}
                  {(isAdvancing || isQualified) && (
                    <span className="text-emerald-300/80 ml-0.5">▲</span>
                  )}
                  {isEliminated && (
                    <span className="text-rift-redbright/70 ml-0.5">✕</span>
                  )}
                </span>
                <TeamCell team={row.team} streak={streaks[row.team.id]} />
                <span className="text-center tabular-nums">{row.played}</span>
                <span className="text-center tabular-nums text-rift-bluebright">
                  {row.wins}
                </span>
                <span className="text-center tabular-nums text-rift-redbright">
                  {row.losses}
                </span>
                <span className="text-center tabular-nums text-rift-mutedbright/85">
                  {row.gamesWon}-{row.gamesLost}
                </span>
                <span className="text-center tabular-nums text-rift-mutedbright/70">
                  {row.buchholz}
                </span>
                <span className="text-center tabular-nums">{row.medianBuchholz}</span>
              </div>
              {showCut && row.rank === advancing && idx < standings.length - 1 && (
                <div className="px-3 py-0.5 text-[8px] uppercase tracking-[0.4em] text-rift-mutedbright/50 border-b border-dashed border-rift-gold/40 bg-rift-bg/40 text-center">
                  — playoff cutline —
                </div>
              )}
            </div>
          );
        })}
        </div>
      </div>
      <SwissStandingsLegend />
    </div>
  );
}
