// lib/awards.ts — Tournament MVP, All-Pro team, and per-tournament awards.
//
// All functions are pure (no side-effects, no imports from React/store).
// Players are identified as { teamId, lane } — the Player record in
// TournamentTeam.players has no name field, so display names are
// synthesized as "<TeamName> <Lane>" (e.g. "Dragons Top").

import type { Lane, Side } from "./types";
import type { TournamentState, TournamentTeam } from "./tournament";
import { tournamentChampion } from "./tournament";
import type { PlayerFormMap } from "./playerForm";
import { computeGameRatings } from "./matchSimulator";
import { LANE_ORDER } from "./players";

// ─── Public result types ──────────────────────────────────────────────────────

export interface PlayerAward {
  /** Unique player identity (team id + positional lane). */
  teamId: string;
  lane: Lane;
  /** Human-readable display name, e.g. "Dragons Top". */
  displayName: string;
  /** Team name (for display). */
  teamName: string;
  /** In-game handle (e.g. "Faker"). Null when roster has no name for this slot. */
  playerName?: string;
  /** Stable player id, for crediting careers across teams/seasons. */
  playerId?: string;
  /** Average rating across rated games (1-10 scale). */
  avgRating: number;
  /** Number of rated games this player played. */
  gamesPlayed: number;
}

export interface AllProPlayer extends PlayerAward {
  lane: Lane;
}

export interface SpecialAward {
  kind:
    | "performance"
    | "consistent"
    | "carry_losing"
    | "hottest_streak";
  title: string;
  /** One-line context: e.g. "9.4 in Game 3 vs Wolves". */
  context: string;
  player: PlayerAward;
}

