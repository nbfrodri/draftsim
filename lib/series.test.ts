import { describe, expect, it } from "vitest";
import { createRng } from "./rng";
import {
  applySideChoice,
  chooseSideAI,
  createSeries,
  currentGame,
  effectiveSideRule,
  fearlessLockedSet,
  isSeriesDecided,
  nextGameSides,
  recordWinner,
  seriesScore,
  startNextGame,
  starRatingBias,
  winsByTeamName,
  type SideRule,
} from "./series";
import type { GameDraft, Lane, Player, Roster, SeriesState, Side } from "./types";

// ─── helpers ────────────────────────────────────────────────────────────────

function makeSeries(overrides?: {
  format?: "bo1" | "bo3" | "bo5";
  fearless?: boolean;
  sideRule?: SideRule;
  blueStarRating?: number;
  redStarRating?: number;
}): SeriesState {
  return createSeries({
    format: overrides?.format ?? "bo3",
    fearless: overrides?.fearless ?? false,
    timerEnabled: false,
    blueTeam: "Alpha",
    redTeam: "Beta",
    mode: "aivai",
    aiSide: null,
    aiDifficulty: "normal",
    blueStarRating: overrides?.blueStarRating,
    redStarRating: overrides?.redStarRating,
    sideRule: overrides?.sideRule,
  });
}

// Write picks onto the current (last) game — immutable update, mirroring how
// the engine fills pick slots during a draft.
function withPicks(
  series: SeriesState,
  bluePicks: number[],
  redPicks: number[],
): SeriesState {
  const games = [...series.games];
  const last = games[games.length - 1];
  const padded = (ids: number[]): (number | null)[] => [
    ...ids,
    ...Array(5 - ids.length).fill(null),
  ];
  games[games.length - 1] = {
    ...last,
    bluePicks: padded(bluePicks),
    redPicks: padded(redPicks),
  } satisfies GameDraft;
  return { ...series, games };
}

const LANES: Lane[] = ["top", "jungle", "middle", "bottom", "support"];

function makeRoster(goodChampsPerPlayer: number[][]): Roster {
  return LANES.map(
    (lane, i): Player => ({
      lane,
      tier: "A",
      goodChamps: goodChampsPerPlayer[i] ?? [],
      badChamps: [],
    }),
  );
}

// The store's historical auto-advance formula (pre-feature behavior),
// verbatim: swap sides iff the previous game's winner was blue.
function legacyStoreSides(series: SeriesState): {
  blueTeam: string;
  redTeam: string;
} {
  const lastGame = series.games[series.games.length - 1];
  const swap = lastGame?.winner === "blue";
  return {
    blueTeam: swap ? series.redTeam : series.blueTeam,
    redTeam: swap ? series.blueTeam : series.redTeam,
  };
}

// ─── default rule: reproduces pre-change behavior ───────────────────────────

describe("default side rule (loser-blue)", () => {
  it("is the effective rule when sideRule is unset", () => {
    expect(effectiveSideRule(makeSeries())).toBe("loser-blue");
  });

  it("does not add sideRule/sideChooser fields to default series state", () => {
    const series = makeSeries();
    expect("sideRule" in series).toBe(false);
    expect("sideChooser" in series).toBe(false);
    const after = recordWinner(series, "blue");
    expect("sideChooser" in after).toBe(false);
    const next = startNextGame(after, after.redTeam, after.blueTeam);
    expect("sideChooser" in next).toBe(false);
  });

  it("matches the store's historical auto-swap for both winners (Bo3)", () => {
    for (const winner of ["blue", "red"] as Side[]) {
      const after = recordWinner(makeSeries(), winner);
      expect(nextGameSides(after)).toEqual(legacyStoreSides(after));
    }
  });

  it("puts the loser on blue side every game of a Bo5", () => {
    let series = makeSeries({ format: "bo5" });
    // Alternate winners so the series runs long; loser must land on blue.
    const winners: Side[] = ["blue", "red", "blue", "red"];
    for (const winner of winners) {
      const loser =
        winner === "blue"
          ? currentGame(series).redTeam
          : currentGame(series).blueTeam;
      series = recordWinner(series, winner);
      const sides = nextGameSides(series);
      expect(sides).not.toBeNull();
      expect(sides!.blueTeam).toBe(loser);
      series = startNextGame(series, sides!.blueTeam, sides!.redTeam);
    }
    expect(series.games).toHaveLength(5);
  });

  it("returns null while a game is still in progress", () => {
    expect(nextGameSides(makeSeries())).toBeNull();
  });
});

