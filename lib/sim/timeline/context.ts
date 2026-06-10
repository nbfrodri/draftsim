// Shared state + helpers for the timeline state machine.
//
// generateTimeline (lib/matchSimulator.ts) used to be a single ~1,500-line
// function whose phase blocks shared a mutated MatchState and a set of
// helper closures (rollEventSide, applyState, addEvent, ...). The closures
// now live here as top-level functions taking a TimelineContext, so each
// phase (lib/sim/timeline/{laning,objectives,fights,closing}.ts) is an
// individually-testable function and generateTimeline is an orchestrator.
//
// CRITICAL: the math here is copied verbatim from the original closures —
// RNG call order/count and every constant are behavior-locked by
// lib/matchSimulator.golden.test.ts.

import type { Champion, Lane, Side } from "../../types";
import type { RNG } from "../../rng";
import type {
  AtakhanVariant,
  EventKDA,
  EventKills,
  EventType,
  MatchEvent,
  TeamScore,
} from "../types";
import type { StrategyTimelineModifiers, TeamStrategy } from "../strategies";
import {
  NO_KDA,
  NO_KILLS,
  formatTime,
  kdaToLaneGold,
  mergeLaneGold,
} from "../descriptions";
import { BALANCE } from "./balance";

export interface TimelineCtx {
  diff: number;
  blueScore: TeamScore;
  redScore: TeamScore;
  bluePicks: (Champion | null)[];
  redPicks: (Champion | null)[];
  blueName: string;
  redName: string;
  laneAdvantages: Record<Lane, number>;
  // Each team's committed game plan. Always present (DEFAULT_STRATEGY when
  // the caller didn't set one) so timeline code can read them unconditionally.
  blueStrategy: TeamStrategy;
  redStrategy: TeamStrategy;
  // Opt-in mid-game adaptation: around minute ~20, a side that is clearly
  // behind pivots its effective strategy for the remainder (see
  // maybeMidgamePivot in ./fights). undefined/false → the timeline code path
  // is completely unchanged (golden-locked behavior).
  adaptiveMidgame?: boolean;
}

// How a losing team pivots at the ~min-20 checkpoint (adaptiveMidgame):
//   "all-in"         — a failed slow/scaling plan flips to desperation picks
//                      + a Baron-or-bust call.
//   "splitpush"      — behind against a grouped siege, send the side lanes
//                      wide and threaten the backdoor.
//   "objective-rush" — default: trade everything for the next neutral take.
export type PivotKind = "all-in" | "splitpush" | "objective-rush";

export interface MidgamePivot {
  side: Side;
  kind: PivotKind;
}

export interface MatchState {
  goldLead: number;
  momentum: number;
  drakes: { blue: number; red: number };
  soulSide: Side | null;
  baronExpiresAt: number | null;
  elderSide: Side | null;
  // Pressure on enemy turrets accumulated from grubs/herald — biases the side
  // selection of subsequent tower events. Decays as towers fall.
  towerPressure: { blue: number; red: number };
  // Voidgrubs taken per side. The 6-grub spike is the meaningful threshold;
  // each grub contributes a small tower-damage bonus that compounds.
  grubCount: { blue: number; red: number };
  // Atakhan tracking. Voracious gives a kill-gold bonus to subsequent
  // skirmish/teamfight events on its side. Ruinous gives a one-shot revive
  // that softens the side's NEXT lost fight (kills_against -1 once).
  atakhanVariant: AtakhanVariant | null;
  atakhanSide: Side | null;
  ruinousActive: boolean;
}

export function picksOf(ctx: TimelineCtx, side: Side): (Champion | null)[] {
  return side === "blue" ? ctx.bluePicks : ctx.redPicks;
}

// Everything a timeline phase needs: the immutable draft context, the
// mutable match state, the event sink, the injected RNG, and the pre-
// computed biases/modifiers that used to be closure-captured locals.
export interface TimelineContext {
  ctx: TimelineCtx;
  duration: number;
  rng: RNG;
  state: MatchState;
  events: MatchEvent[];
  // Lane priority bias: summed per-lane g/min advantages / 1000. Blue-
  // positive; feeds typeBias on early/mid objective rolls.
  laneBias: number;
  // Strategy timeline modifiers derived from both teams' game plans.
  mods: StrategyTimelineModifiers;
  // Power-spike fight window: blue-positive bias from how many carries each
  // side has online at a given minute (closure built by the orchestrator).
  spikeBias: (time: number) => number;
  // Fight-strength helpers shared with the pregame model — injected by the
  // orchestrator (they live in matchSimulator) to avoid a circular import.
  teamFightFactor: (picks: (Champion | null)[], time: number) => number;
  fightDominance: (myFactor: number, oppFactor: number) => number;
  // Track whether a kill has already landed before the first-blood event
  // window — used to label first-blood correctly. If invade or solo kills
  // already drew first blood, the actual first-blood event becomes an
  // "early kill" instead so the timeline doesn't claim two first bloods.
  firstKillTaken: boolean;
  // Set by maybeMidgamePivot (./fights) when ctx.adaptiveMidgame is on and
  // one side committed to a mid-game pivot. Read by phaseClosingFight (a
  // splitpush pivot raises the winner's backdoor odds). Optional so the
  // orchestrator's literal — and every default-path game — never sets it.
  pivot?: MidgamePivot | null;
}

