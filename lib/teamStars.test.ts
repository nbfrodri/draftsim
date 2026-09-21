import { decodeTournament, encodeTournament } from "./tournamentShare";
import { describe, expect, it } from "vitest";
import { normalizeTeamStars } from "./teamStars";
import { deriveStar, rosterFromStar } from "./players";
import { teamStarRating, createTournament, tournamentSeriesContext } from "./tournament";
import type { TournamentTeam } from "./tournament";
import { createSeries, starRatingBias, recordWinner, applySideChoice, startNextGame } from "./series";

describe("half-star strength contract", () => {
  it("normalizes boundaries and invalid data without NaN", () => {
    expect([undefined, null, NaN, Infinity].map(normalizeTeamStars)).toEqual([3, 3, 3, 3]);
    expect([-100, 1.24, 1.25, 4.4, 4.6, 100].map(normalizeTeamStars)).toEqual([1, 1, 1.5, 4.5, 4.5, 5]);
  });
  it("reconstructs every legacy or fractional target and survives JSON round trips", () => {
    for (let rating = 1; rating <= 5; rating += 0.5) {
      const team = { id: "test", name: "Test", starRating: rating } as TournamentTeam;
      expect(teamStarRating(JSON.parse(JSON.stringify(team)))).toBe(rating);
      expect(deriveStar(rosterFromStar(rating))).toBe(rating);
      expect(teamStarRating({ ...team, starRating: 1, players: rosterFromStar(rating) })).toBe(rating);
    }
    expect(deriveStar([{ tier: "S+" }, { tier: "S+" }])).toBe(5);
  });
  it("uses intermediate advantages in all variance presets without changing coefficients", () => {
    for (const variancePreset of [undefined, "balanced", "chalky", "chaotic"] as const) {
      const series = createSeries({ format: "bo3", fearless: false, timerEnabled: false, mode: "aivai", aiSide: null, aiDifficulty: "normal", blueTeam: "Blue", redTeam: "Red", blueStarRating: 4, redStarRating: 4, variancePreset });
      const equal = starRatingBias(series);
      const half = starRatingBias({ ...series, blueStarRating: 4.5 });
      const full = starRatingBias({ ...series, blueStarRating: 5 });
      expect(half).toBeGreaterThan(equal);
      expect(half - equal).toBeCloseTo((full - equal) / 2);
      expect(starRatingBias({ ...series, redStarRating: 4.5 })).toBeCloseTo(-half);
    }
  });
});

it("fractional strengths remain attached to their team across manual and automatic side swaps", () => {
  const initial = createSeries({ format: "bo3", fearless: false, timerEnabled: false, mode: "aivai", aiSide: null, aiDifficulty: "normal", blueTeam: "Blue", redTeam: "Red", blueStarRating: 4.5, redStarRating: 2.5, sideRule: "loser-picks" });
  const played = recordWinner(initial, "blue");
  for (const next of [applySideChoice(played, "blue"), startNextGame(played, "Red", "Blue")]) {
    expect(next.blueStarRating).toBe(2.5);
    expect(next.redStarRating).toBe(4.5);
    expect(starRatingBias(next)).toBeLessThan(0);
  }
});

it("share import reconstructs half-star legacy rosters and preserves a played series", async () => {
  const tournament = createTournament({ name: "Half Cup", format: "single-elim",
    teams: [{ id: "one", name: "First", seed: 1, starRating: 4.5 }, { id: "two", name: "Second", seed: 2, starRating: 2.5 }],
    defaults: { format: "bo1", fearless: false, mode: "aivai", aiSide: null, aiDifficulty: "normal", timerEnabled: false },
  });
  const match = tournament.matches[0];
  const context = tournamentSeriesContext(tournament, match.id)!;
  expect([context.blueStarRating, context.redStarRating].sort()).toEqual([2.5, 4.5]);
  match.series = recordWinner(createSeries({ ...tournament.defaults, blueTeam: "First", redTeam: "Second", blueStarRating: 4.5, redStarRating: 2.5 }), "blue");
  match.series.games[0].status = "complete";
  const result = await decodeTournament(await encodeTournament(tournament));
  expect(result.error).toBeNull();
  expect(result.tournament!.teams.map(teamStarRating)).toEqual([4.5, 2.5]);
  expect(result.tournament!.matches[0].series).toEqual(match.series);
});

it("final underdog protection uses the actual gap rather than rounding 2.5 up to 3", () => {
  const base = createSeries({ format: "bo1", fearless: false, timerEnabled: false, mode: "aivai", aiSide: null, aiDifficulty: "normal", blueTeam: "Blue", redTeam: "Red", blueStarRating: 4.5, redStarRating: 2, tournamentRound: "final" });
  expect(starRatingBias(base)).toBe(22.5);
  expect(starRatingBias({ ...base, blueStarRating: 5 })).toBeCloseTo(27 * 0.65 - 1.5);
});
