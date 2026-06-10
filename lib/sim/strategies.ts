// ─── Team strategies ──────────────────────────────────────────────────────
//
// After the draft locks but before the match simulates, each team commits to
// a game plan. A strategy is a small set of "levers" — high-level macro
// decisions a coaching staff would make once they see both comps: how the
// jungler spends time, which solo lane plays weakside, whether the team
// groups / splits / picks, what objectives it prioritizes, and how
// aggressive its early tempo is.
//
// Strategies feed the simulator in two ways:
//   1. Comp fit (strategyFit) — a small score-diff bias. A plan that matches
//      the drafted comp's identity is rewarded; a mismatched one (scaling
//      with an all-early comp, splitpush with no splitpusher) is penalized.
//      This is what makes the choice meaningful instead of cosmetic.
//   2. Timeline modifiers (strategyTimelineModifiers + applyWeaksideToLaneAdv)
//      — shift WHEN and WHETHER events fire (more ganks, earlier objectives,
//      longer games, weakside lanes) so the simulated story reflects the plan.
//
// The DEFAULT_STRATEGY is deliberately neutral on every lever so existing
// callers (and tests) that don't set a strategy simulate exactly as before.

import type { Champion, Lane, Roster } from "../types";
import type { Archetype } from "../championMeta";
import { PLAYER_TIER_VALUE } from "../players";
import { earlyCount, findByArchetype, laneOf, lateScalingCount, metaFor } from "./descriptions";

// ─── Lever value unions ─────────────────────────────────────────────────────

export type GamePlan = "early-snowball" | "teamfight" | "scaling";
// "invade" is hyper-aggressive early jungling (counter-jungle + lane camps);
// "counter-jungle" is the lower-risk version (scuttle/vision control).
export type JungleFocus =
  | "invade"
  | "counter-jungle"
  | "gank"
  | "balanced"
  | "farm";
// Which solo lane is sacrificed to fund the rest of the map. "none" = play
// the map even (standard 2-1-2 / lane-of-attrition).
export type WeaksideLane = "top" | "bottom" | "none";
// "siege" = grouped poke + tower pressure (a slow, methodical macro).
export type MacroStyle = "group" | "splitpush" | "pick" | "siege";
export type ObjectiveFocus =
  | "dragon"
  | "baron"
  | "herald"
  | "atakhan"
  | "balanced";
export type Tempo = "aggressive" | "standard" | "passive";
// Variance dial: how swingy the team plays. "high-roll" forces coinflip smites
// and all-ins (good when behind); "safe" avoids them (good when ahead).
export type RiskLevel = "safe" | "standard" | "high-roll";
// Which lane the team funnels resources INTO (its primary carry). The mirror
// of `weakside` (which lane to starve). "spread" = no single win condition.
export type WinCondition = "top-carry" | "mid-carry" | "bot-carry" | "spread";
// How the team wants to commit to fights — a comp-identity lever ("front to
// back, picks"). "balanced" is the neutral default.
export type FightStyle = "balanced" | "front-to-back" | "flank" | "poke";
// Vision tempo: proactive teams set deep vision for picks/objective control;
// reactive teams ward defensively.
export type VisionControl = "proactive" | "standard" | "reactive";
// ─── Per-lane assignments ────────────────────────────────────────────────────
// How the toplaner spends the game: stay grouped, split a side lane (1-3-1),
// or rotate to objectives with the team.
export type TopPlay = "group" | "splitpush" | "rotate";
// What the midlaner does with lane prio: hold lane, roam to side lanes, or
// shove for prio and set up objectives.
export type MidPlay = "standard" | "roam" | "push-prio";
// Bot lane's 2v2 posture: trade evenly, dive aggressively, or farm to scale.
export type BotPlay = "standard" | "dive" | "scale";
// Support's job: hold lane, roam for picks, or peel/protect the carry.
export type SupportPlay = "lane" | "roam" | "protect";
// Which enemy lane to hunt with picks/shutdowns. "balanced" = no single focus.
export type PickTarget = "balanced" | "top" | "mid" | "bot";
// Send the bot duo top (and solo laner bot) for an early-game lane swap.
export type LaneSwap = "standard" | "lane-swap";

export interface TeamStrategy {
  gamePlan: GamePlan;
  jungle: JungleFocus;
  weakside: WeaksideLane;
  winCondition: WinCondition;
  macro: MacroStyle;
  fightStyle: FightStyle;
  objective: ObjectiveFocus;
  vision: VisionControl;
  tempo: Tempo;
  risk: RiskLevel;
  pickTarget: PickTarget;
  laneSwap: LaneSwap;
  // Per-lane assignments (lane-specific refinements of the team plan).
  topPlay: TopPlay;
  midPlay: MidPlay;
  botPlay: BotPlay;
  supportPlay: SupportPlay;
}

// Neutral on every axis — the simulator behaves identically to the
// pre-strategy build when both teams use this.
// Every field's value here is the NEUTRAL one — it must contribute nothing to
// strategyFit or the timeline so games that skip the strategy step (both sides
// on DEFAULT_STRATEGY) simulate exactly as the pre-strategy build did.
export const DEFAULT_STRATEGY: TeamStrategy = {
  gamePlan: "teamfight",
  jungle: "balanced",
  weakside: "none",
  winCondition: "spread",
  macro: "group",
  fightStyle: "balanced",
  objective: "balanced",
  vision: "standard",
  tempo: "standard",
  risk: "standard",
  pickTarget: "balanced",
  laneSwap: "standard",
  topPlay: "group",
  midPlay: "standard",
  botPlay: "standard",
  supportPlay: "lane",
};

// ─── UI descriptor ───────────────────────────────────────────────────────────
// Drives the StrategyView controls generically so the component doesn't
// hard-code six near-identical segmented controls. `key` is the TeamStrategy
// field; each option is `{ value, label, blurb }`.

export interface StrategyLeverOption {
  value: string;
  label: string;
  blurb: string;
}

// Levers are grouped into sections in the StrategyView for legibility.
export type StrategyGroup = "Team Plan" | "Map & Resources" | "Lane Assignments";
export const STRATEGY_GROUP_ORDER: StrategyGroup[] = [
  "Team Plan",
  "Map & Resources",
  "Lane Assignments",
];

export interface StrategyLever {
  key: keyof TeamStrategy;
  label: string;
  group: StrategyGroup;
  options: StrategyLeverOption[];
}

