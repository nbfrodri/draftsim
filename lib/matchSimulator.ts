import type { Champion, GameDraft, Lane, Roster, Side } from "./types";
import {
  getEffectiveTier,
  getMetaEnabled,
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
import { PLAYER_TIER_VALUE, playerForLane, poolBias } from "./players";
import { formTierBias, type SideForms } from "./playerForm";
import type { RNG } from "./rng";
import {
  applyCarryFocusToLaneAdv,
  applyLaneSwapToLaneAdv,
  applyPickTargetToLaneAdv,
  applyWeaksideToLaneAdv,
  DEFAULT_STRATEGY,
  strategyFit,
  strategyTimelineModifiers,
  type StrategyTimelineModifiers,
  type TeamStrategy,
} from "./sim/strategies";
import type {
  MatchEvent,
  MatchTimeline,
  SimulationResult,
  TeamScore,
} from "./sim/types";

// Timeline state machine — shared context/state types and the helper
// functions that used to be closures inside generateTimeline. The phase
// blocks themselves live in ./sim/timeline/{laning,objectives,fights,
// closing}; generateTimeline below is the orchestrator.
import type {
  MatchState,
  TimelineContext,
  TimelineCtx,
} from "./sim/timeline/context";
import {
  computeFinalLaneGold,
  decideClosingWinner,
  finalizeTimeline,
  phaseClosingFight,
  phaseInhibitorCascade,
  phaseNexus,
} from "./sim/timeline/closing";
import {
  phaseBuffSteal,
  phaseCounterGank,
  phaseFirstBlood,
  phaseFirstScuttle,
  phaseGank,
  phaseLevelOneInvade,
  phaseMidRoam,
  phasePlates,
  phaseSoloKills,
  phaseWaveCrash,
} from "./sim/timeline/laning";
import {
  phaseAtakhanOrHerald,
  phaseElder,
  phaseFirstBaron,
  phaseFirstDrake,
  phaseFirstTower,
  phaseFourthDrakeSoul,
  phaseGrubs,
  phaseMidTower,
  phaseSecondDrake,
  phaseThirdDrake,
} from "./sim/timeline/objectives";
import {
  phaseMidPickOrSkirmish,
  phaseMidTeamfight,
  phaseObjectiveTrade,
  phaseOutplay,
  phasePowerSpikes,
  phaseShutdown,
  phaseVisionPick,
} from "./sim/timeline/fights";

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

// Pure helpers live in their own module — they don't share state with the
// timeline state machine. The event-description renderers and gold/KDA
// helpers are consumed by the phase modules in ./sim/timeline; this file
// only needs the champion-data and scoring helpers below.
import {
  // constants
  POSITIONAL_LANES,
  // utility helpers
  formatTime,
  rollInt as rollIntWith,
  // champion data helpers
  earlyCount,
  isAD,
  isAP,
  lateScalingCount,
  metaFor,
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
    // getEffectiveTier consults the active override (randomized meta) before
    // the baseline dataset, so randomizing the meta affects all subsequent
    // sims. For an off-role pick (no explicit tier in this lane) it derives a
    // fallback from the champion's known tiers (median − 1), or floors at "D"
    // when the lane isn't one it can play; only truly tier-less champions
    // fall back to a flat "C".
    const tier = getEffectiveTier(c.alias, lane, c.lanes) ?? "C";
    total += TIER_VALUE[tier];
    count++;
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
  // Base: late edge is weighted ABOVE early edge — a scaling team's win
  // condition (reaching the late game) is the stronger structural advantage,
  // since games average well past 30 min and the late comp picks the fight
  // timing once online.
  const base = lateDiff * 1.5 + earlyDiff * 0.55;
  // Snowball / scaling contrast bonus. Triggers when the matchup has a clear
  // winner per phase. The early team gets an early-window edge, but it's
  // softened (0.16) so it doesn't fully negate the scaling team's draft —
  // the early comp must actually CONVERT that window in-game (which the
  // duration-ramped closing payoff then lets the late comp punish if they
  // don't). Previously this contrast made late comps static underdogs.
  const earlyContrast = Math.max(0, oppLate - myLate) * Math.max(0, myEarly);
  const lateContrast = Math.max(0, oppEarly - myEarly) * Math.max(0, myLate);
  const contrastBonus = (earlyContrast - lateContrast) * 0.12;
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

// ─── Pre-game win model ─────────────────────────────────────────────────────
// The ONE shared place that converts the pre-game state (score diff plus the
// phase-scaling contrast of the two drafts) into the reported blue win
// probability. IMPORTANT: the winner is NOT sampled from this value — it
// emerges from generateTimeline (diff-biased event rolls accumulating into
// gold/momentum/objectives, then the closing-fight logit at ~`closingLogit`
// below). This function is therefore CALIBRATED to match those emergent
// outcomes, not the other way around, so the displayed probability is an
// honest forecast of what the timeline machine actually produces.
//
// Model: logit = SIGMOID_K·diff + SCALING_EDGE_K·scalingEdge·durationRamp
//   • diff — blue−red team score (incl. scoreBias + strategy fit). Drives
//     event-side rolls (compFactor 0.022/roll) and the closing logit
//     (0.028·diff), which integrate to ~0.05 logit per score point.
//   • scalingEdge·ramp — mirrors the timeline's late-game payoff: a
//     late-scaling comp converts long games via scalingPayoff +
//     teamFightFactor, an effect the score diff alone under-reports by up
//     to ~17pp. The ramp uses the deterministic part of computeDuration so
//     phase contrast only matters when games are actually expected to run
//     long.
//   • BLUE_SIDE_BONUS — the timeline's +0.1 blue logit per event roll shows
//     up empirically as ~+2.5pp at even drafts.
//
// Calibration (lib/matchSimulator.calibration.test.ts, seeded RNG, ≥2000
// sims per point): mirror drafts at diff −30/−15/0/+15/+30 → empirical
// ~21/35/53/70/84% vs reported 21/35/53/70/84%; phase-contrast drafts
// (5-late vs 5-early etc.) within ±4pp. Comp-specific combat asymmetries
// outside the phase axis (e.g. a full-poke comp's low EHP in resolveCombat)
// can still add residual error — re-run the calibration test after touching
// ANY of: rollEventSide coefficients, closingLogit weights, goldPhaseWeight,
// scalingPayoff, or these constants.
const SIGMOID_K = 0.05;
const SCALING_EDGE_K = 0.075;
const BLUE_SIDE_BONUS = 0.025;
const PROB_CLAMP_MIN = 0.03;
const PROB_CLAMP_MAX = 0.97;

// Reported pre-game blue win probability. Shared so any consumer
// (simulateMatch, tooling, tests) reads the same calibrated model. Clamped:
// upsets always stay possible in the timeline, so the forecast never claims
// certainty either.
//
// `scalingEdge` is blue-positive phase contrast — (blueLate − redLate) +
// 0.5·(redEarly − blueEarly) — and `expectedDuration` the deterministic
// pre-game duration estimate; both default to neutral for callers that only
// have a diff.
export function pregameBlueWinProb(
  diff: number,
  scalingEdge: number = 0,
  expectedDuration: number = 34,
): number {
  const ramp = Math.max(0, (Math.min(50, Math.max(24, expectedDuration)) - 27) / 8);
  const logit = diff * SIGMOID_K + scalingEdge * SCALING_EDGE_K * ramp;
  const raw = 1 / (1 + Math.exp(-logit));
  return Math.min(PROB_CLAMP_MAX, Math.max(PROB_CLAMP_MIN, raw + BLUE_SIDE_BONUS));
}

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
      // Early champs fall off harder the longer the game runs (no items, no
      // scaling) — by the 35-min mark they're dead weight in a fight.
      factor += gameTime < 18 ? 1.2 : gameTime < 25 ? 0.85 : gameTime < 35 ? 0.5 : 0.35;
    } else if (phase === "mid") {
      factor += gameTime < 12 ? 0.7 : 1.0;
    } else if (phase === "mid-late") {
      factor += gameTime < 22 ? 0.7 : gameTime < 38 ? 1.1 : 1.3;
    } else {
      // late — keeps scaling past 32 min instead of plateauing, so a comp
      // that drags the game to 40+ genuinely out-classes the enemy in fights.
      factor += gameTime < 22 ? 0.5 : gameTime < 32 ? 1.0 : gameTime < 40 ? 1.4 : 1.75;
    }
  }
  return Math.max(0.5, factor);
}

