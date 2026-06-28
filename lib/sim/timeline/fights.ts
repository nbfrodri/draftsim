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
  POSITIONAL_LANES,
  addAssist,
  addDeath,
  addKill,
  championSignature,
  describeBackdoor,
  describeBackdoorCaught,
  describeComebackStand,
  describeCounterJungle,
  describeDisengage,
  describeObjectiveTrade,
  describeOutplay,
  describePick,
  describePokeSiege,
  describePowerSpike,
  describeShutdown,
  describeSkirmish,
  describeStrategicPivot,
  describeTeamfight,
  describeTeleportFlank,
  describeThrow,
  describeTowerDive,
  describeVision,
  signatureEngage,
  jitter,
  killsForSide,
  laneKillKDA,
  makeKDA,
  metaFor,
  nameActualFragger,
  pentakiller,
  pentakillKDA,
  pickRandom,
  rollInt,
  shutdownVictimLane,
  singleLaneGold,
  SKIRMISH_CARRY_ARCHETYPES,
  spreadLaneGold,
  TEAMFIGHT_CARRY_ARCHETYPES,
  teamfightKDA,
} from "../descriptions";
import { BALANCE } from "./balance";
import {
  addEvent,
  bumpLaneLead,
  clampChance,
  comebackBias,
  cooldownEdgeBias,
  formEdge,
  formWeightedLane,
  macroEventBias,
  mapControlBias,
  mapControlChance,
  netObjectiveFightEdge,
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
    // shows both. Spike TIME is deterministic (the carry's build minute), so we
    // can schedule it up front; the chance + gold/momentum resolve in time
    // order. (Time can't depend on dynamic state in the scheduler, so the old
    // "gold → earlier spike" link is recast below as "gold → bigger spike".)
    carries.slice(0, 2).forEach((chosen, idx) => {
      const spikeInfo = getKeyPowerSpike(chosen.meta, chosen.champ.alias);
      if (!spikeInfo.isCarrySpike) return;
      const lo = Math.max(5, spikeInfo.minute - 1);
      const hi = Math.max(lo + 0.5, spikeInfo.minute + 1);
      const t = jitter(lo, hi, tl.rng);
      tl.schedule(t, () => {
        if (tl.rng() >= (idx === 0 ? 0.72 : 0.45)) return;
        // Later spikes hit harder. Build minute spans [6, 14]; scale gold +
        // momentum between a 6' spike (flavor) and a 14' spike (real bomb).
        const SPIKE_MIN = 6;
        const SPIKE_MAX = 14;
        const t01 = Math.max(
          0,
          Math.min(1, (spikeInfo.minute - SPIKE_MIN) / (SPIKE_MAX - SPIKE_MIN)),
        );
        const weight = idx === 0 ? 1 : 0.7;
        // Gold lead → BIGGER spike (a fed carry's core item swings harder).
        // Reinterprets the old earlier-timing link as extra impact, read at
        // resolve so it reflects the live gold lead at the spike's minute.
        const sideLead =
          spikeSide === "blue" ? tl.state.goldLead : -tl.state.goldLead;
        const leadBoost =
          sideLead > 0
            ? 1 + Math.min(0.3, (sideLead / BALANCE.SPIKE_LEAD_NORM) * 0.3)
            : 1;
        const goldDelta = Math.round((60 + 180 * t01) * weight * leadBoost);
        const momentumImpact = (0.04 + 0.1 * t01) * weight * leadBoost;
        addEvent(
          tl,
          "power-spike",
          t,
          spikeSide,
          describePowerSpike(chosen.champ, spikeInfo.keyItem, tl.rng),
          { laneGoldDelta: spreadLaneGold(goldDelta, spikeSide) },
          momentumImpact,
        );
        // #4: the primary carry coming online opens a short window to make a
        // play — looks for a pick/objective (reuses pickAdvantage).
        if (idx === 0) {
          tl.state.pickAdvantage = {
            side: spikeSide,
            expiresAt: t + BALANCE.PICK_ADVANTAGE_WINDOW,
          };
        }
      });
    });
  }
}

