// Per-season "story" recap — a deterministic, templated narrative of one
// season: the champion's headline, the biggest upset, the team of the year,
// the region that rose, and the season's defining meta swing. Computed from
// the full SeasonState (it needs the match-level data in season.tournaments
// to find the biggest upset) and archived on the history entry so the Hall
// of Seasons can replay it for past seasons. Pure & self-contained — every
// field is optional, so a half-finished or sparse season just yields fewer
// lines.

import {
  CHAMPION_META,
  TIER_ORDER,
  type MetaOverride,
  type MetaTier,
} from "../championMeta";
import { tournamentRoundDepth } from "../tournament";
import type { Lane } from "../types";
import {
  INTERNATIONAL_LABELS,
  LEAGUE_IDS,
  type InternationalId,
  type LeagueId,
  type SeasonState,
} from "./types";

/** Lightweight team reference (mirrors SeasonHistoryTeamRef, kept local so
 *  this module has no dependency on the history layer that consumes it). */
export interface StoryTeamRef {
  name: string;
  leagueId: LeagueId;
  color: string;
  iconKey: string;
  logoUrl?: string;
}

export interface SeasonStoryUpset {
  winner: StoryTeamRef;
  loser: StoryTeamRef;
  /** Tournament the upset happened in (e.g. "World Championship"). */
  event: string;
  /** Knockout round label, when the match was a bracket match. */
  round?: string;
  /** Star-rating gap the underdog overcame (loser ★ − winner ★). */
  starGap: number;
}

export interface SeasonStoryMeta {
  alias: string;
  lane: Lane;
  from: MetaTier;
  to: MetaTier;
}

export interface SeasonStory {
  champion?: StoryTeamRef;
  runnerUp?: StoryTeamRef;
  biggestUpset?: SeasonStoryUpset;
  /** Most-decorated franchise of the year and its trophy count. */
  teamOfTheYear?: { team: StoryTeamRef; titles: number };
  /** The region that climbed highest this year. */
  regionThatRose?: LeagueId;
  /** The season's single biggest champion-lane tier swing. */
  metaArc?: SeasonStoryMeta;
}

function refOf(season: SeasonState, teamId: string | null | undefined): StoryTeamRef | undefined {
  if (!teamId) return undefined;
  const team = season.teams.find((t) => t.id === teamId);
  if (!team) return undefined;
  return {
    name: team.name,
    leagueId: team.leagueId,
    color: team.color,
    iconKey: team.iconKey,
    ...(team.logoUrl ? { logoUrl: team.logoUrl } : {}),
  };
}

// Effective tier of a champion-lane under an override, falling back to the
// baseline tier table.
function effectiveTier(
  override: MetaOverride | null,
  alias: string,
  lane: Lane,
): MetaTier | null {
  return (
    override?.[alias]?.[lane] ?? CHAMPION_META[alias]?.metaTiers?.[lane] ?? null
  );
}

// The biggest upset of the season: scan every completed match across all
// tournaments for the largest star-rating gap a winner overcame. Bracket
// (knockout) matches get a small bonus so a dramatic playoff upset beats a
// marginally-larger group-stage one.
function findBiggestUpset(season: SeasonState): SeasonStoryUpset | undefined {
  let best: { upset: SeasonStoryUpset; weight: number } | null = null;
  for (const t of Object.values(season.tournaments ?? {})) {
    const byId = new Map(t.teams.map((tm) => [tm.id, tm]));
    for (const m of t.matches) {
      if (!m.winner || m.blueTeamId == null || m.redTeamId == null) continue;
      const winnerId = m.winner.teamId;
      const loserId =
        winnerId === m.blueTeamId ? m.redTeamId : m.blueTeamId;
      const w = byId.get(winnerId);
      const l = byId.get(loserId);
      if (!w || !l || w.starRating == null || l.starRating == null) continue;
      const gap = l.starRating - w.starRating;
      if (gap <= 0) continue;
      const isBracket = m.bracket != null || m.feedsInto != null;
      const weight = gap + (isBracket ? 0.5 : 0);
      if (best && weight <= best.weight) continue;
      const winnerRef = refOf(season, winnerId);
      const loserRef = refOf(season, loserId);
      if (!winnerRef || !loserRef) continue;
      const depth = isBracket ? tournamentRoundDepth(t, m.id) : "early";
      const round =
        depth === "final"
          ? "final"
          : depth === "semifinal"
            ? "semifinal"
            : depth === "quarterfinal"
              ? "quarterfinal"
              : undefined;
      best = {
        weight,
        upset: {
          winner: winnerRef,
          loser: loserRef,
          event: t.name,
          starGap: gap,
          ...(round ? { round } : {}),
        },
      };
    }
  }
  return best?.upset;
}

// Title weights for "team of the year" — internationals dwarf split titles;
// Global Cup (quadrennial) outranks Worlds.
const TITLE_WEIGHT: Record<InternationalId, number> = {
  "first-stand": 1.5,
  msi: 2,
  worlds: 4,
  "global-cup": 5,
};