// ─── Power-spike timing ─────────────────────────────────────────────────────
//
// Each carry has a "key item" spike minute (championBuilds.getKeyPowerSpike).
// A team fights better while MORE of its carries are online (past their spike)
// than the enemy's — the classic "fight on your item timing" window. This is a
// granular complement to phase: a 14-min Kraken spike vs a 20-min one creates a
// real 14–20' window the early-spiker should fight in. Returns the carries'
// spike minutes for a side (only carry-archetype champs generate a window).
function carrySpikeMinutes(picks: (Champion | null)[]): number[] {
  const out: number[] = [];
  for (const c of picks) {
    if (!c) continue;
    const meta = metaFor(c);
    const spike = getKeyPowerSpike(meta, c.alias);
    if (spike.isCarrySpike) out.push(spike.minute);
  }
  return out;
}

function onlineSpikeCount(spikes: number[], time: number): number {
  let n = 0;
  for (const m of spikes) if (time >= m) n++;
  return n;
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
  const tier = lane
    ? getEffectiveTier(champ.alias, lane, champ.lanes) ?? "C"
    : "C";
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
  rng: RNG = Math.random,
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
  const winnerKills = 3 + Math.floor(dom * 3) + rollIntWith(0, 1, rng);
  // Fair 0/1 roll. The previous `Math.floor(Math.random() * 1.5)` yielded 0
  // with p = 2/3 and 1 with p = 1/3 — a hidden bias toward higher loser
  // kill counts.
  const loserKills = Math.max(
    0,
    2 - Math.floor(dom * 2) - rollIntWith(0, 1, rng),
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

// Lane-gold swing per point of player tier-deviation gap. A lane whose player
// sits one tier above their team average, facing one a tier below theirs,
// gets ~+16 g/min there (gap of 2 × 8). Comparable to a champion meta-tier
// step (tierDiff × 12). Calibratable — re-run `npm run calibrate` after
// changing. Lives here next to the lane-advantage weights it joins.
const PLAYER_LANE_BIAS_K = 8;

// Mean tier-value of a roster (centered on B = 0). Used to express each
// player's lane bias as a deviation from their OWN team's average, which makes
// the per-lane player effect sum to zero across the five lanes — the team's
// overall level is carried by the derived star (scoreBias), not re-added here.
function rosterMeanTierValue(roster: Roster | undefined): number {
  if (!roster || roster.length === 0) return 0;
  return (
    roster.reduce((s, p) => s + PLAYER_TIER_VALUE[p.tier], 0) / roster.length
  );
}

// Lane-gold bias from the two players in a lane, each measured as a deviation
// from their own team's mean tier. Returns 0 when either roster lacks the
// lane. Exported (and pure) so the per-lane player effect can be unit-tested
// without the random term inside computeLaneAdvantages. Sums to zero across
// the five lanes by construction.
export function playerLaneTierBias(
  bluePlayers: Roster | undefined,
  redPlayers: Roster | undefined,
  lane: Lane,
  k: number = PLAYER_LANE_BIAS_K,
): number {
  const bp = playerForLane(bluePlayers, lane);
  const rp = playerForLane(redPlayers, lane);
  if (!bp || !rp) return 0;
  const blueDev = PLAYER_TIER_VALUE[bp.tier] - rosterMeanTierValue(bluePlayers);
  const redDev = PLAYER_TIER_VALUE[rp.tier] - rosterMeanTierValue(redPlayers);
  return (blueDev - redDev) * k;
}

// Lane-gold swing from champion-pool fit: a laner on one of their liked
// champions over-performs in that lane; a disliked champion under-performs.
// ~15 g/min per pool point, so a comfort pick facing a disliked one swings
// ~30 g/min. Unlike the tier micro-bias this is ABSOLUTE, not zero-sum:
// being comfortable on your champion doesn't make your teammates worse, and
// the team-level upside (a well-drafted-for-its-players roster) emerges
// naturally from the higher total lane gold rather than a separate channel.
const POOL_LANE_K = 15;

export function playerLanePoolBias(
  bluePlayers: Roster | undefined,
  redPlayers: Roster | undefined,
  blueChampId: number | null,
  redChampId: number | null,
  lane: Lane,
  k: number = POOL_LANE_K,
): number {
  const bp = playerForLane(bluePlayers, lane);
  const rp = playerForLane(redPlayers, lane);
  return (poolBias(bp, blueChampId) - poolBias(rp, redChampId)) * k;
}

// Lane-gold swing from current player FORM (hot/cold streaks tracked across
// games — see lib/playerForm.ts). Applied at the same seam and in the same
// units as the tier micro-bias: formTierBias converts form ([-1,+1]) into
// tier-value units (max ±0.5 = half a tier step), scaled by the same
// PLAYER_LANE_BIAS_K. Max form swing is ±4 g/min per lane — a third of a
// champion meta-tier step — so a hot streak colors lanes without dominating
// champion/tier effects. Returns exactly 0 when neither side supplies forms,
// keeping default simulations byte-identical.
export function playerLaneFormBias(
  blueForms: SideForms | undefined,
  redForms: SideForms | undefined,
  lane: Lane,
  k: number = PLAYER_LANE_BIAS_K,
): number {
  if (!blueForms && !redForms) return 0;
  return (
    (formTierBias(blueForms?.[lane] ?? 0) - formTierBias(redForms?.[lane] ?? 0)) *
    k
  );
}

// Deterministic per-lane g/min advantages from the drafted matchups and
// rosters. PURE — no noise here. The per-game lane variance (players having
// a good/bad day) is applied separately at the call site in simulateMatch
// via applyLaneNoise, so this function can be unit-tested and reused
// without randomness.
function computeLaneAdvantages(
  bluePicks: (Champion | null)[],
  redPicks: (Champion | null)[],
  bluePlayers?: Roster,
  redPlayers?: Roster,
  blueForms?: SideForms,
  redForms?: SideForms,
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
    const blueTier = getEffectiveTier(blue.alias, lane, blue.lanes) ?? "C";
    const redTier = getEffectiveTier(red.alias, lane, red.lanes) ?? "C";
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
    // Player micro-bias: each laner's tier measured against their OWN team's
    // average. A strong toplaner on an otherwise weak team over-performs in
    // top specifically, without inflating the team's overall level (which the
    // derived-star scoreBias already carries). Sums to zero across the five
    // lanes, so it only redistributes which lanes win — no double-count.
    const playerBias = playerLaneTierBias(bluePlayers, redPlayers, lane);
    // Champion-pool fit for the players actually assigned to this lane.
    const poolLaneBias = playerLanePoolBias(
      bluePlayers,
      redPlayers,
      blue.id,
      red.id,
      lane,
    );
    // Hot/cold form for the players in this lane (lib/playerForm.ts). Exactly
    // 0 when the caller passes no forms — the default path stays unchanged.
    const formLaneBias = playerLaneFormBias(blueForms, redForms, lane);
    adv[lane] =
      phaseDiff * 50 +
      ccDiff * 5 +
      mobDiff * 5 +
      tierDiff * 12 +
      archetypeBonus +
      rangeAdv +
      counterAdvantage +
      playerBias +
      poolLaneBias +
      formLaneBias;
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

// Per-game lane variance: ±10 g/min of uniform noise per lane (players have
// good and bad days). Kept OUT of computeLaneAdvantages so the deterministic
// matchup math stays pure; the simulator applies this once per simulation
// with its injected RNG. Lanes missing a pick on either side stay untouched
// (mirrors the old behavior where the noise term lived inside the matchup
// loop). Returns a new record.
function applyLaneNoise(
  adv: Record<Lane, number>,
  bluePicks: (Champion | null)[],
  redPicks: (Champion | null)[],
  rng: RNG,
): Record<Lane, number> {
  const out = { ...adv };
  for (let i = 0; i < POSITIONAL_LANES.length; i++) {
    if (!bluePicks[i] || !redPicks[i]) continue;
    out[POSITIONAL_LANES[i]] += (rng() - 0.5) * 20;
  }
  return out;
}

// ─── Match state machine ────────────────────────────────────────────────────
// TimelineCtx / MatchState / picksOf moved to ./sim/timeline/context so the
// extracted phase modules can share them without a circular import.

function computeDuration(ctx: TimelineCtx, rng: RNG = Math.random): number {
  const blueLate = lateScalingCount(ctx.bluePicks);
  const redLate = lateScalingCount(ctx.redPicks);
  const blueEarly = earlyCount(ctx.bluePicks);
  const redEarly = earlyCount(ctx.redPicks);
  let duration = 34 + (blueLate + redLate) * 1.3 - (blueEarly + redEarly) * 0.6;
  const absDiff = Math.abs(ctx.diff);
  if (absDiff > 25) duration -= 4;
  else if (absDiff > 15) duration -= 2;
  // Early-stomp acceleration. When the leading side is also the early-game
  // side, they're expected to convert their snowball into a fast end. A
  // bigger lead + more early-game presence → meaningfully shorter game.
  // This is what makes "early-game comps win in 24 min" feel real.
  const leadingEarly =
    ctx.diff > 0 ? blueEarly : ctx.diff < 0 ? redEarly : 0;
  if (leadingEarly >= 2 && absDiff > 8) {
    duration -= leadingEarly * 1.2;
  }
  // Strategy tempo: scaling / passive plans stretch the game out, early-
  // snowball / aggressive plans shorten it (both teams' plans contribute).
  duration += strategyTimelineModifiers(
    ctx.blueStrategy,
    ctx.redStrategy,
  ).durationDelta;
  duration += Math.floor(rng() * 6) - 2;
  // Games are clamped to a 24–50 minute window: a hard-stomp can't end
  // before 24, and the longest grind tops out at 50.
  return Math.max(24, Math.min(50, duration));
}

// Event-driven timeline. No winner is pre-decided; each event resolves based
// on current MatchState (gold lead, momentum, composition diff). The closing
// fight emerges from the FINAL state, so a draft-loser team that wins key
// fights can genuinely come back. Probabilities are clamped 0.18-0.82 so
// upsets are always possible.
function generateTimeline(
  ctx: TimelineCtx,
  duration: number,
  rng: RNG = Math.random,
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

  // Strategy timeline modifiers — blue-positive biases + event-chance deltas
  // derived from both teams' game plans (jungle focus, tempo, objective
  // priority, macro). Applied at the relevant event sites below so the plan
  // shapes which plays happen and who tends to win them.
  const mods: StrategyTimelineModifiers = strategyTimelineModifiers(
    ctx.blueStrategy,
    ctx.redStrategy,
  );
  // Power-spike fight window: blue-positive bias from how many carries each
  // side has online (past their key item) at a given minute. Drives mid-game
  // fights toward whoever spiked first; naturally fades to ~0 once both sides
  // are fully online late. Capped so it nudges rather than dominates.
  const blueSpikes = carrySpikeMinutes(ctx.bluePicks);
  const redSpikes = carrySpikeMinutes(ctx.redPicks);
  const spikeBias = (time: number) =>
    Math.max(
      -0.4,
      Math.min(
        0.4,
        (onlineSpikeCount(blueSpikes, time) -
          onlineSpikeCount(redSpikes, time)) *
          0.13,
      ),
    );

  // Bundle the shared mutable state + pre-computed biases into the context
  // the phase functions consume. teamFightFactor/fightDominance are injected
  // (they live here, shared with the pregame model) to avoid a circular
  // import between matchSimulator and the timeline modules.
  const tl: TimelineContext = {
    ctx,
    duration,
    rng,
    state,
    events,
    laneBias,
    mods,
    spikeBias,
    teamFightFactor,
    fightDominance,
    firstKillTaken: false,
  };

  // Laning phases 0a-2: level-1 invade, first scuttle, solo kills,
  // first blood. Bodies live in ./sim/timeline/laning.
  phaseLevelOneInvade(tl);
  phaseFirstScuttle(tl);
  phaseSoloKills(tl);
  phaseFirstBlood(tl);

  // Objective phases 3-4: voidgrubs, first drake. Bodies live in
  // ./sim/timeline/objectives.
  phaseGrubs(tl);
  phaseFirstDrake(tl);

  // Laning phases 5-7c: gank, counter-gank, buff steal, plates, mid
  // roam, wave-crash. Bodies live in ./sim/timeline/laning.
  phaseGank(tl);
  phaseCounterGank(tl);
  phaseBuffSteal(tl);
  phasePlates(tl);
  phaseMidRoam(tl);
  phaseWaveCrash(tl);

  phaseFirstTower(tl);

  phaseAtakhanOrHerald(tl);

  phasePowerSpikes(tl);

  phaseSecondDrake(tl);

  phaseMidPickOrSkirmish(tl);

  phaseThirdDrake(tl);

  // Fight phases 13-13e: mid teamfight, shutdown, vision pick, outplay,
  // cross-map objective trade. Bodies live in ./sim/timeline/fights.
  phaseMidTeamfight(tl);
  phaseShutdown(tl);
  phaseVisionPick(tl);
  phaseOutplay(tl);
  phaseObjectiveTrade(tl);

  phaseFourthDrakeSoul(tl);

  phaseFirstBaron(tl);

  phaseMidTower(tl);

  phaseElder(tl);

  // ─── Closing sequence ─────────────────────────────────────────────────
  // Winner decided from FINAL state + per-champion combat resolution, then
  // inhibitor cascade, closing fight (teamfight / ace / backdoor), nexus
  // and finalization. Bodies live in ./sim/timeline/closing; resolveCombat
  // stays in this file (it is shared with the pregame model).
  // Picks are stored in positional order (top, jungle, middle, bottom,
  // support) post-finalize, so the lane for picks[i] is POSITIONAL_LANES[i].
  const positionalRoles: (Lane | null)[] = [...POSITIONAL_LANES];
  const finalLaneGold = computeFinalLaneGold(tl);
  const combat = resolveCombat(
    ctx.bluePicks,
    positionalRoles,
    ctx.redPicks,
    positionalRoles,
    duration,
    state.goldLead,
    finalLaneGold,
    rng,
  );
  const finalWinner = decideClosingWinner(tl, combat);
  phaseInhibitorCascade(tl, finalWinner);
  phaseClosingFight(tl, finalWinner, combat);
  phaseNexus(tl, finalWinner);
  const laningEndMinute = finalizeTimeline(tl);

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
  // Per-team player rosters. When present, each player's tier shapes their
  // lane's advantage relative to their own team's average (a micro,
  // zero-sum-across-lanes effect — see computeLaneAdvantages). The team-wide
  // strength difference is carried separately by `scoreBias` (the derived
  // star), so this does not double-count tier.
  bluePlayers?: Roster;
  redPlayers?: Roster;
  // Per-side, per-lane player FORM in [-1, +1] (hot/cold streak state from
  // lib/playerForm.ts; build with sideFormsFor). Applied at the same seam as
  // the player tier micro-bias, with max form worth half a tier step in lane
  // gold. Default undefined (or all-zero forms) is exactly neutral — the
  // simulation output is byte-identical to a run without this option.
  playerForms?: {
    blue?: SideForms;
    red?: SideForms;
  };
  // Optional strategy overrides. When omitted, the strategies stored on the
  // GameDraft are used (falling back to a neutral plan). Programmatic callers
  // and tests can force a plan here without mutating the game.
  blueStrategy?: TeamStrategy;
  redStrategy?: TeamStrategy;
  // Optional random source. Defaults to Math.random; pass createRng(seed)
  // from lib/rng to make the whole simulation deterministic (same seed →
  // identical SimulationResult).
  rng?: RNG;
  // Opt-in mid-game strategic pivot (see lib/sim/timeline/context.ts and
  // ./fights). When true, a side that is clearly behind at ~min 20 will
  // shift to a desperation strategy for the remainder of the game —
  // "all-in" Baron rush, side-lane splitpush, or objective-rush. This
  // adds a small amount of variance to simulated games that is otherwise
  // absent; intentionally off by default so golden/calibration tests are
  // unaffected.
  adaptiveMidgame?: boolean;
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

  // Committed game plans. Read off the GameDraft (set on the StrategyView /
  // by the AI auto-picker); fall back to a neutral plan so older games and
  // callers that skip the strategy step simulate exactly as before. `options`
  // may override (used by tests / programmatic callers).
  const blueStrategy =
    options?.blueStrategy ?? game.blueStrategy ?? DEFAULT_STRATEGY;
  const redStrategy =
    options?.redStrategy ?? game.redStrategy ?? DEFAULT_STRATEGY;

  const scoreBias = options?.scoreBias ?? 0;
  const rng = options?.rng ?? Math.random;
  // Comp fit: a plan that suits the drafted comp earns a score tailwind; a
  // mismatched plan a headwind. The DIFFERENCE of the two fits feeds the
  // diff so good planning gains relative to a poorly-planned opponent.
  const strategyBias =
    strategyFit(blueStrategy, bluePicks) - strategyFit(redStrategy, redPicks);
  const diff = blueScore.total - redScore.total + scoreBias + strategyBias;
  // Reported probability — calibrated against the timeline's emergent win
  // rates (see pregameBlueWinProb). The winner below emerges from the SAME
  // diff (and the same phase-scaling dynamics) via generateTimeline, so
  // reported and empirical agree. scalingEdge/expectedDuration mirror the
  // closing-fight payoff inputs; both are deterministic pre-game values.
  const blueLatePre = lateScalingCount(bluePicks);
  const redLatePre = lateScalingCount(redPicks);
  const blueEarlyPre = earlyCount(bluePicks);
  const redEarlyPre = earlyCount(redPicks);
  const scalingEdgePre =
    blueLatePre - redLatePre + (redEarlyPre - blueEarlyPre) * 0.5;
  const expectedDuration =
    34 + (blueLatePre + redLatePre) * 1.3 - (blueEarlyPre + redEarlyPre) * 0.6;
  const blueProb = pregameBlueWinProb(diff, scalingEdgePre, expectedDuration);
  const redProb = 1 - blueProb;

  // Strategy plans redistribute per-lane gold before the timeline reads it,
  // in order: weakside starves a lane, win-condition funnels into one,
  // pick-target denies the hunted enemy lane, lane-swap dodges a bad top.
  // computeLaneAdvantages is deterministic; the per-game lane variance is
  // injected separately so it draws from the seeded rng.
  let laneAdvantages = computeLaneAdvantages(
    bluePicks,
    redPicks,
    options?.bluePlayers,
    options?.redPlayers,
    options?.playerForms?.blue,
    options?.playerForms?.red,
  );
  laneAdvantages = applyLaneNoise(laneAdvantages, bluePicks, redPicks, rng);
  laneAdvantages = applyWeaksideToLaneAdv(laneAdvantages, blueStrategy, redStrategy);
  laneAdvantages = applyCarryFocusToLaneAdv(laneAdvantages, blueStrategy, redStrategy);
  laneAdvantages = applyPickTargetToLaneAdv(laneAdvantages, blueStrategy, redStrategy);
  laneAdvantages = applyLaneSwapToLaneAdv(laneAdvantages, blueStrategy, redStrategy);

  const ctx: TimelineCtx = {
    diff,
    blueScore,
    redScore,
    bluePicks,
    redPicks,
    blueName: game.blueTeam,
    redName: game.redTeam,
    laneAdvantages,
    blueStrategy,
    redStrategy,
    adaptiveMidgame: options?.adaptiveMidgame,
  };

  const duration = computeDuration(ctx, rng);
  const { events, finalWinner, laningEndMinute } = generateTimeline(ctx, duration, rng);

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

// ─── Per-player game ratings ────────────────────────────────────────────────
//
// 1-10 performance rating per pick (one decimal), football-manager style.
// Blend of four signals:
//   • KDA quality — kills + 0.7·assists vs deaths, squashed through tanh so
//     a 13-2 carry game saturates near the cap instead of scaling linearly.
//   • Involvement — kill participation (k+a over the team's total kills),
//     centered on 45% so a bystander loses a little and a playmaker gains.
//   • Lane outcome — per-lane gold diff from the player's perspective,
//     ±2000 g saturating at ±1 rating point.
//   • Result — winners get +0.45, losers −0.45: winners skew higher, but a
//     hard-carried loss (huge KDA + winning lane) can still rate 7.5+ while
//     a carried winner can sit ~6.
//
// Calibration (see lib/playerForm.test.ts): stomp winner's carry ≈ 8-10,
// feeding loser ≈ 2-4, unremarkable game ≈ 5-6.5. Strictly monotone in
// kills/assists (up) and deaths (down), all else equal.

const RATING_BASE = 5.0;
const RATING_KDA_SCALE = 2.4;
const RATING_KDA_DIVISOR = 7;
const RATING_ASSIST_WEIGHT = 0.7;
const RATING_INVOLVEMENT_CENTER = 0.45;
const RATING_INVOLVEMENT_SCALE = 1.2;
const RATING_GOLD_SATURATION = 2000;
const RATING_RESULT_BONUS = 0.45;

function ratePlayerGame(
  k: number,
  d: number,
  a: number,
  laneGoldDiff: number,
  won: boolean,
  teamKills: number,
): number {
  const killPoints = k + a * RATING_ASSIST_WEIGHT;
  const kdaScore =
    RATING_KDA_SCALE * Math.tanh((killPoints - d) / RATING_KDA_DIVISOR);
  const participation = Math.min(1, (k + a) / Math.max(1, teamKills));
  const involvement =
    (participation - RATING_INVOLVEMENT_CENTER) * RATING_INVOLVEMENT_SCALE;
  const goldScore = Math.max(
    -1,
    Math.min(1, laneGoldDiff / RATING_GOLD_SATURATION),
  );
  const result = won ? RATING_RESULT_BONUS : -RATING_RESULT_BONUS;
  const raw = RATING_BASE + kdaScore + involvement + goldScore + result;
  return Math.round(Math.max(1, Math.min(10, raw)) * 10) / 10;
}

// Lane-ordered (top, jungle, middle, bottom, support) ratings per side —
// aligned with GameRecap.perPickKDA.
export interface GameRatings {
  blue: number[];
  red: number[];
}

// Pure rating derivation from a recap's per-pick stats. Exported so the UI
// can also compute ratings for HISTORICAL recaps persisted before the
// `ratings` field existed (winner comes from the GameDraft, not the recap).
// Returns null when the recap predates perPickKDA entirely.
export function computeGameRatings(
  recap: Pick<
    import("./types").GameRecap,
    "perPickKDA" | "laneGoldDiff" | "durationMinutes"
  >,
  winner: Side,
): GameRatings | null {
  const kda = recap.perPickKDA;
  if (!kda) return null;
  const lanes: Lane[] = ["top", "jungle", "middle", "bottom", "support"];
  const sum = (side: Array<{ k: number; d: number; a: number }>) =>
    side.reduce((s, e) => s + (e?.k ?? 0), 0);
  const blueKills = sum(kda.blue);
  const redKills = sum(kda.red);
  const rate = (side: Side): number[] =>
    lanes.map((lane, i) => {
      const entry = (side === "blue" ? kda.blue : kda.red)[i] ?? {
        k: 0,
        d: 0,
        a: 0,
      };
      // laneGoldDiff is signed from BLUE's perspective; flip for red.
      const goldBlue = recap.laneGoldDiff?.[lane] ?? 0;
      const gold = side === "blue" ? goldBlue : -goldBlue;
      return ratePlayerGame(
        entry.k,
        entry.d,
        entry.a,
        gold,
        winner === side,
        side === "blue" ? blueKills : redKills,
      );
    });
  return { blue: rate("blue"), red: rate("red") };
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
  // MVP is the Player of the Game — by convention it always goes to the
  // WINNING team. Only the winning side's players are candidates, so a fed
  // losing-team carry can never steal the award (and side swaps between
  // games can't misattribute it). Score still ranks within the winners.
  const candidates: Cand[] = [];
  for (let i = 0; i < positionalLanes.length; i++) {
    const lane = positionalLanes[i];
    if (result.winner === "blue") {
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
          score: kda.k + kda.a * 0.7 - kda.d * 0.5 + diff / 1000,
        });
      }
    } else {
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
          score: kda.k + kda.a * 0.7 - kda.d * 0.5 + diff / 1000,
        });
      }
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

  // Per-player game ratings (1-10) derived from the same per-pick KDA and
  // lane-gold numbers above. Optional on the type (legacy recaps lack it);
  // always populated for freshly built recaps.
  const ratings =
    computeGameRatings(
      { durationMinutes: result.timeline.durationMinutes, laneGoldDiff, perPickKDA },
      result.winner,
    ) ?? undefined;

  return {
    durationMinutes: result.timeline.durationMinutes,
    mvp,
    laneGoldDiff,
    biggestSwing,
    winProbTimeline,
    goldLeadTimeline,
    notableEvents,
    perPickKDA,
    ratings,
  };
}
