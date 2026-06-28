import { describe, it, expect } from "vitest";
import { teamSeasonGrades } from "./stats";
import type { SeasonState } from "./types";

// Minimal SeasonState: teamSeasonGrades only reads teams (id/name/players),
// phases.tournamentIds, and tournaments[].matches[].series.games[].
function player(id: string, lane: string) {
  return { id, lane, tier: "B", goodChamps: [], badChamps: [] };
}
function seasonWith(games: unknown[]): SeasonState {
  return {
    teams: [
      {
        id: "T1",
        name: "Alpha",
        players: [
          player("p0", "top"),
          player("p1", "jungle"),
          player("new", "middle"),
          player("p3", "bottom"),
          player("p4", "support"),
        ],
      },
    ],
    phases: [{ tournamentIds: ["t1"] }],
    tournaments: {
      t1: { matches: [{ blueTeamId: "T1", redTeamId: "T2", series: { games } }] },
    },
  } as unknown as SeasonState;
}

describe("teamSeasonGrades", () => {
  it("attributes notes to the player who played, not the current slot occupant", () => {
    const s = seasonWith([
      {
        status: "complete",
        winner: "blue",
        blueTeam: "Alpha",
        redTeam: "Beta",
        recap: {
          ratings: { blue: [6, 6, 9, 6, 6], red: [5, 5, 5, 5, 5] },
          // Mid was played by the departed "old", NOT the current "new".
          perPickIds: { blue: ["p0", "p1", "old", "p3", "p4"], red: ["x0", "x1", "x2", "x3", "x4"] },
        },
      },
    ]);
    const g = teamSeasonGrades(s, "T1");
    expect(g.avg[2]).toBeNull(); // "new" hasn't played → no stale 9 from "old"
    expect(g.avg[0]).toBeCloseTo(6); // p0 still in the slot
  });

  it("resolves the team's side per game (series side-swaps)", () => {
    const s = seasonWith([
      {
        status: "complete",
        winner: "red",
        blueTeam: "Beta", // sides swapped — Alpha is on RED this game
        redTeam: "Alpha",
        recap: {
          ratings: { blue: [1, 1, 1, 1, 1], red: [7, 7, 7, 7, 7] },
          perPickIds: { blue: ["x0", "x1", "x2", "x3", "x4"], red: ["p0", "p1", "new", "p3", "p4"] },
        },
      },
    ]);
    const g = teamSeasonGrades(s, "T1");
    expect(g.avg[0]).toBeCloseTo(7); // graded from RED notes, not blue's 1
    expect(g.avg[2]).toBeCloseTo(7); // "new" played mid this game → their note
  });
});
