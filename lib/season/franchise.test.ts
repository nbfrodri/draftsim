import { describe, it, expect } from "vitest";

import type { Champion, Lane } from "../types";
import { LANE_ORDER } from "../players";
import { generateSeasonTeams } from "./teamGen";
import { createSeason } from "./engine";
import {
  seedFranchise,
  seedOpeningAcademies,
  seedOpeningFreeAgents,
  startNextSeason,
  continuityFormBonus,
  CONTINUITY_FORM_BONUS,
  applyUserManualDemote,
  applyUserAcademyRecall,
  applyUserRookieSign,
  applyUserAcademyRookie,
  applyMidSplitDemotions,
  fillFollowedRosterVacancies,
  fillRosterVacancies,
  aiDecideFollowedDemotes,
  splitFromRosterTimeMark,
  visibleTransferDigestEvents,
  transferDigestSectionTitle,
  transfersForDigestEvent,
  transfersForHistoryArchive,
} from "./franchise";
import {
  USER_MAX_MANUAL_DEMOTES,
  ACADEMY_MAX_PER_TEAM,
  USER_ACADEMY_ROOKIE_SOFT_MAX,
  INITIAL_ACADEMY_ROOKIES_PER_TEAM,
  INITIAL_OPENING_FA_POOL,
  isRosterVacancy,
  makeVacancyPlaceholder,
  listTeamAcademy,
  countTeamAcademy,
  buildAcademyBoard,
  NEUTRAL_META,
} from "./faMarket";
import { seedAgencyWindow, honorAgencyDemand } from "./franchiseAgency";
import {
  ACADEMY_YEARS,
  yearsAsFreeAgent,
  yearsInAcademy,
  advanceInactivePool,
  inactiveSnapshotsForArchivedYear,
} from "./playerLifecycle";
import {
  LEAGUE_IDS,
  type SeasonConfig,
  type SeasonLeagueConfig,
} from "./types";

function rngFrom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let nid = 1;
function champPool(): Champion[] {
  const out: Champion[] = [];
  for (const lane of LANE_ORDER) {
    for (let i = 0; i < 8; i++) {
      out.push({ id: nid++, name: `${lane}-${i}`, alias: `${lane}-${i}`, roles: [], iconUrl: "", lanes: [lane as Lane] });
    }
  }
  return out;
}

const LEAGUE_CFG: SeasonLeagueConfig = {
  format: "round-robin-playoffs",
  playoffTeams: 4,
  regularSeries: "bo1",
  playoffSeries: "bo5",
};
function makeConfig(): SeasonConfig {
  return {
    name: "Test",
    sharedLeagueConfig: true,
    leagueConfigs: Object.fromEntries(LEAGUE_IDS.map((l) => [l, { ...LEAGUE_CFG }])) as Record<
      (typeof LEAGUE_IDS)[number],
      SeasonLeagueConfig
    >,
    liveMeta: false,
    patchShift: false,
    fearless: false,
    aiDifficulty: "normal",
    controlledTeamId: null,
    playerDevelopment: true,
  };
}

const champions = champPool();
const meta = { metaOverride: null, metaEnabled: true, synergyOverride: null, counterOverride: null };

function makeReality(aging = true) {
  const teams = generateSeasonTeams(champions, rngFrom(3));
  const base = createSeason({ config: makeConfig(), teams, activeMeta: meta });
  return seedFranchise(base, "Alpha", aging, rngFrom(9), champions);
}

describe("seedFranchise", () => {
  it("stamps a year-1 franchise and ages/potentials on every player", () => {
    const s = makeReality();
    expect(s.franchise?.year).toBe(1);
    expect(s.franchise?.name).toBe("Alpha");
    for (const t of s.teams) {
      for (const p of t.players) {
        expect(typeof p.age).toBe("number");
        expect(p.potential).toBeTruthy();
        expect(p.id).toBeTruthy();
      }
    }
  });

  it(`seeds ${INITIAL_ACADEMY_ROOKIES_PER_TEAM} academy rookies per team when aging is on`, () => {
    const s = makeReality(true);
    expect(s.franchise?.aging).toBe(true);
    const pool = s.franchise!.inactivePool ?? [];
    expect(INITIAL_ACADEMY_ROOKIES_PER_TEAM).toBeLessThanOrEqual(ACADEMY_MAX_PER_TEAM);
    for (const t of s.teams) {
      const acy = pool.filter((e) => e.status === "academy" && e.lastTeamId === t.id);
      expect(acy).toHaveLength(INITIAL_ACADEMY_ROOKIES_PER_TEAM);
      // Every seed is a true year-1 prospect — the cohort desync shifts the
      // personal tenure (even slots graduate a year early), never the badge.
      expect(acy.map((e) => e.inactiveYears)).toEqual([1, 1]);
      const shifts = acy.map((e) => e.academyTenureShift ?? 0).sort((a, b) => a - b);
      expect(shifts).toEqual([-1, 0]);
      for (const e of acy) {
        expect(e.player.id).toBeTruthy();
        expect(e.player.name).toBeTruthy();
        expect(typeof e.player.age).toBe("number");
        expect(e.player.potential).toBeTruthy();
        expect(e.player.debutYear).toBe(1);
      }
    }
    // All academy handles are unique and recorded in usedNames.
    const names = pool
      .filter((e) => e.status === "academy")
      .map((e) => e.player.name!)
      .filter(Boolean);
    expect(new Set(names).size).toBe(names.length);
    for (const n of names) expect(s.franchise!.usedNames).toContain(n);
  });

  it("skips opening academy when aging is off", () => {
    const s = makeReality(false);
    expect(s.franchise?.inactivePool ?? []).toEqual([]);
  });

  it("is idempotent when seedOpeningAcademies is re-run", () => {
    const s = makeReality(true);
    const taken = new Set(s.franchise!.usedNames ?? []);
    const again = seedOpeningAcademies(
      s.teams,
      s.franchise!.inactivePool ?? [],
      champions,
      rngFrom(99),
      taken,
      1,
    );
    expect(again).toHaveLength((s.franchise!.inactivePool ?? []).length);
    for (const t of s.teams) {
      expect(countTeamAcademy(again, t.id)).toBe(INITIAL_ACADEMY_ROOKIES_PER_TEAM);
    }
  });

  it(`seeds ${INITIAL_OPENING_FA_POOL} opening free agents at FA · 1y when aging is on`, () => {
    const s = makeReality(true);
    const pool = s.franchise!.inactivePool ?? [];
    const fas = pool.filter((e) => e.status === "free-agent");
    expect(INITIAL_OPENING_FA_POOL).toBe(22);
    expect(fas).toHaveLength(INITIAL_OPENING_FA_POOL);
    const laneCounts = new Map<string, number>();
    for (const e of fas) {
      expect(e.lastTeamId).toBe("");
      expect(e.lastTeamName).toBeUndefined();
      // FA · 1y snap (ACADEMY_YEARS + 1), not raw 1 — raw 1 stalls the FA clock.
      expect(e.inactiveYears).toBe(ACADEMY_YEARS + 1);
      expect(yearsAsFreeAgent("free-agent", e.inactiveYears)).toBe(1);
      expect(e.demotedYear).toBe(1);
      expect(e.player.debutYear).toBe(1);
      expect(e.player.id).toBeTruthy();
      expect(e.player.name).toBeTruthy();
      laneCounts.set(e.player.lane, (laneCounts.get(e.player.lane) ?? 0) + 1);
    }
    // Mix roles across the five lanes.
    expect(laneCounts.size).toBe(LANE_ORDER.length);
    for (const lane of LANE_ORDER) {
      expect(laneCounts.get(lane) ?? 0).toBeGreaterThan(0);
    }
    const names = fas.map((e) => e.player.name!).filter(Boolean);
    expect(new Set(names).size).toBe(names.length);
    for (const n of names) expect(s.franchise!.usedNames).toContain(n);
  });

  it("is idempotent when seedOpeningFreeAgents is re-run", () => {
    const s = makeReality(true);
    const taken = new Set(s.franchise!.usedNames ?? []);
    const again = seedOpeningFreeAgents(
      s.franchise!.inactivePool ?? [],
      champions,
      rngFrom(42),
      taken,
      1,
    );
    expect(again.filter((e) => e.status === "free-agent")).toHaveLength(
      INITIAL_OPENING_FA_POOL,
    );
    expect(again).toHaveLength((s.franchise!.inactivePool ?? []).length);
  });

  it("opening FA mint-year skip archives as FA · 1y (not 2y)", () => {
    const s = makeReality(true);
    const fa = (s.franchise!.inactivePool ?? []).find((e) => e.status === "free-agent")!;
    expect(yearsAsFreeAgent("free-agent", fa.inactiveYears)).toBe(1);
    // Same demotedYear skip as academy mint: closing year 1 does not tick badge.
    const advanced = advanceInactivePool(
      s.franchise!.inactivePool ?? [],
      rngFrom(7),
      champions,
      1,
    );
    const still = advanced.find((e) => e.player.id === fa.player.id)!;
    expect(still.inactiveYears).toBe(ACADEMY_YEARS + 1);
    expect(yearsAsFreeAgent("free-agent", still.inactiveYears)).toBe(1);
    const snaps = inactiveSnapshotsForArchivedYear(
      s.franchise!.inactivePool ?? [],
      advanced,
      1,
    );
    const snap = snaps.find((x) => x.playerId === fa.player.id)!;
    expect(snap.status).toBe("free-agent");
    expect(snap.inactiveYears).toBe(ACADEMY_YEARS + 1);
  });

  it("archives every year-1 academy seed as Acy · 1y (stagger must not inflate the badge)", () => {
    const y1 = makeReality(true);
    const prePool = y1.franchise!.inactivePool ?? [];
    const seeded = new Set(
      prePool.filter((e) => e.status === "academy").map((e) => e.player.id!),
    );
    expect(seeded.size).toBeGreaterThan(0);
    const y2 = startNextSeason(y1, champions, rngFrom(11));
    const snaps = inactiveSnapshotsForArchivedYear(
      prePool,
      y2.franchise!.inactivePool ?? [],
      1,
    );
    const yearOne = snaps.filter(
      (s) => seeded.has(s.playerId) && s.status === "academy",
    );
    expect(yearOne.length).toBeGreaterThan(0);
    for (const s of yearOne) {
      expect(yearsInAcademy("academy", s.inactiveYears)).toBe(1);
    }
  });

  it("opening seed stamps clockYear so year 1 archives Acy · 1y / FA · 1y", () => {
    const y1 = makeReality(true);
    const prePool = y1.franchise!.inactivePool ?? [];
    expect(prePool.length).toBeGreaterThan(0);
    for (const e of prePool) expect(e.clockYear).toBe(1);

    const y2 = startNextSeason(y1, champions, rngFrom(77));
    const snaps = inactiveSnapshotsForArchivedYear(
      prePool,
      y2.franchise!.inactivePool ?? [],
      1,
    );
    const seeded = new Set(prePool.map((e) => e.player.id!));
    const year1 = snaps.filter((s) => seeded.has(s.playerId));
    expect(year1.length).toBeGreaterThan(0);
    for (const s of year1) {
      if (s.status === "academy") {
        expect(yearsInAcademy("academy", s.inactiveYears)).toBe(1);
      } else if (s.status === "free-agent") {
        expect(yearsAsFreeAgent("free-agent", s.inactiveYears)).toBe(1);
      }
    }
  });

  it("archived academy badge always equals real tenure (every mint path, 5 years)", () => {
    let season = makeReality(true);
    let checked = 0;
    for (let year = 1; year <= 5; year++) {
      const prePool = season.franchise!.inactivePool ?? [];
      const next = startNextSeason(season, champions, rngFrom(100 + year));
      const snaps = inactiveSnapshotsForArchivedYear(
        prePool,
        next.franchise!.inactivePool ?? [],
        year,
      );
      for (const s of snaps) {
        if (s.status !== "academy") continue;
        checked++;
        // 1-based tenure from the year the academy clock started — never
        // inflated by a mint-time offset, never burned by the closing-year
        // tick. Keyed off clockYear, not demotedYear: an FA stashed back into
        // an academy restarts the badge but keeps the year they left a roster.
        expect([s.playerId, s.inactiveYears]).toEqual([
          s.playerId,
          year - (s.clockYear ?? s.demotedYear) + 1,
        ]);
        expect(s.demotedYear).toBeLessThanOrEqual(s.clockYear ?? s.demotedYear);
      }
      season = next;
    }
    expect(checked).toBeGreaterThan(50);
  });
});

