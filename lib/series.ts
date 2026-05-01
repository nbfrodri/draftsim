import { createGame } from "./draftEngine";
import type {
  AIDifficulty,
  DraftMode,
  GameDraft,
  GameRecap,
  SeriesFormat,
  SeriesState,
  Side,
} from "./types";

export function requiredWins(format: SeriesFormat): number {
  if (format === "bo1") return 1;
  if (format === "bo3") return 2;
  return 3;
}

export function maxGames(format: SeriesFormat): number {
  if (format === "bo1") return 1;
  if (format === "bo3") return 3;
  return 5;
}

export function createSeries(params: {
  format: SeriesFormat;
  fearless: boolean;
  timerEnabled: boolean;
  blueTeam: string;
  redTeam: string;
  mode: DraftMode;
  aiSide: Side | null;
  aiDifficulty: AIDifficulty;
  blueAiDifficulty?: AIDifficulty;
  redAiDifficulty?: AIDifficulty;
  // Optional star ratings (tournament context only).
  blueStarRating?: number;
  redStarRating?: number;
  // Tournament momentum context. Win streaks feed a "team on a roll"
  // score-bias bump; round-depth tag enables underdog protection in
  // semis/finals.
  blueWinStreak?: number;
  redWinStreak?: number;
  tournamentRound?: "early" | "quarterfinal" | "semifinal" | "final";
}): SeriesState {
  return {
    id: `series-${Date.now()}`,
    format: params.format,
    fearless: params.fearless,
    timerEnabled: params.timerEnabled,
    blueTeam: params.blueTeam,
    redTeam: params.redTeam,
    games: [createGame(1, params.blueTeam, params.redTeam)],
    status: "drafting",
    winner: null,
    mode: params.mode,
    aiSide: params.mode === "pvai" ? params.aiSide : null,
    aiDifficulty: params.aiDifficulty,
    blueAiDifficulty: params.blueAiDifficulty,
    redAiDifficulty: params.redAiDifficulty,
    blueStarRating: params.blueStarRating,
    redStarRating: params.redStarRating,
    blueWinStreak: params.blueWinStreak,
    redWinStreak: params.redWinStreak,
    tournamentRound: params.tournamentRound,
  };
}

// Convert a series's per-team star ratings into a score-diff bias for
// the simulator. Returns 0 when ratings aren't set (non-tournament).
// SIGMOID_K in matchSimulator is 0.05, so a bias of ~6 score points per
// star ≈ +7-8% win-prob per star at the slope. A 5★ vs 1★ blowout
// (diff = 4) reaches around +28-30% extra blue win-prob — a clear
// underdog story but not deterministic; even a 1★ team can beat a 5★
// team ~10-15% of the time after draft factors are mixed in. Even
// matchups (3★ vs 3★) get zero bias.
const STAR_RATING_BIAS_K = 6.0;
// Per-consecutive-win bonus. ~1.5 points per win in the streak ≈ +2pp
// win-prob per win at the slope. Capped so a snowball doesn't snowball
// the simulator: 4 consecutive wins (final-bound team) = +6 points,
// equivalent to a one-star bump. Streak resets on any loss.
const WIN_STREAK_BIAS_K = 1.5;
const WIN_STREAK_BIAS_CAP = 6.0;
// Underdog protection. When a low-rated team faces a high-rated team in
// a semifinal or final, blunt the chalk bias and add a flat
// counter-bias. Reflects: any team that survived to semis/finals has
// proven they can play, so the seed gap matters less than it did in
// round 1. UNDERDOG_FLAT (+2.5 score-pts) ≈ +3pp counter-bias at the
// slope; combined with UNDERDOG_BLUNT (60% of star diff) the 4-star
// gap from 5★ vs 1★ in a final shrinks from +28pp to about +13pp
// blue-favored — still a clear favorite, but the underdog story is
// real. Triggers only when the star diff is at least 2 (i.e. 1★ vs
// 3★+ or 2★ vs 4★+).
const UNDERDOG_BLUNT = 0.6;
const UNDERDOG_FLAT = 2.5;
const UNDERDOG_MIN_GAP = 2;
export function starRatingBias(series: SeriesState): number {
  const blue = series.blueStarRating;
  const red = series.redStarRating;
  if (typeof blue !== "number" || typeof red !== "number") return 0;
  let starBias = (blue - red) * STAR_RATING_BIAS_K;
  // Underdog protection in semifinals / finals. Operates on the star
  // bias only — leaves streak and base draft signals alone, since they
  // already reflect the underdog's real form.
  const round = series.tournamentRound;
  const isLateRound = round === "semifinal" || round === "final";
  if (isLateRound) {
    const starGap = Math.abs(blue - red);
    if (starGap >= UNDERDOG_MIN_GAP) {
      // Blunt the chalk: scale the star-rating bias down so the
      // underdog isn't already buried by the seed gap before the draft
      // even runs.
      starBias *= 1 - UNDERDOG_BLUNT;
      // Add a flat bonus toward the underdog (the lower-rated side).
      // Sign is opposite of starBias direction: if blue is favored,
      // underdog flat helps red (negative). And vice versa.
      if (blue > red) starBias -= UNDERDOG_FLAT;
      else starBias += UNDERDOG_FLAT;
    }
  }
  // Win-streak bonus. Each side gets credit for their current
  // consecutive-win count in the tournament; the diff feeds into the
  // bias. A team riding a 3-match streak vs a team coming off a loss
  // earns a measurable edge — the "form" component of upset/chalk.
  const blueStreak = Math.max(0, series.blueWinStreak ?? 0);
  const redStreak = Math.max(0, series.redWinStreak ?? 0);
  const blueStreakBias = Math.min(WIN_STREAK_BIAS_CAP, blueStreak * WIN_STREAK_BIAS_K);
  const redStreakBias = Math.min(WIN_STREAK_BIAS_CAP, redStreak * WIN_STREAK_BIAS_K);
  return starBias + (blueStreakBias - redStreakBias);
}

