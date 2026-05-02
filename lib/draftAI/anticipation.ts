// Forward-looking heuristics: predict the enemy's next pick (used both for
// ban anticipation and 1-ply lookahead) and compute the lookahead penalty
// for a candidate.

import { applyLock, currentAction, usedChampionsInGame } from "../draftEngine";
import { DRAFT_ORDER, TOTAL_ACTIONS } from "../draftOrder";
import type { Champion, GameDraft, Side } from "../types";
import {
  archetypeCounts,
  bansFor,
  countNonNull,
  damageDealerCount,
  damageProfile,
  getById,
  identityTarget,
  inferLaneAssignment,
  laneMatchup,
  nextActionIsEnemyPick,
  openLanes,
  phaseProfile,
  picksFor,
  remainingActionsForSide,
} from "./helpers";
import type { PickContext } from "./scoring";
import { scorePick } from "./scoring";

// Deterministic top-K picks for a hypothetical state. Used by both ban
// anticipation (k=3) and 1-ply lookahead (k=1). Builds a fresh PickContext
// from the supplied game state; does NOT call back into the public AI to
// avoid recursion.
export function predictTopK(
  game: GameDraft,
  champions: Champion[],
  fearlessLocked: ReadonlySet<number>,
  k: number,
): number[] {
  const action = currentAction(game);
  if (!action || action.kind !== "pick") return [];
  const used = usedChampionsInGame(game);
  const byId = getById(champions);
  const candidates = champions.filter(
    (c) => !used.has(c.id) && !fearlessLocked.has(c.id),
  );
  if (candidates.length === 0) return [];

  const myPicks = picksFor(game, action.side);
  const oppPicks = picksFor(game, action.side === "blue" ? "red" : "blue");
  const myCounts = archetypeCounts(myPicks, byId);
  const myPicksLocked = countNonNull(myPicks);

  const ctx: PickContext = {
    side: action.side,
    byId,
    champions,
    myPicks,
    oppPicks,
    open: openLanes(myPicks, champions),
    myCounts,
    oppCounts: archetypeCounts(oppPicks, byId),
    myDmg: damageProfile(myPicks, byId),
    myPicksLocked,
    oppLaneAssignment: inferLaneAssignment(oppPicks, champions),
    identity: identityTarget(myCounts, myPicksLocked),
    enemyBannedArchetypes: archetypeCounts(
      bansFor(game, action.side === "blue" ? "red" : "blue"),
      byId,
    ),
    series: undefined,
    fearlessLocked,
    game,
    myDamageDealers: damageDealerCount(myPicks, byId),
    myPhase: phaseProfile(myPicks, byId),
    oppPhase: phaseProfile(oppPicks, byId),
  };

  const scored = candidates.map((c) => ({
    id: c.id,
    score: scorePick(c, ctx).total,
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k).map((s) => s.id);
}

// 1-ply lookahead penalty for a candidate pick. Hypothetically lock the
// candidate, predict the enemy's deterministic best response, and if the
// enemy's response is a hard counter, return a penalty. Only fires when
// the next action is genuinely an enemy pick.
//
// Bug fix (#9): the raw penalty is dampened by a "flexibility factor"
// based on remaining picks. With 4 picks left, our team can compensate
// elsewhere in the draft, so the penalty contracts to ~38% of the raw
// value. With 0 picks left (last-pick of game), we eat the full penalty
// because there's no opportunity to adapt.
export function lookaheadPenalty(
  candidate: Champion,
  ctx: PickContext,
): number {
  if (!nextActionIsEnemyPick(ctx.game, ctx.side)) return 0;
  const hypoGame = applyLock(ctx.game, candidate.id);
  const predicted = predictTopK(hypoGame, ctx.champions, ctx.fearlessLocked, 1);
  if (predicted.length === 0) return 0;
  const enemyChamp = ctx.byId.get(predicted[0]);
  if (!enemyChamp) return 0;
  const matchup = laneMatchup(candidate, enemyChamp);
  if (matchup >= -2) return 0;
  // Half-penalty (1-ply prediction is uncertain), then dampened by team
  // flexibility — fewer remaining picks means harder to compensate.
  const rawPenalty = matchup * 0.5;
  const remaining = remainingActionsForSide(ctx.game, ctx.side);
  const flexFactor = 1 / (1 + remaining.picks * 0.4);
  return rawPenalty * flexFactor;
}

// 2-ply lookahead: simulate enemy response AND our subsequent response,
// then evaluate the resulting state. Only fires for early picks (B1, R1,
// R2 — actions 6, 7, 8) where the future is most ambiguous and the most
// strategic value comes from forecasting deeper. Cost is bounded:
//
//   1 candidate × 1 enemy response × top-2 our responses × 1 enemy = 2 evals
//
// per candidate. We further restrict to top-LOOKAHEAD_TOP_K candidates,
// so total extra cost is ~5 × 2 = 10 prediction calls. Each prediction
// is ~50ms → ~500ms extra on a B1/R1 decision. Acceptable for the
// strategic gain.
//
// The penalty/bonus reflects whether the resulting "we picked X, they
// picked Y, we picked Z, they picked W" state is favorable for us.
// Specifically: if our second pick (Z) can hard-counter their response
// (Y) AND fits an open lane, the original X pick is validated by the
// chain. If we can't recover, X gets penalized harder than 1-ply alone.
export function lookahead2PlyPenalty(
  candidate: Champion,
  ctx: PickContext,
): number {
  if (!nextActionIsEnemyPick(ctx.game, ctx.side)) return 0;
  // Restrict to early picks where 2-ply has the most room. Past action
  // 11 (R3, end of phase 1 picks), enough picks are locked that 1-ply
  // captures nearly all of the strategic uncertainty.
  if (ctx.game.actionIndex > 11) return 0;
  const myId = candidate.id;
  // Step 1: hypothetically lock candidate.
  const afterMine = applyLock(ctx.game, myId);
  // Step 2: predict enemy's best response.
  const enemyTop = predictTopK(
    afterMine,
    ctx.champions,
    ctx.fearlessLocked,
    1,
  );
  if (enemyTop.length === 0) return 0;
  const afterEnemy = applyLock(afterMine, enemyTop[0]);
  // Step 3: predict our best response to the enemy's pick.
  const ourTop = predictTopK(
    afterEnemy,
    ctx.champions,
    ctx.fearlessLocked,
    2,
  );
  if (ourTop.length === 0) return 0;
  const ourResponse = ctx.byId.get(ourTop[0]);
  const enemyChamp = ctx.byId.get(enemyTop[0]);
  if (!ourResponse || !enemyChamp) return 0;
  // Did our response counter the enemy's response? If so, the original
  // candidate's choice is validated — small bonus. If our response is
  // also dominated, the candidate's choice was strategically poor.
  const counterMatchup = laneMatchup(ourResponse, enemyChamp);
  if (counterMatchup >= 2) {
    return 1.5; // we have a comeback path → small validation bonus
  }
  if (counterMatchup <= -2) {
    return -2; // our response is also countered → strategic dead end
  }
  return 0;
}

// Predict the enemy's top-K next picks for ban anticipation. Walks the
// draft order forward to the enemy's next pick action and predicts from
// that synthesized state. Acknowledged approximation: intermediate bans/
// picks between now and that synthetic action aren't simulated, so the
// pool used for prediction is slightly larger than reality.
export function predictEnemyAnticipated(
  game: GameDraft,
  mySide: Side,
  champions: Champion[],
  fearlessLocked: ReadonlySet<number>,
): Set<number> {
  const set = new Set<number>();
  const oppPicks = picksFor(game, mySide === "blue" ? "red" : "blue");
  if (!oppPicks.some((p) => p == null)) return set;
  const enemySide = mySide === "blue" ? "red" : "blue";
  const action = currentAction(game);
  if (!action) return set;
  let synthIndex = -1;
  for (let i = action.index + 1; i < TOTAL_ACTIONS; i++) {
    if (
      DRAFT_ORDER[i].kind === "pick" &&
      DRAFT_ORDER[i].side === enemySide
    ) {
      synthIndex = i;
      break;
    }
  }
  if (synthIndex < 0) return set;
  const synthGame: GameDraft = { ...game, actionIndex: synthIndex };
  const top = predictTopK(synthGame, champions, fearlessLocked, 3);
  for (const id of top) set.add(id);
  return set;
}
