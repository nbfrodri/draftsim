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
  computeStageMvp,
  type AllProPlayer,
  type PlayerAward,
  type SpecialAward,
} from "../awards";
import type { Lane, PlayerTier } from "../types";
import { playerForLane, LANE_ORDER } from "../players";
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

/** `kind` = the season phase the tournament belongs to (legacy saves may not
 *  tag the tournament itself), so the MVP matches every other surface. */
export function computeStageStats(
  t: TournamentState,
  kind?: "split" | "international",
): StageStats {
  const placements = tournamentPlacements(t);
  const awards = computeTournamentAwards(kind ? { ...t, seasonStageKind: kind } : t);
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

// ─── International event MVPs ───────────────────────────────────────────────
// Per international event (First Stand / MSI / Worlds / Global Cup), the MVP —
// the best average-rated player on the CHAMPION team across the whole event.
// Computed from the event's MAIN tournament (the one whose champion is the
// event champion).

export interface SeasonIntlMvp {
  event: InternationalId;
  mvp: PlayerAward;
}

export function computeSeasonIntlMvps(
  season: SeasonState,
  eventFilter?: InternationalId,
): SeasonIntlMvp[] {
  const out: SeasonIntlMvp[] = [];
  for (const phase of season.phases) {
    if (phase.kind !== "international" || !phase.event) continue;
    const event = phase.event;
    if (eventFilter && event !== eventFilter) continue;
    const champId = season.intlResults[event]?.[0] ?? null;
    let chosen: PlayerAward | null = null;
    // Prefer the tournament whose champion IS the event champion (skips play-ins).
    for (const tid of phase.tournamentIds) {
      const t = season.tournaments[tid];
      if (!t) continue;
      if (champId && tournamentChampion(t)?.id === champId) {
        chosen = computeStageMvp(t, "international");
        if (chosen) break;
      }
    }
    // Fall back to the last tournament in the phase with a decided final.
    if (!chosen) {
      for (const tid of [...phase.tournamentIds].reverse()) {
        const t = season.tournaments[tid];
        if (!t) continue;
        const mvp = computeStageMvp(t, "international");
        if (mvp) {
          chosen = mvp;
          break;
        }
      }
    }
    if (chosen) out.push({ event, mvp: chosen });
  }
  return out;
}

// ─── Split MVPs (per region league) ─────────────────────────────────────────
// The finals MVP of each domestic split, per league — a player from the split
// CHAMPION, judged on the split final. International MVPs instead use the whole event.

export interface SeasonSplitMvp {
  split: SplitId;
  leagueId: LeagueId;
  mvp: PlayerAward;
}

export function computeSeasonSplitMvps(season: SeasonState): SeasonSplitMvp[] {
  const leagueOfTeam = new Map(season.teams.map((t) => [t.id, t.leagueId]));
  const out: SeasonSplitMvp[] = [];
  for (const phase of season.phases) {
    if (phase.kind !== "split" || !phase.split) continue;
    const split = phase.split;
    for (const tid of phase.tournamentIds) {
      const t = season.tournaments[tid];
      if (!t) continue;
      const mvp = computeStageMvp(t, "split");
      if (!mvp) continue;
      const leagueId = leagueOfTeam.get(mvp.teamId);
      if (!leagueId) continue;
      out.push({ split, leagueId, mvp });
    }
  }
  return out;
}

// ─── Rookie of the Year (per lane) ───────────────────────────────────────────
// One winner per lane among players whose debutYear matches this season's
// franchise year. Scored by international + split titles, then average grade.

export interface SeasonRookieOfYearCandidate {
  lane: Lane;
  playerId: string;
  playerName: string;
  teamId: string;
  avgRating: number;
  games: number;
  splitTitles: number;
  intlTitles: number;
  score: number;
}

function seasonFranchiseYear(season: SeasonState): number | undefined {
  if (season.franchise?.year != null) return season.franchise.year;
  const m = season.name.match(/Year (\d+)\s*$/);
  return m ? Number(m[1]) : undefined;
}

function rookieScore(
  splitTitles: number,
  intlTitles: number,
  avgRating: number,
): number {
  return intlTitles * 12 + splitTitles * 3 + avgRating * 2;
}

export function computeSeasonRookiesOfYear(
  season: SeasonState,
): SeasonRookieOfYearCandidate[] {
  const year = seasonFranchiseYear(season);
  if (year == null) return [];
  const achv = computePlayerTitleCounts(season);
  const recordById = new Map(
    computePlayerCareerRecords(season).map((r) => [r.playerId, r]),
  );
  const byLane = new Map<Lane, SeasonRookieOfYearCandidate>();
  for (const t of season.teams) {
    for (const p of t.players) {
      if (!p.id || p.debutYear !== year) continue;
      const rec = recordById.get(p.id);
      if (!rec || rec.games <= 0 || (rec.ratingGames ?? 0) <= 0) continue;
      const a = achv.get(p.id) ?? { split: 0, intlTitles: 0, intlApps: 0 };
      const avg =
        rec && (rec.ratingGames ?? 0) > 0
          ? (rec.ratingSum ?? 0) / (rec.ratingGames ?? 1)
          : 0;
      if (!Number.isFinite(avg)) continue;
      const splitTitles = a.split;
      const intlTitles = a.intlTitles;
      const score = rookieScore(splitTitles, intlTitles, avg);
      const cur = byLane.get(p.lane);
      if (
        !cur ||
        score > cur.score ||
        (score === cur.score && avg > cur.avgRating)
      ) {
        byLane.set(p.lane, {
          lane: p.lane,
          playerId: p.id,
          playerName: p.name ?? p.id,
          teamId: t.id,
          avgRating: avg,
          games: rec?.ratingGames ?? rec?.games ?? 0,
          splitTitles,
          intlTitles,
          score,
        });
      }
    }
  }
  return LANE_ORDER.filter((lane) => byLane.has(lane)).map(
    (lane) => byLane.get(lane)!,
  );
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
    playerId?: string | null; // their stable id, when the recap carried one
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
    tier: PlayerTier | null; // the player's skill tier, from the roster
    playerName: string | null; // in-game handle, when present on the roster
    playerId?: string; // stable id of the earner, when recaps recorded one
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
    playerId?: string;
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
  // Games WON (decided games where this player's side took the game). The
  // denominator for win rate is `games` (every recorded game is decided).
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  avgRating: number | null;
  // Raw rating accumulators kept alongside the average so careers can
  // re-average correctly across seasons (a plain mean-of-means would be wrong).
  ratingSum: number;
  ratingGames: number;
  // End-of-game lane gold differential, summed from each player's own
  // perspective (+ ahead of their lane opponent), and the games it covers.
  goldDiffSum: number;
  goldDiffGames: number;
  mvps: number;
  pentakills: number;
}

export interface PlayerLeaders {
  byKills: PlayerSeasonLine[];
  byRating: PlayerSeasonLine[]; // min games applied
  byMVP: PlayerSeasonLine[];
  byPentakills: PlayerSeasonLine[];
}

/** Resolve a GAME's side to the actual team id. Sides swap between games of a
 *  series (the loser-blue rule), so a game's blue side is NOT necessarily the
 *  match's nominal blue team — match the game's blue-side team NAME back to the
 *  match to find the real team. Used by every per-game, side-keyed stat (player
 *  lines, MVPs, records); without it, swapped games credit the wrong team. */
export function gameSideTeamId(
  matchBlueTeamId: string,
  matchRedTeamId: string,
  matchBlueTeamName: string,
  matchRedTeamName: string,
  gameBlueTeamName: string,
  side: "blue" | "red",
): string {
  // Swap ONLY when the game's blue side positively matches the match's red
  // team. If the game name matches the blue team (normal) — or matches neither
  // (corrupt/renamed data) — keep the nominal sides, the safer default.
  const swapped =
    gameBlueTeamName === matchRedTeamName &&
    gameBlueTeamName !== matchBlueTeamName;
  const blueId = swapped ? matchRedTeamId : matchBlueTeamId;
  const redId = swapped ? matchBlueTeamId : matchRedTeamId;
  return side === "blue" ? blueId : redId;
}

/** Aggregate every completed game's recap by player id. Returns one line per
 *  player who has at least one rated/recorded game this season. */
export function computePlayerSeasonLines(season: SeasonState): PlayerSeasonLine[] {
  const teamNameById = new Map(season.teams.map((t) => [t.id, t.name]));
  type Agg = Omit<PlayerSeasonLine, "avgRating">;
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
        wins: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
        ratingSum: 0,
        ratingGames: 0,
        goldDiffSum: 0,
        goldDiffGames: 0,
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
        if (!m.blueTeamId || !m.redTeamId) continue;
        // Sides swap between games of a series (loser-blue), so resolve the
        // GAME's side to the actual team — a swapped game would otherwise credit
        // every player to the wrong team. See gameSideTeamId.
        const matchBlueName = teamNameById.get(m.blueTeamId) ?? m.blueTeamId;
        const matchRedName = teamNameById.get(m.redTeamId) ?? m.redTeamId;
        for (const side of ["blue", "red"] as const) {
          const teamId = gameSideTeamId(
            m.blueTeamId,
            m.redTeamId,
            matchBlueName,
            matchRedName,
            g.blueTeam,
            side,
          );
          const ids = recap.perPickIds[side];
          const names = recap.perPickNames?.[side];
          const kda = recap.perPickKDA?.[side];
          const ratings = recap.ratings?.[side];
          for (let li = 0; li < POS_LANES.length; li++) {
            const id = ids[li];
            if (!id) continue;
            const row = ensure(id, names?.[li] ?? "", teamId, POS_LANES[li]);
            row.games += 1;
            // The recap's blue/red frame matches the game's winner frame, so
            // this side won iff g.winner names it (see computePlayerChampStats).
            if (g.winner === side) row.wins += 1;
            if (kda?.[li]) {
              row.kills += kda[li].k;
              row.deaths += kda[li].d;
              row.assists += kda[li].a;
            }
            const r = ratings?.[li];
            if (typeof r === "number" && Number.isFinite(r)) {
              row.ratingSum += r;
              row.ratingGames += 1;
            }
            // Lane gold diff is stored blue-positive; flip for the red side so
            // it reads from THIS player's perspective (+ = ahead of their lane).
            const gd = recap.laneGoldDiff?.[POS_LANES[li]];
            if (typeof gd === "number" && Number.isFinite(gd)) {
              row.goldDiffSum += side === "blue" ? gd : -gd;
              row.goldDiffGames += 1;
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

  return [...rows.values()].map((r) => ({
    ...r,
    avgRating: r.ratingGames > 0 ? Math.round((r.ratingSum / r.ratingGames) * 10) / 10 : null,
  }));
}

function topN<T>(arr: T[], key: (x: T) => number, n = 10): T[] {
  return [...arr].sort((a, b) => key(b) - key(a)).slice(0, n);
}

// ─── Per-player champion pools ──────────────────────────────────────────────
// One player's record on one champion. Champion picks live on the GameDraft
// (bluePicks/redPicks + roles), joined to the player by lane via the recap's
// perPickIds. Within a single game the draft's blue/red and the recap's
// blue/red share the same frame (the loser-blue side swap is between GAMES, not
// within one), so no swap resolution is needed here.
export interface PlayerChampStat {
  championId: number;
  games: number;
  wins: number;
}

/** Every champion played in the season, with exact games and wins.
 * Kept complete when archiving so career pools never lose less-played picks. */
export function computePlayerChampStats(
  season: SeasonState,
): Map<string, PlayerChampStat[]> {
  // playerId → championId → [games, wins]
  const byPlayer = new Map<string, Map<number, { games: number; wins: number }>>();
  const bump = (pid: string, champ: number, won: boolean) => {
    let champs = byPlayer.get(pid);
    if (!champs) {
      champs = new Map();
      byPlayer.set(pid, champs);
    }
    const cur = champs.get(champ) ?? { games: 0, wins: 0 };
    cur.games += 1;
    if (won) cur.wins += 1;
    champs.set(champ, cur);
  };
  for (const t of Object.values(season.tournaments)) {
    for (const m of t.matches) {
      if (m.isBye || !m.series) continue;
      for (const g of m.series.games) {
        if (g.status !== "complete" || g.winner == null) continue;
        const ids = g.recap?.perPickIds;
        if (!ids) continue;
        for (const side of ["blue", "red"] as const) {
          const picks = side === "blue" ? g.bluePicks : g.redPicks;
          const roles = side === "blue" ? g.blueRoles : g.redRoles;
          const sideIds = ids[side];
          const won = g.winner === side;
          for (let i = 0; i < picks.length; i++) {
            const champ = picks[i];
            const lane = roles[i];
            if (champ == null || lane == null) continue;
            const pid = sideIds[POS_LANES.indexOf(lane)];
            if (!pid) continue;
            bump(pid, champ, won);
          }
        }
      }
    }
  }
  const out = new Map<string, PlayerChampStat[]>();
  for (const [pid, champs] of byPlayer) {
    const rows = [...champs.entries()]
      .map(([championId, v]) => ({ championId, games: v.games, wins: v.wins }))
      .sort((a, b) => b.games - a.games || b.wins - a.wins || a.championId - b.championId);
    out.set(pid, rows);
  }
  return out;
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
  // The lane the player occupied this season — fixed per player, so the Hall
  // can rank all-time bests per role. Optional: archives saved before this
  // existed have no lane (those careers fall out of the per-role boards).
  lane?: Lane;
  games: number;
  // Games won this season. Optional — archives saved before this existed have
  // no win record (their careers fall back to the champion-pool win tally).
  wins?: number;
  kills: number;
  mvps: number;
  // Scoped total on new archives; older archives may contain an unscoped
  // tournament total. Read history through archivedAllProCounts.
  allPro: number;
  // Per-league domestic split All-Pro selections this season. Optional — only on seasons
  // archived after the All-Pro-team expansion.
  allProSplit?: number;
  /** Cross-region split selections; absent in legacy archives. */
  allProGlobalSplit?: number;
  // 1 if the player made this season's GLOBAL All-Pro Team of the Year, else 0.
  // Optional, as above.
  allProSeason?: number;
  // International-event finals MVPs this season (First Stand / MSI / Worlds).
  // Optional — only on seasons archived after the intl-MVP expansion.
  intlMvps?: number;
  // Domestic split finals MVPs this season (per region league). Optional, as above.
  splitMvps?: number;
  // The player's age that season (end-of-season roster). Optional — only when
  // the roster carried an age.
  age?: number;
  // The player's champion pool this season (most-played first, capped). Optional.
  champs?: PlayerChampStat[];
  splitTitles: number;
  intlAppearances: number;
  intlTitles: number;
  // Richer per-game stats for the Hall's career profiles. Optional so archives
  // saved before this existed stay valid (the career view shows "—" for them).
  deaths?: number;
  assists?: number;
  pentakills?: number;
  ratingSum?: number;
  ratingGames?: number;
  goldDiffSum?: number;
  goldDiffGames?: number;
}

// Attribute titles/appearances to the players who were ON the champion's
// MAIN roster AT that stage (via phaseRosters), NOT their end-of-season team —
// a player who wins a split then transfers mid-season keeps the title they
// actually won, and an academy / free-agent player never inherits a trophy his
// org lifted without him. Only a season with NO snapshots at all (legacy saves
// predating phaseRosters) falls back to the current roster; once a season
// records stages, a missing stage means "nobody was rostered for it", not
// "credit whoever is here now". Exported for direct testing without a full
// simulated-tournament fixture.
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
    const snap = snaps.find(match);
    const roster = snap
      ? snap.teams.find((t) => t.teamId === teamId)?.players
      : snaps.length > 0
        ? undefined
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
    if (!season.phases?.some(p => p.kind === "split" && p.tournamentIds.includes(t.id))) continue;
    for (const ap of computeStageStats(t).allPro) {
      if (ap.playerId) allProById.set(ap.playerId, (allProById.get(ap.playerId) ?? 0) + 1);
    }
  }
  const leagueOf = new Map(season.teams.map((t) => [t.id, t.leagueId]));
  const nameOfTeam = new Map(season.teams.map((t) => [t.id, t.name]));
  const ageOf = new Map<string, number>();
  for (const t of season.teams) {
    for (const p of t.players) if (p.id && p.age != null) ageOf.set(p.id, p.age);
  }
  const champStats = computePlayerChampStats(season);
  return lines.map((l) => {
    const teamId = teamOfPlayer.get(l.playerId) ?? l.teamId;
    const a = achv.get(l.playerId) ?? { split: 0, intlTitles: 0, intlApps: 0 };
    const age = ageOf.get(l.playerId);
    const champs = champStats.get(l.playerId);
    return {
      playerId: l.playerId,
      playerName: l.playerName,
      leagueId: leagueOf.get(teamId) ?? null,
      teamName: nameOfTeam.get(teamId) ?? l.teamName,
      lane: l.lane,
      games: l.games,
      wins: l.wins,
      kills: l.kills,
      mvps: l.mvps,
      allPro: allProById.get(l.playerId) ?? 0,
      ...(age != null ? { age } : {}),
      ...(champs && champs.length > 0 ? { champs } : {}),
      splitTitles: a.split,
      intlAppearances: a.intlApps,
      intlTitles: a.intlTitles,
      deaths: l.deaths,
      assists: l.assists,
      pentakills: l.pentakills,
      ratingSum: l.ratingSum,
      ratingGames: l.ratingGames,
      goldDiffSum: l.goldDiffSum,
      goldDiffGames: l.goldDiffGames,
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
      playerId: string | null;
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
      // Who actually earned the MVPs in this slot (by recap name), so a player
      // who transferred away still gets credited rather than the slot's current
      // occupant.
      nameCounts: Map<string, number>;
      idCounts: Map<string, number>;
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
  const tierOf = (teamId: string, lane: Lane): PlayerTier | null => {
    const team = season.teams.find((t) => t.id === teamId);
    return playerForLane(team?.players, lane)?.tier ?? null;
  };
  const playerNameOf = (teamId: string, lane: Lane): string | null => {
    const team = season.teams.find((t) => t.id === teamId);
    return playerForLane(team?.players, lane)?.name ?? null;
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
        if (!m.blueTeamId || !m.redTeamId) continue;
        // blueName/redName are match-level; the g* values are the correct
        // per-game attribution once side-swaps (loser-blue) are accounted for.
        const gBlueId = gameSideTeamId(m.blueTeamId, m.redTeamId, blueName, redName, g.blueTeam, "blue");
        const gRedId = gameSideTeamId(m.blueTeamId, m.redTeamId, blueName, redName, g.blueTeam, "red");
        const gBlueName = nameOf(gBlueId);
        const gRedName = nameOf(gRedId);
        for (const p of recap.pentakills ?? []) {
          const key = `${p.championId}:${p.teamName}`;
          const pentaName =
            p.lane && recap.perPickNames
              ? recap.perPickNames[p.side]?.[POS_LANES.indexOf(p.lane)] ?? null
              : null;
          const pentaId =
            p.lane && recap.perPickIds
              ? recap.perPickIds[p.side]?.[POS_LANES.indexOf(p.lane)] ?? null
              : null;
          const row = pentaRows.get(key) ?? {
            championId: p.championId,
            championName: p.championName,
            teamName: p.teamName,
            playerName: pentaName,
            playerId: pentaId,
            count: 0,
            laneCounts: new Map<Lane, number>(),
            earliestMinute: Infinity,
          };
          if (pentaName) row.playerName = pentaName; // prefer any identified name
          if (pentaId) row.playerId = pentaId;
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
              winnerTeam: net > 0 ? gBlueName : gRedName,
              loserTeam: net > 0 ? gRedName : gBlueName,
            };
          }
        }
        // Records — only from fields that survive persistence.
        const mins = recap.durationMinutes;
        if (typeof mins === "number" && mins > 0) {
          if (!records.longestGame || mins > records.longestGame.minutes) {
            records.longestGame = { minutes: mins, blueTeam: gBlueName, redTeam: gRedName };
          }
          if (!records.shortestGame || mins < records.shortestGame.minutes) {
            records.shortestGame = { minutes: mins, blueTeam: gBlueName, redTeam: gRedName };
          }
        }
        const mvp = recap.mvp;
        if (mvp && (!records.bestMvp || mvp.kills > records.bestMvp.kills)) {
          records.bestMvp = {
            championId: mvp.championId,
            teamName: mvp.side === "blue" ? gBlueName : gRedName,
            ...(mvp.playerName ? { playerName: mvp.playerName } : {}),
            ...(mvp.playerId ? { playerId: mvp.playerId } : {}),
            lane: mvp.lane,
            kills: mvp.kills,
            deaths: mvp.deaths,
            assists: mvp.assists,
          };
        }
        // MVP leaderboard: credit the roster slot (team + lane) that earned it.
        const mvpTeamId = mvp
          ? mvp.side === "blue"
            ? gBlueId
            : gRedId
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
              nameCounts: new Map<string, number>(),
              idCounts: new Map<string, number>(),
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
          if (mvp.playerName) {
            row.nameCounts.set(
              mvp.playerName,
              (row.nameCounts.get(mvp.playerName) ?? 0) + 1,
            );
          }
          if (mvp.playerId) {
            row.idCounts.set(
              mvp.playerId,
              (row.idCounts.get(mvp.playerId) ?? 0) + 1,
            );
          }
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
            teamName: swing.side === "blue" ? gBlueName : gRedName,
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
        playerId: r.playerId ?? null,
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
      // The actual MVP earner for this slot (most-frequent recap name), falling
      // back to the current roster occupant only when no name was recorded.
      let earner: string | null = null;
      let earnerBest = 0;
      for (const [name, c] of r.nameCounts) {
        if (c > earnerBest) {
          earnerBest = c;
          earner = name;
        }
      }
      let earnerId: string | undefined;
      let earnerIdBest = 0;
      for (const [id, c] of r.idCounts) {
        if (c > earnerIdBest) {
          earnerIdBest = c;
          earnerId = id;
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
        playerName: earner ?? playerNameOf(r.teamId, r.lane),
        ...(earnerId ? { playerId: earnerId } : {}),
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

/** Per-stage slice of a franchise head-to-head within one season. */
export interface SeasonHeadToHeadScopeRow {
  scope: SplitId | InternationalId;
  meetings: number;
  aWins: number;
  bWins: number;
}

/** One franchise pairing's full season ledger (splits + internationals). */
export interface SeasonHeadToHeadRow {
  teamAId: string;
  teamBId: string;
  meetings: number;
  aWins: number;
  bWins: number;
  byScope: SeasonHeadToHeadScopeRow[];
}

/** Every franchise pairing that met at least once this year, with a
 *  per-stage breakdown (domestic splits and each international). Unlike
 *  `computeSeasonStats().rivalries`, this includes single meetings and
 *  is not capped to the top pairings — intended for Hall archive + compare. */
export function computeSeasonHeadToHead(season: SeasonState): SeasonHeadToHeadRow[] {
  const scopeOfTournament = new Map<string, SplitId | InternationalId>();
  for (const phase of season.phases ?? []) {
    if (phase.kind === "split" && phase.split) {
      for (const tid of phase.tournamentIds)
        scopeOfTournament.set(tid, phase.split);
    } else if (phase.kind === "international" && phase.event) {
      for (const tid of phase.tournamentIds)
        scopeOfTournament.set(tid, phase.event);
    }
  }

  type ScopeBucket = { meetings: number; aWins: number; bWins: number };
  type PairBucket = {
    teamAId: string;
    teamBId: string;
    meetings: number;
    aWins: number;
    bWins: number;
    scopes: Map<SplitId | InternationalId, ScopeBucket>;
  };
  const pairs = new Map<string, PairBucket>();

  const bump = (
    blueId: string,
    redId: string,
    winnerId: string,
    scope: SplitId | InternationalId | undefined,
  ) => {
    const [a, b] = [blueId, redId].sort();
    const pairKey = `${a}:${b}`;
    const row =
      pairs.get(pairKey) ??
      ({
        teamAId: a,
        teamBId: b,
        meetings: 0,
        aWins: 0,
        bWins: 0,
        scopes: new Map(),
      } satisfies PairBucket);
    row.meetings++;
    if (winnerId === a) row.aWins++;
    else row.bWins++;

    if (scope) {
      const s =
        row.scopes.get(scope) ??
        ({ meetings: 0, aWins: 0, bWins: 0 } satisfies ScopeBucket);
      s.meetings++;
      if (winnerId === a) s.aWins++;
      else s.bWins++;
      row.scopes.set(scope, s);
    }
    pairs.set(pairKey, row);
  };

  for (const t of Object.values(season.tournaments ?? {})) {
    const scope = scopeOfTournament.get(t.id);
    for (const m of t.matches) {
      if (!m.winner || !m.blueTeamId || !m.redTeamId) continue;
      bump(m.blueTeamId, m.redTeamId, m.winner.teamId, scope);
    }
  }

  return [...pairs.values()]
    .map((r) => ({
      teamAId: r.teamAId,
      teamBId: r.teamBId,
      meetings: r.meetings,
      aWins: r.aWins,
      bWins: r.bWins,
      byScope: [...r.scopes.entries()].map(([scope, s]) => ({ scope, ...s })),
    }))
    .sort(
      (a, b) =>
        b.meetings - a.meetings ||
        a.teamAId.localeCompare(b.teamAId) ||
        a.teamBId.localeCompare(b.teamBId),
    );
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
  /** When set, only games from these tournaments count toward averages. */
  onlyTournamentIds?: readonly string[],
): TeamGrades {
  const team = season.teams.find((t) => t.id === teamId);
  const roster = team?.players ?? [];
  const teamName = team?.name ?? "";
  // The player id currently in each lane slot (positional roster order). Notes
  // are attributed to the PLAYER who actually played (recap.perPickIds), then
  // mapped back to whoever holds the slot NOW — so a transferred-in player
  // shows THEIR own note, never the departed player's accumulated slot history.
  const idAt: (string | null)[] = [0, 1, 2, 3, 4].map((i) => roster[i]?.id ?? null);

  const pSum = new Map<string, number>();
  const pCnt = new Map<string, number>();
  const pLastSum = new Map<string, number>();
  const pLastCnt = new Map<string, number>();
  // Team-level totals (a team stat — independent of roster turnover).
  let totalSum = 0;
  let totalCount = 0;
  let lastTeamSum: number | null = null;
  let lastTeamCount: number | null = null;

  const bump = (id: string | null, m: Map<string, number>, by: number) => {
    if (id == null) return;
    m.set(id, (m.get(id) ?? 0) + by);
  };

  const onlySet =
    onlyTournamentIds && onlyTournamentIds.length > 0
      ? new Set(onlyTournamentIds)
      : null;
  const tids: string[] = [];
  for (const phase of season.phases) for (const id of phase.tournamentIds) {
    if (onlySet && !onlySet.has(id)) continue;
    tids.push(id);
  }

  for (const tid of tids) {
    const t = season.tournaments[tid];
    if (!t) continue;
    for (const match of t.matches) {
      if (match.isBye || !match.series) continue;
      if (match.blueTeamId !== teamId && match.redTeamId !== teamId) continue;
      const matchSum = new Map<string, number>();
      const matchCnt = new Map<string, number>();
      let matchTeamSum = 0;
      let matchTeamCount = 0;
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
        // Sides swap between games of a series, so resolve the team's side IN
        // THIS GAME by name (else swapped games read the opponent's notes).
        const gSide: "blue" | "red" =
          game.blueTeam === teamName
            ? "blue"
            : game.redTeam === teamName
              ? "red"
              : match.blueTeamId === teamId
                ? "blue"
                : "red";
        const notes = gSide === "blue" ? ratings.blue : ratings.red;
        const ids = recap.perPickIds?.[gSide];
        for (let i = 0; i < 5; i++) {
          const v = notes[i];
          if (typeof v !== "number" || !Number.isFinite(v)) continue;
          // Attribute to the actual player; fall back to the current slot only
          // for legacy recaps without perPickIds.
          const pid = ids?.[i] ?? idAt[i];
          bump(pid, pSum, v);
          bump(pid, pCnt, 1);
          bump(pid, matchSum, v);
          bump(pid, matchCnt, 1);
          totalSum += v;
          totalCount += 1;
          matchTeamSum += v;
          matchTeamCount += 1;
          matchHadRatings = true;
        }
      }
      // The LAST rated match overwrites each participating player's "last note".
      if (matchHadRatings) {
        for (const [pid, s] of matchSum) {
          pLastSum.set(pid, s);
          pLastCnt.set(pid, matchCnt.get(pid) ?? 0);
        }
        lastTeamSum = matchTeamSum;
        lastTeamCount = matchTeamCount;
      }
    }
  }

  const avg = idAt.map((id) => {
    const c = id != null ? pCnt.get(id) ?? 0 : 0;
    return c > 0 ? round1((pSum.get(id!) ?? 0) / c) : null;
  });
  const last = idAt.map((id) => {
    const c = id != null ? pLastCnt.get(id) ?? 0 : 0;
    return c > 0 ? round1((pLastSum.get(id!) ?? 0) / c) : null;
  });
  const teamAvg = totalCount > 0 ? round1(totalSum / totalCount) : null;
  const lastMatchAvg =
    lastTeamSum != null && lastTeamCount != null && lastTeamCount > 0
      ? round1(lastTeamSum / lastTeamCount)
      : null;

  return { avg, last, teamAvg, lastMatchAvg };
}
