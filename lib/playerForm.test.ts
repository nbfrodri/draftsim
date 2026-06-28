// Tests for the per-player game-rating + form system:
//   • computeGameRatings (lib/matchSimulator.ts) — 1-10 per-pick ratings
//     derived from recap KDA / lane gold / win-loss. Sanity-calibrated and
//     monotone.
//   • lib/playerForm.ts — hot/cold form EMA dynamics, tier-bias conversion,
//     keyed form-map helpers.
//   • The simulateMatch seam — playerForms defaulting to exactly neutral
//     (byte-identical output) and shifting lane gold when supplied.

import { describe, expect, it } from "vitest";
import {
  buildGameRecap,
  computeGameRatings,
  playerLaneFormBias,
  simulateMatch,
} from "./matchSimulator";
import {
  applyRatingsToForms,
  clampForm,
  formComfortBonus,
  formTierBias,
  normalizeRating,
  playerFormKey,
  sideFormsFor,
  updateForm,
  FORM_TIER_FRACTION,
} from "./playerForm";
import { createRng } from "./rng";
import { LANE_ORDER } from "./players";
import type { Champion, GameDraft, GameRecap, Lane, Side } from "./types";

// ── Fixtures (same minimal-champion pattern as the golden test) ─────────────

const LANES: Lane[] = ["top", "jungle", "middle", "bottom", "support"];

let nextId = 1;
function champ(alias: string, lane: Lane): Champion {
  return { id: nextId++, name: alias, alias, roles: [], iconUrl: "", lanes: [lane] };
}

function comp(aliases: string[]): Champion[] {
  return aliases.map((a, i) => champ(a, LANES[i]));
}

function game(blue: Champion[], red: Champion[]): GameDraft {
  return {
    id: "g1",
    gameNumber: 1,
    blueTeam: "Blue",
    redTeam: "Red",
    blueBans: [],
    redBans: [],
    bluePicks: blue.map((c) => c.id),
    redPicks: red.map((c) => c.id),
    blueRoles: [...LANES],
    redRoles: [...LANES],
    actionIndex: 0,
    status: "complete",
    winner: null,
  } as GameDraft;
}

const BLUE_COMP = comp(["Malphite", "Vi", "Ahri", "Jhin", "Nautilus"]);
const RED_COMP = comp(["Darius", "Draven", "Elise", "LeeSin", "Renekton"]);
const CHAMPIONS = [...BLUE_COMP, ...RED_COMP];
const GAME = game(BLUE_COMP, RED_COMP);

// Build a recap-shaped input for computeGameRatings directly.
type KDA = { k: number; d: number; a: number };
function recapInput(opts: {
  blue: KDA[];
  red: KDA[];
  laneGoldDiff?: Partial<Record<Lane, number>>;
}): Pick<GameRecap, "perPickKDA" | "laneGoldDiff" | "durationMinutes"> {
  return {
    durationMinutes: 32,
    perPickKDA: { blue: opts.blue, red: opts.red },
    laneGoldDiff: opts.laneGoldDiff ?? {},
  };
}

const zeros: KDA = { k: 0, d: 0, a: 0 };
function side5(...entries: KDA[]): KDA[] {
  const out = entries.slice(0, 5);
  while (out.length < 5) out.push({ ...zeros });
  return out;
}

// ── Part A: game ratings ────────────────────────────────────────────────────