export const STRATEGY_LEVERS: StrategyLever[] = [
  // ── Team Plan ──────────────────────────────────────────────────────────
  {
    key: "gamePlan",
    label: "Game Plan",
    group: "Team Plan",
    options: [
      { value: "early-snowball", label: "Early Snowball", blurb: "Win lanes, take tempo, end before they scale." },
      { value: "teamfight", label: "Teamfight", blurb: "Group mid-game and win 5v5 around objectives." },
      { value: "scaling", label: "Scale", blurb: "Survive early, win the late game on items." },
    ],
  },
  {
    key: "tempo",
    label: "Tempo",
    group: "Team Plan",
    options: [
      { value: "aggressive", label: "Aggressive", blurb: "Force fights and dives; high risk, high reward." },
      { value: "standard", label: "Standard", blurb: "Fight when ahead, respect when even." },
      { value: "passive", label: "Passive / Safe", blurb: "Avoid deaths, farm to your power spike." },
    ],
  },
  {
    key: "risk",
    label: "Risk",
    group: "Team Plan",
    options: [
      { value: "safe", label: "Safe", blurb: "Avoid coinflips; never contest a 50/50 smite." },
      { value: "standard", label: "Standard", blurb: "Contest objectives at fair odds." },
      { value: "high-roll", label: "High-Roll", blurb: "Force steals and all-ins; embrace the variance." },
    ],
  },
  {
    key: "macro",
    label: "Macro",
    group: "Team Plan",
    options: [
      { value: "group", label: "Group", blurb: "Stay together and fight as five." },
      { value: "splitpush", label: "Splitpush (1-3-1)", blurb: "Side-lane pressure, cross-map trades." },
      { value: "pick", label: "Pick", blurb: "Hunt catches with vision and burst." },
      { value: "siege", label: "Siege", blurb: "Group, poke, and grind towers methodically." },
    ],
  },
  {
    key: "fightStyle",
    label: "Teamfight Style",
    group: "Team Plan",
    options: [
      { value: "balanced", label: "Balanced", blurb: "Fight to the situation, no fixed shape." },
      { value: "front-to-back", label: "Front-to-Back", blurb: "Tanks soak, carries DPS from behind." },
      { value: "flank", label: "Flank / Catch", blurb: "Angles and burst onto the backline." },
      { value: "poke", label: "Poke / Siege", blurb: "Chip them down before committing." },
    ],
  },
  {
    key: "objective",
    label: "Objectives",
    group: "Team Plan",
    options: [
      { value: "balanced", label: "Balanced", blurb: "Take what's available; trade evenly." },
      { value: "dragon", label: "Dragon Soul", blurb: "Stack drakes toward soul." },
      { value: "herald", label: "Herald / Grubs", blurb: "Early tower tempo off Grubs + Herald." },
      { value: "atakhan", label: "Atakhan", blurb: "Prioritize Atakhan for the fight-winning buff." },
      { value: "baron", label: "Baron Tempo", blurb: "Prioritize Baron to crack the map." },
    ],
  },
  {
    key: "vision",
    label: "Vision",
    group: "Team Plan",
    options: [
      { value: "standard", label: "Standard", blurb: "Even vision control around objectives." },
      { value: "proactive", label: "Proactive", blurb: "Deep wards to set up picks and takes." },
      { value: "reactive", label: "Reactive", blurb: "Defensive warding; play safe and farm." },
    ],
  },
  // ── Map & Resources ────────────────────────────────────────────────────
  {
    key: "jungle",
    label: "Jungle",
    group: "Map & Resources",
    options: [
      { value: "invade", label: "Invade", blurb: "Counter-jungle and camp lanes from minute one." },
      { value: "counter-jungle", label: "Counter-Jungle", blurb: "Scuttle + vision control; deny camps, low risk." },
      { value: "gank", label: "Gank Heavy", blurb: "Camp lanes for early kills and prio." },
      { value: "balanced", label: "Balanced", blurb: "Mix farm and ganks as openings appear." },
      { value: "farm", label: "Farm / Scale", blurb: "Power-farm, contest objectives, scale up." },
    ],
  },
  {
    key: "weakside",
    label: "Weakside Lane",
    group: "Map & Resources",
    options: [
      { value: "none", label: "Play Even", blurb: "No designated weakside; standard map." },
      { value: "top", label: "Top Weakside", blurb: "Starve top, fund bot + jungle." },
      { value: "bottom", label: "Bot Weakside", blurb: "Starve bot, fund top + jungle." },
    ],
  },
  {
    key: "winCondition",
    label: "Win Condition",
    group: "Map & Resources",
    options: [
      { value: "spread", label: "Spread", blurb: "No single carry; play the map evenly." },
      { value: "top-carry", label: "Top Carry", blurb: "Funnel resources to the toplaner." },
      { value: "mid-carry", label: "Mid Carry", blurb: "Funnel resources to the midlaner." },
      { value: "bot-carry", label: "Bot Carry", blurb: "Funnel resources to the ADC." },
    ],
  },
  {
    key: "pickTarget",
    label: "Pick Target",
    group: "Map & Resources",
    options: [
      { value: "balanced", label: "No Focus", blurb: "Take whatever catch presents itself." },
      { value: "top", label: "Their Top", blurb: "Hunt the enemy toplaner with picks/shutdowns." },
      { value: "mid", label: "Their Mid", blurb: "Hunt the enemy midlaner." },
      { value: "bot", label: "Their ADC", blurb: "Hunt the enemy ADC — kill their carry." },
    ],
  },
  {
    key: "laneSwap",
    label: "Lane Swap",
    group: "Map & Resources",
    options: [
      { value: "standard", label: "Standard Lanes", blurb: "Normal 2-1-2 lane assignments." },
      { value: "lane-swap", label: "Lane Swap", blurb: "Send the bot duo top for an early tower." },
    ],
  },
  // ── Lane Assignments ───────────────────────────────────────────────────
  {
    key: "topPlay",
    label: "Top Lane",
    group: "Lane Assignments",
    options: [
      { value: "group", label: "Group", blurb: "Toplaner groups with the team." },
      { value: "splitpush", label: "Splitpush", blurb: "Toplaner pressures a side lane (1-3-1 / backdoor threat)." },
      { value: "rotate", label: "Rotate", blurb: "Toplaner rotates to objectives with the team." },
    ],
  },
  {
    key: "midPlay",
    label: "Mid Lane",
    group: "Lane Assignments",
    options: [
      { value: "standard", label: "Hold Lane", blurb: "Midlaner farms and holds the lane." },
      { value: "roam", label: "Roam", blurb: "Midlaner rotates to side lanes for kills." },
      { value: "push-prio", label: "Push Prio", blurb: "Shove for prio and set up objectives." },
    ],
  },
  {
    key: "botPlay",
    label: "Bot Lane",
    group: "Lane Assignments",
    options: [
      { value: "standard", label: "Trade", blurb: "Even 2v2; trade as openings appear." },
      { value: "dive", label: "Dive", blurb: "Aggressive 2v2 dives for an early lead." },
      { value: "scale", label: "Scale", blurb: "Farm safely to the carry's power spike." },
    ],
  },
  {
    key: "supportPlay",
    label: "Support",
    group: "Lane Assignments",
    options: [
      { value: "lane", label: "Lane", blurb: "Support stays bot and trades in the 2v2." },
      { value: "roam", label: "Roam", blurb: "Support roams for picks across the map." },
      { value: "protect", label: "Protect", blurb: "Peel and babysit the carry to the late game." },
    ],
  },
];

// ─── Archetype counting ───────────────────────────────────────────────────────

type Counts = Partial<Record<Archetype, number>>;

function archetypeCounts(picks: (Champion | null)[]): Counts {
  const c: Counts = {};
  for (const p of picks) {
    if (!p) continue;
    for (const a of metaFor(p).archetypes) c[a] = (c[a] ?? 0) + 1;
  }
  return c;
}

function n(c: Counts, a: Archetype): number {
  return c[a] ?? 0;
}

// Is the top-lane pick "self-sufficient" — a tank or splitpusher that can hold
// a weakside lane alone? Used by recommendStrategy for weakside detection.
function topIsSelfSufficient(picks: (Champion | null)[]): boolean {
  const top = laneOf(picks, "top");
  if (!top) return false;
  const a = metaFor(top).archetypes;
  return a.includes("tank") || a.includes("splitpush");
}

// Does bottom carry a scaling hyper-carry that just wants to farm safely?
function botIsScalingCarry(picks: (Champion | null)[]): boolean {
  const bot = laneOf(picks, "bottom");
  if (!bot) return false;
  return metaFor(bot).archetypes.includes("hyper-carry");
}

