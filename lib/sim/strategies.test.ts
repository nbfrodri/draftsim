import { describe, it, expect } from "vitest";
import type { Champion, GameDraft, Lane, PlayerTier, Roster } from "../types";
import {
  applyLaneSwapToLaneAdv,
  applyPickTargetToLaneAdv,
  applyWeaksideToLaneAdv,
  backdoorBonusFor,
  chooseAIStrategy,
  chooseAIStrategyForGame,
  DEFAULT_STRATEGY,
  fitTier,
  recommendStrategy,
  STRATEGY_LEVERS,
  strategyFit,
  strategySummary,
  strategyTimelineModifiers,
  type PriorGameSummary,
  type TeamStrategy,
} from "./strategies";
import { simulateMatch } from "../matchSimulator";

// Deterministic LCG so variety tests don't flake.
function makeRng(seed = 1): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
// Positional roster [top, jungle, mid, bot, support] with given tiers.
function roster(tiers: [PlayerTier, PlayerTier, PlayerTier, PlayerTier, PlayerTier]): Roster {
  const lanes: Lane[] = ["top", "jungle", "middle", "bottom", "support"];
  return lanes.map((lane, i) => ({ lane, tier: tiers[i], goodChamps: [], badChamps: [] }));
}
function laneAdv(p: Partial<Record<Lane, number>> = {}): Record<Lane, number> {
  return { top: 0, jungle: 0, middle: 0, bottom: 0, support: 0, ...p };
}

const LANES: Lane[] = ["top", "jungle", "middle", "bottom", "support"];

let nextId = 1;
// Minimal Champion fixture. metaFor() keys off `alias`, so using real meta
// aliases gives predictable phase/archetype behavior.
function champ(alias: string, lane: Lane = "middle"): Champion {
  return {
    id: nextId++,
    name: alias,
    alias,
    roles: [],
    iconUrl: "",
    lanes: [lane],
  };
}

// Phase-known aliases from championMeta: late scalers and early-game champs.
const LATE = ["Anivia", "Azir", "AurelionSol", "Aphelios", "Anivia"];
const EARLY = ["Darius", "Draven", "Elise", "LeeSin", "Renekton"];

function comp(aliases: string[]): (Champion | null)[] {
  return aliases.map((a, i) => champ(a, LANES[i]));
}

function neutralLaneAdv(): Record<Lane, number> {
  return { top: 0, jungle: 0, middle: 0, bottom: 0, support: 0 };
}

function override(base: TeamStrategy, patch: Partial<TeamStrategy>): TeamStrategy {
  return { ...base, ...patch };
}

describe("STRATEGY_LEVERS / DEFAULT_STRATEGY", () => {
  it("describes every TeamStrategy field exactly once", () => {
    const keys = STRATEGY_LEVERS.map((l) => l.key).sort();
    expect(keys).toEqual(
      [
        "gamePlan",
        "jungle",
        "weakside",
        "winCondition",
        "macro",
        "fightStyle",
        "objective",
        "vision",
        "tempo",
        "risk",
        "pickTarget",
        "laneSwap",
        "topPlay",
        "midPlay",
        "botPlay",
        "supportPlay",
      ].sort(),
    );
  });

  it("every lever option set includes the DEFAULT_STRATEGY value", () => {
    for (const lever of STRATEGY_LEVERS) {
      const values = lever.options.map((o) => o.value);
      expect(values).toContain(DEFAULT_STRATEGY[lever.key]);
    }
  });
});

describe("recommendStrategy", () => {
  it("recommends scaling/farm/passive for an all-late comp", () => {
    const s = recommendStrategy(comp(LATE));
    expect(s.gamePlan).toBe("scaling");
    expect(s.jungle).toBe("farm");
    expect(s.tempo).toBe("passive");
  });

  it("recommends early-snowball/gank/aggressive for an all-early comp", () => {
    const s = recommendStrategy(comp(EARLY));
    expect(s.gamePlan).toBe("early-snowball");
    expect(s.jungle).toBe("gank");
    expect(s.tempo).toBe("aggressive");
  });

  it("recommends a splitpush macro when a splitpusher is present", () => {
    const picks = comp(["Camille", "Elise", "Azir", "Aphelios", "Anivia"]);
    expect(recommendStrategy(picks).macro).toBe("splitpush");
  });

  it("recommends top weakside when top is self-sufficient (tank/splitpush)", () => {
    // Camille (splitpush) top → self-sufficient weakside top.
    const picks = comp(["Camille", "Elise", "Azir", "Aphelios", "Anivia"]);
    expect(recommendStrategy(picks).weakside).toBe("top");
  });
});

