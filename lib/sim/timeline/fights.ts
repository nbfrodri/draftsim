// Mid-game fight / playmaking timeline events: power spikes, picks,
// skirmishes, the mid teamfight, shutdowns, vision picks, outplays and
// cross-map objective trades.
//
// Extracted verbatim from generateTimeline (lib/matchSimulator.ts) — the
// bodies, constants and RNG call order are behavior-locked by
// lib/matchSimulator.golden.test.ts.

import type { Champion, Lane, Side } from "../../types";
import type { Archetype, ChampionMeta } from "../../championMeta";
import { getKeyPowerSpike } from "../../championBuilds";
import {
  addAssist,
  addDeath,
  addKill,
  describeObjectiveTrade,
  describeOutplay,
  describePick,
  describePowerSpike,
  describeShutdown,
  describeSkirmish,
  describeStrategicPivot,
  describeTeamfight,
  describeVision,
  jitter,
  killsForSide,
  makeKDA,
  metaFor,
  nameActualFragger,
  pickRandom,
  rollInt,
  singleLaneGold,
  SKIRMISH_CARRY_ARCHETYPES,
  spreadLaneGold,
  TEAMFIGHT_CARRY_ARCHETYPES,
  teamfightKDA,
} from "../descriptions";
import { BALANCE } from "./balance";
import {
  addEvent,
  clampChance,
  picksOf,
  rollEventSide,
  type PivotKind,
  type TimelineContext,
} from "./context";

// ─── Mid-game strategic pivot (opt-in via ctx.adaptiveMidgame) ──────────────
//
// The ~minute-20 coaching checkpoint: right after the mid teamfight resolves,
// if one side is CLEARLY behind (gold + momentum + drake stacks), that side
// abandons its pre-game plan for the remainder. Effects flow through the
// existing strategy-modifier machinery — we mutate tl.mods, which every
// subsequent phase (shutdown, vision, 4th drake, baron, elder, closing)
// reads at call time — plus a visible "PLAN PIVOT" timeline event.
//
// Magnitudes are deliberately modest: the pivot nudges the losing side's
// comeback odds up a few points; it must not flip games on its own.
//
// IMPORTANT (golden lock): when ctx.adaptiveMidgame is falsy this function
// returns before touching state and consumes ZERO rng calls, so default
// simulations stay byte-identical. Even when enabled it consumes no rng —
// the pivot is a deterministic function of the match state.

// How far ahead (blue-positive, in "game leads") one side must be for the
// other to panic-pivot: ~2.5k gold, full momentum, or a mix. drakes add a
// little — being down 0-3 on the soul race reads as "behind" too.
const PIVOT_THRESHOLD = 1;

export function maybeMidgamePivot(tl: TimelineContext, t: number): void {
  if (!tl.ctx.adaptiveMidgame || tl.pivot) return;
  const { state, mods, ctx } = tl;
  // Blue-positive "who is winning" score at the checkpoint.
  const lead =
    state.goldLead / 2500 +
    state.momentum * 0.6 +
    (state.drakes.blue - state.drakes.red) * 0.25;
  if (Math.abs(lead) < PIVOT_THRESHOLD) return; // still a game — hold the plan
  const side: Side = lead > 0 ? "red" : "blue";
  const own = side === "blue" ? ctx.blueStrategy : ctx.redStrategy;
  const opp = side === "blue" ? ctx.redStrategy : ctx.blueStrategy;
  // Bias sign that favors the pivoting (losing) side in blue-positive rolls.
  const sgn = side === "blue" ? 1 : -1;

  let kind: PivotKind;
  if (opp.macro === "siege") {
    // Behind against a grouped poke/siege machine → don't keep losing the
    // 5v5 staring contest; go 1-3-1 and make the map too wide to siege.
    kind = "splitpush";
    // Side-lane pressure: tower threat for the pivoting side and a slightly
    // flatter (more volatile) deciding fight.
    state.towerPressure[side] += 0.4;
    mods.closingRiskFactor = Math.max(0.5, mods.closingRiskFactor * 0.94);
    // The backdoor finish itself is handled in phaseClosingFight, which
    // reads tl.pivot and widens the winner's backdoor window.
  } else if (own.gamePlan === "scaling" || own.tempo === "passive") {
    // The slow plan failed — there is no late game to wait for from 3k
    // behind. Desperation picks + a Baron-or-bust call.
    kind = "all-in";
    mods.baronBias += 0.16 * sgn;
    mods.visionChanceDelta += 0.08;
    mods.visionBias += 0.12 * sgn;
    mods.stealChanceDelta += 0.04;
    mods.closingRiskFactor = Math.max(0.5, mods.closingRiskFactor * 0.9);
  } else {
    // Default pivot: stop trading sides of the map and sell out for the
    // next neutral objectives — drakes, Baron, coinflip smites.
    kind = "objective-rush";
    mods.drakeBias += 0.12 * sgn;
    mods.baronBias += 0.12 * sgn;
    mods.stealChanceDelta += 0.03;
    mods.closingRiskFactor = Math.max(0.5, mods.closingRiskFactor * 0.94);
  }

  tl.pivot = { side, kind };
  // Visible beat in the replay, right after the fight that triggered it.
  // Reuses the macro-flavored "objective-trade" event type (EventType is
  // closed); the small momentum impact is the pivot's morale bump.
  addEvent(
    tl,
    "objective-trade",
    t,
    side,
    describeStrategicPivot(side, ctx.blueName, ctx.redName, kind),
    {},
    0.08,
  );
}

