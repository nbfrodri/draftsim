// Shared data model behind the coach trading-card hover tooltip.
//
//   • LIVE season — rating, playstyle, traits, current team as they are now.
//   • SEASON HISTORY — that year's phase-roster snapshot + career titles.

import type { Coach } from "./coach";
import { coachPlaystyle } from "./coach";
import type { SeasonHistoryEntry } from "./history";
import {
  INTERNATIONAL_LABELS,
  SPLIT_LABELS,
  type InternationalId,
  type LeagueId,
  type SeasonTeam,
  type SplitId,
} from "./types";
import { resolveTeamLogo } from "./realTeams";

export interface CoachCardTeam {
  name: string;
  leagueId?: LeagueId | null;
  iconKey?: string;
  logoUrl?: string;
  color?: string;
}

export interface CoachCardTitleCounts {
  split: number;
  intl: number;
  worlds: number;
  total: number;
}

export interface CoachCardData {
  name: string;
  /** Live season coach id — resolver input, not shown. */
  coachId?: string;
  rating: number;
  playstyle?: string;
  /** 0..1 — live meta-adaptability; omitted on archive cards that lack it. */
  adaptability?: number;
  /** 0..1 — live motivation / form-swing trait. */
  motivation?: number;
  team?: CoachCardTeam | null;
  /** Distinct archived seasons coached (career). */
  seasons?: number;
  titleCounts?: CoachCardTitleCounts | null;
  /** Short accolade chips for the scoped year / career. */
  highlights: string[];
  scope: string;
  archived: boolean;
}

export interface CoachCardHint {
  coach?: Coach;
  name?: string;
  rating?: number;
  playstyle?: string;
  adaptability?: number;
  motivation?: number;
  teamName?: string;
  leagueId?: LeagueId;
  team?: Pick<
    SeasonTeam,
    "id" | "name" | "leagueId" | "iconKey" | "logoUrl" | "color"
  >;
}

export function buildCoachCardTeam(
  name: string | undefined | null,
  opts?: {
    leagueId?: LeagueId | null;
    iconKey?: string;
    color?: string;
    logoUrl?: string;
  },
): CoachCardTeam | null {
  const trimmed = name?.trim();
  if (!trimmed) return null;
  const logo = resolveTeamLogo(trimmed, opts?.logoUrl);
  return {
    name: trimmed,
    iconKey: opts?.iconKey ?? "shield",
    ...(opts?.leagueId ? { leagueId: opts.leagueId } : {}),
    ...(opts?.color ? { color: opts.color } : {}),
    ...(logo ? { logoUrl: logo } : {}),
  };
}

export function buildCoachCardTeamFromSeasonTeam(team: SeasonTeam): CoachCardTeam {
  return buildCoachCardTeam(team.name, {
    leagueId: team.leagueId,
    iconKey: team.iconKey,
    color: team.color,
    logoUrl: team.logoUrl,
  })!;
}

/** Every coach name that appears on an archived roster — drives click-to-profile. */
export function archivedCoachNames(
  entries: readonly SeasonHistoryEntry[],
): Set<string> {
  const out = new Set<string>();
  for (const entry of entries) {
    for (const phase of entry.phaseRosters ?? []) {
      for (const t of phase.teams) {
        if (t.coach?.name) out.add(t.coach.name);
      }
    }
  }
  return out;
}

export interface ArchivedCoachSnapshot {
  name: string;
  rating: number;
  playstyle?: string;
  teamName: string;
  leagueId: LeagueId;
  logoUrl?: string;
  stage: string;
}

/** That year's end-of-season (latest phase) snapshot for a coach. */
export function archivedCoachSnapshot(
  entry: SeasonHistoryEntry,
  coachName: string,
): ArchivedCoachSnapshot | null {
  const phases = [...(entry.phaseRosters ?? [])].sort(
    (a, b) => a.phaseIndex - b.phaseIndex,
  );
  let latest: ArchivedCoachSnapshot | null = null;
  for (const phase of phases) {
    for (const t of phase.teams) {
      if (t.coach?.name !== coachName) continue;
      latest = {
        name: coachName,
        rating: t.coach.rating,
        teamName: t.teamName,
        leagueId: t.leagueId,
        stage: phase.label,
        ...(t.coach.playstyle ? { playstyle: t.coach.playstyle } : {}),
        ...(t.logoUrl ? { logoUrl: t.logoUrl } : {}),
      };
      break;
    }
  }
  return latest;
}

