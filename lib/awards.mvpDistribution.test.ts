// MVP lane distribution across simulated tournaments — measures whether
// role-relative scoring keeps jungle/mid from dominating awards.

import { describe, expect, it } from "vitest";
import {
  computeChampionTeamTournamentMvp,
  computeFinalsMvp,
  computeTournamentAwards,
} from "./awards";
import { buildGameRecap, simulateMatch } from "./matchSimulator";
import { makePlayerId, rosterFromStar } from "./players";
import { createRng } from "./rng";
import {
  createSeries,
  recordWinner,
  requiredWins,
  startNextGame,
  starRatingBias,
} from "./series";
import {
  createTournament,
  recordMatchWinner,
  type TournamentDefaults,
  type TournamentState,
  type TournamentTeam,
} from "./tournament";
import type { Champion, GameDraft, Lane, Roster } from "./types";

const LANES: Lane[] = ["top", "jungle", "middle", "bottom", "support"];
const TOURNAMENT_COUNT = 200;
const TEAM_COUNT = 8;

const DEFAULTS: TournamentDefaults = {
  format: "bo3",
  fearless: false,
  mode: "aivai",
  aiSide: null,
  aiDifficulty: "medium",
  timerEnabled: false,
};

// Comp pools — rotate per game for variety while staying fast (no draft AI).
const COMP_POOL = [
  ["Malphite", "Vi", "Ahri", "Jhin", "Nautilus"],
  ["Darius", "Draven", "Elise", "LeeSin", "Renekton"],
  ["Gnar", "Graves", "Azir", "Aphelios", "Thresh"],
  ["Ornn", "JarvanIV", "Orianna", "Varus", "Leona"],
] as const;

let champId = 1;
function buildChampionPool(): Champion[] {
  const champs: Champion[] = [];
  for (const aliases of COMP_POOL) {
    for (let i = 0; i < aliases.length; i++) {
      champs.push({
        id: champId++,
        name: aliases[i],
        alias: aliases[i],
        roles: [],
        iconUrl: "",
        lanes: [LANES[i]],
      });
    }
  }
  return champs;
}

const CHAMPIONS = buildChampionPool();
const compByAlias = new Map(CHAMPIONS.map((c) => [c.alias, c]));

function compChamps(aliases: readonly string[]): Champion[] {
  return aliases.map((a, i) => compByAlias.get(a)! ?? {
    id: champId++,
    name: a,
    alias: a,
    roles: [],
    iconUrl: "",
    lanes: [LANES[i]],
  });
}

function rosterWithIds(seed: number): Roster {
  const rng = createRng(seed);
  return rosterFromStar(3).map((p) => ({
    ...p,
    id: makePlayerId(rng),
    name: `${p.lane}-${seed}`,
  }));
}

function makeTeam(seed: number): TournamentTeam {
  return {
    id: `team-${seed}`,
    name: `Team ${seed}`,
    seed,
    starRating: 3,
    players: rosterWithIds(seed * 97),
  };
}

