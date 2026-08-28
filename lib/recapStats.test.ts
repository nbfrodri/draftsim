import { describe, expect, it } from "vitest";
import { gameKillTotals, teamKillsFromRecap } from "./recapStats";
import type { GameRecap } from "./types";

const recap: GameRecap = {
  durationMinutes: 32,
  mvp: null,
  biggestSwing: null,
  perPickKDA: {
    blue: [
      { k: 3, d: 1, a: 8 },
      { k: 4, d: 2, a: 9 },
      { k: 5, d: 1, a: 7 },
      { k: 9, d: 1, a: 6 },
      { k: 1, d: 2, a: 12 },
    ],
    red: [
      { k: 1, d: 4, a: 1 },
      { k: 2, d: 5, a: 2 },
      { k: 2, d: 4, a: 2 },
      { k: 1, d: 5, a: 1 },
      { k: 1, d: 4, a: 3 },
    ],
  },
};

describe("recapStats", () => {
  it("sums per-pick KDA when stored totals are absent", () => {
    expect(teamKillsFromRecap(recap, "blue")).toBe(22);
    expect(teamKillsFromRecap(recap, "red")).toBe(7);
    expect(gameKillTotals(recap)).toEqual({ blue: 22, red: 7 });
  });

  it("prefers stored blueKills/redKills when present", () => {
    const stored = { ...recap, blueKills: 30, redKills: 12 };
    expect(gameKillTotals(stored)).toEqual({ blue: 30, red: 12 });
  });

  it("returns null when no kill data exists", () => {
    const bare: GameRecap = {
      durationMinutes: 20,
      mvp: null,
      biggestSwing: null,
    };
    expect(gameKillTotals(bare)).toBeNull();
  });
});