/** Accolade chips from title tallies — most prestigious first, capped at 4. */
export function coachTitleHighlights(input: {
  worlds?: number;
  intl?: number;
  split?: number;
  total?: number;
  yearLabels?: string[];
}): string[] {
  if (input.yearLabels?.length) return input.yearLabels.slice(0, 4);
  const out: string[] = [];
  const push = (n: number | undefined, label: string) => {
    if (n && n > 0) out.push(`${n}× ${label}`);
  };
  push(input.worlds, "Worlds");
  push(
    input.intl != null && input.worlds != null
      ? Math.max(0, input.intl - input.worlds)
      : input.intl,
    "Intl",
  );
  push(input.split, "Split");
  if (out.length === 0) push(input.total, "Title");
  return out.slice(0, 4);
}

/** Title chips for one archived year credited to the coach's team that season. */
export function coachYearTitleLabels(
  entry: SeasonHistoryEntry,
  team: { name: string; leagueId: LeagueId },
): string[] {
  const out: string[] = [];
  if (
    entry.champion?.name === team.name &&
    entry.champion?.leagueId === team.leagueId
  ) {
    out.push("Season champion");
  } else if (
    entry.runnerUp?.name === team.name &&
    entry.runnerUp?.leagueId === team.leagueId
  ) {
    out.push("Season finalist");
  }
  for (const split of ["winter", "spring", "summer"] as SplitId[]) {
    if (entry.splitChampions[split]?.[team.leagueId]?.name === team.name) {
      out.push(SPLIT_LABELS[split]);
    }
  }
  for (const ev of [
    "first-stand",
    "msi",
    "worlds",
    "global-cup",
  ] as InternationalId[]) {
    if (entry.intlChampions[ev]?.name === team.name) {
      out.push(INTERNATIONAL_LABELS[ev]);
    }
  }
  return out.slice(0, 5);
}

export function titleCountsFromCoachRecord(r: {
  splitTitles: number;
  intlTotal: number;
  worlds: number;
  total: number;
}): CoachCardTitleCounts {
  return {
    split: r.splitTitles,
    intl: r.intlTotal,
    worlds: r.worlds,
    total: r.total,
  };
}

/** Live-season titles credited to this coach's current team. */
export function liveCoachTitleCounts(
  season: {
    splitResults?: Partial<
      Record<SplitId, Partial<Record<LeagueId, string[]>>>
    >;
    intlResults?: Partial<Record<InternationalId, string[]>>;
  },
  team: SeasonTeam,
): CoachCardTitleCounts {
  let split = 0;
  let intl = 0;
  let worlds = 0;
  for (const sid of ["winter", "spring", "summer"] as SplitId[]) {
    const order = season.splitResults?.[sid]?.[team.leagueId];
    if (order?.[0] === team.id) split += 1;
  }
  for (const ev of [
    "first-stand",
    "msi",
    "worlds",
    "global-cup",
  ] as InternationalId[]) {
    const order = season.intlResults?.[ev];
    if (order?.[0] === team.id) {
      intl += 1;
      if (ev === "worlds") worlds += 1;
    }
  }
  return { split, intl, worlds, total: split + intl };
}

export function liveCoachYearLabels(
  season: {
    splitResults?: Partial<
      Record<SplitId, Partial<Record<LeagueId, string[]>>>
    >;
    intlResults?: Partial<Record<InternationalId, string[]>>;
  },
  team: SeasonTeam,
): string[] {
  const out: string[] = [];
  for (const sid of ["winter", "spring", "summer"] as SplitId[]) {
    if (season.splitResults?.[sid]?.[team.leagueId]?.[0] === team.id) {
      out.push(SPLIT_LABELS[sid]);
    }
  }
  for (const ev of [
    "first-stand",
    "msi",
    "worlds",
    "global-cup",
  ] as InternationalId[]) {
    if (season.intlResults?.[ev]?.[0] === team.id) {
      out.push(INTERNATIONAL_LABELS[ev]);
    }
  }
  return out.slice(0, 5);
}

/** Build card fields from a live `Coach` + optional host team. */
export function coachCardFromLive(
  coach: Coach,
  opts: {
    team?: SeasonTeam | null;
    titleCounts?: CoachCardTitleCounts | null;
    highlights?: string[];
    seasons?: number;
    scope: string;
  },
): CoachCardData {
  return {
    name: coach.name,
    coachId: coach.id,
    rating: coach.rating,
    playstyle: coachPlaystyle(coach) || undefined,
    adaptability: coach.adaptability,
    motivation: coach.motivation,
    team: opts.team ? buildCoachCardTeamFromSeasonTeam(opts.team) : null,
    ...(opts.seasons != null ? { seasons: opts.seasons } : {}),
    titleCounts: opts.titleCounts ?? null,
    highlights: opts.highlights ?? [],
    scope: opts.scope,
    archived: false,
  };
}
