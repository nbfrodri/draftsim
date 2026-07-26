import { describe, it, expect } from "vitest";
import type { Champion, Lane, Player } from "../types";
import {
  ACADEMY_PASS_GAP,
  ACADEMY_OPEN_REPLACE_GAP,
  FA_OPEN_REPLACE_GAP,
  NEUTRAL_META,
  ROOKIE_VALUE_FLOOR,
  ACADEMY_MAX_PER_TEAM,
  INITIAL_ACADEMY_ROOKIES_PER_TEAM,
  TARGET_FA_POOL,
  FA_OVERFLOW_KEEP_GRADUATES,
  FA_OVERFLOW_ACCEL_ABOVE,
  ACADEMY_YEARS_MIN,
  ACADEMY_YEARS_MAX,
  ACADEMY_GRADUATE_CAP_PER_YEAR,
  USER_ACADEMY_ROOKIE_SOFT_MAX,
  MAX_AI_ACADEMY_ROOKIE_PER_TEAM,
  AI_ACADEMY_RELEASE_MIN_COUNT,
  AI_ACADEMY_PROMOTE_CHANCE,
  AI_ACADEMY_STASH_MIN_VALUE,
  AI_ACADEMY_STASH_CHANCE_MID_SPLIT,
  AI_OPEN_FA_CHANCE_MID_SPLIT,
  ACADEMY_DEV_CHANCE,
  addToTeamAcademy,
  academyReleaseScore,
  academyTenureYears,
  applyAcademyGraduateCap,
  applyFaGraduatePressure,
  cullWeakFaWhenOversized,
  buildAcademyBoard,
  countTeamAcademy,
  countAcademyRookiesMintedInYear,
  executeAddAcademyRookie,
  executeUserFaSign,
  executeUserFaToAcademy,
  executeUserAcademyRelease,
  executeUserAcademyRecall,
  inactiveTransferValue,
  listFreeAgents,
  listTeamAcademy,
  pickScoredReturnee,
  resolveCompetitiveFills,
  runAiAcademyReleasePass,
  runAiAcademyStashPass,
  runOpenFaReplacePass,
  runOpenAcademyReplacePass,
  tickInactiveYear,
  type MarketInactive,
} from "./faMarket";
import {
  ACADEMY_YEARS,
  FREE_AGENT_YEARS,
  TOTAL_INACTIVE_BEFORE_RETIRE,
  advanceInactivePool,
  makeRookie,
  runAiAcademyRookiePass,
  runOffseasonLifecycle,
  type SeasonPlayerOutcome,
} from "./playerLifecycle";
import { PLAYER_TIER_VALUE } from "../players";

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
const byId = new Map(champions.map((c) => [c.id, c]));

const player = (over: Partial<Player>): Player =>
  ({ lane: "middle", tier: "B", goodChamps: [], badChamps: [], ...over });

const demoteRoster = (midId: string, midName: string): Player[] =>
  LANES.map((lane) =>
    lane === "middle"
      ? player({
          lane,
          tier: "D",
          age: 28,
          id: midId,
          name: midName,
          badStreak: 4,
        })
      : player({ lane, id: `ok-${midId}-${lane}`, name: `ok-${midName}-${lane}`, age: 24, badStreak: 0 }),
  );

const outcomesFor = (roster: Player[]) =>
  new Map<string, SeasonPlayerOutcome>(
    roster.map((p) => [
      p.id!,
      {
        playerId: p.id!,
        grade: 3.0,
        tier: p.tier,
        lane: p.lane,
        splitTitles: 0,
        intlTitles: 0,
      },
    ]),
  );

describe("year counting preserved (1-based)", () => {
  it("keeps academy 1→2→3 then FA 1→4 then retire", () => {
    expect(ACADEMY_YEARS).toBe(3);
    expect(FREE_AGENT_YEARS).toBe(4);
    expect(TOTAL_INACTIVE_BEFORE_RETIRE).toBe(7);
    let pool: MarketInactive[] = [
      {
        player: player({ id: "p1", name: "P1", age: 22, tier: "C" }),
        status: "academy",
        inactiveYears: 1,
        demotedYear: 1,
        lastTeamId: "T1",
        lastActiveGrade: 4,
        shadowGrade: 4,
      },
    ];
    pool = advanceInactivePool(pool, rng(1), champions);
    expect(pool[0]!.status).toBe("academy");
    expect(pool[0]!.inactiveYears).toBe(2);
    pool = advanceInactivePool(pool, rng(2), champions);
    expect(pool[0]!.status).toBe("academy");
    expect(pool[0]!.inactiveYears).toBe(3);
    pool = advanceInactivePool(pool, rng(3), champions);
    expect(pool[0]!.status).toBe("free-agent");
    expect(pool[0]!.inactiveYears).toBe(4);
  });
});

describe("transferValue preference + academy pass", () => {
  it("scores higher-tier FA above weak academy", () => {
    const acy: MarketInactive = {
      player: player({ id: "acy", name: "Acy", tier: "C", age: 22 }),
      status: "academy",
      inactiveYears: 1,
      demotedYear: 1,
      lastTeamId: "T0",
      lastActiveGrade: 4,
      shadowGrade: 4,
    };
    const fa: MarketInactive = {
      player: player({ id: "fa", name: "Fa", tier: "A", age: 24 }),
      status: "free-agent",
      inactiveYears: 3,
      demotedYear: 1,
      lastTeamId: "TX",
      lastActiveGrade: 7,
      shadowGrade: 6.5,
    };
    const acyV = inactiveTransferValue(acy, byId, NEUTRAL_META);
    const faV = inactiveTransferValue(fa, byId, NEUTRAL_META);
    expect(faV - acyV).toBeGreaterThanOrEqual(ACADEMY_PASS_GAP);
    const pick = pickScoredReturnee([acy, fa], "middle", "T0", byId, NEUTRAL_META, rng(3));
    expect(pick?.entry.player.id).toBe("fa");
    expect(pick?.passedAcademyName).toBe("Acy");
  });

  it("keeps same-org academy when FA does not clear the gap", () => {
    const acy: MarketInactive = {
      player: player({ id: "acy", name: "Acy", tier: "B", age: 22 }),
      status: "academy",
      inactiveYears: 1,
      demotedYear: 1,
      lastTeamId: "T0",
      lastActiveGrade: 6,
      shadowGrade: 6,
    };
    const fa: MarketInactive = {
      player: player({ id: "fa", name: "Fa", tier: "B", age: 24 }),
      status: "free-agent",
      inactiveYears: 3,
      demotedYear: 1,
      lastTeamId: "TX",
      lastActiveGrade: 5.5,
      shadowGrade: 5.5,
    };
    const pick = pickScoredReturnee([acy, fa], "middle", "T0", byId, NEUTRAL_META, rng(5));
    expect(pick?.entry.player.id).toBe("acy");
  });
});

