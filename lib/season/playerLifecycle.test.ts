import { describe, it, expect } from "vitest";
import {
  agePlayer,
  makeRookie,
  offseasonEvolveRoster,
  seedRosterCareers,
  isUnderperformingSeason,
  nextBadStreak,
  runOffseasonLifecycle,
  runDemotionPass,
  advanceInactivePool,
  backfillInactiveClockYears,
  yearsInAcademy,
  yearsAsFreeAgent,
  inactiveSnapshotsForArchivedYear,
  ACADEMY_YEARS,
  FREE_AGENT_YEARS,
  TOTAL_INACTIVE_BEFORE_RETIRE,
  isValidHandle,
  type InactivePlayer,
  type SeasonPlayerOutcome,
} from "./playerLifecycle";
import {
  NEUTRAL_META,
  bumpOldestAcademyToFa,
  releaseAcademyToFa,
  runOpenFaReplacePass,
} from "./faMarket";
import { PLAYER_TIER_VALUE } from "../players";
import type { Champion, Lane, Player } from "../types";

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

const player = (over: Partial<Player>): Player =>
  ({ lane: "middle", tier: "B", goodChamps: [], badChamps: [], ...over });

describe("makeRookie", () => {
  it("is young with upside and a full kit", () => {
    const r = makeRookie("middle", champions, rng(1), new Set());
    expect(r.age).toBeGreaterThanOrEqual(17);
    expect(r.age).toBeLessThanOrEqual(19);
    expect(r.id).toBeTruthy();
    expect(r.name).toBeTruthy();
    expect(isValidHandle(r.name!)).toBe(true);
    expect(PLAYER_TIER_VALUE[r.potential!]).toBeGreaterThanOrEqual(PLAYER_TIER_VALUE[r.tier]);
    expect(r.goodChamps.length).toBeGreaterThan(0);
  });
});

describe("seedRosterCareers", () => {
  it("preserves a hand-set age (reality setup) but fills missing ones", () => {
    const [withAge, noAge] = seedRosterCareers(
      [player({ lane: "top", age: 27 }), player({ lane: "mid" as Lane })],
      rng(3),
    );
    expect(withAge.age).toBe(27);
    expect(noAge.age).toBeGreaterThanOrEqual(18);
    expect(noAge.age).toBeLessThanOrEqual(25);
  });
});

describe("agePlayer growth vs decline", () => {
  const meanTier = (make: () => Player, n: number) => {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const p = make();
      sum += PLAYER_TIER_VALUE[p.tier];
    }
    return { mean: sum / n };
  };

  it("young talent performing well climbs", () => {
    const start = PLAYER_TIER_VALUE["C"];
    const { mean } = meanTier(
      () => agePlayer(player({ tier: "C", age: 20, potential: "S" }), 8, rng(Math.random() * 1e9 | 0)),
      400,
    );
    expect(mean).toBeGreaterThan(start);
  });

  it("veterans decline but never age-retire (always returns a player)", () => {
    let alive = 0;
    let sum = 0;
    for (let i = 0; i < 400; i++) {
      const p = agePlayer(player({ tier: "A", age: 35, potential: "A" }), 4, rng(i * 997));
      expect(p).not.toBeNull();
      alive++;
      sum += PLAYER_TIER_VALUE[p.tier];
    }
    expect(alive).toBe(400);
    expect(sum / alive).toBeLessThan(PLAYER_TIER_VALUE["A"]);
  });
});

describe("offseasonEvolveRoster", () => {
  it("keeps 5 lane-ordered players aged in place (no age-forced swaps)", () => {
    const roster = seedRosterCareers(
      LANES.map((lane) => player({ lane, tier: "B", age: 33, id: `p-${lane}`, name: `old-${lane}` })),
      rng(7),
    );
    const next = offseasonEvolveRoster(roster, [6, 6, 6, 6, 6], champions, rng(9), new Set());
    expect(next).toHaveLength(5);
    expect(next.map((p) => p.lane)).toEqual(LANES);
    // Same identities — no age retirement.
    expect(next.map((p) => p.id)).toEqual(roster.map((p) => p.id));
  });
});

describe("isValidHandle", () => {
  it("rejects trailing digits and Roman suffixes", () => {
    expect(isValidHandle("Ralz8")).toBe(false);
    expect(isValidHandle("Skaz IV")).toBe(false);
    expect(isValidHandle("Faker")).toBe(true);
    expect(isValidHandle("Caps")).toBe(true);
  });
});

