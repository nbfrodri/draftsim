import { describe, expect, it } from "vitest";
import { TIER_ORDER, type MetaOverride } from "./championMeta";
import {
  EMERGING_CHANCE,
  HIGH_PRESENCE_THRESHOLD,
  MAX_EMERGING_PER_EVENT,
  MIN_GAMES_FOR_SHIFT,
  computeChampionPresence,
  detectCompletedRound,
  evolveMetaForTournament,
  listCompletedRounds,
  type MetaChangeReason,
} from "./metaEvolution";
import { LANE_ORDER } from "./players";
import { createRng } from "./rng";
import {
  createTournament,
  type TournamentDefaults,
  type TournamentState,
  type TournamentTeam,
} from "./tournament";
import type {
  Champion,
  GameDraft,
  SeriesState,
  Side,
} from "./types";

// ─── Fixtures ───────────────────────────────────────────────────────────────

const DEFAULTS: TournamentDefaults = {
  format: "bo3",
  fearless: false,
  mode: "aivai",
  aiSide: null,
  aiDifficulty: "normal",
  timerEnabled: false,
};

function makeTeam(seed: number): TournamentTeam {
  return { id: `team-${seed}`, name: `Team ${seed}`, seed, starRating: 3 };
}

function makeTeams(count: number): TournamentTeam[] {
  return Array.from({ length: count }, (_, i) => makeTeam(i + 1));
}

function champ(id: number, alias: string): Champion {
  return { id, name: alias, alias, roles: [], iconUrl: "", lanes: ["middle"] };
}

// Champion cast. X dominates, Y flops, W is the small-sample champ,
// Z/S2/S3 are untouched sleepers, ids 1..29 are tierless fillers.
const X = champ(101, "EvoX");
const Y = champ(102, "EvoY");
const W = champ(104, "EvoW");
const Z = champ(103, "EvoZ");
const S2 = champ(105, "EvoS2");
const S3 = champ(106, "EvoS3");
const FILLERS = Array.from({ length: 29 }, (_, i) => champ(i + 1, `Filler${i + 1}`));
const CHAMPIONS: Champion[] = [X, Y, W, Z, S2, S3, ...FILLERS];

// Baseline override the tournaments play on. Fake aliases never hit
// CHAMPION_META, so this override is the single source of tier truth.
function baseOverride(): MetaOverride {
  return {
    EvoX: { middle: "B", top: "C" },
    EvoY: { top: "A" },
    EvoW: { jungle: "B" },
    EvoZ: { support: "B" },
    EvoS2: { bottom: "B" },
    EvoS3: { top: "C" },
  };
}

// A completed game. Picks are positional (index = LANE_ORDER lane) and
// roles are filled accordingly, mirroring a finished simulated game.
function game(
  n: number,
  bluePicks: number[],
  redPicks: number[],
  winner: Side,
): GameDraft {
  return {
    id: `g-${n}-${bluePicks.join(".")}`,
    gameNumber: n,
    blueTeam: "Blue",
    redTeam: "Red",
    blueBans: [],
    redBans: [],
    bluePicks,
    redPicks,
    blueRoles: [...LANE_ORDER],
    redRoles: [...LANE_ORDER],
    actionIndex: 20,
    status: "complete",
    winner,
  };
}

function seriesWith(games: GameDraft[]): SeriesState {
  return {
    id: `s-${games[0]?.id ?? "empty"}`,
    format: "bo3",
    fearless: false,
    timerEnabled: false,
    blueTeam: "Blue",
    redTeam: "Red",
    games,
    status: "complete",
    winner: "blue",
    mode: "aivai",
    aiSide: null,
    aiDifficulty: "normal",
  };
}

// Mark a match completed with the given series, blue team winning 2-0.
function completeMatch(
  t: TournamentState,
  matchId: string,
  games: GameDraft[],
): TournamentState {
  return {
    ...t,
    matches: t.matches.map((m) =>
      m.id === matchId
        ? {
            ...m,
            series: seriesWith(games),
            winner: { teamId: m.blueTeamId!, blueWins: 2, redWins: 0 },
          }
        : m,
    ),
  };
}

