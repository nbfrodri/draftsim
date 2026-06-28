// Neutral-objective and tower timeline events: voidgrubs, dragons/soul,
// Atakhan/Herald, Baron, Elder, and the tower-pressure tower takes.
//
// Extracted verbatim from generateTimeline (lib/matchSimulator.ts) — the
// bodies, constants and RNG call order are behavior-locked by
// lib/matchSimulator.golden.test.ts.

import type { Lane, Side } from "../../types";
import type { AtakhanVariant } from "../types";
import {
  DRAGON_TYPES,
  NO_KDA,
  NO_KILLS,
  describeAtakhan,
  describeBaron,
  describeDragon,
  describeElder,
  describeGrubs,
  describeHerald,
  describeSoul,
  describeTower,
  jitter,
  killsForSide,
  objectiveKDA,
  pickRandom,
  rollInt,
  singleLaneGold,
  spreadLaneGold,
  teamfightKDA,
} from "../descriptions";
import { BALANCE } from "./balance";
import {
  addEvent,
  bumpLaneLead,
  consumeTowerPressure,
  cooldownEdgeBias,
  objectivePrioBias,
  pickAdvantageBias,
  picksOf,
  rollEventSide,
  rollTowerSide,
  stealChance,
  type TimelineContext,
} from "./context";

// 3. Voidgrubs (6-7.5) — confer Touch of the Void: bonus damage to turrets.
// Builds tower pressure that biases the next tower events toward this side.
// Side roll heavily biased by lane prio — voidgrubs are an early-game
// objective and the team controlling lanes contests them better.
// Per-grub bonus: each kill grants Touch of the Void (~tower damage),
// so 6 grubs is meaningfully bigger than 3. Grub count is now rolled
// explicitly and feeds tower pressure proportionally + lane gold scales.
export function phaseGrubs(tl: TimelineContext): void {
  const t = jitter(6, 7.5, tl.rng);
  tl.schedule(t, () => {
    const side = rollEventSide(tl, t, tl.laneBias * 0.7);
    // Count distribution: 6 grubs is most common when one team contests
    // hard (~50%); 3 grubs for split, 4-5 for partial fights.
    const grubsTaken =
      tl.rng() < 0.5 ? 6 : tl.rng() < 0.7 ? 3 : rollInt(4, 5, tl.rng);
    tl.state.grubCount[side] += grubsTaken;
    // Each grub = +0.12 tower pressure (6 grubs = +0.72, the meaningful
    // tower-shred spike). Plus a small per-grub gold bonus.
    tl.state.towerPressure[side] += grubsTaken * BALANCE.GRUB_TOWER_PRESSURE;
    const grubGold = 60 + grubsTaken * 25; // 6 grubs ≈ 210g spread
    addEvent(
      tl,
      "grubs",
      t,
      side,
      describeGrubs(side, tl.ctx.blueName, tl.ctx.redName, grubsTaken),
      { laneGoldDelta: spreadLaneGold(grubGold, side) },
      0.06 + grubsTaken * 0.01,
    );
    // Touch of the Void helps the laners shove/dive — a small side-lane
    // snowball scaled by how many grubs were taken (6 grubs ≈ a full nudge).
    const laneBump = (grubsTaken / 6) * BALANCE.GRUB_LANE_SNOWBALL;
    bumpLaneLead(tl, side, "top", laneBump);
    bumpLaneLead(tl, side, "middle", laneBump);
  });
}

