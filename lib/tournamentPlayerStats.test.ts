import { describe, expect, it } from "vitest";
import type { TournamentState } from "./tournament";
import { computeTournamentPlayerStats } from "./tournamentPlayerStats";

const five = <T,>(v: T) => [v, v, v, v, v];

// Minimal shape: only the fields computeTournamentPlayerStats reads.
function game(blueTeam: string, redTeam: string, blueTopKda: { k: number; d: number; a: number }, topGold: number) {
  const idle = { k: 0, d: 1, a: 0 };
  return {
    blueTeam, redTeam, winner: "blue",
    recap: {
      perPickKDA: { blue: [blueTopKda, idle, idle, idle, idle], red: five(idle) },
      ratings: { blue: [8, 5, 5, 5, 5], red: five(4) },
      laneGoldDiff: { top: topGold },
    },
  };
}

describe("computeTournamentPlayerStats", () => {
  it("credits the team that actually played each side when sides swap", () => {
    const players = (team: string) => five(0).map((_, i) => ({ id: `${team}${i}`, name: `${team}${i}` }));
    const t = {
      teams: [{ id: "a", name: "A", players: players("a") }, { id: "b", name: "B", players: players("b") }],
      matches: [{
        blueTeamId: "a", redTeamId: "b",
        series: { games: [
          game("A", "B", { k: 5, d: 0, a: 2 }, 900), // A top on blue
          game("B", "A", { k: 1, d: 3, a: 1 }, 400), // sides swapped: B top on blue
        ] },
      }],
    } as unknown as TournamentState;
    const stats = computeTournamentPlayerStats(t);
    expect(stats).toHaveLength(10);
    const aTop = stats.find((s) => s.playerId === "a0")!;
    expect(aTop).toMatchObject({
      teamId: "a", lane: "top", kdaGames: 2, kills: 5, deaths: 1, assists: 2,
      ratingGames: 2, ratingSum: 12, goldGames: 2, goldDiffSum: 500,
    });
    // Lanes with no recorded gold stay unknown rather than counting as zero.
    expect(stats.find((s) => s.playerId === "a1")!.goldGames).toBe(0);
  });
});
