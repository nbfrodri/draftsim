import { describe, it, expect } from "vitest";
import { computePlayerTitlesByEvent, teamPrestigeScore, type TeamRecord } from "./historyRecords";
import type { SeasonHistoryEntry } from "./history";
import type { LeagueId } from "./types";

function emptyEntry(over: Partial<SeasonHistoryEntry> = {}): SeasonHistoryEntry {
  return {
    id: "s1",
    archivedAt: 1,
    name: "Test — Year 4",
    complete: true,
    champion: null,
    runnerUp: null,
    intlChampions: {},
    splitChampions: {},
    ...over,
  };
}

describe("Global Cup Hall weighting", () => {
  it("weights Global Cup above Worlds in team prestige", () => {
    const base = (intl: TeamRecord["intlTitles"]): TeamRecord => ({
      key: "LCK:T1",
      team: { name: "T1", leagueId: "LCK" as LeagueId, color: "", iconKey: "shield" },
      splitTitles: 0,
      intlTitles: intl,
      intlTotal: Object.values(intl).reduce((a, b) => a + (b ?? 0), 0),
      worldsTitles: intl.worlds ?? 0,
      totalTitles: Object.values(intl).reduce((a, b) => a + (b ?? 0), 0),
      goldenRoads: 0,
      seasonsActive: 1,
    });
    const worldsOnly = teamPrestigeScore(base({ worlds: 1 }));
    const gcOnly = teamPrestigeScore(base({ "global-cup": 1 }));
    expect(gcOnly).toBeGreaterThan(worldsOnly);
  });

  it("counts Global Cup in player title totals", () => {
    const entry = emptyEntry({
      intlChampions: {
        "global-cup": { name: "T1", leagueId: "LCK", color: "", iconKey: "shield" },
      },
      phaseRosters: [
        {
          phaseIndex: 0,
          kind: "international",
          label: "Global Cup",
          event: "global-cup",
          tournamentIds: [],
          teams: [
            {
              teamId: "t1",
              teamName: "T1",
              leagueId: "LCK",
              players: [
                { id: "p1", lane: "middle", tier: "S", name: "Ace" },
                { id: "p2", lane: "top", tier: "A", name: "Top" },
                { id: "p3", lane: "jungle", tier: "A", name: "Jg" },
                { id: "p4", lane: "bottom", tier: "A", name: "Bot" },
                { id: "p5", lane: "support", tier: "A", name: "Sup" },
              ],
            },
          ],
        },
      ],
    });
    const byEvent = computePlayerTitlesByEvent([entry]);
    expect(byEvent.get("p1")?.globalCup).toBe(1);
  });
});