export const clampChance = (p: number) => Math.max(0.1, Math.min(0.9, p));

// Objective steal probability, modulated by the teams' risk dials.
export function stealChance(tl: TimelineContext, base: number): number {
  return Math.max(
    0,
    Math.min(BALANCE.STEAL_CHANCE_CAP, base + tl.mods.stealChanceDelta),
  );
}

// Objectives that meaningfully tilt the win odds beyond raw gold:
//   - drakes stack a small per-stack bonus (8% logit per drake-difference)
//   - soul = persistent execute threat (~+11pp swing)
//   - elder = finishing buff (~+17pp swing)
// These compound with goldLead/momentum, so a team that took soul AND elder
// is in commanding position even without a crushing gold lead.
export function objectiveLogit(tl: TimelineContext): number {
  const { state } = tl;
  const drakeFactor =
    (state.drakes.blue - state.drakes.red) * BALANCE.DRAKE_LOGIT_PER_STACK;
  const soulFactor =
    state.soulSide === "blue"
      ? BALANCE.SOUL_LOGIT
      : state.soulSide === "red"
      ? -BALANCE.SOUL_LOGIT
      : 0;
  const elderFactor =
    state.elderSide === "blue"
      ? BALANCE.ELDER_LOGIT
      : state.elderSide === "red"
      ? -BALANCE.ELDER_LOGIT
      : 0;
  // Atakhan grants a persistent fight-winrate edge to its taker — extra
  // gold from kills (Voracious) or extra revives (Ruinous) both make
  // subsequent fights easier to close. Reflected here as a smaller
  // permanent logit shift (~+5pp swing) so the side that took it is
  // measurably more likely to win every subsequent rollEventSide.
  const atakhanFactor =
    state.atakhanSide === "blue"
      ? BALANCE.ATAKHAN_LOGIT
      : state.atakhanSide === "red"
      ? -BALANCE.ATAKHAN_LOGIT
      : 0;
  return drakeFactor + soulFactor + elderFactor + atakhanFactor;
}

// Gold-lead weight by game phase. Real LoL: a 2k lead at 10 min means
// tower plates, denied items, snowballed lanes — game-defining. The same
// 2k lead at 30 min is one shutdown away from being neutralized, and the
// outcome leans on objectives/scaling instead. Curve:
//   t = 8  → 1.7×   (early — gold is leverage)
//   t = 15 → 1.25×  (laning ending)
//   t = 22 → 0.9×   (mid game — closer to even)
//   t = 32 → 0.6×   (late — comp/objectives dominate)
export function goldPhaseWeight(time: number): number {
  if (time <= BALANCE.GOLD_WEIGHT_EARLY_MIN) return BALANCE.GOLD_WEIGHT_EARLY;
  if (time >= BALANCE.GOLD_WEIGHT_LATE_MIN) return BALANCE.GOLD_WEIGHT_LATE;
  // Linear interp between (6, 1.8) and (35, 0.55)
  return (
    BALANCE.GOLD_WEIGHT_EARLY -
    ((time - BALANCE.GOLD_WEIGHT_EARLY_MIN) / BALANCE.GOLD_WEIGHT_SPAN) *
      BALANCE.GOLD_WEIGHT_DROP
  );
}

export function snapshotProb(tl: TimelineContext, time: number): number {
  const compFactor = tl.ctx.diff * BALANCE.COMP_DIFF_WEIGHT;
  const goldFactor =
    (tl.state.goldLead / BALANCE.GOLD_LEAD_NORM) * goldPhaseWeight(time);
  const momFactor = tl.state.momentum * BALANCE.MOMENTUM_WEIGHT;
  const blueBonus = BALANCE.BLUE_SIDE_BONUS;
  const logit =
    compFactor + goldFactor + momFactor + objectiveLogit(tl) + blueBonus;
  return Math.max(
    BALANCE.SNAPSHOT_PROB_MIN,
    Math.min(BALANCE.SNAPSHOT_PROB_MAX, 1 / (1 + Math.exp(-logit))),
  );
}