// Shared dragon-contest resolution. All four drake phases roll a contest
// side, a possible smite steal, then either the soul-point event (4th
// stack while soul is open) or a plain dragon event. The per-phase knobs
// (timing handled by the caller, side bias, steal base, post-take gold
// spread, momentum) are passed in; the math and RNG order are identical
// to the four original inline blocks. The soul branch can never trigger on
// the first drake (the taker's stack is 1), matching the original code
// that omitted the check there.
function contestDrake(
  tl: TimelineContext,
  t: number,
  sideBias: number,
  stealBase: number,
  drakeGold: number,
  momStolen: number,
  momPlain: number,
): void {
  // High-stakes objective → macro-pure (no anti-streak), so the trailing team's
  // extra scrappy feed time never buys them a drake/soul it shouldn't.
  const contestSide = rollEventSide(
    tl,
    t,
    sideBias + pickAdvantageBias(tl, t) + cooldownEdgeBias(tl, t),
    false,
  );
  const stolen = tl.rng() < stealChance(tl, stealBase, contestSide);
  const side: Side = stolen
    ? contestSide === "blue"
      ? "red"
      : "blue"
    : contestSide;
  tl.state.drakes[side]++;
  if (tl.state.drakes[side] === 4 && tl.state.soulSide == null) {
    tl.state.soulSide = side;
    const soulType = pickRandom(DRAGON_TYPES, tl.rng);
    // Remember the element — it gives the soul team a small type-specific edge
    // (Infernal fights hardest, Mountain defends objectives, etc.).
    tl.state.soulType = soulType;
    const wK = rollInt(1, 3, tl.rng);
    const lK = rollInt(0, 2, tl.rng);
    addEvent(
      tl,
      "soul",
      t,
      side,
      describeSoul(side, tl.ctx.blueName, tl.ctx.redName, soulType),
      {
        kills: killsForSide(side, wK, lK),
        towers: killsForSide(side, rollInt(0, 1, tl.rng), 0),
        laneGoldDelta: spreadLaneGold(800, side),
        kdaDelta: teamfightKDA(side, wK, lK, tl.rng),
        soulElement: soulType,
      },
      0.55,
    );
  } else {
    const drakeType = pickRandom(DRAGON_TYPES, tl.rng);
    // Stolen drake: the smiter (jungle) flipped the play; usually the team
    // that "won" the contest still got 1-2 kills on the smiter's team. KDA
    // attributes those to the loser side that secured the post-fight kills.
    const stealK = stolen ? rollInt(1, 2, tl.rng) : 0;
    addEvent(
      tl,
      "dragon",
      t,
      side,
      describeDragon(
        side,
        tl.ctx.blueName,
        tl.ctx.redName,
        tl.state.drakes[side],
        drakeType,
        stolen,
      ),
      {
        kills: stolen ? killsForSide(side, 0, stealK) : NO_KILLS,
        laneGoldDelta: spreadLaneGold(drakeGold, side),
        // For a steal, opponents collected the kills (loser of objective
        // wins the post-smite skirmish). Otherwise no kills, no KDA.
        kdaDelta: stolen
          ? objectiveKDA(
              side === "blue" ? "red" : "blue",
              stealK,
              0,
              true,
              side,
              tl.rng,
            )
          : NO_KDA,
      },
      stolen ? momStolen : momPlain,
    );
  }
}

// 4. First Drake (6.5-8.3) — 8% chance of a smite steal flipping the side.
// Strongly biased by lane prio: bot lane's prio in particular determines
// who can fight over drake without losing a tower.
export function phaseFirstDrake(tl: TimelineContext): void {
  const t = jitter(6.5, 8.3, tl.rng);
  tl.schedule(t, () => {
    contestDrake(
      tl,
      t,
      objectivePrioBias(tl, "drake") * 0.6 + tl.mods.drakeBias,
      0.08,
      150,
      0.25,
      0.12,
    );
  });
}

// 10. Second Drake (11.5-14.3) — 8% chance of a smite steal. Lane prio
// still relevant for early-mid drakes.
export function phaseSecondDrake(tl: TimelineContext): void {
  if (tl.duration < 18) return;
  const t = jitter(11.5, 14.3, tl.rng);
  tl.schedule(t, () => {
    contestDrake(
      tl,
      t,
      objectivePrioBias(tl, "drake") * 0.4 + tl.mods.drakeBias,
      0.08,
      200,
      0.28,
      0.14,
    );
  });
}

// 12. Third Drake (16.5-20) — 10% steal as games heat up.
export function phaseThirdDrake(tl: TimelineContext): void {
  if (tl.duration < 22) return;
  const t = jitter(16.5, 20, tl.rng);
  tl.schedule(t, () => {
    contestDrake(tl, t, tl.mods.drakeBias, 0.1, 220, 0.3, 0.15);
  });
}

