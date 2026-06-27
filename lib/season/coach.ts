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
