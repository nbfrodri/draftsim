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
import type { Lane, PlayerTier } from "../types";
import {
  seasonTeam,
  LEAGUE_IDS,
  type InternationalId,
  type LeagueId,
  type PhaseRosterSnapshot,
  type PlayerTransfer,
  type SeasonState,
  type SplitId,
} from "./types";
import { isGlobalCupYear } from "./engine";
import {
  computeSeasonStats,
  computeSeasonHeadToHead,
  computeStageStats,
  computePlayerCareerRecords,
  computeSeasonIntlMvps,
  computeSeasonSplitMvps,
  computeSeasonRookiesOfYear,
  type PlayerSeasonRecord,
} from "./stats";
import {
  computeAllProTeams,
  computeAllProCounts,
  type AllProScope,
} from "./allPro";
import { buildSeasonStory, type SeasonStory } from "./seasonStory";

/** A roster move frozen for the Hall: team names (not ids — teams regenerate)
 *  plus the two players who swapped lanes between the two clubs. */
export interface HistoryTransfer {
  event: InternationalId;
  lane: Lane;
  from: SeasonHistoryTeamRef | null;
  to: SeasonHistoryTeamRef | null;
  /** Headline player moving from→to. */
  inName?: string;
  inTier: PlayerTier;
  /** Player going the other way (to→from). */
  outName?: string;
  outTier: PlayerTier;
}

/** Frozen team identity at archive time (teams are regenerated every
 *  season, so ids alone would dangle). */
export interface SeasonHistoryTeamRef {
  name: string;
  leagueId: LeagueId;
  color: string;
  iconKey: string;
  // Real pro team logo URL (https), when the team was named from the LoL
  // Esports API. Optional — older archives and generated teams omit it.
  logoUrl?: string;
}

/** A league's best team for the whole season, with its aggregate record
 *  (match wins/losses) and trophy count. Feeds the all-time "best team
 *  per region" and region win-rate readouts. */
export interface SeasonHistoryBestTeam {
  team: SeasonHistoryTeamRef;
  wins: number;
  losses: number;
  titles: number;
}

/** Season award tally for one team-position (players are identified by
 *  team + lane). `mvp` and `allPro` count this season's selections; the
 *  Hall sums them across seasons for the all-time player boards. */
export interface SeasonHistoryAwardTally {
  team: SeasonHistoryTeamRef;
  lane: Lane;
  mvp: number;
  allPro: number;
  // The handle holding this slot, snapshotted at archive time (most recent
  // award winner). Optional — absent on archives saved before names existed.
  playerName?: string;
}

/** One member (by lane) of an archived All-Pro team. Team identity is frozen
 *  as a ref (teams regenerate every season). */
export interface SeasonHistoryAllProMember {
  lane: Lane;
  playerId?: string;
  playerName?: string;
  team: SeasonHistoryTeamRef;
  avgRating: number;
  games: number;
}

/** An archived All-Pro team selection — the season-of-the-year team, a
 *  per-split global team, or a per-league split team. */
export interface SeasonHistoryAllProTeam {
  scope: AllProScope;
  split?: SplitId;
  leagueId?: LeagueId;
  members: SeasonHistoryAllProMember[];
}

/** The finals MVP of one international event — a player from the champion team,
 *  frozen with team identity. */
export interface SeasonHistoryIntlMvp {
  event: InternationalId;
  lane: Lane;
  playerName?: string;
  playerId?: string;
  team: SeasonHistoryTeamRef;
  avgRating: number;
  games: number;
}

/** The finals MVP of one domestic split, per league — a player from the split
 *  champion, frozen with team identity. */
export interface SeasonHistorySplitMvp {
  split: SplitId;
  leagueId: LeagueId;
  lane: Lane;
  playerName?: string;
  playerId?: string;
  team: SeasonHistoryTeamRef;
  avgRating: number;
  games: number;
}

/** Rookie of the Year for one lane — debut-year players only, scored by titles
 *  and average grade. Optional — only on seasons archived after this existed. */
