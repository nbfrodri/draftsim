import { describe, expect, it } from "vitest";

import {
  buildYearResultEntry,
  collectSimResultUpdates,
  compressSimResultsFeed,
  countSummarizedYears,
  simResultKey,
  simResultYears,
  type SimResultEntry,
} from "./simResultsSummary";
import type { SeasonState } from "./types";

function fabricate(
  parts: Partial<SeasonState> & Pick<SeasonState, "id">,
): SeasonState {
  return {
    name: "Test Season",
    status: "in-progress",
    teams: [
      {
        id: "t1",
        leagueId: "LCK",
        name: "Alpha",
        color: "#fff",
        iconKey: "shield",
        players: [],
        personalityId: "balanced",
      },
      {
        id: "t2",
        leagueId: "LCK",
        name: "Beta",
        color: "#000",
        iconKey: "shield",
        players: [],
        personalityId: "balanced",
      },
    ],
    splitResults: {},
    intlResults: {},
    phases: [],
    phaseIndex: 0,
    tournaments: {},
    config: {} as SeasonState["config"],
    currentMeta: {} as SeasonState["currentMeta"],
    updatedAt: 0,
    ...parts,
  } as SeasonState;
}

describe("collectSimResultUpdates", () => {
  it("emits split results once all leagues are placed", () => {
    const season = fabricate({
      id: "s1",
      franchise: { id: "r1", name: "Reality", year: 3 },
      splitResults: {
        winter: {
          LCK: ["t1", "t2"],
          LPL: ["t1", "t2"],
          LEC: ["t1", "t2"],
          LCS: ["t1", "t2"],
          CBLOL: ["t1", "t2"],
          LCP: ["t1", "t2"],
        },
      },
    });
    const seen = new Set<string>();
    const first = collectSimResultUpdates(season, seen);
    expect(first).toHaveLength(1);
    expect(first[0].kind).toBe("split");
    if (first[0].kind === "split") {
      expect(first[0].year).toBe(3);
      expect(first[0].leagues[0]?.placements[0]?.name).toBe("Alpha");
    }
    expect(collectSimResultUpdates(season, seen)).toHaveLength(0);
  });

  it("emits intl and year summaries when the season completes", () => {
    const season = fabricate({
      id: "s2",
      status: "complete",
      intlResults: {
        "first-stand": ["t1", "t2"],
        msi: ["t2", "t1"],
        worlds: ["t1", "t2"],
      },
      champion: "t1",
    });
    const seen = new Set<string>();
    const updates = collectSimResultUpdates(season, seen);
    const kinds = updates.map((u) => u.kind);
    expect(kinds).toContain("intl");
    expect(kinds).toContain("year");
    const year = updates.find((u) => u.kind === "year");
    expect(year && year.kind === "year" && year.worldsChampion?.name).toBe(
      "Alpha",
    );
  });
});

describe("simResultKey", () => {
  it("dedupes by season id and event", () => {
    const season = fabricate({
      id: "abc",
      status: "complete",
      intlResults: { worlds: ["t1"] },
    });
    const entry = buildYearResultEntry(season);
    expect(simResultKey(entry)).toBe("year:abc");
  });
});

describe("buildYearResultEntry", () => {
  it("includes followed-team placements when controlledTeamId is set", () => {
    const season = fabricate({
      id: "s3",
      status: "complete",
      config: { controlledTeamId: "t1" } as SeasonState["config"],
      splitResults: {
        winter: {
          LCK: ["t1", "t2"],
          LPL: ["t2", "t1"],
          LEC: ["t1", "t2"],
          LCS: ["t1", "t2"],
          CBLOL: ["t1", "t2"],
          LCP: ["t1", "t2"],
        },
      },
      intlResults: {
        "first-stand": ["t2", "t1"],
        msi: ["t1", "t2"],
        worlds: ["t2", "t1"],
      },
      champion: "t2",
    });
    const entry = buildYearResultEntry(season);
    expect(entry.followedTeam?.team.name).toBe("Alpha");
    expect(entry.followedTeam?.splits.winter).toBe(1);
    expect(entry.followedTeam?.intls.msi).toBe(1);
    expect(entry.followedTeam?.intls.worlds).toBe(2);
  });
});

describe("simResultYears", () => {
  it("returns sorted unique years from feed entries", () => {
    const years = simResultYears([
      { kind: "split", seasonId: "a", year: 5, split: "winter", label: "Winter Split", leagues: [] },
      { kind: "intl", seasonId: "a", year: 3, event: "msi", label: "MSI", placements: [] },
      { kind: "year", seasonId: "b", year: 5, seasonName: "Y5", splits: [], intls: [], worldsChampion: null, followedTeam: null },
    ]);
    expect(years).toEqual([3, 5]);
  });
});

describe("compressSimResultsFeed", () => {
  it("keeps only year summaries for older franchise years", () => {
    const yearSummary = (year: number): SimResultEntry => ({
      kind: "year",
      seasonId: `y${year}`,
      year,
      seasonName: `Year ${year}`,
      splits: [],
      intls: [],
      worldsChampion: null,
      followedTeam: null,
    });
    const split = (year: number): SimResultEntry => ({
      kind: "split",
      seasonId: `y${year}`,
      year,
      split: "winter",
      label: "Winter Split",
      leagues: [],
    });

    const entries: SimResultEntry[] = [
      split(1),
      yearSummary(1),
      split(2),
      yearSummary(2),
      split(3),
      yearSummary(3),
      split(4),
      yearSummary(4),
      split(5),
      yearSummary(5),
    ];

    const compressed = compressSimResultsFeed(entries, 3);
    expect(compressed).toHaveLength(8);
    expect(compressed.filter((e) => e.year === 1)).toEqual([yearSummary(1)]);
    expect(compressed.filter((e) => e.year === 2)).toEqual([yearSummary(2)]);
    expect(compressed.filter((e) => e.kind === "split" && e.year >= 3)).toHaveLength(3);
    expect(countSummarizedYears(compressed)).toBe(2);
  });
});
