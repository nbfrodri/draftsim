// Cross-season records ("Records & Dynasties") aggregated from the Hall
// of Seasons archive. Teams are matched across seasons by NAME + LEAGUE:
// a "T1" in the LCK of Season 1 and a "T1" in the LCK of Season 3 are
// the same franchise; a same-named team in another league is not.
// Identity details (color, icon) come from the team's most recently
// archived appearance.

import type {
  SeasonHistoryEntry,
  SeasonHistoryTeamRef,
  HistoryRivalry,
  HistoryRivalryScope,
} from "./history";
import type { Lane } from "../types";
import type { PlayerChampStat } from "./stats";
import {
  LEAGUE_IDS,
  SPLIT_LABELS,
  type InternationalId,
  type LeagueId,
  type SplitId,
  INTERNATIONAL_DISPLAY_ORDER,
  INTERNATIONAL_LABELS,
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
//   • Legendary — a Global-Cup- or Worlds-anchored era: ≥ 1 apex title
//                 (Global Cup preferred) AND ≥ LEGENDARY_TITLES majors.
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
  /** Global Cup titles inside that window (apex tier — above Worlds). */
  windowGlobalCup: number;
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
  globalCup: number;
}

/** Slide a 5-season window over a franchise's chronological title
 *  timeline and return its densest qualifying window. `seasonNames` is
 *  the chronological (oldest-first) list of season names; `tally[i]` is
 *  that franchise's majors/intl/worlds/globalCup in season i. */