describe("runOffseasonLifecycle demotion", () => {
  it("demotes after 5 consecutive underperforming seasons and fills with a rookie", () => {
    const roster = LANES.map((lane, i) =>
      player({
        lane,
        tier: "D",
        age: 28,
        id: `p-${i}`,
        name: `weak-${lane}`,
        badStreak: lane === "middle" ? 4 : 0,
      }),
    );
    const outcomes = new Map(
      roster.map((p) => [
        p.id!,
        {
          playerId: p.id!,
          grade: 3.5,
          tier: p.tier,
          lane: p.lane,
          splitTitles: 0,
          intlTitles: 0,
        },
      ]),
    );
    const result = runOffseasonLifecycle(
      [{ id: "T1", name: "T1", players: roster, leagueId: "LCK" }],
      outcomes,
      { middle: 6.5, top: 6, jungle: 6, bottom: 6, support: 6 },
      [],
      champions,
      rng(11),
      new Set(),
      3,
    );
    expect(result.news.length).toBeGreaterThanOrEqual(1);
    const midNews = result.news.find((n) => n.lane === "middle");
    expect(midNews?.departedName).toBe("weak-middle");
    expect(midNews?.entrantSource).toBe("academy");
    expect(midNews?.marketNote).toBe("academy-rookie");
    expect(result.inactivePool.some((p) => p.player.name === "weak-middle")).toBe(true);
  });

  it("same-org academy can return; other-org academy cannot; FA can from any org", () => {
    const demote = (lane: Lane, id: string, name: string): Player =>
      player({
        lane,
        tier: "D",
        age: 28,
        id,
        name,
        badStreak: 4,
      });
    const mkOutcomes = (roster: Player[]) =>
      new Map(
        roster.map((p) => [
          p.id!,
          {
            playerId: p.id!,
            grade: 3.0,
            tier: p.tier,
            lane: p.lane,
            splitTitles: 0,
            intlTitles: 0,
          } satisfies SeasonPlayerOutcome,
        ]),
      );
    const roleMeans = { middle: 6.5, top: 6, jungle: 6, bottom: 6, support: 6 };

    // Other-org academy mid (still academy after year-end advance) → T1 takes a
    // rookie; the academy player stays parked for their own org.
    const otherAcy: InactivePlayer = {
      player: player({ id: "other-acy", name: "OtherAcy", lane: "middle", tier: "A", age: 22 }),
      status: "academy",
      inactiveYears: 1, // advances to 2 → still academy (not FA yet)
      demotedYear: 1,
      lastTeamId: "TX",
    };
    const roster1 = LANES.map((lane) =>
      lane === "middle"
        ? demote("middle", "bad-mid", "BadMid")
        : player({ lane, id: `ok-${lane}`, name: `ok-${lane}`, age: 24, badStreak: 0 }),
    );
    const blocked = runOffseasonLifecycle(
      [{ id: "T1", name: "T1", players: roster1, leagueId: "LCK" }],
      mkOutcomes(roster1),
      roleMeans,
      [otherAcy],
      champions,
      rng(3),
      new Set(),
      4,
    );
    expect(blocked.news.find((n) => n.lane === "middle")?.entrantSource).toBe("academy");
    expect(blocked.news.find((n) => n.lane === "middle")?.marketNote).toBe("academy-rookie");
    expect(blocked.inactivePool.some((p) => p.player.id === "other-acy" && p.status === "academy")).toBe(
      true,
    );

    // Same-org academy mid → T1 recalls them.
    const sameAcy: InactivePlayer = {
      player: player({ id: "same-acy", name: "SameAcy", lane: "middle", tier: "B", age: 23 }),
      status: "academy",
      inactiveYears: 1,
      demotedYear: 2,
      lastTeamId: "T1",
    };
    const roster2 = LANES.map((lane) =>
      lane === "middle"
        ? demote("middle", "bad-mid-2", "BadMid2")
        : player({ lane, id: `ok2-${lane}`, name: `ok2-${lane}`, age: 24, badStreak: 0 }),
    );
    const recalled = runOffseasonLifecycle(
      [{ id: "T1", name: "T1", players: roster2, leagueId: "LCK" }],
      mkOutcomes(roster2),
      roleMeans,
      [sameAcy],
      champions,
      rng(5),
      new Set(),
      5,
    );
    expect(recalled.teams[0]!.players.find((p) => p.lane === "middle")?.id).toBe("same-acy");
    expect(recalled.news.find((n) => n.lane === "middle")?.entrantSource).toBe("academy");

    // FA from another org → any team may sign.
    const fa: InactivePlayer = {
      player: player({ id: "fa-mid", name: "FaMid", lane: "middle", tier: "B", age: 25 }),
      status: "free-agent",
      inactiveYears: 3,
      demotedYear: 1,
      lastTeamId: "TX",
    };
    const roster3 = LANES.map((lane) =>
      lane === "middle"
        ? demote("middle", "bad-mid-3", "BadMid3")
        : player({ lane, id: `ok3-${lane}`, name: `ok3-${lane}`, age: 24, badStreak: 0 }),
    );
    const signed = runOffseasonLifecycle(
      [{ id: "T1", name: "T1", players: roster3, leagueId: "LCK" }],
      mkOutcomes(roster3),
      roleMeans,
      [fa],
      champions,
      rng(7),
      new Set(),
      6,
    );
    expect(signed.teams[0]!.players.find((p) => p.lane === "middle")?.id).toBe("fa-mid");
    expect(signed.news.find((n) => n.lane === "middle")?.entrantSource).toBe("free-agent");
  });
});

describe("nextBadStreak", () => {
  it("increments on underperformance and resets otherwise", () => {
    expect(
      nextBadStreak(2, { grade: 3, tier: "C", splitTitles: 0, intlTitles: 0 }, 6),
    ).toBe(3);
    expect(
      nextBadStreak(2, { grade: 7, tier: "A", splitTitles: 0, intlTitles: 0 }, 6),
    ).toBe(0);
  });
});

describe("isUnderperformingSeason", () => {
  it("requires at least two factors", () => {
    expect(isUnderperformingSeason({ grade: 7, tier: "B", splitTitles: 0, intlTitles: 0 }, 6)).toBe(
      false,
    );
  });
});

