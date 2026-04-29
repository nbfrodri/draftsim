import type { Champion, GameDraft, Lane, Side } from "./types";
import {
  getChampionMeta,
  getMetaTier,
  getSynergy,
  TIER_VALUE,
  type Archetype,
  type ChampionMeta,
  type MetaTier,
  type Mobility,
  type Phase,
} from "./championMeta";

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
  | "nexus";

export interface EventKills {
  blue: number;
  red: number;
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
  // Blue win probability *after* this event resolves. Drives the live
  // probability bar — comebacks visibly swing it. 0..1.
  winProbAfter: number;
}

export interface MatchTimeline {
  durationMinutes: number;
  durationLabel: string;
  events: MatchEvent[];
}

export interface SimulationResult {
  blueProb: number;
  redProb: number;
  winner: Side;
  blueScore: TeamScore;
  redScore: TeamScore;
  timeline: MatchTimeline;
  // Passive gold-per-minute advantage per lane during laning phase (0-14 min).
  // Positive = blue ahead. Computed from phase + archetype + mobility matchups.
  laneAdvantages: Record<Lane, number>;
}

const ROLE_TANK = "tank";
const ROLE_FIGHTER = "fighter";
const ROLE_MAGE = "mage";
const ROLE_MARKSMAN = "marksman";
const ROLE_ASSASSIN = "assassin";

function rolesOf(c: Champion): Set<string> {
  return new Set(c.roles.map((r) => r.toLowerCase()));
}

function isAP(c: Champion): boolean {
  return rolesOf(c).has(ROLE_MAGE);
}

function isAD(c: Champion): boolean {
  const r = rolesOf(c);
  if (r.has(ROLE_MARKSMAN) || r.has(ROLE_ASSASSIN)) return true;
  if (r.has(ROLE_FIGHTER) && !r.has(ROLE_MAGE)) return true;
  return false;
}

// Fallback meta for champions missing from the curated dataset — uses Riot's
// role tags to make a best-effort guess. The simulator stays usable even if
// a brand-new champion isn't tagged yet.
function fallbackMeta(c: Champion): ChampionMeta {
  const r = rolesOf(c);
  const archetypes: Archetype[] = [];
  if (r.has(ROLE_TANK)) archetypes.push("tank", "engage");
  if (r.has(ROLE_FIGHTER) && !r.has(ROLE_TANK)) archetypes.push("skirmish", "dive");
  if (r.has(ROLE_MARKSMAN)) archetypes.push("hyper-carry");
  if (r.has(ROLE_ASSASSIN)) archetypes.push("assassin");
  if (r.has(ROLE_MAGE)) archetypes.push("burst");
  if (r.has("support")) archetypes.push("peel");

  let phase: Phase = "mid";
  if (r.has(ROLE_MARKSMAN) || r.has(ROLE_MAGE)) phase = "mid-late";
  else if (r.has(ROLE_ASSASSIN)) phase = "mid";
  else if (r.has(ROLE_FIGHTER) && !r.has(ROLE_TANK)) phase = "mid";

  // Mobility heuristic: assassins/skirmishers typically dash, tanks usually
  // don't, control mages stand still. Better than nothing for unlisted champs.
  let mobility: Mobility = "low";
  if (r.has(ROLE_ASSASSIN)) mobility = "high";
  else if (r.has(ROLE_FIGHTER) && !r.has(ROLE_TANK)) mobility = "medium";
  else if (r.has(ROLE_MARKSMAN)) mobility = "medium";

  return {
    phase,
    archetypes: archetypes.length > 0 ? archetypes : ["skirmish"],
    cc: r.has(ROLE_TANK) || r.has("support") ? "hard" : "soft",
    mobility,
    metaTiers: {}, // unknown tier for new/unseen champions
  };
}

function metaFor(c: Champion): ChampionMeta {
  return getChampionMeta(c.alias) ?? fallbackMeta(c);
}

interface TeamMember {
  champ: Champion;
  meta: ChampionMeta;
  lane: Lane | null;
}

function buildTeam(
  picks: (Champion | null)[],
  lanes: (Lane | null)[],
): TeamMember[] {
  const out: TeamMember[] = [];
  for (let i = 0; i < picks.length; i++) {
    const c = picks[i];
    if (!c) continue;
    out.push({ champ: c, meta: metaFor(c), lane: lanes[i] });
  }
  return out;
}

function archetypeCounts(team: TeamMember[]): Record<Archetype, number> {
  const counts: Record<Archetype, number> = {
    engage: 0,
    peel: 0,
    poke: 0,
    dive: 0,
    pick: 0,
    wombo: 0,
    "hyper-carry": 0,
    splitpush: 0,
    assassin: 0,
    tank: 0,
    enchanter: 0,
    burst: 0,
    skirmish: 0,
    sustain: 0,
  };
  for (const m of team) {
    for (const a of m.meta.archetypes) counts[a]++;
  }
  return counts;
}

function damageBalanceScore(team: TeamMember[]): {
  score: number;
  ap: number;
  ad: number;
} {
  const ap = team.filter((m) => isAP(m.champ)).length;
  const ad = team.filter((m) => isAD(m.champ)).length;
  const max = Math.max(ap, ad);
  const min = Math.min(ap, ad);
  if (max === 0) return { score: 0, ap, ad };
  const ratio = min / max;
  return { score: Math.round(ratio * 8), ap, ad };
}

function frontlineScore(team: TeamMember[]): { score: number; count: number } {
  const tankCount = team.filter((m) => m.meta.archetypes.includes("tank")).length;
  // Sustain bruisers count as half-frontline — they can hold a line in extended fights.
  const sustainBruiser = team.filter(
    (m) =>
      !m.meta.archetypes.includes("tank") &&
      m.meta.archetypes.includes("sustain") &&
      (m.meta.archetypes.includes("dive") ||
        m.meta.archetypes.includes("skirmish")),
  ).length;
  const effective = tankCount + sustainBruiser * 0.5;
  let score = 0;
  if (effective >= 2.5) score = 6;
  else if (effective >= 1.5) score = 5;
  else if (effective >= 1) score = 3;
  else if (effective >= 0.5) score = 1;
  else score = 0;
  return { score, count: tankCount };
}

function laneSynergyScore(
  picks: (Champion | null)[],
  lanes: (Lane | null)[],
): number {
  let score = 0;
  for (let i = 0; i < picks.length; i++) {
    const c = picks[i];
    const lane = lanes[i];
    if (!c || !lane) continue;
    if (c.lanes.includes(lane)) score += 0.8;
    else score += 0.1;
  }
  return Math.min(4, Math.round(score));
}

function engagePresenceScore(counts: Record<Archetype, number>): number {
  const eng = counts.engage;
  // Comp can survive without engage if it has hyper-carry + heavy peel.
  const isProtect = counts["hyper-carry"] >= 1 && counts.peel >= 3;
  if (eng >= 2) return 3;
  if (eng === 1) return 1;
  if (isProtect) return -1; // viable but at the mercy of enemy initiation
  return -6; // no opener, no late game scaling — bad
}

function ccQualityScore(team: TeamMember[]): { score: number; count: number } {
  const hard = team.filter((m) => m.meta.cc === "hard").length;
  let score = 0;
  if (hard >= 4) score = 5;
  else if (hard === 3) score = 4;
  else if (hard === 2) score = 2;
  else if (hard === 1) score = 1;
  return { score, count: hard };
}

