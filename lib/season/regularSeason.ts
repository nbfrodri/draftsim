import type { SeasonState } from "./types";

/** Select only a playable regular-stage match in the current domestic split. */
export function nextSplitRegularMatch(season: SeasonState) {
  const phase = season.phases[season.phaseIndex];
  if (season.status === "complete" || phase?.kind !== "split") return null;
  for (const id of phase.tournamentIds) {
    const tournament = season.tournaments[id];
    if (!tournament || tournament.status === "complete" ||
      !/^(round-robin|groups|swiss)(-|$)/.test(tournament.format) ||
      tournament.rrPlayoffsStarted || tournament.swissPlayoffsStarted ||
      tournament.groupsPlayoffs?.playoffStarted) continue;
    const match = tournament.matches.find(m => m.bracket == null && !m.winner &&
      m.blueTeamId != null && m.redTeamId != null);
    if (match) return { tournament, match };
  }
  return null;
}