describe("continuityFormBonus", () => {
  it("rewards keeping the majority, scaling up to full retention", () => {
    expect(continuityFormBonus(5)).toBeCloseTo(CONTINUITY_FORM_BONUS); // kept all
    expect(continuityFormBonus(3)).toBeGreaterThan(0); // kept the majority
    expect(continuityFormBonus(4)).toBeGreaterThan(continuityFormBonus(3));
    expect(continuityFormBonus(2)).toBe(0); // below majority → nothing
    expect(continuityFormBonus(0)).toBe(0);
  });

  it("seeds a starting form bonus on year rollover when form is tracked", () => {
    // Form must be enabled (formDrift) for teamForm to exist and be seeded.
    const cfg = { ...makeConfig(), formDrift: true };
    const teams = generateSeasonTeams(champions, rngFrom(3));
    const base = createSeason({ config: cfg, teams, activeMeta: meta });
    const y1 = seedFranchise(base, "Alpha", true, rngFrom(9), champions);
    const y2 = startNextSeason(y1, champions, rngFrom(11));
    const forms = Object.values(y2.teamForm ?? {});
    // Most rosters survive an offseason largely intact → at least one team
    // carries a positive continuity bonus, and every seeded value is a valid
    // bonus (0 < f ≤ CONTINUITY_FORM_BONUS).
    expect(forms.some((f) => f > 0)).toBe(true);
    for (const f of forms) {
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(CONTINUITY_FORM_BONUS);
    }
  });
});

describe("startNextSeason", () => {
  it("rolls into year 2 keeping the same teams + franchise id, every slot filled", () => {
    const y1 = makeReality();
    const y2 = startNextSeason(y1, champions, rngFrom(11));
    expect(y2.franchise?.year).toBe(2);
    expect(y2.franchise?.id).toBe(y1.franchise?.id);
    // Same franchise teams (ids preserved).
    expect(new Set(y2.teams.map((t) => t.id))).toEqual(new Set(y1.teams.map((t) => t.id)));
    // Every roster still has 5 named, aged players (retirees replaced by rookies).
    for (const t of y2.teams) {
      expect(t.players).toHaveLength(5);
      for (const p of t.players) {
        expect(p.id).toBeTruthy();
        expect(typeof p.age).toBe("number");
        expect(p.name).toBeTruthy();
      }
    }
    // It's a fresh, playable season (Winter created).
    expect(y2.phases[0].tournamentIds.length).toBeGreaterThan(0);
    expect(y2.status).toBe("in-progress");
    // Regression: tournaments must carry the season's id, or the store rejects
    // every sim update and the new year never progresses.
    for (const tid of y2.phases[0].tournamentIds) {
      expect(y2.tournaments[tid].seasonId).toBe(y2.id);
    }
  });

  it("resets live rosterNews to Offseason-only (no prior-year split marks)", () => {
    const base = makeReality(true);
    const seeded = {
      ...base,
      status: "complete" as const,
      rosterNews: [
        {
          teamId: base.teams[0]!.id,
          lane: "middle" as const,
          entrantName: "Bench",
          entrantTier: "C" as const,
          entrantPotential: "B" as const,
          entrantSource: "academy" as const,
          departedName: "OldMid",
          departedTier: "C" as const,
          timeMark: "MSI window",
          marketNote: "ai-demote" as const,
        },
        {
          teamId: base.teams[0]!.id,
          lane: "top" as const,
          entrantName: "Bench2",
          entrantTier: "C" as const,
          entrantPotential: "B" as const,
          entrantSource: "academy" as const,
          departedName: "OldTop",
          departedTier: "C" as const,
          timeMark: "Spring",
          marketNote: "ai-demote" as const,
        },
      ],
    };
    const y2 = startNextSeason(seeded, champions, rngFrom(11));
    expect((y2.rosterNews ?? []).some((n) => n.timeMark === "MSI window")).toBe(false);
    expect((y2.rosterNews ?? []).some((n) => n.timeMark === "Spring")).toBe(false);
    expect((y2.rosterNews ?? []).some((n) => n.timeMark === "Winter")).toBe(false);
    expect((y2.rosterNews ?? []).some((n) => n.timeMark === "First Stand window")).toBe(false);
    for (const n of y2.rosterNews ?? []) {
      expect(n.timeMark === "Offseason" || n.timeMark == null).toBe(true);
    }
  });

  it("with aging OFF, carries the exact same players (no ageing/rookies)", () => {
    const y1 = makeReality(false);
    const y2 = startNextSeason(y1, champions, rngFrom(11));
    expect(y2.franchise?.aging).toBe(false);
    // Same set of players (offseason transfers relocate them, but nobody is
    // aged out or replaced by a rookie).
    const before = y1.teams.flatMap((t) => t.players);
    const ageById = new Map(y2.teams.flatMap((t) => t.players).map((p) => [p.id, p.age]));
    expect(ageById.size).toBe(before.length); // no retirements / new rookies
    // No birthdays: each player's age is identical year-over-year (by id).
    for (const p of before) expect(ageById.get(p.id!)).toBe(p.age);
  });
});

