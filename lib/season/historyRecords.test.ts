import { describe, expect, it } from "vitest";

import {
  computeTeamRecords,
  splitWinnersByRegion,
  teamRecordKey,
  bestTeamPerRegion,
  computeRegionStrength,
  computeTitleStreaks,
  computePlayerAllTime,
  computeRegionTitleLeaders,
} from "./historyRecords";
import type { PlayerSeasonRecord } from "./stats";
import { goldenRoadTeam, goldenRoadRequiresGlobalCup } from "./history";
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

describe("dynasty classification", () => {
  it("flags Legendary for a Worlds-anchored 6+-major window", () => {
    // T1 across two seasons: 4 splits + MSI + Worlds = 6 majors, 1 Worlds.
    const s1 = entry("s1", "Season 1", 1000, {
      champion: team("T1"),
      intlChampions: { msi: team("T1"), worlds: team("T1") },
      splitChampions: { winter: { LCK: team("T1") }, spring: { LCK: team("T1") } },
    });
    const s2 = entry("s2", "Season 2", 2000, {
      splitChampions: { winter: { LCK: team("T1") }, summer: { LCK: team("T1") } },
    });
    const t1 = computeTeamRecords([s1, s2]).find((r) => r.key === "LCK:T1")!;
    expect(t1.dynasty.tier).toBe("legendary");
    expect(t1.dynasty.windowTitles).toBe(6);
    expect(t1.dynasty.windowWorlds).toBe(1);
  });

  it("flags a base Dynasty for 4 majors incl. an international (no Worlds)", () => {
    // G2: First Stand + 3 splits = 4 majors, 1 international, 0 Worlds.
    const s1 = entry("s1", "Season 1", 1000, {
      intlChampions: { "first-stand": team("G2", "LEC") },
      splitChampions: {
        winter: { LEC: team("G2", "LEC") },
        spring: { LEC: team("G2", "LEC") },
      },
    });
    const s2 = entry("s2", "Season 2", 2000, {
      splitChampions: { summer: { LEC: team("G2", "LEC") } },
    });
    const g2 = computeTeamRecords([s1, s2]).find((r) => r.key === "LEC:G2")!;
    expect(g2.dynasty.tier).toBe("dynasty");
    expect(g2.dynasty.windowTitles).toBe(4);
    expect(g2.dynasty.windowIntl).toBe(1);
  });

  it("does NOT flag a splits-only run, however dominant (no international)", () => {
    // 6 split titles in two seasons but zero international titles → not a
    // dynasty under the international-anchored rule.
    const s1 = entry("s1", "Season 1", 1000, {
      splitChampions: {
        winter: { LCK: team("T1") },
        spring: { LCK: team("T1") },
        summer: { LCK: team("T1") },
      },
    });
    const s2 = entry("s2", "Season 2", 2000, {
      splitChampions: {
        winter: { LCK: team("T1") },
        spring: { LCK: team("T1") },
        summer: { LCK: team("T1") },
      },
    });
    const t1 = computeTeamRecords([s1, s2]).find((r) => r.key === "LCK:T1")!;
    expect(t1.splitTitles).toBe(6);
    expect(t1.dynasty.tier).toBe("none");
  });

  it("does NOT flag a dynasty when majors are spread beyond a 5-season window", () => {
    // An international + a split, but seasons far apart → never 4 in any 5.
    const a = entry("a", "Season A", 1000, {
      intlChampions: { "first-stand": team("T1") },
      splitChampions: { winter: { LCK: team("T1") } },
    });
    const pads = [2000, 3000, 4000, 5000].map((at, i) =>
      entry(`p${i}`, `Pad ${i}`, at),
    );
    const b = entry("b", "Season B", 6000, {
      intlChampions: { msi: team("T1") },
      splitChampions: { summer: { LCK: team("T1") } },
    });
    const t1 = computeTeamRecords([a, ...pads, b]).find(
      (r) => r.key === "LCK:T1",
    )!;
    expect(t1.totalTitles).toBe(4);
    expect(t1.dynasty.tier).toBe("none"); // 2 majors in any 5-window
  });
});

