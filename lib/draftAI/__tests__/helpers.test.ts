import { describe, it, expect } from "vitest";
import {
  archetypeSynergyBonus,
  bestLaneTierValue,
  damageBalanceDelta,
  identityTarget,
  isAD,
  isAP,
  laneMatchup,
  remainingActionsForSide,
  sampleTopN,
} from "../helpers";
import { createGame } from "../../draftEngine";
import type { Champion, Lane } from "../../types";

// ─── Test fixtures ──────────────────────────────────────────────────────────

function makeChamp(
  id: number,
  alias: string,
  name: string,
  roles: string[],
  lanes: Lane[],
): Champion {
  return { id, name, alias, roles, lanes, iconUrl: "" };
}

const Akali = makeChamp(1, "Akali", "Akali", ["Assassin"], ["middle"]);
const Yasuo = makeChamp(2, "Yasuo", "Yasuo", ["Fighter", "Assassin"], ["middle", "top"]);
const Malphite = makeChamp(3, "Malphite", "Malphite", ["Tank", "Fighter"], ["top"]);
const Lulu = makeChamp(4, "Lulu", "Lulu", ["Support"], ["support"]);
const Kayle = makeChamp(5, "Kayle", "Kayle", ["Marksman", "Fighter"], ["top"]);
const Jinx = makeChamp(6, "Jinx", "Jinx", ["Marksman"], ["bottom"]);
const Sion = makeChamp(7, "Sion", "Sion", ["Tank", "Fighter"], ["top"]);
const Draven = makeChamp(8, "Draven", "Draven", ["Marksman"], ["bottom"]);

const byId = new Map<number, Champion>([
  [Akali.id, Akali],
  [Yasuo.id, Yasuo],
  [Malphite.id, Malphite],
  [Lulu.id, Lulu],
  [Kayle.id, Kayle],
  [Jinx.id, Jinx],
  [Sion.id, Sion],
  [Draven.id, Draven],
]);

// ─── Damage classification (verifies bug fix #6 — Akali was AD) ────────────

describe("isAP / isAD", () => {
  it("classifies Akali as AP despite Assassin role tag", () => {
    expect(isAP(Akali)).toBe(true);
    expect(isAD(Akali)).toBe(false);
  });

  it("classifies Jinx (Marksman) as AD only", () => {
    expect(isAP(Jinx)).toBe(false);
    expect(isAD(Jinx)).toBe(true);
  });

  it("classifies Kayle as both AP and AD (HYBRID_DAMAGE)", () => {
    expect(isAP(Kayle)).toBe(true);
    expect(isAD(Kayle)).toBe(true);
  });

  it("classifies Sion as neither (NEITHER_DAMAGE pure tank)", () => {
    expect(isAP(Sion)).toBe(false);
    expect(isAD(Sion)).toBe(false);
  });
});

// ─── Damage balance — progressive penalty (bug fix #4 was scaled) ──────────

describe("damageBalanceDelta", () => {
  it("rewards filling a damage gap", () => {
    expect(damageBalanceDelta(Jinx, { ap: 0, ad: 0 })).toBe(5);
  });

  it("penalizes the 3rd same-type pick", () => {
    expect(damageBalanceDelta(Jinx, { ap: 0, ad: 2 })).toBeLessThan(0);
  });

  it("penalizes 4th more than 3rd", () => {
    const d3 = damageBalanceDelta(Jinx, { ap: 0, ad: 2 });
    const d4 = damageBalanceDelta(Jinx, { ap: 0, ad: 3 });
    expect(d4).toBeLessThan(d3);
  });
});

// ─── Lane matchup — directional hard counter ───────────────────────────────

describe("laneMatchup", () => {
  it("Malphite hard-counters Yasuo (table entry +6)", () => {
    expect(laneMatchup(Malphite, Yasuo)).toBeGreaterThan(0);
  });

  it("Yasuo into Malphite is the inverse penalty", () => {
    const mvy = laneMatchup(Malphite, Yasuo);
    const yvm = laneMatchup(Yasuo, Malphite);
    // Yasuo into Malphite should be roughly the negation (modulo extra
    // archetype factors which are symmetric here).
    expect(yvm).toBeLessThan(0);
    expect(Math.abs(mvy + yvm)).toBeLessThan(1);
  });
});

// ─── Synergy double-count fix (bug #8) ─────────────────────────────────────

