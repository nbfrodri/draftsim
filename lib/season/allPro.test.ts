import { describe, it, expect } from "vitest";
import { computePlayerChampStats } from "./stats";
import { computeAllProTeams, computeAllProCounts } from "./allPro";
import type { SeasonState } from "./types";

// One finished game. Champion picks live on the draft (picks + roles); the
// player on each pick is found by lane via perPickIds. Roles are intentionally
// NOT in positional order so the test fails if the join uses slot index instead
// of the role→lane→perPickIds mapping.
function seasonWithGame(): SeasonState {
  const recap = {
    durationMinutes: 30,
    mvp: null,
    perPickIds: {
      blue: ["a0", "a1", "a2", "a3", "a4"], // indexed by positional lane top..sup
      red: ["b0", "b1", "b2", "b3", "b4"],
    },
  };
  return {
    teams: [
      { id: "A", name: "A", leagueId: "LCK", players: [] },
      { id: "B", name: "B", leagueId: "LPL", players: [] },
    ],
    phases: [],
    tournaments: {
      t: {
        matches: [
          {
            isBye: false,
            blueTeamId: "A",
            redTeamId: "B",
            series: {
              games: [
                {
                  blueTeam: "A",
                  winner: "blue",
                  status: "complete",
                  bluePicks: [100, 101, 102, 103, 104],
                  redPicks: [200, 201, 202, 203, 204],
                  // pick 0 is a jungler, pick 1 a toplaner, …
                  blueRoles: ["jungle", "top", "support", "middle", "bottom"],
                  redRoles: ["jungle", "top", "support", "middle", "bottom"],
                  recap,
                },
              ],
            },
          },
        ],
      },
    },
  } as unknown as SeasonState;
}

describe("computePlayerChampStats", () => {
  it("joins champion to player by lane (not slot) and credits the win", () => {
    const champs = computePlayerChampStats(seasonWithGame());
    // Blue pick 0 (champ 100) is jungle → perPickIds.blue[1] = "a1".
    expect(champs.get("a1")).toEqual([{ championId: 100, games: 1, wins: 1 }]);
    // Blue pick 1 (champ 101) is top → perPickIds.blue[0] = "a0".
    expect(champs.get("a0")).toEqual([{ championId: 101, games: 1, wins: 1 }]);
    // Red lost → games counted, no win.
    expect(champs.get("b1")).toEqual([{ championId: 200, games: 1, wins: 0 }]);
  });
});

describe("computeAllPro on a sparse season", () => {
  it("returns no teams and no counts without enough data, and does not throw", () => {
    const s = seasonWithGame();
    expect(computeAllProTeams(s)).toEqual([]); // no split phases, < 8 rated games
    expect(computeAllProCounts(s).size).toBe(0);
  });
});
