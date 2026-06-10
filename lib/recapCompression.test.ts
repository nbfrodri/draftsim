// Round-trip tests for lib/recapCompression.ts.
//
// Validates that:
//   1. encode → decode restores all heavy fields within required precision:
//        blueProb within 0.01, goldLead within 100, probDelta within 0.01,
//        minute within 0.1, KDA exact integers, ratings exact to one decimal.
//   2. The encoded JSON is ≥ 3× smaller than the raw JSON of the same fields.
//   3. Recaps without heavy fields pass through without errors.
//   4. The slim fallback strips all heavy fields.

import { describe, expect, it } from "vitest";
import {
  compactEncodeTournamentForPersist,
  encodeRecapForPersistCached,
  encodeRecapHeavyFields,
  decodeRecapHeavyFields,
  slimRecapFallback,
  type RecapCompact,
} from "./recapCompression";
import type { GameRecap } from "./types";
import type { TournamentState } from "./tournament";

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** Build a realistic full recap with all heavy fields populated. */
function buildRealisticRecap(): GameRecap {
  // 100 timeline events — representative for a ~35-minute game with many events.
  const winProbTimeline = Array.from({ length: 100 }, (_, i) => ({
    minute: Math.round((i * 0.35 + 0.5) * 10) / 10,
    blueProb: Math.round((0.5 + (Math.sin(i * 0.4) * 0.35)) * 100) / 100,
  }));

  const goldLeadTimeline = Array.from({ length: 100 }, (_, i) => ({
    minute: Math.round((i * 0.35 + 0.5) * 10) / 10,
    goldLead: Math.round((i * 200 - 3800 + Math.sin(i) * 1200) / 100) * 100,
  }));

  const notableEvents = Array.from({ length: 12 }, (_, i) => ({
    minute: Math.round((i * 2.8 + 1.5) * 10) / 10,
    side: (i % 2 === 0 ? "blue" : "red") as "blue" | "red",
    type: ["baron", "elder", "ace", "shutdown", "teamfight"][i % 5],
    description: `Event ${i}: something noteworthy happened here`,
    probDelta: Math.round(((i % 3 === 0 ? 0.12 : -0.08) + Math.sin(i) * 0.05) * 100) / 100,
  }));

  const perPickKDA = {
    blue: [
      { k: 3, d: 1, a: 8 },
      { k: 4, d: 2, a: 9 },
      { k: 5, d: 1, a: 7 },
      { k: 9, d: 1, a: 6 },
      { k: 1, d: 2, a: 12 },
    ],
    red: [
      { k: 1, d: 4, a: 1 },
      { k: 2, d: 5, a: 2 },
      { k: 2, d: 4, a: 2 },
      { k: 1, d: 5, a: 1 },
      { k: 1, d: 4, a: 3 },
    ],
  };

  const ratings = {
    blue: [8.5, 7.2, 9.1, 6.5, 5.8],
    red: [3.2, 4.1, 2.9, 3.5, 4.8],
  };

  return {
    durationMinutes: 35,
    mvp: {
      side: "blue",
      lane: "bottom",
      championId: 42,
      kills: 9,
      deaths: 1,
      assists: 6,
      laneGoldDiff: 2800,
    },
    laneGoldDiff: {
      top: 800,
      jungle: 500,
      middle: 900,
      bottom: 2800,
      support: 400,
    },
    biggestSwing: {
      minute: 22.5,
      side: "blue",
      type: "baron",
      description: "Blue secured Baron Nashor",
      probDelta: 0.24,
    },
    winProbTimeline,
    goldLeadTimeline,
    notableEvents,
    perPickKDA,
    ratings,
  };
}

// ── Round-trip tests ──────────────────────────────────────────────────────────

