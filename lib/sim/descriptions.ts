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
import type { RNG } from "../rng";
import type { AtakhanVariant, EventKDA, EventKills, LaneKDA } from "./types";

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

// Randomized helpers. Each takes an optional trailing RNG (defaults to
// Math.random) so existing callers keep working while seeded callers
// (matchSimulator with SimulateOptions.rng, tests) stay deterministic.
export function pickRandom<T>(arr: readonly T[], rng: RNG = Math.random): T {
  return arr[Math.floor(rng() * arr.length)];
}

export function rollInt(lo: number, hi: number, rng: RNG = Math.random): number {
  return Math.floor(rng() * (hi - lo + 1)) + lo;
}

export function jitter(min: number, max: number, rng: RNG = Math.random): number {
  return min + rng() * (max - min);
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
function killVerb(killer: Champion, rng: RNG = Math.random): string {
  const meta = metaFor(killer);
  const has = (a: Archetype) => meta.archetypes.includes(a);
  if (has("pick"))
    return pickRandom(["lands a hook on", "snipes", "catches"], rng);
  if (has("assassin"))
    return pickRandom(["all-ins", "deletes", "blows up"], rng);
  if (has("dive") && has("engage"))
    return pickRandom(["tower-dives", "flank-engages on"], rng);
  if (has("skirmish")) return pickRandom(["outduels", "1v1s"], rng);
  if (has("burst")) return pickRandom(["one-shots", "burns down"], rng);
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

// The lane describeFirstBlood credits the kill to — exported so the timeline
// can attribute the KDA to the SAME champion the line names (instead of a
// random lane that left the named killer on 0/0/0). Pure, no rng.
export function firstBloodKillerLane(
  winnerPicks: (Champion | null)[],
): Lane | null {
  const killer =
    findByArchetype(winnerPicks, ["assassin", "skirmish", "pick", "dive"]) ??
    winnerPicks.find((c) => c != null);
  if (!killer) return null;
  const idx = winnerPicks.indexOf(killer);
  return idx >= 0 ? POSITIONAL_LANES[idx] : null;
}

export function describeFirstBlood(
  side: Side,
  winnerPicks: (Champion | null)[],
  loserPicks: (Champion | null)[],
  earlyTime: number,
  rng: RNG = Math.random,
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
    return `${prefix}${killer.name} ${killVerb(killer, rng)} ${victim.name} ${pickRandom(places, rng)}`;
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
  rng: RNG = Math.random,
): string {
  const lanes: Lane[] = ["top", "middle"];
  const lane = pickRandom(lanes, rng);
  return `${teamName(side, blueName, redName)} grabs Rift Herald, smashes ${lane} tier-1`;
}

export function describeTower(
  side: Side,
  picks: (Champion | null)[],
  blueName: string,
  redName: string,
  isFirst: boolean,
  rng: RNG = Math.random,
): string {
  const splitPush = findByArchetype(picks, ["splitpush"]);
  if (splitPush && rng() < 0.55) {
    const sideLane: Lane = splitPush.lanes.includes("top")
      ? "top"
      : splitPush.lanes.includes("bottom")
      ? "bottom"
      : "top";
    return `${splitPush.name} solo-pushes ${isFirst ? "the outer" : "an inner"} ${sideLane} tower`;
  }
  const lanes: Lane[] = ["top", "middle", "bottom"];
  const tier = isFirst ? "outer" : "inner";
  return `${teamName(side, blueName, redName)} takes the ${tier} ${pickRandom(lanes, rng)} tower`;
}

export function describeInhibitor(
  side: Side,
  picks: (Champion | null)[],
  blueName: string,
  redName: string,
  rng: RNG = Math.random,
): string {
  const splitPush = findByArchetype(picks, ["splitpush"]);
  const lanes: Lane[] = ["top", "middle", "bottom"];
  const lane = pickRandom(lanes, rng);
  if (splitPush && rng() < 0.4) {
    return `${splitPush.name} cracks the ${lane} inhibitor — super minions inbound`;
  }
  return `${teamName(side, blueName, redName)} breaks the ${lane} inhibitor`;
}

export function describePick(
  side: Side,
  winnerPicks: (Champion | null)[],
  loserPicks: (Champion | null)[],
  rng: RNG = Math.random,
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
    return `${hooker.name} ${killVerb(hooker, rng)} ${target.name} ${pickRandom(places, rng)}`;
  }
  return `${teamName(side, "Blue", "Red")} picks off a stray`;
}

// Carry archetype priorities the teamfight/skirmish lines name their hero by.
const TEAMFIGHT_CARRY: Archetype[] = ["wombo", "burst", "hyper-carry", "engage"];
const SKIRMISH_CARRY: Archetype[] = [
  "wombo",
  "engage",
  "burst",
  "assassin",
  "skirmish",
];

export function describeSkirmish(
  side: Side,
  winnerPicks: (Champion | null)[],
  winnerKills: number,
  loserKills: number,
  rng: RNG = Math.random,
): string {
  const carry =
    findByArchetype(winnerPicks, SKIRMISH_CARRY) ??
    winnerPicks.find((c) => c != null);
  const places = ["the river", "bot side jungle", "top side jungle", "mid lane"];
  const where = pickRandom(places, rng);
  const fightSize = pickRandom(["2v2", "3v3", "3v2"], rng);
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
  rng: RNG = Math.random,
): string {
  const score = `${winnerKills}-${loserKills}`;
  const places = ["dragon pit", "Baron pit", "mid lane", "river", "tri-bush"];
  const place = pickRandom(places, rng);
  const tag = winnerLabel ? ` — ${winnerLabel} hits` : "";
  const carry = findByArchetype(winnerPicks, TEAMFIGHT_CARRY);
  const opener = winnerKills - loserKills >= 4 ? "MASSIVE fight at" : "5v5 at";
  if (carry && rng() < 0.6) {
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
  rng: RNG = Math.random,
): string {
  const smiter = laneOf(winnerPicks, "jungle");
  if (stolen && smiter) {
    return `STOLEN! ${smiter.name} smites Baron Nashor away`;
  }
  if (smiter && rng() < 0.4) {
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
  rng: RNG = Math.random,
): string {
  const pusher = findByArchetype(picks, ["splitpush", "poke"]);
  const lanes: Lane[] = ["top", "middle", "bottom"];
  const lane = pickRandom(lanes, rng);
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
  rng: RNG = Math.random,
): string {
  const engager =
    findByArchetype(winnerPicks, ["engage", "pick", "tank"]) ??
    winnerPicks.find((c) => c != null);
  const victim = findSquishy(loserPicks);
  const place = pickRandom(
    ["enemy red buff", "enemy blue buff", "enemy raptors", "tri-bush"],
    rng,
  );
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
  rng: RNG = Math.random,
): string {
  const jg = picks[POSITIONAL_LANES.indexOf("jungle")];
  const where = pickRandom(["bot side", "top side"], rng);
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
  roamerLane?: Lane,
): string {
  const midIdx = POSITIONAL_LANES.indexOf("middle");
  const supIdx = POSITIONAL_LANES.indexOf("support");
  const roamer =
    (roamerLane != null ? laneOf(picks, roamerLane) : null) ??
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
  rng: RNG = Math.random,
): string {
  const jg = picks[POSITIONAL_LANES.indexOf("jungle")];
  const buff = pickRandom(["red buff", "blue buff", "raptors", "krugs"], rng);
  if (jg) {
    return `${jg.name} invades the enemy jungle, steals ${buff}`;
  }
  return `${teamName(side, blueName, redName)} steals enemy ${buff}`;
}

// The fed enemy champ a shutdown cashes out on. Exported so the timeline can
// attribute the DEATH (and name the victim) to the SAME champion — keeping the
// KDA scoreboard consistent with the event line. Deterministic, no rng.
export function shutdownVictim(
  loserPicks: (Champion | null)[],
): Champion | null {
  return (
    findByArchetype(loserPicks, ["hyper-carry", "burst", "assassin"]) ??
    findSquishy(loserPicks)
  );
}

export function shutdownVictimLane(
  loserPicks: (Champion | null)[],
): Lane | null {
  const victim = shutdownVictim(loserPicks);
  if (!victim) return null;
  const idx = loserPicks.indexOf(victim);
  return idx >= 0 ? POSITIONAL_LANES[idx] : null;
}

export function describeShutdown(
  side: Side,
  winnerPicks: (Champion | null)[],
  loserPicks: (Champion | null)[],
  bounty: number,
  killerLane?: Lane,
): string {
  const killer =
    (killerLane != null ? laneOf(winnerPicks, killerLane) : null) ??
    findByArchetype(winnerPicks, ["assassin", "pick", "burst", "skirmish"]) ??
    winnerPicks.find((c) => c != null);
  const victim = shutdownVictim(loserPicks);
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

// ─── New event description renderers ────────────────────────────────────────

export function describeVision(
  side: Side,
  winnerPicks: (Champion | null)[],
  loserPicks: (Champion | null)[],
  blueName: string,
  redName: string,
  rng: RNG = Math.random,
  watcherLane?: Lane,
): string {
  const watcher =
    (watcherLane != null ? laneOf(winnerPicks, watcherLane) : null) ??
    findByArchetype(winnerPicks, ["pick", "engage", "tank"]) ??
    laneOf(winnerPicks, "support") ??
    winnerPicks.find((c) => c != null);
  const victim = findSquishy(loserPicks);
  const place = pickRandom(
    [
      "the Baron pit bush",
      "tri-bush",
      "drake pit",
      "river entrance",
      "the lane brush",
    ],
    rng,
  );
  if (watcher && victim) {
    return `${watcher.name} drops a control ward in ${place} — ${victim.name} steps on it`;
  }
  return `${teamName(side, blueName, redName)} reads the map, lands a vision-pick at ${place}`;
}

export function describeOutplay(
  side: Side,
  winnerPicks: (Champion | null)[],
  loserPicks: (Champion | null)[],
  outnumberedBy: number,
  rng: RNG = Math.random,
  heroLane?: Lane,
): string {
  const star =
    (heroLane != null ? laneOf(winnerPicks, heroLane) : null) ??
    findByArchetype(winnerPicks, ["assassin", "skirmish", "hyper-carry", "burst"]) ??
    winnerPicks.find((c) => c != null);
  const place = pickRandom(
    ["the side lane", "river", "tri-bush", "their own jungle"],
    rng,
  );
  const ratio = outnumberedBy >= 3 ? "1v3" : "1v2";
  if (star) {
    const flair = pickRandom(["OUTPLAY!", "INSANE!", "WHAT A PLAY!"], rng);
    return `${flair} ${star.name} wins a ${ratio} in ${place}`;
  }
  return `Outplay — ${teamName(side, "Blue", "Red")} wins a ${ratio} in ${place}`;
}

export function describeObjectiveTrade(
  side: Side,
  blueName: string,
  redName: string,
  giveUp: "drake" | "herald" | "tower",
  takeFor: "drake" | "herald" | "tower" | "plates",
): string {
  const labels: Record<typeof giveUp | typeof takeFor, string> = {
    drake: "Drake",
    herald: "Herald",
    tower: "tower",
    plates: "plates",
  };
  return `Cross-map: ${teamName(side, blueName, redName)} trades ${labels[giveUp]} for ${labels[takeFor]}`;
}

export function describeWaveCrash(
  side: Side,
  picks: (Champion | null)[],
  lane: Lane,
  blueName: string,
  redName: string,
): string {
  const idx = POSITIONAL_LANES.indexOf(lane);
  const laner = picks[idx];
  const laneShort = lane === "middle" ? "mid" : lane === "bottom" ? "bot" : lane;
  if (laner) {
    return `${laner.name} crashes the wave ${laneShort}, freezes the bounce`;
  }
  return `${teamName(side, blueName, redName)} wins the wave-crash ${laneShort}`;
}

// Mid-game strategic pivot (adaptiveMidgame). The losing side tears up its
// game plan around minute 20 — the copy names the NEW plan so the comeback
// (or the failed gamble) reads as a coaching decision in the replay.
export function describeStrategicPivot(
  side: Side,
  blueName: string,
  redName: string,
  kind: "all-in" | "splitpush" | "objective-rush",
): string {
  const team = teamName(side, blueName, redName);
  switch (kind) {
    case "all-in":
      return `PLAN PIVOT — ${team} abandons the slow game: hunt picks, force Baron`;
    case "splitpush":
      return `PLAN PIVOT — ${team} splits 1-3-1 to crack the siege, backdoor on the table`;
    case "objective-rush":
      return `PLAN PIVOT — ${team} sells out for objectives, trading everything for the next take`;
  }
}

export function describePowerSpike(
  champion: Champion,
  keyItem: string,
  rng: RNG = Math.random,
): string {
  // Real LoL casters describe spikes with verbs that match the item:
  // "completes" for purchases, "comes online" / "powers up" for moments.
  const verb = pickRandom(["completes", "powers up with", "finishes"], rng);
  return `POWER SPIKE — ${champion.name} ${verb} ${keyItem}`;
}

// ─── KDA attribution helpers ────────────────────────────────────────────────
// Each event produces an EventKDA describing per-lane K/D/A deltas. The UI
// accumulates these across revealed events so the live scoreboard shows
// each champion's running KDA — same pattern as laneGoldDelta.
//
// Attribution is heuristic, not authoritative: kills go to the lane most
// likely responsible for the play (carry-weighted for teamfights, the
// fight's actor for solo events), assists trail along, deaths land on
// squishier roles. Numbers stay internally consistent — sum of per-lane
// kills on each side matches the event's `kills.{blue,red}`.

const LANE_LIST: readonly Lane[] = [
  "top",
  "jungle",
  "middle",
  "bottom",
  "support",
];

// Role-shaped weighting that mirrors real-LoL stat profiles:
//   • Support     — mostly assists, very few kills (CCs and peels, rarely
//                   secures kills directly; sits on the lowest kill share).
//   • Jungle      — high kills AND high assists (presents in every fight,
//                   ganks for kills, secures objectives).
//   • Mid         — high kills AND high assists (primary damage carry that
//                   roams; consistent participation).
//   • Bottom (ADC) — high kills, low-ish assists (busy DPSing, dies more
//                   often due to squishy positioning).
//   • Top         — moderate kills, LOW assists (isolated side lane, rarely
//                   present for cross-map kills); deaths from 1v1 trades.
const KILL_WEIGHTS: Record<Lane, number> = {
  top: 0.18,
  jungle: 0.24,
  middle: 0.28,
  bottom: 0.25,
  support: 0.05,
};

const DEATH_WEIGHTS: Record<Lane, number> = {
  top: 0.18,
  jungle: 0.13,
  middle: 0.18,
  bottom: 0.27,
  support: 0.24,
};

const ASSIST_WEIGHTS: Record<Lane, number> = {
  top: 0.10,
  jungle: 0.26,
  middle: 0.22,
  bottom: 0.12,
  support: 0.30,
};

export function makeKDA(): EventKDA {
  return { blue: {}, red: {} };
}

export const NO_KDA: Readonly<EventKDA> = Object.freeze({ blue: {}, red: {} });

function laneBucket(
  side: Partial<Record<Lane, LaneKDA>>,
  lane: Lane,
): LaneKDA {
  let v = side[lane];
  if (!v) {
    v = { k: 0, d: 0, a: 0 };
    side[lane] = v;
  }
  return v;
}

export function addKill(
  kda: EventKDA,
  side: Side,
  lane: Lane,
  n: number = 1,
): void {
  laneBucket(kda[side], lane).k += n;
}

export function addAssist(
  kda: EventKDA,
  side: Side,
  lane: Lane,
  n: number = 1,
): void {
  laneBucket(kda[side], lane).a += n;
}

export function addDeath(
  kda: EventKDA,
  side: Side,
  lane: Lane,
  n: number = 1,
): void {
  laneBucket(kda[side], lane).d += n;
}

function pickWeighted(weights: Record<Lane, number>, rng: RNG = Math.random): Lane {
  const total = LANE_LIST.reduce((s, l) => s + weights[l], 0);
  let r = rng() * total;
  for (const lane of LANE_LIST) {
    r -= weights[lane];
    if (r <= 0) return lane;
  }
  return LANE_LIST[LANE_LIST.length - 1];
}

// Single laner kill: kill on the winner's lane, death on the opponent's lane.
// Used for solo-kill, first-blood, single-target gank/roam events.
export function laneKillKDA(
  winnerSide: Side,
  lane: Lane,
  kills: number = 1,
  victimLane: Lane = lane,
): EventKDA {
  const k = makeKDA();
  if (kills <= 0) return k;
  const loserSide: Side = winnerSide === "blue" ? "red" : "blue";
  addKill(k, winnerSide, lane, kills);
  addDeath(k, loserSide, victimLane, kills);
  return k;
}

// Gank / roam: laner gets the kill, ganker (jg or roamer) gets an assist.
// Victim laner takes the death.
export function gankKDA(
  winnerSide: Side,
  killerLane: Lane,
  assistLane: Lane,
  victimLane: Lane,
): EventKDA {
  const k = makeKDA();
  const loserSide: Side = winnerSide === "blue" ? "red" : "blue";
  addKill(k, winnerSide, killerLane);
  addAssist(k, winnerSide, assistLane);
  addDeath(k, loserSide, victimLane);
  return k;
}

// Spread N kills (and proportional assists) across the winner's team using
// carry-weighted sampling, plus N deaths across the loser's team using
// squishy-weighted sampling. For teamfights, skirmishes, objective fights.
export function teamfightKDA(
  winnerSide: Side,
  winnerKills: number,
  loserKills: number,
  rng: RNG = Math.random,
): EventKDA {
  const k = makeKDA();
  const loserSide: Side = winnerSide === "blue" ? "red" : "blue";

  // Winner kills + assists. Each kill ~1.5 assists in pro LoL — round to 1
  // assist per kill plus an extra assist for half the kills. Keeps numbers
  // believable for early skirmishes (3-1 fight: 3K, 4-5A spread).
  for (let i = 0; i < winnerKills; i++) {
    addKill(k, winnerSide, pickWeighted(KILL_WEIGHTS, rng));
  }
  const assists = Math.max(0, Math.floor(winnerKills * 1.5));
  for (let i = 0; i < assists; i++) {
    addAssist(k, winnerSide, pickWeighted(ASSIST_WEIGHTS, rng));
  }
  // Each winner kill = 1 death somewhere on the losing team.
  for (let i = 0; i < winnerKills; i++) {
    addDeath(k, loserSide, pickWeighted(DEATH_WEIGHTS, rng));
  }

  // Loser kills (the few they got back).
  for (let i = 0; i < loserKills; i++) {
    addKill(k, loserSide, pickWeighted(KILL_WEIGHTS, rng));
  }
  const loserAssists = Math.max(0, Math.floor(loserKills * 1.3));
  for (let i = 0; i < loserAssists; i++) {
    addAssist(k, loserSide, pickWeighted(ASSIST_WEIGHTS, rng));
  }
  for (let i = 0; i < loserKills; i++) {
    addDeath(k, winnerSide, pickWeighted(DEATH_WEIGHTS, rng));
  }
  return k;
}

// Ace: spread 5 kills evenly across winner team (one per lane), 5 deaths
// evenly across loser team, plus generous assists.
export function aceKDA(winnerSide: Side): EventKDA {
  const k = makeKDA();
  const loserSide: Side = winnerSide === "blue" ? "red" : "blue";
  for (const lane of LANE_LIST) {
    addKill(k, winnerSide, lane);
    addDeath(k, loserSide, lane);
    // Each member is in on most kills — 3 assists each is reasonable for a 5-0.
    addAssist(k, winnerSide, lane, 3);
  }
  return k;
}

// Smiter event (drake/baron/elder): if a smite-steal happened, the smiter
// gets credit. Otherwise distribute via teamfight pattern.
//
// `smiterSide` is the team that *stole* the objective (where the smiter
// lives). For drake events, the post-fight kill winner is often the
// OPPOSITE of the smiter (the team that lost the objective wins the
// post-smite skirmish), so the smiter assist must be attributed
// independently of `winnerSide`. Defaults to `winnerSide` so baron/elder
// callers — which model the steal-taker as the kill winner — keep their
// existing behavior.
export function objectiveKDA(
  winnerSide: Side,
  winnerKills: number,
  loserKills: number,
  smiterStolen: boolean,
  smiterSide: Side = winnerSide,
  rng: RNG = Math.random,
): EventKDA {
  const k = teamfightKDA(winnerSide, winnerKills, loserKills, rng);
  if (smiterStolen) {
    // Smiter (jungle) gets bonus credit — they made the play happen.
    addAssist(k, smiterSide, "jungle");
  }
  return k;
}

// Lane on `side` that earned the most kills in this event's KDA (ties broken
// by assists). Null if nobody on that side scored.
export function topFraggerLane(kda: EventKDA, side: Side): Lane | null {
  let best: Lane | null = null;
  let bestK = 0;
  let bestA = -1;
  for (const lane of LANE_LIST) {
    const v = kda[side][lane];
    if (!v || v.k <= 0) continue;
    if (v.k > bestK || (v.k === bestK && v.a > bestA)) {
      best = lane;
      bestK = v.k;
      bestA = v.a;
    }
  }
  return best;
}

// Re-point a teamfight/skirmish line to the champion who ACTUALLY got the
// kills. The line picks its hero by archetype BEFORE the kda is rolled, and
// the random kda then credits kills by weight — so the named carry often sat
// on 0/0/0. We can't reseed the kda (it also feeds lane gold → combat, so a
// reseed shifts the simulation), so we fix the DISPLAY name post-hoc: a pure
// string swap, zero rng / zero sim impact. No-op when the line named the team
// (no champion) or the named carry already is the top fragger.
export function nameActualFragger(
  desc: string,
  picks: (Champion | null)[],
  kda: EventKDA,
  side: Side,
  carryArchetypes: readonly Archetype[],
): string {
  const carry =
    findByArchetype(picks, carryArchetypes) ?? picks.find((c) => c != null);
  if (!carry || !desc.includes(carry.name)) return desc;
  const lane = topFraggerLane(kda, side);
  const frag = lane != null ? laneOf(picks, lane) : null;
  return frag && frag !== carry ? desc.replace(carry.name, frag.name) : desc;
}

// The archetype lists the teamfight / skirmish lines select their hero with —
// exported so nameActualFragger callers re-point to the matching champion.
export const TEAMFIGHT_CARRY_ARCHETYPES: readonly Archetype[] = TEAMFIGHT_CARRY;
export const SKIRMISH_CARRY_ARCHETYPES: readonly Archetype[] = SKIRMISH_CARRY;

// ─── Gold-from-KDA attribution ─────────────────────────────────────────────
// In real LoL each kill is worth ~300g local + assist gold to participants.
// The simulator's lane-gold strip should reflect this: a champion with 8
// kills against a 0/8 enemy laner has to be visibly ahead in gold, not
// roughly even because the team-fight gold was spread evenly.
//
// We convert each event's kdaDelta into a per-lane gold delta:
//   • +300g per kill the champ scored
//   • +100g per assist (kill participation)
// And merge this into the event's existing laneGoldDelta.
//
// `kdaToLaneGold` is blue-positive (matches laneGoldDelta convention).
const KILL_GOLD = 300;
const ASSIST_GOLD = 100;

export function kdaToLaneGold(kda: EventKDA): Partial<Record<Lane, number>> {
  const out: Partial<Record<Lane, number>> = {};
  for (const lane of LANE_LIST) {
    const blue = kda.blue[lane];
    const red = kda.red[lane];
    let net = 0;
    if (blue) net += blue.k * KILL_GOLD + blue.a * ASSIST_GOLD;
    if (red) net -= red.k * KILL_GOLD + red.a * ASSIST_GOLD;
    if (net !== 0) out[lane] = net;
  }
  return out;
}

// Merge two lane-gold maps (blue-positive). Used to combine an event's base
// lane gold (e.g. objective bounty distributed team-wide) with the kill-
// derived gold from kdaToLaneGold.
export function mergeLaneGold(
  base: Partial<Record<Lane, number>>,
  add: Partial<Record<Lane, number>>,
): Partial<Record<Lane, number>> {
  const out: Partial<Record<Lane, number>> = { ...base };
  for (const lane of LANE_LIST) {
    const v = add[lane];
    if (v !== undefined && v !== 0) {
      out[lane] = (out[lane] ?? 0) + v;
    }
  }
  return out;
}

// ─── Damage profile weights ────────────────────────────────────────────────
// Synthetic damage attribution: combine each champion's KDA with their
// archetype damage profile to estimate "damage dealt" share. Real LoL
// damage is unmeasurable here (no ability hits / ticks tracked), but the
// visualization conveys the right intuition: an ADC carries more damage
// than a tank with the same KDA, an assassin scales kills harder than a
// support, etc.
//
// The pickHighest function returns the strongest archetype-based weight
// since a champion may have multiple archetypes (e.g. hyper-carry +
// skirmish on Tristana → uses hyper-carry's 1.3).
const ARCHETYPE_DAMAGE_WEIGHT: Partial<Record<string, number>> = {
  "hyper-carry": 1.35,
  burst: 1.25,
  assassin: 1.2,
  poke: 1.05,
  splitpush: 1.0,
  skirmish: 0.9,
  dive: 0.85,
  wombo: 0.8,
  sustain: 0.7,
  pick: 0.6,
  engage: 0.55,
  peel: 0.45,
  tank: 0.4,
  enchanter: 0.3,
};

export function damageWeightFor(meta: Pick<ChampionMeta, "archetypes">): number {
  let best = 0.6; // Default for any unmapped archetype
  for (const a of meta.archetypes) {
    const w = ARCHETYPE_DAMAGE_WEIGHT[a];
    if (w !== undefined && w > best) best = w;
  }
  return best;
}

// Synthetic damage value for a single player given their KDA and meta.
// Formula: (kills + 0.5 * assists + 0.15 * deaths) * archetype-weight.
// Deaths add a tiny amount (you were in fights, dealt some damage before
// dying) so a 0/8/0 carry still registers a non-zero share.
export function syntheticDamage(
  kda: { k: number; d: number; a: number },
  meta: Pick<ChampionMeta, "archetypes">,
): number {
  const base = kda.k + kda.a * 0.5 + kda.d * 0.15;
  return base * damageWeightFor(meta);
}

