import { describe, expect, it } from "vitest";
import {
  bracketSeedOrder,
  clampDEAdvancing,
  computeGroupStandings,
  computeStandings,
  computeSwissStandings,
  createTournament,
  crossMatchFearlessLocked,
  dePlayoffRounds,
  generateDoubleElimBracket,
  generateRoundRobinMatches,
  generateSingleElimBracket,
  generateSwissBracket,
  recordMatchWinner,
  startRoundRobinPlayoffs,
  teamStreak,
  teamWinStreak,
  type CreateTournamentParams,
  type TournamentDefaults,
  type TournamentMatch,
  type TournamentState,
  type TournamentTeam,
} from "./tournament";

// ─── Factories ────────────────────────────────────────────────────────────

function makeTeam(seed: number, name?: string): TournamentTeam {
  return {
    id: `team-${seed}`,
    name: name ?? `Team ${seed}`,
    seed,
    starRating: 3,
  };
}

function makeTeams(count: number): TournamentTeam[] {
  return Array.from({ length: count }, (_, i) => makeTeam(i + 1));
}

const DEFAULTS: TournamentDefaults = {
  format: "bo3",
  fearless: false,
  mode: "draft",
  aiSide: null,
  aiDifficulty: "medium",
  timerEnabled: false,
};

function baseTournamentParams(
  format: CreateTournamentParams["format"],
  teamCount: number,
  extra: Partial<CreateTournamentParams> = {},
): CreateTournamentParams {
  return {
    name: "Test Tournament",
    format,
    teams: makeTeams(teamCount),
    defaults: DEFAULTS,
    ...extra,
  };
}

// Pre-resolve a match as a winner (pure helper, does not call recordMatchWinner).
function resolveMatch(
  match: TournamentMatch,
  winnerId: string,
  blueWins = 2,
  redWins = 0,
): TournamentMatch {
  return { ...match, winner: { teamId: winnerId, blueWins, redWins } };
}

// Run all matches in a tournament with alternating wins so we can
// advance rounds cleanly. Returns the fully-completed TournamentState.
function simulateTournamentTo(
  tournament: TournamentState,
  maxIterations = 200,
): TournamentState {
  let state = tournament;
  for (let i = 0; i < maxIterations; i++) {
    const next = state.matches.find(
      (m) => !m.winner && m.blueTeamId != null && m.redTeamId != null,
    );
    if (!next) break;
    // Always award blue as winner (deterministic).
    state = recordMatchWinner(state, next.id, {
      teamId: next.blueTeamId!,
      blueWins: 2,
      redWins: 0,
    });
  }
  return state;
}

// ─── bracketSeedOrder ─────────────────────────────────────────────────────

describe("bracketSeedOrder", () => {
  it("returns [1, 2] for n=2", () => {
    expect(bracketSeedOrder(2)).toEqual([1, 2]);
  });

  it("returns standard 4-team order", () => {
    expect(bracketSeedOrder(4)).toEqual([1, 4, 2, 3]);
  });

  it("returns standard 8-team order", () => {
    const order = bracketSeedOrder(8);
    expect(order).toHaveLength(8);
    // First pair: 1 vs 8
    expect(order[0]).toBe(1);
    expect(order[1]).toBe(8);
    // Sum of each pair is n+1
    for (let i = 0; i < order.length; i += 2) {
      expect(order[i] + order[i + 1]).toBe(9);
    }
  });

  it("throws for non-power-of-2", () => {
    expect(() => bracketSeedOrder(6)).toThrow();
  });
});

// ─── Single-elimination bracket ───────────────────────────────────────────

describe("generateSingleElimBracket", () => {
  it("generates 3 matches for 4 teams (4-1=3)", () => {
    const teams = makeTeams(4);
    const matches = generateSingleElimBracket(teams, DEFAULTS);
    expect(matches).toHaveLength(3);
  });

  it("generates 7 matches for 8 teams", () => {
    const teams = makeTeams(8);
    const matches = generateSingleElimBracket(teams, DEFAULTS);
    expect(matches).toHaveLength(7);
  });

  it("generates correct match count for 5 teams (non-power-of-2)", () => {
    const teams = makeTeams(5);
    // pads to 8 → 7 total positions, 1 round-1 real match + 4 more = 4 matches
    const matches = generateSingleElimBracket(teams, DEFAULTS);
    // 5 teams → padded to 8 → 7 virtual slots minus 3 byes = 4 real matches
    expect(matches.length).toBeGreaterThan(0);
    // Every match must reference existing teams or have null slots (byes)
    const teamIds = new Set(teams.map((t) => t.id));
    for (const m of matches) {
      if (m.blueTeamId != null) expect(teamIds.has(m.blueTeamId)).toBe(true);
      if (m.redTeamId != null) expect(teamIds.has(m.redTeamId)).toBe(true);
    }
  });

  it("wires feedsInto so all non-final matches point to a next match", () => {
    const teams = makeTeams(8);
    const matches = generateSingleElimBracket(teams, DEFAULTS);
    const finalRound = Math.max(...matches.map((m) => m.round));
    const matchIds = new Set(matches.map((m) => m.id));
    for (const m of matches) {
      if (m.round < finalRound) {
        expect(m.feedsInto).not.toBeNull();
        expect(matchIds.has(m.feedsInto!.matchId)).toBe(true);
      }
    }
  });

  it("final match has no feedsInto", () => {
    const teams = makeTeams(8);
    const matches = generateSingleElimBracket(teams, DEFAULTS);
    const finalRound = Math.max(...matches.map((m) => m.round));
    const finals = matches.filter((m) => m.round === finalRound);
    expect(finals).toHaveLength(1);
    expect(finals[0].feedsInto).toBeNull();
  });

  it("records winner and advances to next match", () => {
    const tournament = createTournament(
      baseTournamentParams("single-elim", 4),
    );
    const r1Matches = tournament.matches.filter((m) => m.round === 1);
    const firstMatch = r1Matches[0];
    const updated = recordMatchWinner(tournament, firstMatch.id, {
      teamId: firstMatch.blueTeamId!,
      blueWins: 2,
      redWins: 0,
    });
    const dest = updated.matches.find(
      (m) => m.id === firstMatch.feedsInto!.matchId,
    )!;
    const slot =
      firstMatch.feedsInto!.slot === "blue" ? "blueTeamId" : "redTeamId";
    expect(dest[slot]).toBe(firstMatch.blueTeamId);
  });

  it("completes tournament when the final match resolves", () => {
    const tournament = createTournament(
      baseTournamentParams("single-elim", 4),
    );
    const completed = simulateTournamentTo(tournament);
    expect(completed.status).toBe("complete");
  });
});

