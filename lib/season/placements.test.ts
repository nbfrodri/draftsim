import { describe, expect, it } from "vitest";

import type { SeasonHistoryEntry } from "./history";
import {
  intlOutcomeLabel,
  teamIntlOutcome,
  teamIntlPlacement,
  teamParticipatedIntl,
  teamSplitPlacement,
} from "./placements";
import { computeTeamRecords } from "./historyRecords";
import { playerProfile } from "./historySearch";
import { buildSeasonHistoryEntry } from "./history";
import type { SeasonState } from "./types";

function teamRef(name: string, leagueId = "LCK") {
  return { name, leagueId, color: "", iconKey: "shield" };
}

function entry(parts: Partial<SeasonHistoryEntry>): SeasonHistoryEntry {
  return {
    id: "S1",
    archivedAt: 1,
    name: "Year 1",
    complete: true,
    champion: null,
    runnerUp: null,
    intlChampions: {},
    splitChampions: {},
    ...parts,
  } as SeasonHistoryEntry;
}

describe("teamSplitPlacement", () => {
  it("reads full placement arrays when archived", () => {
    const e = entry({
      splitPlacements: {
        winter: { LCK: [teamRef("T1"), teamRef("Gen.G"), teamRef("HLE")] },
      },
    });
    expect(teamSplitPlacement(e, { name: "T1", leagueId: "LCK" }, "winter")).toBe(1);
    expect(teamSplitPlacement(e, { name: "Gen.G", leagueId: "LCK" }, "winter")).toBe(2);
    expect(teamSplitPlacement(e, { name: "HLE", leagueId: "LCK" }, "winter")).toBe(3);
  });

  it("falls back to champions and runners-up on legacy archives", () => {
    const e = entry({
      splitChampions: { summer: { LCK: teamRef("T1") } },
      splitRunnersUp: { summer: { LCK: teamRef("Gen.G") } },
    });
    expect(teamSplitPlacement(e, { name: "T1", leagueId: "LCK" }, "summer")).toBe(1);
    expect(teamSplitPlacement(e, { name: "Gen.G", leagueId: "LCK" }, "summer")).toBe(2);
    expect(teamSplitPlacement(e, { name: "HLE", leagueId: "LCK" }, "summer")).toBeNull();
  });
});

describe("teamIntlOutcome", () => {
  it("classifies champion, finalist, playoffs, play-ins, and DNQ", () => {
    const e = entry({
      intlPlacements: {
        worlds: [
          teamRef("T1"),
          teamRef("Gen.G"),
          teamRef("HLE"),
          teamRef("DK"),
          teamRef("BLG", "LPL"),
          teamRef("JDG", "LPL"),
          teamRef("G2", "LEC"),
          teamRef("FNC", "LEC"),
          teamRef("C9", "LCS"),
          teamRef("TL", "LCS"),
          teamRef("100", "LCS"),
          teamRef("FLY", "LCS"),
        ],
      },
      phaseRosters: [
        {
          phaseIndex: 0,
          label: "Worlds",
          kind: "international",
          event: "worlds",
          teams: Array.from({ length: 8 }, (_, i) => ({
            teamId: `w${i}`,
            teamName: ["T1", "Gen.G", "HLE", "DK", "BLG", "JDG", "G2", "FNC"][i]!,
            leagueId: i < 4 ? "LCK" : i < 6 ? "LPL" : "LEC",
            players: [],
          })),
        },
      ] as SeasonHistoryEntry["phaseRosters"],
    });
    expect(teamIntlOutcome(e, { name: "T1", leagueId: "LCK" }, "worlds").kind).toBe("champion");
    expect(teamIntlOutcome(e, { name: "Gen.G", leagueId: "LCK" }, "worlds").kind).toBe("finalist");
    expect(teamIntlOutcome(e, { name: "HLE", leagueId: "LCK" }, "worlds").kind).toBe(
      "playoffs-exit",
    );
    expect(teamIntlOutcome(e, { name: "C9", leagueId: "LCS" }, "worlds").kind).toBe("playins-exit");
    expect(teamIntlOutcome(e, { name: "KT", leagueId: "LCK" }, "worlds").kind).toBe(
      "did-not-qualify",
    );
  });

  it("labels outcomes for display", () => {
    expect(intlOutcomeLabel({ kind: "finalist", placement: 2 })).toBe("Final · #2");
    expect(intlOutcomeLabel({ kind: "did-not-qualify", placement: null })).toBe(
      "Didn't qualify",
    );
  });

  it("marks DNQ teams when phase roster snapshots every org", () => {
    const worldsPlacements = [
      teamRef("T1"),
      teamRef("Gen.G"),
      teamRef("HLE"),
      teamRef("DK"),
      teamRef("BLG", "LPL"),
      teamRef("JDG", "LPL"),
      teamRef("G2", "LEC"),
      teamRef("FNC", "LEC"),
      teamRef("C9", "LCS"),
      teamRef("TL", "LCS"),
      teamRef("100", "LCS"),
      teamRef("FLY", "LCS"),
    ];
    const seasonWidePhaseTeams = [
      ...worldsPlacements,
      teamRef("KT"),
      teamRef("DRX"),
      teamRef("NS"),
      teamRef("BRO"),
    ].map((t, i) => ({
      teamId: `org-${i}`,
      teamName: t.name,
      leagueId: t.leagueId,
      players: [],
    }));
    const e = entry({
      intlPlacements: { worlds: worldsPlacements },
      intlMainBracketSizes: { worlds: 8 },
      phaseRosters: [
        {
          phaseIndex: 0,
          label: "Worlds",
          kind: "international",
          event: "worlds",
          teams: seasonWidePhaseTeams,
        },
      ] as SeasonHistoryEntry["phaseRosters"],
    });
    expect(teamParticipatedIntl(e, { name: "KT", leagueId: "LCK" }, "worlds")).toBe(
      false,
    );
    expect(teamIntlOutcome(e, { name: "KT", leagueId: "LCK" }, "worlds").kind).toBe(
      "did-not-qualify",
    );
    expect(teamIntlOutcome(e, { name: "C9", leagueId: "LCS" }, "worlds").kind).toBe(
      "playins-exit",
    );
    expect(teamIntlOutcome(e, { name: "HLE", leagueId: "LCK" }, "worlds").kind).toBe(
      "playoffs-exit",
    );
  });
});

