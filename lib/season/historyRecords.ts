// Cross-season records ("Records & Dynasties") aggregated from the Hall
// of Seasons archive. Teams are matched across seasons by NAME + LEAGUE:
// a "T1" in the LCK of Season 1 and a "T1" in the LCK of Season 3 are
// the same franchise; a same-named team in another league is not.
// Identity details (color, icon) come from the team's most recently
// archived appearance.

import type {
  SeasonHistoryEntry,
  SeasonHistoryTeamRef,
} from "./history";
import type { Lane } from "../types";
import {
  LEAGUE_IDS,
  SPLIT_LABELS,
  type InternationalId,
  type LeagueId,
  type SplitId,
} from "./types";

// ─── Dynasty model ──────────────────────────────────────────────────────────
//
// A "dynasty" is not a lifetime title total — it's CONCENTRATED, INTERNATIONALLY
// PROVEN dominance over a short span. We slide a window of DYNASTY_WINDOW
// consecutive archived seasons over each franchise's title timeline and
// look for a window dense enough to qualify. Because there are 21 major
// titles every season (6 leagues × 3 splits + 3 internationals), a bare
// title count is far too easy — so a dynasty must ALSO clear the bar that
// separates regional farming from true greatness: at least one
// international title.
//
//   • Dynasty   — ≥ DYNASTY_TITLES majors in the window AND ≥ 1 international
//                 title (First Stand / MSI / Worlds). Splits-only runs never
//                 qualify, no matter how many.
//   • Legendary — a Worlds-anchored era: ≥ 1 Worlds title in the window AND
//                 ≥ LEGENDARY_TITLES majors. The rarest tier.
//
// "Major title" = one split championship OR one international title.

/** Number of consecutive archived seasons that form a dynasty window. */
export const DYNASTY_WINDOW = 5;
/** Majors in a window needed to read as a (base) dynasty. */
export const DYNASTY_TITLES = 4;
/** Majors in a Worlds-anchored window needed to read as legendary. */
export const LEGENDARY_TITLES = 6;

export type DynastyTier = "none" | "dynasty" | "legendary";

export interface DynastyInfo {
  tier: DynastyTier;
  /** Majors in the densest qualifying window (0 when tier is "none"). */
  windowTitles: number;
  /** International titles inside that window. */
  windowIntl: number;
  /** Worlds titles inside that window. */
  windowWorlds: number;
  /** Season names bounding the window, oldest → newest (for tooltips). */
  windowSpan: [string, string] | null;
}

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
  /** Concentrated-dominance dynasty classification. */
  dynasty: DynastyInfo;
}

/** Per-(chronological)-season title tally for one franchise. */
interface SeasonTally {
  majors: number;
  intl: number;
  worlds: number;
}

/** Slide a 5-season window over a franchise's chronological title
 *  timeline and return its densest qualifying window. `seasonNames` is
 *  the chronological (oldest-first) list of season names; `tally[i]` is
 *  that franchise's majors/intl/worlds in season i. */