// 11. Mid-game pick or skirmish (15.5-19) — tilts toward whoever has more
// carries online (power-spike window).
export function phaseMidPickOrSkirmish(tl: TimelineContext): void {
  const t = jitter(15.5, 19, tl.rng);
  tl.schedule(t, () => {
  // Whoever spiked first, has the open map (towers down), AND drafted a pick
  // comp lands the play — but the trailing team still scraps for it (comeback).
  const side = rollEventSide(
    tl,
    t,
    tl.spikeBias(t) +
      mapControlBias(tl) +
      macroEventBias(tl, "pick") +
      comebackBias(tl, t),
  );
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
    // A hook champion on the picking side flavors the catch with its signature
    // ("Thresh lands the hook …"); consume describePick's rng either way.
    const basePick = describePick(side, wp, lp, tl.rng);
    const hooker = wp.find(
      (c) =>
        c != null &&
        ["Thresh", "Blitzcrank", "Pyke", "Nautilus"].includes(c.alias),
    );
    const pickDesc =
      ((hooker ? championSignature(hooker) : null) ?? basePick) +
      " (Flash down)";
    addEvent(
      tl,
      "pick",
      t,
      side,
      pickDesc,
      {
        kills: killsForSide(side, 1, 0),
        laneGoldDelta: spreadLaneGold(180, side),
        kdaDelta: pickKda,
      },
      0.15,
    );
    // Caught one out → man advantage for the next objective (see
    // pickAdvantageBias in the drake/baron rolls).
    tl.state.pickAdvantage = {
      side,
      expiresAt: t + BALANCE.PICK_ADVANTAGE_WINDOW,
    };
    // The caught player Flashed and died — their summoners/ult are down, so the
    // next teamfight or objective tips to the catching side (cooldownEdgeBias).
    tl.state.cooldownEdge = {
      side,
      expiresAt: t + BALANCE.COOLDOWN_EDGE_WINDOW,
    };
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
        // models the "everyone is up" team gold from the broader fight —
        // winner-only: the loser's `lk` kills are the loser's gold, not the
        // winner's, so they must not inflate the winner side's lane strip.
        laneGoldDelta: spreadLaneGold(wk * 30, side),
        kdaDelta: skirmishKda,
      },
      0.18,
    );
    // A won skirmish also leaves the enemy down a body for the next objective.
    if (wk > lk) {
      tl.state.pickAdvantage = {
        side,
        expiresAt: t + BALANCE.PICK_ADVANTAGE_WINDOW,
      };
    }
  }
  });
}