describe("computeGameRatings", () => {
  it("rates a stomp winner's carry 8-10", () => {
    const recap = recapInput({
      // Blue bot 9/1/6 in a 22-kill blue stomp, +2800 lane gold.
      blue: side5({ k: 3, d: 1, a: 8 }, { k: 4, d: 2, a: 9 }, { k: 5, d: 1, a: 7 }, { k: 9, d: 1, a: 6 }, { k: 1, d: 2, a: 12 }),
      red: side5({ k: 1, d: 4, a: 1 }, { k: 2, d: 5, a: 2 }, { k: 2, d: 4, a: 2 }, { k: 1, d: 5, a: 1 }, { k: 1, d: 4, a: 3 }),
      laneGoldDiff: { top: 800, jungle: 500, middle: 900, bottom: 2800, support: 400 },
    });
    const ratings = computeGameRatings(recap, "blue")!;
    expect(ratings.blue[3]).toBeGreaterThanOrEqual(8);
    expect(ratings.blue[3]).toBeLessThanOrEqual(10);
  });

  it("rates a feeding loser 2-4", () => {
    const recap = recapInput({
      // Red top 1/7/2 on the losing side, -2200 lane gold.
      blue: side5({ k: 7, d: 1, a: 4 }, { k: 3, d: 2, a: 6 }, { k: 4, d: 2, a: 4 }, { k: 5, d: 1, a: 4 }, { k: 1, d: 2, a: 9 }),
      red: side5({ k: 1, d: 7, a: 2 }, { k: 2, d: 3, a: 3 }, { k: 2, d: 4, a: 2 }, { k: 2, d: 3, a: 2 }, { k: 1, d: 3, a: 4 }),
      laneGoldDiff: { top: 2200, jungle: 600, middle: 700, bottom: 800, support: 300 },
    });
    const ratings = computeGameRatings(recap, "blue")!;
    expect(ratings.red[0]).toBeGreaterThanOrEqual(2);
    expect(ratings.red[0]).toBeLessThanOrEqual(4);
  });

  it("rates an unremarkable game ~5-6.5", () => {
    const even = side5(
      { k: 3, d: 3, a: 4 },
      { k: 3, d: 3, a: 4 },
      { k: 3, d: 3, a: 4 },
      { k: 3, d: 3, a: 4 },
      { k: 3, d: 3, a: 4 },
    );
    const recap = recapInput({
      blue: even,
      red: even,
      laneGoldDiff: { top: 200, jungle: -150, middle: 100, bottom: -200, support: 50 },
    });
    const ratings = computeGameRatings(recap, "blue")!;
    for (const r of [...ratings.blue, ...ratings.red]) {
      expect(r).toBeGreaterThanOrEqual(5);
      expect(r).toBeLessThanOrEqual(6.5);
    }
    // Winners skew above losers on otherwise identical lines.
    expect(ratings.blue[2]).toBeGreaterThan(ratings.red[2]);
  });

  it("lets a hard-carried loss still rate well (>= 7)", () => {
    const recap = recapInput({
      // Red mid goes 9/2/5 with a winning lane in a losing effort.
      blue: side5({ k: 4, d: 2, a: 5 }, { k: 4, d: 3, a: 5 }, { k: 2, d: 5, a: 3 }, { k: 4, d: 2, a: 4 }, { k: 1, d: 2, a: 8 }),
      red: side5({ k: 1, d: 4, a: 2 }, { k: 1, d: 3, a: 4 }, { k: 9, d: 2, a: 5 }, { k: 1, d: 3, a: 2 }, { k: 0, d: 3, a: 5 }),
      laneGoldDiff: { top: 900, jungle: 500, middle: -1800, bottom: 700, support: 300 },
    });
    const ratings = computeGameRatings(recap, "blue")!;
    expect(ratings.red[2]).toBeGreaterThanOrEqual(7);
  });

  it("is monotone: more kills never lowers, more deaths never raises the rating", () => {
    const base = (k: number, d: number): number => {
      const blue = side5({ k: 3, d: 2, a: 4 }, { k: 3, d: 2, a: 4 }, { k, d, a: 2 }, { k: 3, d: 2, a: 4 }, { k: 1, d: 2, a: 6 });
      const recap = recapInput({ blue, red: side5(), laneGoldDiff: {} });
      return computeGameRatings(recap, "blue")!.blue[2];
    };
    for (let k = 0; k < 12; k++) {
      expect(base(k + 1, 3)).toBeGreaterThanOrEqual(base(k, 3));
    }
    expect(base(10, 3)).toBeGreaterThan(base(0, 3));
    for (let d = 0; d < 10; d++) {
      expect(base(4, d + 1)).toBeLessThanOrEqual(base(4, d));
    }
    expect(base(4, 9)).toBeLessThan(base(4, 0));
  });

  it("clamps to [1, 10] and rounds to one decimal", () => {
    const recap = recapInput({
      blue: side5({ k: 25, d: 0, a: 20 }),
      red: side5({ k: 0, d: 25, a: 0 }),
      laneGoldDiff: { top: 9000 },
    });
    const ratings = computeGameRatings(recap, "blue")!;
    for (const r of [...ratings.blue, ...ratings.red]) {
      expect(r).toBeGreaterThanOrEqual(1);
      expect(r).toBeLessThanOrEqual(10);
      expect(Math.abs(r * 10 - Math.round(r * 10))).toBeLessThan(1e-6);
    }
  });

  it("returns null for legacy recaps without perPickKDA", () => {
    expect(
      computeGameRatings({ durationMinutes: 30, laneGoldDiff: {} }, "blue"),
    ).toBeNull();
  });

  it("flips the blue-signed lane gold for red players", () => {
    const line: KDA = { k: 3, d: 3, a: 3 };
    const rate = (laneGoldDiff: Partial<Record<Lane, number>>) =>
      computeGameRatings(
        recapInput({
          blue: side5(line, line, line, line, line),
          red: side5(line, line, line, line, line),
          laneGoldDiff,
        }),
        "blue",
      )!;
    // Blue top is +1500, red top is -1500; with the same KDA and a shared
    // winner-side bonus held fixed per side, blue top out-rates red top.
    const withGold = rate({ top: 1500 });
    expect(withGold.blue[0]).toBeGreaterThan(withGold.red[0]);
    // Pure gold component for the SAME role: top +1500 vs top 0 ≈ +0.75 (top
    // goldWeight 1.0). Compared within the role so per-role criteria don't skew
    // the isolation.
    const noGold = rate({});
    expect(withGold.blue[0] - noGold.blue[0]).toBeGreaterThanOrEqual(0.6);
    expect(withGold.blue[0] - noGold.blue[0]).toBeLessThanOrEqual(0.9);
  });
});

