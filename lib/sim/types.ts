// Public types used across the simulator. Pure data shapes — no logic.

import type { Lane, Side } from "../types";

export interface TeamScore {
  damageBalance: number;
  frontline: number;
  laneSynergy: number;
  engagePresence: number;
  ccQuality: number;
  compIdentity: number;
  phaseBalance: number;
  scalingAdvantage: number;
  matchupEdge: number;
  matchupTags: string[];
  metaStrength: number;
  metaTierAvg: number; // average tier numeric (0-6) for display
  synergyBonus: number;
  synergyTags: string[];
  total: number;
  apCount: number;
  adCount: number;
  frontCount: number;
  hardCcCount: number;
  lateCount: number;
  earlyCount: number;
  highMobCount: number;
  lowMobCount: number;
  identityLabel: string | null;
}

export type EventType =
  | "first-blood"
  | "solo-kill"
  | "gank"
  | "counter-gank"
  | "plates"
  | "dragon"
  | "soul"
  | "atakhan"
  | "grubs"
  | "herald"
  | "tower"
  | "inhibitor"
  | "skirmish"
  | "pick"
  | "teamfight"
  | "baron"
  | "ace"
  | "elder"
  | "nexus"
  | "invade"
  | "scuttle"
  | "roam"
  | "buff-steal"
  | "shutdown"
  | "backdoor"
  // ─── Added events (gameplay flavor, no surrender events) ───────────────
  // vision         — control ward / deep ward leading to a catch
  // outplay        — solo player wins outnumbered (1v2 / 1v3)
  // objective-trade — cross-map trade (drake-for-herald / tower-for-baron)
  // wave-crash     — wave management converted into a plate or freeze
  // power-spike    — key item completion ("Caitlyn completes Kraken Slayer")
  | "vision"
  | "outplay"
  | "objective-trade"
  | "wave-crash"
  | "power-spike";

export interface EventKills {
  blue: number;
  red: number;
}

// Per-lane K/D/A delta for one team in one event. Used by the live
// scoreboard strip to render KDA next to each champion as the timeline
// reveals — same accumulation pattern as laneGoldDelta.
export interface LaneKDA {
  k: number;
  d: number;
  a: number;
}

export interface EventKDA {
  blue: Partial<Record<Lane, LaneKDA>>;
  red: Partial<Record<Lane, LaneKDA>>;
}

export interface MatchEvent {
  minutes: number;
  time: string;
  side: Side;
  type: EventType;
  description: string;
  kills: EventKills;
  towers: EventKills;
  inhibs: EventKills;
  // Per-lane gold delta (positive = blue gains in that lane). UI sums these
  // across revealed events to render the live per-lane gold diff.
  laneGoldDelta: Partial<Record<Lane, number>>;
  // Per-lane K/D/A attribution — kills/deaths/assists added by this event,
  // bucketed by side and lane. UI sums across revealed events to render
  // each champion's running KDA. Total kills here mirror `kills` (blue/red
  // sums match) but carry lane attribution that `kills` doesn't.
  kdaDelta: EventKDA;
  // Blue win probability *after* this event resolves. Drives the live
  // probability bar — comebacks visibly swing it. 0..1.
  winProbAfter: number;
}

export interface MatchTimeline {
  durationMinutes: number;
  durationLabel: string;
  events: MatchEvent[];
  // Game-minute at which the laning phase ended. Real LoL: lane phase
  // ends when the first turret falls (or roughly min 14 if no early
  // pressure). The UI uses this to cap passive lane-gold accumulation.
  laningEndMinute: number;
}

export interface SimulationResult {
  blueProb: number;
  redProb: number;
  winner: Side;
  blueScore: TeamScore;
  redScore: TeamScore;
  timeline: MatchTimeline;
  // Passive gold-per-minute advantage per lane during laning phase.
  // Positive = blue ahead. Computed from phase + archetype + mobility matchups.
  laneAdvantages: Record<Lane, number>;
}

export type AtakhanVariant = "Voracious" | "Ruinous";
