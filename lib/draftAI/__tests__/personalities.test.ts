import { describe, it, expect } from "vitest";
import { createRng } from "../../rng";
import { createGame } from "../../draftEngine";
import { LANE_ORDER } from "../../players";
import { archetypeCounts } from "../helpers";
import {
  chooseAIAction,
  chooseAIActionWithRationale,
  type SeriesAIContext,
} from "../index";
import {
  DEFAULT_PERSONALITY_ID,
  PERSONALITIES,
  PERSONALITY_LIST,
  getPersonality,
} from "../personalities";
import { scoreBan, type BanContext } from "../scoring";
import type { AIDifficulty, Champion, Lane, Roster } from "../../types";

// ─── Fixtures ───────────────────────────────────────────────────────────────
// Real CHAMPION_META aliases so tier/archetype lookups resolve. Lanes match
// each champion's metaTiers lanes (verified against lib/data/championMeta.json):
//   Aatrox top S+ · Illaoi top B · Camille top S+ · DrMundo top B
//   LeeSin jg S · Vi jg A · Gragas jg B
//   Ahri mid S · Orianna mid S · Yasuo mid S+
//   Jinx bot S · Ashe bot S
//   Leona sup S · Thresh sup S+ · Lulu sup S+

function makeChamp(
  id: number,
  alias: string,
  roles: string[],
  lanes: Lane[],
): Champion {
  return { id, name: alias, alias, roles, lanes, iconUrl: "" };
}

const Aatrox = makeChamp(1, "Aatrox", ["Fighter"], ["top"]);
const Illaoi = makeChamp(2, "Illaoi", ["Fighter"], ["top"]);
const Camille = makeChamp(3, "Camille", ["Fighter"], ["top"]);
const DrMundo = makeChamp(4, "DrMundo", ["Tank", "Fighter"], ["top"]);
const LeeSin = makeChamp(5, "LeeSin", ["Fighter"], ["jungle"]);
const Vi = makeChamp(6, "Vi", ["Fighter"], ["jungle"]);
const Gragas = makeChamp(7, "Gragas", ["Fighter", "Mage"], ["jungle", "top"]);
const Ahri = makeChamp(8, "Ahri", ["Mage", "Assassin"], ["middle"]);
const Orianna = makeChamp(9, "Orianna", ["Mage"], ["middle"]);
const Yasuo = makeChamp(10, "Yasuo", ["Fighter", "Assassin"], ["middle", "top"]);
const Jinx = makeChamp(11, "Jinx", ["Marksman"], ["bottom"]);
const Ashe = makeChamp(12, "Ashe", ["Marksman"], ["bottom", "support"]);
const Leona = makeChamp(13, "Leona", ["Tank", "Support"], ["support"]);
const Thresh = makeChamp(14, "Thresh", ["Support", "Tank"], ["support"]);
const Lulu = makeChamp(15, "Lulu", ["Support", "Mage"], ["support"]);

const POOL: Champion[] = [
  Aatrox, Illaoi, Camille, DrMundo, LeeSin, Vi, Gragas, Ahri,
  Orianna, Yasuo, Jinx, Ashe, Leona, Thresh, Lulu,
];

const zeroArch = archetypeCounts([], new Map());

function rosterWithTopPool(good: number[], bad: number[] = []): Roster {
  return LANE_ORDER.map((lane) => ({
    lane,
    tier: "B" as const,
    goodChamps: lane === "top" ? good : [],
    badChamps: lane === "top" ? bad : [],
  }));
}

function makeSeries(
  myPlayers: Roster | undefined,
  oppPlayers: Roster | undefined = undefined,
  difficulty: AIDifficulty = "normal",
): SeriesAIContext {
  return {
    fearless: false,
    gameIndex: 0,
    totalGames: 1,
    difficulty,
    myPriorPicks: new Set(),
    oppPriorPicks: new Set(),
    oppPriorIdentities: [],
    oppPriorArchetypeProfile: zeroArch,
    myWins: 0,
    oppWins: 0,
    winsBehind: 0,
    eliminationGame: false,
    closeoutGame: false,
    myPlayers,
    oppPlayers,
  };
}

