// Tests for the opt-in mid-game strategic pivot (ctx.adaptiveMidgame).
//
// The pivot lives in maybeMidgamePivot (./fights), is triggered from the end
// of phaseMidTeamfight, mutates tl.mods for every subsequent phase, and is
// read again by phaseClosingFight (splitpush pivot → backdoor odds). With the
// flag off (the default), the code path is untouched and consumes zero rng —
// lib/matchSimulator.golden.test.ts locks that end-to-end; these tests lock
// it at the module level and exercise the enabled behavior.

import { describe, expect, it } from "vitest";
import type { Champion, Lane, Side } from "../../types";
import { createRng } from "../../rng";
import type { TeamScore } from "../types";
import {
  DEFAULT_STRATEGY,
  strategyTimelineModifiers,
  type TeamStrategy,
} from "../strategies";
import type { MatchState, TimelineContext, TimelineCtx } from "./context";
import { maybeMidgamePivot, phaseMidTeamfight } from "./fights";
import { decideClosingWinner, type ClosingCombat } from "./closing";
import {
  phaseElder,
  phaseFirstBaron,
  phaseFourthDrakeSoul,
  phaseMidTower,
} from "./objectives";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const LANES: Lane[] = ["top", "jungle", "middle", "bottom", "support"];
let nextId = 1;
function champ(alias: string, lane: Lane): Champion {
  return { id: nextId++, name: alias, alias, roles: [], iconUrl: "", lanes: [lane] };
}
function comp(aliases: string[]): (Champion | null)[] {
  return aliases.map((a, i) => champ(a, LANES[i]));
}
// Mirror comp: zero scaling/early contrast so decideClosingWinner sees no
// comp-driven edge and the pivot's effect is isolated.
const MIRROR = ["Malphite", "Vi", "Ahri", "Jhin", "Nautilus"];

function score(): TeamScore {
  return {
    damageBalance: 0,
    frontline: 0,
    laneSynergy: 0,
    engagePresence: 0,
    ccQuality: 0,
    compIdentity: 0,
    phaseBalance: 0,
    scalingAdvantage: 0,
    matchupEdge: 0,
    matchupTags: [],
    metaStrength: 0,
    metaTierAvg: 0,
    synergyBonus: 0,
    synergyTags: [],
    total: 0,
    apCount: 0,
    adCount: 0,
    frontCount: 0,
    hardCcCount: 0,
    lateCount: 0,
    earlyCount: 0,
    highMobCount: 0,
    lowMobCount: 0,
    identityLabel: null,
  };
}

function laneAdv(): Record<Lane, number> {
  return { top: 0, jungle: 0, middle: 0, bottom: 0, support: 0 };
}

interface TlOptions {
  adaptiveMidgame?: boolean;
  blueStrategy?: TeamStrategy;
  redStrategy?: TeamStrategy;
  goldLead?: number;
  momentum?: number;
  drakes?: { blue: number; red: number };
  duration?: number;
  seed?: number;
}

function makeTl(opts: TlOptions = {}): TimelineContext {
  const blueStrategy = opts.blueStrategy ?? DEFAULT_STRATEGY;
  const redStrategy = opts.redStrategy ?? DEFAULT_STRATEGY;
  const ctx: TimelineCtx = {
    diff: 0,
    blueScore: score(),
    redScore: score(),
    bluePicks: comp(MIRROR),
    redPicks: comp(MIRROR),
    blueName: "Blue",
    redName: "Red",
    laneAdvantages: laneAdv(),
    blueStrategy,
    redStrategy,
    adaptiveMidgame: opts.adaptiveMidgame,
  };
  const state: MatchState = {
    goldLead: opts.goldLead ?? 0,
    momentum: opts.momentum ?? 0,
    drakes: opts.drakes ?? { blue: 0, red: 0 },
    soulSide: null,
    soulType: null,
    laneLead: { ...ctx.laneAdvantages },
    lastGankSide: null,
    jungleBehind: null,
    baronExpiresAt: null,
    baronSide: null,
    elderSide: null,
    pickAdvantage: null,
    cooldownEdge: null,
    towerPressure: { blue: 0, red: 0 },
    mapControl: { blue: 0, red: 0 },
    grubCount: { blue: 0, red: 0 },
    atakhanVariant: null,
    atakhanSide: null,
    ruinousActive: false,
    recentSides: [],
  };
  return {
    ctx,
    duration: opts.duration ?? 38,
    rng: createRng(opts.seed ?? 1),
    state,
    events: [],
    schedule: (_t, resolve) => resolve(),
    laneBias: 0,
    mods: strategyTimelineModifiers(blueStrategy, redStrategy),
    spikeBias: () => 0,
    combatRatioBlue: () => 1,
    fightDominance: () => 0,
  };
}