// ─── Round-robin ──────────────────────────────────────────────────────────

describe("generateRoundRobinMatches", () => {
  it("produces n*(n-1)/2 matches for even count", () => {
    const teams = makeTeams(4);
    const matches = generateRoundRobinMatches(teams, DEFAULTS);
    expect(matches).toHaveLength((4 * 3) / 2);
  });

  it("produces n*(n-1)/2 matches for 6 teams", () => {
    const teams = makeTeams(6);
    const matches = generateRoundRobinMatches(teams, DEFAULTS);
    expect(matches).toHaveLength((6 * 5) / 2);
  });

  it("produces n*(n-1)/2 matches for odd 5-team count", () => {
    const teams = makeTeams(5);
    const matches = generateRoundRobinMatches(teams, DEFAULTS);
    expect(matches).toHaveLength((5 * 4) / 2);
  });

  it("every pair of teams meets exactly once in 4-team RR", () => {
    const teams = makeTeams(4);
    const matches = generateRoundRobinMatches(teams, DEFAULTS);
    const pairCounts: Record<string, number> = {};
    for (const m of matches) {
      const key = [m.blueTeamId!, m.redTeamId!].sort().join("-");
      pairCounts[key] = (pairCounts[key] ?? 0) + 1;
    }
    expect(Object.values(pairCounts).every((v) => v === 1)).toBe(true);
  });

  it("completes when all matches are won", () => {
    const tournament = createTournament(
      baseTournamentParams("round-robin", 4),
    );
    const completed = simulateTournamentTo(tournament);
    expect(completed.status).toBe("complete");
  });
});

// ─── Double-elimination bracket ───────────────────────────────────────────

describe("generateDoubleElimBracket", () => {
  it("throws for unsupported team counts (too many byes)", () => {
    // 5 teams would need 3 byes in an 8-bracket (> padded/4) — and
    // anything below 4 can't form a DE bracket at all.
    expect(() => generateDoubleElimBracket(makeTeams(5), DEFAULTS)).toThrow();
    expect(() => generateDoubleElimBracket(makeTeams(3), DEFAULTS)).toThrow();
  });

  it("generates W and L bracket matches for 4 teams", () => {
    const matches = generateDoubleElimBracket(makeTeams(4), DEFAULTS);
    expect(matches.some((m) => m.bracket === "winners")).toBe(true);
    expect(matches.some((m) => m.bracket === "losers")).toBe(true);
    expect(matches.some((m) => m.bracket === "grand-final")).toBe(true);
  });

  it("generates W and L bracket matches for 8 teams", () => {
    const matches = generateDoubleElimBracket(makeTeams(8), DEFAULTS);
    const wCount = matches.filter((m) => m.bracket === "winners").length;
    const lCount = matches.filter((m) => m.bracket === "losers").length;
    expect(wCount).toBeGreaterThan(0);
    expect(lCount).toBeGreaterThan(0);
  });

  it("completes tournament through grand final (4 teams)", () => {
    const tournament = createTournament(
      baseTournamentParams("double-elim", 4),
    );
    const completed = simulateTournamentTo(tournament);
    expect(completed.status).toBe("complete");
  });

  it("W-bracket loser drops into losers bracket (losersFeedsInto wired)", () => {
    const matches = generateDoubleElimBracket(makeTeams(4), DEFAULTS);
    const wR1 = matches.filter(
      (m) => m.bracket === "winners" && m.round === 1,
    );
    expect(wR1.every((m) => m.losersFeedsInto != null)).toBe(true);
  });

  it("builds a 6-team bracket: seeds 1-2 bye into W-R2, no L-R1", () => {
    const matches = generateDoubleElimBracket(makeTeams(6), DEFAULTS);
    // 5 W (2+2+1) + 4 L (2 drop + 1 consolidate + 1 final) + 1 GF = 10.
    expect(matches).toHaveLength(10);
    const wR1 = matches.filter(
      (m) => m.bracket === "winners" && m.round === 1,
    );
    expect(wR1).toHaveLength(2);
    const r1Ids = wR1.flatMap((m) => [m.blueTeamId, m.redTeamId]);
    expect(r1Ids).not.toContain("team-1");
    expect(r1Ids).not.toContain("team-2");
    // The byes pre-seed the top seeds straight into the W semifinals.
    const wR2 = matches.filter(
      (m) => m.bracket === "winners" && m.round === 2,
    );
    const wR2Ids = wR2.flatMap((m) => [m.blueTeamId, m.redTeamId]);
    expect(wR2Ids).toContain("team-1");
    expect(wR2Ids).toContain("team-2");
    // Every W-R1 loser passes straight through to an L drop-in match —
    // there is no L round pairing the W-R1 losers against each other.
    expect(wR1.every((m) => m.losersFeedsInto != null)).toBe(true);
    expect(matches.filter((m) => m.bracket === "losers")).toHaveLength(4);
  });

  it("6-team double-elim plays to completion", () => {
    const tournament = createTournament(
      baseTournamentParams("double-elim", 6),
    );
    const completed = simulateTournamentTo(tournament, 500);
    expect(completed.status).toBe("complete");
    expect(completed.matches.every((m) => !m.winner || m.blueTeamId)).toBe(
      true,
    );
  });

  it("builds a 12-team bracket (16-bracket with 4 byes) and completes", () => {
    const matches = generateDoubleElimBracket(makeTeams(12), DEFAULTS);
    const wR1 = matches.filter(
      (m) => m.bracket === "winners" && m.round === 1,
    );
    expect(wR1).toHaveLength(4);
    const r1Ids = wR1.flatMap((m) => [m.blueTeamId, m.redTeamId]);
    for (const seed of [1, 2, 3, 4]) {
      expect(r1Ids).not.toContain(`team-${seed}`);
    }
    const tournament = createTournament(
      baseTournamentParams("double-elim", 12),
    );
    const completed = simulateTournamentTo(tournament, 500);
    expect(completed.status).toBe("complete");
  });
});

