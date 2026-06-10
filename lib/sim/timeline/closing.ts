// Game-ending timeline logic: the closing-fight winner decision, the
// inhibitor cascade, the final fight (teamfight / ace / backdoor), the
// nexus event, and the timeline finalization (sort + laning end + gold
// reconciliation).
//
// Extracted verbatim from generateTimeline (lib/matchSimulator.ts) — the
// bodies, constants and RNG call order are behavior-locked by
// lib/matchSimulator.golden.test.ts. The per-champion combat resolution
// (resolveCombat) stays in matchSimulator (it is shared with other
// callers); its result is passed in as ClosingCombat.

import type { Lane, Side } from "../../types";
import { backdoorBonusFor } from "../strategies";
import {
  POSITIONAL_LANES,
  aceKDA,
  describeAce,
  describeBackdoor,
  describeInhibitor,
  describeNexus,
  describeTeamfight,
  earlyCount,
  findByArchetype,
  formatTime,
  jitter,
  killsForSide,
  lateScalingCount,
  pickRandom,
  rollInt,
  singleLaneGold,
  spreadLaneGold,
  teamfightKDA,
} from "../descriptions";
import { BALANCE } from "./balance";
import {
  addEvent,
  goldPhaseWeight,
  objectiveLogit,
  picksOf,
  type TimelineContext,
} from "./context";

// The slice of resolveCombat's result the closing phases consume.
export interface ClosingCombat {
  winnerSide: Side;
  winnerKills: number;
  loserKills: number;
  ratio: number;
}

// Per-lane gold accumulated through the game = laning passive (capped at
// first-tower / minute 14) + event-driven contributions. Mirrors the
// computeLiveLaneGold logic in BetweenGamesView so the carry-bonus sees
// the same lane gold the user sees in the UI strip.
export function computeFinalLaneGold(tl: TimelineContext): Record<Lane, number> {
  const finalLaneGold: Record<Lane, number> = {
    top: 0,
    jungle: 0,
    middle: 0,
    bottom: 0,
    support: 0,
  };
  for (const e of tl.events) {
    for (const lane of POSITIONAL_LANES) {
      finalLaneGold[lane] += e.laneGoldDelta[lane] ?? 0;
    }
  }
  // Laning phase passive: per-minute g/min × time spent in laning. Use
  // the actual laning-end minute (set just below from first tower) — but
  // since that hasn't been computed yet here, approximate with the
  // standard 14-min floor capped at duration. Close enough for the
  // damage-multiplier weight.
  const lanePhaseTime = Math.min(tl.duration, 14);
  for (const lane of POSITIONAL_LANES) {
    finalLaneGold[lane] += tl.ctx.laneAdvantages[lane] * lanePhaseTime;
  }
  return finalLaneGold;
}

// ─── Closing fight: outcome based on FINAL state, no pre-decided winner ──
// The macro winrate (gold lead, momentum, objectives) combines with the
// tactical combat ratio via sigmoid. A late comp at full build can flip
// a closing fight even from behind on gold; a fed early comp that didn't
// close before scaling kicked in can still lose.
//
// Late-game gold matters less than early-game gold — comp/scaling and
// objectives close fights regardless of who farmed mid. The phase
// weight at `duration` (typically 28-40) lands ~0.6, so a 5k lead at
// 35 min reads as a moderate edge, not a guaranteed win.
//
// `ctx.diff` carries the team-score difference INCLUDING the
// star-rating scoreBias from tournament context. Feeding it directly
// into the closing logit (0.028 weight) means a 4-star gap (diff ≈
// 36) contributes ~1.0 logit on its own → roughly +25pp toward the
// favorite at the closing fight. Without this term, star rating only
// mattered indirectly via biased event-side rolls, which the gold/
// momentum random walk could wash out — 5★ teams were losing to 1★
// teams more often than the rating gap implied.
export function decideClosingWinner(
  tl: TimelineContext,
  combat: ClosingCombat,
): Side {
  const { ctx, state, duration, mods } = tl;
  // ─── Late-game payoff ──────────────────────────────────────────────────
  // The explicit "cash in on the long game" term. The longer the game runs,
  // the more a scaling-heavy comp out-classes an early-game comp in the
  // deciding fight — late carries are full-build while early champs have
  // fallen off. Zero at/under 30 min (the early comp's window), then ramps
  // up through the 50-min cap, so a team that drafted to scale is rewarded
  // for dragging the game out, and an early comp that failed to close gets
  // punished for it. Capped so a 50-min game isn't fully deterministic.
  const blueLate = lateScalingCount(ctx.bluePicks);
  const redLate = lateScalingCount(ctx.redPicks);
  const blueEarly = earlyCount(ctx.bluePicks);
  const redEarly = earlyCount(ctx.redPicks);
  // Blue-positive scaling edge: late presence helps, enemy early presence
  // helps too (it's rotted by now); own early presence slightly dampens it.
  const scalingEdge = blueLate - redLate + (redEarly - blueEarly) * 0.5;
  const lateGameRamp = Math.max(
    0,
    (duration - BALANCE.LATE_RAMP_START) / BALANCE.LATE_RAMP_DIV,
  ); // 0 @27m → ~2.9 @50m
  const scalingPayoff = Math.max(
    -BALANCE.SCALING_PAYOFF_CAP,
    Math.min(
      BALANCE.SCALING_PAYOFF_CAP,
      scalingEdge * lateGameRamp * BALANCE.SCALING_PAYOFF_WEIGHT,
    ),
  );

  const closingLogit =
    (ctx.diff * BALANCE.CLOSING_DIFF_WEIGHT +
      (state.goldLead / BALANCE.CLOSING_GOLD_NORM) * goldPhaseWeight(duration) +
      state.momentum * BALANCE.CLOSING_MOMENTUM_WEIGHT +
      objectiveLogit(tl) * BALANCE.CLOSING_OBJECTIVE_WEIGHT +
      Math.log(combat.ratio) * BALANCE.CLOSING_COMBAT_WEIGHT +
      scalingPayoff) *
    // Risk dial: high-roll flattens the deciding fight toward a coinflip
    // (helps the underdog), safe sharpens it toward the favorite.
    mods.closingRiskFactor;
  const closingProb = 1 / (1 + Math.exp(-closingLogit));
  return tl.rng() < closingProb ? "blue" : "red";
}