describe("buildSeasonHistoryEntry placements", () => {
  it("archives full split and international placement arrays", () => {
    const season = {
      id: "s1",
      name: "2026",
      status: "complete",
      champion: "t1",
      teams: [
        { id: "t1", name: "T1", leagueId: "LCK", color: "", iconKey: "s", players: [], personalityId: "b" },
        { id: "t2", name: "Gen.G", leagueId: "LCK", color: "", iconKey: "s", players: [], personalityId: "b" },
      ],
      splitResults: { winter: { LCK: ["t1", "t2"] } },
      intlResults: { worlds: ["t1", "t2"] },
    } as unknown as SeasonState;
    const archived = buildSeasonHistoryEntry(season, 1);
    expect(archived.splitPlacements?.winter?.LCK?.map((t) => t.name)).toEqual(["T1", "Gen.G"]);
    expect(archived.intlPlacements?.worlds?.map((t) => t.name)).toEqual(["T1", "Gen.G"]);
  });
});

describe("intl finals reached aggregates", () => {
  it("counts team finals from placement arrays", () => {
    const entries = [
      entry({
        intlPlacements: {
          msi: [teamRef("T1"), teamRef("Gen.G"), teamRef("BLG", "LPL")],
          worlds: [teamRef("Gen.G"), teamRef("T1")],
        },
      }),
      entry({
        id: "S2",
        intlPlacements: {
          msi: [teamRef("BLG", "LPL"), teamRef("T1")],
        },
      }),
    ];
    const t1 = computeTeamRecords(entries).find((r) => r.key === "LCK:T1")!;
    expect(t1.intlFinalsReached.msi).toBe(2);
    expect(t1.intlFinalsReached.worlds).toBe(1);
    expect(teamIntlPlacement(entries[0]!, { name: "BLG", leagueId: "LPL" }, "msi")).toBe(3);
  });

  it("credits player finals only while rostered on the club", () => {
    const e = entry({
      intlPlacements: { msi: [teamRef("T1"), teamRef("Gen.G")] },
      intlChampions: { msi: teamRef("T1") },
      phaseRosters: [
        {
          phaseIndex: 0,
          label: "MSI",
          kind: "international",
          event: "msi",
          teams: [
            {
              teamId: "t1",
              teamName: "T1",
              leagueId: "LCK",
              players: [{ id: "P1", name: "P1", lane: "top", tier: "A" }],
            },
          ],
        },
      ] as SeasonHistoryEntry["phaseRosters"],
    });
    const p1 = playerProfile([e], "P1")!;
    expect(p1.intlFinalsReached.msi).toBe(1);
  });
});