function filledGame(
  gameNumber: number,
  blueTeam: string,
  redTeam: string,
  compIndex: number,
  compOffset: number,
): GameDraft {
  const blueAliases = COMP_POOL[(compIndex + compOffset) % COMP_POOL.length];
  const redAliases = COMP_POOL[(compIndex + compOffset + 1) % COMP_POOL.length];
  const blue = compChamps(blueAliases);
  const red = compChamps(redAliases);
  return {
    id: `g-${gameNumber}`,
    gameNumber,
    blueTeam,
    redTeam,
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

function simulateBo3Series(
  blueTeam: TournamentTeam,
  redTeam: TournamentTeam,
  seed: number,
): { series: ReturnType<typeof createSeries>; winnerId: string; blueWins: number; redWins: number } {
  let series = createSeries({
    format: "bo3",
    fearless: false,
    timerEnabled: false,
    blueTeam: blueTeam.name,
    redTeam: redTeam.name,
    mode: "aivai",
    aiSide: null,
    aiDifficulty: "medium",
    bluePlayers: blueTeam.players,
    redPlayers: redTeam.players,
  });

  const rng = createRng(seed);
  let gameIdx = 0;
  while (series.status !== "complete") {
    let game = series.games[series.games.length - 1];
    game = filledGame(game.gameNumber, series.blueTeam, series.redTeam, seed, gameIdx);
    series = { ...series, games: [...series.games.slice(0, -1), game] };

    const result = simulateMatch(game, CHAMPIONS, {
      rng,
      scoreBias: starRatingBias(series),
      bluePlayers: series.bluePlayers,
      redPlayers: series.redPlayers,
      adaptiveMidgame: true,
    });
    const recap = buildGameRecap(
      game,
      CHAMPIONS,
      result,
      series.bluePlayers,
      series.redPlayers,
    );
    series = recordWinner(series, result.winner, recap);

    if (series.status === "between-games") {
      const lastGame = series.games[series.games.length - 1];
      const swap = lastGame?.winner === "blue";
      const newBlue = swap ? series.redTeam : series.blueTeam;
      const newRed = swap ? series.blueTeam : series.redTeam;
      series = startNextGame(series, newBlue, newRed);
    }
    gameIdx++;
  }

  const winsToWin = requiredWins("bo3");
  const blueWins = series.games.filter((g) => g.winner === "blue").length;
  const redWins = series.games.filter((g) => g.winner === "red").length;
  const winnerId =
    series.winner === "blue"
      ? blueTeam.id
      : series.winner === "red"
        ? redTeam.id
        : blueWins >= winsToWin
          ? blueTeam.id
          : redTeam.id;

  return {
    series,
    winnerId,
    blueWins,
    redWins,
  };
}

function simulateTournament(seed: number): TournamentState {
  const teams = Array.from({ length: TEAM_COUNT }, (_, i) => makeTeam(i + 1));
  let tournament = createTournament({
    name: `Dist Test ${seed}`,
    format: "single-elim",
    teams,
    defaults: DEFAULTS,
  });

  let matchSerial = 0;
  for (let iter = 0; iter < 50; iter++) {
    const next = tournament.matches.find(
      (m) =>
        !m.winner &&
        !m.isBye &&
        m.blueTeamId != null &&
        m.redTeamId != null,
    );
    if (!next) break;

    const blueTeam = tournament.teams.find((t) => t.id === next.blueTeamId)!;
    const redTeam = tournament.teams.find((t) => t.id === next.redTeamId)!;
    const { series, winnerId, blueWins, redWins } = simulateBo3Series(
      blueTeam,
      redTeam,
      seed * 1000 + matchSerial,
    );
    matchSerial++;

    const matchesWithSeries = tournament.matches.map((m) =>
      m.id === next.id ? { ...m, series } : m,
    );
    tournament = recordMatchWinner(
      { ...tournament, matches: matchesWithSeries },
      next.id,
      { teamId: winnerId, blueWins, redWins },
    );
  }

  return tournament;
}

type LaneCounts = Record<Lane, number>;

function emptyCounts(): LaneCounts {
  return { top: 0, jungle: 0, middle: 0, bottom: 0, support: 0 };
}

function pct(count: number, total: number): string {
  if (total === 0) return "0.0";
  return ((count / total) * 100).toFixed(1);
}

function formatDistributionTable(
  n: number,
  tournament: LaneCounts,
  finals: LaneCounts,
  intl: LaneCounts,
): string {
  const tTotal = Object.values(tournament).reduce((a, b) => a + b, 0);
  const fTotal = Object.values(finals).reduce((a, b) => a + b, 0);
  const iTotal = Object.values(intl).reduce((a, b) => a + b, 0);
  const header = "Role      | Tournament MVP % | Finals MVP % | Intl MVP %";
  const sep = "----------|------------------|--------------|------------";
  const rows = LANES.map((lane) => {
    const label = lane.padEnd(9);
    return `${label} | ${pct(tournament[lane], tTotal).padStart(16)}% | ${pct(finals[lane], fTotal).padStart(12)}% | ${pct(intl[lane], iTotal).padStart(10)}%`;
  });
  return [
    "",
    `MVP distribution (N=${n} tournaments)`,
    header,
    sep,
    ...rows,
    "",
  ].join("\n");
}

describe("MVP lane distribution (simulated tournaments)", () => {
  it(`reports balanced MVP lanes across ${TOURNAMENT_COUNT} single-elim tournaments`, () => {
    const tournamentMvp = emptyCounts();
    const finalsMvp = emptyCounts();
    const intlMvp = emptyCounts();
    let tournamentMvps = 0;
    let finalsMvps = 0;
    let intlMvps = 0;

    for (let i = 0; i < TOURNAMENT_COUNT; i++) {
      const t = simulateTournament(i + 1);
      expect(t.status).toBe("complete");

      const tourAward = computeTournamentAwards(t).mvp;
      if (tourAward?.lane) {
        tournamentMvp[tourAward.lane]++;
        tournamentMvps++;
      }

      const finals = computeFinalsMvp(t);
      if (finals?.lane) {
        finalsMvp[finals.lane]++;
        finalsMvps++;
      }

      const intl = computeChampionTeamTournamentMvp(t);
      if (intl?.lane) {
        intlMvp[intl.lane]++;
        intlMvps++;
      }
    }

    const table = formatDistributionTable(
      TOURNAMENT_COUNT,
      tournamentMvp,
      finalsMvp,
      intlMvp,
    );
    console.log(table);

    expect(tournamentMvps).toBe(TOURNAMENT_COUNT);
    expect(finalsMvps).toBe(TOURNAMENT_COUNT);
    expect(intlMvps).toBe(TOURNAMENT_COUNT);

    const carryLanes: Lane[] = ["top", "jungle", "middle", "bottom"];

    // Tournament + Finals: carry lanes ~20-25% each, spread ≤ 10% among the four.
    for (const kind of [
      { label: "tournament", counts: tournamentMvp, total: tournamentMvps },
      { label: "finals", counts: finalsMvp, total: finalsMvps },
    ] as const) {
      const pcts = carryLanes.map((lane) => kind.counts[lane] / kind.total);
      for (const pct of pcts) {
        expect(pct).toBeGreaterThanOrEqual(0.15);
        expect(pct).toBeLessThanOrEqual(0.30);
      }
      const maxPct = Math.max(...pcts);
      const minPct = Math.min(...pcts);
      expect(maxPct - minPct).toBeLessThanOrEqual(0.10);

      expect(kind.counts.support / kind.total).toBeGreaterThanOrEqual(0.06);
      expect(kind.counts.support / kind.total).toBeLessThanOrEqual(0.14);
    }

    // Intl MVP — keep existing calibrated bounds (user likes current distribution).
    expect(intlMvp.jungle / intlMvps).toBeGreaterThanOrEqual(0.18);
    expect(intlMvp.jungle / intlMvps).toBeLessThanOrEqual(0.32);
    expect(intlMvp.middle / intlMvps).toBeGreaterThanOrEqual(0.20);
    expect(intlMvp.middle / intlMvps).toBeLessThanOrEqual(0.32);
    expect(intlMvp.support / intlMvps).toBeGreaterThanOrEqual(0.08);
    expect(intlMvp.support / intlMvps).toBeLessThanOrEqual(0.18);
    expect(intlMvp.top / intlMvps).toBeGreaterThanOrEqual(0.15);
    expect(intlMvp.top / intlMvps).toBeLessThanOrEqual(0.25);
    expect(intlMvp.bottom / intlMvps).toBeGreaterThanOrEqual(0.15);
    expect(intlMvp.bottom / intlMvps).toBeLessThanOrEqual(0.28);
  });
});