// 18. Inhibitor cascade. The winner busts at least one inhib pre-nexus.
// In stomps (large gold lead at this point) a 2nd or even 3rd inhib falls
// before the final fight — the loser literally can't defend because
// super minions are crashing all 3 lanes at once. Real LoL: a 1-inhib
// open is recoverable; 3-inhib open is a forfeited game.
export function phaseInhibitorCascade(
  tl: TimelineContext,
  finalWinner: Side,
): void {
  const isStomp = Math.abs(tl.state.goldLead) >= BALANCE.STOMP_LEAD;
  const isMajor = Math.abs(tl.state.goldLead) >= BALANCE.MAJOR_LEAD;
  const inhibCount = isStomp
    ? rollInt(2, 3, tl.rng)
    : isMajor
    ? rollInt(1, 2, tl.rng)
    : 1;
  const t = jitter(tl.duration - 4, tl.duration - 2, tl.rng);
  addEvent(
    tl,
    "inhibitor",
    t,
    finalWinner,
    describeInhibitor(
      finalWinner,
      picksOf(tl.ctx, finalWinner),
      tl.ctx.blueName,
      tl.ctx.redName,
      tl.rng,
    ) + (inhibCount > 1 ? ` (×${inhibCount})` : ""),
    {
      towers: killsForSide(
        finalWinner,
        rollInt(1, 2, tl.rng) + (inhibCount - 1),
        0,
      ),
      inhibs: killsForSide(finalWinner, inhibCount, 0),
      laneGoldDelta: singleLaneGold(
        pickRandom(["top", "middle", "bottom"] as Lane[], tl.rng),
        350 + (inhibCount - 1) * 200,
        finalWinner,
      ),
    },
    0.25 + (inhibCount - 1) * 0.08,
  );
}