// 13. Mid teamfight (19-24)
export function phaseMidTeamfight(tl: TimelineContext): void {
  // Math.max guards the upper bound: at the 22-min duration floor,
  // duration-4=18 would collapse the [19, 24] range below the lower
  // bound and jitter would produce times before minute 19.
  const t = jitter(19, Math.max(20, Math.min(24, tl.duration - 4)), tl.rng);
  tl.schedule(t, () => {
  // A grouping ("group" macro) comp forces and tends to win the 5v5; map
  // control (towers down) helps set it up on the favored side. A splitpush comp
  // is down a body in the 5v5 → its teamfight is harder (negative feedback,
  // symmetric so it cancels in a split-vs-split mirror).
  const splitDamp =
    (tl.ctx.blueStrategy.macro === "splitpush"
      ? -BALANCE.SPLITPUSH_TEAMFIGHT_DAMP
      : 0) +
    (tl.ctx.redStrategy.macro === "splitpush"
      ? BALANCE.SPLITPUSH_TEAMFIGHT_DAMP
      : 0);
  const side = rollEventSide(
    tl,
    t,
    macroEventBias(tl, "teamfight") +
      mapControlBias(tl) +
      splitDamp +
      cooldownEdgeBias(tl, t), // a side fighting with Flash/ult up tips the 5v5
    false, // the mid teamfight is game-deciding — macro-pure, no anti-streak
  );
  const wp = picksOf(tl.ctx, side);
  // Scale kill spread by relative fight strength at this game time, using the
  // SAME rich combat model the closing fight uses (per-champion stats, items
  // from the gold lead, EHP, comp identity, CC) — so a fed/stronger comp
  // stomps the mid fight too, not just by phase-counting. A dominant team
  // converts 3-2 fights into 5-1 stomps; balanced fights stay near base.
  const ratioBlue = tl.combatRatioBlue(
    picksOf(tl.ctx, "blue"),
    picksOf(tl.ctx, "red"),
    t,
    tl.state.goldLead,
  );
  const myRatio = side === "blue" ? ratioBlue : 1 / ratioBlue;
  // Objective → fight strength: a live Soul/Baron/Elder holder wins the fight
  // more decisively, not just more often (clamped back into 0..0.6).
  const dom = Math.max(
    0,
    Math.min(
      0.6,
      tl.fightDominance(myRatio, 1) + netObjectiveFightEdge(tl, side, t),
    ),
  );
  let wk = rollInt(3, 5, tl.rng) + Math.floor(dom * 3);
  let lk = Math.max(0, rollInt(0, 2, tl.rng) - Math.floor(dom * 2));
  // Atakhan effects: Voracious side banks +20% on the value of THIS fight's
  // kills (each kill is 300g via kdaDelta). The bonus is added explicitly
  // below — the old code multiplied the trivial CS-push spread instead, so
  // the objective barely paid out. Ruinous side burns its one-shot revive
  // when it loses — loserKills -1.
  const voraciousBonus =
    tl.state.atakhanVariant === "Voracious" && tl.state.atakhanSide === side
      ? Math.round(wk * BALANCE.KILL_GOLD * BALANCE.VORACIOUS_KILL_BONUS)
      : 0;
  const losingSide: Side = side === "blue" ? "red" : "blue";
  if (tl.state.ruinousActive && tl.state.atakhanSide === losingSide && lk > 0) {
    lk -= 1; // Blood Roses revives one — softens the loss
    tl.state.ruinousActive = false;
  }
  const winningScore = side === "blue" ? tl.ctx.blueScore : tl.ctx.redScore;
  // CC chain → wombo wins harder: a high-lockdown engage comp that lands its
  // combo converts the won 5v5 into a bigger stomp (one extra kill in the
  // spread). The CC IS the win condition for these comps.
  const WOMBO_LABELS = ["Wombo Combo", "Hyper Engage", "Heavy CC Lockdown"];
  if (wk > lk && WOMBO_LABELS.includes(winningScore.identityLabel ?? "")) {
    wk += BALANCE.WOMBO_KILL_BONUS;
  }
  // Surface the objective edge in the feed: a live Baron/Elder/Soul holder
  // winning the fight reads as "why" (the buffs the dom math already factored).
  const objTag =
    tl.state.elderSide === side
      ? "Elder-empowered — "
      : tl.state.baronSide === side &&
        tl.state.baronExpiresAt != null &&
        t <= tl.state.baronExpiresAt
      ? "Baron buff — "
      : tl.state.soulSide === side
      ? "Soul edge — "
      : "";
  // Preserve the exact rng order (describe → tower roll → kda); the kda feeds
  // lane gold → combat, so it can't be reseeded. Re-point the named carry to
  // the actual top fragger afterwards — string-only, no rng/sim change.
  const tfDesc = describeTeamfight(side, wp, winningScore.identityLabel, wk, lk, tl.rng);
  const tfTowers = killsForSide(side, rollInt(1, 2, tl.rng), 0);
  const tfKda = teamfightKDA(side, wk, lk, tl.rng);
  // Flair + real PENTAKILL: a clean 5-0 has a small chance of being a single
  // carry solo-acing (rare, attributed); otherwise it's a spread ACE/RAMPAGE.
  const flairRoll = tl.rng();
  const isAce = wk >= 5 && lk === 0;
  // Any role can solo-ace (weighted toward carries) — not just the ADC.
  const penta =
    isAce && flairRoll < BALANCE.PENTAKILL_CHANCE
      ? pentakiller(
          wp,
          tl.rng,
          side === "blue" ? tl.ctx.blueForms : tl.ctx.redForms,
        )
      : null;
  // A pentakill forces a clean 5-0 so the kda reconciles with the kill count.
  const fightKills = penta
    ? killsForSide(side, 5, 0)
    : killsForSide(side, wk, lk);
  const fightKda = penta ? pentakillKDA(side, penta.lane) : tfKda;
  // A signature engager (Malphite/Amumu/Orianna/…) on the winning side flavors
  // the won fight with its iconic wombo, ~40% of the time (gated on the existing
  // flairRoll — no extra rng). Otherwise the normal fragger line.
  const engage = penta ? null : signatureEngage(wp);
  const fightDesc = penta
    ? `PENTAKILL!! ${penta.champ.name} solo-aces the enemy team`
    : engage && flairRoll > 0.6
    ? objTag + engage
    : objTag +
      (isAce && flairRoll < 0.5
        ? "ACE! "
        : wk - lk >= BALANCE.ACE_KILL_MARGIN && flairRoll < 0.3
        ? "RAMPAGE! "
        : "") +
      nameActualFragger(tfDesc, wp, tfKda, side, TEAMFIGHT_CARRY_ARCHETYPES);
  addEvent(
    tl,
    "teamfight",
    t,
    side,
    fightDesc,
    {
      kills: fightKills,
      towers: tfTowers,
      // Post-fight push gold — plus any Voracious bonus. Win-condition funnel
      // (#10): a hyper-carry comp pumps it into its ADC instead of spreading.
      laneGoldDelta: wp.some(
        (c) => c != null && metaFor(c).archetypes.includes("hyper-carry"),
      )
        ? singleLaneGold(
            "bottom",
            wk * BALANCE.MIDFIGHT_KILL_PUSH_GOLD + voraciousBonus,
            side,
          )
        : spreadLaneGold(
            wk * BALANCE.MIDFIGHT_KILL_PUSH_GOLD + voraciousBonus,
            side,
          ),
      kdaDelta: fightKda,
      pentakill: penta
        ? { lane: penta.lane, championName: penta.champ.name }
        : undefined,
    },
    0.32 + dom * 0.12,
  );
  // Won the 5v5 → enemies are dead → the winner gets a free run at the next
  // neutral objective (Baron/Soul). #5: a near-ACE buys a LONGER window — the
  // classic "we aced, Baron is free" sequence.
  const aceLevel = wk - lk >= BALANCE.ACE_KILL_MARGIN;
  tl.state.pickAdvantage = {
    side,
    expiresAt:
      t + BALANCE.PICK_ADVANTAGE_WINDOW * (aceLevel ? BALANCE.ACE_PICKADV_MULT : 1),
  };
  // Adaptive mid-game checkpoint (opt-in, no-op + zero rng by default): the
  // losing coach reads the board right after the mid teamfight (~min 19-24)
  // and may pivot the plan for the remainder.
  maybeMidgamePivot(tl, t + 0.4);
  });
}