describe("goldenRoadTeam", () => {
  const sweep = (overrides: Partial<SeasonHistoryEntry> = {}) =>
    entry("gr", "Golden Year", 1000, {
      champion: team("T1"),
      intlChampions: {
        "first-stand": team("T1"),
        msi: team("T1"),
        worlds: team("T1"),
      },
      splitChampions: {
        winter: { LCK: team("T1") },
        spring: { LCK: team("T1") },
        summer: { LCK: team("T1") },
      },
      ...overrides,
    });

  it("detects a perfect six-title sweep", () => {
    expect(goldenRoadTeam(sweep())?.name).toBe("T1");
  });

  it("is null when any title is missing (e.g. a dropped split)", () => {
    const e = sweep({
      splitChampions: {
        winter: { LCK: team("T1") },
        spring: { LCK: team("GEN") }, // T1 didn't win Spring
        summer: { LCK: team("T1") },
      },
    });
    expect(goldenRoadTeam(e)).toBeNull();
  });

  it("is null when an international is lost", () => {
    const e = sweep({
      intlChampions: {
        "first-stand": team("T1"),
        msi: team("BLG", "LPL"), // T1 didn't win MSI
        worlds: team("T1"),
      },
    });
    expect(goldenRoadTeam(e)).toBeNull();
  });

  it("requires Global Cup on quadrennial franchise years", () => {
    const cupYear = sweep({
      name: "My Reality — Year 4",
      intlChampions: {
        "first-stand": team("T1"),
        msi: team("T1"),
        worlds: team("T1"),
      },
    });
    expect(goldenRoadRequiresGlobalCup(cupYear)).toBe(true);
    expect(goldenRoadTeam(cupYear)).toBeNull();

    expect(
      goldenRoadTeam(
        sweep({
          name: "My Reality — Year 4",
          intlChampions: {
            "first-stand": team("T1"),
            msi: team("T1"),
            worlds: team("T1"),
            "global-cup": team("T1"),
          },
        }),
      )?.name,
    ).toBe("T1");
  });
});

describe("bestTeamPerRegion", () => {
  it("picks each region's most decorated franchise", () => {
    const s = entry("s1", "Season 1", 1000, {
      champion: team("T1"),
      intlChampions: { worlds: team("T1") },
      splitChampions: {
        winter: { LCK: team("T1"), LEC: team("G2", "LEC") },
        spring: { LCK: team("GEN") },
        summer: { LCK: team("T1") },
      },
    });
    const best = bestTeamPerRegion(computeTeamRecords([s]));
    expect(best.LCK?.team.name).toBe("T1"); // 2 splits + 1 worlds beats GEN
    expect(best.LEC?.team.name).toBe("G2");
    expect(best.LPL).toBeUndefined(); // no titled team
  });
});

describe("computeRegionStrength", () => {
  it("ranks regions by weighted silverware and counts Worlds finals", () => {
    const s = entry("s1", "Season 1", 1000, {
      champion: team("T1"), // LCK wins Worlds
      runnerUp: team("BLG", "LPL"), // LPL reaches Worlds final
      intlChampions: { worlds: team("T1"), msi: team("BLG", "LPL") },
      splitChampions: { winter: { LCK: team("T1") } },
    });
    const strength = computeRegionStrength(computeTeamRecords([s]), [s]);
    expect(strength[0].league).toBe("LCK"); // Worlds title tops the table
    const lck = strength.find((r) => r.league === "LCK")!;
    const lpl = strength.find((r) => r.league === "LPL")!;
    expect(lck.worldsTitles).toBe(1);
    expect(lck.worldsFinals).toBe(1);
    expect(lpl.intlTitles).toBe(1); // MSI
    expect(lpl.worldsFinals).toBe(1); // runner-up
  });
});

