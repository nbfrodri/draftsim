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
import { computeGameRatings } from "../matchSimulator";
import {
  computeTournamentAwards,
  type AllProPlayer,
  type PlayerAward,
  type SpecialAward,
} from "../awards";
import type { Lane } from "../types";
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
  /** Best player per lane across the stage. */
  allPro: AllProPlayer[];
  /** Special recognitions (peak performance, consistency, …). */
  specials: SpecialAward[];
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
    allPro: awards.allPro,
    specials: awards.awards,
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
  // Each league's best team across the WHOLE year (splits +
  // internationals), by match wins (titles, then fewer losses, break
  // ties).
  leagueBestTeams: Partial<Record<LeagueId, SeasonTeamLine>>;
  // Pentakill leaderboard for the season — every solo-ace, grouped by the
  // champion + the team that scored it, sorted by count. Empty if none.
  pentakills: Array<{
    championId: number;
    championName: string;
    teamName: string;
    count: number;
    lane: Lane | null; // the lane they penta'd from (most common); legacy → null
    earliestMinute: number; // their fastest penta (minutes)
  }>;
  // Total pentakills across the season (sum of the above counts).
  totalPentakills: number;
  // How many distinct champions recorded a pentakill this year.
  uniquePentaChampions: number;
  // Season records / milestones — drawn only from recap fields that survive
  // persistence (durationMinutes, mvp, biggestSwing). Each is null until at
  // least one completed game supplies it.
  records: SeasonRecords;
  // Per-player MVP leaderboard — players are identified by team + lane (the
  // roster has no names), so this is "which roster slot earned the most Player-
  // of-the-Game nods this year". Sorted by count desc. Uses recap.mvp (survives
  // persistence). Empty until at least one game has an MVP.
  mvpLeaderboard: Array<{
    teamId: string;
    teamName: string;
    lane: Lane;
    count: number;
    topChampionId: number; // their most-MVP'd champion (for the icon)
    // Aggregate K/D/A across this slot's MVP games (for an avg-KDA readout).
    kills: number;
    deaths: number;
    assists: number;
    tier: string | null; // the player's skill tier, from the roster
  }>;
  // Rivalries — the team pairings that met most often this year, with their
  // head-to-head record. Sorted by meetings desc. Only pairs that met ≥ 2 times.
  rivalries: Array<{
    teamAId: string;
    teamAName: string;
    teamBId: string;
    teamBName: string;
    meetings: number;
    aWins: number;
    bWins: number;
  }>;
}

export interface SeasonRecords {
  // Longest / shortest decided game of the year.
  longestGame: { minutes: number; blueTeam: string; redTeam: string } | null;
  shortestGame: { minutes: number; blueTeam: string; redTeam: string } | null;
  // The single best individual game (MVP with the most kills).
  bestMvp: {
    championId: number;
    teamName: string;
    kills: number;
    deaths: number;
    assists: number;
  } | null;
  // The most dramatic single moment of the season (largest win-prob swing).
  biggestSwing: {
    minute: number;
    description: string;
    teamName: string;
    probDelta: number;
  } | null;
  // The most lopsided game (largest end-of-game team gold gap).
  biggestStomp: {
    goldLead: number; // absolute, in gold
    winnerTeam: string;
    loserTeam: string;
  } | null;
  // The fastest pentakill of the year (earliest minute).
  fastestPentakill: {
    minute: number;
    championId: number;
    championName: string;
    teamName: string;
  } | null;
}

const SEASON_MIN_WR_GAMES = 8;