// 19. Closing fight, ace, or backdoor. Backdoor fires only when the winner
// has a splitpush identity AND the gold lead is modest — a stomped game
// ends with a teamfight, but a tense game can end with a sneaky push.
export function phaseClosingFight(
  tl: TimelineContext,
  finalWinner: Side,
  combat: ClosingCombat,
): void {
  const t = jitter(tl.duration - 3, tl.duration - 0.7, tl.rng);
  const wScore = finalWinner === "blue" ? tl.ctx.blueScore : tl.ctx.redScore;
  const winnerPicks = picksOf(tl.ctx, finalWinner);
  const hasSplitter = !!findByArchetype(winnerPicks, ["splitpush"]);
  const closeGame = Math.abs(tl.state.goldLead) < 4000;
  const backdoorRoll = tl.rng();
  // Committing to a 1-3-1 / splitpush plan makes the sneaky map-ending
  // backdoor meaningfully more likely for that team. A mid-game splitpush
  // PIVOT (adaptiveMidgame) that actually completed the comeback gets the
  // same widened window — the desperate 1-3-1 ending on a backdoor is the
  // whole story of that pivot. tl.pivot is undefined on the default path,
  // so the bonus is exactly 0 there.
  const winnerStrategy =
    finalWinner === "blue" ? tl.ctx.blueStrategy : tl.ctx.redStrategy;
  const pivotBackdoorBonus =
    tl.pivot && tl.pivot.kind === "splitpush" && tl.pivot.side === finalWinner
      ? 0.12
      : 0;
  const useBackdoor =
    hasSplitter &&
    closeGame &&
    backdoorRoll < 0.12 + backdoorBonusFor(winnerStrategy) + pivotBackdoorBonus;
  if (useBackdoor) {
    const bdWk = rollInt(0, 1, tl.rng);
    const bdLk = rollInt(0, 1, tl.rng);
    addEvent(
      tl,
      "backdoor",
      t,
      finalWinner,
      describeBackdoor(
        finalWinner,
        winnerPicks,
        tl.ctx.blueName,
        tl.ctx.redName,
      ),
      {
        kills: killsForSide(finalWinner, bdWk, bdLk),
        towers: killsForSide(finalWinner, rollInt(1, 2, tl.rng), 0),
        laneGoldDelta: spreadLaneGold(400, finalWinner),
        kdaDelta: teamfightKDA(finalWinner, bdWk, bdLk, tl.rng),
      },
      0.5,
    );
  } else if (tl.rng() < 0.5) {
    addEvent(
      tl,
      "ace",
      t,
      finalWinner,
      describeAce(finalWinner, tl.ctx.blueName, tl.ctx.redName),
      {
        kills: killsForSide(finalWinner, 5, 0),
        towers: killsForSide(finalWinner, rollInt(1, 2, tl.rng), 0),
        laneGoldDelta: spreadLaneGold(800, finalWinner),
        kdaDelta: aceKDA(finalWinner),
      },
      0.5,
    );
  } else {
    // Closing teamfight uses the per-champion combat resolution computed
    // above. If the final winner aligns with combat.winnerSide (the team
    // with combat dominance), use combat's kill spread directly. If the
    // macro logit pushed an upset (winner is the combat-loser), shrink
    // the spread — close fights, not stomps.
    const aligned = finalWinner === combat.winnerSide;
    const wk = aligned
      ? combat.winnerKills
      : Math.max(2, combat.winnerKills - 2);
    const lk = aligned
      ? combat.loserKills
      : Math.min(3, combat.loserKills + 1);
    addEvent(
      tl,
      "teamfight",
      t,
      finalWinner,
      describeTeamfight(
        finalWinner,
        winnerPicks,
        wScore.identityLabel,
        wk,
        lk,
        tl.rng,
      ),
      {
        kills: killsForSide(finalWinner, wk, lk),
        towers: killsForSide(finalWinner, rollInt(1, 2, tl.rng), 0),
        laneGoldDelta: spreadLaneGold(wk * 200, finalWinner),
        kdaDelta: teamfightKDA(finalWinner, wk, lk, tl.rng),
      },
      0.45,
    );
  }
}

// 20. Nexus
export function phaseNexus(tl: TimelineContext, finalWinner: Side): void {
  addEvent(
    tl,
    "nexus",
    tl.duration,
    finalWinner,
    describeNexus(
      finalWinner,
      tl.ctx.blueName,
      tl.ctx.redName,
      formatTime(tl.duration),
    ),
    {
      towers: killsForSide(finalWinner, 2, 0),
      laneGoldDelta: spreadLaneGold(500, finalWinner),
    },
    0,
  );
}

// Sort the timeline, derive the laning-end minute, and reconcile every
// event's goldLeadAfter with the displayed lane-gold model. Returns the
// laning-end minute.
export function finalizeTimeline(tl: TimelineContext): number {
  const { events } = tl;
  events.sort((a, b) => a.minutes - b.minutes);

  // Lane phase officially ends when the first outer turret falls. If no
  // early tower fell (rare — usually first-tower fires by min 12-13), the
  // historical laning floor of 14 is the fallback.
  const firstTower = events.find(
    (e) =>
      e.type === "tower" && (e.towers.blue > 0 || e.towers.red > 0) &&
      e.minutes < 18,
  );
  const laningEndMinute = firstTower?.minutes ?? 14;

  // ─── Reconcile goldLeadAfter with the displayed lane-gold model ───────
  // During event generation, `state.goldLead` only tracks kill/tower/
  // inhib bounties (300/550/800g) — the values that drive the sim's
  // win-prob math. The UI's gold scoreboard, however, uses a different
  // model: lane-economy gold = sum(laneAdvantages × lanePhaseTime) +
  // sum(per-event laneGoldDelta). The two scales diverge by an order of
  // magnitude (chart showed ~3-4k while scoreboard showed ~30-40k).
  //
  // Re-snapshot goldLeadAfter on every event using the lane-economy
  // model so the chart and scoreboard always agree. Walk events in
  // sorted order, accumulate laneGoldDelta totals, add the laning
  // passive (capped at laningEndMinute), and overwrite goldLeadAfter.
  let laneAdvSum = 0;
  for (const lane of POSITIONAL_LANES) laneAdvSum += tl.ctx.laneAdvantages[lane];
  let cumulativeEventGold = 0;
  for (const e of events) {
    for (const lane of POSITIONAL_LANES) {
      cumulativeEventGold += e.laneGoldDelta[lane] ?? 0;
    }
    const lanePhaseTime = Math.min(e.minutes, laningEndMinute);
    e.goldLeadAfter = Math.round(
      laneAdvSum * lanePhaseTime + cumulativeEventGold,
    );
  }

  return laningEndMinute;
}