export interface SeasonHistoryRookieOfYear {
  lane: Lane;
  playerId?: string;
  playerName?: string;
  team: SeasonHistoryTeamRef;
  avgRating: number;
  games: number;
  splitTitles: number;
  intlTitles: number;
  score: number;
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
  /** Runner-up of each international (2nd place). Optional — only on seasons
   *  archived after this existed; older entries omit it. */
  intlRunnersUp?: Partial<Record<InternationalId, SeasonHistoryTeamRef>>;
  /** Runner-up of every split, per league (2nd place). Optional, as above. */
  splitRunnersUp?: Partial<
    Record<SplitId, Partial<Record<LeagueId, SeasonHistoryTeamRef>>>
  >;
  /** Champion tier table the season STARTED on. null = the default
   *  tiers; undefined = unknown (season pre-dates initialMeta). */
  initialMetaOverride?: MetaOverride | null;
  /** Tier table at archive time — after a year of live evolution and
   *  patch shifts. null = default tiers. */
  finalMetaOverride?: MetaOverride | null;
  /** Per-league best team of the whole season (match wins + trophies).
   *  Optional — only on seasons archived after the stats expansion. */
  leagueBestTeams?: Partial<Record<LeagueId, SeasonHistoryBestTeam>>;
  /** Season MVP / All-Pro tallies per team-position, for the all-time
   *  player boards. Optional — only on seasons archived after the stats
   *  expansion. */
  awardTally?: SeasonHistoryAwardTally[];
  /** All-Pro team selections this season: the season-of-the-year team, each
   *  split's global team, and each league's per-split team. Optional — only on
   *  seasons archived after the All-Pro-team expansion. */
  allProTeams?: SeasonHistoryAllProTeam[];
  /** Finals MVP of each international event (a player from the champion team).
   *  Optional — only on seasons archived after the intl-MVP expansion. */
  intlMvps?: SeasonHistoryIntlMvp[];
  /** Finals MVP of each domestic split, per league (a player from the split
   *  champion). Optional — only on seasons archived after the split-MVP expansion. */
  splitMvps?: SeasonHistorySplitMvp[];
  /** Rookie of the Year per lane (debut-year players). Optional — only on
   *  seasons archived after the ROTY expansion. */
  rookieOfYear?: SeasonHistoryRookieOfYear[];
  /** Per-player season records (by stable id) for the all-time CAREER boards —
   *  kills, MVPs, all-pro, split titles, international appearances/titles.
   *  Optional — only on seasons archived after player ids existed. */
  playerCareers?: PlayerSeasonRecord[];
  /** Every team's roster as each split/international was played, so the Hall
   *  can show who was on which team at any stage of the year. */
  phaseRosters?: PhaseRosterSnapshot[];
  /** Roster moves that happened during the year's transfer windows, frozen
   *  with team names so they recap forever. Optional — only on seasons that
   *  ran with player transfers and had at least one move. */
  transfers?: HistoryTransfer[];
  /** Per-league strength score at archive time (the evolved region tide).
   *  Optional — only present on seasons that ran with Region Tides on.
   *  Carried into the next season's starting tides (decayed toward
   *  neutral) so regions keep a reputation across years. */
  leagueStrength?: Partial<Record<LeagueId, number>>;
  /** Templated per-season narrative recap (champion's path, biggest upset,
   *  team of the year, region that rose, meta arc). Optional — only on
   *  seasons archived after the story feature; older entries simply omit it. */
  story?: SeasonStory;
  /** Most-played head-to-head pairings this season (franchise refs, not ids).
   *  Optional — only on seasons archived after the rivalry expansion. */
  rivalries?: HistoryRivalry[];
  /** Full head-to-head ledger — every franchise pairing that met at least once
   *  (splits + internationals), with per-stage breakdown. Optional — only on
   *  seasons archived after the full-H2H expansion; older entries fall back to
   *  `rivalries` (top pairings, often without scope detail). */
  headToHead?: HistoryRivalry[];
}

