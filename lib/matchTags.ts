import type { TournamentMatch } from "./tournament";

/** True when a Bo5 ended 3-2 after one side led 2-0 and the other won three
 *  straight — the classic reverse sweep. Bo5 only; requires per-game data.
 *  Tracks wins by team name (not blue/red side) so side swaps don't misread
 *  a 2-0 lead. */
export function isReverseSweep(
  match: Pick<
    TournamentMatch,
    "format" | "winner" | "series" | "blueTeamId" | "redTeamId"
  >,
): boolean {
  if (match.format !== "bo5") return false;
  const w = match.winner;
  if (!w) return false;
  const { blueWins, redWins } = w;
  if (blueWins + redWins !== 5) return false;
  if (Math.max(blueWins, redWins) !== 3 || Math.min(blueWins, redWins) !== 2) {
    return false;
  }
  const series = match.series;
  if (!series?.games?.length) return false;

  const games = series.games;
  if (games.filter((g) => g.winner).length !== 5) return false;
  const g0 = games[0];
  if (!g0?.winner || !games[1]?.winner) return false;

  let winnerName: string | null = null;
  if (w.teamId === match.blueTeamId) winnerName = g0.blueTeam;
  else if (w.teamId === match.redTeamId) winnerName = g0.redTeam;
  else return false;

  const otherName = winnerName === g0.blueTeam ? g0.redTeam : g0.blueTeam;
  const afterTwo = new Map<string, number>();
  for (const g of games.slice(0, 2)) {
    if (!g.winner) return false;
    const name = g.winner === "blue" ? g.blueTeam : g.redTeam;
    afterTwo.set(name, (afterTwo.get(name) ?? 0) + 1);
  }

  return (
    (afterTwo.get(winnerName) ?? 0) === 0 &&
    (afterTwo.get(otherName) ?? 0) === 2
  );
}