describe("applyUserManualDemote", () => {
  function offseasonFollowed() {
    const base = makeReality(true);
    const teamId = base.teams[0]!.id;
    return {
      ...base,
      status: "complete" as const,
      config: { ...base.config, controlledTeamId: teamId },
    };
  }

  it("parks demotee in academy at 1y, opens vacancy, blocks same-window recall", () => {
    const season = offseasonFollowed();
    const me = season.config.controlledTeamId!;
    const lane = "middle" as Lane;
    const before = season.teams.find((t) => t.id === me)!.players.find((p) => p.lane === lane)!;
    expect(before.id).toBeTruthy();

    const next = applyUserManualDemote(season, lane);
    expect(next).not.toBeNull();
    const slot = next!.teams.find((t) => t.id === me)!.players.find((p) => p.lane === lane)!;
    expect(isRosterVacancy(slot)).toBe(true);

    const parked = next!.franchise!.inactivePool!.find((e) => e.player.id === before.id);
    expect(parked?.status).toBe("academy");
    expect(parked?.inactiveYears).toBe(1);
    expect(parked?.lastTeamId).toBe(me);
    expect(next!.franchise!.sameWindowDemoteIds).toContain(before.id);
    expect(next!.franchise!.manualDemotesThisWindow).toBe(1);
    expect(next!.rosterNews?.some((n) => n.marketNote === "manual-demote")).toBe(true);
    expect(
      next!.rosterNews?.find((n) => n.marketNote === "manual-demote")?.timeMark,
    ).toBe("Offseason");

    // Display helpers must still list the demotee (UI exclude is call-up only).
    const listed = listTeamAcademy(next!.franchise!.inactivePool!, me);
    expect(listed.some((e) => e.player.id === before.id)).toBe(true);
    const board = buildAcademyBoard(
      next!.franchise!.inactivePool!,
      me,
      "all",
      new Map(),
      NEUTRAL_META,
    );
    expect(board.some((r) => r.entry.player.id === before.id)).toBe(true);

    // Same-window recall of the demotee must fail.
    const recall = applyUserAcademyRecall(next!, champions, lane, before.id!);
    expect(recall).toBeNull();
  });

  it(`caps at ${USER_MAX_MANUAL_DEMOTES} demotes per window`, () => {
    let season = offseasonFollowed();
    const lanes: Lane[] = ["top", "jungle", "middle"];
    for (let i = 0; i < USER_MAX_MANUAL_DEMOTES; i++) {
      const next = applyUserManualDemote(season, lanes[i]!);
      expect(next).not.toBeNull();
      season = next!;
    }
    expect(applyUserManualDemote(season, lanes[USER_MAX_MANUAL_DEMOTES]!)).toBeNull();
  });

  it("AI-fills vacancies without recalling same-window demotee", () => {
    const season = offseasonFollowed();
    const me = season.config.controlledTeamId!;
    const lane = "support" as Lane;
    const before = season.teams.find((t) => t.id === me)!.players.find((p) => p.lane === lane)!;
    const demoted = applyUserManualDemote(season, lane)!;
    const filled = fillFollowedRosterVacancies(demoted, champions, rngFrom(42));
    const slot = filled.teams.find((t) => t.id === me)!.players.find((p) => p.lane === lane)!;
    expect(isRosterVacancy(slot)).toBe(false);
    expect(slot.id).not.toBe(before.id);
    expect(
      filled.franchise!.inactivePool!.some(
        (e) => e.player.id === before.id && e.status === "academy",
      ),
    ).toBe(true);
  });

  it("user rookie fills vacant lane without consuming FA signs", () => {
    const season = offseasonFollowed();
    const me = season.config.controlledTeamId!;
    const lane = "jungle" as Lane;
    const demoted = applyUserManualDemote(season, lane)!;
    expect(demoted.franchise!.faSignsThisWindow ?? 0).toBe(0);

    const next = applyUserRookieSign(demoted, champions, lane, rngFrom(7));
    expect(next).not.toBeNull();
    const slot = next!.teams.find((t) => t.id === me)!.players.find((p) => p.lane === lane)!;
    expect(isRosterVacancy(slot)).toBe(false);
    expect(slot.name).toBeTruthy();
    expect(slot.age).toBeDefined();
    expect(slot.id).toBeTruthy();
    expect(next!.franchise!.faSignsThisWindow ?? 0).toBe(0);
    expect(next!.franchise!.sameWindowRookieIds).toContain(slot.id);
    expect(next!.rosterNews?.some((n) => n.marketNote === "academy-rookie")).toBe(true);
    // Non-vacant: no-op
    expect(applyUserRookieSign(next!, champions, lane, rngFrom(8))).toBeNull();
  });

  it("user academy rookie parks in academy without touching main roster", () => {
    const season = offseasonFollowed();
    const me = season.config.controlledTeamId!;
    const beforeCount = countTeamAcademy(season.franchise!.inactivePool ?? [], me);
    const beforeIds = season.teams
      .find((t) => t.id === me)!
      .players.map((p) => p.id)
      .join(",");
    const next = applyUserAcademyRookie(season, champions, "middle", rngFrom(21));
    expect(next).not.toBeNull();
    expect(
      next!.teams.find((t) => t.id === me)!.players.map((p) => p.id).join(","),
    ).toBe(beforeIds);
    expect(next!.franchise!.faSignsThisWindow ?? 0).toBe(0);
    const acy = next!.franchise!.inactivePool!.filter(
      (e) => e.status === "academy" && e.lastTeamId === me,
    );
    expect(acy.length).toBe(beforeCount + 1);
    const minted = acy.find(
      (e) =>
        e.player.debutYear === season.franchise!.year &&
        next!.rosterNews?.some(
          (n) => n.marketNote === "academy-rookie" && n.entrantId === e.player.id,
        ),
    );
    expect(minted?.inactiveYears).toBe(1);
    expect(next!.rosterNews?.some((n) => n.marketNote === "academy-rookie")).toBe(true);

    // Fill to soft cap then block (leaves one hard-cap slot for demotions).
    let full = next!;
    const room = USER_ACADEMY_ROOKIE_SOFT_MAX - acy.length;
    for (let i = 0; i < room; i++) {
      full = applyUserAcademyRookie(full, champions, undefined, rngFrom(30 + i))!;
    }
    expect(countTeamAcademy(full.franchise!.inactivePool!, me)).toBe(USER_ACADEMY_ROOKIE_SOFT_MAX);
    expect(applyUserAcademyRookie(full, champions, "top", rngFrom(99))).toBeNull();
  });

  it("rejects benching a rookie signed in the same window", () => {
    const season = offseasonFollowed();
    const me = season.config.controlledTeamId!;
    const lane = "top" as Lane;
    const demoted = applyUserManualDemote(season, lane)!;
    const signed = applyUserRookieSign(demoted, champions, lane, rngFrom(11))!;
    const rookie = signed.teams.find((t) => t.id === me)!.players.find((p) => p.lane === lane)!;
    expect(signed.franchise!.sameWindowRookieIds).toContain(rookie.id);

    expect(applyUserManualDemote(signed, lane)).toBeNull();
    // Cap counter and roster unchanged.
    expect(signed.franchise!.manualDemotesThisWindow).toBe(1);
    const still = signed.teams.find((t) => t.id === me)!.players.find((p) => p.lane === lane)!;
    expect(still.id).toBe(rookie.id);
  });
});

