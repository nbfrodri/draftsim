import { describe, it, expect } from "vitest";
import { applyPoolDrift } from "./poolDrift";
import { MAX_POOL, playableInLane } from "../players";
import type { Champion, Lane, Player } from "../types";
import type { SeasonState } from "./types";

// Deterministic mulberry32 so a seeded run is reproducible.
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const champ = (id: number, lane: Lane): Champion =>
  ({ id, alias: `C${id}`, name: `C${id}`, lanes: [lane] }) as Champion;

// 12 middle-eligible champs — enough room to drift into beyond the 8 in-pool.
const champions: Champion[] = Array.from({ length: 12 }, (_, i) => champ(i + 1, "middle"));
const byId = new Map(champions.map((c) => [c.id, c]));

const player = (): Player => ({
  lane: "middle",
  tier: "B",
  goodChamps: [1, 2, 3, 4, 5],
  badChamps: [6, 7, 8],
  id: "p1",
  name: "Mid",
});

const season = (): SeasonState =>
  ({ teams: [{ id: "t1", players: [player()] }] }) as unknown as SeasonState;

describe("applyPoolDrift", () => {
  it("keeps pools valid and identity untouched while drifting some over many runs", () => {
    const rng = seeded(42);
    let s = season();
    let changedSeen = false;
    for (let i = 0; i < 200; i++) {
      const next = applyPoolDrift(s, champions, rng);
      if (next !== s) changedSeen = true;
      const p = next.teams[0].players[0];

      // (a) pools stay valid
      expect(p.goodChamps.length).toBeLessThanOrEqual(MAX_POOL);
      expect(p.badChamps.length).toBeLessThanOrEqual(MAX_POOL);
      expect(new Set(p.goodChamps).size).toBe(p.goodChamps.length); // no dupes
      expect(new Set(p.badChamps).size).toBe(p.badChamps.length);
      const good = new Set(p.goodChamps);
      expect(p.badChamps.some((id) => good.has(id))).toBe(false); // disjoint
      for (const id of [...p.goodChamps, ...p.badChamps]) {
        expect(playableInLane(byId.get(id)!, "middle")).toBe(true);
      }

      // tier / id / name never move
      expect(p.tier).toBe("B");
      expect(p.id).toBe("p1");
      expect(p.name).toBe("Mid");

      s = next;
    }

    // (b) at least some pool changed across the runs
    expect(changedSeen).toBe(true);
    const finalPools = [...s.teams[0].players[0].goodChamps, ...s.teams[0].players[0].badChamps];
    expect(finalPools).not.toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("returns the same season reference when nothing drifts", () => {
    // rng pinned high → every per-player roll skips (>= DRIFT_RATE).
    const s = season();
    expect(applyPoolDrift(s, champions, () => 0.99)).toBe(s);
  });
});
