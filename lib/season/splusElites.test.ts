import { describe, it, expect } from "vitest";
import type { Champion, Lane } from "../types";
import { LANE_ORDER } from "../players";
import { generateSeasonTeams, SPLUS_PER_ROLE } from "./teamGen";
import { createSeason } from "./engine";
import { seedFranchise, startNextSeason } from "./franchise";
import { LEAGUE_IDS, type SeasonConfig, type SeasonLeagueConfig, type SeasonState } from "./types";

function rngFrom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let nid = 1;
function champPool(): Champion[] {
  const out: Champion[] = [];
  for (const lane of LANE_ORDER) for (let i = 0; i < 8; i++) out.push({ id: nid++, name: `${lane}-${i}`, alias: `${lane}-${i}`, roles: [], iconUrl: "", lanes: [lane as Lane] });
  return out;
}
const LEAGUE_CFG: SeasonLeagueConfig = { format: "round-robin-playoffs", playoffTeams: 4, regularSeries: "bo1", playoffSeries: "bo5" };
function makeConfig(): SeasonConfig {
  return { name: "T", sharedLeagueConfig: true, leagueConfigs: Object.fromEntries(LEAGUE_IDS.map((l) => [l, { ...LEAGUE_CFG }])) as Record<(typeof LEAGUE_IDS)[number], SeasonLeagueConfig>, liveMeta: false, patchShift: false, fearless: false, aiDifficulty: "normal", controlledTeamId: null, playerDevelopment: true };
}
const champions = champPool();
const meta = { metaOverride: null, metaEnabled: true, synergyOverride: null, counterOverride: null };

function splusPerLane(s: SeasonState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const lane of LANE_ORDER) out[lane] = 0;
  for (const t of s.teams) for (const p of t.players) if (p.tier === "S+") out[p.lane]++;
  return out;
}

describe("S+ cap holds across rollovers (retired don't inflate)", () => {
  it("never exceeds SPLUS_PER_ROLE per lane, year after year", () => {
    const teams = generateSeasonTeams(champions, rngFrom(3));
    let s: SeasonState = seedFranchise(createSeason({ config: makeConfig(), teams, activeMeta: meta }), "Alpha", true, rngFrom(9));
    // mark complete so startNextSeason archives + rolls
    s = { ...s, status: "complete" };
    for (let year = 1; year <= 8; year++) {
      const perLane = splusPerLane(s);
      for (const lane of LANE_ORDER) {
        expect(perLane[lane], `year ${year} lane ${lane}`).toBeLessThanOrEqual(SPLUS_PER_ROLE);
      }
      s = { ...startNextSeason(s, champions, rngFrom(100 + year)), status: "complete" };
    }
  });
});