// ─── fixed and alternate rules ──────────────────────────────────────────────

describe("fixed side rule", () => {
  it("keeps the same assignment regardless of who wins", () => {
    for (const winner of ["blue", "red"] as Side[]) {
      const after = recordWinner(makeSeries({ sideRule: "fixed" }), winner);
      expect(nextGameSides(after)).toEqual({
        blueTeam: "Alpha",
        redTeam: "Beta",
      });
    }
  });

  it("never sets a sideChooser", () => {
    const after = recordWinner(makeSeries({ sideRule: "fixed" }), "blue");
    expect(after.sideChooser ?? null).toBeNull();
  });
});

describe("alternate side rule", () => {
  it("swaps every game regardless of results (Bo5)", () => {
    let series = makeSeries({ format: "bo5", sideRule: "alternate" });
    const expected = [
      { blueTeam: "Beta", redTeam: "Alpha" }, // game 2
      { blueTeam: "Alpha", redTeam: "Beta" }, // game 3
      { blueTeam: "Beta", redTeam: "Alpha" }, // game 4
    ];
    // Blue side wins every game; with alternation that's Alpha, Beta, Alpha
    // by team — 2-1, so the series is still live after each game.
    const winners: Side[] = ["blue", "blue", "blue"];
    for (let i = 0; i < winners.length; i++) {
      series = recordWinner(series, winners[i]);
      const sides = nextGameSides(series);
      expect(sides).toEqual(expected[i]);
      series = startNextGame(series, sides!.blueTeam, sides!.redTeam);
    }
  });
});

// ─── loser-picks rule ───────────────────────────────────────────────────────

describe("loser-picks side rule", () => {
  it("records the losing TEAM as sideChooser after each game", () => {
    const series = makeSeries({ sideRule: "loser-picks" });
    expect(recordWinner(series, "blue").sideChooser).toBe("Beta");
    expect(recordWinner(series, "red").sideChooser).toBe("Alpha");
  });

  it("nextGameSides defers to the pending choice (returns null)", () => {
    const after = recordWinner(makeSeries({ sideRule: "loser-picks" }), "blue");
    expect(nextGameSides(after)).toBeNull();
  });

  it("applySideChoice puts the chooser on the requested side", () => {
    const after = recordWinner(makeSeries({ sideRule: "loser-picks" }), "blue");
    // Loser Beta picks blue.
    const onBlue = applySideChoice(after, "blue");
    expect(onBlue.blueTeam).toBe("Beta");
    expect(onBlue.redTeam).toBe("Alpha");
    expect(onBlue.status).toBe("drafting");
    expect(onBlue.sideChooser).toBeNull();
    expect(currentGame(onBlue).gameNumber).toBe(2);
    expect(currentGame(onBlue).blueTeam).toBe("Beta");
    // Loser Beta picks red (keeps its side).
    const onRed = applySideChoice(after, "red");
    expect(onRed.blueTeam).toBe("Alpha");
    expect(onRed.redTeam).toBe("Beta");
    expect(onRed.sideChooser).toBeNull();
  });

  it("is a no-op without a pending chooser or outside between-games", () => {
    const drafting = makeSeries({ sideRule: "loser-picks" });
    expect(applySideChoice(drafting, "blue")).toBe(drafting);
    // between-games but chooser already consumed
    const after = recordWinner(drafting, "blue");
    const advanced = applySideChoice(after, "blue");
    expect(applySideChoice(advanced, "red")).toBe(advanced);
  });

  it("does not leave a chooser on a decided series", () => {
    let series = makeSeries({ format: "bo3", sideRule: "loser-picks" });
    series = recordWinner(series, "blue"); // Alpha 1-0, Beta chooses
    series = applySideChoice(series, "red"); // Beta stays red
    series = recordWinner(series, "blue"); // Alpha clinches 2-0
    expect(series.status).toBe("complete");
    expect(series.sideChooser ?? null).toBeNull();
  });

  it("loser gets the choice every game of a full Bo5", () => {
    let series = makeSeries({ format: "bo5", sideRule: "loser-picks" });
    // Each game's loser takes blue for the next. By team this sequence is
    // Alpha, Alpha, Beta, Beta — 2-2 going into game 5.
    const winners: Side[] = ["blue", "red", "blue", "red"];
    for (const winner of winners) {
      const loser =
        winner === "blue"
          ? currentGame(series).redTeam
          : currentGame(series).blueTeam;
      series = recordWinner(series, winner);
      expect(series.status).toBe("between-games");
      expect(series.sideChooser).toBe(loser);
      series = applySideChoice(series, "blue");
      expect(series.blueTeam).toBe(loser);
    }
    series = recordWinner(series, "blue");
    expect(series.status).toBe("complete");
    expect(series.games).toHaveLength(5);
  });
});

