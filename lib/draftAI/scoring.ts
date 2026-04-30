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

// ─── Cross-game adaptation tables ──────────────────────────────────────────
// Maps each comp identity → archetypes that counter it. Used by both pick
// and ban scoring to bias choices when the opponent ran a known identity
// in their previous game(s). Sourced from the IDENTITY_PROFILES.weakness
// data: each weakness is decomposed into the archetypes that exploit it.
//
// Picks: a candidate gains a bonus if its archetypes overlap with the
// counter set.
// Bans: a candidate gains a bonus if its archetypes match the ENABLER set
// (the archetypes that DEFINE the identity), since banning those denies
// the opponent's prior game-plan.

const COUNTER_ARCHETYPES_FOR_IDENTITY: Readonly<
  Record<string, ReadonlySet<Archetype>>
> = {
  "Wombo Combo": new Set(["peel", "enchanter", "splitpush"]),
  "Protect The Carry": new Set(["dive", "assassin", "burst", "pick"]),
  "Hyper Engage": new Set(["peel", "sustain", "poke"]),
  "Pick Comp": new Set(["peel", "tank", "sustain"]),
  "Poke / Siege": new Set(["engage", "dive", "assassin"]),
  "Dive Comp": new Set(["peel", "enchanter", "tank"]),
  "Tank Stack": new Set(["hyper-carry", "splitpush", "poke"]),
  "1-3-1 Splitpush": new Set(["wombo", "engage", "pick"]),
  "AP Burst": new Set(["sustain", "tank", "peel"]),
  "Bruiser Brawl": new Set(["peel", "burst", "poke"]),
  "Standard Teamfight": new Set(["splitpush", "pick", "poke"]),
};

// Archetypes that ENABLE each identity. Banning these specifically denies
// the opponent's prior plan. (Not every identity has clean enabler
// archetypes — generic ones omitted.)
const ENABLER_ARCHETYPES_FOR_IDENTITY: Readonly<
  Record<string, ReadonlySet<Archetype>>
