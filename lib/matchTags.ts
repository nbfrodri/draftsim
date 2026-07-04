import type { TournamentMatch } from "./tournament";

/** True when a Bo5 ended 3-2 after one side led 2-0 and the other won three
 *  straight — the classic reverse sweep. Bo5 only; requires per-game data. */
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

  let b = 0;
  let r = 0;
  for (const g of series.games) {
    if (!g.winner) continue;
    if (g.winner === "blue") b++;
    else r++;
    if (b === 2 && r === 0) return w.teamId === match.redTeamId;
    if (r === 2 && b === 0) return w.teamId === match.blueTeamId;
  }
  return false;
}