// 13b. Shutdown (post-teamfight) — fires when a meaningful gold lead has
// accumulated. The trailing team finds and executes the fed enemy carry,
// partially closing the gap. Higher chance the bigger the lead.
export function phaseShutdown(tl: TimelineContext): void {
  if (tl.duration < 22) return;
  // Same Math.max guard — duration <= 25 with the original Math.min would
  // invert the jitter range.
  const t = jitter(21, Math.max(22, Math.min(26, tl.duration - 5)), tl.rng);
  tl.schedule(t, () => {
    // Chance reads the gold lead AS OF THIS MINUTE (time-ordered), so the
    // shutdown fires off the real lead at minute t, not a code-position guess.
    const lead = Math.abs(tl.state.goldLead);
    const shutdownChance =
      lead >= BALANCE.SHUTDOWN_BIG_LEAD
        ? BALANCE.SHUTDOWN_BIG_CHANCE
        : lead >= BALANCE.SHUTDOWN_MID_LEAD
        ? BALANCE.SHUTDOWN_MID_CHANCE
        : 0;
    if (tl.rng() >= shutdownChance) return;
    // Side that was BEHIND lands the shutdown — bounty flows to underdog.
    const side: Side = tl.state.goldLead > 0 ? "red" : "blue";
    const oppSide: Side = side === "blue" ? "red" : "blue";
    const wp = picksOf(tl.ctx, side);
    const lp = picksOf(tl.ctx, oppSide);
    // Shutdown: an assassin/pick lands the play (jungle or mid roam) on the
    // fed enemy carry. KDA must match the event line, so:
    //   • the kill + bounty gold go to the lane that got the shutdown
    //   • the death lands on the SAME fed carry the description names
    const sutdownKda = makeKDA();
    const shutdownLane: Lane = tl.rng() < 0.5 ? "jungle" : "middle";
    // The bounty is the actual gold awarded (this sim's economy is compressed
    // — a kill is 300g), routed to the killer's lane below. Keeping the
    // displayed number equal to the awarded gold is the whole point of the
    // fix; inflating it to 1000-1500 (old flavor text) both lied to the
    // scoreboard and over-fed the comeback carry-gold bonus.
    const bounty = pickRandom([400, 500, 600], tl.rng);
    const victimLane: Lane =
      shutdownVictimLane(lp) ?? (tl.rng() < 0.5 ? "bottom" : "middle");
    addKill(sutdownKda, side, shutdownLane);
    addAssist(sutdownKda, side, "support");
    addDeath(sutdownKda, oppSide, victimLane);
    addEvent(
      tl,
      "shutdown",
      t,
      side,
      describeShutdown(side, wp, lp, bounty, shutdownLane),
      {
        kills: killsForSide(side, 1, 0),
        // The shutdown bounty is the killer's gold — it goes to the lane that
        // landed the play (the kill's 300g bounty flows separately via
        // kdaDelta), so the scoreboard matches "X collects {bounty}g".
        laneGoldDelta: singleLaneGold(shutdownLane, bounty, side),
        kdaDelta: sutdownKda,
      },
      0.28,
    );
  });
}

// 13c. Vision-based pick (16-22) — 28% chance. Control ward in a key
// bush leads to catching out a stray enemy. Pure positional play; no
// teamfight, just one decisive moment. Biased by lane prio (a team
// with prio can place vision deeper).
export function phaseVisionPick(tl: TimelineContext): void {
  if (tl.duration < 22) return;
  const t = jitter(16, Math.min(22, tl.duration - 5), tl.rng);
  tl.schedule(t, () => {
    // Chance reads the live map control at this minute (towers down → more
    // vision), so the catch fires off the real map state, not a code-order one.
    if (
      tl.rng() >=
      clampChance(0.28 + tl.mods.visionChanceDelta + mapControlChance(tl))
    )
      return;
    // Open map (towers down) means deeper wards and easier catches; a pick
    // comp manufactures these catches more often.
    const side = rollEventSide(
      tl,
      t,
      tl.laneBias * 0.3 +
        tl.mods.visionBias +
        // Vision is THE map-control play, so map control counts extra here: the
        // team that owns the map both catches more and is harder to catch (#6).
        mapControlBias(tl) * 1.3 +
        macroEventBias(tl, "pick") +
        comebackBias(tl, t),
    );
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
    // Vision catch leaves the enemy a man down — tilt the next objective.
    tl.state.pickAdvantage = {
      side,
      expiresAt: t + BALANCE.PICK_ADVANTAGE_WINDOW,
    };
  });
}

