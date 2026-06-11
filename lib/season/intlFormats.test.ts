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
  currentPhase,
  INTL_FORMAT_OPTIONS,
  nextPendingTournament,
  qualifiedForInternational,
  tournamentPlacements,
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

// The First Stand champion auto-qualifies for MSI; when it finished
// outside its league's spring top-3 the slot is ADDITIVE, growing the
// field from 18 to 19 teams. No format may hand out free wins for it:
// swiss and groups trim the field with an MSI Play-In (two lowest seeds,
// loser out) so the stage runs even / in equal groups; round-robin and
// single-elim absorb the odd count without any credited byes.
describe("MSI with the First Stand champion's additive 19th team", () => {
  // Distinct teams per groupId, from the group-stage matches.
  function groupSizes(t: TournamentState): number[] {
    const byGroup = new Map<string, Set<string>>();
    for (const m of t.matches) {
      if (!m.groupId) continue;
      const set = byGroup.get(m.groupId) ?? new Set<string>();
      if (m.blueTeamId) set.add(m.blueTeamId);
      if (m.redTeamId) set.add(m.redTeamId);
      byGroup.set(m.groupId, set);
    }
    return [...byGroup.values()].map((s) => s.size);
  }

  for (const opt of INTL_FORMAT_OPTIONS) {
    it(`runs fairly as ${opt.value}`, () => {
      const champions = championPool();
      const teams = generateSeasonTeams(champions, rngFrom(3));
      const config = makeConfig();
      config.intlConfigs = {
        msi: {
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
      const rng = rngFrom(11);
      // Winter splits (6) + First Stand.
      for (let i = 0; i < 7; i++) {
        const t = nextPendingTournament(s)!;
        s = applyTournamentUpdate(s, resolveTournament(t, rng), champions);
      }
      // Spring: resolve five leagues, then force the recorded First
      // Stand champion to a team that finished OUTSIDE its league's
      // top-3 — guaranteeing the additive 19th slot before the last
      // spring result triggers MSI creation.
      for (let i = 0; i < 5; i++) {
        const t = nextPendingTournament(s)!;
        s = applyTournamentUpdate(s, resolveTournament(t, rng), champions);
      }
      const resolvedLeague = LEAGUE_IDS.find(
        (l) => s.splitResults.spring?.[l],
      )!;
      const outsider = s.splitResults.spring![resolvedLeague]![5];
      s = {
        ...s,
        intlResults: { ...s.intlResults, "first-stand": [outsider] },
      };
      const lastSpring = nextPendingTournament(s)!;
      s = applyTournamentUpdate(
        s,
        resolveTournament(lastSpring, rng),
        champions,
      );

      const needsPlayIn =
        opt.value.startsWith("swiss") || opt.value.startsWith("groups");
      let msi = nextPendingTournament(s)!;
      if (needsPlayIn) {
        // Swiss/groups: the two lowest seeds fight for the last spot
        // first, so the main stage never needs a synthetic bye.
        expect(msi.name).toBe("MSI Play-In");
        expect(msi.teams).toHaveLength(2);
        const playInDone = resolveTournament(msi, rng);
        s = applyTournamentUpdate(s, playInDone, champions);
        // The play-in is a qualifier — it must not set the MSI result.
        expect(s.intlResults.msi).toBeUndefined();
        msi = nextPendingTournament(s)!;
        expect(msi.teams).toHaveLength(18);
        const winnerId = playInDone.matches[0].winner!.teamId;
        const loserId =
          playInDone.teams.find((t) => t.id !== winnerId)?.id ?? null;
        expect(msi.teams.some((t) => t.id === winnerId)).toBe(true);
        expect(msi.teams.some((t) => t.id === loserId)).toBe(false);
      }
      expect(msi.name).toContain("Invitational");
      expect(msi.format).toBe(opt.value);
      if (!needsPlayIn) expect(msi.teams).toHaveLength(19);
      // The First Stand champion holds the TOP seed — never trimmed.
      expect(msi.teams.some((t) => t.id === outsider)).toBe(true);

      const done = resolveTournament(msi, rng);
      expect(done.status, `MSI (${opt.value}) should complete`).toBe(
        "complete",
      );
      // No free wins anywhere: synthetic bye matches never appear, and
      // every decided match had two real teams in it.
      expect(done.matches.some((m) => m.isBye)).toBe(false);
      for (const m of done.matches) {
        if (!m.winner) continue;
        expect(m.blueTeamId).not.toBeNull();
        expect(m.redTeamId).not.toBeNull();
      }
      if (opt.value.startsWith("groups")) {
        // 18 teams → six EQUAL groups of 3 (19 would have made 4/3/3/3/3/3).
        const sizes = groupSizes(done);
        expect(sizes.length).toBeGreaterThan(0);
        expect(new Set(sizes).size).toBe(1);
      }
      if (opt.value === "round-robin-playoffs") {
        // Odd field is fine in RR: everyone still plays everyone.
        const stage = done.matches.filter((m) => m.bracket === undefined);
        const perTeam = new Map<string, number>();
        for (const m of stage) {
          for (const id of [m.blueTeamId, m.redTeamId]) {
            if (id) perTeam.set(id, (perTeam.get(id) ?? 0) + 1);
          }
        }
        for (const t of done.teams) {
          expect(perTeam.get(t.id)).toBe(done.teams.length - 1);
        }
      }
    });
  }
});

// Same guarantee at Worlds: the MSI champion's additive slot makes the
// main-event field 21 — swiss would need byes and the four groups would
// go unequal, so in those formats only the play-in WINNER advances
// (20 teams). Round-robin / single-elim keep both finalists.
describe("Worlds main event with the MSI champion's additive slot", () => {
  for (const format of ["groups-playoffs", "swiss-playoffs-de"] as const) {
    it(`trims to an even field as ${format}`, () => {
      const champions = championPool();
      const teams = generateSeasonTeams(champions, rngFrom(5));
      const config = makeConfig();
      config.intlConfigs = {
        worlds: {
          format,
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
      const rng = rngFrom(13);
      // Play everything up to the summer split (winter, First Stand,
      // spring, MSI — plus an MSI play-in if the RNG forced one).
      while (currentPhase(s)?.split !== "summer") {
        const t = nextPendingTournament(s)!;
        s = applyTournamentUpdate(s, resolveTournament(t, rng), champions);
      }
      // Summer: resolve five leagues, pre-resolve the sixth, then use a
      // probe (the sixth result applied to a throwaway copy) to find a
      // team whose injected MSI title is guaranteed ADDITIVE — i.e. it
      // doesn't sneak into Worlds through the points seeds even with
      // the champion's 15 points.
      for (let i = 0; i < 5; i++) {
        const t = nextPendingTournament(s)!;
        s = applyTournamentUpdate(s, resolveTournament(t, rng), champions);
      }
      const lastSummer = resolveTournament(nextPendingTournament(s)!, rng);
      const probe = applyTournamentUpdate(s, lastSummer, champions);
      let outsider: string | null = null;
      for (const team of s.teams) {
        const probe2 = {
          ...probe,
          intlResults: { ...probe.intlResults, msi: [team.id] },
        };
        const q = qualifiedForInternational(probe2, "worlds");
        if (q.some((x) => x.team.id === team.id && x.via === "champion")) {
          outsider = team.id;
          break;
        }
      }
      expect(outsider).not.toBeNull();
      s = { ...s, intlResults: { ...s.intlResults, msi: [outsider!] } };
      s = applyTournamentUpdate(s, lastSummer, champions);

      const worldsQ = qualifiedForInternational(s, "worlds");
      expect(
        worldsQ.some((q) => q.team.id === outsider && q.via === "champion"),
      ).toBe(true);
      const direct = worldsQ.filter((q) => q.leagueSeed <= 3);
      expect(direct).toHaveLength(19); // 18 + additive champion

      const playIn = nextPendingTournament(s)!;
      expect(playIn.name).toContain("Play-In");
      const playInDone = resolveTournament(playIn, rng);
      s = applyTournamentUpdate(s, playInDone, champions);

      // 19 direct + ONLY the play-in winner = 20: even swiss / 4×5 groups.
      const main = nextPendingTournament(s)!;
      expect(main.name).toContain("World");
      expect(main.teams).toHaveLength(20);
      const [winner, runnerUp] = tournamentPlacements(playInDone);
      expect(main.teams.some((t) => t.id === winner)).toBe(true);
      expect(main.teams.some((t) => t.id === runnerUp)).toBe(false);
      const done = resolveTournament(main, rng);
      expect(done.status).toBe("complete");
      expect(done.matches.some((m) => m.isBye)).toBe(false);
    });
  }
});

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
