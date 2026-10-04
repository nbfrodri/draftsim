import { LEAGUE_IDS, type SeasonState, type SplitId } from "./types";

export const CHAMPIONSHIP_POINT_STAGES = ["winter", "first-stand", "spring", "msi", "summer"] as const;
export type ChampionshipPointStage = (typeof CHAMPIONSHIP_POINT_STAGES)[number];
export const SPLIT_PLACEMENT_POINTS = [10, 8, 6, 5, 4, 3, 2, 1] as const;
export const INTL_PLACEMENT_POINTS = [15, 12, 10, 8, 6, 5, 4, 3] as const;
export const INTL_PARTICIPATION_POINTS = 2;

type PointSeason = Pick<SeasonState, "splitResults" | "intlResults">;
export interface ChampionshipPointsRow {
  teamId: string;
  team: Pick<SeasonState["teams"][number], "name" | "leagueId" | "color" | "iconKey" | "logoUrl">;
  stages: Partial<Record<ChampionshipPointStage, number>>;
  total: number;
  /** Final Summer place is the Worlds points tiebreaker. Missing until recorded. */
  summerPlace?: number;
}

function pointBreakdown(season: PointSeason) {
  const rows = new Map<string, ChampionshipPointsRow["stages"]>();
  const add = (id: string, stage: ChampionshipPointStage, points: number) => {
    const row = rows.get(id) ?? {};
    row[stage] = (row[stage] ?? 0) + points;
    rows.set(id, row);
  };
  for (const split of ["winter", "spring", "summer"] as const satisfies readonly SplitId[]) {
    for (const league of LEAGUE_IDS) {
      season.splitResults[split]?.[league]?.forEach((id, i) => add(id, split, SPLIT_PLACEMENT_POINTS[i] ?? 0));
    }
  }
  for (const event of ["first-stand", "msi"] as const) {
    season.intlResults[event]?.forEach((id, i) => add(id, event, INTL_PLACEMENT_POINTS[i] ?? INTL_PARTICIPATION_POINTS));
  }
  return rows;
}

/** Awarded championship points only; Worlds/Global Cup do not feed Worlds qualification. */
export function championshipPoints(season: PointSeason): Record<string, number> {
  return Object.fromEntries([...pointBreakdown(season)].flatMap(([id, stages]) => {
    const total = Object.values(stages).reduce((sum, points) => sum + points, 0);
    return total > 0 ? [[id, total]] : [];
  }));
}

/** An additive archive snapshot; no live roster references escape the builder. */
export function championshipPointsRows(season: PointSeason & Pick<SeasonState, "teams">): ChampionshipPointsRow[] {
  const breakdown = pointBreakdown(season);
  return season.teams.map(team => {
    const stages = breakdown.get(team.id) ?? {};
    const summerIndex = season.splitResults.summer?.[team.leagueId]?.indexOf(team.id) ?? -1;
    return {
      teamId: team.id,
      team: { name: team.name, leagueId: team.leagueId, color: team.color, iconKey: team.iconKey,
        ...(team.logoUrl ? { logoUrl: team.logoUrl } : {}) },
      stages,
      total: Object.values(stages).reduce((sum, points) => sum + points, 0),
      ...(summerIndex >= 0 ? { summerPlace: summerIndex + 1 } : {}),
    };
  });
}

export function rankChampionshipPoints(rows: readonly ChampionshipPointsRow[]) {
  return [...rows].sort((a, b) => b.total - a.total
    || (a.summerPlace ?? Number.MAX_SAFE_INTEGER) - (b.summerPlace ?? Number.MAX_SAFE_INTEGER));
}
