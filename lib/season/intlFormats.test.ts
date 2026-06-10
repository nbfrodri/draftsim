// Per-event international format matrix: runs a full season for every
// (event, format) combination from INTL_FORMAT_OPTIONS and asserts the
// event is created with the configured format + series lengths, honors
// the playoff-size setting, and completes through the engine.
import { describe, it, expect } from "vitest";

import type { Lane } from "../types";
import { LANE_ORDER } from "../players";
import {
  recordMatchWinner,
  startGroupsPlayoffs,
  startRoundRobinPlayoffs,
  startSwissPlayoffs,
  type TournamentFormat,
  type TournamentState,
} from "../tournament";
import {
  applyTournamentUpdate,
  createSeason,
  INTL_FORMAT_OPTIONS,
  nextPendingTournament,
} from "./engine";
import { generateSeasonTeams } from "./teamGen";
import {
  LEAGUE_IDS,
  type InternationalId,
  type SeasonConfig,
  type SeasonLeagueConfig,
} from "./types";
import type { Champion } from "../types";

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

let nextId = 1;
function champ(lanes: Lane[], alias: string): Champion {
  const id = nextId++;
  return { id, name: alias, alias, roles: [], iconUrl: "", lanes };
}
function championPool(perLane = 8): Champion[] {
  const out: Champion[] = [];
  for (const lane of LANE_ORDER) {
    for (let i = 0; i < perLane; i++) out.push(champ([lane], `${lane}-${i}`));
  }
  return out;
}

const LEAGUE_CFG: SeasonLeagueConfig = {
  format: "round-robin-playoffs",
  playoffTeams: 4,
  regularSeries: "bo1",
  playoffSeries: "bo1",
};

function makeConfig(): SeasonConfig {
  return {
    name: "Matrix",
    sharedLeagueConfig: true,
    leagueConfigs: Object.fromEntries(
      LEAGUE_IDS.map((l) => [l, { ...LEAGUE_CFG }]),
    ) as Record<(typeof LEAGUE_IDS)[number], SeasonLeagueConfig>,
    liveMeta: false,
    patchShift: false,
    fearless: false,
    aiDifficulty: "normal",
    controlledTeamId: null,
  };
}

function resolveTournament(
  t: TournamentState,
  rng: () => number,
): TournamentState {
  let working = t;
  for (let safety = 0; safety < 2000; safety++) {
    const startable = working.matches.find(
      (m) => !m.winner && m.blueTeamId != null && m.redTeamId != null,
    );
    if (!startable) {
      const stageDone = working.matches
        .filter((m) => m.bracket === undefined)
        .every((m) => m.winner != null);
      if (
        (working.format === "groups-playoffs" ||
          working.format === "groups-playoffs-de") &&
        !working.groupsPlayoffs?.playoffStarted &&
        stageDone
      ) {
        working = startGroupsPlayoffs(working);
        continue;
      }
      if (
        (working.format === "swiss-playoffs" ||
          working.format === "swiss-playoffs-de") &&
        !working.swissPlayoffsStarted &&
        stageDone
      ) {
        working = startSwissPlayoffs(working);
        continue;
      }
      if (
        working.format === "round-robin-playoffs" &&
        !working.rrPlayoffsStarted &&
        stageDone
      ) {
        working = startRoundRobinPlayoffs(working);
        continue;
      }
      break;
    }
    const blue = working.teams.find((x) => x.id === startable.blueTeamId)!;
    const red = working.teams.find((x) => x.id === startable.redTeamId)!;
    const pBlue = 0.5 + 0.12 * ((blue.starRating ?? 3) - (red.starRating ?? 3));
    const blueWon = rng() < pBlue;
    const need =
      startable.format === "bo5" ? 3 : startable.format === "bo3" ? 2 : 1;
    working = recordMatchWinner(working, startable.id, {
      teamId: blueWon ? blue.id : red.id,
      blueWins: blueWon ? need : 0,
      redWins: blueWon ? 0 : need,
    });
  }
  return working;
}

const EVENTS: InternationalId[] = ["first-stand", "msi", "worlds"];

describe("intl format matrix", () => {
  for (const event of EVENTS) {
    for (const opt of INTL_FORMAT_OPTIONS) {
      it(`${event} as ${opt.value} completes`, () => {
        const champions = championPool();
        const teams = generateSeasonTeams(champions, rngFrom(2));
        const config = makeConfig();
        config.intlConfigs = {
          [event]: {
            format: opt.value as TournamentFormat,
            earlySeries: "bo1",
            finalsSeries: "bo1",
            playoffTeams: 8,
          },
        };
        let s = createSeason({
          config,
          teams,
          activeMeta: {
            metaOverride: null,
            metaEnabled: true,
            synergyOverride: null,
            counterOverride: null,
          },
        });
        const rng = rngFrom(7);
        let found = false;
        for (let safety = 0; safety < 60; safety++) {
          if (s.status === "complete") break;
          const t = nextPendingTournament(s);
          expect(t, `pending tournament at phase ${s.phaseIndex}`).not.toBeNull();
          const isTargetEvent =
            (event === "first-stand" && t!.name === "First Stand") ||
            (event === "msi" && t!.name.includes("Invitational")) ||
            (event === "worlds" && t!.name.includes("World Championship"));
          if (isTargetEvent) {
            found = true;
            expect(t!.format).toBe(opt.value);
            // Stage matches use the configured early series.
            expect(
              t!.matches.every((m) => m.isBye || m.format === "bo1"),
            ).toBe(true);
            // The playoff-size setting reaches the right knob.
            if (
              opt.value === "swiss-playoffs" ||
              opt.value === "swiss-playoffs-de"
            ) {
              expect(t!.swissPlayoffsAdvancing).toBe(8);
            } else if (opt.value === "round-robin-playoffs") {
              expect(t!.rrPlayoffsAdvancing).toBe(8);
            } else if (
              opt.value === "groups-playoffs" ||
              opt.value === "groups-playoffs-de"
            ) {
              // "Top 8" rounds to a per-group advancing count.
              const g = t!.groupsPlayoffs!;
              expect(g.groupCount).toBeGreaterThan(0);
              expect(g.advancingPerGroup).toBe(
                Math.max(1, Math.round(8 / g.groupCount)),
              );
              if (event === "worlds") expect(g.groupCount).toBe(4);
            }
          }
          const done = resolveTournament(t!, rng);
          expect(
            done.status,
            `${t!.name} (${t!.format}) should complete`,
          ).toBe("complete");
          s = applyTournamentUpdate(s, done, champions);
        }
        expect(found, `${event} tournament was created`).toBe(true);
        expect(s.status).toBe("complete");
      });
    }
  }
});