describe("computeTitleStreaks", () => {
  it("measures consecutive title seasons and the longest drought", () => {
    // T1 wins in seasons 1,2,3 (streak 3), skips 4,5, wins 6 (drought 2).
    const entries = [1, 2, 3, 6].map((n) =>
      entry(`s${n}`, `Season ${n}`, n * 1000, {
        splitChampions: { winter: { LCK: team("T1") } },
      }),
    );
    entries.splice(3, 0, entry("s4", "Season 4", 4000));
    entries.splice(4, 0, entry("s5", "Season 5", 5000));
    const streaks = computeTitleStreaks(entries);
    const t1 = streaks.find((s) => s.team.name === "T1")!;
    expect(t1.longestStreak).toBe(3);
    expect(t1.longestDrought).toBe(2);
    expect(t1.totalTitles).toBe(4);
  });
});

describe("computePlayerAllTime", () => {
  it("sums team-position MVP and All-Pro tallies across seasons", () => {
    const mk = (
      id: string,
      at: number,
      tally: SeasonHistoryEntry["awardTally"],
    ) => entry(id, id, at, { awardTally: tally });
    const entries = [
      mk("s1", 1000, [
        { team: team("T1"), lane: "middle", mvp: 1, allPro: 1 },
        { team: team("GEN"), lane: "top", mvp: 0, allPro: 1 },
      ]),
      mk("s2", 2000, [
        { team: team("T1"), lane: "middle", mvp: 2, allPro: 1 },
      ]),
    ];
    const lines = computePlayerAllTime(entries);
    const faker = lines.find(
      (l) => l.team.name === "T1" && l.lane === "middle",
    )!;
    expect(faker.mvp).toBe(3);
    expect(faker.allPro).toBe(2);
  });

  it("is empty when no entry carries award data", () => {
    const s = entry("s1", "Season 1", 1000, {
      splitChampions: { winter: { LCK: team("T1") } },
    });
    expect(computePlayerAllTime([s])).toEqual([]);
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

describe("computeRegionTitleLeaders", () => {
  const rec = (o: Partial<PlayerSeasonRecord>): PlayerSeasonRecord => ({
    playerId: "p1",
    playerName: "Faker",
    leagueId: "LCK",
    games: 10,
    kills: 0,
    mvps: 0,
    allPro: 0,
    splitTitles: 0,
    intlAppearances: 0,
    intlTitles: 0,
    ...o,
  });

  it("credits split titles to the region they were won in, not the latest league", () => {
    // Won 2 splits in LCK, then moved to the LCS and won 1 there.
    const s1 = entry("s1", "S1", 1000, {
      playerCareers: [rec({ leagueId: "LCK", teamName: "T1", splitTitles: 2, intlTitles: 1 })],
    });
    const s2 = entry("s2", "S2", 2000, {
      playerCareers: [rec({ leagueId: "LCS", teamName: "TL", splitTitles: 1 })],
    });
    const leaders = computeRegionTitleLeaders([s1, s2]);

    const lck = leaders.find((l) => l.leagueId === "LCK");
    const lcs = leaders.find((l) => l.leagueId === "LCS");
    expect(lck).toMatchObject({ playerId: "p1", splitTitles: 2, intlTitles: 1, teamName: "T1" });
    expect(lcs).toMatchObject({ playerId: "p1", splitTitles: 1, intlTitles: 0, teamName: "TL" });
  });

  it("ignores title-less seasons and sums repeats within a region", () => {
    const a = entry("a", "A", 1000, {
      playerCareers: [rec({ leagueId: "LPL", splitTitles: 1 })],
    });
    const b = entry("b", "B", 2000, {
      playerCareers: [rec({ leagueId: "LPL", splitTitles: 0, intlTitles: 0 })], // no title → ignored
    });
    const c = entry("c", "C", 3000, {
      playerCareers: [rec({ leagueId: "LPL", splitTitles: 1 })],
    });
    const leaders = computeRegionTitleLeaders([a, b, c]);
    expect(leaders).toHaveLength(1);
    expect(leaders[0]).toMatchObject({ leagueId: "LPL", splitTitles: 2 });
  });
});
