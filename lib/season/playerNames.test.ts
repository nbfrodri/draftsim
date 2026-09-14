import { describe, it, expect } from "vitest";
import { generateHandle, nameRoster, realPlayersForTeam, isValidHandle } from "./playerNames";
import type { Player } from "../types";

const rng = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const roster = (): Player[] =>
  (["top", "jungle", "middle", "bottom", "support"] as const).map((lane) => ({
    lane,
    tier: "B",
    goodChamps: [],
    badChamps: [],
  }));

describe("generateHandle", () => {
  it("stays unique after exhausting all two-letter fallback suffixes", () => {
    const taken = new Set<string>(["Vex", "Vexxx"]);
    const handles = Array.from({ length: 1500 }, () => generateHandle(() => 0, taken));
    expect(new Set(handles).size).toBe(1500);
    expect(handles).not.toContain("Vexxx");
    expect(handles.every(isValidHandle)).toBe(true);
  });

  it("reserves names regardless of case and surrounding whitespace", () => {
    const taken = new Set([" VEX ", "vexaa"]);
    expect(generateHandle(() => 0, taken)).toBe("Vexab");
  });

  it("never repeats a handle while sharing a taken set", () => {
    const r = rng(1);
    const taken = new Set<string>();
    const handles = Array.from({ length: 300 }, () => generateHandle(r, taken));
    expect(new Set(handles).size).toBe(handles.length);
  });

  it("never ends with a digit or Roman suffix", () => {
    const r = rng(99);
    const taken = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const h = generateHandle(r, taken, i % 2 === 0 ? "LCK" : undefined);
      expect(isValidHandle(h)).toBe(true);
      expect(/\d$/.test(h)).toBe(false);
    }
  });
});

describe("nameRoster", () => {
  it("gives every lane a handle, generated when the team isn't real", () => {
    const named = nameRoster(roster(), "Some Fictional Team", rng(2), new Set());
    expect(named.every((p) => !!p.name)).toBe(true);
    expect(new Set(named.map((p) => p.name)).size).toBe(5); // unique within team
  });

  it("uses real handles for a covered team (T1 mid is a real pro)", () => {
    // T1 is in the bundled snapshot — middle lane should be a real handle, not
    // a generated one. (We assert it matches the snapshot, whatever it is.)
    const real = realPlayersForTeam("T1");
    expect(real.middle).toBeTruthy();
    const named = nameRoster(roster(), "T1", rng(3), new Set());
    const mid = named.find((p) => p.lane === "middle")!;
    expect(mid.name).toBe(real.middle);
  });
});

describe("realPlayersForTeam", () => {
  it("matches case/punctuation-insensitively and misses cleanly", () => {
    expect(realPlayersForTeam("t1")).toEqual(realPlayersForTeam("T1"));
    expect(realPlayersForTeam("No Such Team 9000")).toEqual({});
  });
});
