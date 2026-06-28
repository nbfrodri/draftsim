import { describe, it, expect } from "vitest";
import { computeTeamChampionWR, type TournamentState } from "./tournament";

// Minimal tournament shape: computeTeamChampionWR only reads
// matches[].series.games[].{winner, blue/redPicks, blue/redTeam}.
function tournamentOf(
  games: Array<{
    blueTeam: string;
    redTeam: string;
    winner: "blue" | "red" | null;
    bluePicks: (number | null)[];
    redPicks: (number | null)[];
  }>,
): TournamentState {
  return {
    matches: [{ series: { games } }],
  } as unknown as TournamentState;
}

describe("computeTeamChampionWR", () => {
  it("credits each team's own picks, swap-safe, and tallies W/L", () => {
    // Game 1: A on blue, wins on champ 10. Game 2: sides SWAP — A on red, loses
    // on champ 10. A must be 1-1 on champ 10 (not mis-attributed to blue side).
    const t = tournamentOf([
      { blueTeam: "A", redTeam: "B", winner: "blue", bluePicks: [10], redPicks: [20] },
      { blueTeam: "B", redTeam: "A", winner: "blue", bluePicks: [20], redPicks: [10] },
    ]);
    const wr = computeTeamChampionWR(t);
    const a10 = wr.get("A")!.get(10)!;
    expect(a10).toMatchObject({ games: 2, wins: 1, winRate: 0.5 });
    // A's sequence on champ 10 is win→loss, so the recency-weighted rate (recent
    // loss counts most) sits BELOW the flat 0.5.
    expect(a10.recentWinRate).toBeLessThan(0.5);
    // B played champ 20 both games: lost game 1 (on red), won game 2 (on blue).
    const b20 = wr.get("B")!.get(20)!;
    expect(b20).toMatchObject({ games: 2, wins: 1, winRate: 0.5 });
    // B's sequence is loss→win, so its recent rate sits ABOVE the flat 0.5.
    expect(b20.recentWinRate).toBeGreaterThan(0.5);
  });

  it("skips games with no winner", () => {
    const t = tournamentOf([
      { blueTeam: "A", redTeam: "B", winner: null, bluePicks: [10], redPicks: [20] },
    ]);
    expect(computeTeamChampionWR(t).size).toBe(0);
  });
});
