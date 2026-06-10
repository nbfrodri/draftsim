"use client";

import { useMemo } from "react";
import { useDraftStore } from "@/store/draftStore";
import {
  computeChampionKDAStats,
  computeChampionStats,
  computeTournamentSummary,
  tournamentChampion,
} from "@/lib/tournament";
import type { TournamentState, TournamentSummary, TournamentTeam } from "@/lib/tournament";
import type { Champion } from "@/lib/types";
import MetaPanel from "@/components/MetaPanel";
import { formatHeaderLabel } from "@/components/tournament/shared";
import { MetaShiftPanel } from "./MetaShiftPanel";
import { NotableGamesPanel, computeNotableGames } from "./NotableGames";
import { PresenceTable, WinRateTable, BestKDATable } from "./ChampionTables";
import { ChampionSearchPanel } from "./ChampionSearchPanel";
import { TeamBreakdownPanel } from "./TeamBreakdownPanel";
import { AwardsPanel } from "./AwardsPanel";

// ─── Small shared sub-components ──────────────────────────────────────

function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | string;
  hint?: string;
}) {
  return (
    <div
      className="border border-rift-line/40 bg-rift-bg/30 px-3 py-2"
      title={hint}
    >
      <div className="text-[8px] uppercase tracking-[0.3em] text-rift-mutedbright/60">
        {label}
      </div>
      <div className="font-display text-lg md:text-xl text-rift-goldbright tabular-nums">
        {value}
      </div>
    </div>
  );
}

function CalloutTile({
  label,
  champion,
  detail,
  accent = "gold",
}: {
  label: string;
  champion: Champion;
  detail: string;
  accent?: "gold" | "emerald";
}) {
  const ringCls =
    accent === "emerald"
      ? "border-emerald-400/50 bg-emerald-400/[0.04]"
      : "border-rift-gold/50 bg-rift-gold/[0.05]";
  const accentText =
    accent === "emerald" ? "text-emerald-300" : "text-rift-goldbright";
  return (
    <div className={`flex items-center gap-3 border ${ringCls} px-3 py-2`}>
      <img
        src={champion.iconUrl}
        alt={champion.name}
        className="w-10 h-10 border border-rift-line/60 flex-shrink-0"
      />
      <div className="min-w-0">
        <div className="text-[8px] uppercase tracking-[0.3em] text-rift-mutedbright/60">
          {label}
        </div>
        <div className={`font-display text-sm tracking-wider truncate ${accentText}`}>
          {champion.name}
        </div>
        <div className="text-[9px] uppercase tracking-[0.2em] text-rift-mutedbright/65">
          {detail}
        </div>
      </div>
    </div>
  );
}

