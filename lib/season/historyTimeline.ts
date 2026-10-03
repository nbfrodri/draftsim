import type { SeasonHistoryEntry, SeasonHistoryTeamRef } from "./history";
import {
  INTERNATIONAL_DISPLAY_ORDER,
  INTERNATIONAL_LABELS,
  SPLIT_LABELS,
  type InternationalId,
  type LeagueId,
  type SplitId,
  type TeamRosterSnapshot,
} from "./types";

export interface HistoryTimelineFinalist {
  team: SeasonHistoryTeamRef;
  roster: TeamRosterSnapshot | null;
}

export interface HistoryTimelineEvent {
  key: InternationalId | SplitId;
  label: string;
  champion: HistoryTimelineFinalist | null;
  runnerUp: HistoryTimelineFinalist | null;
}

/** Resolve both finalists against the roster captured for this exact event. */
export function overallTimelineEvents(
  entry: SeasonHistoryEntry,
  filter: "intl" | LeagueId,
): HistoryTimelineEvent[] {
  const keys = filter === "intl"
    ? INTERNATIONAL_DISPLAY_ORDER
    : (["winter", "spring", "summer"] as const);
  return keys.map((key) => {
    const international = filter === "intl";
    const event = key as InternationalId;
    const split = key as SplitId;
    const placements = international
      ? entry.intlPlacements?.[event]
      : entry.splitPlacements?.[split]?.[filter];
    const champion = placements?.[0] ?? (international
      ? entry.intlChampions[event] ?? (event === "worlds" ? entry.champion : null)
      : entry.splitChampions[split]?.[filter] ?? null);
    const runnerUp = placements?.[1] ?? (international
      ? entry.intlRunnersUp?.[event] ?? (event === "worlds" ? entry.runnerUp : null)
      : entry.splitRunnersUp?.[split]?.[filter] ?? null);
    const phase = entry.phaseRosters?.find((snapshot) => international
      ? snapshot.kind === "international" && snapshot.event === event
      : snapshot.kind === "split" && snapshot.split === split);
    const finalist = (team: SeasonHistoryTeamRef | null): HistoryTimelineFinalist | null => {
      if (!team) return null;
      const roster = phase?.teams.find((snapshot) =>
        snapshot.teamName === team.name && snapshot.leagueId === team.leagueId,
      ) ?? null;
      return {
        team: roster?.logoUrl ? { ...team, logoUrl: roster.logoUrl } : team,
        roster,
      };
    };
    return {
      key,
      label: international ? INTERNATIONAL_LABELS[event] : SPLIT_LABELS[split],
      champion: finalist(champion),
      runnerUp: finalist(runnerUp),
    };
  });
}
