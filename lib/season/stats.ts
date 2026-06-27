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
  type PhaseRosterSnapshot,
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
    playerName?: string | null; // the player who penta'd, when known
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
    playerName: string | null; // in-game handle, when present on the roster
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
  // Per-player leaderboards (by stable id): kills, rating, MVPs, pentakills.
  playerLeaders: PlayerLeaders;
}

export interface SeasonRecords {
  // Longest / shortest decided game of the year.
  longestGame: { minutes: number; blueTeam: string; redTeam: string } | null;
  shortestGame: { minutes: number; blueTeam: string; redTeam: string } | null;
  // The single best individual game (MVP with the most kills).
  bestMvp: {
    championId: number;
    teamName: string;
    playerName?: string;
    lane?: Lane;
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

// ─── Per-player season stats (by stable id) ─────────────────────────────────
// Now that players carry a stable id, we can aggregate a season BY PLAYER
// (across teams, if they transferred mid-year) rather than by roster slot.

const POS_LANES: Lane[] = ["top", "jungle", "middle", "bottom", "support"];
const PLAYER_MIN_RATING_GAMES = 8;

export interface PlayerSeasonLine {
  playerId: string;
  playerName: string;
  teamId: string; // most recent team seen this season
  teamName: string;
  lane: Lane;
  games: number;
  kills: number;
  deaths: number;
  assists: number;
  avgRating: number | null;
  mvps: number;
  pentakills: number;
}

export interface PlayerLeaders {
  byKills: PlayerSeasonLine[];
  byRating: PlayerSeasonLine[]; // min games applied
  byMVP: PlayerSeasonLine[];
  byPentakills: PlayerSeasonLine[];
}

/** Aggregate every completed game's recap by player id. Returns one line per
 *  player who has at least one rated/recorded game this season. */
export function computePlayerSeasonLines(season: SeasonState): PlayerSeasonLine[] {
  const teamNameById = new Map(season.teams.map((t) => [t.id, t.name]));
  type Agg = Omit<PlayerSeasonLine, "avgRating"> & { ratingSum: number; ratingCount: number };
  const rows = new Map<string, Agg>();
  const ensure = (id: string, name: string, teamId: string, lane: Lane): Agg => {
    let r = rows.get(id);
    if (!r) {
      r = {
        playerId: id,
        playerName: name,
        teamId,
        teamName: teamNameById.get(teamId) ?? teamId,
        lane,
        games: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
        ratingSum: 0,
        ratingCount: 0,
        mvps: 0,
        pentakills: 0,
      };
      rows.set(id, r);
    } else {
      // Track the most recent team/name seen (handles mid-season transfers).
      r.teamId = teamId;
      r.teamName = teamNameById.get(teamId) ?? teamId;
      if (name) r.playerName = name;
    }
    return r;
  };

  for (const t of Object.values(season.tournaments)) {
    for (const m of t.matches) {
      if (m.isBye || !m.series) continue;
      for (const g of m.series.games) {
        const recap = g.recap;
        if (!recap?.perPickIds) continue;
        for (const side of ["blue", "red"] as const) {
          const teamId = side === "blue" ? m.blueTeamId : m.redTeamId;
          if (!teamId) continue;
          const ids = recap.perPickIds[side];
          const names = recap.perPickNames?.[side];
          const kda = recap.perPickKDA?.[side];
          const ratings = recap.ratings?.[side];
          for (let li = 0; li < POS_LANES.length; li++) {
            const id = ids[li];
            if (!id) continue;
            const row = ensure(id, names?.[li] ?? "", teamId, POS_LANES[li]);
            row.games += 1;
            if (kda?.[li]) {
              row.kills += kda[li].k;
              row.deaths += kda[li].d;
              row.assists += kda[li].a;
            }
            const r = ratings?.[li];
            if (typeof r === "number" && Number.isFinite(r)) {
              row.ratingSum += r;
              row.ratingCount += 1;
            }
          }
        }
        if (recap.mvp?.playerId) {
          const r = rows.get(recap.mvp.playerId);
          if (r) r.mvps += 1;
        }
        for (const p of recap.pentakills ?? []) {
          if (!p.lane) continue;
          const li = POS_LANES.indexOf(p.lane);
          const id = li >= 0 ? recap.perPickIds[p.side]?.[li] : null;
          const r = id ? rows.get(id) : null;
          if (r) r.pentakills += 1;
        }
      }
    }
  }

  return [...rows.values()].map(({ ratingSum, ratingCount, ...rest }) => ({
    ...rest,
    avgRating: ratingCount > 0 ? Math.round((ratingSum / ratingCount) * 10) / 10 : null,
  }));
}

function topN<T>(arr: T[], key: (x: T) => number, n = 10): T[] {
  return [...arr].sort((a, b) => key(b) - key(a)).slice(0, n);
}

export function computePlayerLeaders(season: SeasonState): PlayerLeaders {
  const lines = computePlayerSeasonLines(season);
  return {
    byKills: topN(lines.filter((l) => l.kills > 0), (l) => l.kills),
    byRating: topN(
      lines.filter((l) => l.games >= PLAYER_MIN_RATING_GAMES && l.avgRating != null),
      (l) => l.avgRating ?? 0,
    ),
    byMVP: topN(lines.filter((l) => l.mvps > 0), (l) => l.mvps),
    byPentakills: topN(lines.filter((l) => l.pentakills > 0), (l) => l.pentakills),
  };
}

// One player's achievements in ONE season — archived per season so the Hall
// can aggregate true CAREERS by player id across seasons (and realities).
// Team honours are credited to the player's end-of-season team roster.
export interface PlayerSeasonRecord {
  playerId: string;
  playerName: string;
  leagueId: LeagueId | null;
  teamName?: string; // end-of-season team, for a logo in the career boards
  games: number;
  kills: number;
  mvps: number;
  allPro: number;
  splitTitles: number;
  intlAppearances: number;
  intlTitles: number;
}

// Attribute titles/appearances to the players who were ON the champion's
// roster AT that stage (via phaseRosters), NOT their end-of-season team — a
// player who wins a split then transfers mid-season keeps the title they
// actually won. Falls back to the current roster when no snapshot exists
// (legacy saves predating phaseRosters). Exported for direct testing without a
// full simulated-tournament fixture.
export function computePlayerTitleCounts(
  season: SeasonState,
): Map<string, { split: number; intlTitles: number; intlApps: number }> {
  const achv = new Map<string, { split: number; intlTitles: number; intlApps: number }>();
  const ensure = (id: string) => {
    let a = achv.get(id);
    if (!a) {
      a = { split: 0, intlTitles: 0, intlApps: 0 };
      achv.set(id, a);
    }
    return a;
  };
  const snaps = season.phaseRosters ?? [];
  const playersOnTeam = (
    teamId: string,
    match: (s: PhaseRosterSnapshot) => boolean,
  ): string[] => {
    const team = snaps.find(match)?.teams.find((t) => t.teamId === teamId);
    const roster = team
      ? team.players
      : season.teams.find((t) => t.id === teamId)?.players;
    return (roster ?? []).map((p) => p.id).filter((x): x is string => !!x);
  };
  for (const [split, byLeague] of Object.entries(season.splitResults)) {
    for (const order of Object.values(byLeague ?? {})) {
      const champ = order?.[0];
      if (champ)
        for (const pid of playersOnTeam(champ, (s) => s.split === split)) ensure(pid).split += 1;
    }
  }
  for (const [event, order] of Object.entries(season.intlResults)) {
    const champ = order?.[0];
    if (champ)
      for (const pid of playersOnTeam(champ, (s) => s.event === event)) ensure(pid).intlTitles += 1;
  }
  for (const phase of season.phases) {
    if (phase.kind !== "international") continue;
    const attended = new Set<string>();
    for (const tid of phase.tournamentIds) {
      for (const tt of season.tournaments[tid]?.teams ?? []) attended.add(tt.id);
    }
    for (const id of attended)
      for (const pid of playersOnTeam(id, (s) => s.event === phase.event)) ensure(pid).intlApps += 1;
  }
  return achv;
}

export function computePlayerCareerRecords(season: SeasonState): PlayerSeasonRecord[] {
  const lines = computePlayerSeasonLines(season);
  const teamOfPlayer = new Map<string, string>();
  for (const t of season.teams) {
    for (const p of t.players) if (p.id) teamOfPlayer.set(p.id, t.id);
  }
  const achv = computePlayerTitleCounts(season);
  const allProById = new Map<string, number>();
  for (const t of Object.values(season.tournaments)) {
    for (const ap of computeStageStats(t).allPro) {
      if (ap.playerId) allProById.set(ap.playerId, (allProById.get(ap.playerId) ?? 0) + 1);
    }
  }
  const leagueOf = new Map(season.teams.map((t) => [t.id, t.leagueId]));
  const nameOfTeam = new Map(season.teams.map((t) => [t.id, t.name]));
  return lines.map((l) => {
    const teamId = teamOfPlayer.get(l.playerId) ?? l.teamId;
    const a = achv.get(l.playerId) ?? { split: 0, intlTitles: 0, intlApps: 0 };
    return {
      playerId: l.playerId,
      playerName: l.playerName,
      leagueId: leagueOf.get(teamId) ?? null,
      teamName: nameOfTeam.get(teamId) ?? l.teamName,
      games: l.games,
      kills: l.kills,
      mvps: l.mvps,
      allPro: allProById.get(l.playerId) ?? 0,
      splitTitles: a.split,
      intlAppearances: a.intlApps,
      intlTitles: a.intlTitles,
    };
  });
}

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
      playerName: string | null;
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
  const playerNameOf = (teamId: string, lane: Lane): string | null => {
    const team = season.teams.find((t) => t.id === teamId);
    const player = team?.players[LANE_ORDER.indexOf(lane)];
    return player?.name ?? null;
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
          const pentaName =
            p.lane && recap.perPickNames
              ? recap.perPickNames[p.side]?.[POS_LANES.indexOf(p.lane)] ?? null
              : null;
          const row = pentaRows.get(key) ?? {
            championId: p.championId,
            championName: p.championName,
            teamName: p.teamName,
            playerName: pentaName,
            count: 0,
            laneCounts: new Map<Lane, number>(),
            earliestMinute: Infinity,
          };
          if (pentaName) row.playerName = pentaName; // prefer any identified name
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
            ...(mvp.playerName ? { playerName: mvp.playerName } : {}),
            lane: mvp.lane,
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
        playerName: r.playerName ?? null,
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
        playerName: playerNameOf(r.teamId, r.lane),
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
    playerLeaders: computePlayerLeaders(season),
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