describe("academy → FA → retired year counting", () => {
  const baseEntry = (over: Partial<InactivePlayer> = {}): InactivePlayer => ({
    player: player({ id: "p1", name: "P1", lane: "middle", tier: "C", age: 25 }),
    status: "academy",
    // 1-based: demotion day stores 1 (Academy · 1y).
    inactiveYears: 1,
    demotedYear: 1,
    lastTeamId: "T1",
    ...over,
  });

  it("advances academy to free-agent after ACADEMY_YEARS and retires after TOTAL", () => {
    expect(ACADEMY_YEARS).toBe(3);
    expect(FREE_AGENT_YEARS).toBe(4);
    expect(TOTAL_INACTIVE_BEFORE_RETIRE).toBe(7);

    let pool = [baseEntry()];
    expect(yearsInAcademy("academy", 1)).toBe(1);

    // Year-end 1: still academy, badge → 2y
    pool = advanceInactivePool(pool, rng(1));
    expect(pool[0]!.status).toBe("academy");
    expect(pool[0]!.inactiveYears).toBe(2);
    expect(yearsInAcademy("academy", 2)).toBe(2);

    // Year-end 2: still academy, badge → 3y
    pool = advanceInactivePool(pool, rng(2));
    expect(pool[0]!.status).toBe("academy");
    expect(pool[0]!.inactiveYears).toBe(3);
    expect(yearsInAcademy("academy", 3)).toBe(3);

    // Year-end 3: → free-agent · 1y
    pool = advanceInactivePool(pool, rng(3));
    expect(pool[0]!.status).toBe("free-agent");
    expect(pool[0]!.inactiveYears).toBe(4);
    expect(yearsInAcademy("free-agent", 4)).toBe(3);
    expect(yearsAsFreeAgent("free-agent", 4)).toBe(1);

    // Year-ends 4–6: FA 2y, 3y, 4y
    for (let i = 0; i < 3; i++) pool = advanceInactivePool(pool, rng(10 + i));
    expect(pool[0]!.status).toBe("free-agent");
    expect(pool[0]!.inactiveYears).toBe(7);
    expect(yearsAsFreeAgent("free-agent", 7)).toBe(4);

    // Year-end 7: retired after 4 FA years
    pool = advanceInactivePool(pool, rng(99));
    expect(pool[0]!.status).toBe("retired");
    expect(pool[0]!.inactiveYears).toBe(8);
    expect(yearsAsFreeAgent("retired", 8)).toBe(4);
  });

  it("skips the year clock on the mint/demotion calendar year (Acy 1 archives as 1)", () => {
    let pool = [baseEntry({ demotedYear: 1, inactiveYears: 1 })];
    // Closing year 1 = demotedYear → age only, keep Academy · 1y
    pool = advanceInactivePool(pool, rng(1), [], 1);
    expect(pool[0]!.status).toBe("academy");
    expect(pool[0]!.inactiveYears).toBe(1);
    expect(pool[0]!.player.age).toBe(26);
    // Next close advances normally
    pool = advanceInactivePool(pool, rng(2), [], 2);
    expect(pool[0]!.inactiveYears).toBe(2);
  });

  it("preserves opening-seed stagger (Acy · 2y) across the mint-year skip", () => {
    let pool = [baseEntry({ demotedYear: 1, inactiveYears: 2 })];
    pool = advanceInactivePool(pool, rng(1), [], 1);
    expect(pool[0]!.inactiveYears).toBe(2);
    pool = advanceInactivePool(pool, rng(2), [], 2);
    expect(pool[0]!.inactiveYears).toBe(3);
  });

  it("does not burn an academy year in the same offseason a player is demoted", () => {
    const roster = LANES.map((lane, i) =>
      player({
        lane,
        // Only the demotee is weak — others stay strong so open-FA won't scoop
        // the newly minted FA (old-acy) off the unsigned pool.
        tier: lane === "top" ? "D" : "A",
        age: 28,
        id: `p-${i}`,
        name: `weak-${lane}`,
        badStreak: lane === "top" ? 4 : 0,
      }),
    );
    const outcomes = new Map<string, SeasonPlayerOutcome>(
      roster.map((p) => [
        p.id!,
        {
          playerId: p.id!,
          grade: p.lane === "top" ? 3.0 : 7.5,
          tier: p.tier,
          lane: p.lane,
          splitTitles: 0,
          intlTitles: 0,
        },
      ]),
    );
    // Existing academy at 3y advances 3→4 → FA this offseason.
    const existing: InactivePlayer = {
      player: player({ id: "old-acy", name: "OldAcy", lane: "jungle", tier: "B", age: 22 }),
      status: "academy",
      inactiveYears: 3,
      demotedYear: 1,
      lastTeamId: "TX",
    };
    const result = runOffseasonLifecycle(
      [{ id: "T1", name: "T1", players: roster, leagueId: "LCK" }],
      outcomes,
      { top: 6.5, jungle: 6, middle: 6, bottom: 6, support: 6 },
      [existing],
      champions,
      rng(42),
      new Set(),
      5,
    );
    const demoted = result.inactivePool.find((p) => p.player.id === "p-0");
    expect(demoted?.status).toBe("academy");
    expect(demoted?.inactiveYears).toBe(1); // just demoted — Academy · 1y, 3y stay ahead
    expect(yearsInAcademy("academy", demoted!.inactiveYears)).toBe(1);

    const old = result.inactivePool.find((p) => p.player.id === "old-acy");
    expect(old?.status).toBe("free-agent");
    expect(old?.inactiveYears).toBe(4);
    expect(yearsAsFreeAgent("free-agent", 4)).toBe(1);
  });

  it("mid-split demotion starts at 1y; weak D early-exits to FA after tenure MIN", () => {
    const demotee = player({
      id: "bad-top",
      name: "BadTop",
      lane: "top",
      tier: "D",
      age: 27,
      badStreak: 4,
    });
    const teams = [
      {
        id: "T0",
        name: "T0",
        leagueId: "LCK",
        players: LANES.map((lane) =>
          lane === "top" ? demotee : player({ lane, id: `ok-${lane}`, name: `ok-${lane}`, age: 24 }),
        ),
      },
    ];
    const outcomes = new Map<string, SeasonPlayerOutcome>();
    for (const p of teams[0]!.players) {
      if (!p.id) continue;
      outcomes.set(p.id, {
        playerId: p.id,
        grade: 3.0,
        tier: p.tier,
        lane: p.lane,
        splitTitles: 0,
        intlTitles: 0,
      });
    }
    const mid = runDemotionPass(
      teams,
      outcomes,
      { top: 6.5, jungle: 6, middle: 6, bottom: 6, support: 6 },
      [],
      champions,
      rng(7),
      new Set(),
      2,
      { ageActives: false, advancePool: false },
    );
    const parked = mid.inactivePool.find((p) => p.player.id === "bad-top");
    expect(parked?.status).toBe("academy");
    expect(parked?.inactiveYears).toBe(1);
    expect(yearsInAcademy("academy", 1)).toBe(1);

    // Year-end: advance existing (1→2 academy), still under tenure MIN (2).
    const yearEnd = runDemotionPass(
      mid.teams.map((t) => ({ ...t, name: "T0", leagueId: "LCK" })),
      outcomes,
      { top: 6.5, jungle: 6, middle: 6, bottom: 6, support: 6 },
      mid.inactivePool,
      champions,
      rng(8),
      new Set(),
      3,
      { ageActives: true, advancePool: true },
    );
    const after = yearEnd.inactivePool.find((p) => p.player.id === "bad-top");
    expect(after?.status).toBe("academy");
    expect(after?.inactiveYears).toBe(2);
    expect(yearsInAcademy("academy", 2)).toBe(2);

    // Second year-end: D tenure MIN → FA · 1y (snapped)
    const y2 = runDemotionPass(
      yearEnd.teams.map((t) => ({ ...t, name: "T0", leagueId: "LCK" })),
      outcomes,
      { top: 6.5, jungle: 6, middle: 6, bottom: 6, support: 6 },
      yearEnd.inactivePool,
      champions,
      rng(9),
      new Set(),
      4,
      { ageActives: true, advancePool: true },
    );
    const fa = y2.inactivePool.find((p) => p.player.id === "bad-top");
    expect(fa?.status).toBe("free-agent");
    expect(fa?.inactiveYears).toBe(4);
    expect(yearsAsFreeAgent("free-agent", 4)).toBe(1);
  });

  it("mid-value B stays academy through soft max then FA", () => {
    const demotee = player({
      id: "mid-top",
      name: "MidTop",
      lane: "top",
      tier: "B",
      age: 22,
      badStreak: 4,
    });
    const teams = [
      {
        id: "T0",
        name: "T0",
        leagueId: "LCK",
        players: LANES.map((lane) =>
          lane === "top"
            ? demotee
            : player({ lane, id: `ok-${lane}`, name: `ok-${lane}`, age: 24, tier: "A" }),
        ),
      },
    ];
    const outcomes = new Map<string, SeasonPlayerOutcome>();
    for (const p of teams[0]!.players) {
      if (!p.id) continue;
      outcomes.set(p.id, {
        playerId: p.id,
        grade: p.lane === "top" ? 3.0 : 7.5,
        tier: p.tier,
        lane: p.lane,
        splitTitles: 0,
        intlTitles: 0,
      });
    }
    let pool: InactivePlayer[] = [
      {
        player: demotee,
        status: "academy",
        inactiveYears: 1,
        demotedYear: 2,
        lastTeamId: "T0",
        lastActiveGrade: 5.5,
        shadowGrade: 5.5,
      },
    ];
    const rosterTeams = teams.map((t) => ({
      ...t,
      players: t.players.map((p) =>
        p.lane === "top"
          ? player({ lane: "top", id: "filler-top", name: "filler-top", age: 24, tier: "A" })
          : p,
      ),
    }));

    // Soft tenure 3: still academy after advances to years 2 and 3
    for (const [seed, year, expectYears] of [
      [8, 3, 2],
      [9, 4, 3],
    ] as const) {
      const pass = runDemotionPass(
        rosterTeams,
        outcomes,
        { top: 6.5, jungle: 6, middle: 6, bottom: 6, support: 6 },
        pool,
        champions,
        rng(seed),
        new Set(),
        year,
        { ageActives: true, advancePool: true },
      );
      pool = pass.inactivePool;
      const e = pool.find((p) => p.player.id === "mid-top");
      expect(e?.status).toBe("academy");
      expect(e?.inactiveYears).toBe(expectYears);
    }

    const toFa = runDemotionPass(
      rosterTeams,
      outcomes,
      { top: 6.5, jungle: 6, middle: 6, bottom: 6, support: 6 },
      pool,
      champions,
      rng(10),
      new Set(),
      5,
      { ageActives: true, advancePool: true },
    );
    const fa = toFa.inactivePool.find((p) => p.player.id === "mid-top");
    expect(fa?.status).toBe("free-agent");
    expect(fa?.inactiveYears).toBe(4);
  });

  it("mid-split cannot call up another org's academy player", () => {
    const demotee = player({
      id: "bad-mid",
      name: "BadMid",
      lane: "middle",
      tier: "D",
      age: 28,
      badStreak: 4,
    });
    const teams = [
      {
        id: "T0",
        name: "T0",
        leagueId: "LCK",
        players: LANES.map((lane) =>
          lane === "middle"
            ? demotee
            : player({ lane, id: `ok-${lane}`, name: `ok-${lane}`, age: 24 }),
        ),
      },
    ];
    const outcomes = new Map<string, SeasonPlayerOutcome>();
    for (const p of teams[0]!.players) {
      if (!p.id) continue;
      outcomes.set(p.id, {
        playerId: p.id,
        grade: 3.0,
        tier: p.tier,
        lane: p.lane,
        splitTitles: 0,
        intlTitles: 0,
      });
    }
    const pool: InactivePlayer[] = [
      {
        player: player({ id: "foreign-acy", name: "ForeignAcy", lane: "middle", tier: "A", age: 21 }),
        status: "academy",
        inactiveYears: 1,
        demotedYear: 1,
        lastTeamId: "TX",
      },
    ];
    const mid = runDemotionPass(
      teams,
      outcomes,
      { middle: 6.5, top: 6, jungle: 6, bottom: 6, support: 6 },
      pool,
      champions,
      rng(11),
      new Set(),
      2,
      { ageActives: false, advancePool: false },
    );
    expect(mid.news[0]?.entrantSource).toBe("academy");
    expect(mid.news[0]?.marketNote).toBe("academy-rookie");
    expect(mid.inactivePool.some((p) => p.player.id === "foreign-acy" && p.status === "academy")).toBe(
      true,
    );
  });
});

