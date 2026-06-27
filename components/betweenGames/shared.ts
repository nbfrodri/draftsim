// Shared types, constants, and pure helper functions for the betweenGames
// module. No React, no side-effects — safe to import from any sub-component.

import type { EventBlipSeverity } from "@/lib/sounds";
import type {
  AtakhanVariant,
  EventType,
  LaneKDA,
  MatchEvent,
} from "@/lib/matchSimulator";
import type { TeamScore } from "@/lib/matchSimulator";
import type { Lane, Side } from "@/lib/types";

// ─── Playback types ──────────────────────────────────────────────────────────

export type PlayMode = "playing" | "paused" | "finished";
export type PlaySpeed = 1 | 2 | 4;

// Each event reveals after at least this many real-time seconds at 1x speed.
// Even closely-spaced in-game events get a breathing-room gap so users can
// read each line. Total playback ≈ events.length * SECONDS_PER_EVENT_AT_1X.
// For a typical ~16-event timeline that's ~80s at 1x, ~40s at 2x, ~20s at 4x.
export const SECONDS_PER_EVENT_AT_1X = 5;

// Minimum real-time interval between playback state updates (currentMin).
// The rAF loop runs at display refresh (~60fps) but committing a React
// state update that often re-renders the whole live panel (recharts SVG
// rebuilds, lane gold strip, scoreboard) every frame — the source of the
// reported playback jank. 100ms (~10fps) is indistinguishable for a clock
// that displays whole seconds and for gold counters, while cutting render
// work by ~6x. Event reveals are spaced ≥1.25s apart (5s slot at 4x), so
// a ≤100ms reveal latency is imperceptible.
export const PLAYBACK_UI_UPDATE_MS = 100;

// ─── Stats types ─────────────────────────────────────────────────────────────

export type SideLaneKDA = Record<Lane, LaneKDA>;

export interface RunningStats {
  kills: { blue: number; red: number };
  drakes: { blue: number; red: number };
  barons: { blue: number; red: number };
  towers: { blue: number; red: number };
  inhibs: { blue: number; red: number };
  hasSoul: Side | null;
  // Which Dragon Soul element was secured (set alongside hasSoul).
  soulElement: string | null;
  // Which side took Elder Dragon (its execute buff), if revealed yet.
  hasElder: Side | null;
  // Atakhan taker + variant, if revealed yet.
  atakhan: { side: Side; variant: AtakhanVariant } | null;
  // Current tempo (momentum, -1..1 blue-positive) and net map control (blue −
  // red towers) as of the last revealed event — the "who has the initiative"
  // state the count rows don't convey.
  momentum: number;
  mapControl: number;
  // Net per-lane gold contributed by revealed events (positive = blue ahead).
  // Lane phase passive gold is added separately in computeLiveLaneGold().
  laneGoldEvent: Record<Lane, number>;
  // Per-lane K/D/A accumulated across revealed events. Mirrors laneGoldEvent
  // but split by side so the live scoreboard can render each champion's KDA.
  laneKDA: { blue: SideLaneKDA; red: SideLaneKDA };
}

// ─── Flash types ─────────────────────────────────────────────────────────────

// Per-lane involvement classification for the most recent event. Used by
// LaneGoldRow to decide which champion icons to flash and what color.
export type FlashKind = "kill" | "death" | "objective" | null;
export interface LaneInvolvement {
  blue: FlashKind;
  red: FlashKind;
}

// ─── Comparison types ────────────────────────────────────────────────────────