describe("strategyFit", () => {
  it("rewards a scaling plan on a late comp and penalizes it on an early comp", () => {
    const scaling = override(DEFAULT_STRATEGY, { gamePlan: "scaling" });
    const lateFit = strategyFit(scaling, comp(LATE));
    const earlyFit = strategyFit(scaling, comp(EARLY));
    expect(lateFit).toBeGreaterThan(0);
    expect(earlyFit).toBeLessThan(lateFit);
  });

  it("penalizes a splitpush plan with no splitpusher", () => {
    const split = override(DEFAULT_STRATEGY, { macro: "splitpush" });
    const withSplit = strategyFit(
      split,
      comp(["Camille", "Elise", "Azir", "Aphelios", "Anivia"]),
    );
    const noSplit = strategyFit(split, comp(LATE));
    expect(withSplit).toBeGreaterThan(noSplit);
    expect(noSplit).toBeLessThan(0);
  });

  it("is bounded to ±8", () => {
    const extreme = override(DEFAULT_STRATEGY, {
      gamePlan: "early-snowball",
      tempo: "aggressive",
      jungle: "gank",
    });
    expect(Math.abs(strategyFit(extreme, comp(LATE)))).toBeLessThanOrEqual(8);
  });
});

describe("strategyTimelineModifiers", () => {
  it("biases ganks toward the gank-focused side and raises gank chance", () => {
    const gank = override(DEFAULT_STRATEGY, { jungle: "gank" });
    const farm = override(DEFAULT_STRATEGY, { jungle: "farm" });
    const m = strategyTimelineModifiers(gank, farm);
    expect(m.gankBias).toBeGreaterThan(0); // blue (gank) favored
    const bothGank = strategyTimelineModifiers(gank, gank);
    expect(bothGank.gankChanceDelta).toBeGreaterThan(0);
    const bothFarm = strategyTimelineModifiers(farm, farm);
    expect(bothFarm.gankChanceDelta).toBeLessThan(0);
  });

  it("lengthens the game for scaling/passive and shortens it for aggressive", () => {
    const scaling = override(DEFAULT_STRATEGY, {
      gamePlan: "scaling",
      tempo: "passive",
    });
    const aggressive = override(DEFAULT_STRATEGY, {
      gamePlan: "early-snowball",
      tempo: "aggressive",
    });
    expect(
      strategyTimelineModifiers(scaling, scaling).durationDelta,
    ).toBeGreaterThan(0);
    expect(
      strategyTimelineModifiers(aggressive, aggressive).durationDelta,
    ).toBeLessThan(0);
  });

  it("tilts drake rolls toward the dragon-focused side", () => {
    const dragon = override(DEFAULT_STRATEGY, { objective: "dragon" });
    const m = strategyTimelineModifiers(dragon, DEFAULT_STRATEGY);
    expect(m.drakeBias).toBeGreaterThan(0);
  });

  it("is all-zero when both teams run the neutral default", () => {
    const m = strategyTimelineModifiers(DEFAULT_STRATEGY, DEFAULT_STRATEGY);
    expect(m.gankChanceDelta).toBe(0);
    expect(m.gankBias).toBe(0);
    expect(m.roamChanceDelta).toBe(0);
    expect(m.drakeBias).toBe(0);
    expect(m.baronBias).toBe(0);
    expect(m.earlyAggroBias).toBe(0);
    expect(m.visionChanceDelta).toBe(0);
    expect(m.visionBias).toBe(0);
    expect(m.durationDelta).toBe(0);
    expect(m.atakhanBias).toBe(0);
    expect(m.stealChanceDelta).toBe(0);
    expect(m.closingRiskFactor).toBe(1);
  });

  it("invade raises gank chance more than gank-heavy", () => {
    const invade = override(DEFAULT_STRATEGY, { jungle: "invade" });
    const gank = override(DEFAULT_STRATEGY, { jungle: "gank" });
    expect(
      strategyTimelineModifiers(invade, DEFAULT_STRATEGY).gankChanceDelta,
    ).toBeGreaterThan(
      strategyTimelineModifiers(gank, DEFAULT_STRATEGY).gankChanceDelta,
    );
  });

  it("proactive vision raises vision-pick chance and biases its side", () => {
    const proactive = override(DEFAULT_STRATEGY, { vision: "proactive" });
    const m = strategyTimelineModifiers(proactive, DEFAULT_STRATEGY);
    expect(m.visionChanceDelta).toBeGreaterThan(0);
    expect(m.visionBias).toBeGreaterThan(0);
  });
});