describe("league-wide FA contention", () => {
  it("assigns one FA to at most one team", () => {
    const fa: MarketInactive = {
      player: player({ id: "hot-fa", name: "HotFa", tier: "A", age: 24, goodChamps: [20, 21, 22] }),
      status: "free-agent",
      inactiveYears: 3,
      demotedYear: 1,
      lastTeamId: "TX",
      lastActiveGrade: 7.5,
      shadowGrade: 7,
    };
    const rosterA = demoteRoster("bad-a", "BadA");
    const rosterB = demoteRoster("bad-b", "BadB");
    const result = runOffseasonLifecycle(
      [
        { id: "T0", name: "T0", players: rosterA, leagueId: "LCK" },
        { id: "T1", name: "T1", players: rosterB, leagueId: "LCK" },
      ],
      new Map([...outcomesFor(rosterA), ...outcomesFor(rosterB)]),
      { middle: 6.5, top: 6, jungle: 6, bottom: 6, support: 6 },
      [fa],
      champions,
      rng(11),
      new Set(),
      5,
      undefined,
      NEUTRAL_META,
    );
    const signed = result.teams.filter((t) =>
      t.players.some((p) => p.id === "hot-fa"),
    );
    expect(signed).toHaveLength(1);
    expect(result.inactivePool.some((p) => p.player.id === "hot-fa")).toBe(false);
  });
});

describe("academy pass in offseason lifecycle", () => {
  it("takes clearly better FA and leaves academy in pool", () => {
    const roster = demoteRoster("bad-mid", "BadMid");
    const sameAcy: MarketInactive = {
      player: player({ id: "same-acy", name: "SameAcy", tier: "C", age: 23 }),
      status: "academy",
      inactiveYears: 1,
      demotedYear: 2,
      lastTeamId: "T0",
      lastActiveGrade: 4,
      shadowGrade: 4,
    };
    const betterFa: MarketInactive = {
      player: player({ id: "better-fa", name: "BetterFa", tier: "A", age: 24 }),
      status: "free-agent",
      inactiveYears: 3,
      demotedYear: 1,
      lastTeamId: "TX",
      lastActiveGrade: 7,
      shadowGrade: 7,
    };
    const result = runOffseasonLifecycle(
      [{ id: "T0", name: "T0", players: roster, leagueId: "LCK" }],
      outcomesFor(roster),
      { middle: 6.5, top: 6, jungle: 6, bottom: 6, support: 6 },
      [betterFa, sameAcy],
      champions,
      rng(13),
      new Set(),
      5,
      undefined,
      NEUTRAL_META,
    );
    expect(result.teams[0]!.players.find((p) => p.lane === "middle")?.id).toBe("better-fa");
    expect(result.news.find((n) => n.lane === "middle")?.passedAcademyName).toBe("SameAcy");
    expect(result.inactivePool.some((p) => p.player.id === "same-acy" && p.status === "academy")).toBe(
      true,
    );
    // Demoted BadMid must park in academy — never FA on leave-roster day.
    const demoted = result.inactivePool.find((p) => p.player.id === "bad-mid");
    expect(demoted?.status).toBe("academy");
    expect(demoted?.inactiveYears).toBe(1);
  });
});

describe("open FA / user FA cut → academy", () => {
  it("parks the outgoing incumbent in academy when open FA replaces them", () => {
    const incumbent = player({
      id: "weak-mid",
      name: "WeakMid",
      lane: "middle",
      tier: "D",
      age: 27,
    });
    const fa: MarketInactive = {
      player: player({ id: "star-fa", name: "StarFa", lane: "middle", tier: "S", age: 24 }),
      status: "free-agent",
      inactiveYears: 3,
      demotedYear: 1,
      lastTeamId: "TX",
      lastActiveGrade: 8,
      shadowGrade: 8,
    };
    const roster = LANES.map((lane) =>
      lane === "middle"
        ? incumbent
        : player({ lane, id: `ok-${lane}`, name: `ok-${lane}`, tier: "A", age: 24 }),
    );
    const opened = runOpenFaReplacePass(
      [{ id: "T0", name: "T0", leagueId: "LCK", players: roster }],
      [fa],
      byId,
      NEUTRAL_META,
      new Map([["weak-mid", { grade: 3.0 }]]),
      rng(7),
      4,
    );
    expect(opened.teams[0]!.players.find((p) => p.lane === "middle")?.id).toBe("star-fa");
    const cut = opened.inactivePool.find((p) => p.player.id === "weak-mid");
    expect(cut?.status).toBe("academy");
    expect(cut?.inactiveYears).toBe(1);
    expect(cut?.lastTeamId).toBe("T0");
  });

  it("parks the outgoing incumbent in academy on user FA sign", () => {
    const incumbent = player({
      id: "inc",
      name: "Inc",
      lane: "middle",
      tier: "C",
      age: 26,
    });
    const fa: MarketInactive = {
      player: player({ id: "fa1", name: "Fa1", lane: "middle", tier: "S", age: 23 }),
      status: "free-agent",
      inactiveYears: 3,
      demotedYear: 1,
      lastTeamId: "TX",
      lastActiveGrade: 8,
      shadowGrade: 8,
    };
    const roster = LANES.map((lane) =>
      lane === "middle"
        ? incumbent
        : player({ lane, id: `ok-${lane}`, name: `ok-${lane}`, tier: "B", age: 24 }),
    );
    const result = executeUserFaSign(
      [{ id: "T0", name: "T0", leagueId: "LCK", players: roster }],
      [fa],
      "T0",
      "middle",
      "fa1",
      byId,
      NEUTRAL_META,
      3,
      () => 3.5,
      { requireGap: false },
    );
    expect(result.ok).toBe(true);
    const cut = result.inactivePool.find((p) => p.player.id === "inc");
    expect(cut?.status).toBe("academy");
    expect(cut?.inactiveYears).toBe(1);
  });
});

