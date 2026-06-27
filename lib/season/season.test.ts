import { describe, it, expect } from "vitest";

import type { Champion, Lane } from "../types";
import { LANE_ORDER, PLAYER_TIERS } from "../players";
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
  applyPlayerDevelopment,
  applyTournamentUpdate,
  championshipPoints,
  createSeason,
  currentPhase,
  intlConfigFor,
  intlFormatOptionsFor,
  LEAGUE_FORMAT_OPTIONS,
  nextPendingTournament,
  qualifiedForInternational,
  regionStrengthSeed,
  seasonGoldenRoadTeamId,
  tournamentPlacements,
} from "./engine";
import type { SeasonHistoryEntry, SeasonHistoryTeamRef } from "./history";
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
    // Seeds-bye structure: the six region #2 seeds play a play-in; the six
    // #1 seeds bye straight into the main 8-team single-elim bracket.
    const fsQualified = qualifiedForInternational(s, "first-stand");
    expect(fsQualified.slice(0, 6).every((q) => q.leagueSeed === 1)).toBe(true);
    expect(fsQualified.slice(6).every((q) => q.leagueSeed === 2)).toBe(true);
    const fsPlayIn = nextPendingTournament(s)!;
    expect(fsPlayIn.name).toBe("First Stand Play-In");
    expect(fsPlayIn.teams).toHaveLength(6); // the #2 seeds
    for (const q of fsQualified.filter((x) => x.leagueSeed === 2)) {
      expect(fsPlayIn.teams.some((t) => t.id === q.team.id)).toBe(true);
    }
    s = applyTournamentUpdate(s, resolveTournament(fsPlayIn, rng), champions);
    // The play-in is a qualifier — it must not record the event result.
    expect(s.intlResults["first-stand"]).toBeUndefined();
    const fs = nextPendingTournament(s)!;
    expect(fs.name).toBe("First Stand");
    expect(fs.teams).toHaveLength(8); // six #1 seeds + two play-in finalists
    // Every region #1 seed byes straight into the main bracket.
    for (const q of fsQualified.filter((x) => x.leagueSeed === 1)) {
      expect(fs.teams.some((t) => t.id === q.team.id)).toBe(true);
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
    // make spring top-3 (additive defending-champion slot). The canonical
    // MSI seeds the region #1 seeds (and the additive champion) straight
    // into a 12-team double-elim bracket; only the twelve #2/#3 seeds play
    // the swiss stage, so the field is always even and no play-in is run.
    const msiQ = qualifiedForInternational(s, "msi");
    const fsChampion = s.intlResults["first-stand"]![0];
    expect(msiQ.some((q) => q.team.id === fsChampion)).toBe(true);
    const msiExtra = msiQ.filter((q) => q.via === "champion");
    if (msiExtra.length > 0) {
      expect(msiExtra[0].team.id).toBe(fsChampion);
      expect(msiExtra[0].leagueSeed).toBe(0);
    }
    const msi = nextPendingTournament(s)!;
    expect(msi.name).toContain("Invitational");
    expect(msi.teams).toHaveLength(msiQ.length);
    // Byes = region #1 seeds (leagueSeed 1) + any additive champion (0).
    const msiByes = msiQ.filter((q) => q.leagueSeed <= 1).length;
    expect(msi.swissByeTeamIds).toHaveLength(msiByes);
    // Bracket is a fixed 12: byes + swiss qualifiers.
    expect(msiByes + (msi.swissPlayoffsAdvancing ?? 0)).toBe(12);
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
    // Seeds-bye First Stand opens with a play-in for the #2 seeds; both it
    // and the main bracket carry each team's end-of-winter streak as a seed.
    const playIn = nextPendingTournament(s)!; // First Stand Play-In (#2 seeds)
    expect(playIn.name).toContain("Play-In");
    expect(playIn.streakSeeds).toBeDefined();
    for (const team of playIn.teams) {
      const winter = winterTournaments.find((t) =>
        t.teams.some((tt) => tt.id === team.id),
      )!;
      expect(playIn.streakSeeds![team.id] ?? 0).toBe(teamStreak(winter, team.id));
    }
    s = applyTournamentUpdate(s, resolveTournament(playIn, rng), champions);
    const fs = nextPendingTournament(s)!; // First Stand main (#1 seeds bye in)
    expect(fs.name).toBe("First Stand");
    expect(fs.streakSeeds).toBeDefined();
    // The #1 seeds bye straight in carrying their winter streak; the play-in
    // finalists instead carry their (just-completed) play-in run, so only
    // check the bye teams against their winter split here.
    const byeIds = new Set(
      qualifiedForInternational(s, "first-stand")
        .filter((q) => q.leagueSeed === 1)
        .map((q) => q.team.id),
    );
    for (const team of fs.teams) {
      if (!byeIds.has(team.id)) continue;
      const winter = winterTournaments.find((t) =>
        t.teams.some((tt) => tt.id === team.id),
      )!;
      expect(fs.streakSeeds![team.id] ?? 0).toBe(teamStreak(winter, team.id));
    }
    // League champions are #1 seeds → bye into the main on a win streak
    // (they won their winter playoff run).
    const champions6 = winterTournaments.map((t) => tournamentPlacements(t)[0]);
    for (const id of champions6) {
      expect(byeIds.has(id)).toBe(true);
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

  it("runs the First Stand seed-bye play-in as double-elim when configured", () => {
    const champions = championPool();
    const teams = generateSeasonTeams(champions, rngFrom(5));
    const config = makeConfig();
    config.intlConfigs = {
      "first-stand": {
        format: "single-elim",
        earlySeries: "bo1",
        finalsSeries: "bo3",
        playoffTeams: 8,
        playInFormat: "double-elim",
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
    // The #2-seed play-in is a double-elim bracket.
    const playIn = nextPendingTournament(s)!;
    expect(playIn.name).toBe("First Stand Play-In");
    expect(playIn.format).toBe("double-elim");
    expect(playIn.matches.some((m) => m.bracket === "losers")).toBe(true);
    s = applyTournamentUpdate(s, resolveTournament(playIn, rng), champions);
    // The main bracket is still the single-elim event with the #1 seeds.
    const fs = nextPendingTournament(s)!;
    expect(fs.name).toBe("First Stand");
    expect(fs.format).toBe("single-elim");
    expect(fs.teams).toHaveLength(8);
  });

  it("reverts First Stand to a plain single-elim when the play-in is off", () => {
    const champions = championPool();
    const teams = generateSeasonTeams(champions, rngFrom(5));
    const config = makeConfig();
    config.intlConfigs = {
      "first-stand": {
        format: "single-elim",
        earlySeries: "bo1",
        finalsSeries: "bo3",
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
    const rng = rngFrom(9);
    for (let i = 0; i < 6; i++) {
      s = applyTournamentUpdate(
        s,
        resolveTournament(nextPendingTournament(s)!, rng),
        champions,
      );
    }
    // No play-in: First Stand is a single 12-team single-elim event.
    const fs = nextPendingTournament(s)!;
    expect(fs.name).toBe("First Stand");
    expect(fs.format).toBe("single-elim");
    expect(fs.teams).toHaveLength(12);
    expect(fs.groupsByeTeamIds).toBeUndefined();
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

  it("Worlds Groups+DE runs every team through 4 equal groups (no seed byes)", () => {
    const champions = championPool();
    const teams = generateSeasonTeams(champions, rngFrom(46));
    const config = makeConfig();
    config.intlConfigs = {
      worlds: {
        format: "groups-playoffs-de",
        earlySeries: "bo1",
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
    s = runSeason(s, champions);
    expect(s.status).toBe("complete");
    const main = Object.values(s.tournaments).find(
      (t) => t.name === "World Championship",
    )!;
    // No team bypasses the group stage — the #1 seeds play groups too.
    expect(main.groupsByeTeamIds).toBeUndefined();
    // 18 direct + 2 play-in (or 19 + auto-reduced 1) = 20 → 4 equal groups
    // of 5, top 2 of each → 8-team DE bracket.
    expect(main.teams).toHaveLength(20);
    expect(main.teams.length % 4).toBe(0);
    expect(main.groupsPlayoffs!.groupCount).toBe(4);
    expect(main.groupsPlayoffs!.advancingPerGroup).toBe(2);
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

// ── Season realism: form / development / adaptability / region tides ────────

describe("season realism features", () => {
  const META = {
    metaOverride: null,
    metaEnabled: true,
    synergyOverride: null,
    counterOverride: null,
  };

  function makeSeason(overrides: Partial<SeasonConfig>): SeasonState {
    const champions = championPool();
    const teams = generateSeasonTeams(champions, rngFrom(5));
    const config = { ...makeConfig(), ...overrides };
    return createSeason({ config, teams, activeMeta: META });
  }

  // Resolve every tournament of the winter split (and trigger the
  // winter → First Stand boundary), returning the season at First Stand.
  function playWinter(s: SeasonState, champions: Champion[]): SeasonState {
    const rng = rngFrom(11);
    while (currentPhase(s)?.split === "winter") {
      s = applyTournamentUpdate(
        s,
        resolveTournament(nextPendingTournament(s)!, rng),
        champions,
      );
    }
    return s;
  }

  it("[default] carries no realism state when every flag is off", () => {
    const champions = championPool();
    let s = createSeason({
      config: makeConfig(),
      teams: generateSeasonTeams(champions, rngFrom(5)),
      activeMeta: META,
    });
    s = playWinter(s, champions);
    expect(s.teamForm).toBeUndefined();
    expect(s.teamClutch).toBeUndefined();
    expect(s.teamAdaptability).toBeUndefined();
    expect(s.leagueStrength).toBeUndefined();
    // And the next tournament's teams carry no form/clutch fields.
    const fs = nextPendingTournament(s)!;
    expect(fs.teams.every((t) => t.form === undefined)).toBe(true);
    expect(fs.teams.every((t) => t.clutch === undefined)).toBe(true);
  });

  it("[A] form drifts within [-1,1] and reaches the next tournament's teams", () => {
    const champions = championPool();
    let s = createSeason({
      config: { ...makeConfig(), formDrift: true },
      teams: generateSeasonTeams(champions, rngFrom(5)),
      activeMeta: META,
    });
    s = playWinter(s, champions);
    expect(s.teamForm).toBeDefined();
    const forms = Object.values(s.teamForm!);
    expect(forms.length).toBeGreaterThan(0);
    for (const f of forms) expect(Math.abs(f)).toBeLessThanOrEqual(1);
    // Some team came out of winter hot or cold, and that form is attached
    // to its TournamentTeam in the next event.
    expect(forms.some((f) => f !== 0)).toBe(true);
    const fs = nextPendingTournament(s)!;
    expect(fs.teams.some((t) => typeof t.form === "number")).toBe(true);
  });

  it("[D] a patch shift swings form toward each team's adaptability", () => {
    const champions = championPool();
    // Adaptability on, form-from-results off → after the winter patch shift
    // every team's form is purely its adaptability swing, so the signs line
    // up exactly.
    let s = createSeason({
      config: {
        ...makeConfig(),
        patchShift: true,
        metaAdaptability: true,
      },
      teams: generateSeasonTeams(champions, rngFrom(5)),
      activeMeta: META,
    });
    s = playWinter(s, champions);
    expect(s.teamAdaptability).toBeDefined();
    expect(s.teamForm).toBeDefined();
    for (const team of s.teams) {
      const a = s.teamAdaptability![team.id] ?? 0;
      if (Math.abs(a) < 0.01) continue;
      const f = s.teamForm![team.id] ?? 0;
      expect(Math.sign(f)).toBe(Math.sign(a));
    }
  });

  it("[E] clutch traits are seeded for every team", () => {
    const s = makeSeason({ clutchFactor: true });
    expect(s.teamClutch).toBeDefined();
    expect(Object.keys(s.teamClutch!).length).toBe(s.teams.length);
    for (const v of Object.values(s.teamClutch!)) {
      expect(Math.abs(v)).toBeLessThanOrEqual(1);
    }
  });

  it("[F] region tides reorder inter-league seeding by strength", () => {
    const champions = championPool();
    const teams = generateSeasonTeams(champions, rngFrom(5));
    const base = createSeason({
      config: { ...makeConfig(), regionTides: true },
      teams,
      activeMeta: META,
    });
    // Hand each league a full winter placement list and a strength score
    // that makes the FIXED order's weakest region (LCP) the strongest.
    const winter = Object.fromEntries(
      LEAGUE_IDS.map((lg) => [
        lg,
        teams.filter((t) => t.leagueId === lg).map((t) => t.id),
      ]),
    );
    const strength: Partial<Record<(typeof LEAGUE_IDS)[number], number>> = {};
    LEAGUE_IDS.forEach((lg, i) => (strength[lg] = i)); // last (LCP) = highest
    const tided: SeasonState = {
      ...base,
      splitResults: { winter },
      leagueStrength: strength,
    };
    const q = qualifiedForInternational(tided, "first-stand");
    const firstSeeds = q.filter((x) => x.leagueSeed === 1).map((x) => x.league);
    expect(firstSeeds).toEqual([...LEAGUE_IDS].reverse());

    // Without region tides, the fixed LCK>LPL>… order holds.
    const fixed: SeasonState = {
      ...base,
      config: { ...base.config, regionTides: false },
      splitResults: { winter },
      leagueStrength: strength,
    };
    const qFixed = qualifiedForInternational(fixed, "first-stand");
    expect(qFixed.filter((x) => x.leagueSeed === 1).map((x) => x.league)).toEqual([
      ...LEAGUE_IDS,
    ]);
  });

  it("[B] player development drifts tiers within bounds and regresses extremes", () => {
    const champions = championPool();
    const teams = generateSeasonTeams(champions, rngFrom(5)).map((t) => ({
      ...t,
      players: t.players.map((p) => ({ ...p, tier: "S" as const })),
    }));
    const s = createSeason({
      config: { ...makeConfig(), playerDevelopment: true },
      teams,
      activeMeta: META,
    });
    const developed = applyPlayerDevelopment(s, rngFrom(3));
    const tiers = developed.teams.flatMap((t) => t.players.map((p) => p.tier));
    // Every tier stays valid…
    for (const tier of tiers) expect(PLAYER_TIERS).toContain(tier);
    // …and a peaked (all-S) field can only hold or regress — never exceed S,
    // and at least one player steps down.
    expect(tiers.some((tier) => tier !== "S")).toBe(true);

    // The mirror case: an all-D field can only rise.
    const dTeams = generateSeasonTeams(champions, rngFrom(6)).map((t) => ({
      ...t,
      players: t.players.map((p) => ({ ...p, tier: "D" as const })),
    }));
    const sD = createSeason({
      config: { ...makeConfig(), playerDevelopment: true },
      teams: dTeams,
      activeMeta: META,
    });
    const developedD = applyPlayerDevelopment(sD, rngFrom(3));
    const tiersD = developedD.teams.flatMap((t) => t.players.map((p) => p.tier));
    expect(tiersD.some((tier) => tier !== "D")).toBe(true);
  });

  it("runs a full season with every realism feature enabled", () => {
    const champions = championPool();
    let s = createSeason({
      config: {
        ...makeConfig(),
        patchShift: true,
        formDrift: true,
        playerDevelopment: true,
        metaAdaptability: true,
        clutchFactor: true,
        regionTides: true,
      },
      teams: generateSeasonTeams(champions, rngFrom(5)),
      activeMeta: META,
    });
    s = runSeason(s, champions);
    expect(s.status).toBe("complete");
    expect(s.champion).not.toBeNull();
    // All player tiers remained valid through the year's development.
    const tiers = s.teams.flatMap((t) => t.players.map((p) => p.tier));
    for (const tier of tiers) expect(PLAYER_TIERS).toContain(tier);
  });
});

// ── Region Tides: cross-season carryover ────────────────────────────────────

describe("region tides cross-season carryover", () => {
  const META = {
    metaOverride: null,
    metaEnabled: true,
    synergyOverride: null,
    counterOverride: null,
  };

  function ref(leagueId: (typeof LEAGUE_IDS)[number]): SeasonHistoryTeamRef {
    return { name: `${leagueId} Team`, leagueId, color: "#fff", iconKey: "shield" };
  }

  function entry(over: Partial<SeasonHistoryEntry>): SeasonHistoryEntry {
    return {
      id: "prev",
      archivedAt: 0,
      name: "Prev",
      complete: true,
      champion: null,
      runnerUp: null,
      intlChampions: {},
      splitChampions: {},
      ...over,
    };
  }

  it("prefers the evolved tide, decayed toward neutral", () => {
    const seed = regionStrengthSeed(
      entry({ leagueStrength: { LCK: 0.4, LPL: -0.2, LCP: 0 } }),
    );
    expect(seed.LCK).toBeCloseTo(0.2);
    expect(seed.LPL).toBeCloseTo(-0.1);
    // Zero entries are dropped, not carried as 0.
    expect(seed.LCP).toBeUndefined();
  });

  it("falls back to champion regions when no tide was recorded", () => {
    const seed = regionStrengthSeed(
      entry({
        intlChampions: {
          worlds: ref("LPL"),
          msi: ref("LCK"),
          "first-stand": ref("LPL"),
        },
      }),
    );
    // Worlds (0.5) + First Stand (0.15) both went to LPL; MSI (0.3) to LCK.
    expect(seed.LPL).toBeCloseTo(0.65);
    expect(seed.LCK).toBeCloseTo(0.3);
  });

  it("seeds a new season's tides from the prior season (only when regionTides on)", () => {
    const champions = championPool();
    const teams = generateSeasonTeams(champions, rngFrom(5));
    const prior = entry({ leagueStrength: { LCP: 0.6, LCK: -0.4 } });

    const tided = createSeason({
      config: { ...makeConfig(), regionTides: true },
      teams,
      activeMeta: META,
      priorSeason: prior,
    });
    expect(tided.leagueStrength!.LCP).toBeCloseTo(0.3);
    expect(tided.leagueStrength!.LCK).toBeCloseTo(-0.2);
    // Regions the prior tide didn't touch start neutral.
    expect(tided.leagueStrength!.LEC).toBe(0);

    // Region Tides off → no carryover, no map at all.
    const plain = createSeason({
      config: makeConfig(),
      teams,
      activeMeta: META,
      priorSeason: prior,
    });
    expect(plain.leagueStrength).toBeUndefined();
  });
});

// ── Region Tides: anchored to the fixed LCK>LPL>… prestige ranking ──────────

describe("region tides stay anchored to the prestige ranking", () => {
  const META = {
    metaOverride: null,
    metaEnabled: true,
    synergyOverride: null,
    counterOverride: null,
  };

  function seasonWith(
    strength: Partial<Record<(typeof LEAGUE_IDS)[number], number>>,
  ): SeasonState {
    const champions = championPool();
    const teams = generateSeasonTeams(champions, rngFrom(5));
    const base = createSeason({
      config: { ...makeConfig(), regionTides: true },
      teams,
      activeMeta: META,
    });
    const winter = Object.fromEntries(
      LEAGUE_IDS.map((lg) => [
        lg,
        teams.filter((t) => t.leagueId === lg).map((t) => t.id),
      ]),
    );
    return { ...base, splitResults: { winter }, leagueStrength: strength };
  }

  function firstSeedOrder(s: SeasonState) {
    return qualifiedForInternational(s, "first-stand")
      .filter((q) => q.leagueSeed === 1)
      .map((q) => q.league);
  }

  it("keeps the canonical order when tides are small", () => {
    // A tide smaller than the prestige gap can't move a region.
    const s = seasonWith({ LCP: 0.3, LCK: -0.3 });
    expect(firstSeedOrder(s)).toEqual([...LEAGUE_IDS]);
  });

  it("lets a region climb one spot once its tide outweighs the gap", () => {
    // CBLOL (+0.7) overtakes the normally-stronger LCS, but the top of the
    // ranking is untouched.
    const s = seasonWith({ CBLOL: 0.7 });
    const order = firstSeedOrder(s);
    expect(order.indexOf("CBLOL")).toBeLessThan(order.indexOf("LCS"));
    expect(order.slice(0, 3)).toEqual(["LCK", "LPL", "LEC"]);
  });
});

describe("transfer windows as phases", () => {
  const champions = championPool();
  const teams = generateSeasonTeams(champions, rngFrom(5));
  const meta = {
    metaOverride: null,
    metaEnabled: true,
    synergyOverride: null,
    counterOverride: null,
  };

  it("inserts two transfer phases (after First Stand and MSI) only when enabled", () => {
    const off = createSeason({ config: makeConfig(), teams, activeMeta: meta });
    expect(off.phases.some((p) => p.kind === "transfer")).toBe(false);

    const on = createSeason({
      config: { ...makeConfig(), playerTransfers: true },
      teams,
      activeMeta: meta,
    });
    expect(on.phases.map((p) => p.kind)).toEqual([
      "split",
      "international",
      "transfer",
      "split",
      "international",
      "transfer",
      "split",
      "international",
    ]);
    // Each window follows its international and precedes the next split.
    expect(on.phases.filter((p) => p.kind === "transfer").map((p) => p.event)).toEqual([
      "first-stand",
      "msi",
    ]);
  });

  it("flows through the windows to a champion, never opening one after Worlds", () => {
    const done = runSeason(
      createSeason({
        config: { ...makeConfig(), playerTransfers: true },
        teams,
        activeMeta: meta,
      }),
      champions,
    );
    expect(done.status).toBe("complete");
    // No controlled team → windows auto-complete.
    for (const p of done.phases.filter((p) => p.kind === "transfer")) {
      expect(p.status).toBe("complete");
    }
    expect(done.transfersByEvent?.worlds).toBeUndefined();
  });
});
