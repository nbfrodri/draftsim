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
  // The Dragon Soul element a team secured — gives that team a small
  // type-specific edge (Infernal fights hardest, Mountain defends, etc.).
  soulType: string | null;
  // Live per-lane advantage (blue-positive g/min-equivalent). Seeded from the
  // static draft laneAdvantages, then snowballed by in-lane kills so a fed lane
  // keeps producing kills and objective priority (see bumpLaneLead).
  laneLead: Record<Lane, number>;
  // The side that landed the most recent gank — lets the next counter-gank
  // respond (more likely, biased back toward the team that got ganked).
  lastGankSide: Side | null;
  // Baron buff window: who holds it and when it lapses. The siege edge only
  // tilts tower rolls while `time <= baronExpiresAt` (see rollTowerSide).
  baronExpiresAt: number | null;
  baronSide: Side | null;
  elderSide: Side | null;
  // Transient "we just caught someone" edge: a successful pick / vision-pick
  // leaves the enemy a man down, so the NEXT neutral objective tilts toward
  // this side until `expiresAt`. Read by rollEventSide; modest, decays on its
  // own. Models the pick → free-objective causal chain real games show.
  pickAdvantage: { side: Side; expiresAt: number } | null;
  // Pressure on enemy turrets accumulated from grubs/herald — biases the side
  // selection of subsequent tower events. Decays as towers fall.
  towerPressure: { blue: number; red: number };
  // Map control = enemy towers each side has taken. Open map → more vision and
  // more picks for the side that cracked them. Accumulated in applyState from
  // every event's tower delta; read by the vision/pick rolls.
  mapControl: { blue: number; red: number };
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
  // Blue's combat-strength ratio (rich model — items/EHP/comp identity/CC) at
  // a game time + gold lead. Injected to avoid a circular import; the mid
  // teamfight scales its kill spread by it, the SAME model the closing fight
  // uses. >1 favours blue.
  combatRatioBlue: (
    bluePicks: (Champion | null)[],
    redPicks: (Champion | null)[],
    time: number,
    goldLead: number,
  ) => number;
  fightDominance: (myFactor: number, oppFactor: number) => number;
  // Set by maybeMidgamePivot (./fights) when ctx.adaptiveMidgame is on and
  // one side committed to a mid-game pivot. Read by phaseClosingFight (a
  // splitpush pivot raises the winner's backdoor odds). Optional so the
  // orchestrator's literal — and every default-path game — never sets it.
  pivot?: MidgamePivot | null;
}

export const clampChance = (p: number) => Math.max(0.1, Math.min(0.9, p));

// Dragon Soul element → a small, type-specific edge for the team that secured
// it. `fight` adds to that team's teamfight dominance (Infernal hits hardest);
// `stealResist` lowers the chance their objectives get stolen (Mountain's
// fortified defense). Types not listed fall back to a modest baseline.
const SOUL_FIGHT_EDGE: Record<string, number> = {
  Infernal: 0.12,
  Chemtech: 0.09,
  Ocean: 0.07,
  Hextech: 0.06,
  Cloud: 0.05,
  Mountain: 0.05,
};
const SOUL_STEAL_RESIST: Record<string, number> = {
  Mountain: 0.08,
};

function soulFightEdge(soulType: string | null): number {
  if (!soulType) return 0;
  return SOUL_FIGHT_EDGE[soulType] ?? 0.06;
}

// Objective steal probability. Modulated by the teams' risk dials and, when the
// contesting side is known, by vision/score causality: the contesting team's
// map control protects the pit (they see the smiter coming), a Mountain-soul
// holder defends it harder, and a side far behind on gold throws desperation
// coin-flip smites at the OPPONENT's objective.
export function stealChance(
  tl: TimelineContext,
  base: number,
  contestSide?: Side,
): number {
  let v = base + tl.mods.stealChanceDelta;
  if (contestSide) {
    const { state } = tl;
    const sign = contestSide === "blue" ? 1 : -1;
    // Contesting side's net towers (map control) → vision over the pit.
    const myMapControl = sign * (state.mapControl.blue - state.mapControl.red);
    v -= Math.max(0, myMapControl) * BALANCE.STEAL_VISION_REDUCTION;
    // Mountain soul: fortified, harder to steal from.
    if (state.soulSide === contestSide) {
      v -= SOUL_STEAL_RESIST[state.soulType ?? ""] ?? 0;
    }
    // The trailing OPPONENT (who would do the stealing) goes for coin flips.
    const oppLead = -sign * state.goldLead; // opponent's gold lead, +ve = ahead
    if (oppLead < -BALANCE.STEAL_DESPERATION_DEFICIT) {
      v += BALANCE.STEAL_DESPERATION;
    }
  }
  return Math.max(0, Math.min(BALANCE.STEAL_CHANCE_CAP, v));
}

// Objective → fight strength. A live Baron/Elder or a secured Soul makes the
// holder win the actual teamfight harder — returned as a 0..~0.4 bonus added
// to fight dominance. `time` gates Baron to its active buff window.
export function objectiveFightEdge(
  tl: TimelineContext,
  side: Side,
  time: number,
): number {
  const { state } = tl;
  let edge = 0;
  if (
    state.baronSide === side &&
    state.baronExpiresAt != null &&
    time <= state.baronExpiresAt
  ) {
    edge += BALANCE.OBJ_FIGHT_EDGE_BARON;
  }
  if (state.elderSide === side) edge += BALANCE.OBJ_FIGHT_EDGE_ELDER;
  if (state.soulSide === side) edge += soulFightEdge(state.soulType);
  return edge;
}