export function computeSeasonStats(season: SeasonState): SeasonStats {
  let totalMatches = 0;
  let totalGames = 0;
  let totalPicks = 0;
  let totalBans = 0;
  const champRows = new Map<number, SeasonChampionLine>();
  const teamRows = new Map<string, SeasonTeamLine>();
  const pentaRows = new Map<
    string,
    {
      championId: number;
      championName: string;
      teamName: string;
      count: number;
      laneCounts: Map<Lane, number>;
      earliestMinute: number;
    }
  >();
  const teamNameById = new Map(season.teams.map((t) => [t.id, t.name]));
  const nameOf = (id: string | null | undefined) =>
    (id && teamNameById.get(id)) || id || "—";
  const records: SeasonRecords = {
    longestGame: null,
    shortestGame: null,
    bestMvp: null,
    biggestSwing: null,
    biggestStomp: null,
    fastestPentakill: null,
  };
  // MVP leaderboard rows keyed by `${teamId}:${lane}`, tracking total MVPs, a
  // per-champion tally (for the signature-pick icon) and aggregate K/D/A.
  const mvpRows = new Map<
    string,
    {
      teamId: string;
      lane: Lane;
      count: number;
      champCounts: Map<number, number>;
      kills: number;
      deaths: number;
      assists: number;
    }
  >();
  // Rivalry rows keyed by the sorted team-id pair → meetings + head-to-head.
  const rivalryRows = new Map<
    string,
    { teamAId: string; teamBId: string; meetings: number; aWins: number; bWins: number }
  >();
  const LANE_ORDER: Lane[] = ["top", "jungle", "middle", "bottom", "support"];
  const tierOf = (teamId: string, lane: Lane): string | null => {
    const team = season.teams.find((t) => t.id === teamId);
    const player = team?.players[LANE_ORDER.indexOf(lane)];
    return player?.tier ?? null;
  };

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
      // Walk every completed game's recap (kept on the match's series; survives
      // compaction) for pentakills AND season records.
      const blueName = nameOf(m.blueTeamId);
      const redName = nameOf(m.redTeamId);
      for (const g of m.series?.games ?? []) {
        const recap = g.recap;
        if (!recap) continue;
        for (const p of recap.pentakills ?? []) {
          const key = `${p.championId}:${p.teamName}`;
          const row = pentaRows.get(key) ?? {
            championId: p.championId,
            championName: p.championName,
            teamName: p.teamName,
            count: 0,
            laneCounts: new Map<Lane, number>(),
            earliestMinute: Infinity,
          };
          row.count++;
          if (p.lane) row.laneCounts.set(p.lane, (row.laneCounts.get(p.lane) ?? 0) + 1);
          row.earliestMinute = Math.min(row.earliestMinute, p.minute);
          pentaRows.set(key, row);
          // Fastest pentakill of the season.
          if (
            !records.fastestPentakill ||
            p.minute < records.fastestPentakill.minute
          ) {
            records.fastestPentakill = {
              minute: p.minute,
              championId: p.championId,
              championName: p.championName,
              teamName: p.teamName,
            };
          }
        }
        // Biggest stomp — largest end-of-game team gold gap (net lane gold,
        // blue-positive). laneGoldDiff survives persistence.
        if (recap.laneGoldDiff) {
          let net = 0;
          for (const l of LANE_ORDER) net += recap.laneGoldDiff[l] ?? 0;
          const gap = Math.abs(net);
          if (gap > 0 && (!records.biggestStomp || gap > records.biggestStomp.goldLead)) {
            records.biggestStomp = {
              goldLead: Math.round(gap),
              winnerTeam: net > 0 ? blueName : redName,
              loserTeam: net > 0 ? redName : blueName,
            };
          }
        }
        // Records — only from fields that survive persistence.
        const mins = recap.durationMinutes;
        if (typeof mins === "number" && mins > 0) {
          if (!records.longestGame || mins > records.longestGame.minutes) {
            records.longestGame = { minutes: mins, blueTeam: blueName, redTeam: redName };
          }
          if (!records.shortestGame || mins < records.shortestGame.minutes) {
            records.shortestGame = { minutes: mins, blueTeam: blueName, redTeam: redName };
          }
        }
        const mvp = recap.mvp;
        if (mvp && (!records.bestMvp || mvp.kills > records.bestMvp.kills)) {
          records.bestMvp = {
            championId: mvp.championId,
            teamName: mvp.side === "blue" ? blueName : redName,
            kills: mvp.kills,
            deaths: mvp.deaths,
            assists: mvp.assists,
          };
        }
        // MVP leaderboard: credit the roster slot (team + lane) that earned it.
        const mvpTeamId = mvp
          ? mvp.side === "blue"
            ? m.blueTeamId
            : m.redTeamId
          : null;
        if (mvp && mvpTeamId) {
          const key = `${mvpTeamId}:${mvp.lane}`;
          const row =
            mvpRows.get(key) ??
            ({
              teamId: mvpTeamId,
              lane: mvp.lane,
              count: 0,
              champCounts: new Map<number, number>(),
              kills: 0,
              deaths: 0,
              assists: 0,
            });
          row.count++;
          row.kills += mvp.kills;
          row.deaths += mvp.deaths;
          row.assists += mvp.assists;
          row.champCounts.set(
            mvp.championId,
            (row.champCounts.get(mvp.championId) ?? 0) + 1,
          );
          mvpRows.set(key, row);
        }
        const swing = recap.biggestSwing;
        if (
          swing &&
          (!records.biggestSwing ||
            Math.abs(swing.probDelta) > Math.abs(records.biggestSwing.probDelta))
        ) {
          records.biggestSwing = {
            minute: swing.minute,
            description: swing.description,
            teamName: swing.side === "blue" ? blueName : redName,
            probDelta: swing.probDelta,
          };
        }
      }
      if (!m.winner) continue;
      const loserId =
        m.winner.teamId === m.blueTeamId ? m.redTeamId : m.blueTeamId;
      ensureTeam(m.winner.teamId).wins++;
      if (loserId) ensureTeam(loserId).losses++;
      // Rivalry head-to-head (keyed by the sorted pair so A-vs-B and B-vs-A
      // accumulate together).
      if (m.blueTeamId && m.redTeamId) {
        const [a, b] = [m.blueTeamId, m.redTeamId].sort();
        const key = `${a}:${b}`;
        const row =
          rivalryRows.get(key) ??
          ({ teamAId: a, teamBId: b, meetings: 0, aWins: 0, bWins: 0 });
        row.meetings++;
        if (m.winner.teamId === a) row.aWins++;
        else row.bWins++;
        rivalryRows.set(key, row);
      }
    }
  }
  const pentakills = [...pentaRows.values()]
    .map((r) => {
      let lane: Lane | null = null;
      let best = 0;
      for (const [l, c] of r.laneCounts) {
        if (c > best) {
          best = c;
          lane = l;
        }
      }
      return {
        championId: r.championId,
        championName: r.championName,
        teamName: r.teamName,
        count: r.count,
        lane,
        earliestMinute: Number.isFinite(r.earliestMinute) ? r.earliestMinute : 0,
      };
    })
    .sort((a, b) => b.count - a.count);
  const totalPentakills = pentakills.reduce((s, p) => s + p.count, 0);
  const uniquePentaChampions = new Set(pentakills.map((p) => p.championId)).size;
  const rivalries = [...rivalryRows.values()]
    .filter((r) => r.meetings >= 2)
    .map((r) => ({
      teamAId: r.teamAId,
      teamAName: nameOf(r.teamAId),
      teamBId: r.teamBId,
      teamBName: nameOf(r.teamBId),
      meetings: r.meetings,
      aWins: r.aWins,
      bWins: r.bWins,
    }))
    .sort((a, b) => b.meetings - a.meetings)
    .slice(0, 6);
  const mvpLeaderboard = [...mvpRows.values()]
    .map((r) => {
      let topChampionId = -1;
      let best = -1;
      for (const [cid, c] of r.champCounts) {
        if (c > best) {
          best = c;
          topChampionId = cid;
        }
      }
      return {
        teamId: r.teamId,
        teamName: nameOf(r.teamId),
        lane: r.lane,
        count: r.count,
        topChampionId,
        kills: r.kills,
        deaths: r.deaths,
        assists: r.assists,
        tier: tierOf(r.teamId, r.lane),
      };
    })
    .sort((a, b) => b.count - a.count);
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
  const leagueBestTeams: SeasonStats["leagueBestTeams"] = {};
  const leagueOf = new Map(season.teams.map((t) => [t.id, t.leagueId]));
  const beats = (a: SeasonTeamLine, b: SeasonTeamLine): boolean =>
    a.wins !== b.wins
      ? a.wins > b.wins
      : a.titles !== b.titles
        ? a.titles > b.titles
        : a.losses < b.losses;
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
    const league = leagueOf.get(row.teamId);
    if (league) {
      const cur = leagueBestTeams[league];
      if (!cur || beats(row, cur)) leagueBestTeams[league] = row;
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
    leagueBestTeams,
    pentakills,
    totalPentakills,
    uniquePentaChampions,
    records,
    mvpLeaderboard,
    rivalries,
  };
}

