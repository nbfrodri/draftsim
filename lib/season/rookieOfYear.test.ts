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
    tournaments: {
      game: { matches: [{ blueTeamId: "t1", redTeamId: "t2", series: { games: [{
        status: "complete", winner: "blue", blueTeam: "Alpha",
        bluePicks: [], redPicks: [], blueRoles: [], redRoles: [],
        recap: { perPickIds: { blue: ["p-top", "p-vet"], red: [] }, ratings: { blue: [7, 9], red: [] } },
      }] } }] },
    },
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
  it("does not award unused rookies even on a championship roster", () => {
    const s = mkSeason(); s.tournaments = {};
    expect(computeSeasonRookiesOfYear(s)).toEqual([]);
  });
  it("requires a finite rated sample", () => {
    const s = mkSeason();
    s.tournaments.game.matches[0].series!.games[0].recap!.ratings!.blue[0] = NaN;
    expect(computeSeasonRookiesOfYear(s)).toEqual([]);
  });
  it("does not fill an empty role with a zero-game rookie", () => {
    const s = mkSeason();
    s.teams[0].players.push({ id: "unused", name: "Unused", lane: "support", tier: "A", debutYear: 3 });
    expect(computeSeasonRookiesOfYear(s).map(p => p.playerId)).toEqual(["p-top"]);
  });
  it("awards only debut-year players, one per lane", () => {
    const out = computeSeasonRookiesOfYear(mkSeason());
    expect(out).toHaveLength(1);
    expect(out[0]!.playerId).toBe("p-top");
    expect(out[0]!.lane).toBe("top");
    expect(out[0]!.splitTitles).toBe(1);
  });
});