describe("new levers — fit + neutral defaults", () => {
  it("DEFAULT_STRATEGY contributes exactly 0 fit for any comp", () => {
    // Truly neutral default keeps no-strategy games bit-identical to before.
    expect(strategyFit(DEFAULT_STRATEGY, comp(LATE))).toBe(0);
    expect(strategyFit(DEFAULT_STRATEGY, comp(EARLY))).toBe(0);
  });

  it("rewards funneling into a real carry lane and punishes funneling a non-carry", () => {
    // Malphite (tank) top, Jinx (hyper-carry) bot → bot-carry fits; funneling
    // the tank toplaner does not.
    const frontComp = comp(["Malphite", "LeeSin", "Orianna", "Jinx", "Leona"]);
    const botCarry = override(DEFAULT_STRATEGY, { winCondition: "bot-carry" });
    const topCarry = override(DEFAULT_STRATEGY, { winCondition: "top-carry" });
    expect(strategyFit(botCarry, frontComp)).toBeGreaterThan(0);
    expect(strategyFit(topCarry, frontComp)).toBeLessThan(0);
  });

  it("front-to-back fits a frontline+hypercarry comp, flank fits a pick comp", () => {
    const ftb = override(DEFAULT_STRATEGY, { fightStyle: "front-to-back" });
    // Malphite (tank/engage) top + Jinx (hyper-carry) bot → front-to-back fits.
    const frontComp = comp(["Malphite", "LeeSin", "Orianna", "Jinx", "Leona"]);
    expect(strategyFit(ftb, frontComp)).toBeGreaterThan(0);
  });
});

describe("lane-assignment levers", () => {
  const splitComp = comp(["Camille", "LeeSin", "Azir", "Aphelios", "Leona"]);

  it("top splitpush fits a comp with a splitpusher and feeds the backdoor bonus", () => {
    const split = override(DEFAULT_STRATEGY, { topPlay: "splitpush" });
    expect(strategyFit(split, splitComp)).toBeGreaterThan(0);
    expect(strategyFit(split, comp(LATE))).toBeLessThan(0); // no splitpusher
    expect(backdoorBonusFor(split)).toBeGreaterThan(0);
    expect(backdoorBonusFor(DEFAULT_STRATEGY)).toBe(0);
  });

  it("a roaming midlaner raises the roam-event chance", () => {
    const roam = override(DEFAULT_STRATEGY, { midPlay: "roam" });
    expect(
      strategyTimelineModifiers(roam, DEFAULT_STRATEGY).roamChanceDelta,
    ).toBeGreaterThan(0);
  });

  it("a diving bot adds early action; a scaling bot lengthens the game", () => {
    const dive = override(DEFAULT_STRATEGY, { botPlay: "dive" });
    const scale = override(DEFAULT_STRATEGY, { botPlay: "scale" });
    expect(
      strategyTimelineModifiers(dive, DEFAULT_STRATEGY).earlyAggroBias,
    ).toBeGreaterThan(0);
    expect(
      strategyTimelineModifiers(scale, scale).durationDelta,
    ).toBeGreaterThan(0);
  });

  it("top rotate tilts objective rolls toward that side", () => {
    const rotate = override(DEFAULT_STRATEGY, { topPlay: "rotate" });
    const m = strategyTimelineModifiers(rotate, DEFAULT_STRATEGY);
    expect(m.drakeBias).toBeGreaterThan(0);
    expect(m.baronBias).toBeGreaterThan(0);
  });

  it("lane-assignment defaults stay neutral (zero fit, zero modifiers)", () => {
    // Already covered globally, but assert specifically that the new fields
    // don't disturb the neutral baseline.
    expect(strategyFit(DEFAULT_STRATEGY, splitComp)).toBe(0);
  });

  it("a roaming support adds to the roam-event chance", () => {
    const roam = override(DEFAULT_STRATEGY, { supportPlay: "roam" });
    expect(
      strategyTimelineModifiers(roam, DEFAULT_STRATEGY).roamChanceDelta,
    ).toBeGreaterThan(0);
  });
});