describe("academy development track", () => {
  it("can raise tier or potential while in academy (slower than active CHANGE_RATE)", () => {
    let bumps = 0;
    for (let i = 0; i < 80; i++) {
      const entry: MarketInactive = {
        player: player({
          id: `kid-${i}`,
          name: `Kid${i}`,
          tier: "C",
          potential: "A",
          age: 19,
        }),
        status: "academy",
        inactiveYears: 1,
        demotedYear: 1,
        lastTeamId: "T0",
        lastActiveGrade: 5,
        shadowGrade: 5.5,
      };
      const tick = tickInactiveYear(entry, champions, rng(1000 + i));
      if (
        PLAYER_TIER_VALUE[tick.player.tier] > PLAYER_TIER_VALUE.C ||
        PLAYER_TIER_VALUE[tick.player.potential ?? "C"] > PLAYER_TIER_VALUE.A ||
        tick.developed
      ) {
        bumps++;
      }
    }
    // ACADEMY_DEV_CHANCE ~0.45 → expect meaningful development, not near-every-year.
    expect(ACADEMY_DEV_CHANCE).toBeGreaterThan(0.36);
    expect(ACADEMY_DEV_CHANCE).toBeLessThan(0.6);
    expect(bumps).toBeGreaterThan(15);
    expect(bumps).toBeLessThan(55);
  });
});

describe("mid-split FA→academy stash", () => {
  it("keeps stash bar below elite-only and mid-split chance light", () => {
    expect(AI_ACADEMY_STASH_MIN_VALUE).toBeLessThan(1.0);
    expect(AI_ACADEMY_STASH_CHANCE_MID_SPLIT).toBeLessThan(0.7);
    expect(AI_OPEN_FA_CHANCE_MID_SPLIT).toBeLessThan(0.25);
    expect(AI_OPEN_FA_CHANCE_MID_SPLIT).toBeGreaterThan(0);
  });

  it("stashes a solid FA into academy when mid-split chance fires", () => {
    // Enough FAs so thin-floor doesn't bail; one clear stash candidate.
    const fas: MarketInactive[] = Array.from({ length: TARGET_FA_POOL.min }, (_, i) => ({
      player: player({
        id: `fa-${i}`,
        name: `Fa${i}`,
        lane: i === 0 ? "middle" : "top",
        tier: i === 0 ? "A" : "C",
        age: 22,
      }),
      status: "free-agent" as const,
      inactiveYears: ACADEMY_YEARS + 1,
      demotedYear: 1,
      lastTeamId: "OLD",
      lastActiveGrade: 6,
      shadowGrade: 6,
    }));
    const roster = LANES.map((lane) =>
      player({
        lane,
        id: `r-${lane}`,
        name: `r-${lane}`,
        // Strong mid so FA does not clear FA_OPEN_REPLACE_GAP (stash path).
        tier: lane === "middle" ? "S" : "B",
        age: 24,
      }),
    );
    // rng → 0 always clears mid-split stash chance.
    const res = runAiAcademyStashPass(
      [{ id: "T0", name: "T0", leagueId: "LCK", players: roster }],
      fas,
      byId,
      NEUTRAL_META,
      () => 0,
      3,
      { midSplit: true },
    );
    expect(res.news.some((n) => n.marketNote === "academy-stash")).toBe(true);
    expect(res.inactivePool.some((e) => e.status === "academy" && e.player.id === "fa-0")).toBe(
      true,
    );
    expect(res.inactivePool.some((e) => e.status === "free-agent" && e.player.id === "fa-0")).toBe(
      false,
    );
  });

  it("light mid-split open-FA can replace when chance fires and gap clears", () => {
    const weak = player({
      id: "weak-mid",
      name: "WeakMid",
      lane: "middle",
      tier: "D",
      age: 28,
    });
    const roster = LANES.map((lane) =>
      lane === "middle"
        ? weak
        : player({ lane, id: `ok-${lane}`, name: `ok-${lane}`, tier: "B", age: 24 }),
    );
    const fa: MarketInactive = {
      player: player({ id: "star-fa", name: "StarFa", lane: "middle", tier: "S", age: 23 }),
      status: "free-agent",
      inactiveYears: ACADEMY_YEARS + 1,
      demotedYear: 1,
      lastTeamId: "OLD",
      lastActiveGrade: 8,
      shadowGrade: 8,
    };
    const outcomes = new Map([["weak-mid", { grade: 3.0 }]]);
    const opened = runOpenFaReplacePass(
      [{ id: "T0", name: "T0", leagueId: "LCK", players: roster }],
      [fa],
      byId,
      NEUTRAL_META,
      outcomes,
      () => 0,
      4,
      { attemptChance: AI_OPEN_FA_CHANCE_MID_SPLIT },
    );
    expect(opened.teams[0]!.players.find((p) => p.lane === "middle")?.id).toBe("star-fa");
    expect(opened.news.some((n) => n.marketNote === "open-fa")).toBe(true);
  });

  it("mid-split open-FA attemptChance can skip an otherwise clear upgrade", () => {
    const weak = player({
      id: "weak-mid",
      name: "WeakMid",
      lane: "middle",
      tier: "D",
      age: 28,
    });
    const roster = LANES.map((lane) =>
      lane === "middle"
        ? weak
        : player({ lane, id: `ok-${lane}`, name: `ok-${lane}`, tier: "B", age: 24 }),
    );
    const fa: MarketInactive = {
      player: player({ id: "star-fa", name: "StarFa", lane: "middle", tier: "S", age: 23 }),
      status: "free-agent",
      inactiveYears: ACADEMY_YEARS + 1,
      demotedYear: 1,
      lastTeamId: "OLD",
      lastActiveGrade: 8,
      shadowGrade: 8,
    };
    const outcomes = new Map([["weak-mid", { grade: 3.0 }]]);
    // rng → 0.99 fails attemptChance 0.14
    const opened = runOpenFaReplacePass(
      [{ id: "T0", name: "T0", leagueId: "LCK", players: roster }],
      [fa],
      byId,
      NEUTRAL_META,
      outcomes,
      () => 0.99,
      4,
      { attemptChance: AI_OPEN_FA_CHANCE_MID_SPLIT },
    );
    expect(opened.teams[0]!.players.find((p) => p.lane === "middle")?.id).toBe("weak-mid");
    expect(opened.news.some((n) => n.marketNote === "open-fa")).toBe(false);
  });
});