describe("demote + FA fill never parks outgoing as FA", () => {
  it("keeps demoted player in academy when an FA wins the vacancy", () => {
    const roster = LANES.map((lane) =>
      player({
        lane,
        tier: lane === "middle" ? "D" : "A",
        age: 27,
        id: lane === "middle" ? "demotee" : `ok-${lane}`,
        name: lane === "middle" ? "Demotee" : `ok-${lane}`,
        badStreak: lane === "middle" ? 4 : 0,
      }),
    );
    const outcomes = new Map<string, SeasonPlayerOutcome>(
      roster.map((p) => [
        p.id!,
        {
          playerId: p.id!,
          grade: p.lane === "middle" ? 3.0 : 7.5,
          tier: p.tier,
          lane: p.lane,
          splitTitles: 0,
          intlTitles: 0,
        },
      ]),
    );
    const fa: InactivePlayer = {
      player: player({ id: "star-fa", name: "StarFa", lane: "middle", tier: "S", age: 24 }),
      status: "free-agent",
      inactiveYears: 3,
      demotedYear: 1,
      lastTeamId: "TX",
      lastActiveGrade: 8,
      shadowGrade: 8,
    };
    const result = runOffseasonLifecycle(
      [{ id: "T1", name: "T1", players: roster, leagueId: "LCK" }],
      outcomes,
      { middle: 6.5, top: 6, jungle: 6, bottom: 6, support: 6 },
      [fa],
      champions,
      rng(21),
      new Set(),
      5,
    );
    expect(result.teams[0]!.players.find((p) => p.lane === "middle")?.id).toBe("star-fa");
    const demoted = result.inactivePool.find((p) => p.player.id === "demotee");
    expect(demoted?.status).toBe("academy");
    expect(demoted?.inactiveYears).toBe(1);
    expect(result.inactivePool.every((p) => p.player.id !== "demotee" || p.status !== "free-agent")).toBe(
      true,
    );
  });
});

