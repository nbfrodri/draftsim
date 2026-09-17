import type { Lane } from "../types";
import type { LeagueId } from "./types";
import {
  TROPHIES,
  type TitleAward,
  type TitleDataset,
  type TitleEntity,
  type Trophy,
} from "./titlePlayground";

const EVENT_ORDER: readonly Trophy[] = [
  "winter",
  "first-stand",
  "spring",
  "msi",
  "summer",
  "worlds",
  "global-cup",
];
export const ROSTER_LANES: readonly Lane[] = [
  "top",
  "jungle",
  "middle",
  "bottom",
  "support",
];
export interface BestRoster {
  id: string;
  rank: number;
  players: TitleEntity[];
  internationals: number;
  splits: number;
  counts: Record<Trophy, number>;
  awards: TitleAward[];
}
export function bestRosters(
  data: TitleDataset,
  filters: { regions: readonly LeagueId[]; from: number; to: number },
) {
  const rosters = new Map<string, BestRoster>();
  let missingRosters = 0;
  for (const award of data.awards) {
    if (
      award.year < filters.from ||
      award.year > filters.to ||
      !filters.regions.includes(award.team.leagueId)
    )
      continue;
    const ids = award.players.map((player) => player.id);
    if (
      award.missingRoster ||
      ids.length !== 5 ||
      new Set(ids).size !== 5 ||
      !ROSTER_LANES.every((lane) =>
        award.players.some((player) => player.lane === lane),
      )
    ) {
      missingRosters++;
      continue;
    }
    // Player identity, not handle, club, lane order or consecutive tenure.
    const id = JSON.stringify(ids.sort());
    let row = rosters.get(id);
    if (!row) {
      row = {
        id,
        rank: 0,
        players: [],
        internationals: 0,
        splits: 0,
        counts: Object.fromEntries(
          TROPHIES.map((trophy) => [trophy, 0]),
        ) as Record<Trophy, number>,
        awards: [],
      };
      rosters.set(id, row);
    }
    row.awards.push(award);
    row.counts[award.trophy]++;
    if (
      award.trophy === "winter" ||
      award.trophy === "spring" ||
      award.trophy === "summer"
    )
      row.splits++;
    else row.internationals++;
  }
  const rows = [...rosters.values()].sort(
    (a, b) =>
      b.internationals - a.internationals ||
      b.splits - a.splits ||
      a.id.localeCompare(b.id),
  );
  rows.forEach((row, index) => {
    row.awards.sort(
      (a, b) =>
        b.year - a.year ||
        EVENT_ORDER.indexOf(b.trophy) - EVENT_ORDER.indexOf(a.trophy),
    );
    row.players = [...row.awards[0].players].sort(
      (a, b) => ROSTER_LANES.indexOf(a.lane!) - ROSTER_LANES.indexOf(b.lane!),
    );
    const previous = rows[index - 1];
    row.rank =
      previous &&
      previous.internationals === row.internationals &&
      previous.splits === row.splits
        ? previous.rank
        : index + 1;
  });
  return { rows, missingRosters };
}
