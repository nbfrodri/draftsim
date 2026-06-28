import { describe, it, expect } from "vitest";

import type { Champion, Lane } from "../types";
import { LANE_ORDER } from "../players";
import { generateSeasonTeams } from "./teamGen";
import { createSeason } from "./engine";
import {
  seedFranchise,
  startNextSeason,
  continuityFormBonus,
  CONTINUITY_FORM_BONUS,
} from "./franchise";
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

function makeReality(aging = true) {
  const teams = generateSeasonTeams(champions, rngFrom(3));
  const base = createSeason({ config: makeConfig(), teams, activeMeta: meta });
  return seedFranchise(base, "Alpha", aging, rngFrom(9));
}

describe("seedFranchise", () => {
  it("stamps a year-1 franchise and ages/potentials on every player", () => {
    const s = makeReality();
    expect(s.franchise?.year).toBe(1);
    expect(s.franchise?.name).toBe("Alpha");
    for (const t of s.teams) {
      for (const p of t.players) {
        expect(typeof p.age).toBe("number");
        expect(p.potential).toBeTruthy();
        expect(p.id).toBeTruthy();
      }
    }
  });
});

describe("continuityFormBonus", () => {
  it("rewards keeping the majority, scaling up to full retention", () => {
    expect(continuityFormBonus(5)).toBeCloseTo(CONTINUITY_FORM_BONUS); // kept all
    expect(continuityFormBonus(3)).toBeGreaterThan(0); // kept the majority
    expect(continuityFormBonus(4)).toBeGreaterThan(continuityFormBonus(3));
    expect(continuityFormBonus(2)).toBe(0); // below majority → nothing
    expect(continuityFormBonus(0)).toBe(0);
  });

  it("seeds a starting form bonus on year rollover when form is tracked", () => {
    // Form must be enabled (formDrift) for teamForm to exist and be seeded.
    const cfg = { ...makeConfig(), formDrift: true };
    const teams = generateSeasonTeams(champions, rngFrom(3));
    const base = createSeason({ config: cfg, teams, activeMeta: meta });
    const y1 = seedFranchise(base, "Alpha", true, rngFrom(9));
    const y2 = startNextSeason(y1, champions, rngFrom(11));
    const forms = Object.values(y2.teamForm ?? {});
    // Most rosters survive an offseason largely intact → at least one team
    // carries a positive continuity bonus, and every seeded value is a valid
    // bonus (0 < f ≤ CONTINUITY_FORM_BONUS).
    expect(forms.some((f) => f > 0)).toBe(true);
    for (const f of forms) {
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(CONTINUITY_FORM_BONUS);
    }
  });
});

describe("startNextSeason", () => {
  it("rolls into year 2 keeping the same teams + franchise id, every slot filled", () => {
    const y1 = makeReality();
    const y2 = startNextSeason(y1, champions, rngFrom(11));
    expect(y2.franchise?.year).toBe(2);
    expect(y2.franchise?.id).toBe(y1.franchise?.id);
    // Same franchise teams (ids preserved).
    expect(new Set(y2.teams.map((t) => t.id))).toEqual(new Set(y1.teams.map((t) => t.id)));
    // Every roster still has 5 named, aged players (retirees replaced by rookies).
    for (const t of y2.teams) {
      expect(t.players).toHaveLength(5);
      for (const p of t.players) {
        expect(p.id).toBeTruthy();
        expect(typeof p.age).toBe("number");
        expect(p.name).toBeTruthy();
      }
    }
    // It's a fresh, playable season (Winter created).
    expect(y2.phases[0].tournamentIds.length).toBeGreaterThan(0);
    expect(y2.status).toBe("in-progress");
    // Regression: tournaments must carry the season's id, or the store rejects
    // every sim update and the new year never progresses.
    for (const tid of y2.phases[0].tournamentIds) {
      expect(y2.tournaments[tid].seasonId).toBe(y2.id);
    }
  });

  it("with aging OFF, carries the exact same players (no ageing/rookies)", () => {
    const y1 = makeReality(false);
    const y2 = startNextSeason(y1, champions, rngFrom(11));
    expect(y2.franchise?.aging).toBe(false);
    // Same set of players (offseason transfers relocate them, but nobody is
    // aged out or replaced by a rookie).
    const before = y1.teams.flatMap((t) => t.players);
    const ageById = new Map(y2.teams.flatMap((t) => t.players).map((p) => [p.id, p.age]));
    expect(ageById.size).toBe(before.length); // no retirements / new rookies
    // No birthdays: each player's age is identical year-over-year (by id).
    for (const p of before) expect(ageById.get(p.id!)).toBe(p.age);
  });
});