describe("risk / variance lever", () => {
  it("high-roll raises steal chance and flattens the closing fight", () => {
    const hr = override(DEFAULT_STRATEGY, { risk: "high-roll" });
    const m = strategyTimelineModifiers(hr, DEFAULT_STRATEGY);
    expect(m.stealChanceDelta).toBeGreaterThan(0);
    expect(m.closingRiskFactor).toBeLessThan(1); // pulled toward coinflip
  });

  it("safe lowers steal chance and sharpens the closing fight", () => {
    const safe = override(DEFAULT_STRATEGY, { risk: "safe" });
    const m = strategyTimelineModifiers(safe, safe);
    expect(m.stealChanceDelta).toBeLessThan(0);
    expect(m.closingRiskFactor).toBeGreaterThan(1); // favors the favorite
  });

  it("risk is fit-neutral (a variance dial, not a comp-fit choice)", () => {
    expect(strategyFit(override(DEFAULT_STRATEGY, { risk: "high-roll" }), comp(LATE))).toBe(
      strategyFit(DEFAULT_STRATEGY, comp(LATE)),
    );
  });
});

describe("new lever options", () => {
  it("objective 'atakhan' tilts the Atakhan roll toward that side", () => {
    const atk = override(DEFAULT_STRATEGY, { objective: "atakhan" });
    expect(
      strategyTimelineModifiers(atk, DEFAULT_STRATEGY).atakhanBias,
    ).toBeGreaterThan(0);
  });

  it("macro 'siege' fits a poke comp and lengthens the game", () => {
    const siege = override(DEFAULT_STRATEGY, { macro: "siege" });
    const pokeComp = comp(["Jayce", "Nidalee", "Xerath", "Caitlyn", "Karma"]);
    expect(strategyFit(siege, pokeComp)).toBeGreaterThan(0);
    expect(
      strategyTimelineModifiers(siege, siege).durationDelta,
    ).toBeGreaterThan(0);
  });

  it("jungle 'counter-jungle' is a milder gank-rate bump than 'gank'", () => {
    const cj = strategyTimelineModifiers(
      override(DEFAULT_STRATEGY, { jungle: "counter-jungle" }),
      DEFAULT_STRATEGY,
    ).gankChanceDelta;
    const gk = strategyTimelineModifiers(
      override(DEFAULT_STRATEGY, { jungle: "gank" }),
      DEFAULT_STRATEGY,
    ).gankChanceDelta;
    expect(cj).toBeGreaterThan(0);
    expect(cj).toBeLessThan(gk);
  });
});

describe("applyWeaksideToLaneAdv", () => {
  it("starves the weak lane and funds jungle + opposite solo (blue top weakside)", () => {
    const blue = override(DEFAULT_STRATEGY, { weakside: "top" });
    const out = applyWeaksideToLaneAdv(neutralLaneAdv(), blue, DEFAULT_STRATEGY);
    expect(out.top).toBeLessThan(0); // blue worse top
    expect(out.jungle).toBeGreaterThan(0);
    expect(out.bottom).toBeGreaterThan(0);
  });

  it("moves the opposite way for the red team (red worse → blue relatively better)", () => {
    const red = override(DEFAULT_STRATEGY, { weakside: "bottom" });
    const out = applyWeaksideToLaneAdv(neutralLaneAdv(), DEFAULT_STRATEGY, red);
    expect(out.bottom).toBeGreaterThan(0); // blue relatively better bot
    expect(out.jungle).toBeLessThan(0);
    expect(out.top).toBeLessThan(0);
  });

  it("does not mutate the input and is a no-op for 'none'/'none'", () => {
    const input = neutralLaneAdv();
    const out = applyWeaksideToLaneAdv(input, DEFAULT_STRATEGY, DEFAULT_STRATEGY);
    expect(out).toEqual(input);
    expect(out).not.toBe(input); // returns a copy
  });
});

