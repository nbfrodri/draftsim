// Cross-season records ("Records & Dynasties") aggregated from the Hall
// of Seasons archive. Teams are matched across seasons by NAME + LEAGUE:
// a "T1" in the LCK of Season 1 and a "T1" in the LCK of Season 3 are
// the same franchise; a same-named team in another league is not.
// Identity details (color, icon) come from the team's most recently
// archived appearance.

import type { SeasonHistoryEntry, SeasonHistoryTeamRef } from "./history";
import {
  LEAGUE_IDS,
  SPLIT_LABELS,
  type InternationalId,
  type LeagueId,
  type SplitId,
} from "./types";

/** Split-title count from which a team reads as a dynasty. */
export const DYNASTY_THRESHOLD = 3;

export interface TeamRecord {
  /** Stable cross-season identity: `${leagueId}:${name}`. */
  key: string;
  /** The team's newest archived identity (colors/icons can evolve). */
  team: SeasonHistoryTeamRef;
  /** Regional split titles across every archived season. */
  splitTitles: number;
  /** One label per split title, newest season first ("2026 · Winter Split"). */
  splitTitleLabels: string[];
  /** International titles per event, and combined. */
  intlTitles: Partial<Record<InternationalId, number>>;
  intlTotal: number;
  worldsTitles: number;
  /** Splits + internationals combined. */
  totalTitles: number;
}

export function teamRecordKey(team: SeasonHistoryTeamRef): string {
  return `${team.leagueId}:${team.name}`;
}

/** Aggregate every archived season into per-franchise title records,
 *  sorted by total titles (internationals break ties). */
export function computeTeamRecords(
  entries: SeasonHistoryEntry[],
): TeamRecord[] {
  // Newest first, so the first identity seen for a key is the freshest.
  const ordered = [...entries].sort((a, b) => b.archivedAt - a.archivedAt);
  const byKey = new Map<string, TeamRecord>();
  const recordOf = (team: SeasonHistoryTeamRef): TeamRecord => {
    const key = teamRecordKey(team);
    let rec = byKey.get(key);
    if (!rec) {
      rec = {
        key,
        team,
        splitTitles: 0,
        splitTitleLabels: [],
        intlTitles: {},
        intlTotal: 0,
        worldsTitles: 0,
        totalTitles: 0,
      };
      byKey.set(key, rec);
    }
    return rec;
  };

  for (const e of ordered) {
    for (const [split, byLeague] of Object.entries(e.splitChampions) as Array<
      [SplitId, Partial<Record<LeagueId, SeasonHistoryTeamRef>>]
    >) {
      for (const team of Object.values(byLeague)) {
        if (!team) continue;
        const rec = recordOf(team);
        rec.splitTitles += 1;
        rec.splitTitleLabels.push(`${e.name} · ${SPLIT_LABELS[split]}`);
      }
    }
    // The Worlds title holder: intlChampions.worlds normally, with the
    // headline champion as a fallback for sparse (imported) entries.
    const worldsWinner = e.intlChampions.worlds ?? e.champion ?? undefined;
    const intlWinners: Array<
      [InternationalId, SeasonHistoryTeamRef | undefined]
    > = [
      ["first-stand", e.intlChampions["first-stand"]],
      ["msi", e.intlChampions.msi],
      ["worlds", worldsWinner],
    ];
    for (const [event, team] of intlWinners) {
      if (!team) continue;
      const rec = recordOf(team);
      rec.intlTitles[event] = (rec.intlTitles[event] ?? 0) + 1;
      rec.intlTotal += 1;
      if (event === "worlds") rec.worldsTitles += 1;
    }
  }

  const out = [...byKey.values()];
  for (const rec of out) rec.totalTitles = rec.splitTitles + rec.intlTotal;
  out.sort(
    (a, b) =>
      b.totalTitles - a.totalTitles ||
      b.intlTotal - a.intlTotal ||
      a.team.name.localeCompare(b.team.name),
  );
  return out;
}

/** Per-region split-winner boards, most titles first. Leagues with no
 *  recorded split champion are omitted. */
export function splitWinnersByRegion(
  records: TeamRecord[],
): Partial<Record<LeagueId, TeamRecord[]>> {
  const out: Partial<Record<LeagueId, TeamRecord[]>> = {};
  for (const league of LEAGUE_IDS) {
    const list = records
      .filter((r) => r.team.leagueId === league && r.splitTitles > 0)
      .sort(
        (a, b) =>
          b.splitTitles - a.splitTitles ||
          a.team.name.localeCompare(b.team.name),
      );
    if (list.length > 0) out[league] = list;
  }
  return out;
}