// 9b. Power spikes (13-16). Fire when a carry-archetype champion completes
// their first major item — the "I'm online" moment that explains why the
// next teamfight tips a certain way. We surface up to the TWO most-impactful
// carries per side (a 2-carry comp gets two spike beats), each on its own
// build minute. The momentum each spike carries is what tilts the mid-game
// spike window (see spikeBias); combat resolution also factors items via
// buildStatsAt. Tank/enchanter spikes are skipped (undramatic).
export function phasePowerSpikes(tl: TimelineContext): void {
  for (const spikeSide of ["blue", "red"] as Side[]) {
    const sidePicks = picksOf(tl.ctx, spikeSide);
    // Gather carries in order of typical-LoL impact (hyper-carry first), up to
    // two distinct champions.
    const ARCHETYPE_PRIO: Archetype[] = [
      "hyper-carry",
      "burst",
      "assassin",
      "poke",
      "skirmish",
      "dive",
    ];
    const carries: { champ: Champion; meta: ChampionMeta }[] = [];
    for (const want of ARCHETYPE_PRIO) {
      for (const c of sidePicks) {
        if (!c) continue;
        const m = metaFor(c);
        if (
          m.archetypes.includes(want) &&
          !carries.some((x) => x.champ === c)
        ) {
          carries.push({ champ: c, meta: m });
        }
      }
      if (carries.length >= 2) break;
    }
    // Primary carry spike fires at 72%, the secondary at 45% — not every game
    // shows both.
    carries.slice(0, 2).forEach((chosen, idx) => {
      if (tl.rng() >= (idx === 0 ? 0.72 : 0.45)) return;
      const spikeInfo = getKeyPowerSpike(chosen.meta, chosen.champ.alias);
      if (!spikeInfo.isCarrySpike) return;
      const lo = Math.max(5, spikeInfo.minute - 1);
      const hi = Math.max(lo + 0.5, spikeInfo.minute + 1);
      const t = jitter(lo, hi, tl.rng);
      // Later spikes hit harder. Build minute spans [6, 14]; scale gold +
      // momentum between a 6' spike (flavor) and a 14' spike (real bomb). The
      // secondary carry's spike lands a touch softer.
      const SPIKE_MIN = 6;
      const SPIKE_MAX = 14;
      const t01 = Math.max(
        0,
        Math.min(1, (spikeInfo.minute - SPIKE_MIN) / (SPIKE_MAX - SPIKE_MIN)),
      );
      const weight = idx === 0 ? 1 : 0.7;
      const goldDelta = Math.round((60 + 180 * t01) * weight);
      const momentumImpact = (0.04 + 0.1 * t01) * weight;
      addEvent(
        tl,
        "power-spike",
        t,
        spikeSide,
        describePowerSpike(chosen.champ, spikeInfo.keyItem, tl.rng),
        { laneGoldDelta: spreadLaneGold(goldDelta, spikeSide) },
        momentumImpact,
      );
    });
  }
}

