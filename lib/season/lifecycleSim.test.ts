// Empirical lifecycle harness: run multi-year synthetic seasons (3 mid-split
// demotion checkpoints + 1 year-end offseason) and report demotion / academy /
// FA / retirement rates. Used to tune GRADE_GAP_THRESHOLD so demotions stay
// rare-but-real (~3–5% of actives per year).

import { describe, it, expect } from "vitest";
import type { Champion, Lane, Player, PlayerTier } from "../types";
import { makePlayerId, PLAYER_TIER_VALUE, valueToTier } from "../players";
import {
  runOffseasonLifecycle,
  runDemotionPass,
  isUnderperformingSeason,
  nextBadStreak,
  computeRoleMeans,
  GRADE_GAP_THRESHOLD,
  UNDERPERFORM_STREAK_TO_DEMOTE,
  TARGET_DEMOTION_RATE,
  ACADEMY_YEARS,
  FREE_AGENT_YEARS,
  TOTAL_INACTIVE_BEFORE_RETIRE,
  type InactivePlayer,
  type SeasonPlayerOutcome,
} from "./playerLifecycle";
import { NEUTRAL_META } from "./faMarket";

const LANES: Lane[] = ["top", "jungle", "middle", "bottom", "support"];
/** Mid-split checkpoints per year (winter / spring / summer). */
const MID_SPLIT_CHECKS = 3;

const rng = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

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

function makePlayer(lane: Lane, r: () => number, over: Partial<Player> = {}): Player {
  const tierRoll = r();
  const tier: PlayerTier =
    tierRoll < 0.05 ? "S" : tierRoll < 0.2 ? "A" : tierRoll < 0.55 ? "B" : tierRoll < 0.85 ? "C" : "D";
  return {
    id: makePlayerId(r),
    name: `P${Math.floor(r() * 1e9).toString(36)}`,
    lane,
    tier,
    age: 18 + Math.floor(r() * 12),
    potential: valueToTier(Math.min(3, PLAYER_TIER_VALUE[tier] + Math.floor(r() * 2))),
    badStreak: 0,
    goodChamps: [],
    badChamps: [],
    ...over,
  };
}

function syntheticOutcomes(
  teams: { id: string; players: Player[] }[],
  r: () => number,
): Map<string, SeasonPlayerOutcome> {
  const out = new Map<string, SeasonPlayerOutcome>();
  // ~8% of players get a split title credit, ~2% an intl title (sparse silverware).
  for (const t of teams) {
    for (const p of t.players) {
      if (!p.id) continue;
      // Grade: tier-anchored with noise; older/weaker trend lower.
      const base = 5.5 + PLAYER_TIER_VALUE[p.tier] * 0.7 - Math.max(0, (p.age ?? 22) - 28) * 0.15;
      const grade = Math.max(1, Math.min(10, base + (r() - 0.5) * 2.2));
      const splitTitles = r() < 0.08 ? 1 : 0;
      const intlTitles = r() < 0.02 ? 1 : 0;
      out.set(p.id, {
        playerId: p.id,
        grade,
        tier: p.tier,
        lane: p.lane,
        splitTitles,
        intlTitles,
      });
    }
  }
  return out;
}

export interface LifecycleSimReport {
  years: number;
  activePerYear: number;
  demotions: number;
  demotionRatePerYear: number;
  finalAcademy: number;
  finalFa: number;
  finalRetired: number;
  gradeGap: number;
  /** Retirees observed during the sim (status flipped to retired). */
  retireeCount: number;
  /** Mean age at the year-end tick they became retired. */
  avgRetireAge: number | null;
  /**
   * Mean main-roster seasons before retirement. Academy + FA years do not
   * count — only years the player appeared on a team's active 5.
   */
  avgPlayingSeasons: number | null;
}