// ─── team-vs-side bookkeeping across swaps ──────────────────────────────────

describe("team-vs-side bookkeeping after a side swap", () => {
  it("win tallies follow teams, not sides", () => {
    let series = makeSeries({ format: "bo5", sideRule: "loser-picks" });
    // G1: Alpha (blue) wins. Beta chooses blue for G2.
    series = recordWinner(series, "blue");
    series = applySideChoice(series, "blue");
    expect(series.blueTeam).toBe("Beta");
    // G2: blue side wins again — but that's Beta now.
    series = recordWinner(series, "blue");
    const wins = winsByTeamName(series);
    expect(wins.get("Alpha")).toBe(1);
    expect(wins.get("Beta")).toBe(1);
    // seriesScore is keyed by the CURRENT side assignment.
    expect(seriesScore(series)).toEqual({ blue: 1, red: 1 });
    expect(isSeriesDecided(series)).toBeNull();
  });

  it("series is decided by team identity even when the clincher swapped sides", () => {
    let series = makeSeries({ format: "bo3", sideRule: "loser-picks" });
    series = recordWinner(series, "blue"); // Alpha 1-0
    series = applySideChoice(series, "blue"); // Beta takes blue; Alpha now red
    series = recordWinner(series, "red"); // Alpha (red side) clinches 2-0
    expect(series.status).toBe("complete");
    expect(series.winner).toBe("red"); // the side Alpha currently occupies
    expect(winsByTeamName(series).get("Alpha")).toBe(2);
  });

  it("fearless locks follow picked champions across a swap", () => {
    let series = makeSeries({
      format: "bo3",
      fearless: true,
      sideRule: "loser-picks",
    });
    // G1: Alpha (blue) picks 1-5, Beta (red) picks 6-10. Alpha wins.
    series = withPicks(series, [1, 2, 3, 4, 5], [6, 7, 8, 9, 10]);
    series = recordWinner(series, "blue");
    series = applySideChoice(series, "blue"); // Beta now blue
    // All 10 G1 picks are locked for G2 even though sides swapped.
    const locked = fearlessLockedSet(series);
    for (let id = 1; id <= 10; id++) expect(locked.has(id)).toBe(true);
    // G2: Alpha — now on RED — wins again and clinches with 2 team wins,
    // one earned from each side.
    series = withPicks(series, [11, 12, 13, 14, 15], [16, 17, 18, 19, 20]);
    series = recordWinner(series, "red");
    expect(series.status).toBe("complete");
    expect(winsByTeamName(series).get("Alpha")).toBe(2);
  });

  it("fearless locks accumulate per game with correct team attribution", () => {
    let series = makeSeries({
      format: "bo5",
      fearless: true,
      sideRule: "loser-picks",
    });
    series = withPicks(series, [1, 2, 3, 4, 5], [6, 7, 8, 9, 10]);
    series = recordWinner(series, "blue"); // Alpha wins G1
    series = applySideChoice(series, "blue"); // Beta on blue for G2
    series = withPicks(series, [11, 12, 13, 14, 15], [16, 17, 18, 19, 20]);
    series = recordWinner(series, "blue"); // Beta wins G2 (on blue)
    series = applySideChoice(series, "red"); // loser Alpha chooses to stay red
    expect(series.blueTeam).toBe("Beta");
    expect(series.redTeam).toBe("Alpha");
    // All 20 picked champions from G1+G2 are locked for G3, regardless of
    // which side picked them.
    const locked = fearlessLockedSet(series);
    expect(locked.size).toBe(20);
    for (let id = 1; id <= 20; id++) expect(locked.has(id)).toBe(true);
    // Wins still attributed by team: Alpha 1 (G1 blue), Beta 1 (G2 blue).
    const wins = winsByTeamName(series);
    expect(wins.get("Alpha")).toBe(1);
    expect(wins.get("Beta")).toBe(1);
  });

  it("star ratings follow teams through applySideChoice", () => {
    let series = makeSeries({
      sideRule: "loser-picks",
      blueStarRating: 5,
      redStarRating: 2,
    });
    series = recordWinner(series, "blue");
    series = applySideChoice(series, "blue"); // Beta (2★) moves to blue
    expect(series.blueTeam).toBe("Beta");
    expect(series.blueStarRating).toBe(2);
    expect(series.redStarRating).toBe(5);
  });
});

