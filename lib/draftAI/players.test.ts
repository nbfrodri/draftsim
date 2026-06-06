import { describe, it, expect } from "vitest";
import type { AIDifficulty, Champion, Lane, Roster } from "../types";
import { LANE_ORDER } from "../players";
import { createGame } from "../draftEngine";
import { archetypeCounts } from "./helpers";
import { scorePick, type PickContext } from "./scoring";
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
