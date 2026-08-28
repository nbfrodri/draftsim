// Lightweight snapshots of regional / international outcomes for live sim feeds.

import { seasonHasGlobalCup } from "./engine";
import {
  INTERNATIONAL_DISPLAY_ORDER,
  INTERNATIONAL_LABELS,
  LEAGUE_IDS,
  SPLIT_LABELS,
  seasonTeam,
  type InternationalId,
  type LeagueId,
  type SeasonState,
  type SplitId,
} from "./types";

export interface SimResultTeamRef {
  id: string;
  name: string;
  leagueId: LeagueId;
  iconKey: string;
  logoUrl?: string;
  color: string;
}

export interface SimSplitLeagueResult {
  leagueId: LeagueId;
  placements: SimResultTeamRef[];
}

export interface SimSplitResultEntry {
  kind: "split";
  seasonId: string;
  year: number;
  split: SplitId;
  label: string;
  leagues: SimSplitLeagueResult[];
}

export interface SimIntlResultEntry {
  kind: "intl";
  seasonId: string;
  year: number;
  event: InternationalId;
  label: string;
  placements: Array<SimResultTeamRef & { rank: number }>;
}

export interface SimFollowedTeamSummary {
  team: SimResultTeamRef;
  splits: Partial<Record<SplitId, number>>;
  intls: Partial<Record<InternationalId, number>>;
}

export interface SimYearResultEntry {
  kind: "year";
  seasonId: string;
  year: number;
  seasonName: string;
  splits: SimSplitResultEntry[];
  intls: SimIntlResultEntry[];
  worldsChampion: SimResultTeamRef | null;
  followedTeam: SimFollowedTeamSummary | null;
}

export type SimResultEntry =
  | SimSplitResultEntry
  | SimIntlResultEntry
  | SimYearResultEntry;

const SPLITS: SplitId[] = ["winter", "spring", "summer"];

function teamRef(
  season: SeasonState,
  teamId: string,
): SimResultTeamRef | null {
  const t = seasonTeam(season, teamId);
  if (!t) return null;
  return {
    id: t.id,
    name: t.name,
    leagueId: t.leagueId,
    iconKey: t.iconKey,
    ...(t.logoUrl ? { logoUrl: t.logoUrl } : {}),
    color: t.color,
  };
}

function splitComplete(season: SeasonState, split: SplitId): boolean {
  const byLeague = season.splitResults[split];
  if (!byLeague) return false;
  return LEAGUE_IDS.every((l) => (byLeague[l]?.length ?? 0) > 0);
}

export function buildSplitResultEntry(
  season: SeasonState,
  split: SplitId,
): SimSplitResultEntry {
  const byLeague = season.splitResults[split]!;
  const leagues: SimSplitLeagueResult[] = [];
  for (const leagueId of LEAGUE_IDS) {
    const ids = byLeague[leagueId] ?? [];
    const placements = ids
      .map((id) => teamRef(season, id))
      .filter((r): r is SimResultTeamRef => r != null);
    if (placements.length > 0) leagues.push({ leagueId, placements });
  }
  return {
    kind: "split",
    seasonId: season.id,
    year: season.franchise?.year ?? 1,
    split,
    label: SPLIT_LABELS[split],
    leagues,
  };
}

export function buildIntlResultEntry(
  season: SeasonState,
  event: InternationalId,
): SimIntlResultEntry {
  const ids = season.intlResults[event] ?? [];
  const placements = ids
    .map((id, i) => {
      const ref = teamRef(season, id);
      return ref ? { ...ref, rank: i + 1 } : null;
    })
    .filter((r): r is SimResultTeamRef & { rank: number } => r != null);
  return {
    kind: "intl",
    seasonId: season.id,
    year: season.franchise?.year ?? 1,
    event,
    label: INTERNATIONAL_LABELS[event],
    placements,
  };
}

function intlEventsForSeason(season: SeasonState): InternationalId[] {
  return INTERNATIONAL_DISPLAY_ORDER.filter((event) => {
    if (event === "global-cup" && !seasonHasGlobalCup(season)) return false;
    return true;
  });
}

function teamSplitRank(
  season: SeasonState,
  teamId: string,
  split: SplitId,
): number | undefined {
  const team = seasonTeam(season, teamId);
  if (!team) return undefined;
  const order = season.splitResults[split]?.[team.leagueId];
  if (!order?.length) return undefined;
  const idx = order.indexOf(teamId);
  return idx >= 0 ? idx + 1 : undefined;
}

function teamIntlRank(
  season: SeasonState,
  teamId: string,
  event: InternationalId,
): number | undefined {
  const order = season.intlResults[event];
  if (!order?.length) return undefined;
  const idx = order.indexOf(teamId);
  return idx >= 0 ? idx + 1 : undefined;
}