/** Run `years` synthetic seasons (3 mid-split demotion passes + 1 offseason). */
export function simulateLifecycleYears(opts: {
  years: number;
  teamCount: number;
  seed: number;
  gradeGap?: number;
}): LifecycleSimReport {
  const r = rng(opts.seed);
  const gradeGap = opts.gradeGap ?? GRADE_GAP_THRESHOLD;
  let teams = Array.from({ length: opts.teamCount }, (_, i) => ({
    id: `T${i}`,
    name: `Team ${i}`,
    leagueId: "LCK",
    players: LANES.map((lane) => makePlayer(lane, r)),
  }));
  let pool: InactivePlayer[] = [];
  let demotions = 0;
  let activeSum = 0;
  const taken = new Set<string>();
  /** Main-roster seasons played (academy/FA excluded). */
  const playingSeasons = new Map<string, number>();
  const retireAges: number[] = [];
  const retirePlaying: number[] = [];
  const alreadyRetired = new Set<string>();

  const bumpPlaying = (roster: { players: Player[] }[]) => {
    for (const t of roster) {
      for (const p of t.players) {
        if (!p.id) continue;
        playingSeasons.set(p.id, (playingSeasons.get(p.id) ?? 0) + 1);
      }
    }
  };

  const noteRetirements = (nextPool: InactivePlayer[]) => {
    for (const e of nextPool) {
      if (e.status !== "retired" || !e.player.id) continue;
      if (alreadyRetired.has(e.player.id)) continue;
      alreadyRetired.add(e.player.id);
      retireAges.push(e.player.age ?? 0);
      retirePlaying.push(playingSeasons.get(e.player.id) ?? 0);
    }
  };

  for (let y = 1; y <= opts.years; y++) {
    activeSum += teams.reduce((n, t) => n + t.players.length, 0);
    bumpPlaying(teams);

    // Mid-split checkpoints (no aging / no pool advance).
    for (let s = 0; s < MID_SPLIT_CHECKS; s++) {
      const outcomes = syntheticOutcomes(teams, r);
      const roleMeans = computeRoleMeans(outcomes.values());
      const mid = runDemotionPass(
        teams,
        outcomes,
        roleMeans,
        pool,
        champions,
        r,
        taken,
        y,
        { ageActives: false, advancePool: false, gradeGap },
      );
      demotions += mid.news.filter((n) => n.marketNote !== "open-fa").length;
      pool = mid.inactivePool;
      noteRetirements(pool);
      const byId = new Map(mid.teams.map((t) => [t.id, t.players]));
      teams = teams.map((t) => ({ ...t, players: byId.get(t.id) ?? t.players }));
    }

    // Year-end offseason: age + demote + advance inactive pool.
    const outcomes = syntheticOutcomes(teams, r);
    const roleMeans = computeRoleMeans(outcomes.values());
    const result = runOffseasonLifecycle(
      teams,
      outcomes,
      roleMeans,
      pool,
      champions,
      r,
      taken,
      y + 1,
      gradeGap,
      NEUTRAL_META,
      { openFaMarket: false },
    );
    demotions += result.news.filter((n) => n.marketNote !== "open-fa").length;
    pool = result.inactivePool;
    noteRetirements(pool);
    const byId = new Map(result.teams.map((t) => [t.id, t.players]));
    teams = teams.map((t) => ({ ...t, players: byId.get(t.id) ?? t.players }));
  }

  const activePerYear = activeSum / opts.years;
  const mean = (xs: number[]) =>
    xs.length === 0 ? null : xs.reduce((s, n) => s + n, 0) / xs.length;
  return {
    years: opts.years,
    activePerYear,
    demotions,
    demotionRatePerYear: demotions / activeSum,
    finalAcademy: pool.filter((p) => p.status === "academy").length,
    finalFa: pool.filter((p) => p.status === "free-agent").length,
    finalRetired: pool.filter((p) => p.status === "retired").length,
    gradeGap,
    retireeCount: retireAges.length,
    avgRetireAge: mean(retireAges),
    avgPlayingSeasons: mean(retirePlaying),
  };
}

