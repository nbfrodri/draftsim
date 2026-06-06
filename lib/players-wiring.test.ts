import { describe, it, expect } from "vitest";
import { createSeries } from "./series";
import {
  decodeTournament,
  encodeTournament,
  teamStarRating,
  type TournamentState,
  type TournamentTeam,
} from "./tournament";
import { LANE_ORDER, rosterFromStar } from "./players";

// Minimal valid tournament wrapper around a set of teams. decodeTournament
// accepts raw JSON when there's no TOUR1: prefix, so tests pass a plain object.
function tournamentWith(teams: Partial<TournamentTeam>[]): TournamentState {
  return {
    id: "t-test",
    name: "Test Cup",
    format: "single-elim",
    status: "in-progress",
    teams: teams as TournamentTeam[],
    matches: [],
  } as TournamentState;
}

const baseSeriesParams = {
  format: "bo1" as const,
  fearless: false,
  timerEnabled: false,
  blueTeam: "Blue",
  redTeam: "Red",
  mode: "aivai" as const,
  aiSide: null,
  aiDifficulty: "normal" as const,
};

// ── teamStarRating now derives from the roster ───────────────────────────────

describe("teamStarRating", () => {
  it("derives from the roster when a team has players", () => {
    const team: TournamentTeam = {
      id: "a",
      name: "A",
      seed: 1,
      starRating: 3, // stale stored value — roster wins
      players: rosterFromStar(5), // all S → derived 5
    };
    expect(teamStarRating(team)).toBe(5);
  });

  it("falls back to the stored starRating for legacy teams (no roster)", () => {
    const team: TournamentTeam = { id: "a", name: "A", seed: 1, starRating: 4 };
    expect(teamStarRating(team)).toBe(4);
  });

  it("defaults to 3 when neither roster nor rating is present", () => {
    expect(teamStarRating({ id: "a", name: "A", seed: 1 })).toBe(3);
  });
});

// ── decodeTournament fills / normalizes rosters ──────────────────────────────

describe("decodeTournament roster handling", () => {
  it("synthesizes a roster matching starRating for legacy teams", async () => {
    const json = JSON.stringify(
      tournamentWith([{ id: "a", name: "A", seed: 1, starRating: 4 }]),
    );
    const { tournament, error } = await decodeTournament(json);
    expect(error).toBeNull();
    const team = tournament!.teams[0];
    expect(team.players).toHaveLength(5);
    expect(team.players!.map((p) => p.lane)).toEqual([...LANE_ORDER]);
    // derived star round-trips the legacy rating
    expect(teamStarRating(team)).toBe(4);
  });

  it("normalizes a provided roster (caps pools, drops overlaps)", async () => {
    const dirty: TournamentTeam = {
      id: "a",
      name: "A",
      seed: 1,
      starRating: 3,
      players: [
        {
          lane: "top",
          tier: "S",
          goodChamps: [1, 1, 2, 3, 4], // dupes + over cap
          badChamps: [1, 9], // 1 overlaps good
        },
      ] as TournamentTeam["players"],
    };
    const { tournament } = await decodeTournament(
      JSON.stringify(tournamentWith([dirty])),
    );
    const top = tournament!.teams[0].players!.find((p) => p.lane === "top")!;
    expect(top.goodChamps.length).toBeLessThanOrEqual(3);
    expect(top.badChamps.some((id) => top.goodChamps.includes(id))).toBe(false);
    // missing lanes were filled to a full 5-player roster
    expect(tournament!.teams[0].players).toHaveLength(5);
  });

  it("round-trips rosters through TOUR1 encode/decode", async () => {
    const tour = tournamentWith([
      { id: "a", name: "A", seed: 1, starRating: 5, players: rosterFromStar(5) },
    ]);
    const code = await encodeTournament(tour);
    expect(code.startsWith("TOUR1:")).toBe(true);
    const { tournament, error } = await decodeTournament(code);
    expect(error).toBeNull();
    expect(tournament!.teams[0].players).toHaveLength(5);
    expect(teamStarRating(tournament!.teams[0])).toBe(5);
  });
});

// ── createSeries derives star from rosters ───────────────────────────────────

describe("createSeries roster wiring", () => {
  it("derives star from rosters when no explicit rating is given", () => {
    const series = createSeries({
      ...baseSeriesParams,
      bluePlayers: rosterFromStar(5),
      redPlayers: rosterFromStar(1),
    });
    expect(series.blueStarRating).toBe(5);
    expect(series.redStarRating).toBe(1);
    expect(series.bluePlayers).toHaveLength(5);
  });

  it("lets an explicit star rating win over the roster", () => {
    const series = createSeries({
      ...baseSeriesParams,
      blueStarRating: 2,
      bluePlayers: rosterFromStar(5),
    });
    expect(series.blueStarRating).toBe(2);
  });

  it("leaves star undefined with no roster and no rating (legacy single series)", () => {
    const series = createSeries(baseSeriesParams);
    expect(series.blueStarRating).toBeUndefined();
    expect(series.redStarRating).toBeUndefined();
  });
});