function buildFollowedTeamSummary(
  season: SeasonState,
): SimFollowedTeamSummary | null {
  const teamId = season.config.controlledTeamId;
  if (!teamId) return null;
  const ref = teamRef(season, teamId);
  if (!ref) return null;

  const splits: Partial<Record<SplitId, number>> = {};
  for (const split of SPLITS) {
    const rank = teamSplitRank(season, teamId, split);
    if (rank != null) splits[split] = rank;
  }

  const intls: Partial<Record<InternationalId, number>> = {};
  for (const event of intlEventsForSeason(season)) {
    const rank = teamIntlRank(season, teamId, event);
    if (rank != null) intls[event] = rank;
  }

  if (Object.keys(splits).length === 0 && Object.keys(intls).length === 0) {
    return null;
  }

  return { team: ref, splits, intls };
}

export function buildYearResultEntry(season: SeasonState): SimYearResultEntry {
  const splits = SPLITS.filter((s) => splitComplete(season, s)).map((s) =>
    buildSplitResultEntry(season, s),
  );
  const intls = intlEventsForSeason(season)
    .filter((e) => (season.intlResults[e]?.length ?? 0) > 0)
    .map((e) => buildIntlResultEntry(season, e));
  const worldsId = season.intlResults.worlds?.[0] ?? season.champion;
  return {
    kind: "year",
    seasonId: season.id,
    year: season.franchise?.year ?? 1,
    seasonName: season.name,
    splits,
    intls,
    worldsChampion: worldsId ? teamRef(season, worldsId) : null,
    followedTeam: buildFollowedTeamSummary(season),
  };
}

/** How many recent franchise years keep split/intl detail in the live feed. */
export const SIM_RESULTS_FULL_DETAIL_YEARS = 3;

/** Distinct franchise years represented in the feed (sorted ascending). */
export function simResultYears(entries: SimResultEntry[]): number[] {
  const years = new Set<number>();
  for (const e of entries) years.add(e.year);
  return [...years].sort((a, b) => a - b);
}

/** True when a year is represented only by its season-complete summary. */
export function isYearSummarizedInFeed(
  entries: SimResultEntry[],
  year: number,
): boolean {
  let hasYear = false;
  let hasOther = false;
  for (const entry of entries) {
    if (entry.year !== year) continue;
    if (entry.kind === "year") hasYear = true;
    else hasOther = true;
  }
  return hasYear && !hasOther;
}

/** Count years stored as season-complete summaries only (older bulk-sim years). */
export function countSummarizedYears(entries: SimResultEntry[]): number {
  const years = simResultYears(entries);
  return years.filter((y) => isYearSummarizedInFeed(entries, y)).length;
}

/**
 * Drop per-split / per-intl detail for older years so the in-memory feed
 * stays bounded during long bulk sims. Recent years keep full live detail.
 */
export function compressSimResultsFeed(
  entries: SimResultEntry[],
  fullDetailYears = SIM_RESULTS_FULL_DETAIL_YEARS,
): SimResultEntry[] {
  const years = simResultYears(entries);
  if (years.length <= fullDetailYears) return entries;

  const detailFromYear = years[years.length - fullDetailYears]!;
  const byYear = new Map<number, SimResultEntry[]>();
  for (const entry of entries) {
    const list = byYear.get(entry.year) ?? [];
    list.push(entry);
    byYear.set(entry.year, list);
  }

  const out: SimResultEntry[] = [];
  for (const year of years) {
    const yearEntries = byYear.get(year) ?? [];
    if (year < detailFromYear) {
      const summary = yearEntries.find((e) => e.kind === "year");
      if (summary) out.push(summary);
      continue;
    }
    out.push(...yearEntries);
  }
  return out;
}

export function simResultKey(entry: SimResultEntry): string {
  switch (entry.kind) {
    case "split":
      return `split:${entry.seasonId}:${entry.split}`;
    case "intl":
      return `intl:${entry.seasonId}:${entry.event}`;
    case "year":
      return `year:${entry.seasonId}`;
  }
}

/** Collect new result snapshots not yet in `seen`. Mutates `seen`. */
export function collectSimResultUpdates(
  season: SeasonState,
  seen: Set<string>,
): SimResultEntry[] {
  const out: SimResultEntry[] = [];

  for (const split of SPLITS) {
    if (!splitComplete(season, split)) continue;
    const entry = buildSplitResultEntry(season, split);
    const key = simResultKey(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }

  for (const event of intlEventsForSeason(season)) {
    if (!(season.intlResults[event]?.length ?? 0)) continue;
    const entry = buildIntlResultEntry(season, event);
    const key = simResultKey(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }

  if (season.status === "complete") {
    const entry = buildYearResultEntry(season);
    const key = simResultKey(entry);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(entry);
    }
  }

  return out;
}
