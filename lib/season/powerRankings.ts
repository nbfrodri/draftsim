// Narrative power rankings — a derived, always-available readout that blends
// roster strength, current form, the most recent result, and a light
// meta-fit score into one ranked board with "team of the split / biggest
// riser / faller" callouts. Pure UI on top of state the season already
// tracks: it needs no new persisted fields and works with every realism flag
// off (the form terms simply read 0).

import { deriveStar } from "../players";
import { CHAMPION_META, TIER_VALUE, type MetaTier } from "../championMeta";
import type { Champion, Lane } from "../types";
import { tournamentPlacements } from "./engine";
import type { SeasonState, SeasonTeam } from "./types";

export type PowerTag = "team-of-split" | "biggest-riser" | "biggest-faller";
export type PowerMovement = "up" | "down" | "flat";

export interface PowerRankingRow {
  team: SeasonTeam;
  rank: number;
  /** Blended power score in star-equivalent units (higher = stronger). */
  score: number;
  /** Base roster strength (deriveStar), 1..5. */
  star: number;
  /** Current form modifier in [-1, 1] (0 when formDrift is off). */
  form: number;
  /** Normalized finish in the team's most recent completed event, in
   *  [-1, 1] (+1 = won it, -1 = finished last); 0 when none played yet. */
  recent: number;
  /** Light roster-vs-meta fit in [-1, 1] (0 when champions aren't supplied). */
  metaFit: number;
  /** Trend glyph, derived from the sign of form. */
  movement: PowerMovement;
  tags: PowerTag[];
}

// Blend weights (star-equivalent units). Star is the spine; the rest are
// gentle nudges so a hot mid-tier team can leapfrog a cold strong one, but
// the rating gap still dominates.
const FORM_WEIGHT = 0.5;
const RECENT_WEIGHT = 0.5;
const META_WEIGHT = 0.3;
// Form magnitude past which the movement glyph reads as trending.
const MOVEMENT_THRESHOLD = 0.05;

// Effective tier of a champion-lane under the season's current override,
// falling back to the baseline tier table (mirrors history.ts).
function effectiveTier(
  override: Record<string, Partial<Record<Lane, MetaTier>>> | null,
  alias: string,
  lane: Lane,
): MetaTier | null {
  return (
    override?.[alias]?.[lane] ?? CHAMPION_META[alias]?.metaTiers?.[lane] ?? null
  );
}

// Light meta-fit: how strong, on average, are the champions this roster
// actually plays (each player's goodChamps in their own lane) under the
// current meta. Centered and scaled to roughly [-1, 1]. Returns 0 when no
// champion list is supplied or the roster has no rated comfort picks.
function metaFitScore(
  team: SeasonTeam,
  championsById: Map<number, Champion>,
  override: Record<string, Partial<Record<Lane, MetaTier>>> | null,
): number {
  if (championsById.size === 0) return 0;
  const perPlayer: number[] = [];
  for (const p of team.players) {
    const tiers: number[] = [];
    for (const champId of p.goodChamps) {
      const champ = championsById.get(champId);
      if (!champ) continue;
      const tier = effectiveTier(override, champ.alias, p.lane);
      if (tier) tiers.push(TIER_VALUE[tier]);
    }
    if (tiers.length > 0) {
      perPlayer.push(tiers.reduce((a, b) => a + b, 0) / tiers.length);
    }
  }
  if (perPlayer.length === 0) return 0;
  const avg = perPlayer.reduce((a, b) => a + b, 0) / perPlayer.length;
  // TIER_VALUE spans 1 (D) .. 6 (S+); 3.5 is the neutral midpoint.
  return Math.max(-1, Math.min(1, (avg - 3.5) / 2.5));
}

// The team's normalized finish in its most recent completed event: walk the
// phases newest-first and return the first completed tournament the team
// played in. +1 = won, -1 = finished last, 0 = nothing played yet.
function recentFinish(season: SeasonState, teamId: string): number {
  for (let i = Math.min(season.phaseIndex, season.phases.length - 1); i >= 0; i--) {
    const phase = season.phases[i];
    if (!phase) continue;
    for (const tid of phase.tournamentIds) {
      const t = season.tournaments[tid];
      if (!t || t.status !== "complete") continue;
      const placements = tournamentPlacements(t);
      const idx = placements.indexOf(teamId);
      if (idx < 0) continue;
      if (placements.length < 2) return 0;
      const normalized = (placements.length - 1 - idx) / (placements.length - 1);
      return normalized * 2 - 1; // [0,1] → [-1,1]
    }
  }
  return 0;
}

/** Rank every team in the season by a blended power score, with trend
 *  glyphs and "team of the split / biggest riser / faller" tags. Pure —
 *  pass `champions` to enable the light meta-fit term (omit for none). */
export function computePowerRankings(
  season: SeasonState,
  champions: readonly Champion[] = [],
): PowerRankingRow[] {
  const championsById = new Map(champions.map((c) => [c.id, c]));
  const override = season.currentMeta?.metaOverride ?? null;
  const form = season.teamForm ?? {};

  const rows: PowerRankingRow[] = season.teams.map((team) => {
    const star = deriveStar(team.players);
    const f = form[team.id] ?? 0;
    const recent = recentFinish(season, team.id);
    const metaFit = metaFitScore(team, championsById, override);
    const score =
      star + f * FORM_WEIGHT + recent * RECENT_WEIGHT + metaFit * META_WEIGHT;
    const movement: PowerMovement =
      f > MOVEMENT_THRESHOLD ? "up" : f < -MOVEMENT_THRESHOLD ? "down" : "flat";
    return {
      team,
      rank: 0,
      score,
      star,
      form: f,
      recent,
      metaFit,
      movement,
      tags: [],
    };
  });

  rows.sort((a, b) => b.score - a.score || a.team.name.localeCompare(b.team.name));
  rows.forEach((r, i) => (r.rank = i + 1));

  // Tags: rank-1 is team of the split; the strongest positive/negative form
  // are the biggest riser/faller (only when the trend is real).
  if (rows.length > 0) rows[0].tags.push("team-of-split");
  let riser: PowerRankingRow | null = null;
  let faller: PowerRankingRow | null = null;
  for (const r of rows) {
    if (r.form > MOVEMENT_THRESHOLD && (!riser || r.form > riser.form)) riser = r;
    if (r.form < -MOVEMENT_THRESHOLD && (!faller || r.form < faller.form)) faller = r;
  }
  if (riser) riser.tags.push("biggest-riser");
  if (faller) faller.tags.push("biggest-faller");

  return rows;
}
