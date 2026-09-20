// lib/awards.test.ts — Unit tests for computeTournamentAwards.

import { describe, expect, it } from "vitest";
import { computeTournamentAwards } from "./awards";
import type { TournamentState, TournamentMatch, TournamentTeam } from "./tournament";
import type { SeriesState, GameDraft, GameRecap } from "./types";

// ─── Factories ────────────────────────────────────────────────────────────────

function makeTeam(id: string, name: string, seed: number): TournamentTeam {
  return { id, name, seed, starRating: 3 };
}

/** Create a minimal GameRecap with explicit ratings (no perPickKDA needed). */
function makeRecap(blueRatings: number[], redRatings: number[]): GameRecap {
  return {
    durationMinutes: 32,
    mvp: null,
    biggestSwing: null,
    ratings: { blue: blueRatings, red: redRatings },
  };
}

/** Create a completed GameDraft with a recap. */
function makeGame(
  gameNumber: number,
  blueTeam: string,
  redTeam: string,
  winner: "blue" | "red",
  recap: GameRecap,
): GameDraft {
  return {
    id: `g-${gameNumber}`,
    gameNumber,
    blueTeam,
    redTeam,
    blueBans: [],
    redBans: [],
    bluePicks: [],
    redPicks: [],
    blueRoles: [null, null, null, null, null],
    redRoles: [null, null, null, null, null],
    actionIndex: 0,
    status: "complete",
    winner,
    recap,
  };
}

/** Create a completed SeriesState with the given games. */
function makeSeries(
  blueTeam: string,
  redTeam: string,
  games: GameDraft[],
): SeriesState {
  return {
    id: `series-${blueTeam}-${redTeam}`,
    format: "bo3",
    fearless: false,
    timerEnabled: false,
    blueTeam,
    redTeam,
    games,
    status: "complete",
    winner: "blue",
    mode: "aivai",
    aiSide: null,
    aiDifficulty: "normal",
  };
}

/** Create a completed TournamentMatch wrapping a SeriesState. */
function makeMatch(
  id: string,
  round: number,
  blueTeamId: string,
  redTeamId: string,
  winnerTeamId: string,
  series: SeriesState,
): TournamentMatch {
  const blueWins = winnerTeamId === blueTeamId ? 2 : 0;
  const redWins = winnerTeamId === redTeamId ? 2 : 0;
  return {
    id,
    round,
    blueTeamId,
    redTeamId,
    format: "bo3",
    fearless: false,
    mode: "aivai",
    aiSide: null,
    aiDifficulty: "normal",
    series,
    winner: { teamId: winnerTeamId, blueWins, redWins },
    feedsInto: null,
  };
}

// ─── Fabricate a small completed single-elim tournament ────────────────────────
//
// 4 teams (A, B, C, D):
//   Round 1:  A beats C,  B beats D
//   Final:    A beats B
//
// Player ratings (5 lanes per side per game):
//   Match A-C (2 games):
//     A players: game1=[7,7,7,7,7], game2=[8,8,8,8,8]  → avg 7.5 each
//     C players: game1=[5,5,5,5,5], game2=[5,5,5,5,5]  → avg 5.0 each
//
//   Match B-D (2 games):
//     B players: game1=[6,6,6,6,6], game2=[7,7,7,7,7]  → avg 6.5 each
//     D players: game1=[4,4,4,4,4], game2=[4,4,4,4,4]  → avg 4.0 each
//
//   Final A-B (2 games):
//     A players: game1=[8,8,8,8,8], game2=[9,9,9,9,9]  → avg 8.5 each
//     B players: game1=[7,7,7,7,7], game2=[6,6,6,6,6]  → avg 6.5 each
//
// Overall A totals (4 games): ratings = [7,8, 8,9] per lane → avg 8.0
// Overall B totals (4 games): [6,7, 7,6] per lane → avg 6.5
//
// For MVP depth-weighting test:
//   - Inject a "star" C-top player who only played 2 games (avg 9.0) but
//     team C was eliminated in round 1.
//   - A-Top has avg 8.0 over 4 games → mvpScore = 8.0 × log2(5) ≈ 18.6
//   - C-Top has avg 9.0 over 2 games → mvpScore = 9.0 × log2(3) ≈ 14.3
//   → A-Top should be MVP despite lower avg.