// 14. Fourth Drake / Soul (21-25)
export function phaseFourthDrakeSoul(tl: TimelineContext): void {
  if (tl.duration < 26) return;
  const t = jitter(21, Math.min(25, tl.duration - 3), tl.rng);
  tl.schedule(t, () => {
    // soulSide is checked at resolve time — an earlier drake may have already
    // granted soul by the time this 4th-drake contest plays out.
    if (tl.state.soulSide != null) return;
    contestDrake(tl, t, tl.mods.drakeBias, 0.1, 240, 0.3, 0.18);
  });
}

// 8. First Tower (10-13). Tower-pressure side bias: side that took
// grubs is meaningfully more likely to crack first turret.
export function phaseFirstTower(tl: TimelineContext): void {
  const t = jitter(10, 13, tl.rng);
  tl.schedule(t, () => {
    const side = rollTowerSide(tl, t);
    consumeTowerPressure(tl, side);
    const towerLane = pickRandom(["top", "middle", "bottom"] as Lane[], tl.rng);
    addEvent(
      tl,
      "tower",
      t,
      side,
      describeTower(
        side,
        picksOf(tl.ctx, side),
        tl.ctx.blueName,
        tl.ctx.redName,
        true,
        tl.rng,
      ),
      {
        towers: killsForSide(side, 1, 0),
        // First turret of the game pays the real-LoL first-tower bonus on top
        // of the structure bounty.
        laneGoldDelta: singleLaneGold(
          towerLane,
          350 + BALANCE.FIRST_TOWER_BONUS,
          side,
        ),
      },
      0.15,
    );
  });
}

// 9. Atakhan or second Herald (14-16). Herald grants the tower break + a
// big tower-pressure stack. Lane prio still matters here — the team with
// pushed lanes contests both objectives more freely. The Atakhan variant
// is rolled and tracked: Voracious gives subsequent fights a +20% kill-
// gold bonus on its side; Ruinous gives a one-shot revive that softens
// the next lost teamfight (loserKills -1).
export function phaseAtakhanOrHerald(tl: TimelineContext): void {
  const t = jitter(14, 16, tl.rng);
  tl.schedule(t, () => {
  const side = rollEventSide(
    tl,
    t,
    objectivePrioBias(tl, "herald") * 0.4 + tl.mods.atakhanBias,
  );
  if (tl.rng() < 0.6) {
    const atakhanVariant: AtakhanVariant =
      tl.rng() < 0.5 ? "Voracious" : "Ruinous";
    tl.state.atakhanVariant = atakhanVariant;
    tl.state.atakhanSide = side;
    if (atakhanVariant === "Ruinous") tl.state.ruinousActive = true;
    const wKills = rollInt(1, 2, tl.rng);
    const lKills = rollInt(0, 1, tl.rng);
    addEvent(
      tl,
      "atakhan",
      t,
      side,
      describeAtakhan(side, tl.ctx.blueName, tl.ctx.redName, atakhanVariant),
      {
        kills: killsForSide(side, wKills, lKills),
        laneGoldDelta: spreadLaneGold(250, side),
        kdaDelta: teamfightKDA(side, wKills, lKills, tl.rng),
        atakhanVariant,
      },
      0.18,
    );
  } else {
    const heraldLane = pickRandom(["top", "middle"] as Lane[], tl.rng);
    tl.state.towerPressure[side] += BALANCE.HERALD_TOWER_PRESSURE;
    addEvent(
      tl,
      "herald",
      t,
      side,
      describeHerald(side, tl.ctx.blueName, tl.ctx.redName, tl.rng),
      {
        towers: killsForSide(side, 1, 0),
        laneGoldDelta: singleLaneGold(heraldLane, 350, side),
      },
      0.13,
    );
  }
  });
}

