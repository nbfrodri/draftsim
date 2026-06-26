// Monte-Carlo pregame forecast (SimulateOptions.forecastSamples).
//
// Two properties matter and are easy to get wrong:
//   1. The extra forecast samples must run AFTER the main game, so they never
//      perturb the displayed timeline (same seed → identical events whether or
//      not forecasting is on).
//   2. The forecast must be a valid probability that tracks the real sim — a
//      heavily blue-favored draft forecasts > 0.5, a red-favored one < 0.5.

import { describe, expect, it } from "vitest";
import { simulateMatch } from "./matchSimulator";
import { createRng } from "./rng";
import type { Champion, GameDraft, Lane } from "./types";

const LANES: Lane[] = ["top", "jungle", "middle", "bottom", "support"];
let nextId = 1;
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

const MIRROR = ["Malphite", "Vi", "Ahri", "Jhin", "Nautilus"];

describe("Monte-Carlo pregame forecast", () => {
  const blue = comp(MIRROR);
  const red = comp(MIRROR);
  const champions = [...blue, ...red];
  const g = game(blue, red);

  it("forecast samples do NOT perturb the displayed timeline", () => {
    // Same seed: the main game (events + winner) must be byte-identical whether
    // forecasting is off or on — the samples run after the main game.
    const plain = simulateMatch(g, champions, { rng: createRng(42) });
    const forecast = simulateMatch(g, champions, {
      rng: createRng(42),
      forecastSamples: 50,
    });
    expect(forecast.winner).toBe(plain.winner);
    expect(forecast.timeline.events).toEqual(plain.timeline.events);
    expect(forecast.timeline.durationMinutes).toBe(plain.timeline.durationMinutes);
  });

  it("produces a valid probability that follows the matchup", () => {
    // Blue heavily favored (scoreBias +30) → forecast > 0.5; red-favored → < 0.5.
    const blueFav = simulateMatch(g, champions, {
      rng: createRng(7),
      scoreBias: 30,
      forecastSamples: 200,
    }).blueProb;
    const redFav = simulateMatch(g, champions, {
      rng: createRng(7),
      scoreBias: -30,
      forecastSamples: 200,
    }).blueProb;
    expect(blueFav).toBeGreaterThan(0.5);
    expect(blueFav).toBeLessThan(1);
    expect(redFav).toBeLessThan(0.5);
    expect(redFav).toBeGreaterThan(0);
  });

  it("defaults to the analytic model (forecastSamples = 0)", () => {
    // With no samples the analytic and a 0-sample call agree exactly.
    const a = simulateMatch(g, champions, { rng: createRng(9) }).blueProb;
    const b = simulateMatch(g, champions, {
      rng: createRng(9),
      forecastSamples: 0,
    }).blueProb;
    expect(a).toBe(b);
  });
});
