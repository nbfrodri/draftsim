import { describe, expect, it } from "vitest";

import {
  computeTeamRecords,
  splitWinnersByRegion,
  teamRecordKey,
} from "./historyRecords";
import type { SeasonHistoryEntry, SeasonHistoryTeamRef } from "./history";

const team = (
  name: string,
  leagueId: SeasonHistoryTeamRef["leagueId"] = "LCK",
  color = "#e84057",
): SeasonHistoryTeamRef => ({ name, leagueId, color, iconKey: "sword" });

function entry(
  id: string,
  name: string,
  archivedAt: number,
  overrides: Partial<SeasonHistoryEntry> = {},
): SeasonHistoryEntry {
  return {
    id,
    archivedAt,
    name,
    complete: true,
    champion: null,
    runnerUp: null,
    intlChampions: {},
    splitChampions: {},
    ...overrides,
  };
}

describe("computeTeamRecords", () => {
  it("matches franchises by name + league across seasons and counts titles", () => {
    const s1 = entry("s1", "Season 1", 1000, {
      champion: team("T1"),
      intlChampions: {
        "first-stand": team("G2", "LEC"),
        msi: team("T1"),
        worlds: team("T1"),
      },
      splitChampions: {
        winter: { LCK: team("T1"), LEC: team("G2", "LEC") },
        spring: { LCK: team("T1") },
        summer: { LCK: team("GEN") },
      },
    });
    const s2 = entry("s2", "Season 2", 2000, {
      champion: team("GEN"),
      intlChampions: { msi: team("T1"), worlds: team("GEN") },
      splitChampions: {
        winter: { LCK: team("T1") },
        summer: { LEC: team("G2", "LEC") },
      },
    });
    const records = computeTeamRecords([s1, s2]);

    const t1 = records.find((r) => r.key === "LCK:T1")!;
    expect(t1.splitTitles).toBe(3); // S1 winter+spring, S2 winter
    expect(t1.intlTitles.msi).toBe(2);
    expect(t1.worldsTitles).toBe(1);
    expect(t1.intlTotal).toBe(3);
    expect(t1.totalTitles).toBe(6);
    // T1 leads the overall board.
    expect(records[0].key).toBe("LCK:T1");

    const g2 = records.find((r) => r.key === "LEC:G2")!;
    expect(g2.splitTitles).toBe(2);
    expect(g2.intlTitles["first-stand"]).toBe(1);
    expect(g2.totalTitles).toBe(3);

    const gen = records.find((r) => r.key === "LCK:GEN")!;
    expect(gen.splitTitles).toBe(1);
    expect(gen.worldsTitles).toBe(1);
    expect(gen.totalTitles).toBe(2);
  });

  it("does NOT merge same-named teams from different leagues", () => {
    const s = entry("s1", "Season 1", 1000, {
      splitChampions: {
        winter: { LCK: team("Rogue", "LCK"), LEC: team("Rogue", "LEC") },
      },
    });
    const records = computeTeamRecords([s]);
    expect(records).toHaveLength(2);
    expect(teamRecordKey(team("Rogue", "LCK"))).toBe("LCK:Rogue");
    expect(records.every((r) => r.splitTitles === 1)).toBe(true);
  });

  it("uses the newest archived identity (color/icon) for a franchise", () => {
    const old = entry("s1", "Season 1", 1000, {
      splitChampions: { winter: { LCK: team("T1", "LCK", "#111111") } },
    });
    const fresh = entry("s2", "Season 2", 2000, {
      splitChampions: { winter: { LCK: team("T1", "LCK", "#222222") } },
    });
    const records = computeTeamRecords([old, fresh]);
    expect(records[0].team.color).toBe("#222222");
    expect(records[0].splitTitles).toBe(2);
    expect(records[0].splitTitleLabels).toEqual([
      "Season 2 · Winter Split",
      "Season 1 · Winter Split",
    ]);
  });

  it("falls back to the headline champion for the Worlds title when intlChampions.worlds is missing", () => {
    const sparse = entry("s1", "Season 1", 1000, { champion: team("T1") });
    const records = computeTeamRecords([sparse]);
    expect(records[0].worldsTitles).toBe(1);
    expect(records[0].intlTitles.worlds).toBe(1);
  });
});

describe("splitWinnersByRegion", () => {
  it("groups split winners by league, most titles first", () => {
    const s1 = entry("s1", "Season 1", 1000, {
      splitChampions: {
        winter: { LCK: team("T1"), LEC: team("G2", "LEC") },
        spring: { LCK: team("GEN") },
        summer: { LCK: team("T1") },
      },
    });
    const s2 = entry("s2", "Season 2", 2000, {
      splitChampions: { winter: { LCK: team("T1") } },
    });
    const byRegion = splitWinnersByRegion(computeTeamRecords([s1, s2]));
    expect(byRegion.LCK!.map((r) => [r.team.name, r.splitTitles])).toEqual([
      ["T1", 3],
      ["GEN", 1],
    ]);
    expect(byRegion.LEC!.map((r) => r.team.name)).toEqual(["G2"]);
    // International-only winners never appear on the split boards.
    expect(byRegion.LPL).toBeUndefined();
  });
});