function classifyDynasty(
  tally: SeasonTally[],
  seasonNames: string[],
): DynastyInfo {
  let best: DynastyInfo = {
    tier: "none",
    windowTitles: 0,
    windowIntl: 0,
    windowWorlds: 0,
    windowGlobalCup: 0,
    windowSpan: null,
  };
  const n = tally.length;
  if (n === 0) return best;
  const rank = (t: DynastyTier) =>
    t === "legendary" ? 2 : t === "dynasty" ? 1 : 0;
  const apexScore = (gc: number, w: number) => gc * 2 + w;
  for (let i = 0; i < n; i++) {
    const end = Math.min(n, i + DYNASTY_WINDOW);
    let majors = 0;
    let intl = 0;
    let worlds = 0;
    let globalCup = 0;
    for (let j = i; j < end; j++) {
      majors += tally[j].majors;
      intl += tally[j].intl;
      worlds += tally[j].worlds;
      globalCup += tally[j].globalCup;
    }
    let tier: DynastyTier = "none";
    if ((globalCup >= 1 || worlds >= 1) && majors >= LEGENDARY_TITLES) {
      tier = "legendary";
    } else if (majors >= DYNASTY_TITLES && intl >= 1) tier = "dynasty";
    if (tier === "none") continue;
    const better =
      rank(tier) > rank(best.tier) ||
      (rank(tier) === rank(best.tier) &&
        (apexScore(globalCup, worlds) > apexScore(best.windowGlobalCup, best.windowWorlds) ||
          (apexScore(globalCup, worlds) === apexScore(best.windowGlobalCup, best.windowWorlds) &&
            majors > best.windowTitles)));
    if (better) {
      let first = i;
      let last = end - 1;
      while (first < end && tally[first].majors === 0) first++;
      while (last >= i && tally[last].majors === 0) last--;
      best = {
        tier,
        windowTitles: majors,
        windowIntl: intl,
        windowWorlds: worlds,
        windowGlobalCup: globalCup,
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

/** Accent/case/punctuation-insensitive franchise name (matches realTeams logos). */
function franchiseNameNorm(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function franchiseKeyNorm(key: string): string {
  const i = key.indexOf(":");
  if (i < 0) return key;
  return `${key.slice(0, i)}:${franchiseNameNorm(key.slice(i + 1))}`;
}

/** Whether two `leagueId:name` franchise keys refer to the same team. */
export function franchiseKeysMatch(a: string, b: string): boolean {
  const na = franchiseKeyNorm(a);
  const nb = franchiseKeyNorm(b);
  if (na === nb) return true;
  const ai = na.indexOf(":");
  const bi = nb.indexOf(":");
  if (na.slice(0, ai) !== nb.slice(0, bi)) return false;
  const an = na.slice(ai + 1);
  const bn = nb.slice(bi + 1);
  if (!an || !bn) return false;
  return an.includes(bn) || bn.includes(an);
}

function parseFranchiseKey(
  key: string,
): { leagueId: LeagueId; name: string } | null {
  const i = key.indexOf(":");
  if (i < 0) return null;
  return { leagueId: key.slice(0, i) as LeagueId, name: key.slice(i + 1) };
}

/** Resolve a roster/search label to the canonical franchise key used in records & rivalries. */
export function resolveCanonicalFranchiseKey(
  entries: SeasonHistoryEntry[],
  records: TeamRecord[],
  name: string,
  leagueId: LeagueId,
): string {
  const candidate = `${leagueId}:${name}`;
  for (const r of records) {
    if (r.team.leagueId === leagueId && franchiseKeysMatch(r.key, candidate))
      return r.key;
  }
  for (const e of entries) {
    for (const rv of e.rivalries ?? []) {
      for (const t of [rv.teamA, rv.teamB]) {
        const k = teamRecordKey(t);
        if (t.leagueId === leagueId && franchiseKeysMatch(k, candidate)) return k;
      }
    }
    for (const rv of e.headToHead ?? []) {
      for (const t of [rv.teamA, rv.teamB]) {
        const k = teamRecordKey(t);
        if (t.leagueId === leagueId && franchiseKeysMatch(k, candidate)) return k;
      }
    }
  }
  return candidate;
}

function identityForKey(
  identity: Map<string, SeasonHistoryTeamRef>,
  key: string,
  fallback?: SeasonHistoryTeamRef,
): SeasonHistoryTeamRef | undefined {
  const direct = identity.get(key);
  if (direct) return direct;
  if (fallback) return fallback;
  for (const [k, ref] of identity) {
    if (franchiseKeysMatch(k, key)) return ref;
  }
  return undefined;
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
      t = chron.map(() => ({ majors: 0, intl: 0, worlds: 0, globalCup: 0 }));
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
          windowGlobalCup: 0,
          windowSpan: null,
        },
      };
      byKey.set(key, rec);
    }
    return rec;
  };

  for (const e of ordered) {
    const si = chronIndex.get(e.id) ?? -1;
    const bumpTally = (
      key: string,
      kind: "split" | "intl" | "worlds" | "global-cup",
    ) => {
      if (si < 0) return;
      const cell = tallyOf(key)[si];
      cell.majors += 1;
      if (kind !== "split") cell.intl += 1;
      if (kind === "worlds") cell.worlds += 1;
      if (kind === "global-cup") cell.globalCup += 1;
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
    > = INTERNATIONAL_DISPLAY_ORDER.map((event) => [
      event,
      event === "worlds"
        ? worldsWinner
        : e.intlChampions[event],
    ] as [InternationalId, SeasonHistoryTeamRef | undefined]);
    for (const [event, team] of intlWinners) {
      if (!team) continue;
      const rec = recordOf(team);
      rec.intlTitles[event] = (rec.intlTitles[event] ?? 0) + 1;
      rec.intlTotal += 1;
      if (event === "worlds") rec.worldsTitles += 1;
      bumpTally(
        rec.key,
        event === "worlds"
          ? "worlds"
          : event === "global-cup"
            ? "global-cup"
            : "intl",
      );
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
// Weighted prestige score: internationals count far more than domestic splits
// (Worlds most of all), matching the Hall of Fame ladder. Used to rank a
// region's "most decorated" franchise rather than a flat title count.
export function teamPrestigeScore(r: TeamRecord): number {
  return (
    r.splitTitles +
    (r.intlTitles["first-stand"] ?? 0) * 4 +
    (r.intlTitles.msi ?? 0) * 6 +
    (r.intlTitles.worlds ?? 0) * 10 +
    (r.intlTitles["global-cup"] ?? 0) * 14
  );
}

export function bestTeamPerRegion(
  records: TeamRecord[],
): Partial<Record<LeagueId, TeamRecord>> {
  const out: Partial<Record<LeagueId, TeamRecord>> = {};
  for (const league of LEAGUE_IDS) {
    const best = records
      .filter((r) => r.team.leagueId === league && r.totalTitles > 0)
      .sort(
        (a, b) =>
          teamPrestigeScore(b) - teamPrestigeScore(a) ||
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

/** Head-to-head rows stored on a season — prefers the full ledger when present. */
function seasonHeadToHeadRows(e: SeasonHistoryEntry): HistoryRivalry[] {
  return e.headToHead ?? e.rivalries ?? [];
}

function franchiseYearFromSeasonName(name: string): number | undefined {
  const m = name.match(/Year (\d+)\s*$/);
  return m ? Number(m[1]) : undefined;
}

const H2H_SCOPE_ORDER: Array<SplitId | InternationalId> = [
  "winter",
  "spring",
  "summer",
  "first-stand",
  "msi",
  "worlds",
  "global-cup",
];

function scopeSortIndex(scope: SplitId | InternationalId): number {
  const i = H2H_SCOPE_ORDER.indexOf(scope);
  return i >= 0 ? i : H2H_SCOPE_ORDER.length;
}

function flipScopes(
  scopes: HistoryRivalryScope[] | undefined,
): HistoryRivalryScope[] | undefined {
  if (!scopes?.length) return undefined;
  return scopes.map((s) => ({
    scope: s.scope,
    meetings: s.meetings,
    aWins: s.bWins,
    bWins: s.aWins,
  }));
}

function mergeScopeRows(
  into: Map<SplitId | InternationalId, HistoryRivalryScope>,
  scopes: HistoryRivalryScope[] | undefined,
  flip: boolean,
) {
  for (const s of scopes ?? []) {
    const cur = into.get(s.scope) ?? {
      scope: s.scope,
      meetings: 0,
      aWins: 0,
      bWins: 0,
    };
    cur.meetings += s.meetings;
    if (flip) {
      cur.aWins += s.bWins;
      cur.bWins += s.aWins;
    } else {
      cur.aWins += s.aWins;
      cur.bWins += s.bWins;
    }
    into.set(s.scope, cur);
  }
}

function sortedScopeRows(
  map: Map<SplitId | InternationalId, HistoryRivalryScope>,
): HistoryRivalryScope[] {
  return [...map.values()].sort(
    (a, b) => scopeSortIndex(a.scope) - scopeSortIndex(b.scope),
  );
}

/** Human label for a head-to-head scope chip (split or international). */
export function headToHeadScopeLabel(scope: SplitId | InternationalId): string {
  if (scope === "winter" || scope === "spring" || scope === "summer") {
    return SPLIT_LABELS[scope];
  }
  return INTERNATIONAL_LABELS[scope as InternationalId] ?? scope;
}

export interface AllTimeRivalry {
  /** Lexicographically first franchise in the pair. */
  teamA: SeasonHistoryTeamRef;
  teamB: SeasonHistoryTeamRef;
  meetings: number;
  aWins: number;
  bWins: number;
}

/** Head-to-head pairings that met most often across every archived season.
 *  Franchises match by name + league; only pairs with ≥ 2 total meetings
 *  are returned. Newest archived identity is used for display. */
export function computeAllTimeRivalries(
  entries: SeasonHistoryEntry[],
): AllTimeRivalry[] {
  const ordered = [...entries].sort((a, b) => b.archivedAt - a.archivedAt);
  const rows = new Map<string, AllTimeRivalry>();
  for (const e of ordered) {
    for (const r of seasonHeadToHeadRows(e)) {
      const keyA = teamRecordKey(r.teamA);
      const keyB = teamRecordKey(r.teamB);
      const flip = keyA > keyB;
      const pairKey = flip ? `${keyB}|${keyA}` : `${keyA}|${keyB}`;
      const cur = rows.get(pairKey);
      if (cur) {
        cur.meetings += r.meetings;
        if (flip) {
          cur.aWins += r.bWins;
          cur.bWins += r.aWins;
        } else {
          cur.aWins += r.aWins;
          cur.bWins += r.bWins;
        }
      } else {
        rows.set(pairKey, {
          teamA: flip ? r.teamB : r.teamA,
          teamB: flip ? r.teamA : r.teamB,
          meetings: r.meetings,
          aWins: flip ? r.bWins : r.aWins,
          bWins: flip ? r.aWins : r.bWins,
        });
      }
    }
  }
  return [...rows.values()]
    .filter((r) => r.meetings >= 2)
    .sort(
      (a, b) =>
        b.meetings - a.meetings ||
        Math.max(b.aWins, b.bWins) - Math.max(a.aWins, a.bWins) ||
        a.teamA.name.localeCompare(b.teamA.name),
    )
    .slice(0, 8);
}

// ─── Team head-to-head compare ──────────────────────────────────────────────

export interface TeamHeadToHeadSeason {
  seasonName: string;
  /** Franchise year parsed from the season name, when present. */
  franchiseYear?: number;
  archivedAt: number;
  meetings: number;
  aWins: number;
  bWins: number;
  /** Per-stage breakdown for this season only. */
  byScope?: HistoryRivalryScope[];
}

export interface TeamHeadToHead {
  teamA: SeasonHistoryTeamRef;
  teamB: SeasonHistoryTeamRef;
  /** Decided series/meetings across the archive. */
  meetings: number;
  aWins: number;
  bWins: number;
  /** All-time per-stage totals (splits + internationals). */
  byScope?: HistoryRivalryScope[];
  seasons: TeamHeadToHeadSeason[];
}

export interface TeamCompareResult {
  teamA: SeasonHistoryTeamRef;
  teamB: SeasonHistoryTeamRef;
  h2h: TeamHeadToHead | null;
  recordA: TeamRecord | null;
  recordB: TeamRecord | null;
  /** Seasons the franchise appeared at an international stage. */
  intlAppearancesA: number;
  intlAppearancesB: number;
  /** Worlds finals reached (champion + runner-up). */
  worldsFinalsA: number;
  worldsFinalsB: number;
}

function franchiseKeyFromParts(name: string, leagueId: LeagueId): string {
  return `${leagueId}:${name}`;
}

function noteFranchise(
  map: Map<string, SeasonHistoryTeamRef>,
  ref: SeasonHistoryTeamRef | null | undefined,
) {
  if (!ref) return;
  map.set(teamRecordKey(ref), ref);
}

/** Newest archived identity per franchise key — champions, rosters, etc. */
function buildFranchiseIdentity(
  entries: SeasonHistoryEntry[],
): Map<string, SeasonHistoryTeamRef> {
  const ordered = [...entries].sort((a, b) => b.archivedAt - a.archivedAt);
  const byKey = new Map<string, SeasonHistoryTeamRef>();
  for (const e of ordered) {
    noteFranchise(byKey, e.champion);
    noteFranchise(byKey, e.runnerUp);
    for (const ref of Object.values(e.intlChampions)) noteFranchise(byKey, ref);
    for (const byLeague of Object.values(e.splitChampions))
      for (const ref of Object.values(byLeague ?? {})) noteFranchise(byKey, ref);
    for (const r of e.rivalries ?? []) {
      noteFranchise(byKey, r.teamA);
      noteFranchise(byKey, r.teamB);
    }
    for (const r of e.headToHead ?? []) {
      noteFranchise(byKey, r.teamA);
      noteFranchise(byKey, r.teamB);
    }
    for (const phase of e.phaseRosters ?? []) {
      for (const t of phase.teams) {
        noteFranchise(byKey, {
          name: t.teamName,
          leagueId: t.leagueId,
          color: "",
          iconKey: "shield",
          ...(t.logoUrl ? { logoUrl: t.logoUrl } : {}),
        });
      }
    }
  }
  return byKey;
}

function countIntlAppearances(
  entries: SeasonHistoryEntry[],
  key: string,
): number {
  let count = 0;
  for (const e of entries) {
    const appeared = (e.phaseRosters ?? []).some(
      (phase) =>
        phase.kind === "international" &&
        phase.teams.some((t) =>
          franchiseKeysMatch(
            franchiseKeyFromParts(t.teamName, t.leagueId),
            key,
          ),
        ),
    );
    if (appeared) count += 1;
  }
  return count;
}

function countWorldsFinals(
  entries: SeasonHistoryEntry[],
  key: string,
): number {
  let count = 0;
  for (const e of entries) {
    for (const ref of [e.champion, e.runnerUp]) {
      if (ref && franchiseKeysMatch(teamRecordKey(ref), key)) count += 1;
    }
  }
  return count;
}

/** Head-to-head record between two franchises (name + league), aggregated
 *  from archived rivalry data. Returns null when they never met. */
export function computeTeamHeadToHead(
  entries: SeasonHistoryEntry[],
  keyA: string,
  keyB: string,
): TeamHeadToHead | null {
  if (!keyA || !keyB || franchiseKeysMatch(keyA, keyB)) return null;
  const chronological = [...entries].sort((a, b) => a.archivedAt - b.archivedAt);
  const identity = buildFranchiseIdentity(entries);

  let meetings = 0;
  let aWins = 0;
  let bWins = 0;
  const seasons: TeamHeadToHeadSeason[] = [];
  const scopeAllTime = new Map<SplitId | InternationalId, HistoryRivalryScope>();
  let matchedA: SeasonHistoryTeamRef | undefined;
  let matchedB: SeasonHistoryTeamRef | undefined;

  for (const e of chronological) {
    for (const r of seasonHeadToHeadRows(e)) {
      const rKeyA = teamRecordKey(r.teamA);
      const rKeyB = teamRecordKey(r.teamB);
      const aIsQueryA =
        franchiseKeysMatch(rKeyA, keyA) && franchiseKeysMatch(rKeyB, keyB);
      const aIsQueryB =
        franchiseKeysMatch(rKeyA, keyB) && franchiseKeysMatch(rKeyB, keyA);
      if (!aIsQueryA && !aIsQueryB) continue;

      const aIsFirst = aIsQueryA;
      const seasonAWins = aIsFirst ? r.aWins : r.bWins;
      const seasonBWins = aIsFirst ? r.bWins : r.aWins;
      const seasonScopes = aIsFirst ? r.byScope : flipScopes(r.byScope);

      meetings += r.meetings;
      aWins += seasonAWins;
      bWins += seasonBWins;
      mergeScopeRows(scopeAllTime, seasonScopes, false);
      matchedA = aIsFirst ? r.teamA : r.teamB;
      matchedB = aIsFirst ? r.teamB : r.teamA;

      seasons.push({
        seasonName: e.name,
        franchiseYear: franchiseYearFromSeasonName(e.name),
        archivedAt: e.archivedAt,
        meetings: r.meetings,
        aWins: seasonAWins,
        bWins: seasonBWins,
        ...(seasonScopes && seasonScopes.length > 0
          ? { byScope: seasonScopes }
          : {}),
      });
    }
  }

  if (meetings === 0) return null;
  const teamA = identityForKey(identity, keyA, matchedA);
  const teamB = identityForKey(identity, keyB, matchedB);
  if (!teamA || !teamB) return null;
  const byScope = sortedScopeRows(scopeAllTime);
  return {
    teamA,
    teamB,
    meetings,
    aWins,
    bWins,
    ...(byScope.length > 0 ? { byScope } : {}),
    seasons,
  };
}

/** Side-by-side franchise comparison: H2H (when rivalry data exists) plus
 *  title records and international/Worlds footprint from the archive. */
export function compareTeams(
  entries: SeasonHistoryEntry[],
  records: TeamRecord[],
  keyA: string,
  keyB: string,
): TeamCompareResult | null {
  const parsedA = parseFranchiseKey(keyA);
  const parsedB = parseFranchiseKey(keyB);
  if (!parsedA || !parsedB) return null;
  const canonA = resolveCanonicalFranchiseKey(
    entries,
    records,
    parsedA.name,
    parsedA.leagueId,
  );
  const canonB = resolveCanonicalFranchiseKey(
    entries,
    records,
    parsedB.name,
    parsedB.leagueId,
  );
  if (franchiseKeysMatch(canonA, canonB)) return null;
  const identity = buildFranchiseIdentity(entries);
  const recordMap = new Map(records.map((r) => [r.key, r]));
  const recordA =
    recordMap.get(canonA) ??
    [...recordMap.values()].find((r) => franchiseKeysMatch(r.key, canonA));
  const recordB =
    recordMap.get(canonB) ??
    [...recordMap.values()].find((r) => franchiseKeysMatch(r.key, canonB));
  const h2h = computeTeamHeadToHead(entries, canonA, canonB);
  const fallback = (key: string): SeasonHistoryTeamRef | undefined => {
    const rec =
      recordMap.get(key) ??
      [...recordMap.values()].find((r) => franchiseKeysMatch(r.key, key));
    if (rec) return rec.team;
    if (h2h) {
      if (franchiseKeysMatch(teamRecordKey(h2h.teamA), key)) return h2h.teamA;
      if (franchiseKeysMatch(teamRecordKey(h2h.teamB), key)) return h2h.teamB;
    }
    return identityForKey(identity, key);
  };
  const teamA = fallback(canonA);
  const teamB = fallback(canonB);
  if (!teamA || !teamB) return null;
  return {
    teamA,
    teamB,
    h2h,
    recordA: recordA ?? null,
    recordB: recordB ?? null,
    intlAppearancesA: countIntlAppearances(entries, canonA),
    intlAppearancesB: countIntlAppearances(entries, canonB),
    worldsFinalsA: countWorldsFinals(entries, canonA),
    worldsFinalsB: countWorldsFinals(entries, canonB),
  };
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
  lane?: Lane; // most-recent lane — drives the all-time per-role boards
  seasons: number;
  games: number;
  // Exact career games won, summed from per-season win counts. `winsGames` is
  // the matching denominator (games only from seasons that recorded wins), so a
  // career spanning the feature boundary still yields an exact rate over the
  // seasons that have the data. Both 0 on pre-expansion archives.
  wins: number;
  winsGames: number;
  kills: number;
  mvps: number;
  allPro: number;
  // Split (per-league) and season-of-the-year All-Pro selections, summed across
  // seasons. 0 on careers built only from pre-expansion archives.
  allProSplit: number;
  allProSeason: number;
  // International-event finals MVPs (First Stand / MSI / Worlds), summed.
  intlMvps: number;
  // Domestic split finals MVPs (per region league), summed.
  splitMvps: number;
  // Most-recent known age (newest archived season carrying one). Undefined when
  // no archived season recorded an age.
  age?: number;
  // Career champion pool: every champion the player has been recorded on,
  // summed across seasons, sorted by games. Empty on pre-expansion archives.
  champs: PlayerChampStat[];
  splitTitles: number;
  intlAppearances: number;
  intlTitles: number;
  // Summed richer stats (only from seasons archived after they existed). Use
  // the *Games denominators to average correctly; 0 → unknown, render "—".
  deaths: number;
  assists: number;
  pentakills: number;
  ratingSum: number;
  ratingGames: number;
  goldDiffSum: number;
  goldDiffGames: number;
}

/** Aggregate per-season player records into true careers, keyed by stable
 *  player id. Newest archived season sets the displayed name/league. Empty
 *  until a season archived with player ids. */
export function computePlayerCareers(entries: SeasonHistoryEntry[]): PlayerCareerLine[] {
  const ordered = [...entries].sort((a, b) => b.archivedAt - a.archivedAt);
  const byId = new Map<string, PlayerCareerLine>();
  // playerId → championId → summed {games, wins}, finalized into champs at the end.
  const champAcc = new Map<string, Map<number, { games: number; wins: number }>>();
  const mergeChamps = (playerId: string, champs: PlayerChampStat[] | undefined) => {
    if (!champs?.length) return;
    let m = champAcc.get(playerId);
    if (!m) {
      m = new Map();
      champAcc.set(playerId, m);
    }
    for (const c of champs) {
      const cur = m.get(c.championId) ?? { games: 0, wins: 0 };
      cur.games += c.games;
      cur.wins += c.wins;
      m.set(c.championId, cur);
    }
  };
  for (const e of ordered) {
    for (const r of e.playerCareers ?? []) {
      mergeChamps(r.playerId, r.champs);
      const cur = byId.get(r.playerId);
      if (cur) {
        cur.seasons += 1;
        cur.games += r.games;
        cur.wins += r.wins ?? 0;
        cur.winsGames += r.wins != null ? r.games : 0;
        cur.kills += r.kills;
        cur.mvps += r.mvps;
        cur.allPro += r.allPro;
        cur.allProSplit += r.allProSplit ?? 0;
        cur.allProSeason += r.allProSeason ?? 0;
        cur.intlMvps += r.intlMvps ?? 0;
        cur.splitMvps += r.splitMvps ?? 0;
        cur.splitTitles += r.splitTitles;
        cur.intlAppearances += r.intlAppearances;
        cur.intlTitles += r.intlTitles;
        cur.deaths += r.deaths ?? 0;
        cur.assists += r.assists ?? 0;
        cur.pentakills += r.pentakills ?? 0;
        cur.ratingSum += r.ratingSum ?? 0;
        cur.ratingGames += r.ratingGames ?? 0;
        cur.goldDiffSum += r.goldDiffSum ?? 0;
        cur.goldDiffGames += r.goldDiffGames ?? 0;
      } else {
        byId.set(r.playerId, {
          playerId: r.playerId,
          playerName: r.playerName,
          leagueId: r.leagueId,
          teamName: r.teamName,
          ...(r.lane ? { lane: r.lane } : {}),
          // Newest archived season is seen first, so it sets the displayed age.
          ...(r.age != null ? { age: r.age } : {}),
          seasons: 1,
          games: r.games,
          wins: r.wins ?? 0,
          winsGames: r.wins != null ? r.games : 0,
          kills: r.kills,
          mvps: r.mvps,
          allPro: r.allPro,
          allProSplit: r.allProSplit ?? 0,
          allProSeason: r.allProSeason ?? 0,
          intlMvps: r.intlMvps ?? 0,
          splitMvps: r.splitMvps ?? 0,
          champs: [],
          splitTitles: r.splitTitles,
          intlAppearances: r.intlAppearances,
          intlTitles: r.intlTitles,
          deaths: r.deaths ?? 0,
          assists: r.assists ?? 0,
          pentakills: r.pentakills ?? 0,
          ratingSum: r.ratingSum ?? 0,
          ratingGames: r.ratingGames ?? 0,
          goldDiffSum: r.goldDiffSum ?? 0,
          goldDiffGames: r.goldDiffGames ?? 0,
        });
      }
    }
  }
  // Finalize career champion pools: sort each player's merged champs by games.
  for (const [playerId, m] of champAcc) {
    const line = byId.get(playerId);
    if (!line) continue;
    line.champs = [...m.entries()]
      .map(([championId, v]) => ({ championId, games: v.games, wins: v.wins }))
      .sort((a, b) => b.games - a.games || b.wins - a.wins || a.championId - b.championId);
  }
  return [...byId.values()];
}

/** Per-region title leaders: each player's split (and international) titles
 *  attributed to the REGION THEY WON THEM IN — not their latest league. A player
 *  who lifts two LCK trophies then moves to the LCS still shows two under LCK,
 *  because each per-season record carries the league the player represented that
 *  year. Name / team / lane come from the player's NEWEST title season in that
 *  region (so the row badges a relevant team logo). Returns one flat list; group
 *  by `leagueId` to render per-region columns. */
export interface RegionTitleLeader {
  playerId: string;
  playerName: string;
  leagueId: LeagueId;
  teamName?: string;
  lane?: Lane;
  splitTitles: number; // split titles won IN this region
  intlTitles: number; // intl titles won while representing this region
}

export function computeRegionTitleLeaders(
  entries: SeasonHistoryEntry[],
): RegionTitleLeader[] {
  // Oldest → newest so the newest title season in a region sets the display.
  const ordered = [...entries].sort((a, b) => a.archivedAt - b.archivedAt);
  const byKey = new Map<string, RegionTitleLeader>();
  for (const e of ordered) {
    for (const r of e.playerCareers ?? []) {
      if (!r.leagueId) continue;
      if (r.splitTitles <= 0 && r.intlTitles <= 0) continue;
      const key = `${r.playerId}|${r.leagueId}`;
      const cur = byKey.get(key);
      if (cur) {
        cur.splitTitles += r.splitTitles;
        cur.intlTitles += r.intlTitles;
        cur.playerName = r.playerName;
        if (r.teamName) cur.teamName = r.teamName;
        if (r.lane) cur.lane = r.lane;
      } else {
        byKey.set(key, {
          playerId: r.playerId,
          playerName: r.playerName,
          leagueId: r.leagueId,
          ...(r.teamName ? { teamName: r.teamName } : {}),
          ...(r.lane ? { lane: r.lane } : {}),
          splitTitles: r.splitTitles,
          intlTitles: r.intlTitles,
        });
      }
    }
  }
  return [...byKey.values()];
}

/** Career game wins / losses. Exact when the career has per-season win counts
 *  (`winsGames` > 0) — every decided game is counted. For pre-expansion archives
 *  that predate win tracking it falls back to the champion-pool tallies (capped
 *  per season, so a prolific pool can slightly undercount). `rate` is null when
 *  neither source has any recorded games. */
export function careerWinLoss(c: PlayerCareerLine): {
  wins: number;
  games: number;
  rate: number | null;
} {
  if (c.winsGames > 0) {
    return { wins: c.wins, games: c.winsGames, rate: c.wins / c.winsGames };
  }
  let wins = 0;
  let games = 0;
  for (const ch of c.champs) {
    wins += ch.wins;
    games += ch.games;
  }
  return { wins, games, rate: games > 0 ? wins / games : null };
}

// ─── Player titles split by event (Hall of Fame) ────────────────────────────

/** Career title counts per player, broken out by event — domestic splits and
 *  each international (First Stand / MSI / Worlds). Attribution mirrors the
 *  player career boards: a player is credited only if they were ROSTERED for
 *  the champion team at that stage (via phaseRosters), de-duplicated within a
 *  season so play-in + main stages of the same event count once. */
export interface PlayerTitleTotals {
  splits: number;
  firstStand: number;
  msi: number;
  worlds: number;
  globalCup: number;
}
const INTL_FIELD: Record<InternationalId, keyof PlayerTitleTotals> = {
  "first-stand": "firstStand",
  msi: "msi",
  worlds: "worlds",
  "global-cup": "globalCup",
};
export function computePlayerTitlesByEvent(
  entries: SeasonHistoryEntry[],
): Map<string, PlayerTitleTotals> {
  const out = new Map<string, PlayerTitleTotals>();
  const ensure = (id: string) => {
    let t = out.get(id);
    if (!t) {
      t = { splits: 0, firstStand: 0, msi: 0, worlds: 0, globalCup: 0 };
      out.set(id, t);
    }
    return t;
  };
  for (const e of entries) {
    const seen = new Set<string>(); // `${playerId}:${titleKey}` — once per season
    for (const phase of e.phaseRosters ?? []) {
      if (phase.kind === "split" && phase.split) {
        const byLeague = e.splitChampions[phase.split] ?? {};
        for (const [league, champ] of Object.entries(byLeague)) {
          if (!champ) continue;
          const team = phase.teams.find(
            (t) => t.teamName === champ.name && t.leagueId === league,
          );
          for (const p of team?.players ?? []) {
            if (!p.id) continue;
            const k = `${p.id}:split:${phase.split}:${league}`;
            if (seen.has(k)) continue;
            seen.add(k);
            ensure(p.id).splits += 1;
          }
        }
      } else if (phase.kind === "international" && phase.event) {
        const champ = e.intlChampions[phase.event];
        if (!champ) continue;
        const team = phase.teams.find(
          (t) => t.teamName === champ.name && t.leagueId === champ.leagueId,
        );
        const field = INTL_FIELD[phase.event];
        for (const p of team?.players ?? []) {
          if (!p.id) continue;
          const k = `${p.id}:${phase.event}`;
          if (seen.has(k)) continue;
          seen.add(k);
          ensure(p.id)[field] += 1;
        }
      }
    }
  }
  return out;
}