function gameAt(actionIndex: number) {
  const game = createGame(1, "Blue", "Red");
  game.actionIndex = actionIndex;
  return game;
}

// ─── Registry ───────────────────────────────────────────────────────────────

describe("PERSONALITIES registry", () => {
  it("exposes the 6 presets with unique ids and descriptions", () => {
    expect(PERSONALITY_LIST).toHaveLength(6);
    const ids = PERSONALITY_LIST.map((p) => p.id);
    expect(new Set(ids).size).toBe(6);
    expect(ids).toEqual([
      "balanced",
      "meta-slave",
      "comfort-first",
      "counter-picker",
      "cheese",
      "synergy-architect",
    ]);
    for (const p of PERSONALITY_LIST) {
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.description.length).toBeGreaterThan(0);
      expect(PERSONALITIES[p.id]).toBe(p);
    }
  });

  it("'balanced' carries no weight/sampling overrides (exact default math)", () => {
    const b = PERSONALITIES.balanced;
    expect(Object.keys(b.weights)).toHaveLength(0);
    expect(b.sampling).toBeUndefined();
    expect(b.pocketPickProbMul).toBeUndefined();
    expect(b.offMetaComfortBonus).toBeUndefined();
  });

  it("getPersonality falls back to balanced for unknown/missing ids", () => {
    expect(getPersonality(undefined).id).toBe(DEFAULT_PERSONALITY_ID);
    expect(getPersonality(null).id).toBe(DEFAULT_PERSONALITY_ID);
    expect(getPersonality("does-not-exist").id).toBe(DEFAULT_PERSONALITY_ID);
    expect(getPersonality("cheese").id).toBe("cheese");
  });
});

// ─── (a) Default behavior unchanged ─────────────────────────────────────────

describe("balanced personality === no personality (bit-identical)", () => {
  const series = makeSeries(
    rosterWithTopPool([Illaoi.id]),
    rosterWithTopPool([Aatrox.id]),
  );

  // Pick (action 6, blue B1) and bans in both phases (0 and 12) exercise
  // jitter, softmax sampling, pocket-pick rolls, lookahead and anticipation.
  for (const actionIndex of [0, 6, 12]) {
    it(`produces identical rationale for action ${actionIndex} across seeds`, () => {
      for (let seed = 1; seed <= 20; seed++) {
        const game = gameAt(actionIndex);
        const noPersonality = chooseAIActionWithRationale(
          game, POOL, new Set(), series, createRng(seed),
        );
        const balanced = chooseAIActionWithRationale(
          game, POOL, new Set(), series, createRng(seed),
          getPersonality("balanced"),
        );
        // Deep equality: same champion, same total, same components — and
        // no personalityId on the balanced rationale.
        expect(balanced).toEqual(noPersonality);
        expect(balanced?.personalityId).toBeUndefined();
      }
    });
  }

  it("chooseAIAction wrapper matches too", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const game = gameAt(6);
      expect(
        chooseAIAction(game, POOL, new Set(), series, createRng(seed),
          getPersonality("balanced")),
      ).toBe(chooseAIAction(game, POOL, new Set(), series, createRng(seed)));
    }
  });
});

// ─── (b) Meta-slave vs comfort-first divergence ─────────────────────────────

