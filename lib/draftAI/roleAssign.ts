import type { Champion, Roster } from "../types";
import { getMetaTier, TIER_VALUE } from "../championMeta";
import { POSITIONAL_LANES, reorderPicksByPosition } from "../draftEngine";
import { playableInLane, playerForLane, poolBias } from "../players";

// Flex role optimizer. After a draft locks, a team's five champions can be
// assigned to lanes in more than one way (flex picks). This searches the valid
// champion→lane assignments and returns the picks in the positional order that
// maximizes the team's value: each champion's meta tier in its lane, plus the
// comfort of the player who would play it. Used for AI-controlled sides just
// before simulation so the bots flex into their players' strengths, while human
// teams keep the greedy assignment + manual swap.

// Weight of a player's champion-pool fit, in meta-tier units. ~1.5 means a
// comfort pick is worth about one-and-a-half tiers when deciding placement —
// enough to flex a champion onto a player who mains it, not enough to shove a
// champion into a lane it can't play.
const POOL_W = 1.5;
// Large deterrent for assigning a champion to a lane it can't play. Keeps the
// optimizer on valid assignments while still always returning a full 5-lane
// result (soft, not a hard constraint, so there's never an "infeasible" case).
const OFFROLE_PENALTY = 100;

function laneScore(
  champ: Champion,
  laneIdx: number,
  roster: Roster | undefined,
): number {
  const lane = POSITIONAL_LANES[laneIdx];
  const tier = getMetaTier(champ.alias, lane);
  let score = tier ? TIER_VALUE[tier] : 0;
  score += poolBias(playerForLane(roster, lane), champ.id) * POOL_W;
  if (!playableInLane(champ, lane)) score -= OFFROLE_PENALTY;
  return score;
}

function forEachPermutation<T>(arr: T[], visit: (perm: T[]) => void): void {
  const n = arr.length;
  const used = new Array<boolean>(n).fill(false);
  const cur: T[] = [];
  const rec = (): void => {
    if (cur.length === n) {
      visit(cur);
      return;
    }
    for (let i = 0; i < n; i++) {
      if (used[i]) continue;
      used[i] = true;
      cur.push(arr[i]);
      rec();
      cur.pop();
      used[i] = false;
    }
  };
  rec();
}

// Returns the picks reordered into positional lane order [top … support] that
// maximizes total value for the given roster. Falls back to the greedy
// `reorderPicksByPosition` for incomplete comps (so it composes with the same
// representation used everywhere else). Pure and deterministic.
export function optimizeRoleAssignment(
  picks: (number | null)[],
  champions: Champion[],
  roster: Roster | undefined,
): (number | null)[] {
  const ids = picks.filter((id): id is number => id != null);
  if (ids.length !== POSITIONAL_LANES.length) {
    return reorderPicksByPosition(picks, champions);
  }
  const byId = new Map(champions.map((c) => [c.id, c]));
  const champs = ids
    .map((id) => byId.get(id))
    .filter((c): c is Champion => c != null);
  if (champs.length !== POSITIONAL_LANES.length) {
    return reorderPicksByPosition(picks, champions);
  }

  let best: Champion[] | null = null;
  let bestScore = -Infinity;
  forEachPermutation(champs, (perm) => {
    let total = 0;
    for (let i = 0; i < perm.length; i++) total += laneScore(perm[i], i, roster);
    if (total > bestScore) {
      bestScore = total;
      best = perm.slice();
    }
  });
  if (!best) return reorderPicksByPosition(picks, champions);
  return (best as Champion[]).map((c) => c.id);
}