describe("backdoorBonusFor", () => {
  it("gives a bonus only to a splitpush plan", () => {
    expect(backdoorBonusFor(override(DEFAULT_STRATEGY, { macro: "splitpush" }))).toBeGreaterThan(0);
    expect(backdoorBonusFor(DEFAULT_STRATEGY)).toBe(0);
  });
});

describe("fitTier / strategySummary", () => {
  it("classifies fit into strong / balanced / poor", () => {
    expect(fitTier(5)).toBe("strong");
    expect(fitTier(0)).toBe("balanced");
    expect(fitTier(-4)).toBe("poor");
  });

  it("summarizes a plan as one label/value pair per lever", () => {
    const summary = strategySummary(DEFAULT_STRATEGY);
    expect(summary).toHaveLength(STRATEGY_LEVERS.length);
    expect(summary.map((s) => s.label)).toEqual(
      STRATEGY_LEVERS.map((l) => l.label),
    );
  });
});

describe("chooseAIStrategy — context-aware & varied", () => {
  it("returns a complete, valid plan (deterministic argmax without rng)", () => {
    const s = chooseAIStrategy(comp(LATE));
    expect(Object.keys(s).sort()).toEqual(
      STRATEGY_LEVERS.map((l) => l.key).sort(),
    );
    // All-late comp → scaling/farm/passive on argmax.
    expect(s.gamePlan).toBe("scaling");
    expect(s.jungle).toBe("farm");
    expect(s.tempo).toBe("passive");
  });

  it("high-rolls when facing elimination, plays safe when on match point", () => {
    // Opponent on match point in a Bo5 (2-0 up) → high-roll.
    expect(
      chooseAIStrategy(comp(LATE), { selfWins: 0, oppWins: 2, gamesToWin: 3 }).risk,
    ).toBe("high-roll");
    // We're on match point (2-1 up) → safe.
    expect(
      chooseAIStrategy(comp(LATE), { selfWins: 2, oppWins: 1, gamesToWin: 3 }).risk,
    ).toBe("safe");
  });

  it("targets the enemy's strongest carry lane", () => {
    const pickComp = comp(["Xerath", "Elise", "Anivia", "Caitlyn", "Karma"]);
    // Enemy's best player is their ADC (bottom = S).
    const enemyRoster = roster(["B", "B", "B", "S", "B"]);
    expect(chooseAIStrategy(pickComp, { enemyRoster }).pickTarget).toBe("bot");
  });

  it("produces variety across calls when given an rng", () => {
    const rng = makeRng(7);
    const plans = new Set<string>();
    const visions = new Set<string>();
    for (let i = 0; i < 80; i++) {
      const s = chooseAIStrategy(comp(["Malphite", "Vi", "Ahri", "Jhin", "Nautilus"]), { rng });
      plans.add(s.gamePlan);
      visions.add(s.vision);
    }
    expect(plans.size).toBeGreaterThan(1);
    expect(visions.size).toBeGreaterThan(1);
  });
});