describe("aiDecideFollowedDemotes", () => {
  function offseasonFollowed() {
    const base = makeReality(true);
    const teamId = base.teams[0]!.id;
    return {
      ...base,
      status: "complete" as const,
      config: { ...base.config, controlledTeamId: teamId },
    };
  }

  it("benches a weak lane when FA beats incumbent by open-FA gap, then fills", () => {
    let season = offseasonFollowed();
    const me = season.config.controlledTeamId!;
    const lane = "middle" as Lane;
    const weak = {
      id: "ai-weak-mid",
      name: "AiWeakMid",
      lane,
      tier: "D" as const,
      age: 28,
      goodChamps: [] as number[],
      badChamps: [] as number[],
      potential: "D" as const,
    };
    season = {
      ...season,
      teams: season.teams.map((t) =>
        t.id !== me
          ? t
          : {
              ...t,
              players: t.players.map((p) => (p.lane === lane ? { ...weak } : p)),
            },
      ),
      franchise: {
        ...season.franchise!,
        inactivePool: [
          {
            player: {
              id: "ai-star-fa",
              name: "AiStarFa",
              lane,
              tier: "S",
              age: 23,
              goodChamps: champions.filter((c) => c.lanes.includes(lane)).slice(0, 3).map((c) => c.id),
              badChamps: [],
              potential: "S",
            },
            status: "free-agent",
            inactiveYears: 3,
            demotedYear: 1,
            lastTeamId: "TX",
            lastActiveGrade: 8.5,
            shadowGrade: 8,
          },
        ],
      },
    };

    const next = aiDecideFollowedDemotes(season, champions, rngFrom(7));
    const slot = next.teams.find((t) => t.id === me)!.players.find((p) => p.lane === lane)!;
    expect(isRosterVacancy(slot)).toBe(false);
    expect(slot.id).toBe("ai-star-fa");
    expect(next.franchise!.sameWindowDemoteIds).toContain("ai-weak-mid");
    expect(next.franchise!.manualDemotesThisWindow).toBeGreaterThanOrEqual(1);
    expect(next.rosterNews?.some((n) => n.marketNote === "ai-demote" && n.departedId === "ai-weak-mid")).toBe(
      true,
    );
    expect(
      next.franchise!.inactivePool!.some(
        (e) => e.player.id === "ai-weak-mid" && e.status === "academy",
      ),
    ).toBe(true);
    // Same-window demotee never returns.
    expect(slot.id).not.toBe("ai-weak-mid");
  });

  it("does nothing when no FA/academy clears the replace gap", () => {
    let season = offseasonFollowed();
    const me = season.config.controlledTeamId!;
    // Drop opening FA board — this case asserts no upgrade exists to trigger AI demote.
    season = {
      ...season,
      franchise: {
        ...season.franchise!,
        inactivePool: (season.franchise!.inactivePool ?? []).filter(
          (e) => e.status !== "free-agent",
        ),
      },
    };
    const before = season.teams.find((t) => t.id === me)!.players.map((p) => p.id);
    const next = aiDecideFollowedDemotes(season, champions, rngFrom(3));
    const after = next.teams.find((t) => t.id === me)!.players.map((p) => p.id);
    expect(after).toEqual(before);
    expect(next.franchise!.manualDemotesThisWindow ?? 0).toBe(0);
    expect(next.rosterNews?.some((n) => n.marketNote === "ai-demote")).toBeFalsy();
  });

  it(`respects the ${USER_MAX_MANUAL_DEMOTES} demote cap shared with manual benches`, () => {
    let season = offseasonFollowed();
    const me = season.config.controlledTeamId!;
    // Spend the full manual demote budget first.
    for (const lane of ["top", "jungle"] as Lane[]) {
      season = applyUserManualDemote(season, lane)!;
    }
    expect(season.franchise!.manualDemotesThisWindow).toBe(USER_MAX_MANUAL_DEMOTES);

    // Plant a clear FA upgrade — AI still must not demote past the cap.
    season = {
      ...season,
      franchise: {
        ...season.franchise!,
        inactivePool: [
          ...(season.franchise!.inactivePool ?? []),
          {
            player: {
              id: "capped-fa",
              name: "CappedFa",
              lane: "middle" as Lane,
              tier: "S",
              age: 22,
              goodChamps: [],
              badChamps: [],
              potential: "S",
            },
            status: "free-agent",
            inactiveYears: 3,
            demotedYear: 1,
            lastTeamId: "TX",
            lastActiveGrade: 9,
            shadowGrade: 9,
          },
        ],
      },
      teams: season.teams.map((t) =>
        t.id !== me
          ? t
          : {
              ...t,
              players: t.players.map((p) =>
                p.lane === "middle"
                  ? { ...p, id: "still-weak", name: "StillWeak", tier: "D" as const }
                  : p,
              ),
            },
      ),
    };

    const next = aiDecideFollowedDemotes(season, champions, rngFrom(5));
    expect(next.franchise!.manualDemotesThisWindow).toBe(USER_MAX_MANUAL_DEMOTES);
    expect(next.rosterNews?.some((n) => n.marketNote === "ai-demote")).toBeFalsy();
    expect(next.teams.find((t) => t.id === me)!.players.find((p) => p.lane === "middle")!.id).toBe(
      "still-weak",
    );
  });

  it("does not bench a same-window rookie even with a clear FA upgrade", () => {
    let season = offseasonFollowed();
    const me = season.config.controlledTeamId!;
    const lane = "middle" as Lane;
    season = applyUserManualDemote(season, lane)!;
    season = applyUserRookieSign(season, champions, lane, rngFrom(13))!;
    const rookie = season.teams.find((t) => t.id === me)!.players.find((p) => p.lane === lane)!;
    expect(season.franchise!.sameWindowRookieIds).toContain(rookie.id);

    // Plant a star FA that would otherwise justify an AI demote.
    season = {
      ...season,
      franchise: {
        ...season.franchise!,
        inactivePool: [
          ...(season.franchise!.inactivePool ?? []),
          {
            player: {
              id: "rook-upgrade-fa",
              name: "RookUpgradeFa",
              lane,
              tier: "S" as const,
              age: 22,
              goodChamps: champions.filter((c) => c.lanes.includes(lane)).slice(0, 3).map((c) => c.id),
              badChamps: [],
              potential: "S" as const,
            },
            status: "free-agent",
            inactiveYears: 3,
            demotedYear: 1,
            lastTeamId: "TX",
            lastActiveGrade: 9,
            shadowGrade: 9,
          },
        ],
      },
    };

    const next = aiDecideFollowedDemotes(season, champions, rngFrom(9));
    const slot = next.teams.find((t) => t.id === me)!.players.find((p) => p.lane === lane)!;
    expect(slot.id).toBe(rookie.id);
    expect(next.rosterNews?.some((n) => n.marketNote === "ai-demote" && n.departedId === rookie.id)).toBeFalsy();
  });
});

