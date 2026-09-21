import type { SeasonPhase, SeasonState, SeasonTeam } from "./types";

/** Read the entrants already frozen by the engine, with compact phase stamps as fallback.
 * Never fill a historical roster with players from the current transfer window.
 */
export function seasonAtPhase(season: SeasonState, phase: SeasonPhase): SeasonState {
  const stamp = season.phaseRosters?.find(p => p.phaseIndex === season.phases.indexOf(phase));
  const teams = new Map<string, SeasonTeam>();
  for (const team of stamp?.teams ?? []) {
    teams.set(team.teamId, {
      id: team.teamId, name: team.teamName, leagueId: team.leagueId,
      logoUrl: team.logoUrl, iconKey: "shield", color: "#c8aa6e", personalityId: "",
      players: team.players.map(p => ({ ...p, goodChamps: p.goodChamps ?? [], badChamps: p.badChamps ?? [] })),
    });
  }
  for (const id of phase.tournamentIds) {
    for (const team of season.tournaments[id]?.teams ?? []) {
      const fallback = teams.get(team.id);
      const leagueId = team.leagueId ?? fallback?.leagueId ?? season.teams.find(t => t.id === team.id)?.leagueId;
      if (!leagueId) continue;
      teams.set(team.id, {
        id: team.id, name: team.name, leagueId,
        logoUrl: team.logoUrl ?? fallback?.logoUrl,
        iconKey: team.iconKey ?? "shield", color: team.color ?? "#c8aa6e",
        personalityId: team.personalityId ?? "",
        players: team.players ?? fallback?.players ?? [],
      });
    }
  }
  return { ...season, teams: [...teams.values()] };
}