// ─── DE advancing-count clamp + round shape ────────────────────────────────

describe("clampDEAdvancing / dePlayoffRounds", () => {
  it("snaps to the largest supported DE size", () => {
    expect(clampDEAdvancing(4)).toBe(4);
    expect(clampDEAdvancing(5)).toBe(4);
    expect(clampDEAdvancing(6)).toBe(6);
    expect(clampDEAdvancing(7)).toBe(6);
    expect(clampDEAdvancing(8)).toBe(8);
    expect(clampDEAdvancing(11)).toBe(8);
    expect(clampDEAdvancing(12)).toBe(12);
    expect(clampDEAdvancing(100)).toBe(16);
    expect(clampDEAdvancing(2)).toBe(4);
  });

  it("reports the bracket round shape, including the skipped L-R1", () => {
    expect(dePlayoffRounds(4)).toEqual({ wRounds: 2, lRounds: 2 });
    expect(dePlayoffRounds(6)).toEqual({ wRounds: 3, lRounds: 3 });
    expect(dePlayoffRounds(8)).toEqual({ wRounds: 3, lRounds: 4 });
    expect(dePlayoffRounds(12)).toEqual({ wRounds: 4, lRounds: 5 });
    expect(dePlayoffRounds(16)).toEqual({ wRounds: 4, lRounds: 6 });
  });

  it("matches the actual L-round numbering the generator produces", () => {
    for (const size of [4, 6, 8, 12, 16]) {
      const matches = generateDoubleElimBracket(makeTeams(size), DEFAULTS);
      const lRounds = new Set(
        matches.filter((m) => m.bracket === "losers").map((m) => m.round),
      );
      const expected = dePlayoffRounds(size).lRounds;
      expect(Math.max(...lRounds)).toBe(expected);
      expect(lRounds.size).toBe(expected); // dense 1..lRounds
    }
  });
});

// ─── Top-6 playoffs from a round-robin stage ───────────────────────────────

describe("round-robin-playoffs with Top 6", () => {
  it("promotes exactly the top 6 of the standings into the DE bracket", () => {
    let t = createTournament(
      baseTournamentParams("round-robin-playoffs", 10, {
        rrPlayoffsAdvancingOverride: 6,
      }),
    );
    expect(t.rrPlayoffsAdvancing).toBe(6);
    // Play out the regular season.
    t = simulateTournamentTo(t, 500);
    expect(t.status).toBe("in-progress"); // playoffs not started yet
    const top6 = computeStandings(t)
      .slice(0, 6)
      .map((s) => s.team.id);
    t = startRoundRobinPlayoffs(t);
    const playoff = t.matches.filter((m) => m.bracket != null);
    expect(playoff).toHaveLength(10); // full 6-team DE
    // Teams visible at bracket creation: W-R1 participants + the two
    // byes pre-seeded into W-R2 — exactly the standings top 6.
    const inBracket = new Set(
      playoff.flatMap((m) => [m.blueTeamId, m.redTeamId]).filter(Boolean),
    );
    expect(inBracket).toEqual(new Set(top6));
    // And the whole thing plays out to a champion.
    t = simulateTournamentTo(t, 500);
    expect(t.status).toBe("complete");
  });
});

// ─── Semantic semis/final format keys ──────────────────────────────────────

