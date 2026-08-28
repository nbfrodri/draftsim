// Compact encode/decode for GameRecap heavy fields.
//
// Goal: ≥ 3× size reduction vs raw JSON while keeping decode precision within
// the tolerances the chart components need (prob within 0.01, gold within 100).
//
// Encoding strategy:
//   winProbTimeline  — each entry {minute, blueProb} encoded as two integers:
//                      minute×10 (tenths) and blueProb×100 (integer percent).
//                      Stored as a flat Int16Array-compatible number array
//                      [m0, p0, m1, p1, ...].
//   goldLeadTimeline — each entry {minute, goldLead} encoded as two integers:
//                      minute×10 and goldLead÷100 (hundreds). Stored as a flat
//                      number array [m0, g0, m1, g1, ...].
//   notableEvents    — kept as an array of compact objects (side as 0/1, type
//                      as short string, minute×10, probDelta×100 as integer,
//                      description kept verbatim — it is already a short string).
//   perPickKDA       — flat number array [bk0,bd0,ba0,...(×5), rk0,...(×5)].
//   ratings          — flat number array [b0..b4, r0..r4] stored as integer
//                      tenths (×10), decoded back to one decimal.
//
// The encoded form is stored under `recapC` on the persisted game recap; the
// verbose fields are omitted. On rehydration the inverse path restores them.
//
// Round-trip guarantees:
//   winProbTimeline  blueProb: within 0.01 (encoded as integer percent, ÷100)
//   goldLeadTimeline goldLead: within 100  (encoded as ÷100 int, ×100 decoded)
//   notableEvents    minute within 0.1, probDelta within 0.01, text exact
//   perPickKDA       exact integers (k/d/a are always whole numbers)
//   ratings          exact to one decimal (stored as ×10 integer, ÷10 decoded)

import type { GameRecap } from "./types";
import type { Side } from "./types";
// Type-only imports — erased at compile time, so no runtime cycle with
// lib/tournament.ts is possible.
import type { TournamentMatch, TournamentState } from "./tournament";
import type { SeasonState } from "./season/types";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Compact event entry stored in recapC.ne */
interface CompactEvent {
  /** minute×10 as integer */
  m: number;
  /** 0=blue, 1=red */
  s: 0 | 1;
  /** event type string (short) */
  t: string;
  /** description verbatim */
  d: string;
  /** probDelta×100 as integer */
  p: number;
}

/**
 * The compact payload stored under `recapC` on a persisted GameRecap.
 * All verbose heavy fields are removed from the recap and replaced by this.
 */
export interface RecapCompact {
  /** winProbTimeline: flat [minute×10, blueProb×100, ...] */
  wp?: number[];
  /** goldLeadTimeline: flat [minute×10, goldLead÷100 integer, ...] */
  gl?: number[];
  /** notableEvents compact array */
  ne?: CompactEvent[];
  /** perPickKDA flat: [bk0,bd0,ba0,bk1,...(5 blue), rk0,...(5 red)] */
  kda?: number[];
  /** ratings flat ×10 integers: [b0..b4, r0..r4] */
  rt?: number[];
}

// ── Encode ────────────────────────────────────────────────────────────────────

/**
 * Encode the heavy fields of a GameRecap into a compact RecapCompact object.
 * Returns the compact payload and a new recap object with those fields removed.
 * Safe to call on recaps that are already missing some fields (they're optional).
 */
export function encodeRecapHeavyFields(recap: GameRecap): {
  slim: GameRecap;
  compact: RecapCompact;
} {
  const compact: RecapCompact = {};

  // winProbTimeline → flat [m×10, p×100, ...]
  if (recap.winProbTimeline && recap.winProbTimeline.length > 0) {
    const wp: number[] = [];
    for (const pt of recap.winProbTimeline) {
      wp.push(Math.round(pt.minute * 10), Math.round(pt.blueProb * 100));
    }
    compact.wp = wp;
  }

  // goldLeadTimeline → flat [m×10, g÷100, ...]
  if (recap.goldLeadTimeline && recap.goldLeadTimeline.length > 0) {
    const gl: number[] = [];
    for (const pt of recap.goldLeadTimeline) {
      gl.push(Math.round(pt.minute * 10), Math.round(pt.goldLead / 100));
    }
    compact.gl = gl;
  }

  // notableEvents → compact objects
  if (recap.notableEvents && recap.notableEvents.length > 0) {
    compact.ne = recap.notableEvents.map((e) => ({
      m: Math.round(e.minute * 10),
      s: (e.side === "blue" ? 0 : 1) as 0 | 1,
      t: e.type,
      d: e.description,
      p: Math.round(e.probDelta * 100),
    } as CompactEvent));
  }

  // perPickKDA → flat array
  if (recap.perPickKDA) {
    const kda: number[] = [];
    for (const entry of recap.perPickKDA.blue) {
      kda.push(entry.k, entry.d, entry.a);
    }
    for (const entry of recap.perPickKDA.red) {
      kda.push(entry.k, entry.d, entry.a);
    }
    compact.kda = kda;
  }

  // ratings → flat ×10 integers
  if (recap.ratings) {
    const rt: number[] = [];
    for (const r of recap.ratings.blue) rt.push(Math.round(r * 10));
    for (const r of recap.ratings.red) rt.push(Math.round(r * 10));
    compact.rt = rt;
  }

  // Build slimmed recap: remove heavy fields, preserve all others
  const slim: GameRecap = { ...recap };
  delete slim.winProbTimeline;
  delete slim.goldLeadTimeline;
  delete slim.notableEvents;
  delete slim.perPickKDA;
  delete slim.ratings;

  return { slim, compact };
}

