import { describe, expect, it } from "vitest";
import { computeTeamStreaks, hotPlayers } from "./streaks";
import type { TournamentState, TournamentMatch, TournamentTeam } from "./tournament";
import type { PlayerFormMap } from "./playerForm";

// ── Minimal factories ─────────────────────────────────────────────────────────

function makeTeam(seed: number): TournamentTeam {
  return { id: `t${seed}`, name: `Team ${seed}`, seed, starRating: 3 };
}

let _mid = 0;
function makeMatch(
  blueTeamId: string,
  redTeamId: string | null,
  round: number,
  winner: { teamId: string; blueWins: number; redWins: number } | null = null,
  isBye = false,
): TournamentMatch {
  return {
    id: `m${++_mid}`,
    round,
    blueTeamId,
    redTeamId,
    format: "bo3",
    fearless: false,
    mode: "aivai",
    aiSide: null,
    aiDifficulty: "normal",
    series: null,
    winner,
    feedsInto: null,
    isBye,
  };
}

function win(
  blueId: string,
  redId: string,
  winnerId: string,
  round: number,
  blueWins = 2,
  redWins = 0,
): TournamentMatch {
  return makeMatch(blueId, redId, round, {
    teamId: winnerId,
    blueWins,
    redWins,
  });
}

function makeBaseTournament(
  teams: TournamentTeam[],
  matches: TournamentMatch[],
): TournamentState {
  return {
    id: "tour-test",
    name: "Test",
    format: "single-elim",
    status: "in-progress",
    teams,
    matches,
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
    fearlessConfig: { perSeries: false, perTeam: false, global: false },
    createdAt: 0,
    updatedAt: 0,
    activeMatchId: null,
  };
}

// ── computeTeamStreaks ─────────────────────────────────────────────────────────

describe("computeTeamStreaks", () => {
  it("returns empty map when no matches are completed", () => {
    const t1 = makeTeam(1);
    const t2 = makeTeam(2);
    const m = makeMatch(t1.id, t2.id, 1); // no winner yet
    const tournament = makeBaseTournament([t1, t2], [m]);
    expect(computeTeamStreaks(tournament)).toEqual({});
  });

  it("counts a single win as W1 streak", () => {
    const t1 = makeTeam(1);
    const t2 = makeTeam(2);
    const m = win(t1.id, t2.id, t1.id, 1, 2, 0);
    const tournament = makeBaseTournament([t1, t2], [m]);
    const streaks = computeTeamStreaks(tournament);
    expect(streaks[t1.id]).toEqual({ kind: "W", count: 1, gameStreak: 2 });
    expect(streaks[t2.id]).toEqual({ kind: "L", count: 1, gameStreak: 0 });
  });

  it("counts a single loss as L1 streak with loser game count", () => {
    const t1 = makeTeam(1);
    const t2 = makeTeam(2);
    // t2 loses 1-2: blueWins=2, redWins=1 — loser (red=t2) won 1 game.
    const m = win(t1.id, t2.id, t1.id, 1, 2, 1);
    const tournament = makeBaseTournament([t1, t2], [m]);
    const streaks = computeTeamStreaks(tournament);
    expect(streaks[t2.id]).toEqual({ kind: "L", count: 1, gameStreak: 1 });
  });

  it("accumulates a W3 streak across multi-round single-elim", () => {
    const teams = [1, 2, 3, 4].map(makeTeam);
    const [t1, t2, t3, t4] = teams;
    // R1: t1 beats t2, t3 beats t4
    // R2: t1 beats t3
    const matches = [
      win(t1.id, t2.id, t1.id, 1, 2, 0),
      win(t3.id, t4.id, t3.id, 1, 2, 0),
      win(t1.id, t3.id, t1.id, 2, 2, 1),
    ];
    const tournament = makeBaseTournament(teams, matches);
    const streaks = computeTeamStreaks(tournament);
    // t1 won 2 matches consecutively
    expect(streaks[t1.id]).toEqual({ kind: "W", count: 2, gameStreak: 2 });
    // t3 won R1 but lost R2
    expect(streaks[t3.id]).toEqual({ kind: "L", count: 1, gameStreak: 1 });
  });

  it("breaks a streak on a loss", () => {
    const teams = [1, 2, 3].map(makeTeam);
    const [t1, t2, t3] = teams;
    // t1 wins R1, loses R2
    const matches = [
      win(t1.id, t2.id, t1.id, 1, 2, 0),
      win(t1.id, t3.id, t3.id, 2, 0, 2),
    ];
    const tournament = makeBaseTournament(teams, matches);
    const streaks = computeTeamStreaks(tournament);
    // After losing R2, t1 is on L1, not W2.
    expect(streaks[t1.id]).toEqual({ kind: "L", count: 1, gameStreak: 0 });
    // t3 won R2 — streak starts fresh.
    expect(streaks[t3.id]).toEqual({ kind: "W", count: 1, gameStreak: 2 });
  });

  it("skips byes: bye does NOT extend or break a win streak", () => {
    const t1 = makeTeam(1);
    const t2 = makeTeam(2);
    const t3 = makeTeam(3);
    // R1: t1 wins vs t2; then t1 gets a bye in R2; then t1 wins vs t3 in R3.
    const byeMatch = makeMatch(t1.id, null, 2, { teamId: t1.id, blueWins: 1, redWins: 0 }, true);
    const matches = [
      win(t1.id, t2.id, t1.id, 1, 2, 0),
      byeMatch,
      win(t1.id, t3.id, t1.id, 3, 2, 0),
    ];
    const tournament = makeBaseTournament([t1, t2, t3], matches);
    const streaks = computeTeamStreaks(tournament);
    // 2 real wins (R1, R3) — bye not counted.
    expect(streaks[t1.id]).toEqual({ kind: "W", count: 2, gameStreak: 2 });
  });

  it("skips byes: a bye in the middle of a loss streak does not reset it", () => {
    const t1 = makeTeam(1);
    const t2 = makeTeam(2);
    const t3 = makeTeam(3);
    const t4 = makeTeam(4);
    // t1 loses R1, gets bye R2, loses R3.
    const byeMatch = makeMatch(t1.id, null, 2, { teamId: t1.id, blueWins: 1, redWins: 0 }, true);
    const matches = [
      win(t2.id, t1.id, t2.id, 1, 2, 0), // t1 loses
      byeMatch,
      win(t3.id, t1.id, t3.id, 3, 2, 0), // t1 loses
    ];
    const tournament = makeBaseTournament([t1, t2, t3, t4], matches);
    const streaks = computeTeamStreaks(tournament);
    // 2 real losses — the bye in between is not a win, so the loss streak = 2.
    expect(streaks[t1.id]).toEqual({ kind: "L", count: 2, gameStreak: 0 });
  });

  it("does not include teams with only bye matches in the result", () => {
    const t1 = makeTeam(1);
    const byeMatch = makeMatch(
      t1.id,
      null,
      1,
      { teamId: t1.id, blueWins: 1, redWins: 0 },
      true,
    );
    const tournament = makeBaseTournament([t1], [byeMatch]);
    const streaks = computeTeamStreaks(tournament);
    // No real match completed — t1 should NOT appear.
    expect(Object.keys(streaks)).toHaveLength(0);
  });
});