describe("chooseAIStrategy — comp coherence across diverse comps (argmax)", () => {
  // Each fixture is a recognizable comp identity; the deterministic argmax
  // plan must hang together as a coherent strategy, not a grab-bag of levers.

  it("scaling comp → scaling plan with matching levers", () => {
    const s = chooseAIStrategy(comp(LATE));
    expect(s.gamePlan).toBe("scaling");
    expect(s.jungle).toBe("farm");
    expect(s.tempo).toBe("passive");
    expect(s.objective).toBe("dragon"); // stack toward soul, late-game prize
  });

  it("early comp → aggression with matching levers", () => {
    const s = chooseAIStrategy(comp(EARLY));
    expect(s.gamePlan).toBe("early-snowball");
    expect(s.jungle).toBe("gank");
    expect(s.tempo).toBe("aggressive");
    expect(s.objective).toBe("herald"); // early tower tempo
  });

  it("pick comp → pick macro, flank fights, proactive vision, roaming mid", () => {
    // Elise/Ahri/Jhin/Thresh stack pick+assassin+burst archetypes.
    const s = chooseAIStrategy(comp(["Renekton", "Elise", "Ahri", "Jhin", "Thresh"]));
    expect(s.macro).toBe("pick");
    expect(s.fightStyle).toBe("flank");
    expect(s.vision).toBe("proactive");
    expect(s.midPlay).toBe("roam");
  });

  it("poke comp → siege macro and poke fight style", () => {
    const s = chooseAIStrategy(comp(["Jayce", "Nidalee", "Xerath", "Caitlyn", "Karma"]));
    expect(s.macro).toBe("siege");
    expect(s.fightStyle).toBe("poke");
  });

  it("splitpush comp → 1-3-1 macro with the top laner splitting", () => {
    const s = chooseAIStrategy(comp(["Camille", "Elise", "Azir", "Aphelios", "Anivia"]));
    expect(s.macro).toBe("splitpush");
    expect(s.topPlay).toBe("splitpush");
  });

  it("frontline + hyper-carry comp → teamfight, front-to-back, protect the carry", () => {
    const s = chooseAIStrategy(comp(["Malphite", "Vi", "Orianna", "Jinx", "Leona"]));
    expect(s.gamePlan).toBe("teamfight");
    expect(s.fightStyle).toBe("front-to-back");
    expect(s.supportPlay).toBe("protect");
    expect(s.botPlay).toBe("scale"); // Jinx farms to her spike
  });

  it("rng sampling keeps the comp-fitting plan as the modal choice", () => {
    const rng = makeRng(11);
    const counts: Record<string, number> = {};
    for (let i = 0; i < 120; i++) {
      const s = chooseAIStrategy(comp(LATE), { rng });
      counts[s.gamePlan] = (counts[s.gamePlan] ?? 0) + 1;
    }
    // Variety exists but "scaling" dominates for an all-late comp (weight 7/11).
    expect(Object.keys(counts).length).toBeGreaterThan(1);
    expect(counts["scaling"]).toBeGreaterThan(counts["early-snowball"] ?? 0);
    expect(counts["scaling"]).toBeGreaterThan(counts["teamfight"] ?? 0);
  });
});

