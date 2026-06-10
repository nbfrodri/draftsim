// Season statistics — pure aggregations over the season's tournaments,
// built on the existing per-tournament stat machinery (champion stats,
// tournament summary, player awards). Powers the end-of-stage stat
// panels and the season-wide recap on the season dashboard.

import {
  computeChampionStats,
  computeTournamentSummary,
  tournamentChampion,
  type TournamentState,
  type TournamentSummary,
} from "../tournament";
import { computeTournamentAwards, type PlayerAward } from "../awards";
import { tournamentPlacements } from "./engine";
import {
  LEAGUE_IDS,
  type InternationalId,
  type LeagueId,
  type SeasonState,
  type SplitId,
} from "./types";

// ─── Per-stage stats ───────────────────────────────────────────────────────

export interface StageStats {
  tournamentId: string;
  name: string;
  championTeamId: string | null;
  runnerUpTeamId: string | null;
  summary: TournamentSummary;
  mvp: PlayerAward | null;
}

export function computeStageStats(t: TournamentState): StageStats {
  const placements = tournamentPlacements(t);
  const awards = computeTournamentAwards(t);
  return {
    tournamentId: t.id,
    name: t.name,
    championTeamId: tournamentChampion(t)?.id ?? null,
    runnerUpTeamId: placements[1] ?? null,
    summary: computeTournamentSummary(t),
    mvp: awards.mvp,
  };
}

// ─── Season-wide stats ─────────────────────────────────────────────────────

export interface SeasonChampionLine {
  championId: number;
  picks: number;
  bans: number;
  wins: number;
  losses: number;
  presence: number;
  winRate: number | null;
}

export interface SeasonTeamLine {
  teamId: string;
  wins: number;
  losses: number;
  titles: number; // split championships + international titles
}

export interface SeasonStats {
  totalMatches: number;
  totalGames: number;
  totalPicks: number;
  totalBans: number;
  // Highest picks+bans across every event of the year.
  mostContested: SeasonChampionLine | null;
  // Best win rate with a season-sized sample (≥ 8 games).
  bestWR: SeasonChampionLine | null;
  // Most match wins across the whole year.
  winningestTeam: SeasonTeamLine | null;
  // Most trophies (split titles + internationals).
  mostTitledTeam: SeasonTeamLine | null;
  // Title holders for quick display.
  splitChampions: Partial<Record<SplitId, Partial<Record<LeagueId, string>>>>;
  intlChampions: Partial<Record<InternationalId, string>>;
  // International titles won per league (region strength readout).
  leagueIntlTitles: Partial<Record<LeagueId, number>>;
}

const SEASON_MIN_WR_GAMES = 8;

export function computeSeasonStats(season: SeasonState): SeasonStats {
  let totalMatches = 0;
  let totalGames = 0;
  let totalPicks = 0;
  let totalBans = 0;
  const champRows = new Map<number, SeasonChampionLine>();
  const teamRows = new Map<string, SeasonTeamLine>();

  const ensureTeam = (teamId: string): SeasonTeamLine => {
    let r = teamRows.get(teamId);
    if (!r) {
      r = { teamId, wins: 0, losses: 0, titles: 0 };
      teamRows.set(teamId, r);
    }
    return r;
  };

  for (const t of Object.values(season.tournaments)) {
    const summary = computeTournamentSummary(t);
    totalMatches += summary.totalMatches;
    totalGames += summary.totalGames;
    totalPicks += summary.totalPicks;
    totalBans += summary.totalBans;
    for (const s of computeChampionStats(t)) {
      let row = champRows.get(s.championId);
      if (!row) {
        row = {
          championId: s.championId,
          picks: 0,
          bans: 0,
          wins: 0,
          losses: 0,
          presence: 0,
          winRate: null,
        };
        champRows.set(s.championId, row);
      }
      row.picks += s.picks;
      row.bans += s.bans;
      row.wins += s.wins;
      row.losses += s.losses;
    }
    for (const m of t.matches) {
      if (!m.winner) continue;
      const loserId =
        m.winner.teamId === m.blueTeamId ? m.redTeamId : m.blueTeamId;
      ensureTeam(m.winner.teamId).wins++;
      if (loserId) ensureTeam(loserId).losses++;
    }
  }
  for (const row of champRows.values()) {
    row.presence = row.picks + row.bans;
    const games = row.wins + row.losses;
    row.winRate = games > 0 ? row.wins / games : null;
  }

  // Titles: split champions + international champions.
  const splitChampions: SeasonStats["splitChampions"] = {};
  for (const [split, byLeague] of Object.entries(season.splitResults) as Array<
    [SplitId, Partial<Record<LeagueId, string[]>>]
  >) {
    const out: Partial<Record<LeagueId, string>> = {};
    for (const league of LEAGUE_IDS) {
      const first = byLeague[league]?.[0];
      if (first) {
        out[league] = first;
        ensureTeam(first).titles++;
      }
    }
    splitChampions[split] = out;
  }
  const intlChampions: SeasonStats["intlChampions"] = {};
  const leagueIntlTitles: SeasonStats["leagueIntlTitles"] = {};
  for (const [event, placements] of Object.entries(season.intlResults) as Array<
    [InternationalId, string[]]
  >) {
    const winner = placements[0];
    if (!winner) continue;
    intlChampions[event] = winner;
    ensureTeam(winner).titles++;
    const league = season.teams.find((t) => t.id === winner)?.leagueId;
    if (league) {
      leagueIntlTitles[league] = (leagueIntlTitles[league] ?? 0) + 1;
    }
  }

  let mostContested: SeasonChampionLine | null = null;
  let bestWR: SeasonChampionLine | null = null;
  for (const row of champRows.values()) {
    if (!mostContested || row.presence > mostContested.presence) {
      mostContested = row;
    }
    const games = row.wins + row.losses;
    if (games >= SEASON_MIN_WR_GAMES && row.winRate != null) {
      if (!bestWR || row.winRate > (bestWR.winRate ?? 0)) bestWR = row;
    }
  }
  let winningestTeam: SeasonTeamLine | null = null;
  let mostTitledTeam: SeasonTeamLine | null = null;
  for (const row of teamRows.values()) {
    if (!winningestTeam || row.wins > winningestTeam.wins) {
      winningestTeam = row;
    }
    if (
      row.titles > 0 &&
      (!mostTitledTeam || row.titles > mostTitledTeam.titles)
    ) {
      mostTitledTeam = row;
    }
  }

  return {
    totalMatches,
    totalGames,
    totalPicks,
    totalBans,
    mostContested: mostContested && mostContested.presence > 0 ? mostContested : null,
    bestWR,
    winningestTeam,
    mostTitledTeam,
    splitChampions,
    intlChampions,
    leagueIntlTitles,
  };
}