describe("same-pass demotee never fills own vacancy", () => {
  /** Strong demotee would otherwise clear ROOKIE_VALUE_FLOOR and self-recall. */
  const strongDemotee = (lane: Lane, id: string, name: string): Player =>
    player({
      lane,
      tier: "A",
      age: 24,
      id,
      name,
      badStreak: 4,
      potential: "A",
    });

  const badOutcomes = (roster: Player[]) =>
    new Map<string, SeasonPlayerOutcome>(
      roster.map((p) => [
        p.id!,
        {
          playerId: p.id!,
          grade: p.badStreak && p.badStreak >= 4 ? 3.0 : 7.5,
          tier: p.tier,
          lane: p.lane,
          splitTitles: 0,
          intlTitles: 0,
        },
      ]),
    );

  it("mid-split: demote X from T → fill for T never selects X; X stays academy", () => {
    const demotee = strongDemotee("middle", "self-x", "SelfX");
    const teams = [
      {
        id: "T0",
        name: "T0",
        leagueId: "LCK",
        players: LANES.map((lane) =>
          lane === "middle"
            ? demotee
            : player({ lane, id: `ok-${lane}`, name: `ok-${lane}`, age: 24, tier: "A" }),
        ),
      },
    ];
    const mid = runDemotionPass(
      teams,
      badOutcomes(teams[0]!.players),
      { middle: 6.5, top: 6, jungle: 6, bottom: 6, support: 6 },
      [],
      champions,
      rng(17),
      new Set(),
      2,
      { ageActives: false, advancePool: false, competitiveMarket: false },
    );
    const midSlot = mid.teams[0]!.players.find((p) => p.lane === "middle")!;
    expect(midSlot.id).not.toBe("self-x");
    expect(mid.news.find((n) => n.lane === "middle")?.entrantId).not.toBe("self-x");
    const parked = mid.inactivePool.find((p) => p.player.id === "self-x");
    expect(parked?.status).toBe("academy");
    expect(parked?.lastTeamId).toBe("T0");
    expect(parked?.inactiveYears).toBe(1);
  });

  it("year-end competitive: demote X stays academy; vacancy filled by other/rookie", () => {
    const demotee = strongDemotee("middle", "self-y", "SelfY");
    const roster = LANES.map((lane) =>
      lane === "middle"
        ? demotee
        : player({ lane, id: `ok-y-${lane}`, name: `ok-y-${lane}`, age: 24, tier: "A" }),
    );
    const result = runOffseasonLifecycle(
      [{ id: "T1", name: "T1", players: roster, leagueId: "LCK" }],
      badOutcomes(roster),
      { middle: 6.5, top: 6, jungle: 6, bottom: 6, support: 6 },
      [],
      champions,
      rng(19),
      new Set(),
      5,
    );
    const midSlot = result.teams[0]!.players.find((p) => p.lane === "middle")!;
    expect(midSlot.id).not.toBe("self-y");
    expect(result.news.some((n) => n.entrantId === "self-y")).toBe(false);
    const parked = result.inactivePool.find((p) => p.player.id === "self-y");
    expect(parked?.status).toBe("academy");
    expect(parked?.inactiveYears).toBe(1);
  });
  it("emits retired roster news when FA clock / valves retire a player", () => {
    const fa: InactivePlayer = {
      player: player({ id: "old-fa", name: "OldFa", lane: "top", tier: "C", age: 30 }),
      status: "free-agent",
      inactiveYears: TOTAL_INACTIVE_BEFORE_RETIRE,
      demotedYear: 1,
      lastTeamId: "T1",
      lastTeamName: "T1",
    };
    const roster = LANES.map((lane) =>
      player({ lane, id: `ok-${lane}`, name: `ok-${lane}`, tier: "A", age: 24 }),
    );
    const outcomes = new Map<string, SeasonPlayerOutcome>(
      roster.map((p) => [
        p.id!,
        {
          playerId: p.id!,
          grade: 7,
          tier: p.tier,
          lane: p.lane,
          splitTitles: 0,
          intlTitles: 0,
        },
      ]),
    );
    const result = runOffseasonLifecycle(
      [{ id: "T1", name: "T1", players: roster, leagueId: "LCK" }],
      outcomes,
      { top: 6, jungle: 6, middle: 6, bottom: 6, support: 6 },
      [fa],
      champions,
      rng(3),
      new Set(),
      8,
    );
    expect(result.inactivePool.find((e) => e.player.id === "old-fa")?.status).toBe(
      "retired",
    );
    expect(
      result.news.some(
        (n) => n.marketNote === "retired" && n.departedId === "old-fa",
      ),
    ).toBe(true);
  });
});

