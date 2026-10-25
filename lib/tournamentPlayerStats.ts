import { LANES } from "./lanes";
import { computeGameRatings } from "./matchSimulator";
import type { TournamentState } from "./tournament";
import type { Lane } from "./types";

// Per-player totals across a tournament, for the recap leaderboards. Each
// metric keeps its own game count: legacy recaps can carry KDA without lane
// gold (or vice versa), and a missing value is unknown, not zero.
export interface TournamentPlayerStat {
  key: string;
  teamId: string;
  lane: Lane;
  playerName?: string;
  playerId?: string;
  kdaGames: number;
  kills: number;
  deaths: number;
  assists: number;
  ratingGames: number;
  ratingSum: number;
  // Lane gold vs the direct opponent, signed from this player's side.
  goldGames: number;
  goldDiffSum: number;
}

export function computeTournamentPlayerStats(tournament: TournamentState): TournamentPlayerStat[] {
  const rows = new Map<string, TournamentPlayerStat>();
  for (const match of tournament.matches) {
    if (match.isBye || !match.series) continue;
    const matchBlue = tournament.teams.find((t) => t.id === match.blueTeamId);
    const matchRed = tournament.teams.find((t) => t.id === match.redTeamId);
    if (!matchBlue || !matchRed) continue;
    // Same-named teams cannot be told apart by a game's team names: unknown.
    if (matchBlue.name === matchRed.name) continue;
    for (const game of match.series.games) {
      const recap = game.recap;
      if (!recap || game.winner == null) continue;
      const ratings = recap.ratings ?? (recap.perPickKDA ? computeGameRatings(recap, game.winner) : null);
      // Sides can swap within a series: credit each side to the team that
      // actually played it this game, not the match's game-1 sides.
      const swapped = game.blueTeam === matchRed.name && game.redTeam === matchBlue.name;
      for (const side of ["blue", "red"] as const) {
        const team = (side === "blue") !== swapped ? matchBlue : matchRed;
        LANES.forEach(({ key: lane }, i) => {
          // A backup who subs in mid-event is their own row. Without a recorded
          // participant (legacy recaps) the entrant roster may not have played:
          // that appearance stays unknown rather than credited to them.
          const playerId = recap.perPickIds?.[side]?.[i];
          if (!playerId) return;
          const key = `${team.id}:${lane}:${playerId}`;
          let row = rows.get(key);
          if (!row) {
            const playerName = recap.perPickNames?.[side]?.[i] ?? team.players?.find((p) => p.id === playerId)?.name;
            row = {
              key, teamId: team.id, lane,
              ...(playerName ? { playerName } : {}),
              ...(playerId ? { playerId } : {}),
              kdaGames: 0, kills: 0, deaths: 0, assists: 0,
              ratingGames: 0, ratingSum: 0, goldGames: 0, goldDiffSum: 0,
            };
            rows.set(key, row);
          }
          const kda = recap.perPickKDA?.[side]?.[i];
          if (kda) {
            row.kdaGames++;
            row.kills += kda.k;
            row.deaths += kda.d;
            row.assists += kda.a;
          }
          const rating = ratings?.[side]?.[i];
          if (typeof rating === "number" && Number.isFinite(rating)) {
            row.ratingGames++;
            row.ratingSum += rating;
          }
          // laneGoldDiff is signed from BLUE's perspective; flip for red.
          const gold = recap.laneGoldDiff?.[lane];
          if (typeof gold === "number" && Number.isFinite(gold)) {
            row.goldGames++;
            row.goldDiffSum += side === "blue" ? gold : -gold;
          }
        });
      }
    }
  }
  return [...rows.values()];
}