export interface TournamentAwards {
  /** Best player across the whole tournament. Null when insufficient data. */
  mvp: PlayerAward | null;
  /** Best player per lane (top/jungle/mid/bot/support). Empty when no data. */
  allPro: AllProPlayer[];
  /** Special recognition awards, only when data supports them. */
  awards: SpecialAward[];
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

const LANES: readonly Lane[] = LANE_ORDER as readonly Lane[];
const LANE_INDEX: Record<Lane, number> = {
  top: 0,
  jungle: 1,
  middle: 2,
  bottom: 3,
  support: 4,
};

/** Lane → short display label (for single-line context strings). */
const LANE_LABEL: Record<Lane, string> = {
  top: "Top",
  jungle: "Jungle",
  middle: "Mid",
  bottom: "Bot",
  support: "Support",
};

interface PlayerStats {
  teamId: string;
  lane: Lane;
  teamName: string;
  playerName?: string;
  playerId?: string;
  ratings: number[];
  /** Max single-game rating recorded (with match context). */
  peakRating: number;
  peakContext: string; // e.g. "Game 3 vs Wolves"
}

/** Minimum rated games required for MVP / All-Pro eligibility. */
const MIN_RATED_GAMES_MVP = 3;
/** Minimum rated games required for "Most Consistent" award. */
const MIN_RATED_GAMES_CONSISTENT = 5;
/** Minimum average rating required for "Most Consistent" award. */
const MIN_AVG_CONSISTENT = 6;

// ─── Rating extraction ────────────────────────────────────────────────────────

/**
 * Walk every completed, non-bye match in the tournament and accumulate
 * per-player rating arrays.  For each game recap:
 *   1. Use recap.ratings if present.
 *   2. Fall back to computeGameRatings(recap, winner) when recap has
 *      perPickKDA but no ratings field (legacy recaps).
 *   3. Skip games with neither (fully manual resolution).
 */
function collectPlayerStats(
  tournament: TournamentState,
): Map<string, PlayerStats> {
  // key = `${teamId}:${lane}`
  const map = new Map<string, PlayerStats>();

  const ensurePlayer = (
    teamId: string,
    lane: Lane,
    teamName: string,
    playerName?: string,
    playerId?: string,
  ): PlayerStats => {
    const key = `${teamId}:${lane}`;
    if (!map.has(key)) {
      map.set(key, { teamId, lane, teamName, playerName, playerId, ratings: [], peakRating: 0, peakContext: "" });
    }
    return map.get(key)!;
  };

  for (const match of tournament.matches) {
    // Skip byes and unresolved matches.
    if (match.isBye || !match.winner || !match.series) continue;
    if (!match.blueTeamId || !match.redTeamId) continue;

    const blueTeam = tournament.teams.find((t) => t.id === match.blueTeamId);
    const redTeam = tournament.teams.find((t) => t.id === match.redTeamId);
    if (!blueTeam || !redTeam) continue;

    const { series } = match;

    for (const game of series.games) {
      if (game.status !== "complete" || game.winner == null) continue;
      const recap = game.recap;
      if (!recap) continue;

      // Resolve ratings for this game.
      let gameRatings = recap.ratings ?? null;
      if (!gameRatings && recap.perPickKDA) {
        gameRatings = computeGameRatings(recap, game.winner);
      }
      if (!gameRatings) continue;

      // Accumulate per-lane ratings for blue side.
      for (const lane of LANES) {
        const laneIdx = LANE_INDEX[lane];
        const blueRating = gameRatings.blue[laneIdx];
        if (typeof blueRating !== "number" || !Number.isFinite(blueRating)) continue;
        const ids = recap.perPickIds?.blue;
        const names = recap.perPickNames?.blue;
        const stats = ensurePlayer(
          blueTeam.id,
          lane,
          blueTeam.name,
          names?.[laneIdx] ?? blueTeam.players?.[laneIdx]?.name,
          ids?.[laneIdx] ?? blueTeam.players?.[laneIdx]?.id,
        );
        stats.ratings.push(blueRating);
        if (blueRating > stats.peakRating) {
          stats.peakRating = blueRating;
          stats.peakContext = `Game ${game.gameNumber} vs ${redTeam.name}`;
        }
      }

      // Accumulate per-lane ratings for red side.
      for (const lane of LANES) {
        const laneIdx = LANE_INDEX[lane];
        const redRating = gameRatings.red[laneIdx];
        if (typeof redRating !== "number" || !Number.isFinite(redRating)) continue;
        const ids = recap.perPickIds?.red;
        const names = recap.perPickNames?.red;
        const stats = ensurePlayer(
          redTeam.id,
          lane,
          redTeam.name,
          names?.[laneIdx] ?? redTeam.players?.[laneIdx]?.name,
          ids?.[laneIdx] ?? redTeam.players?.[laneIdx]?.id,
        );
        stats.ratings.push(redRating);
        if (redRating > stats.peakRating) {
          stats.peakRating = redRating;
          stats.peakContext = `Game ${game.gameNumber} vs ${blueTeam.name}`;
        }
      }
    }
  }

  return map;
}

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function stddev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const mean = avg(arr);
  const variance = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

/**
 * Round a number to one decimal place.
 */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function makePlayerAward(stats: PlayerStats): PlayerAward {
  return {
    teamId: stats.teamId,
    lane: stats.lane,
    displayName: `${stats.teamName} ${LANE_LABEL[stats.lane]}`,
    teamName: stats.teamName,
    ...(stats.playerName ? { playerName: stats.playerName } : {}),
    ...(stats.playerId ? { playerId: stats.playerId } : {}),
    avgRating: round1(avg(stats.ratings)),
    gamesPlayed: stats.ratings.length,
  };
}

// ─── How many games did a team play (including all series games)? ─────────────

function teamTotalGamesPlayed(
  tournament: TournamentState,
  teamId: string,
): number {
  let count = 0;
  for (const match of tournament.matches) {
    if (match.isBye || !match.winner || !match.series) continue;
    if (match.blueTeamId !== teamId && match.redTeamId !== teamId) continue;
    for (const game of match.series.games) {
      if (game.status === "complete") count++;
    }
  }
  return count;
}

// ─── MVP scoring formula ──────────────────────────────────────────────────────
//
// Score = avgRating × log2(1 + gamesPlayed)
//
// Why log2(1 + N):
//   • A player with 3 games rated 8.4 avg scores:  8.4 × log2(4) = 8.4 × 2.0 = 16.8
//   • A finalist with 12 games rated 8.1 avg scores: 8.1 × log2(13) ≈ 8.1 × 3.70 = 30.0
// The logarithm rewards depth while avoiding runaway scaling: doubling games
// only adds one extra multiplier unit.  The threshold of 3 rated games
// prevents noise from 1-2 game cameos dominating.

function mvpScore(avgRating: number, gamesPlayed: number): number {
  return avgRating * Math.log2(1 + gamesPlayed);
}

// ─── Main export ───────────────────────────────────────────────────────────────

/**
 * Compute the tournament MVP, All-Pro team, and special awards from a
 * completed (or in-progress) tournament.
 *
 * @param tournament  The TournamentState to analyse.
 * @param playerForms Optional flat form map from the store.  When provided
 *                    the "Hottest streak" award is included.
 */
export function computeTournamentAwards(
  tournament: TournamentState,
  playerForms?: PlayerFormMap,
): TournamentAwards {
  const statsMap = collectPlayerStats(tournament);

  if (statsMap.size === 0) {
    return { mvp: null, allPro: [], awards: [] };
  }

  const allStats = Array.from(statsMap.values());

  // ─── Tournament champion team id ───────────────────────────────────────
  // Identify the winning team for the "carry of the losing side" award.
  // We derive it from the final match rather than importing tournamentChampion
  // (which is in lib/tournament.ts, a non-circular import is fine here but
  // we keep it local to avoid coupling).
  let championTeamId: string | null = null;
  // Find the match with the highest round that has a winner to identify the
  // overall tournament winner.
  const completedMatches = tournament.matches.filter((m) => m.winner != null && !m.isBye);
  if (completedMatches.length > 0) {
    // Sort by round descending; take the match with no feedsInto as the final
    // (single-elim), or grand-final-reset > grand-final (double-elim), or
    // just the highest-round completed match (round-robin/swiss).
    const reset = completedMatches.find((m) => m.bracket === "grand-final-reset");
    const gf = reset ?? completedMatches.find((m) => m.bracket === "grand-final");
    if (gf?.winner) {
      championTeamId = gf.winner.teamId;
    } else {
      const finalMatch = completedMatches
        .filter((m) => m.feedsInto == null)
        .sort((a, b) => b.round - a.round)[0];
      if (finalMatch?.winner) {
        championTeamId = finalMatch.winner.teamId;
      }
    }
  }

  // ─── MVP ────────────────────────────────────────────────────────────────
  const eligible = allStats.filter((s) => s.ratings.length >= MIN_RATED_GAMES_MVP);
  let mvp: PlayerAward | null = null;
  if (eligible.length > 0) {
    const best = eligible.reduce((best, s) => {
      const score = mvpScore(avg(s.ratings), s.ratings.length);
      const bestScore = mvpScore(avg(best.ratings), best.ratings.length);
      return score > bestScore ? s : best;
    });
    mvp = makePlayerAward(best);
  }

  // ─── All-Pro team ────────────────────────────────────────────────────────
  const allPro: AllProPlayer[] = [];
  for (const lane of LANES) {
    const lanePlayers = eligible.filter((s) => s.lane === lane);
    if (lanePlayers.length === 0) continue;
    const best = lanePlayers.reduce((b, s) =>
      avg(s.ratings) > avg(b.ratings) ? s : b,
    );
    allPro.push({ ...makePlayerAward(best), lane });
  }

  // ─── Special awards ─────────────────────────────────────────────────────
  const awards: SpecialAward[] = [];

  // 1. Performance of the tournament — highest single-game rating (min 1 game).
  const anyRated = allStats.filter((s) => s.ratings.length >= 1);
  if (anyRated.length > 0) {
    const best = anyRated.reduce((b, s) =>
      s.peakRating > b.peakRating ? s : b,
    );
    if (best.peakRating > 0) {
      awards.push({
        kind: "performance",
        title: "Performance of the Tournament",
        context: `${best.peakRating.toFixed(1)} — ${best.peakContext}`,
        player: makePlayerAward(best),
      });
    }
  }

  // 2. Most consistent — lowest rating stddev, min 5 games, avg ≥ 6.
  const consistencyPool = allStats.filter(
    (s) =>
      s.ratings.length >= MIN_RATED_GAMES_CONSISTENT &&
      avg(s.ratings) >= MIN_AVG_CONSISTENT,
  );
  if (consistencyPool.length > 0) {
    const best = consistencyPool.reduce((b, s) =>
      stddev(s.ratings) < stddev(b.ratings) ? s : b,
    );
    const sd = round1(stddev(best.ratings));
    awards.push({
      kind: "consistent",
      title: "Most Consistent",
      context: `σ ${sd.toFixed(1)} over ${best.ratings.length} games (avg ${round1(avg(best.ratings)).toFixed(1)})`,
      player: makePlayerAward(best),
    });
  }

  // 3. Carry of the losing side — best avg among players whose team did NOT win.
  if (championTeamId !== null) {
    const losingSidePool = eligible.filter((s) => s.teamId !== championTeamId);
    if (losingSidePool.length > 0) {
      const best = losingSidePool.reduce((b, s) =>
        avg(s.ratings) > avg(b.ratings) ? s : b,
      );
      awards.push({
        kind: "carry_losing",
        title: "Carry of the Losing Side",
        context: `${round1(avg(best.ratings)).toFixed(1)} avg over ${best.ratings.length} games`,
        player: makePlayerAward(best),
      });
    }
  }

  // 4. Hottest streak — only when playerForms is provided.
  if (playerForms && Object.keys(playerForms).length > 0) {
    // Find the player in our stats map whose form key has the highest value.
    let bestForm = -Infinity;
    let bestStats: PlayerStats | null = null;
    for (const stats of allStats) {
      const key = `${stats.teamId}:${stats.lane}`;
      const form = playerForms[key];
      if (typeof form === "number" && form > bestForm) {
        bestForm = form;
        bestStats = stats;
      }
    }
    if (bestStats !== null && bestForm > 0) {
      awards.push({
        kind: "hottest_streak",
        title: "Hottest Streak",
        context: `Form ${bestForm.toFixed(2)} (avg ${round1(avg(bestStats.ratings)).toFixed(1)} over ${bestStats.ratings.length} games)`,
        player: makePlayerAward(bestStats),
      });
    }
  }

  return { mvp, allPro, awards };
}

// ─── Finals MVP (splits & international events) ──────────────────────────────
//
// A finals MVP is decided differently from the volume-based tournament MVP: it
// must be a player FROM THE WINNING TEAM, judged on the FINAL they won (the
// decisive series), not season-long average. This mirrors real Finals MVP
// awards — the best player on the champion side in the deciding series — and is
// used for both domestic split champions and international event winners.

/**
 * The finals MVP: the best-rated player on the tournament CHAMPION across the
 * deciding series the champion won (their highest-round won match). Anchored on
 * tournamentChampion so the MVP is GUARANTEED to be from the winning team.
 * Returns null until the tournament is complete or when the final carries no
 * rated games (fully manual resolution).
 */
/**
 * International-event MVP: the best average-rated player on the tournament
 * CHAMPION across every rated game in the event (whole tournament, not just
 * the final). Returns null when the champion is undecided or no champion
 * roster player has enough rated games.
 */
export function computeChampionTeamTournamentMvp(
  tournament: TournamentState,
): PlayerAward | null {
  const champTeam = tournamentChampion(tournament);
  if (!champTeam) return null;
  const statsMap = collectPlayerStats(tournament);
  const champStats = [...statsMap.values()].filter(
    (s) =>
      s.teamId === champTeam.id &&
      s.ratings.length >= MIN_RATED_GAMES_MVP,
  );
  if (champStats.length === 0) return null;
  const best = champStats.reduce((b, s) =>
    avg(s.ratings) > avg(b.ratings) ? s : b,
  );
  return makePlayerAward(best);
}

export function computeFinalsMvp(
  tournament: TournamentState,
): PlayerAward | null {
  const champTeam = tournamentChampion(tournament);
  if (!champTeam) return null;
  const champId = champTeam.id;
  // The champion's decisive series = their highest-round completed, non-bye
  // match — the final they lifted the trophy in.
  const wonSeries = tournament.matches.filter(
    (m) => !m.isBye && m.series && m.winner?.teamId === champId,
  );
  if (wonSeries.length === 0) return null;
  const final = wonSeries.reduce((a, b) => (b.round > a.round ? b : a));
  if (!final.series) return null;
  const champ = tournament.teams.find((t) => t.id === champId);
  if (!champ) return null;

  // Accumulate the champion side's per-lane ratings across the final's games.
  const acc = new Map<
    string,
    { lane: Lane; name?: string; id?: string; ratings: number[] }
  >();
  for (const game of final.series.games) {
    if (game.status !== "complete" || game.winner == null) continue;
    const recap = game.recap;
    if (!recap) continue;
    let ratings = recap.ratings ?? null;
    if (!ratings && recap.perPickKDA) ratings = computeGameRatings(recap, game.winner);
    if (!ratings) continue;
    // Sides swap between games (loser-blue); resolve the champion's side by name.
    const side: Side =
      game.blueTeam === champ.name
        ? "blue"
        : game.redTeam === champ.name
          ? "red"
          : final.blueTeamId === champId
            ? "blue"
            : "red";
    const sideRatings = side === "blue" ? ratings.blue : ratings.red;
    const ids = recap.perPickIds?.[side];
    const names = recap.perPickNames?.[side];
    for (let li = 0; li < LANES.length; li++) {
      const r = sideRatings[li];
      if (typeof r !== "number" || !Number.isFinite(r)) continue;
      const lane = LANES[li];
      const key = ids?.[li] ?? `${champId}:${lane}`;
      let e = acc.get(key);
      if (!e) {
        e = {
          lane,
          name: names?.[li] ?? champ.players?.[li]?.name,
          id: ids?.[li] ?? champ.players?.[li]?.id,
          ratings: [],
        };
        acc.set(key, e);
      }
      e.ratings.push(r);
    }
  }
  if (acc.size === 0) return null;

  let best: { lane: Lane; name?: string; id?: string; ratings: number[] } | null = null;
  for (const e of acc.values()) {
    if (!best || avg(e.ratings) > avg(best.ratings)) best = e;
  }
  if (!best) return null;
  return {
    teamId: champId,
    lane: best.lane,
    displayName: `${champ.name} ${LANE_LABEL[best.lane]}`,
    teamName: champ.name,
    ...(best.name ? { playerName: best.name } : {}),
    ...(best.id ? { playerId: best.id } : {}),
    avgRating: round1(avg(best.ratings)),
    gamesPlayed: best.ratings.length,
  };
}