describe("buildGameRecap ratings attachment", () => {
  it("attaches 5+5 ratings consistent with computeGameRatings", () => {
    const result = simulateMatch(GAME, CHAMPIONS, { rng: createRng(42) });
    const recap = buildGameRecap(GAME, CHAMPIONS, result);
    expect(recap.ratings).toBeDefined();
    expect(recap.ratings!.blue).toHaveLength(5);
    expect(recap.ratings!.red).toHaveLength(5);
    for (const r of [...recap.ratings!.blue, ...recap.ratings!.red]) {
      expect(r).toBeGreaterThanOrEqual(1);
      expect(r).toBeLessThanOrEqual(10);
    }
    // The UI path for historical recaps reproduces the attached field.
    expect(computeGameRatings(recap, result.winner)).toEqual(recap.ratings);
  });
});

// ── Part B: form dynamics ───────────────────────────────────────────────────

describe("updateForm dynamics", () => {
  it("builds to ~+0.5 after 2-3 strong games", () => {
    let f = 0;
    f = updateForm(f, 8.5);
    f = updateForm(f, 8.5);
    expect(f).toBeGreaterThanOrEqual(0.4);
    f = updateForm(f, 8.5);
    expect(f).toBeGreaterThanOrEqual(0.45);
    expect(f).toBeLessThanOrEqual(0.65);
  });

  it("builds a symmetric cold streak", () => {
    let hot = 0;
    let cold = 0;
    for (let i = 0; i < 3; i++) {
      hot = updateForm(hot, 8.5);
      cold = updateForm(cold, 2.5);
    }
    expect(cold).toBeLessThanOrEqual(-0.45);
    expect(cold).toBeCloseTo(-hot, 6);
  });

  it("regresses to the mean over a few average games", () => {
    let f = 0.5;
    const trail: number[] = [];
    for (let i = 0; i < 3; i++) {
      f = updateForm(f, 5.5);
      trail.push(f);
    }
    // Strictly decaying magnitude, effectively neutral after ~3 games.
    expect(trail[0]).toBeLessThan(0.5);
    expect(trail[1]).toBeLessThan(trail[0]);
    expect(trail[2]).toBeLessThan(trail[1]);
    expect(Math.abs(trail[2])).toBeLessThan(0.1);
  });

  it("saturates below the clamp even on an endless 10-rated streak", () => {
    let f = 0;
    for (let i = 0; i < 50; i++) f = updateForm(f, 10);
    expect(f).toBeGreaterThan(0.7);
    expect(f).toBeLessThan(0.85);
  });

  it("clamps junk inputs to the valid range", () => {
    expect(updateForm(99, 10)).toBeLessThanOrEqual(1);
    expect(updateForm(-99, 1)).toBeGreaterThanOrEqual(-1);
    expect(updateForm(Number.NaN, Number.NaN)).toBe(0);
    expect(clampForm(Number.POSITIVE_INFINITY)).toBe(0);
    expect(normalizeRating(12)).toBe(1);
    expect(normalizeRating(0)).toBe(-1);
  });
});

describe("form modifiers", () => {
  it("formTierBias is neutral at 0 and capped at a fraction of a tier step", () => {
    expect(formTierBias(0)).toBe(0);
    expect(formTierBias(1)).toBe(FORM_TIER_FRACTION);
    expect(formTierBias(-1)).toBe(-FORM_TIER_FRACTION);
    expect(formTierBias(5)).toBe(FORM_TIER_FRACTION); // clamped
    // Never a full tier-value step (1.0) — champion/tier effects dominate.
    expect(Math.abs(formTierBias(1))).toBeLessThan(1);
    expect(formTierBias(0.4)).toBeGreaterThan(formTierBias(0.2));
  });

  it("formComfortBonus is small and signed", () => {
    expect(formComfortBonus(0)).toBe(0);
    expect(formComfortBonus(1)).toBeCloseTo(0.15, 9);
    expect(formComfortBonus(-1)).toBeCloseTo(-0.15, 9);
    expect(Math.abs(formComfortBonus(3))).toBeLessThanOrEqual(0.15);
  });

  it("playerLaneFormBias returns exact 0 without forms and shifts lane gold with them", () => {
    expect(playerLaneFormBias(undefined, undefined, "top")).toBe(0);
    expect(playerLaneFormBias({}, {}, "top")).toBe(0);
    // Max form = FORM_TIER_FRACTION tier steps × 8 g/min per step = ±4.
    expect(playerLaneFormBias({ top: 1 }, undefined, "top")).toBeCloseTo(4, 9);
    expect(playerLaneFormBias(undefined, { top: 1 }, "top")).toBeCloseTo(-4, 9);
    expect(playerLaneFormBias({ top: 1 }, { top: 1 }, "top")).toBeCloseTo(0, 9);
    expect(playerLaneFormBias({ top: 1 }, undefined, "middle")).toBe(0);
  });
});