// ── Decode ────────────────────────────────────────────────────────────────────

/**
 * Decode a RecapCompact back into the heavy fields and merge them onto a
 * (slim) GameRecap, returning a fully-populated GameRecap.
 * Safe to call when compact is empty/undefined — returns recap unchanged.
 */
export function decodeRecapHeavyFields(
  recap: GameRecap,
  compact: RecapCompact | undefined,
): GameRecap {
  if (!compact) return recap;

  const result: GameRecap = { ...recap };

  // winProbTimeline
  if (compact.wp && compact.wp.length >= 2) {
    const timeline: Array<{ minute: number; blueProb: number }> = [];
    for (let i = 0; i + 1 < compact.wp.length; i += 2) {
      timeline.push({
        minute: compact.wp[i] / 10,
        blueProb: compact.wp[i + 1] / 100,
      });
    }
    result.winProbTimeline = timeline;
  }

  // goldLeadTimeline
  if (compact.gl && compact.gl.length >= 2) {
    const timeline: Array<{ minute: number; goldLead: number }> = [];
    for (let i = 0; i + 1 < compact.gl.length; i += 2) {
      timeline.push({
        minute: compact.gl[i] / 10,
        goldLead: compact.gl[i + 1] * 100,
      });
    }
    result.goldLeadTimeline = timeline;
  }

  // notableEvents
  if (compact.ne && compact.ne.length > 0) {
    result.notableEvents = compact.ne.map((e) => ({
      minute: e.m / 10,
      side: (e.s === 0 ? "blue" : "red") as Side,
      type: e.t,
      description: e.d,
      probDelta: e.p / 100,
    }));
  }

  // perPickKDA
  if (compact.kda && compact.kda.length >= 30) {
    const blue: Array<{ k: number; d: number; a: number }> = [];
    const red: Array<{ k: number; d: number; a: number }> = [];
    for (let i = 0; i < 5; i++) {
      const base = i * 3;
      blue.push({ k: compact.kda[base], d: compact.kda[base + 1], a: compact.kda[base + 2] });
    }
    for (let i = 0; i < 5; i++) {
      const base = 15 + i * 3;
      red.push({ k: compact.kda[base], d: compact.kda[base + 1], a: compact.kda[base + 2] });
    }
    result.perPickKDA = { blue, red };
  }

  // ratings
  if (compact.rt && compact.rt.length >= 10) {
    const blue: number[] = [];
    const red: number[] = [];
    for (let i = 0; i < 5; i++) blue.push(compact.rt[i] / 10);
    for (let i = 5; i < 10; i++) red.push(compact.rt[i] / 10);
    result.ratings = { blue, red };
  }

  return result;
}

// ── Memoized persist encoding ─────────────────────────────────────────────────
//
// Game recaps are immutable once created (the store only ever replaces them
// wholesale), so the persisted/encoded form can be cached by OBJECT IDENTITY.
// zustand-persist runs `partialize` on EVERY set() — without this cache, every
// state change (even a single draft click) re-encoded every recap of the whole
// tournament. With it, only recaps the cache has never seen pay encoding cost.
// Invalidation is automatic: a replaced recap is a new object → cache miss.
// WeakMap keys don't pin the recaps in memory, so old entries are GC'd along
// with the recaps themselves.

/** A GameRecap in its persisted form: heavy fields stripped, recapC attached. */
export type PersistEncodedRecap = GameRecap & { recapC: RecapCompact };

const encodedRecapCache = new WeakMap<GameRecap, PersistEncodedRecap>();

/**
 * Memoized variant of encodeRecapHeavyFields that returns the final persisted
 * recap shape ({...slim, recapC}). Repeat calls with the SAME recap object
 * return the IDENTICAL cached result object.
 */
export function encodeRecapForPersistCached(recap: GameRecap): PersistEncodedRecap {
  const hit = encodedRecapCache.get(recap);
  if (hit) return hit;
  const { slim, compact } = encodeRecapHeavyFields(recap);
  const encoded: PersistEncodedRecap = { ...slim, recapC: compact };
  encodedRecapCache.set(recap, encoded);
  return encoded;
}

// Per-match cache: matches are also treated immutably by the store (every
// update maps to a fresh object), so an unchanged match maps to the identical
// encoded match — skipping even the per-game spread work.
const encodedMatchCache = new WeakMap<TournamentMatch, TournamentMatch>();