describe("academy open-replace gap (looser than FA)", () => {
  it("exposes a lower call-up bar than FA signs", () => {
    expect(ACADEMY_OPEN_REPLACE_GAP).toBeLessThan(FA_OPEN_REPLACE_GAP);
    expect(ACADEMY_OPEN_REPLACE_GAP).toBeGreaterThan(0);
    expect(ACADEMY_PASS_GAP).toBeGreaterThan(FA_OPEN_REPLACE_GAP);
    expect(AI_ACADEMY_PROMOTE_CHANCE).toBeGreaterThan(0.5);
    expect(ROOKIE_VALUE_FLOOR).toBeLessThan(-0.35);
  });

  it("user academy recall succeeds with a modest upgrade over incumbent", () => {
    const incumbent = player({
      id: "inc-weak",
      name: "IncWeak",
      lane: "middle",
      tier: "D",
      age: 27,
    });
    const acy: MarketInactive = {
      player: player({ id: "acy-ok", name: "AcyOk", lane: "middle", tier: "C", age: 20 }),
      status: "academy",
      inactiveYears: 2,
      demotedYear: 1,
      lastTeamId: "T0",
      lastActiveGrade: 5,
      shadowGrade: 5.2,
    };
    const roster = LANES.map((lane) =>
      lane === "middle"
        ? incumbent
        : player({ lane, id: `ok-${lane}`, name: `ok-${lane}`, tier: "B", age: 24 }),
    );
    const result = executeUserAcademyRecall(
      [{ id: "T0", name: "T0", leagueId: "LCK", players: roster }],
      [acy],
      "T0",
      "middle",
      "acy-ok",
      byId,
      NEUTRAL_META,
      3,
      () => 3.0,
    );
    expect(result.ok).toBe(true);
    expect(result.teams[0]!.players.find((p) => p.lane === "middle")?.id).toBe("acy-ok");
  });

  it("AI academy promote pass swaps a clear upgrade when chance fires", () => {
    const weak = player({
      id: "weak-mid",
      name: "WeakMid",
      lane: "middle",
      tier: "D",
      age: 28,
    });
    const roster = LANES.map((lane) =>
      lane === "middle"
        ? weak
        : player({ lane, id: `ok-${lane}`, name: `ok-${lane}`, tier: "B", age: 24 }),
    );
    const acy: MarketInactive = {
      player: player({ id: "hot-acy", name: "HotAcy", lane: "middle", tier: "A", age: 21 }),
      status: "academy",
      inactiveYears: 2,
      demotedYear: 1,
      lastTeamId: "T0",
      lastActiveGrade: 7,
      shadowGrade: 7,
    };
    const outcomes = new Map([["weak-mid", { grade: 3.0 }]]);
    // rng always < chance → promote attempts fire.
    const always = () => 0.01;
    const opened = runOpenAcademyReplacePass(
      [{ id: "T0", name: "T0", leagueId: "LCK", players: roster }],
      [acy],
      byId,
      NEUTRAL_META,
      outcomes,
      always,
      4,
    );
    expect(opened.teams[0]!.players.find((p) => p.lane === "middle")?.id).toBe("hot-acy");
    expect(opened.news.some((n) => n.marketNote === "academy-recall")).toBe(true);
    const cut = opened.inactivePool.find((p) => p.player.id === "weak-mid");
    expect(cut?.status).toBe("academy");
  });
});

describe("competitive fills leave weak returnees for rookies", () => {
  it("uses rookie when only candidates are below floor", () => {
    const weak: MarketInactive = {
      player: player({ id: "weak-fa", name: "WeakFa", tier: "D", age: 30 }),
      status: "free-agent",
      inactiveYears: 5,
      demotedYear: 1,
      lastTeamId: "TX",
      lastActiveGrade: 2.5,
      shadowGrade: 2.5,
    };
    expect(inactiveTransferValue(weak, byId, NEUTRAL_META)).toBeLessThan(ROOKIE_VALUE_FLOOR);
    const { fills } = resolveCompetitiveFills(
      [
        {
          teamId: "T0",
          teamName: "T0",
          lane: "middle",
          slotIndex: 2,
        },
      ],
      [weak],
      byId,
      NEUTRAL_META,
      rng(2),
    );
    // Academy-first: below-floor FA leaves the vacancy open (no Pass-3 rookie).
    expect(fills).toHaveLength(0);
    expect(FA_OPEN_REPLACE_GAP).toBeGreaterThan(0);
  });
});