// Net objective fight edge (this side's minus the opponent's), for adjusting a
// fight's kill spread toward whoever holds the buffs.
export function netObjectiveFightEdge(
  tl: TimelineContext,
  side: Side,
  time: number,
): number {
  const opp: Side = side === "blue" ? "red" : "blue";
  return objectiveFightEdge(tl, side, time) - objectiveFightEdge(tl, opp, time);
}

// Snowball a lane: a kill in `lane` for `side` feeds that lane's live
// advantage, so a fed lane keeps producing kills + objective prio.
export function bumpLaneLead(
  tl: TimelineContext,
  side: Side,
  lane: Lane,
  kills: number = 1,
): void {
  const delta =
    (side === "blue" ? 1 : -1) * kills * BALANCE.LANE_SNOWBALL_PER_KILL;
  tl.state.laneLead[lane] += delta;
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

// Transient man-advantage tilt from a fresh pick/vision-pick: the side that
// just caught someone is favored on the next neutral objective until the
// window lapses. Zero once expired (or never set), so default games are
// unaffected. The tilt grows with game time — respawn timers lengthen, so a
// late pick buys a far bigger "free objective" window than an early one.
export function pickAdvantageBias(tl: TimelineContext, time: number): number {
  const pa = tl.state.pickAdvantage;
  if (!pa || time > pa.expiresAt) return 0;
  const timeScale = Math.min(
    BALANCE.PICK_ADVANTAGE_LATE_MULT,
    1 + Math.max(0, time - 15) / 20,
  );
  return (
    (pa.side === "blue" ? 1 : -1) * BALANCE.PICK_ADVANTAGE_BIAS * timeScale
  );
}

// Lane-priority tilt for a neutral objective: only the lanes ADJACENT to it
// lend their pressure — bot+support+jungle contest the dragon, top+mid+jungle
// contest Herald/Rift. Blue-positive, normalized like laneBias. This is the
// macro chain "won my lane → I have prio on the nearby objective".
export function objectivePrioBias(
  tl: TimelineContext,
  kind: "drake" | "herald",
): number {
  // Read the LIVE lane lead (seeded from draft, snowballed by kills) so a lane
  // that snowballed translates into prio on its neighbouring objective.
  const la = tl.state.laneLead;
  const lanes: Lane[] =
    kind === "drake"
      ? ["bottom", "support", "jungle"]
      : ["top", "middle", "jungle"];
  let sum = 0;
  for (const lane of lanes) sum += la[lane];
  return sum / 1000;
}

// Map-control tilt: net enemy towers taken favors the side with the open map
// on the next vision/pick. Total towers down raises how OFTEN a vision-pick
// fires (more uncontested map to ward and catch on).
export function mapControlBias(tl: TimelineContext): number {
  return (
    (tl.state.mapControl.blue - tl.state.mapControl.red) *
    BALANCE.MAP_CONTROL_BIAS
  );
}

export function mapControlChance(tl: TimelineContext): number {
  return (
    (tl.state.mapControl.blue + tl.state.mapControl.red) *
    BALANCE.MAP_CONTROL_VISION_CHANCE
  );
}

// Composition win-condition pull: a comp's drafted macro biases the events it
// wants. "splitpush" comps pull cross-map trades/backdoors; "group" comps pull
// the teamfight. Blue-positive; cancels when both sides share the macro, so
// default group-vs-group games (and the calibration mirror) are untouched.
export function macroEventBias(
  tl: TimelineContext,
  kind: "trade" | "teamfight" | "tower" | "pick",
): number {
  const want =
    kind === "trade"
      ? "splitpush"
      : kind === "teamfight"
      ? "group"
      : kind === "tower"
      ? "siege"
      : "pick";
  let bias = 0;
  if (tl.ctx.blueStrategy.macro === want) bias += BALANCE.MACRO_EVENT_BIAS;
  if (tl.ctx.redStrategy.macro === want) bias -= BALANCE.MACRO_EVENT_BIAS;
  return bias;
}

// Tower events use the standard side roll plus a tilt from accumulated
// tower pressure. Sides that took grubs/herald are more likely to crack
// turrets next; pressure is consumed when a tower falls. While a Baron buff
// is live its taker gets an extra siege tilt — but only until the buff lapses
// (baronExpiresAt), so a stale Nashor doesn't bias towers forever.
export function rollTowerSide(tl: TimelineContext, time: number): Side {
  let pressureDiff = tl.state.towerPressure.blue - tl.state.towerPressure.red;
  if (
    tl.state.baronExpiresAt != null &&
    time <= tl.state.baronExpiresAt &&
    tl.state.baronSide
  ) {
    pressureDiff +=
      (tl.state.baronSide === "blue" ? 1 : -1) * BALANCE.BARON_TOWER_PRESSURE;
  }
  // A siege comp (poke + grouped tower pressure) cracks turrets more readily.
  return rollEventSide(
    tl,
    time,
    pressureDiff * BALANCE.TOWER_PRESSURE_BIAS + macroEventBias(tl, "tower"),
  );
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
  // Every tower (and inhib) a side cracks opens that much more of the map.
  state.mapControl.blue += towers.blue + inhibs.blue;
  state.mapControl.red += towers.red + inhibs.red;
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
    // Objective metadata surfaced to the UI badges (soul element, atakhan
    // variant). Only the soul/atakhan events set these.
    soulElement?: string;
    atakhanVariant?: AtakhanVariant;
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
    momentumAfter: tl.state.momentum,
    mapControlAfter: tl.state.mapControl.blue - tl.state.mapControl.red,
    ...(deltas.soulElement ? { soulElement: deltas.soulElement } : {}),
    ...(deltas.atakhanVariant ? { atakhanVariant: deltas.atakhanVariant } : {}),
  });
}