// 13d. Outplay (17-26) — 18% chance. A solo player wins outnumbered.
// The kind of moment that flips a game's perception. Pure flavor +
// small gold/momentum; biased toward the side whose comp has a real
// 1v1/1v2 threat (skirmish/assassin/hyper-carry).
export function phaseOutplay(tl: TimelineContext): void {
  if (tl.duration < 25) return;
  const t = jitter(17, Math.min(26, tl.duration - 4), tl.rng);
  tl.schedule(t, () => {
    if (tl.rng() >= 0.18) return;
    // Outplays favor the side already with a slight edge (lane bias) but
    // CAN happen for the underdog — moments of brilliance work both ways, and
    // the trailing team is hunting for exactly this kind of swing (comeback).
    // Player form tilts it too: a hot-streak carry pops off more often.
    const side = rollEventSide(
      tl,
      t,
      tl.laneBias * 0.2 + comebackBias(tl, t) + formEdge(tl),
    );
    const wp = picksOf(tl.ctx, side);
    const lp = picksOf(tl.ctx, side === "blue" ? "red" : "blue");
    const outnumber = tl.rng() < 0.25 ? 3 : 2;
    const wKills = outnumber >= 3 ? 2 : rollInt(1, 2, tl.rng);
    // Outplay: one star champion takes all the kills — a carry-weighted lane
    // (mid/bot/jungle), pulled toward the acting side's HOTTEST carry by form.
    const heroLane = formWeightedLane(
      ["middle", "bottom", "jungle"],
      [0.4, 0.39, 0.21],
      side === "blue" ? tl.ctx.blueForms : tl.ctx.redForms,
      tl.rng,
    );
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
    // Always consume describeOutplay's rng (keeps the stream stable), then let
    // a signature champion in the hero lane override the line with its iconic
    // play ("Akali vanishes in the shroud …") for a recognizable highlight.
    const baseOutplay = describeOutplay(side, wp, lp, outnumber, tl.rng, heroLane);
    const heroChamp = wp[POSITIONAL_LANES.indexOf(heroLane)];
    const outplayDesc =
      (heroChamp ? championSignature(heroChamp) : null) ?? baseOutplay;
    addEvent(
      tl,
      "outplay",
      t,
      side,
      outplayDesc,
      {
        kills: killsForSide(side, wKills, 0),
        // The hero's kill bounties (300g each, all in heroLane) flow via
        // kdaDelta. Small bonus here for the play's swing — outplays demoralize.
        laneGoldDelta: singleLaneGold(heroLane, 100 * wKills, side),
        kdaDelta: outplayKda,
      },
      0.22,
    );
  });
}

// 13e. Cross-map objective trade (18-25) — 25% chance. One team gives up
// a contested objective to grab a counter-prize on the opposite side of
// the map (drake-for-tower, herald-for-drake). Net-neutral fight, real
// macro currency. No kills.
export function phaseObjectiveTrade(tl: TimelineContext): void {
  if (tl.duration < 24) return;
  const t = jitter(18, Math.min(25, tl.duration - 4), tl.rng);
  tl.schedule(t, () => {
    // A drafted splitpush comp lives on cross-map trades — it makes this play
    // more frequent, and macroEventBias points it at the splitpushing side.
    const splitpushPresent =
      tl.ctx.blueStrategy.macro === "splitpush" ||
      tl.ctx.redStrategy.macro === "splitpush";
    if (tl.rng() >= (splitpushPresent ? 0.4 : 0.25)) return;
    const side = rollEventSide(
      tl,
      t,
      tl.laneBias * 0.3 + macroEventBias(tl, "trade") + comebackBias(tl, t),
    );
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
  });
}

// 13f. Comeback stand (22-34) — NEGATIVE feedback. When one side is far behind
// on gold, the trailing team mounts a desperation defensive hold and wins a
// fight it shouldn't, clawing gold + momentum back. Stops a snowball from
// reading as a flat one-sided stomp and hands the underdog a real feed moment.
export function phaseComebackStand(tl: TimelineContext): void {
  if (tl.duration < 24) return;
  const t = jitter(22, Math.max(23, Math.min(34, tl.duration - 3)), tl.rng);
  tl.schedule(t, () => {
    // Read the gold lead as of THIS minute — the stand only happens from a real
    // deficit, and the team BEHIND is the one that makes it.
    if (Math.abs(tl.state.goldLead) < BALANCE.STAND_GOLD_DEFICIT) return;
    if (tl.rng() >= BALANCE.STAND_CHANCE) return;
    const side: Side = tl.state.goldLead > 0 ? "red" : "blue";
    const wp = picksOf(tl.ctx, side);
    const lp = picksOf(tl.ctx, side === "blue" ? "red" : "blue");
    const wk = rollInt(2, 4, tl.rng);
    const lk = rollInt(0, 1, tl.rng);
    const kda = teamfightKDA(side, wk, lk, tl.rng);
    addEvent(
      tl,
      "comeback",
      t,
      side,
      describeComebackStand(side, wp, lp, tl.rng),
      {
        kills: killsForSide(side, wk, lk),
        // Post-fight push + the kill bounties (via kdaDelta) swing gold back.
        laneGoldDelta: spreadLaneGold(wk * 80, side),
        kdaDelta: kda,
      },
      0.35, // strong momentum swing toward the trailing side
    );
  });
}

