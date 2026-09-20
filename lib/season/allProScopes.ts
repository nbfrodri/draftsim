import type { SeasonHistoryEntry } from "./history";
import type { PlayerSeasonRecord } from "./stats";

export const ALL_PRO_LABELS = {
  "split-league": "Domestic Split All-Pro",
  "split-global": "Global Split All-Pro",
  "season-global": "All-Pro Team of the Year",
} as const;

/** Read-only normalization. Never reinterpret the old tournament total. */
export function archivedAllProCounts(entry: SeasonHistoryEntry, player: PlayerSeasonRecord) {
  if (entry.allProTeams != null) {
    let split = 0, global = 0, season = 0;
    for (const team of entry.allProTeams) {
      if (!team.members.some(member => member.playerId === player.playerId)) continue;
      if (team.scope === "split-league") split++;
      else if (team.scope === "split-global") global++;
      else if (team.scope === "season-global") season++;
    }
    return { split, global, season, total: split + global + season, complete: entry.allProTeams.every(team => team.members.every(member => !!member.playerId)) };
  }
  const split = player.allProSplit ?? 0;
  const global = player.allProGlobalSplit ?? 0;
  const season = player.allProSeason ?? 0;
  return {
    split, global, season, total: split + global + season,
    complete: player.allProSplit != null && player.allProGlobalSplit != null && player.allProSeason != null,
  };
}