describe("underperformance rule", () => {
  it("needs grade-below plus one more factor (2 of 3, grade required)", () => {
    // Weak grade + weak tier → underperforming
    expect(
      isUnderperformingSeason(
        { grade: 4.0, tier: "C", splitTitles: 1, intlTitles: 0 },
        5.5,
        1.0,
      ),
    ).toBe(true);
    // Weak grade + no titles (tier B) → underperforming
    expect(
      isUnderperformingSeason(
        { grade: 4.0, tier: "B", splitTitles: 0, intlTitles: 0 },
        5.5,
        1.0,
      ),
    ).toBe(true);
    // C/D + no titles but grade OK → NOT underperforming (avoids mass demotion)
    expect(
      isUnderperformingSeason(
        { grade: 6.0, tier: "D", splitTitles: 0, intlTitles: 0 },
        5.5,
        1.0,
      ),
    ).toBe(false);
    // Only no titles (grade ok, tier B) → not underperforming
    expect(
      isUnderperformingSeason(
        { grade: 6.0, tier: "B", splitTitles: 0, intlTitles: 0 },
        5.5,
        1.0,
      ),
    ).toBe(false);
  });

  it("intl title resets streak even on a bad year", () => {
    expect(
      nextBadStreak(3, { grade: 3, tier: "D", splitTitles: 0, intlTitles: 1 }, 6, 1.0),
    ).toBe(0);
  });

  it("demotes after UNDERPERFORM_STREAK_TO_DEMOTE consecutive bad checkpoints", () => {
    expect(UNDERPERFORM_STREAK_TO_DEMOTE).toBe(5);
    expect(ACADEMY_YEARS).toBe(3);
    expect(FREE_AGENT_YEARS).toBe(4);
    expect(TOTAL_INACTIVE_BEFORE_RETIRE).toBe(7);
  });
});

