import { describe, it, expect } from "vitest";
import { makeCoach, coachDifficulty, coachPlaystyle, swapCoaches, reassignCoaches } from "./coach";
import type { Coach } from "./coach";

const rng = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

describe("coachDifficulty", () => {
  it("maps rating to AI draft strength", () => {
    expect(coachDifficulty({ id: "c", name: "x", rating: 4.5, personalityId: "p", adaptability: 0.5 })).toBe("hard");
    expect(coachDifficulty({ id: "c", name: "x", rating: 3, personalityId: "p", adaptability: 0.5 })).toBe("normal");
    expect(coachDifficulty({ id: "c", name: "x", rating: 1.5, personalityId: "p", adaptability: 0.5 })).toBe("easy");
    expect(coachDifficulty(undefined)).toBeUndefined();
  });
});

describe("makeCoach", () => {
  it("produces a valid coach with a playstyle, rating tracks team strength", () => {
    const taken = new Set<string>();
    const weak = makeCoach(1, rng(1), taken);
    const strong = makeCoach(5, rng(2), taken);
    for (const c of [weak, strong]) {
      expect(c.id).toBeTruthy();
      expect(c.name).toBeTruthy();
      expect(c.rating).toBeGreaterThanOrEqual(1);
      expect(c.rating).toBeLessThanOrEqual(5);
      expect(coachPlaystyle(c)).toBeTruthy();
    }
    // Aggregate: stronger teams average better coaches.
    const r = rng(7);
    const avg = (star: number) => {
      let s = 0;
      for (let i = 0; i < 200; i++) s += makeCoach(star, r, new Set()).rating;
      return s / 200;
    };
    expect(avg(5)).toBeGreaterThan(avg(1));
  });
});

const coach = (id: string, rating: number): Coach => ({
  id,
  name: id,
  rating,
  personalityId: "p",
  adaptability: 0.5,
  motivation: 0.5,
});

describe("swapCoaches", () => {
  it("swaps two teams' coaches and leaves the rest untouched (same refs)", () => {
    const teams = [
      { id: "A", coach: coach("ca", 3) },
      { id: "B", coach: coach("cb", 4) },
      { id: "C", coach: coach("cc", 2) },
    ];
    const out = swapCoaches(teams, "A", "B");
    expect(out.find((t) => t.id === "A")!.coach!.id).toBe("cb");
    expect(out.find((t) => t.id === "B")!.coach!.id).toBe("ca");
    expect(out.find((t) => t.id === "C")).toBe(teams[2]); // unaffected ref preserved
  });

  it("no-ops on same id or unknown team", () => {
    const teams = [{ id: "A", coach: coach("ca", 3) }];
    expect(swapCoaches(teams, "A", "A")).toBe(teams);
    expect(swapCoaches(teams, "A", "Z")).toBe(teams);
  });
});

describe("reassignCoaches skip guard", () => {
  // Strong roster + weak coach vs weak roster + strong coach — swapping
  // improves assortative fit, so it WOULD trade without protection.
  const seed = () => [
    { id: "A", players: Array(5).fill({ tier: "S" }), coach: coach("weak", 1) },
    { id: "B", players: Array(5).fill({ tier: "D" }), coach: coach("strong", 5) },
  ];

  it("swaps beneficially when nobody is protected", () => {
    const out = reassignCoaches(seed() as never, rng(1));
    expect(out.find((t) => t.id === "A")!.coach!.id).toBe("strong");
  });

  it("never touches the protected (user-controlled) team's coach", () => {
    const out = reassignCoaches(seed() as never, rng(1), 20, "A");
    expect(out.find((t) => t.id === "A")!.coach!.id).toBe("weak");
    expect(out.find((t) => t.id === "B")!.coach!.id).toBe("strong");
  });
});
