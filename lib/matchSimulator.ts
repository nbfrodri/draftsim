import type { Champion, GameDraft, Lane, Side } from "./types";
import {
  getMetaEnabled,
  getMetaTier,
  getSynergy,
  TIER_VALUE,
  type Archetype,
  type ChampionMeta,
  type Mobility,
  type Phase,
} from "./championMeta";
import { getAbilityProfile, teamLockdownTotal } from "./championAbilities";
import { buildStatsAt, getKeyPowerSpike } from "./championBuilds";
import { hardCounterValue } from "./draftAI/helpers";
import type {
  AtakhanVariant,
  EventKDA,
  EventKills,
  EventType,
  LaneKDA,
  MatchEvent,
  MatchTimeline,
  SimulationResult,
  TeamScore,
} from "./sim/types";

// Re-export types so consumers importing from "@/lib/matchSimulator" still
// resolve the same names without needing to change paths.
export type {
  AtakhanVariant,
  EventKDA,
  EventKills,
  EventType,
  LaneKDA,
  MatchEvent,
  MatchTimeline,
  SimulationResult,
  TeamScore,
} from "./sim/types";

// Pure helpers and event description renderers live in their own module —
// they don't share state with the timeline state machine, so isolating
// them keeps this file focused on orchestration.
import {
  // constants
  DRAGON_TYPES,
  NO_KILLS,
  POSITIONAL_LANES,
  // utility helpers
  formatTime,
  jitter,
  killsForSide,
  pickRandom,
  rollInt,
  // champion data helpers
  earlyCount,
  fallbackMeta,
  findByArchetype,
  isAD,
  isAP,
  lateScalingCount,
  metaFor,
  // gold spread helpers
  gankLaneGold,
  sideLaneGoldSplit,
  singleLaneGold,
  spreadLaneGold,
  // event descriptions
  describeAce,
  describeAtakhan,
  describeBackdoor,
  describeBaron,
  describeBuffSteal,
  describeCounterGank,
  describeDragon,
  describeElder,
  describeFirstBlood,
  describeGank,
  describeGrubs,
  describeHerald,
  describeInhibitor,
  describeInvade,
  describeNexus,
  describeObjectiveTrade,
  describeOutplay,
  describePick,
  describePlates,
  describePowerSpike,
  describeRoam,
  describeScuttle,
  describeShutdown,
  describeSkirmish,
  describeSoloKill,
  describeSoul,
  describeTeamfight,
  describeTower,
  describeVision,
  describeWaveCrash,
  // KDA helpers
  NO_KDA,
  aceKDA,
  addAssist,
  addDeath,
  addKill,
  gankKDA,
  kdaToLaneGold,
  laneKillKDA,
  makeKDA,
  mergeLaneGold,
  objectiveKDA,
  teamfightKDA,
} from "./sim/descriptions";

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
// Real damage threats — distinct from `damageBalance` (AP/AD distribution).
// A team with 4 ADs that are all tanks/skirmishers can't break a tank wall.
// This counts champs that actually carry damage: marksmen, hyper-carries,
// bursts, pokes, and damage-tagged mages (Brand counts, Lulu doesn't).
function damageDealerCountSim(team: TeamMember[]): number {
  let n = 0;
  for (const m of team) {
    const a = m.meta.archetypes;
    if (
      a.includes("hyper-carry") ||
      a.includes("burst") ||
      a.includes("poke")
    ) {
      n++;
      continue;
    }
    const roles = m.champ.roles.map((r) => r.toLowerCase());
    if (roles.includes("marksman")) {
      n++;
      continue;
    }
    if (
      roles.includes("mage") &&
      !a.includes("enchanter") &&
      !a.includes("peel")
    ) {
      n++;
    }
  }
  return n;
}