const NEUTRAL_COMBAT: ClosingCombat = {
  winnerSide: "red",
  winnerKills: 4,
  loserKills: 2,
  ratio: 1, // log(1) = 0 → no combat-resolution edge
};

// ─── Off-by-default guarantees ───────────────────────────────────────────────

describe("maybeMidgamePivot — flag off (default path)", () => {
  it("is a complete no-op: no events, no mods change, no rng consumed", () => {
    const tl = makeTl({ goldLead: -8000, momentum: -0.8 });
    const modsBefore = { ...tl.mods };
    let rngCalls = 0;
    const baseRng = tl.rng;
    tl.rng = () => {
      rngCalls++;
      return baseRng();
    };
    maybeMidgamePivot(tl, 21);
    expect(tl.events).toHaveLength(0);
    expect(tl.pivot).toBeUndefined();
    expect(tl.mods).toEqual(modsBefore);
    expect(rngCalls).toBe(0);
  });

  it("phaseMidTeamfight consumes the same rng stream with the flag on or off", () => {
    // Balanced state → no pivot fires even with the flag on, so the emitted
    // teamfight must be byte-identical for the same seed.
    const off = makeTl({ seed: 42 });
    const on = makeTl({ seed: 42, adaptiveMidgame: true, goldLead: 0 });
    phaseMidTeamfight(off);
    phaseMidTeamfight(on);
    expect(on.events).toEqual(off.events);
  });
});

// ─── Trigger conditions ──────────────────────────────────────────────────────

describe("maybeMidgamePivot — trigger conditions", () => {
  it("does not pivot when the game is close", () => {
    const tl = makeTl({ adaptiveMidgame: true, goldLead: 800, momentum: 0.1 });
    maybeMidgamePivot(tl, 21);
    expect(tl.pivot).toBeUndefined();
    expect(tl.events).toHaveLength(0);
  });

  it("the side clearly behind pivots (blue behind → blue pivots)", () => {
    const tl = makeTl({
      adaptiveMidgame: true,
      goldLead: -4000,
      momentum: -0.4,
      drakes: { blue: 0, red: 2 },
    });
    maybeMidgamePivot(tl, 21);
    expect(tl.pivot?.side).toBe("blue");
    expect(tl.events).toHaveLength(1);
    expect(tl.events[0].type).toBe("objective-trade");
    expect(tl.events[0].side).toBe("blue");
    expect(tl.events[0].description).toContain("PLAN PIVOT");
  });

  it("mirrors for red behind, and the biases favor the pivoting side", () => {
    const blueBehind = makeTl({ adaptiveMidgame: true, goldLead: -4000 });
    maybeMidgamePivot(blueBehind, 21);
    const redBehind = makeTl({ adaptiveMidgame: true, goldLead: 4000 });
    maybeMidgamePivot(redBehind, 21);
    expect(blueBehind.pivot?.side).toBe("blue");
    expect(redBehind.pivot?.side).toBe("red");
    // Default strategies → "objective-rush": drake/baron bias toward the
    // pivoting side (blue-positive sign convention).
    expect(blueBehind.mods.baronBias).toBeGreaterThan(0);
    expect(blueBehind.mods.drakeBias).toBeGreaterThan(0);
    expect(redBehind.mods.baronBias).toBeLessThan(0);
    expect(redBehind.mods.drakeBias).toBeLessThan(0);
  });

  it("fires at most once per game", () => {
    const tl = makeTl({ adaptiveMidgame: true, goldLead: -5000 });
    maybeMidgamePivot(tl, 21);
    maybeMidgamePivot(tl, 23);
    expect(tl.events).toHaveLength(1);
  });
});