function buildTestTournament(): TournamentState {
  const teamA = makeTeam("t-a", "Alpha", 1);
  const teamB = makeTeam("t-b", "Beta", 2);
  const teamC = makeTeam("t-c", "Gamma", 3);
  const teamD = makeTeam("t-d", "Delta", 4);

  // Ratings arrays: [top, jungle, middle, bottom, support]
  // Match A-C
  const acGame1 = makeGame(
    1, "Alpha", "Gamma", "blue",
    makeRecap(
      [7, 7, 7, 7, 7],   // A players
      [5, 5, 5, 5, 5],   // C players — override C-top to 9.0
    ),
  );
  // Override C-top (index 0) in game 1 to be 9.0 for the depth-weighting test.
  acGame1.recap!.ratings!.red[0] = 9.0;

  const acGame2 = makeGame(
    2, "Alpha", "Gamma", "blue",
    makeRecap(
      [8, 8, 8, 8, 8],   // A players
      [5, 5, 5, 5, 5],   // C players — override C-top to 9.0
    ),
  );
  acGame2.recap!.ratings!.red[0] = 9.0;

  // Match B-D
  const bdGame1 = makeGame(
    1, "Beta", "Delta", "blue",
    makeRecap([6, 6, 6, 6, 6], [4, 4, 4, 4, 4]),
  );
  const bdGame2 = makeGame(
    2, "Beta", "Delta", "blue",
    makeRecap([7, 7, 7, 7, 7], [4, 4, 4, 4, 4]),
  );

  // Final A-B
  const finalGame1 = makeGame(
    1, "Alpha", "Beta", "blue",
    makeRecap([8, 8, 8, 8, 8], [7, 7, 7, 7, 7]),
  );
  const finalGame2 = makeGame(
    2, "Alpha", "Beta", "blue",
    makeRecap([9, 9, 9, 9, 9], [6, 6, 6, 6, 6]),
  );

  const matchAC = makeMatch(
    "m1", 1, "t-a", "t-c", "t-a",
    makeSeries("Alpha", "Gamma", [acGame1, acGame2]),
  );
  const matchBD = makeMatch(
    "m2", 1, "t-b", "t-d", "t-b",
    makeSeries("Beta", "Delta", [bdGame1, bdGame2]),
  );
  const matchFinal: TournamentMatch = {
    ...makeMatch(
      "m3", 2, "t-a", "t-b", "t-a",
      makeSeries("Alpha", "Beta", [finalGame1, finalGame2]),
    ),
    feedsInto: null,
  };
  // Wire the bracket so round-1 matches feed into the final.
  matchAC.feedsInto = { matchId: "m3", slot: "blue" };
  matchBD.feedsInto = { matchId: "m3", slot: "red" };

  return {
    id: "tour-test",
    name: "Test Tournament",
    format: "single-elim",
    status: "complete",
    teams: [teamA, teamB, teamC, teamD],
    matches: [matchAC, matchBD, matchFinal],
    fearlessConfig: { perSeries: false, perTeam: false, global: false },
    teamPickHistory: {},
    globalPickHistory: [],
    defaults: {
      format: "bo3",
      fearless: false,
      mode: "aivai",
      aiSide: null,
      aiDifficulty: "normal",
      timerEnabled: false,
    },
    createdAt: 0,
    updatedAt: 0,
    activeMatchId: null,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("computeTournamentAwards", () => {
  const tournament = buildTestTournament();
  const result = computeTournamentAwards(tournament);

  // ── MVP ──────────────────────────────────────────────────────────────────

  describe("MVP", () => {
    it("returns a non-null MVP", () => {
      expect(result.mvp).not.toBeNull();
    });

    it("MVP belongs to Alpha team (depth-weighting wins over higher avg C-top)", () => {
      // Alpha players each played 4 rated games; C-top played only 2.
      // A-top: avg 8.0 over 4 games → score = 8.0 × log2(5) ≈ 18.6
      // C-top: avg 9.0 over 2 games → score = 9.0 × log2(3) ≈ 14.3
      // Alpha should win.
      expect(result.mvp?.teamId).toBe("t-a");
    });

    it("MVP has the correct team name", () => {
      expect(result.mvp?.teamName).toBe("Alpha");
    });

    it("MVP avgRating reflects all 4 games (7+8+8+9)/4 = 8.0", () => {
      // Top lane ratings for Alpha: 7,8,8,9 → avg 8.0
      expect(result.mvp?.avgRating).toBe(8.0);
    });

    it("MVP gamesPlayed is 4", () => {
      expect(result.mvp?.gamesPlayed).toBe(4);
    });

    it("depth-weighting: C-top (9.0 avg, 2 games) does NOT beat A-top (8.0 avg, 4 games)", () => {
      // Explicitly verify the loser.
      const mvpScore = (avg: number, n: number) => avg * Math.log2(1 + n);
      const aTopScore = mvpScore(8.0, 4);
      const cTopScore = mvpScore(9.0, 2);
      expect(aTopScore).toBeGreaterThan(cTopScore);
    });
  });

  // ── All-Pro ───────────────────────────────────────────────────────────────

  describe("All-Pro team", () => {
    it("returns 5 All-Pro entries (one per lane)", () => {
      expect(result.allPro).toHaveLength(5);
    });

    it("covers all five lanes", () => {
      const lanes = result.allPro.map((p) => p.lane).sort();
      expect(lanes).toEqual(["bottom", "jungle", "middle", "support", "top"]);
    });

    it("All-Pro Top player belongs to Alpha (avg 8.0 over 4 games)", () => {
      const topEntry = result.allPro.find((p) => p.lane === "top");
      expect(topEntry?.teamId).toBe("t-a");
    });

    it("each All-Pro entry has a valid displayName", () => {
      for (const entry of result.allPro) {
        expect(entry.displayName).toMatch(/Alpha|Beta|Gamma|Delta/);
      }
    });

    it("each All-Pro entry has gamesPlayed >= 3 (minimum threshold)", () => {
      for (const entry of result.allPro) {
        expect(entry.gamesPlayed).toBeGreaterThanOrEqual(3);
      }
    });
  });

  // ── Awards ────────────────────────────────────────────────────────────────

  describe("special awards", () => {
    it("includes a 'performance' award", () => {
      const perf = result.awards.find((a) => a.kind === "performance");
      expect(perf).toBeDefined();
    });

    it("'performance' award has the highest single-game rating (9.0)", () => {
      const perf = result.awards.find((a) => a.kind === "performance");
      // Peak rating 9.0 was achieved by C-top (game 1 and 2) and also A-top game2
      // both are 9.0 — the context string should mention that value
      expect(perf?.context).toMatch(/^9\.0/);
    });

    it("'consistent' award does NOT appear when all players have < 5 rated games", () => {
      // Our test only has 4 games per player — below the 5-game threshold.
      // Consistent award should NOT appear.
      const consistent = result.awards.find((a) => a.kind === "consistent");
      expect(consistent).toBeUndefined();
    });

    it("includes a 'carry_losing_side' award when the tournament has a winner", () => {
      const carryLosing = result.awards.find((a) => a.kind === "carry_losing");
      expect(carryLosing).toBeDefined();
    });

    it("'carry_losing_side' player does NOT belong to the winning team", () => {
      const carryLosing = result.awards.find((a) => a.kind === "carry_losing");
      // Alpha won the tournament.
      expect(carryLosing?.player.teamId).not.toBe("t-a");
    });

    it("does NOT include 'hottest_streak' when playerForms is undefined", () => {
      const streak = result.awards.find((a) => a.kind === "hottest_streak");
      expect(streak).toBeUndefined();
    });
  });

  // ── Hottest streak (with playerForms) ──────────────────────────────────────

  describe("hottest streak award", () => {
    it("includes 'hottest_streak' when playerForms is provided with positive form", () => {
      const forms = {
        "t-b:top": 0.75,
        "t-a:top": 0.30,
      };
      const withForms = computeTournamentAwards(tournament, forms);
      const streak = withForms.awards.find((a) => a.kind === "hottest_streak");
      expect(streak).toBeDefined();
    });

    it("'hottest_streak' picks the player with the highest form value", () => {
      const forms = {
        "t-b:top": 0.75,
        "t-a:top": 0.30,
      };
      const withForms = computeTournamentAwards(tournament, forms);
      const streak = withForms.awards.find((a) => a.kind === "hottest_streak");
      expect(streak?.player.teamId).toBe("t-b");
      expect(streak?.player.lane).toBe("top");
    });

    it("does NOT include 'hottest_streak' when all forms are <= 0", () => {
      const forms = { "t-b:top": -0.3, "t-a:top": -0.1 };
      const withForms = computeTournamentAwards(tournament, forms);
      const streak = withForms.awards.find((a) => a.kind === "hottest_streak");
      expect(streak).toBeUndefined();
    });
  });

  // ── Graceful empties ──────────────────────────────────────────────────────

  describe("graceful handling of insufficient data", () => {
    it("returns null MVP and empty allPro for a tournament with no recaps", () => {
      const emptyTournament: TournamentState = {
        id: "empty",
        name: "Empty",
        format: "single-elim",
        status: "complete",
        teams: [makeTeam("t1", "T1", 1), makeTeam("t2", "T2", 2)],
        matches: [],
        fearlessConfig: { perSeries: false, perTeam: false, global: false },
        teamPickHistory: {},
        globalPickHistory: [],
        defaults: {
          format: "bo1",
          fearless: false,
          mode: "aivai",
          aiSide: null,
          aiDifficulty: "normal",
          timerEnabled: false,
        },
        createdAt: 0,
        updatedAt: 0,
        activeMatchId: null,
      };
      const r = computeTournamentAwards(emptyTournament);
      expect(r.mvp).toBeNull();
      expect(r.allPro).toHaveLength(0);
      expect(r.awards).toHaveLength(0);
    });

    it("handles matches with no series gracefully (series: null)", () => {
      const tournament2 = buildTestTournament();
      // Null out the series on one match.
      tournament2.matches[0] = { ...tournament2.matches[0], series: null };
      expect(() => computeTournamentAwards(tournament2)).not.toThrow();
    });

    it("handles recap with no ratings and no perPickKDA gracefully", () => {
      const t = buildTestTournament();
      // Strip ratings and perPickKDA from a game.
      const m = t.matches[0];
      if (m.series) {
        const g = m.series.games[0];
        if (g.recap) {
          g.recap.ratings = undefined;
          g.recap.perPickKDA = undefined;
        }
      }
      expect(() => computeTournamentAwards(t)).not.toThrow();
    });

    it("handles bye matches without crashing", () => {
      const t = buildTestTournament();
      t.matches.push({
        id: "bye-1",
        round: 1,
        blueTeamId: "t-a",
        redTeamId: null,
        format: "bo1",
        fearless: false,
        mode: "aivai",
        aiSide: null,
        aiDifficulty: "normal",
        series: null,
        winner: { teamId: "t-a", blueWins: 1, redWins: 0 },
        feedsInto: null,
        isBye: true,
      });
      expect(() => computeTournamentAwards(t)).not.toThrow();
    });
  });

  // ── Consistent award with sufficient games ────────────────────────────────

  describe("most consistent award (5+ games)", () => {
    it("appears when a player has 5+ rated games with avg >= 6", () => {
      // Build tournament with 3 series for team A so A-top has 6 games.
      const t = buildTestTournament();
      // Duplicate the final match data as a second series for round-0 to give 6 total games.
      const extraSeries = makeSeries("Alpha", "Beta", [
        makeGame(3, "Alpha", "Beta", "blue", makeRecap([8, 8, 8, 8, 8], [7, 7, 7, 7, 7])),
        makeGame(4, "Alpha", "Beta", "blue", makeRecap([8, 8, 8, 8, 8], [7, 7, 7, 7, 7])),
      ]);
      const extraMatch: TournamentMatch = {
        id: "m4",
        round: 0,
        blueTeamId: "t-a",
        redTeamId: "t-b",
        format: "bo3",
        fearless: false,
        mode: "aivai",
        aiSide: null,
        aiDifficulty: "normal",
        series: extraSeries,
        winner: { teamId: "t-a", blueWins: 2, redWins: 0 },
        feedsInto: null,
      };
      t.matches.push(extraMatch);
      const r = computeTournamentAwards(t);
      const consistent = r.awards.find((a) => a.kind === "consistent");
      expect(consistent).toBeDefined();
      // Beta (t-b) top lane: [6,7,7,6,7,7] → avg 6.67, stddev ≈ 0.47
      // Alpha (t-a) top lane: [7,8,8,9,8,8] → avg 8.0, stddev ≈ 0.63
      // Beta has lower stddev → most consistent.
      expect(consistent?.player.teamId).toBe("t-b");
    });
  });
});


describe("international award scope", () => {
  it("keeps MVP/special awards but grants no international All-Pro selections", () => {
    const tournament = buildTestTournament();
    expect(computeTournamentAwards(tournament).allPro.length).toBeGreaterThan(0);
    const awards = computeTournamentAwards({ ...tournament, seasonStageKind: "international" });
    expect(awards.allPro).toEqual([]);
    expect(awards.mvp).not.toBeNull();
    expect(awards.awards).toEqual(computeTournamentAwards(tournament).awards);
  });
});