describe("same-pass demotees excluded from fills", () => {
  it("pickScoredReturnee skips excluded academy ids", () => {
    const justDemoted: MarketInactive = {
      player: player({ id: "just-cut", name: "JustCut", tier: "A", age: 24 }),
      status: "academy",
      inactiveYears: 1,
      demotedYear: 5,
      lastTeamId: "T0",
      lastActiveGrade: 7,
      shadowGrade: 7,
    };
    // Without exclude, same-org A-tier academy would be recalled.
    const without = pickScoredReturnee(
      [justDemoted],
      "middle",
      "T0",
      byId,
      NEUTRAL_META,
      rng(1),
    );
    expect(without?.entry.player.id).toBe("just-cut");

    const withExclude = pickScoredReturnee(
      [justDemoted],
      "middle",
      "T0",
      byId,
      NEUTRAL_META,
      rng(1),
      new Set(["just-cut"]),
    );
    expect(withExclude).toBeNull();
  });

  it("resolveCompetitiveFills never assigns excluded demotees", () => {
    const justDemoted: MarketInactive = {
      player: player({ id: "just-cut", name: "JustCut", tier: "A", age: 24 }),
      status: "academy",
      inactiveYears: 1,
      demotedYear: 5,
      lastTeamId: "T0",
      lastActiveGrade: 7,
      shadowGrade: 7,
    };
    const { fills, remainingPool } = resolveCompetitiveFills(
      [{ teamId: "T0", teamName: "T0", lane: "middle", slotIndex: 2 }],
      [justDemoted],
      byId,
      NEUTRAL_META,
      rng(4),
      new Set(["just-cut"]),
    );
    // Excluded demotee stays in pool; vacancy left open (academy-first, no Pass-3 rookie).
    expect(fills).toHaveLength(0);
    expect(remainingPool.some((p) => p.player.id === "just-cut")).toBe(true);
  });
});

describe("academy cap 5 + FA↔academy + release", () => {
  const mkAcy = (id: string, years: number, demotedYear: number): MarketInactive => ({
    player: player({ id, name: id, lane: "middle", tier: "C" }),
    status: "academy",
    inactiveYears: years,
    demotedYear,
    lastTeamId: "T0",
    lastTeamName: "T0",
  });

  it("bumps oldest academy to FA · 1y when parking past the cap", () => {
    const full = [1, 2, 3, 4, 5].map((i) => mkAcy(`a${i}`, i === 5 ? 2 : 1, 10 - i));
    // a5 has inactiveYears 2 and earliest demotedYear among ties → oldest tenure
    const oldest = full.find((e) => e.player.id === "a5")!;
    expect(countTeamAcademy(full, "T0")).toBe(5);
    const { pool, bumped } = addToTeamAcademy(full, {
      player: player({ id: "newbie", name: "newbie", lane: "top", tier: "B" }),
      status: "academy",
      inactiveYears: 1,
      demotedYear: 20,
      lastTeamId: "T0",
      lastTeamName: "T0",
    });
    expect(bumped?.player.id).toBe(oldest.player.id);
    expect(bumped?.status).toBe("free-agent");
    expect(bumped?.inactiveYears).toBe(ACADEMY_YEARS + 1);
    expect(countTeamAcademy(pool, "T0")).toBe(5);
    expect(pool.some((e) => e.player.id === "newbie" && e.status === "academy")).toBe(true);
    expect(pool.some((e) => e.player.id === "a5" && e.status === "free-agent")).toBe(true);
  });

  it("signs FA to academy when there is room; blocks when full", () => {
    const fa: MarketInactive = {
      player: player({ id: "fa1", name: "fa1", lane: "jungle", tier: "A" }),
      status: "free-agent",
      inactiveYears: 3,
      demotedYear: 1,
      lastTeamId: "TX",
    };
    const ok = executeUserFaToAcademy([fa], "T0", "T0", "fa1", 5);
    expect(ok.ok).toBe(true);
    expect(ok.inactivePool.find((e) => e.player.id === "fa1")?.status).toBe("academy");
    expect(ok.inactivePool.find((e) => e.player.id === "fa1")?.inactiveYears).toBe(1);
    expect(ok.inactivePool.find((e) => e.player.id === "fa1")?.lastTeamId).toBe("T0");
    expect(ok.news[0]?.marketNote).toBe("fa-academy");

    const full = [1, 2, 3, 4, 5].map((i) => mkAcy(`b${i}`, 1, i));
    const blocked = executeUserFaToAcademy([...full, fa], "T0", "T0", "fa1", 5);
    expect(blocked.ok).toBe(false);
    expect(blocked.reason).toBe("academy-full");
  });

  it("releases academy to FA with FA · 1y clock and news", () => {
    const pool = [mkAcy("kid", 1, 3)];
    const res = executeUserAcademyRelease(pool, "T0", "kid");
    expect(res.ok).toBe(true);
    expect(res.inactivePool[0]?.status).toBe("free-agent");
    expect(res.inactivePool[0]?.inactiveYears).toBe(ACADEMY_YEARS + 1);
    expect(res.news[0]?.marketNote).toBe("academy-release");
  });

  it("documents a FA pool target band for academy stocking", () => {
    expect(TARGET_FA_POOL.min).toBeGreaterThanOrEqual(18);
    expect(TARGET_FA_POOL.max).toBeGreaterThan(TARGET_FA_POOL.min);
    expect(ACADEMY_MAX_PER_TEAM).toBe(5);
    expect(INITIAL_ACADEMY_ROOKIES_PER_TEAM).toBe(2);
    expect(INITIAL_ACADEMY_ROOKIES_PER_TEAM).toBeLessThanOrEqual(ACADEMY_MAX_PER_TEAM);
    expect(USER_ACADEMY_ROOKIE_SOFT_MAX).toBe(ACADEMY_MAX_PER_TEAM - 1);
    expect(MAX_AI_ACADEMY_ROOKIE_PER_TEAM).toBe(1);
    expect(AI_ACADEMY_RELEASE_MIN_COUNT).toBe(3);
    expect(FA_OVERFLOW_KEEP_GRADUATES).toBe(6);
    expect(FA_OVERFLOW_ACCEL_ABOVE).toBe(TARGET_FA_POOL.max + 8);
  });

  it("parks a generated rookie into academy when there is room", () => {
    const rook = makeRookie("jungle", champions, rng(9), new Set(), "LCK");
    const res = executeAddAcademyRookie([], "T0", "T0", rook, 4);
    expect(res.ok).toBe(true);
    expect(res.news[0]?.marketNote).toBe("academy-rookie");
    expect(res.inactivePool[0]?.status).toBe("academy");
    expect(res.inactivePool[0]?.player.id).toBe(rook.id);
    expect(res.inactivePool[0]?.inactiveYears).toBe(1);

    const full = [1, 2, 3, 4, 5].map((i) => mkAcy(`c${i}`, 1, i));
    const blocked = executeAddAcademyRookie(full, "T0", "T0", rook, 4);
    expect(blocked.ok).toBe(false);
    expect(blocked.reason).toBe("academy-full");
  });
});