describe("mid-split transfer window academy market", () => {
  function transferFollowed(pending?: "winter" | "spring") {
    const base = makeReality(true);
    const teamId = base.teams[0]!.id;
    const phases = [...base.phases];
    // Find or inject an in-progress transfer phase as current.
    const transferIdx = phases.findIndex((p) => p.kind === "transfer");
    const idx = transferIdx >= 0 ? transferIdx : 0;
    if (transferIdx < 0) {
      phases[0] = {
        kind: "transfer",
        event: "first-stand",
        label: "Transfer",
        tournamentIds: [],
        status: "in-progress",
      };
    } else {
      phases[idx] = { ...phases[idx]!, status: "in-progress" };
    }
    return {
      ...base,
      status: "in-progress" as const,
      phaseIndex: idx,
      phases,
      config: {
        ...base.config,
        controlledTeamId: teamId,
        playerTransfers: true,
      },
      franchise: {
        ...base.franchise!,
        ...(pending ? { pendingMidSplitDemotion: pending } : {}),
      },
    };
  }

  it("user can add academy rookie during First Stand / MSI transfer window", () => {
    const season = transferFollowed();
    const me = season.config.controlledTeamId!;
    const before = countTeamAcademy(season.franchise!.inactivePool ?? [], me);
    const next = applyUserAcademyRookie(season, champions, "support", rngFrom(44));
    expect(next).not.toBeNull();
    expect(countTeamAcademy(next!.franchise!.inactivePool!, me)).toBe(before + 1);
    const rook = next!.franchise!.inactivePool!.find(
      (e) =>
        e.status === "academy" &&
        e.lastTeamId === me &&
        e.player.debutYear === season.franchise!.year &&
        next!.rosterNews?.some(
          (n) => n.marketNote === "academy-rookie" && n.entrantId === e.player.id,
        ),
    );
    expect(rook?.inactiveYears).toBe(1);
    expect(rook?.lastTeamId).toBe(me);
    expect(next!.franchise!.usedNames).toContain(rook!.player.name!);
  });

  it("user can bench and call up during transfer window", () => {
    let season = transferFollowed();
    const me = season.config.controlledTeamId!;
    const lane = "top" as Lane;
    const before = season.teams.find((t) => t.id === me)!.players.find((p) => p.lane === lane)!;
    // Ensure a same-lane academy prospect exists to call up (not the demotee).
    season = {
      ...season,
      franchise: {
        ...season.franchise!,
        inactivePool: [
          ...(season.franchise!.inactivePool ?? []),
          {
            player: {
              id: "acy-callup-top",
              name: "AcyCallupTop",
              lane,
              tier: "B" as const,
              age: 19,
              goodChamps: [],
              badChamps: [],
              potential: "A" as const,
            },
            status: "academy" as const,
            inactiveYears: 1,
            demotedYear: 1,
            lastTeamId: me,
            lastTeamName: season.teams.find((t) => t.id === me)!.name,
          },
        ],
      },
    };
    const demoted = applyUserManualDemote(season, lane);
    expect(demoted).not.toBeNull();
    expect(isRosterVacancy(demoted!.teams.find((t) => t.id === me)!.players.find((p) => p.lane === lane)!)).toBe(
      true,
    );
    expect(demoted!.franchise!.sameWindowDemoteIds).toContain(before.id);

    const recalled = applyUserAcademyRecall(demoted!, champions, lane, "acy-callup-top");
    expect(recalled).not.toBeNull();
    const slot = recalled!.teams.find((t) => t.id === me)!.players.find((p) => p.lane === lane)!;
    expect(slot.id).toBe("acy-callup-top");
    expect(isRosterVacancy(slot)).toBe(false);
    // Same-window demotee still blocked.
    expect(applyUserAcademyRecall(recalled!, champions, lane, before.id!)).toBeNull();
  });

  it("mid-split demotions mint AI academy rookies when depth is low (open-FA stays chance-gated)", () => {
    let season = transferFollowed();
    const other = season.teams.find((t) => t.id !== season.config.controlledTeamId)!;
    // Empty that org's academy so depth-below triggers intake.
    season = {
      ...season,
      franchise: {
        ...season.franchise!,
        inactivePool: (season.franchise!.inactivePool ?? []).filter(
          (e) => !(e.status === "academy" && e.lastTeamId === other.id),
        ),
        // Immediate path (no pending) — all teams eligible including followed.
        pendingMidSplitDemotion: undefined,
      },
    };
    expect(countTeamAcademy(season.franchise!.inactivePool!, other.id)).toBe(0);

    // rng → 0.99 fails AI_OPEN_FA_CHANCE_MID_SPLIT (~0.14) so open-fa stays quiet
    // while academy-rookie (mid-split depth path) still fires on low rolls via
    // its own chance — use a sequence that fails open-FA but passes rookie.
    let n = 0;
    const rng = () => {
      // First rolls: open-FA allowTeam (high → skip). Later: promote/stash/rookie.
      n += 1;
      return n <= 80 ? 0.99 : 0;
    };
    const next = applyMidSplitDemotions(season, "summer", champions, rng);
    expect(countTeamAcademy(next.franchise!.inactivePool!, other.id)).toBeGreaterThan(0);
    expect(next.rosterNews?.some((n) => n.marketNote === "academy-rookie" && n.teamId === other.id)).toBe(
      true,
    );
    // Open-FA is chance-gated mid-split — this rng fails the attempt.
    expect(next.rosterNews?.some((n) => n.marketNote === "open-fa")).toBeFalsy();
  });

  it("mid-split demotions can stash FA into academy", () => {
    let season = transferFollowed();
    const other = season.teams.find((t) => t.id !== season.config.controlledTeamId)!;
    // Enough FAs to clear thin floor; A-mid parks via stash (not open-FA).
    const fas = Array.from({ length: 24 }, (_, i) => ({
      player: {
        id: `mid-fa-${i}`,
        name: `MidFa${i}`,
        lane: (i === 0 ? "middle" : "top") as Lane,
        tier: (i === 0 ? "A" : "C") as const,
        age: 21,
        goodChamps: [] as number[],
        badChamps: [] as number[],
      },
      status: "free-agent" as const,
      inactiveYears: 4,
      demotedYear: 1,
      lastTeamId: "OLD",
      lastActiveGrade: 6.5,
      shadowGrade: 6.5,
    }));
    season = {
      ...season,
      franchise: {
        ...season.franchise!,
        pendingMidSplitDemotion: undefined,
        inactivePool: [
          // Drop existing FAs + clear other's academy so stash has room.
          ...(season.franchise!.inactivePool ?? []).filter(
            (e) =>
              e.status !== "free-agent" &&
              !(e.status === "academy" && e.lastTeamId === other.id),
          ),
          ...fas,
        ],
      },
      // Strong middles league-wide so A-mid FA never clears FA_OPEN_REPLACE_GAP.
      teams: season.teams.map((t) => ({
        ...t,
        players: t.players.map((p) =>
          p.lane === "middle" ? { ...p, tier: "S" as const, age: 24 } : p,
        ),
      })),
    };

    const next = applyMidSplitDemotions(season, "summer", champions, () => 0);
    expect(next.rosterNews?.some((n) => n.marketNote === "academy-stash")).toBe(true);
    expect(
      next.franchise!.inactivePool!.some(
        (e) => e.status === "academy" && e.player.id?.startsWith("mid-fa-"),
      ),
    ).toBe(true);
  });

  it("deferred Proceed skips followed team for AI academy intake", () => {
    let season = transferFollowed("winter");
    const me = season.config.controlledTeamId!;
    // Strip followed academy so they would otherwise qualify for intake.
    season = {
      ...season,
      franchise: {
        ...season.franchise!,
        pendingMidSplitDemotion: "winter",
        inactivePool: (season.franchise!.inactivePool ?? []).filter(
          (e) => !(e.status === "academy" && e.lastTeamId === me),
        ),
      },
    };
    expect(countTeamAcademy(season.franchise!.inactivePool!, me)).toBe(0);

    const next = applyMidSplitDemotions(season, "winter", champions, () => 0);
    expect(countTeamAcademy(next.franchise!.inactivePool!, me)).toBe(0);
    expect(next.rosterNews?.some((n) => n.marketNote === "academy-rookie" && n.teamId === me)).toBeFalsy();
  });
});

describe("splitFromRosterTimeMark", () => {
  it("maps split labels and windows onto Winter / Spring / Summer / Offseason", () => {
    expect(splitFromRosterTimeMark("Winter")).toBe("winter");
    expect(splitFromRosterTimeMark("Spring")).toBe("spring");
    expect(splitFromRosterTimeMark("Summer")).toBe("summer");
    expect(splitFromRosterTimeMark("First Stand window")).toBe("winter");
    expect(splitFromRosterTimeMark("MSI window")).toBe("spring");
    expect(splitFromRosterTimeMark("Worlds window")).toBe("summer");
    expect(splitFromRosterTimeMark("Offseason")).toBe("offseason");
    expect(splitFromRosterTimeMark(undefined)).toBeNull();
    expect(splitFromRosterTimeMark("—")).toBeNull();
  });
});