function matchupModifierScore(
  myCounts: Record<Archetype, number>,
  oppCounts: Record<Archetype, number>,
  myMob: MobilityProfile,
  oppMob: MobilityProfile,
  myHardCc: number,
  myDamageDealers: number,
  oppDamageDealers: number,
  myAP: number,
  myAD: number,
  oppAP: number,
  oppAD: number,
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

  // Insufficient sustained damage vs a tanky enemy frontline. This is the
  // generic "we can't break their tanks" signal — distinct from the burst-
  // specific check above. Triggers when we lack enough real damage threats
  // (carries / mages / pokes) to chunk through 2+ enemy tanks.
  if (myDamageDealers < 2 && oppCounts.tank >= 2) {
    mod -= oppCounts.tank >= 3 ? 4 : 3;
    tags.push("Insufficient DPS vs Tanks");
  }
  // Inverse: heavy DPS vs a soft enemy backline (no tanks, low peel) makes
  // every fight a one-shot. Real "wave the carries through" scenarios.
  if (
    myDamageDealers >= 3 &&
    oppCounts.tank === 0 &&
    oppCounts.peel < 2
  ) {
    mod += 2;
    tags.push("DPS vs Soft Backline");
  }
  // We have tanks, they have no DPS to break us. Tank wall holds.
  if (myCounts.tank >= 2 && oppDamageDealers < 2) {
    mod += 2;
    tags.push("Tank Wall vs No DPS");
  }

  // Resist matchup. In real LoL a team with 4+ same-type damage gets walled
  // when the enemy frontline can stack the right resists (mercs vs AP-heavy,
  // ninja tabis-equivalent vs AD-heavy). Without items in our model, use a
  // proxy: mono-damage comp + enemy with ≥2 tanks = penalty (they build the
  // counter-resist). Conversely, a balanced AP/AD comp denies the easy
  // single-resist solution and gets a small bonus.
  if (myAP >= 4 && oppCounts.tank >= 2) {
    mod -= 2;
    tags.push("Mono AP vs Tanks");
  }
  if (myAD >= 4 && oppCounts.tank >= 2) {
    mod -= 2;
    tags.push("Mono AD vs Tanks");
  }
  // Mixed damage (≥2 of each, plus a third damage dealer total) forces
  // enemy tanks to split-build resists, blunting their effectiveness.
  if (myAP >= 2 && myAD >= 2 && myDamageDealers >= 3 && oppCounts.tank >= 2) {
    mod += 1;
    tags.push("Mixed Damage Pressure");
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
  // Meta master switch off — return neutral. Both teams get 0, so the
  // diff cancels and metaStrength stops dragging the score.
  if (!getMetaEnabled()) return { score: 0, avg: 0 };
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
// Phase matchup score. Previously this was heavily late-biased: scaling
// counted 1.4× and "opp early" only 0.4×, so a 3-early comp facing a
// 3-late comp scored hugely negative even though in real LoL early comps
// snowball through the laning phase. The new model treats early and late
// presence as roughly symmetric (each side has a winning window) and adds
// a "snowball potential" bonus when there's a phase contrast — an
// early-heavy team facing a late-heavy team gets explicit credit for the
// early-window advantage they're expected to convert.
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
  const earlyDiff = myEarly - oppEarly;
  // Symmetric base: late edge and early edge both count, weighted near
  // equally (slightly favoring late since LoL games run longer than 25 min
  // on average, but not the previous 3.5× margin).
  const base = lateDiff * 0.9 + earlyDiff * 0.7;
  // Snowball / scaling contrast bonus. Triggers when the matchup has a
  // clear winner per phase. An early-heavy comp vs late-heavy comp gets
  // an early advantage; the late comp gets a scaling advantage.
  const earlyContrast = Math.max(0, oppLate - myLate) * Math.max(0, myEarly);
  const lateContrast = Math.max(0, oppEarly - myEarly) * Math.max(0, myLate);
  const contrastBonus = (earlyContrast - lateContrast) * 0.3;
  const raw = base + contrastBonus;
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
  const myDamageDealers = damageDealerCountSim(team);
  const oppDamageDealers = damageDealerCountSim(oppTeam);
  // Damage type counts for the resist-matchup check (mono-AP / mono-AD
  // gets walled by appropriate enemy tanks; mixed damage doesn't).
  const oppDmg = damageBalanceScore(oppTeam);
  const matchup = matchupModifierScore(
    counts,
    oppCounts,
    myMob,
    oppMob,
    cc.count,
    myDamageDealers,
    oppDamageDealers,
    dmg.ap,
    dmg.ad,
    oppDmg.ap,
    oppDmg.ad,
  );
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


// ─── Combat sim helpers ────────────────────────────────────────────────────
//
// Fight capacity is a time-aware "how strong is this team in a fight RIGHT
// NOW" score. Each champion contributes weighted by their phase intersected
// with the current game time:
//
//   early-phase champ (e.g. Lee Sin) at min 8  → +1.2  (peak)
//   early-phase champ at min 30                → +0.5  (fallen off)
//   late-phase champ (e.g. Kog'Maw) at min 8   → +0.5  (still building)
//   late-phase champ at min 35                 → +1.4  (online, item-spiked)
//
// Used by teamfight and closing-fight events to scale kill spreads — a
// dominant team converts skirmishes into 5-1 fights, not 4-2.
function teamFightFactor(
  picks: (Champion | null)[],
  gameTime: number,
): number {
  let factor = 0;
  for (const c of picks) {
    if (!c) continue;
    const phase = metaFor(c).phase;
    if (phase === "early") {
      factor += gameTime < 18 ? 1.2 : gameTime < 25 ? 0.85 : 0.5;
    } else if (phase === "mid") {
      factor += gameTime < 12 ? 0.7 : 1.0;
    } else if (phase === "mid-late") {
      factor += gameTime < 22 ? 0.7 : 1.1;
    } else {
      // late
      factor += gameTime < 22 ? 0.5 : gameTime < 32 ? 1.0 : 1.4;
    }
  }
  return Math.max(0.5, factor);
}

// Ratio of blue's fight strength to red's at this point in the game.
// Values >1 favour blue, <1 favour red. Used in closing-fight winrate
// formula and to scale teamfight kill spreads.
function fightAdvantageBlue(
  bluePicks: (Champion | null)[],
  redPicks: (Champion | null)[],
  gameTime: number,
): number {
  return (
    teamFightFactor(bluePicks, gameTime) /
    Math.max(0.5, teamFightFactor(redPicks, gameTime))
  );
}

// Convert a side's fight advantage into a kill-spread multiplier in [0..0.6].
// Used to bias rollInt() outputs upward for the dominant side. A team with
// 1.3× the fight strength turns a "3-2" rollInt outcome into roughly "5-1".
function fightDominance(myFactor: number, oppFactor: number): number {
  const ratio = myFactor / Math.max(0.5, oppFactor);
  const raw = (ratio - 1) * 0.8;
  return Math.max(0, Math.min(0.6, raw));
}

// ─── Item progression proxy ────────────────────────────────────────────────
//
// Real LoL has discrete item spikes (1-item, 2-item, mythic, 3-item, full
// build) at characteristic minutes. We don't simulate item builds, but we
// approximate the "how complete is this champion's build" curve so champion
// damage / EHP scale with the game state.
//
// Returns 0..1, where 0 = no items, 1 = full 6-item build.
//   min  6 → ~0.18  (one component)
//   min 12 → ~0.40  (mythic done)
//   min 20 → ~0.65  (3-item spike)
//   min 30 → ~0.85  (4-5 items, near power-spike plateau)
//   min 40 → ~0.95  (full build)
//
// Marksmen and hyper-carries scale slightly slower but harder (curve shifts
// right and steepens at the top); supports/tanks scale flatter but reach
// utility plateau earlier.
function itemBuildProgress(gameTime: number, phase: Phase): number {
  // Sigmoid-shaped curve, anchored so min 12 ≈ 0.4, min 30 ≈ 0.85.
  let t = gameTime;
  if (phase === "late" || phase === "mid-late") {
    // Late scalers fall behind on items but spike harder once full.
    t = gameTime - 3;
  } else if (phase === "early") {
    // Early-game champs get to "online" earlier (1-2 items is enough).
    t = gameTime + 2;
  }
  return 1 / (1 + Math.exp(-(t - 16) * 0.18));
}

// ─── Per-champion combat stats ─────────────────────────────────────────────
//
// Champion-level combat profile at a given game time. Splits damage by
// type (AD / AP / true) and resists by type (armor / MR), so resolveCombat
// can apply real damage mitigation:
//
//   AD damage / (1 + enemyArmor/100)
//   AP damage / (1 + enemyMR/100)
//
// Item progression is archetype-aware: tanks build resist heavily, carries
// build damage heavily, bruisers split. Each champion's contribution
// reflects what items they'd buy by that minute.
//
// `burstFactor` (0..1) marks how front-loaded the damage is in a fight.
// Assassins/burst mages dump 80% in the first 3 seconds (single target);
// hyper-carries deliver 15% burst and the rest sustained over 6+ seconds.
// resolveCombat uses this to model "burst vs sustained" matchups —
// glass-cannon comps win short fights, hyper-carry comps win long ones.
interface ChampCombatProfile {
  adDamage: number;
  apDamage: number;
  trueDamage: number;
  burstFactor: number;
  hp: number;
  armor: number;
  mr: number;
  sustain: number; // healing/shielding utility
  threat: number; // backline access (dive/assassin) — 0..1
}

function damageBaseFor(
  meta: ChampionMeta,
  isMarksman: boolean,
  gameTime: number,
): number {
  // Hyper-carry scales hardest (Vayne, Jinx, Kog'Maw). Power-spike at
  // 3 items (~min 25): a hyper-carry online wrecks teamfights. The base
  // is 1.5; once they hit their spike window the multiplier compounds.
  if (meta.archetypes.includes("hyper-carry")) {
    return gameTime >= 25 ? 1.85 : gameTime >= 18 ? 1.6 : 1.5;
  }
  if (isMarksman) return gameTime >= 22 ? 1.45 : 1.3;
  if (meta.archetypes.includes("burst")) return 1.4;
  if (meta.archetypes.includes("assassin")) return 1.2;
  if (meta.archetypes.includes("poke")) return 1.1;
  if (meta.archetypes.includes("skirmish")) return 0.95;
  if (meta.archetypes.includes("dive")) return 0.9;
  if (meta.archetypes.includes("tank")) return 0.5;
  if (meta.archetypes.includes("enchanter")) return 0.4;
  if (meta.archetypes.includes("peel")) return 0.5;
  return 0.7;
}

// Damage type split — what fraction of a champion's damage is AD vs AP vs
// true. Marksmen are pure AD; mages are pure AP; hybrids split; some
// champs (Vayne W, Briar) deal small true. Default uses isAP / isAD with
// AP_BUILDERS_OVERRIDE for misclassified assassins.
function damageTypeSplit(c: Champion): { ad: number; ap: number; tr: number } {
  const isMark = c.roles.some((r) => r.toLowerCase() === "marksman");
  const isMage = c.roles.some((r) => r.toLowerCase() === "mage");
  const isFighter = c.roles.some((r) => r.toLowerCase() === "fighter");
  // True-damage champions (Vayne W, Briar, Camille passive). Small fraction.
  const TRUE_DAMAGE = new Set([
    "Vayne",
    "Briar",
    "Camille",
    "Cho'Gath",
    "FiddleSticks",
  ]);
  const trueShare = TRUE_DAMAGE.has(c.alias) ? 0.15 : 0;
  if (isAP(c) && !isAD(c)) return { ad: 0, ap: 1 - trueShare, tr: trueShare };
  if (isAD(c) && !isAP(c)) return { ad: 1 - trueShare, ap: 0, tr: trueShare };
  // Hybrids (Kayle, Kennen) — split evenly.
  if (isAP(c) && isAD(c)) return { ad: 0.45, ap: 0.45, tr: 0.1 };
  // Fighter without mage tag — typically AD (tank/skirmisher with AD scaling).
  if (isFighter) return { ad: 0.85, ap: 0, tr: 0.15 };
  // Pure marksman fallback.
  if (isMark) return { ad: 1 - trueShare, ap: 0, tr: trueShare };
  if (isMage) return { ad: 0, ap: 1 - trueShare, tr: trueShare };
  // Tanks/supports with neither tag — minimal damage; default to AD.
  return { ad: 0.7, ap: 0.1, tr: 0.2 };
}

// Per-champion burst factor — how front-loaded their damage is in a fight.
// Single-target assassins / burst mages drop their kit in 2-3 seconds and
// then stand around (high burst factor). Hyper-carries DPS over the whole
// fight (low burst factor). Drives "short fights vs long fights" decision.
function burstFactorFor(meta: ChampionMeta): number {
  if (meta.archetypes.includes("assassin")) return 0.8;
  if (meta.archetypes.includes("burst")) return 0.7;
  if (meta.archetypes.includes("pick")) return 0.55;
  if (meta.archetypes.includes("wombo")) return 0.5;
  if (meta.archetypes.includes("hyper-carry")) return 0.15;
  if (meta.archetypes.includes("poke")) return 0.4;
  if (meta.archetypes.includes("dive")) return 0.45;
  if (meta.archetypes.includes("skirmish")) return 0.35;
  if (meta.archetypes.includes("tank")) return 0.25;
  return 0.4;
}

// Per-champion armor / MR / HP at a given game time. Archetype-driven:
// tanks build resists heavily; bruisers split; squishies barely have any.
// Item progression scales the curve.
function champDefenses(
  meta: ChampionMeta,
  gameTime: number,
): { armor: number; mr: number; hp: number } {
  const items = itemBuildProgress(gameTime, meta.phase);
  // Base resists at min 0 (level 1 base stats roughly).
  let armorBase = 30;
  let mrBase = 30;
  let hpBase = 1.0;
  // Item scaling depends on what they build.
  let armorScale = 30; // armor gained per "full build progress"
  let mrScale = 30;
  let hpScale = 1.0;
  if (meta.archetypes.includes("tank")) {
    armorBase = 50;
    mrBase = 50;
    hpBase = 1.4;
    armorScale = 100; // tanks invest hard in resists
    mrScale = 100;
    hpScale = 1.6;
  } else if (
    meta.archetypes.includes("dive") ||
    meta.archetypes.includes("skirmish")
  ) {
    armorBase = 40;
    mrBase = 35;
    hpBase = 1.1;
    armorScale = 50;
    mrScale = 40;
    hpScale = 1.0;
  } else if (
    meta.archetypes.includes("sustain") ||
    meta.archetypes.includes("peel")
  ) {
    armorBase = 35;
    mrBase = 35;
    hpBase = 1.0;
    armorScale = 50;
    mrScale = 50;
    hpScale = 0.8;
  }
  // squishies: marksmen, hyper-carries, mages, assassins — keep low base scaling
  return {
    armor: armorBase + armorScale * items,
    mr: mrBase + mrScale * items,
    hp: hpBase * (0.6 + items * 1.0),
  };
}

function champCombatProfile(
  champ: Champion,
  lane: Lane | null,
  gameTime: number,
): ChampCombatProfile {
  const meta = metaFor(champ);
  const isMark = champ.roles.some((r) => r.toLowerCase() === "marksman");
  // When the meta master switch is off, every champion gets the same
  // damage multiplier (1.0 = neutral) so comp differentiation in combat
  // comes from items + archetype + identity, not tier.
  const tier = lane ? getMetaTier(champ.alias, lane) ?? "C" : "C";
  const tierMul = getMetaEnabled() ? 0.7 + TIER_VALUE[tier] * 0.08 : 1.0;
  const items = itemBuildProgress(gameTime, meta.phase);
  // Total damage budget for this champion at this minute.
  const dmgTotal =
    damageBaseFor(meta, isMark, gameTime) * tierMul * (0.4 + items * 1.3);
  // Split by damage type — drives mitigation in resolveCombat.
  const split = damageTypeSplit(champ);
  // ─── Real-build augmentation ────────────────────────────────────────
  // Layer item stats from Meraki's curated build path on top of the
  // archetype-default scaling. The base damage above is "abstract scaling"
  // (kit + tier + items as a sigmoid). Adding real item AD/AP brings in
  // concrete stat values so Vayne with 3-item Kraken-PD-IE actually has
  // ~190 AD + 75% crit, not just an abstract multiplier.
  //
  // Scaling: add ~1% of damage per AD (or AP) point, capped to avoid
  // double-counting the abstract scaling. Tier/items already do most of
  // the lifting; this is fine-tuning.
  const buildStats = buildStatsAt(meta, gameTime);
  const itemAdContribution = buildStats.ad * 0.012;
  const itemApContribution = buildStats.ap * 0.012;
  const adDamage = dmgTotal * split.ad + itemAdContribution * split.ad;
  const apDamage = dmgTotal * split.ap + itemApContribution * split.ap;
  const trueDamage = dmgTotal * split.tr;
  // ─── Real-ability burst factor ───────────────────────────────────────
  // Use Meraki's per-champion burst window when available (more accurate
  // than the archetype default). Falls back to archetype if missing.
  const ability = getAbilityProfile(champ.alias);
  const burstFactor =
    ability.burstWindowSeconds > 0 && ability.burstWindowSeconds <= 6
      ? // Convert window (seconds) into a 0..1 factor: 2.5s → 0.75 burst,
        // 8s → 0.2 burst (sustained).
        Math.max(0.1, Math.min(0.85, 1 - ability.burstWindowSeconds / 8))
      : burstFactorFor(meta);
  // ─── Real-defense augmentation ───────────────────────────────────────
  // champDefenses already gives archetype-driven curves. Add real item
  // contributions so a Sunfire+Heartsteel+Thornmail tank actually shows
  // ~280 armor mid-game.
  const def = champDefenses(meta, gameTime);
  const armor = def.armor + buildStats.armor;
  const mr = def.mr + buildStats.mr;
  const hp = def.hp + buildStats.hp / 1000; // hp from items is in flat HP; normalize
  // Sustain & threat — utility metrics. Sustain scales with lifesteal/
  // omnivamp from items now.
  let sustain = 0;
  if (
    meta.archetypes.includes("enchanter") ||
    meta.archetypes.includes("sustain")
  )
    sustain = 0.4;
  else if (meta.archetypes.includes("peel")) sustain = 0.2;
  sustain += (buildStats.lifesteal + buildStats.omnivamp) * 0.005;
  let threat = 0;
  if (meta.archetypes.includes("assassin")) threat = 0.7;
  else if (meta.archetypes.includes("dive")) threat = 0.5;
  else if (meta.archetypes.includes("pick")) threat = 0.4;
  return {
    adDamage,
    apDamage,
    trueDamage,
    burstFactor,
    hp,
    armor,
    mr,
    sustain,
    threat,
  };
}

// Aggregated team combat profile. Damage sums; resists average (since
// damage is distributed across the enemy team — average resist captures
// "how hard is this team as a whole to chew through"); HP sums; sustain
// sums (extends the team's effective HP under sustained damage); threat
// sums (backline pressure score).
interface TeamCombatProfile {
  adDamage: number;
  apDamage: number;
  trueDamage: number;
  // Damage-weighted average burst factor — captures "is this team a
  // 3-second-burst threat or a 10-second-DPS threat?"
  burstFactor: number;
  hp: number;
  armor: number; // average across champs
  mr: number;
  sustain: number;
  threat: number;
  // Identity counts (preserved from old profile).
  womboCount: number;
  pickCount: number;
  diveCount: number;
  pokeCount: number;
  hyperCarryCount: number;
  peelCount: number;
}

function teamCombatProfile(
  picks: (Champion | null)[],
  roles: (Lane | null)[],
  gameTime: number,
): TeamCombatProfile {
  let adDamage = 0;
  let apDamage = 0;
  let trueDamage = 0;
  let weightedBurst = 0;
  let hp = 0;
  let armorSum = 0;
  let mrSum = 0;
  let count = 0;
  let sustain = 0;
  let threat = 0;
  let womboCount = 0;
  let pickCount = 0;
  let diveCount = 0;
  let pokeCount = 0;
  let hyperCarryCount = 0;
  let peelCount = 0;
  for (let i = 0; i < picks.length; i++) {
    const c = picks[i];
    if (!c) continue;
    const p = champCombatProfile(c, roles[i] ?? null, gameTime);
    adDamage += p.adDamage;
    apDamage += p.apDamage;
    trueDamage += p.trueDamage;
    const dmg = p.adDamage + p.apDamage + p.trueDamage;
    weightedBurst += p.burstFactor * dmg;
    hp += p.hp;
    armorSum += p.armor;
    mrSum += p.mr;
    count++;
    sustain += p.sustain;
    threat += p.threat;
    const meta = metaFor(c);
    if (meta.archetypes.includes("wombo")) womboCount++;
    if (meta.archetypes.includes("pick")) pickCount++;
    if (meta.archetypes.includes("dive")) diveCount++;
    if (meta.archetypes.includes("poke")) pokeCount++;
    if (meta.archetypes.includes("hyper-carry")) hyperCarryCount++;
    if (
      meta.archetypes.includes("peel") ||
      meta.archetypes.includes("enchanter")
    )
      peelCount++;
  }
  const totalDmg = adDamage + apDamage + trueDamage;
  return {
    adDamage,
    apDamage,
    trueDamage,
    burstFactor: totalDmg > 0 ? weightedBurst / totalDmg : 0.4,
    hp,
    armor: count > 0 ? armorSum / count : 50,
    mr: count > 0 ? mrSum / count : 50,
    sustain,
    threat,
    womboCount,
    pickCount,
    diveCount,
    pokeCount,
    hyperCarryCount,
    peelCount,
  };
}

// Compatibility shim — `TeamCombatStats` is the older interface used by
// resolveCombat below. Map TeamCombatProfile to TeamCombatStats so the
// identity multiplier helpers in resolveCombat still type-check.
type TeamCombatStats = TeamCombatProfile;

// Iterative champion-level combat resolution. Computes total damage capacity
// vs total EHP for both teams, factors in sustain (which extends EHP),
// returns a kill ratio that maps to realistic kill spreads.
//
// This replaces the previous "fightDominance × roll" model for the closing
// fight specifically, where a per-champion treatment matters most. Result:
// a hyper-carry comp at full build (Jinx + Lulu + Janna + Sejuani + Sett at
// min 35) actually shreds an enemy that didn't get to scale, even from a
// modest gold deficit.
// Carry archetypes whose gold lead disproportionately translates into
// fight outcomes. A fed Vayne or Akali at 3-item-spike is the canonical
// "carry won the fight" scenario; a fed Sejuani is meaningful but less
// fight-determining (her job is utility, not damage). Used by
// carryGoldLeadBonus below to weight the per-lane lead toward carries.
const CARRY_GOLD_ARCHETYPES: ReadonlySet<Archetype> = new Set([
  "hyper-carry",
  "burst",
  "assassin",
  "poke",
]);

// Per-lane "fed carry" damage bonus. For each lane where one side has a
// meaningful gold lead AND the leading side's pick is a carry, scale up
// that side's damage. Models the real-LoL outcome where the team behind
// on gold can still teamfight evenly UNLESS the lead is concentrated on
// a hyper-scaling carry — in which case it's basically over.
//
// Mechanics:
//   - Threshold: 1500g lane lead before any bonus applies (smaller leads
//     are noise, already covered by the team-wide blueItemBoost).
//   - Per-lane bonus: linear from 1500g (+3%) up to 5000g (+12%), capped.
//   - Carry weight: hyper-carry/burst/assassin/poke get full bonus;
//     marksman role tag also qualifies; other archetypes get half value
//     (they benefit from gold but don't carry fights with it).
//   - Caps: total bonus per side capped at +25% damage so a runaway
//     stomp doesn't multiply away the rest of the simulation logic.
function carryGoldLeadBonus(
  bluePicks: (Champion | null)[],
  redPicks: (Champion | null)[],
  laneGold: Record<Lane, number>,
): { blueDmgMul: number; redDmgMul: number } {
  let blueBonus = 0;
  let redBonus = 0;
  for (let i = 0; i < POSITIONAL_LANES.length; i++) {
    const lane = POSITIONAL_LANES[i];
    const lead = laneGold[lane];
    const absLead = Math.abs(lead);
    if (absLead < 1500) continue;
    // Bonus magnitude: 1500g → 0.03, 5000g → 0.12, then capped.
    const baseBonus = Math.min(0.12, 0.03 + (absLead - 1500) / 50000);
    if (lead > 0) {
      const champ = bluePicks[i];
      if (!champ) continue;
      const meta = metaFor(champ);
      const isCarryArch = meta.archetypes.some((a) =>
        CARRY_GOLD_ARCHETYPES.has(a),
      );
      const isMarksman = champ.roles.some(
        (r) => r.toLowerCase() === "marksman",
      );
      const weight = isCarryArch || isMarksman ? 1.0 : 0.5;
      blueBonus += baseBonus * weight;
    } else {
      const champ = redPicks[i];
      if (!champ) continue;
      const meta = metaFor(champ);
      const isCarryArch = meta.archetypes.some((a) =>
        CARRY_GOLD_ARCHETYPES.has(a),
      );
      const isMarksman = champ.roles.some(
        (r) => r.toLowerCase() === "marksman",
      );
      const weight = isCarryArch || isMarksman ? 1.0 : 0.5;
      redBonus += baseBonus * weight;
    }
  }
  return {
    blueDmgMul: 1 + Math.min(0.25, blueBonus),
    redDmgMul: 1 + Math.min(0.25, redBonus),
  };
}

function resolveCombat(
  bluePicks: (Champion | null)[],
  blueRoles: (Lane | null)[],
  redPicks: (Champion | null)[],
  redRoles: (Lane | null)[],
  gameTime: number,
  goldLead: number,
  laneGold: Record<Lane, number> | null,
): { winnerSide: Side; winnerKills: number; loserKills: number; ratio: number } {
  const blue = teamCombatProfile(bluePicks, blueRoles, gameTime);
  const red = teamCombatProfile(redPicks, redRoles, gameTime);
  // Gold lead translates into items, items translate into stats.
  const blueItemBoost = 1 + Math.max(0, goldLead) / 10000;
  const redItemBoost = 1 + Math.max(0, -goldLead) / 10000;
  // Per-lane "fed carry" damage multiplier — concentrates gold-lead
  // impact on carries instead of spreading it evenly across the team.
  // null laneGold (legacy callers) skips the bonus entirely.
  const carryBonus = laneGold
    ? carryGoldLeadBonus(bluePicks, redPicks, laneGold)
    : { blueDmgMul: 1, redDmgMul: 1 };

  // Identity multipliers — comp shapes interact, not just stats:
  function identityDamageMul(my: TeamCombatStats, opp: TeamCombatStats): number {
    let m = 1.0;
    if (my.womboCount >= 2 && opp.peelCount < 2) m += 0.15;
    if (my.diveCount >= 2 && opp.peelCount < 2 && opp.hyperCarryCount >= 1)
      m += 0.18;
    if (my.pickCount >= 2 && opp.peelCount < 2) m += 0.12;
    if (my.hyperCarryCount >= 1 && my.peelCount >= 2) m += 0.18;
    return m;
  }
  function identityEhpMul(my: TeamCombatStats, opp: TeamCombatStats): number {
    let m = 1.0;
    if (my.pokeCount >= 2 && opp.womboCount < 2) m += 0.1;
    return m;
  }

  const blueIdDmg = identityDamageMul(blue, red);
  const redIdDmg = identityDamageMul(red, blue);
  const blueIdEhp = identityEhpMul(blue, red);
  const redIdEhp = identityEhpMul(red, blue);

  // ─── Damage mitigation ────────────────────────────────────────────────
  // Real LoL formula: damage_taken = damage / (1 + resist/100) for both
  // armor (vs AD) and MR (vs AP). True damage bypasses both. We use the
  // ENEMY team's average resist as the mitigator — captures the "how
  // tanky is this team to chew through" intuition without modeling per-
  // target focus.
  const blueAdVsRed = (blue.adDamage * blueItemBoost) / (1 + red.armor / 100);
  const blueApVsRed = (blue.apDamage * blueItemBoost) / (1 + red.mr / 100);
  const blueTrueVsRed = blue.trueDamage * blueItemBoost;
  let blueDmg =
    (blueAdVsRed + blueApVsRed + blueTrueVsRed) * blueIdDmg * carryBonus.blueDmgMul;
  const redAdVsBlue = (red.adDamage * redItemBoost) / (1 + blue.armor / 100);
  const redApVsBlue = (red.apDamage * redItemBoost) / (1 + blue.mr / 100);
  const redTrueVsBlue = red.trueDamage * redItemBoost;
  let redDmg =
    (redAdVsBlue + redApVsBlue + redTrueVsBlue) * redIdDmg * carryBonus.redDmgMul;

  // ─── Anti-heal interaction ────────────────────────────────────────────
  // When facing 2+ damage threats, teams buy Grievous Wounds items
  // (Mortal Reminder, Bramble Vest, etc.) which cut sustain by ~40%.
  const blueSustainEff =
    blue.sustain * (red.threat >= 1.0 || red.adDamage > 1.5 ? 0.6 : 1.0);
  const redSustainEff =
    red.sustain * (blue.threat >= 1.0 || blue.adDamage > 1.5 ? 0.6 : 1.0);

  // ─── Effective HP ──────────────────────────────────────────────────────
  // HP sum + sustain extension (heals = effectively more HP). Item boost
  // scales HP from items. Identity multiplier applies (poke softens entry).
  const blueEhp =
    blue.hp * blueItemBoost * blueIdEhp * (1 + blueSustainEff * 0.3);
  const redEhp =
    red.hp * redItemBoost * redIdEhp * (1 + redSustainEff * 0.3);

  // ─── Burst window vs sustained DPS ────────────────────────────────────
  // High-burst comp (assassins) wins fast fights — if they can drop a
  // backline target in 3 seconds, the math flips. Approximation: when a
  // team's average burstFactor is ≥ 0.6 AND opp peel is low, damage in
  // the burst window is amplified.
  if (blue.burstFactor >= 0.6 && red.peelCount < 2 && red.hyperCarryCount >= 1)
    blueDmg *= 1.15;
  if (red.burstFactor >= 0.6 && blue.peelCount < 2 && blue.hyperCarryCount >= 1)
    redDmg *= 1.15;
  // Hyper-carries (low burstFactor, high sustained DPS) win extended
  // fights — reward when their team has peel to keep them alive.
  if (
    blue.hyperCarryCount >= 1 &&
    blue.peelCount >= 2 &&
    blue.burstFactor < 0.35
  )
    blueDmg *= 1.1;
  if (
    red.hyperCarryCount >= 1 &&
    red.peelCount >= 2 &&
    red.burstFactor < 0.35
  )
    redDmg *= 1.1;

  // ─── Lockdown advantage (Meraki ability data) ─────────────────────────
  // Side with more total hard-CC duration gets fight initiation: enemies
  // are CC'd while we dump damage. Translates the ability data into a
  // damage multiplier — each second of lockdown advantage = +5% damage.
  const blueAliases = bluePicks.map((c) => (c ? c.alias : null));
  const redAliases = redPicks.map((c) => (c ? c.alias : null));
  const blueLockdown = teamLockdownTotal(blueAliases);
  const redLockdown = teamLockdownTotal(redAliases);
  const lockdownDelta = blueLockdown - redLockdown;
  if (lockdownDelta > 0.5) blueDmg *= 1 + Math.min(0.2, lockdownDelta * 0.05);
  if (lockdownDelta < -0.5)
    redDmg *= 1 + Math.min(0.2, -lockdownDelta * 0.05);

  // Time-to-kill ratio.
  const blueTtk = redEhp / Math.max(0.1, blueDmg);
  const redTtk = blueEhp / Math.max(0.1, redDmg);
  const ratio = redTtk / blueTtk;
  const winnerSide: Side = ratio >= 1 ? "blue" : "red";
  const dom =
    ratio >= 1
      ? Math.min(0.7, (ratio - 1) * 0.6)
      : Math.min(0.7, (1 / ratio - 1) * 0.6);
  const winnerKills = 3 + Math.floor(dom * 3) + Math.floor(Math.random() * 2);
  const loserKills = Math.max(
    0,
    2 - Math.floor(dom * 2) - Math.floor(Math.random() * 1.5),
  );
  return { winnerSide, winnerKills, loserKills, ratio };
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
  const r = new Set(champ.roles.map((s) => s.toLowerCase()));
  if (r.has("marksman")) return !MELEE_MARKSMEN.has(champ.alias);
  if (r.has("mage")) return !MELEE_MAGES.has(champ.alias);
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

// Detect a "weakside" lane setup: when a team's draft signals they intend
// to give up resources in one lane (typically a self-sufficient top: tank
// or sustain bruiser with late-game phase) so the jungler/support can
// invest in another lane (typically a hyper-carry bot with peel support).
//
// Returns the weak lane (loses g/min to give space) and the strong lane
// (gains g/min from invested attention). Returns nulls if the picks don't
// suggest a weakside strategy — most drafts don't.
//
// Recognized patterns:
//   - Top weakside + Bot strong: classic pro pattern, sustain/tank top
//     lets bot adc + enchanter scale safely.
//   - Bot weakside + Top strong: lane-swap-y pattern with carry top
//     (Camille/Riven) and a tankier bot setup.
function detectWeakside(
  picks: (Champion | null)[],
): { weakLane: Lane | null; strongLane: Lane | null } {
  const top = picks[0];
  const bot = picks[3];
  const sup = picks[4];
  if (!top || !bot || !sup) return { weakLane: null, strongLane: null };
  const topMeta = metaFor(top);
  const botMeta = metaFor(bot);
  const supMeta = metaFor(sup);
  // Pattern A — top is the weakside, bot is the carry investment.
  const topPlaysWeakside =
    (topMeta.archetypes.includes("sustain") ||
      topMeta.archetypes.includes("tank") ||
      topMeta.archetypes.includes("splitpush")) &&
    (topMeta.phase === "late" || topMeta.phase === "mid-late");
  const botIsInvest =
    botMeta.archetypes.includes("hyper-carry") &&
    (supMeta.archetypes.includes("peel") ||
      supMeta.archetypes.includes("enchanter"));
  if (topPlaysWeakside && botIsInvest) {
    return { weakLane: "top", strongLane: "bottom" };
  }
  // Pattern B — top is the carry, bot is weakside.
  const topIsInvest =
    (topMeta.archetypes.includes("dive") ||
      topMeta.archetypes.includes("skirmish")) &&
    (topMeta.phase === "early" || topMeta.phase === "mid");
  const botPlaysWeakside =
    (botMeta.archetypes.includes("poke") ||
      (supMeta.archetypes.includes("tank") &&
        botMeta.archetypes.includes("hyper-carry") === false));
  if (topIsInvest && botPlaysWeakside && topMeta.archetypes.includes("splitpush")) {
    return { weakLane: "bottom", strongLane: "top" };
  }
  return { weakLane: null, strongLane: null };
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
    const blueTier = getMetaTier(blue.alias, lane) ?? "C";
    const redTier = getMetaTier(red.alias, lane) ?? "C";
    const tierDiff = TIER_VALUE[blueTier] - TIER_VALUE[redTier];
    // Curated hard-counter table — directly translates the matchup table
    // into lane gold. A bonus 5 hard counter (Yorick vs Nasus, Malphite
    // vs Yasuo) translates to a ~+75 g/min lane swing. Hard counters
    // should produce dominant lane outcomes, not a token tier-diff bump.
    // Bonus 1-2 are situational and contribute modestly; 4+ scales up
    // sharply via a non-linear curve so the dominance reflects severity.
    const blueCounters = hardCounterValue(blue, red);
    const redCounters = hardCounterValue(red, blue);
    // Net counter: positive = blue wins matchup. Magnitude is the bonus.
    const counterNet = blueCounters - redCounters;
    const counterAbs = Math.abs(counterNet);
    let counterAdvantage = 0;
    if (counterAbs > 0) {
      // Linear up to 3, accelerating past 4 (hard counter territory).
      const base = Math.min(3, counterAbs) * 8;
      const surcharge = counterAbs > 3 ? (counterAbs - 3) * 18 : 0;
      counterAdvantage = (counterNet > 0 ? 1 : -1) * (base + surcharge);
    }
    adv[lane] =
      phaseDiff * 50 +
      ccDiff * 5 +
      mobDiff * 5 +
      tierDiff * 12 +
      archetypeBonus +
      rangeAdv +
      counterAdvantage +
      (Math.random() - 0.5) * 20;
  }
  // Apply weakside redistributions. The weak side bleeds ~25 g/min while
  // the strong side gets +15 g/min — net negative for the team, but the
  // resource concentration enables the strong lane to snowball harder
  // than even spread would. Real LoL: investing 100% of jungler's time
  // bot beats a 60-40 split on average, even if top loses CS.
  const blueWS = detectWeakside(bluePicks);
  if (blueWS.weakLane && blueWS.strongLane) {
    adv[blueWS.weakLane] -= 25;
    adv[blueWS.strongLane] += 15;
  }
  const redWS = detectWeakside(redPicks);
  if (redWS.weakLane && redWS.strongLane) {
    // Red's weakside means BLUE has the advantage in red's weak lane.
    // Mirror direction.
    adv[redWS.weakLane] += 25;
    adv[redWS.strongLane] -= 15;
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

function picksOf(ctx: TimelineCtx, side: Side): (Champion | null)[] {
  return side === "blue" ? ctx.bluePicks : ctx.redPicks;
}

function computeDuration(ctx: TimelineCtx): number {
  const blueLate = lateScalingCount(ctx.bluePicks);
  const redLate = lateScalingCount(ctx.redPicks);
  const blueEarly = earlyCount(ctx.bluePicks);
  const redEarly = earlyCount(ctx.redPicks);
  let duration = 34 + (blueLate + redLate) * 0.8 - (blueEarly + redEarly) * 0.6;
  const absDiff = Math.abs(ctx.diff);
  if (absDiff > 25) duration -= 4;
  else if (absDiff > 15) duration -= 2;
  // Early-stomp acceleration. When the leading side is also the early-game
  // side, they're expected to convert their snowball into a fast end. A
  // bigger lead + more early-game presence → meaningfully shorter game.
  // This is what makes "early-game comps win in 22 min" feel real.
  const leadingEarly =
    ctx.diff > 0 ? blueEarly : ctx.diff < 0 ? redEarly : 0;
  if (leadingEarly >= 2 && absDiff > 8) {
    duration -= leadingEarly * 1.2;
  }
  duration += Math.floor(Math.random() * 6) - 2;
  return Math.max(22, Math.min(50, duration));
}

// Event-driven timeline. No winner is pre-decided; each event resolves based
// on current MatchState (gold lead, momentum, composition diff). The closing
// fight emerges from the FINAL state, so a draft-loser team that wins key
// fights can genuinely come back. Probabilities are clamped 0.18-0.82 so
// upsets are always possible.
function generateTimeline(
  ctx: TimelineCtx,
  duration: number,
): { events: MatchEvent[]; finalWinner: Side; laningEndMinute: number } {
  const state: MatchState = {
    goldLead: 0,
    momentum: 0,
    drakes: { blue: 0, red: 0 },
    soulSide: null,
    baronExpiresAt: null,
    elderSide: null,
    towerPressure: { blue: 0, red: 0 },
    grubCount: { blue: 0, red: 0 },
    atakhanVariant: null,
    atakhanSide: null,
    ruinousActive: false,
  };
  const events: MatchEvent[] = [];

  // ─── Lane priority bias ────────────────────────────────────────────────
  // Lane prio = which side is pushing/winning their lane. In real LoL it's
  // the macro currency that ENABLES plays: roams, objective takes, deep
  // wards, jungle invasion. The team with prio doesn't lose CS when they
  // leave lane, so they convert pressure into kills/objectives elsewhere.
  //
  // We sum per-lane g/min advantages (already a proxy for lane pressure)
  // and use the result as a `typeBias` for early/mid objective rolls. A
  // team with +400 g/min summed across lanes → bias 0.4, which shifts the
  // logit by ~10 percentage points — meaningful but not deterministic.
  // Late-game events (baron, elder) ignore this bias since prio has
  // decayed by then.
  const laneBias = (() => {
    let total = 0;
    for (const lane of POSITIONAL_LANES) total += ctx.laneAdvantages[lane];
    return total / 1000;
  })();

  // Objectives that meaningfully tilt the win odds beyond raw gold:
  //   - drakes stack a small per-stack bonus (8% logit per drake-difference)
  //   - soul = persistent execute threat (~+11pp swing)
  //   - elder = finishing buff (~+17pp swing)
  // These compound with goldLead/momentum, so a team that took soul AND elder
  // is in commanding position even without a crushing gold lead.
  function objectiveLogit(): number {
    const drakeFactor = (state.drakes.blue - state.drakes.red) * 0.08;
    const soulFactor =
      state.soulSide === "blue" ? 0.45 : state.soulSide === "red" ? -0.45 : 0;
    const elderFactor =
      state.elderSide === "blue" ? 0.7 : state.elderSide === "red" ? -0.7 : 0;
    // Atakhan grants a persistent fight-winrate edge to its taker — extra
    // gold from kills (Voracious) or extra revives (Ruinous) both make
    // subsequent fights easier to close. Reflected here as a smaller
    // permanent logit shift (~+5pp swing) so the side that took it is
    // measurably more likely to win every subsequent rollEventSide.
    const atakhanFactor =
      state.atakhanSide === "blue"
        ? 0.22
        : state.atakhanSide === "red"
        ? -0.22
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
  function goldPhaseWeight(time: number): number {
    if (time <= 6) return 1.8;
    if (time >= 35) return 0.55;
    // Linear interp between (6, 1.8) and (35, 0.55)
    return 1.8 - ((time - 6) / 29) * 1.25;
  }

  function snapshotProb(time: number): number {
    const compFactor = ctx.diff * 0.022;
    const goldFactor = (state.goldLead / 4500) * goldPhaseWeight(time);
    const momFactor = state.momentum * 1.2;
    const blueBonus = 0.1;
    const logit =
      compFactor + goldFactor + momFactor + objectiveLogit() + blueBonus;
    return Math.max(0.03, Math.min(0.97, 1 / (1 + Math.exp(-logit))));
  }

  function rollEventSide(time: number, typeBias: number = 0): Side {
    const compFactor = ctx.diff * 0.022;
    const goldFactor = (state.goldLead / 4500) * goldPhaseWeight(time);
    const momFactor = state.momentum * 1.2;
    const blueBonus = 0.1;
    const logit =
      compFactor +
      goldFactor +
      momFactor +
      objectiveLogit() +
      typeBias +
      blueBonus;
    const probBlue = 1 / (1 + Math.exp(-logit));
    const clamped = Math.max(0.18, Math.min(0.82, probBlue));
    return Math.random() < clamped ? "blue" : "red";
  }

  // Tower events use the standard side roll plus a tilt from accumulated
  // tower pressure. Sides that took grubs/herald are more likely to crack
  // turrets next; pressure is consumed when a tower falls.
  function rollTowerSide(time: number): Side {
    const pressureDiff = state.towerPressure.blue - state.towerPressure.red;
    return rollEventSide(time, pressureDiff * 0.45);
  }

  function consumeTowerPressure(side: Side) {
    state.towerPressure[side] = Math.max(0, state.towerPressure[side] - 0.5);
  }

  function detectComeback(side: Side, momentumImpact: number): string {
    if (momentumImpact < 0.25) return "";
    const wasLosing =
      (side === "blue" && (state.goldLead < -2500 || state.momentum < -0.4)) ||
      (side === "red" && (state.goldLead > 2500 || state.momentum > 0.4));
    return wasLosing ? "MOMENTUM SHIFT! " : "";
  }

  // Real-LoL gold values (rounded for clarity):
  //   - kill: ~300g local + assist gold ≈ 300 team-equivalent
  //   - turret plate: ~125g, turret kill: ~250g local + 100g/ally global ≈ 550
  //   - inhibitor: ~400g local + super-minion pressure ≈ 800 team-equivalent
  function applyState(
    side: Side,
    kills: EventKills,
    towers: EventKills,
    inhibs: EventKills,
    momentumImpact: number,
  ) {
    state.goldLead +=
      (kills.blue - kills.red) * 300 +
      (towers.blue - towers.red) * 550 +
      (inhibs.blue - inhibs.red) * 800;
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
      kdaDelta?: EventKDA;
    } = {},
    momentumImpact: number = 0.15,
  ) {
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
    const flair = detectComeback(side, momentumImpact);
    applyState(side, kills, towers, inhibs, momentumImpact);
    const winProbAfter = snapshotProb(minutes);
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
      kdaDelta,
      winProbAfter,
      // Snapshot the post-event gold lead so the UI can render a
      // gold-over-time chart without re-walking laneGoldDelta. Captures
      // the same applyState() output that drives win-prob.
      goldLeadAfter: state.goldLead,
    });
  }

  // Track whether a kill has already landed before the first-blood event
  // window — used to label first-blood correctly. If invade or solo kills
  // already drew first blood, the actual first-blood event becomes an
  // "early kill" instead so the timeline doesn't claim two first bloods.
  let firstKillTaken = false;

  // 0a. Level 1 invade (0.3-1.8) — 30% chance. Side bias toward team with more
  // engage/pick presence; outcome is a single kill or a neutral win.
  if (Math.random() < 0.3) {
    const t = jitter(0.3, 1.8);
    const side = rollEventSide(t);
    const wp = picksOf(ctx, side);
    const lp = picksOf(ctx, side === "blue" ? "red" : "blue");
    const killHappened = Math.random() < 0.55;
    if (killHappened) firstKillTaken = true;
    // Level-1 invade is a 5-man play; if a kill lands, jungler gets credit
    // (most likely to leash-kill the enemy jungler), supports assist.
    const kda = makeKDA();
    if (killHappened) {
      addKill(kda, side, "jungle");
      addAssist(kda, side, "support");
      addDeath(kda, side === "blue" ? "red" : "blue", "jungle");
    }
    addEvent(
      "invade",
      t,
      side,
      describeInvade(side, wp, lp, ctx.blueName, ctx.redName),
      {
        kills: killHappened ? killsForSide(side, 1, 0) : NO_KILLS,
        laneGoldDelta: spreadLaneGold(killHappened ? 200 : 80, side),
        kdaDelta: kda,
      },
      0.12,
    );
  }

  // 0b. First scuttle crab (3-4.5) — 60% chance. Vision + small gold reward.
  if (Math.random() < 0.6) {
    const t = jitter(3, 4.5);
    const side = rollEventSide(t);
    addEvent(
      "scuttle",
      t,
      side,
      describeScuttle(side, picksOf(ctx, side), ctx.blueName, ctx.redName),
      { laneGoldDelta: singleLaneGold("jungle", 80, side) },
      0.06,
    );
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
      firstKillTaken = true;
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
          // Kill bounty (300g) flows via kdaDelta. The lane delta here is
          // just the lost-CS gold from the victim recalling/dying — small.
          laneGoldDelta: singleLaneGold(lane, 120 * numKills, bullySide),
          kdaDelta: laneKillKDA(bullySide, lane, numKills),
        },
        0.15 + numKills * 0.05,
      );
    }
  }

  // 2. First blood (3-5.5). If invade or a snowballing solo lane already
  // took the first kill, this fires as a follow-up early kill instead so
  // the timeline doesn't double-claim first blood. Same kill economy
  // either way — only the label and the kill-bounty bonus differ.
  {
    const t = jitter(3, 5.5);
    const side = rollEventSide(t, 0.1);
    const isFirstBlood = !firstKillTaken;
    const fbLanes: Lane[] = ["top", "jungle", "middle", "bottom"];
    const fbLane = pickRandom(fbLanes);
    const winnerChamp =
      picksOf(ctx, side)[POSITIONAL_LANES.indexOf(fbLane)] ?? null;
    const desc = isFirstBlood
      ? describeFirstBlood(
          side,
          picksOf(ctx, side),
          picksOf(ctx, side === "blue" ? "red" : "blue"),
          t,
        )
      : winnerChamp
        ? `Early kill — ${winnerChamp.name} draws blood ${
            fbLane === "middle" ? "mid" : fbLane === "bottom" ? "bot" : fbLane
          }`
        : `Early kill in ${fbLane === "middle" ? "mid" : fbLane === "bottom" ? "bot" : fbLane}`;
    // Kill goes to the lane where it happened, jungler often assists
    // (~40% of FBs / early kills are gank-fueled).
    const fbKda = laneKillKDA(side, fbLane);
    if (Math.random() < 0.4 && fbLane !== "jungle") {
      addAssist(fbKda, side, "jungle");
    }
    firstKillTaken = true;
    addEvent(
      "first-blood",
      t,
      side,
      desc,
      {
        kills: killsForSide(side, 1, 0),
        // Kill bounty in kdaDelta. The +100g first-blood bonus is the only
        // gold remaining — kdaToLaneGold can't model the FB-specific bonus.
        // No bonus on follow-up early kills (it was already paid out).
        laneGoldDelta: singleLaneGold(fbLane, isFirstBlood ? 100 : 0, side),
        kdaDelta: fbKda,
      },
      0.2,
    );
  }

  // 3. Voidgrubs (6-7.5) — confer Touch of the Void: bonus damage to turrets.
  // Builds tower pressure that biases the next tower events toward this side.
  // Side roll heavily biased by lane prio — voidgrubs are an early-game
  // objective and the team controlling lanes contests them better.
  // Per-grub bonus: each kill grants Touch of the Void (~tower damage),
  // so 6 grubs is meaningfully bigger than 3. Grub count is now rolled
  // explicitly and feeds tower pressure proportionally + lane gold scales.
  {
    const t = jitter(6, 7.5);
    const side = rollEventSide(t, laneBias * 0.7);
    // Count distribution: 6 grubs is most common when one team contests
    // hard (~50%); 3 grubs for split, 4-5 for partial fights.
    const grubsTaken =
      Math.random() < 0.5 ? 6 : Math.random() < 0.7 ? 3 : rollInt(4, 5);
    state.grubCount[side] += grubsTaken;
    // Each grub = +0.12 tower pressure (6 grubs = +0.72, the meaningful
    // tower-shred spike). Plus a small per-grub gold bonus.
    state.towerPressure[side] += grubsTaken * 0.12;
    const grubGold = 60 + grubsTaken * 25; // 6 grubs ≈ 210g spread
    addEvent(
      "grubs",
      t,
      side,
      describeGrubs(side, ctx.blueName, ctx.redName, grubsTaken),
      { laneGoldDelta: spreadLaneGold(grubGold, side) },
      0.06 + grubsTaken * 0.01,
    );
  }

  // 4. First Drake (6.5-8.3) — 8% chance of a smite steal flipping the side.
  // Strongly biased by lane prio: bot lane's prio in particular determines
  // who can fight over drake without losing a tower.
  {
    const t = jitter(6.5, 8.3);
    const contestSide = rollEventSide(t, laneBias * 0.6);
    const stolen = Math.random() < 0.08;
    const side: Side = stolen
      ? contestSide === "blue"
        ? "red"
        : "blue"
      : contestSide;
    state.drakes[side]++;
    const drakeType = pickRandom(DRAGON_TYPES);
    // Stolen drake: the smiter (jungle) flipped the play; usually the team
    // that "won" the contest still got 1-2 kills on the smiter's team. KDA
    // attributes those to the loser side that secured the post-fight kills.
    const dragonKills = stolen ? rollInt(1, 2) : 0;
    addEvent(
      "dragon",
      t,
      side,
      describeDragon(side, ctx.blueName, ctx.redName, state.drakes[side], drakeType, stolen),
      {
        kills: stolen ? killsForSide(side, 0, dragonKills) : NO_KILLS,
        laneGoldDelta: spreadLaneGold(150, side),
        // For a steal, opponents collected the kills (loser of objective
        // wins the post-smite skirmish). Otherwise no kills, no KDA.
        kdaDelta: stolen
          ? objectiveKDA(
              side === "blue" ? "red" : "blue",
              dragonKills,
              0,
              true,
              side,
            )
          : NO_KDA,
      },
      stolen ? 0.25 : 0.12,
    );
  }

  // 5. Gank (3.5-9.5) — 55% chance, biased to gankable lane. Lane prio
  // matters: a jungler with prio (i.e., on the team with more pushed lanes)
  // can roam to gank without giving up jungle camps.
  if (Math.random() < 0.55) {
    const t = jitter(3.5, 9.5);
    const side = rollEventSide(t, laneBias * 0.5);
    const lane = pickGankableLane(ctx.laneAdvantages, side);
    addEvent(
      "gank",
      t,
      side,
      describeGank(side, picksOf(ctx, side), lane, ctx.blueName, ctx.redName),
      {
        kills: killsForSide(side, 1, 0),
        // Kill+assist gold flows through kdaDelta. Remaining lane gold here
        // models lost CS for the victim while recalling.
        laneGoldDelta: gankLaneGold(lane, 100, side),
        kdaDelta: gankKDA(side, lane, "jungle", lane),
      },
      0.16,
    );
  }

  // 6. Counter-gank (5.5-9.5) — 30% chance.
  if (Math.random() < 0.3) {
    const t = jitter(5.5, 9.5);
    const side = rollEventSide(t);
    const flippedLane = pickRandom(["top", "middle", "bottom"] as Lane[]);
    // Counter-gank: jungler arrived and turned the gank — kill credit goes
    // to the jungler, laner provides the assist, opp jungler/laner dies.
    addEvent(
      "counter-gank",
      t,
      side,
      describeCounterGank(side, picksOf(ctx, side), ctx.blueName, ctx.redName),
      {
        kills: killsForSide(side, 1, 0),
        laneGoldDelta: gankLaneGold(flippedLane, 100, side),
        kdaDelta: gankKDA(side, "jungle", flippedLane, "jungle"),
      },
      0.18,
    );
  }

  // 6b. Buff steal (5.5-9) — 22% chance. Jungle invade requires lane prio
  // to back up — without it, getting caught is the more likely outcome.
  if (Math.random() < 0.22) {
    const t = jitter(5.5, 9);
    const side = rollEventSide(t, laneBias * 0.6);
    const killHappened = Math.random() < 0.4;
    addEvent(
      "buff-steal",
      t,
      side,
      describeBuffSteal(side, picksOf(ctx, side), ctx.blueName, ctx.redName),
      {
        kills: killHappened ? killsForSide(side, 1, 0) : NO_KILLS,
        laneGoldDelta: singleLaneGold("jungle", killHappened ? 220 : 100, side),
        kdaDelta: killHappened
          ? laneKillKDA(side, "jungle", 1, "jungle")
          : NO_KDA,
      },
      0.1,
    );
  }

  // 7. Plates (8-12) — 50% chance, side-lane heavy. Plates are the most
  // direct gold conversion of lane prio: pushing the wave under tower
  // means the plates fall to your side.
  if (Math.random() < 0.5) {
    const t = jitter(8, 12);
    const side = rollEventSide(t, laneBias * 0.7);
    addEvent(
      "plates",
      t,
      side,
      describePlates(side, picksOf(ctx, side), ctx.blueName, ctx.redName),
      { laneGoldDelta: sideLaneGoldSplit(400, side) },
      0.1,
    );
  }

  // 7b. Mid roam (9-13) — 40% chance. Mid laner / sup roams to a side
  // lane. Heavily biased by lane prio — the canonical "I have prio so I
  // can leave my lane" play. A roamer without prio loses CS and gets
  // dove on the way back.
  if (Math.random() < 0.4) {
    const t = jitter(9, 13);
    const side = rollEventSide(t, laneBias * 0.9);
    const targetLane = pickRandom(["top", "bottom"] as Lane[]);
    addEvent(
      "roam",
      t,
      side,
      describeRoam(side, picksOf(ctx, side), targetLane, ctx.blueName, ctx.redName),
      {
        kills: killsForSide(side, 1, 0),
        // Kill bounty + roamer assist via kdaDelta; lane delta = lost CS only.
        laneGoldDelta: gankLaneGold(targetLane, 100, side),
        // Roamer (mid) gets the kill, the laner being roamed for assists,
        // opponent in target lane dies.
        kdaDelta: gankKDA(side, "middle", targetLane, targetLane),
      },
      0.13,
    );
  }

  // 7c. Wave-crash (8-13) — 35% chance. A laner crashes the wave and
  // either freezes the bounce (denying CS) or cracks a plate. Pure macro
  // gold without a kill — just well-timed wave management. Biased by lane
  // prio (a team with prio crashes harder).
  if (Math.random() < 0.35) {
    const t = jitter(8, 13);
    const side = rollEventSide(t, laneBias * 0.5);
    const lane = pickRandom(["top", "middle", "bottom"] as Lane[]);
    addEvent(
      "wave-crash",
      t,
      side,
      describeWaveCrash(side, picksOf(ctx, side), lane, ctx.blueName, ctx.redName),
      { laneGoldDelta: singleLaneGold(lane, 220, side) },
      0.06,
    );
  }

  // 8. First Tower (10-13). Tower-pressure side bias: side that took
  // grubs is meaningfully more likely to crack first turret.
  {
    const t = jitter(10, 13);
    const side = rollTowerSide(t);
    consumeTowerPressure(side);
    const towerLane = pickRandom(["top", "middle", "bottom"] as Lane[]);
    addEvent(
      "tower",
      t,
      side,
      describeTower(side, picksOf(ctx, side), ctx.blueName, ctx.redName, true),
      {
        towers: killsForSide(side, 1, 0),
        laneGoldDelta: singleLaneGold(towerLane, 350, side),
      },
      0.15,
    );
  }

  // 9. Atakhan or second Herald (14-16). Herald grants the tower break + a
  // big tower-pressure stack. Lane prio still matters here — the team with
  // pushed lanes contests both objectives more freely. The Atakhan variant
  // is rolled and tracked: Voracious gives subsequent fights a +20% kill-
  // gold bonus on its side; Ruinous gives a one-shot revive that softens
  // the next lost teamfight (loserKills -1).
  {
    const t = jitter(14, 16);
    const side = rollEventSide(t, laneBias * 0.4);
    if (Math.random() < 0.6) {
      const atakhanVariant: AtakhanVariant =
        Math.random() < 0.5 ? "Voracious" : "Ruinous";
      state.atakhanVariant = atakhanVariant;
      state.atakhanSide = side;
      if (atakhanVariant === "Ruinous") state.ruinousActive = true;
      const wKills = rollInt(1, 2);
      const lKills = rollInt(0, 1);
      addEvent(
        "atakhan",
        t,
        side,
        describeAtakhan(side, ctx.blueName, ctx.redName, atakhanVariant),
        {
          kills: killsForSide(side, wKills, lKills),
          laneGoldDelta: spreadLaneGold(250, side),
          kdaDelta: teamfightKDA(side, wKills, lKills),
        },
        0.18,
      );
    } else {
      const heraldLane = pickRandom(["top", "middle"] as Lane[]);
      state.towerPressure[side] += 1;
      addEvent(
        "herald",
        t,
        side,
        describeHerald(side, ctx.blueName, ctx.redName),
        {
          towers: killsForSide(side, 1, 0),
          laneGoldDelta: singleLaneGold(heraldLane, 350, side),
        },
        0.13,
      );
    }
  }

  // 9b. Power spikes (13-16). Fire when a carry-archetype champion completes
  // their first major item — the "I'm online" moment that explains why the
  // next teamfight tips a certain way. We pick the SINGLE most-impactful
  // carry per side (highest archetype priority) and fire one event per side
  // with 70% chance, slightly jittered so the two sides don't stack on the
  // exact same minute. Tank/enchanter spikes are skipped (undramatic).
  // Combat resolution already factors items via buildStatsAt, so this is
  // pure flavor + a small momentum bump.
  for (const spikeSide of ["blue", "red"] as Side[]) {
    if (Math.random() >= 0.7) continue;
    const sidePicks = picksOf(ctx, spikeSide);
    // Find the highest-priority carry on this side. Sweep picks in order
    // of typical-LoL impact: hyper-carry first, then burst/assassin, then
    // skirmish/dive. The first match wins.
    const ARCHETYPE_PRIO: Archetype[] = [
      "hyper-carry",
      "burst",
      "assassin",
      "poke",
      "skirmish",
      "dive",
    ];
    let chosen: { champ: Champion; meta: ChampionMeta } | null = null;
    outer: for (const want of ARCHETYPE_PRIO) {
      for (const c of sidePicks) {
        if (!c) continue;
        const m = metaFor(c);
        if (m.archetypes.includes(want)) {
          chosen = { champ: c, meta: m };
          break outer;
        }
      }
    }
    if (!chosen) continue;
    const spikeInfo = getKeyPowerSpike(chosen.meta, chosen.champ.alias);
    if (!spikeInfo.isCarrySpike) continue;
    // Side jitter so blue/red spikes don't share a minute. ±1 min around
    // the build's spike minute, clamped so we don't fire before min 5.
    const lo = Math.max(5, spikeInfo.minute - 1);
    const hi = Math.max(lo + 0.5, spikeInfo.minute + 1);
    const t = jitter(lo, hi);
    // Later spikes hit harder. The default build minute is 14; randomized
    // overrides span [6, 14]. We linearly scale gold delta and momentum
    // impact between a 6' spike and a 14' spike: a 14' carry coming
    // online drops a real momentum bomb, a 6' spike is mostly flavor.
    const SPIKE_MIN = 6;
    const SPIKE_MAX = 14;
    const t01 = Math.max(
      0,
      Math.min(
        1,
        (spikeInfo.minute - SPIKE_MIN) / (SPIKE_MAX - SPIKE_MIN),
      ),
    );
    const goldDelta = Math.round(60 + 180 * t01);
    const momentumImpact = 0.04 + 0.1 * t01;
    addEvent(
      "power-spike",
      t,
      spikeSide,
      describePowerSpike(chosen.champ, spikeInfo.keyItem),
      { laneGoldDelta: spreadLaneGold(goldDelta, spikeSide) },
      momentumImpact,
    );
  }

  // 10. Second Drake (11.5-14.3) — 8% chance of a smite steal. Lane prio
  // still relevant for early-mid drakes.
  if (duration >= 18) {
    const t = jitter(11.5, 14.3);
    const contestSide = rollEventSide(t, laneBias * 0.4);
    const stolen = Math.random() < 0.08;
    const side: Side = stolen
      ? contestSide === "blue"
        ? "red"
        : "blue"
      : contestSide;
    state.drakes[side]++;
    if (state.drakes[side] === 4 && state.soulSide == null) {
      state.soulSide = side;
      const soulType = pickRandom(DRAGON_TYPES);
      const wK = rollInt(1, 3);
      const lK = rollInt(0, 2);
      addEvent(
        "soul",
        t,
        side,
        describeSoul(side, ctx.blueName, ctx.redName, soulType),
        {
          kills: killsForSide(side, wK, lK),
          towers: killsForSide(side, rollInt(0, 1), 0),
          laneGoldDelta: spreadLaneGold(800, side),
          kdaDelta: teamfightKDA(side, wK, lK),
        },
        0.55,
      );
    } else {
      const drakeType = pickRandom(DRAGON_TYPES);
      const stealK = stolen ? rollInt(1, 2) : 0;
      addEvent(
        "dragon",
        t,
        side,
        describeDragon(side, ctx.blueName, ctx.redName, state.drakes[side], drakeType, stolen),
        {
          kills: stolen ? killsForSide(side, 0, stealK) : NO_KILLS,
          laneGoldDelta: spreadLaneGold(200, side),
          kdaDelta: stolen
            ? objectiveKDA(
                side === "blue" ? "red" : "blue",
                stealK,
                0,
                true,
                side,
              )
            : NO_KDA,
        },
        stolen ? 0.28 : 0.14,
      );
    }
  }

  // 11. Mid-game pick or skirmish (15.5-19)
  {
    const t = jitter(15.5, 19);
    const side = rollEventSide(t);
    const winnerScore = side === "blue" ? ctx.blueScore : ctx.redScore;
    const winnerHasPick = winnerScore.identityLabel === "Pick Comp";
    const wp = picksOf(ctx, side);
    const lp = picksOf(ctx, side === "blue" ? "red" : "blue");
    if (winnerHasPick) {
      // Pick Comp pick: support hooks but the carry (mid/bot) usually finishes
      // damage — kill credit follows damage, support gets the assist. Mirror
      // of real LoL: Thresh hooks → ADC executes. Victim is the OPPOSING
      // mirror lane (our bot kills theirs, our mid picks theirs) — the
      // pre-fix version hardcoded bot, which produced "mid pick → enemy
      // bot dies" mismatches in the replay.
      const pickKda = makeKDA();
      const carryLane: Lane = Math.random() < 0.55 ? "bottom" : "middle";
      addKill(pickKda, side, carryLane);
      addAssist(pickKda, side, "support");
      addAssist(pickKda, side, "jungle");
      addDeath(pickKda, side === "blue" ? "red" : "blue", carryLane);
      addEvent(
        "pick",
        t,
        side,
        describePick(side, wp, lp),
        {
          kills: killsForSide(side, 1, 0),
          laneGoldDelta: spreadLaneGold(180, side),
          kdaDelta: pickKda,
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
          // Kill bounty (300g) flows per-lane via kdaDelta. Small spread
          // models the "everyone is up" team gold from the broader fight.
          laneGoldDelta: spreadLaneGold((wk + lk) * 30, side),
          kdaDelta: teamfightKDA(side, wk, lk),
        },
        0.18,
      );
    }
  }

  // 12. Third Drake (16.5-20) — 10% steal as games heat up.
  if (duration >= 22) {
    const t = jitter(16.5, 20);
    const contestSide = rollEventSide(t);
    const stolen = Math.random() < 0.1;
    const side: Side = stolen
      ? contestSide === "blue"
        ? "red"
        : "blue"
      : contestSide;
    state.drakes[side]++;
    if (state.drakes[side] === 4 && state.soulSide == null) {
      state.soulSide = side;
      const soulType = pickRandom(DRAGON_TYPES);
      const wK = rollInt(1, 3);
      const lK = rollInt(0, 2);
      addEvent(
        "soul",
        t,
        side,
        describeSoul(side, ctx.blueName, ctx.redName, soulType),
        {
          kills: killsForSide(side, wK, lK),
          towers: killsForSide(side, rollInt(0, 1), 0),
          laneGoldDelta: spreadLaneGold(800, side),
          kdaDelta: teamfightKDA(side, wK, lK),
        },
        0.55,
      );
    } else {
      const drakeType = pickRandom(DRAGON_TYPES);
      const stealK = stolen ? rollInt(1, 2) : 0;
      addEvent(
        "dragon",
        t,
        side,
        describeDragon(side, ctx.blueName, ctx.redName, state.drakes[side], drakeType, stolen),
        {
          kills: stolen ? killsForSide(side, 0, stealK) : NO_KILLS,
          laneGoldDelta: spreadLaneGold(220, side),
          kdaDelta: stolen
            ? objectiveKDA(
                side === "blue" ? "red" : "blue",
                stealK,
                0,
                true,
                side,
              )
            : NO_KDA,
        },
        stolen ? 0.3 : 0.15,
      );
    }
  }

  // 13. Mid teamfight (19-24)
  {
    // Math.max guards the upper bound: at the 22-min duration floor,
    // duration-4=18 would collapse the [19, 24] range below the lower
    // bound and jitter would produce times before minute 19.
    const t = jitter(19, Math.max(20, Math.min(24, duration - 4)));
    const side = rollEventSide(t);
    const wp = picksOf(ctx, side);
    // Scale kill spread by relative fight strength at this game time.
    // Dominant team (e.g. late comp at min 24 vs early comp) converts 3-2
    // fights into 5-1 stomps; balanced fights stay near base.
    const myCap = teamFightFactor(picksOf(ctx, side), t);
    const oppCap = teamFightFactor(picksOf(ctx, side === "blue" ? "red" : "blue"), t);
    const dom = fightDominance(myCap, oppCap);
    let wk = rollInt(3, 5) + Math.floor(dom * 3);
    let lk = Math.max(0, rollInt(0, 2) - Math.floor(dom * 2));
    // Atakhan effects: Voracious side gets +20% gold from this fight (+1
    // bonus kill in gold terms via inflated laneGoldDelta). Ruinous side
    // burns its one-shot revive when it loses — loserKills -1.
    let goldMult = 1.0;
    if (state.atakhanVariant === "Voracious" && state.atakhanSide === side) {
      goldMult = 1.2; // Voracious wins → bonus gold from kills
    }
    const losingSide: Side = side === "blue" ? "red" : "blue";
    if (
      state.ruinousActive &&
      state.atakhanSide === losingSide &&
      lk > 0
    ) {
      lk -= 1; // Blood Roses revives one — softens the loss
      state.ruinousActive = false;
    }
    const winningScore = side === "blue" ? ctx.blueScore : ctx.redScore;
    addEvent(
      "teamfight",
      t,
      side,
      describeTeamfight(side, wp, winningScore.identityLabel, wk, lk),
      {
        kills: killsForSide(side, wk, lk),
        towers: killsForSide(side, rollInt(1, 2), 0),
        // Kill bounty distributed per lane via kdaDelta. Spread here is
        // the post-fight tower/CS push gold (winner takes mid CS while
        // loser respawns) — not the fight kills themselves.
        laneGoldDelta: spreadLaneGold(wk * 60 * goldMult, side),
        kdaDelta: teamfightKDA(side, wk, lk),
      },
      0.32 + dom * 0.12,
    );
  }

  // 13b. Shutdown (post-teamfight) — fires when a meaningful gold lead has
  // accumulated. The trailing team finds and executes the fed enemy carry,
  // partially closing the gap. Higher chance the bigger the lead.
  {
    const lead = Math.abs(state.goldLead);
    const shutdownChance = lead >= 4500 ? 0.55 : lead >= 2500 ? 0.35 : 0;
    if (Math.random() < shutdownChance && duration >= 22) {
      // Same Math.max guard — duration <= 25 with the original
      // Math.min would invert the jitter range. Also gate by minimum
      // duration so a 22-min stomp doesn't try to fire a min 21+ event.
      const t = jitter(21, Math.max(22, Math.min(26, duration - 5)));
      // Side that was BEHIND lands the shutdown — bounty flows to underdog.
      const side: Side = state.goldLead > 0 ? "red" : "blue";
      const wp = picksOf(ctx, side);
      const lp = picksOf(ctx, side === "blue" ? "red" : "blue");
      // Shutdown: an assassin/pick lands the play on the fed enemy carry.
      // Best heuristic: kill credit on jungle (frequent shutdown lane), fed
      // carry (mid/bottom on opp) takes the death.
      const sutdownKda = makeKDA();
      addKill(sutdownKda, side, Math.random() < 0.5 ? "jungle" : "middle");
      addAssist(sutdownKda, side, "support");
      addDeath(
        sutdownKda,
        side === "blue" ? "red" : "blue",
        Math.random() < 0.5 ? "bottom" : "middle",
      );
      addEvent(
        "shutdown",
        t,
        side,
        describeShutdown(side, wp, lp),
        {
          kills: killsForSide(side, 1, 0),
          // Shutdown bounty: 1000-1500g extra ON TOP of the kill bounty
          // (handled by kdaDelta). The +500 spread models that surplus.
          laneGoldDelta: spreadLaneGold(500, side),
          kdaDelta: sutdownKda,
        },
        0.28,
      );
    }
  }

  // 13c. Vision-based pick (16-22) — 28% chance. Control ward in a key
  // bush leads to catching out a stray enemy. Pure positional play; no
  // teamfight, just one decisive moment. Biased by lane prio (a team
  // with prio can place vision deeper).
  if (duration >= 22 && Math.random() < 0.28) {
    const t = jitter(16, Math.min(22, duration - 5));
    const side = rollEventSide(t, laneBias * 0.3);
    const wp = picksOf(ctx, side);
    const lp = picksOf(ctx, side === "blue" ? "red" : "blue");
    // Vision-pick: support places the ward/sees the catch, team collapses.
    // Carry (mid/bot/jg) lands kill credit; support assists (very few kills
    // for sup is the realistic role profile).
    const visionKda = makeKDA();
    const finisherLane: Lane =
      Math.random() < 0.4 ? "middle" : Math.random() < 0.7 ? "jungle" : "bottom";
    addKill(visionKda, side, finisherLane);
    addAssist(visionKda, side, "support");
    if (finisherLane !== "jungle") addAssist(visionKda, side, "jungle");
    // Victim distribution: most vision picks catch a carry out of
    // position (ADC walking back, mid mage stranded), with the support
    // and jungler rounding out the long tail. The earlier version
    // hardcoded support/middle only, so opposing ADCs never showed up
    // in the death column — KDA strips read flat for bot laners.
    const victimRoll = Math.random();
    const victimLane: Lane =
      victimRoll < 0.35
        ? "middle"
        : victimRoll < 0.65
        ? "bottom"
        : victimRoll < 0.85
        ? "support"
        : "jungle";
    addDeath(visionKda, side === "blue" ? "red" : "blue", victimLane);
    addEvent(
      "vision",
      t,
      side,
      describeVision(side, wp, lp, ctx.blueName, ctx.redName),
      {
        kills: killsForSide(side, 1, 0),
        // Kill + assist gold via kdaDelta; small spread for vision setup +
        // map control gain.
        laneGoldDelta: spreadLaneGold(150, side),
        kdaDelta: visionKda,
      },
      0.18,
    );
  }

  // 13d. Outplay (17-26) — 18% chance. A solo player wins outnumbered.
  // The kind of moment that flips a game's perception. Pure flavor +
  // small gold/momentum; biased toward the side whose comp has a real
  // 1v1/1v2 threat (skirmish/assassin/hyper-carry).
  if (duration >= 25 && Math.random() < 0.18) {
    const t = jitter(17, Math.min(26, duration - 4));
    // Outplays favor the side already with a slight edge (lane bias) but
    // CAN happen for the underdog — moments of brilliance work both ways.
    const side = rollEventSide(t, laneBias * 0.2);
    const wp = picksOf(ctx, side);
    const lp = picksOf(ctx, side === "blue" ? "red" : "blue");
    const outnumber = Math.random() < 0.25 ? 3 : 2;
    const wKills = outnumber >= 3 ? 2 : rollInt(1, 2);
    // Outplay: one star champion takes all the kills. Heuristic: pick a
    // carry-weighted lane (mid/bot/jungle) for the hero.
    const heroLane: Lane =
      Math.random() < 0.4
        ? "middle"
        : Math.random() < 0.65
        ? "bottom"
        : "jungle";
    const outplayKda = makeKDA();
    addKill(outplayKda, side, heroLane, wKills);
    // Outplays in the late mid-game catch any clumped enemies, not just
    // top/jg/mid — bot+support are often the squishiest targets. Earlier
    // version excluded bottom/support which left their KDA columns
    // permanently zero in the replay's death tally.
    const opposingSide: Side = side === "blue" ? "red" : "blue";
    for (let i = 0; i < wKills; i++) {
      addDeath(
        outplayKda,
        opposingSide,
        pickRandom(["top", "jungle", "middle", "bottom", "support"] as Lane[]),
      );
    }
    addEvent(
      "outplay",
      t,
      side,
      describeOutplay(side, wp, lp, outnumber),
      {
        kills: killsForSide(side, wKills, 0),
        // The hero's kill bounties (300g each, all in heroLane) flow via
        // kdaDelta. Small bonus here for the play's swing — outplays demoralize.
        laneGoldDelta: singleLaneGold(heroLane, 100 * wKills, side),
        kdaDelta: outplayKda,
      },
      0.22,
    );
  }

  // 13e. Cross-map objective trade (18-25) — 25% chance. One team gives up
  // a contested objective to grab a counter-prize on the opposite side of
  // the map (drake-for-tower, herald-for-drake). Net-neutral fight, real
  // macro currency. No kills.
  if (duration >= 24 && Math.random() < 0.25) {
    const t = jitter(18, Math.min(25, duration - 4));
    const side = rollEventSide(t, laneBias * 0.3);
    const otherSide: Side = side === "blue" ? "red" : "blue";
    const giveUp: "drake" | "herald" | "tower" = pickRandom([
      "drake",
      "tower",
    ]);
    const takeFor: "drake" | "herald" | "tower" | "plates" = pickRandom([
      "tower",
      "plates",
    ]);
    // Lane gold flows on BOTH sides — small spread to each. Both teams
    // gained something so we encode the trade as positive lane gold for
    // the "winner" side and offset gold for the other side's named lane.
    const laneGold: Partial<Record<Lane, number>> = {
      ...spreadLaneGold(180, side),
    };
    // Other team got their own gold — represent by negating one lane.
    const otherLane: Lane = pickRandom(["top", "middle", "bottom"] as Lane[]);
    const sign = otherSide === "blue" ? 1 : -1;
    laneGold[otherLane] = (laneGold[otherLane] ?? 0) + sign * 200;
    addEvent(
      "objective-trade",
      t,
      side,
      describeObjectiveTrade(side, ctx.blueName, ctx.redName, giveUp, takeFor),
      { laneGoldDelta: laneGold },
      0.05,
    );
  }

  // 14. Fourth Drake / Soul (21-25)
  if (duration >= 26 && state.soulSide == null) {
    const t = jitter(21, Math.min(25, duration - 3));
    const contestSide = rollEventSide(t);
    const stolen = Math.random() < 0.1;
    const side: Side = stolen
      ? contestSide === "blue"
        ? "red"
        : "blue"
      : contestSide;
    state.drakes[side]++;
    if (state.drakes[side] === 4) {
      state.soulSide = side;
      const soulType = pickRandom(DRAGON_TYPES);
      const wK = rollInt(1, 3);
      const lK = rollInt(0, 2);
      addEvent(
        "soul",
        t,
        side,
        describeSoul(side, ctx.blueName, ctx.redName, soulType),
        {
          kills: killsForSide(side, wK, lK),
          towers: killsForSide(side, rollInt(0, 1), 0),
          laneGoldDelta: spreadLaneGold(800, side),
          kdaDelta: teamfightKDA(side, wK, lK),
        },
        0.55,
      );
    } else {
      const drakeType = pickRandom(DRAGON_TYPES);
      const stealK = stolen ? rollInt(1, 2) : 0;
      addEvent(
        "dragon",
        t,
        side,
        describeDragon(side, ctx.blueName, ctx.redName, state.drakes[side], drakeType, stolen),
        {
          kills: stolen ? killsForSide(side, 0, stealK) : NO_KILLS,
          laneGoldDelta: spreadLaneGold(240, side),
          kdaDelta: stolen
            ? objectiveKDA(
                side === "blue" ? "red" : "blue",
                stealK,
                0,
                true,
                side,
              )
            : NO_KDA,
        },
        stolen ? 0.3 : 0.18,
      );
    }
  }

  // 15. First Baron (20-30). 15% steal chance — a stolen Nashor swings the
  // momentum hard (0.65 vs 0.5) since the trailing team flips into a 3-tower
  // siege threat. Towers + ~900g spread = a real winprob jolt.
  if (duration >= 25) {
    const tMax = Math.min(duration - 4, 30);
    const t = jitter(20, Math.max(21, tMax));
    const contestSide = rollEventSide(t, 0.05);
    const stolen = Math.random() < 0.15;
    const baronSide: Side = stolen
      ? contestSide === "blue"
        ? "red"
        : "blue"
      : contestSide;
    const wk = rollInt(1, 3);
    const lk = rollInt(0, 2);
    state.baronExpiresAt = t + 3;
    state.towerPressure[baronSide] += 1.2;
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
        laneGoldDelta: spreadLaneGold(900, baronSide),
        kdaDelta: objectiveKDA(baronSide, wk, lk, stolen),
      },
      stolen ? 0.65 : 0.5,
    );
  }

  // 16. Mid tower (23 to duration-3). Reuses tower-pressure bias.
  if (duration >= 27) {
    const t = jitter(23, Math.max(24, duration - 3));
    const side = rollTowerSide(t);
    consumeTowerPressure(side);
    addEvent(
      "tower",
      t,
      side,
      describeTower(side, picksOf(ctx, side), ctx.blueName, ctx.redName, false),
      {
        towers: killsForSide(side, rollInt(1, 2), 0),
        laneGoldDelta: singleLaneGold(pickRandom(["top", "middle", "bottom"] as Lane[]), 400, side),
      },
      0.15,
    );
  }

  // 17. Elder (long games). Soul is no longer required and the duration floor
  // is loosened — elder is a finishing buff that should appear in any 32+ min
  // game. Sets state.elderSide so closing-fight logic factors it in.
  if (duration >= 32 && Math.random() < 0.65) {
    const t = jitter(duration - 7, duration - 3);
    const contestSide = rollEventSide(t);
    const stolen = Math.random() < 0.18;
    const elderSide: Side = stolen
      ? contestSide === "blue"
        ? "red"
        : "blue"
      : contestSide;
    state.elderSide = elderSide;
    const elderWk = rollInt(1, 3);
    const elderLk = rollInt(0, 2);
    addEvent(
      "elder",
      t,
      elderSide,
      describeElder(elderSide, ctx.blueName, ctx.redName, stolen),
      {
        kills: killsForSide(elderSide, elderWk, elderLk),
        towers: killsForSide(elderSide, rollInt(0, 2), 0),
        laneGoldDelta: spreadLaneGold(1000, elderSide),
        kdaDelta: objectiveKDA(elderSide, elderWk, elderLk, stolen),
      },
      stolen ? 0.75 : 0.65,
    );
  }

  // ─── Closing fight: outcome based on FINAL state, no pre-decided winner ──
  // The closing fight runs a per-champion combat resolution: each champ has
  // a damage output and EHP estimated from archetype × meta tier × item
  // build progress at this game time. Sum across teams, factor sustain
  // (Soraka/Lulu heals extend EHP), compute kill spread from the resulting
  // TTK ratio.
  //
  // The macro winrate (gold lead, momentum, objectives) combines with the
  // tactical combat ratio via sigmoid. A late comp at full build can flip
  // a closing fight even from behind on gold; a fed early comp that didn't
  // close before scaling kicked in can still lose.
  // Picks are stored in positional order (top, jungle, middle, bottom,
  // support) post-finalize, so the lane for picks[i] is POSITIONAL_LANES[i].
  const positionalRoles: (Lane | null)[] = [...POSITIONAL_LANES];
  // Per-lane gold accumulated through the game = laning passive (capped at
  // first-tower / minute 14) + event-driven contributions. Mirrors the
  // computeLiveLaneGold logic in BetweenGamesView so the carry-bonus sees
  // the same lane gold the user sees in the UI strip.
  const finalLaneGold: Record<Lane, number> = {
    top: 0,
    jungle: 0,
    middle: 0,
    bottom: 0,
    support: 0,
  };
  for (const e of events) {
    for (const lane of POSITIONAL_LANES) {
      finalLaneGold[lane] += e.laneGoldDelta[lane] ?? 0;
    }
  }
  // Laning phase passive: per-minute g/min × time spent in laning. Use
  // the actual laning-end minute (set just below from first tower) — but
  // since that hasn't been computed yet here, approximate with the
  // standard 14-min floor capped at duration. Close enough for the
  // damage-multiplier weight.
  const lanePhaseTime = Math.min(duration, 14);
  for (const lane of POSITIONAL_LANES) {
    finalLaneGold[lane] += ctx.laneAdvantages[lane] * lanePhaseTime;
  }
  const combat = resolveCombat(
    ctx.bluePicks,
    positionalRoles,
    ctx.redPicks,
    positionalRoles,
    duration,
    state.goldLead,
    finalLaneGold,
  );
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
  const closingLogit =
    ctx.diff * 0.028 +
    (state.goldLead / 5000) * goldPhaseWeight(duration) +
    state.momentum * 0.9 +
    objectiveLogit() * 0.4 +
    Math.log(combat.ratio) * 0.7;
  const closingProb = 1 / (1 + Math.exp(-closingLogit));
  const finalWinner: Side = Math.random() < closingProb ? "blue" : "red";

  // 18. Inhibitor cascade. The winner busts at least one inhib pre-nexus.
  // In stomps (large gold lead at this point) a 2nd or even 3rd inhib falls
  // before the final fight — the loser literally can't defend because
  // super minions are crashing all 3 lanes at once. Real LoL: a 1-inhib
  // open is recoverable; 3-inhib open is a forfeited game.
  {
    const isStomp = Math.abs(state.goldLead) >= 8000;
    const isMajor = Math.abs(state.goldLead) >= 5000;
    const inhibCount = isStomp ? rollInt(2, 3) : isMajor ? rollInt(1, 2) : 1;
    const t = jitter(duration - 4, duration - 2);
    addEvent(
      "inhibitor",
      t,
      finalWinner,
      describeInhibitor(
        finalWinner,
        picksOf(ctx, finalWinner),
        ctx.blueName,
        ctx.redName,
      ) + (inhibCount > 1 ? ` (×${inhibCount})` : ""),
      {
        towers: killsForSide(finalWinner, rollInt(1, 2) + (inhibCount - 1), 0),
        inhibs: killsForSide(finalWinner, inhibCount, 0),
        laneGoldDelta: singleLaneGold(
          pickRandom(["top", "middle", "bottom"] as Lane[]),
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
  {
    const t = jitter(duration - 3, duration - 0.7);
    const wScore = finalWinner === "blue" ? ctx.blueScore : ctx.redScore;
    const winnerPicks = picksOf(ctx, finalWinner);
    const hasSplitter = !!findByArchetype(winnerPicks, ["splitpush"]);
    const closeGame = Math.abs(state.goldLead) < 4000;
    const backdoorRoll = Math.random();
    const useBackdoor = hasSplitter && closeGame && backdoorRoll < 0.12;
    if (useBackdoor) {
      const bdWk = rollInt(0, 1);
      const bdLk = rollInt(0, 1);
      addEvent(
        "backdoor",
        t,
        finalWinner,
        describeBackdoor(finalWinner, winnerPicks, ctx.blueName, ctx.redName),
        {
          kills: killsForSide(finalWinner, bdWk, bdLk),
          towers: killsForSide(finalWinner, rollInt(1, 2), 0),
          laneGoldDelta: spreadLaneGold(400, finalWinner),
          kdaDelta: teamfightKDA(finalWinner, bdWk, bdLk),
        },
        0.5,
      );
    } else if (Math.random() < 0.5) {
      addEvent(
        "ace",
        t,
        finalWinner,
        describeAce(finalWinner, ctx.blueName, ctx.redName),
        {
          kills: killsForSide(finalWinner, 5, 0),
          towers: killsForSide(finalWinner, rollInt(1, 2), 0),
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
        "teamfight",
        t,
        finalWinner,
        describeTeamfight(finalWinner, winnerPicks, wScore.identityLabel, wk, lk),
        {
          kills: killsForSide(finalWinner, wk, lk),
          towers: killsForSide(finalWinner, rollInt(1, 2), 0),
          laneGoldDelta: spreadLaneGold(wk * 200, finalWinner),
          kdaDelta: teamfightKDA(finalWinner, wk, lk),
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
  for (const lane of POSITIONAL_LANES) laneAdvSum += ctx.laneAdvantages[lane];
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

  return { events, finalWinner, laningEndMinute };
}

// Optional knobs for the simulator beyond just the draft. Currently only
// `scoreBias` — added directly to the (blue - red) team-score diff before
// the sigmoid. Tournament code passes a star-rating-derived bias here so
// stronger rosters win more often even with similar drafts. Positive =
// favors blue; negative = favors red. Units are score points (sigmoid_k
// scales them into prob). A bias of ±2 ≈ ±15% win-prob at the slope.
export interface SimulateOptions {
  scoreBias?: number;
}

export function simulateMatch(
  game: GameDraft,
  champions: Champion[],
  options?: SimulateOptions,
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

  const scoreBias = options?.scoreBias ?? 0;
  const diff = blueScore.total - redScore.total + scoreBias;
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
  const { events, finalWinner, laningEndMinute } = generateTimeline(ctx, duration);

  const timeline: MatchTimeline = {
    durationMinutes: duration,
    laningEndMinute,
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

// Build a compact recap summary (MVP + biggest swing) from a finished
// simulation. Used when applying a simulated winner to the series so the
// post-series recap can synthesize a per-game storyline. Mirrors the MVP
// scoring logic in MVPCard so what the user saw is what gets persisted.
export function buildGameRecap(
  game: GameDraft,
  champions: Champion[],
  result: SimulationResult,
): import("./types").GameRecap {
  const byId = new Map(champions.map((c) => [c.id, c]));
  // Re-compute final per-lane KDA and lane gold from the timeline. We
  // don't have access to BetweenGamesView's compute helpers from here, so
  // a small local version walks events once and accumulates.
  const events = result.timeline.events;
  const positionalLanes: Lane[] = [
    "top",
    "jungle",
    "middle",
    "bottom",
    "support",
  ];
  type LaneKDARecap = { k: number; d: number; a: number };
  const blueKDA: Record<Lane, LaneKDARecap> = {
    top: { k: 0, d: 0, a: 0 },
    jungle: { k: 0, d: 0, a: 0 },
    middle: { k: 0, d: 0, a: 0 },
    bottom: { k: 0, d: 0, a: 0 },
    support: { k: 0, d: 0, a: 0 },
  };
  const redKDA: Record<Lane, LaneKDARecap> = {
    top: { k: 0, d: 0, a: 0 },
    jungle: { k: 0, d: 0, a: 0 },
    middle: { k: 0, d: 0, a: 0 },
    bottom: { k: 0, d: 0, a: 0 },
    support: { k: 0, d: 0, a: 0 },
  };
  const laneGoldEvent: Record<Lane, number> = {
    top: 0,
    jungle: 0,
    middle: 0,
    bottom: 0,
    support: 0,
  };
  for (const e of events) {
    for (const lane of positionalLanes) {
      const b = e.kdaDelta.blue[lane];
      if (b) {
        blueKDA[lane].k += b.k;
        blueKDA[lane].d += b.d;
        blueKDA[lane].a += b.a;
      }
      const r = e.kdaDelta.red[lane];
      if (r) {
        redKDA[lane].k += r.k;
        redKDA[lane].d += r.d;
        redKDA[lane].a += r.a;
      }
      laneGoldEvent[lane] += e.laneGoldDelta[lane] ?? 0;
    }
  }
  // Final lane gold = passive lane-phase gold (capped at laning end) +
  // accumulated event gold. Mirror of computeLiveLaneGold.
  const lanePhaseTime = Math.min(
    result.timeline.durationMinutes,
    result.timeline.laningEndMinute,
  );
  const finalLaneGold: Record<Lane, number> = {
    top: 0,
    jungle: 0,
    middle: 0,
    bottom: 0,
    support: 0,
  };
  for (const lane of positionalLanes) {
    finalLaneGold[lane] =
      result.laneAdvantages[lane] * lanePhaseTime + laneGoldEvent[lane];
  }

  // MVP scoring (same formula as the MVPCard component).
  type Cand = {
    side: Side;
    lane: Lane;
    championId: number;
    kda: LaneKDARecap;
    laneGoldDiff: number;
    score: number;
  };
  const candidates: Cand[] = [];
  for (let i = 0; i < positionalLanes.length; i++) {
    const lane = positionalLanes[i];
    const blueId = game.bluePicks[i];
    if (blueId != null && byId.has(blueId)) {
      const kda = blueKDA[lane];
      const diff = finalLaneGold[lane];
      candidates.push({
        side: "blue",
        lane,
        championId: blueId,
        kda,
        laneGoldDiff: diff,
        score:
          kda.k +
          kda.a * 0.7 -
          kda.d * 0.5 +
          diff / 1000 +
          (result.winner === "blue" ? 1.5 : 0),
      });
    }
    const redId = game.redPicks[i];
    if (redId != null && byId.has(redId)) {
      const kda = redKDA[lane];
      const diff = -finalLaneGold[lane];
      candidates.push({
        side: "red",
        lane,
        championId: redId,
        kda,
        laneGoldDiff: diff,
        score:
          kda.k +
          kda.a * 0.7 -
          kda.d * 0.5 +
          diff / 1000 +
          (result.winner === "red" ? 1.5 : 0),
      });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const mvp = candidates[0]
    ? {
        side: candidates[0].side,
        lane: candidates[0].lane,
        championId: candidates[0].championId,
        kills: candidates[0].kda.k,
        deaths: candidates[0].kda.d,
        assists: candidates[0].kda.a,
        laneGoldDiff: candidates[0].laneGoldDiff,
      }
    : null;

  // Biggest swing = consecutive winProbAfter delta, max in absolute terms.
  // The starting probability anchors at 50%, so we compare each event to
  // the prior event (or 0.5 for the first).
  let biggestSwing: import("./types").GameRecap["biggestSwing"] = null;
  let prev = 0.5;
  for (const e of events) {
    const delta = e.winProbAfter - prev;
    if (
      biggestSwing == null ||
      Math.abs(delta) > Math.abs(biggestSwing.probDelta)
    ) {
      biggestSwing = {
        minute: e.minutes,
        side: e.side,
        type: e.type,
        description: e.description,
        probDelta: delta,
      };
    }
    prev = e.winProbAfter;
  }

  // Build per-lane gold diff snapshot (signed from blue's perspective)
  // for the post-tournament replay panel. Same final-lane-gold values
  // the MVP scoring uses, just exposed as a lane-keyed map. Guard
  // against NaN (legacy/empty lane states from incomplete drafts) so
  // serialization doesn't write `null` and the replay shows 0 instead
  // of a missing value.
  const laneGoldDiff: Partial<Record<Lane, number>> = {};
  for (const lane of positionalLanes) {
    const v = finalLaneGold[lane];
    laneGoldDiff[lane] = Number.isFinite(v) ? Math.round(v) : 0;
  }

  // Sparse blue-side win-prob timeline (one point per event). The graph
  // anchors at 50% before the first event; clients should prepend that
  // when drawing if they want to start at game time 0.
  const winProbTimeline = events.map((e) => ({
    minute: Math.round(e.minutes * 10) / 10,
    blueProb: e.winProbAfter,
  }));
  // Parallel gold-lead timeline (signed from blue's perspective).
  // Snapshotted at the same event boundaries as winProbTimeline so the
  // two charts align minute-for-minute in the recap UI.
  const goldLeadTimeline = events.map((e) => ({
    minute: Math.round(e.minutes * 10) / 10,
    goldLead: Math.round(e.goldLeadAfter),
  }));
  // Notable events: limit to top 12 by absolute prob delta (keeps the
  // chart clean while still capturing the storyline). Always include
  // the biggestSwing anchor.
  const eventsRanked = events
    .map((e, idx) => ({
      idx,
      minute: e.minutes,
      side: e.side,
      type: e.type,
      description: e.description,
      probDelta: e.winProbAfter - (idx === 0 ? 0.5 : events[idx - 1].winProbAfter),
    }))
    .sort((a, b) => Math.abs(b.probDelta) - Math.abs(a.probDelta));
  const notableEvents = eventsRanked
    .slice(0, 12)
    .sort((a, b) => a.minute - b.minute)
    .map((e) => ({
      minute: Math.round(e.minute * 10) / 10,
      side: e.side,
      type: e.type,
      description: e.description,
      probDelta: e.probDelta,
    }));

  // Per-pick KDA — 5 entries per side aligned to the positional lanes.
  const perPickKDA = {
    blue: positionalLanes.map((lane) => ({
      k: blueKDA[lane].k,
      d: blueKDA[lane].d,
      a: blueKDA[lane].a,
    })),
    red: positionalLanes.map((lane) => ({
      k: redKDA[lane].k,
      d: redKDA[lane].d,
      a: redKDA[lane].a,
    })),
  };

  return {
    durationMinutes: result.timeline.durationMinutes,
    mvp,
    laneGoldDiff,
    biggestSwing,
    winProbTimeline,
    goldLeadTimeline,
    notableEvents,
    perPickKDA,
  };
}