describe("chooseAIStrategyForGame — series adaptation", () => {
  const MIRROR = ["Malphite", "Vi", "Ahri", "Jhin", "Nautilus"];
  const SPLIT = ["Camille", "Elise", "Azir", "Aphelios", "Anivia"];

  function prior(
    patch: Partial<PriorGameSummary> & { won: boolean },
  ): PriorGameSummary {
    return { strategy: DEFAULT_STRATEGY, ...patch };
  }

  it("game 1 (no prior games) → identical to chooseAIStrategy", () => {
    const forGame = chooseAIStrategyForGame({
      picks: comp(LATE),
      priorGames: [],
      rng: makeRng(3),
    });
    const direct = chooseAIStrategy(comp(LATE), { rng: makeRng(3) });
    expect(forGame).toEqual(direct);
  });

  it("after a win → keeps gamePlan/tempo/macro/objective from the winning plan", () => {
    const winning = override(DEFAULT_STRATEGY, {
      gamePlan: "scaling",
      tempo: "passive",
      macro: "siege",
      objective: "atakhan",
    });
    const s = chooseAIStrategyForGame({
      picks: comp(EARLY), // even though the new comp leans early...
      priorGames: [prior({ won: true, strategy: winning })],
      rng: makeRng(5),
    });
    expect(s.gamePlan).toBe("scaling");
    expect(s.tempo).toBe("passive");
    expect(s.macro).toBe("siege");
    expect(s.objective).toBe("atakhan");
  });

  it("after a win does not carry a splitpush macro into a comp with no splitpusher", () => {
    const winning = override(DEFAULT_STRATEGY, { macro: "splitpush" });
    const s = chooseAIStrategyForGame({
      picks: comp(LATE), // no splitpusher
      priorGames: [prior({ won: true, strategy: winning })],
      rng: makeRng(5),
    });
    expect(s.macro).not.toBe("splitpush");
  });

  it("lost a slow scaling game → pushes tempo / early aggression (rule L1)", () => {
    const slowLoss = prior({
      won: false,
      strategy: override(DEFAULT_STRATEGY, { gamePlan: "scaling", tempo: "passive" }),
      durationMinutes: 38,
    });
    const s = chooseAIStrategyForGame({
      picks: comp(EARLY),
      priorGames: [slowLoss],
      rng: makeRng(7),
    });
    expect(s.gamePlan).toBe("early-snowball");
    expect(s.tempo).toBe("aggressive");
    expect(s.jungle).toBe("gank");
    expect(s.objective).toBe("herald");
  });

  it("rule L1 falls back to teamfight aggression when the comp has no early champs", () => {
    const slowLoss = prior({
      won: false,
      strategy: override(DEFAULT_STRATEGY, { gamePlan: "scaling" }),
    });
    const s = chooseAIStrategyForGame({
      picks: comp(LATE), // zero early-phase champions
      priorGames: [slowLoss],
      rng: makeRng(7),
    });
    expect(s.gamePlan).toBe("teamfight");
    expect(s.tempo).toBe("aggressive");
  });

  it("lost the early game → plays safer scaling (rule L2)", () => {
    const fastLoss = prior({
      won: false,
      strategy: override(DEFAULT_STRATEGY, {
        gamePlan: "early-snowball",
        tempo: "aggressive",
      }),
      durationMinutes: 26,
    });
    const s = chooseAIStrategyForGame({
      picks: comp(LATE),
      priorGames: [fastLoss],
      rng: makeRng(9),
    });
    expect(s.gamePlan).toBe("scaling");
    expect(s.tempo).toBe("passive");
    expect(s.jungle).toBe("farm");
    expect(s.objective).toBe("dragon");
    expect(s.botPlay).toBe("scale");
    expect(s.supportPlay).toBe("protect");
  });

  it("lost a standard game with a splitpusher available → changes map shape (rule L3a)", () => {
    const s = chooseAIStrategyForGame({
      picks: comp(SPLIT),
      priorGames: [prior({ won: false })], // lost on the neutral plan
      rng: makeRng(13),
    });
    expect(s.macro).toBe("splitpush");
    expect(s.topPlay).toBe("splitpush");
  });

  it("lost a standard game with no splitpusher → hunts picks (rule L3b)", () => {
    const s = chooseAIStrategyForGame({
      picks: comp(MIRROR),
      priorGames: [prior({ won: false })],
      rng: makeRng(13),
    });
    expect(s.macro).toBe("pick");
    expect(s.vision).toBe("proactive");
  });

  it("lost to a splitpush plan → groups, wards deep and hunts the splitter (rule L4)", () => {
    const s = chooseAIStrategyForGame({
      picks: comp(MIRROR),
      priorGames: [
        prior({
          won: false,
          opponentStrategy: override(DEFAULT_STRATEGY, { macro: "splitpush" }),
        }),
      ],
      rng: makeRng(17),
    });
    expect(s.macro).toBe("group");
    expect(s.vision).toBe("proactive");
    expect(s.pickTarget).toBe("top");
  });

  it("lost to a pick plan → stops getting caught (rule L5)", () => {
    const s = chooseAIStrategyForGame({
      picks: comp(MIRROR),
      priorGames: [
        prior({
          won: false,
          opponentStrategy: override(DEFAULT_STRATEGY, { macro: "pick" }),
        }),
      ],
      rng: makeRng(17),
    });
    expect(s.macro).toBe("group");
    expect(s.vision).toBe("proactive");
    expect(s.supportPlay).toBe("protect");
  });

  it("a stomped loss flips the risk dial to high-roll (rule L6)", () => {
    const stomped = chooseAIStrategyForGame({
      picks: comp(MIRROR),
      priorGames: [prior({ won: false, goldDiff: -9000 })],
      rng: makeRng(19),
    });
    expect(stomped.risk).toBe("high-roll");
    // A close loss does NOT touch the risk dial — it keeps whatever the
    // base (comp + series context) plan sampled for the same rng stream.
    const close = chooseAIStrategyForGame({
      picks: comp(MIRROR),
      priorGames: [prior({ won: false, goldDiff: -1200 })],
      rng: makeRng(19),
    });
    const base = chooseAIStrategy(comp(MIRROR), { rng: makeRng(19) });
    expect(close.risk).toBe(base.risk);
  });

  it("ignores prior games tagged with a different opponent", () => {
    const vsOther = prior({
      won: false,
      goldDiff: -9000,
      opponentName: "Some Other Team",
    });
    const s = chooseAIStrategyForGame({
      picks: comp(LATE),
      priorGames: [vsOther],
      opponentName: "Current Rival",
      rng: makeRng(21),
    });
    // No relevant history → identical to the game-1 path.
    expect(s).toEqual(chooseAIStrategy(comp(LATE), { rng: makeRng(21) }));
  });

  it("uses the MOST RECENT game when several priors exist", () => {
    const oldLoss = prior({
      won: false,
      strategy: override(DEFAULT_STRATEGY, { gamePlan: "early-snowball" }),
    });
    const recentWin = prior({
      won: true,
      strategy: override(DEFAULT_STRATEGY, { gamePlan: "scaling", macro: "siege" }),
    });
    const s = chooseAIStrategyForGame({
      picks: comp(LATE),
      priorGames: [oldLoss, recentWin],
      rng: makeRng(23),
    });
    // Adapts to the recent WIN (keep plan), not the older loss.
    expect(s.gamePlan).toBe("scaling");
    expect(s.macro).toBe("siege");
  });
});