// 11. Mid-game pick or skirmish (15.5-19) — tilts toward whoever has more
// carries online (power-spike window).
export function phaseMidPickOrSkirmish(tl: TimelineContext): void {
  const t = jitter(15.5, 19, tl.rng);
  const side = rollEventSide(tl, t, tl.spikeBias(t));
  const winnerScore = side === "blue" ? tl.ctx.blueScore : tl.ctx.redScore;
  const winnerHasPick = winnerScore.identityLabel === "Pick Comp";
  const wp = picksOf(tl.ctx, side);
  const lp = picksOf(tl.ctx, side === "blue" ? "red" : "blue");
  if (winnerHasPick) {
    // Pick Comp pick: support hooks but the carry (mid/bot) usually finishes
    // damage — kill credit follows damage, support gets the assist. Mirror
    // of real LoL: Thresh hooks → ADC executes. Victim is the OPPOSING
    // mirror lane (our bot kills theirs, our mid picks theirs) — the
    // pre-fix version hardcoded bot, which produced "mid pick → enemy
    // bot dies" mismatches in the replay.
    const pickKda = makeKDA();
    const carryLane: Lane = tl.rng() < 0.55 ? "bottom" : "middle";
    addKill(pickKda, side, carryLane);
    addAssist(pickKda, side, "support");
    addAssist(pickKda, side, "jungle");
    addDeath(pickKda, side === "blue" ? "red" : "blue", carryLane);
    addEvent(
      tl,
      "pick",
      t,
      side,
      describePick(side, wp, lp, tl.rng),
      {
        kills: killsForSide(side, 1, 0),
        laneGoldDelta: spreadLaneGold(180, side),
        kdaDelta: pickKda,
      },
      0.15,
    );
  } else {
    const wk = rollInt(1, 2, tl.rng);
    const lk = rollInt(0, 1, tl.rng);
    // Build desc + kda in their original order/positions (the kda feeds lane
    // gold → combat, so it must NOT be reseeded), then re-point the named
    // carry to the actual top fragger — string-only, no rng/sim change.
    const skirmishDesc = describeSkirmish(side, wp, wk, lk, tl.rng);
    const skirmishKda = teamfightKDA(side, wk, lk, tl.rng);
    addEvent(
      tl,
      "skirmish",
      t,
      side,
      nameActualFragger(skirmishDesc, wp, skirmishKda, side, SKIRMISH_CARRY_ARCHETYPES),
      {
        kills: killsForSide(side, wk, lk),
        // Kill bounty (300g) flows per-lane via kdaDelta. Small spread
        // models the "everyone is up" team gold from the broader fight.
        laneGoldDelta: spreadLaneGold((wk + lk) * 30, side),
        kdaDelta: skirmishKda,
      },
      0.18,
    );
  }
}

// 13. Mid teamfight (19-24)
export function phaseMidTeamfight(tl: TimelineContext): void {
  // Math.max guards the upper bound: at the 22-min duration floor,
  // duration-4=18 would collapse the [19, 24] range below the lower
  // bound and jitter would produce times before minute 19.
  const t = jitter(19, Math.max(20, Math.min(24, tl.duration - 4)), tl.rng);
  const side = rollEventSide(tl, t);
  const wp = picksOf(tl.ctx, side);
  // Scale kill spread by relative fight strength at this game time.
  // Dominant team (e.g. late comp at min 24 vs early comp) converts 3-2
  // fights into 5-1 stomps; balanced fights stay near base.
  const myCap = tl.teamFightFactor(picksOf(tl.ctx, side), t);
  const oppCap = tl.teamFightFactor(
    picksOf(tl.ctx, side === "blue" ? "red" : "blue"),
    t,
  );
  const dom = tl.fightDominance(myCap, oppCap);
  let wk = rollInt(3, 5, tl.rng) + Math.floor(dom * 3);
  let lk = Math.max(0, rollInt(0, 2, tl.rng) - Math.floor(dom * 2));
  // Atakhan effects: Voracious side gets +20% gold from this fight (+1
  // bonus kill in gold terms via inflated laneGoldDelta). Ruinous side
  // burns its one-shot revive when it loses — loserKills -1.
  let goldMult = 1.0;
  if (
    tl.state.atakhanVariant === "Voracious" &&
    tl.state.atakhanSide === side
  ) {
    goldMult = 1.2; // Voracious wins → bonus gold from kills
  }
  const losingSide: Side = side === "blue" ? "red" : "blue";
  if (tl.state.ruinousActive && tl.state.atakhanSide === losingSide && lk > 0) {
    lk -= 1; // Blood Roses revives one — softens the loss
    tl.state.ruinousActive = false;
  }
  const winningScore = side === "blue" ? tl.ctx.blueScore : tl.ctx.redScore;
  // Preserve the exact rng order (describe → tower roll → kda); the kda feeds
  // lane gold → combat, so it can't be reseeded. Re-point the named carry to
  // the actual top fragger afterwards — string-only, no rng/sim change.
  const tfDesc = describeTeamfight(side, wp, winningScore.identityLabel, wk, lk, tl.rng);
  const tfTowers = killsForSide(side, rollInt(1, 2, tl.rng), 0);
  const tfKda = teamfightKDA(side, wk, lk, tl.rng);
  addEvent(
    tl,
    "teamfight",
    t,
    side,
    nameActualFragger(tfDesc, wp, tfKda, side, TEAMFIGHT_CARRY_ARCHETYPES),
    {
      kills: killsForSide(side, wk, lk),
      towers: tfTowers,
      // Kill bounty distributed per lane via kdaDelta. Spread here is
      // the post-fight tower/CS push gold (winner takes mid CS while
      // loser respawns) — not the fight kills themselves.
      laneGoldDelta: spreadLaneGold(wk * 60 * goldMult, side),
      kdaDelta: tfKda,
    },
    0.32 + dom * 0.12,
  );
  // Adaptive mid-game checkpoint (opt-in, no-op + zero rng by default): the
  // losing coach reads the board right after the mid teamfight (~min 19-24)
  // and may pivot the plan for the remainder.
  maybeMidgamePivot(tl, t + 0.4);
}