function makeRoundRobin(opts: {
  liveMeta?: boolean;
  metaEnabled?: boolean;
  override?: MetaOverride | null;
}): TournamentState {
  return createTournament({
    name: "Evo Test",
    format: "round-robin",
    teams: makeTeams(4),
    defaults: DEFAULTS,
    liveMeta: opts.liveMeta,
    metaSnapshot: {
      metaOverride: opts.override === undefined ? baseOverride() : opts.override,
      metaEnabled: opts.metaEnabled ?? true,
    },
  });
}

// Complete matchday `round` (both matches) with 2 games each:
//   blue side: [filler, W?, X, filler, filler]  — wins both games
//   red side:  [Y, filler, filler, filler, filler] — loses both
// `withW` puts W (the small-sample champ) in the FIRST match only, so
// W ends the matchday with exactly 2 games (< MIN_GAMES_FOR_SHIFT).
function completeMatchday(
  t: TournamentState,
  round: number,
  withW: boolean,
): TournamentState {
  let out = t;
  const matchday = t.matches.filter((m) => m.round === round);
  let fillerBase = 1;
  let g = 1;
  for (let mi = 0; mi < matchday.length; mi++) {
    const m = matchday[mi];
    const wHere = withW && mi === 0;
    const f = () => FILLERS[(fillerBase++ - 1) % FILLERS.length].id;
    const blue = () => [f(), wHere ? W.id : f(), X.id, f(), f()];
    const red = () => [Y.id, f(), f(), f(), f()];
    out = completeMatch(out, m.id, [
      game(g++, blue(), red(), "blue"),
      game(g++, blue(), red(), "blue"),
    ]);
  }
  return out;
}

// rng that never fires the emerging lottery — keeps evidence tests
// focused on the deterministic rules.
const NO_EMERGE = () => 0.999;
// rng that always fires it.
const ALWAYS_EMERGE = () => 0;

// ─── Round detection ─────────────────────────────────────────────────────────

describe("listCompletedRounds / detectCompletedRound", () => {
  it("reports nothing for a fresh tournament", () => {
    const t = makeRoundRobin({ liveMeta: true });
    expect(listCompletedRounds(t)).toEqual([]);
    expect(detectCompletedRound(t)).toBeNull();
  });

  it("detects a completed round-robin matchday", () => {
    const t = completeMatchday(makeRoundRobin({ liveMeta: true }), 1, true);
    expect(listCompletedRounds(t)).toEqual([
      { key: "main:1", label: "Matchday 1" },
    ]);
    expect(detectCompletedRound(t)).toEqual({
      key: "main:1",
      label: "Matchday 1",
    });
  });

  it("does not report a partially-completed matchday", () => {
    const t = makeRoundRobin({ liveMeta: true });
    const first = t.matches.find((m) => m.round === 1)!;
    const partial = completeMatch(t, first.id, [
      game(1, [1, 2, 101, 3, 4], [102, 5, 6, 7, 8], "blue"),
    ]);
    expect(listCompletedRounds(partial)).toEqual([]);
  });

  it("detects completed single-elim rounds with wb keys", () => {
    let t = createTournament({
      name: "SE",
      format: "single-elim",
      teams: makeTeams(4),
      defaults: DEFAULTS,
      liveMeta: true,
      metaSnapshot: { metaOverride: baseOverride(), metaEnabled: true },
    });
    for (const m of t.matches.filter((x) => x.round === 1)) {
      t = completeMatch(t, m.id, [
        game(1, [1, 2, 101, 3, 4], [102, 5, 6, 7, 8], "blue"),
      ]);
    }
    expect(listCompletedRounds(t)).toEqual([
      { key: "wb:1", label: "Round 1" },
    ]);
  });

  it("skips rounds already marked as evolved", () => {
    const t = completeMatchday(makeRoundRobin({ liveMeta: true }), 1, true);
    const marked = { ...t, metaEvolvedRounds: ["main:1"] };
    expect(detectCompletedRound(marked)).toBeNull();
  });
});

// ─── Evidence aggregation ────────────────────────────────────────────────────

describe("computeChampionPresence", () => {
  it("aggregates games, wins, lanes and presence from completed games", () => {
    const t = completeMatchday(makeRoundRobin({ liveMeta: true }), 1, true);
    const { totalGames, stats } = computeChampionPresence(t);
    expect(totalGames).toBe(4);
    const x = stats.get(X.id)!;
    expect(x.games).toBe(4);
    expect(x.wins).toBe(4);
    expect(x.presence).toBe(1);
    expect(x.laneGames.middle).toBe(4);
    const y = stats.get(Y.id)!;
    expect(y.games).toBe(4);
    expect(y.wins).toBe(0);
    expect(y.laneGames.top).toBe(4);
    const w = stats.get(W.id)!;
    expect(w.games).toBe(2);
  });
});

