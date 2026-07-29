import { describe, expect, it } from "vitest";

import type { SeasonHistoryEntry } from "./history";
import { archivedTeamSnapshotForScope, latestTeamRoster } from "./teamCard";
import { latestPlayerRosterSnapshot, historyPlayerCardTeam } from "./playerCard";

const LANES = ["top", "jungle", "middle", "bottom", "support"] as const;

function entry(
  id: string,
  archivedAt: number,
  teams: Array<{
    teamName: string;
    players: Array<{ id: string; name: string; tier: string; lane: string }>;
  }>,
): SeasonHistoryEntry {
  return {
    id,
    archivedAt,
    name: id,
    complete: true,
    champion: null,
    runnerUp: null,
    intlChampions: {},
    splitChampions: {},
    phaseRosters: [
      {
        phaseIndex: 0,
        label: "Summer Split",
        kind: "split",
        split: "summer",
        teams: teams.map((t) => ({
          teamId: t.teamName,
          teamName: t.teamName,
          leagueId: "LCK" as const,
          players: t.players.map((p) => ({
            ...p,
            goodChamps: [1, 2],
            badChamps: [],
          })),
        })),
      },
      // Empty late-phase chrome — must not blank the card.
      {
        phaseIndex: 1,
        label: "Worlds",
        kind: "international",
        event: "worlds",
        teams: teams.map((t) => ({
          teamId: t.teamName,
          teamName: t.teamName,
          leagueId: "LCK" as const,
          players: [],
        })),
      },
    ],
  } as unknown as SeasonHistoryEntry;
}

describe("archivedTeamSnapshotForScope", () => {
  it("prefers the matching split/intl phase roster over the latest phase", () => {
    const e = {
      id: "Y1",
      archivedAt: 1,
      name: "Year 1",
      complete: true,
      champion: null,
      runnerUp: null,
      intlChampions: {},
      splitChampions: {},
      phaseRosters: [
        {
          phaseIndex: 0,
          label: "Summer Split",
          kind: "split",
          split: "summer",
          teams: [
            {
              teamId: "T1",
              teamName: "T1",
              leagueId: "LCK",
              players: LANES.map((lane, i) => ({
                id: `summer-${i}`,
                name: `Summer${i}`,
                tier: "A",
                lane,
                goodChamps: [1],
                badChamps: [],
              })),
            },
          ],
        },
        {
          phaseIndex: 1,
          label: "Worlds",
          kind: "international",
          event: "worlds",
          teams: [
            {
              teamId: "T1",
              teamName: "T1",
              leagueId: "LCK",
              players: LANES.map((lane, i) => ({
                id: `worlds-${i}`,
                name: `Worlds${i}`,
                tier: "S",
                lane,
                goodChamps: [1],
                badChamps: [],
              })),
            },
          ],
        },
      ],
    } as unknown as SeasonHistoryEntry;

    const summer = archivedTeamSnapshotForScope(e, { name: "T1", leagueId: "LCK" }, "summer");
    expect(summer?.stage).toBe("Summer Split");
    expect(summer?.players.map((p) => p.id)).toEqual(LANES.map((_, i) => `summer-${i}`));

    const worlds = archivedTeamSnapshotForScope(e, { name: "T1", leagueId: "LCK" }, "worlds");
    expect(worlds?.stage).toBe("Worlds");
    expect(worlds?.players.map((p) => p.id)).toEqual(LANES.map((_, i) => `worlds-${i}`));
  });

  it("falls back to latest non-empty phase when scope phase is missing", () => {
    const e = entry("Y1", 1, [
      {
        teamName: "T1",
        players: LANES.map((lane, i) => ({
          id: `p-${i}`,
          name: `P${i}`,
          tier: "B",
          lane,
        })),
      },
    ]);
    const snap = archivedTeamSnapshotForScope(
      e,
      { name: "T1", leagueId: "LCK" },
      "msi",
    );
    expect(snap?.stage).toBe("Summer Split");
    expect(snap?.players.map((p) => p.id)).toEqual(LANES.map((_, i) => `p-${i}`));
  });
});

describe("latestTeamRoster", () => {
  it("picks the newest season's non-empty phase roster", () => {
    const old = entry("Y1", 1, [
      {
        teamName: "T1",
        players: LANES.map((lane, i) => ({
          id: `old-${i}`,
          name: `Old${i}`,
          tier: "B",
          lane,
        })),
      },
    ]);
    const neu = entry("Y2", 2, [
      {
        teamName: "T1",
        players: LANES.map((lane, i) => ({
          id: `new-${i}`,
          name: `New${i}`,
          tier: "S",
          lane,
        })),
      },
    ]);
    const snap = latestTeamRoster([old, neu], { name: "T1", leagueId: "LCK" });
    expect(snap?.entry.id).toBe("Y2");
    expect(snap?.stage).toBe("Summer Split");
    expect(snap?.players.map((p) => p.id)).toEqual(
      LANES.map((_, i) => `new-${i}`),
    );
  });
});

describe("latestPlayerRosterSnapshot", () => {
  it("returns the newest archive appearance for identity fields", () => {
    const y1 = entry("Y1", 1, [
      {
        teamName: "T1",
        players: [
          { id: "p1", name: "Alice", tier: "B", lane: "middle" },
          ...LANES.slice(1).map((lane, i) => ({
            id: `f-${i}`,
            name: `F${i}`,
            tier: "B",
            lane,
          })),
        ],
      },
    ]);
    const y2 = entry("Y2", 2, [
      {
        teamName: "Gen.G",
        players: [
          { id: "p1", name: "Alice", tier: "S", lane: "middle" },
          ...LANES.slice(1).map((lane, i) => ({
            id: `g-${i}`,
            name: `G${i}`,
            tier: "A",
            lane,
          })),
        ],
      },
    ]);
    const snap = latestPlayerRosterSnapshot([y1, y2], "p1");
    expect(snap?.entry.id).toBe("Y2");
    expect(snap?.teamName).toBe("Gen.G");
    expect(snap?.tier).toBe("S");
    expect(snap?.goodChamps).toEqual([1, 2]);
  });
});

describe("historyPlayerCardTeam", () => {
  it("year pin ignores career most-recent team", () => {
    const team = historyPlayerCardTeam({
      yearPinned: true,
      identitySnap: null,
      yearRecord: { teamName: "T1", leagueId: "LCK" },
      hintTeamName: "Hint Org",
      careerTeam: { name: "Gen.G", leagueId: "LCK" },
    });
    expect(team?.name).toBe("T1");
  });

  it("year pin uses row hint when archive identity is missing", () => {
    const team = historyPlayerCardTeam({
      yearPinned: true,
      identitySnap: null,
      hintTeamName: "Winter Champs",
      careerTeam: { name: "Current Org", leagueId: "LCK" },
    });
    expect(team?.name).toBe("Winter Champs");
  });

  it("career scope may use most-recent hit team", () => {
    const team = historyPlayerCardTeam({
      yearPinned: false,
      identitySnap: null,
      careerTeam: { name: "Gen.G", leagueId: "LCK" },
    });
    expect(team?.name).toBe("Gen.G");
  });
});