// Map a win-condition value to the lane it funnels into.
function winConditionLane(wc: WinCondition): Lane | null {
  return wc === "top-carry"
    ? "top"
    : wc === "mid-carry"
    ? "middle"
    : wc === "bot-carry"
    ? "bottom"
    : null;
}

// How much of a primary carry the pick in `lane` is. Used to decide whether
// funneling resources there is justified (recommend + fit).
function carryStrengthAt(picks: (Champion | null)[], lane: Lane): number {
  const c = laneOf(picks, lane);
  if (!c) return 0;
  const a = metaFor(c).archetypes;
  let s = 0;
  if (a.includes("hyper-carry")) s += 3;
  if (a.includes("burst")) s += 2;
  if (a.includes("assassin")) s += 2;
  if (c.roles.some((r) => r.toLowerCase() === "marksman")) s += 2;
  return s;
}

// ─── Recommendation (AI plan / human suggestion) ──────────────────────────────
//
// Picks a sensible strategy from the drafted comp's identity. Used verbatim
// for AI sides and as the pre-filled suggestion (with the recommended option
// highlighted) for human sides.
export function recommendStrategy(picks: (Champion | null)[]): TeamStrategy {
  const early = earlyCount(picks);
  const late = lateScalingCount(picks);
  const counts = archetypeCounts(picks);
  const hasSplit = !!findByArchetype(picks, ["splitpush"]);
  const pickPotential = n(counts, "pick") + n(counts, "assassin") + n(counts, "burst");

  const gamePlan: GamePlan =
    late >= 3 ? "scaling" : early >= 3 ? "early-snowball" : "teamfight";

  const jungle: JungleFocus =
    gamePlan === "early-snowball" ? "gank" : gamePlan === "scaling" ? "farm" : "balanced";

  const weakside: WeaksideLane = topIsSelfSufficient(picks)
    ? "top"
    : botIsScalingCarry(picks) && early >= 1
    ? "bottom"
    : "none";

  // Win condition: funnel into the strongest carry lane, if one stands out.
  const laneStrength: { lane: WinCondition; score: number }[] = [
    { lane: "top-carry", score: carryStrengthAt(picks, "top") },
    { lane: "mid-carry", score: carryStrengthAt(picks, "middle") },
    { lane: "bot-carry", score: carryStrengthAt(picks, "bottom") },
  ];
  const topCarry = laneStrength.reduce((a, b) => (b.score > a.score ? b : a));
  const winCondition: WinCondition = topCarry.score >= 2 ? topCarry.lane : "spread";

  const macro: MacroStyle = hasSplit ? "splitpush" : pickPotential >= 2 ? "pick" : "group";

  const hasFrontline = n(counts, "tank") >= 1;
  const fightStyle: FightStyle =
    hasFrontline && n(counts, "hyper-carry") >= 1
      ? "front-to-back"
      : pickPotential >= 2
      ? "flank"
      : n(counts, "poke") >= 3
      ? "poke"
      : "balanced";

  const objective: ObjectiveFocus =
    gamePlan === "scaling" ? "dragon" : gamePlan === "early-snowball" ? "herald" : "balanced";

  const vision: VisionControl = pickPotential >= 2 ? "proactive" : "standard";

  const tempo: Tempo =
    gamePlan === "early-snowball" ? "aggressive" : gamePlan === "scaling" ? "passive" : "standard";

  // Lane assignments — derived from the same comp signals.
  const topPlay: TopPlay = hasSplit ? "splitpush" : "group";
  const midPlay: MidPlay = pickPotential >= 2 ? "roam" : "standard";
  const botPlay: BotPlay = botIsScalingCarry(picks)
    ? "scale"
    : early >= 3
    ? "dive"
    : "standard";
  const supportPlay: SupportPlay = botIsScalingCarry(picks)
    ? "protect"
    : pickPotential >= 2
    ? "roam"
    : "lane";

  return {
    gamePlan,
    jungle,
    weakside,
    winCondition,
    macro,
    fightStyle,
    objective,
    vision,
    tempo,
    // Risk / pick-target / lane-swap are situational tactical knobs, not
    // comp-derived — leave them on the neutral default for the AI.
    risk: "standard",
    pickTarget: "balanced",
    laneSwap: "standard",
    topPlay,
    midPlay,
    botPlay,
    supportPlay,
  };
}

// One-line rationale for the recommended plan — shown under the AI's plan so
// the user understands what they're up against.
export function strategyRationale(picks: (Champion | null)[]): string {
  const early = earlyCount(picks);
  const late = lateScalingCount(picks);
  if (late >= 3) return "Scaling comp — stall the early game, win on items.";
  if (early >= 3) return "Early-game comp — snowball leads before they spike.";
  if (findByArchetype(picks, ["splitpush"]))
    return "Splitpush threat — create side-lane pressure.";
  return "Flexible comp — group for mid-game teamfights.";
}

// ─── Context-aware, varied AI strategy selection ──────────────────────────────
//
// recommendStrategy() is the single "ideal" plan (used for the human-side
// suggestion markers). chooseAIStrategy() is what AI teams actually run: it
// weights each lever by comp fit AND match context (series score, the enemy's
// strongest player, an unfavorable top matchup), then SAMPLES from those
// weights so two teams — or the same team across games — don't always pick the
// same option. Pass ctx.rng for variety; omit it for a deterministic argmax.

export interface StrategyContext {
  // The opposing draft + rosters, for counter-planning.
  enemyPicks?: (Champion | null)[];
  roster?: Roster;
  enemyRoster?: Roster;
  // Series situation from THIS team's perspective (games won so far + the
  // wins needed to take the series: 1 Bo1, 2 Bo3, 3 Bo5).
  selfWins?: number;
  oppWins?: number;
  gamesToWin?: number;
  // RNG for variety. Omitted → deterministic (highest-weight option wins), so
  // tests and the human-side "suggested" markers stay stable.
  rng?: () => number;
}

type Weighted<T> = { value: T; weight: number };

function choose<T>(cands: Weighted<T>[], rng?: () => number): T {
  const valid = cands.filter((c) => c.weight > 0);
  if (valid.length === 0) return cands[0].value;
  if (!rng) return valid.reduce((a, b) => (b.weight > a.weight ? b : a)).value;
  const total = valid.reduce((s, c) => s + c.weight, 0);
  let r = rng() * total;
  for (const c of valid) if ((r -= c.weight) <= 0) return c.value;
  return valid[valid.length - 1].value;
}

// Positional roster indices.
const LANE_IDX: Record<"top" | "middle" | "bottom", number> = {
  top: 0,
  middle: 2,
  bottom: 3,
};

function tierAt(roster: Roster | undefined, idx: number): number {
  const p = roster?.[idx];
  return p ? PLAYER_TIER_VALUE[p.tier] : 0;
}

// Which enemy carry lane to hunt: the lane (top/mid/bot) with their highest-
// tier player, or — failing roster data — their strongest carry champion.
function strongestEnemyLane(ctx: StrategyContext): PickTarget {
  if (ctx.enemyRoster) {
    const lanes: [PickTarget, number][] = [
      ["top", tierAt(ctx.enemyRoster, LANE_IDX.top)],
      ["mid", tierAt(ctx.enemyRoster, LANE_IDX.middle)],
      ["bot", tierAt(ctx.enemyRoster, LANE_IDX.bottom)],
    ];
    const best = lanes.reduce((a, b) => (b[1] > a[1] ? b : a));
    if (best[1] > 0) return best[0];
  }
  if (ctx.enemyPicks) {
    const lanes: [PickTarget, number][] = [
      ["top", carryStrengthAt(ctx.enemyPicks, "top")],
      ["mid", carryStrengthAt(ctx.enemyPicks, "middle")],
      ["bot", carryStrengthAt(ctx.enemyPicks, "bottom")],
    ];
    const best = lanes.reduce((a, b) => (b[1] > a[1] ? b : a));
    if (best[1] >= 2) return best[0];
  }
  return "balanced";
}