describe("post-Worlds transfer digest carry", () => {
  const sampleMove = {
    event: "worlds" as const,
    lane: "middle" as const,
    fromTeamId: "A",
    toTeamId: "B",
    star: { tier: "A" as const, grade: null, goodChamps: [] },
    swap: { tier: "B" as const, grade: null, goodChamps: [] },
  };

  it("startNextSeason keeps Worlds moves and drops First Stand / MSI", () => {
    const base = makeReality(false);
    const y1 = {
      ...base,
      status: "complete" as const,
      config: { ...base.config, playerTransfers: false },
      transfersByEvent: {
        "first-stand": [{ ...sampleMove, event: "first-stand" as const }],
        msi: [{ ...sampleMove, event: "msi" as const }],
        worlds: [sampleMove],
      },
    };
    const y2 = startNextSeason(y1, champions, rngFrom(11));
    expect(y2.franchise?.year).toBe(2);
    expect(y2.transfersByEvent?.["first-stand"]).toBeUndefined();
    expect(y2.transfersByEvent?.msi).toBeUndefined();
    expect(y2.transfersByEvent?.worlds).toEqual([sampleMove]);
  });

  it("shows prior-year Worlds mid next year without phantom First Stand / MSI", () => {
    const base = makeReality(false);
    const midYear = {
      ...base,
      status: "in-progress" as const,
      franchise: { ...base.franchise!, year: 2 },
      transfersByEvent: {
        worlds: [sampleMove],
        // Stale keys must not invent UI sections before those events play.
        "first-stand": [{ ...sampleMove, event: "first-stand" as const }],
        msi: [{ ...sampleMove, event: "msi" as const }],
      },
      phases: base.phases.map((p) =>
        p.kind === "international" ? { ...p, status: "pending" as const } : p,
      ),
    };
    expect(visibleTransferDigestEvents(midYear)).toEqual(["worlds"]);
    expect(transferDigestSectionTitle("worlds", midYear)).toBe("Post Worlds · Year 1");
    expect(transferDigestSectionTitle("first-stand", midYear)).toBe("Post First Stand");
  });

  it("keeps prior Worlds beside completed First Stand, Worlds first chronologically", () => {
    const base = makeReality(false);
    const afterFs = {
      ...base,
      status: "in-progress" as const,
      franchise: { ...base.franchise!, year: 2 },
      transfersByEvent: {
        worlds: [sampleMove],
        "first-stand": [{ ...sampleMove, event: "first-stand" as const }],
      },
      phases: base.phases.map((p) => {
        if (p.kind === "international" && p.event === "first-stand") {
          return { ...p, status: "complete" as const };
        }
        return p;
      }),
    };
    expect(visibleTransferDigestEvents(afterFs)).toEqual(["worlds", "first-stand"]);
    expect(transferDigestSectionTitle("worlds", afterFs)).toBe("Post Worlds · Year 1");
  });

  it("labels offseason Worlds as current year when no prior-year baseline", () => {
    const base = makeReality(false);
    const offseason = {
      ...base,
      status: "complete" as const,
      franchise: { ...base.franchise!, year: 2 },
      transfersByEvent: { worlds: [sampleMove] },
      // No worldsOffseasonBaseline → treated as this year's offseason rows.
    };
    expect(visibleTransferDigestEvents(offseason)).toEqual(["worlds"]);
    expect(transferDigestSectionTitle("worlds", offseason)).toBe("Post Worlds");
  });

  it("labels preserved prior-year carry at offseason as Post Worlds · Year N-1", () => {
    const base = makeReality(false);
    const offseason = {
      ...base,
      status: "complete" as const,
      franchise: { ...base.franchise!, year: 2 },
      transfersByEvent: { worlds: [sampleMove] },
      worldsOffseasonBaseline: 1,
    };
    expect(visibleTransferDigestEvents(offseason)).toEqual([]);
    expect(transferDigestSectionTitle("worlds", offseason)).toBe("Post Worlds · Year 1");
  });

  it("omits empty Post Worlds in offseason when bucket has no moves", () => {
    // No carry and no new offseason rows — digest must not show a useless
    // "Post Worlds — 0 moves" section.
    const base = makeReality(false);
    const offseason = {
      ...base,
      status: "complete" as const,
      transfersByEvent: {
        "first-stand": [{ ...sampleMove, event: "first-stand" as const }],
        msi: [{ ...sampleMove, event: "msi" as const }],
        // worlds intentionally absent
      },
      worldsOffseasonBaseline: 0,
    };
    expect(visibleTransferDigestEvents(offseason)).toEqual([
      "first-stand",
      "msi",
    ]);
  });

  it("startNextSeason carries only post-baseline offseason moves, not prior digest carry", () => {
    const base = makeReality(false);
    const priorCarry = { ...sampleMove, lane: "top" as const };
    const thisOffseason = { ...sampleMove, lane: "middle" as const };
    const y1 = {
      ...base,
      status: "complete" as const,
      config: { ...base.config, playerTransfers: false },
      transfersByEvent: {
        "first-stand": [{ ...sampleMove, event: "first-stand" as const }],
        msi: [{ ...sampleMove, event: "msi" as const }],
        worlds: [priorCarry, thisOffseason],
      },
      worldsOffseasonBaseline: 1,
    };
    const y2 = startNextSeason(y1, champions, rngFrom(11));
    expect(y2.franchise?.year).toBe(2);
    expect(y2.transfersByEvent?.["first-stand"]).toBeUndefined();
    expect(y2.transfersByEvent?.msi).toBeUndefined();
    expect(y2.transfersByEvent?.worlds).toEqual([thisOffseason]);
    expect(y2.worldsOffseasonBaseline).toBeUndefined();
    expect(transferDigestSectionTitle("worlds", y2)).toBe("Post Worlds · Year 1");
  });

  it("with playerTransfers on, startNextSeason writes Worlds moves that stay visible", () => {
    const base = makeReality(false);
    const y1 = {
      ...base,
      status: "complete" as const,
      config: { ...base.config, playerTransfers: true },
      // Cap-reset baseline with no prior carry; auto offseason pass fills on advance.
      transfersByEvent: {
        "first-stand": [{ ...sampleMove, event: "first-stand" as const }],
        msi: [{ ...sampleMove, event: "msi" as const }],
      },
      worldsOffseasonBaseline: 0,
    };
    expect(visibleTransferDigestEvents(y1)).not.toContain("worlds");

    const y2 = startNextSeason(y1, champions, rngFrom(11));
    expect(y2.franchise?.year).toBe(2);
    expect(y2.transfersByEvent?.["first-stand"]).toBeUndefined();
    expect(y2.transfersByEvent?.msi).toBeUndefined();
    expect((y2.transfersByEvent?.worlds?.length ?? 0) > 0).toBe(true);
    expect(visibleTransferDigestEvents(y2)).toEqual(["worlds"]);
    expect(transferDigestSectionTitle("worlds", y2)).toBe("Post Worlds · Year 1");
  });

  it("always orders digest sections Worlds → First Stand → MSI", () => {
    const base = makeReality(false);
    const fs = { ...sampleMove, event: "first-stand" as const };
    const msi = { ...sampleMove, event: "msi" as const };
    const markPlayed = (...events: Array<"first-stand" | "msi" | "worlds">) =>
      base.phases.map((p) =>
        p.kind === "international" && p.event && events.includes(p.event)
          ? { ...p, status: "complete" as const }
          : p,
      );

    // Offseason / complete: all three present → Worlds still first (not last).
    expect(
      visibleTransferDigestEvents({
        ...base,
        status: "complete",
        transfersByEvent: {
          msi: [msi],
          worlds: [sampleMove],
          "first-stand": [fs],
        },
      }),
    ).toEqual(["worlds", "first-stand", "msi"]);

    // Worlds + MSI only (no First Stand bucket).
    expect(
      visibleTransferDigestEvents({
        ...base,
        status: "complete",
        transfersByEvent: { worlds: [sampleMove], msi: [msi] },
      }),
    ).toEqual(["worlds", "msi"]);

    // First Stand + MSI only (empty Worlds omitted).
    expect(
      visibleTransferDigestEvents({
        ...base,
        status: "complete",
        transfersByEvent: { "first-stand": [fs], msi: [msi] },
      }),
    ).toEqual(["first-stand", "msi"]);

    // Prior-year Worlds carry + completed First Stand mid next year.
    expect(
      visibleTransferDigestEvents({
        ...base,
        status: "in-progress",
        franchise: { ...base.franchise!, year: 2 },
        transfersByEvent: { worlds: [sampleMove], "first-stand": [fs] },
        phases: markPlayed("first-stand"),
      }),
    ).toEqual(["worlds", "first-stand"]);

    // Worlds carry + MSI after both FS and MSI completed (keys inserted MSI-first).
    expect(
      visibleTransferDigestEvents({
        ...base,
        status: "in-progress",
        franchise: { ...base.franchise!, year: 2 },
        transfersByEvent: { msi: [msi], worlds: [sampleMove] },
        phases: markPlayed("first-stand", "msi"),
      }),
    ).toEqual(["worlds", "msi"]);
  });

  it("attributes mis-bucketed First Stand / MSI stamps away from Post Worlds", () => {
    const base = makeReality(false);
    const fs = {
      ...sampleMove,
      event: "first-stand" as const,
      lane: "top" as const,
    };
    const msi = {
      ...sampleMove,
      event: "msi" as const,
      lane: "jungle" as const,
    };
    const worldsCarry = { ...sampleMove, lane: "middle" as const };
    // Simulate leak: mid-season rows appended into the worlds carry array.
    const polluted = {
      ...base,
      status: "complete" as const,
      franchise: { ...base.franchise!, year: 2 },
      transfersByEvent: {
        worlds: [worldsCarry, fs, msi],
      },
      worldsOffseasonBaseline: 3,
    };
    expect(transfersForDigestEvent(polluted, "worlds")).toEqual([]);
    expect(transfersForDigestEvent(polluted, "first-stand")).toEqual([fs]);
    expect(transfersForDigestEvent(polluted, "msi")).toEqual([msi]);
    expect(visibleTransferDigestEvents(polluted)).toEqual([
      "first-stand",
      "msi",
    ]);

    const archived = transfersForHistoryArchive(polluted);
    // Prior-year worlds carry below baseline is omitted; FS/MSI stamps kept.
    expect(archived.map((m) => m.event).sort()).toEqual([
      "first-stand",
      "msi",
    ]);
  });

  it("never surfaces Global Cup as a transfer digest section", () => {
    const base = makeReality(true);
    const gcMove = {
      event: "global-cup" as const,
      lane: "top" as const,
      fromTeamId: base.teams[0]!.id,
      toTeamId: base.teams[1]!.id,
      star: { tier: "A" as const, grade: null, goodChamps: [] as string[] },
      swap: { tier: "B" as const, grade: null, goodChamps: [] as string[] },
    };
    const events = visibleTransferDigestEvents({
      ...base,
      status: "complete",
      phases: [
        ...base.phases,
        {
          kind: "international",
          event: "global-cup",
          label: "Global Cup",
          tournamentIds: [],
          status: "complete",
        },
      ],
      transfersByEvent: {
        worlds: [
          {
            event: "worlds",
            lane: "jungle",
            fromTeamId: base.teams[0]!.id,
            toTeamId: base.teams[1]!.id,
            star: { tier: "S" as const, grade: null, goodChamps: [] },
            swap: { tier: "C" as const, grade: null, goodChamps: [] },
          },
        ],
        "global-cup": [gcMove],
      },
    });
    expect(events).not.toContain("global-cup");
    expect(events).toContain("worlds");
  });

  it("roster news timeMarks stay on their window at offseason (not all Offseason)", () => {
    const base = makeReality(true);
    const season = {
      ...base,
      status: "complete" as const,
      rosterNews: [
        {
          teamId: base.teams[0]!.id,
          lane: "middle" as const,
          entrantName: "A",
          entrantTier: "B" as const,
          entrantPotential: "B" as const,
          entrantSource: "academy" as const,
          timeMark: "First Stand window",
        },
        {
          teamId: base.teams[0]!.id,
          lane: "top" as const,
          entrantName: "B",
          entrantTier: "A" as const,
          entrantPotential: "A" as const,
          entrantSource: "free-agent" as const,
          timeMark: "MSI window",
        },
        {
          teamId: base.teams[0]!.id,
          lane: "support" as const,
          entrantName: "C",
          entrantTier: "C" as const,
          entrantPotential: "C" as const,
          entrantSource: "rookie" as const,
          timeMark: "Offseason",
        },
      ],
    };
    const marks = (season.rosterNews ?? []).map((n) => n.timeMark);
    expect(marks).toEqual([
      "First Stand window",
      "MSI window",
      "Offseason",
    ]);
    expect(splitFromRosterTimeMark("First Stand window")).toBe("winter");
    expect(splitFromRosterTimeMark("MSI window")).toBe("spring");
    expect(splitFromRosterTimeMark("Offseason")).toBe("offseason");
  });
});

