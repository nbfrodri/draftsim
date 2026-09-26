// Team coaches. A coach's RATING scales how strongly the team's draft AI plays
// (it maps to the AI difficulty used for that team's side in every match —
// auto-sim and watch-live alike). The coach also carries the team's draft
// PERSONALITY (playstyle) and a META-ADAPTABILITY trait. Coaches are part of
// the roster: they can be transferred, and their name comes from the handle
// generator (real coach-name fetch is a future refinement).

import type { AIDifficulty } from "../types";
import { deriveStar, type RNG } from "../players";
import { PERSONALITY_LIST, getPersonality } from "../draftAI";
import { generateHandle } from "./playerNames";
import type { SeasonCoachMove } from "./types";

export interface Coach {
  id: string;
  name: string;
  rating: number; // 1..5 — drives AI draft strength
  personalityId: string; // the team's drafting playstyle
  adaptability: number; // 0..1 — how well they ride meta/patch shifts
  motivation: number; // 0..1 — how much the team rides momentum (form swings)
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Coach rating → the AI difficulty the team drafts at. A great coach (4+)
 *  drafts "hard"; a poor one (<2.5) "easy". Undefined coach → undefined, so
 *  the match falls back to the global AI difficulty. */
export function coachDifficulty(coach: Coach | undefined): AIDifficulty | undefined {
  if (!coach) return undefined;
  return coach.rating >= 4 ? "hard" : coach.rating >= 2.5 ? "normal" : "easy";
}

/** A human-readable label for the coach's playstyle (from their personality). */
export function coachPlaystyle(coach: Coach | undefined): string {
  if (!coach) return "";
  return getPersonality(coach.personalityId)?.name ?? "";
}

/** How strongly the team rides momentum: a great motivator amplifies form
 *  swings (hotter on win streaks, colder on losing ones), a poor one dampens
 *  them. ~0.6× … 1.4× the base form effect. Only matters with form drift on. */
export function coachMotivationFactor(coach: Coach | undefined): number {
  return 0.6 + 0.8 * (coach?.motivation ?? 0.5);
}

/** The team's meta-adaptation trait, in [-1, +1], driven by the coach: an
 *  adaptable coach (→1) helps the team ride balance patches, a rigid one (→0)
 *  gets punished. Centered so a neutral/absent coach is 0. Feeds the
 *  patch-shift form swing (teamAdaptability). */
export function coachAdaptabilityTrait(coach: Coach | undefined): number {
  if (!coach) return 0;
  return Math.round(((coach.adaptability ?? 0.5) - 0.5) * 2 * 100) / 100;
}

// In-season coach development. A coach's reputation isn't fixed: over- or
// under-performing the team's seed moves their rating, with regression toward
// the mean (3) so ratings never all pile at the ceiling — there are always
// rising and falling coaches.
export const COACH_LEARN = 0.25; // how far a result moves the rating
export const COACH_REGRESS = 0.12; // pull back toward the mean each event

/** Next coach rating after a result. `perf` is finish-vs-seed in [-1, +1]
 *  (>0 = over-performed expectations). Clamped to 1..5, one decimal. */
export function nextCoachRating(rating: number, perf: number): number {
  const r = Number.isFinite(rating) ? rating : 3;
  const drift = perf * COACH_LEARN - COACH_REGRESS * ((r - 3) / 2);
  return Math.round(clamp(r + drift, 1, 5) * 10) / 10;
}

/** How much the coach tilts player development. A top coach (5) nudges players
 *  to grow and shields decline; a poor one (1) the reverse; neutral/absent
 *  is 0. Added directly to a player's per-step tier-up probability. */
export const COACH_DEV_TILT = 0.08;
export function coachDevTilt(coach: Coach | undefined): number {
  if (!coach) return 0;
  const r = Number.isFinite(coach.rating) ? coach.rating : 3;
  return ((r - 3) / 2) * COACH_DEV_TILT;
}

/** Offseason coach market (user-driven): swap the coaches of two teams so the
 *  user can hire away a rival's coach while every team stays staffed. Pure —
 *  returns a new teams array (only the two affected teams get new refs). */
export function swapCoaches<T extends { id: string; coach?: Coach }>(
  teams: readonly T[],
  idA: string,
  idB: string,
): T[] {
  if (idA === idB) return teams as T[];
  const a = teams.find((t) => t.id === idA);
  const b = teams.find((t) => t.id === idB);
  if (!a || !b) return teams as T[];
  return teams.map((t) =>
    t.id === idA ? { ...t, coach: b.coach } : t.id === idB ? { ...t, coach: a.coach } : t,
  );
}

/** Generate a coach whose rating loosely tracks the team's strength. */
export function makeCoach(star: number, rng: RNG, taken: Set<string>): Coach {
  const rating = Math.round(clamp(star + (rng() * 2 - 1) * 1.3, 1, 5) * 10) / 10;
  return {
    id: `coach-${Math.floor(rng() * 1e9).toString(36)}`,
    name: generateHandle(rng, taken),
    rating,
    personalityId: PERSONALITY_LIST[Math.floor(rng() * PERSONALITY_LIST.length)].id,
    adaptability: Math.round(rng() * 100) / 100,
    motivation: Math.round(rng() * 100) / 100,
  };
}

// Offseason coach market: a few beneficial swaps that nudge better coaches
// toward stronger teams (assortative matching by team star ≈ coach rating).
// Pure — returns new team objects only for teams whose coach changed.
export function reassignCoaches<
  T extends { id: string; players: Parameters<typeof deriveStar>[0]; coach?: Coach },
>(teams: readonly T[], rng: RNG, swaps = 5, skipTeamId?: string): T[] {
  const arr = teams.map((t) => ({ ...t }));
  const starOf = (t: T) => deriveStar(t.players);
  const fit = (star: number, rating: number) => -Math.abs(star - rating); // both 1..5
  for (let n = 0; n < swaps && arr.length > 1; n++) {
    const i = Math.floor(rng() * arr.length);
    const j = Math.floor(rng() * arr.length);
    if (i === j) continue;
    const a = arr[i];
    const b = arr[j];
    // Leave the user-controlled team's coach alone — they pick it themselves
    // in the offseason coach market.
    if (a.id === skipTeamId || b.id === skipTeamId) continue;
    if (!a.coach || !b.coach) continue;
    const before = fit(starOf(a), a.coach.rating) + fit(starOf(b), b.coach.rating);
    const after = fit(starOf(a), b.coach.rating) + fit(starOf(b), a.coach.rating);
    if (after > before) {
      const tmp = a.coach;
      a.coach = b.coach;
      b.coach = tmp;
    }
  }
  return arr;
}

/**
 * Coach moves between two points in time: `before` = each team's coach as
 * snapshotted (id when recorded, else the unique handle), `after` = the live
 * teams. A team whose coach changed yields one move (arriving coach, from the
 * team that had them). Coaches that weren't on any team before are skipped —
 * unknown origin is not a move we can attribute.
 */
export function diffCoachMoves(
  before: ReadonlyArray<{ teamId: string; coach?: { id?: string; name: string } }>,
  after: ReadonlyArray<{ id: string; coach?: Coach }>,
): SeasonCoachMove[] {
  const same = (a: { id?: string; name: string }, b: Coach) =>
    a.id ? a.id === b.id : a.name === b.name;
  const moves: SeasonCoachMove[] = [];
  for (const team of after) {
    const now = team.coach;
    if (!now) continue;
    const was = before.find((b) => b.teamId === team.id)?.coach;
    if (!was || same(was, now)) continue;
    const from = before.find((b) => b.coach && same(b.coach, now));
    if (!from) continue;
    moves.push({ coachId: now.id, coachName: now.name, rating: now.rating, fromTeamId: from.teamId, toTeamId: team.id });
  }
  return moves;
}
