import { expect, it } from "vitest";
import { bestRosters, ROSTER_LANES } from "./bestRosters";
import { buildTitleDataset, type Trophy } from "./titlePlayground";
import type { SeasonHistoryEntry, SeasonHistoryTeamRef } from "./history";
import { LEAGUE_IDS } from "./types";
const t1: SeasonHistoryTeamRef = {
  name: "T1",
  leagueId: "LCK",
  iconKey: "shield",
  color: "#fff",
};
const g2: SeasonHistoryTeamRef = { ...t1, name: "G2", leagueId: "LEC" };
const all = { regions: LEAGUE_IDS, from: 1, to: 100 };
function entry(
  year: number,
  team = t1,
  trophy: Trophy = "worlds",
  replacement = false,
): SeasonHistoryEntry {
  const split =
    trophy === "winter" || trophy === "spring" || trophy === "summer";
  return {
    id: `s${year}`,
    name: `Reality Year ${year}`,
    archivedAt: year,
    complete: true,
    champion: null,
    runnerUp: null,
    intlChampions: split ? {} : { [trophy]: team },
    splitChampions: split ? { [trophy]: { [team.leagueId]: team } } : {},
    phaseRosters: [
      {
        phaseIndex: 0,
        label: trophy,
        kind: split ? "split" : "international",
        ...(split ? { split: trophy } : { event: trophy }),
        teams: [
          {
            teamId: team.name,
            teamName: team.name,
            leagueId: team.leagueId,
            players: ROSTER_LANES.map((lane, index) => ({
              id: replacement && index === 0 ? "new-person" : `p${index}`,
              name: `Player ${index}`,
              lane,
              tier: "S",
            })),
          },
        ],
      },
    ],
  };
}
it("combines the same five identities across years and clubs, but separates one replacement with the same name", () => {
  const first = entry(1);
  const second = entry(2, g2, "msi");
  second.phaseRosters![0].teams[0].players.reverse();
  second.phaseRosters![0].teams[0].players[0].name = "Renamed player";
  const data = buildTitleDataset([
    first,
    second,
    entry(3, t1, "worlds", true),
    entry(4, g2, "global-cup"),
  ]);
  const result = bestRosters(data, all);
  expect(result.rows).toHaveLength(2);
  expect(result.rows[0].internationals).toBe(3);
  expect(result.rows[1].internationals).toBe(1);
  expect(result.rows[0].players.map((player) => player.lane)).toEqual(
    ROSTER_LANES,
  );
  expect(
    bestRosters(data, { ...all, regions: ["LEC"], from: 2, to: 2 }).rows[0]
      .internationals,
  ).toBe(1);
  expect(bestRosters(data, { ...all, regions: ["LPL"] }).rows).toEqual([]);
});
it("prioritizes international titles, breaks ties by splits and shares tied ranks", () => {
  const data = buildTitleDataset([
    entry(1),
    entry(2, t1, "winter", true),
    entry(3, t1, "spring", true),
  ]);
  expect(
    bestRosters(data, all).rows.map((row) => [row.internationals, row.splits]),
  ).toEqual([
    [1, 0],
    [0, 2],
  ]);
  const tied = buildTitleDataset([entry(1), entry(2, t1, "msi", true)]);
  expect(bestRosters(tied, all).rows.map((row) => row.rank)).toEqual([1, 1]);
  const tieBreak = buildTitleDataset([
    entry(1),
    entry(2, t1, "msi", true),
    entry(3, t1, "winter", true),
  ]);
  expect(bestRosters(tieBreak, all).rows[0].splits).toBe(1);
});
it("excludes missing or incomplete snapshots and deduplicates archived versions", () => {
  const missing = entry(1);
  delete missing.phaseRosters;
  const incomplete = entry(2);
  incomplete.phaseRosters![0].teams[0].players.pop();
  const good = entry(3);
  const result = bestRosters(
    buildTitleDataset([missing, incomplete, good, { ...good, archivedAt: 30 }]),
    all,
  );
  expect(result.missingRosters).toBe(2);
  expect(result.rows[0].internationals).toBe(1);
  expect(
    bestRosters(buildTitleDataset([missing]), { ...all, from: 2 })
      .missingRosters,
  ).toBe(0);
});
it("uses the latest winning event for the displayed snapshot, including role swaps", () => {
  const season = entry(1, t1, "msi");
  season.splitChampions = { summer: { LCK: t1 } };
  const summer = structuredClone(season.phaseRosters![0]);
  summer.kind = "split";
  summer.split = "summer";
  delete summer.event;
  summer.teams[0].players[0].name = "LatestName";
  season.phaseRosters!.push(summer);
  const row = bestRosters(buildTitleDataset([season]), all).rows[0];
  expect(row.awards[0].trophy).toBe("summer");
  expect(row.players[0].name).toBe("LatestName");
});