// Headline summary — high-level facts about what happened. Renders the
// crowned team prominently, then a row of compact stat tiles, then the
// most-contested + best-WR flavor callouts.
function SummaryCard({
  summary,
  tournament,
  champion,
  byId,
}: {
  summary: TournamentSummary;
  tournament: TournamentState;
  champion: TournamentTeam | null;
  byId: Map<number, Champion>;
}) {
  const fearlessLabels: string[] = [];
  if (tournament.fearlessConfig.global) fearlessLabels.push("Global");
  else if (tournament.fearlessConfig.perTeam) fearlessLabels.push("Per-Team");
  if (tournament.fearlessConfig.perSeries) fearlessLabels.push("Per-Series");
  const formatLabel = formatHeaderLabel(tournament.format);
  const avgGamesPerMatch =
    summary.totalMatches > 0
      ? (summary.totalGames / summary.totalMatches).toFixed(2)
      : "0";
  const coveragePct =
    summary.rosterCoverage != null
      ? Math.round(summary.rosterCoverage * 100)
      : null;
  const mostContested =
    summary.mostContestedChampionId != null
      ? byId.get(summary.mostContestedChampionId)
      : null;
  const bestWRChamp =
    summary.bestWRChampionId != null
      ? byId.get(summary.bestWRChampionId)
      : null;
  return (
    <div className="border-2 border-rift-gold/50 bg-gradient-to-br from-rift-gold/[0.06] via-rift-bg/40 to-transparent p-4 md:p-5">
      <div className="flex items-baseline justify-between mb-3">
        <div className="text-[10px] uppercase tracking-[0.4em] text-rift-gold/70">
          Tournament Summary
        </div>
        <div className="text-[9px] uppercase tracking-[0.25em] text-rift-mutedbright/55">
          {formatLabel} · {tournament.teams.length} teams
          {fearlessLabels.length > 0 && ` · Fearless ${fearlessLabels.join("+")}`}
        </div>
      </div>
      {champion && (
        <div className="text-[10px] uppercase tracking-[0.3em] text-rift-mutedbright/70 mb-3">
          Crowned:&nbsp;
          <span className="text-rift-goldbright font-display text-base tracking-wider">
            {champion.name}
          </span>
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 md:gap-3">
        <StatTile label="Matches" value={summary.totalMatches} />
        <StatTile label="Games" value={summary.totalGames} />
        <StatTile
          label="Avg Games / Match"
          value={avgGamesPerMatch}
        />
        <StatTile
          label="Longest Series"
          value={summary.longestSeriesGames}
        />
        <StatTile label="Total Picks" value={summary.totalPicks} />
        <StatTile label="Total Bans" value={summary.totalBans} />
        <StatTile
          label="Champions Played"
          value={summary.uniqueChampionsPlayed}
        />
        <StatTile
          label="Roster Coverage"
          value={coveragePct != null ? `${coveragePct}%` : "—"}
          hint="Picked or banned at least once"
        />
      </div>
      {(mostContested || bestWRChamp) && (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2 md:gap-3">
          {mostContested && (
            <CalloutTile
              label="Most Contested"
              champion={mostContested}
              detail={`${summary.mostContestedPresence} picks+bans`}
            />
          )}
          {bestWRChamp && summary.bestWR != null && (
            <CalloutTile
              label={`Best WR (≥3 games)`}
              champion={bestWRChamp}
              detail={`${Math.round(summary.bestWR * 100)}% over ${
                summary.bestWRGames
              } games`}
              accent="emerald"
            />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Post-tournament recap ───────────────────────────────────────────
// Lives at the top of the dashboard when status === "complete". Renders:
//   1. A summary stat block (matches/games/coverage/longest series)
//   2. Two side-by-side champion stat tables — Presence (picks+bans+games,
//      sorted by total presence) and Win Rate (sorted by WR, gated by a
//      min-game threshold so 1-0 noise doesn't dominate).
//
// The earlier "Tournament MVP" card was removed: a champion-level "MVP"
// is conceptually muddy for a draft simulator (the MVP signal lives on
// the player, not the champion), and the headline data is captured more
// directly by the WR table + most-contested callout.
export function PostTournamentRecap({
  tournament,
  onViewGame,
}: {
  tournament: TournamentState;
  // Open the per-match replay modal and land on a specific game index.
  // Threaded down from TournamentDashboard so the Notable Games panel
  // can deep-link the user straight to the relevant game.
  onViewGame: (matchId: string, gameIdx: number) => void;
}) {
  const champions = useDraftStore((s) => s.champions);
  const byId = useMemo(
    () => new Map(champions.map((c) => [c.id, c])),
    [champions],
  );
  const summary = useMemo(
    () => computeTournamentSummary(tournament, champions.length || null),
    [tournament, champions.length],
  );
  const champion = useMemo(() => tournamentChampion(tournament), [tournament]);

  // Two derived rankings from the same per-champion stats:
  //   • presence: picks + bans (default order from computeChampionStats)
  //   • winRate: filtered to ≥3 games of evidence, sorted by WR desc
  const allStats = useMemo(
    () => computeChampionStats(tournament),
    [tournament],
  );
  const byPresence = useMemo(
    () =>
      allStats
        .filter((s) => s.picks + s.bans > 0)
        .slice(0, 10),
    [allStats],
  );
  const byWinRate = useMemo(() => {
    const MIN_GAMES = 3;
    return allStats
      .filter((s) => s.wins + s.losses >= MIN_GAMES && s.winRate != null)
      .slice() // copy before sort
      .sort((a, b) => {
        // WR desc; tiebreak by sample size desc, then by id asc.
        const wrA = a.winRate ?? 0;
        const wrB = b.winRate ?? 0;
        if (wrA !== wrB) return wrB - wrA;
        const gA = a.wins + a.losses;
        const gB = b.wins + b.losses;
        if (gA !== gB) return gB - gA;
        return a.championId - b.championId;
      })
      .slice(0, 10);
  }, [allStats]);

  // Best KDA across the tournament — sums per-game KDA from each game's
  // recap (which captures per-pick KDA at game end) and ranks champions by
  // (K+A)/max(1,D). Gated by min 2 games so a single 12/0/5 stomp doesn't
  // dominate the leaderboard. Sample-weighted secondary sort surfaces
  // champions whose KDA was earned over multiple games.
  const bestKDA = useMemo(() => {
    const rows = computeChampionKDAStats(tournament);
    const MIN_GAMES = 2;
    return rows
      .filter((r) => r.games >= MIN_GAMES)
      .sort((a, b) => {
        if (b.kda !== a.kda) return b.kda - a.kda;
        if (b.games !== a.games) return b.games - a.games;
        return a.championId - b.championId;
      })
      .slice(0, 10);
  }, [tournament]);

  // "Best WR among most played" — rank by sample size first (top 12 by
  // games), then re-sort by WR. Surfaces the champions whose strong
  // performance was earned over many games rather than via small-sample
  // luck. Distinct from `byWinRate` which sorts the full pool by WR.
  const byMostPlayedThenWR = useMemo(() => {
    const POOL = 12;
    const candidates = allStats
      .filter((s) => s.wins + s.losses > 0 && s.winRate != null)
      .slice()
      .sort((a, b) => {
        const gA = a.wins + a.losses;
        const gB = b.wins + b.losses;
        return gB - gA;
      })
      .slice(0, POOL);
    candidates.sort((a, b) => {
      const wrA = a.winRate ?? 0;
      const wrB = b.winRate ?? 0;
      if (wrA !== wrB) return wrB - wrA;
      const gA = a.wins + a.losses;
      const gB = b.wins + b.losses;
      return gB - gA;
    });
    return candidates.slice(0, 8);
  }, [allStats]);

  // Notable games — pick the fastest, longest, and biggest comeback across
  // every recapped game in the tournament. Clicking a card deep-links to
  // the per-match replay modal at that game index. Each is independent;
  // the same game can occupy multiple slots (e.g. shortest game also being
  // a comeback).
  const notableGames = useMemo(
    () => computeNotableGames(tournament),
    [tournament],
  );

  return (
    <div className="mb-6 md:mb-8 space-y-4 md:space-y-5">
      <SummaryCard
        summary={summary}
        tournament={tournament}
        champion={champion}
        byId={byId}
      />
      <AwardsPanel tournament={tournament} />
      <MetaShiftPanel tournament={tournament} byId={byId} />
      {notableGames.any && (
        <NotableGamesPanel
          notable={notableGames}
          tournament={tournament}
          onViewGame={onViewGame}
        />
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
        <PresenceTable rows={byPresence} byId={byId} />
        <WinRateTable
          title="Win Rate"
          subtitle="Min 3 games"
          rows={byWinRate}
          byId={byId}
          emptyMessage="No champion has played 3+ games yet"
        />
      </div>
      <WinRateTable
        title="Best WR Among Most Played"
        subtitle="Sample-weighted: WR earned across many games"
        rows={byMostPlayedThenWR}
        byId={byId}
        emptyMessage="Not enough data yet"
      />
      <BestKDATable rows={bestKDA} byId={byId} />
      <ChampionSearchPanel tournament={tournament} byId={byId} />
      <TeamBreakdownPanel tournament={tournament} byId={byId} />
    </div>
  );
}
