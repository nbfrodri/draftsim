// Champion-pool drift — between splits/seasons a player's champion pool
// creeps a little as the meta moves, so rosters don't feel frozen. Pure and
// deterministic given an RNG; only allocates new objects for players that
// actually change, returning the same season reference when nothing drifts so
// callers can cheap-compare.

import type { Champion, Player } from "../types";
import type { SeasonState } from "./types";
import { MAIN_POOL, playableInLane, type RNG } from "../players";

// Tunable drift rates. Kept low — pools should follow the meta, not churn.
const DRIFT_RATE = 0.2; // chance per player per pass that their pool shifts at all
const BAD_DRIFT_SHARE = 0.25; // of drifts, fraction that swap a badChamps entry (else goodChamps)
const MAIN_SWAP_SHARE = 0.2; // of goodChamps swaps, fraction that touch a main (else a secondary)

// Swap one champion in a player's pool for a different lane-eligible one,
// keeping size, mains-first order, and good/bad disjointness. Returns the same
// player object if no swap was possible.
function driftPlayer(p: Player, champions: readonly Champion[], rng: RNG): Player {
  const used = new Set([...p.goodChamps, ...p.badChamps]);
  const eligible = champions.filter((c) => !used.has(c.id) && playableInLane(c, p.lane));
  if (eligible.length === 0) return p;
  const incoming = eligible[Math.floor(rng() * eligible.length)].id;

  // Occasionally retune a disliked pick instead of a liked one.
  const driftBad =
    p.badChamps.length > 0 && (p.goodChamps.length === 0 || rng() < BAD_DRIFT_SHARE);
  if (driftBad) {
    const badChamps = p.badChamps.slice();
    badChamps[Math.floor(rng() * badChamps.length)] = incoming;
    return { ...p, badChamps };
  }

  if (p.goodChamps.length === 0) return p; // nothing to swap
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
      const next = driftPlayer(p, champions, rng);
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