// Is our toplaner in an unfavorable spot worth lane-swapping away from? Two
// signals: a big player-tier deficit top, or a phase mismatch (our scaling top
// vs their early-game bully) that a lane swap sidesteps.
function topMatchupUnfavorable(
  picks: (Champion | null)[],
  ctx: StrategyContext,
): boolean {
  if (ctx.roster && ctx.enemyRoster) {
    if (tierAt(ctx.roster, LANE_IDX.top) <= tierAt(ctx.enemyRoster, LANE_IDX.top) - 2)
      return true;
  }
  const myTop = laneOf(picks, "top");
  const oppTop = ctx.enemyPicks ? laneOf(ctx.enemyPicks, "top") : null;
  if (myTop && oppTop) {
    const myPhase = metaFor(myTop).phase;
    const oppPhase = metaFor(oppTop).phase;
    const myLate = myPhase === "late" || myPhase === "mid-late";
    if (myLate && oppPhase === "early") return true;
  }
  return false;
}

export function chooseAIStrategy(
  picks: (Champion | null)[],
  ctx: StrategyContext = {},
): TeamStrategy {
  const rng = ctx.rng;
  const early = earlyCount(picks);
  const late = lateScalingCount(picks);
  const counts = archetypeCounts(picks);
  const hasSplit = !!findByArchetype(picks, ["splitpush"]);
  const hasFrontline = n(counts, "tank") >= 1;
  const hasHyperCarry = n(counts, "hyper-carry") >= 1;
  const pokeCount = n(counts, "poke");
  const pickPotential = n(counts, "pick") + n(counts, "assassin") + n(counts, "burst");

  const gamePlan = choose<GamePlan>(
    [
      { value: "scaling", weight: late >= 3 ? 7 : late >= 2 ? 3 : 1 },
      { value: "early-snowball", weight: early >= 3 ? 7 : early >= 2 ? 3 : 1 },
      { value: "teamfight", weight: 3 + (hasFrontline && n(counts, "engage") >= 1 ? 2 : 0) },
    ],
    rng,
  );
  const scaling = gamePlan === "scaling";
  const snowball = gamePlan === "early-snowball";

  const jungle = choose<JungleFocus>(
    [
      { value: "farm", weight: scaling ? 5 : late >= 2 ? 2 : 1 },
      { value: "gank", weight: snowball ? 5 : early >= 2 ? 2 : 1 },
      { value: "invade", weight: snowball && early >= 3 ? 2.5 : 0.4 },
      { value: "counter-jungle", weight: 1.5 },
      { value: "balanced", weight: 2.5 },
    ],
    rng,
  );

  const tempo = choose<Tempo>(
    [
      { value: "aggressive", weight: snowball ? 5 : early >= 2 ? 2.5 : 1 },
      { value: "passive", weight: scaling ? 5 : late >= 2 ? 2.5 : 1 },
      { value: "standard", weight: 3.5 },
    ],
    rng,
  );

  const macro = choose<MacroStyle>(
    [
      { value: "splitpush", weight: hasSplit ? 6 : 0.3 },
      // A loaded pick comp (3+ catch tools) commits to the pick game harder.
      { value: "pick", weight: pickPotential >= 3 ? 5 : pickPotential >= 2 ? 4 : 1 },
      { value: "siege", weight: pokeCount >= 2 ? 4 : 0.4 },
      { value: "group", weight: 3.5 },
    ],
    rng,
  );

  const fightStyle = choose<FightStyle>(
    [
      { value: "front-to-back", weight: hasFrontline && hasHyperCarry ? 5 : hasFrontline ? 2 : 0.4 },
      { value: "flank", weight: pickPotential >= 2 ? 4 : 1 },
      { value: "poke", weight: pokeCount >= 3 ? 5 : pokeCount >= 2 ? 2 : 0.4 },
      { value: "balanced", weight: 3 },
    ],
    rng,
  );

  const objective = choose<ObjectiveFocus>(
    [
      { value: "dragon", weight: scaling || late >= 2 ? 3.5 : 1.5 },
      { value: "herald", weight: snowball || early >= 2 ? 3 : 1 },
      { value: "baron", weight: 1.5 },
      { value: "atakhan", weight: hasFrontline || hasHyperCarry ? 1.5 : 0.8 },
      { value: "balanced", weight: 3 },
    ],
    rng,
  );

  // Vision now varies instead of defaulting to proactive every game. A real
  // pick comp still leans proactive on argmax (deep wards ARE the win
  // condition), but standard stays competitive so sampled games vary.
  const vision = choose<VisionControl>(
    [
      { value: "proactive", weight: pickPotential >= 2 ? 4.5 : 1.2 },
      { value: "reactive", weight: scaling ? 3 : 1.2 },
      { value: "standard", weight: 4 },
    ],
    rng,
  );

  // ── Context-driven levers ──────────────────────────────────────────────
  const behind = (ctx.oppWins ?? 0) - (ctx.selfWins ?? 0);
  const oppMatchPoint =
    ctx.gamesToWin != null && (ctx.oppWins ?? 0) === ctx.gamesToWin - 1 && behind > 0;
  const selfMatchPoint =
    ctx.gamesToWin != null && (ctx.selfWins ?? 0) === ctx.gamesToWin - 1 && behind < 0;
  // Behind / facing elimination → embrace variance. Ahead / on match point →
  // play it safe and close. Even → mostly standard.
  const risk = choose<RiskLevel>(
    [
      { value: "high-roll", weight: oppMatchPoint ? 8 : behind >= 2 ? 6 : behind === 1 ? 3 : 1 },
      { value: "safe", weight: selfMatchPoint ? 5 : behind <= -1 ? 4 : 1 },
      { value: "standard", weight: 4 },
    ],
    rng,
  );

  // Hunt the enemy's strongest carry lane (deny their best player gold).
  const target = strongestEnemyLane(ctx);
  const pickTarget = choose<PickTarget>(
    [
      { value: target, weight: target !== "balanced" ? (pickPotential >= 2 ? 5 : 2.5) : 0 },
      { value: "balanced", weight: 3.5 },
    ],
    rng,
  );

  // Lane-swap to dodge an unfavorable top matchup.
  const laneSwap = choose<LaneSwap>(
    [
      { value: "lane-swap", weight: topMatchupUnfavorable(picks, ctx) ? 4 : 0.15 },
      { value: "standard", weight: 6 },
    ],
    rng,
  );

  // ── Map / lane assignments ──────────────────────────────────────────────
  const weakside = choose<WeaksideLane>(
    [
      { value: "top", weight: topIsSelfSufficient(picks) ? 3.5 : 0.3 },
      { value: "bottom", weight: botIsScalingCarry(picks) && early >= 1 ? 2.5 : 0.3 },
      { value: "none", weight: 4 },
    ],
    rng,
  );

  const winCondition = choose<WinCondition>(
    [
      { value: "top-carry", weight: carryStrengthAt(picks, "top") >= 2 ? 2.5 : 0.2 },
      { value: "mid-carry", weight: carryStrengthAt(picks, "middle") >= 2 ? 2.5 : 0.2 },
      { value: "bot-carry", weight: carryStrengthAt(picks, "bottom") >= 3 ? 3 : 0.3 },
      { value: "spread", weight: 4 },
    ],
    rng,
  );

  const topPlay = choose<TopPlay>(
    [
      { value: "splitpush", weight: hasSplit ? 5 : 0.4 },
      { value: "rotate", weight: hasFrontline ? 2 : 1 },
      { value: "group", weight: 4 },
    ],
    rng,
  );
  const midPlay = choose<MidPlay>(
    [
      { value: "roam", weight: pickPotential >= 2 ? 4 : 1 },
      { value: "push-prio", weight: pokeCount >= 1 ? 2 : 1.2 },
      { value: "standard", weight: 4 },
    ],
    rng,
  );
  const botPlay = choose<BotPlay>(
    [
      { value: "scale", weight: botIsScalingCarry(picks) ? 5 : 1 },
      { value: "dive", weight: early >= 3 ? 3 : n(counts, "engage") >= 1 ? 1.5 : 0.5 },
      { value: "standard", weight: 3.5 },
    ],
    rng,
  );
  const supportPlay = choose<SupportPlay>(
    [
      { value: "protect", weight: botIsScalingCarry(picks) || hasHyperCarry ? 4 : 1 },
      { value: "roam", weight: pickPotential >= 2 || n(counts, "engage") >= 1 ? 3 : 1 },
      { value: "lane", weight: 3.5 },
    ],
    rng,
  );

  return {
    gamePlan,
    jungle,
    weakside,
    winCondition,
    macro,
    fightStyle,
    objective,
    vision,
    tempo,
    risk,
    pickTarget,
    laneSwap,
    topPlay,
    midPlay,
    botPlay,
    supportPlay,
  };
}

