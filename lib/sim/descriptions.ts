// Event description renderers and the supporting helpers they depend on.
// All pure functions — no shared state with the timeline state machine.
// Extracted from matchSimulator.ts to keep the orchestration file focused
// on state management while the flavor lives here.

import type { Champion, Lane, Side } from "../types";
import {
  getChampionMeta,
  type Archetype,
  type ChampionMeta,
  type Mobility,
  type Phase,
} from "../championMeta";
import type { AtakhanVariant, EventKills } from "./types";

// ─── Constants ──────────────────────────────────────────────────────────────

export const POSITIONAL_LANES: readonly Lane[] = [
  "top",
  "jungle",
  "middle",
  "bottom",
  "support",
];

export const DRAGON_TYPES = [
  "Infernal",
  "Ocean",
  "Mountain",
  "Cloud",
  "Hextech",
  "Chemtech",
];

export const NO_KILLS: EventKills = { blue: 0, red: 0 };

const ROLE_TANK = "tank";
const ROLE_FIGHTER = "fighter";
const ROLE_MAGE = "mage";
const ROLE_MARKSMAN = "marksman";
const ROLE_ASSASSIN = "assassin";

// ─── Utility helpers ────────────────────────────────────────────────────────

export function formatTime(min: number): string {
  const m = Math.floor(min);
  const s = Math.round((min - m) * 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function rollInt(lo: number, hi: number): number {
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

export function jitter(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function killsForSide(
  side: Side,
  winnerKills: number,
  loserKills: number,
): EventKills {
  return side === "blue"
    ? { blue: winnerKills, red: loserKills }
    : { blue: loserKills, red: winnerKills };
}

// Convenience for events that grant N towers (and optionally inhibs) to a
// side without the opponent contesting. Returns three EventKills deltas.
export function deltasFor(
  side: Side,
  opts: {
    winnerKills?: number;
    loserKills?: number;
    winnerTowers?: number;
    loserTowers?: number;
    winnerInhibs?: number;
    loserInhibs?: number;
  } = {},
): { kills: EventKills; towers: EventKills; inhibs: EventKills } {
  return {
    kills: killsForSide(side, opts.winnerKills ?? 0, opts.loserKills ?? 0),
    towers: killsForSide(side, opts.winnerTowers ?? 0, opts.loserTowers ?? 0),
    inhibs: killsForSide(side, opts.winnerInhibs ?? 0, opts.loserInhibs ?? 0),
  };
}

// ─── Champion data helpers ──────────────────────────────────────────────────

function rolesOf(c: Champion): Set<string> {
  return new Set(c.roles.map((r) => r.toLowerCase()));
}

export function isAP(c: Champion): boolean {
  return rolesOf(c).has(ROLE_MAGE);
}

export function isAD(c: Champion): boolean {
  const r = rolesOf(c);
  if (r.has(ROLE_MARKSMAN) || r.has(ROLE_ASSASSIN)) return true;
  if (r.has(ROLE_FIGHTER) && !r.has(ROLE_MAGE)) return true;
  return false;
}

// Fallback meta for champions missing from the curated dataset — uses
// Riot's role tags to make a best-effort guess. The simulator stays usable
// even if a brand-new champion isn't tagged yet.
export function fallbackMeta(c: Champion): ChampionMeta {
  const r = rolesOf(c);
  const archetypes: Archetype[] = [];
  if (r.has(ROLE_TANK)) archetypes.push("tank", "engage");
  if (r.has(ROLE_FIGHTER) && !r.has(ROLE_TANK))
    archetypes.push("skirmish", "dive");
  if (r.has(ROLE_MARKSMAN)) archetypes.push("hyper-carry");
  if (r.has(ROLE_ASSASSIN)) archetypes.push("assassin");
  if (r.has(ROLE_MAGE)) archetypes.push("burst");
  if (r.has("support")) archetypes.push("peel");

  let phase: Phase = "mid";
  if (r.has(ROLE_MARKSMAN) || r.has(ROLE_MAGE)) phase = "mid-late";
  else if (r.has(ROLE_ASSASSIN)) phase = "mid";
  else if (r.has(ROLE_FIGHTER) && !r.has(ROLE_TANK)) phase = "mid";

  let mobility: Mobility = "low";
  if (r.has(ROLE_ASSASSIN)) mobility = "high";
  else if (r.has(ROLE_FIGHTER) && !r.has(ROLE_TANK)) mobility = "medium";
  else if (r.has(ROLE_MARKSMAN)) mobility = "medium";

  return {
    phase,
    archetypes: archetypes.length > 0 ? archetypes : ["skirmish"],
    cc: r.has(ROLE_TANK) || r.has("support") ? "hard" : "soft",
    mobility,
    metaTiers: {},
  };
}

export function metaFor(c: Champion): ChampionMeta {
  return getChampionMeta(c.alias) ?? fallbackMeta(c);
}

// ─── Champion-finder helpers ────────────────────────────────────────────────

export function laneOf(
  picks: (Champion | null)[],
  lane: Lane,
): Champion | null {
  const idx = POSITIONAL_LANES.indexOf(lane);
  return idx >= 0 ? picks[idx] : null;
}

export function findByArchetype(
  picks: (Champion | null)[],
  archetypes: readonly Archetype[],
): Champion | null {
  for (const c of picks) {
    if (!c) continue;
    const meta = metaFor(c);
    if (archetypes.some((a) => meta.archetypes.includes(a))) return c;
  }
  return null;
}

export function findSquishy(
  picks: (Champion | null)[],
): Champion | null {
  const squishyArchetypes: readonly Archetype[] = [
    "hyper-carry",
    "enchanter",
    "burst",
    "poke",
  ];
  return (
    findByArchetype(picks, squishyArchetypes) ??
    picks.find((c) => c != null) ??
    null
  );
}

export function lateScalingCount(picks: (Champion | null)[]): number {
  let n = 0;
  for (const c of picks) {
    if (!c) continue;
    const m = metaFor(c);
    if (m.phase === "late" || m.phase === "mid-late") n++;
  }
  return n;
}

export function earlyCount(picks: (Champion | null)[]): number {
  let n = 0;
  for (const c of picks) {
    if (!c) continue;
    if (metaFor(c).phase === "early") n++;
  }
  return n;
}

// ─── Description helpers ────────────────────────────────────────────────────

function teamName(
  side: Side,
  blueName: string,
  redName: string,
): string {
  return side === "blue" ? blueName : redName;
}

// Verbs flavored by the killer's archetype — assassins all-in, picks land
// hooks, divers tower-dive, skirmishers outduel. Falls back to "catches".
function killVerb(killer: Champion): string {
  const meta = metaFor(killer);
  const has = (a: Archetype) => meta.archetypes.includes(a);
  if (has("pick")) return pickRandom(["lands a hook on", "snipes", "catches"]);
  if (has("assassin")) return pickRandom(["all-ins", "deletes", "blows up"]);
  if (has("dive") && has("engage"))
    return pickRandom(["tower-dives", "flank-engages on"]);
  if (has("skirmish")) return pickRandom(["outduels", "1v1s"]);
  if (has("burst")) return pickRandom(["one-shots", "burns down"]);
  if (has("hyper-carry")) return "kites down";
  return "catches";
}

// ─── Lane gold distribution helpers ─────────────────────────────────────────

export function spreadLaneGold(
  amount: number,
  side: Side,
): Partial<Record<Lane, number>> {
  const sign = side === "blue" ? 1 : -1;
  const each = (sign * amount) / 5;
  return { top: each, jungle: each, middle: each, bottom: each, support: each };
}

export function singleLaneGold(
  lane: Lane,
  amount: number,
  side: Side,
): Partial<Record<Lane, number>> {
  const sign = side === "blue" ? 1 : -1;
  return { [lane]: sign * amount };
}

export function gankLaneGold(
  lane: Lane,
  killGold: number,
  side: Side,
): Partial<Record<Lane, number>> {
  // 60% to the laner who got the kill, 40% assist gold to the jungle.
  const sign = side === "blue" ? 1 : -1;
  return {
    [lane]: sign * killGold * 0.6,
    jungle: sign * killGold * 0.4,
  };
}

export function sideLaneGoldSplit(
  amount: number,
  side: Side,
): Partial<Record<Lane, number>> {
  // Plates favour side lanes (top/bot).
  const sign = side === "blue" ? 1 : -1;
  return {
    top: sign * amount * 0.4,
    bottom: sign * amount * 0.4,
    middle: sign * amount * 0.1,
    jungle: sign * amount * 0.05,
    support: sign * amount * 0.05,
  };
}

// ─── Event description renderers ────────────────────────────────────────────

export function describeFirstBlood(
  side: Side,
  winnerPicks: (Champion | null)[],
  loserPicks: (Champion | null)[],
  earlyTime: number,
): string {
  const killer =
    findByArchetype(winnerPicks, ["assassin", "skirmish", "pick", "dive"]) ??
    winnerPicks.find((c) => c != null);
  const victim = findSquishy(loserPicks);
  const places = [
    "in the river",
    "post-back",
    "in a 2v2 trade",
    "in the enemy jungle",
    "fighting over the scuttle",
  ];
  let prefix = "";
  if (earlyTime < 3.4) prefix = "AN EARLY first blood — ";
  else if (earlyTime > 5.0) prefix = "Late first blood — ";

  if (killer && victim) {
    return `${prefix}${killer.name} ${killVerb(killer)} ${victim.name} ${pickRandom(places)}`;
  }
  return `${prefix}First blood for ${teamName(side, "Blue", "Red")}`;
}

export function describeDragon(
  side: Side,
  blueName: string,
  redName: string,
  stack: number,
  drakeType: string,
  stolen: boolean = false,
): string {
  const ord =
    stack === 1
      ? "first"
      : stack === 2
      ? "second"
      : stack === 3
      ? "third"
      : "fourth";
  if (stolen) {
    return `STOLEN! ${teamName(side, blueName, redName)} smites ${drakeType} Drake away (${ord})`;
  }
  return `${teamName(side, blueName, redName)} secures ${drakeType} Drake (${ord})`;
}

export function describeSoul(
  side: Side,
  blueName: string,
  redName: string,
  drakeType: string,
): string {
  return `${teamName(side, blueName, redName)} claims ${drakeType} SOUL`;
}

export function describeAtakhan(
  side: Side,
  blueName: string,
  redName: string,
  variant: AtakhanVariant,
): string {
  const buff =
    variant === "Voracious"
      ? "extra gold from kills"
      : "Blood Roses for revives";
  return `${teamName(side, blueName, redName)} kills ${variant} Atakhan — ${buff}`;
}

export function describeGrubs(
  side: Side,
  blueName: string,
  redName: string,
  count: number,
): string {
  return `${teamName(side, blueName, redName)} secures ${count} Voidgrub${count === 1 ? "" : "s"}`;
}

export function describeHerald(
  side: Side,
  blueName: string,
  redName: string,
): string {
  const lanes: Lane[] = ["top", "middle"];
  const lane = pickRandom(lanes);
  return `${teamName(side, blueName, redName)} grabs Rift Herald, smashes ${lane} tier-1`;
}

export function describeTower(
  side: Side,
  picks: (Champion | null)[],
  blueName: string,
  redName: string,
  isFirst: boolean,
): string {
  const splitPush = findByArchetype(picks, ["splitpush"]);
  if (splitPush && Math.random() < 0.55) {
    const sideLane: Lane = splitPush.lanes.includes("top")
      ? "top"
      : splitPush.lanes.includes("bottom")
      ? "bottom"
      : "top";
    return `${splitPush.name} solo-pushes ${isFirst ? "the outer" : "an inner"} ${sideLane} tower`;
  }
  const lanes: Lane[] = ["top", "middle", "bottom"];
  const tier = isFirst ? "outer" : "inner";
  return `${teamName(side, blueName, redName)} takes the ${tier} ${pickRandom(lanes)} tower`;
}

export function describeInhibitor(
  side: Side,
  picks: (Champion | null)[],
  blueName: string,
  redName: string,
): string {
  const splitPush = findByArchetype(picks, ["splitpush"]);
  const lanes: Lane[] = ["top", "middle", "bottom"];
  const lane = pickRandom(lanes);
  if (splitPush && Math.random() < 0.4) {
    return `${splitPush.name} cracks the ${lane} inhibitor — super minions inbound`;
  }
  return `${teamName(side, blueName, redName)} breaks the ${lane} inhibitor`;
}

export function describePick(
  side: Side,
  winnerPicks: (Champion | null)[],
  loserPicks: (Champion | null)[],
): string {
  const hooker = findByArchetype(winnerPicks, ["pick"]);
  const target = findSquishy(loserPicks);
  if (hooker && target) {
    const places = [
      "in the fog",
      "stepping onto a ward",
      "after a back",
      "near Baron pit",
    ];
    return `${hooker.name} ${killVerb(hooker)} ${target.name} ${pickRandom(places)}`;
  }
  return `${teamName(side, "Blue", "Red")} picks off a stray`;
}

export function describeSkirmish(
  side: Side,
  winnerPicks: (Champion | null)[],
  winnerKills: number,
  loserKills: number,
): string {
  const carry =
    findByArchetype(winnerPicks, [
      "wombo",
      "engage",
      "burst",
      "assassin",
      "skirmish",
    ]) ?? winnerPicks.find((c) => c != null);
  const places = ["the river", "bot side jungle", "top side jungle", "mid lane"];
  const where = pickRandom(places);
  const fightSize = pickRandom(["2v2", "3v3", "3v2"]);
  if (carry) {
    return `${carry.name} wins a ${fightSize} in ${where} (${winnerKills}-${loserKills})`;
  }
  return `${fightSize} in ${where} — ${teamName(side, "Blue", "Red")} ahead ${winnerKills}-${loserKills}`;
}

export function describeTeamfight(
  side: Side,
  winnerPicks: (Champion | null)[],
  winnerLabel: string | null,
  winnerKills: number,
  loserKills: number,
): string {
  const score = `${winnerKills}-${loserKills}`;
  const places = ["dragon pit", "Baron pit", "mid lane", "river", "tri-bush"];
  const place = pickRandom(places);
  const tag = winnerLabel ? ` — ${winnerLabel} hits` : "";
  const carry = findByArchetype(winnerPicks, [
    "wombo",
    "burst",
    "hyper-carry",
    "engage",
  ]);
  const opener = winnerKills - loserKills >= 4 ? "MASSIVE fight at" : "5v5 at";
  if (carry && Math.random() < 0.6) {
    return `${opener} ${place}, ${carry.name} pops off ${score}${tag}`;
  }
  return `${opener} ${place}, ${teamName(side, "Blue", "Red")} wins ${score}${tag}`;
}

export function describeBaron(
  side: Side,
  winnerPicks: (Champion | null)[],
  blueName: string,
  redName: string,
  stolen: boolean,
  contestKills: { winner: number; loser: number },
): string {
  const smiter = laneOf(winnerPicks, "jungle");
  if (stolen && smiter) {
    return `STOLEN! ${smiter.name} smites Baron Nashor away`;
  }
  if (smiter && Math.random() < 0.4) {
    return `${smiter.name} secures Baron Nashor (${contestKills.winner}-${contestKills.loser})`;
  }
  return `${teamName(side, blueName, redName)} takes Baron Nashor (${contestKills.winner}-${contestKills.loser})`;
}

export function describeAce(
  side: Side,
  blueName: string,
  redName: string,
): string {
  return `${teamName(side, blueName, redName)} ACES — bases wide open`;
}

export function describeElder(
  side: Side,
  blueName: string,
  redName: string,
  stolen: boolean,
): string {
  return stolen
    ? `STOLEN Elder! ${teamName(side, blueName, redName)} clutches the smite`
    : `${teamName(side, blueName, redName)} kills Elder Dragon`;
}

export function describeNexus(
  side: Side,
  blueName: string,
  redName: string,
  time: string,
): string {
  return `${teamName(side, blueName, redName)} destroys the Nexus at ${time}`;
}

export function describeSoloKill(
  side: Side,
  winnerPicks: (Champion | null)[],
  lane: Lane,
): string {
  const idx = POSITIONAL_LANES.indexOf(lane);
  const winnerChamp = winnerPicks[idx];
  const laneShort = lane === "middle" ? "mid" : lane === "bottom" ? "bot" : lane;
  if (!winnerChamp) return `Solo kill in ${laneShort}`;
  return `${winnerChamp.name} solo-kills in ${laneShort}`;
}

export function describeGank(
  side: Side,
  picks: (Champion | null)[],
  lane: Lane,
  blueName: string,
  redName: string,
): string {
  const jg = picks[POSITIONAL_LANES.indexOf("jungle")];
  const idx = POSITIONAL_LANES.indexOf(lane);
  const laner = picks[idx];
  const laneShort = lane === "middle" ? "mid" : lane === "bottom" ? "bot" : lane;
  if (jg && laner) {
    return `${jg.name} ganks ${laneShort} for ${laner.name}`;
  }
  return `${teamName(side, blueName, redName)} successful ${laneShort} gank`;
}

export function describeCounterGank(
  side: Side,
  picks: (Champion | null)[],
  blueName: string,
  redName: string,
): string {
  const jg = picks[POSITIONAL_LANES.indexOf("jungle")];
  if (jg) {
    return `${jg.name} counter-ganks the play`;
  }
  return `${teamName(side, blueName, redName)} flips the gank`;
}

export function describePlates(
  side: Side,
  picks: (Champion | null)[],
  blueName: string,
  redName: string,
): string {
  const pusher = findByArchetype(picks, ["splitpush", "poke"]);
  const lanes: Lane[] = ["top", "middle", "bottom"];
  const lane = pickRandom(lanes);
  const laneShort = lane === "middle" ? "mid" : lane === "bottom" ? "bot" : lane;
  if (pusher) {
    return `${pusher.name} cracks all plates ${laneShort}`;
  }
  return `${teamName(side, blueName, redName)} secures plates ${laneShort}`;
}

export function describeInvade(
  side: Side,
  winnerPicks: (Champion | null)[],
  loserPicks: (Champion | null)[],
  blueName: string,
  redName: string,
): string {
  const engager =
    findByArchetype(winnerPicks, ["engage", "pick", "tank"]) ??
    winnerPicks.find((c) => c != null);
  const victim = findSquishy(loserPicks);
  const place = pickRandom([
    "enemy red buff",
    "enemy blue buff",
    "enemy raptors",
    "tri-bush",
  ]);
  if (engager && victim) {
    return `LEVEL ONE — ${engager.name} catches ${victim.name} at ${place}`;
  }
  return `${teamName(side, blueName, redName)} wins the level 1 invade at ${place}`;
}

export function describeScuttle(
  side: Side,
  picks: (Champion | null)[],
  blueName: string,
  redName: string,
): string {
  const jg = picks[POSITIONAL_LANES.indexOf("jungle")];
  const where = pickRandom(["bot side", "top side"]);
  if (jg) {
    return `${jg.name} fights for ${where} scuttler — wins the crab`;
  }
  return `${teamName(side, blueName, redName)} secures ${where} scuttle`;
}

export function describeRoam(
  side: Side,
  picks: (Champion | null)[],
  targetLane: Lane,
  blueName: string,
  redName: string,
): string {
  const midIdx = POSITIONAL_LANES.indexOf("middle");
  const supIdx = POSITIONAL_LANES.indexOf("support");
  const roamer =
    findByArchetype(picks, ["assassin", "pick", "burst"]) ??
    picks[midIdx] ??
    picks[supIdx];
  const laneShort =
    targetLane === "middle"
      ? "mid"
      : targetLane === "bottom"
      ? "bot"
      : targetLane;
  if (roamer) {
    return `${roamer.name} roams to ${laneShort}, picks up a kill`;
  }
  return `${teamName(side, blueName, redName)} roams ${laneShort} for a kill`;
}

export function describeBuffSteal(
  side: Side,
  picks: (Champion | null)[],
  blueName: string,
  redName: string,
): string {
  const jg = picks[POSITIONAL_LANES.indexOf("jungle")];
  const buff = pickRandom(["red buff", "blue buff", "raptors", "krugs"]);
  if (jg) {
    return `${jg.name} invades the enemy jungle, steals ${buff}`;
  }
  return `${teamName(side, blueName, redName)} steals enemy ${buff}`;
}

export function describeShutdown(
  side: Side,
  winnerPicks: (Champion | null)[],
  loserPicks: (Champion | null)[],
): string {
  const killer =
    findByArchetype(winnerPicks, ["assassin", "pick", "burst", "skirmish"]) ??
    winnerPicks.find((c) => c != null);
  const victim =
    findByArchetype(loserPicks, ["hyper-carry", "burst", "assassin"]) ??
    findSquishy(loserPicks);
  const bounty = pickRandom([1000, 1000, 1500]);
  if (killer && victim) {
    return `SHUTDOWN! ${killer.name} collects ${bounty}g bounty on ${victim.name}`;
  }
  return `Shutdown — ${bounty}g bounty cashed in`;
}

export function describeBackdoor(
  side: Side,
  picks: (Champion | null)[],
  blueName: string,
  redName: string,
): string {
  const splitter =
    findByArchetype(picks, ["splitpush", "skirmish"]) ??
    picks.find((c) => c != null);
  if (splitter) {
    return `BACKDOOR! ${splitter.name} sneaks in alone, smashes the Nexus`;
  }
  return `${teamName(side, blueName, redName)} backdoors the Nexus`;
}