describe("personality divergence: meta-slave vs comfort-first", () => {
  // Scenario built to diverge: only two top laners available — Aatrox
  // (S+ top, not in pool) vs Illaoi (B top, the top laner's signature pick).
  // rng = () => 0 zeroes the jitter and makes sampleTopN return the argmax,
  // so the decision is exactly the weighted-score comparison.
  // actionIndex 17 (B4) → next action is also blue, so no lookahead noise.
  const candidates = [Aatrox, Illaoi];
  const series = makeSeries(rosterWithTopPool([Illaoi.id]));
  const rng0 = () => 0;

  it("balanced and meta-slave take the S+ meta pick", () => {
    expect(
      chooseAIAction(gameAt(17), candidates, new Set(), series, rng0,
        getPersonality("balanced")),
    ).toBe(Aatrox.id);
    expect(
      chooseAIAction(gameAt(17), candidates, new Set(), series, rng0,
        getPersonality("meta-slave")),
    ).toBe(Aatrox.id);
  });

  it("comfort-first takes the player's off-meta pool champ instead", () => {
    expect(
      chooseAIAction(gameAt(17), candidates, new Set(), series, rng0,
        getPersonality("comfort-first")),
    ).toBe(Illaoi.id);
  });

  it("rationale shows the weighted comfort component and the personality id", () => {
    const r = chooseAIActionWithRationale(
      gameAt(17), candidates, new Set(), series, rng0,
      getPersonality("comfort-first"),
    );
    expect(r?.personalityId).toBe("comfort-first");
    const comfort = r?.components.find((c) => c.label === "Player comfort pick");
    // Base +4, weighted ×3.5 by comfort-first.
    expect(comfort?.value).toBe(14);
    // Pocket-pick affinity flavor bonus fires (Illaoi top = B-tier < A).
    expect(
      r?.components.find((c) => c.label === "Pocket-pick affinity")?.value,
    ).toBe(2.5);
  });

  it("balanced rationale keeps the unweighted comfort value", () => {
    const r = chooseAIActionWithRationale(
      gameAt(17), [Illaoi], new Set(), series, rng0,
      getPersonality("balanced"),
    );
    expect(
      r?.components.find((c) => c.label === "Player comfort pick")?.value,
    ).toBe(4);
    expect(
      r?.components.find((c) => c.label === "Pocket-pick affinity"),
    ).toBeUndefined();
  });
});

// ─── Ban-style weighting ────────────────────────────────────────────────────

describe("ban-style weights (targetBan)", () => {
  function banCtx(personalityId?: string): BanContext {
    return {
      byId: new Map(POOL.map((c) => [c.id, c])),
      myCounts: zeroArch,
      oppPicks: [],
      isPhase2: false,
      enemyAnticipated: new Set(),
      series: makeSeries(undefined, rosterWithTopPool([Aatrox.id])),
      personality: personalityId ? getPersonality(personalityId) : undefined,
    };
  }

  it("counter-picker scales the enemy-comfort target ban", () => {
    const base = scoreBan(Aatrox, banCtx(), true)
      .breakdown?.find((c) => c.label === "Bans enemy comfort pick")?.value;
    const weighted = scoreBan(Aatrox, banCtx("counter-picker"), true)
      .breakdown?.find((c) => c.label === "Bans enemy comfort pick")?.value;
    expect(base).toBe(2.5); // phase-1 base 5 × B-tier skill weight 0.5
    expect(weighted).toBeCloseTo(base! * 1.5, 10); // ×1.5 targetBan weight
  });

  it("balanced leaves ban components untouched", () => {
    const a = scoreBan(Aatrox, banCtx(), true);
    const b = scoreBan(Aatrox, banCtx("balanced"), true);
    expect(b.total).toBe(a.total);
    expect(b.breakdown).toEqual(a.breakdown);
  });
});

// ─── (c) Sampling overrides ─────────────────────────────────────────────────

describe("sampling overrides", () => {
  const series = makeSeries(
    rosterWithTopPool([Illaoi.id]),
    rosterWithTopPool([Aatrox.id]),
  );

  function decisionsAcrossSeeds(personalityId: string | undefined, n = 40) {
    const out: (number | null)[] = [];
    for (let seed = 1; seed <= n; seed++) {
      out.push(
        chooseAIAction(
          gameAt(6), POOL, new Set(), series, createRng(seed),
          personalityId ? getPersonality(personalityId) : undefined,
        ),
      );
    }
    return out;
  }

  it("cheese's high temperature / wide top-N changes decisions vs balanced", () => {
    const balanced = decisionsAcrossSeeds("balanced");
    const cheese = decisionsAcrossSeeds("cheese");
    let diffs = 0;
    for (let i = 0; i < balanced.length; i++) {
      if (balanced[i] !== cheese[i]) diffs++;
    }
    expect(diffs).toBeGreaterThan(0);
  });

  it("cheese explores a wider champion set than the low-temperature meta-slave", () => {
    const metaSlave = new Set(decisionsAcrossSeeds("meta-slave"));
    const cheese = new Set(decisionsAcrossSeeds("cheese"));
    expect(cheese.size).toBeGreaterThan(metaSlave.size);
  });
});