// ─── Evolution rules ─────────────────────────────────────────────────────────

describe("evolveMetaForTournament", () => {
  it("raises a dominant champion exactly one tier in its played lane", () => {
    const t = completeMatchday(makeRoundRobin({ liveMeta: true }), 1, true);
    const { tournament, changes } = evolveMetaForTournament(
      t,
      CHAMPIONS,
      NO_EMERGE,
    );
    const xChange = changes.find((c) => c.championId === X.id)!;
    expect(xChange).toBeDefined();
    expect(xChange.alias).toBe("EvoX");
    expect(xChange.lane).toBe("middle");
    expect(xChange.from).toBe("B");
    expect(xChange.to).toBe("A"); // max +1 step — never jumps to S
    expect(xChange.reason).toBe("dominant");
    expect(xChange.roundLabel).toBe("Matchday 1");
    expect(xChange.games).toBe(4);
    expect(xChange.winRate).toBe(1);
    expect(tournament.metaSnapshot?.metaOverride?.EvoX?.middle).toBe("A");
  });

  it("drops an underperforming champion exactly one tier", () => {
    const t = completeMatchday(makeRoundRobin({ liveMeta: true }), 1, true);
    const { tournament, changes } = evolveMetaForTournament(
      t,
      CHAMPIONS,
      NO_EMERGE,
    );
    const yChange = changes.find((c) => c.championId === Y.id)!;
    expect(yChange).toBeDefined();
    expect(yChange.lane).toBe("top");
    expect(yChange.from).toBe("A");
    expect(yChange.to).toBe("B");
    expect(yChange.reason).toBe("underperforming");
    expect(tournament.metaSnapshot?.metaOverride?.EvoY?.top).toBe("B");
  });

  it("preserves the champion's other-lane tiers when shifting one lane", () => {
    const t = completeMatchday(makeRoundRobin({ liveMeta: true }), 1, true);
    const { tournament } = evolveMetaForTournament(t, CHAMPIONS, NO_EMERGE);
    // EvoX had { middle: B, top: C } — top must survive the middle bump
    // (override entries are authoritative, partial writes would drop it).
    expect(tournament.metaSnapshot?.metaOverride?.EvoX).toEqual({
      middle: "A",
      top: "C",
    });
  });

  it("enforces the minimum sample guard", () => {
    const t = completeMatchday(makeRoundRobin({ liveMeta: true }), 1, true);
    const { stats } = computeChampionPresence(t);
    expect(stats.get(W.id)!.games).toBeLessThan(MIN_GAMES_FOR_SHIFT);
    const { tournament, changes } = evolveMetaForTournament(
      t,
      CHAMPIONS,
      NO_EMERGE,
    );
    expect(changes.find((c) => c.championId === W.id)).toBeUndefined();
    expect(tournament.metaSnapshot?.metaOverride?.EvoW).toEqual({
      jungle: "B",
    });
  });

  it("does not move untouched champions", () => {
    const t = completeMatchday(makeRoundRobin({ liveMeta: true }), 1, true);
    const { tournament, changes } = evolveMetaForTournament(
      t,
      CHAMPIONS,
      NO_EMERGE,
    );
    for (const sleeper of [Z, S2, S3]) {
      expect(changes.find((c) => c.championId === sleeper.id)).toBeUndefined();
    }
    expect(tournament.metaSnapshot?.metaOverride?.EvoZ).toEqual({
      support: "B",
    });
  });

  it("clamps at the top of the ladder (S+ cannot rise)", () => {
    const override = baseOverride();
    override.EvoX = { middle: "S+" };
    const t = completeMatchday(
      makeRoundRobin({ liveMeta: true, override }),
      1,
      true,
    );
    const { tournament, changes } = evolveMetaForTournament(
      t,
      CHAMPIONS,
      NO_EMERGE,
    );
    expect(changes.find((c) => c.championId === X.id)).toBeUndefined();
    expect(tournament.metaSnapshot?.metaOverride?.EvoX?.middle).toBe("S+");
  });

  it("clamps at the bottom of the ladder (D cannot fall)", () => {
    const override = baseOverride();
    override.EvoY = { top: "D" };
    const t = completeMatchday(
      makeRoundRobin({ liveMeta: true, override }),
      1,
      true,
    );
    const { changes } = evolveMetaForTournament(t, CHAMPIONS, NO_EMERGE);
    expect(changes.find((c) => c.championId === Y.id)).toBeUndefined();
  });

  it("marks the round processed and is idempotent on a second call", () => {
    const t = completeMatchday(makeRoundRobin({ liveMeta: true }), 1, true);
    const first = evolveMetaForTournament(t, CHAMPIONS, NO_EMERGE);
    expect(first.tournament.metaEvolvedRounds).toEqual(["main:1"]);
    const second = evolveMetaForTournament(
      first.tournament,
      CHAMPIONS,
      NO_EMERGE,
    );
    expect(second.tournament).toBe(first.tournament); // same reference
    expect(second.changes).toEqual([]);
  });

  it("fires one bounded event per newly-completed round (catch-up)", () => {
    let t = makeRoundRobin({ liveMeta: true });
    t = completeMatchday(t, 1, true);
    t = completeMatchday(t, 2, false);
    const { tournament, changes } = evolveMetaForTournament(
      t,
      CHAMPIONS,
      NO_EMERGE,
    );
    expect(tournament.metaEvolvedRounds).toEqual(["main:1", "main:2"]);
    const xChanges = changes.filter((c) => c.championId === X.id);
    // Two events → two single-step rises: B → A, then A → S.
    expect(xChanges.map((c) => [c.from, c.to])).toEqual([
      ["B", "A"],
      ["A", "S"],
    ]);
    expect(xChanges.map((c) => c.roundLabel)).toEqual([
      "Matchday 1",
      "Matchday 2",
    ]);
    expect(tournament.metaSnapshot?.metaOverride?.EvoX?.middle).toBe("S");
  });

  it("appends well-formed entries to metaEvolutionLog", () => {
    const t = completeMatchday(makeRoundRobin({ liveMeta: true }), 1, true);
    const { tournament, changes } = evolveMetaForTournament(
      t,
      CHAMPIONS,
      NO_EMERGE,
    );
    expect(changes.length).toBeGreaterThan(0);
    expect(tournament.metaEvolutionLog).toEqual(changes);
    const reasons: MetaChangeReason[] = [
      "dominant",
      "underperforming",
      "emerging",
    ];
    for (const c of tournament.metaEvolutionLog!) {
      expect(typeof c.championId).toBe("number");
      expect(typeof c.alias).toBe("string");
      expect(LANE_ORDER).toContain(c.lane);
      expect(TIER_ORDER).toContain(c.from);
      expect(TIER_ORDER).toContain(c.to);
      expect(
        Math.abs(TIER_ORDER.indexOf(c.from) - TIER_ORDER.indexOf(c.to)),
      ).toBe(1); // bounded ±1 per event
      expect(reasons).toContain(c.reason);
      expect(c.roundLabel).toBe("Matchday 1");
      expect(typeof c.games).toBe("number");
      expect(typeof c.presence).toBe("number");
    }
  });

  it("requires high presence before shifting (even with enough games)", () => {
    let t = makeRoundRobin({ liveMeta: true });
    let g = 1;
    const md1 = t.matches.filter((m) => m.round === 1);
    // X plays (and wins) exactly 3 games: both games of match 1 plus
    // game 1 of match 2 — sample is sufficient (≥ MIN_GAMES_FOR_SHIFT).
    t = completeMatch(t, md1[0].id, [
      game(g++, [1, 2, X.id, 3, 4], [5, 6, 7, 8, 9], "blue"),
      game(g++, [1, 2, X.id, 3, 4], [5, 6, 7, 8, 9], "blue"),
    ]);
    t = completeMatch(t, md1[1].id, [
      game(g++, [10, 11, X.id, 12, 13], [14, 15, 16, 17, 18], "blue"),
      game(g++, [10, 11, 19, 12, 13], [14, 15, 16, 17, 18], "blue"),
    ]);
    // Matchdays 2-3 complete without X — dilutes presence to 3/12 = 0.25.
    for (const round of [2, 3]) {
      for (const m of t.matches.filter((x) => x.round === round)) {
        t = completeMatch(t, m.id, [
          game(g++, [20, 21, 22, 23, 24], [25, 26, 27, 28, 29], "blue"),
          game(g++, [20, 21, 22, 23, 24], [25, 26, 27, 28, 29], "blue"),
        ]);
      }
    }
    const { totalGames, stats } = computeChampionPresence(t);
    expect(totalGames).toBe(12);
    const x = stats.get(X.id)!;
    expect(x.games).toBeGreaterThanOrEqual(MIN_GAMES_FOR_SHIFT);
    expect(x.wins).toBe(x.games); // perfect WR — only presence can gate
    expect(x.presence).toBeLessThan(HIGH_PRESENCE_THRESHOLD);
    const { changes } = evolveMetaForTournament(t, CHAMPIONS, NO_EMERGE);
    expect(changes.find((c) => c.championId === X.id)).toBeUndefined();
  });

  it("lets low-presence sleepers emerge, capped per event", () => {
    const t = completeMatchday(makeRoundRobin({ liveMeta: true }), 1, true);
    const { changes } = evolveMetaForTournament(t, CHAMPIONS, ALWAYS_EMERGE);
    const emerging = changes.filter((c) => c.reason === "emerging");
    // Three sleeper candidates (Z, S2, S3) but the cap is 2.
    expect(emerging.length).toBe(MAX_EMERGING_PER_EVENT);
    for (const c of emerging) {
      expect([Z.id, S2.id, S3.id]).toContain(c.championId);
      expect(c.games).toBe(0);
      expect(c.winRate).toBeNull();
      expect(
        TIER_ORDER.indexOf(c.to),
      ).toBe(TIER_ORDER.indexOf(c.from) - 1); // exactly one tier up
    }
  });

  it("never emerges when the rng says no", () => {
    const t = completeMatchday(makeRoundRobin({ liveMeta: true }), 1, true);
    const { changes } = evolveMetaForTournament(t, CHAMPIONS, NO_EMERGE);
    expect(changes.filter((c) => c.reason === "emerging")).toEqual([]);
    expect(EMERGING_CHANCE).toBeLessThan(1);
  });

  it("is deterministic for a given seeded rng", () => {
    const t = completeMatchday(makeRoundRobin({ liveMeta: true }), 1, true);
    const a = evolveMetaForTournament(t, CHAMPIONS, createRng(7));
    const b = evolveMetaForTournament(t, CHAMPIONS, createRng(7));
    expect(JSON.stringify(a.changes)).toBe(JSON.stringify(b.changes));
    expect(JSON.stringify(a.snapshot)).toBe(JSON.stringify(b.snapshot));
  });
});