// ─── Per-player season grades ("notes") for one team ────────────────────────
// Walks every completed game the team played this season (across all
// tournaments, in phase order) and extracts that team's per-lane performance
// rating (1-10 "note") from each game recap. Returns, per positional lane:
//   • avg  — season average note (null until the player has a rated game)
//   • last — the player's note in their MOST RECENT match (averaged over that
//            match's games), so it reads as "last match grade", not last game.
// Plus team-level headline numbers (overall season avg and last-match avg).

export interface TeamGrades {
  avg: (number | null)[]; // per positional lane, length 5
  last: (number | null)[]; // per positional lane, most recent match
  teamAvg: number | null; // season average across all rated player-games
  lastMatchAvg: number | null; // team average in the most recent rated match
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function teamSeasonGrades(
  season: SeasonState,
  teamId: string,
): TeamGrades {
  const sums = [0, 0, 0, 0, 0];
  const counts = [0, 0, 0, 0, 0];
  // Per-lane note totals for the most recent rated match (averaged at the end).
  let lastMatchSums: number[] | null = null;
  let lastMatchCounts: number[] | null = null;

  const tids: string[] = [];
  for (const phase of season.phases) for (const id of phase.tournamentIds) tids.push(id);

  for (const tid of tids) {
    const t = season.tournaments[tid];
    if (!t) continue;
    for (const match of t.matches) {
      if (match.isBye || !match.series) continue;
      if (match.blueTeamId !== teamId && match.redTeamId !== teamId) continue;
      const side: "blue" | "red" =
        match.blueTeamId === teamId ? "blue" : "red";
      const matchSums = [0, 0, 0, 0, 0];
      const matchCounts = [0, 0, 0, 0, 0];
      let matchHadRatings = false;
      for (const game of match.series.games) {
        if (game.status !== "complete" || game.winner == null) continue;
        const recap = game.recap;
        if (!recap) continue;
        let ratings = recap.ratings ?? null;
        if (!ratings && recap.perPickKDA) {
          ratings = computeGameRatings(recap, game.winner);
        }
        if (!ratings) continue;
        const notes = side === "blue" ? ratings.blue : ratings.red;
        for (let i = 0; i < 5; i++) {
          const v = notes[i];
          if (typeof v !== "number" || !Number.isFinite(v)) continue;
          sums[i] += v;
          counts[i] += 1;
          matchSums[i] += v;
          matchCounts[i] += 1;
          matchHadRatings = true;
        }
      }
      // Overwrite each match so the final value is the LAST rated match.
      if (matchHadRatings) {
        lastMatchSums = matchSums;
        lastMatchCounts = matchCounts;
      }
    }
  }

  const avg = sums.map((s, i) => (counts[i] > 0 ? round1(s / counts[i]) : null));
  const last: (number | null)[] = [null, null, null, null, null];
  if (lastMatchSums && lastMatchCounts) {
    for (let i = 0; i < 5; i++) {
      last[i] =
        lastMatchCounts[i] > 0
          ? round1(lastMatchSums[i] / lastMatchCounts[i])
          : null;
    }
  }
  const totalSum = sums.reduce((a, b) => a + b, 0);
  const totalCount = counts.reduce((a, b) => a + b, 0);
  const teamAvg = totalCount > 0 ? round1(totalSum / totalCount) : null;
  const lastMatchAvg =
    lastMatchSums && lastMatchCounts
      ? (() => {
          const s = lastMatchSums.reduce((a, b) => a + b, 0);
          const c = lastMatchCounts.reduce((a, b) => a + b, 0);
          return c > 0 ? round1(s / c) : null;
        })()
      : null;

  return { avg, last, teamAvg, lastMatchAvg };
}