// Single-entry memo for the whole-tournament call: partialize frequently runs
// with a tournament reference that hasn't changed at all (sets touching only
// unrelated state). In that case return the previous result outright.
let lastTournamentInput: TournamentState | null = null;
let lastTournamentResult: TournamentState | null = null;

/**
 * Compact-encode the active tournament's game recaps for persistence.
 * Each game's heavy fields (winProbTimeline, goldLeadTimeline, notableEvents,
 * perPickKDA, ratings) are replaced by a single `recapC` field holding their
 * compressed representation. All lightweight fields (mvp, biggestSwing,
 * durationMinutes, laneGoldDiff) remain untouched.
 *
 * Memoized at three levels (tournament reference → match reference → recap
 * reference) so repeated persist cycles only pay for what actually changed.
 */
export function compactEncodeTournamentForPersist(
  tournament: TournamentState,
): TournamentState {
  if (tournament === lastTournamentInput && lastTournamentResult !== null) {
    return lastTournamentResult;
  }
  const result: TournamentState = {
    ...tournament,
    matches: tournament.matches.map((m) => {
      if (!m.series) return m;
      const cached = encodedMatchCache.get(m);
      if (cached) return cached;
      const encoded: TournamentMatch = {
        ...m,
        series: {
          ...m.series,
          games: m.series.games.map((g) =>
            g.recap ? { ...g, recap: encodeRecapForPersistCached(g.recap) } : g,
          ),
        },
      };
      encodedMatchCache.set(m, encoded);
      return encoded;
    }),
  };
  lastTournamentInput = tournament;
  lastTournamentResult = result;
  return result;
}

// ── Tournament / season decode (rehydration) ─────────────────────────────────

/** Decode compact-encoded recaps in one tournament back to full form. */
export function decodeCompactTournament(tournament: TournamentState): TournamentState {
  return {
    ...tournament,
    matches: tournament.matches.map((m) => {
      if (!m.series) return m;
      return {
        ...m,
        series: {
          ...m.series,
          games: m.series.games.map((g) => {
            if (!g.recap) return g;
            const recap = g.recap as typeof g.recap & { recapC?: RecapCompact };
            const compact = recap.recapC;
            if (!compact) return g;
            const full = decodeRecapHeavyFields(recap, compact);
            const withoutC = { ...full } as typeof full & { recapC?: unknown };
            delete withoutC.recapC;
            return { ...g, recap: withoutC };
          }),
        },
      };
    }),
  };
}

/** True when any game recap still carries a persisted recapC payload. */
export function tournamentHasCompactRecaps(tournament: TournamentState): boolean {
  for (const m of tournament.matches) {
    if (!m.series) continue;
    for (const g of m.series.games) {
      const recap = g.recap as (typeof g.recap & { recapC?: RecapCompact }) | undefined;
      if (recap?.recapC) return true;
    }
  }
  return false;
}

export function seasonHasCompactRecaps(season: SeasonState): boolean {
  for (const t of Object.values(season.tournaments)) {
    if (tournamentHasCompactRecaps(t)) return true;
  }
  return false;
}

/** Decode every stage tournament in a season (no-op when already decoded). */
export function decodeCompactSeason(season: SeasonState): SeasonState {
  if (!seasonHasCompactRecaps(season)) return season;
  return {
    ...season,
    tournaments: Object.fromEntries(
      Object.entries(season.tournaments).map(([id, t]) => [
        id,
        decodeCompactTournament(t),
      ]),
    ),
  };
}

// ── Season persist encoding (memoized) ───────────────────────────────────────

let lastSeasonInput: SeasonState | null = null;
let lastSeasonResult: SeasonState | null = null;

/**
 * Compact-encode every tournament in a season for persistence. Memoized by
 * season reference — unchanged seasons cost nothing across set() bursts.
 */
export function compactEncodeSeasonForPersist(season: SeasonState): SeasonState {
  if (season === lastSeasonInput && lastSeasonResult !== null) {
    return lastSeasonResult;
  }
  const result: SeasonState = {
    ...season,
    tournaments: Object.fromEntries(
      Object.entries(season.tournaments).map(([id, t]) => [
        id,
        compactEncodeTournamentForPersist(t),
      ]),
    ),
  };
  lastSeasonInput = season;
  lastSeasonResult = result;
  return result;
}

// ── Slim fallback (quota exceeded) ───────────────────────────────────────────

/**
 * Strip all heavy fields from a GameRecap (the old slimming behaviour used as
 * a last-resort quota fallback). Does not store a compact form — data is lost
 * for this session's persistence but the in-memory store is unaffected.
 */
export function slimRecapFallback(recap: GameRecap): GameRecap {
  const s = { ...recap };
  delete s.winProbTimeline;
  delete s.goldLeadTimeline;
  delete s.notableEvents;
  delete s.perPickKDA;
  return s;
}
