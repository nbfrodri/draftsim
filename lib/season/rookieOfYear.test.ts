import { describe, expect, it } from "vitest";
import { computeSeasonRookiesOfYear } from "./stats";
import type { SeasonState } from "./types";

function mkSeason(): SeasonState {
  return {
    id: "s1",
    name: "Test Reality — Year 3",
    status: "complete",
    franchise: { id: "r1", name: "Test", year: 3, aging: false },
    teams: [
      {
        id: "t1",
        name: "Alpha",
        leagueId: "LCK",
        iconKey: "shield",
        color: "#fff",
        players: [
          {
            id: "p-top",
            name: "RookieTop",
            lane: "top",
            tier: "A",
            debutYear: 3,
          },
          {
            id: "p-vet",
            name: "Veteran",
            lane: "jungle",
            tier: "S",
            debutYear: 1,
          },
        ],
      },
    ],
    tournaments: {},
    phases: [],
    splitResults: { summer: { LCK: ["t1"] } },
    intlResults: {},
    phaseRosters: [
      {
        kind: "split",
        split: "summer",
        label: "Summer",
        teams: [
          {
            teamId: "t1",
            teamName: "Alpha",
            leagueId: "LCK",
            players: [
              { id: "p-top", name: "RookieTop", tier: "A", lane: "top", debutYear: 3 },
              { id: "p-vet", name: "Veteran", tier: "S", lane: "jungle", debutYear: 1 },
            ],
          },
        ],
      },
    ],
  } as unknown as SeasonState;
}

describe("computeSeasonRookiesOfYear", () => {
  it("awards only debut-year players, one per lane", () => {
    const out = computeSeasonRookiesOfYear(mkSeason());
    expect(out).toHaveLength(1);
    expect(out[0]!.playerId).toBe("p-top");
    expect(out[0]!.lane).toBe("top");
    expect(out[0]!.splitTitles).toBe(1);
  });
});