// Most-decorated franchise of the season, ranked by weighted titles but
// reported with its raw trophy count.
function findTeamOfTheYear(
  season: SeasonState,
): { team: StoryTeamRef; titles: number } | undefined {
  const weighted = new Map<string, number>();
  const raw = new Map<string, number>();
  const bump = (id: string | undefined, weight: number) => {
    if (!id) return;
    weighted.set(id, (weighted.get(id) ?? 0) + weight);
    raw.set(id, (raw.get(id) ?? 0) + 1);
  };
  for (const byLeague of Object.values(season.splitResults)) {
    for (const placements of Object.values(byLeague ?? {})) {
      bump(placements?.[0], 1);
    }
  }
  for (const [event, placements] of Object.entries(season.intlResults) as Array<
    [InternationalId, string[]]
  >) {
    bump(placements?.[0], TITLE_WEIGHT[event] ?? 1);
  }
  let bestId: string | null = null;
  let bestScore = 0;
  for (const [id, score] of weighted) {
    if (score > bestScore) {
      bestScore = score;
      bestId = id;
    }
  }
  if (!bestId) return undefined;
  const team = refOf(season, bestId);
  if (!team) return undefined;
  return { team, titles: raw.get(bestId) ?? 0 };
}

// The region that rose highest: prefer the evolved region-tide score when
// Region Tides ran; otherwise the league with the most international titles.
function findRegionThatRose(season: SeasonState): LeagueId | undefined {
  const strength = season.leagueStrength;
  if (strength) {
    let best: LeagueId | undefined;
    let bestVal = 0; // must be a genuine rise (> neutral)
    for (const lg of LEAGUE_IDS) {
      const v = strength[lg] ?? 0;
      if (v > bestVal) {
        bestVal = v;
        best = lg;
      }
    }
    if (best) return best;
  }
  // Fallback: count international titles per region.
  const titles: Partial<Record<LeagueId, number>> = {};
  for (const placements of Object.values(season.intlResults)) {
    const champ = placements?.[0];
    const team = champ ? season.teams.find((t) => t.id === champ) : null;
    if (team) titles[team.leagueId] = (titles[team.leagueId] ?? 0) + 1;
  }
  let best: LeagueId | undefined;
  let bestVal = 0;
  for (const lg of LEAGUE_IDS) {
    const v = titles[lg] ?? 0;
    if (v > bestVal) {
      bestVal = v;
      best = lg;
    }
  }
  return best;
}

// The season's single biggest champion-lane tier swing, from the meta it
// started on to the meta it ended on.
function findMetaArc(season: SeasonState): SeasonStoryMeta | undefined {
  const initial = season.initialMeta?.metaOverride ?? null;
  const final = season.currentMeta?.metaOverride ?? null;
  const aliases = new Set<string>([
    ...Object.keys(CHAMPION_META),
    ...Object.keys(initial ?? {}),
    ...Object.keys(final ?? {}),
  ]);
  let best: { arc: SeasonStoryMeta; swing: number } | null = null;
  for (const alias of aliases) {
    const lanes = new Set<Lane>([
      ...(Object.keys(CHAMPION_META[alias]?.metaTiers ?? {}) as Lane[]),
      ...(Object.keys(initial?.[alias] ?? {}) as Lane[]),
      ...(Object.keys(final?.[alias] ?? {}) as Lane[]),
    ]);
    for (const lane of lanes) {
      const from = effectiveTier(initial, alias, lane);
      const to = effectiveTier(final, alias, lane);
      if (!from || !to || from === to) continue;
      const swing = Math.abs(TIER_ORDER.indexOf(from) - TIER_ORDER.indexOf(to));
      if (!best || swing > best.swing) {
        best = { swing, arc: { alias, lane, from, to } };
      }
    }
  }
  return best?.arc;
}

/** Build the templated story for a season. Every field is best-effort and
 *  optional — a sparse or unfinished season simply yields fewer of them. */
export function buildSeasonStory(season: SeasonState): SeasonStory {
  const worlds = season.intlResults.worlds ?? [];
  const story: SeasonStory = {};
  const champion = refOf(season, season.champion ?? worlds[0]);
  if (champion) story.champion = champion;
  const runnerUp = refOf(season, worlds[1]);
  if (runnerUp) story.runnerUp = runnerUp;
  const upset = findBiggestUpset(season);
  if (upset) story.biggestUpset = upset;
  const toty = findTeamOfTheYear(season);
  if (toty) story.teamOfTheYear = toty;
  const region = findRegionThatRose(season);
  if (region) story.regionThatRose = region;
  const meta = findMetaArc(season);
  if (meta) story.metaArc = meta;
  return story;
}

/** Display label for an international event (re-exported for the UI). */
export function eventLabel(event: InternationalId): string {
  return INTERNATIONAL_LABELS[event] ?? event;
}