// 5b. Counter-jungle (6-12) — a jungler invades and denies the enemy camps,
// putting that jungler behind so they gank less for a window (see phaseGank).
// Positive feedback (the invader's jungle snowballs), balanced by comeback.
export function phaseCounterJungle(tl: TimelineContext): void {
  const t = jitter(6, 12, tl.rng);
  tl.schedule(t, () => {
    if (tl.rng() >= BALANCE.COUNTER_JUNGLE_CHANCE) return;
    const side = rollEventSide(tl, t, tl.laneBias * 0.4);
    addEvent(
      tl,
      "counter-jungle",
      t,
      side,
      describeCounterJungle(
        side,
        picksOf(tl.ctx, side),
        tl.ctx.blueName,
        tl.ctx.redName,
      ),
      { laneGoldDelta: singleLaneGold("jungle", 200, side) },
      0.08,
    );
    // The enemy jungler is now behind — they gank less for a while.
    tl.state.jungleBehind = side === "blue" ? "red" : "blue";
  });
}

// 11b. Pit skirmish (pre-Baron) — both teams contest the pit before a major
// objective; the winner earns Baron prio (pickAdvantage). Contested (comeback-
// biased), so it isn't a free win for the leader.
export function phasePitSkirmish(tl: TimelineContext): void {
  if (tl.duration < 27) return;
  const t = jitter(22, Math.max(23, Math.min(28, tl.duration - 4)), tl.rng);
  tl.schedule(t, () => {
    if (tl.rng() >= 0.45) return;
    const side = rollEventSide(tl, t, comebackBias(tl, t));
    const wp = picksOf(tl.ctx, side);
    const wk = rollInt(1, 3, tl.rng);
    const lk = rollInt(0, 2, tl.rng);
    const desc = describeSkirmish(side, wp, wk, lk, tl.rng);
    const kda = teamfightKDA(side, wk, lk, tl.rng);
    addEvent(
      tl,
      "skirmish",
      t,
      side,
      nameActualFragger(desc, wp, kda, side, SKIRMISH_CARRY_ARCHETYPES),
      {
        kills: killsForSide(side, wk, lk),
        laneGoldDelta: spreadLaneGold(wk * 30, side),
        kdaDelta: kda,
      },
      0.2,
    );
    // Won the pit fight → free run at the upcoming Baron.
    tl.state.pickAdvantage = {
      side,
      expiresAt: t + BALANCE.PICK_ADVANTAGE_WINDOW,
    };
  });
}

// 13g. Thrown lead (20-32) — NEGATIVE feedback from the LEADER's side: a far-
// ahead team gets greedy (face-checks an objective) and hands the trailing team
// a swing. Mirror of the comeback stand, from the other side of the lead.
export function phaseThrownLead(tl: TimelineContext): void {
  if (tl.duration < 24) return;
  const t = jitter(20, Math.max(21, Math.min(32, tl.duration - 3)), tl.rng);
  tl.schedule(t, () => {
    if (Math.abs(tl.state.goldLead) < BALANCE.THROW_GOLD_DEFICIT) return;
    if (tl.rng() >= BALANCE.THROW_CHANCE) return;
    // The team AHEAD throws; the side BEHIND benefits.
    const side: Side = tl.state.goldLead > 0 ? "red" : "blue";
    const what = tl.duration >= 28 ? "Baron" : "a greedy pick";
    const wk = rollInt(2, 3, tl.rng);
    const kda = teamfightKDA(side, wk, 0, tl.rng);
    addEvent(
      tl,
      "throw",
      t,
      side,
      describeThrow(side, tl.ctx.blueName, tl.ctx.redName, what, tl.rng) +
        " — flashes blown on the face-check",
      {
        kills: killsForSide(side, wk, 0),
        laneGoldDelta: spreadLaneGold(wk * 100, side),
        kdaDelta: kda,
      },
      0.4, // big momentum swing to the underdog
    );
    // The thrower over-committed key cooldowns to the greedy play — the
    // punishing side fights the next one with summoners up (negative feedback).
    tl.state.cooldownEdge = {
      side,
      expiresAt: t + BALANCE.COOLDOWN_EDGE_WINDOW,
    };
  });
}