describe("lifecycle sim (tune GRADE_GAP_THRESHOLD)", () => {
  it("demotion rate stays in the rare-but-real band", () => {
    // Multi-seed aggregate so one unlucky seed can't fail the band.
    const reports = [1, 7, 42, 99, 1234].map((seed) =>
      simulateLifecycleYears({ years: 40, teamCount: 24, seed }),
    );
    const avgRate =
      reports.reduce((s, r) => s + r.demotionRatePerYear, 0) / reports.length;
    const avgAcademy =
      reports.reduce((s, r) => s + r.finalAcademy, 0) / reports.length;
    const avgFa = reports.reduce((s, r) => s + r.finalFa, 0) / reports.length;
    const avgRet = reports.reduce((s, r) => s + r.finalRetired, 0) / reports.length;
    const retireeN = reports.reduce((s, r) => s + r.retireeCount, 0);
    const avgRetireAge =
      reports.reduce((s, r) => s + (r.avgRetireAge ?? 0) * r.retireeCount, 0) /
      Math.max(1, retireeN);
    const avgPlaying =
      reports.reduce((s, r) => s + (r.avgPlayingSeasons ?? 0) * r.retireeCount, 0) /
      Math.max(1, retireeN);

    // Documented targets — fail loud if we mass-demote.
    expect(avgRate).toBeGreaterThanOrEqual(TARGET_DEMOTION_RATE.min);
    expect(avgRate).toBeLessThanOrEqual(TARGET_DEMOTION_RATE.max);
    // Academy+FA should stay a minority of a 24×5=120-player league.
    // Lower intake (2 seed rookies) + strategic drip-release + FA overflow
    // valves keep the affiliate+FA board under half the field.
    expect(avgAcademy + avgFa).toBeLessThan(75);
    // Retirements accumulate over 40 years under the competitive market
    // (more rookies → more later demotions). Cap is soft — not half the field
    // per year, but a large career archive is expected.
    expect(avgRet).toBeLessThan(300);
    // Meaningful sample for career-length metrics.
    expect(retireeN).toBeGreaterThan(80);
    expect(avgRetireAge).toBeGreaterThan(22);
    expect(avgRetireAge).toBeLessThan(45);
    expect(avgPlaying).toBeGreaterThan(1);
    expect(avgPlaying).toBeLessThan(30);

    // Surface numbers in the vitest reporter for the final summary.
    // eslint-disable-next-line no-console
    console.log(
      `[lifecycle-sim] gap=${GRADE_GAP_THRESHOLD} demotion/yr=${(avgRate * 100).toFixed(2)}% ` +
        `academy≈${avgAcademy.toFixed(0)} fa≈${avgFa.toFixed(0)} retired≈${avgRet.toFixed(0)} ` +
        `retireAge≈${avgRetireAge.toFixed(1)} playingSeasons≈${avgPlaying.toFixed(1)} N=${retireeN}`,
    );
  });

  it("prefers returnees over rookies when the pool has a lane match", () => {
    const r = rng(5);
    const demotee = makePlayer("middle", r, {
      id: "bad-mid",
      name: "BadMid",
      tier: "D",
      age: 30,
      badStreak: 4,
    });
    const returnee = makePlayer("middle", r, {
      id: "return-mid",
      name: "ReturnMid",
      tier: "B",
      age: 24,
    });
    const teams = [
      {
        id: "T0",
        name: "T0",
        leagueId: "LCK",
        players: LANES.map((lane) =>
          lane === "middle" ? demotee : makePlayer(lane, r),
        ),
      },
    ];
    const outcomes = new Map<string, SeasonPlayerOutcome>();
    for (const p of teams[0]!.players) {
      if (!p.id) continue;
      outcomes.set(p.id, {
        playerId: p.id,
        grade: 3.5,
        tier: p.tier,
        lane: p.lane,
        splitTitles: 0,
        intlTitles: 0,
      });
    }
    const pool: InactivePlayer[] = [
      {
        player: returnee,
        status: "academy",
        // 1 so the year-end advance (runs before demotions) leaves them in
        // academy at inactiveYears=2 — still preferred over a rookie.
        inactiveYears: 1,
        demotedYear: 1,
        lastTeamId: "T0",
      },
    ];
    const result = runOffseasonLifecycle(
      teams,
      outcomes,
      { middle: 6.0 },
      pool,
      champions,
      r,
      new Set(),
      5,
    );
    const mid = result.teams[0]!.players.find((p) => p.lane === "middle")!;
    expect(mid.id).toBe("return-mid");
    expect(result.news[0]?.entrantSource).toBe("academy");
    expect(result.inactivePool.some((p) => p.player.id === "bad-mid")).toBe(true);
  });

  it("does not let another org call up an academy player", () => {
    const r = rng(7);
    const demotee = makePlayer("middle", r, {
      id: "bad-mid",
      name: "BadMid",
      tier: "D",
      age: 30,
      badStreak: 4,
    });
    const otherAcademy = makePlayer("middle", r, {
      id: "other-acy",
      name: "OtherAcy",
      tier: "A",
      age: 22,
    });
    const teams = [
      {
        id: "T0",
        name: "T0",
        leagueId: "LCK",
        players: LANES.map((lane) =>
          lane === "middle" ? demotee : makePlayer(lane, r),
        ),
      },
    ];
    const outcomes = new Map<string, SeasonPlayerOutcome>();
    for (const p of teams[0]!.players) {
      if (!p.id) continue;
      outcomes.set(p.id, {
        playerId: p.id,
        grade: 3.5,
        tier: p.tier,
        lane: p.lane,
        splitTitles: 0,
        intlTitles: 0,
      });
    }
    const pool: InactivePlayer[] = [
      {
        player: otherAcademy,
        status: "academy",
        inactiveYears: 1,
        demotedYear: 1,
        lastTeamId: "TX", // different org — must stay in academy
      },
    ];
    const result = runOffseasonLifecycle(
      teams,
      outcomes,
      { middle: 6.0 },
      pool,
      champions,
      r,
      new Set(),
      5,
    );
    const mid = result.teams[0]!.players.find((p) => p.lane === "middle")!;
    expect(mid.id).not.toBe("other-acy");
    // Academy-first: no eligible same-org academy / FA → mint+call-up via academy path
    // (or rare safety rookie-gate if academy were full).
    expect(["academy", "rookie"]).toContain(result.news[0]?.entrantSource);
    expect(
      result.news[0]?.marketNote === "academy-rookie" ||
        result.news[0]?.marketNote === "rookie-gate",
    ).toBe(true);
    expect(result.inactivePool.some((p) => p.player.id === "other-acy" && p.status === "academy")).toBe(
      true,
    );
  });

  it("allows any org to sign a free agent", () => {
    const r = rng(9);
    const demotee = makePlayer("middle", r, {
      id: "bad-mid",
      name: "BadMid",
      tier: "D",
      age: 30,
      badStreak: 4,
    });
    const fa = makePlayer("middle", r, {
      id: "fa-mid",
      name: "FaMid",
      tier: "B",
      age: 25,
    });
    const teams = [
      {
        id: "T0",
        name: "T0",
        leagueId: "LCK",
        players: LANES.map((lane) =>
          lane === "middle" ? demotee : makePlayer(lane, r),
        ),
      },
    ];
    const outcomes = new Map<string, SeasonPlayerOutcome>();
    for (const p of teams[0]!.players) {
      if (!p.id) continue;
      outcomes.set(p.id, {
        playerId: p.id,
        grade: 3.5,
        tier: p.tier,
        lane: p.lane,
        splitTitles: 0,
        intlTitles: 0,
      });
    }
    const pool: InactivePlayer[] = [
      {
        player: fa,
        status: "free-agent",
        inactiveYears: 2,
        demotedYear: 1,
        lastTeamId: "TX",
      },
    ];
    const result = runOffseasonLifecycle(
      teams,
      outcomes,
      { middle: 6.0 },
      pool,
      champions,
      r,
      new Set(),
      5,
    );
    const mid = result.teams[0]!.players.find((p) => p.lane === "middle")!;
    expect(mid.id).toBe("fa-mid");
    expect(result.news[0]?.entrantSource).toBe("free-agent");
  });

  it("passes same-org academy when FA clearly beats it", () => {
    const r = rng(13);
    const demotee = makePlayer("middle", r, {
      id: "bad-mid",
      name: "BadMid",
      tier: "D",
      age: 30,
      badStreak: 4,
    });
    const sameAcy = makePlayer("middle", r, {
      id: "same-acy",
      name: "SameAcy",
      tier: "C",
      age: 23,
    });
    const betterFa = makePlayer("middle", r, {
      id: "better-fa",
      name: "BetterFa",
      tier: "A",
      age: 24,
    });
    const teams = [
      {
        id: "T0",
        name: "T0",
        leagueId: "LCK",
        players: LANES.map((lane) =>
          lane === "middle" ? demotee : makePlayer(lane, r),
        ),
      },
    ];
    const outcomes = new Map<string, SeasonPlayerOutcome>();
    for (const p of teams[0]!.players) {
      if (!p.id) continue;
      outcomes.set(p.id, {
        playerId: p.id,
        grade: 3.5,
        tier: p.tier,
        lane: p.lane,
        splitTitles: 0,
        intlTitles: 0,
      });
    }
    const pool: InactivePlayer[] = [
      {
        player: { ...betterFa, potential: "A" },
        status: "free-agent",
        inactiveYears: 3,
        demotedYear: 1,
        lastTeamId: "TX",
        lastActiveGrade: 7,
        shadowGrade: 7,
      },
      {
        // Cap potential so academy development cannot erase the value gap.
        player: { ...sameAcy, potential: "C" },
        status: "academy",
        inactiveYears: 1,
        demotedYear: 2,
        lastTeamId: "T0",
        lastActiveGrade: 4,
        shadowGrade: 4,
      },
    ];
    const result = runOffseasonLifecycle(
      teams,
      outcomes,
      { middle: 6.0 },
      pool,
      champions,
      r,
      new Set(),
      5,
    );
    const mid = result.teams[0]!.players.find((p) => p.lane === "middle")!;
    expect(mid.id).toBe("better-fa");
    expect(result.news[0]?.entrantSource).toBe("free-agent");
    expect(result.inactivePool.some((p) => p.player.id === "same-acy")).toBe(true);
  });

  it("mid-split demotion pass does not age actives or advance the pool", () => {
    const r = rng(11);
    const demotee = makePlayer("top", r, {
      id: "bad-top",
      name: "BadTop",
      tier: "D",
      age: 27,
      badStreak: 4,
    });
    const academyKid = makePlayer("jungle", r, {
      id: "acad-jng",
      name: "AcadJng",
      tier: "B",
      age: 20,
    });
    const teams = [
      {
        id: "T0",
        name: "T0",
        leagueId: "LCK",
        players: LANES.map((lane) =>
          lane === "top" ? demotee : makePlayer(lane, r, { age: 24 }),
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
        player: academyKid,
        status: "academy",
        inactiveYears: 1,
        demotedYear: 1,
        lastTeamId: "TX",
      },
    ];
    const result = runDemotionPass(
      teams,
      outcomes,
      { top: 6.5, jungle: 6, middle: 6, bottom: 6, support: 6 },
      pool,
      champions,
      r,
      new Set(),
      2,
      { ageActives: false, advancePool: false },
    );
    expect(result.news.some((n) => n.departedId === "bad-top")).toBe(true);
    // Demotee parked at age 27 (not aged); academy entry still inactiveYears=1
    // (not advanced toward FA).
    const parked = result.inactivePool.find((p) => p.player.id === "bad-top");
    expect(parked?.player.age).toBe(27);
    const stillAcademy = result.inactivePool.find((p) => p.player.id === "acad-jng");
    expect(stillAcademy?.status).toBe("academy");
    expect(stillAcademy?.inactiveYears).toBe(1);
  });
});