describe("strategic AI academy release", () => {
  it("scores same-lane depth + cold shadow above a healthy solo prospect", () => {
    const weakMate: MarketInactive = {
      player: player({ id: "weak", name: "weak", lane: "middle", tier: "D", age: 29 }),
      status: "academy",
      inactiveYears: 1,
      demotedYear: 1,
      lastTeamId: "T0",
      lastActiveGrade: 3,
      shadowGrade: 3.5,
    };
    const strongMate: MarketInactive = {
      player: player({ id: "strong", name: "strong", lane: "middle", tier: "A", age: 19 }),
      status: "academy",
      inactiveYears: 1,
      demotedYear: 2,
      lastTeamId: "T0",
      lastActiveGrade: 7,
      shadowGrade: 7,
    };
    const soloKid: MarketInactive = {
      player: player({ id: "solo", name: "solo", lane: "top", tier: "B", age: 18 }),
      status: "academy",
      inactiveYears: 1,
      demotedYear: 2,
      lastTeamId: "T0",
      lastActiveGrade: 6,
      shadowGrade: 6.2,
    };
    const org = [weakMate, strongMate, soloKid];
    const weakScore = academyReleaseScore(weakMate, org, byId, NEUTRAL_META);
    const soloScore = academyReleaseScore(soloKid, org, byId, NEUTRAL_META);
    expect(weakScore).toBeGreaterThan(soloScore);
    expect(weakScore).toBeGreaterThanOrEqual(2);
  });

  it("releases a low-value academy player near the cap with became-FA news", () => {
    const pool: MarketInactive[] = [1, 2, 3, 4].map((i) => ({
      player: player({
        id: `a${i}`,
        name: `a${i}`,
        lane: i === 1 ? "middle" : "top",
        tier: i === 1 ? "D" : "B",
        age: i === 1 ? 30 : 20,
      }),
      status: "academy",
      inactiveYears: 1,
      demotedYear: i,
      lastTeamId: "T0",
      lastTeamName: "T0",
      lastActiveGrade: i === 1 ? 3 : 6,
      shadowGrade: i === 1 ? 3 : 6,
    }));
    // Force chance: rng that returns low values first for the chance check.
    let calls = 0;
    const forced = () => {
      calls++;
      // First call is the chance roll (need ≤ release chance) — return 0.
      if (calls === 1) return 0;
      return rng(42)();
    };
    const res = runAiAcademyReleasePass(
      [{ id: "T0", name: "T0" }],
      pool,
      byId,
      NEUTRAL_META,
      forced,
    );
    expect(res.news.some((n) => n.marketNote === "academy-release")).toBe(true);
    expect(res.inactivePool.some((e) => e.status === "free-agent")).toBe(true);
  });
  it("scores year-3 academy higher for release than a year-1 peer", () => {
    const y1: MarketInactive = {
      player: player({ id: "y1", name: "y1", lane: "top", tier: "C", age: 20 }),
      status: "academy",
      inactiveYears: 1,
      demotedYear: 5,
      lastTeamId: "T0",
      lastActiveGrade: 5,
      shadowGrade: 5,
    };
    const y3: MarketInactive = {
      player: player({ id: "y3", name: "y3", lane: "jungle", tier: "C", age: 20 }),
      status: "academy",
      inactiveYears: 3,
      demotedYear: 2,
      lastTeamId: "T0",
      lastActiveGrade: 5,
      shadowGrade: 5,
    };
    const org = [y1, y3];
    expect(academyReleaseScore(y3, org, byId, NEUTRAL_META)).toBeGreaterThan(
      academyReleaseScore(y1, org, byId, NEUTRAL_META),
    );
  });
});

describe("AI academy rookie intake", () => {
  it("mints an academy rookie when FA is thin and org has room", () => {
    const taken = new Set<string>();
    const res = runAiAcademyRookiePass(
      [{ id: "T0", name: "T0", leagueId: "LCK" }],
      [],
      champions,
      () => 0, // always pass chance + prefer early lanes
      taken,
      3,
    );
    expect(res.news.some((n) => n.marketNote === "academy-rookie")).toBe(true);
    expect(countTeamAcademy(res.inactivePool, "T0")).toBe(1);
    expect(res.inactivePool[0]?.status).toBe("academy");
  });

  it("caps AI academy rookies to one per team per year", () => {
    const taken = new Set<string>();
    const year = 5;
    const already: MarketInactive = {
      player: player({
        id: "seed-r",
        name: "seed-r",
        lane: "top",
        tier: "C",
        debutYear: year,
      }),
      status: "academy",
      inactiveYears: 1,
      demotedYear: year,
      lastTeamId: "T0",
      lastTeamName: "T0",
    };
    expect(countAcademyRookiesMintedInYear([already], "T0", year)).toBe(1);
    const res = runAiAcademyRookiePass(
      [{ id: "T0", name: "T0", leagueId: "LCK" }],
      [already],
      champions,
      () => 0,
      taken,
      year,
    );
    expect(res.news.some((n) => n.marketNote === "academy-rookie")).toBe(false);
    expect(countTeamAcademy(res.inactivePool, "T0")).toBe(1);
  });

  it("mid-split does not mint from FA-thin alone (depth only)", () => {
    const taken = new Set<string>();
    // Academy already at depth floor (2) — mid-split should not add for FA-thin.
    const pool: MarketInactive[] = [1, 2].map((i) => ({
      player: player({
        id: `d${i}`,
        name: `d${i}`,
        lane: "top",
        tier: "B",
        debutYear: 1,
      }),
      status: "academy" as const,
      inactiveYears: 2,
      demotedYear: 1,
      lastTeamId: "T0",
      lastTeamName: "T0",
    }));
    const res = runAiAcademyRookiePass(
      [{ id: "T0", name: "T0", leagueId: "LCK" }],
      pool,
      champions,
      () => 0,
      taken,
      4,
      { midSplit: true },
    );
    expect(res.news.some((n) => n.marketNote === "academy-rookie")).toBe(false);
  });
});

