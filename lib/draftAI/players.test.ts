import { describe, it, expect } from "vitest";
import type {
  AIDifficulty,
  Champion,
  Lane,
  PlayerTier,
  Roster,
} from "../types";
import { LANE_ORDER } from "../players";
import { createGame } from "../draftEngine";
import { archetypeCounts } from "./helpers";
import { scoreBan, scorePick, type BanContext, type PickContext } from "./scoring";
import type { SeriesAIContext } from "./index";

// Aatrox is a real CHAMPION_META top-laner, so metaFor/getMetaTier resolve and
// bestLaneTierValue returns a top-lane fit. Id 1 is what the roster pools key on.
const Aatrox: Champion = {
  id: 1,
  name: "Aatrox",
  alias: "Aatrox",
  roles: ["Fighter"],
  iconUrl: "",
  lanes: ["top"],
};
const byId = new Map<number, Champion>([[Aatrox.id, Aatrox]]);
const zeroArch = archetypeCounts([], byId);

function rosterWithTopPool(good: number[], bad: number[]): Roster {
  return LANE_ORDER.map((lane) => ({
    lane,
    tier: "B" as const,
    goodChamps: lane === "top" ? good : [],
    badChamps: lane === "top" ? bad : [],
  }));
}

function makeSeries(
  myPlayers: Roster | undefined,
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
  };
}

function makeCtx(series: SeriesAIContext): PickContext {
  return {
    side: "blue",
    byId,
    champions: [Aatrox],
    myPicks: [],
    oppPicks: [],
    open: new Set<Lane>(["top"]),
    myCounts: zeroArch,
    oppCounts: zeroArch,
    myDmg: { ap: 0, ad: 0 },
    myPicksLocked: 0,
    oppLaneAssignment: [null, null, null, null, null],
    identity: null,
    enemyBannedArchetypes: zeroArch,
    series,
    fearlessLocked: new Set(),
    game: createGame(1, "Blue", "Red"),
    myDamageDealers: 0,
    myPhase: { early: 0, mid: 0, midLate: 0, late: 0 },
    oppPhase: { early: 0, mid: 0, midLate: 0, late: 0 },
  };
}

function comfortComponent(myPlayers: Roster | undefined, difficulty?: AIDifficulty) {
  const ctx = makeCtx(makeSeries(myPlayers, difficulty));
  const score = scorePick(Aatrox, ctx, true);
  return score.breakdown?.find((c) => /comfort|off-pool/i.test(c.label));
}

describe("scorePick — player comfort", () => {
  it("adds a positive nudge for a liked champion in the lane's pool", () => {
    const comp = comfortComponent(rosterWithTopPool([Aatrox.id], []));
    expect(comp?.value).toBe(4);
  });

  it("adds a negative nudge for a disliked champion", () => {
    const comp = comfortComponent(rosterWithTopPool([], [Aatrox.id]));
    expect(comp?.value).toBe(-4);
  });

  it("adds nothing for a champion outside the player's pools", () => {
    expect(comfortComponent(rosterWithTopPool([99], [98]))).toBeUndefined();
  });

  it("is ignored on Easy difficulty", () => {
    expect(comfortComponent(rosterWithTopPool([Aatrox.id], []), "easy")).toBeUndefined();
  });

  it("adds nothing when the series has no roster", () => {
    expect(comfortComponent(undefined)).toBeUndefined();
  });

  it("never outweighs the meta-tier lane fit (comfort only tiebreaks)", () => {
    // Aatrox top is a high meta tier; the comfort term (+4) must be much
    // smaller than the Lane fit term, so it can't flip a clearly-better pick.
    const ctx = makeCtx(makeSeries(rosterWithTopPool([Aatrox.id], [])));
    const score = scorePick(Aatrox, ctx, true);
    const laneFit = score.breakdown?.find((c) => /Lane fit/.test(c.label));
    expect(laneFit).toBeDefined();
    expect(Math.abs(laneFit!.value)).toBeGreaterThan(4);
  });
});

