// Pick & ban scoring. Each scoring function returns both the total and
// (optionally) a labeled breakdown of the contributing components. The
// breakdown is consumed by the UI to surface the AI's reasoning during
// hover; without it, callers (like the prediction loop in anticipation.ts)
// pay no overhead for unused string allocations.

import { TIER_VALUE, getMetaEnabled, getMetaTier } from "../championMeta";
import type { Archetype } from "../championMeta";
import type { Champion, GameDraft, Lane, Side } from "../types";
import {
  archetypeSynergyBonus,
  bestLaneTierValue,
  damageBalanceDelta,
  flexLaneCount,
  isAD,
  isAP,
  isDamageDealer,
  laneMatchup,
  metaFor,
  synergyWith,
} from "./helpers";
import type { IdentityTarget } from "./helpers";
import type { SeriesAIContext } from "./index";

// ─── Scoring result type ────────────────────────────────────────────────────

export interface ScoreComponent {
  label: string;
  value: number;
}

export interface PickScore {
  total: number;
  intendedLane: Lane | null;
  breakdown?: ScoreComponent[];
}

export interface BanScore {
  total: number;
  breakdown?: ScoreComponent[];
}

// ─── Pick scoring ───────────────────────────────────────────────────────────

export interface PickContext {
  side: Side;
  byId: Map<number, Champion>;
  champions: Champion[];
  myPicks: (number | null)[];
  oppPicks: (number | null)[];
  open: Set<Lane>;
  myCounts: Record<Archetype, number>;
  oppCounts: Record<Archetype, number>;
  myDmg: { ap: number; ad: number };
  myPicksLocked: number;
  oppLaneAssignment: (Lane | null)[];
  identity: IdentityTarget | null;
  enemyBannedArchetypes: Record<Archetype, number>;
  series: SeriesAIContext | undefined;
  fearlessLocked: ReadonlySet<number>;
  game: GameDraft;
  // Count of "real damage threat" champs already on my team (marksmen,
  // hyper-carries, bursts, pokes, damage mages — NOT tanks/peelers).
  // Used to detect "we can't break tanks" scenarios.
  myDamageDealers: number;
}