describe("no vacancy stubs on main roster", () => {
  function assertFullRosters(season: { teams: { players: { id?: string; lane: Lane }[] }[] }) {
    for (const t of season.teams) {
      expect(t.players).toHaveLength(5);
      for (const lane of LANE_ORDER) {
        const p = t.players.find((x) => x.lane === lane);
        expect(p).toBeTruthy();
        expect(isRosterVacancy(p)).toBe(false);
      }
    }
  }

  it("fillRosterVacancies clears stubs on every team, not only followed", () => {
    const base = makeReality(true);
    const me = base.teams[0]!.id;
    const other = base.teams[1]!;
    const season = {
      ...base,
      status: "complete" as const,
      config: { ...base.config, controlledTeamId: me },
      teams: base.teams.map((t) =>
        t.id === other.id
          ? {
              ...t,
              players: t.players.map((p) =>
                p.lane === "support" ? makeVacancyPlaceholder("support") : p,
              ),
            }
          : t,
      ),
    };
    expect(
      isRosterVacancy(
        season.teams.find((t) => t.id === other.id)!.players.find((p) => p.lane === "support"),
      ),
    ).toBe(true);

    const filled = fillRosterVacancies(season, champions, rngFrom(99));
    assertFullRosters(filled);
    const support = filled.teams
      .find((t) => t.id === other.id)!
      .players.find((p) => p.lane === "support")!;
    expect(support.name).toBeTruthy();
    expect(support.id?.startsWith("__vacancy__")).toBe(false);
  });

  it("AI agency leave never leaves __vacancy__* on the main roster", () => {
    const base = makeReality(true);
    const me = base.teams[0]!.id;
    // Plant a clear leave candidate on a non-followed org.
    const weak = base.teams.find((t) => t.id !== me)!;
    const starLane = "middle" as Lane;
    const season = {
      ...base,
      status: "complete" as const,
      config: { ...base.config, controlledTeamId: me },
      teams: base.teams.map((t) => {
        if (t.id !== weak.id) return t;
        return {
          ...t,
          players: t.players.map((p) =>
            p.lane === starLane
              ? {
                  ...p,
                  id: "agency-star",
                  name: "AgencyStar",
                  tier: "S+" as const,
                  potential: "S+" as const,
                  goodChamps: champions.filter((c) => c.lanes.includes("middle")).slice(0, 3).map((c) => c.id),
                }
              : { ...p, tier: "D" as const },
          ),
        };
      }),
    };

    const seeded = seedAgencyWindow(season, champions, () => 0, "offseason");
    assertFullRosters(seeded);
    // Leaver must be in FA pool (or academy), not still starting — and no stub.
    const stillStarting = seeded.teams
      .flatMap((t) => t.players)
      .some((p) => p.id === "agency-star");
    const inPool = seeded.franchise!.inactivePool!.some((e) => e.player.id === "agency-star");
    // Either the demand didn't fire (rng/thresholds) OR they left and were replaced.
    if (inPool) {
      expect(stillStarting).toBe(false);
      expect(
        seeded.rosterNews?.some(
          (n) => n.departedId === "agency-star" && n.entrantId === "agency-star",
        ),
      ).toBe(false);
    }
    expect(seeded.teams.some((t) => t.players.some((p) => isRosterVacancy(p)))).toBe(false);
  });

  it("honorAgencyDemand on AI org fills the slot atomically", () => {
    const base = makeReality(true);
    const me = base.teams[0]!.id;
    const other = base.teams[1]!;
    const lane = "support" as Lane;
    const incumbent = other.players.find((p) => p.lane === lane)!;
    const season = {
      ...base,
      status: "complete" as const,
      config: { ...base.config, controlledTeamId: me },
      franchise: {
        ...base.franchise!,
        agencyDemands: [
          {
            id: "d1",
            kind: "leave" as const,
            status: "pending" as const,
            playerId: incumbent.id!,
            playerName: incumbent.name ?? "X",
            playerTier: incumbent.tier,
            lane,
            fromTeamId: other.id,
            fromTeamName: other.name,
            preferenceGap: 2,
            wantRole: "fa" as const,
          },
        ],
      },
    };
    const next = honorAgencyDemand(season, champions, "d1", rngFrom(3));
    expect(next).not.toBeNull();
    assertFullRosters(next!);
    const slot = next!.teams.find((t) => t.id === other.id)!.players.find((p) => p.lane === lane)!;
    expect(isRosterVacancy(slot)).toBe(false);
    expect(slot.id).not.toBe(incumbent.id);
    expect(
      next!.franchise!.inactivePool!.some(
        (e) => e.player.id === incumbent.id && e.status === "free-agent",
      ),
    ).toBe(true);
    // No empty agency-leave stub row left behind.
    expect(
      next!.rosterNews?.some((n) => n.marketNote === "agency-leave" && !n.entrantName),
    ).toBeFalsy();
  });

  it("startNextSeason scrubs leftover vacancies before lifecycle/transfers", () => {
    const base = makeReality(true);
    const me = base.teams[0]!.id;
    const other = base.teams[1]!;
    const season = {
      ...base,
      status: "complete" as const,
      config: { ...base.config, controlledTeamId: me, playerTransfers: true },
      teams: base.teams.map((t) =>
        t.id === other.id
          ? {
              ...t,
              players: t.players.map((p) =>
                p.lane === "jungle" ? makeVacancyPlaceholder("jungle") : p,
              ),
            }
          : t,
      ),
    };
    const y2 = startNextSeason(season, champions, rngFrom(11));
    assertFullRosters(y2);
    expect(y2.teams.some((t) => t.players.some((p) => isRosterVacancy(p)))).toBe(false);
    // No transfer digest rows that are same-id swaps.
    for (const moves of Object.values(y2.transfersByEvent ?? {})) {
      for (const m of moves) {
        if (m.star.id && m.swap.id) expect(m.star.id).not.toBe(m.swap.id);
        if (m.star.name && m.swap.name) expect(m.star.name).not.toBe(m.swap.name);
        expect(m.star.id?.startsWith("__vacancy__")).toBeFalsy();
        expect(m.swap.id?.startsWith("__vacancy__")).toBeFalsy();
      }
    }
  });

  it("ghost academy copy of a starter merges tier in place — no same-player Out→In news", () => {
    const base = makeReality(true);
    const me = base.teams[0]!.id;
    const team = base.teams[1]!;
    const mid = team.players.find((p) => p.lane === "middle")!;
    const season = {
      ...base,
      status: "complete" as const,
      config: { ...base.config, controlledTeamId: me },
      teams: base.teams.map((t) =>
        t.id !== team.id
          ? t
          : {
              ...t,
              players: t.players.map((p) =>
                p.lane === "middle"
                  ? { ...mid, id: "ghost-mid", name: "GhostMid", tier: "C" as const }
                  : p,
              ),
            },
      ),
      franchise: {
        ...base.franchise!,
        inactivePool: [
          ...(base.franchise!.inactivePool ?? []),
          {
            player: {
              ...mid,
              id: "ghost-mid",
              name: "GhostMid",
              tier: "A" as const,
              potential: "S" as const,
              lane: "middle" as Lane,
            },
            status: "academy" as const,
            inactiveYears: 2,
            demotedYear: 1,
            clockYear: 1,
            lastTeamId: team.id,
            lastTeamName: team.name,
            shadowGrade: 8,
          },
        ],
      },
    };
    const filled = fillRosterVacancies(season, champions, rngFrom(3));
    const slot = filled.teams.find((t) => t.id === team.id)!.players.find((p) => p.lane === "middle")!;
    expect(slot.id).toBe("ghost-mid");
    // Higher academy tier merged onto roster (in-place growth), not a replace row.
    expect(slot.tier).toBe("A");
    expect(
      filled.rosterNews?.some(
        (n) =>
          n.departedId === "ghost-mid" &&
          n.entrantId === "ghost-mid" &&
          n.departedName === n.entrantName,
      ),
    ).toBe(false);
    expect(filled.franchise!.inactivePool!.some((e) => e.player.id === "ghost-mid")).toBe(
      false,
    );
  });
});


