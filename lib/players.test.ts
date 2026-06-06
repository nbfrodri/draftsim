import { describe, it, expect } from "vitest";
import type { Champion, Lane, Roster } from "./types";
import {
  deriveStar,
  emptyRoster,
  LANE_ORDER,
  MAX_POOL,
  normalizeRoster,
  PLAYER_TIER_VALUE,
  playerForLane,
  poolBias,
  randomizeChampPools,
  randomizeRoster,
  randomizeTiersForStar,
  valueToTier,
} from "./players";

// ── Fixtures ─────────────────────────────────────────────────────────────────

// Deterministic RNG (mulberry32) so randomized helpers are reproducible.
function rngFrom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let nextId = 1;
function champ(lanes: Lane[], alias = `C${nextId}`): Champion {
  const id = nextId++;
  return { id, name: alias, alias, roles: [], iconUrl: "", lanes };
}

// A roster with a fixed tier per lane (pools empty) for star math.
function rosterOfTiers(tiers: Roster["0"]["tier"][]): Roster {
  return LANE_ORDER.map((lane, i) => ({
    lane,
    tier: tiers[i],
    goodChamps: [],
    badChamps: [],
  }));
}

// A champion pool with several options in every lane (so randomize has room).
function poolByLane(perLane = 6): Champion[] {
  const out: Champion[] = [];
  for (const lane of LANE_ORDER) {
    for (let i = 0; i < perLane; i++) out.push(champ([lane]));
  }
  return out;
}

// ── deriveStar ───────────────────────────────────────────────────────────────

describe("deriveStar", () => {
  it("maps the extremes and the centre", () => {
    expect(deriveStar(rosterOfTiers(["S", "S", "S", "S", "S"]))).toBe(5);
    expect(deriveStar(rosterOfTiers(["A", "A", "A", "A", "A"]))).toBe(4);
    expect(deriveStar(rosterOfTiers(["B", "B", "B", "B", "B"]))).toBe(3);
    expect(deriveStar(rosterOfTiers(["C", "C", "C", "C", "C"]))).toBe(2);
    expect(deriveStar(rosterOfTiers(["D", "D", "D", "D", "D"]))).toBe(1);
  });

  it("rounds the mean of a mixed roster", () => {
    // values: 2 + 1 + 0 + 0 + (-1) = 2, mean 0.4 → round(3.4) = 3
    expect(deriveStar(rosterOfTiers(["S", "A", "B", "B", "C"]))).toBe(3);
    // values: 2 + 2 + 1 + 1 + 0 = 6, mean 1.2 → round(4.2) = 4
    expect(deriveStar(rosterOfTiers(["S", "S", "A", "A", "B"]))).toBe(4);
  });

  it("defaults to 3 for empty/missing rosters", () => {
    expect(deriveStar(null)).toBe(3);
    expect(deriveStar([])).toBe(3);
  });
});

describe("valueToTier", () => {
  it("inverts PLAYER_TIER_VALUE and clamps out-of-range", () => {
    expect(valueToTier(2)).toBe("S");
    expect(valueToTier(0)).toBe("B");
    expect(valueToTier(-2)).toBe("D");
    expect(valueToTier(99)).toBe("S");
    expect(valueToTier(-99)).toBe("D");
  });
});

// ── randomizeTiersForStar ────────────────────────────────────────────────────

describe("randomizeTiersForStar", () => {
  it("always produces a roster whose derived star equals the target", () => {
    for (let star = 1; star <= 5; star++) {
      for (let seed = 1; seed <= 40; seed++) {
        const tiers = randomizeTiersForStar(star, rngFrom(seed * 31 + star));
        expect(tiers).toHaveLength(5);
        const roster = rosterOfTiers(tiers);
        expect(deriveStar(roster)).toBe(star);
      }
    }
  });

  it("never makes a 5★ team out of weak players (no all-D 5★)", () => {
    const tiers = randomizeTiersForStar(5, rngFrom(7));
    const meanValue =
      tiers.reduce((s, t) => s + PLAYER_TIER_VALUE[t], 0) / tiers.length;
    expect(meanValue).toBeGreaterThan(1); // clearly strong, not flat/weak
  });
});

// ── randomizeChampPools ──────────────────────────────────────────────────────

