import { describe, it, expect } from "vitest";

import type { Champion, Lane } from "../types";
import { LANE_ORDER } from "../players";
import {
  computeBracketFinishOrder,
  computeStandings,
  createTournament,
  playoffParticipantIds,
  recordMatchWinner,
  startGroupsPlayoffs,
  startRoundRobinPlayoffs,
  startSwissPlayoffs,
  teamStreak,
  tournamentChampion,
  type TournamentState,
  type TournamentTeam,
} from "../tournament";
import {
  applyPatchShift,
  applyTournamentUpdate,
  championshipPoints,
  createSeason,
  currentPhase,
  intlConfigFor,
  intlFormatOptionsFor,
  LEAGUE_FORMAT_OPTIONS,
  nextPendingTournament,
  qualifiedForInternational,
  seasonGoldenRoadTeamId,
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
          working.format === "groups-playoffs-de" ||
          working.format === "groups-playoffs-te") &&
        !working.groupsPlayoffs?.playoffStarted &&
        stageDone
      ) {
        working = startGroupsPlayoffs(working);
        continue;
      }
      if (
        (working.format === "swiss-playoffs" ||
          working.format === "swiss-playoffs-de" ||
          working.format === "swiss-playoffs-te") &&
        !working.swissPlayoffsStarted &&
        stageDone
      ) {
        working = startSwissPlayoffs(working);
        continue;
      }
      if (
        (working.format === "round-robin-playoffs" ||
          working.format === "round-robin-playoffs-te" ||
          working.format === "round-robin-playoffs-step") &&
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
    // 18 regional qualifiers, +1 when the First Stand champion didn't
    // make spring top-3 (additive defending-champion slot). The default
    // swiss format can't run 19 fairly, so that case opens with an MSI
    // Play-In (two lowest seeds, loser out) before the 18-team main.
    const msiQ = qualifiedForInternational(s, "msi");
    const fsChampion = s.intlResults["first-stand"]![0];
    expect(msiQ.some((q) => q.team.id === fsChampion)).toBe(true);
    const msiExtra = msiQ.filter((q) => q.via === "champion");
    if (msiExtra.length > 0) {
      expect(msiExtra[0].team.id).toBe(fsChampion);
      expect(msiExtra[0].leagueSeed).toBe(0);
      const msiPlayIn = nextPendingTournament(s)!;
      expect(msiPlayIn.name).toBe("MSI Play-In");
      expect(msiPlayIn.teams).toHaveLength(2);
      s = applyTournamentUpdate(s, resolveTournament(msiPlayIn, rng), champions);
      expect(s.intlResults.msi).toBeUndefined();
    }
    const msi = nextPendingTournament(s)!;
    expect(msi.name).toContain("Invitational");
    expect(msi.teams).toHaveLength(18);
    expect(msi.matches.some((m) => m.isBye)).toBe(false);
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

    // Main event: 18 direct + both play-in finalists (20 → four equal
    // groups). When the MSI champion's additive slot makes it 19
    // direct, only the play-in WINNER advances so the groups stay
    // equal at 20 — no team rides an uneven group.
    const directCount = worldsQ.filter((q) => q.leagueSeed <= 3).length;
    const advancing = (directCount + 2) % 4 === 0 ? 2 : 1;
    const main = nextPendingTournament(s)!;
    expect(main.name).toContain("World");
    expect(main.teams).toHaveLength(directCount + advancing);
    // The MSI champion never goes through the play-in.
    expect(playIn.teams.some((t) => t.id === msiChampion)).toBe(false);
    const finalists = tournamentPlacements(playInDone).slice(0, advancing);
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
    // 18 splits + FS + MSI + Worlds play-in + main = 22, +1 when the
    // First Stand champion's additive slot forced an MSI Play-In.
    expect([22, 23]).toContain(Object.keys(finished.tournaments).length);
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

  it("builds First Stand as a 12-team double-elimination bracket", () => {
    const champions = championPool();
    const teams = generateSeasonTeams(champions, rngFrom(6));
    const config = makeConfig();
    config.intlConfigs = {
      "first-stand": {
        format: "double-elim",
        earlySeries: "bo3",
        semifinalSeries: "bo5",
        finalsSeries: "bo5",
        playoffTeams: 8,
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
    const rng = rngFrom(11);
    for (let i = 0; i < 6; i++) {
      s = applyTournamentUpdate(
        s,
        resolveTournament(nextPendingTournament(s)!, rng),
        champions,
      );
    }
    const fs = nextPendingTournament(s)!;
    expect(fs.name).toBe("First Stand");
    expect(fs.format).toBe("double-elim");
    expect(fs.teams).toHaveLength(12);
    // 12 teams pad to a 16 bracket: the top 4 global seeds (the league
    // #1s of the four strongest regions) skip W-R1, leaving 4 real
    // first-round matches, a losers bracket, and one grand final.
    const wR1 = fs.matches.filter(
      (m) => m.bracket === "winners" && m.round === 1,
    );
    expect(wR1).toHaveLength(4);
    expect(fs.matches.some((m) => m.bracket === "losers")).toBe(true);
    expect(
      fs.matches.filter((m) => m.bracket === "grand-final"),
    ).toHaveLength(1);
    // Series escalation: early bracket rounds at the early length, the
    // W-Final (semifinal slot) and grand final at bo5.
    expect(wR1.every((m) => m.format === "bo3")).toBe(true);
    const wRounds = fs.matches
      .filter((m) => m.bracket === "winners")
      .map((m) => m.round);
    const wFinal = fs.matches.filter(
      (m) => m.bracket === "winners" && m.round === Math.max(...wRounds),
    );
    expect(wFinal.every((m) => m.format === "bo5")).toBe(true);
    expect(
      fs.matches.find((m) => m.bracket === "grand-final")!.format,
    ).toBe("bo5");
    // The event resolves to completion and records placements.
    const done = resolveTournament(fs, rng);
    expect(done.status).toBe("complete");
    s = applyTournamentUpdate(s, done, champions);
    expect(s.intlResults["first-stand"]).toBeDefined();
    expect(currentPhase(s)!.split).toBe("spring");
  });

  it("propagates the true-grand-final toggle to season double-elim events", () => {
    const champions = championPool();
    const teams = generateSeasonTeams(champions, rngFrom(12));
    const config = makeConfig();
    config.intlConfigs = {
      "first-stand": {
        format: "double-elim",
        earlySeries: "bo3",
        finalsSeries: "bo5",
        playoffTeams: 8,
        trueGrandFinal: true,
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
    const rng = rngFrom(15);
    for (let i = 0; i < 6; i++) {
      s = applyTournamentUpdate(
        s,
        resolveTournament(nextPendingTournament(s)!, rng),
        champions,
      );
    }
    const fs = nextPendingTournament(s)!;
    expect(fs.format).toBe("double-elim");
    expect(fs.trueGrandFinal).toBe(true);
    const done = resolveTournament(fs, rng);
    expect(done.status).toBe("complete");
    // A true grand final never spawns a reset match.
    expect(done.matches.some((m) => m.bracket === "grand-final-reset")).toBe(
      false,
    );
  });

  it("disabling the Worlds play-in sends every qualified team to the main event", () => {
    const champions = championPool();
    const teams = generateSeasonTeams(champions, rngFrom(41));
    const config = makeConfig();
    config.intlConfigs = {
      worlds: {
        // round-robin absorbs any field size — safe with all seeds direct.
        format: "round-robin-playoffs",
        earlySeries: "bo1",
        finalsSeries: "bo5",
        playoffTeams: 8,
        playInEnabled: false,
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
    s = runSeason(s, champions);
    expect(s.status).toBe("complete");
    // No play-in tournament was ever created.
    expect(
      Object.values(s.tournaments).some((t) => t.name === "Worlds Play-In"),
    ).toBe(false);
    const main = Object.values(s.tournaments).find(
      (t) => t.name === "World Championship",
    )!;
    // Every qualified team (incl. the #4 seeds) is in the main event.
    const qualified = qualifiedForInternational(s, "worlds");
    expect(main.teams).toHaveLength(qualified.length);
  });

  it("honors the Worlds play-in advancers count", () => {
    const champions = championPool();
    const teams = generateSeasonTeams(champions, rngFrom(43));
    const config = makeConfig();
    config.intlConfigs = {
      worlds: {
        format: "round-robin-playoffs", // absorbs odd fields
        earlySeries: "bo1",
        finalsSeries: "bo5",
        playoffTeams: 8,
        playInAdvancing: 4,
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
    s = runSeason(s, champions);
    expect(s.status).toBe("complete");
    const playIn = Object.values(s.tournaments).find(
      (t) => t.name === "Worlds Play-In",
    )!;
    const main = Object.values(s.tournaments).find(
      (t) => t.name === "World Championship",
    )!;
    const directCount = qualifiedForInternational(s, "worlds").filter(
      (q) => q.leagueSeed <= 3,
    ).length;
    // 4 play-in finalists advanced (round-robin needs no field-fit trim).
    expect(main.teams).toHaveLength(directCount + 4);
    expect(playIn.teams).toHaveLength(6);
  });

  it("honors the advancers count even for the groups format (no silent reduction)", () => {
    // Regression: an explicit advancers count must NOT be reduced to keep
    // groups even — the user asked for 4, so 4 advance (groups go uneven).
    const champions = championPool();
    const teams = generateSeasonTeams(champions, rngFrom(44));
    const config = makeConfig();
    config.intlConfigs = {
      worlds: {
        format: "groups-playoffs",
        earlySeries: "bo1",
        finalsSeries: "bo5",
        playoffTeams: 8,
        playInAdvancing: 4,
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
    s = runSeason(s, champions);
    expect(s.status).toBe("complete");
    const main = Object.values(s.tournaments).find(
      (t) => t.name === "World Championship",
    )!;
    const directCount = qualifiedForInternational(s, "worlds").filter(
      (q) => q.leagueSeed <= 3,
    ).length;
    expect(main.teams).toHaveLength(directCount + 4);
  });

  it("runs a configurable double-elim Worlds play-in to completion", () => {
    const champions = championPool();
    const teams = generateSeasonTeams(champions, rngFrom(8));
    const config = makeConfig();
    config.intlConfigs = {
      worlds: {
        format: "groups-playoffs",
        earlySeries: "bo3",
        finalsSeries: "bo5",
        playoffTeams: 8,
        playInFormat: "double-elim",
        playInSeries: "bo3",
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
    s = runSeason(s, champions);
    expect(s.status).toBe("complete");
    const playIn = Object.values(s.tournaments).find(
      (t) => t.name === "Worlds Play-In",
    )!;
    expect(playIn.format).toBe("double-elim");
    expect(playIn.teams).toHaveLength(6);
    // A losers bracket exists, and every real play-in match uses the
    // configured play-in series (bo3) — independent of the main event.
    expect(playIn.matches.some((m) => m.bracket === "losers")).toBe(true);
    expect(
      playIn.matches.filter((m) => !m.isBye).every((m) => m.format === "bo3"),
    ).toBe(true);
  });

  it("runs a triple-elimination international event to completion", () => {
    const champions = championPool();
    const teams = generateSeasonTeams(champions, rngFrom(21));
    const config = makeConfig();
    config.intlConfigs = {
      "first-stand": {
        format: "triple-elim",
        earlySeries: "bo3",
        finalsSeries: "bo5",
        playoffTeams: 8, // ignored by triple-elim
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
    const rng = rngFrom(23);
    for (let i = 0; i < 6; i++) {
      s = applyTournamentUpdate(
        s,
        resolveTournament(nextPendingTournament(s)!, rng),
        champions,
      );
    }
    const fs = nextPendingTournament(s)!;
    expect(fs.name).toBe("First Stand");
    expect(fs.format).toBe("triple-elim");
    expect(fs.teams).toHaveLength(12);
    const done = resolveTournament(fs, rng);
    expect(done.status).toBe("complete");
    // 12 teams → 11 eliminated at exactly 3 losses, 1 champion under 3.
    s = applyTournamentUpdate(s, done, champions);
    const placements = s.intlResults["first-stand"]!;
    expect(placements).toHaveLength(12);
    expect(currentPhase(s)!.split).toBe("spring");
  });

  it("runs a swiss + triple-elim international event to completion", () => {
    const champions = championPool();
    const teams = generateSeasonTeams(champions, rngFrom(31));
    const config = makeConfig();
    config.intlConfigs = {
      "first-stand": {
        format: "swiss-playoffs-te",
        earlySeries: "bo1",
        finalsSeries: "bo5",
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
    s = runSeason(s, champions);
    expect(s.status).toBe("complete");
    const fs = Object.values(s.tournaments).find((t) => t.name === "First Stand")!;
    expect(fs.format).toBe("swiss-playoffs-te");
    // The Swiss stage seeded a 4-team triple-elim playoff bracket.
    expect(fs.matches.some((m) => m.bracket === "winners")).toBe(true);
    expect(fs.matches.some((m) => m.bracket === "grand-final")).toBe(true);
  });

  it("offers triple-elim in both league and international format lists", () => {
    expect(
      LEAGUE_FORMAT_OPTIONS.some((o) => o.value === "triple-elim"),
    ).toBe(true);
    expect(
      intlFormatOptionsFor("worlds").some((o) => o.value === "triple-elim"),
    ).toBe(true);
  });

  it("offers double-elim only where the field fits, coercing strays", () => {
    // Option lists: First Stand (and the shared card) offer plain
    // double-elim; MSI/Worlds don't (18-21 team fields).
    const has = (e: Parameters<typeof intlFormatOptionsFor>[0]) =>
      intlFormatOptionsFor(e).some((o) => o.value === "double-elim");
    expect(has("first-stand")).toBe(true);
    expect(has("shared")).toBe(true);
    expect(has("msi")).toBe(false);
    expect(has("worlds")).toBe(false);
    // A shared config that picked double-elim keeps it on First Stand
    // but falls back to the canonical formats elsewhere.
    const config = makeConfig();
    const de = {
      format: "double-elim" as const,
      earlySeries: "bo3" as const,
      finalsSeries: "bo5" as const,
      playoffTeams: 8,
    };
    config.intlConfigs = {
      "first-stand": { ...de },
      msi: { ...de },
      worlds: { ...de },
    };
    expect(intlConfigFor(config, "first-stand").format).toBe("double-elim");
    expect(intlConfigFor(config, "msi").format).toBe("swiss-playoffs-de");
    expect(intlConfigFor(config, "worlds").format).toBe("groups-playoffs");
  });
});

// ── Championship points & qualification rules (fabricated states) ──────────

describe("tournamentPlacements — play-in bracket ordering", () => {
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
  const teams: TournamentTeam[] = Array.from({ length: 8 }, (_, i) => ({
    id: `t${i + 1}`,
    name: `T${i + 1}`,
    seed: i + 1,
    starRating: 3,
  }));

  it("a double-elim play-in ranks finalists 1-2, then by bracket advancement", () => {
    for (let s = 0; s < 20; s++) {
      const rng = rngFrom(s + 1);
      let t = createTournament({
        name: "Play-In",
        format: "double-elim",
        teams,
        defaults: {
          format: "bo3",
          fearless: false,
          mode: "draft",
          aiSide: null,
          aiDifficulty: "medium",
          timerEnabled: false,
        },
      });
      for (let i = 0; i < 200 && t.status !== "complete"; i++) {
        const m = t.matches.find(
          (x) => !x.winner && x.blueTeamId != null && x.redTeamId != null,
        );
        if (!m) break;
        const blueWon = rng() < 0.5;
        t = recordMatchWinner(t, m.id, {
          teamId: blueWon ? m.blueTeamId! : m.redTeamId!,
          blueWins: blueWon ? 2 : 0,
          redWins: blueWon ? 0 : 2,
        });
      }
      const placements = tournamentPlacements(t);
      // 1st = champion (grand-final/reset winner).
      expect(placements[0]).toBe(tournamentChampion(t)!.id);
      // 1st & 2nd are the grand-final participants (the finalists).
      const gf =
        t.matches.find((m) => m.bracket === "grand-final-reset") ??
        t.matches.find((m) => m.bracket === "grand-final")!;
      expect(new Set(placements.slice(0, 2))).toEqual(
        new Set([gf.blueTeamId, gf.redTeamId]),
      );
      // The top 4 advancing are by bracket advancement (series wins), not
      // seed — so e.g. seeds 3/4 aren't automatically 3rd/4th.
      const wins = new Map<string, number>();
      for (const m of t.matches) {
        if (m.winner && !m.isBye) {
          wins.set(m.winner.teamId, (wins.get(m.winner.teamId) ?? 0) + 1);
        }
      }
      // 3rd has ≥ as many series wins as 4th (advancement order).
      expect(wins.get(placements[2]) ?? 0).toBeGreaterThanOrEqual(
        wins.get(placements[3]) ?? 0,
      );
      expect(placements).toHaveLength(8);
    }
  });

  // Regression: a stage + DE-playoffs format (round-robin-playoffs) must
  // rank the playoff finishers by WHERE they were eliminated, not by
  // their regular-season standing. Previously these placements came from
  // computeStandings (which skips bracket matches), so a team knocked out
  // early in the bracket — or the 4th team that lost to the 3rd — could
  // land below teams that never reached the playoffs and thus miss
  // qualification.
  it("a round-robin + DE playoff ranks playoff finishers by elimination, above non-qualifiers", () => {
    for (let s = 0; s < 20; s++) {
      const rng = rngFrom(s + 100);
      let t = createTournament({
        name: "League Split",
        format: "round-robin-playoffs",
        teams,
        rrPlayoffsAdvancingOverride: 4,
        defaults: {
          format: "bo3",
          fearless: false,
          mode: "draft",
          aiSide: null,
          aiDifficulty: "medium",
          timerEnabled: false,
        },
      });
      for (let i = 0; i < 400 && t.status !== "complete"; i++) {
        const m = t.matches.find(
          (x) => !x.winner && x.blueTeamId != null && x.redTeamId != null,
        );
        if (!m) {
          if (!t.rrPlayoffsStarted) {
            t = startRoundRobinPlayoffs(t);
            continue;
          }
          break;
        }
        const blueWon = rng() < 0.5;
        t = recordMatchWinner(t, m.id, {
          teamId: blueWon ? m.blueTeamId! : m.redTeamId!,
          blueWins: blueWon ? 2 : 0,
          redWins: blueWon ? 0 : 2,
        });
      }
      expect(t.status).toBe("complete");

      const placements = tournamentPlacements(t);
      expect(placements).toHaveLength(8);
      const participants = playoffParticipantIds(t);
      expect(participants.size).toBe(4);

      // The four playoff teams take the top four placements, ahead of every
      // team that never reached the bracket — regardless of stage record.
      expect(new Set(placements.slice(0, 4))).toEqual(participants);
      for (let i = 0; i < placements.length; i++) {
        const inBracket = participants.has(placements[i]);
        expect(inBracket).toBe(i < 4);
      }

      // Within the bracket: 1st is the champion, 1st/2nd are the grand-
      // final pair, and 3rd advanced at least as far as 4th (elimination
      // depth = bracket series wins).
      expect(placements[0]).toBe(tournamentChampion(t)!.id);
      const gf = t.matches.find((m) => m.bracket === "grand-final")!;
      expect(new Set(placements.slice(0, 2))).toEqual(
        new Set([gf.blueTeamId, gf.redTeamId]),
      );
      const bracketWins = new Map<string, number>();
      for (const m of t.matches) {
        if (m.winner && !m.isBye && m.bracket != null) {
          bracketWins.set(
            m.winner.teamId,
            (bracketWins.get(m.winner.teamId) ?? 0) + 1,
          );
        }
      }
      expect(bracketWins.get(placements[2]) ?? 0).toBeGreaterThanOrEqual(
        bracketWins.get(placements[3]) ?? 0,
      );

      // Non-playoff teams keep their regular-season order behind the four.
      const stageOrder = computeStandings(t)
        .map((row) => row.team.id)
        .filter((id) => !participants.has(id));
      expect(placements.slice(4)).toEqual(stageOrder);

      // And the top-4 order matches the bracket finish order (elimination).
      const bracketOrder = computeBracketFinishOrder(t)
        .map((team) => team.id)
        .filter((id) => participants.has(id));
      expect(placements.slice(0, 4)).toEqual(bracketOrder);
    }
  });
});

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

  it("seasonGoldenRoadTeamId detects a six-title sweep (and rejects a near-miss)", () => {
    const sweep = fabricate({
      splitResults: {
        winter: { LCK: ["t1", "t2"] },
        spring: { LCK: ["t1", "t2"] },
        summer: { LCK: ["t1", "t2"] },
      },
      intlResults: {
        "first-stand": ["t1"],
        msi: ["t1"],
        worlds: ["t1"],
      },
    });
    expect(seasonGoldenRoadTeamId(sweep)).toBe("t1");

    const nearMiss = fabricate({
      splitResults: {
        winter: { LCK: ["t1"] },
        spring: { LCK: ["t2"] }, // dropped Spring
        summer: { LCK: ["t1"] },
      },
      intlResults: { "first-stand": ["t1"], msi: ["t1"], worlds: ["t1"] },
    });
    expect(seasonGoldenRoadTeamId(nearMiss)).toBeNull();
  });

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
