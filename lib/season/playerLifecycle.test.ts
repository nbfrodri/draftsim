import { describe, it, expect } from "vitest";
import {
  agePlayer,
  makeRookie,
  offseasonEvolveRoster,
  seedRosterCareers,
} from "./playerLifecycle";
import { PLAYER_TIER_VALUE } from "../players";
import type { Champion, Lane, Player } from "../types";

const rng = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const LANES: Lane[] = ["top", "jungle", "middle", "bottom", "support"];
const champions: Champion[] = LANES.flatMap((lane, li) =>
  Array.from({ length: 6 }, (_, i) => ({
    id: li * 10 + i,
    name: `${lane}${i}`,
    alias: `${lane}${i}`,
    roles: [],
    iconUrl: "",
    lanes: [lane],
  })),
);

const player = (over: Partial<Player>): Player =>
  ({ lane: "middle", tier: "B", goodChamps: [], badChamps: [], ...over });

describe("makeRookie", () => {
  it("is young with upside and a full kit", () => {
    const r = makeRookie("middle", champions, rng(1), new Set());
    expect(r.age).toBeGreaterThanOrEqual(17);
    expect(r.age).toBeLessThanOrEqual(19);
    expect(r.id).toBeTruthy();
    expect(r.name).toBeTruthy();
    expect(PLAYER_TIER_VALUE[r.potential!]).toBeGreaterThanOrEqual(PLAYER_TIER_VALUE[r.tier]);
    expect(r.goodChamps.length).toBeGreaterThan(0);
  });
});

describe("agePlayer growth vs decline", () => {
  // Aggregate over many seeds: a young, below-potential player who keeps
  // performing should trend UP; an old one should trend DOWN / retire.
  const meanTier = (make: () => Player | null, n: number) => {
    let sum = 0,
      alive = 0;
    for (let i = 0; i < n; i++) {
      const p = make();
      if (p) {
        sum += PLAYER_TIER_VALUE[p.tier];
        alive++;
      }
    }
    return { mean: alive ? sum / alive : 0, aliveRate: alive / n };
  };

  it("young talent performing well climbs", () => {
    const start = PLAYER_TIER_VALUE["C"]; // -1
    const { mean } = meanTier(
      () => agePlayer(player({ tier: "C", age: 20, potential: "S" }), 8, rng(Math.random() * 1e9 | 0)),
      400,
    );
    expect(mean).toBeGreaterThan(start);
  });

  it("veterans decline and eventually retire", () => {
    const { mean, aliveRate } = meanTier(
      () => agePlayer(player({ tier: "A", age: 31, potential: "A" }), 4, rng(Math.random() * 1e9 | 0)),
      400,
    );
    expect(aliveRate).toBeLessThan(1); // some retire
    expect(mean).toBeLessThan(PLAYER_TIER_VALUE["A"]); // survivors trend down
  });
});

describe("offseasonEvolveRoster", () => {
  it("keeps 5 lane-ordered players, replacing retirees with rookies", () => {
    const roster = seedRosterCareers(
      LANES.map((lane) => player({ lane, tier: "B", age: 33 })), // all near retirement
      rng(7),
    );
    const next = offseasonEvolveRoster(
      roster,
      [6, 6, 6, 6, 6],
      champions,
      rng(9),
      new Set(),
    );
    expect(next).toHaveLength(5);
    expect(next.map((p) => p.lane)).toEqual(LANES);
    for (const p of next) {
      expect(p.id).toBeTruthy();
      expect(typeof p.age).toBe("number");
    }
  });

  it("reports each retirement→rookie swap into the debuts sink", () => {
    // Build aged players directly (seedRosterCareers would randomize age low) so
    // retirement is near-certain — age 40 with id set, ready for agePlayer.
    const roster = LANES.map((lane, i) =>
      player({ lane, tier: "D", age: 40, id: `vet-${i}`, name: `vet-${lane}` }),
    );
    const debuts: import("./playerLifecycle").RookieDebut[] = [];
    const next = offseasonEvolveRoster(roster, [6, 6, 6, 6, 6], champions, rng(9), new Set(), debuts);
    // Each retired slot logs a debut event naming the retiree and the rookie.
    expect(debuts.length).toBeGreaterThan(0);
    expect(debuts.length).toBe(next.filter((p) => (p.age ?? 99) <= 19).length);
    for (const d of debuts) {
      expect(d.retiredName).toMatch(/^vet-/);
      expect(d.rookieName).toBeTruthy();
      expect(LANES).toContain(d.lane);
    }
  });
});
