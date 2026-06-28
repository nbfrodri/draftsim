import { describe, it, expect } from "vitest";
import { gameSideTeamId } from "./stats";

// Regression guard: series swap sides between games (loser-blue), so per-game
// side-keyed stats must resolve the game's side to the real team, NOT the
// match's nominal blue/red. A revert to match-level ids would re-break this.
describe("gameSideTeamId", () => {
  const MATCH_BLUE = "tBlue";
  const MATCH_RED = "tRed";
  const blueName = "Alpha"; // nameOf(MATCH_BLUE)
  const redName = "Beta"; // nameOf(MATCH_RED)

  it("keeps sides when the game's blue side is the match's blue team", () => {
    // Game 1 (or any game where Alpha is on blue): no swap.
    expect(gameSideTeamId(MATCH_BLUE, MATCH_RED, blueName, redName, "Alpha", "blue")).toBe(MATCH_BLUE);
    expect(gameSideTeamId(MATCH_BLUE, MATCH_RED, blueName, redName, "Alpha", "red")).toBe(MATCH_RED);
  });

  it("flips sides when the game swapped (match's blue team is now on red)", () => {
    // Game 2: the OTHER team ("Beta") is on blue this game.
    expect(gameSideTeamId(MATCH_BLUE, MATCH_RED, blueName, redName, "Beta", "blue")).toBe(MATCH_RED);
    expect(gameSideTeamId(MATCH_BLUE, MATCH_RED, blueName, redName, "Beta", "red")).toBe(MATCH_BLUE);
  });

  it("keeps nominal sides when the game name matches neither team (corrupt data)", () => {
    expect(gameSideTeamId(MATCH_BLUE, MATCH_RED, blueName, redName, "Ghost", "blue")).toBe(MATCH_BLUE);
    expect(gameSideTeamId(MATCH_BLUE, MATCH_RED, blueName, redName, "Ghost", "red")).toBe(MATCH_RED);
  });
});
