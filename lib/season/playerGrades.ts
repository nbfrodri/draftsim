import { computeGameRatings } from "../matchSimulator";
import type { SeasonState } from "./types";

/** One pass, keyed by actual participant ID, including games before a transfer.
 * An explicitly empty scope means no games. Legacy slot fallback is used only
 * when that side has no recorded IDs, never to fill a hole in recorded data. */
export function seasonPlayerGrades(season: SeasonState, tournamentIds?: readonly string[]) {
  const teams = new Map(season.teams.map(team => [team.id, team]));
  const totals = new Map<string, { sum: number; games: number }>();
  const ids = new Set(tournamentIds ?? season.phases.flatMap(phase => phase.tournamentIds));
  for (const tid of ids) {
    for (const match of season.tournaments[tid]?.matches ?? []) {
      if (match.isBye || !match.series) continue;
      const blue = teams.get(match.blueTeamId ?? "");
      const red = teams.get(match.redTeamId ?? "");
      for (const game of match.series.games) {
        if (game.status !== "complete" || !game.winner || !game.recap) continue;
        const recap = game.recap;
        const ratings = recap.ratings ?? (recap.perPickKDA ? computeGameRatings(recap, game.winner) : null);
        if (!ratings) continue;
        const swapped = game.blueTeam === red?.name && game.blueTeam !== blue?.name;
        for (const side of ["blue", "red"] as const) {
          const team = (side === "blue") !== swapped ? blue : red;
          const recordedIds = recap.perPickIds?.[side];
          ratings[side].forEach((grade, index) => {
            const id = recordedIds ? recordedIds[index] : team?.players[index]?.id;
            if (!id || !Number.isFinite(grade) || grade <= 0) return;
            const total = totals.get(id) ?? { sum: 0, games: 0 };
            total.sum += grade;
            total.games++;
            totals.set(id, total);
          });
        }
      }
    }
  }
  return new Map([...totals].map(([id, value]) => [id, value.sum / value.games]));
}