// ─── Pivot-kind selection ────────────────────────────────────────────────────

describe("maybeMidgamePivot — pivot kind", () => {
  it("a failed scaling plan flips to the all-in (picks + Baron) pivot", () => {
    const tl = makeTl({
      adaptiveMidgame: true,
      goldLead: -4000,
      blueStrategy: { ...DEFAULT_STRATEGY, gamePlan: "scaling" },
    });
    maybeMidgamePivot(tl, 21);
    expect(tl.pivot?.kind).toBe("all-in");
    expect(tl.mods.baronBias).toBeGreaterThan(0);
    expect(tl.mods.visionChanceDelta).toBeGreaterThan(0);
    expect(tl.mods.stealChanceDelta).toBeGreaterThan(0);
    expect(tl.mods.closingRiskFactor).toBeLessThan(1);
  });

  it("behind against a siege macro pivots to splitpush (tower pressure + pivot marker)", () => {
    const tl = makeTl({
      adaptiveMidgame: true,
      goldLead: -4000,
      redStrategy: { ...DEFAULT_STRATEGY, macro: "siege" },
    });
    maybeMidgamePivot(tl, 21);
    expect(tl.pivot?.kind).toBe("splitpush");
    expect(tl.state.towerPressure.blue).toBeGreaterThan(0);
  });

  it("otherwise sells out for objectives", () => {
    const tl = makeTl({ adaptiveMidgame: true, goldLead: -4000 });
    maybeMidgamePivot(tl, 21);
    expect(tl.pivot?.kind).toBe("objective-rush");
  });
});

// ─── Calibration guard (reduced-N) ──────────────────────────────────────────
//
// The pivot must IMPROVE the losing side's comeback odds slightly without
// flipping games. simulateMatch can't enable the flag yet (SimulateOptions
// plumbing is an integration-agent edit), so this runs the post-pivot tail
// of the real timeline — 4th drake, baron, mid tower, elder, closing
// decision — from a fixed "blue clearly behind at 20" state, paired by seed,
// with and without the pivot.

describe("midgame pivot — comeback odds shift is positive but modest", () => {
  function runTail(seed: number, pivot: boolean): Side {
    const tl = makeTl({
      adaptiveMidgame: pivot,
      goldLead: -3500,
      momentum: -0.3,
      drakes: { blue: 1, red: 2 },
      duration: 38,
      seed,
    });
    if (pivot) maybeMidgamePivot(tl, 21);
    phaseFourthDrakeSoul(tl);
    phaseFirstBaron(tl);
    phaseMidTower(tl);
    phaseElder(tl);
    return decideClosingWinner(tl, NEUTRAL_COMBAT);
  }

  it("comeback rate rises with the pivot, by no more than 6pp", () => {
    const N = 2000;
    let baseWins = 0;
    let pivotWins = 0;
    for (let seed = 0; seed < N; seed++) {
      if (runTail(seed, false) === "blue") baseWins++;
      if (runTail(seed, true) === "blue") pivotWins++;
    }
    const baseRate = baseWins / N;
    const pivotRate = pivotWins / N;
    // Behind stays behind: the pivot must not flip the game on average.
    expect(baseRate).toBeLessThan(0.5);
    expect(pivotRate).toBeLessThan(0.5);
    // ...but it has to help, and only modestly (≤ 6pp drift budget).
    expect(pivotRate).toBeGreaterThan(baseRate);
    expect(pivotRate - baseRate).toBeLessThanOrEqual(0.06);
  });
});