describe("encodeRecapHeavyFields / decodeRecapHeavyFields round-trip", () => {
  it("restores winProbTimeline within blueProb ±0.01 and minute ±0.1", () => {
    const original = buildRealisticRecap();
    const { slim, compact } = encodeRecapHeavyFields(original);
    const restored = decodeRecapHeavyFields(slim, compact);

    expect(restored.winProbTimeline).toBeDefined();
    expect(restored.winProbTimeline!.length).toBe(
      original.winProbTimeline!.length,
    );

    for (let i = 0; i < original.winProbTimeline!.length; i++) {
      const orig = original.winProbTimeline![i];
      const rest = restored.winProbTimeline![i];
      expect(Math.abs(rest.minute - orig.minute)).toBeLessThanOrEqual(0.1);
      expect(Math.abs(rest.blueProb - orig.blueProb)).toBeLessThanOrEqual(0.01);
    }
  });

  it("restores goldLeadTimeline within goldLead ±100 and minute ±0.1", () => {
    const original = buildRealisticRecap();
    const { slim, compact } = encodeRecapHeavyFields(original);
    const restored = decodeRecapHeavyFields(slim, compact);

    expect(restored.goldLeadTimeline).toBeDefined();
    expect(restored.goldLeadTimeline!.length).toBe(
      original.goldLeadTimeline!.length,
    );

    for (let i = 0; i < original.goldLeadTimeline!.length; i++) {
      const orig = original.goldLeadTimeline![i];
      const rest = restored.goldLeadTimeline![i];
      expect(Math.abs(rest.minute - orig.minute)).toBeLessThanOrEqual(0.1);
      expect(Math.abs(rest.goldLead - orig.goldLead)).toBeLessThanOrEqual(100);
    }
  });

  it("restores notableEvents with exact text, minute ±0.1, probDelta ±0.01", () => {
    const original = buildRealisticRecap();
    const { slim, compact } = encodeRecapHeavyFields(original);
    const restored = decodeRecapHeavyFields(slim, compact);

    expect(restored.notableEvents).toBeDefined();
    expect(restored.notableEvents!.length).toBe(
      original.notableEvents!.length,
    );

    for (let i = 0; i < original.notableEvents!.length; i++) {
      const orig = original.notableEvents![i];
      const rest = restored.notableEvents![i];
      expect(rest.description).toBe(orig.description);
      expect(rest.type).toBe(orig.type);
      expect(rest.side).toBe(orig.side);
      expect(Math.abs(rest.minute - orig.minute)).toBeLessThanOrEqual(0.1);
      expect(Math.abs(rest.probDelta - orig.probDelta)).toBeLessThanOrEqual(
        0.01,
      );
    }
  });

  it("restores perPickKDA with exact integer values", () => {
    const original = buildRealisticRecap();
    const { slim, compact } = encodeRecapHeavyFields(original);
    const restored = decodeRecapHeavyFields(slim, compact);

    expect(restored.perPickKDA).toBeDefined();
    for (let i = 0; i < 5; i++) {
      const origB = original.perPickKDA!.blue[i];
      const restB = restored.perPickKDA!.blue[i];
      expect(restB.k).toBe(origB.k);
      expect(restB.d).toBe(origB.d);
      expect(restB.a).toBe(origB.a);

      const origR = original.perPickKDA!.red[i];
      const restR = restored.perPickKDA!.red[i];
      expect(restR.k).toBe(origR.k);
      expect(restR.d).toBe(origR.d);
      expect(restR.a).toBe(origR.a);
    }
  });

  it("restores ratings exact to one decimal place", () => {
    const original = buildRealisticRecap();
    const { slim, compact } = encodeRecapHeavyFields(original);
    const restored = decodeRecapHeavyFields(slim, compact);

    expect(restored.ratings).toBeDefined();
    for (let i = 0; i < 5; i++) {
      expect(restored.ratings!.blue[i]).toBeCloseTo(
        original.ratings!.blue[i],
        1,
      );
      expect(restored.ratings!.red[i]).toBeCloseTo(
        original.ratings!.red[i],
        1,
      );
    }
  });

  it("preserves lightweight recap fields (mvp, biggestSwing, etc.) untouched", () => {
    const original = buildRealisticRecap();
    const { slim, compact } = encodeRecapHeavyFields(original);
    const restored = decodeRecapHeavyFields(slim, compact);

    expect(restored.durationMinutes).toBe(original.durationMinutes);
    expect(restored.mvp).toEqual(original.mvp);
    expect(restored.laneGoldDiff).toEqual(original.laneGoldDiff);
    expect(restored.biggestSwing).toEqual(original.biggestSwing);
  });

  it("slim recap has no heavy fields", () => {
    const original = buildRealisticRecap();
    const { slim } = encodeRecapHeavyFields(original);

    expect(slim.winProbTimeline).toBeUndefined();
    expect(slim.goldLeadTimeline).toBeUndefined();
    expect(slim.notableEvents).toBeUndefined();
    expect(slim.perPickKDA).toBeUndefined();
    expect(slim.ratings).toBeUndefined();
  });
});

// ── Compression ratio test ────────────────────────────────────────────────────

