// computeFinalsMvp — the international finals MVP must be a player from the
// WINNING team, judged on the grand final, even if a loser played better.

import { describe, expect, it } from "vitest";
import { computeFinalsMvp } from "./awards";
import type { TournamentState } from "./tournament";

function finalOnly(): TournamentState {
  const recap = {
    durationMinutes: 30,
    mvp: null,
    biggestSwing: null,
    // Winner (blue) top is the best on the champion side (9.0); the LOSER (red)
    // has higher ratings across the board (10s) but must not be eligible.
    ratings: { blue: [9, 6, 6, 6, 6], red: [10, 10, 10, 10, 10] },
    perPickIds: {
      blue: ["w-top", "w-jg", "w-mid", "w-bot", "w-sup"],
      red: ["l-top", "l-jg", "l-mid", "l-bot", "l-sup"],
    },
    perPickNames: {
      blue: ["WTop", "WJg", "WMid", "WBot", "WSup"],
      red: ["LTop", "LJg", "LMid", "LBot", "LSup"],
    },
  };
  return {
    status: "complete",
    format: "single-elim",
    teams: [
      { id: "W", name: "Winners", seed: 1, starRating: 3 },
      { id: "L", name: "Losers", seed: 2, starRating: 3 },
    ],
    matches: [
      {
        id: "gf",
        round: 1,
        bracket: "grand-final",
        blueTeamId: "W",
        redTeamId: "L",
        feedsInto: null,
        series: {
          games: [
            {
              blueTeam: "Winners",
              redTeam: "Losers",
              status: "complete",
              winner: "blue",
              recap,
            },
          ],
        },
        winner: { teamId: "W", blueWins: 1, redWins: 0 },
      },
    ],
  } as unknown as TournamentState;
}

describe("computeFinalsMvp", () => {
  it("picks the best player FROM THE WINNING TEAM in the final", () => {
    const mvp = computeFinalsMvp(finalOnly());
    expect(mvp).not.toBeNull();
    expect(mvp!.teamId).toBe("W");
    expect(mvp!.playerId).toBe("w-top");
    expect(mvp!.playerName).toBe("WTop");
    expect(mvp!.avgRating).toBe(9);
  });

  it("returns null when nothing is decided", () => {
    const t = { teams: [], matches: [] } as unknown as TournamentState;
    expect(computeFinalsMvp(t)).toBeNull();
  });
});
