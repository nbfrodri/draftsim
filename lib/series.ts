import { createGame } from "./draftEngine";
import type {
  AIDifficulty,
  DraftMode,
  GameDraft,
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
  };
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
): SeriesState {
  const games = [...series.games];
  const last = games[games.length - 1];
  games[games.length - 1] = { ...last, winner };
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
export function startNextGame(
  series: SeriesState,
  blueTeam: string,
  redTeam: string,
): SeriesState {
  if (series.status !== "between-games") return series;
  const nextGameNumber = series.games.length + 1;
  if (nextGameNumber > maxGames(series.format)) return series;
  return {
    ...series,
    blueTeam,
    redTeam,
    status: "drafting",
    games: [...series.games, createGame(nextGameNumber, blueTeam, redTeam)],
  };
}