// ─── chooseSideAI heuristic ─────────────────────────────────────────────────

describe("chooseSideAI", () => {
  function blueRate(input: Parameters<typeof chooseSideAI>[0], seed: number) {
    const rng = createRng(seed);
    let blue = 0;
    const n = 2000;
    for (let i = 0; i < n; i++) if (chooseSideAI(input, rng) === "blue") blue++;
    return blue / n;
  }

  it("is deterministic given the rng", () => {
    expect(chooseSideAI({}, () => 0)).toBe("blue");
    expect(chooseSideAI({}, () => 0.999)).toBe("red");
  });

  it("leans blue with no signal (~85%)", () => {
    const rate = blueRate({}, 42);
    expect(rate).toBeGreaterThan(0.8);
    expect(rate).toBeLessThan(0.9);
  });

  it("prefers red for a maximally flexible roster (wide pools)", () => {
    // 15 distinct goodChamps across 5 players ⇒ full counter-pick signal.
    const players = makeRoster([
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
      [10, 11, 12],
      [13, 14, 15],
    ]);
    const rate = blueRate({ players }, 42);
    expect(rate).toBeLessThan(0.5); // red is now the majority choice
    expect(rate).toBeGreaterThan(0.25);
  });

  it("a narrow one-trick roster stays blue-leaning", () => {
    // Heavy pool overlap: only 3 distinct champions known team-wide.
    const players = makeRoster([
      [1, 2, 3],
      [1, 2, 3],
      [1, 2, 3],
      [1, 2, 3],
      [1, 2, 3],
    ]);
    const rate = blueRate({ players }, 7);
    expect(rate).toBeGreaterThan(0.7);
  });

  it("diverse multi-game pick history pulls toward red; one game does not", () => {
    const twoGamesAllDistinct = blueRate(
      { pickHistory: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
      11,
    );
    expect(twoGamesAllDistinct).toBeLessThan(0.5);
    const oneGame = blueRate({ pickHistory: [1, 2, 3, 4, 5] }, 11);
    expect(oneGame).toBeGreaterThan(0.5); // depth-weighted: still blue-leaning
  });
});

// ─── starRatingBias — signed streaks (momentum AND slumps) ──────────────────

describe("starRatingBias — streaks", () => {
  function seriesWithStreaks(blue: number, red: number): SeriesState {
    return createSeries({
      format: "bo3",
      fearless: false,
      timerEnabled: false,
      blueTeam: "Alpha",
      redTeam: "Beta",
      mode: "aivai",
      aiSide: null,
      aiDifficulty: "normal",
      blueStarRating: 3,
      redStarRating: 3,
      blueWinStreak: blue,
      redWinStreak: red,
    });
  }

  it("win streaks add bias, equal stars", () => {
    expect(starRatingBias(seriesWithStreaks(2, 0))).toBeCloseTo(3.0);
  });

  it("LOSS streaks subtract bias symmetrically", () => {
    expect(starRatingBias(seriesWithStreaks(-2, 0))).toBeCloseTo(-3.0);
    // A slumping blue team vs a rolling red team compounds both ways.
    expect(starRatingBias(seriesWithStreaks(-2, 2))).toBeCloseTo(-6.0);
  });

  it("caps streak magnitude in both directions", () => {
    expect(starRatingBias(seriesWithStreaks(10, 0))).toBeCloseTo(6.0);
    expect(starRatingBias(seriesWithStreaks(-10, 0))).toBeCloseTo(-6.0);
  });

  it("no streak data → zero streak bias", () => {
    expect(starRatingBias(seriesWithStreaks(0, 0))).toBeCloseTo(0);
  });
});
