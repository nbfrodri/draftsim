// Matrix-based franchise timeline derived from the Hall of Seasons.
// Replaces the old arc/rail approach with a Year × Franchise grid
// where each cell shows what events a franchise won that season.

import type { SeasonHistoryEntry, SeasonHistoryTeamRef } from "./history";
import {
  computeTeamRecords,
  teamRecordKey,
  type DynastyInfo,
  type DynastyTier,
} from "./historyRecords";
import {
  INTERNATIONAL_LABELS,
  SPLIT_LABELS,
  type InternationalId,
  type LeagueId,
  type SplitId,
} from "./types";

// ─── Types ────────────────────────────────────────────────────────────────────

export type MatrixEventKind =
  | "split-title"
  | "intl-title"
  | "worlds-title"
  | "global-cup-title";

export interface MatrixEvent {
  kind: MatrixEventKind;
  label: string;
  /** LeagueId for split titles, InternationalId for international events. */
  iconId: string;
  splitId?: SplitId;
  eventId?: InternationalId;
}

export interface MatrixCell {
  splits: MatrixEvent[];
  intl: MatrixEvent[];
  totalInCell: number;
}

export interface MatrixYear {
  seasonId: string;
  seasonName: string;
  /** Short display label e.g. "Y3" or "2024". */
  yearLabel: string;
  archivedAt: number;
}

export interface MatrixTitleEntry {
  yearLabel: string;
  seasonName: string;
  event: MatrixEvent;
}

export interface MatrixRow {
  franchiseKey: string;
  team: SeasonHistoryTeamRef;
  dynasty: DynastyInfo;
  totalTitles: number;
  splitTitles: number;
  intlTitles: number;
  worldsTitles: number;
  globalCupTitles: number;
  /** Flat chronological list of all titles — used for the expanded detail panel. */
  titleList: MatrixTitleEntry[];
  /** Per-season win data keyed by seasonId. */
  cells: Record<string, MatrixCell>;
}

export interface FranchiseMatrix {
  years: MatrixYear[];
  rows: MatrixRow[];
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function extractYearLabel(name: string): string {
  const seqMatch = name.match(/(?:Year|Season|Yr|S)\s*(\d+)\s*$/i);
  if (seqMatch) return `Y${seqMatch[1]}`;
  const calYear = name.match(/\d{4}/);
  if (calYear) return calYear[0];
  return name.replace(/\s+/g, "").slice(0, 4);
}

const SPLITS: SplitId[] = ["winter", "spring", "summer"];
const INTL_ORDER: InternationalId[] = ["first-stand", "msi", "worlds", "global-cup"];

function buildCell(entry: SeasonHistoryEntry, teamKey: string): MatrixCell {
  const splits: MatrixEvent[] = [];
  const intl: MatrixEvent[] = [];

  for (const splitId of SPLITS) {
    const byLeague = entry.splitChampions[splitId];
    if (!byLeague) continue;
    for (const [leagueId, champ] of Object.entries(byLeague) as Array<
      [LeagueId, SeasonHistoryTeamRef | undefined]
    >) {
      if (champ && teamRecordKey(champ) === teamKey) {
        splits.push({
          kind: "split-title",
          label: `${SPLIT_LABELS[splitId]} · ${leagueId}`,
          iconId: leagueId,
          splitId,
        });
      }
    }
  }

  for (const eventId of INTL_ORDER) {
    const champ = entry.intlChampions[eventId];
    if (champ && teamRecordKey(champ) === teamKey) {
      const kind: MatrixEventKind =
        eventId === "worlds"
          ? "worlds-title"
          : eventId === "global-cup"
            ? "global-cup-title"
            : "intl-title";
      intl.push({
        kind,
        label: INTERNATIONAL_LABELS[eventId],
        iconId: eventId,
        eventId,
      });
    }
  }

  return { splits, intl, totalInCell: splits.length + intl.length };
}

// ─── Main export ─────────────────────────────────────────────────────────────

/** Build the full franchise × year matrix from Hall of Seasons entries.
 *  Includes all franchises with at least one title, sorted by dynasty tier
 *  then total titles. */
export function computeFranchiseMatrix(
  entries: SeasonHistoryEntry[],
): FranchiseMatrix {
  if (entries.length === 0) return { years: [], rows: [] };

  const chron = [...entries].sort((a, b) => a.archivedAt - b.archivedAt);

  const years: MatrixYear[] = chron.map((e) => ({
    seasonId: e.id,
    seasonName: e.name,
    yearLabel: extractYearLabel(e.name),
    archivedAt: e.archivedAt,
  }));

  // Build a quick lookup: seasonId → entry
  const entryById = new Map<string, SeasonHistoryEntry>(chron.map((e) => [e.id, e]));

  const records = computeTeamRecords(entries);
  const tierRank = (t: DynastyTier) =>
    t === "legendary" ? 3 : t === "dynasty" ? 2 : 1;

  const rows: MatrixRow[] = records
    .filter((r) => r.totalTitles > 0)
    .map((rec) => {
      const cells: Record<string, MatrixCell> = {};
      const titleList: MatrixTitleEntry[] = [];

      for (const year of years) {
        const entry = entryById.get(year.seasonId);
        const cell = entry ? buildCell(entry, rec.key) : { splits: [], intl: [], totalInCell: 0 };
        cells[year.seasonId] = cell;

        for (const ev of [...cell.splits, ...cell.intl]) {
          titleList.push({ yearLabel: year.yearLabel, seasonName: year.seasonName, event: ev });
        }
      }

      return {
        franchiseKey: rec.key,
        team: rec.team,
        dynasty: rec.dynasty,
        totalTitles: rec.totalTitles,
        splitTitles: rec.splitTitles,
        intlTitles: rec.intlTotal,
        worldsTitles: rec.worldsTitles,
        globalCupTitles: rec.intlTitles["global-cup"] ?? 0,
        titleList,
        cells,
      };
    })
    .sort(
      (a, b) =>
        tierRank(b.dynasty.tier) - tierRank(a.dynasty.tier) ||
        b.totalTitles - a.totalTitles,
    );

  return { years, rows };
}
