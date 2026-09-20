// lib/awards.ts — Tournament MVP, All-Pro team, and per-tournament awards.
//
// All functions are pure (no side-effects, no imports from React/store).
// Players are identified as { teamId, lane } — the Player record in
// TournamentTeam.players has no name field, so display names are
// synthesized as "<TeamName> <Lane>" (e.g. "Dragons Top").

import type { Lane } from "./types";
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

interface WeightedRating {
  rating: number;
  weight: number;
}

interface PlayerStats {
  teamId: string;
  lane: Lane;
  teamName: string;
  playerName?: string;
  playerId?: string;
  ratings: WeightedRating[];
  /** Max single-game rating recorded (with match context). */
  peakRating: number;
  peakContext: string; // e.g. "Game 3 vs Wolves"
}

/** Round-importance multipliers for decisive-match weighting (Option D). */
const ROUND_WEIGHT_FINAL = 2.0;
const ROUND_WEIGHT_SEMIFINAL = 1.3;
const ROUND_WEIGHT_DEFAULT = 1.0;
/** Lighter round weights for season-long tournament MVP. */
const ROUND_WEIGHT_FINAL_LIGHT = 1.3;
const ROUND_WEIGHT_SEMIFINAL_LIGHT = 1.15;

type RoundWeightTier = "full" | "light" | "none";

interface CollectPlayerStatsOptions {
  /** Only accumulate ratings for this team. */
  teamIdFilter?: string;
  /** Only walk matches that pass this predicate. */
  matchFilter?: (match: TournamentState["matches"][number]) => boolean;
  /** How strongly later rounds count toward weighted averages. */
  weightTier?: RoundWeightTier;
  /** Later games in a series count slightly more (finals BO3/BO5). */
  seriesGameProgression?: boolean;
}

/** Minimum rated games required for MVP / All-Pro eligibility. */
const MIN_RATED_GAMES_MVP = 3;
/** Minimum rated games required for "Most Consistent" award. */
const MIN_RATED_GAMES_CONSISTENT = 5;
/** Minimum average rating required for "Most Consistent" award. */
const MIN_AVG_CONSISTENT = 6;

// ─── Rating extraction ────────────────────────────────────────────────────────

function maxCompletedRound(tournament: TournamentState): number {
  let max = 0;
  for (const match of tournament.matches) {
    if (match.isBye || !match.winner) continue;
    if (match.round > max) max = match.round;
  }
  return max;
}

function roundImportanceWeight(
  matchRound: number,
  maxRound: number,
  tier: RoundWeightTier,
): number {
  if (tier === "none" || maxRound <= 0) return 1;
  const isFinal = matchRound >= maxRound;
  const isSemifinal = matchRound >= maxRound - 1;
  if (tier === "full") {
    if (isFinal) return ROUND_WEIGHT_FINAL;
    if (isSemifinal) return ROUND_WEIGHT_SEMIFINAL;
    return ROUND_WEIGHT_DEFAULT;
  }
  // light — tournament MVP only
  if (isFinal) return ROUND_WEIGHT_FINAL_LIGHT;
  if (isSemifinal) return ROUND_WEIGHT_SEMIFINAL_LIGHT;
  return ROUND_WEIGHT_DEFAULT;
}

/** Later games in a deciding series count slightly more (game 5 > game 1). */
function seriesGameWeight(gameNumber: number, gamesInSeries: number): number {
  if (gamesInSeries <= 1) return 1;
  return 1 + (gameNumber - 1) * 0.12;
}

function unweightedAvg(entries: WeightedRating[]): number {
  if (entries.length === 0) return 0;
  return entries.reduce((s, e) => s + e.rating, 0) / entries.length;
}