function compIdentityScore(
  counts: Record<Archetype, number>,
  mob: MobilityProfile,
  hardCcCount: number,
): { label: string | null; score: number } {
  // Order matters: more specific identities first. Each identity captures a
  // recognizable LoL composition pattern as commentated in pro play.
  if (counts["hyper-carry"] >= 1 && counts.peel >= 3)
    return { label: "Protect The Carry", score: 6 };
  if (counts.wombo >= 3 && counts.engage >= 1)
    return { label: "Wombo Combo", score: 6 };
  if (counts.engage >= 3 && counts.tank >= 2)
    return { label: "Hyper Engage", score: 6 };
  if (hardCcCount >= 4 && counts.tank >= 1)
    return { label: "Heavy CC Lockdown", score: 5 };
  if (counts.tank >= 3 && counts.engage >= 2)
    return { label: "Tank Stack", score: 5 };
  if (counts.poke >= 3) return { label: "Poke / Siege", score: 5 };
  if (counts.dive >= 3 && counts.engage >= 1)
    return { label: "Dive Comp", score: 5 };
  if (counts.pick >= 2 && (counts.assassin >= 1 || counts.burst >= 1))
    return { label: "Pick Comp", score: 5 };
  if (counts.burst >= 3) return { label: "AP Burst", score: 5 };
  if (counts.skirmish >= 3 && counts.sustain >= 2)
    return { label: "Bruiser Brawl", score: 5 };
  if (mob.high >= 4) return { label: "Mobile Skirmish", score: 4 };
  if (counts.splitpush >= 2) return { label: "1-3-1 / Splitpush", score: 4 };
  if (counts.skirmish >= 3) return { label: "Skirmish / Bruiser", score: 4 };
  if (counts.tank === 0 && counts["hyper-carry"] + counts.burst >= 3)
    return { label: "Glass Cannon", score: 3 }; // risky, rewards if uninterrupted
  if (counts.engage >= 2 && counts["hyper-carry"] >= 1)
    return { label: "Standard Teamfight", score: 3 };
  return { label: null, score: 0 };
}

// Phase balance: own-team coherence only. A team that scales should still
// pay a small penalty for lacking early presence, even if its scaling is
// rewarded comparatively elsewhere (see scalingAdvantageScore).
function phaseBalanceScore(team: TeamMember[]): number {
  const phases = team.map((m) => m.meta.phase);
  const early = phases.filter((p) => p === "early").length;
  const late = phases.filter((p) => p === "late" || p === "mid-late").length;
  const allEarly = phases.every((p) => p === "early");
  const allLate = phases.every((p) => p === "late" || p === "mid-late");
  if (allEarly) return -2;
  if (allLate) return 1;
  if (early >= 1 && late >= 2) return 3;
  if (early >= 1 || late >= 1) return 1;
  return 0;
}

interface MobilityProfile {
  high: number;
  med: number;
  low: number;
}

function mobilityProfile(team: TeamMember[]): MobilityProfile {
  let high = 0;
  let med = 0;
  let low = 0;
  for (const m of team) {
    if (m.meta.mobility === "high") high++;
    else if (m.meta.mobility === "medium") med++;
    else low++;
  }
  return { high, med, low };
}

// Counter-comp matchup logic. Each interaction triggers when concrete
// archetype and mobility patterns line up the way they do in real LoL —
// poke siege actually fails into mobile front-loaded teams, hyper-carries
// without peel really do collapse to dive comps. Range -4 to +4.
function matchupModifierScore(
  myCounts: Record<Archetype, number>,
  oppCounts: Record<Archetype, number>,
  myMob: MobilityProfile,
  oppMob: MobilityProfile,
  myHardCc: number,
): { score: number; tags: string[] } {
  let mod = 0;
  const tags: string[] = [];

  // Mobility dodges poke siege.
  if (myMob.high >= 3 && oppCounts.poke >= 3) {
    mod += 2;
    tags.push("Mobile vs Poke");
  }

  // Stationary squishies get caught by pick comps.
  if (myMob.low >= 3 && oppCounts.pick >= 2) {
    mod -= 2;
    tags.push("Immobile vs Pick");
  }

  // Engage walks all over a backline with no real frontline or peel.
  if (myCounts.engage >= 2 && oppCounts.tank === 0 && oppCounts.peel < 2) {
    mod += 2;
    tags.push("Engage vs No Frontline");
  }

  // Hyper-carry without peel collapses to a dive comp.
  if (
    myCounts["hyper-carry"] >= 1 &&
    myCounts.peel < 2 &&
    oppCounts.dive >= 3
  ) {
    mod -= 3;
    tags.push("Carry without Peel vs Dive");
  }

  // Wombo combo doesn't land on disengage / mobile teams.
  if (myCounts.wombo >= 3 && (oppCounts.peel >= 3 || oppMob.high >= 3)) {
    mod -= 2;
    tags.push("Wombo vs Disengage");
  }

  // Poke can't trade safely into engage tanks closing the gap.
  if (myCounts.poke >= 3 && oppCounts.engage >= 2 && oppCounts.tank >= 1) {
    mod -= 2;
    tags.push("Poke vs Engage Tank");
  }

  // Dive comp into a peeless backline is a free meal.
  if (
    myCounts.dive >= 3 &&
    oppCounts["hyper-carry"] >= 1 &&
    oppCounts.peel < 2
  ) {
    mod += 2;
    tags.push("Dive into Backline");
  }

  // Heavy mobility lets you sidestep skillshot CC.
  if (myMob.high >= 4 && oppCounts.poke + oppCounts.burst >= 3) {
    mod += 1;
    tags.push("Slippery vs Skillshots");
  }

  // Hard CC chains lose value into dashes that break them.
  if (myHardCc >= 4 && oppMob.high >= 4) {
    mod -= 1;
    tags.push("CC Chain vs Mobile");
  }

  // Single-target burst can't cut through a tank wall.
  if (
    (myCounts.assassin + myCounts.burst) >= 2 &&
    oppCounts.tank >= 3 &&
    myCounts["hyper-carry"] < 1
  ) {
    mod -= 2;
    tags.push("Burst vs Tank Wall");
  }

  // Sustain bruisers outlast burst comps in extended fights.
  if (myCounts.sustain >= 3 && oppCounts.burst >= 3) {
    mod += 2;
    tags.push("Sustain vs Burst");
  }

  // Peel-heavy teams cancel engage attempts.
  if (myCounts.peel >= 3 && oppCounts.engage >= 3) {
    mod += 2;
    tags.push("Engage Cancel");
  }

  // Glass cannon (no tank) folds to assassin/dive pressure.
  if (
    myCounts.tank === 0 &&
    myCounts.peel < 2 &&
    (myCounts["hyper-carry"] + myCounts.burst) >= 3 &&
    (oppCounts.assassin + oppCounts.dive) >= 2
  ) {
    mod -= 3;
    tags.push("Glass Cannon Exposed");
  }

  // Splitpush pressure when enemy can't match.
  if (myCounts.splitpush >= 2 && oppCounts.splitpush === 0) {
    mod += 1;
    tags.push("Splitpush Pressure");
  }

  // 5+ hard CC sources = full lockdown wombo potential.
  if (myHardCc >= 5) {
    mod += 1;
    tags.push("Full Lockdown");
  }

  return { score: Math.max(-4, Math.min(4, mod)), tags };
}