// ─── Disabled-by-default guarantees ─────────────────────────────────────────

describe("evolveMetaForTournament — disabled by default", () => {
  it("returns the input state untouched when liveMeta is absent", () => {
    const t = completeMatchday(makeRoundRobin({}), 1, true);
    const before = JSON.stringify(t);
    const result = evolveMetaForTournament(t, CHAMPIONS, ALWAYS_EMERGE);
    expect(result.tournament).toBe(t); // exact same reference
    expect(result.changes).toEqual([]);
    expect(result.snapshot).toBe(t.metaSnapshot);
    expect(JSON.stringify(t)).toBe(before); // pure — no mutation
    expect(t.metaEvolutionLog).toBeUndefined();
    expect(t.metaEvolvedRounds).toBeUndefined();
  });

  it("returns the input state untouched when the snapshot has meta disabled", () => {
    const t = completeMatchday(
      makeRoundRobin({ liveMeta: true, metaEnabled: false }),
      1,
      true,
    );
    const result = evolveMetaForTournament(t, CHAMPIONS, ALWAYS_EMERGE);
    expect(result.tournament).toBe(t);
    expect(result.changes).toEqual([]);
  });

  it("does not mutate the input snapshot when evolving", () => {
    const t = completeMatchday(makeRoundRobin({ liveMeta: true }), 1, true);
    const snapshotBefore = JSON.stringify(t.metaSnapshot);
    const { tournament } = evolveMetaForTournament(t, CHAMPIONS, NO_EMERGE);
    expect(JSON.stringify(t.metaSnapshot)).toBe(snapshotBefore);
    expect(tournament).not.toBe(t);
    expect(tournament.metaSnapshot).not.toBe(t.metaSnapshot);
  });
});
