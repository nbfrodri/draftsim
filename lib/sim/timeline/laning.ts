// Laning-phase timeline events (minutes ~0-13): invade, scuttle, solo kills,
// first blood, ganks, buff steals, plates, roams and wave crashes.
//
// Extracted verbatim from generateTimeline (lib/matchSimulator.ts) — the
// bodies, constants and RNG call order are behavior-locked by
// lib/matchSimulator.golden.test.ts. Each phase takes the shared
// TimelineContext and pushes events / mutates MatchState exactly like the
// original inline block did.

import type { Lane, Side } from "../../types";
import {
  NO_KDA,
  NO_KILLS,
  POSITIONAL_LANES,
  addAssist,
  addDeath,
  addKill,
  describeBuffSteal,
  describeCounterGank,
  describeFirstBlood,
  describeGank,
  describeInvade,
  describePlates,
  describeRoam,
  describeScuttle,
  describeSoloKill,
  describeWaveCrash,
  firstBloodKillerLane,
  gankKDA,
  gankLaneGold,
  jitter,
  killsForSide,
  laneKillKDA,
  makeKDA,
  pickRandom,
  rollInt,
  sideLaneGoldSplit,
  singleLaneGold,
  spreadLaneGold,
} from "../descriptions";
import { BALANCE } from "./balance";
import {
  addEvent,
  bumpLaneLead,
  clampChance,
  picksOf,
  rollEventSide,
  type TimelineContext,
} from "./context";