// Pick the effective AI difficulty for a given side. Per-side overrides
// take precedence over the default `aiDifficulty`. Used by the AI
// scoring path to apply different sampling knobs per AI when AI vs AI
// is configured as a handicap match.
export function difficultyForSide(
  series: SeriesState,
  side: Side,
): AIDifficulty {
  if (side === "blue" && series.blueAiDifficulty) return series.blueAiDifficulty;
  if (side === "red" && series.redAiDifficulty) return series.redAiDifficulty;
  return series.aiDifficulty;
}

export function currentGame(series: SeriesState): GameDraft {
  return series.games[series.games.length - 1];
}

// Champions "locked out" by fearless — only *picked* (not banned) champions count.
export function fearlessLockedSet(series: SeriesState): Set<number> {
  return fearlessLocksBeforeGame(series, series.games.length - 1);
}

// Champions locked by fearless entering a specific game index (0-based).
// Empty for game 0; for game N, accumulates picks from games 0..N-1.
export function fearlessLocksBeforeGame(
  series: SeriesState,
  gameIndex: number,
): Set<number> {
  const set = new Set<number>();
  if (!series.fearless) return set;
  const end = Math.min(gameIndex, series.games.length);
  for (let i = 0; i < end; i++) {
    const g = series.games[i];
    for (const id of [...g.bluePicks, ...g.redPicks]) {
      if (id != null) set.add(id);
    }
  }
  return set;
}

// Wins aggregated by team *name*, so sides flipping mid-series doesn't split
// one team's wins across the blue/red buckets.
export function winsByTeamName(series: SeriesState): Map<string, number> {
  const counts = new Map<string, number>();
  for (const g of series.games) {
    if (g.winner == null) continue;
    const name = g.winner === "blue" ? g.blueTeam : g.redTeam;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return counts;
}

// Score keyed by the current side assignment. Uses team-name aggregation
// under the hood so swapping sides between games doesn't misattribute wins.
export function seriesScore(series: SeriesState): { blue: number; red: number } {
  const wins = winsByTeamName(series);
  return {
    blue: wins.get(series.blueTeam) ?? 0,
    red: wins.get(series.redTeam) ?? 0,
  };
}

// A series is decided when any team (by identity) has reached the win threshold.
// Returns the current side that team occupies; null if nobody has clinched yet.
export function isSeriesDecided(series: SeriesState): Side | null {
  const wins = winsByTeamName(series);
  const need = requiredWins(series.format);
  for (const [name, w] of wins) {
    if (w < need) continue;
    if (name === series.blueTeam) return "blue";
    if (name === series.redTeam) return "red";
  }
  return null;
}

export function recordWinner(
  series: SeriesState,
  winner: Side,
  recap?: GameRecap,
): SeriesState {
  const games = [...series.games];
  const last = games[games.length - 1];
  games[games.length - 1] = {
    ...last,
    winner,
    // Only attach recap if provided (manual winner declarations leave it
    // unset). Don't overwrite an existing recap with undefined.
    ...(recap ? { recap } : {}),
  };
  const updated: SeriesState = { ...series, games };
  const decided = isSeriesDecided(updated);
  if (decided) {
    updated.status = "complete";
    updated.winner = decided;
  } else {
    updated.status = "between-games";
  }
  return updated;
}

// Start next game. Caller decides which side is which (side-swap UI).
// When teams swap sides, every per-side field that's actually a property
// of the TEAM (aiSide for PvAI, per-team AI difficulties, star ratings,
// win streaks) must follow the team — otherwise the human ends up
// controlling whichever roster the AI was driving last game, and
// tournament biases point at the wrong side.
export function startNextGame(
  series: SeriesState,
  blueTeam: string,
  redTeam: string,
): SeriesState {
  if (series.status !== "between-games") return series;
  const nextGameNumber = series.games.length + 1;
  if (nextGameNumber > maxGames(series.format)) return series;
  const swap = blueTeam === series.redTeam && redTeam === series.blueTeam;
  return {
    ...series,
    blueTeam,
    redTeam,
    status: "drafting",
    games: [...series.games, createGame(nextGameNumber, blueTeam, redTeam)],
    ...(swap
      ? {
          aiSide:
            series.aiSide === "blue"
              ? ("red" as Side)
              : series.aiSide === "red"
              ? ("blue" as Side)
              : series.aiSide,
          blueAiDifficulty: series.redAiDifficulty,
          redAiDifficulty: series.blueAiDifficulty,
          blueStarRating: series.redStarRating,
          redStarRating: series.blueStarRating,
          blueWinStreak: series.redWinStreak,
          redWinStreak: series.blueWinStreak,
        }
      : {}),
  };
}