describe("permanent reality name reservations", () => {
  it("repairs a missing registry from retired players and preserves it across reloads and years", () => {
    let season = makeReality(false);
    const retired = { ...season.teams[0]!.players[0]!, id: "old-founder", name: "RetiredFounder" };
    season = {
      ...season,
      franchise: {
        ...season.franchise!,
        usedNames: undefined,
        inactivePool: [{ player: retired, status: "retired", inactiveYears: 20, demotedYear: 1, lastTeamId: season.teams[0]!.id }],
      },
    };
    season = startNextSeason(season, champions, rngFrom(543));
    expect(season.franchise!.usedNames).toContain(retired.name);
    // The permanent registry must outlive even a compacted inactive archive.
    season.franchise!.inactivePool = [];
    season = JSON.parse(JSON.stringify(season));
    season = startNextSeason(season, champions, rngFrom(544));
    expect(season.franchise!.usedNames).toContain(retired.name);
  });
});


it("carries only newly created offseason news across consecutive year rollovers", () => {
  const season = makeReality(false);
  const row = (name: string, timeMark: string) => ({ teamId: season.teams[0].id, lane: "top" as const, entrantName: name, entrantTier: "A" as const, entrantPotential: "A" as const, entrantSource: "rookie" as const, timeMark });
  season.status = "complete";
  season.rosterNews = [row("Prior carry", "Offseason"), row("Winter rookie", "Winter"), row("Current signing", "Offseason")];
  season.offseasonRosterNewsBaseline = 2;
  const next = startNextSeason(season, champPool(), rngFrom(42));
  expect(next.rosterNews?.map(n => n.entrantName)).toEqual(["Current signing"]);
  next.status = "complete";
  next.offseasonRosterNewsBaseline = next.rosterNews?.length ?? 0;
  const third = startNextSeason(next, champPool(), rngFrom(43));
  expect(third.rosterNews ?? []).toEqual([]);
  expect(season.rosterNews.map(n => n.timeMark)).toEqual(["Offseason", "Winter", "Offseason"]);
});


it("does not carry mis-bucketed midseason swaps into the next offseason", () => {
  const season = makeReality(false);
  season.status = "complete";
  season.config.playerTransfers = false;
  const move = (event: "worlds" | "msi" | "first-stand", name: string) => ({
    event, lane: "top" as const, fromTeamId: season.teams[0].id, toTeamId: season.teams[1].id,
    star: { name, tier: "A" as const, grade: null, goodChamps: [] },
    swap: { name: `swap-${name}`, tier: "B" as const, grade: null, goodChamps: [] },
  });
  const current = move("worlds", "Current offseason");
  season.transfersByEvent = { worlds: [move("worlds", "Old carry"), move("msi", "Spring move"), current, move("first-stand", "Winter move")] };
  season.worldsOffseasonBaseline = 1;
  const reloaded = JSON.parse(JSON.stringify(season));
  expect(transfersForDigestEvent(reloaded, "worlds")).toEqual([current]);
  const next = startNextSeason(reloaded, champions, rngFrom(55));
  expect(next.transfersByEvent?.worlds).toEqual([current]);
  next.status = "complete";
  next.worldsOffseasonBaseline = 1;
  expect(transfersForDigestEvent(next, "worlds")).toEqual([]);
  const third = startNextSeason(next, champions, rngFrom(56));
  expect(third.transfersByEvent?.worlds ?? []).toEqual([]);
});
