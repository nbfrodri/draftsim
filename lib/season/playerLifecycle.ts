// Player careers for franchise/reality mode: stable ids, ageing, growth and
// decline, retirement, and incoming rookies. Pure and deterministic given an
// RNG. Runs once per YEAR (the post-Worlds offseason), distinct from the
// per-split tier drift in applyPlayerDevelopment.
//
// The model in one line: young players climb toward a hidden `potential`,
// veterans slide down, and a good (bad) season speeds growth (decline) — so a
// star's arc and a journeyman's fade both emerge from age × performance.

import type { Champion, Lane, Player, PlayerTier } from "../types";
import {
  PLAYER_TIER_VALUE,
  PLAYER_TIERS,
  valueToTier,
  randomizeChampPools,
  makePlayerId,
  type RNG,
} from "../players";
import { generateHandle } from "./playerNames";
import rookiePool from "./rookieNames.json";

// Real sub/academy/prospect handles (LoL Esports squads minus current starters)
// — gives rookies authentic names; falls back to a generated handle.
const PROSPECTS = rookiePool as string[];
function rookieName(rng: RNG, taken: Set<string>): string {
  for (let i = 0; i < 12 && PROSPECTS.length > 0; i++) {
    const n = PROSPECTS[Math.floor(rng() * PROSPECTS.length)];
    if (!taken.has(n)) {
      taken.add(n);
      return n;
    }
  }
  return generateHandle(rng, taken);
}

// ── Tunable knobs (ponytail: tune here, not in the logic) ───────────────────
const DEBUT_AGE_MIN = 17;
const PRIME_FROM = 20; //   growth window: young & below potential climb
const GROWTH_UNTIL = 23; // past this, no more youth growth bonus
const DECLINE_FROM = 26; // veterans start sliding
const RETIRE_FROM = 27; //  retirement risk begins
const CHANGE_RATE = 0.6; // chance a player's tier moves at all in a given year
const PERF_NEUTRAL = 5.5; // a 1-10 season grade at this is "as expected"
const PERF_WEIGHT = 0.18; // how hard a season's grade tilts the tier move
const ROOKIE_AGE_MAX = 19;

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

// Retirement chance ramps with age; weaker players fade a touch sooner.
function retireChance(age: number, tierVal: number): number {
  if (age < RETIRE_FROM) return 0;
  const base = (age - (RETIRE_FROM - 1)) * 0.12; // 27→.12 … 33→.84
  const weak = tierVal <= -1 ? 0.08 : 0;
  return clamp(base + weak, 0, 0.95);
}

// A starting age + potential for an EXISTING player when a reality begins.
// Younger players get more headroom above their current tier.
export function initCareer(player: Player, rng: RNG): Player {
  const age = 18 + Math.floor(rng() * 8); // 18–25, the bulk of a real field
  const tierVal = PLAYER_TIER_VALUE[player.tier];
  const headroom = age <= GROWTH_UNTIL ? Math.floor(rng() * 3) : Math.floor(rng() * 2);
  const potential = valueToTier(clamp(tierVal + headroom, -2, 2));
  return {
    ...player,
    id: player.id ?? makePlayerId(rng),
    age,
    potential,
  };
}

/** Stamp ids + ages + potentials onto a roster at reality creation. */
export function seedRosterCareers(roster: readonly Player[], rng: RNG): Player[] {
  return roster.map((p) => initCareer(p, rng));
}

// A fresh rookie for a lane: young, modest tier now, real upside.
export function makeRookie(
  lane: Lane,
  champions: readonly Champion[],
  rng: RNG,
  taken: Set<string>,
): Player {
  const age = DEBUT_AGE_MIN + Math.floor(rng() * (ROOKIE_AGE_MAX - DEBUT_AGE_MIN + 1));
  // Start C..A, weighted low; potential adds 1–3 tiers of upside.
  const startVal = clamp(-1 + Math.floor(rng() * 3), -2, 1); // C, B, or A
  const tier = valueToTier(startVal);
  const potential = valueToTier(clamp(startVal + 1 + Math.floor(rng() * 3), -2, 2));
  const pools = randomizeChampPools(lane, champions, rng, tier);
  return {
    id: makePlayerId(rng),
    name: rookieName(rng, taken),
    lane,
    tier,
    age,
    potential,
    goodChamps: pools.goodChamps,
    badChamps: pools.badChamps,
  };
}

// Age one player a year. Returns the evolved player, or null if they retired.
// `perf` is last season's average grade (1-10) for this player, or null.
export function agePlayer(player: Player, perf: number | null, rng: RNG): Player | null {
  const age = (player.age ?? 22) + 1;
  const tierVal = PLAYER_TIER_VALUE[player.tier];
  if (rng() < retireChance(age, tierVal)) return null;

  const potVal = PLAYER_TIER_VALUE[player.potential ?? player.tier];
  // Signed pressure: + favours a tier up, − a tier down.
  let pressure = 0;
  if (age >= PRIME_FROM && age <= GROWTH_UNTIL && tierVal < potVal) pressure += 0.45;
  if (age >= DECLINE_FROM) pressure -= 0.35 * ((age - (DECLINE_FROM - 1)) / 3);
  pressure -= 0.1 * (tierVal / 2); // gentle regression to the mean
  if (perf != null) pressure += PERF_WEIGHT * (perf - PERF_NEUTRAL);

  let tier: PlayerTier = player.tier;
  if (rng() < CHANGE_RATE) {
    const pUp = clamp(0.5 + pressure, 0.05, 0.95);
    const dir = rng() < pUp ? 1 : -1;
    let nextVal = tierVal + dir;
    if (dir > 0) nextVal = Math.min(nextVal, potVal); // youth can't exceed potential
    nextVal = clamp(nextVal, -2, 2);
    tier = valueToTier(nextVal);
  }
  return { ...player, age, tier };
}

/** Evolve a full roster through one offseason: age everyone, replace retirees
 *  with rookies at the same lane. `gradesByLane` is last season's per-lane
 *  grade (1-10) in positional lane order; `taken` keeps generated rookie
 *  handles unique across the league/reality. */
export function offseasonEvolveRoster(
  roster: readonly Player[],
  gradesByLane: readonly (number | null)[],
  champions: readonly Champion[],
  rng: RNG,
  taken: Set<string>,
): Player[] {
  return roster.map((p, i) => {
    if (p.name) taken.add(p.name);
    const aged = agePlayer(p, gradesByLane[i] ?? null, rng);
    return aged ?? makeRookie(p.lane, champions, rng, taken);
  });
}

// Convenience for tests / callers that just need every tier in order.
export const ALL_TIERS = PLAYER_TIERS;