// Champion-pair synergies: scans every pair on the team, returning matched
// pairings with bonuses summed and capped at +6 to avoid stacking too many
// minor synergies into a runaway score. Tags are returned for UI display.
function synergyBonusScore(
  picks: (Champion | null)[],
): { score: number; tags: string[] } {
  const aliases = picks
    .filter((c): c is Champion => !!c)
    .map((c) => c.alias);
  const tags: string[] = [];
  let total = 0;
  for (let i = 0; i < aliases.length; i++) {
    for (let j = i + 1; j < aliases.length; j++) {
      const s = getSynergy(aliases[i], aliases[j]);
      if (s) {
        total += s.bonus;
        tags.push(s.tag);
      }
    }
  }
  return { score: Math.min(6, total), tags };
}

// Meta strength: average tier of the team's picks in their assigned lanes.
// Reflects whether the comp is stacked with current-patch S-tiers or full of
// off-meta picks. Returns -3 to +5 depending on average tier (B=neutral=0).
function metaStrengthScore(
  picks: (Champion | null)[],
  lanes: (Lane | null)[],
): { score: number; avg: number } {
  let total = 0;
  let count = 0;
  for (let i = 0; i < picks.length; i++) {
    const c = picks[i];
    const lane = lanes[i];
    if (!c || !lane) continue;
    // getMetaTier consults the active override (randomized meta) before the
    // baseline dataset, so randomizing the meta affects all subsequent sims.
    const tier = getMetaTier(c.alias, lane);
    if (tier) {
      total += TIER_VALUE[tier];
      count++;
    } else {
      // Off-role pick: penalize as roughly C-tier equivalent.
      total += TIER_VALUE.C;
      count++;
    }
  }
  if (count === 0) return { score: 0, avg: 0 };
  const avg = total / count;
  // Map: avg 6 → +5, avg 5 → +4, avg 4 → +2, avg 3 → 0, avg 2 → -2, avg 1 → -3
  let score = 0;
  if (avg >= 5.5) score = 5;
  else if (avg >= 4.5) score = 4;
  else if (avg >= 3.7) score = 2;
  else if (avg >= 2.8) score = 0;
  else if (avg >= 1.7) score = -2;
  else score = -3;
  return { score, avg };
}

// Scaling advantage: compares my late-phase population with the opponent's.
// Captures the matchup-level reality that a scaling team facing an early-game
// team has a real win condition simply by surviving until items come online.
// Range: -5 to +5. Both sides receive opposite values, so a draft difference
// of 5 turns into a 10-point swing in favor of the scaling team.
function scalingAdvantageScore(
  myTeam: TeamMember[],
  oppTeam: TeamMember[],
): { score: number; lateCount: number; earlyCount: number } {
  const myLate = myTeam.filter(
    (m) => m.meta.phase === "late" || m.meta.phase === "mid-late",
  ).length;
  const oppLate = oppTeam.filter(
    (m) => m.meta.phase === "late" || m.meta.phase === "mid-late",
  ).length;
  const myEarly = myTeam.filter((m) => m.meta.phase === "early").length;
  const oppEarly = oppTeam.filter((m) => m.meta.phase === "early").length;
  const lateDiff = myLate - oppLate;
  const earlyDiff = oppEarly - myEarly; // I benefit when opp has more early
  const raw = lateDiff * 1.4 + earlyDiff * 0.4;
  const score = Math.max(-5, Math.min(5, Math.round(raw)));
  return { score, lateCount: myLate, earlyCount: myEarly };
}

function teamScore(
  picks: (Champion | null)[],
  lanes: (Lane | null)[],
  oppPicks: (Champion | null)[],
  oppLanes: (Lane | null)[],
): TeamScore {
  const team = buildTeam(picks, lanes);
  const oppTeam = buildTeam(oppPicks, oppLanes);
  const counts = archetypeCounts(team);
  const oppCounts = archetypeCounts(oppTeam);
  const myMob = mobilityProfile(team);
  const oppMob = mobilityProfile(oppTeam);

  const dmg = damageBalanceScore(team);
  const front = frontlineScore(team);
  const synergy = laneSynergyScore(picks, lanes);
  const engage = engagePresenceScore(counts);
  const cc = ccQualityScore(team);
  const identity = compIdentityScore(counts, myMob, cc.count);
  const phase = phaseBalanceScore(team);
  const scaling = scalingAdvantageScore(team, oppTeam);
  const matchup = matchupModifierScore(counts, oppCounts, myMob, oppMob, cc.count);
  const meta = metaStrengthScore(picks, lanes);
  const synergyPair = synergyBonusScore(picks);

  return {
    damageBalance: dmg.score,
    frontline: front.score,
    laneSynergy: synergy,
    engagePresence: engage,
    ccQuality: cc.score,
    compIdentity: identity.score,
    phaseBalance: phase,
    scalingAdvantage: scaling.score,
    matchupEdge: matchup.score,
    matchupTags: matchup.tags,
    metaStrength: meta.score,
    metaTierAvg: meta.avg,
    synergyBonus: synergyPair.score,
    synergyTags: synergyPair.tags,
    total:
      50 +
      dmg.score +
      front.score +
      synergy +
      engage +
      cc.score +
      identity.score +
      phase +
      scaling.score +
      matchup.score +
      meta.score +
      synergyPair.score,
    apCount: dmg.ap,
    adCount: dmg.ad,
    frontCount: front.count,
    hardCcCount: cc.count,
    lateCount: scaling.lateCount,
    earlyCount: scaling.earlyCount,
    highMobCount: myMob.high,
    lowMobCount: myMob.low,
    identityLabel: identity.label,
  };
}

// Lower k since adding scalingAdvantage widened the score range; this keeps
// extreme drafts at realistic LoL win-rate gaps (massive draft loss caps near
// 88-90% predicted, not 95%+).
const SIGMOID_K = 0.05;
const BLUE_SIDE_BONUS = 0.015;

// ─── Timeline generation ──────────────────────────────────────────────────────

const POSITIONAL_LANES: readonly Lane[] = [
  "top",
  "jungle",
  "middle",
  "bottom",
  "support",
];
const DRAGON_TYPES = ["Infernal", "Ocean", "Mountain", "Cloud", "Hextech", "Chemtech"];

