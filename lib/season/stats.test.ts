import { describe, it, expect } from "vitest";
import { computePlayerSeasonLines } from "./stats";
import type { SeasonState } from "./types";

// Minimal season with one finished game whose recap carries lane gold diffs
// (blue-positive). computePlayerSeasonLines should credit each player their own
// lane's gold diff — and flip the sign for the red side.
function seasonWithGame(): SeasonState {
  const recap = {
    durationMinutes: 30,
    mvp: null,
    perPickIds: {
      blue: ["a0", "a1", "a2", "a3", "a4"],
      red: ["b0", "b1", "b2", "b3", "b4"],
    },
    laneGoldDiff: { top: 500, jungle: -200, middle: 1000, bottom: 0, support: 100 },
    ratings: { blue: [7, 7, 8, 6, 6], red: [5, 5, 4, 6, 6] },
    pentakills: [],
  };
  return {
    teams: [
      { id: "A", name: "A", leagueId: "LCK", players: [] },
      { id: "B", name: "B", leagueId: "LPL", players: [] },
    ],
    tournaments: {
      t: {
        matches: [
          {
            isBye: false,
            blueTeamId: "A",
            redTeamId: "B",
            series: { games: [{ blueTeam: "A", winner: "blue", status: "complete", recap }] },
          },
        ],
      },
    },
  } as unknown as SeasonState;
}

describe("computePlayerSeasonLines gold diff", () => {
  it("credits each player's own lane gold diff, flipping sign for the red side", () => {
    const lines = computePlayerSeasonLines(seasonWithGame());
    const by = new Map(lines.map((l) => [l.playerId, l]));
    // Blue top is +500; the red top facing them is −500.
    expect(by.get("a0")!.goldDiffSum).toBe(500);
    expect(by.get("a0")!.goldDiffGames).toBe(1);
    expect(by.get("b0")!.goldDiffSum).toBe(-500);
    // Blue jungle −200 → red jungle +200.
    expect(by.get("a1")!.goldDiffSum).toBe(-200);
    expect(by.get("b1")!.goldDiffSum).toBe(200);
    // Rating accumulators are exposed for career re-averaging.
    expect(by.get("a2")!.ratingSum).toBe(8);
    expect(by.get("a2")!.ratingGames).toBe(1);
    expect(by.get("a2")!.avgRating).toBe(8);
  });
});
