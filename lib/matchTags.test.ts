import { describe, expect, it } from "vitest";
import { isReverseSweep } from "./matchTags";
import type { TournamentMatch } from "./tournament";

function match(
  overrides: Partial<TournamentMatch> & {
    gameWinners: Array<"blue" | "red">;
  },
): TournamentMatch {
  const { gameWinners, ...rest } = overrides;
  let b = 0;
  let r = 0;
  for (const side of gameWinners) {
    if (side === "blue") b++;
    else r++;
  }
  const winnerTeamId =
    b > r ? (rest.blueTeamId ?? "blue") : (rest.redTeamId ?? "red");
  return {
    id: "m1",
    round: 1,
    blueTeamId: "blue",
    redTeamId: "red",
    format: "bo5",
    fearless: false,
    mode: "aivai",
    aiSide: null,
    aiDifficulty: "medium",
    series: {
      id: "s1",
      format: "bo5",
      fearless: false,
      timerEnabled: false,
      blueTeam: "Blue",
      redTeam: "Red",
      games: gameWinners.map((side, i) => ({
        id: i + 1,
        blueTeam: "Blue",
        redTeam: "Red",
        bluePicks: [],
        redPicks: [],
        blueBans: [],
        redBans: [],
        blueRoles: [],
        redRoles: [],
        winner: side,
        status: "complete" as const,
      })),
      status: "complete",
      winner: b > r ? "blue" : "red",
      mode: "aivai",
      aiSide: null,
      aiDifficulty: "medium",
    },
    winner: { teamId: winnerTeamId, blueWins: b, redWins: r },
    feedsInto: null,
    ...rest,
  };
}

describe("isReverseSweep", () => {
  it("detects a 0-2 → 3-2 comeback in Bo5", () => {
    expect(
      isReverseSweep(
        match({ gameWinners: ["blue", "blue", "red", "red", "red"] }),
      ),
    ).toBe(true);
    expect(
      isReverseSweep(
        match({ gameWinners: ["red", "red", "blue", "blue", "blue"] }),
      ),
    ).toBe(true);
  });

  it("rejects non-reverse 3-2 Bo5 results", () => {
    expect(
      isReverseSweep(
        match({ gameWinners: ["blue", "red", "blue", "red", "blue"] }),
      ),
    ).toBe(false);
    expect(
      isReverseSweep(
        match({ gameWinners: ["blue", "blue", "blue", "red", "red"] }),
      ),
    ).toBe(false);
  });

  it("does not apply to Bo3 or other formats", () => {
    const bo3 = match({
      format: "bo3",
      gameWinners: ["blue", "blue", "red"],
      winner: { teamId: "blue", blueWins: 2, redWins: 1 },
    });
    expect(isReverseSweep(bo3)).toBe(false);
  });
});
