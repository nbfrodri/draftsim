// Benchmark-style regression test for the memoized persist encoding.
//
// Builds a synthetic 32-team tournament with ~150 fully-recapped games
// (realistic timeline sizes) and measures compactEncodeTournamentForPersist:
//
//   cold  — first encode: every recap pays full encoding cost.
//   warm  — re-encode after a shallow tournament-identity change (the exact
//           shape zustand-persist's partialize sees on every set() during a
//           bulk sim): per-match WeakMap cache should make this ≥10× faster.
//   memo  — same tournament reference: single-entry memo, near-zero.
//
// Thresholds are deliberately generous (≥5× asserted vs ≥10× expected) so a
// noisy CI box doesn't flake; the measured numbers are logged for visibility.

import { describe, expect, it } from "vitest";
import { compactEncodeTournamentForPersist } from "./recapCompression";
import type { GameRecap } from "./types";
import type { TournamentState } from "./tournament";

function buildRecap(seed: number): GameRecap {
  const winProbTimeline = Array.from({ length: 100 }, (_, i) => ({
    minute: Math.round((i * 0.35 + 0.5) * 10) / 10,
    blueProb: Math.round((0.5 + Math.sin(i * 0.4 + seed) * 0.35) * 100) / 100,
  }));
  const goldLeadTimeline = Array.from({ length: 100 }, (_, i) => ({
    minute: Math.round((i * 0.35 + 0.5) * 10) / 10,
    goldLead: Math.round((i * 200 - 3800 + Math.sin(i + seed) * 1200) / 100) * 100,
  }));
  const notableEvents = Array.from({ length: 12 }, (_, i) => ({
    minute: Math.round((i * 2.8 + 1.5) * 10) / 10,
    side: (i % 2 === 0 ? "blue" : "red") as "blue" | "red",
    type: ["baron", "elder", "ace", "shutdown", "teamfight"][i % 5],
    description: `Event ${i}: something noteworthy happened here`,
    probDelta: Math.round((i % 3 === 0 ? 12 : -8) + Math.sin(i + seed) * 5) / 100,
  }));
  const kdaRow = (k: number) => ({ k, d: (k + seed) % 5, a: (k * 2 + seed) % 12 });
  return {
    durationMinutes: 30 + (seed % 12),
    mvp: null,
    biggestSwing: null,
    winProbTimeline,
    goldLeadTimeline,
    notableEvents,
    perPickKDA: {
      blue: [1, 2, 3, 4, 5].map(kdaRow),
      red: [2, 3, 4, 5, 6].map(kdaRow),
    },
    ratings: {
      blue: [8.5, 7.2, 9.1, 6.5, 5.8],
      red: [3.2, 4.1, 2.9, 3.5, 4.8],
    },
  };
}

/** 32 teams, 50 completed Bo3 matches × 3 recapped games ≈ 150 recaps. */
function buildSyntheticTournament(): TournamentState {
  const teams = Array.from({ length: 32 }, (_, i) => ({
    id: `team-${i}`,
    name: `Team ${i}`,
    seed: i + 1,
  }));
  let gameSeed = 0;
  const matches = Array.from({ length: 50 }, (_, i) => ({
    id: `match-${i}`,
    round: Math.floor(i / 16) + 1,
    blueTeamId: `team-${i % 32}`,
    redTeamId: `team-${(i + 1) % 32}`,
    format: "bo3",
    fearless: false,
    mode: "aivai",
    aiSide: null,
    aiDifficulty: "normal",
    winner: { teamId: `team-${i % 32}`, blueWins: 2, redWins: 1 },
    feedsInto: null,
    series: {
      games: Array.from({ length: 3 }, () => ({
        recap: buildRecap(gameSeed++),
      })),
    },
  }));
  return {
    id: "bench-tournament",
    name: "Benchmark Cup",
    teams,
    matches,
  } as unknown as TournamentState;
}

describe("compactEncodeTournamentForPersist benchmark (32 teams, ~150 recapped games)", () => {
  it("warm (per-match cache) encode is much faster than cold", () => {
    const tournament = buildSyntheticTournament();

    // Cold: every recap of every match encodes from scratch.
    const t0 = performance.now();
    const cold = compactEncodeTournamentForPersist(tournament);
    const coldMs = performance.now() - t0;

    // Warm: new tournament identity (what partialize sees after an unrelated
    // set()), same match objects → served from the per-match WeakMap cache.
    // Run several iterations and take the average for a stable number.
    const WARM_ITERS = 20;
    const warmInputs = Array.from({ length: WARM_ITERS }, () => ({
      ...tournament,
    }));
    const t1 = performance.now();
    let lastWarm: TournamentState | null = null;
    for (const input of warmInputs) {
      lastWarm = compactEncodeTournamentForPersist(input);
    }
    const warmMs = (performance.now() - t1) / WARM_ITERS;

    // Single-entry memo: identical tournament reference.
    const t2 = performance.now();
    const memoResult = compactEncodeTournamentForPersist(warmInputs[WARM_ITERS - 1]);
    const memoMs = performance.now() - t2;

    // Correctness: warm results reuse the cold-encoded matches by identity.
    expect(lastWarm!.matches[0]).toBe(cold.matches[0]);
    expect(lastWarm!.matches[49]).toBe(cold.matches[49]);
    expect(memoResult).toBe(lastWarm);

    const ratio = coldMs / Math.max(warmMs, 0.0001);
    // eslint-disable-next-line no-console
    console.log(
      `[bench] compactEncodeTournamentForPersist — cold: ${coldMs.toFixed(2)}ms, ` +
        `warm (new tournament identity, cached matches): ${warmMs.toFixed(4)}ms/call, ` +
        `memo (same reference): ${memoMs.toFixed(4)}ms, ` +
        `cold/warm ratio: ${ratio.toFixed(1)}x`,
    );

    // Expect ≥10× in practice; assert ≥5× so CI noise doesn't flake the suite.
    expect(ratio).toBeGreaterThanOrEqual(5);
    // Sanity: cold path actually did meaningful work on 150 recaps.
    expect(coldMs).toBeGreaterThan(0);
  });
});
