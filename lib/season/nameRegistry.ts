import type { SeasonState } from "./types";
import type { SeasonHistoryEntry } from "./history";

/** Backfill old realities from every retained source without changing player identities. */
export function repairNameRegistry(
  season: SeasonState,
  history: readonly SeasonHistoryEntry[] = [],
): SeasonState {
  if (!season.franchise) return season;
  const names = new Set(season.franchise.usedNames ?? []);
  const add = (name?: string) => {
    if (name?.trim()) names.add(name);
  };
  for (const team of season.teams) {
    team.players.forEach((player) => add(player.name));
    add(team.coach?.name);
  }
  season.franchise.inactivePool?.forEach((row) => add(row.player.name));
  for (const source of [season, ...history]) {
    source.phaseRosters?.forEach((phase) =>
      phase.teams.forEach((team) => {
        team.players.forEach((player) => add(player.name));
        add(team.coach?.name);
      }),
    );
  }
  season.rosterNews?.forEach((row) => {
    add(row.departedName);
    add(row.entrantName);
    add(row.passedAcademyName);
    row.beatenNames?.forEach(add);
  });
  for (const entry of history) {
    entry.playerCareers?.forEach((row) => add(row.playerName));
    entry.inactivePlayers?.forEach((row) => add(row.playerName));
    entry.transfers?.forEach((row) => {
      add(row.inName);
      add(row.outName);
    });
    entry.awardTally?.forEach((row) => add(row.playerName));
    entry.allProTeams?.forEach((team) =>
      team.members.forEach((row) => add(row.playerName)),
    );
    entry.intlMvps?.forEach((row) => add(row.playerName));
    entry.splitMvps?.forEach((row) => add(row.playerName));
    entry.rookieOfYear?.forEach((row) => add(row.playerName));
  }
  if (
    season.franchise.usedNames &&
    names.size === season.franchise.usedNames.length
  )
    return season;
  return {
    ...season,
    franchise: { ...season.franchise, usedNames: [...names] },
  };
}