export function pickGankableLane(
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

export function pickBullyLane(
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

// 0a. Level 1 invade (0.3-1.8) — 30% chance. Side bias toward team with more
// engage/pick presence; outcome is a single kill or a neutral win.
export function phaseLevelOneInvade(tl: TimelineContext): void {
  if (tl.rng() < 0.3) {
    const t = jitter(0.3, 1.8, tl.rng);
    const side = rollEventSide(tl, t);
    const wp = picksOf(tl.ctx, side);
    const lp = picksOf(tl.ctx, side === "blue" ? "red" : "blue");
    const killHappened = tl.rng() < 0.55;
    // Level-1 invade is a 5-man play; if a kill lands, jungler gets credit
    // (most likely to leash-kill the enemy jungler), supports assist.
    const kda = makeKDA();
    if (killHappened) {
      addKill(kda, side, "jungle");
      addAssist(kda, side, "support");
      addDeath(kda, side === "blue" ? "red" : "blue", "jungle");
    }
    addEvent(
      tl,
      "invade",
      t,
      side,
      describeInvade(side, wp, lp, tl.ctx.blueName, tl.ctx.redName, tl.rng),
      {
        kills: killHappened ? killsForSide(side, 1, 0) : NO_KILLS,
        laneGoldDelta: spreadLaneGold(killHappened ? 200 : 80, side),
        kdaDelta: kda,
      },
      0.12,
    );
  }
}

// 0b. First scuttle crab (3-4.5) — 60% chance. Vision + small gold reward.
export function phaseFirstScuttle(tl: TimelineContext): void {
  if (tl.rng() < 0.6) {
    const t = jitter(3, 4.5, tl.rng);
    const side = rollEventSide(tl, t);
    addEvent(
      tl,
      "scuttle",
      t,
      side,
      describeScuttle(
        side,
        picksOf(tl.ctx, side),
        tl.ctx.blueName,
        tl.ctx.redName,
        tl.rng,
      ),
      { laneGoldDelta: singleLaneGold("jungle", 80, side) },
      0.06,
    );
  }
}

// 1. Solo kill (4-7) — fires when a lane bully exists. Number of kills and
// gold extracted scale with the magnitude of the matchup advantage: an
// overwhelming matchup (>= 100 g/min advantage) produces 2-3 solo kills,
// a strong matchup (>= 65) produces 1-2, a normal bully matchup (>= 50) is
// a single kill. Each kill costs the rival ~200g (death + lost CS).
export function phaseSoloKills(tl: TimelineContext): void {
  const blueBully = pickBullyLane(tl.state.laneLead, "blue");
  const redBully = pickBullyLane(tl.state.laneLead, "red");
  let bullySide: Side | null = null;
  if (blueBully && !redBully) bullySide = "blue";
  else if (redBully && !blueBully) bullySide = "red";
  else if (blueBully && redBully) {
    const blueAdv = Math.abs(tl.state.laneLead[blueBully]);
    const redAdv = Math.abs(tl.state.laneLead[redBully]);
    bullySide = blueAdv > redAdv ? "blue" : "red";
  }
  if (bullySide) {
    const lane = pickBullyLane(tl.state.laneLead, bullySide)!;
    const advMag = Math.abs(tl.state.laneLead[lane]);
    const numKills =
      advMag >= 100
        ? rollInt(2, 3, tl.rng)
        : advMag >= 65
        ? rollInt(1, 2, tl.rng)
        : 1;
    const t = jitter(4, 7, tl.rng);
    const winnerChamp =
      picksOf(tl.ctx, bullySide)[POSITIONAL_LANES.indexOf(lane)];
    const laneShort =
      lane === "middle" ? "mid" : lane === "bottom" ? "bot" : lane;
    // NOTE: the solo kill never claims "first blood" itself. phaseFirstBlood
    // always emits the dedicated first-blood event (and downgrades itself to
    // "early kill" when an earlier kill exists), so it is the single source of
    // truth — labelling the solo kill too produced a duplicate "FIRST BLOOD".
    const desc =
      numKills > 1 && winnerChamp
        ? `${winnerChamp.name} dominates ${laneShort} (${numKills} solo kills)`
        : describeSoloKill(bullySide, picksOf(tl.ctx, bullySide), lane);
    addEvent(
      tl,
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
    // The fed laner snowballs — feed the live lane lead.
    bumpLaneLead(tl, bullySide, lane, numKills);
  }
}

// 2. First blood (3-5.5). If invade or a snowballing solo lane already
// took the first kill, this fires as a follow-up early kill instead so
// the timeline doesn't double-claim first blood. Same kill economy
// either way — only the label and the kill-bounty bonus differ.
export function phaseFirstBlood(tl: TimelineContext): void {
  const t = jitter(3, 5.5, tl.rng);
  const side = rollEventSide(tl, t, 0.1 + tl.mods.earlyAggroBias);
  // First blood = no kill has happened EARLIER in the game. The solo-kill
  // phase runs before this in code order but its event can land later in
  // game-time (jitter 4-7 vs this 3-5.5), so we must compare actual event
  // timestamps, not a pre-claimed flag — otherwise an earlier first-blood
  // gets mislabeled "early kill" and the timeline reads out of order.
  const isFirstBlood = !tl.events.some(
    (e) => (e.kills.blue > 0 || e.kills.red > 0) && e.minutes <= t,
  );
  const fbLanes: Lane[] = ["top", "jungle", "middle", "bottom"];
  const fbLane = pickRandom(fbLanes, tl.rng);
  const winnerChamp =
    picksOf(tl.ctx, side)[POSITIONAL_LANES.indexOf(fbLane)] ?? null;
  const desc = isFirstBlood
    ? describeFirstBlood(
        side,
        picksOf(tl.ctx, side),
        picksOf(tl.ctx, side === "blue" ? "red" : "blue"),
        t,
        tl.rng,
      )
    : winnerChamp
      ? `Early kill — ${winnerChamp.name} draws blood ${
          fbLane === "middle" ? "mid" : fbLane === "bottom" ? "bot" : fbLane
        }`
      : `Early kill in ${fbLane === "middle" ? "mid" : fbLane === "bottom" ? "bot" : fbLane}`;
  // Credit the kill to the champion the line actually names: the flavored
  // first-blood line names the archetype killer (firstBloodKillerLane), the
  // plain early-kill line names winnerPicks[fbLane]. Without this the kill
  // landed on a random lane, leaving the named killer on 0/0/0.
  const creditLane =
    (isFirstBlood ? firstBloodKillerLane(picksOf(tl.ctx, side)) : null) ??
    fbLane;
  // Kill goes to the crediting lane, jungler often assists (~40% of FBs /
  // early kills are gank-fueled).
  const fbKda = laneKillKDA(side, creditLane);
  if (tl.rng() < 0.4 && creditLane !== "jungle") {
    addAssist(fbKda, side, "jungle");
  }
  addEvent(
    tl,
    // Only TYPE it first-blood when it actually IS first blood — otherwise the
    // UI would stamp a "First Blood" badge on an "early kill" that something
    // already preceded. A follow-up early kill is just a solo kill.
    isFirstBlood ? "first-blood" : "solo-kill",
    t,
    side,
    desc,
    {
      kills: killsForSide(side, 1, 0),
      // Kill bounty in kdaDelta. The +100g first-blood bonus is the only
      // gold remaining — kdaToLaneGold can't model the FB-specific bonus.
      // No bonus on follow-up early kills (it was already paid out).
      laneGoldDelta: singleLaneGold(creditLane, isFirstBlood ? 100 : 0, side),
      kdaDelta: fbKda,
    },
    0.2,
  );
  bumpLaneLead(tl, side, creditLane);
}

// 5. Gank (3.5-9.5) — 55% chance, biased to gankable lane. Lane prio
// matters: a jungler with prio (i.e., on the team with more pushed lanes)
// can roam to gank without giving up jungle camps.
export function phaseGank(tl: TimelineContext): void {
  if (tl.rng() < clampChance(0.55 + tl.mods.gankChanceDelta)) {
    const t = jitter(3.5, 9.5, tl.rng);
    const side = rollEventSide(tl, t, tl.laneBias * 0.5 + tl.mods.gankBias);
    const lane = pickGankableLane(tl.state.laneLead, side);
    addEvent(
      tl,
      "gank",
      t,
      side,
      describeGank(
        side,
        picksOf(tl.ctx, side),
        lane,
        tl.ctx.blueName,
        tl.ctx.redName,
      ),
      {
        kills: killsForSide(side, 1, 0),
        // Kill+assist gold flows through kdaDelta. Remaining lane gold here
        // models lost CS for the victim while recalling.
        laneGoldDelta: gankLaneGold(lane, 100, side),
        kdaDelta: gankKDA(side, lane, "jungle", lane),
      },
      0.16,
    );
    // Snowball the ganked lane; flag the gank so the counter-gank can respond.
    bumpLaneLead(tl, side, lane);
    tl.state.lastGankSide = side;
  }
}

// 6. Counter-gank (5.5-9.5) — 30% chance, MORE likely right after a gank and
// biased back toward the team that just got ganked (the enemy jungler shows up
// to flip it). Models the gank → counter-gank causal pairing.
export function phaseCounterGank(tl: TimelineContext): void {
  const ganked = tl.state.lastGankSide;
  const chance = 0.3 + (ganked ? BALANCE.COUNTERGANK_AFTER_GANK_CHANCE : 0);
  if (tl.rng() < chance) {
    const t = jitter(5.5, 9.5, tl.rng);
    // Respond toward the side that got ganked (opposite of the ganker).
    const responseBias = ganked
      ? (ganked === "blue" ? -1 : 1) * BALANCE.COUNTERGANK_RESPONSE_BIAS
      : 0;
    const side = rollEventSide(tl, t, responseBias);
    const flippedLane = pickRandom(["top", "middle", "bottom"] as Lane[], tl.rng);
    // Counter-gank: jungler arrived and turned the gank — kill credit goes
    // to the jungler, laner provides the assist, opp jungler/laner dies.
    addEvent(
      tl,
      "counter-gank",
      t,
      side,
      describeCounterGank(
        side,
        picksOf(tl.ctx, side),
        tl.ctx.blueName,
        tl.ctx.redName,
      ),
      {
        kills: killsForSide(side, 1, 0),
        laneGoldDelta: gankLaneGold(flippedLane, 100, side),
        kdaDelta: gankKDA(side, "jungle", flippedLane, "jungle"),
      },
      0.18,
    );
    bumpLaneLead(tl, side, flippedLane);
    tl.state.lastGankSide = null; // response resolved
  }
}

// 6b. Buff steal (5.5-9) — 22% chance. Jungle invade requires lane prio
// to back up — without it, getting caught is the more likely outcome.
export function phaseBuffSteal(tl: TimelineContext): void {
  if (tl.rng() < 0.22) {
    const t = jitter(5.5, 9, tl.rng);
    const side = rollEventSide(tl, t, tl.laneBias * 0.6);
    const killHappened = tl.rng() < 0.4;
    addEvent(
      tl,
      "buff-steal",
      t,
      side,
      describeBuffSteal(
        side,
        picksOf(tl.ctx, side),
        tl.ctx.blueName,
        tl.ctx.redName,
        tl.rng,
      ),
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
}

// 7. Plates (8-12) — 50% chance, side-lane heavy. Plates are the most
// direct gold conversion of lane prio: pushing the wave under tower
// means the plates fall to your side.
export function phasePlates(tl: TimelineContext): void {
  if (tl.rng() < 0.5) {
    const t = jitter(8, 12, tl.rng);
    const side = rollEventSide(tl, t, tl.laneBias * 0.7);
    addEvent(
      tl,
      "plates",
      t,
      side,
      describePlates(
        side,
        picksOf(tl.ctx, side),
        tl.ctx.blueName,
        tl.ctx.redName,
        tl.rng,
      ),
      { laneGoldDelta: sideLaneGoldSplit(400, side) },
      0.1,
    );
  }
}

// 7b. Mid roam (9-13) — 40% chance. Mid laner / sup roams to a side
// lane. Heavily biased by lane prio — the canonical "I have prio so I
// can leave my lane" play. A roamer without prio loses CS and gets
// dove on the way back.
export function phaseMidRoam(tl: TimelineContext): void {
  if (tl.rng() < clampChance(0.4 + tl.mods.roamChanceDelta)) {
    const t = jitter(9, 13, tl.rng);
    const side = rollEventSide(tl, t, tl.laneBias * 0.9 + tl.mods.roamBias);
    const targetLane = pickRandom(["top", "bottom"] as Lane[], tl.rng);
    addEvent(
      tl,
      "roam",
      t,
      side,
      describeRoam(
        side,
        picksOf(tl.ctx, side),
        targetLane,
        tl.ctx.blueName,
        tl.ctx.redName,
        "middle",
      ),
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
    bumpLaneLead(tl, side, targetLane);
  }
}

// 7c. Wave-crash (8-13) — 35% chance. A laner crashes the wave into the tower
// and either freezes the bounce (denying CS) or cracks a plate. No kill — just
// well-timed wave management. Biased by lane prio (a team with prio crashes
// harder). Causally it builds plate/turret pressure for the crashing side and
// nudges that lane's lead (the crash → tower → dive setup chain).
export function phaseWaveCrash(tl: TimelineContext): void {
  if (tl.rng() < 0.35) {
    const t = jitter(8, 13, tl.rng);
    const side = rollEventSide(tl, t, tl.laneBias * 0.5);
    const lane = pickRandom(["top", "middle", "bottom"] as Lane[], tl.rng);
    addEvent(
      tl,
      "wave-crash",
      t,
      side,
      describeWaveCrash(
        side,
        picksOf(tl.ctx, side),
        lane,
        tl.ctx.blueName,
        tl.ctx.redName,
      ),
      { laneGoldDelta: singleLaneGold(lane, 220, side) },
      0.06,
    );
    tl.state.towerPressure[side] += BALANCE.WAVECRASH_TOWER_PRESSURE;
    bumpLaneLead(tl, side, lane);
  }
}