describe("archetypeSynergyBonus", () => {
  it("does NOT double-count pairs already in the explicit synergy table", () => {
    // Malphite + Yasuo is in CHAMPION_SYNERGIES (Knockup Wombo). The
    // archetype synergy bonus should skip this pair to avoid double-counting.
    const malphitePicks = [Malphite.id];
    const bonus = archetypeSynergyBonus(Yasuo, malphitePicks, byId);
    expect(bonus).toBe(0);
  });

  it("does add bonus for pairs NOT in the explicit table", () => {
    // Lulu (peel/enchanter) + Draven (hyper-carry) is the protect flow and
    // this exact pair is absent from CHAMPION_SYNERGIES.
    const luluPicks = [Lulu.id];
    const bonus = archetypeSynergyBonus(Draven, luluPicks, byId);
    expect(bonus).toBeGreaterThan(0);
  });
});

// ─── Identity targeting — best match (bug fix #10) ─────────────────────────

describe("identityTarget", () => {
  it("returns null when fewer than 2 picks are locked", () => {
    expect(identityTarget({ wombo: 1, engage: 0 } as never, 0)).toBeNull();
    expect(identityTarget({ wombo: 1, engage: 1 } as never, 1)).toBeNull();
  });

  it("locks onto the identity with highest overlap to current picks", () => {
    // 2 wombos + 1 engage → Wombo Combo overlap = 3 vs Hyper Engage = 1.
    const counts = {
      wombo: 2,
      engage: 1,
      peel: 0,
      poke: 0,
      dive: 0,
      pick: 0,
      "hyper-carry": 0,
      splitpush: 0,
      assassin: 0,
      tank: 0,
      enchanter: 0,
      burst: 0,
      skirmish: 0,
      sustain: 0,
    } as never;
    const result = identityTarget(counts, 3);
    expect(result?.label).toBe("Wombo Combo");
  });
});

// ─── bestLaneTierValue — first-available alignment (bug fix #U8) ───────────

describe("bestLaneTierValue", () => {
  it("uses first-available lane in champ.lanes order, matching assignLanesToPicks", () => {
    // Yasuo plays mid then top in champ.lanes order. With both open,
    // bestLaneTierValue should return MIDDLE (first iterated and open),
    // not whichever has the higher tier in the override.
    const open = new Set<Lane>(["top", "middle", "bottom", "support", "jungle"]);
    const result = bestLaneTierValue(Yasuo, open);
    expect(result.lane).toBe("middle");
  });

  it("falls through to next lane when first is taken", () => {
    const open = new Set<Lane>(["top", "bottom", "support", "jungle"]);
    const result = bestLaneTierValue(Yasuo, open);
    expect(result.lane).toBe("top");
  });

  it("returns null when no lane is open for this champion", () => {
    const open = new Set<Lane>(["bottom", "support", "jungle"]);
    const result = bestLaneTierValue(Yasuo, open);
    expect(result.lane).toBeNull();
    expect(result.value).toBe(0);
  });
});

// ─── Remaining actions — used by lookahead penalty (bug fix #9) ────────────

describe("remainingActionsForSide", () => {
  it("counts remaining picks and bans for blue at action 6 (B1 pick)", () => {
    const game = createGame(1, "B", "R");
    game.actionIndex = 6; // B1 pick
    const r = remainingActionsForSide(game, "blue");
    // After B1 pick (action 6), blue has 4 more picks (B2,B3,B4,B5) and
    // 2 more bans (actions 13, 15).
    expect(r.picks).toBe(4);
    expect(r.bans).toBe(2);
  });

  it("returns 0/0 at the last action", () => {
    const game = createGame(1, "B", "R");
    game.actionIndex = 19; // R5 pick
    const r = remainingActionsForSide(game, "red");
    expect(r.picks).toBe(0);
    expect(r.bans).toBe(0);
  });
});

// ─── Sampling — softmax behaviour ──────────────────────────────────────────

describe("sampleTopN", () => {
  it("returns null on empty input", () => {
    expect(sampleTopN([], 3, 1.5)).toBeNull();
  });

  it("returns the only element when there's just one", () => {
    expect(sampleTopN([{ item: "x", score: 1 }], 3, 1.5)).toBe("x");
  });

  it("biases toward higher-scoring items at low temperature", () => {
    // With temperature 0.1, the highest scorer wins almost always.
    const items = [
      { item: "high", score: 10 },
      { item: "low", score: 0 },
    ];
    let highCount = 0;
    for (let i = 0; i < 200; i++) {
      if (sampleTopN(items, 2, 0.1) === "high") highCount++;
    }
    expect(highCount).toBeGreaterThan(190);
  });
});