describe("randomizeChampPools", () => {
  it("caps each pool at MAX_POOL, keeps them disjoint, and stays in-lane", () => {
    const champions = poolByLane(8);
    for (const lane of LANE_ORDER) {
      const { goodChamps, badChamps } = randomizeChampPools(
        lane,
        champions,
        rngFrom(lane.length * 13 + 1),
      );
      expect(goodChamps.length).toBeLessThanOrEqual(MAX_POOL);
      expect(badChamps.length).toBeLessThanOrEqual(MAX_POOL);
      // disjoint
      expect(goodChamps.some((id) => badChamps.includes(id))).toBe(false);
      // every chosen champion plays this lane
      const inLane = new Set(
        champions.filter((c) => c.lanes.includes(lane)).map((c) => c.id),
      );
      for (const id of [...goodChamps, ...badChamps]) {
        expect(inLane.has(id)).toBe(true);
      }
    }
  });

  it("shrinks gracefully when few champions are eligible", () => {
    // Only 2 champions in 'jungle' → at most 2 good, 0 bad left over.
    const champions = [champ(["jungle"]), champ(["jungle"]), champ(["top"])];
    const { goodChamps, badChamps } = randomizeChampPools(
      "jungle",
      champions,
      rngFrom(3),
    );
    expect(goodChamps.length + badChamps.length).toBeLessThanOrEqual(2);
  });
});

// ── randomizeRoster ──────────────────────────────────────────────────────────

describe("randomizeRoster", () => {
  it("returns one player per lane in positional order matching the star", () => {
    const champions = poolByLane(6);
    const roster = randomizeRoster({ champions, star: 4, rng: rngFrom(99) });
    expect(roster.map((p) => p.lane)).toEqual([...LANE_ORDER]);
    expect(deriveStar(roster)).toBe(4);
    for (const p of roster) {
      expect(p.goodChamps.length).toBeLessThanOrEqual(MAX_POOL);
      expect(p.badChamps.length).toBeLessThanOrEqual(MAX_POOL);
    }
  });

  it("honors pools:false (empty pools)", () => {
    const roster = randomizeRoster({
      champions: poolByLane(6),
      star: 3,
      pools: false,
      rng: rngFrom(5),
    });
    for (const p of roster) {
      expect(p.goodChamps).toEqual([]);
      expect(p.badChamps).toEqual([]);
    }
  });
});

// ── normalizeRoster ──────────────────────────────────────────────────────────

describe("normalizeRoster", () => {
  it("fills missing lanes with neutral players in positional order", () => {
    const roster = normalizeRoster([{ lane: "middle", tier: "S" }]);
    expect(roster.map((p) => p.lane)).toEqual([...LANE_ORDER]);
    expect(playerForLane(roster, "middle")?.tier).toBe("S");
    expect(playerForLane(roster, "top")?.tier).toBe("B"); // filled neutral
  });

  it("repairs corrupt entries: bad tiers, overflowing/duplicate/overlapping pools", () => {
    const roster = normalizeRoster([
      {
        lane: "top",
        tier: "Z", // invalid → B
        goodChamps: [1, 1, 2, 3, 4, 5], // dupes + over cap → 3 unique
        badChamps: [1, 6, 7], // 1 overlaps good → dropped
      },
    ]);
    const top = playerForLane(roster, "top")!;
    expect(top.tier).toBe("B");
    expect(top.goodChamps).toHaveLength(MAX_POOL);
    expect(new Set(top.goodChamps).size).toBe(MAX_POOL); // de-duped
    expect(top.badChamps.some((id) => top.goodChamps.includes(id))).toBe(false);
  });

  it("filters pools to champions playable in the lane when a roster is given", () => {
    const jgChamp = champ(["jungle"]);
    const topChamp = champ(["top"]);
    const roster = normalizeRoster(
      [{ lane: "jungle", tier: "A", goodChamps: [jgChamp.id, topChamp.id] }],
      [jgChamp, topChamp],
    );
    const jg = playerForLane(roster, "jungle")!;
    expect(jg.goodChamps).toContain(jgChamp.id);
    expect(jg.goodChamps).not.toContain(topChamp.id); // wrong lane → dropped
  });

  it("treats non-array input as an empty roster", () => {
    expect(normalizeRoster(null)).toHaveLength(5);
    expect(normalizeRoster("nonsense").every((p) => p.tier === "B")).toBe(true);
  });
});

// ── poolBias / emptyRoster ───────────────────────────────────────────────────

describe("poolBias", () => {
  it("signs liked/disliked/neutral champions", () => {
    const player = {
      lane: "top" as Lane,
      tier: "A" as const,
      goodChamps: [10, 11],
      badChamps: [20],
    };
    expect(poolBias(player, 10)).toBe(1);
    expect(poolBias(player, 20)).toBe(-1);
    expect(poolBias(player, 99)).toBe(0);
    expect(poolBias(null, 10)).toBe(0);
    expect(poolBias(player, null)).toBe(0);
  });
});

describe("emptyRoster", () => {
  it("is 5 neutral players in positional order", () => {
    const r = emptyRoster();
    expect(r.map((p) => p.lane)).toEqual([...LANE_ORDER]);
    expect(r.every((p) => p.tier === "B")).toBe(true);
    expect(deriveStar(r)).toBe(3);
  });
});
