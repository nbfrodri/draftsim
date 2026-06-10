import { describe, it, expect } from "vitest";

import type { Champion, Lane } from "../types";
import { LANE_ORDER } from "../players";
import {
  recordMatchWinner,
  startGroupsPlayoffs,
  startRoundRobinPlayoffs,
  startSwissPlayoffs,
  teamStreak,
  type TournamentState,
} from "../tournament";
import {
  applyPatchShift,
  applyTournamentUpdate,
  championshipPoints,
  createSeason,
  currentPhase,
  nextPendingTournament,
  qualifiedForInternational,
  tournamentPlacements,
} from "./engine";
import { generateSeasonTeams } from "./teamGen";
import {
  LEAGUE_IDS,
  TEAMS_PER_LEAGUE,
  type SeasonConfig,
  type SeasonLeagueConfig,
  type SeasonState,
} from "./types";

// ── Fixtures ────────────────────────────────────────────────────────────────

function rngFrom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let nextId = 1;
function champ(lanes: Lane[], alias: string): Champion {
  const id = nextId++;
  return { id, name: alias, alias, roles: [], iconUrl: "", lanes };
}

function championPool(perLane = 8): Champion[] {
  const out: Champion[] = [];
  for (const lane of LANE_ORDER) {
    for (let i = 0; i < perLane; i++) {
      out.push(champ([lane], `${lane}-${i}`));
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
    name: "Test Season",
    sharedLeagueConfig: true,
    leagueConfigs: Object.fromEntries(
      LEAGUE_IDS.map((l) => [l, { ...LEAGUE_CFG }]),
    ) as Record<(typeof LEAGUE_IDS)[number], SeasonLeagueConfig>,
    liveMeta: false,
    patchShift: false,
    fearless: false,
    aiDifficulty: "normal",
    controlledTeamId: null,
  };
}

// Resolve every match of a tournament with a star-rating-biased coin
// flip (no draft/sim — the season engine only needs winners), freezing
// playoff brackets when the regular stage completes.
function resolveTournament(
  t: TournamentState,
  rng: () => number,
): TournamentState {
  let working = t;
  for (let safety = 0; safety < 1000; safety++) {
    const startable = working.matches.find(
      (m) => !m.winner && m.blueTeamId != null && m.redTeamId != null,
    );
    if (!startable) {
      const stageDone = working.matches
        .filter((m) => m.bracket === undefined)
        .every((m) => m.winner != null);
      if (
        (working.format === "groups-playoffs" ||
          working.format === "groups-playoffs-de") &&
        !working.groupsPlayoffs?.playoffStarted &&
        stageDone
      ) {
        working = startGroupsPlayoffs(working);
        continue;
      }
      if (
        (working.format === "swiss-playoffs" ||
          working.format === "swiss-playoffs-de") &&
        !working.swissPlayoffsStarted &&
        stageDone
      ) {
        working = startSwissPlayoffs(working);
        continue;
      }
      if (
        working.format === "round-robin-playoffs" &&
        !working.rrPlayoffsStarted &&
        stageDone
      ) {
        working = startRoundRobinPlayoffs(working);
        continue;
      }
      break;
    }
    const blue = working.teams.find((x) => x.id === startable.blueTeamId)!;
    const red = working.teams.find((x) => x.id === startable.redTeamId)!;
    const pBlue =
      0.5 + 0.12 * ((blue.starRating ?? 3) - (red.starRating ?? 3));
    const blueWon = rng() < pBlue;
    const need =
      startable.format === "bo5" ? 3 : startable.format === "bo3" ? 2 : 1;
    working = recordMatchWinner(working, startable.id, {
      teamId: blueWon ? blue.id : red.id,
      blueWins: blueWon ? need : 0,
      redWins: blueWon ? 0 : need,
    });
  }
  return working;
}

// Drive an entire season to completion through the engine.
function runSeason(season: SeasonState, champions: Champion[]): SeasonState {
  const rng = rngFrom(7);
  let s = season;
  for (let safety = 0; safety < 60; safety++) {
    if (s.status === "complete") return s;
    const t = nextPendingTournament(s);
    expect(t, `phase ${s.phaseIndex} should have a pending tournament`).not.toBeNull();
    const done = resolveTournament(t!, rng);
    expect(done.status).toBe("complete");
    s = applyTournamentUpdate(s, done, champions);
  }
  return s;
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("generateSeasonTeams", () => {
  it("creates 60 unique teams, 10 per league", () => {
    const champions = championPool();
    const teams = generateSeasonTeams(champions, rngFrom(1));
    expect(teams).toHaveLength(LEAGUE_IDS.length * TEAMS_PER_LEAGUE);
    expect(new Set(teams.map((t) => t.name)).size).toBe(teams.length);
    expect(new Set(teams.map((t) => t.iconKey)).size).toBe(teams.length);
    for (const league of LEAGUE_IDS) {
      expect(teams.filter((t) => t.leagueId === league)).toHaveLength(
        TEAMS_PER_LEAGUE,
      );
    }
    for (const t of teams) expect(t.players).toHaveLength(5);
  });
});

describe("season lifecycle", () => {
  const champions = championPool();
  const teams = generateSeasonTeams(champions, rngFrom(2));
  const base = createSeason({
    config: makeConfig(),
    teams,
    activeMeta: {
      metaOverride: null,
      metaEnabled: true,
      synergyOverride: null,
      counterOverride: null,
    },
  });

  it("starts in Winter with one tournament per league, all season-tagged", () => {
    const phase = currentPhase(base)!;
    expect(phase.split).toBe("winter");
    expect(phase.tournamentIds).toHaveLength(6);
    for (const id of phase.tournamentIds) {
      const t = base.tournaments[id];
      expect(t.seasonId).toBe(base.id);
      expect(t.teams).toHaveLength(10);
      expect(t.format).toBe("round-robin-playoffs");
    }
  });

  it("plays the full year: splits → First Stand → MSI → Worlds, crowning a champion", () => {
    let s = base;
    const rng = rngFrom(7);

    // ── Winter ──
    for (let i = 0; i < 6; i++) {
      const t = nextPendingTournament(s)!;
      s = applyTournamentUpdate(s, resolveTournament(t, rng), champions);
    }
    expect(s.phases[0].status).toBe("complete");
    expect(currentPhase(s)!.event).toBe("first-stand");
    // Every league recorded full placements.
    for (const league of LEAGUE_IDS) {
      expect(s.splitResults.winter?.[league]).toHaveLength(10);
    }

    // ── First Stand: top 2 per league, seeded #1s before #2s ──
    const fs = nextPendingTournament(s)!;
    expect(fs.teams).toHaveLength(12);
    const fsQualified = qualifiedForInternational(s, "first-stand");
    expect(fsQualified.slice(0, 6).every((q) => q.leagueSeed === 1)).toBe(true);
    expect(fsQualified.slice(6).every((q) => q.leagueSeed === 2)).toBe(true);
    for (const league of LEAGUE_IDS) {
      const placements = s.splitResults.winter![league]!;
      const sent = fs.teams.filter((t) =>
        placements.slice(0, 2).includes(t.id),
      );
      expect(sent).toHaveLength(2);
    }
    s = applyTournamentUpdate(s, resolveTournament(fs, rng), champions);
    expect(s.intlResults["first-stand"]).toBeDefined();

    // ── Spring + MSI ──
    expect(currentPhase(s)!.split).toBe("spring");
    for (let i = 0; i < 6; i++) {
      const t = nextPendingTournament(s)!;
      s = applyTournamentUpdate(s, resolveTournament(t, rng), champions);
    }
    const msi = nextPendingTournament(s)!;
    expect(msi.name).toContain("Invitational");
    // 18 regional qualifiers, +1 when the First Stand champion didn't
    // make spring top-3 (additive defending-champion slot).
    const msiQ = qualifiedForInternational(s, "msi");
    const fsChampion = s.intlResults["first-stand"]![0];
    expect(msiQ.some((q) => q.team.id === fsChampion)).toBe(true);
    const msiExtra = msiQ.filter((q) => q.via === "champion");
    expect(msi.teams).toHaveLength(18 + msiExtra.length);
    if (msiExtra.length > 0) {
      expect(msiExtra[0].team.id).toBe(fsChampion);
      expect(msiExtra[0].leagueSeed).toBe(0);
    }
    s = applyTournamentUpdate(s, resolveTournament(msi, rng), champions);
    expect(s.intlResults.msi).toBeDefined();

    // ── Summer + Worlds ──
    expect(currentPhase(s)!.split).toBe("summer");
    for (let i = 0; i < 6; i++) {
      const t = nextPendingTournament(s)!;
      s = applyTournamentUpdate(s, resolveTournament(t, rng), champions);
    }
    // Worlds qualification: per league, seeds 1-2 are the summer
    // FINALISTS; seeds 3-4 are the best remaining teams by season-long
    // championship points. The six #4 seeds fight in the play-in. The
    // MSI champion holds an additive direct slot when not already in.
    const worldsQ = qualifiedForInternational(s, "worlds");
    const msiChampion = s.intlResults.msi![0];
    expect(worldsQ.some((q) => q.team.id === msiChampion)).toBe(true);
    const worldsExtra = worldsQ.filter((q) => q.via === "champion");
    expect(worldsQ).toHaveLength(24 + worldsExtra.length);
    for (const league of LEAGUE_IDS) {
      const ofLeague = worldsQ.filter(
        (q) => q.league === league && q.via !== "champion",
      );
      expect(ofLeague).toHaveLength(4);
      const placements = s.splitResults.summer![league]!;
      // Finalists hold the direct split seeds.
      expect(ofLeague[0]).toMatchObject({
        leagueSeed: 1,
        via: "split",
        team: { id: placements[0] },
      });
      expect(ofLeague[1]).toMatchObject({
        leagueSeed: 2,
        via: "split",
        team: { id: placements[1] },
      });
      // Seeds 3-4 came via points and never duplicate the finalists.
      for (const q of ofLeague.slice(2)) {
        expect(q.via).toBe("points");
        expect(typeof q.points).toBe("number");
        expect([placements[0], placements[1]]).not.toContain(q.team.id);
      }
      // Points order holds among the non-finalists (unless the MSI
      // champion was promoted off the play-in seed).
      if (ofLeague.slice(2).every((q) => q.team.id !== msiChampion)) {
        expect(ofLeague[2].points!).toBeGreaterThanOrEqual(
          ofLeague[3].points!,
        );
      }
    }
    const playIn = nextPendingTournament(s)!;
    expect(playIn.name).toContain("Play-In");
    expect(playIn.teams).toHaveLength(6);
    for (const q of worldsQ.filter((x) => x.leagueSeed === 4)) {
      expect(playIn.teams.some((t) => t.id === q.team.id)).toBe(true);
    }
    const playInDone = resolveTournament(playIn, rng);
    s = applyTournamentUpdate(s, playInDone, champions);

    // Main event: 18 direct (+ MSI champion's additive slot when it
    // applies) + the two play-in finalists.
    const directCount = worldsQ.filter((q) => q.leagueSeed <= 3).length;
    const main = nextPendingTournament(s)!;
    expect(main.name).toContain("World");
    expect(main.teams).toHaveLength(directCount + 2);
    // The MSI champion never goes through the play-in.
    expect(playIn.teams.some((t) => t.id === msiChampion)).toBe(false);
    const finalists = tournamentPlacements(playInDone).slice(0, 2);
    for (const id of finalists) {
      expect(main.teams.some((t) => t.id === id)).toBe(true);
    }
    s = applyTournamentUpdate(s, resolveTournament(main, rng), champions);

    // ── Season complete ──
    expect(s.status).toBe("complete");
    expect(s.champion).toBe(s.intlResults.worlds![0]);
    expect(s.phases.every((p) => p.status === "complete")).toBe(true);
  });

  it("simulates end-to-end through the generic runner too", () => {
    const finished = runSeason(base, champions);
    expect(finished.status).toBe("complete");
    expect(finished.champion).not.toBeNull();
    // ~20 tournaments across the year (18 splits + FS + MSI + play-in + main).
    expect(Object.keys(finished.tournaments).length).toBe(22);
  });

  it("carries each team's end-of-split streak into the next tournament as a seed", () => {
    let s = base;
    const rng = rngFrom(13);
    const winterTournaments: TournamentState[] = [];
    for (let i = 0; i < 6; i++) {
      const done = resolveTournament(nextPendingTournament(s)!, rng);
      winterTournaments.push(done);
      s = applyTournamentUpdate(s, done, champions);
    }
    const fs = nextPendingTournament(s)!; // First Stand
    expect(fs.streakSeeds).toBeDefined();
    // Every qualifier's seed equals its signed streak at the end of its
    // winter split. League champions always arrive on a win streak
    // (they won their playoff run), so at least those seeds are > 0.
    for (const team of fs.teams) {
      const winter = winterTournaments.find((t) =>
        t.teams.some((tt) => tt.id === team.id),
      )!;
      const expected = teamStreak(winter, team.id);
      expect(fs.streakSeeds![team.id] ?? 0).toBe(expected);
    }
    const champions6 = winterTournaments.map((t) => tournamentPlacements(t)[0]);
    for (const id of champions6) {
      expect(fs.streakSeeds![id]).toBeGreaterThan(0);
    }
  });
});

describe("custom international formats", () => {
  it("builds First Stand with a configured format and series lengths", () => {
    const champions = championPool();
    const teams = generateSeasonTeams(champions, rngFrom(5));
    const config = makeConfig();
    config.intlConfigs = {
      "first-stand": {
        format: "swiss-playoffs",
        earlySeries: "bo1",
        finalsSeries: "bo3",
        playoffTeams: 4,
      },
    };
    let s = createSeason({
      config,
      teams,
      activeMeta: {
        metaOverride: null,
        metaEnabled: true,
        synergyOverride: null,
        counterOverride: null,
      },
    });
    const rng = rngFrom(9);
    for (let i = 0; i < 6; i++) {
      s = applyTournamentUpdate(
        s,
        resolveTournament(nextPendingTournament(s)!, rng),
        champions,
      );
    }
    const fs = nextPendingTournament(s)!;
    expect(fs.name).toBe("First Stand");
    expect(fs.format).toBe("swiss-playoffs");
    expect(fs.swissPlayoffsAdvancing).toBe(4);
    // Stage matches play at the configured early length.
    expect(fs.matches.every((m) => m.isBye || m.format === "bo1")).toBe(true);
    // And the customized event still resolves to completion.
    const done = resolveTournament(fs, rng);
    expect(done.status).toBe("complete");
  });
});

// ── Championship points & qualification rules (fabricated states) ──────────

describe("championship points & qualification", () => {
  // Minimal LCK-only season state: only the fields the qualification
  // helpers read (teams, splitResults, intlResults).
  const ids = Array.from({ length: 10 }, (_, i) => `t${i + 1}`);
  function fabricate(opts: {
    splitResults?: SeasonState["splitResults"];
    intlResults?: SeasonState["intlResults"];
  }): SeasonState {
    return {
      teams: ids.map((id) => ({
        id,
        leagueId: "LCK",
        name: id.toUpperCase(),
        color: "#fff",
        iconKey: "sword",
        players: [],
        personalityId: "balanced",
      })),
      splitResults: opts.splitResults ?? {},
      intlResults: opts.intlResults ?? {},
    } as unknown as SeasonState;
  }

  it("championshipPoints sums split placements and international results", () => {
    const s = fabricate({
      splitResults: { winter: { LCK: [...ids] } },
      intlResults: { "first-stand": ["t3", "t1"] },
    });
    const pts = championshipPoints(s);
    expect(pts["t1"]).toBe(10 + 12); // winter 1st + FS runner-up
    expect(pts["t3"]).toBe(6 + 15); //  winter 3rd + FS champion
    expect(pts["t2"]).toBe(8); //       winter 2nd only
    expect(pts["t9"]).toBeUndefined(); // 9th/10th score nothing
  });

  it("Worlds: summer finalists direct, then best-of-rest by points", () => {
    const s = fabricate({
      splitResults: {
        winter: { LCK: ["t3", "t4", "t5", "t6", "t7", "t8", "t9", "t10", "t1", "t2"] },
        summer: { LCK: [...ids] },
      },
      intlResults: { msi: ["t5", "t3"] },
    });
    const q = qualifiedForInternational(s, "worlds");
    expect(q.map((x) => x.team.id)).toEqual(["t1", "t2", "t5", "t3"]);
    // t1/t2 = summer finalists; t5 (winter 3rd + MSI win + summer 5th =
    // 6+15+4 = 25) outranks t3 (10+12+6 = 28)? No — t3 has 28 > 25…
    // …but t5 is the MSI champion and may not sit on the play-in seed,
    // so it gets promoted to #3 and t3 drops to #4.
    expect(q[2]).toMatchObject({ team: { id: "t5" }, leagueSeed: 3, via: "points" });
    expect(q[3]).toMatchObject({ team: { id: "t3" }, leagueSeed: 4, via: "points" });
  });

  it("MSI: First Stand champion gets an additive slot when outside spring top-3", () => {
    const s = fabricate({
      splitResults: { spring: { LCK: [...ids] } },
      intlResults: { "first-stand": ["t8", "t1"] },
    });
    const q = qualifiedForInternational(s, "msi");
    // t8 prepended as defending champion; regional spots unchanged.
    expect(q.map((x) => x.team.id)).toEqual(["t8", "t1", "t2", "t3"]);
    expect(q[0]).toMatchObject({ leagueSeed: 0, via: "champion" });
  });

  it("MSI: no extra slot when the First Stand champion already qualified", () => {
    const s = fabricate({
      splitResults: { spring: { LCK: [...ids] } },
      intlResults: { "first-stand": ["t2", "t5"] },
    });
    const q = qualifiedForInternational(s, "msi");
    expect(q.map((x) => x.team.id)).toEqual(["t1", "t2", "t3"]);
    expect(q.every((x) => x.via === "split")).toBe(true);
  });
});

describe("applyPatchShift", () => {
  it("returns a full override and only ±1-tier nudges", () => {
    const champions = championPool();
    // No baseline meta exists for fixture champs, so seed an override.
    const seeded: Record<string, Partial<Record<Lane, "A">>> = {};
    for (const c of champions) seeded[c.alias] = { [c.lanes[0]]: "A" as const };
    const shifted = applyPatchShift(
      {
        metaOverride: seeded,
        metaEnabled: true,
        synergyOverride: null,
        counterOverride: null,
      },
      champions,
      rngFrom(3),
    );
    expect(shifted.metaOverride).not.toBeNull();
    const tiers = Object.values(shifted.metaOverride!).flatMap((t) =>
      Object.values(t),
    );
    // A ±1 from "A" can only be "S" or "B".
    for (const tier of tiers) {
      expect(["S", "A", "B"]).toContain(tier);
    }
    // Some entries should have shifted with this seed.
    expect(tiers.some((t) => t !== "A")).toBe(true);
  });
});

// ── Top 6 playoffs + per-round series escalation ────────────────────────────

describe("Top 6 playoffs with semifinal/final series", () => {
  it("promotes 6 teams (top 2 seeds bye) and escalates bo3 → bo5", () => {
    const champions = championPool();
    const teams = generateSeasonTeams(champions, rngFrom(3));
    const config = makeConfig();
    for (const l of LEAGUE_IDS) {
      config.leagueConfigs[l] = {
        format: "round-robin-playoffs",
        playoffTeams: 6,
        regularSeries: "bo1",
        playoffSeries: "bo3",
        semifinalSeries: "bo5",
        finalsSeries: "bo5",
      };
    }
    let s = createSeason({
      config,
      teams,
      activeMeta: {
        metaOverride: null,
        metaEnabled: true,
        synergyOverride: null,
        counterOverride: null,
      },
    });
    const rng = rngFrom(11);
    const t0 = nextPendingTournament(s)!;
    expect(t0.rrPlayoffsAdvancing).toBe(6);
    const done = resolveTournament(t0, rng);
    expect(done.status).toBe("complete");

    const playoff = done.matches.filter((m) => m.bracket != null);
    // Full 6-team DE = 10 matches (+1 if the grand final reset fired).
    expect([10, 11]).toContain(playoff.length);
    const inBracket = new Set(
      playoff.flatMap((m) => [m.blueTeamId, m.redTeamId]).filter(Boolean),
    );
    expect(inBracket.size).toBe(6);
    // Seeds 1-2 byed past W-R1: only 2 first-round matches.
    expect(
      playoff.filter((m) => m.bracket === "winners" && m.round === 1),
    ).toHaveLength(2);

    // Series escalation: regular stage bo1; early playoff rounds bo3;
    // W-Final + L-Final (the semifinals) and the grand final bo5.
    expect(done.matches.filter((m) => !m.bracket).every((m) => m.format === "bo1")).toBe(true);
    const wFinal = playoff.find((m) => m.bracket === "winners" && m.round === 3)!;
    expect(wFinal.format).toBe("bo5");
    const losers = playoff.filter((m) => m.bracket === "losers");
    const lMax = Math.max(...losers.map((m) => m.round));
    expect(losers.find((m) => m.round === lMax)!.format).toBe("bo5");
    expect(losers.filter((m) => m.round < lMax).every((m) => m.format === "bo3")).toBe(true);
    expect(
      playoff
        .filter((m) => m.bracket === "winners" && m.round < 3)
        .every((m) => m.format === "bo3"),
    ).toBe(true);
    for (const m of playoff) {
      if (m.bracket === "grand-final" || m.bracket === "grand-final-reset") {
        expect(m.format).toBe("bo5");
      }
    }

    // The rest of the year still runs to a champion.
    s = applyTournamentUpdate(s, done, champions);
    s = runSeason(s, champions);
    expect(s.status).toBe("complete");
    expect(s.champion).not.toBeNull();
  });
});