function classifyDynasty(
  tally: SeasonTally[],
  seasonNames: string[],
): DynastyInfo {
  let best: DynastyInfo = {
    tier: "none",
    windowTitles: 0,
    windowIntl: 0,
    windowWorlds: 0,
    windowSpan: null,
  };
  const n = tally.length;
  if (n === 0) return best;
  // Tier rank for "is this window better than the one we kept?"
  const rank = (t: DynastyTier) =>
    t === "legendary" ? 2 : t === "dynasty" ? 1 : 0;
  for (let i = 0; i < n; i++) {
    const end = Math.min(n, i + DYNASTY_WINDOW);
    let majors = 0;
    let intl = 0;
    let worlds = 0;
    for (let j = i; j < end; j++) {
      majors += tally[j].majors;
      intl += tally[j].intl;
      worlds += tally[j].worlds;
    }
    let tier: DynastyTier = "none";
    // Legendary: a Worlds-anchored era. Dynasty: dense AND internationally
    // proven (≥1 international title) — splits-only runs never qualify.
    if (worlds >= 1 && majors >= LEGENDARY_TITLES) tier = "legendary";
    else if (majors >= DYNASTY_TITLES && intl >= 1) tier = "dynasty";
    if (tier === "none") continue;
    // Keep the strongest tier; break ties on the most titles in-window.
    const better =
      rank(tier) > rank(best.tier) ||
      (rank(tier) === rank(best.tier) && majors > best.windowTitles);
    if (better) {
      // Trim the window to the seasons that actually bracket titles so
      // the span reads tightly (first..last season with a major).
      let first = i;
      let last = end - 1;
      while (first < end && tally[first].majors === 0) first++;
      while (last >= i && tally[last].majors === 0) last--;
      best = {
        tier,
        windowTitles: majors,
        windowIntl: intl,
        windowWorlds: worlds,
        windowSpan: [
          seasonNames[first] ?? seasonNames[i],
          seasonNames[last] ?? seasonNames[end - 1],
        ],
      };
    }
  }
  return best;
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
  // Oldest first, for the chronological dynasty windowing below.
  const chron = [...entries].sort((a, b) => a.archivedAt - b.archivedAt);
  const seasonNames = chron.map((e) => e.name);
  const byKey = new Map<string, TeamRecord>();
  // Per-franchise chronological title tally, aligned to `chron` indices.
  const tallies = new Map<string, SeasonTally[]>();
  const tallyOf = (key: string): SeasonTally[] => {
    let t = tallies.get(key);
    if (!t) {
      t = chron.map(() => ({ majors: 0, intl: 0, worlds: 0 }));
      tallies.set(key, t);
    }
    return t;
  };
  const chronIndex = new Map<string, number>();
  chron.forEach((e, i) => chronIndex.set(e.id, i));

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
        dynasty: {
          tier: "none",
          windowTitles: 0,
          windowIntl: 0,
          windowWorlds: 0,
          windowSpan: null,
        },
      };
      byKey.set(key, rec);
    }
    return rec;
  };

  for (const e of ordered) {
    const si = chronIndex.get(e.id) ?? -1;
    const bumpTally = (key: string, kind: "split" | "intl" | "worlds") => {
      if (si < 0) return;
      const cell = tallyOf(key)[si];
      cell.majors += 1;
      if (kind === "intl" || kind === "worlds") cell.intl += 1;
      if (kind === "worlds") cell.worlds += 1;
    };
    for (const [split, byLeague] of Object.entries(e.splitChampions) as Array<
      [SplitId, Partial<Record<LeagueId, SeasonHistoryTeamRef>>]
    >) {
      for (const team of Object.values(byLeague)) {
        if (!team) continue;
        const rec = recordOf(team);
        rec.splitTitles += 1;
        rec.splitTitleLabels.push(`${e.name} · ${SPLIT_LABELS[split]}`);
        bumpTally(rec.key, "split");
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
      bumpTally(rec.key, event === "worlds" ? "worlds" : "intl");
    }
  }

  const out = [...byKey.values()];
  for (const rec of out) {
    rec.totalTitles = rec.splitTitles + rec.intlTotal;
    rec.dynasty = classifyDynasty(
      tallies.get(rec.key) ?? [],
      seasonNames,
    );
  }
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

// ─── Best team per region (all-time) ────────────────────────────────────────

/** Each league's most decorated franchise of all time (by total titles,
 *  internationals then Worlds break ties). Leagues with no titled team
 *  are omitted. `records` is assumed pre-sorted by computeTeamRecords,
 *  but we don't rely on it. */
export function bestTeamPerRegion(
  records: TeamRecord[],
): Partial<Record<LeagueId, TeamRecord>> {
  const out: Partial<Record<LeagueId, TeamRecord>> = {};
  for (const league of LEAGUE_IDS) {
    const best = records
      .filter((r) => r.team.leagueId === league && r.totalTitles > 0)
      .sort(
        (a, b) =>
          b.totalTitles - a.totalTitles ||
          b.worldsTitles - a.worldsTitles ||
          b.intlTotal - a.intlTotal ||
          a.team.name.localeCompare(b.team.name),
      )[0];
    if (best) out[league] = best;
  }
  return out;
}

// ─── Region strength ────────────────────────────────────────────────────────

export interface RegionStrength {
  league: LeagueId;
  splitTitles: number;
  intlTitles: number;
  worldsTitles: number;
  /** Worlds finals reached by any team of this region (wins + losses). */
  worldsFinals: number;
  /** Weighted score used for the ranking (Worlds ≫ intl ≫ split). */
  score: number;
}

/** Region-vs-region strength readout: how much silverware each league has
 *  pulled in across every archived season. Sorted strongest first. */
export function computeRegionStrength(
  records: TeamRecord[],
  entries: SeasonHistoryEntry[],
): RegionStrength[] {
  const rows = new Map<LeagueId, RegionStrength>();
  for (const league of LEAGUE_IDS) {
    rows.set(league, {
      league,
      splitTitles: 0,
      intlTitles: 0,
      worldsTitles: 0,
      worldsFinals: 0,
      score: 0,
    });
  }
  for (const r of records) {
    const row = rows.get(r.team.leagueId);
    if (!row) continue;
    row.splitTitles += r.splitTitles;
    row.intlTitles += r.intlTotal;
    row.worldsTitles += r.worldsTitles;
  }
  // Worlds finals appearances = champion + runner-up of each season.
  for (const e of entries) {
    for (const finalist of [e.champion, e.runnerUp]) {
      if (!finalist) continue;
      const row = rows.get(finalist.leagueId);
      if (row) row.worldsFinals += 1;
    }
  }
  const out = [...rows.values()];
  for (const row of out) {
    row.score =
      row.worldsTitles * 6 +
      row.intlTitles * 3 +
      row.worldsFinals * 1.5 +
      row.splitTitles;
  }
  out.sort((a, b) => b.score - a.score || a.league.localeCompare(b.league));
  return out;
}

// ─── Title streaks & droughts ───────────────────────────────────────────────

export interface TitleStreak {
  team: SeasonHistoryTeamRef;
  /** Longest run of consecutive archived seasons winning ≥1 major. */
  longestStreak: number;
  /** Longest gap (in seasons) between two of the franchise's titles. */
  longestDrought: number;
  totalTitles: number;
}

/** Per-franchise consecutive-season title streaks and the longest
 *  drought between titles, across the chronological archive. Only
 *  franchises with at least one title appear; sorted by streak. */
export function computeTitleStreaks(
  entries: SeasonHistoryEntry[],
): TitleStreak[] {
  const chron = [...entries].sort((a, b) => a.archivedAt - b.archivedAt);
  // Per franchise: the chronological season indices it won a major in.
  const wonAt = new Map<string, { team: SeasonHistoryTeamRef; idx: number[] }>();
  const note = (team: SeasonHistoryTeamRef | null | undefined, i: number) => {
    if (!team) return;
    const key = teamRecordKey(team);
    let rec = wonAt.get(key);
    if (!rec) {
      rec = { team, idx: [] };
      wonAt.set(key, rec);
    }
    // Newest identity wins (chron is oldest-first, so always overwrite).
    rec.team = team;
    if (rec.idx[rec.idx.length - 1] !== i) rec.idx.push(i);
  };
  chron.forEach((e, i) => {
    for (const byLeague of Object.values(e.splitChampions)) {
      for (const team of Object.values(byLeague ?? {})) note(team, i);
    }
    note(e.intlChampions["first-stand"], i);
    note(e.intlChampions.msi, i);
    note(e.intlChampions.worlds ?? e.champion, i);
  });

  const out: TitleStreak[] = [];
  for (const { team, idx } of wonAt.values()) {
    const unique = [...new Set(idx)].sort((a, b) => a - b);
    let longestStreak = 1;
    let run = 1;
    let longestDrought = 0;
    for (let i = 1; i < unique.length; i++) {
      const gap = unique[i] - unique[i - 1];
      if (gap === 1) {
        run += 1;
        longestStreak = Math.max(longestStreak, run);
      } else {
        run = 1;
        longestDrought = Math.max(longestDrought, gap - 1);
      }
    }
    out.push({
      team,
      longestStreak,
      longestDrought,
      totalTitles: unique.length,
    });
  }
  out.sort(
    (a, b) =>
      b.longestStreak - a.longestStreak ||
      b.totalTitles - a.totalTitles ||
      a.team.name.localeCompare(b.team.name),
  );
  return out;
}

// ─── Player all-time (team-position awards) ─────────────────────────────────

export interface PlayerAllTimeLine {
  team: SeasonHistoryTeamRef;
  lane: Lane;
  mvp: number;
  allPro: number;
  playerName?: string; // newest archived handle for this slot, when known
}

/** All-time MVP / All-Pro tallies per team-position, summed from the
 *  per-season award tallies on each entry. Empty when no archived season
 *  carries award data (seasons archived before the stats expansion). */
export function computePlayerAllTime(
  entries: SeasonHistoryEntry[],
): PlayerAllTimeLine[] {
  const ordered = [...entries].sort((a, b) => b.archivedAt - a.archivedAt);
  const byKey = new Map<string, PlayerAllTimeLine>();
  for (const e of ordered) {
    for (const t of e.awardTally ?? []) {
      const key = `${t.team.leagueId}:${t.team.name}:${t.lane}`;
      const cur = byKey.get(key);
      if (cur) {
        cur.mvp += t.mvp;
        cur.allPro += t.allPro;
      } else {
        // First (newest) appearance sets the display identity.
        byKey.set(key, {
          team: t.team,
          lane: t.lane,
          mvp: t.mvp,
          allPro: t.allPro,
          ...(t.playerName ? { playerName: t.playerName } : {}),
        });
      }
    }
  }
  return [...byKey.values()];
}

// ─── Player careers (by stable id, across seasons) ──────────────────────────

export interface PlayerCareerLine {
  playerId: string;
  playerName: string;
  leagueId: LeagueId | null; // most recent
  teamName?: string; // most recent team, for a logo
  seasons: number;
  games: number;
  kills: number;
  mvps: number;
  allPro: number;
  splitTitles: number;
  intlAppearances: number;
  intlTitles: number;
}

/** Aggregate per-season player records into true careers, keyed by stable
 *  player id. Newest archived season sets the displayed name/league. Empty
 *  until a season archived with player ids. */
export function computePlayerCareers(entries: SeasonHistoryEntry[]): PlayerCareerLine[] {
  const ordered = [...entries].sort((a, b) => b.archivedAt - a.archivedAt);
  const byId = new Map<string, PlayerCareerLine>();
  for (const e of ordered) {
    for (const r of e.playerCareers ?? []) {
      const cur = byId.get(r.playerId);
      if (cur) {
        cur.seasons += 1;
        cur.games += r.games;
        cur.kills += r.kills;
        cur.mvps += r.mvps;
        cur.allPro += r.allPro;
        cur.splitTitles += r.splitTitles;
        cur.intlAppearances += r.intlAppearances;
        cur.intlTitles += r.intlTitles;
      } else {
        byId.set(r.playerId, {
          playerId: r.playerId,
          playerName: r.playerName,
          leagueId: r.leagueId,
          teamName: r.teamName,
          seasons: 1,
          games: r.games,
          kills: r.kills,
          mvps: r.mvps,
          allPro: r.allPro,
          splitTitles: r.splitTitles,
          intlAppearances: r.intlAppearances,
          intlTitles: r.intlTitles,
        });
      }
    }
  }
  return [...byId.values()];
}
