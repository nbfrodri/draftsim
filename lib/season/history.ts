// Season history ("Hall of Seasons") — lightweight résumé snapshots of
// completed seasons the user chooses to archive. Unlike saved seasons
// (full SeasonState save slots for resuming play), a history entry is a
// few hundred bytes: the season's headline results — Worlds champion
// and finalist, the international title holders, and every split
// champion — so the timeline of past seasons stays browsable forever
// without carrying 20+ tournaments of state each.

import {
  CHAMPION_META,
  TIER_ORDER,
  type MetaOverride,
  type MetaTier,
} from "../championMeta";
import type { Lane } from "../types";
import {
  seasonTeam,
  type InternationalId,
  type LeagueId,
  type SeasonState,
  type SplitId,
} from "./types";

/** Frozen team identity at archive time (teams are regenerated every
 *  season, so ids alone would dangle). */
export interface SeasonHistoryTeamRef {
  name: string;
  leagueId: LeagueId;
  color: string;
  iconKey: string;
}

export interface SeasonHistoryEntry {
  /** Mirrors season.id — archiving the same season upserts its entry. */
  id: string;
  archivedAt: number;
  name: string;
  /** True when the season finished (Worlds decided). */
  complete: boolean;
  /** Worlds champion — the season's headline. */
  champion: SeasonHistoryTeamRef | null;
  /** Worlds runner-up (the losing finalist). */
  runnerUp: SeasonHistoryTeamRef | null;
  /** Winners of each international event. */
  intlChampions: Partial<Record<InternationalId, SeasonHistoryTeamRef>>;
  /** Winner of every split, per league. */
  splitChampions: Partial<
    Record<SplitId, Partial<Record<LeagueId, SeasonHistoryTeamRef>>>
  >;
  /** Champion tier table the season STARTED on. null = the default
   *  tiers; undefined = unknown (season pre-dates initialMeta). */
  initialMetaOverride?: MetaOverride | null;
  /** Tier table at archive time — after a year of live evolution and
   *  patch shifts. null = default tiers. */
  finalMetaOverride?: MetaOverride | null;
}

/** One champion-lane tier movement between two meta snapshots. */
export interface MetaTierShift {
  alias: string;
  lane: Lane;
  from: MetaTier;
  to: MetaTier;
}

// Effective tier of a champion-lane under an override (override entry
// wins; baseline CHAMPION_META otherwise).
function effectiveTier(
  override: MetaOverride | null,
  alias: string,
  lane: Lane,
): MetaTier | null {
  return (
    override?.[alias]?.[lane] ?? CHAMPION_META[alias]?.metaTiers?.[lane] ?? null
  );
}

/** Every champion-lane whose EFFECTIVE tier differs between the two
 *  snapshots — the season's meta drift, ready for display. Sorted by
 *  movement size (biggest swings first), then alias. */
export function diffMetaOverrides(
  initial: MetaOverride | null,
  final: MetaOverride | null,
): MetaTierShift[] {
  const aliases = new Set<string>([
    ...Object.keys(CHAMPION_META),
    ...Object.keys(initial ?? {}),
    ...Object.keys(final ?? {}),
  ]);
  const out: MetaTierShift[] = [];
  for (const alias of aliases) {
    const lanes = new Set<Lane>([
      ...(Object.keys(CHAMPION_META[alias]?.metaTiers ?? {}) as Lane[]),
      ...(Object.keys(initial?.[alias] ?? {}) as Lane[]),
      ...(Object.keys(final?.[alias] ?? {}) as Lane[]),
    ]);
    for (const lane of lanes) {
      const from = effectiveTier(initial, alias, lane);
      const to = effectiveTier(final, alias, lane);
      if (from && to && from !== to) out.push({ alias, lane, from, to });
    }
  }
  out.sort(
    (a, b) =>
      Math.abs(TIER_ORDER.indexOf(b.from) - TIER_ORDER.indexOf(b.to)) -
        Math.abs(TIER_ORDER.indexOf(a.from) - TIER_ORDER.indexOf(a.to)) ||
      a.alias.localeCompare(b.alias),
  );
  return out;
}

function teamRef(
  season: SeasonState,
  teamId: string | null | undefined,
): SeasonHistoryTeamRef | null {
  const team = seasonTeam(season, teamId);
  if (!team) return null;
  return {
    name: team.name,
    leagueId: team.leagueId,
    color: team.color,
    iconKey: team.iconKey,
  };
}

/** Build the archive résumé for a season. `archivedAt` is injected so
 *  the function stays pure (the store stamps the clock). */
export function buildSeasonHistoryEntry(
  season: SeasonState,
  archivedAt: number,
): SeasonHistoryEntry {
  const worlds = season.intlResults.worlds ?? [];
  const intlChampions: SeasonHistoryEntry["intlChampions"] = {};
  for (const [event, placements] of Object.entries(season.intlResults) as Array<
    [InternationalId, string[]]
  >) {
    const ref = teamRef(season, placements[0]);
    if (ref) intlChampions[event] = ref;
  }
  const splitChampions: SeasonHistoryEntry["splitChampions"] = {};
  for (const [split, byLeague] of Object.entries(season.splitResults) as Array<
    [SplitId, Partial<Record<LeagueId, string[]>>]
  >) {
    const out: Partial<Record<LeagueId, SeasonHistoryTeamRef>> = {};
    for (const [league, placements] of Object.entries(byLeague) as Array<
      [LeagueId, string[]]
    >) {
      const ref = teamRef(season, placements?.[0]);
      if (ref) out[league] = ref;
    }
    if (Object.keys(out).length > 0) splitChampions[split] = out;
  }
  return {
    id: season.id,
    archivedAt,
    name: season.name,
    complete: season.status === "complete",
    champion: teamRef(season, season.champion ?? worlds[0]),
    runnerUp: teamRef(season, worlds[1]),
    intlChampions,
    splitChampions,
    // Starting tier table (undefined when the season pre-dates
    // initialMeta — we can't reconstruct what it began on) and the
    // table at archive time after a year of drift.
    ...(season.initialMeta !== undefined
      ? { initialMetaOverride: season.initialMeta.metaOverride ?? null }
      : {}),
    finalMetaOverride: season.currentMeta?.metaOverride ?? null,
  };
}