// 15. First Baron (20-30). 15% steal chance — a stolen Nashor swings the
// momentum hard (0.65 vs 0.5) since the trailing team flips into a 3-tower
// siege threat. Towers + ~900g spread = a real winprob jolt.
export function phaseFirstBaron(tl: TimelineContext): void {
  if (tl.duration < 25) return;
  const tMax = Math.min(tl.duration - 4, 30);
  const t = jitter(20, Math.max(21, tMax), tl.rng);
  tl.schedule(t, () => {
    const contestSide = rollEventSide(
      tl,
      t,
      0.05 + tl.mods.baronBias + pickAdvantageBias(tl, t) + cooldownEdgeBias(tl, t),
      false, // Baron is game-deciding — macro-pure, no anti-streak
    );
    const stolen = tl.rng() < stealChance(tl, 0.15, contestSide);
    const baronSide: Side = stolen
      ? contestSide === "blue"
        ? "red"
        : "blue"
      : contestSide;
    const wk = rollInt(1, 3, tl.rng);
    const lk = rollInt(0, 2, tl.rng);
    // Baron's siege edge is a live buff, not a permanent stat: record the
    // holder + expiry so rollTowerSide tilts towers only until it lapses.
    tl.state.baronExpiresAt = t + BALANCE.BARON_DURATION;
    tl.state.baronSide = baronSide;
    addEvent(
      tl,
      "baron",
      t,
      baronSide,
      describeBaron(
        baronSide,
        picksOf(tl.ctx, baronSide),
        tl.ctx.blueName,
        tl.ctx.redName,
        stolen,
        { winner: wk, loser: lk },
        tl.rng,
      ),
      {
        kills: killsForSide(baronSide, wk, lk),
        towers: killsForSide(baronSide, rollInt(2, 3, tl.rng), 0),
        laneGoldDelta: spreadLaneGold(900, baronSide),
        kdaDelta: objectiveKDA(baronSide, wk, lk, stolen, baronSide, tl.rng),
      },
      stolen ? 0.65 : 0.5,
    );
  });
}

// 16. Mid tower (23 to duration-3). Reuses tower-pressure bias.
export function phaseMidTower(tl: TimelineContext): void {
  if (tl.duration < 27) return;
  const t = jitter(23, Math.max(24, tl.duration - 3), tl.rng);
  tl.schedule(t, () => {
    const side = rollTowerSide(tl, t);
    consumeTowerPressure(tl, side);
    addEvent(
      tl,
      "tower",
      t,
      side,
      describeTower(
        side,
        picksOf(tl.ctx, side),
        tl.ctx.blueName,
        tl.ctx.redName,
        false,
        tl.rng,
      ),
      {
        towers: killsForSide(side, rollInt(1, 2, tl.rng), 0),
        laneGoldDelta: singleLaneGold(
          pickRandom(["top", "middle", "bottom"] as Lane[], tl.rng),
          400,
          side,
        ),
      },
      0.15,
    );
  });
}

// 17. Elder (long games). Elder Dragon only spawns once ONE team has secured
// Dragon Soul — i.e. that team reached 4 drakes (tracked by state.soulSide).
// It is never gated on the combined drake count across both teams. Sets
// state.elderSide so closing-fight logic factors it in.
export function phaseElder(tl: TimelineContext): void {
  if (tl.duration < 32) return;
  const t = jitter(tl.duration - 7, tl.duration - 3, tl.rng);
  tl.schedule(t, () => {
    // Soul must already be secured (a team reached 4 drakes) AND the spawn
    // roll passes — both checked at resolve so soulSide reflects the drakes
    // that played out before this minute. Short-circuits without rolling when
    // there's no soul, matching the original gate.
    if (tl.state.soulSide == null || tl.rng() >= 0.65) return;
    const contestSide = rollEventSide(tl, t, 0, false); // Elder is game-deciding
    const stolen = tl.rng() < stealChance(tl, 0.18, contestSide);
    const elderSide: Side = stolen
      ? contestSide === "blue"
        ? "red"
        : "blue"
      : contestSide;
    tl.state.elderSide = elderSide;
    const elderWk = rollInt(1, 3, tl.rng);
    const elderLk = rollInt(0, 2, tl.rng);
    addEvent(
      tl,
      "elder",
      t,
      elderSide,
      describeElder(elderSide, tl.ctx.blueName, tl.ctx.redName, stolen),
      {
        kills: killsForSide(elderSide, elderWk, elderLk),
        towers: killsForSide(elderSide, rollInt(0, 2, tl.rng), 0),
        laneGoldDelta: spreadLaneGold(1000, elderSide),
        kdaDelta: objectiveKDA(elderSide, elderWk, elderLk, stolen, elderSide, tl.rng),
      },
      stolen ? 0.75 : 0.65,
    );
  });
}
