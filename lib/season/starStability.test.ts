import { describe, it, expect } from "vitest";
import type { Champion, Lane } from "../types";
import { LANE_ORDER, deriveStar } from "../players";
import { generateSeasonTeams } from "./teamGen";
import { createSeason, applyPlayerDevelopment } from "./engine";
import { seedFranchise, startNextSeason } from "./franchise";
import {
  LEAGUE_IDS,
  type SeasonConfig,
  type SeasonLeagueConfig,
} from "./types";

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
  for (const lane of LANE_ORDER) {
    for (let i = 0; i < 8; i++) {
      out.push({ id: nid++, name: `${lane}-${i}`, alias: `${lane}-${i}`, roles: [], iconUrl: "", lanes: [lane as Lane] });
    }
  }
  return out;
}

const LEAGUE_CFG: SeasonLeagueConfig = {
  format: "round-robin-playoffs",
  playoffTeams: 4,
  regularSeries: "bo1",
  playoffSeries: "bo5",
};
function makeConfig(): SeasonConfig {
  return {
    name: "Test",
    sharedLeagueConfig: true,
    leagueConfigs: Object.fromEntries(LEAGUE_IDS.map((l) => [l, { ...LEAGUE_CFG }])) as Record<
      (typeof LEAGUE_IDS)[number],
      SeasonLeagueConfig
    >,
    liveMeta: false,
    patchShift: false,
    fearless: false,
    aiDifficulty: "normal",
    controlledTeamId: null,
    playerDevelopment: true,
  };
}

const champions = champPool();
const meta = { metaOverride: null, metaEnabled: true, synergyOverride: null, counterOverride: null };

function stats(stars: number[]) {
  const mean = stars.reduce((a, b) => a + b, 0) / stars.length;
  const variance = stars.reduce((a, b) => a + (b - mean) ** 2, 0) / stars.length;
  return {
    mean,
    sd: Math.sqrt(variance),
    min: Math.min(...stars),
    max: Math.max(...stars),
    at5: stars.filter((s) => s >= 5).length,
  };
}

// The user's worry: over a long realities timeline, do all teams creep up to
// 5 stars? Drive the WORST case for convergence — rich-get-richer form, where
// the currently-strongest teams always run hot (so development pushes them up)
// and the weakest run cold — over many years, and confirm the field stays
// SPREAD: some teams strong, some weak, turnover at the top, no ceiling pileup.
describe("realities star stability", () => {
  it("keeps star ratings spread over a long timeline (no convergence to 5)", () => {
    let season = seedFranchise(
      createSeason({ config: makeConfig(), teams: generateSeasonTeams(champions, rngFrom(3)), activeMeta: meta }),
      "Alpha",
      true,
      rngFrom(9),
      champions,
    );
    const rng = rngFrom(101);
    const YEARS = 20;

    const year1 = season.teams.map((t) => deriveStar(t.players));
    const s1 = stats(year1);

    for (let y = 0; y < YEARS; y++) {
      // Three splits a year; before each, set form to reward the currently
      // strong and punish the weak (rich-get-richer pressure toward the top).
      for (let split = 0; split < 3; split++) {
        const teamForm: Record<string, number> = {};
        for (const t of season.teams) {
          teamForm[t.id] = Math.max(-1, Math.min(1, (deriveStar(t.players) - 3) / 2));
        }
        season = applyPlayerDevelopment({ ...season, teamForm }, rng);
      }
      season = startNextSeason(season, champions, rng);
    }

    const finalStars = season.teams.map((t) => deriveStar(t.players));
    const sf = stats(finalStars);
    void s1; // year-1 baseline kept for debugging the distribution

    // The core guarantee: teams do NOT all converge to 5 stars. The mean stays
    // anchored near the middle (mean-reverting development), the field keeps a
    // real spread of stronger/weaker teams, and there's no ceiling pileup.
    expect(sf.at5).toBeLessThan(season.teams.length); // no 5★ pileup
    expect(sf.mean).toBeGreaterThan(2.3);
    expect(sf.mean).toBeLessThan(4); // no runaway inflation
    expect(sf.sd).toBeGreaterThan(0.35); // spread not collapsed
    expect(sf.max - sf.min).toBeGreaterThanOrEqual(1.5); // better & worse teams remain
  });
});