/** Per-stage slice of a frozen head-to-head (split or international). */
export interface HistoryRivalryScope {
  scope: SplitId | InternationalId;
  meetings: number;
  aWins: number;
  bWins: number;
}

/** A frozen head-to-head pairing for the Hall archive. Teams are ordered by
 *  franchise key (`leagueId:name`) so seasons merge cleanly all-time. */
export interface HistoryRivalry {
  teamA: SeasonHistoryTeamRef;
  teamB: SeasonHistoryTeamRef;
  meetings: number;
  /** Wins for `teamA` (lexicographically first franchise key). */
  aWins: number;
  /** Wins for `teamB`. */
  bWins: number;
  /** Domestic splits + internationals where this pair met. Optional — only on
   *  seasons archived after the full-H2H expansion. */
  byScope?: HistoryRivalryScope[];
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
    logoUrl: team.logoUrl,
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
  const intlRunnersUp: NonNullable<SeasonHistoryEntry["intlRunnersUp"]> = {};
  for (const [event, placements] of Object.entries(season.intlResults) as Array<
    [InternationalId, string[]]
  >) {
    const ref = teamRef(season, placements[0]);
    if (ref) intlChampions[event] = ref;
    const ru = teamRef(season, placements[1]);
    if (ru) intlRunnersUp[event] = ru;
  }
  const splitChampions: SeasonHistoryEntry["splitChampions"] = {};
  const splitRunnersUp: NonNullable<SeasonHistoryEntry["splitRunnersUp"]> = {};
  for (const [split, byLeague] of Object.entries(season.splitResults) as Array<
    [SplitId, Partial<Record<LeagueId, string[]>>]
  >) {
    const out: Partial<Record<LeagueId, SeasonHistoryTeamRef>> = {};
    const ru: Partial<Record<LeagueId, SeasonHistoryTeamRef>> = {};
    for (const [league, placements] of Object.entries(byLeague) as Array<
      [LeagueId, string[]]
    >) {
      const ref = teamRef(season, placements?.[0]);
      if (ref) out[league] = ref;
      const r2 = teamRef(season, placements?.[1]);
      if (r2) ru[league] = r2;
    }
    if (Object.keys(out).length > 0) splitChampions[split] = out;
    if (Object.keys(ru).length > 0) splitRunnersUp[split] = ru;
  }
  // Performance-derived stats need the season's tournaments. They're
  // always present on a real season, but stay defensive for sparse /
  // fabricated inputs (older saves, tests) — skip the extra fields then.
  const tournaments = season.tournaments
    ? Object.values(season.tournaments)
    : [];
  const leagueBestTeams: SeasonHistoryEntry["leagueBestTeams"] = {};
  const tallyMap = new Map<string, SeasonHistoryAwardTally>();
  const rivalryArchive: HistoryRivalry[] = [];
  const headToHeadArchive: HistoryRivalry[] = [];
  if (tournaments.length > 0) {
    // Per-league best team of the year, with its aggregate record.
    const stats = computeSeasonStats(season);
    for (const league of LEAGUE_IDS) {
      const line = stats.leagueBestTeams[league];
      const ref = line ? teamRef(season, line.teamId) : null;
      if (line && ref) {
        leagueBestTeams[league] = {
          team: ref,
          wins: line.wins,
          losses: line.losses,
          titles: line.titles,
        };
      }
    }
    const franchiseKey = (t: SeasonHistoryTeamRef) => `${t.leagueId}:${t.name}`;
    const pushRivalryRow = (
      refA: SeasonHistoryTeamRef,
      refB: SeasonHistoryTeamRef,
      meetings: number,
      aWins: number,
      bWins: number,
      byScope?: HistoryRivalryScope[],
    ) => {
      const keyA = franchiseKey(refA);
      const keyB = franchiseKey(refB);
      const flip = keyA > keyB;
      const [teamA, teamB] = flip ? [refB, refA] : [refA, refB];
      const [normAWins, normBWins] = flip ? [bWins, aWins] : [aWins, bWins];
      const normScopes = flip
        ? byScope?.map((s) => ({
            scope: s.scope,
            meetings: s.meetings,
            aWins: s.bWins,
            bWins: s.aWins,
          }))
        : byScope;
      return {
        teamA,
        teamB,
        meetings,
        aWins: normAWins,
        bWins: normBWins,
        ...(normScopes && normScopes.length > 0 ? { byScope: normScopes } : {}),
      } satisfies HistoryRivalry;
    };
    for (const r of stats.rivalries) {
      const refA = teamRef(season, r.teamAId);
      const refB = teamRef(season, r.teamBId);
      if (!refA || !refB) continue;
      rivalryArchive.push(
        pushRivalryRow(refA, refB, r.meetings, r.aWins, r.bWins),
      );
    }
    for (const r of computeSeasonHeadToHead(season)) {
      const refA = teamRef(season, r.teamAId);
      const refB = teamRef(season, r.teamBId);
      if (!refA || !refB) continue;
      headToHeadArchive.push(
        pushRivalryRow(
          refA,
          refB,
          r.meetings,
          r.aWins,
          r.bWins,
          r.byScope,
        ),
      );
    }
    // Aggregate every stage's MVP + All-Pro into per-team-position tallies.
    const tallyKey = (ref: SeasonHistoryTeamRef, lane: Lane) =>
      `${ref.leagueId}:${ref.name}:${lane}`;
    for (const t of tournaments) {
      const stage = computeStageStats(t);
      if (stage.mvp) {
        const ref = teamRef(season, stage.mvp.teamId);
        if (ref) {
          const key = tallyKey(ref, stage.mvp.lane);
          const cur = tallyMap.get(key);
          if (cur) {
            cur.mvp += 1;
            if (stage.mvp.playerName) cur.playerName = stage.mvp.playerName;
          } else
            tallyMap.set(key, {
              team: ref,
              lane: stage.mvp.lane,
              mvp: 1,
              allPro: 0,
              ...(stage.mvp.playerName ? { playerName: stage.mvp.playerName } : {}),
            });
        }
      }
      for (const ap of stage.allPro) {
        const ref = teamRef(season, ap.teamId);
        if (!ref) continue;
        const key = tallyKey(ref, ap.lane);
        const cur = tallyMap.get(key);
        if (cur) {
          cur.allPro += 1;
          if (ap.playerName) cur.playerName = ap.playerName;
        } else
          tallyMap.set(key, {
            team: ref,
            lane: ap.lane,
            mvp: 0,
            allPro: 1,
            ...(ap.playerName ? { playerName: ap.playerName } : {}),
          });
      }
    }
  }
  const awardTally = [...tallyMap.values()];
  // All-Pro teams (split per-league, split global, season-of-the-year), with
  // each member's team frozen as a ref. Drop members whose team can't be
  // resolved, and teams that end up empty.
  const allProTeams: SeasonHistoryAllProTeam[] = [];
  if (tournaments.length > 0) {
    for (const team of computeAllProTeams(season)) {
      const members = team.members
        .map((m) => {
          const ref = teamRef(season, m.teamId);
          if (!ref) return null;
          return {
            lane: m.lane,
            ...(m.playerId ? { playerId: m.playerId } : {}),
            ...(m.playerName ? { playerName: m.playerName } : {}),
            team: ref,
            avgRating: m.avgRating,
            games: m.games,
          } satisfies SeasonHistoryAllProMember;
        })
        .filter((m): m is SeasonHistoryAllProMember => m !== null);
      if (members.length > 0) {
        allProTeams.push({
          scope: team.scope,
          ...(team.split ? { split: team.split } : {}),
          ...(team.leagueId ? { leagueId: team.leagueId } : {}),
          members,
        });
      }
    }
  }
  // International finals MVPs (a player from each event's champion team), frozen
  // with team refs, plus a per-player tally to merge onto the career records.
  const intlMvps: SeasonHistoryIntlMvp[] = [];
  const intlMvpCount = new Map<string, number>();
  if (tournaments.length > 0) {
    for (const { event, mvp } of computeSeasonIntlMvps(season)) {
      const ref = teamRef(season, mvp.teamId);
      if (!ref) continue;
      intlMvps.push({
        event,
        lane: mvp.lane,
        ...(mvp.playerName ? { playerName: mvp.playerName } : {}),
        ...(mvp.playerId ? { playerId: mvp.playerId } : {}),
        team: ref,
        avgRating: mvp.avgRating,
        games: mvp.gamesPlayed,
      });
      if (mvp.playerId)
        intlMvpCount.set(mvp.playerId, (intlMvpCount.get(mvp.playerId) ?? 0) + 1);
    }
  }
  // Domestic split finals MVPs (a player from each split champion), frozen with
  // team refs, plus a per-player tally.
  const splitMvps: SeasonHistorySplitMvp[] = [];
  const splitMvpCount = new Map<string, number>();
  if (tournaments.length > 0) {
    for (const { split, leagueId, mvp } of computeSeasonSplitMvps(season)) {
      const ref = teamRef(season, mvp.teamId);
      if (!ref) continue;
      splitMvps.push({
        split,
        leagueId,
        lane: mvp.lane,
        ...(mvp.playerName ? { playerName: mvp.playerName } : {}),
        ...(mvp.playerId ? { playerId: mvp.playerId } : {}),
        team: ref,
        avgRating: mvp.avgRating,
        games: mvp.gamesPlayed,
      });
      if (mvp.playerId)
        splitMvpCount.set(mvp.playerId, (splitMvpCount.get(mvp.playerId) ?? 0) + 1);
    }
  }
  // Per-player split / season All-Pro selection counts, merged onto the career
  // records (which already carry the per-tournament `allPro` total).
  const allProCounts =
    tournaments.length > 0
      ? computeAllProCounts(season)
      : new Map<string, { split: number; season: number }>();
  const playerCareers = (
    tournaments.length > 0 ? computePlayerCareerRecords(season) : []
  ).map((r) => {
    const c = allProCounts.get(r.playerId);
    const im = intlMvpCount.get(r.playerId) ?? 0;
    const sm = splitMvpCount.get(r.playerId) ?? 0;
    return {
      ...r,
      ...(c && c.split > 0 ? { allProSplit: c.split } : {}),
      ...(c && c.season > 0 ? { allProSeason: c.season } : {}),
      ...(im > 0 ? { intlMvps: im } : {}),
      ...(sm > 0 ? { splitMvps: sm } : {}),
    };
  });
  const rookieOfYear: SeasonHistoryRookieOfYear[] = [];
  if (tournaments.length > 0) {
    for (const r of computeSeasonRookiesOfYear(season)) {
      const ref = teamRef(season, r.teamId);
      if (!ref) continue;
      rookieOfYear.push({
        lane: r.lane,
        ...(r.playerId ? { playerId: r.playerId } : {}),
        ...(r.playerName ? { playerName: r.playerName } : {}),
        team: ref,
        avgRating: r.avgRating,
        games: r.games,
        splitTitles: r.splitTitles,
        intlTitles: r.intlTitles,
        score: r.score,
      });
    }
  }
  // Freeze the year's roster moves with team names so they recap forever.
  const transfers: HistoryTransfer[] = [];
  for (const [event, moves] of Object.entries(season.transfersByEvent ?? {}) as Array<
    [InternationalId, PlayerTransfer[]]
  >) {
    for (const m of moves ?? []) {
      transfers.push({
        event,
        lane: m.lane,
        from: teamRef(season, m.fromTeamId),
        to: teamRef(season, m.toTeamId),
        ...(m.star.name ? { inName: m.star.name } : {}),
        inTier: m.star.tier,
        ...(m.swap.name ? { outName: m.swap.name } : {}),
        outTier: m.swap.tier,
      });
    }
  }
  // Templated narrative recap (only attach when it found at least one
  // headline, so empty/sparse archives serialize unchanged).
  const story = buildSeasonStory(season);
  const hasStory = Object.keys(story).length > 0;
  return {
    id: season.id,
    archivedAt,
    name: season.name,
    complete: season.status === "complete",
    champion: teamRef(season, season.champion ?? worlds[0]),
    runnerUp: teamRef(season, worlds[1]),
    intlChampions,
    splitChampions,
    ...(Object.keys(intlRunnersUp).length > 0 ? { intlRunnersUp } : {}),
    ...(Object.keys(splitRunnersUp).length > 0 ? { splitRunnersUp } : {}),
    ...(hasStory ? { story } : {}),
    ...(Object.keys(leagueBestTeams).length > 0 ? { leagueBestTeams } : {}),
    ...(awardTally.length > 0 ? { awardTally } : {}),
    ...(allProTeams.length > 0 ? { allProTeams } : {}),
    ...(intlMvps.length > 0 ? { intlMvps } : {}),
    ...(splitMvps.length > 0 ? { splitMvps } : {}),
    ...(rookieOfYear.length > 0 ? { rookieOfYear } : {}),
    ...(playerCareers.length > 0 ? { playerCareers } : {}),
    ...(season.phaseRosters?.length ? { phaseRosters: season.phaseRosters } : {}),
    ...(transfers.length > 0 ? { transfers } : {}),
    ...(rivalryArchive.length > 0 ? { rivalries: rivalryArchive } : {}),
    ...(headToHeadArchive.length > 0 ? { headToHead: headToHeadArchive } : {}),
    // Starting tier table (undefined when the season pre-dates
    // initialMeta — we can't reconstruct what it began on) and the
    // table at archive time after a year of drift.
    ...(season.initialMeta !== undefined
      ? { initialMetaOverride: season.initialMeta.metaOverride ?? null }
      : {}),
    finalMetaOverride: season.currentMeta?.metaOverride ?? null,
    // Carry the evolved region tide forward (only present when Region
    // Tides ran). Conditional so non-tides seasons archive unchanged.
    ...(season.leagueStrength &&
    Object.keys(season.leagueStrength).length > 0
      ? { leagueStrength: season.leagueStrength }
      : {}),
  };
}