// ─── Series adaptation (AI strategy across a Bo3/Bo5) ────────────────────────
//
// chooseAIStrategy() plans one game in isolation. chooseAIStrategyForGame()
// adds series memory: the AI looks at how its previous games went — which
// plan it ran, whether it won, how badly, and what the opponent ran — and
// shifts the plan in a principled (not random) way. The input is plain data
// so the store can build it from SeriesState/GameDraft/GameRecap without
// this module importing series code.

// One finished game from THIS team's perspective.
export interface PriorGameSummary {
  // The plan this team committed to in that game.
  strategy: TeamStrategy;
  won: boolean;
  // Final team-gold difference, signed from this team's perspective
  // (negative = finished behind). Optional — use `stomp` when unknown.
  goldDiff?: number;
  // Coarse closeness flag for callers without gold data: true when the game
  // was one-sided (e.g. |gold diff| ≥ ~7k or a sub-26-minute loss).
  stomp?: boolean;
  durationMinutes?: number;
  // The opponent's plan, when known (AI knows its own AI plans; vs a human
  // the store can pass the human's confirmed strategy).
  opponentStrategy?: TeamStrategy;
  // Opponent identity — lets a caller pass a longer history and have games
  // vs other teams filtered out.
  opponentName?: string;
}

export interface SeriesStrategyInput {
  // This game's draft (positional order: top, jungle, mid, bot, support).
  picks: (Champion | null)[];
  // Same draft/series context chooseAIStrategy takes (enemy picks, rosters,
  // series score). Optional.
  context?: StrategyContext;
  // Prior games in chronological order. Empty/omitted → game 1 behavior.
  priorGames?: PriorGameSummary[];
  // When set, prior games tagged with a different opponentName are ignored.
  opponentName?: string;
  // RNG for the base plan's sampled variety. Defaults to Math.random — AI
  // teams should vary; pass a seeded rng in tests.
  rng?: () => number;
}

// How bad was a lost game? "stomp" triggers the desperation dial.
function wasStomped(g: PriorGameSummary): boolean {
  if (g.stomp != null) return g.stomp;
  if (g.goldDiff != null) return g.goldDiff <= -7000;
  return false;
}

export function chooseAIStrategyForGame(
  input: SeriesStrategyInput,
): TeamStrategy {
  const rng = input.rng ?? Math.random;
  const picks = input.picks;
  // Base plan: comp + context driven, sampled for variety. Always recomputed
  // for THIS game's draft — adaptation below only overrides specific levers,
  // so comp-derived choices (weakside, win condition, lane assignments) stay
  // coherent with the new picks.
  const base = chooseAIStrategy(picks, { ...input.context, rng });

  const history = (input.priorGames ?? []).filter(
    (g) =>
      !input.opponentName ||
      !g.opponentName ||
      g.opponentName === input.opponentName,
  );
  const last = history[history.length - 1];
  // Rule 0 — game 1 (or no relevant history): nothing to adapt to; play the
  // draft-driven plan.
  if (!last) return base;

  const early = earlyCount(picks);
  const late = lateScalingCount(picks);
  const hasSplit = !!findByArchetype(picks, ["splitpush"]);

  if (last.won) {
    // Rule W — won the last game: don't fix what works. Carry over the
    // winning plan's strategic identity (gamePlan / tempo / macro /
    // objective); everything comp-specific (weakside, carries, lane
    // assignments, risk) comes fresh from `base`, which already provides
    // the "minor variation" via sampling. One veto: a carried splitpush
    // macro is dropped if the new draft has no splitpusher to run it.
    const macro =
      last.strategy.macro === "splitpush" && !hasSplit
        ? base.macro
        : last.strategy.macro;
    return {
      ...base,
      gamePlan: last.strategy.gamePlan,
      tempo: last.strategy.tempo,
      macro,
      objective: last.strategy.objective,
    };
  }

  // ── Lost the last game → shift the plan meaningfully ──────────────────
  const out: TeamStrategy = { ...base };

  if (
    last.strategy.gamePlan === "scaling" ||
    last.strategy.tempo === "passive"
  ) {
    // Rule L1 — lost playing slow: the wait-and-scale plan never reached its
    // payoff (or reached it and still lost). Take tempo into our own hands:
    // aggressive early plan, gank-heavy jungle, Herald for early towers.
    // Early-snowball only if the draft has at least one early-game champion;
    // otherwise a proactive teamfight plan is the honest aggressive option.
    out.gamePlan = early >= 1 ? "early-snowball" : "teamfight";
    out.tempo = "aggressive";
    out.jungle = "gank";
    out.objective = "herald";
  } else if (
    last.strategy.gamePlan === "early-snowball" ||
    last.strategy.tempo === "aggressive"
  ) {
    // Rule L2 — lost playing fast: our aggression fed the enemy snowball.
    // Flip to a safer scaling posture: passive tempo, farming jungle,
    // dragon stacking, bot farms to its spike with the support glued on.
    out.gamePlan = late >= 1 ? "scaling" : "teamfight";
    out.tempo = "passive";
    out.jungle = "farm";
    out.objective = "dragon";
    out.botPlay = "scale";
    out.supportPlay = "protect";
  } else if (hasSplit) {
    // Rule L3a — lost a standard mid-tempo game and the draft has a
    // splitpusher: change the SHAPE of the map instead of the speed — 1-3-1
    // pressure forces the opponent out of the grouped game that beat us.
    out.macro = "splitpush";
    out.topPlay = "splitpush";
  } else {
    // Rule L3b — lost a standard game with no splitpusher: hunt picks.
    // Proactive vision + catches deny the opponent the 5v5s they won.
    out.macro = "pick";
    out.vision = "proactive";
  }

  // Counter-rules: how the OPPONENT beat us takes priority over how our own
  // plan failed, so these override the macro/vision chosen above.
  if (
    last.opponentStrategy &&
    (last.opponentStrategy.macro === "splitpush" ||
      last.opponentStrategy.topPlay === "splitpush")
  ) {
    // Rule L4 — lost to a splitpush: answer the 1-3-1 with grouped force,
    // deep vision on the side lanes, and shutdown pressure on the splitter.
    out.macro = "group";
    out.vision = "proactive";
    out.pickTarget = "top";
  } else if (last.opponentStrategy?.macro === "pick") {
    // Rule L5 — lost to a pick squad: stop getting caught. Sweep/counter-
    // ward proactively, stay grouped, support babysits the carry.
    out.macro = "group";
    out.vision = "proactive";
    out.supportPlay = "protect";
  }

  // Rule L6 — stomped: a lever tweak won't close a 7k-gold class gap.
  // Embrace variance (coinflip smites, all-ins) to break serve.
  if (wasStomped(last)) out.risk = "high-roll";

  return out;
}