export function scorePick(
  candidate: Champion,
  ctx: PickContext,
  explain: boolean = false,
): PickScore {
  const breakdown: ScoreComponent[] | undefined = explain ? [] : undefined;
  let total = 0;
  function add(label: string, value: number) {
    total += value;
    if (breakdown && value !== 0) breakdown.push({ label, value });
  }

  const { value: tierValue, lane: bestLane } = bestLaneTierValue(
    candidate,
    ctx.open,
  );

  if (bestLane == null) {
    // Champion can't play any open lane — strongly disfavored.
    add("No open lane", -50);
    add("Jitter", Math.random() * 0.3);
    return { total, intendedLane: null, breakdown };
  }

  add(`Lane fit (${bestLane}, tier×3)`, tierValue * 3);
  const meta = metaFor(candidate);

  // Comp gap fillers.
  if (ctx.myCounts.tank === 0 && meta.archetypes.includes("tank"))
    add("Fills tank gap", 8);
  if (ctx.myCounts.engage === 0 && meta.archetypes.includes("engage"))
    add("Fills engage gap", 6);
  if (
    ctx.myCounts["hyper-carry"] === 0 &&
    meta.archetypes.includes("hyper-carry")
  )
    add("Fills hyper-carry gap", 5);
  if (ctx.myCounts.peel < 2 && meta.archetypes.includes("peel"))
    add("Adds peel", 3);

  const dmgDelta = damageBalanceDelta(candidate, ctx.myDmg);
  if (dmgDelta !== 0) {
    add(dmgDelta > 0 ? "Damage gap fill" : "Damage stack penalty", dmgDelta);
  }

  // Lane priority bonus. Pushing/early-game champs gain prio, which
  // ENABLES roams + objective takes + jungle invades in early-mid game.
  // The bonus is amplified when our team identity benefits from prio:
  //   - Pick / Wombo / Hyper Engage / Dive: rely on roams to set up plays
  //   - Standard Teamfight: roams secure objectives that fund teamfights
  // Late-only scalers (Kog'Maw, Vayne, Kayle) get nothing here — they
  // don't push waves early and aren't expected to enable plays.
  if (meta.phase === "early" || meta.archetypes.includes("poke")) {
    let prioBonus = 1.5; // baseline — early-phase / poke gives lane prio
    const id = ctx.identity?.label;
    if (
      id === "Pick Comp" ||
      id === "Wombo Combo" ||
      id === "Hyper Engage" ||
      id === "Dive Comp" ||
      id === "Standard Teamfight"
    ) {
      prioBonus += 1.5; // identity actually USES the prio
    }
    add("Lane prio (enables plays)", prioBonus);
  }
  // Range advantage in lane = passive prio (denies CS, pokes melee).
  // Mages and marksmen tagged as ranged get a small prio bonus too.
  const roles = candidate.roles.map((r) => r.toLowerCase());
  if (
    roles.includes("marksman") ||
    (roles.includes("mage") && !meta.archetypes.includes("enchanter"))
  ) {
    add("Ranged lane pressure", 0.8);
  }

  // DPS-vs-tanks check. A team needs ≥2 real damage threats to break a
  // tanky enemy frontline; without them they shred minion waves but bounce
  // off champions. The bonus scales aggressively with enemy tank count
  // since each enemy tank multiplies the effective HP wall.
  if (isDamageDealer(candidate)) {
    if (ctx.myDamageDealers < 2) {
      let dpsBonus = 4; // baseline urgency to fill the role
      if (ctx.oppCounts.tank >= 3) dpsBonus += 8;
      else if (ctx.oppCounts.tank >= 2) dpsBonus += 5;
      else if (ctx.oppCounts.tank >= 1) dpsBonus += 2;
      add("Need DPS to break tanks", dpsBonus);
    } else if (ctx.myDamageDealers >= 3 && ctx.oppCounts.tank === 0) {
      // Already heavy on damage and enemy has no tank wall — diminishing
      // returns; keep selecting damage but slight pushback.
      add("Damage saturated", -2);
    }
  }

  // ─── Resist matchup awareness ──────────────────────────────────────────
  // Mirror of the simulator's "Mono X vs Tanks" matchup tag. Enemy tanks
  // can stack the right resist (mercs vs AP, plate vs AD), so picking the
  // 4th of a single damage type into 2+ tanks gets walled.
  const candAP = isAP(candidate);
  const candAD = isAD(candidate);
  if (ctx.oppCounts.tank >= 2) {
    const newAP = ctx.myDmg.ap + (candAP ? 1 : 0);
    const newAD = ctx.myDmg.ad + (candAD ? 1 : 0);
    if (newAP >= 4 && newAD < 2 && candAP)
      add("Walled mono-AP vs tanks", -3);
    if (newAD >= 4 && newAP < 2 && candAD)
      add("Walled mono-AD vs tanks", -3);
    // Mixed-damage bonus: if we already have 1+ of the OTHER type and
    // this candidate maintains the split, enemy tanks can't single-resist us.
    if (
      ctx.myDmg.ap >= 1 &&
      ctx.myDmg.ad >= 1 &&
      ctx.myDamageDealers >= 2 &&
      ((candAP && ctx.myDmg.ap < 3) || (candAD && ctx.myDmg.ad < 3))
    ) {
      add("Forces split-resist", 1.5);
    }
  }

  // Comp identity completion.
  if (ctx.identity) {
    let identityBonus = 0;
    for (const a of meta.archetypes) {
      if (ctx.identity.needed.has(a)) identityBonus += 2.5;
    }
    if (identityBonus > 0) {
      add(
        `Completes ${ctx.identity.label}`,
        Math.min(5, identityBonus),
      );
    }
  }

  // ─── Comp identity amplifiers ──────────────────────────────────────────
  // Mirror of the simulator's resolveCombat identity multipliers. When our
  // emerging comp shape matches an exploitable enemy weakness, picks that
  // double down on that shape are extra valuable.
  const enemyHasNoPeel = ctx.oppCounts.peel < 2 && ctx.oppCounts.enchanter === 0;
  // Wombo + AOE amp: if we have engage AND wombo, picks that add wombo/burst
  // get a bonus when enemy can't disengage.
  if (
    ctx.myCounts.engage >= 1 &&
    ctx.myCounts.wombo >= 1 &&
    enemyHasNoPeel &&
    (meta.archetypes.includes("wombo") || meta.archetypes.includes("burst"))
  ) {
    add("Wombo amp vs no disengage", 2);
  }
  // Dive amp: dive comp + unprotected enemy carry → another diver multiplies.
  if (
    ctx.oppCounts["hyper-carry"] >= 1 &&
    ctx.oppCounts.peel < 2 &&
    ctx.myCounts.dive >= 1 &&
    meta.archetypes.includes("dive")
  ) {
    add("Stacks dive vs unprotected", 2);
  }
  // Protect amp: hyper-carry locked + 1 peeler already → adding more peel
  // amplifies the carry's damage in the simulator's protect identity.
  if (
    ctx.myCounts["hyper-carry"] >= 1 &&
    ctx.myCounts.peel >= 1 &&
    (meta.archetypes.includes("peel") ||
      meta.archetypes.includes("enchanter"))
  ) {
    add("Stacks protect identity", 1.5);
  }
  // Pick amp: if we have a pick already AND enemy comp is structurally
  // catchable (low peel), another pick amplifies.
  if (
    ctx.myCounts.pick >= 1 &&
    enemyHasNoPeel &&
    meta.archetypes.includes("pick")
  ) {
    add("Pick comp amp", 1.5);
  }

  // ─── Weakside-aware bonuses ────────────────────────────────────────────
  // Mirror of the simulator's weakside detection. If the team is shaping
  // up as a "bot invest" comp (hyper-carry + peel sup), a weakside-friendly
  // top (sustain/tank/splitpush + late phase) gets a strategic bonus.
  // Reverse: if the team has a splitpush carry top, a tankier/sup-leaning
  // bot fits the "top-invest" pattern.
  const teamHasBotInvest =
    ctx.myCounts["hyper-carry"] >= 1 &&
    (ctx.myCounts.peel >= 1 || ctx.myCounts.enchanter >= 1);
  const teamHasTopInvest =
    ctx.myCounts.splitpush >= 1 &&
    (ctx.myCounts.dive >= 1 || ctx.myCounts.skirmish >= 1);
  if (teamHasBotInvest && bestLane === "top") {
    const fitsWeaksideTop =
      (meta.archetypes.includes("sustain") ||
        meta.archetypes.includes("tank") ||
        meta.archetypes.includes("splitpush")) &&
      (meta.phase === "late" || meta.phase === "mid-late");
    if (fitsWeaksideTop) {
      add("Fits weakside top (resources to bot)", 2);
    }
  }
  if (teamHasTopInvest && bestLane === "bottom") {
    // Bot weakside is rarer — usually a poke ADC or self-sufficient setup
    // that doesn't need babysitting from jg/sup.
    if (
      meta.archetypes.includes("poke") ||
      meta.archetypes.includes("sustain")
    ) {
      add("Fits weakside bot (resources to top)", 1.5);
    }
  }

  // Synergy.
  const explicitSyn = synergyWith(candidate, ctx.myPicks, ctx.byId);
  if (explicitSyn > 0) add("Explicit synergy", explicitSyn * 1.2);
  const implicitSyn = archetypeSynergyBonus(candidate, ctx.myPicks, ctx.byId);
  if (implicitSyn > 0) add("Archetype synergy", implicitSyn);

  // Lane matchup against the opp's lane occupant. Last-pick power: scales
  // with picks already locked.
  let oppInLane: Champion | null = null;
  for (let i = 0; i < ctx.oppPicks.length; i++) {
    if (ctx.oppLaneAssignment[i] === bestLane) {
      const id = ctx.oppPicks[i];
      if (id != null) {
        oppInLane = ctx.byId.get(id) ?? null;
        break;
      }
    }
  }
  if (oppInLane) {
    const matchupMul = 1 + 0.5 * ctx.myPicksLocked;
    const matchup = laneMatchup(candidate, oppInLane);
    const value = matchup * matchupMul;
    if (value !== 0) {
      add(
        value > 0
          ? `Counter-picks ${oppInLane.name}`
          : `Bad matchup vs ${oppInLane.name}`,
        value,
      );
    }
  }

  // Deny pick — picking a champion specifically to remove it from the
  // enemy's pool. Real LoL tactic: a champion you wouldn't play yourself
  // is so strong against your comp that picking it over your preferred
  // pick is worth it. Two signals:
  //   1. Lane-level: the candidate hard-counters one of our drafted picks
  //   2. Team-level: the candidate is an archetype that would punch our
  //      comp (mirrors scoreBan's threat logic)
  // Capped at +6 so it nudges decisions without dominating.
  let denyValue = 0;
  for (const id of ctx.myPicks) {
    if (id == null) continue;
    const teammate = ctx.byId.get(id);
    if (!teammate) continue;
    // laneMatchup returns positive when "my" beats "opp"; here we pass
    // the candidate as the hypothetical attacker against our teammate —
    // positive means the candidate would beat our teammate, which is
    // exactly the threat we want to deny.
    const matchup = laneMatchup(candidate, teammate);
    if (matchup > 2) denyValue += matchup * 0.5;
  }
  if (ctx.myCounts["hyper-carry"] >= 1 && ctx.myCounts.peel < 2) {
    if (
      meta.archetypes.includes("dive") ||
      meta.archetypes.includes("assassin")
    )
      denyValue += 2;
  }
  if (ctx.myCounts.poke >= 2 && meta.archetypes.includes("engage"))
    denyValue += 1.5;
  if (ctx.myCounts.tank === 0 && meta.archetypes.includes("hyper-carry"))
    denyValue += 1;
  if (denyValue > 0.5) {
    add("Denies enemy counter", Math.min(6, denyValue));
  }

  // Team-level counter-comp.
  if (ctx.oppCounts.poke >= 2 && meta.archetypes.includes("engage"))
    add("Engage vs enemy poke", 3);
  if (
    ctx.oppCounts.dive >= 2 &&
    (meta.archetypes.includes("peel") || meta.archetypes.includes("enchanter"))
  )
    add("Peel vs enemy dive", 3);
  if (ctx.oppCounts.tank >= 2 && meta.archetypes.includes("hyper-carry"))
    add("DPS vs tank wall", 2);
  if (
    ctx.oppCounts["hyper-carry"] >= 1 &&
    ctx.oppCounts.peel < 2 &&
    meta.archetypes.includes("dive")
  )
    add("Dive vs unprotected carry", 3);

  // Flex preference for early picks.
  const flex = flexLaneCount(candidate);
  if (flex >= 2) {
    const earlinessBonus = (4 - ctx.myPicksLocked) * 0.6 * (flex - 1);
    if (earlinessBonus > 0) add("Flex pick (early)", earlinessBonus);
  }

  // Enemy ban signal.
  let banSignal = 0;
  for (const a of meta.archetypes) {
    if (ctx.enemyBannedArchetypes[a] >= 2) banSignal += 0.8;
  }
  if (banSignal > 0) add("Enemy banned archetype", banSignal);

  // Fearless save. Penalizes spending premium S+ picks early in the series.
  // Flex S+ picks are MORE valuable to save (they cover multiple lanes
  // across games), so the penalty is slightly larger for them — fixing
  // the prior bias where only single-lane S+ got penalized.
  if (
    ctx.series &&
    ctx.series.fearless &&
    ctx.series.totalGames - ctx.series.gameIndex - 1 > 0 &&
    tierValue >= TIER_VALUE.S
  ) {
    const remaining = ctx.series.totalGames - ctx.series.gameIndex - 1;
    // Single-lane S+ → -1.0 per game; flex S+ (2+ tiered lanes) → -1.5+.
    const flexMultiplier = 1 + Math.min(2, flex - 1) * 0.25;
    add("Save for later games", -1.0 * remaining * flexMultiplier);
  }

  // Fearless meta-strategy: diversify across games of the series. If our
  // team has used this archetype-shape before in the series, prefer a
  // different identity this game so the enemy can't fearless-prep against
  // a known plan. Counts archetype matches across our prior-game picks.
  // Stronger effect in fearless (where reuse is impossible anyway) but
  // also weakly applies in non-fearless to reduce repetition.
  if (ctx.series && ctx.series.myPriorPicks.size > 0) {
    let archetypeOverlap = 0;
    for (const priorId of ctx.series.myPriorPicks) {
      const priorChamp = ctx.byId.get(priorId);
      if (!priorChamp) continue;
      const priorMeta = metaFor(priorChamp);
      // Count how many archetypes this candidate shares with prior picks.
      let shared = 0;
      for (const a of meta.archetypes) {
        if (priorMeta.archetypes.includes(a)) shared++;
      }
      if (shared >= 2) archetypeOverlap++;
    }
    if (archetypeOverlap >= 2) {
      const penalty = ctx.series.fearless ? -3 : -1.2;
      add("Comp shape repetition", penalty);
    }
  }

  add("Jitter", Math.random() * 1.0);

  return { total, intendedLane: bestLane, breakdown };
}

