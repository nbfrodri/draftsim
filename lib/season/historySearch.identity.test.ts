import { describe, expect, it } from "vitest";
import { buildTeamIdentity, refFor } from "./historySearch";
import type { SeasonHistoryEntry } from "./history";

describe("buildTeamIdentity logo merge", () => {
  it("merges logoUrl from phase roster snapshots", () => {
    const entries: SeasonHistoryEntry[] = [
      {
        id: "y1",
        archivedAt: 1,
        name: "Year 1",
        complete: true,
        champion: null,
        runnerUp: null,
        intlChampions: {},
        splitChampions: {},
        phaseRosters: [
          {
            kind: "split",
            split: "summer",
            label: "Summer",
            teams: [
              {
                teamId: "t1",
                teamName: "Fluxo",
                leagueId: "CBLOL",
                logoUrl: "https://example.com/fluxo.png",
                players: [],
              },
            ],
          },
        ],
      },
    ];
    const identity = buildTeamIdentity(entries);
    const ref = refFor(identity, "Fluxo", "CBLOL");
    expect(ref.logoUrl).toBe("https://example.com/fluxo.png");
  });
});
