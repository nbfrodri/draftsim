import { describe, expect, it } from "vitest";
import {
  bracketSeedOrder,
  clampDEAdvancing,
  computeBracketFinishOrder,
  computeGroupStandings,
  computeStandings,
  computeSwissStandings,
  createTournament,
  crossMatchFearlessLocked,
  dePlayoffRounds,
  swissThresholdFor,
  generateDoubleElimBracket,
  generateRoundRobinMatches,
  generateSingleElimBracket,
  generateStepladderBracket,
  generateSwissBracket,
  isSwissStageComplete,
  recordMatchWinner,
  startRoundRobinPlayoffs,
  startSwissPlayoffs,
  startGroupsPlayoffs,
  teamStreak,
  teamWinStreak,
  tournamentChampion,
  tripleElimLosses,
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

  it("double round-robin produces twice the matches (each pair meets twice)", () => {
    const teams = makeTeams(6);
    const matches = generateRoundRobinMatches(teams, DEFAULTS, undefined, 2);
    expect(matches).toHaveLength(6 * 5); // 2 × n*(n-1)/2
    const pairCounts: Record<string, number> = {};
    for (const m of matches) {
      const key = [m.blueTeamId!, m.redTeamId!].sort().join("-");
      pairCounts[key] = (pairCounts[key] ?? 0) + 1;
    }
    // Every unordered pair appears exactly twice.
    expect(Object.values(pairCounts).every((v) => v === 2)).toBe(true);
  });

  it("double round-robin swaps sides between the two meetings", () => {
    const teams = makeTeams(4);
    const matches = generateRoundRobinMatches(teams, DEFAULTS, undefined, 2);
    // Group meetings by unordered pair; the two meetings must have
    // opposite blue/red so each team is home once and away once.
    const byPair: Record<string, Array<{ blue: string; red: string }>> = {};
    for (const m of matches) {
      const key = [m.blueTeamId!, m.redTeamId!].sort().join("-");
      (byPair[key] ??= []).push({ blue: m.blueTeamId!, red: m.redTeamId! });
    }
    for (const meetings of Object.values(byPair)) {
      expect(meetings).toHaveLength(2);
      expect(meetings[0].blue).toBe(meetings[1].red);
      expect(meetings[0].red).toBe(meetings[1].blue);
    }
  });

  it("double round-robin still completes end-to-end", () => {
    const tournament = createTournament({
      ...baseTournamentParams("round-robin", 4),
      roundRobinLegs: 2,
    });
    expect(tournament.matches).toHaveLength(4 * 3);
    const completed = simulateTournamentTo(tournament);
    expect(completed.status).toBe("complete");
  });
});

// ─── Triple-elimination (3-life) ──────────────────────────────────────────

