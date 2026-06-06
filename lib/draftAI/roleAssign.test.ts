import { describe, it, expect } from "vitest";
import type { Champion, Lane, Roster } from "../types";
import { LANE_ORDER } from "../players";
import { reorderPicksByPosition } from "../draftEngine";
import { optimizeRoleAssignment } from "./roleAssign";

function ch(id: number, lanes: Lane[]): Champion {
  return { id, name: `c${id}`, alias: `c${id}`, roles: [], iconUrl: "", lanes };
}

// Two top/mid flex champions plus three single-lane champions.
const champs: Champion[] = [
  ch(1, ["top", "middle"]),
  ch(2, ["top", "middle"]),
  ch(3, ["jungle"]),
  ch(4, ["bottom"]),
  ch(5, ["support"]),
];

function rosterLikes(map: Partial<Record<Lane, number[]>>): Roster {
  return LANE_ORDER.map((lane) => ({
    lane,
    tier: "B" as const,
    goodChamps: map[lane] ?? [],
    badChamps: [],
  }));
}

describe("optimizeRoleAssignment", () => {
  it("flexes champions onto the lanes their players are comfortable with", () => {
    // Greedy would put champ 1 top (its primary) and champ 2 middle. But the
    // top player mains champ 2 and the mid player mains champ 1 → swap them.
    const roster = rosterLikes({ top: [2], middle: [1] });
    const res = optimizeRoleAssignment([1, 2, 3, 4, 5], champs, roster);
    // positional order: [top, jungle, middle, bottom, support]
    expect(res[0]).toBe(2); // top
    expect(res[2]).toBe(1); // middle
    // single-lane champions stay put
    expect(res[1]).toBe(3);
    expect(res[3]).toBe(4);
    expect(res[4]).toBe(5);
  });

  it("keeps a single-lane champion in its only lane", () => {
    const res = optimizeRoleAssignment([1, 2, 3, 4, 5], champs, undefined);
    expect(res[1]).toBe(3); // jungle-only champ → jungle slot
    expect(res[3]).toBe(4);
    expect(res[4]).toBe(5);
  });

  it("returns a permutation of the same five champions", () => {
    const res = optimizeRoleAssignment([1, 2, 3, 4, 5], champs, undefined);
    expect([...res].sort((a, b) => Number(a) - Number(b))).toEqual([
      1, 2, 3, 4, 5,
    ]);
  });

  it("falls back to greedy positional order for an incomplete comp", () => {
    const partial = [1, 2, 3, 4, null];
    expect(optimizeRoleAssignment(partial, champs, rosterLikes({}))).toEqual(
      reorderPicksByPosition(partial, champs),
    );
  });

  it("does not flex a champion into a lane it can't play (pool can't override playability)", () => {
    // Even if the support player 'likes' the jungle-only champ 3, 3 can't play
    // support, so the off-role penalty keeps it in jungle.
    const roster = rosterLikes({ support: [3] });
    const res = optimizeRoleAssignment([1, 2, 3, 4, 5], champs, roster);
    expect(res[1]).toBe(3); // still jungle
    expect(res[4]).toBe(5); // support stays the real support champ
  });
});