describe("inactiveSnapshotsForArchivedYear", () => {
  it("stamps year-end advance onto the archived year (1→2)", () => {
    const continuing: InactivePlayer = {
      player: player({ id: "acy", name: "Acy", lane: "top", tier: "B", age: 22 }),
      status: "academy",
      inactiveYears: 1,
      demotedYear: 1,
      lastTeamId: "T1",
    };
    const advanced = advanceInactivePool([continuing], rng(1), champions);
    expect(advanced[0]!.inactiveYears).toBe(2);
    const snaps = inactiveSnapshotsForArchivedYear([continuing], advanced);
    expect(snaps[0]!.status).toBe("academy");
    expect(snaps[0]!.inactiveYears).toBe(2);
  });

  it("includes newly demoted players at academy · 1y", () => {
    const pre: InactivePlayer[] = [];
    const post: InactivePlayer[] = [
      {
        player: player({
          id: "new",
          name: "New",
          lane: "jungle",
          tier: "C",
          age: 25,
          debutYear: 2,
          potential: "B",
          goodChamps: [1, 2],
        }),
        status: "academy",
        inactiveYears: 1,
        demotedYear: 3,
        lastTeamId: "T1",
      },
    ];
    const snaps = inactiveSnapshotsForArchivedYear(pre, post);
    expect(snaps).toHaveLength(1);
    expect(snaps[0]!.status).toBe("academy");
    expect(snaps[0]!.inactiveYears).toBe(1);
    expect(snaps[0]!.debutYear).toBe(2);
    expect(snaps[0]!.potential).toBe("B");
    expect(snaps[0]!.goodChamps).toEqual([1, 2]);
  });

  it("progresses ACY 1→2→3 then FA 1 across continue-year stamps", () => {
    // Mirrors continueSeasonToNextYear: archive = snapshots(pre, post after advance/demote).
    let live: InactivePlayer[] = [];
    const archives: { inactiveYears: number; status: string }[] = [];

    // Year 1 close: brand-new demotee (not in pre) at Academy · 1y.
    const demoted: InactivePlayer = {
      player: player({ id: "vet", name: "Vet", lane: "top", tier: "C", age: 26 }),
      status: "academy",
      inactiveYears: 1,
      demotedYear: 1,
      lastTeamId: "T1",
    };
    live = [demoted];
    archives.push(
      ...inactiveSnapshotsForArchivedYear([], live, 1).map((s) => ({
        inactiveYears: s.inactiveYears,
        status: s.status,
      })),
    );

    // Years 2–4 closes: advance then stamp post onto that year's Hall row.
    for (let i = 0; i < 3; i++) {
      const closingYear = 2 + i;
      const pre = live;
      live = advanceInactivePool(pre, rng(10 + i), champions, closingYear);
      archives.push(
        ...inactiveSnapshotsForArchivedYear(pre, live, closingYear).map((s) => ({
          inactiveYears: s.inactiveYears,
          status: s.status,
        })),
      );
    }

    expect(archives.map((a) => [a.status, a.inactiveYears])).toEqual([
      ["academy", 1],
      ["academy", 2],
      ["academy", 3],
      ["free-agent", 4],
    ]);
    expect(yearsInAcademy("academy", 1)).toBe(1);
    expect(yearsInAcademy("academy", 2)).toBe(2);
    expect(yearsInAcademy("academy", 3)).toBe(3);
    expect(yearsAsFreeAgent("free-agent", 4)).toBe(1);
  });

  it("academy mint first year archives as Acy · 1y (not 2y)", () => {
    // Opening / mid-season mint: demotedYear = season year, inactiveYears = 1.
    let live: InactivePlayer[] = [
      {
        player: player({ id: "rook", name: "Rook", lane: "top", tier: "C", age: 18 }),
        status: "academy",
        inactiveYears: 1,
        demotedYear: 1,
        lastTeamId: "T1",
      },
    ];
    const archives: number[] = [];
    for (let closingYear = 1; closingYear <= 3; closingYear++) {
      const pre = live;
      live = advanceInactivePool(pre, rng(20 + closingYear), champions, closingYear);
      archives.push(
        ...inactiveSnapshotsForArchivedYear(pre, live, closingYear).map(
          (s) => s.inactiveYears,
        ),
      );
    }
    expect(archives).toEqual([1, 2, 3]);
  });

  it("mid-year academy→FA archives the closing year as FA · 1y (not 2y)", () => {
    // Audit repro: the release/bump/cut snap resets inactiveYears to FA · 1y
    // but demotedYear still points at the (old) demotion. Keying the year-end
    // skip off demotedYear ticked the fresh clock immediately → FA · 2y and an
    // early cull. clockYear is what the skip must read.
    const academy: InactivePlayer = {
      player: player({ id: "kid", name: "Kid", lane: "top", tier: "B", age: 21 }),
      status: "academy",
      inactiveYears: 2,
      demotedYear: 1,
      clockYear: 1,
      lastTeamId: "T1",
    };
    // Mid-year release in year 3 (user release / cap bump / AI declutter).
    const released = releaseAcademyToFa([academy], "T1", "kid", 3).released!;
    expect(released.inactiveYears).toBe(ACADEMY_YEARS + 1);
    expect(released.demotedYear).toBe(1); // left the main roster in year 1
    expect(released.clockYear).toBe(3); // FA badge clock starts now

    const post = advanceInactivePool(
      [released as InactivePlayer],
      rng(31),
      champions,
      3,
    );
    const snap = inactiveSnapshotsForArchivedYear([released as InactivePlayer], post, 3)[0]!;
    expect(snap.status).toBe("free-agent");
    expect(yearsAsFreeAgent(snap.status, snap.inactiveYears)).toBe(1);

    // …and the very next year-end does tick them to FA · 2y.
    const y4 = advanceInactivePool(post, rng(32), champions, 4);
    expect(yearsAsFreeAgent("free-agent", y4[0]!.inactiveYears)).toBe(2);
  });

  it("year-end cut lands in the CLOSING year's archive as academy · 1y", () => {
    // startNextSeason passes intakeYear = nextYear for new mints; cut
    // incumbents must keep the closing year or the archive filter drops them.
    const demotee = player({
      id: "cut",
      name: "Cut",
      lane: "middle",
      tier: "D",
      age: 29,
      badStreak: 4,
    });
    const roster = LANES.map((lane) =>
      lane === "middle"
        ? demotee
        : player({ lane, id: `keep-${lane}`, name: `keep-${lane}`, tier: "A", age: 24 }),
    );
    const outcomes = new Map<string, SeasonPlayerOutcome>(
      roster.map((p) => [
        p.id!,
        {
          playerId: p.id!,
          grade: p.id === "cut" ? 3 : 7,
          tier: p.tier,
          lane: p.lane,
          splitTitles: 0,
          intlTitles: 0,
        },
      ]),
    );
    const closingYear = 4;
    const result = runOffseasonLifecycle(
      [{ id: "T1", name: "T1", players: roster, leagueId: "LCK" }],
      outcomes,
      { middle: 6.5, top: 6, jungle: 6, bottom: 6, support: 6 },
      [],
      champions,
      rng(41),
      new Set(),
      closingYear,
      undefined,
      undefined,
      { intakeYear: closingYear + 1 },
    );
    const cut = result.inactivePool.find((e) => e.player.id === "cut")!;
    expect(cut.status).toBe("academy");
    expect(cut.demotedYear).toBe(closingYear);
    expect(cut.clockYear).toBe(closingYear);

    const snaps = inactiveSnapshotsForArchivedYear([], result.inactivePool, closingYear);
    const archived = snaps.find((s) => s.playerId === "cut")!;
    expect(archived.status).toBe("academy");
    expect(archived.inactiveYears).toBe(1);
    // Next-season intake minted in the same pass stays out of this archive.
    expect(snaps.every((s) => s.demotedYear <= closingYear)).toBe(true);
  });

  it("year-end pass with intakeYear keeps open-FA cuts in the closing archive", () => {
    // runDemotionPass hands intakeYear to the market passes for new mints;
    // routing it to the cut incumbent too stamped them with nextYear, which
    // the archive filter then dropped — the player silently vanished from the
    // closing season's Hall row.
    const weak = player({ id: "weak-top", name: "WeakTop", lane: "top", tier: "D", age: 30 });
    const roster = LANES.map((lane) =>
      lane === "top"
        ? weak
        : player({ lane, id: `solid-${lane}`, name: `solid-${lane}`, tier: "A", age: 24 }),
    );
    const star: InactivePlayer = {
      player: player({ id: "top-fa", name: "TopFa", lane: "top", tier: "S", age: 24 }),
      status: "free-agent",
      inactiveYears: ACADEMY_YEARS + 1,
      demotedYear: 2,
      clockYear: 2,
      lastTeamId: "TX",
    };
    // Everyone grades fine — no underperform streak, so the only cut is the
    // open-FA upgrade on top.
    const outcomes = new Map<string, SeasonPlayerOutcome>(
      roster.map((p) => [
        p.id!,
        {
          playerId: p.id!,
          grade: 6,
          tier: p.tier,
          lane: p.lane,
          splitTitles: 0,
          intlTitles: 0,
        },
      ]),
    );
    const closingYear = 4;
    const result = runDemotionPass(
      [{ id: "T1", name: "T1", players: roster, leagueId: "LCK" }],
      outcomes,
      { top: 6, jungle: 6, middle: 6, bottom: 6, support: 6 },
      [star],
      champions,
      rng(71),
      new Set(),
      closingYear,
      { ageActives: true, advancePool: true, intakeYear: closingYear + 1 },
    );
    expect(result.teams[0]!.players.find((p) => p.lane === "top")?.id).toBe("top-fa");
    const cut = result.inactivePool.find((e) => e.player.id === "weak-top")!;
    expect(cut.demotedYear).toBe(closingYear);
    expect(
      inactiveSnapshotsForArchivedYear([star], result.inactivePool, closingYear).some(
        (s) => s.playerId === "weak-top" && s.status === "academy",
      ),
    ).toBe(true);
  });

  it("open-FA cut is stamped with the closing year, not the intake year", () => {
    // This is the pass that took intakeYear: a benched incumbent stamped with
    // nextYear vanished from the closing season's Hall row entirely.
    const incumbent = player({
      id: "benched",
      name: "Benched",
      lane: "top",
      tier: "D",
      age: 30,
    });
    const star: InactivePlayer = {
      player: player({ id: "star-fa", name: "StarFa", lane: "top", tier: "S", age: 24 }),
      status: "free-agent",
      inactiveYears: ACADEMY_YEARS + 1,
      demotedYear: 2,
      clockYear: 2,
      lastTeamId: "TX",
    };
    const closingYear = 4;
    const opened = runOpenFaReplacePass(
      [
        {
          id: "T1",
          name: "T1",
          leagueId: "LCK",
          players: LANES.map((lane) =>
            lane === "top"
              ? incumbent
              : player({ lane, id: `ok-${lane}`, name: `ok-${lane}`, tier: "A", age: 24 }),
          ),
        },
      ],
      [star],
      new Map(champions.map((c) => [c.id, c])),
      NEUTRAL_META,
      new Map([["benched", { grade: 2 }]]),
      rng(61),
      closingYear,
    );
    const parked = opened.inactivePool.find((e) => e.player.id === "benched")!;
    expect(parked.status).toBe("academy");
    expect(parked.demotedYear).toBe(closingYear);
    expect(parked.clockYear).toBe(closingYear);
    expect(
      inactiveSnapshotsForArchivedYear(
        [],
        opened.inactivePool as InactivePlayer[],
        closingYear,
      ).some((s) => s.playerId === "benched"),
    ).toBe(true);
  });

  it("legacy saves without clockYear fall back to demotedYear, then backfill", () => {
    const legacy = {
      player: player({ id: "old", name: "Old", lane: "top", tier: "B", age: 22 }),
      status: "academy" as const,
      inactiveYears: 1,
      demotedYear: 6,
      lastTeamId: "T1",
    };
    // Fallback: no clockYear → demotedYear still keys the skip.
    const held = advanceInactivePool([legacy], rng(51), champions, 6);
    expect(held[0]!.inactiveYears).toBe(1);

    const [migrated] = backfillInactiveClockYears([legacy]);
    expect(migrated!.clockYear).toBe(6);
    const ticked = advanceInactivePool([migrated!], rng(52), champions, 7);
    expect(ticked[0]!.inactiveYears).toBe(2);
  });

  it("cap bump prefers older academy over a same-year arrival", () => {
    const acy = (id: string, iy: number, clockYear: number): InactivePlayer => ({
      player: player({ id, name: id, lane: "top", tier: "B", age: 21 }),
      status: "academy",
      inactiveYears: iy,
      demotedYear: clockYear,
      clockYear,
      lastTeamId: "T1",
    });
    // Four veterans + one player who only just arrived this year.
    const pool = [
      acy("v1", 3, 5),
      acy("v2", 2, 6),
      acy("v3", 1, 7),
      acy("v4", 1, 7),
      acy("fresh", 1, 8),
    ];
    const { bumped } = bumpOldestAcademyToFa(pool, "T1", 8);
    expect(bumped?.player.id).toBe("v1");

    // Ties on badge years still skip the same-year arrival.
    const flat = [acy("fresh", 1, 8), acy("older", 1, 7)];
    expect(bumpOldestAcademyToFa(flat, "T1", 8).bumped?.player.id).toBe("older");
  });

  it("excludes next-season intake (demotedYear after archived year)", () => {
    const post: InactivePlayer[] = [
      {
        player: player({ id: "stay", name: "Stay", lane: "top", tier: "C", age: 20 }),
        status: "academy",
        inactiveYears: 1,
        demotedYear: 1,
        lastTeamId: "T1",
      },
      {
        player: player({ id: "next", name: "Next", lane: "jungle", tier: "C", age: 18 }),
        status: "academy",
        inactiveYears: 1,
        demotedYear: 2, // minted for upcoming year during year-1 offseason
        lastTeamId: "T1",
      },
    ];
    const snaps = inactiveSnapshotsForArchivedYear([], post, 1);
    expect(snaps.map((s) => s.playerId)).toEqual(["stay"]);
  });
});
