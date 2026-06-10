// Calibration of the reported pre-game win probability (blueProb) against
// the EMPIRICAL outcomes of the timeline engine. simulateMatch decides the
// winner inside generateTimeline (diff-biased event rolls → gold/momentum/
// objectives → closing-fight logit); blueProb is a separate pre-game model
// (pregameBlueWinProb). These tests pin the two together: for fixed drafts
// spanning weak/even/strong diffs, the empirical blue win rate over N
// seeded simulations must match the reported blueProb within ±5pp.
//
// Statistical budget: N = 2500 sims/case → binomial σ ≈ 1.0pp, so 2σ noise
// ≈ ±2pp on top of the model's ≤4pp calibration error. Seeds are fixed, so
// runs are deterministic — no flakes. If a deliberate gameplay change in
// generateTimeline shifts these distributions, re-fit the constants in
// pregameBlueWinProb (SIGMOID_K / SCALING_EDGE_K / BLUE_SIDE_BONUS) rather
// than loosening the tolerance.

import { describe, expect, it } from "vitest";
import { simulateMatch } from "./matchSimulator";
import { createRng } from "./rng";
import type { Champion, GameDraft, Lane } from "./types";

const LANES: Lane[] = ["top", "jungle", "middle", "bottom", "support"];

let nextId = 1;
// Minimal Champion fixture (same pattern as lib/sim/strategies.test.ts).
// metaFor() keys off `alias`, so real meta aliases give the real phase/
// archetype behavior.
function champ(alias: string, lane: Lane): Champion {
  return { id: nextId++, name: alias, alias, roles: [], iconUrl: "", lanes: [lane] };
}

function comp(aliases: string[]): Champion[] {
  return aliases.map((a, i) => champ(a, LANES[i]));
}

function game(blue: Champion[], red: Champion[]): GameDraft {
  return {
    id: "g1",
    gameNumber: 1,
    blueTeam: "Blue",
    redTeam: "Red",
    blueBans: [],
    redBans: [],
    bluePicks: blue.map((c) => c.id),
    redPicks: red.map((c) => c.id),
    blueRoles: [...LANES],
    redRoles: [...LANES],
    actionIndex: 0,
    status: "complete",
    winner: null,
  } as GameDraft;
}

// Comp fixtures. MIRROR vs MIRROR zeroes every comp term so `scoreBias`
// controls the diff exactly; LATE/EARLY span the phase-scaling axis that
// the timeline rewards beyond the raw score diff.
const MIRROR = ["Malphite", "Vi", "Ahri", "Jhin", "Nautilus"];
const LATE = ["Anivia", "Azir", "AurelionSol", "Aphelios", "Anivia"];
const EARLY = ["Darius", "Draven", "Elise", "LeeSin", "Renekton"];

function runCase(
  blueAliases: string[],
  redAliases: string[],
  scoreBias: number,
  n: number,
  seed: number,
): { empirical: number; reported: number } {
  const blue = comp(blueAliases);
  const red = comp(redAliases);
  const champions = [...blue, ...red];
  const g = game(blue, red);
  const rng = createRng(seed);
  let wins = 0;
  let reported = 0;
  for (let i = 0; i < n; i++) {
    const r = simulateMatch(g, champions, { scoreBias, rng });
    if (r.winner === "blue") wins++;
    reported = r.blueProb; // identical every iteration (pre-game model)
  }
  return { empirical: wins / n, reported };
}

const N = 2500;
const TOLERANCE = 0.05; // ±5 percentage points

describe("blueProb calibration vs empirical outcomes", () => {
  // Mirror drafts + scoreBias: the bias feeds straight into diff, so this
  // sweeps weak (−30) / even (0) / strong (+30) diffs with all comp terms
  // cancelled.
  it.each([
    [-30],
    [-15],
    [0],
    [15],
    [30],
  ])("mirror draft at scoreBias %i: reported ≈ empirical", (bias) => {
    const { empirical, reported } = runCase(MIRROR, MIRROR, bias, N, 1000 + bias);
    expect(Math.abs(empirical - reported)).toBeLessThanOrEqual(TOLERANCE);
  });

  // Phase-contrast drafts: the timeline's late-game payoff makes scaling
  // comps outperform their raw score diff; the reported model carries the
  // same scalingEdge × duration-ramp term, so the two must still agree.
  it.each([
    ["5-late vs 5-early", LATE, EARLY],
    ["5-early vs 5-late", EARLY, LATE],
    ["neutral vs 5-late", MIRROR, LATE],
    ["5-late vs neutral", LATE, MIRROR],
    ["5-early vs neutral", EARLY, MIRROR],
  ])("%s: reported ≈ empirical", (_label, blue, red) => {
    const { empirical, reported } = runCase(blue, red, 0, N, 77);
    expect(Math.abs(empirical - reported)).toBeLessThanOrEqual(TOLERANCE);
  });

  it("reported blueProb sits inside the documented clamp", () => {
    const { reported } = runCase(MIRROR, MIRROR, 200, 1, 5);
    expect(reported).toBeLessThanOrEqual(0.97);
    const { reported: low } = runCase(MIRROR, MIRROR, -200, 1, 5);
    expect(low).toBeGreaterThanOrEqual(0.03);
  });
});

describe("seeded determinism", () => {
  it("same seed → identical simulateMatch result", () => {
    const blue = comp(LATE);
    const red = comp(EARLY);
    const champions = [...blue, ...red];
    const g = game(blue, red);
    const a = simulateMatch(g, champions, { rng: createRng(123) });
    const b = simulateMatch(g, champions, { rng: createRng(123) });
    // Full structural equality — winner, probabilities, every event,
    // descriptions, KDA spreads, lane gold, durations.
    expect(b).toEqual(a);
  });

  it("different seeds → different timelines (sanity check)", () => {
    const blue = comp(MIRROR);
    const red = comp(MIRROR);
    const champions = [...blue, ...red];
    const g = game(blue, red);
    const a = simulateMatch(g, champions, { rng: createRng(1) });
    const b = simulateMatch(g, champions, { rng: createRng(2) });
    expect(b.timeline.events).not.toEqual(a.timeline.events);
  });
});