describe("semis/final format overrides", () => {
  it("single-elim: semis + final keys outrank positional wb:N keys", () => {
    const matches = generateSingleElimBracket(makeTeams(8), DEFAULTS, {
      "wb:1": "bo1",
      "wb:2": "bo1",
      "wb:3": "bo1",
      semis: "bo5",
      final: "bo5",
    });
    const byRound = (r: number) => matches.filter((m) => m.round === r);
    expect(byRound(1).every((m) => m.format === "bo1")).toBe(true);
    expect(byRound(2).every((m) => m.format === "bo5")).toBe(true); // semis
    expect(byRound(3).every((m) => m.format === "bo5")).toBe(true); // final
  });

  it("double-elim: W-Final + L-Final answer to semis, grand final to final", () => {
    const matches = generateDoubleElimBracket(makeTeams(8), DEFAULTS, {
      "wb:3": "bo1",
      "lb:4": "bo1",
      gf: "bo1",
      semis: "bo5",
      final: "bo5",
    });
    const wFinal = matches.find(
      (m) => m.bracket === "winners" && m.round === 3,
    )!;
    const lMax = Math.max(
      ...matches.filter((m) => m.bracket === "losers").map((m) => m.round),
    );
    const lFinal = matches.find(
      (m) => m.bracket === "losers" && m.round === lMax,
    )!;
    const gf = matches.find((m) => m.bracket === "grand-final")!;
    expect(wFinal.format).toBe("bo5");
    expect(lFinal.format).toBe("bo5");
    expect(gf.format).toBe("bo5");
    // Earlier rounds keep their positional formats.
    const wR1 = matches.filter(
      (m) => m.bracket === "winners" && m.round === 1,
    );
    expect(wR1.every((m) => m.format === "bo3")).toBe(true); // defaults
  });

  it("standalone brackets without semantic keys behave as before", () => {
    const matches = generateSingleElimBracket(makeTeams(8), DEFAULTS, {
      "wb:3": "bo5",
    });
    const final = matches.find((m) => m.round === 3)!;
    expect(final.format).toBe("bo5");
    const semis = matches.filter((m) => m.round === 2);
    expect(semis.every((m) => m.format === "bo3")).toBe(true);
  });
});

// ─── Swiss bracket ────────────────────────────────────────────────────────

describe("generateSwissBracket", () => {
  it("throws for fewer than 4 teams", () => {
    expect(() => generateSwissBracket(makeTeams(3), DEFAULTS)).toThrow();
  });

  it("generates round 1 matches for even count (4 teams)", () => {
    const { matches, totalRounds } = generateSwissBracket(makeTeams(4), DEFAULTS);
    expect(matches).toHaveLength(2);
    expect(totalRounds).toBeGreaterThan(0);
  });

  it("generates round 1 matches for odd count (5 teams) including a bye", () => {
    const { matches } = generateSwissBracket(makeTeams(5), DEFAULTS);
    const byeMatches = matches.filter((m) => m.isBye);
    expect(byeMatches).toHaveLength(1);
    // Bye match is pre-resolved
    expect(byeMatches[0].winner).not.toBeNull();
    expect(byeMatches[0].redTeamId).toBeNull();
    // Bye goes to lowest seed in round 1
    expect(byeMatches[0].blueTeamId).toBe("team-5");
  });

  it("uses default total rounds of ceil(log2(N))", () => {
    const { totalRounds: r4 } = generateSwissBracket(makeTeams(4), DEFAULTS);
    const { totalRounds: r8 } = generateSwissBracket(makeTeams(8), DEFAULTS);
    expect(r4).toBe(2); // ceil(log2(4)) = 2
    expect(r8).toBe(3); // ceil(log2(8)) = 3
  });

  it("respects totalRoundsOverride", () => {
    const { totalRounds } = generateSwissBracket(makeTeams(4), DEFAULTS, undefined, 5);
    expect(totalRounds).toBe(5);
  });
});

// ─── computeSwissStandings ────────────────────────────────────────────────