// ─── Golden Road ─────────────────────────────────────────────────────────────
// The perfect season: ONE team wins every title it can in a single year —
// all three of its domestic splits (Winter, Spring, Summer) AND every
// international on the calendar (First Stand, MSI, Worlds — plus Global Cup
// on quadrennial franchise years). Six trophies normally; seven in cup years.

const GOLDEN_ROAD_SPLITS: SplitId[] = ["winter", "spring", "summer"];

function franchiseYearFromEntryName(name: string): number | undefined {
  const m = name.match(/Year (\d+)\s*$/);
  return m ? Number(m[1]) : undefined;
}

/** Whether a history entry's season required a Global Cup win for Golden Road. */
export function goldenRoadRequiresGlobalCup(entry: SeasonHistoryEntry): boolean {
  if (entry.intlChampions["global-cup"]) return true;
  if (entry.phaseRosters?.some((p) => p.event === "global-cup")) return true;
  return isGlobalCupYear(franchiseYearFromEntryName(entry.name));
}

/** The team that completed a Golden Road this season, or null. Operates
 *  on a finished season's résumé (split + international champions). */
export function goldenRoadTeam(
  entry: SeasonHistoryEntry,
): SeasonHistoryTeamRef | null {
  const worlds = entry.intlChampions.worlds ?? entry.champion;
  if (!worlds) return null;
  const key = (t: SeasonHistoryTeamRef) => `${t.leagueId}:${t.name}`;
  const target = key(worlds);
  const won = (ref: SeasonHistoryTeamRef | null | undefined) =>
    ref != null && key(ref) === target;
  if (!won(entry.intlChampions["first-stand"])) return null;
  if (!won(entry.intlChampions.msi)) return null;
  for (const split of GOLDEN_ROAD_SPLITS) {
    if (!won(entry.splitChampions[split]?.[worlds.leagueId])) return null;
  }
  if (
    goldenRoadRequiresGlobalCup(entry) &&
    !won(entry.intlChampions["global-cup"])
  ) {
    return null;
  }
  return worlds;
}