// 13b. Shutdown (post-teamfight) — fires when a meaningful gold lead has
// accumulated. The trailing team finds and executes the fed enemy carry,
// partially closing the gap. Higher chance the bigger the lead.
export function phaseShutdown(tl: TimelineContext): void {
  const lead = Math.abs(tl.state.goldLead);
  const shutdownChance =
    lead >= BALANCE.SHUTDOWN_BIG_LEAD
      ? BALANCE.SHUTDOWN_BIG_CHANCE
      : lead >= BALANCE.SHUTDOWN_MID_LEAD
      ? BALANCE.SHUTDOWN_MID_CHANCE
      : 0;
  if (tl.rng() < shutdownChance && tl.duration >= 22) {
    // Same Math.max guard — duration <= 25 with the original
    // Math.min would invert the jitter range. Also gate by minimum
    // duration so a 22-min stomp doesn't try to fire a min 21+ event.
    const t = jitter(21, Math.max(22, Math.min(26, tl.duration - 5)), tl.rng);
    // Side that was BEHIND lands the shutdown — bounty flows to underdog.
    const side: Side = tl.state.goldLead > 0 ? "red" : "blue";
    const wp = picksOf(tl.ctx, side);
    const lp = picksOf(tl.ctx, side === "blue" ? "red" : "blue");
    // Shutdown: an assassin/pick lands the play on the fed enemy carry.
    // Best heuristic: kill credit on jungle (frequent shutdown lane), fed
    // carry (mid/bottom on opp) takes the death.
    const sutdownKda = makeKDA();
    const shutdownLane: Lane = tl.rng() < 0.5 ? "jungle" : "middle";
    addKill(sutdownKda, side, shutdownLane);
    addAssist(sutdownKda, side, "support");
    addDeath(
      sutdownKda,
      side === "blue" ? "red" : "blue",
      tl.rng() < 0.5 ? "bottom" : "middle",
    );
    addEvent(
      tl,
      "shutdown",
      t,
      side,
      describeShutdown(side, wp, lp, tl.rng, shutdownLane),
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
export function phaseVisionPick(tl: TimelineContext): void {
  if (
    tl.duration >= 22 &&
    tl.rng() < clampChance(0.28 + tl.mods.visionChanceDelta)
  ) {
    const t = jitter(16, Math.min(22, tl.duration - 5), tl.rng);
    const side = rollEventSide(tl, t, tl.laneBias * 0.3 + tl.mods.visionBias);
    const wp = picksOf(tl.ctx, side);
    const lp = picksOf(tl.ctx, side === "blue" ? "red" : "blue");
    // Vision-pick: support places the ward/sees the catch, team collapses.
    // Carry (mid/bot/jg) lands kill credit; support assists (very few kills
    // for sup is the realistic role profile).
    const visionKda = makeKDA();
    const finisherLane: Lane =
      tl.rng() < 0.4 ? "middle" : tl.rng() < 0.7 ? "jungle" : "bottom";
    addKill(visionKda, side, finisherLane);
    addAssist(visionKda, side, "support");
    if (finisherLane !== "jungle") addAssist(visionKda, side, "jungle");
    // Victim distribution: most vision picks catch a carry out of
    // position (ADC walking back, mid mage stranded), with the support
    // and jungler rounding out the long tail. The earlier version
    // hardcoded support/middle only, so opposing ADCs never showed up
    // in the death column — KDA strips read flat for bot laners.
    const victimRoll = tl.rng();
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
      tl,
      "vision",
      t,
      side,
      describeVision(side, wp, lp, tl.ctx.blueName, tl.ctx.redName, tl.rng, finisherLane),
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
}

// 13d. Outplay (17-26) — 18% chance. A solo player wins outnumbered.
// The kind of moment that flips a game's perception. Pure flavor +
// small gold/momentum; biased toward the side whose comp has a real
// 1v1/1v2 threat (skirmish/assassin/hyper-carry).
export function phaseOutplay(tl: TimelineContext): void {
  if (tl.duration >= 25 && tl.rng() < 0.18) {
    const t = jitter(17, Math.min(26, tl.duration - 4), tl.rng);
    // Outplays favor the side already with a slight edge (lane bias) but
    // CAN happen for the underdog — moments of brilliance work both ways.
    const side = rollEventSide(tl, t, tl.laneBias * 0.2);
    const wp = picksOf(tl.ctx, side);
    const lp = picksOf(tl.ctx, side === "blue" ? "red" : "blue");
    const outnumber = tl.rng() < 0.25 ? 3 : 2;
    const wKills = outnumber >= 3 ? 2 : rollInt(1, 2, tl.rng);
    // Outplay: one star champion takes all the kills. Heuristic: pick a
    // carry-weighted lane (mid/bot/jungle) for the hero.
    const heroLane: Lane =
      tl.rng() < 0.4 ? "middle" : tl.rng() < 0.65 ? "bottom" : "jungle";
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
        pickRandom(
          ["top", "jungle", "middle", "bottom", "support"] as Lane[],
          tl.rng,
        ),
      );
    }
    addEvent(
      tl,
      "outplay",
      t,
      side,
      describeOutplay(side, wp, lp, outnumber, tl.rng, heroLane),
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
}

// 13e. Cross-map objective trade (18-25) — 25% chance. One team gives up
// a contested objective to grab a counter-prize on the opposite side of
// the map (drake-for-tower, herald-for-drake). Net-neutral fight, real
// macro currency. No kills.
export function phaseObjectiveTrade(tl: TimelineContext): void {
  if (tl.duration >= 24 && tl.rng() < 0.25) {
    const t = jitter(18, Math.min(25, tl.duration - 4), tl.rng);
    const side = rollEventSide(tl, t, tl.laneBias * 0.3);
    const otherSide: Side = side === "blue" ? "red" : "blue";
    const giveUp: "drake" | "herald" | "tower" = pickRandom(
      ["drake", "tower"],
      tl.rng,
    );
    const takeFor: "drake" | "herald" | "tower" | "plates" = pickRandom(
      ["tower", "plates"],
      tl.rng,
    );
    // Lane gold flows on BOTH sides — small spread to each. Both teams
    // gained something so we encode the trade as positive lane gold for
    // the "winner" side and offset gold for the other side's named lane.
    const laneGold: Partial<Record<Lane, number>> = {
      ...spreadLaneGold(180, side),
    };
    // Other team got their own gold — represent by negating one lane.
    const otherLane: Lane = pickRandom(
      ["top", "middle", "bottom"] as Lane[],
      tl.rng,
    );
    const sign = otherSide === "blue" ? 1 : -1;
    laneGold[otherLane] = (laneGold[otherLane] ?? 0) + sign * 200;
    addEvent(
      tl,
      "objective-trade",
      t,
      side,
      describeObjectiveTrade(
        side,
        tl.ctx.blueName,
        tl.ctx.redName,
        giveUp,
        takeFor,
      ),
      { laneGoldDelta: laneGold },
      0.05,
    );
  }
}