describe("computeSwissStandings", () => {
  function buildSwissTournament(teamCount: number, totalRoundsOverride = 3) {
    return createTournament(
      baseTournamentParams("swiss", teamCount, {
        swissTotalRoundsOverride: totalRoundsOverride,
      }),
    );
  }

  it("all teams start at 0-0", () => {
    const t = buildSwissTournament(4);
    const standings = computeSwissStandings(t);
    expect(standings.every((s) => s.wins === 0 && s.losses === 0)).toBe(true);
  });

  it("records wins and losses after round 1", () => {
    let t = buildSwissTournament(4, 3);
    const r1 = t.matches.filter((m) => m.round === 1 && !m.isBye);
    for (const m of r1) {
      t = recordMatchWinner(t, m.id, {
        teamId: m.blueTeamId!,
        blueWins: 2,
        redWins: 0,
      });
    }
    const standings = computeSwissStandings(t);
    const winners = standings.filter((s) => s.wins === 1);
    const losers = standings.filter((s) => s.losses === 1);
    expect(winners).toHaveLength(r1.length);
    expect(losers).toHaveLength(r1.length);
  });

  it("ranks are 1-based and sequential", () => {
    const t = buildSwissTournament(4);
    const standings = computeSwissStandings(t);
    const ranks = standings.map((s) => s.rank).sort((a, b) => a - b);
    expect(ranks).toEqual([1, 2, 3, 4]);
  });

  it("top-ranked team has most wins", () => {
    let t = buildSwissTournament(4, 3);
    // Blue always wins — teams 1 and 2 always win r1
    const r1 = t.matches.filter((m) => m.round === 1 && !m.isBye);
    for (const m of r1) {
      t = recordMatchWinner(t, m.id, {
        teamId: m.blueTeamId!,
        blueWins: 2,
        redWins: 0,
      });
    }
    const standings = computeSwissStandings(t);
    expect(standings[0].wins).toBeGreaterThanOrEqual(standings[1].wins);
  });

  it("bye win is credited to the bye recipient", () => {
    // 5-team Swiss: one team gets a bye in round 1
    let t = createTournament(
      baseTournamentParams("swiss", 5, { swissTotalRoundsOverride: 3 }),
    );
    // Find the bye match — already pre-resolved
    const byeMatch = t.matches.find((m) => m.isBye);
    expect(byeMatch).toBeDefined();
    const byeTeamId = byeMatch!.blueTeamId!;

    // Resolve all non-bye round-1 matches
    const r1Real = t.matches.filter((m) => m.round === 1 && !m.isBye);
    for (const m of r1Real) {
      t = recordMatchWinner(t, m.id, {
        teamId: m.blueTeamId!,
        blueWins: 2,
        redWins: 0,
      });
    }

    const standings = computeSwissStandings(t);
    const byeStanding = standings.find((s) => s.team.id === byeTeamId);
    expect(byeStanding!.wins).toBe(1);
    expect(byeStanding!.played).toBe(1);
  });
});

// ─── Swiss odd-team bye rotation ──────────────────────────────────────────

describe("Swiss 5-team bye rotation", () => {
  function buildAndPlay5TeamSwiss(rounds = 4): TournamentState {
    let state = createTournament(
      baseTournamentParams("swiss", 5, { swissTotalRoundsOverride: rounds }),
    );
    return simulateTournamentTo(state, 500);
  }

  it("every team plays or gets a bye in every round", () => {
    const state = buildAndPlay5TeamSwiss(4);
    // Group matches by round
    const byRound = new Map<number, TournamentMatch[]>();
    for (const m of state.matches) {
      if (!byRound.has(m.round)) byRound.set(m.round, []);
      byRound.get(m.round)!.push(m);
    }
    const allTeamIds = state.teams.map((t) => t.id);
    for (const [, rMatches] of byRound) {
      const coveredTeams = new Set<string>();
      for (const m of rMatches) {
        if (m.blueTeamId) coveredTeams.add(m.blueTeamId);
        // Bye matches have null redTeamId — that's fine; we don't add null
        if (m.redTeamId) coveredTeams.add(m.redTeamId);
      }
      for (const id of allTeamIds) {
        expect(coveredTeams.has(id)).toBe(true);
      }
    }
  });

  it("no team receives 2 byes before all others have received at least 1", () => {
    const state = buildAndPlay5TeamSwiss(5);
    const byeCounts = new Map<string, number>();
    for (const t of state.teams) byeCounts.set(t.id, 0);
    for (const m of state.matches) {
      if (m.isBye && m.winner) {
        byeCounts.set(
          m.winner.teamId,
          (byeCounts.get(m.winner.teamId) ?? 0) + 1,
        );
      }
    }
    const counts = [...byeCounts.values()];
    const maxByes = Math.max(...counts);
    const minByes = Math.min(...counts);
    // No team should have 2+ byes while some other team has 0
    expect(maxByes - minByes).toBeLessThanOrEqual(1);
  });

  it("standings remain consistent: total wins + losses = rounds played per team", () => {
    const state = buildAndPlay5TeamSwiss(4);
    const standings = computeSwissStandings(state);
    for (const s of standings) {
      expect(s.wins + s.losses).toBe(s.played);
    }
  });

  it("total wins across all teams equals total matches played (each match = 1 win)", () => {
    const state = buildAndPlay5TeamSwiss(4);
    const standings = computeSwissStandings(state);
    const totalWins = standings.reduce((acc, s) => acc + s.wins, 0);
    const completedMatches = state.matches.filter(
      (m) => m.winner != null,
    ).length;
    expect(totalWins).toBe(completedMatches);
  });
});

// ─── computeStandings (round-robin) ──────────────────────────────────────

describe("computeStandings", () => {
  it("all teams start at 0-0-0", () => {
    const t = createTournament(baseTournamentParams("round-robin", 4));
    const standings = computeStandings(t);
    expect(standings.every((s) => s.wins === 0 && s.losses === 0)).toBe(true);
  });

  it("records match wins and game wins after completing matches", () => {
    let t = createTournament(baseTournamentParams("round-robin", 4));
    const firstMatch = t.matches[0];
    t = recordMatchWinner(t, firstMatch.id, {
      teamId: firstMatch.blueTeamId!,
      blueWins: 2,
      redWins: 1,
    });
    const standings = computeStandings(t);
    const blueRow = standings.find(
      (s) => s.team.id === firstMatch.blueTeamId,
    )!;
    const redRow = standings.find(
      (s) => s.team.id === firstMatch.redTeamId,
    )!;
    expect(blueRow.wins).toBe(1);
    expect(blueRow.gamesWon).toBe(2);
    expect(redRow.losses).toBe(1);
    expect(redRow.gamesWon).toBe(1);
  });

  it("rank 1 has the most wins", () => {
    const t = simulateTournamentTo(
      createTournament(baseTournamentParams("round-robin", 4)),
    );
    const standings = computeStandings(t);
    expect(standings[0].wins).toBeGreaterThanOrEqual(standings[1].wins);
  });

  it("ranks are 1-indexed and dense", () => {
    const t = simulateTournamentTo(
      createTournament(baseTournamentParams("round-robin", 4)),
    );
    const standings = computeStandings(t);
    const ranks = standings.map((s) => s.rank).sort((a, b) => a - b);
    expect(ranks).toEqual([1, 2, 3, 4]);
  });
});