// ─── Comp fit → score-diff bias ───────────────────────────────────────────────
//
// Returns a small signed bias (capped to ±8 score points, ≈ ±10pp win-prob at
// the slope) reflecting how well the chosen plan suits the comp. A team that
// commits to a plan its draft supports gets a tailwind; one that picks against
// its draft gets a headwind. Both teams' fits are computed and the DIFFERENCE
// feeds the simulator (see matchSimulator.simulateMatch), so a well-planned
// team gains relative to a poorly-planned opponent.
export function strategyFit(
  strategy: TeamStrategy,
  picks: (Champion | null)[],
): number {
  const early = earlyCount(picks);
  const late = lateScalingCount(picks);
  const counts = archetypeCounts(picks);
  const hasSplit = !!findByArchetype(picks, ["splitpush"]);
  const hasFrontline = n(counts, "tank") >= 1;
  const hasHyperCarry = n(counts, "hyper-carry") >= 1;
  const pickPotential = n(counts, "pick") + n(counts, "assassin") + n(counts, "burst");
  let fit = 0;

  // Game plan vs phase profile. "teamfight" is the neutral default (0).
  if (strategy.gamePlan === "scaling") {
    fit += late >= 3 ? 2 : late >= 2 ? 1 : early >= 3 ? -3 : -1;
  } else if (strategy.gamePlan === "early-snowball") {
    fit += early >= 3 ? 2 : early >= 2 ? 1 : late >= 3 ? -3 : -1;
  }

  // Jungle vs spike timing. "balanced" is neutral; "invade" is the spiciest
  // early style — great with an early comp, suicidal with a scaling one.
  // "counter-jungle" is the lower-commitment early-control option.
  if (strategy.jungle === "invade") fit += early >= 2 ? 1.5 : late >= 3 ? -2 : -0.5;
  else if (strategy.jungle === "counter-jungle") fit += early >= 2 ? 0.75 : late >= 3 ? -0.5 : 0;
  else if (strategy.jungle === "gank") fit += early >= 2 ? 1 : late >= 3 ? -1 : 0;
  else if (strategy.jungle === "farm") fit += late >= 2 ? 1 : early >= 3 ? -0.5 : 0;

  // Weakside — sacrificing a lane only works if that lane can hold alone.
  if (strategy.weakside === "top") fit += topIsSelfSufficient(picks) ? 1 : -1.5;
  else if (strategy.weakside === "bottom") fit += botIsScalingCarry(picks) ? 1 : -1;

  // Win condition — funneling resources only works if the chosen lane carries.
  if (strategy.winCondition !== "spread") {
    const lane = winConditionLane(strategy.winCondition);
    fit += lane && carryStrengthAt(picks, lane) >= 2 ? 1.5 : -1.5;
  }

  // Macro vs available tools. "group" is neutral.
  if (strategy.macro === "splitpush") fit += hasSplit ? 1.5 : -2.5;
  else if (strategy.macro === "pick") fit += pickPotential >= 2 ? 1.5 : -1.5;
  else if (strategy.macro === "siege") fit += n(counts, "poke") >= 2 ? 1.5 : -1;

  // Fight style — comp-identity match. "balanced" is neutral.
  if (strategy.fightStyle === "front-to-back")
    fit += hasFrontline && hasHyperCarry ? 1.5 : hasFrontline ? 0.5 : -1.5;
  else if (strategy.fightStyle === "flank") fit += pickPotential >= 2 ? 1.5 : -1;
  else if (strategy.fightStyle === "poke")
    fit += n(counts, "poke") >= 3 ? 1.5 : n(counts, "poke") >= 2 ? 0.5 : -1;

  // Objective focus — mild reinforcement of the plan. "balanced" is neutral.
  if (strategy.objective === "dragon") fit += late >= 2 ? 0.5 : 0;
  else if (strategy.objective === "baron") fit += early >= 2 ? 0.5 : -0.25;
  else if (strategy.objective === "herald") fit += early >= 2 ? 0.5 : late >= 3 ? -0.5 : 0;
  else if (strategy.objective === "atakhan") fit += hasHyperCarry || hasFrontline ? 0.4 : 0;

  // Vision — proactive vision pairs with catch/pick potential. "standard" and
  // "reactive" are neutral (reactive is a safe choice, not a penalty).
  if (strategy.vision === "proactive") fit += pickPotential >= 2 ? 0.5 : 0;

  // Tempo vs spike timing. "standard" is neutral.
  if (strategy.tempo === "aggressive") fit += early >= 2 ? 1.5 : late >= 3 ? -2 : 0;
  else if (strategy.tempo === "passive") fit += late >= 2 ? 1.5 : early >= 3 ? -1.5 : 0;

  // ─── Lane assignments (all default values neutral) ───────────────────────
  // Top: splitting needs a splitpusher; rotating suits a teamfight comp.
  if (strategy.topPlay === "splitpush") fit += hasSplit ? 1.5 : -1;
  else if (strategy.topPlay === "rotate") fit += hasFrontline ? 0.5 : 0;

  // Mid: roaming pays off when the midlaner brings kill pressure.
  if (strategy.midPlay === "roam") fit += pickPotential >= 2 ? 1 : -0.5;

  // Bot: diving wants an engage support and an early lane; scaling wants a
  // hyper-carry that just needs to reach items.
  if (strategy.botPlay === "dive")
    fit += botIsScalingCarry(picks) ? -1 : n(counts, "engage") >= 1 ? 1 : 0;
  else if (strategy.botPlay === "scale")
    fit += botIsScalingCarry(picks) ? 1 : 0;

  // Support: roaming wants pick/engage tools; protecting wants a carry to peel for.
  if (strategy.supportPlay === "roam")
    fit += n(counts, "pick") >= 1 || n(counts, "engage") >= 1 ? 0.75 : -0.5;
  else if (strategy.supportPlay === "protect")
    fit += botIsScalingCarry(picks) || hasHyperCarry ? 0.75 : -0.25;

  // ─── Situational tactical knobs ──────────────────────────────────────────
  // Pick-target only pays off if you have the tools to catch someone.
  if (strategy.pickTarget !== "balanced")
    fit += pickPotential >= 2 ? 0.3 : -0.4;
  // Lane swap is an early-tempo gambit — fine for early comps, a waste for scaling.
  if (strategy.laneSwap === "lane-swap")
    fit += early >= 2 ? 0.4 : late >= 3 ? -0.5 : 0;
  // Risk is a pure variance dial — intentionally fit-neutral (it's about the
  // game state, not the draft), so it never disturbs the neutral baseline.

  // Scale up so a good-vs-bad plan is worth ~±10pp of win probability
  // (≈ ±8 score points of difference at SIGMOID_K), enough to feel without
  // overtaking the draft/roster as the dominant lever.
  return Math.max(-FIT_CAP, Math.min(FIT_CAP, fit * FIT_SCALE));
}