describe("triple-elim", () => {
  // Small deterministic PRNG so the stress test is reproducible.
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

  function playOut(
    start: TournamentState,
    rng: () => number,
  ): TournamentState {
    let state = start;
    for (let i = 0; i < 2000 && state.status !== "complete"; i++) {
      const m = state.matches.find(
        (x) => !x.winner && x.blueTeamId != null && x.redTeamId != null,
      );
      if (!m) break;
      const blueWon = rng() < 0.5;
      state = recordMatchWinner(state, m.id, {
        teamId: blueWon ? m.blueTeamId! : m.redTeamId!,
        blueWins: blueWon ? 2 : 0,
        redWins: blueWon ? 0 : 2,
      });
    }
    return state;
  }

  it("round 1 fold-seeds the whole field", () => {
    for (const n of [4, 8]) {
      const t = createTournament(baseTournamentParams("triple-elim", n));
      expect(t.matches).toHaveLength(n / 2);
      // Top seed meets bottom seed; all round-1 matches are 'winners' tier.
      const r1 = t.matches.filter((m) => m.round === 1);
      expect(r1.every((m) => m.bracket === "winners")).toBe(true);
      const first = r1[0];
      const seeds = [first.blueTeamId, first.redTeamId]
        .map((id) => t.teams.find((x) => x.id === id)!.seed)
        .sort((a, b) => a - b);
      expect(seeds).toEqual([1, n]);
    }
  });

  it("completes via the 3-bracket → consolation → grand final structure", () => {
    for (const n of [4, 8, 12, 18]) {
      for (let s = 0; s < 25; s++) {
        const state = playOut(
          createTournament(baseTournamentParams("triple-elim", n)),
          rngFrom(s + n * 1000),
        );
        expect(state.status).toBe("complete");
        // Exactly ONE consolation final and ONE grand final per the spec.
        const consolation = state.matches.filter(
          (m) => m.bracket === "consolation",
        );
        const gf = state.matches.filter((m) => m.bracket === "grand-final");
        expect(consolation).toHaveLength(1);
        expect(gf).toHaveLength(1);
        // Consolation = the 1-loss champ vs the 2-loss champ (loser → 3rd).
        const lossesBeforeFinals = tripleElimLosses(
          state.matches.filter(
            (m) => m.bracket !== "consolation" && m.bracket !== "grand-final",
          ),
        );
        const cb = lossesBeforeFinals.get(consolation[0].blueTeamId!) ?? 0;
        const cr = lossesBeforeFinals.get(consolation[0].redTeamId!) ?? 0;
        expect([cb, cr].sort()).toEqual([1, 2]);
        // Grand final = Winners champ (0 losses pre-final) vs the
        // consolation survivor; champion is the grand-final WINNER.
        const champ = tournamentChampion(state)!;
        expect(champ.id).toBe(gf[0].winner!.teamId);
        const gbl = lossesBeforeFinals.get(gf[0].blueTeamId!) ?? 0;
        const grd = lossesBeforeFinals.get(gf[0].redTeamId!) ?? 0;
        expect(Math.min(gbl, grd)).toBe(0); // the undefeated Winners champ
      }
    }
  });

  it("tags every bracket band (winners / losers / last-chance / finals)", () => {
    const state = playOut(
      createTournament(baseTournamentParams("triple-elim", 8)),
      rngFrom(42),
    );
    expect(state.matches.some((m) => m.bracket === "winners")).toBe(true);
    expect(state.matches.some((m) => m.bracket === "losers")).toBe(true);
    expect(state.matches.some((m) => m.bracket === "elimination")).toBe(true);
    expect(state.matches.some((m) => m.bracket === "consolation")).toBe(true);
    expect(state.matches.some((m) => m.bracket === "grand-final")).toBe(true);
  });

  it("never schedules an eliminated team and resolves to one champion", () => {
    const state = playOut(
      createTournament(baseTournamentParams("triple-elim", 8)),
      rngFrom(7),
    );
    expect(state.status).toBe("complete");
    // No team plays after being eliminated (3 losses, or losing the
    // consolation final). Replay in order and check.
    const losses = new Map<string, number>();
    const consolationLost = new Set<string>();
    for (const m of state.matches) {
      if (m.isBye || m.blueTeamId == null || m.redTeamId == null) continue;
      const outBefore = (id: string) =>
        (losses.get(id) ?? 0) >= 3 || consolationLost.has(id);
      expect(outBefore(m.blueTeamId)).toBe(false);
      expect(outBefore(m.redTeamId)).toBe(false);
      if (!m.winner) continue;
      const loser =
        m.winner.teamId === m.blueTeamId ? m.redTeamId : m.blueTeamId;
      losses.set(loser, (losses.get(loser) ?? 0) + 1);
      if (m.bracket === "consolation") consolationLost.add(loser);
    }
    expect(tournamentChampion(state)).not.toBeNull();
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

// ─── DE anti-rematch losers seeding ────────────────────────────────────────

describe("double-elim avoids rematches", () => {
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
  const pairKey = (m: TournamentMatch) =>
    [m.blueTeamId!, m.redTeamId!].sort().join("|");

  // Resolve a tournament with CHALK (higher seed always wins). Without the
  // anti-rematch drop seeding this reliably produces losers-bracket
  // rematches of winners-bracket pairings (e.g. the 4-5 W-R1 pair meeting
  // again in L-R2); with it, the losers bracket is rematch-free.
  function playChalk(start: TournamentState): TournamentState {
    let state = start;
    for (let i = 0; i < 200 && state.status !== "complete"; i++) {
      const m = state.matches.find(
        (x) => !x.winner && x.blueTeamId != null && x.redTeamId != null,
      );
      if (!m) break;
      const blue = state.teams.find((t) => t.id === m.blueTeamId)!;
      const red = state.teams.find((t) => t.id === m.redTeamId)!;
      const winner = blue.seed <= red.seed ? blue.id : red.id;
      state = recordMatchWinner(state, m.id, {
        teamId: winner,
        blueWins: winner === blue.id ? 2 : 0,
        redWins: winner === red.id ? 2 : 0,
      });
    }
    return state;
  }

  it("chalk 8-team bracket has no losers-bracket rematches before the L-Final", () => {
    const state = playChalk(createTournament(baseTournamentParams("double-elim", 8)));
    expect(state.status).toBe("complete");
    const wPairs = new Set(
      state.matches
        .filter((m) => m.bracket === "winners" && m.blueTeamId && m.redTeamId)
        .map(pairKey),
    );
    const losers = state.matches.filter(
      (m) => m.bracket === "losers" && m.blueTeamId && m.redTeamId,
    );
    // The L-Final (highest losers round) pits the W-Final loser against the
    // losers-bracket survivor — an inherent DE rematch, like the grand
    // final. Every EARLIER losers match must be a fresh pairing.
    const maxLosersRound = Math.max(...losers.map((m) => m.round));
    for (const m of losers.filter((x) => x.round < maxLosersRound)) {
      expect(wPairs.has(pairKey(m)), `losers rematch ${pairKey(m)}`).toBe(false);
    }
  });

  it("still completes correctly across random outcomes (4/6/8/16)", () => {
    for (const n of [4, 6, 8, 16]) {
      for (let s = 0; s < 15; s++) {
        const rng = rngFrom(s + n * 7);
        let state = createTournament(baseTournamentParams("double-elim", n));
        for (let i = 0; i < 300 && state.status !== "complete"; i++) {
          const m = state.matches.find(
            (x) => !x.winner && x.blueTeamId != null && x.redTeamId != null,
          );
          if (!m) break;
          const blueWon = rng() < 0.5;
          state = recordMatchWinner(state, m.id, {
            teamId: blueWon ? m.blueTeamId! : m.redTeamId!,
            blueWins: blueWon ? 2 : 0,
            redWins: blueWon ? 0 : 2,
          });
        }
        expect(state.status, `DE n=${n} seed=${s}`).toBe("complete");
      }
    }
  });
});

// ─── Bracket finish order (play-in placement) ──────────────────────────────

describe("computeBracketFinishOrder", () => {
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
  function playOut(t: TournamentState, rng: () => number): TournamentState {
    let s = t;
    for (let i = 0; i < 300 && s.status !== "complete"; i++) {
      const m = s.matches.find(
        (x) => !x.winner && x.blueTeamId != null && x.redTeamId != null,
      );
      if (!m) break;
      const blueWon = rng() < 0.5;
      s = recordMatchWinner(s, m.id, {
        teamId: blueWon ? m.blueTeamId! : m.redTeamId!,
        blueWins: blueWon ? 2 : 0,
        redWins: blueWon ? 0 : 2,
      });
    }
    return s;
  }

  it("orders DE finishers by advancement (series wins), not by seed", () => {
    for (let s = 0; s < 30; s++) {
      const state = playOut(
        createTournament(baseTournamentParams("double-elim", 8)),
        rngFrom(s + 1),
      );
      expect(state.status).toBe("complete");
      const order = computeBracketFinishOrder(state).map((t) => t.id);
      // Ordered by series wins (desc) — i.e. how far each team advanced.
      const wins = new Map<string, number>();
      for (const m of state.matches) {
        if (m.winner && !m.isBye) {
          wins.set(m.winner.teamId, (wins.get(m.winner.teamId) ?? 0) + 1);
        }
      }
      for (let i = 1; i < order.length; i++) {
        expect(wins.get(order[i - 1]) ?? 0).toBeGreaterThanOrEqual(
          wins.get(order[i]) ?? 0,
        );
      }
    }
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

// ─── Stage + triple-elim playoffs ──────────────────────────────────────────

describe("stage + triple-elim playoffs", () => {
  const assertTECompletes = (t: TournamentState, advancing: number) => {
    const playoff = t.matches.filter((m) => m.bracket != null);
    const inBracket = new Set(
      playoff.flatMap((m) => [m.blueTeamId, m.redTeamId]).filter(Boolean),
    );
    expect(inBracket.size).toBe(advancing);
    const finished = simulateTournamentTo(t, 800);
    expect(finished.status).toBe("complete");
    // The TE playoff resolves via consolation + grand final; the champion
    // is the grand-final winner.
    const gf = finished.matches.find((m) => m.bracket === "grand-final");
    expect(gf?.winner).toBeTruthy();
    expect(tournamentChampion(finished)!.id).toBe(gf!.winner!.teamId);
  };

  it("round-robin → triple-elim playoff", () => {
    let t = createTournament(
      baseTournamentParams("round-robin-playoffs-te", 8, {
        rrPlayoffsAdvancingOverride: 4,
      }),
    );
    t = simulateTournamentTo(t, 500);
    expect(t.status).toBe("in-progress");
    t = startRoundRobinPlayoffs(t);
    assertTECompletes(t, 4);
  });

  it("swiss → triple-elim playoff", () => {
    let t = createTournament(
      baseTournamentParams("swiss-playoffs-te", 8, {
        swissPlayoffsAdvancingOverride: 4,
      }),
    );
    t = simulateTournamentTo(t, 500);
    expect(t.status).toBe("in-progress");
    t = startSwissPlayoffs(t);
    assertTECompletes(t, 4);
  });

  it("groups → triple-elim playoff", () => {
    let t = createTournament(
      baseTournamentParams("groups-playoffs-te", 8, {
        groupsConfigOverride: { groupCount: 2, advancingPerGroup: 2 },
      }),
    );
    t = simulateTournamentTo(t, 500);
    expect(t.status).toBe("in-progress");
    t = startGroupsPlayoffs(t);
    assertTECompletes(t, 4);
  });
});

// ─── Stepladder (gauntlet) playoffs ─────────────────────────────────────────

describe("stepladder bracket", () => {
  it("chains the lowest seeds up to the #1 seed (4 teams)", () => {
    const teams = makeTeams(4); // seeds 1..4
    const m = generateStepladderBracket(teams, DEFAULTS);
    expect(m).toHaveLength(3); // N-1 rungs
    const seedOf = (id: string | null) =>
      teams.find((t) => t.id === id)!.seed;
    const r1 = m.find((x) => x.round === 1)!;
    const r2 = m.find((x) => x.round === 2)!;
    const r3 = m.find((x) => x.round === 3)!;
    // Rung 1 = the two lowest seeds.
    expect([seedOf(r1.blueTeamId), seedOf(r1.redTeamId)].sort()).toEqual([3, 4]);
    // Each rung's fixed (red) seed climbs: rung2 vs seed 2, final vs seed 1.
    expect(seedOf(r2.redTeamId)).toBe(2);
    expect(seedOf(r3.redTeamId)).toBe(1);
    // Final has no feedsInto; rungs chain into the next via the blue slot.
    expect(r3.feedsInto).toBeNull();
    expect(r1.feedsInto?.matchId).toBe(r2.id);
    expect(r1.feedsInto?.slot).toBe("blue");
    expect(r2.feedsInto?.matchId).toBe(r3.id);
    // Later rungs' climber slot starts empty (filled by the prior winner).
    expect(r2.blueTeamId).toBeNull();
    expect(r3.blueTeamId).toBeNull();
  });

  it("round-robin + stepladder completes with a champion", () => {
    let t = createTournament(
      baseTournamentParams("round-robin-playoffs-step", 8, {
        rrPlayoffsAdvancingOverride: 4,
      }),
    );
    t = simulateTournamentTo(t, 500);
    expect(t.status).toBe("in-progress");
    t = startRoundRobinPlayoffs(t);
    const ladder = t.matches.filter((m) => m.bracket != null);
    expect(ladder).toHaveLength(3); // top 4 → 3 rungs
    t = simulateTournamentTo(t, 500);
    expect(t.status).toBe("complete");
    expect(tournamentChampion(t)).not.toBeNull();
  });
});

// ─── Groups + seed byes (Worlds region #1 seeds) ────────────────────────────

describe("groups-playoffs seed byes", () => {
  it("keeps bye teams out of the group stage and pre-seeds them into the DE bracket", () => {
    // 10 teams: seeds 1-2 bye straight into the playoff bracket; seeds
    // 3-10 play two groups of four (top 2 of each advance).
    const byeIds = ["team-1", "team-2"];
    let t = createTournament(
      baseTournamentParams("groups-playoffs-de", 10, {
        groupsConfigOverride: { groupCount: 2, advancingPerGroup: 2 },
        groupsByeTeamIds: byeIds,
      }),
    );
    // The bye list is materialized and the bye teams play no group matches.
    expect(t.groupsByeTeamIds).toEqual(byeIds);
    const groupMatches = t.matches.filter((m) => m.groupId != null);
    expect(groupMatches.length).toBeGreaterThan(0);
    for (const m of groupMatches) {
      expect(byeIds).not.toContain(m.blueTeamId);
      expect(byeIds).not.toContain(m.redTeamId);
    }
    // Exactly the eight non-bye teams populate the groups.
    const grouped = new Set<string>();
    for (const m of groupMatches) {
      if (m.blueTeamId) grouped.add(m.blueTeamId);
      if (m.redTeamId) grouped.add(m.redTeamId);
    }
    expect(grouped.size).toBe(8);
    expect(grouped.has("team-1")).toBe(false);
    expect(grouped.has("team-2")).toBe(false);

    // Resolve the group stage, then open the playoff bracket.
    t = simulateTournamentTo(t, 500);
    expect(t.status).toBe("in-progress");
    t = startGroupsPlayoffs(t);
    // Bracket = 2 byes + 4 group qualifiers = a clean 6-team DE bracket;
    // the bye teams are pre-seeded into it on the top seeds.
    const bracketTeamIds = new Set(
      t.matches
        .filter((m) => m.bracket != null)
        .flatMap((m) => [m.blueTeamId, m.redTeamId])
        .filter((id): id is string => id != null),
    );
    for (const id of byeIds) expect(bracketTeamIds.has(id)).toBe(true);

    t = simulateTournamentTo(t, 500);
    expect(t.status).toBe("complete");
    expect(tournamentChampion(t)).not.toBeNull();
  });

  it("leaves ordinary groups tournaments without a bye list", () => {
    const t = createTournament(
      baseTournamentParams("groups-playoffs-de", 8, {
        groupsConfigOverride: { groupCount: 2, advancingPerGroup: 2 },
      }),
    );
    expect(t.groupsByeTeamIds).toBeUndefined();
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

// ─── Swiss threshold mode (modern Worlds Swiss) ────────────────────────────

describe("swissThresholdFor", () => {
  it("derives symmetric X = log2(N) − 1 for power-of-2 fields", () => {
    expect(swissThresholdFor(8)).toEqual({
      winTarget: 2,
      advancing: 4,
      maxRounds: 3,
    });
    expect(swissThresholdFor(16)).toEqual({
      winTarget: 3,
      advancing: 8,
      maxRounds: 5,
    });
    expect(swissThresholdFor(32)).toEqual({
      winTarget: 4,
      advancing: 16,
      maxRounds: 7,
    });
  });

  it("returns null for non-power-of-2 or sub-8 fields (would need byes)", () => {
    expect(swissThresholdFor(10)).toBeNull();
    expect(swissThresholdFor(18)).toBeNull();
    expect(swissThresholdFor(12)).toBeNull();
    expect(swissThresholdFor(4)).toBeNull();
  });
});

describe("swiss threshold mode", () => {
  it("engages symmetric 3-3 for a 16-team field", () => {
    const t = createTournament(
      baseTournamentParams("swiss", 16, { swissThreshold: true }),
    );
    expect(t.swissWinTarget).toBe(3);
    expect(t.swissTotalRounds).toBe(5); // 2X−1 cap
  });

  it("falls back to fixed rounds when the field isn't a power of 2", () => {
    const t = createTournament(
      baseTournamentParams("swiss", 10, { swissThreshold: true }),
    );
    expect(t.swissWinTarget).toBeUndefined();
  });

  it("leaves default Swiss free of threshold fields", () => {
    const t = createTournament(baseTournamentParams("swiss", 16));
    expect(t.swissWinTarget).toBeUndefined();
  });

  it("never awards a bye and advances exactly half the field", () => {
    let t = createTournament(
      baseTournamentParams("swiss", 16, { swissThreshold: true }),
    );
    t = simulateTournamentTo(t);
    expect(t.status).toBe("complete");
    // No bye match should ever be generated in a power-of-2 threshold Swiss.
    expect(t.matches.some((m) => m.isBye)).toBe(false);
    const standings = computeSwissStandings(t);
    expect(standings.filter((s) => s.wins >= 3)).toHaveLength(8);
    expect(standings.filter((s) => s.losses >= 3)).toHaveLength(8);
  });

  it("pairs strictly within the same record each round", () => {
    let t = createTournament(
      baseTournamentParams("swiss", 16, { swissThreshold: true }),
    );
    // Replay round by round, checking every freshly generated pairing joins
    // two teams with identical W-L records (no 2-1 vs 1-2 cross pairings).
    for (let guard = 0; guard < 50 && t.status === "in-progress"; guard++) {
      const standings = computeSwissStandings(t);
      const recOf = new Map(
        standings.map((s) => [s.team.id, `${s.wins}-${s.losses}`]),
      );
      const pending = t.matches.filter(
        (m) => !m.winner && m.blueTeamId && m.redTeamId,
      );
      for (const m of pending) {
        expect(recOf.get(m.blueTeamId!)).toBe(recOf.get(m.redTeamId!));
      }
      for (const m of pending) {
        t = recordMatchWinner(t, m.id, {
          teamId: m.blueTeamId!,
          blueWins: 2,
          redWins: 0,
        });
      }
    }
    expect(t.status).toBe("complete");
  });

  it("makes deciding matches one series longer than the rest", () => {
    // 8-team threshold (X=2) over a Bo1 base: round 1 is all (0-0) — no one
    // can qualify/eliminate yet — so Bo1; every later match is a decider
    // (a win reaches 2 or a loss reaches 2), so Bo3.
    let t = createTournament(
      baseTournamentParams("swiss", 8, {
        swissThreshold: true,
        defaults: { ...DEFAULTS, format: "bo1" },
      }),
    );
    t = simulateTournamentTo(t);
    const r1 = t.matches.filter((m) => m.round === 1 && !m.isBye);
    const later = t.matches.filter((m) => m.round >= 2 && !m.isBye);
    expect(r1.length).toBeGreaterThan(0);
    expect(later.length).toBeGreaterThan(0);
    expect(r1.every((m) => m.format === "bo1")).toBe(true);
    expect(later.every((m) => m.format === "bo3")).toBe(true);
  });

  it("seeds qualifiers by record — earliest (fewest losses) on top", () => {
    let t = createTournament(
      baseTournamentParams("swiss", 16, { swissThreshold: true }),
    );
    t = simulateTournamentTo(t);
    const standings = computeSwissStandings(t);
    const y = t.swissWinTarget!;
    const qualified = standings.filter((s) => s.wins >= y);
    for (let i = 1; i < qualified.length; i++) {
      expect(qualified[i].losses).toBeGreaterThanOrEqual(
        qualified[i - 1].losses,
      );
    }
    expect(qualified.map((s) => s.rank)).toEqual(
      qualified.map((_, i) => i + 1),
    );
  });

  it("swiss-playoffs threshold advances exactly the qualified teams", () => {
    let t = createTournament(
      baseTournamentParams("swiss-playoffs", 16, { swissThreshold: true }),
    );
    const y = t.swissWinTarget!;
    t = simulateTournamentTo(t);
    const qualifiedCount = computeSwissStandings(t).filter(
      (s) => s.wins >= y,
    ).length;
    const started = startSwissPlayoffs(t);
    expect(started.swissPlayoffsStarted).toBe(true);
    const bracketTeams = new Set<string>();
    for (const m of started.matches) {
      if (m.bracket === undefined) continue;
      if (m.blueTeamId) bracketTeams.add(m.blueTeamId);
      if (m.redTeamId) bracketTeams.add(m.redTeamId);
    }
    expect(bracketTeams.size).toBe(qualifiedCount);
  });
});

describe("isSwissStageComplete", () => {
  it("is false while Swiss rounds remain", () => {
    const t = createTournament(
      baseTournamentParams("swiss-playoffs-de", 8, {
        swissTotalRoundsOverride: 3,
      }),
    );
    expect(isSwissStageComplete(t)).toBe(false);
  });

  it("is true after the Swiss stage finishes", () => {
    let t = createTournament(
      baseTournamentParams("swiss-playoffs-de", 8, {
        swissTotalRoundsOverride: 3,
      }),
    );
    for (let i = 0; i < 50; i++) {
      const next = t.matches.find(
        (m) =>
          m.bracket === undefined &&
          !m.winner &&
          m.blueTeamId != null &&
          m.redTeamId != null,
      );
      if (!next) break;
      t = recordMatchWinner(t, next.id, {
        teamId: next.blueTeamId!,
        blueWins: 2,
        redWins: 0,
      });
    }
    expect(isSwissStageComplete(t)).toBe(true);
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