export interface ComparisonRow {
  label: string;
  blue: number;
  red: number;
  // Maximum theoretical diff between the two values — used to scale the
  // tug-of-war bar so a small lead doesn't render as a full pull.
  maxDiff: number;
  // Optional helper text shown only when one side is meaningfully ahead.
  tooltip?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const LANE_ORDER: readonly Lane[] = ["top", "jungle", "middle", "bottom", "support"];

// Events without per-champion kills that should still pulse the team that
// took them — e.g. the side that secured a drake/herald/tower.
export const OBJECTIVE_FLASH_TYPES: ReadonlySet<EventType> = new Set([
  "dragon",
  "soul",
  "elder",
  "baron",
  "atakhan",
  "herald",
  "grubs",
  "tower",
  "inhibitor",
  "plates",
  "scuttle",
  "wave-crash",
  "objective-trade",
  "power-spike",
  "vision",
]);

export const EVENT_LABEL: Record<EventType, string> = {
  "first-blood": "First Blood",
  "solo-kill": "Solo Kill",
  gank: "Gank",
  "counter-gank": "Counter-gank",
  plates: "Plates",
  dragon: "Dragon",
  soul: "Soul",
  atakhan: "Atakhan",
  grubs: "Grubs",
  herald: "Herald",
  tower: "Tower",
  inhibitor: "Inhib",
  skirmish: "Skirmish",
  pick: "Pick",
  teamfight: "Teamfight",
  baron: "Baron",
  ace: "Ace",
  elder: "Elder",
  nexus: "Nexus",
  invade: "Invade",
  scuttle: "Scuttle",
  roam: "Roam",
  "buff-steal": "Buff Steal",
  shutdown: "Shutdown",
  backdoor: "Backdoor",
  vision: "Vision",
  outplay: "Outplay",
  "objective-trade": "Trade",
  "wave-crash": "Wave Crash",
  "power-spike": "Spike",
  comeback: "Comeback",
  throw: "Throw",
  "counter-jungle": "Counter-jungle",
  dive: "Dive",
  siege: "Siege",
};

// Events that deserve extra emphasis in the timeline (gold tinted, larger).
// Event → audio severity. Three buckets:
//   minor — single-target / no-objective events (kills, plates, scuttle, etc.)
//   mid   — objective takes and team fights (drake/herald/tower/teamfight)
//   major — game-defining moments (soul/baron/elder/ace/shutdown/backdoor/nexus)
// Anything not listed defaults to "minor". Synced with EMPHASIS_EVENTS but
// we keep them separate so audio can be slightly broader than visual emphasis
// (e.g. a drake should chime even though it doesn't get a gold border).
export const EVENT_BLIP_SEVERITY: Partial<Record<EventType, EventBlipSeverity>> = {
  // minor (default — kills and small plays)
  "first-blood": "minor",
  "solo-kill": "minor",
  gank: "minor",
  "counter-gank": "minor",
  plates: "minor",
  scuttle: "minor",
  invade: "minor",
  roam: "minor",
  "buff-steal": "minor",
  vision: "minor",
  outplay: "minor",
  "wave-crash": "minor",
  "objective-trade": "minor",
  "power-spike": "minor",
  // mid (objective + fight)
  dragon: "mid",
  atakhan: "mid",
  grubs: "mid",
  herald: "mid",
  tower: "mid",
  inhibitor: "mid",
  skirmish: "mid",
  pick: "mid",
  teamfight: "mid",
  // major (game-defining)
  soul: "major",
  baron: "major",
  elder: "major",
  ace: "major",
  shutdown: "major",
  backdoor: "major",
  nexus: "major",
  comeback: "major",
  throw: "major",
  "counter-jungle": "minor",
  dive: "mid",
  siege: "minor",
};

export const EMPHASIS_EVENTS: ReadonlySet<EventType> = new Set([
  "soul",
  "elder",
  "ace",
  "nexus",
  "shutdown",
  "backdoor",
  "comeback",
  "throw",
]);

// Matchup tags that represent an advantage to *this* team. Anything not in
// the set is a disadvantage (carry without peel into dive, wombo into peel,
// etc.) and gets the red downward styling.
export const POSITIVE_MATCHUP_TAGS: ReadonlySet<string> = new Set([
  "Mobile vs Poke",
  "Engage vs No Frontline",
  "Dive into Backline",
  "Slippery vs Skillshots",
  "Sustain vs Burst",
  "Engage Cancel",
  "Splitpush Pressure",
  "Full Lockdown",
  "DPS vs Soft Backline",
  "Tank Wall vs No DPS",
  "Mixed Damage Pressure",
]);

// ─── Pure helpers ─────────────────────────────────────────────────────────────

export function matchPaceLabel(duration: number): string {
  if (duration < 26) return "Decisive";
  if (duration < 32) return "Standard";
  if (duration < 38) return "Scaling Battle";
  return "Marathon";
}

export function emptySideKDA(): SideLaneKDA {
  return {
    top: { k: 0, d: 0, a: 0 },
    jungle: { k: 0, d: 0, a: 0 },
    middle: { k: 0, d: 0, a: 0 },
    bottom: { k: 0, d: 0, a: 0 },
    support: { k: 0, d: 0, a: 0 },
  };
}

export function computeRunningStats(events: MatchEvent[], upTo: number): RunningStats {
  const stats: RunningStats = {
    kills: { blue: 0, red: 0 },
    drakes: { blue: 0, red: 0 },
    barons: { blue: 0, red: 0 },
    towers: { blue: 0, red: 0 },
    inhibs: { blue: 0, red: 0 },
    hasSoul: null,
    soulElement: null,
    hasElder: null,
    atakhan: null,
    momentum: 0,
    mapControl: 0,
    laneGoldEvent: { top: 0, jungle: 0, middle: 0, bottom: 0, support: 0 },
    laneKDA: { blue: emptySideKDA(), red: emptySideKDA() },
  };
  for (let i = 0; i < upTo; i++) {
    const e = events[i];
    // These are snapshots, not sums — the latest revealed event's value wins.
    stats.momentum = e.momentumAfter;
    stats.mapControl = e.mapControlAfter;
    stats.kills.blue += e.kills.blue;
    stats.kills.red += e.kills.red;
    stats.towers.blue += e.towers.blue;
    stats.towers.red += e.towers.red;
    stats.inhibs.blue += e.inhibs.blue;
    stats.inhibs.red += e.inhibs.red;
    if (e.type === "dragon" || e.type === "soul") stats.drakes[e.side]++;
    if (e.type === "soul") {
      stats.hasSoul = e.side;
      stats.soulElement = e.soulElement ?? null;
    }
    if (e.type === "elder") stats.hasElder = e.side;
    if (e.type === "atakhan" && e.atakhanVariant) {
      stats.atakhan = { side: e.side, variant: e.atakhanVariant };
    }
    if (e.type === "baron") stats.barons[e.side]++;
    for (const lane of LANE_ORDER) {
      stats.laneGoldEvent[lane] += e.laneGoldDelta[lane] ?? 0;
      const blueLane = e.kdaDelta.blue[lane];
      if (blueLane) {
        stats.laneKDA.blue[lane].k += blueLane.k;
        stats.laneKDA.blue[lane].d += blueLane.d;
        stats.laneKDA.blue[lane].a += blueLane.a;
      }
      const redLane = e.kdaDelta.red[lane];
      if (redLane) {
        stats.laneKDA.red[lane].k += redLane.k;
        stats.laneKDA.red[lane].d += redLane.d;
        stats.laneKDA.red[lane].a += redLane.a;
      }
    }
  }
  return stats;
}

// Live per-lane gold diff = lane phase passive (saturates when laning
// ends) + event-driven contributions from revealed events. Laning end is
// dynamic — set by the simulator to the minute the first turret fell, or
// 14 as a fallback if the lanes held that long.
export function computeLiveLaneGold(
  laneAdvantages: Record<Lane, number>,
  laneGoldEvent: Record<Lane, number>,
  currentMin: number,
  laningEndMinute: number,
): Record<Lane, number> {
  const lanePhaseTime = Math.min(currentMin, laningEndMinute);
  const out: Record<Lane, number> = { top: 0, jungle: 0, middle: 0, bottom: 0, support: 0 };
  for (const lane of LANE_ORDER) {
    out[lane] = laneAdvantages[lane] * lanePhaseTime + laneGoldEvent[lane];
  }
  return out;
}

// Gold model: team gold lead = sum of per-lane gold differentials so the
// numbers stay numerically consistent with the lane gold strip displayed
// below. Each side's total is the team baseline (~2k g/min/team) split
// around the lead, so blue + red always sum to 2× baseline regardless of
// who's ahead, and the displayed diff matches what summing the 5 lane rows
// would produce.
export function computeGold(
  laneGold: Record<Lane, number>,
  currentMin: number,
): { blue: number; red: number; lead: number } {
  const teamLead = LANE_ORDER.reduce((s, l) => s + laneGold[l], 0);
  const baseline = Math.round(currentMin * 2000);
  const halfLead = teamLead / 2;
  return {
    blue: Math.round(baseline + halfLead),
    red: Math.round(baseline - halfLead),
    lead: Math.round(teamLead),
  };
}

// Used for big team-total displays (~30k-60k range) where the `k` shorthand
// keeps the typography compact.
export function formatGold(g: number): string {
  if (g >= 10000) return `${(g / 1000).toFixed(1)}k`;
  return `${(g / 1000).toFixed(2)}k`;
}

// Used for the per-lane live delta where values are typically 50-2500g and
// the user wants the actual integer (not "0.2k"). Commas group thousands
// for readability when the lead crosses 1000g.
export function formatLaneGold(g: number): string {
  return Math.round(g).toLocaleString("en-US");
}

// Replace champion names in event descriptions with player handles.
// Sorted by name length descending so "Miss Fortune" replaces before "Miss".
// ponytail: plain split/join; champion names are proper nouns, never substrings of each other.
export function applyChampHandles(desc: string, map: Map<string, string>): string {
  if (map.size === 0) return desc;
  let result = desc;
  const entries = [...map.entries()].sort((a, b) => b[0].length - a[0].length);
  for (const [champName, handle] of entries) {
    result = result.split(champName).join(handle);
  }
  return result;
}

export function formatClock(min: number): string {
  const m = Math.floor(min);
  const s = Math.floor((min - m) * 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function formatKDA(k: LaneKDA): string {
  return `${k.k}/${k.d}/${k.a}`;
}

// Map an involvement kind + ally side to the right CSS animation class.
// Kill flashes use the player's own side color (blue ally got a kill =
// blue glow). Death always flashes red, regardless of side, since the
// red ring reads as "this player died" universally. Objective flashes
// (drake/baron/tower with no per-champion kill) use gold.
export function flashClassFor(kind: FlashKind, side: Side): string {
  if (kind == null) return "";
  if (kind === "death") return "animate-event-flash-red";
  if (kind === "objective") return "animate-event-flash-gold";
  // kill/assist
  return side === "blue" ? "animate-event-flash-blue" : "animate-event-flash-red";
}

// Derive involvement from an event's kdaDelta. A lane with a kill (or
// assist) flashes in blue/red depending on side; a lane with a death
// flashes red regardless of side. For events with no kills (towers, drakes
// without smite-steal, plates), every lane on the event's side gets a
// gold "objective" flash since the team contributed to the take.
export function involvementFor(
  event: MatchEvent,
  lane: Lane,
): { blue: FlashKind; red: FlashKind } {
  const blueLane = event.kdaDelta.blue[lane];
  const redLane = event.kdaDelta.red[lane];
  let blueKind: FlashKind = null;
  let redKind: FlashKind = null;
  if (blueLane && (blueLane.k > 0 || blueLane.a > 0)) blueKind = "kill";
  else if (blueLane && blueLane.d > 0) blueKind = "death";
  if (redLane && (redLane.k > 0 || redLane.a > 0)) redKind = "kill";
  else if (redLane && redLane.d > 0) redKind = "death";

  // Objective events (drake/baron/tower/herald with no per-lane kills)
  // attribute to the event's side as a team-wide flash. We detect this by
  // "no kdaDelta entries on either side" and an event type that's an
  // objective — the row that matches the event's side gets a gold flash.
  if (
    !blueKind &&
    !redKind &&
    OBJECTIVE_FLASH_TYPES.has(event.type)
  ) {
    if (event.side === "blue") blueKind = "objective";
    else redKind = "objective";
  }
  return { blue: blueKind, red: redKind };
}

export function buildComparisonRows(
  blue: TeamScore,
  red: TeamScore,
): { label: string; rows: ComparisonRow[] }[] {
  return [
    {
      label: "Composition",
      rows: [
        {
          label: "Damage Balance",
          blue: blue.damageBalance,
          red: red.damageBalance,
          maxDiff: 8,
        },
        {
          label: "Frontline",
          blue: blue.frontline,
          red: red.frontline,
          maxDiff: 6,
        },
        {
          label: "Hard CC",
          blue: blue.ccQuality,
          red: red.ccQuality,
          maxDiff: 5,
        },
        {
          label: "Comp Identity",
          blue: blue.compIdentity,
          red: red.compIdentity,
          maxDiff: 6,
        },
      ],
    },
    {
      label: "Macro Edge",
      rows: [
        {
          label: "Engage",
          blue: blue.engagePresence,
          red: red.engagePresence,
          maxDiff: 9,
        },
        {
          label: "Phase Balance",
          blue: blue.phaseBalance,
          red: red.phaseBalance,
          maxDiff: 5,
        },
        {
          label: "Scaling",
          blue: blue.scalingAdvantage,
          red: red.scalingAdvantage,
          maxDiff: 10,
        },
        {
          label: "Matchup Edge",
          blue: blue.matchupEdge,
          red: red.matchupEdge,
          maxDiff: 8,
        },
      ],
    },
    {
      label: "Synergy",
      rows: [
        {
          label: "Pair Synergies",
          blue: blue.synergyBonus,
          red: red.synergyBonus,
          maxDiff: 6,
        },
        {
          label: "Lane Synergy",
          blue: blue.laneSynergy,
          red: red.laneSynergy,
          maxDiff: 4,
        },
      ],
    },
  ];
}

// Synthesize a 1-2 line narrative verdict from the score deltas. Picks the
// 1-2 most decisive differences and phrases them naturally. Keeps it short
// — this is a tagline, not an essay.
export function buildVerdict(
  blueName: string,
  redName: string,
  blue: TeamScore,
  red: TeamScore,
): string[] {
  const lines: string[] = [];
  const totalDiff = blue.total - red.total;
  const ahead = totalDiff > 0 ? blueName : redName;
  const behind = totalDiff > 0 ? redName : blueName;
  if (Math.abs(totalDiff) > 12) {
    lines.push(`${ahead} clearly favored on draft strength.`);
  } else if (Math.abs(totalDiff) > 5) {
    lines.push(`${ahead} edges the draft, but ${behind} can play to its strengths.`);
  } else {
    lines.push("Drafts roughly even — the game will be decided in-game.");
  }
  // Find the single most-decisive metric difference.
  type Diff = { metric: string; delta: number; favors: string };
  const diffs: Diff[] = [
    { metric: "scaling", delta: blue.scalingAdvantage - red.scalingAdvantage, favors: "" },
    { metric: "frontline", delta: blue.frontline - red.frontline, favors: "" },
    { metric: "engage presence", delta: blue.engagePresence - red.engagePresence, favors: "" },
    { metric: "hard CC", delta: blue.ccQuality - red.ccQuality, favors: "" },
    { metric: "phase tempo", delta: blue.phaseBalance - red.phaseBalance, favors: "" },
  ];
  for (const d of diffs) d.favors = d.delta > 0 ? blueName : redName;
  diffs.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const top = diffs[0];
  if (top && Math.abs(top.delta) >= 2) {
    lines.push(`${top.favors} wins ${top.metric}.`);
  }
  return lines;
}