function weightedAvg(entries: WeightedRating[]): number {
  if (entries.length === 0) return 0;
  let sum = 0;
  let weight = 0;
  for (const e of entries) {
    sum += e.rating * e.weight;
    weight += e.weight;
  }
  return weight > 0 ? sum / weight : 0;
}

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
  options: CollectPlayerStatsOptions = {},
): Map<string, PlayerStats> {
  const {
    teamIdFilter,
    matchFilter,
    weightTier = "none",
    seriesGameProgression = false,
  } = options;
  const maxRound = weightTier === "none" ? 0 : maxCompletedRound(tournament);
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
    if (matchFilter && !matchFilter(match)) continue;

    const blueTeam = tournament.teams.find((t) => t.id === match.blueTeamId);
    const redTeam = tournament.teams.find((t) => t.id === match.redTeamId);
    if (!blueTeam || !redTeam) continue;

    const { series } = match;
    const completedGames = series.games.filter(
      (g) => g.status === "complete" && g.winner != null,
    );
    const roundWeight = roundImportanceWeight(match.round, maxRound, weightTier);

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

      const gameWeight =
        roundWeight *
        (seriesGameProgression
          ? seriesGameWeight(game.gameNumber, completedGames.length)
          : 1);

      // Accumulate per-lane ratings for blue side.
      if (!teamIdFilter || teamIdFilter === blueTeam.id) {
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
          stats.ratings.push({ rating: blueRating, weight: gameWeight });
          if (blueRating > stats.peakRating) {
            stats.peakRating = blueRating;
            stats.peakContext = `Game ${game.gameNumber} vs ${redTeam.name}`;
          }
        }
      }

      // Accumulate per-lane ratings for red side.
      if (!teamIdFilter || teamIdFilter === redTeam.id) {
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
          stats.ratings.push({ rating: redRating, weight: gameWeight });
          if (redRating > stats.peakRating) {
            stats.peakRating = redRating;
            stats.peakContext = `Game ${game.gameNumber} vs ${blueTeam.name}`;
          }
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
    avgRating: round1(unweightedAvg(stats.ratings)),
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

// ─── MVP scoring ──────────────────────────────────────────────────────────────
//
// Tournament MVP: roleRelativeScore × log2(1 + gamesPlayed), where
// roleRelativeScore = weightedAvg − laneMeanInPool. Finals / intl MVP use
// role-relative score only (no depth multiplier). Tie-breakers: absolute
// avgRating, then games played.

interface PickMvpOptions {
  /** Tournament MVP: multiply role-relative score by log2(1 + games). */
  depthWeight?: boolean;
  /** Flat bonus added to role-relative score per lane (intl MVP tuning). */
  laneBias?: Partial<Record<Lane, number>>;
  /** Lane means from this pool; defaults to `pool` (same players). */
  laneMeansPool?: PlayerStats[];
}

/** Nudge intl MVP away from jungle/mid KDA farming; lift support/top/bot. */
const INTL_MVP_LANE_BIAS: Partial<Record<Lane, number>> = {
  top: 0.03,
  jungle: 0.08,
  middle: 0.04,
  bottom: -0.08,
  support: 0.02,
};

/** Tournament MVP: even out top/jg/mid/bot (~20-25% each); support ~8-12%. */
const TOURNAMENT_MVP_LANE_BIAS: Partial<Record<Lane, number>> = {
  top: -0.06,
  jungle: 0.08,
  middle: 0.04,
  bottom: -0.14,
  support: 0.0,
};

/** Finals MVP: counter mid/bot dominance in decisive series. */
const FINALS_MVP_LANE_BIAS: Partial<Record<Lane, number>> = {
  top: 0.04,
  jungle: 0.08,
  middle: -0.12,
  bottom: -0.08,
  support: -0.02,
};

/**
 * Pick MVP by role-relative performance: weighted avg minus the lane mean in
 * the same pool. Tie-breakers: higher absolute avgRating, then more games.
 */
function pickMvpByRoleRelativeScore(
  pool: PlayerStats[],
  options: PickMvpOptions = {},
): PlayerStats | null {
  if (pool.length === 0) return null;

  const meanPool = options.laneMeansPool ?? pool;
  const laneMeans = new Map<Lane, number>();
  for (const lane of LANES) {
    const laneAvgs = meanPool
      .filter((s) => s.lane === lane)
      .map((s) => weightedAvg(s.ratings));
    if (laneAvgs.length > 0) laneMeans.set(lane, avg(laneAvgs));
  }

  const selectionScore = (s: PlayerStats): number => {
    const rel =
      weightedAvg(s.ratings) -
      (laneMeans.get(s.lane) ?? 0) +
      (options.laneBias?.[s.lane] ?? 0);
    if (options.depthWeight) {
      return rel * Math.log2(1 + s.ratings.length);
    }
    return rel;
  };

  return pool.reduce((best, s) => {
    const sScore = selectionScore(s);
    const bScore = selectionScore(best);
    if (sScore !== bScore) return sScore > bScore ? s : best;
    const sAvg = unweightedAvg(s.ratings);
    const bAvg = unweightedAvg(best.ratings);
    if (sAvg !== bAvg) return sAvg > bAvg ? s : best;
    return s.ratings.length > best.ratings.length ? s : best;
  });
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
  const statsMap = collectPlayerStats(tournament, { weightTier: "light" });

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
  const bestMvp = pickMvpByRoleRelativeScore(eligible, {
    depthWeight: true,
    laneBias: TOURNAMENT_MVP_LANE_BIAS,
  });
  const mvp: PlayerAward | null = bestMvp ? makePlayerAward(bestMvp) : null;

  // ─── All-Pro team ────────────────────────────────────────────────────────
  const allPro: AllProPlayer[] = [];
  for (const lane of LANES) {
    const lanePlayers = eligible.filter((s) => s.lane === lane);
    if (lanePlayers.length === 0) continue;
    const best = lanePlayers.reduce((b, s) =>
      unweightedAvg(s.ratings) > unweightedAvg(b.ratings) ? s : b,
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
      unweightedAvg(s.ratings) >= MIN_AVG_CONSISTENT,
  );
  if (consistencyPool.length > 0) {
    const best = consistencyPool.reduce((b, s) =>
      stddev(s.ratings.map((e) => e.rating)) <
      stddev(b.ratings.map((e) => e.rating))
        ? s
        : b,
    );
    const ratingValues = best.ratings.map((e) => e.rating);
    const sd = round1(stddev(ratingValues));
    awards.push({
      kind: "consistent",
      title: "Most Consistent",
      context: `σ ${sd.toFixed(1)} over ${best.ratings.length} games (avg ${round1(unweightedAvg(best.ratings)).toFixed(1)})`,
      player: makePlayerAward(best),
    });
  }

  // 3. Carry of the losing side — best avg among players whose team did NOT win.
  if (championTeamId !== null) {
    const losingSidePool = eligible.filter((s) => s.teamId !== championTeamId);
    if (losingSidePool.length > 0) {
      const best = losingSidePool.reduce((b, s) =>
        unweightedAvg(s.ratings) > unweightedAvg(b.ratings) ? s : b,
      );
      awards.push({
        kind: "carry_losing",
        title: "Carry of the Losing Side",
        context: `${round1(unweightedAvg(best.ratings)).toFixed(1)} avg over ${best.ratings.length} games`,
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
        context: `Form ${bestForm.toFixed(2)} (avg ${round1(unweightedAvg(bestStats.ratings)).toFixed(1)} over ${bestStats.ratings.length} games)`,
        player: makePlayerAward(bestStats),
      });
    }
  }

  return { mvp, allPro: tournament.seasonStageKind === "international" ? [] : allPro, awards };
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
  const allStatsMap = collectPlayerStats(tournament, { weightTier: "full" });
  const champStatsMap = collectPlayerStats(tournament, {
    teamIdFilter: champTeam.id,
    weightTier: "full",
  });
  const allEligible = [...allStatsMap.values()].filter(
    (s) => s.ratings.length >= MIN_RATED_GAMES_MVP,
  );
  const champStats = [...champStatsMap.values()].filter(
    (s) => s.ratings.length >= MIN_RATED_GAMES_MVP,
  );
  const best = pickMvpByRoleRelativeScore(champStats, {
    laneMeansPool: allEligible,
    laneBias: INTL_MVP_LANE_BIAS,
  });
  return best ? makePlayerAward(best) : null;
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

  const allStatsMap = collectPlayerStats(tournament, { weightTier: "full" });
  const laneMeansPool = [...allStatsMap.values()].filter(
    (s) => s.ratings.length >= 1,
  );

  const statsMap = collectPlayerStats(tournament, {
    teamIdFilter: champId,
    matchFilter: (m) => m.id === final.id,
    weightTier: "full",
    seriesGameProgression: true,
  });
  const finalStats = [...statsMap.values()].filter((s) => s.ratings.length >= 1);
  const best = pickMvpByRoleRelativeScore(finalStats, {
    laneMeansPool: laneMeansPool.length > 0 ? laneMeansPool : finalStats,
    laneBias: FINALS_MVP_LANE_BIAS,
  });
  return best ? makePlayerAward(best) : null;
}