export function rollEventSide(
  tl: TimelineContext,
  time: number,
  typeBias: number = 0,
): Side {
  const compFactor = tl.ctx.diff * BALANCE.COMP_DIFF_WEIGHT;
  const goldFactor =
    (tl.state.goldLead / BALANCE.GOLD_LEAD_NORM) * goldPhaseWeight(time);
  const momFactor = tl.state.momentum * BALANCE.MOMENTUM_WEIGHT;
  const blueBonus = BALANCE.BLUE_SIDE_BONUS;
  const logit =
    compFactor +
    goldFactor +
    momFactor +
    objectiveLogit(tl) +
    typeBias +
    blueBonus;
  const probBlue = 1 / (1 + Math.exp(-logit));
  const clamped = Math.max(
    BALANCE.EVENT_PROB_MIN,
    Math.min(BALANCE.EVENT_PROB_MAX, probBlue),
  );
  return tl.rng() < clamped ? "blue" : "red";
}

// Tower events use the standard side roll plus a tilt from accumulated
// tower pressure. Sides that took grubs/herald are more likely to crack
// turrets next; pressure is consumed when a tower falls.
export function rollTowerSide(tl: TimelineContext, time: number): Side {
  const pressureDiff = tl.state.towerPressure.blue - tl.state.towerPressure.red;
  return rollEventSide(tl, time, pressureDiff * BALANCE.TOWER_PRESSURE_BIAS);
}

export function consumeTowerPressure(tl: TimelineContext, side: Side): void {
  tl.state.towerPressure[side] = Math.max(
    0,
    tl.state.towerPressure[side] - BALANCE.TOWER_PRESSURE_CONSUME,
  );
}

export function detectComeback(
  tl: TimelineContext,
  side: Side,
  momentumImpact: number,
): string {
  if (momentumImpact < BALANCE.COMEBACK_MIN_IMPACT) return "";
  const wasLosing =
    (side === "blue" &&
      (tl.state.goldLead < -BALANCE.COMEBACK_GOLD_DEFICIT ||
        tl.state.momentum < -BALANCE.COMEBACK_MOMENTUM_DEFICIT)) ||
    (side === "red" &&
      (tl.state.goldLead > BALANCE.COMEBACK_GOLD_DEFICIT ||
        tl.state.momentum > BALANCE.COMEBACK_MOMENTUM_DEFICIT));
  return wasLosing ? "MOMENTUM SHIFT! " : "";
}

// Converts an event's kill/tower/inhib deltas into team gold + momentum
// (see BALANCE for the per-unit gold values).
export function applyState(
  tl: TimelineContext,
  side: Side,
  kills: EventKills,
  towers: EventKills,
  inhibs: EventKills,
  momentumImpact: number,
): void {
  const { state } = tl;
  state.goldLead +=
    (kills.blue - kills.red) * BALANCE.KILL_GOLD +
    (towers.blue - towers.red) * BALANCE.TOWER_GOLD +
    (inhibs.blue - inhibs.red) * BALANCE.INHIB_GOLD;
  state.momentum *= BALANCE.MOMENTUM_DECAY;
  state.momentum += side === "blue" ? momentumImpact : -momentumImpact;
  state.momentum = Math.max(-1, Math.min(1, state.momentum));
}

export function addEvent(
  tl: TimelineContext,
  type: EventType,
  minutes: number,
  side: Side,
  description: string,
  deltas: {
    kills?: EventKills;
    towers?: EventKills;
    inhibs?: EventKills;
    laneGoldDelta?: Partial<Record<Lane, number>>;
    kdaDelta?: EventKDA;
  } = {},
  momentumImpact: number = 0.15,
): void {
  const kills = deltas.kills ?? NO_KILLS;
  const towers = deltas.towers ?? NO_KILLS;
  const inhibs = deltas.inhibs ?? NO_KILLS;
  const baseLaneGold = deltas.laneGoldDelta ?? {};
  const kdaDelta = deltas.kdaDelta ?? NO_KDA;
  // Auto-merge kill-derived gold into the lane gold delta. Each kill
  // (300g) and assist (100g) flow to the lane that earned them, so a
  // champion with 8K/0D against their lane opponent visibly gains gold
  // — fixing the "spread evenly across 5 lanes" averaging bug for
  // teamfights, skirmishes, and other multi-kill events.
  const laneGoldDelta = mergeLaneGold(baseLaneGold, kdaToLaneGold(kdaDelta));
  const flair = detectComeback(tl, side, momentumImpact);
  applyState(tl, side, kills, towers, inhibs, momentumImpact);
  const winProbAfter = snapshotProb(tl, minutes);
  tl.events.push({
    type,
    minutes,
    time: formatTime(minutes),
    side,
    description: flair + description,
    kills,
    towers,
    inhibs,
    laneGoldDelta,
    kdaDelta,
    winProbAfter,
    // Snapshot the post-event gold lead so the UI can render a
    // gold-over-time chart without re-walking laneGoldDelta. Captures
    // the same applyState() output that drives win-prob.
    goldLeadAfter: tl.state.goldLead,
  });
}