describe("compression ratio", () => {
  it("achieves ≥ 3× reduction in JSON size for the heavy fields", () => {
    const original = buildRealisticRecap();
    const { compact } = encodeRecapHeavyFields(original);

    // Raw size: JSON of just the heavy fields from the original recap.
    const heavyFieldsRaw = {
      winProbTimeline: original.winProbTimeline,
      goldLeadTimeline: original.goldLeadTimeline,
      notableEvents: original.notableEvents,
      perPickKDA: original.perPickKDA,
      ratings: original.ratings,
    };
    const rawSize = JSON.stringify(heavyFieldsRaw).length;
    const compactSize = JSON.stringify(compact).length;

    // Assert at least 3× reduction.
    expect(rawSize).toBeGreaterThan(compactSize * 3);

    // Log for visibility (vitest will show this on failure).
    const ratio = rawSize / compactSize;
    expect(ratio).toBeGreaterThanOrEqual(3);
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────────

describe("edge cases", () => {
  it("handles a recap with no heavy fields gracefully", () => {
    const minRecap: GameRecap = {
      durationMinutes: 28,
      mvp: null,
      biggestSwing: null,
    };
    const { slim, compact } = encodeRecapHeavyFields(minRecap);
    expect(slim.winProbTimeline).toBeUndefined();
    expect(compact.wp).toBeUndefined();
    expect(compact.gl).toBeUndefined();
    expect(compact.ne).toBeUndefined();
    expect(compact.kda).toBeUndefined();
    expect(compact.rt).toBeUndefined();

    const restored = decodeRecapHeavyFields(slim, compact);
    expect(restored.winProbTimeline).toBeUndefined();
    expect(restored.durationMinutes).toBe(28);
  });

  it("decodeRecapHeavyFields with undefined compact returns recap unchanged", () => {
    const minRecap: GameRecap = { durationMinutes: 30, mvp: null, biggestSwing: null };
    const result = decodeRecapHeavyFields(minRecap, undefined);
    expect(result).toEqual(minRecap);
  });

  it("slimRecapFallback strips all heavy fields", () => {
    const original = buildRealisticRecap();
    const slimmed = slimRecapFallback(original);

    expect(slimmed.winProbTimeline).toBeUndefined();
    expect(slimmed.goldLeadTimeline).toBeUndefined();
    expect(slimmed.notableEvents).toBeUndefined();
    expect(slimmed.perPickKDA).toBeUndefined();
    expect(slimmed.durationMinutes).toBe(original.durationMinutes);
    expect(slimmed.mvp).toEqual(original.mvp);
    // ratings are NOT stripped by slimRecapFallback (small field)
  });

  it("memoized encode returns the IDENTICAL object for the same recap reference", () => {
    const recap = buildRealisticRecap();
    const first = encodeRecapForPersistCached(recap);
    const second = encodeRecapForPersistCached(recap);
    expect(second).toBe(first); // identity, not just deep-equality
    expect(first.recapC.wp).toBeDefined();
  });

  it("a mutated-by-replacement recap (new object identity) re-encodes", () => {
    const recap = buildRealisticRecap();
    const first = encodeRecapForPersistCached(recap);
    // Simulate the store's immutable-update pattern: a NEW recap object
    // with different content replaces the old one.
    const replaced: GameRecap = {
      ...buildRealisticRecap(),
      durationMinutes: 99,
      winProbTimeline: [{ minute: 1, blueProb: 0.75 }],
    };
    const second = encodeRecapForPersistCached(replaced);
    expect(second).not.toBe(first);
    expect(second.durationMinutes).toBe(99);
    expect(second.recapC.wp).toEqual([10, 75]);
  });

  it("compactEncodeTournamentForPersist single-entry memo + per-match cache", () => {
    const makeMatch = (id: string) => ({
      id,
      series: {
        games: [
          { recap: buildRealisticRecap() },
          { recap: buildRealisticRecap() },
        ],
      },
    });
    const tournament = {
      id: "t1",
      matches: [makeMatch("m1"), makeMatch("m2")],
    } as unknown as TournamentState;

    // Same tournament reference → identical result object (single-entry memo).
    const first = compactEncodeTournamentForPersist(tournament);
    const second = compactEncodeTournamentForPersist(tournament);
    expect(second).toBe(first);

    // New tournament identity but unchanged match objects → encoded matches
    // come from the per-match cache (identical references), only the
    // top-level wrapper is rebuilt.
    const shallowCopy = { ...tournament };
    const third = compactEncodeTournamentForPersist(shallowCopy);
    expect(third).not.toBe(first);
    expect(third.matches[0]).toBe(first.matches[0]);
    expect(third.matches[1]).toBe(first.matches[1]);

    // Replacing ONE match re-encodes only that match.
    const replacedMatch = makeMatch("m2");
    const mutated = {
      ...tournament,
      matches: [tournament.matches[0], replacedMatch],
    } as unknown as TournamentState;
    const fourth = compactEncodeTournamentForPersist(mutated);
    expect(fourth.matches[0]).toBe(first.matches[0]);
    expect(fourth.matches[1]).not.toBe(first.matches[1]);
    // The freshly-encoded match still carries compact recaps.
    const g0 = fourth.matches[1].series!.games[0] as {
      recap?: GameRecap & { recapC?: RecapCompact };
    };
    expect(g0.recap?.recapC?.wp).toBeDefined();
    expect(g0.recap?.winProbTimeline).toBeUndefined();
  });

  it("double round-trip is idempotent", () => {
    const original = buildRealisticRecap();
    const { slim: slim1, compact: compact1 } = encodeRecapHeavyFields(original);
    const restored1 = decodeRecapHeavyFields(slim1, compact1);

    // Encode the already-decoded recap again.
    const { slim: slim2, compact: compact2 } = encodeRecapHeavyFields(restored1);
    const restored2 = decodeRecapHeavyFields(slim2, compact2);

    // Compact payloads should be identical (same integers after encode).
    expect(compact1.wp).toEqual(compact2.wp);
    expect(compact1.gl).toEqual(compact2.gl);
    expect(compact1.kda).toEqual(compact2.kda);
    expect(compact1.rt).toEqual(compact2.rt);

    // Restored values should match within precision after double round-trip.
    for (let i = 0; i < original.winProbTimeline!.length; i++) {
      expect(Math.abs(
        restored2.winProbTimeline![i].blueProb -
        restored1.winProbTimeline![i].blueProb,
      )).toBeLessThanOrEqual(0.001);
    }
  });
});