// Tuning knobs for the comp-fit channel. FIT_SCALE multiplies the raw
// per-lever sum; FIT_CAP bounds each team's contribution. Raise both to make
// strategy choices swing outcomes harder.
const FIT_SCALE = 1.6;
const FIT_CAP = 8;

// Qualitative fit tier for UI — turns the raw fit number into a Strong /
// Balanced / Poor readout so the player sees at a glance whether the chosen
// plan suits their comp.
export type FitTier = "strong" | "balanced" | "poor";

export function fitTier(fit: number): FitTier {
  if (fit >= 3) return "strong";
  if (fit <= -1.5) return "poor";
  return "balanced";
}

// ─── Display helpers ──────────────────────────────────────────────────────────

// Human-readable label for a lever value (e.g. ("gamePlan","scaling") → "Scale").
export function strategyOptionLabel(
  key: keyof TeamStrategy,
  value: string,
): string {
  const lever = STRATEGY_LEVERS.find((l) => l.key === key);
  return lever?.options.find((o) => o.value === value)?.label ?? value;
}

// Compact label/value pairs for the whole plan, in lever order — used by the
// post-draft recap strip to echo what each team committed to.
export function strategySummary(
  strategy: TeamStrategy,
): { label: string; value: string }[] {
  return STRATEGY_LEVERS.map((l) => ({
    label: l.label,
    value: strategyOptionLabel(l.key, strategy[l.key]),
  }));
}

// ─── Timeline modifiers ───────────────────────────────────────────────────────
//
// All values are blue-positive deltas/biases (added to the simulator's
// blue-positive logits) or chance deltas (added to a base event probability).
// They're intentionally modest so strategy nudges the story without
// overpowering comp/gold/momentum.

export interface StrategyTimelineModifiers {
  // Added to the base gank-event probability (base 0.55). Positive = more
  // ganks overall; gank-heavy junglers raise it, double-farm lowers it.
  gankChanceDelta: number;
  // Blue-positive typeBias on the gank's side roll — the gank-focused side
  // is more likely to be the one landing the gank.
  gankBias: number;
  // Added to the base roam-event probability (base 0.40).
  roamChanceDelta: number;
  roamBias: number;
  // Blue-positive typeBias added to dragon side rolls / baron side rolls /
  // Atakhan side roll.
  drakeBias: number;
  baronBias: number;
  atakhanBias: number;
  // Added to every objective STEAL probability (smite-steal rolls, base
  // 0.08–0.18). High-roll plans raise it (more coinflip steals), safe plans
  // lower it. Global (both teams' risk dials contribute to the chaos level).
  stealChanceDelta: number;
  // Multiplier on the closing-fight logit. < 1 pulls the deciding fight toward
  // a coinflip (high-roll); > 1 sharpens it toward the favorite (safe).
  closingRiskFactor: number;
  // Blue-positive typeBias on early kill events (first blood, solo kills,
  // skirmishes) — aggressive / early-snowball / invade plans tilt the early game.
  earlyAggroBias: number;
  // Added to the base vision-pick event probability (base 0.28). Proactive
  // vision raises it; reactive lowers it.
  visionChanceDelta: number;
  // Blue-positive typeBias on the vision-pick side roll.
  visionBias: number;
  // Minutes added to the computed game duration. Scaling/passive lengthen;
  // early-snowball/aggressive shorten.
  durationDelta: number;
}

// Per-side scalar helpers (positive = leans toward the listed behavior).
// "invade" is the most aggressive jungle style, "gank" next, "counter-jungle"
// a milder early-pressure option, "farm" negative.
function gankScore(s: TeamStrategy): number {
  return s.jungle === "invade"
    ? 1.5
    : s.jungle === "gank"
    ? 1
    : s.jungle === "counter-jungle"
    ? 0.5
    : s.jungle === "farm"
    ? -1
    : 0;
}
function riskScore(s: TeamStrategy): number {
  return s.risk === "high-roll" ? 1 : s.risk === "safe" ? -1 : 0;
}
function visionScore(s: TeamStrategy): number {
  return s.vision === "proactive" ? 1 : s.vision === "reactive" ? -1 : 0;
}
function roamScore(s: TeamStrategy): number {
  let r = 0;
  if (s.tempo === "aggressive") r += 1;
  else if (s.tempo === "passive") r -= 1;
  if (s.macro === "pick") r += 0.5;
  // A roaming midlaner / support drives the mid-roam event.
  if (s.midPlay === "roam") r += 1.5;
  if (s.supportPlay === "roam") r += 1;
  return r;
}
// Objective control — extra bodies showing up at objectives (top rotating in,
// mid shoving for prio). Tilts both dragon and baron side rolls.
function objectiveControlScore(s: TeamStrategy): number {
  let r = 0;
  if (s.topPlay === "rotate") r += 1;
  if (s.midPlay === "push-prio") r += 0.5;
  return r;
}
function earlyAggroScore(s: TeamStrategy): number {
  let r = 0;
  if (s.tempo === "aggressive") r += 1;
  else if (s.tempo === "passive") r -= 1;
  if (s.gamePlan === "early-snowball") r += 1;
  else if (s.gamePlan === "scaling") r -= 0.5;
  if (s.jungle === "invade") r += 0.5;
  else if (s.jungle === "counter-jungle") r += 0.25;
  // An aggressive 2v2 dive bot adds early action; a scaling bot subtracts it.
  if (s.botPlay === "dive") r += 1;
  else if (s.botPlay === "scale") r -= 1;
  // A lane swap forces early skirmishes around the swapped towers.
  if (s.laneSwap === "lane-swap") r += 0.5;
  return r;
}
function durationScore(s: TeamStrategy): number {
  let d = 0;
  if (s.gamePlan === "scaling") d += 2;
  else if (s.gamePlan === "early-snowball") d -= 2;
  if (s.tempo === "passive") d += 1.5;
  else if (s.tempo === "aggressive") d -= 1.5;
  // Splitpushing toplaner = grindy 1-3-1; scaling bot + protect = longer game;
  // siege macro grinds slowly.
  if (s.topPlay === "splitpush") d += 1;
  if (s.botPlay === "scale") d += 1;
  if (s.supportPlay === "protect") d += 0.5;
  if (s.macro === "siege") d += 0.5;
  return d;
}