// ─── Ban scoring ────────────────────────────────────────────────────────────

export interface BanContext {
  byId: Map<number, Champion>;
  myCounts: Record<Archetype, number>;
  oppPicks: (number | null)[];
  isPhase2: boolean;
  enemyAnticipated: ReadonlySet<number>;
}

export function scoreBan(
  candidate: Champion,
  ctx: BanContext,
  explain: boolean = false,
): BanScore {
  const breakdown: ScoreComponent[] | undefined = explain ? [] : undefined;
  let total = 0;
  function add(label: string, value: number) {
    total += value;
    if (breakdown && value !== 0) breakdown.push({ label, value });
  }

  // Meta-tier-based ban scoring is only meaningful when the meta system
  // is on. With meta off, every champion falls to the same tier value
  // (currently "D" via fallback), which adds a uniform constant to every
  // ban score — defeating the toggle. Skip the tier component entirely
  // when meta is disabled; bans then rely on threat / synergy denial /
  // anticipation, which is the user's intent.
  const metaOn = getMetaEnabled();
  let bestTierValue = 0;
  if (metaOn) {
    for (const lane of candidate.lanes) {
      const tier = getMetaTier(candidate.alias, lane) ?? "D";
      const v = TIER_VALUE[tier];
      if (v > bestTierValue) bestTierValue = v;
    }
  }

  const tierMul = ctx.isPhase2 ? 1.4 : 2.5;
  if (bestTierValue > 0) {
    add(`Meta tier × ${tierMul}`, bestTierValue * tierMul);
  }
  add(
    "Flex denial",
    flexLaneCount(candidate) * (ctx.isPhase2 ? 0.6 : 1.4),
  );

  const meta = metaFor(candidate);

  // Threat-to-our-comp.
  const threatMul = ctx.isPhase2 ? 2.5 : 1.0;
  if (ctx.myCounts["hyper-carry"] >= 1 && ctx.myCounts.peel < 2) {
    if (
      meta.archetypes.includes("dive") ||
      meta.archetypes.includes("assassin")
    )
      add("Threat: dive on our carry", 3 * threatMul);
  }
  if (ctx.myCounts.poke >= 2 && meta.archetypes.includes("engage"))
    add("Threat: engage on our poke", 2 * threatMul);
  if (ctx.myCounts.tank === 0 && meta.archetypes.includes("hyper-carry"))
    add("Threat: enemy carry vs no tank", 2 * threatMul);

  // Synergy denial.
  const synWithOpp = synergyWith(candidate, ctx.oppPicks, ctx.byId);
  if (synWithOpp > 0) {
    add("Denies enemy synergy", synWithOpp * (ctx.isPhase2 ? 2.0 : 1.0));
  }

  // Anticipation.
  if (ctx.enemyAnticipated.has(candidate.id)) {
    add("Anticipates enemy pick", ctx.isPhase2 ? 8 : 4);
  }

  add("Jitter", Math.random() * 0.6);

  return { total, breakdown };
}

