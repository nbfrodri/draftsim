import type { GameDraft, GameRecap, Lane, Roster, Side } from "./types";
import { LANES } from "./lanes";
import { computeGameRatings } from "./matchSimulator";
type GameRatingsCache = Map<string, { blue: number[]; red: number[] } | null>;
function gameRatings(recap: GameRecap, winner: Side | null) {
  return recap.ratings ?? (winner && recap.perPickKDA ? computeGameRatings(recap, winner) : null);
}

// Which side a team played on in a given game (sides may swap mid-series).
function teamSideInGame(game: GameDraft, teamName: string): Side | null {
  if (game.blueTeam === teamName) return "blue";
  if (game.redTeam === teamName) return "red";
  return null;
}

export type SeriesPlayerSummary = {
  lane: Lane;
  name: string | null;
  playerId: string | null;
  avgRating: number;
  rawAvgRating: number | null;
  kda: { k: number; d: number; a: number };
  kdaGames: number;
  playedGames: number;
};

// Per-player series averages + summed KDA for one team slot.
export function seriesTeamPlayerSummaries(
  games: GameDraft[],
  teamName: string,
  roster?: Roster,
  ratingsCache?: GameRatingsCache,
): SeriesPlayerSummary[] | null {
  const ratingSum = [0, 0, 0, 0, 0];
  const ratingCount = [0, 0, 0, 0, 0];
  const kdaCount = [0, 0, 0, 0, 0];
  const playedGames = games.filter(g => g.winner && teamSideInGame(g, teamName)).length;
  const kdaSum = [
    { k: 0, d: 0, a: 0 },
    { k: 0, d: 0, a: 0 },
    { k: 0, d: 0, a: 0 },
    { k: 0, d: 0, a: 0 },
    { k: 0, d: 0, a: 0 },
  ];
  const idsFromGames: (string | null)[] = [null, null, null, null, null];
  const namesFromGames: (string | null)[] = [null, null, null, null, null];
  let hasRecordedIdentity = false;
  let anyKda = false;
  let anyRating = false;

  for (const g of games) {
    if (!g.recap || !g.winner) continue;
    const side = teamSideInGame(g, teamName);
    if (!side) continue;
    const recap = g.recap;
    hasRecordedIdentity ||= !!(recap.perPickIds?.[side] || recap.perPickNames?.[side]);
    const ratings =
      ratingsCache?.get(g.id) ?? gameRatings(recap, g.winner);
    if (ratings) {
      const sideRatings = side === "blue" ? ratings.blue : ratings.red;
      for (let i = 0; i < 5; i++) {
        if (Number.isFinite(sideRatings[i]) && sideRatings[i] > 0) {
          ratingSum[i] += sideRatings[i];
          ratingCount[i]++;
          anyRating = true;
        }
      }
    }
    for (let i = 0; i < 5; i++) {
      namesFromGames[i] ??= recap.perPickNames?.[side]?.[i] ?? null;
      idsFromGames[i] ??= recap.perPickIds?.[side]?.[i] ?? null;
    }
    const sideKda = recap.perPickKDA?.[side];
    if (sideKda) {
      for (let i = 0; i < 5; i++) {
        const row = sideKda[i];
        if (!row) continue;
        kdaCount[i]++;
        kdaSum[i].k += row.k;
        kdaSum[i].d += row.d;
        kdaSum[i].a += row.a;
        anyKda = true;
        const name = recap.perPickNames?.[side]?.[i];
        if (name && !namesFromGames[i]) namesFromGames[i] = name;
        idsFromGames[i] ??= recap.perPickIds?.[side]?.[i] ?? null;
      }
    }
  }

  if (!anyKda && !anyRating) return null;

  return LANES.map(({ key: lane }, i) => ({
    lane,
    name: namesFromGames[i] ?? (hasRecordedIdentity ? null : roster?.[i]?.name) ?? null,
    playerId: idsFromGames[i] ?? (hasRecordedIdentity ? null : roster?.[i]?.id) ?? null,
    rawAvgRating: ratingCount[i] > 0 ? ratingSum[i] / ratingCount[i] : null,
    avgRating:
      ratingCount[i] > 0
        ? Math.round((ratingSum[i] / ratingCount[i]) * 10) / 10
        : 0,
    kda: kdaSum[i],
    kdaGames: kdaCount[i],
    playedGames,
  }));
}