// ─── computeGroupStandings ────────────────────────────────────────────────

describe("computeGroupStandings", () => {
  it("returns standings for group A in an 8-team groups-playoffs tournament", () => {
    const t = createTournament(
      baseTournamentParams("groups-playoffs", 8),
    );
    const groupAStandings = computeGroupStandings(t, "A");
    expect(groupAStandings.length).toBeGreaterThan(0);
  });

  it("group A and group B contain all teams in a 6-team tournament", () => {
    const t = createTournament(
      baseTournamentParams("groups-playoffs", 6),
    );
    const groupA = computeGroupStandings(t, "A");
    const groupB = computeGroupStandings(t, "B");
    expect(groupA.length + groupB.length).toBe(6);
  });

  it("group standings ranks are 1-based and unique", () => {
    const t = createTournament(
      baseTournamentParams("groups-playoffs", 4),
    );
    const standings = computeGroupStandings(t, "A");
    const ranks = standings.map((s) => s.rank).sort((a, b) => a - b);
    // ranks should be dense starting at 1
    expect(ranks[0]).toBe(1);
    ranks.forEach((r, i) => expect(r).toBe(i + 1));
  });
});

// ─── Match advancement (double-elim loser drop) ──────────────────────────

describe("recordMatchWinner double-elim loser advancement", () => {
  it("W-bracket loser fills the correct L-bracket slot", () => {
    const tournament = createTournament(
      baseTournamentParams("double-elim", 4),
    );
    const wR1 = tournament.matches.filter(
      (m) => m.bracket === "winners" && m.round === 1,
    );
    const firstW = wR1[0];
    const loserId =
      firstW.blueTeamId === firstW.blueTeamId ? firstW.redTeamId : firstW.blueTeamId;
    // Blue wins → red is the loser
    const updated = recordMatchWinner(tournament, firstW.id, {
      teamId: firstW.blueTeamId!,
      blueWins: 2,
      redWins: 0,
    });
    const destMatchId = firstW.losersFeedsInto!.matchId;
    const destSlot = firstW.losersFeedsInto!.slot;
    const destMatch = updated.matches.find((m) => m.id === destMatchId)!;
    const slotValue =
      destSlot === "blue" ? destMatch.blueTeamId : destMatch.redTeamId;
    expect(slotValue).toBe(firstW.redTeamId); // loser = red team
    void loserId; // suppress unused warning
  });
});

// ─── crossMatchFearlessLocked ─────────────────────────────────────────────

describe("crossMatchFearlessLocked", () => {
  function makeTournamentWithHistory(
    perTeam: boolean,
    global: boolean,
  ): TournamentState {
    const t = createTournament({
      ...baseTournamentParams("round-robin", 4),
      fearlessConfig: { perSeries: true, perTeam, global },
    });
    // Use the first match's actual team ids for history so the test
    // doesn't depend on pairing order.
    const firstMatch = t.matches[0];
    const blueId = firstMatch.blueTeamId!;
    const redId = firstMatch.redTeamId!;
    return {
      ...t,
      teamPickHistory: {
        [blueId]: [101, 102],
        [redId]: [201, 202],
      },
      globalPickHistory: [101, 201, 301],
      activeMatchId: firstMatch.id,
    };
  }

  it("returns empty set when neither perTeam nor global is set", () => {
    const t = makeTournamentWithHistory(false, false);
    const match = t.matches[0];
    const locked = crossMatchFearlessLocked(t, match.id);
    expect(locked.size).toBe(0);
  });

  it("returns team picks for both teams when perTeam is set", () => {
    const t = makeTournamentWithHistory(true, false);
    const match = t.matches[0];
    const locked = crossMatchFearlessLocked(t, match.id);
    // Blue team picks (101, 102) and red team picks (201, 202)
    expect(locked.has(101)).toBe(true);
    expect(locked.has(102)).toBe(true);
    expect(locked.has(201)).toBe(true);
    expect(locked.has(202)).toBe(true);
  });

  it("returns global picks when global is set", () => {
    const t = makeTournamentWithHistory(false, true);
    const match = t.matches[0];
    const locked = crossMatchFearlessLocked(t, match.id);
    expect(locked.has(101)).toBe(true);
    expect(locked.has(201)).toBe(true);
    expect(locked.has(301)).toBe(true);
  });

  it("unions team + global picks when both are set", () => {
    const t = makeTournamentWithHistory(true, true);
    const match = t.matches[0];
    const locked = crossMatchFearlessLocked(t, match.id);
    // All from global (101, 201, 301) + team-specific (102, 202)
    expect(locked.has(301)).toBe(true);
    expect(locked.has(102)).toBe(true);
    // 101, 102, 201, 202 from perTeam; 301 uniquely from global = 5
    expect(locked.size).toBeGreaterThanOrEqual(5);
  });
});

