// Champion-pool drift — between splits/seasons a player's champion pool
// creeps a little as the meta moves, so rosters don't feel frozen. Pure and
// deterministic given an RNG; only allocates new objects for players that
// actually change, returning the same season reference when nothing drifts so
// callers can cheap-compare.

import type { Champion, Player } from "../types";
import type { SeasonState } from "./types";
import { MAIN_POOL, MAIN_TIER_WEIGHT, playableInLane, type RNG } from "../players";
import { getMetaTiers } from "../championMeta";

// Tunable drift rates. Kept moderate — pools should follow the meta, not churn.
// ponytail: rates tuned so the VISIBLE part of a pool (the mains) actually
// shifts over a season — secondaries-only drift read as "pools never change".
// Dial DRIFT_RATE/MAIN_SWAP_SHARE down if pools start churning unrealistically.
const DRIFT_RATE = 0.35; // chance per player per pass that their pool shifts at all
const BAD_DRIFT_SHARE = 0.25; // of drifts, fraction that swap a badChamps entry (else goodChamps)
const MAIN_SWAP_SHARE = 0.4; // of goodChamps swaps, fraction that touch a main (else a secondary)
const META_DRIFT_LEAN = 0.7; // share of incoming picks pulled toward meta-strong champs (rest uniform)

// Choose the champion drifting IN. Mostly leans toward champions that are
// strong in the CURRENT meta (getMetaTiers reflects the active patch override),
// so pools chase the meta — but not 100%: a share are picked uniformly so
// off-meta pocket picks still surface. `pool` is the lane-eligible candidates.
function pickIncoming(pool: readonly Champion[], lane: Player["lane"], rng: RNG): number {
  if (rng() >= META_DRIFT_LEAN) {
    return pool[Math.floor(rng() * pool.length)].id; // uniform off-meta pick
  }
  // Meta-weighted (Efraimidis–Spirakis: highest key wins, P(win) rises with
  // the champ's meta-tier weight). Unranked champs get a neutral mid weight.
  let bestId = pool[0].id;
  let bestKey = -1;
  for (const c of pool) {
    const tier = getMetaTiers(c.alias)[lane];
    const weight = tier ? MAIN_TIER_WEIGHT[tier] : 2;
    const key = Math.pow(rng() || 1e-9, 1 / weight);
    if (key > bestKey) {
      bestKey = key;
      bestId = c.id;
    }
  }
  return bestId;
}

// Swap one champion in a player's pool for a different lane-eligible one,
// keeping size, mains-first order, and good/bad disjointness. Returns the same
// player object if no swap was possible.
/** Drift one player's champ pool (exported for inactive/academy ticks). */
export function driftPlayerPool(p: Player, champions: readonly Champion[], rng: RNG): Player {
  const used = new Set([...p.goodChamps, ...p.badChamps]);
  const eligible = champions.filter((c) => !used.has(c.id) && playableInLane(c, p.lane));
  if (eligible.length === 0) return p;

  // Occasionally retune a disliked pick instead of a liked one.
  const driftBad =
    p.badChamps.length > 0 && (p.goodChamps.length === 0 || rng() < BAD_DRIFT_SHARE);
  if (driftBad) {
    // Disliked picks are NOT meta-led — a player doesn't preferentially dislike
    // strong champs — so the incoming dislike is a plain uniform pick.
    const badChamps = p.badChamps.slice();
    badChamps[Math.floor(rng() * badChamps.length)] = eligible[Math.floor(rng() * eligible.length)].id;
    return { ...p, badChamps };
  }

  if (p.goodChamps.length === 0) return p; // nothing to swap
  // The liked pick drifting in leans toward the current meta (pickIncoming).
  const incoming = pickIncoming(eligible, p.lane, rng);
  // Prefer changing a secondary pick; touch a main only occasionally (or when
  // there are no secondaries to change). In-place replace preserves order/size.
  const mainCount = Math.min(MAIN_POOL, p.goodChamps.length);
  const hasSecondary = p.goodChamps.length > MAIN_POOL;
  const swapMain = !hasSecondary || rng() < MAIN_SWAP_SHARE;
  const idx = swapMain
    ? Math.floor(rng() * mainCount)
    : MAIN_POOL + Math.floor(rng() * (p.goodChamps.length - MAIN_POOL));
  const goodChamps = p.goodChamps.slice();
  goodChamps[idx] = incoming;
  return { ...p, goodChamps };
}

export function applyPoolDrift(
  season: SeasonState,
  champions: readonly Champion[],
  rng: RNG = Math.random,
): SeasonState {
  let anyChanged = false;
  const teams = season.teams.map((team) => {
    let teamChanged = false;
    const players = team.players.map((p) => {
      if (rng() >= DRIFT_RATE) return p;
      const next = driftPlayerPool(p, champions, rng);
      if (next === p) return p;
      teamChanged = true;
      return next;
    });
    if (!teamChanged) return team;
    anyChanged = true;
    return { ...team, players };
  });
  return anyChanged ? { ...season, teams } : season;
}
