import { describe, it, expect } from "vitest";
import type { Lane, PlayerTier, Roster } from "./types";
import { LANE_ORDER } from "./players";
import { playerLanePoolBias, playerLaneTierBias } from "./matchSimulator";

function roster(tiers: PlayerTier[]): Roster {
  return LANE_ORDER.map((lane, i) => ({
    lane,
    tier: tiers[i],
    goodChamps: [],
    badChamps: [],
  }));
}

// All-B roster with custom good/bad champion ids for one lane.
function rosterWithPool(
  lane: Lane,
  goodChamps: number[],
  badChamps: number[],
): Roster {
  return LANE_ORDER.map((l) => ({
    lane: l,
    tier: "B" as PlayerTier,
    goodChamps: l === lane ? goodChamps : [],
    badChamps: l === lane ? badChamps : [],
  }));
}

const sumOverLanes = (b: Roster | undefined, r: Roster | undefined) =>
  LANE_ORDER.reduce((s, l) => s + playerLaneTierBias(b, r, l), 0);

describe("playerLaneTierBias (micro-lane player effect)", () => {
  it("is zero when both rosters are identical", () => {
    const r = roster(["A", "A", "A", "A", "A"]);
    for (const lane of LANE_ORDER) {
      expect(playerLaneTierBias(roster(["A", "A", "A", "A", "A"]), r, lane)).toBe(
        0,
      );
    }
  });

  it("favors the lane whose player out-tiers their own team average", () => {
    // Blue has a star toplaner among otherwise-B players; red is all B.
    const blue = roster(["S", "B", "B", "B", "B"]);
    const red = roster(["B", "B", "B", "B", "B"]);
    expect(playerLaneTierBias(blue, red, "top")).toBeGreaterThan(0);
    // The other four lanes tilt slightly the other way (blue laners sit below
    // their own raised team mean) — that's the zero-sum redistribution.
    expect(playerLaneTierBias(blue, red, "middle")).toBeLessThan(0);
  });

  it("sums to zero across the five lanes (no team-level double-count)", () => {
    const blue = roster(["S", "A", "B", "C", "D"]);
    const red = roster(["B", "B", "A", "C", "S"]);
    expect(Math.abs(sumOverLanes(blue, red))).toBeLessThan(1e-9);
  });

  it("ignores the team-level mean gap (carried by the macro star instead)", () => {
    // Blue all S, red all D: a huge macro gap, but every player sits exactly
    // at their own team's mean → no per-lane deviation → zero micro bias.
    const blue = roster(["S", "S", "S", "S", "S"]);
    const red = roster(["D", "D", "D", "D", "D"]);
    for (const lane of LANE_ORDER) {
      expect(playerLaneTierBias(blue, red, lane)).toBe(0);
    }
  });

  it("returns 0 when a roster is missing the lane / undefined", () => {
    const r = roster(["A", "A", "A", "A", "A"]);
    expect(playerLaneTierBias(undefined, r, "top")).toBe(0);
    expect(playerLaneTierBias(r, undefined, "top")).toBe(0);
  });
});

describe("playerLanePoolBias (champion-pool fit)", () => {
  const neutral = roster(["B", "B", "B", "B", "B"]);

  it("rewards a laner on one of their liked champions", () => {
    const blue = rosterWithPool("top", [100], []);
    // blue top plays champ 100 (liked); red top plays 200 (neutral)
    expect(playerLanePoolBias(blue, neutral, 100, 200, "top")).toBeGreaterThan(
      0,
    );
  });

  it("penalizes a laner on one of their disliked champions", () => {
    const blue = rosterWithPool("top", [], [100]);
    expect(playerLanePoolBias(blue, neutral, 100, 200, "top")).toBeLessThan(0);
  });

  it("stacks a liked-vs-disliked matchup into a bigger swing", () => {
    const blue = rosterWithPool("top", [100], []); // blue comfy
    const red = rosterWithPool("top", [], [200]); // red on a bad champ
    const oneSided = playerLanePoolBias(blue, neutral, 100, 200, "top");
    const bothWays = playerLanePoolBias(blue, red, 100, 200, "top");
    expect(bothWays).toBeGreaterThan(oneSided);
  });

  it("is 0 for neutral champions and only affects the assigned lane", () => {
    const blue = rosterWithPool("top", [100], []);
    expect(playerLanePoolBias(blue, neutral, 999, 200, "top")).toBe(0); // not the liked champ
    expect(playerLanePoolBias(blue, neutral, 100, 200, "middle")).toBe(0); // wrong lane
  });

  it("returns 0 with missing rosters", () => {
    expect(playerLanePoolBias(undefined, neutral, 100, 200, "top")).toBe(0);
    expect(playerLanePoolBias(neutral, undefined, 100, 200, "top")).toBe(0);
  });
});