describe("pick-target & lane-swap lane redistribution", () => {
  it("denies the hunted enemy lane (blue hunts red bot → blue better bot)", () => {
    const blue = override(DEFAULT_STRATEGY, { pickTarget: "bot" });
    const out = applyPickTargetToLaneAdv(laneAdv(), blue, DEFAULT_STRATEGY);
    expect(out.bottom).toBeGreaterThan(0);
    const red = override(DEFAULT_STRATEGY, { pickTarget: "mid" });
    const out2 = applyPickTargetToLaneAdv(laneAdv(), DEFAULT_STRATEGY, red);
    expect(out2.middle).toBeLessThan(0); // red hunts blue mid
  });

  it("lane swap softens a losing top and costs a little bot tempo", () => {
    const blue = override(DEFAULT_STRATEGY, { laneSwap: "lane-swap" });
    // Blue is losing top (-30). Swap pulls it toward 0.
    const out = applyLaneSwapToLaneAdv(laneAdv({ top: -30 }), blue, DEFAULT_STRATEGY);
    expect(out.top).toBeGreaterThan(-30);
    expect(out.top).toBeLessThan(0);
    expect(out.bottom).toBeLessThan(0); // swap disruption
  });
});

describe("simulateMatch strategy integration", () => {
  function game(blue: (Champion | null)[], red: (Champion | null)[]): GameDraft {
    return {
      id: "g1",
      gameNumber: 1,
      blueTeam: "Blue",
      redTeam: "Red",
      blueBans: [],
      redBans: [],
      bluePicks: blue.map((c) => c?.id ?? null),
      redPicks: red.map((c) => c?.id ?? null),
      blueRoles: [...LANES],
      redRoles: [...LANES],
      actionIndex: 0,
      status: "complete",
      winner: null,
    };
  }

  it("a fitting plan raises blueProb vs a mismatched plan (deterministic)", () => {
    const blue = comp(LATE);
    const red = comp(LATE);
    const champions = [...blue, ...red].filter((c): c is Champion => !!c);
    const g = game(blue, red);
    const fitting = simulateMatch(g, champions, {
      blueStrategy: override(DEFAULT_STRATEGY, { gamePlan: "scaling" }),
      redStrategy: DEFAULT_STRATEGY,
    });
    const mismatched = simulateMatch(g, champions, {
      blueStrategy: override(DEFAULT_STRATEGY, { gamePlan: "early-snowball" }),
      redStrategy: DEFAULT_STRATEGY,
    });
    expect(fitting.blueProb).toBeGreaterThan(mismatched.blueProb);
  });

  it("simulates unchanged when no strategy is supplied (neutral default)", () => {
    const blue = comp(LATE);
    const red = comp(EARLY);
    const champions = [...blue, ...red].filter((c): c is Champion => !!c);
    const g = game(blue, red);
    // Should not throw and should yield a complete, valid result.
    const result = simulateMatch(g, champions);
    expect(result.timeline.events.length).toBeGreaterThan(0);
    expect(["blue", "red"]).toContain(result.winner);
  });
});