export function strategyTimelineModifiers(
  blue: TeamStrategy,
  red: TeamStrategy,
): StrategyTimelineModifiers {
  const blueGank = gankScore(blue);
  const redGank = gankScore(red);
  const blueRoam = roamScore(blue);
  const redRoam = roamScore(red);
  const blueRisk = riskScore(blue);
  const redRisk = riskScore(red);
  // Pick-target: the side hunting a specific enemy lane converts vision picks
  // slightly better (they know who they're collapsing on).
  const pickTargetBias =
    (blue.pickTarget !== "balanced" ? 0.15 : 0) -
    (red.pickTarget !== "balanced" ? 0.15 : 0);

  return {
    // More ganks if either jungler camps; fewer if both farm.
    gankChanceDelta: 0.12 * blueGank + 0.12 * redGank,
    gankBias: (blueGank - redGank) * 0.3,
    roamChanceDelta: 0.1 * Math.max(0, blueRoam) + 0.1 * Math.max(0, redRoam),
    roamBias: (blueRoam - redRoam) * 0.22,
    drakeBias:
      ((blue.objective === "dragon" ? 1 : 0) - (red.objective === "dragon" ? 1 : 0)) * 0.25 +
      (objectiveControlScore(blue) - objectiveControlScore(red)) * 0.12,
    // Baron + Herald both push map/tower objectives, so both tilt the baron roll.
    baronBias:
      ((blue.objective === "baron" || blue.objective === "herald" ? 1 : 0) -
        (red.objective === "baron" || red.objective === "herald" ? 1 : 0)) *
        0.25 +
      (objectiveControlScore(blue) - objectiveControlScore(red)) * 0.12,
    atakhanBias:
      ((blue.objective === "atakhan" ? 1 : 0) -
        (red.objective === "atakhan" ? 1 : 0)) *
      0.3,
    stealChanceDelta:
      0.05 * Math.max(0, blueRisk) +
      0.05 * Math.max(0, redRisk) +
      0.035 * Math.min(0, blueRisk) +
      0.035 * Math.min(0, redRisk),
    // Either team going high-roll injects chaos into the deciding fight; both
    // playing safe makes it more deterministic.
    closingRiskFactor: Math.max(
      0.5,
      Math.min(
        1.5,
        1 -
          0.28 * (Math.max(0, blueRisk) + Math.max(0, redRisk)) +
          0.18 * (-Math.min(0, blueRisk) - Math.min(0, redRisk)),
      ),
    ),
    earlyAggroBias: (earlyAggroScore(blue) - earlyAggroScore(red)) * 0.14,
    visionChanceDelta:
      0.12 * Math.max(0, visionScore(blue)) +
      0.12 * Math.max(0, visionScore(red)) +
      0.08 * Math.min(0, visionScore(blue)) +
      0.08 * Math.min(0, visionScore(red)),
    visionBias: (visionScore(blue) - visionScore(red)) * 0.2 + pickTargetBias,
    durationDelta: durationScore(blue) + durationScore(red),
  };
}

// Extra backdoor probability for the WINNING side when it committed to a
// splitpush plan — either at the team level (1-3-1 macro) or via a dedicated
// splitpushing toplaner. A 1-3-1 team is far likelier to end on a backdoor.
export function backdoorBonusFor(strategy: TeamStrategy): number {
  return strategy.macro === "splitpush" || strategy.topPlay === "splitpush"
    ? 0.12
    : 0;
}

// ─── Weakside lane redistribution ─────────────────────────────────────────────
//
// laneAdv is the COMBINED blue-positive per-lane g/min advantage. A team that
// designates a weakside lane gives up gold there (its laner gets less jungle
// attention and fewer resources) and funnels it into the jungle + the
// opposite carry lane. Magnitudes mirror the simulator's existing auto
// weakside redistribution (~±22 / ±8 g/min).
const WEAK_PENALTY = 22;
const WEAK_BOOST = 8;

function applySideWeakside(
  laneAdv: Record<Lane, number>,
  side: "blue" | "red",
  weak: WeaksideLane,
): void {
  if (weak === "none") return;
  // For blue, "blue worse in lane L" means laneAdv[L] decreases. For red,
  // "red worse in lane L" means blue is relatively better → laneAdv[L]
  // increases. The funded lanes move the opposite way.
  const sign = side === "blue" ? 1 : -1;
  laneAdv[weak] -= WEAK_PENALTY * sign;
  const fundedSolo: Lane = weak === "top" ? "bottom" : "top";
  laneAdv.jungle += WEAK_BOOST * sign;
  laneAdv[fundedSolo] += WEAK_BOOST * sign;
}

// Returns a new laneAdv map with both teams' weakside plans applied. Pure —
// does not mutate the input.
export function applyWeaksideToLaneAdv(
  laneAdv: Record<Lane, number>,
  blue: TeamStrategy,
  red: TeamStrategy,
): Record<Lane, number> {
  const out = { ...laneAdv };
  applySideWeakside(out, "blue", blue.weakside);
  applySideWeakside(out, "red", red.weakside);
  return out;
}

// ─── Win-condition (carry funnel) redistribution ──────────────────────────────
//
// The mirror of weakside: a team funnels gold INTO its chosen carry lane,
// drawn from its utility roles (support + jungle CS/sweeper). Modest so it
// stacks with weakside without dominating the lane economy.
const CARRY_BOOST = 12;
const CARRY_DRAW = 5;

function applySideCarry(
  laneAdv: Record<Lane, number>,
  side: "blue" | "red",
  wc: WinCondition,
): void {
  const lane = winConditionLane(wc);
  if (!lane) return;
  const sign = side === "blue" ? 1 : -1;
  laneAdv[lane] += CARRY_BOOST * sign;
  // Drawn from the team's utility roles (skip the carry lane itself).
  if (lane !== "support") laneAdv.support -= CARRY_DRAW * sign;
  if (lane !== "jungle") laneAdv.jungle -= (CARRY_DRAW - 1) * sign;
}

// Returns a new laneAdv map with both teams' win-condition funnels applied.
export function applyCarryFocusToLaneAdv(
  laneAdv: Record<Lane, number>,
  blue: TeamStrategy,
  red: TeamStrategy,
): Record<Lane, number> {
  const out = { ...laneAdv };
  applySideCarry(out, "blue", blue.winCondition);
  applySideCarry(out, "red", red.winCondition);
  return out;
}

// ─── Pick-target gold denial ──────────────────────────────────────────────────
//
// Hunting a specific enemy lane (their fed carry / high-tier player) denies
// that laner gold and tempo — the targeting side comes out ahead in that lane.
const PICK_DENY = 9;

function pickTargetLane(pt: PickTarget): Lane | null {
  return pt === "top" ? "top" : pt === "mid" ? "middle" : pt === "bot" ? "bottom" : null;
}

export function applyPickTargetToLaneAdv(
  laneAdv: Record<Lane, number>,
  blue: TeamStrategy,
  red: TeamStrategy,
): Record<Lane, number> {
  const out = { ...laneAdv };
  // Blue hunting red's lane L → blue comes out ahead there (laneAdv is
  // blue-positive). Red hunting blue's lane → the opposite.
  const bl = pickTargetLane(blue.pickTarget);
  if (bl) out[bl] += PICK_DENY;
  const rl = pickTargetLane(red.pickTarget);
  if (rl) out[rl] -= PICK_DENY;
  return out;
}

// ─── Lane swap (dodge an unfavorable top matchup) ─────────────────────────────
//
// A lane swap trades a losing top matchup for a fresh one: the swapping side's
// top deficit is largely neutralized, at the cost of a little bot-lane tempo
// (the duo is out of position). laneAdv.top is blue-positive, so a blue deficit
// reads negative and a red deficit reads positive.
export function applyLaneSwapToLaneAdv(
  laneAdv: Record<Lane, number>,
  blue: TeamStrategy,
  red: TeamStrategy,
): Record<Lane, number> {
  const out = { ...laneAdv };
  if (blue.laneSwap === "lane-swap") {
    if (out.top < 0) out.top *= 0.45; // dodged the bad matchup
    out.bottom -= 5; // swap costs a touch of bot tempo
  }
  if (red.laneSwap === "lane-swap") {
    if (out.top > 0) out.top *= 0.45;
    out.bottom += 5;
  }
  return out;
}