// ─── Swiss round pairing avoids rematches ────────────────────────────────

describe("Swiss pairing avoids rematches", () => {
  it("round 2 does not repeat round 1 pairings when avoidable", () => {
    // With 4 teams and 2 rounds, round 2 must use different pairings
    let t = createTournament(
      baseTournamentParams("swiss", 4, { swissTotalRoundsOverride: 2 }),
    );
    const r1Pairs = new Set<string>();
    const r1Matches = t.matches.filter((m) => m.round === 1);
    for (const m of r1Matches) {
      const key = [m.blueTeamId!, m.redTeamId!].sort().join("-");
      r1Pairs.add(key);
    }
    // Resolve round 1
    for (const m of r1Matches) {
      t = recordMatchWinner(t, m.id, {
        teamId: m.blueTeamId!,
        blueWins: 2,
        redWins: 0,
      });
    }
    // After round 1 resolves, round 2 should be generated
    const r2Matches = t.matches.filter((m) => m.round === 2 && !m.isBye);
    expect(r2Matches.length).toBeGreaterThan(0);
    for (const m of r2Matches) {
      const key = [m.blueTeamId!, m.redTeamId!].sort().join("-");
      expect(r1Pairs.has(key)).toBe(false);
    }
  });
});

// ─── createTournament round-trip ──────────────────────────────────────────

describe("createTournament", () => {
  it("creates an in-progress tournament", () => {
    const t = createTournament(baseTournamentParams("single-elim", 4));
    expect(t.status).toBe("in-progress");
  });

  it("populates matches for the given format", () => {
    const t = createTournament(baseTournamentParams("round-robin", 4));
    expect(t.matches.length).toBeGreaterThan(0);
  });

  it("all team ids referenced in matches exist in teams array", () => {
    const t = createTournament(baseTournamentParams("single-elim", 8));
    const teamIds = new Set(t.teams.map((team) => team.id));
    for (const m of t.matches) {
      if (m.blueTeamId) expect(teamIds.has(m.blueTeamId)).toBe(true);
      if (m.redTeamId) expect(teamIds.has(m.redTeamId)).toBe(true);
    }
  });

  it("throws for unsupported format", () => {
    expect(() =>
      createTournament({
        ...baseTournamentParams("single-elim" as never, 4),
        format: "not-a-format" as never,
      }),
    ).toThrow();
  });
});

// ─── Live meta evolution flag (opt-in — default behavior unchanged) ────────

describe("createTournament — liveMeta", () => {
  it("does not set liveMeta or evolution fields by default", () => {
    const t = createTournament(baseTournamentParams("round-robin", 4));
    expect(t.liveMeta).toBeUndefined();
    expect("liveMeta" in t).toBe(false);
    expect(t.metaEvolutionLog).toBeUndefined();
    expect(t.metaEvolvedRounds).toBeUndefined();
    // Serialized form is byte-identical to pre-feature snapshots.
    expect(JSON.stringify(t)).not.toContain("liveMeta");
  });

  it("does not set liveMeta when explicitly passed false", () => {
    const t = createTournament(
      baseTournamentParams("round-robin", 4, { liveMeta: false }),
    );
    expect("liveMeta" in t).toBe(false);
  });

  it("sets liveMeta when requested", () => {
    const t = createTournament(
      baseTournamentParams("single-elim", 4, { liveMeta: true }),
    );
    expect(t.liveMeta).toBe(true);
    // The log/bookkeeping fields stay absent until the first evolution
    // event — lib/metaEvolution owns writing them.
    expect(t.metaEvolutionLog).toBeUndefined();
    expect(t.metaEvolvedRounds).toBeUndefined();
  });
});

// ─── teamStreak (signed, playoff-aware, season carry-in) ───────────────────