describe("FA pool pressure valves", () => {
  it("retires weak academy graduates when FA is already at TARGET_FA_POOL.max", () => {
    const beforeFa: MarketInactive[] = Array.from({ length: TARGET_FA_POOL.max }, (_, i) => ({
      player: player({ id: `fa${i}`, name: `fa${i}`, lane: "top", tier: "B" }),
      status: "free-agent" as const,
      inactiveYears: 4,
      demotedYear: 1,
      lastTeamId: "T0",
    }));
    const gradsBefore: MarketInactive[] = Array.from({ length: 10 }, (_, i) => ({
      player: player({
        id: `g${i}`,
        name: `g${i}`,
        lane: "jungle",
        tier: i < 6 ? "A" : "D",
      }),
      status: "academy" as const,
      inactiveYears: 3,
      demotedYear: 1,
      lastTeamId: "T1",
    }));
    const before = [...beforeFa, ...gradsBefore];
    const after = before.map((e) =>
      e.status === "academy"
        ? { ...e, status: "free-agent" as const, inactiveYears: 4 }
        : e,
    );
    const pressed = applyFaGraduatePressure(before, after);
    const fa = pressed.filter((e) => e.status === "free-agent");
    const retiredGrads = pressed.filter(
      (e) => e.status === "retired" && e.player.id?.startsWith("g"),
    );
    expect(retiredGrads.length).toBe(10 - FA_OVERFLOW_KEEP_GRADUATES);
    expect(fa.filter((e) => e.player.id?.startsWith("g")).length).toBe(
      FA_OVERFLOW_KEEP_GRADUATES,
    );
    // Kept graduates should be the higher-tier ones.
    expect(fa.filter((e) => e.player.id?.startsWith("g")).every((e) => e.player.tier === "A")).toBe(
      true,
    );
  });

  it("does not retire graduates when FA is below the high end", () => {
    const before: MarketInactive[] = [
      {
        player: player({ id: "g0", name: "g0", lane: "top", tier: "D" }),
        status: "academy",
        inactiveYears: 3,
        demotedYear: 1,
        lastTeamId: "T0",
      },
    ];
    const after: MarketInactive[] = [
      { ...before[0]!, status: "free-agent", inactiveYears: 4 },
    ];
    const pressed = applyFaGraduatePressure(before, after);
    expect(pressed[0]?.status).toBe("free-agent");
  });

  it("accelerates weak long-tenure FA when pool exceeds FA_OVERFLOW_ACCEL_ABOVE", () => {
    const pool: MarketInactive[] = Array.from(
      { length: FA_OVERFLOW_ACCEL_ABOVE + 5 },
      (_, i) => ({
        player: player({
          id: `w${i}`,
          name: `w${i}`,
          lane: "support",
          tier: i < 5 ? "D" : "B",
        }),
        status: "free-agent" as const,
        // ≥ ACADEMY_YEARS + 2 → eligible for accel cull
        inactiveYears: 5,
        demotedYear: 1,
        lastTeamId: "T0",
      }),
    );
    const culled = cullWeakFaWhenOversized(pool);
    const fa = culled.filter((e) => e.status === "free-agent");
    const retired = culled.filter((e) => e.status === "retired");
    expect(fa.length).toBe(TARGET_FA_POOL.max);
    expect(retired.length).toBe(pool.length - TARGET_FA_POOL.max);
  });
});