// ── hotPlayers ─────────────────────────────────────────────────────────────────

describe("hotPlayers", () => {
  it("returns empty hot and cold arrays when no forms exceed threshold", () => {
    const t1 = makeTeam(1);
    const tournament = makeBaseTournament([t1], []);
    // Form 0.2 is below the default threshold of 0.35
    const forms: PlayerFormMap = { [`${t1.id}:top`]: 0.2, [`${t1.id}:jungle`]: -0.2 };
    const result = hotPlayers(forms, tournament);
    expect(result.hot).toHaveLength(0);
    expect(result.cold).toHaveLength(0);
  });

  it("classifies players at or above threshold as hot", () => {
    const t1 = makeTeam(1);
    const tournament = makeBaseTournament([t1], []);
    const forms: PlayerFormMap = { [`${t1.id}:top`]: 0.5, [`${t1.id}:jungle`]: 0.35 };
    const result = hotPlayers(forms, tournament);
    expect(result.hot).toHaveLength(2);
    expect(result.cold).toHaveLength(0);
    expect(result.hot[0].form).toBeGreaterThan(result.hot[1].form);
  });

  it("classifies players at or below -threshold as cold", () => {
    const t1 = makeTeam(1);
    const tournament = makeBaseTournament([t1], []);
    const forms: PlayerFormMap = {
      [`${t1.id}:middle`]: -0.6,
      [`${t1.id}:bottom`]: -0.35,
    };
    const result = hotPlayers(forms, tournament);
    expect(result.cold).toHaveLength(2);
    expect(result.hot).toHaveLength(0);
    // Sorted by |form| descending.
    expect(Math.abs(result.cold[0].form)).toBeGreaterThanOrEqual(
      Math.abs(result.cold[1].form),
    );
  });

  it("respects a custom threshold", () => {
    const t1 = makeTeam(1);
    const tournament = makeBaseTournament([t1], []);
    const forms: PlayerFormMap = { [`${t1.id}:top`]: 0.4 };
    // With threshold 0.5, form 0.4 should NOT qualify.
    const strict = hotPlayers(forms, tournament, 0.5);
    expect(strict.hot).toHaveLength(0);
    // With threshold 0.3, it should qualify.
    const lenient = hotPlayers(forms, tournament, 0.3);
    expect(lenient.hot).toHaveLength(1);
  });

  it("labels hot players 'On fire' and cold players 'Slumping'", () => {
    const t1 = makeTeam(1);
    const tournament = makeBaseTournament([t1], []);
    const forms: PlayerFormMap = {
      [`${t1.id}:top`]: 0.7,
      [`${t1.id}:support`]: -0.7,
    };
    const result = hotPlayers(forms, tournament);
    expect(result.hot[0].label).toBe("On fire");
    expect(result.cold[0].label).toBe("Slumping");
    expect(result.hot[0].kind).toBe("hot");
    expect(result.cold[0].kind).toBe("cold");
  });

  it("returns empty result when playerForms is empty", () => {
    const t1 = makeTeam(1);
    const tournament = makeBaseTournament([t1], []);
    const result = hotPlayers({}, tournament);
    expect(result.hot).toHaveLength(0);
    expect(result.cold).toHaveLength(0);
  });

  it("only includes teams in the tournament", () => {
    const t1 = makeTeam(1);
    const tournament = makeBaseTournament([t1], []);
    // Key for a team NOT in the tournament — should be ignored.
    const forms: PlayerFormMap = {
      [`t1:top`]: 0.8,
      [`ghost-team:top`]: 0.9, // not in tournament.teams
    };
    const result = hotPlayers(forms, tournament);
    // Only t1 entries, ghost-team ignored.
    expect(result.hot).toHaveLength(1);
    expect(result.hot[0].teamId).toBe("t1");
  });
});