// 13h. Backdoor attempt (24-34) — a splitpush comp sends someone to backdoor:
// either it cracks a tower (success) or the splitter gets caught (denied).
export function phaseBackdoorAttempt(tl: TimelineContext): void {
  if (tl.duration < 26) return;
  const t = jitter(24, Math.max(25, Math.min(34, tl.duration - 3)), tl.rng);
  tl.schedule(t, () => {
    const blueSplit = tl.ctx.blueStrategy.macro === "splitpush";
    const redSplit = tl.ctx.redStrategy.macro === "splitpush";
    if (!blueSplit && !redSplit) return;
    if (tl.rng() >= BALANCE.BACKDOOR_ATTEMPT_CHANCE) return;
    const side: Side =
      blueSplit && !redSplit
        ? "blue"
        : !blueSplit && redSplit
        ? "red"
        : tl.rng() < 0.5
        ? "blue"
        : "red";
    const caught = tl.rng() < BALANCE.BACKDOOR_CAUGHT_ODDS;
    if (caught) {
      const defender: Side = side === "blue" ? "red" : "blue";
      addEvent(
        tl,
        "backdoor",
        t,
        defender,
        describeBackdoorCaught(
          defender,
          picksOf(tl.ctx, side),
          tl.ctx.blueName,
          tl.ctx.redName,
        ),
        {
          kills: killsForSide(defender, 1, 0),
          laneGoldDelta: spreadLaneGold(120, defender),
          kdaDelta: laneKillKDA(defender, "top", 1, "top"),
        },
        0.12,
      );
      // The splitter Flashed to escape and died anyway — defenders have their
      // cooldowns up for the next play.
      tl.state.cooldownEdge = {
        side: defender,
        expiresAt: t + BALANCE.COOLDOWN_EDGE_WINDOW,
      };
    } else {
      addEvent(
        tl,
        "backdoor",
        t,
        side,
        describeBackdoor(
          side,
          picksOf(tl.ctx, side),
          tl.ctx.blueName,
          tl.ctx.redName,
        ),
        {
          towers: killsForSide(side, 1, 0),
          laneGoldDelta: singleLaneGold("top", 250, side),
        },
        0.15,
      );
    }
  });
}

// 13i. Vision sweep (16-24) — a team clears the enemy wards before an objective.
// No kill, but river control → a small objective-prio nudge: the SETUP move
// that the vision-PICK is the payoff of.
export function phaseVisionSweep(tl: TimelineContext): void {
  if (tl.duration < 20) return;
  const t = jitter(16, Math.min(24, tl.duration - 4), tl.rng);
  tl.schedule(t, () => {
    if (tl.rng() >= BALANCE.VISION_SWEEP_CHANCE) return;
    const side = rollEventSide(tl, t, tl.laneBias * 0.2 + mapControlBias(tl));
    const teamNm = side === "blue" ? tl.ctx.blueName : tl.ctx.redName;
    addEvent(
      tl,
      "vision",
      t,
      side,
      `${teamNm} sweeps the wards — vision cleared before the objective`,
      { laneGoldDelta: singleLaneGold("jungle", 60, side) },
      0.06,
    );
    bumpLaneLead(tl, side, "jungle", BALANCE.SCUTTLE_JUNGLE_SNOWBALL);
  });
}

// 13k. Tower dive (9-15) — a mid/jungle collapse dives a side lane under the
// enemy turret for 1-2 kills, sometimes trading a body to tower aggro. Positive
// feedback (the diving side snowballs that lane), fed by map control + lane prio
// (the wave-crash → tower → dive chain); comebackBias keeps it two-sided.
export function phaseTowerDive(tl: TimelineContext): void {
  const t = jitter(9, 15, tl.rng);
  tl.schedule(t, () => {
    if (tl.rng() >= BALANCE.TOWER_DIVE_CHANCE) return;
    const side = rollEventSide(
      tl,
      t,
      tl.laneBias * 0.5 + mapControlBias(tl) + comebackBias(tl, t),
    );
    const oppSide: Side = side === "blue" ? "red" : "blue";
    const lane = pickRandom(["top", "bottom"] as Lane[], tl.rng);
    const traded = tl.rng() < BALANCE.TOWER_DIVE_TRADE_ODDS;
    const wk = rollInt(1, 2, tl.rng);
    // Divers get wk kills; the dived lane dies wk times; a traded body is a
    // death on the diving side WITH NO kill credit (tower executes) — deaths
    // are not reconciled against kills, so event.kills stays {side: wk, 0}.
    const kda = makeKDA();
    addKill(kda, side, lane === "jungle" ? "middle" : "jungle", wk);
    addAssist(kda, side, lane);
    for (let i = 0; i < wk; i++) addDeath(kda, oppSide, lane);
    if (traded) addDeath(kda, side, lane);
    addEvent(
      tl,
      "dive",
      t,
      side,
      describeTowerDive(
        side,
        picksOf(tl.ctx, side),
        lane,
        tl.ctx.blueName,
        tl.ctx.redName,
        traded,
      ),
      {
        kills: killsForSide(side, wk, 0),
        laneGoldDelta: singleLaneGold(lane, 120, side),
        kdaDelta: kda,
      },
      0.16,
    );
    bumpLaneLead(tl, side, lane, wk);
    tl.state.pickAdvantage = {
      side,
      expiresAt: t + BALANCE.PICK_ADVANTAGE_WINDOW,
    };
  });
}