describe("keyed form maps", () => {
  it("round-trips ratings through applyRatingsToForms / sideFormsFor", () => {
    const ratings = [8.5, 5.5, 2.5, 5.5, 5.5];
    let forms = applyRatingsToForms(undefined, "team-1", ratings);
    forms = applyRatingsToForms(forms, "team-1", ratings);
    const side = sideFormsFor(forms, "team-1");
    expect(side.top).toBeGreaterThan(0.4); // two hot games
    expect(side.middle).toBeLessThan(-0.4); // two cold games
    expect(side.jungle).toBeCloseTo(0, 9); // neutral games stay neutral
    // Other teams are untouched / read back empty.
    expect(sideFormsFor(forms, "team-2")).toEqual({});
    expect(forms[playerFormKey("team-1", "top")]).toBe(side.top);
    expect(Object.keys(forms)).toHaveLength(LANE_ORDER.length);
  });

  it("does not mutate the previous map", () => {
    const before = applyRatingsToForms(undefined, "t", [8.5, 8.5, 8.5, 8.5, 8.5]);
    const snapshot = { ...before };
    applyRatingsToForms(before, "t", [2.5, 2.5, 2.5, 2.5, 2.5]);
    expect(before).toEqual(snapshot);
  });

  it("skips missing/invalid ratings", () => {
    const forms = applyRatingsToForms(undefined, "t", [8.5]);
    expect(Object.keys(forms)).toEqual([playerFormKey("t", "top")]);
  });
});

// ── Neutral-default seam (mirrors the golden-test guarantee) ────────────────

describe("simulateMatch playerForms seam", () => {
  it("is byte-identical with undefined, empty, and all-zero forms", () => {
    const run = (playerForms?: { blue?: Partial<Record<Lane, number>>; red?: Partial<Record<Lane, number>> }) =>
      JSON.stringify(
        simulateMatch(GAME, CHAMPIONS, { rng: createRng(777), playerForms }),
      );
    const base = run(undefined);
    expect(run({})).toBe(base);
    expect(
      run({
        blue: { top: 0, jungle: 0, middle: 0, bottom: 0, support: 0 },
        red: { top: 0, jungle: 0, middle: 0, bottom: 0, support: 0 },
      }),
    ).toBe(base);
  });

  it("shifts every lane advantage by formTierBias × k for a uniformly hot team", () => {
    const seed = 1234;
    const lanes = ["top", "jungle", "middle", "bottom", "support"] as const;
    const base = simulateMatch(GAME, CHAMPIONS, { rng: createRng(seed) });
    // Uniform max form across all lanes → +4 g/min each, and NO carry funnel
    // (equal forms = no hot/cold gap to redistribute), so the form bias is
    // observable in isolation.
    const hot = simulateMatch(GAME, CHAMPIONS, {
      rng: createRng(seed),
      playerForms: {
        blue: { top: 1, jungle: 1, middle: 1, bottom: 1, support: 1 },
      },
    });
    for (const lane of lanes) {
      expect(hot.laneAdvantages[lane] - base.laneAdvantages[lane]).toBeCloseTo(4, 9);
    }
  });

  it("funnels lane gold into the hottest in-form lane, net-zero per team", () => {
    const seed = 1234;
    const lanes = ["top", "jungle", "middle", "bottom", "support"] as const;
    const base = simulateMatch(GAME, CHAMPIONS, { rng: createRng(seed) });
    // Only top is hot → the team concentrates resources there at the expense of
    // its coldest lane. Top gains MORE than the bare form bias; across all five
    // lanes the funnel cancels, leaving just the +4 form bias on net.
    const carry = simulateMatch(GAME, CHAMPIONS, {
      rng: createRng(seed),
      playerForms: { blue: { top: 1 } },
    });
    const dTop = carry.laneAdvantages.top - base.laneAdvantages.top;
    const total = lanes.reduce(
      (s, l) => s + (carry.laneAdvantages[l] - base.laneAdvantages[l]),
      0,
    );
    expect(dTop).toBeGreaterThan(4); // funnel piled extra into the hot lane
    expect(total).toBeCloseTo(4, 9); // funnel nets to zero; only form bias remains
  });
});