> = {
  "Wombo Combo": new Set(["wombo", "engage"]),
  "Pick Comp": new Set(["pick", "burst"]),
  "Hyper Engage": new Set(["engage"]),
  "Dive Comp": new Set(["dive"]),
  "Protect The Carry": new Set(["hyper-carry", "enchanter"]),
  "Poke / Siege": new Set(["poke"]),
  "Tank Stack": new Set(["tank"]),
  "1-3-1 Splitpush": new Set(["splitpush"]),
  "AP Burst": new Set(["burst", "assassin"]),
  "Bruiser Brawl": new Set(["skirmish", "sustain"]),
  "Standard Teamfight": new Set(["engage", "hyper-carry"]),
};

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
    // Hard-counter amplifier: matchups |>=4| get a quadratic boost on top
    // of the linear value, so an extreme matchup is worth dramatically more
    // than a soft one. The threshold and shape mirror counterSeverity.
    const absMatchup = Math.abs(matchup);
    let amplified = matchup;
    if (absMatchup >= 4) {
      // Hard / extreme counter — add a non-linear surcharge proportional to
      // how far past the threshold we are. Cap at +/- 6 extra so a single
      // extreme matchup can't single-handedly decide the pick.
      const overshoot = absMatchup - 4;
      const extra = Math.min(6, 2 + overshoot * 1.2);
      amplified += matchup > 0 ? extra : -extra;
    }
    const value = amplified * matchupMul;
    if (value !== 0) {
      const severity = absMatchup >= 4 ? "Hard " : "";
      add(
        value > 0
          ? `${severity}Counter-picks ${oppInLane.name}`
          : `${severity}Bad matchup vs ${oppInLane.name}`,
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
    // Hard counter (matchup >= 4) gets a stronger deny weight — taking it
    // off the table denies the opponent a guaranteed lane win.
    if (matchup >= 4) denyValue += matchup * 0.85;
    else if (matchup > 2) denyValue += matchup * 0.5;
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

  // ─── Side-aware drafting strategy ─────────────────────────────────────
  // Real pro/high-elo conventions tied to the snake draft order:
  //
  //   Blue (B1/B2-3/B4-5) picks first overall and is exposed to every
  //   subsequent red counter-pick. Blue's first pick especially has 4
  //   red picks coming after it. Strategy:
  //     • FLEX picks (multi-lane viable) so red can't kill us with one
  //       counter — they don't even know which lane we're slotting into.
  //     • PREMIUM meta-tier (S+) so the lane matchup loss is small even
  //       when red lands a counter.
  //     • Comp-defining picks early so we lock our identity before red
  //       can reactively shape against it.
  //
  //   Red (R1-2/R3-4/R5) picks LAST overall, with full information on
  //   every blue commit. Red's positional advantage IS counter-picking.
  //     • Hard counters to specific blue picks already on the board.
  //     • Lane matchup edge (already in scoring; amplified for red's
  //       last pick which is the absolute closer).
  //     • Comp-shape adjustments — react to blue's identity.
  //
  // Easy difficulty skips this — beginners don't think positionally.
  if (ctx.series?.difficulty !== "easy") {
    if (ctx.side === "blue") {
      // B1: the most exposed pick. Reward genuinely flex (3+ lanes) hard,
      // semi-flex (2 lanes) gently. Blue absolutely should not first-pick
      // a single-lane situational champion.
      if (ctx.myPicksLocked === 0) {
        if (flex >= 3) {
          add("Flex first pick (counter-resistant)", 2.5);
        } else if (flex >= 2) {
          add("Semi-flex first pick", 1.2);
        } else if (flex === 1) {
          // Single-lane B1 is still picked sometimes, but only on premium
          // tier — penalize otherwise.
          if (tierValue < TIER_VALUE.S) {
            add("Single-lane B1 (counter-bait)", -2);
          }
        }
        // Premium-tier B1 — even if it gets countered, it's still strong
        // enough that the matchup is survivable.
        if (tierValue >= TIER_VALUE["S+"]) {
          add("Power first pick", 1.5);
        }
      }
      // B2/B3 (positions 1-2 in myPicksLocked) — blue's "double pick"
      // window after seeing R1. Less exposed than B1 but still 3 red
      // picks remaining. Mild flex preference still helps.
      if (ctx.myPicksLocked === 1 || ctx.myPicksLocked === 2) {
        if (flex >= 2 && tierValue >= TIER_VALUE.A) {
          add("Flex blue mid-phase", 0.8);
        }
      }
    } else {
      // ─── Red side: counter-pick advantage ───────────────────────────
      // Boost picks that hard-counter ANY drafted blue laner. This builds
      // on the existing per-lane matchup logic but makes red's positional
      // advantage explicit: every red pick gets a counter-awareness lens.
      let redCounterBonus = 0;
      for (const id of ctx.oppPicks) {
        if (id == null) continue;
        const opp = ctx.byId.get(id);
        if (!opp) continue;
        // laneMatchup returns positive when "candidate" beats "opp" — that's
        // the counter-pick signal. We don't restrict to same-lane here:
        // red gets to choose where to deploy the counter (within its
        // candidate's playable lanes).
        const matchup = laneMatchup(candidate, opp);
        if (matchup > 1.5) redCounterBonus += matchup * 0.4;
      }
      if (redCounterBonus > 0.5) {
        // Red's LATER picks weigh counters more heavily — by R5 they have
        // full info and the pick is the final word in the draft.
        const phaseScale = 1 + ctx.myPicksLocked * 0.3;
        add(
          "Red counter advantage",
          Math.min(5, redCounterBonus * phaseScale),
        );
      }
      // Red's R5 (last pick, myPicksLocked === 4) gets a small extra
      // amplifier on lane-specific matchup since they're picking with
      // full info on the enemy lane occupant. Hard-counter avoidance is
      // ESPECIALLY strict on R5 — there's no later pick to compensate.
      if (ctx.myPicksLocked === 4 && oppInLane) {
        const finalMatchup = laneMatchup(candidate, oppInLane);
        if (finalMatchup > 0) {
          add("Last-pick lane closer", finalMatchup * 0.6);
        } else if (finalMatchup <= -4) {
          // Extreme counter — penalty quadratic-ish to make R5 essentially
          // refuse to pick into it. The candidate would need MASSIVE bonus
          // elsewhere to overcome this.
          add(
            "Last-pick into HARD counter (avoid)",
            finalMatchup * 2.5,
          );
        } else if (finalMatchup < -1) {
          add("Last-pick into counter", finalMatchup * 1.0);
        }
      }
    }
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
  // SKIPPED on elimination/closeout games: there is no "later game" to save
  // for if losing ends the series (or winning ends it). Spend everything.
  if (
    ctx.series &&
    ctx.series.fearless &&
    ctx.series.totalGames - ctx.series.gameIndex - 1 > 0 &&
    !ctx.series.eliminationGame &&
    !ctx.series.closeoutGame &&
    tierValue >= TIER_VALUE.S
  ) {
    const remaining = ctx.series.totalGames - ctx.series.gameIndex - 1;
    // Single-lane S+ → -1.0 per game; flex S+ (2+ tiered lanes) → -1.5+.
    const flexMultiplier = 1 + Math.min(2, flex - 1) * 0.25;
    add("Save for later games", -1.0 * remaining * flexMultiplier);
  }

  // ─── Cross-game opponent adaptation ────────────────────────────────────
  // If the opponent ran a recognizable identity in their previous game,
  // bias toward picks that counter that identity. Real-LoL pattern: after
  // losing to a Wombo Combo, drafters prep peel/disengage; after losing to
  // Pick Comp, they prep frontline + hard-to-catch carries. The boost
  // weakens as more games go by (most-recent identity matters most), and
  // is gated to fearless or behind-in-series scenarios where adaptation is
  // most strategic. Easy AI ignores this — beginners don't strategize
  // across games.
  if (
    ctx.series &&
    ctx.series.difficulty !== "easy" &&
    ctx.series.oppPriorIdentities.length > 0
  ) {
    const lastIdentity = ctx.series.oppPriorIdentities[0];
    if (lastIdentity) {
      const counterArchs = COUNTER_ARCHETYPES_FOR_IDENTITY[lastIdentity];
      if (counterArchs) {
        let counterValue = 0;
        for (const a of meta.archetypes) {
          if (counterArchs.has(a)) counterValue += 1.5;
        }
        // Cap to avoid this dominating; +3 is meaningful but not
        // overriding lane fit / synergy.
        if (counterValue > 0) {
          add(
            `Counters last game's ${lastIdentity}`,
            Math.min(3, counterValue),
          );
        }
      }
    }
    // Also scan the aggregated archetype profile across ALL prior games:
    // if the opponent has stacked engage 4+ times across 2 games, the AI
    // should know they're a teamfight team and lean further into anti-
    // engage. Fires on heavy concentration only.
    const profile = ctx.series.oppPriorArchetypeProfile;
    if (profile.engage >= 3 && meta.archetypes.includes("peel")) {
      add("Anti-engage prep (opp pattern)", 1);
    }
    if (profile.dive >= 2 && meta.archetypes.includes("peel")) {
      add("Anti-dive prep (opp pattern)", 1);
    }
    if (profile["hyper-carry"] >= 2 && meta.archetypes.includes("dive")) {
      add("Anti-carry dive (opp pattern)", 1);
    }
  }

  // ─── Tournament champion WR shift ─────────────────────────────────────
  // When the active series is a tournament match, blend in observed per-
  // champion win rate so the AI mirrors how the in-tournament meta is
  // actually playing out. Uses Bayesian shrinkage with a 50% prior so a
  // 1-game sample doesn't cause wild swings — only champions with a few
  // games of evidence move meaningfully. Capped at ±2 score points so
  // tier-fit and matchup data still dominate.
  // Easy difficulty ignores this — beginner AI doesn't track meta shifts.
  if (
    ctx.series?.tournamentChampionWR &&
    ctx.series.difficulty !== "easy"
  ) {
    const entry = ctx.series.tournamentChampionWR.get(candidate.id);
    if (entry && entry.games > 0) {
      const PRIOR_GAMES = 3;
      const PRIOR_WR = 0.5;
      const shrunkWR =
        (entry.wins + PRIOR_WR * PRIOR_GAMES) /
        (entry.games + PRIOR_GAMES);
      // Centered on 0; positive = winning more than expected.
      const delta = shrunkWR - 0.5;
      const bonus = Math.max(-2, Math.min(2, delta * 8));
      if (Math.abs(bonus) >= 0.15) {
        const label =
          bonus > 0
            ? `Tournament hot streak (${entry.wins}-${entry.games - entry.wins})`
            : `Tournament cold streak (${entry.wins}-${entry.games - entry.wins})`;
        add(label, bonus);
      }
    }
  }

  // ─── Series score awareness ────────────────────────────────────────────
  // When the AI's team is behind in the series, lean on meta-tier picks
  // (S+/S) to maximize per-game win probability. Risky off-meta picks
  // (pocket B/C) get pushed down. When elimination is on the line the
  // effect is amplified — there is no later game to compensate for a loss.
  // Closeout games (we win the series with this game) get a milder version
  // of the same: tighten up, don't gamble.
  // Easy difficulty deliberately ignores this — beginners don't make
  // strategic series-level adjustments, and easy mode is supposed to be
  // beatable.
  if (ctx.series && ctx.series.difficulty !== "easy") {
    const behind = ctx.series.winsBehind < 0;
    const elim = ctx.series.eliminationGame;
    const closeout = ctx.series.closeoutGame;
    if (behind || elim || closeout) {
      // Magnitude scales with situation severity:
      //   • Just behind (0-1 in BO3, 0-1 / 0-2 / 1-2 in BO5): mild boost.
      //   • Elimination game (1-2 in BO3, 2-2 in BO5, etc.): strong boost.
      //   • Closeout game: small boost (don't get cute, close it out).
      let metaWeight = 0;
      if (behind) metaWeight += 0.6;
      if (elim) metaWeight += 1.4;
      else if (closeout) metaWeight += 0.5;

      // Boost premium tiers; penalize off-meta gambles.
      if (tierValue >= TIER_VALUE.S) {
        const bonus = (tierValue - TIER_VALUE.A) * metaWeight;
        const label = elim
          ? "Elimination game: meta priority"
          : behind
          ? "Behind in series: meta priority"
          : "Closeout: lock in meta";
        add(label, bonus);
      } else if (tierValue <= TIER_VALUE.C) {
        // Off-meta picks are an explicit gamble when stakes are high.
        const penalty = -1.5 * metaWeight;
        add("Avoid off-meta gamble", penalty);
      }

      // In an elimination game, also discourage repeating the same comp
      // shape from earlier games — the opponent has already shown they
      // can beat it. Stacks ON TOP of the existing repetition penalty.
      if (elim && ctx.series.myPriorPicks.size > 0) {
        let priorTierMatch = 0;
        for (const priorId of ctx.series.myPriorPicks) {
          const priorChamp = ctx.byId.get(priorId);
          if (!priorChamp) continue;
          const priorMeta = metaFor(priorChamp);
          let shared = 0;
          for (const a of meta.archetypes) {
            if (priorMeta.archetypes.includes(a)) shared++;
          }
          if (shared >= 2) priorTierMatch++;
        }
        if (priorTierMatch >= 2) {
          add("Don't replay losing comp", -2);
        }
      }
    }
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
  // Optional series context — allows bans to factor in cross-game
  // opponent adaptation (banning enablers of identities they ran before).
  series?: SeriesAIContext;
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

  // ─── Cross-game ban prep ──────────────────────────────────────────────
  // If the opponent ran a known identity in their last game, banning
  // enabler archetypes specifically denies the replay of that plan. Real
  // pro tactic: after losing to TF on Wombo, ban TF/Yasuo entry next game.
  // Easy AI skips this — beginners don't ban-prep across games.
  if (
    ctx.series &&
    ctx.series.difficulty !== "easy" &&
    ctx.series.oppPriorIdentities.length > 0
  ) {
    const lastIdentity = ctx.series.oppPriorIdentities[0];
    if (lastIdentity) {
      const enablers = ENABLER_ARCHETYPES_FOR_IDENTITY[lastIdentity];
      if (enablers) {
        let prepValue = 0;
        for (const a of meta.archetypes) {
          if (enablers.has(a)) prepValue += 1.4;
        }
        if (prepValue > 0) {
          // Phase-2 weight is higher: targeted-prep bans land later in the
          // ban phase when more info is on the board.
          add(
            `Bans ${lastIdentity} enabler`,
            Math.min(4, prepValue) * (ctx.isPhase2 ? 1.4 : 1.0),
          );
        }
      }
    }
    // Repeat-target detection: if the SAME champion was picked by the opp
    // multiple times in this series (non-fearless allows it), ban them
    // outright — they're clearly comfortable on it.
    if (
      !ctx.series.fearless &&
      ctx.series.oppPriorPicks.has(candidate.id)
    ) {
      add("Opp pocket pick", ctx.isPhase2 ? 2.5 : 1.5);
    }
  }

  add("Jitter", Math.random() * 0.6);

  return { total, breakdown };
}