// 13l. Poke / siege (20-30) — a poke/siege comp chips a turret over a window:
// tower pressure + small gold, NO kills (the "no engage, no escape" beat).
// Comp-gated (a siege macro must be present). Positive for the sieging side,
// balanced by comeback.
export function phasePokeSiege(tl: TimelineContext): void {
  if (tl.duration < 24) return;
  const t = jitter(20, Math.min(30, tl.duration - 3), tl.rng);
  tl.schedule(t, () => {
    const siegePresent =
      tl.ctx.blueStrategy.macro === "siege" ||
      tl.ctx.redStrategy.macro === "siege";
    if (!siegePresent) return;
    if (tl.rng() >= BALANCE.POKE_SIEGE_CHANCE) return;
    const side = rollEventSide(
      tl,
      t,
      macroEventBias(tl, "tower") + comebackBias(tl, t),
    );
    tl.state.towerPressure[side] += BALANCE.POKE_SIEGE_TOWER_PRESSURE;
    addEvent(
      tl,
      "siege",
      t,
      side,
      describePokeSiege(side, tl.ctx.blueName, tl.ctx.redName, tl.rng),
      { laneGoldDelta: spreadLaneGold(120, side) },
      0.1,
    );
  });
}

// 13m. Teleport flank (16-26) — a top-laner TPs cross-map to flip a contested
// skirmish. Modest kill swing; neutral (either side, comeback-aware).
export function phaseTeleportFlank(tl: TimelineContext): void {
  if (tl.duration < 22) return;
  const t = jitter(16, Math.min(26, tl.duration - 4), tl.rng);
  tl.schedule(t, () => {
    if (tl.rng() >= BALANCE.TP_FLANK_CHANCE) return;
    const side = rollEventSide(tl, t, tl.laneBias * 0.2 + comebackBias(tl, t));
    const wk = rollInt(1, 2, tl.rng);
    const lk = rollInt(0, 1, tl.rng);
    const kda = teamfightKDA(side, wk, lk, tl.rng);
    addEvent(
      tl,
      "skirmish",
      t,
      side,
      describeTeleportFlank(
        side,
        picksOf(tl.ctx, side),
        tl.ctx.blueName,
        tl.ctx.redName,
      ),
      {
        kills: killsForSide(side, wk, lk),
        laneGoldDelta: spreadLaneGold(wk * 40, side),
        kdaDelta: kda,
      },
      0.18,
    );
    if (wk > lk) {
      tl.state.pickAdvantage = {
        side,
        expiresAt: t + BALANCE.PICK_ADVANTAGE_WINDOW,
      };
    }
  });
}

// 13n. Disengage / peel (18-30) — NEGATIVE feedback. A behind team gets dived
// but peels and survives: NO kills, just a morale/momentum nudge back. The
// defensive cousin of the comeback stand — banks a feed moment for the trailing
// side without a kill swing, so it never over-rewards the underdog.
export function phaseDisengage(tl: TimelineContext): void {
  if (tl.duration < 22) return;
  const t = jitter(18, Math.min(30, tl.duration - 3), tl.rng);
  tl.schedule(t, () => {
    if (Math.abs(tl.state.goldLead) < BALANCE.DISENGAGE_GOLD_DEFICIT) return;
    if (tl.rng() >= BALANCE.DISENGAGE_CHANCE) return;
    const side: Side = tl.state.goldLead > 0 ? "red" : "blue"; // the behind team
    addEvent(
      tl,
      "comeback",
      t,
      side,
      describeDisengage(
        side,
        picksOf(tl.ctx, side),
        tl.ctx.blueName,
        tl.ctx.redName,
        tl.rng,
      ),
      { laneGoldDelta: spreadLaneGold(60, side) },
      0.2, // momentum back, but no kills — pure tempo relief
    );
  });
}

// 13j. Baron dance (25+) — both teams poke around the pit, neither commits. A
// pure tension beat (no kills, no objective) in a CLOSE game; reuses the cross-
// map trade type. Neutral — it builds drama, it doesn't shift the game.
export function phaseBaronDance(tl: TimelineContext): void {
  if (tl.duration < 27) return;
  const t = jitter(24, Math.min(33, tl.duration - 3), tl.rng);
  tl.schedule(t, () => {
    if (tl.rng() >= BALANCE.BARON_DANCE_CHANCE) return;
    // Only a tense game dances around Baron — skip if someone's clearly ahead.
    if (Math.abs(tl.state.goldLead) > 4000) return;
    const side = rollEventSide(tl, t, tl.laneBias * 0.2);
    addEvent(
      tl,
      "objective-trade",
      t,
      side,
      "Both teams dance around Baron — neither commits, the tension builds",
      {},
      0.03,
    );
  });
}