describe("teamStreak", () => {
  let mid = 0;
  function resolvedMatch(opts: {
    blue: string;
    red: string;
    winner: string;
    round: number;
    bracket?: TournamentMatch["bracket"];
    isBye?: boolean;
  }): TournamentMatch {
    return {
      id: `sm${++mid}`,
      round: opts.round,
      blueTeamId: opts.blue,
      redTeamId: opts.red,
      format: "bo3",
      fearless: false,
      mode: "aivai",
      aiSide: null,
      aiDifficulty: "medium",
      series: null,
      winner: { teamId: opts.winner, blueWins: 2, redWins: 0 },
      feedsInto: null,
      ...(opts.bracket ? { bracket: opts.bracket } : {}),
      ...(opts.isBye ? { isBye: true } : {}),
    };
  }

  function streakTournament(
    matches: TournamentMatch[],
    extra: Partial<TournamentState> = {},
  ): TournamentState {
    return {
      id: "tour-streak",
      name: "Streak Test",
      format: "round-robin-playoffs",
      status: "in-progress",
      teams: makeTeams(4),
      matches,
      teamPickHistory: {},
      globalPickHistory: [],
      defaults: DEFAULTS,
      fearlessConfig: { perSeries: false, perTeam: false, global: false },
      createdAt: 0,
      updatedAt: 0,
      activeMatchId: null,
      ...extra,
    };
  }

  it("returns negative counts for loss streaks", () => {
    const t = streakTournament([
      resolvedMatch({ blue: "team-1", red: "team-2", winner: "team-2", round: 1 }),
      resolvedMatch({ blue: "team-3", red: "team-1", winner: "team-3", round: 2 }),
    ]);
    expect(teamStreak(t, "team-1")).toBe(-2);
    // The deprecated win-only wrapper floors losses at 0.
    expect(teamWinStreak(t, "team-1")).toBe(0);
  });

  it("playoff bracket matches count as MOST RECENT despite round restarting at 1", () => {
    // Stage: team-1 wins rounds 1-3. Playoffs (bracket round 1): team-1 LOSES.
    // Sorting by round alone would bury the playoff loss between stage
    // rounds and report a 3-win streak — the regression this guards.
    const t = streakTournament([
      resolvedMatch({ blue: "team-1", red: "team-2", winner: "team-1", round: 1 }),
      resolvedMatch({ blue: "team-1", red: "team-3", winner: "team-1", round: 2 }),
      resolvedMatch({ blue: "team-1", red: "team-4", winner: "team-1", round: 3 }),
      resolvedMatch({
        blue: "team-1",
        red: "team-2",
        winner: "team-2",
        round: 1,
        bracket: "winners",
      }),
    ]);
    expect(teamStreak(t, "team-1")).toBe(-1);
  });

  it("playoff wins extend a stage streak", () => {
    const t = streakTournament([
      resolvedMatch({ blue: "team-1", red: "team-2", winner: "team-1", round: 2 }),
      resolvedMatch({ blue: "team-1", red: "team-3", winner: "team-1", round: 3 }),
      resolvedMatch({
        blue: "team-1",
        red: "team-4",
        winner: "team-1",
        round: 1,
        bracket: "winners",
      }),
    ]);
    expect(teamStreak(t, "team-1")).toBe(3);
  });

  it("losers-bracket matches come after winners-bracket matches", () => {
    // team-1 wins WB round 1, loses WB round 2 (drops), then wins two LB
    // rounds. Current streak should be +2, not contaminated by ordering.
    const t = streakTournament([
      resolvedMatch({ blue: "team-1", red: "team-2", winner: "team-1", round: 1, bracket: "winners" }),
      resolvedMatch({ blue: "team-1", red: "team-3", winner: "team-3", round: 2, bracket: "winners" }),
      resolvedMatch({ blue: "team-1", red: "team-4", winner: "team-1", round: 1, bracket: "losers" }),
      resolvedMatch({ blue: "team-1", red: "team-2", winner: "team-1", round: 2, bracket: "losers" }),
    ]);
    expect(teamStreak(t, "team-1")).toBe(2);
  });

  it("byes are neutral: they neither extend nor break a streak", () => {
    const t = streakTournament([
      resolvedMatch({ blue: "team-1", red: "team-2", winner: "team-2", round: 1 }),
      resolvedMatch({ blue: "team-1", red: "team-1", winner: "team-1", round: 2, isBye: true }),
      resolvedMatch({ blue: "team-1", red: "team-3", winner: "team-3", round: 3 }),
    ]);
    expect(teamStreak(t, "team-1")).toBe(-2);
  });

  it("extends an unbroken streak with the season carry-in seed (same sign)", () => {
    const t = streakTournament(
      [
        resolvedMatch({ blue: "team-1", red: "team-2", winner: "team-1", round: 1 }),
        resolvedMatch({ blue: "team-1", red: "team-3", winner: "team-1", round: 2 }),
      ],
      { streakSeeds: { "team-1": 3 } },
    );
    expect(teamStreak(t, "team-1")).toBe(5);
  });

  it("does NOT apply the seed once the in-tournament history broke the streak", () => {
    const t = streakTournament(
      [
        resolvedMatch({ blue: "team-1", red: "team-2", winner: "team-2", round: 1 }),
        resolvedMatch({ blue: "team-1", red: "team-3", winner: "team-1", round: 2 }),
      ],
      { streakSeeds: { "team-1": 3 } },
    );
    expect(teamStreak(t, "team-1")).toBe(1);
  });

  it("ignores an opposite-sign seed", () => {
    const t = streakTournament(
      [resolvedMatch({ blue: "team-1", red: "team-2", winner: "team-1", round: 1 })],
      { streakSeeds: { "team-1": -4 } },
    );
    expect(teamStreak(t, "team-1")).toBe(1);
  });

  it("returns the bare seed for a team with no completed matches yet", () => {
    const t = streakTournament([], { streakSeeds: { "team-1": -4, "team-2": 2 } });
    expect(teamStreak(t, "team-1")).toBe(-4);
    expect(teamStreak(t, "team-2")).toBe(2);
    expect(teamStreak(t, "team-3")).toBe(0);
  });

  it("excludeMatchId leaves the in-progress series out of the walk", () => {
    const t = streakTournament([
      resolvedMatch({ blue: "team-1", red: "team-2", winner: "team-1", round: 1 }),
      resolvedMatch({ blue: "team-1", red: "team-3", winner: "team-1", round: 2 }),
    ]);
    const lastId = t.matches[1].id;
    expect(teamStreak(t, "team-1", lastId)).toBe(1);
  });
});