describe("variable academy tenure + graduate cap (anti-wave)", () => {
  it("assigns tenure 2 / 3 / 4 by value bands", () => {
    expect(ACADEMY_YEARS_MIN).toBe(2);
    expect(ACADEMY_YEARS).toBe(3);
    expect(ACADEMY_YEARS_MAX).toBe(4);
    const weak: MarketInactive = {
      player: player({ id: "w", tier: "D", potential: "D" }),
      status: "academy",
      inactiveYears: 1,
      demotedYear: 1,
      lastTeamId: "T0",
      shadowGrade: 4,
    };
    const mid: MarketInactive = {
      player: player({ id: "m", tier: "B", potential: "B" }),
      status: "academy",
      inactiveYears: 1,
      demotedYear: 1,
      lastTeamId: "T0",
      shadowGrade: 5.5,
    };
    const high: MarketInactive = {
      player: player({ id: "h", tier: "A", potential: "S" }),
      status: "academy",
      inactiveYears: 1,
      demotedYear: 1,
      lastTeamId: "T0",
      shadowGrade: 7,
    };
    expect(academyTenureYears(weak)).toBe(ACADEMY_YEARS_MIN);
    expect(academyTenureYears(mid)).toBe(ACADEMY_YEARS);
    expect(academyTenureYears(high)).toBe(ACADEMY_YEARS_MAX);
  });

  it("weak D graduates after MIN years; high A can stay to MAX", () => {
    let weak: MarketInactive[] = [
      {
        player: player({ id: "d1", name: "d1", tier: "D", potential: "D", age: 22 }),
        status: "academy",
        inactiveYears: 1,
        demotedYear: 1,
        lastTeamId: "T0",
        shadowGrade: 4,
      },
    ];
    weak = advanceInactivePool(weak, rng(1), champions);
    expect(weak[0]!.status).toBe("academy");
    expect(weak[0]!.inactiveYears).toBe(2);
    weak = advanceInactivePool(weak, rng(2), champions);
    expect(weak[0]!.status).toBe("free-agent");
    expect(weak[0]!.inactiveYears).toBe(3); // chronological; cap snaps to FA·1y

    let star: MarketInactive[] = [
      {
        player: player({ id: "a1", name: "a1", tier: "A", potential: "S", age: 19 }),
        status: "academy",
        inactiveYears: 1,
        demotedYear: 1,
        lastTeamId: "T0",
        shadowGrade: 7,
      },
    ];
    for (let i = 0; i < 3; i++) star = advanceInactivePool(star, rng(10 + i), champions);
    expect(star[0]!.status).toBe("academy");
    expect(star[0]!.inactiveYears).toBe(4);
    star = advanceInactivePool(star, rng(20), champions);
    expect(star[0]!.status).toBe("free-agent");
    expect(star[0]!.inactiveYears).toBe(5);
  });

  it("caps synchronized soft-max wave: surplus under MAX stay academy", () => {
    expect(ACADEMY_GRADUATE_CAP_PER_YEAR).toBe(16);
    const n = ACADEMY_GRADUATE_CAP_PER_YEAR + 12;
    const before: MarketInactive[] = Array.from({ length: n }, (_, i) => ({
      player: player({
        id: `wave${i}`,
        name: `wave${i}`,
        lane: "top",
        tier: i < ACADEMY_GRADUATE_CAP_PER_YEAR ? "A" : "B",
        potential: i < ACADEMY_GRADUATE_CAP_PER_YEAR ? "A" : "B",
      }),
      status: "academy" as const,
      inactiveYears: 3,
      demotedYear: 1,
      lastTeamId: `T${i % 8}`,
      shadowGrade: 5.5,
    }));
    const after = before.map((e) => ({
      ...e,
      status: "free-agent" as const,
      inactiveYears: 4,
    }));
    const capped = applyAcademyGraduateCap(before, after);
    const fa = capped.filter((e) => e.status === "free-agent");
    const stillAcy = capped.filter((e) => e.status === "academy");
    const retired = capped.filter((e) => e.status === "retired");
    expect(fa.length).toBe(ACADEMY_GRADUATE_CAP_PER_YEAR);
    expect(stillAcy.length).toBe(12);
    expect(retired.length).toBe(0);
    // Deferred keep advanced year count (grace toward hard max).
    expect(stillAcy.every((e) => e.inactiveYears === 4)).toBe(true);
    // Kept FA clocks snap to soft ACADEMY_YEARS + 1.
    expect(fa.every((e) => e.inactiveYears === ACADEMY_YEARS + 1)).toBe(true);
    // Highest value kept as FA.
    expect(fa.every((e) => e.player.tier === "A")).toBe(true);
  });

  it("surplus past hard MAX retire instead of flooding FA", () => {
    const n = ACADEMY_GRADUATE_CAP_PER_YEAR + 5;
    const before: MarketInactive[] = Array.from({ length: n }, (_, i) => ({
      player: player({
        id: `hard${i}`,
        name: `hard${i}`,
        lane: "jungle",
        tier: i < ACADEMY_GRADUATE_CAP_PER_YEAR ? "A" : "C",
      }),
      status: "academy" as const,
      inactiveYears: ACADEMY_YEARS_MAX,
      demotedYear: 1,
      lastTeamId: "T0",
      shadowGrade: 5.5,
    }));
    const after = before.map((e) => ({
      ...e,
      status: "free-agent" as const,
      inactiveYears: ACADEMY_YEARS_MAX + 1,
    }));
    const capped = applyAcademyGraduateCap(before, after);
    expect(capped.filter((e) => e.status === "free-agent").length).toBe(
      ACADEMY_GRADUATE_CAP_PER_YEAR,
    );
    expect(capped.filter((e) => e.status === "retired").length).toBe(5);
    expect(capped.filter((e) => e.status === "academy").length).toBe(0);
  });

  it("advance + cap together limit a same-year soft-max cohort", () => {
    const n = ACADEMY_GRADUATE_CAP_PER_YEAR + 10;
    const before: MarketInactive[] = Array.from({ length: n }, (_, i) => ({
      player: player({
        id: `coh${i}`,
        name: `coh${i}`,
        lane: "middle",
        tier: "B",
        age: 20,
      }),
      status: "academy" as const,
      inactiveYears: 3,
      demotedYear: 1,
      lastTeamId: `T${i % 10}`,
      shadowGrade: 5.5,
    }));
    let after = advanceInactivePool(before, rng(99), champions);
    after = applyAcademyGraduateCap(before, after);
    const newFa = after.filter((e) => e.status === "free-agent");
    const deferred = after.filter((e) => e.status === "academy");
    expect(newFa.length).toBe(ACADEMY_GRADUATE_CAP_PER_YEAR);
    expect(deferred.length).toBe(10);
    expect(deferred.every((e) => e.inactiveYears === 4)).toBe(true);
  });
});

describe("listTeamAcademy / listFreeAgents / board exclude", () => {
  it("lists academy by lastTeamId including same-window demotees", () => {
    const pool: MarketInactive[] = [
      {
        player: player({ id: "acy-me", name: "acy-me", lane: "top", tier: "B" }),
        status: "academy",
        inactiveYears: 1,
        demotedYear: 1,
        lastTeamId: "T0",
        lastTeamName: "T0",
      },
      {
        player: player({ id: "acy-other", name: "acy-other", lane: "top", tier: "A" }),
        status: "academy",
        inactiveYears: 1,
        demotedYear: 1,
        lastTeamId: "T1",
        lastTeamName: "T1",
      },
      {
        player: player({ id: "fa1", name: "fa1", lane: "jungle", tier: "A" }),
        status: "free-agent",
        inactiveYears: 3,
        demotedYear: 1,
        lastTeamId: "T0",
        lastTeamName: "T0",
      },
    ];
    expect(listTeamAcademy(pool, "T0").map((e) => e.player.id)).toEqual(["acy-me"]);
    expect(listFreeAgents(pool).map((e) => e.player.id)).toEqual(["fa1"]);
  });

  it("buildAcademyBoard shows demotee unless excludePlayerIds filters them", () => {
    const demoted: MarketInactive = {
      player: player({ id: "bench", name: "bench", lane: "middle", tier: "C" }),
      status: "academy",
      inactiveYears: 1,
      demotedYear: 2,
      lastTeamId: "T0",
      lastTeamName: "T0",
    };
    const shown = buildAcademyBoard([demoted], "T0", "all", byId, NEUTRAL_META);
    expect(shown.some((r) => r.entry.player.id === "bench")).toBe(true);
    const hidden = buildAcademyBoard(
      [demoted],
      "T0",
      "all",
      byId,
      NEUTRAL_META,
      null,
      null,
      undefined,
      new Set(["bench"]),
    );
    expect(hidden.some((r) => r.entry.player.id === "bench")).toBe(false);
  });
});