function formatTime(min: number): string {
  const m = Math.floor(min);
  const s = Math.round((min - m) * 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function rollInt(lo: number, hi: number): number {
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

const NO_KILLS: EventKills = { blue: 0, red: 0 };

function killsForSide(side: Side, winnerKills: number, loserKills: number): EventKills {
  return side === "blue"
    ? { blue: winnerKills, red: loserKills }
    : { blue: loserKills, red: winnerKills };
}

// Convenience for events that grant N towers (and optionally inhibs) to a side
// without the opponent contesting. Returns three EventKills-shaped deltas.
function deltasFor(
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

function laneOf(picks: (Champion | null)[], lane: Lane): Champion | null {
  const idx = POSITIONAL_LANES.indexOf(lane);
  return idx >= 0 ? picks[idx] : null;
}

function findByArchetype(
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

function findSquishy(picks: (Champion | null)[]): Champion | null {
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

function lateScalingCount(picks: (Champion | null)[]): number {
  let n = 0;
  for (const c of picks) {
    if (!c) continue;
    const m = metaFor(c);
    if (m.phase === "late" || m.phase === "mid-late") n++;
  }
  return n;
}

function earlyCount(picks: (Champion | null)[]): number {
  let n = 0;
  for (const c of picks) {
    if (!c) continue;
    if (metaFor(c).phase === "early") n++;
  }
  return n;
}

// Bias: positive = blue advantage on this event type independent of overall winner.
function rollSide(winner: Side, diff: number, bias: number): Side {
  const winnerBoost = winner === "blue" ? 0.15 : -0.15;
  const probBlue = 0.5 + diff * 0.006 + bias * 0.1 + winnerBoost;
  const clamped = Math.max(0.15, Math.min(0.85, probBlue));
  return Math.random() < clamped ? "blue" : "red";
}

function jitter(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function teamName(side: Side, blueName: string, redName: string): string {
  return side === "blue" ? blueName : redName;
}

// Verbs flavored by the killer's archetype — assassins all-in, picks land hooks,
// divers tower-dive, skirmishers outduel. Falls back to a generic "catches".
function killVerb(killer: Champion): string {
  const meta = metaFor(killer);
  const has = (a: Archetype) => meta.archetypes.includes(a);
  if (has("pick")) return pickRandom(["lands a hook on", "snipes", "catches"]);
  if (has("assassin")) return pickRandom(["all-ins", "deletes", "blows up"]);
  if (has("dive") && has("engage")) return pickRandom(["tower-dives", "flank-engages on"]);
  if (has("skirmish")) return pickRandom(["outduels", "1v1s"]);
  if (has("burst")) return pickRandom(["one-shots", "burns down"]);
  if (has("hyper-carry")) return "kites down";
  return "catches";
}

function describeFirstBlood(
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

function describeDragon(
  side: Side,
  blueName: string,
  redName: string,
  stack: number,
  drakeType: string,
): string {
  const ord =
    stack === 1 ? "first" : stack === 2 ? "second" : stack === 3 ? "third" : "fourth";
  return `${teamName(side, blueName, redName)} secures ${drakeType} Drake (${ord})`;
}

function describeSoul(
  side: Side,
  blueName: string,
  redName: string,
  drakeType: string,
): string {
  return `${teamName(side, blueName, redName)} claims ${drakeType} SOUL`;
}

function describeAtakhan(side: Side, blueName: string, redName: string): string {
  const variant = pickRandom(["Voracious", "Ruinous"]);
  const buff =
    variant === "Voracious"
      ? "extra gold from kills"
      : "Blood Roses for revives";
  return `${teamName(side, blueName, redName)} kills ${variant} Atakhan — ${buff}`;
}

function describeGrubs(side: Side, blueName: string, redName: string): string {
  const n = Math.random() < 0.55 ? 6 : Math.random() < 0.7 ? 3 : rollInt(4, 5);
  return `${teamName(side, blueName, redName)} secures ${n} Voidgrubs`;
}

function describeHerald(side: Side, blueName: string, redName: string): string {
  const lanes: Lane[] = ["top", "middle"];
  const lane = pickRandom(lanes);
  return `${teamName(side, blueName, redName)} grabs Rift Herald, smashes ${lane} tier-1`;
}

function describeTower(
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

function describeInhibitor(
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

function describePick(
  side: Side,
  winnerPicks: (Champion | null)[],
  loserPicks: (Champion | null)[],
): string {
  const hooker = findByArchetype(winnerPicks, ["pick"]);
  const target = findSquishy(loserPicks);
  if (hooker && target) {
    const places = ["in the fog", "stepping onto a ward", "after a back", "near Baron pit"];
    return `${hooker.name} ${killVerb(hooker)} ${target.name} ${pickRandom(places)}`;
  }
  return `${teamName(side, "Blue", "Red")} picks off a stray`;
}

function describeSkirmish(
  side: Side,
  winnerPicks: (Champion | null)[],
  winnerKills: number,
  loserKills: number,
): string {
  const carry =
    findByArchetype(winnerPicks, ["wombo", "engage", "burst", "assassin", "skirmish"]) ??
    winnerPicks.find((c) => c != null);
  const places = ["the river", "bot side jungle", "top side jungle", "mid lane"];
  const where = pickRandom(places);
  const fightSize = pickRandom(["2v2", "3v3", "3v2"]);
  if (carry) {
    return `${carry.name} wins a ${fightSize} in ${where} (${winnerKills}-${loserKills})`;
  }
  return `${fightSize} in ${where} — ${teamName(side, "Blue", "Red")} ahead ${winnerKills}-${loserKills}`;
}

function describeTeamfight(
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

function describeBaron(
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

function describeAce(side: Side, blueName: string, redName: string): string {
  return `${teamName(side, blueName, redName)} ACES — bases wide open`;
}

function describeElder(side: Side, blueName: string, redName: string, stolen: boolean): string {
  return stolen
    ? `STOLEN Elder! ${teamName(side, blueName, redName)} clutches the smite`
    : `${teamName(side, blueName, redName)} kills Elder Dragon`;
}

function describeNexus(
  side: Side,
  blueName: string,
  redName: string,
  time: string,
): string {
  return `${teamName(side, blueName, redName)} destroys the Nexus at ${time}`;
}

// ─── Lane phase event descriptions ──────────────────────────────────────────

function describeSoloKill(
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

function describeGank(
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

function describeCounterGank(
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

function describePlates(
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

// ─── Lane gold distribution helpers ─────────────────────────────────────────

function spreadLaneGold(amount: number, side: Side): Partial<Record<Lane, number>> {
  const sign = side === "blue" ? 1 : -1;
  const each = (sign * amount) / 5;
  return { top: each, jungle: each, middle: each, bottom: each, support: each };
}

function singleLaneGold(
  lane: Lane,
  amount: number,
  side: Side,
): Partial<Record<Lane, number>> {
  const sign = side === "blue" ? 1 : -1;
  return { [lane]: sign * amount };
}

function gankLaneGold(
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

function sideLaneGoldSplit(
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

// ─── Lane phase advantages ──────────────────────────────────────────────────

const PHASE_VALUE: Record<Phase, number> = {
  early: 4,
  mid: 3,
  "mid-late": 2,
  late: 1,
};

const MOBILITY_VALUE: Record<Mobility, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

// Auto-attack range classification. League's official ranged threshold is
// ~325+ but for laning what matters is "ranged feels ranged" (≥ 400 AA range).
// Implemented as exception sets keyed off Riot's role tags — most marksmen +
// most mages are ranged, with a curated list of melee-mage and ranged-fighter
// exceptions. Faster than tagging all 168 champions individually.
const MELEE_MAGES: ReadonlySet<string> = new Set([
  "Akali",
  "Diana",
  "Ekko",
  "Fizz",
  "Galio",
  "Kassadin",
  "Katarina",
  "Mordekaiser",
  "Rumble",
  "Sylas",
  "Vladimir",
]);
const RANGED_BRUISERS: ReadonlySet<string> = new Set([
  "Gnar",
  "Heimerdinger",
  "Jayce",
  "Kayle",
  "Kennen",
  "Quinn",
  "Teemo",
  "Urgot",
]);
const RANGED_SUPPORTS: ReadonlySet<string> = new Set([
  "Bard",
  "Brand",
  "Janna",
  "Karma",
  "Lulu",
  "Lux",
  "Mel",
  "Milio",
  "Morgana",
  "Nami",
  "Renata",
  "Senna",
  "Seraphine",
  "Sona",
  "Soraka",
  "Swain",
  "Velkoz",
  "Xerath",
  "Yuumi",
  "Zilean",
  "Zyra",
]);
const MELEE_MARKSMEN: ReadonlySet<string> = new Set(["MasterYi", "Nilah"]);

function isRanged(champ: Champion): boolean {
  const r = rolesOf(champ);
  if (r.has(ROLE_MARKSMAN)) return !MELEE_MARKSMEN.has(champ.alias);
  if (r.has(ROLE_MAGE)) return !MELEE_MAGES.has(champ.alias);
  if (RANGED_BRUISERS.has(champ.alias)) return true;
  if (RANGED_SUPPORTS.has(champ.alias)) return true;
  return false;
}

// Range vs. melee in the same lane creates a real CS-denial advantage during
// the laning phase — most pronounced in top, smaller in mid (where both
// usually have ranged AAs anyway), negligible in bot/sup (nearly always
// ranged). Returns blue advantage in g/min.
function rangeBonus(lane: Lane, blue: Champion, red: Champion): number {
  if (lane === "jungle") return 0;
  const blueRanged = isRanged(blue);
  const redRanged = isRanged(red);
  if (blueRanged === redRanged) return 0;
  if (lane === "top") return blueRanged ? 30 : -30;
  if (lane === "middle") return blueRanged ? 12 : -12;
  if (lane === "bottom" || lane === "support") return blueRanged ? 8 : -8;
  return 0;
}

function laneArchetypeBonus(
  lane: Lane,
  blue: Champion,
  red: Champion,
): number {
  const blueMeta = metaFor(blue);
  const redMeta = metaFor(red);
  let bonus = 0;
  if (lane === "support") {
    if (blueMeta.archetypes.includes("pick") && redMeta.archetypes.includes("enchanter")) bonus += 12;
    if (redMeta.archetypes.includes("pick") && blueMeta.archetypes.includes("enchanter")) bonus -= 12;
  }
  if (lane === "middle") {
    if (blueMeta.mobility === "high" && redMeta.mobility === "low") bonus += 8;
    if (redMeta.mobility === "high" && blueMeta.mobility === "low") bonus -= 8;
  }
  if (lane === "top") {
    if (blueMeta.archetypes.includes("splitpush") && redMeta.archetypes.includes("sustain") && !redMeta.archetypes.includes("splitpush")) bonus += 8;
    if (redMeta.archetypes.includes("splitpush") && blueMeta.archetypes.includes("sustain") && !blueMeta.archetypes.includes("splitpush")) bonus -= 8;
  }
  return bonus;
}

function computeLaneAdvantages(
  bluePicks: (Champion | null)[],
  redPicks: (Champion | null)[],
): Record<Lane, number> {
  const adv: Record<Lane, number> = {
    top: 0,
    jungle: 0,
    middle: 0,
    bottom: 0,
    support: 0,
  };
  for (let i = 0; i < POSITIONAL_LANES.length; i++) {
    const lane = POSITIONAL_LANES[i];
    const blue = bluePicks[i];
    const red = redPicks[i];
    if (!blue || !red) continue;
    const blueMeta = metaFor(blue);
    const redMeta = metaFor(red);
    const phaseDiff = PHASE_VALUE[blueMeta.phase] - PHASE_VALUE[redMeta.phase];
    const ccDiff = (blueMeta.cc === "hard" ? 1 : 0) - (redMeta.cc === "hard" ? 1 : 0);
    const mobDiff = MOBILITY_VALUE[blueMeta.mobility] - MOBILITY_VALUE[redMeta.mobility];
    const archetypeBonus = laneArchetypeBonus(lane, blue, red);
    const rangeAdv = rangeBonus(lane, blue, red);
    // Meta tier diff via getMetaTier so the active override (randomized meta)
    // is respected. S+ vs D is now a 60 g/min advantage (5 × 12) — winning
    // matchups extract significant gold from the rival in their lane,
    // matching the LoL reality that lane bullies push their opponent off CS.
    const blueTier = getMetaTier(blue.alias, lane) ?? "C";
    const redTier = getMetaTier(red.alias, lane) ?? "C";
    const tierDiff = TIER_VALUE[blueTier] - TIER_VALUE[redTier];
    adv[lane] =
      phaseDiff * 35 +
      ccDiff * 5 +
      mobDiff * 5 +
      tierDiff * 12 +
      archetypeBonus +
      rangeAdv +
      (Math.random() - 0.5) * 20;
  }
  return adv;
}

function pickGankableLane(
  laneAdvantages: Record<Lane, number>,
  gankerSide: Side,
): Lane {
  const sign = gankerSide === "blue" ? -1 : 1;
  const candidates: Lane[] = ["top", "middle", "bottom"];
  const ranked = candidates
    .map((l) => ({ lane: l, score: sign * laneAdvantages[l] }))
    .sort((a, b) => b.score - a.score);
  return ranked[0].lane;
}

function pickBullyLane(
  laneAdvantages: Record<Lane, number>,
  side: Side,
): Lane | null {
  const sign = side === "blue" ? 1 : -1;
  const candidates: Lane[] = ["top", "middle", "bottom"];
  const ranked = candidates
    .map((l) => ({ lane: l, advantage: sign * laneAdvantages[l] }))
    .sort((a, b) => b.advantage - a.advantage);
  if (ranked[0].advantage >= 50) return ranked[0].lane;
  return null;
}

// ─── Match state machine ────────────────────────────────────────────────────

interface TimelineCtx {
  diff: number;
  blueScore: TeamScore;
  redScore: TeamScore;
  bluePicks: (Champion | null)[];
  redPicks: (Champion | null)[];
  blueName: string;
  redName: string;
  laneAdvantages: Record<Lane, number>;
}

interface MatchState {
  goldLead: number;
  momentum: number;
  drakes: { blue: number; red: number };
  soulSide: Side | null;
  baronExpiresAt: number | null;
  elderTaken: boolean;
}

function picksOf(ctx: TimelineCtx, side: Side): (Champion | null)[] {
  return side === "blue" ? ctx.bluePicks : ctx.redPicks;
}

function computeDuration(ctx: TimelineCtx): number {
  const blueLate = lateScalingCount(ctx.bluePicks);
  const redLate = lateScalingCount(ctx.redPicks);
  const blueEarly = earlyCount(ctx.bluePicks);
  const redEarly = earlyCount(ctx.redPicks);
  let duration = 28 + (blueLate + redLate) * 0.7 - (blueEarly + redEarly) * 0.6;
  const absDiff = Math.abs(ctx.diff);
  if (absDiff > 25) duration -= 5;
  else if (absDiff > 15) duration -= 2;
  duration += Math.floor(Math.random() * 5) - 2;
  return Math.max(22, Math.min(48, duration));
}

// Event-driven timeline. No winner is pre-decided; each event resolves based
// on current MatchState (gold lead, momentum, composition diff). The closing
// fight emerges from the FINAL state, so a draft-loser team that wins key
// fights can genuinely come back. Probabilities are clamped 0.18-0.82 so
// upsets are always possible.
function generateTimeline(
  ctx: TimelineCtx,
  duration: number,
): { events: MatchEvent[]; finalWinner: Side } {
  const state: MatchState = {
    goldLead: 0,
    momentum: 0,
    drakes: { blue: 0, red: 0 },
    soulSide: null,
    baronExpiresAt: null,
    elderTaken: false,
  };
  const events: MatchEvent[] = [];

  function snapshotProb(): number {
    const compFactor = ctx.diff * 0.022;
    const goldFactor = state.goldLead / 4500;
    const momFactor = state.momentum * 1.2;
    const blueBonus = 0.1;
    const logit = compFactor + goldFactor + momFactor + blueBonus;
    return Math.max(0.03, Math.min(0.97, 1 / (1 + Math.exp(-logit))));
  }

  function rollEventSide(typeBias: number = 0): Side {
    const compFactor = ctx.diff * 0.022;
    const goldFactor = state.goldLead / 4500;
    const momFactor = state.momentum * 1.2;
    const blueBonus = 0.1;
    const logit = compFactor + goldFactor + momFactor + typeBias + blueBonus;
    const probBlue = 1 / (1 + Math.exp(-logit));
    const clamped = Math.max(0.18, Math.min(0.82, probBlue));
    return Math.random() < clamped ? "blue" : "red";
  }

  function detectComeback(side: Side, momentumImpact: number): string {
    if (momentumImpact < 0.25) return "";
    const wasLosing =
      (side === "blue" && (state.goldLead < -2500 || state.momentum < -0.4)) ||
      (side === "red" && (state.goldLead > 2500 || state.momentum > 0.4));
    return wasLosing ? "MOMENTUM SHIFT! " : "";
  }

  function applyState(
    side: Side,
    kills: EventKills,
    towers: EventKills,
    momentumImpact: number,
  ) {
    state.goldLead +=
      (kills.blue - kills.red) * 300 + (towers.blue - towers.red) * 400;
    state.momentum *= 0.7;
    state.momentum += side === "blue" ? momentumImpact : -momentumImpact;
    state.momentum = Math.max(-1, Math.min(1, state.momentum));
  }

  function addEvent(
    type: EventType,
    minutes: number,
    side: Side,
    description: string,
    deltas: {
      kills?: EventKills;
      towers?: EventKills;
      inhibs?: EventKills;
      laneGoldDelta?: Partial<Record<Lane, number>>;
    } = {},
    momentumImpact: number = 0.15,
  ) {
    const kills = deltas.kills ?? NO_KILLS;
    const towers = deltas.towers ?? NO_KILLS;
    const inhibs = deltas.inhibs ?? NO_KILLS;
    const laneGoldDelta = deltas.laneGoldDelta ?? {};
    const flair = detectComeback(side, momentumImpact);
    applyState(side, kills, towers, momentumImpact);
    const winProbAfter = snapshotProb();
    events.push({
      type,
      minutes,
      time: formatTime(minutes),
      side,
      description: flair + description,
      kills,
      towers,
      inhibs,
      laneGoldDelta,
      winProbAfter,
    });
  }

  // 1. Solo kill (4-7) — fires when a lane bully exists. Number of kills and
  // gold extracted scale with the magnitude of the matchup advantage: an
  // overwhelming matchup (>= 100 g/min advantage) produces 2-3 solo kills,
  // a strong matchup (>= 65) produces 1-2, a normal bully matchup (>= 50) is
  // a single kill. Each kill costs the rival ~200g (death + lost CS).
  {
    const blueBully = pickBullyLane(ctx.laneAdvantages, "blue");
    const redBully = pickBullyLane(ctx.laneAdvantages, "red");
    let bullySide: Side | null = null;
    if (blueBully && !redBully) bullySide = "blue";
    else if (redBully && !blueBully) bullySide = "red";
    else if (blueBully && redBully) {
      const blueAdv = Math.abs(ctx.laneAdvantages[blueBully]);
      const redAdv = Math.abs(ctx.laneAdvantages[redBully]);
      bullySide = blueAdv > redAdv ? "blue" : "red";
    }
    if (bullySide) {
      const lane = pickBullyLane(ctx.laneAdvantages, bullySide)!;
      const advMag = Math.abs(ctx.laneAdvantages[lane]);
      const numKills =
        advMag >= 100
          ? rollInt(2, 3)
          : advMag >= 65
          ? rollInt(1, 2)
          : 1;
      const t = jitter(4, 7);
      const winnerChamp = picksOf(ctx, bullySide)[POSITIONAL_LANES.indexOf(lane)];
      const laneShort = lane === "middle" ? "mid" : lane === "bottom" ? "bot" : lane;
      const desc =
        numKills > 1 && winnerChamp
          ? `${winnerChamp.name} dominates ${laneShort} (${numKills} solo kills)`
          : describeSoloKill(bullySide, picksOf(ctx, bullySide), lane);
      addEvent(
        "solo-kill",
        t,
        bullySide,
        desc,
        {
          kills: killsForSide(bullySide, numKills, 0),
          laneGoldDelta: singleLaneGold(lane, 300 * numKills, bullySide),
        },
        0.15 + numKills * 0.05,
      );
    }
  }

  // 2. First blood (3-5.5)
  {
    const t = jitter(3, 5.5);
    const side = rollEventSide(0.1);
    const desc = describeFirstBlood(
      side,
      picksOf(ctx, side),
      picksOf(ctx, side === "blue" ? "red" : "blue"),
      t,
    );
    const fbLanes: Lane[] = ["top", "jungle", "middle", "bottom"];
    const fbLane = pickRandom(fbLanes);
    addEvent(
      "first-blood",
      t,
      side,
      desc,
      {
        kills: killsForSide(side, 1, 0),
        laneGoldDelta: singleLaneGold(fbLane, 300, side),
      },
      0.2,
    );
  }

  // 3. Voidgrubs (6-7.5)
  {
    const t = jitter(6, 7.5);
    const side = rollEventSide();
    addEvent(
      "grubs",
      t,
      side,
      describeGrubs(side, ctx.blueName, ctx.redName),
      { laneGoldDelta: spreadLaneGold(120, side) },
      0.1,
    );
  }

  // 4. First Drake (6.5-8.3)
  {
    const t = jitter(6.5, 8.3);
    const side = rollEventSide();
    state.drakes[side]++;
    const drakeType = pickRandom(DRAGON_TYPES);
    addEvent(
      "dragon",
      t,
      side,
      describeDragon(side, ctx.blueName, ctx.redName, state.drakes[side], drakeType),
      { laneGoldDelta: spreadLaneGold(150, side) },
      0.12,
    );
  }

  // 5. Gank (3.5-9.5) — 55% chance, biased to gankable lane.
  if (Math.random() < 0.55) {
    const t = jitter(3.5, 9.5);
    const side = rollEventSide();
    const lane = pickGankableLane(ctx.laneAdvantages, side);
    addEvent(
      "gank",
      t,
      side,
      describeGank(side, picksOf(ctx, side), lane, ctx.blueName, ctx.redName),
      {
        kills: killsForSide(side, 1, 0),
        laneGoldDelta: gankLaneGold(lane, 300, side),
      },
      0.16,
    );
  }

  // 6. Counter-gank (5.5-9.5) — 30% chance.
  if (Math.random() < 0.3) {
    const t = jitter(5.5, 9.5);
    const side = rollEventSide();
    const flippedLane = pickRandom(["top", "middle", "bottom"] as Lane[]);
    addEvent(
      "counter-gank",
      t,
      side,
      describeCounterGank(side, picksOf(ctx, side), ctx.blueName, ctx.redName),
      {
        kills: killsForSide(side, 1, 0),
        laneGoldDelta: gankLaneGold(flippedLane, 300, side),
      },
      0.18,
    );
  }

  // 7. Plates (8-12) — 50% chance, side-lane heavy.
  if (Math.random() < 0.5) {
    const t = jitter(8, 12);
    const side = rollEventSide();
    addEvent(
      "plates",
      t,
      side,
      describePlates(side, picksOf(ctx, side), ctx.blueName, ctx.redName),
      { laneGoldDelta: sideLaneGoldSplit(400, side) },
      0.1,
    );
  }

  // 8. First Tower (10-13)
  {
    const t = jitter(10, 13);
    const side = rollEventSide();
    const towerLane = pickRandom(["top", "middle", "bottom"] as Lane[]);
    addEvent(
      "tower",
      t,
      side,
      describeTower(side, picksOf(ctx, side), ctx.blueName, ctx.redName, true),
      {
        towers: killsForSide(side, 1, 0),
        laneGoldDelta: singleLaneGold(towerLane, 200, side),
      },
      0.15,
    );
  }

  // 9. Atakhan or second Herald (14-16)
  {
    const t = jitter(14, 16);
    const side = rollEventSide();
    if (Math.random() < 0.6) {
      addEvent(
        "atakhan",
        t,
        side,
        describeAtakhan(side, ctx.blueName, ctx.redName),
        {
          kills: killsForSide(side, rollInt(1, 2), rollInt(0, 1)),
          laneGoldDelta: spreadLaneGold(250, side),
        },
        0.18,
      );
    } else {
      const heraldLane = pickRandom(["top", "middle"] as Lane[]);
      addEvent(
        "herald",
        t,
        side,
        describeHerald(side, ctx.blueName, ctx.redName),
        {
          towers: killsForSide(side, 1, 0),
          laneGoldDelta: singleLaneGold(heraldLane, 250, side),
        },
        0.13,
      );
    }
  }

  // 10. Second Drake (11.5-14.3)
  if (duration >= 18) {
    const t = jitter(11.5, 14.3);
    const side = rollEventSide();
    state.drakes[side]++;
    if (state.drakes[side] === 4 && state.soulSide == null) {
      state.soulSide = side;
      const soulType = pickRandom(DRAGON_TYPES);
      addEvent(
        "soul",
        t,
        side,
        describeSoul(side, ctx.blueName, ctx.redName, soulType),
        {
          kills: killsForSide(side, rollInt(1, 3), rollInt(0, 2)),
          towers: killsForSide(side, rollInt(0, 1), 0),
          laneGoldDelta: spreadLaneGold(500, side),
        },
        0.4,
      );
    } else {
      const drakeType = pickRandom(DRAGON_TYPES);
      addEvent(
        "dragon",
        t,
        side,
        describeDragon(side, ctx.blueName, ctx.redName, state.drakes[side], drakeType),
        { laneGoldDelta: spreadLaneGold(150, side) },
        0.12,
      );
    }
  }

  // 11. Mid-game pick or skirmish (15.5-19)
  {
    const t = jitter(15.5, 19);
    const side = rollEventSide();
    const winnerScore = side === "blue" ? ctx.blueScore : ctx.redScore;
    const winnerHasPick = winnerScore.identityLabel === "Pick Comp";
    const wp = picksOf(ctx, side);
    const lp = picksOf(ctx, side === "blue" ? "red" : "blue");
    if (winnerHasPick) {
      addEvent(
        "pick",
        t,
        side,
        describePick(side, wp, lp),
        {
          kills: killsForSide(side, 1, 0),
          laneGoldDelta: spreadLaneGold(180, side),
        },
        0.15,
      );
    } else {
      const wk = rollInt(1, 2);
      const lk = rollInt(0, 1);
      addEvent(
        "skirmish",
        t,
        side,
        describeSkirmish(side, wp, wk, lk),
        {
          kills: killsForSide(side, wk, lk),
          laneGoldDelta: spreadLaneGold((wk + lk) * 100, side),
        },
        0.18,
      );
    }
  }

  // 12. Third Drake (16.5-20)
  if (duration >= 22) {
    const t = jitter(16.5, 20);
    const side = rollEventSide();
    state.drakes[side]++;
    if (state.drakes[side] === 4 && state.soulSide == null) {
      state.soulSide = side;
      const soulType = pickRandom(DRAGON_TYPES);
      addEvent(
        "soul",
        t,
        side,
        describeSoul(side, ctx.blueName, ctx.redName, soulType),
        {
          kills: killsForSide(side, rollInt(1, 3), rollInt(0, 2)),
          towers: killsForSide(side, rollInt(0, 1), 0),
          laneGoldDelta: spreadLaneGold(500, side),
        },
        0.4,
      );
    } else {
      const drakeType = pickRandom(DRAGON_TYPES);
      addEvent(
        "dragon",
        t,
        side,
        describeDragon(side, ctx.blueName, ctx.redName, state.drakes[side], drakeType),
        { laneGoldDelta: spreadLaneGold(150, side) },
        0.12,
      );
    }
  }

  // 13. Mid teamfight (19-24)
  {
    const t = jitter(19, Math.min(24, duration - 4));
    const side = rollEventSide();
    const wp = picksOf(ctx, side);
    const wk = rollInt(3, 5);
    const lk = rollInt(0, 2);
    const winningScore = side === "blue" ? ctx.blueScore : ctx.redScore;
    addEvent(
      "teamfight",
      t,
      side,
      describeTeamfight(side, wp, winningScore.identityLabel, wk, lk),
      {
        kills: killsForSide(side, wk, lk),
        towers: killsForSide(side, rollInt(1, 2), 0),
        laneGoldDelta: spreadLaneGold(wk * 200, side),
      },
      0.32,
    );
  }

  // 14. Fourth Drake / Soul (21-25)
  if (duration >= 26 && state.soulSide == null) {
    const t = jitter(21, Math.min(25, duration - 3));
    const side = rollEventSide();
    state.drakes[side]++;
    if (state.drakes[side] === 4) {
      state.soulSide = side;
      const soulType = pickRandom(DRAGON_TYPES);
      addEvent(
        "soul",
        t,
        side,
        describeSoul(side, ctx.blueName, ctx.redName, soulType),
        {
          kills: killsForSide(side, rollInt(1, 3), rollInt(0, 2)),
          towers: killsForSide(side, rollInt(0, 1), 0),
          laneGoldDelta: spreadLaneGold(500, side),
        },
        0.4,
      );
    } else {
      const drakeType = pickRandom(DRAGON_TYPES);
      addEvent(
        "dragon",
        t,
        side,
        describeDragon(side, ctx.blueName, ctx.redName, state.drakes[side], drakeType),
        { laneGoldDelta: spreadLaneGold(150, side) },
        0.15,
      );
    }
  }

  // 15. First Baron (20-30) with steal mechanic
  if (duration >= 25) {
    const tMax = Math.min(duration - 4, 30);
    const t = jitter(20, Math.max(21, tMax));
    const contestSide = rollEventSide(0.05);
    const stolen = Math.random() < 0.12;
    const baronSide: Side = stolen
      ? contestSide === "blue"
        ? "red"
        : "blue"
      : contestSide;
    const wk = rollInt(1, 3);
    const lk = rollInt(0, 2);
    state.baronExpiresAt = t + 3;
    addEvent(
      "baron",
      t,
      baronSide,
      describeBaron(baronSide, picksOf(ctx, baronSide), ctx.blueName, ctx.redName, stolen, {
        winner: wk,
        loser: lk,
      }),
      {
        kills: killsForSide(baronSide, wk, lk),
        towers: killsForSide(baronSide, rollInt(2, 3), 0),
        laneGoldDelta: spreadLaneGold(700, baronSide),
      },
      stolen ? 0.5 : 0.4,
    );
  }

  // 16. Mid tower (23 to duration-3)
  if (duration >= 27) {
    const t = jitter(23, Math.max(24, duration - 3));
    const side = rollEventSide();
    addEvent(
      "tower",
      t,
      side,
      describeTower(side, picksOf(ctx, side), ctx.blueName, ctx.redName, false),
      {
        towers: killsForSide(side, rollInt(1, 2), 0),
        laneGoldDelta: singleLaneGold(pickRandom(["top", "middle", "bottom"] as Lane[]), 250, side),
      },
      0.15,
    );
  }

  // 17. Elder (long games, soul taken)
  if (state.soulSide != null && duration >= 36 && Math.random() < 0.55) {
    const t = jitter(duration - 7, duration - 3);
    const contestSide = rollEventSide();
    const stolen = Math.random() < 0.18;
    const elderSide: Side = stolen
      ? contestSide === "blue"
        ? "red"
        : "blue"
      : contestSide;
    state.elderTaken = true;
    addEvent(
      "elder",
      t,
      elderSide,
      describeElder(elderSide, ctx.blueName, ctx.redName, stolen),
      {
        kills: killsForSide(elderSide, rollInt(1, 3), rollInt(0, 2)),
        towers: killsForSide(elderSide, rollInt(0, 2), 0),
        laneGoldDelta: spreadLaneGold(600, elderSide),
      },
      stolen ? 0.55 : 0.45,
    );
  }

  // ─── Closing fight: outcome based on FINAL state, no pre-decided winner ──
  // Gold lead now dominates the closing fight more — a 6k lead reaches near
  // certainty. This matches reality: a stomped game is decided by the gold
  // gap, not last-minute luck.
  const closingProb = 0.5 + state.goldLead / 6000 + state.momentum * 0.15;
  const closingProbClamped = Math.max(0.05, Math.min(0.95, closingProb));
  const finalWinner: Side = Math.random() < closingProbClamped ? "blue" : "red";

  // 18. Inhibitor — winner busts an inhib pre-nexus
  {
    const t = jitter(duration - 4, duration - 2);
    addEvent(
      "inhibitor",
      t,
      finalWinner,
      describeInhibitor(finalWinner, picksOf(ctx, finalWinner), ctx.blueName, ctx.redName),
      {
        towers: killsForSide(finalWinner, rollInt(1, 2), 0),
        inhibs: killsForSide(finalWinner, 1, 0),
        laneGoldDelta: singleLaneGold(pickRandom(["top", "middle", "bottom"] as Lane[]), 200, finalWinner),
      },
      0.25,
    );
  }

  // 19. Closing fight or ace
  {
    const t = jitter(duration - 3, duration - 0.7);
    const useAce = Math.random() < 0.5;
    if (useAce) {
      addEvent(
        "ace",
        t,
        finalWinner,
        describeAce(finalWinner, ctx.blueName, ctx.redName),
        {
          kills: killsForSide(finalWinner, 5, 0),
          towers: killsForSide(finalWinner, rollInt(1, 2), 0),
          laneGoldDelta: spreadLaneGold(800, finalWinner),
        },
        0.5,
      );
    } else {
      const wp = picksOf(ctx, finalWinner);
      const wk = rollInt(3, 5);
      const lk = rollInt(0, 2);
      const wScore = finalWinner === "blue" ? ctx.blueScore : ctx.redScore;
      addEvent(
        "teamfight",
        t,
        finalWinner,
        describeTeamfight(finalWinner, wp, wScore.identityLabel, wk, lk),
        {
          kills: killsForSide(finalWinner, wk, lk),
          towers: killsForSide(finalWinner, rollInt(1, 2), 0),
          laneGoldDelta: spreadLaneGold(wk * 200, finalWinner),
        },
        0.45,
      );
    }
  }

  // 20. Nexus
  addEvent(
    "nexus",
    duration,
    finalWinner,
    describeNexus(finalWinner, ctx.blueName, ctx.redName, formatTime(duration)),
    {
      towers: killsForSide(finalWinner, 2, 0),
      laneGoldDelta: spreadLaneGold(500, finalWinner),
    },
    0,
  );

  events.sort((a, b) => a.minutes - b.minutes);

  return { events, finalWinner };
}

export function simulateMatch(
  game: GameDraft,
  champions: Champion[],
): SimulationResult {
  const byId = new Map(champions.map((c) => [c.id, c]));
  const bluePicks: (Champion | null)[] = game.bluePicks.map((id) =>
    id != null ? byId.get(id) ?? null : null,
  );
  const redPicks: (Champion | null)[] = game.redPicks.map((id) =>
    id != null ? byId.get(id) ?? null : null,
  );

  const blueScore = teamScore(bluePicks, game.blueRoles, redPicks, game.redRoles);
  const redScore = teamScore(redPicks, game.redRoles, bluePicks, game.blueRoles);

  const diff = blueScore.total - redScore.total;
  const rawBlueProb = 1 / (1 + Math.exp(-diff * SIGMOID_K));
  const blueProb = Math.min(0.97, Math.max(0.03, rawBlueProb + BLUE_SIDE_BONUS));
  const redProb = 1 - blueProb;

  const laneAdvantages = computeLaneAdvantages(bluePicks, redPicks);

  const ctx: TimelineCtx = {
    diff,
    blueScore,
    redScore,
    bluePicks,
    redPicks,
    blueName: game.blueTeam,
    redName: game.redTeam,
    laneAdvantages,
  };

  const duration = computeDuration(ctx);
  const { events, finalWinner } = generateTimeline(ctx, duration);

  const timeline: MatchTimeline = {
    durationMinutes: duration,
    durationLabel: formatTime(duration),
    events,
  };

  return {
    blueProb,
    redProb,
    winner: finalWinner,
    blueScore,
    redScore,
    timeline,
    laneAdvantages,
  };
}