// ─── Enemy roster awareness (bans + denial) ─────────────────────────────────

function rosterTopPlayer(
  good: number[],
  bad: number[],
  tier: PlayerTier = "S",
): Roster {
  return LANE_ORDER.map((lane) => ({
    lane,
    tier: lane === "top" ? tier : "B",
    goodChamps: lane === "top" ? good : [],
    badChamps: lane === "top" ? bad : [],
  }));
}

function makeSeriesWithOpp(
  oppPlayers: Roster | undefined,
  difficulty: AIDifficulty = "normal",
): SeriesAIContext {
  return { ...makeSeries(undefined, difficulty), oppPlayers };
}

function makeBanCtx(series: SeriesAIContext): BanContext {
  return {
    byId,
    myCounts: zeroArch,
    oppPicks: [],
    isPhase2: false,
    enemyAnticipated: new Set(),
    series,
  };
}

function banComponent(
  series: SeriesAIContext,
  re: RegExp,
): number | undefined {
  const score = scoreBan(Aatrox, makeBanCtx(series), true);
  return score.breakdown?.find((c) => re.test(c.label))?.value;
}

describe("scoreBan — enemy roster awareness", () => {
  it("target-bans an enemy S-tier main's comfort pick (full weight)", () => {
    const v = banComponent(
      makeSeriesWithOpp(rosterTopPlayer([Aatrox.id], [], "S")),
      /comfort pick/i,
    );
    expect(v).toBe(5); // base 5 (phase 1) × skill 1.0
  });

  it("weights the comfort ban by the enemy player's tier", () => {
    const sMain = banComponent(
      makeSeriesWithOpp(rosterTopPlayer([Aatrox.id], [], "S")),
      /comfort pick/i,
    );
    const bMain = banComponent(
      makeSeriesWithOpp(rosterTopPlayer([Aatrox.id], [], "B")),
      /comfort pick/i,
    );
    expect(sMain!).toBeGreaterThan(bMain!); // S main worth more than B main
  });

  it("discourages banning a champion the enemy is weak on", () => {
    const v = banComponent(
      makeSeriesWithOpp(rosterTopPlayer([], [Aatrox.id], "S")),
      /weak on it/i,
    );
    expect(v).toBeLessThan(0);
  });

  it("ignores the enemy roster on Easy difficulty", () => {
    expect(
      banComponent(
        makeSeriesWithOpp(rosterTopPlayer([Aatrox.id], [], "S"), "easy"),
        /comfort pick|weak on it/i,
      ),
    ).toBeUndefined();
  });
});

describe("scorePick — deny enemy main", () => {
  it("adds a denial bonus for taking an enemy main's signature champ", () => {
    const ctx = makeCtx(makeSeriesWithOpp(rosterTopPlayer([Aatrox.id], [], "S")));
    const score = scorePick(Aatrox, ctx, true);
    const deny = score.breakdown?.find((c) => /Denies enemy main/.test(c.label));
    expect(deny?.value).toBe(4); // 4 × skill 1.0
  });

  it("scales the denial by enemy player tier", () => {
    const aCtx = makeCtx(
      makeSeriesWithOpp(rosterTopPlayer([Aatrox.id], [], "A")),
    );
    const deny = scorePick(Aatrox, aCtx, true).breakdown?.find((c) =>
      /Denies enemy main/.test(c.label),
    );
    expect(deny?.value).toBe(3); // 4 × 0.75
  });

  it("does not fire on Easy difficulty", () => {
    const ctx = makeCtx(
      makeSeriesWithOpp(rosterTopPlayer([Aatrox.id], [], "S"), "easy"),
    );
    const deny = scorePick(Aatrox, ctx, true).breakdown?.find((c) =>
      /Denies enemy main/.test(c.label),
    );
    expect(deny).toBeUndefined();
  });
});
