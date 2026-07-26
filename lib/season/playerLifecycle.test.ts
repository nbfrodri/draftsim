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
      ...inactiveSnapshotsForArchivedYear([], live).map((s) => ({
        inactiveYears: s.inactiveYears,
        status: s.status,
      })),
    );

    // Years 2–4 closes: advance then stamp post onto that year's Hall row.
    for (let i = 0; i < 3; i++) {
      const pre = live;
      live = advanceInactivePool(pre, rng(10 + i), champions);
      archives.push(
        ...inactiveSnapshotsForArchivedYear(pre, live).map((s) => ({
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
});
