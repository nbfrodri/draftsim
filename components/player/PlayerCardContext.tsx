"use client";
import { useLayoutEffect } from "react";

import {
createContext,
useContext,
useMemo,
useRef,
type ReactNode
} from "react";

import { playerFormKey,type PlayerFormMap } from "@/lib/playerForm";
import {
inactiveValueBreakdown,
type FaBoardRow,
type MarketInactive,
} from "@/lib/season/faMarket";
import type { SeasonHistoryEntry } from "@/lib/season/history";
import {
listPlayers,
playerCareerStatuses,
type CareerStatusInfo,
type PlayerHit,
} from "@/lib/season/historySearch";
import {
archivedPlayerIds,
archivedRosterSnapshot,
buildPlayerCardTeam,
buildPlayerCardTeamFromSeasonTeam,
careerHighlights,
historyPlayerCardTeam,
isSparsePlayerHint,
latestPlayerRosterSnapshot,
statusBadgeYears,
type PlayerCardData,
type PlayerCardStatus,
type PlayerCardTeam,
} from "@/lib/season/playerCard";
import {
ACADEMY_YEARS,
TOTAL_INACTIVE_BEFORE_RETIRE,
type InactivePlayerSnapshot,
} from "@/lib/season/playerLifecycle";
import {
computePlayerSeasonLines,
computePlayerTitleCounts,
type PlayerSeasonLine,
} from "@/lib/season/stats";
import type { SeasonState,SeasonTeam } from "@/lib/season/types";
import type { Champion,Lane,Player } from "@/lib/types";
import { useDraftStore } from "@/store/draftStore";

/**
 * Extra context a call site already has and the resolver can't cheaply derive —
 * an FA board row's valuation, or a raw roster entry for players who have no
 * stable id yet (legacy / one-off seasons).
 */
export interface PlayerCardHint {
  faRow?: FaBoardRow;
  player?: Player;
  teamName?: string;
  lane?: Lane;
}

export interface PlayerCardResolveOpts {
  /** Archived season entry id — render THAT year's snapshot, not the latest. */
  seasonId?: string;
  phaseScope?: import("@/lib/season/types").SplitId | import("@/lib/season/types").InternationalId;
  hint?: PlayerCardHint;
}

export interface PlayerCardContextValue {
  resolve(
    playerId: string | undefined,
    opts?: PlayerCardResolveOpts,
  ): PlayerCardData | null;
  /**
   * Whether names should render as buttons at all. A plain boolean rather than
   * a per-player check, because this IS read during render for every name on
   * screen — the per-player answer needs an archive scan and is only asked once
   * a card actually opens.
   */
  hasProfileNav: boolean;
  /** Hover-time check that gates the card's "Click ▸ Profile" affordance. */
  canOpenProfile(playerId: string | undefined): boolean;
  openProfile(playerId: string): void;
  championsById: Map<number, Champion>;
}

const PlayerCardContext = createContext<PlayerCardContextValue | null>(null);

export function usePlayerCardContext(): PlayerCardContextValue | null {
  return useContext(PlayerCardContext);
}

// ─── Shared helpers ──────────────────────────────────────────────────────────

/** One-shot memo — the expensive season/hall passes only run if someone hovers. */
function lazily<T>(compute: () => T): () => T {
  let box: { v: T } | null = null;
  return () => (box ??= { v: compute() }).v;
}

function kdaLine(
  label: string,
  line: PlayerSeasonLine,
  titles?: { split: number; intlTitles: number },
) {
  return {
    label,
    games: line.games,
    wins: line.wins,
    kills: line.kills,
    deaths: line.deaths,
    assists: line.assists,
    avgRating: line.avgRating,
    mvps: line.mvps,
    pentakills: line.pentakills,
    ...(titles
      ? { splitTitles: titles.split, intlTitles: titles.intlTitles }
      : {}),
  };
}

function careerFromHit(hit: PlayerHit) {
  return {
    games: hit.games,
    winRate: hit.winRate,
    grade: hit.grade > 0 ? hit.grade : null,
    kills: hit.kills,
    mvps: hit.mvps,
    allPro: hit.allPro,
    titles: hit.titles,
    pentakills: hit.pentakills,
  };
}

const inactiveStatusOf = (s: MarketInactive["status"]): PlayerCardStatus => s;

/** Years remaining before the next lifecycle step, clamped at 0. */
function yearsLeft(inactiveYears: number) {
  const years = Math.max(1, inactiveYears < 1 ? 1 : inactiveYears);
  return {
    toFa: Math.max(0, ACADEMY_YEARS - years),
    toRetire: Math.max(0, TOTAL_INACTIVE_BEFORE_RETIRE - years),
  };
}

// ─── Live season resolver ────────────────────────────────────────────────────

interface LiveIndex {
  season: SeasonState | null;
  championsById: Map<number, Champion>;
  playerForms: PlayerFormMap;
  rosterById: Map<string, { player: Player; team: SeasonTeam }>;
  inactiveById: Map<string, MarketInactive>;
  hallEntries: SeasonHistoryEntry[];
  seasonLines: () => Map<string, PlayerSeasonLine>;
  titles: () => Map<string, { split: number; intlTitles: number; intlApps: number }>;
  hallHits: () => Map<string, PlayerHit>;
  hallIds: () => Set<string>;
}

/** Archived career OR currently on a live roster / inactive pool. */
function isLiveProfileTarget(idx: LiveIndex, playerId: string): boolean {
  return (
    idx.hallIds().has(playerId) ||
    idx.rosterById.has(playerId) ||
    idx.inactiveById.has(playerId)
  );
}

function teamRefOf(team: SeasonTeam): PlayerCardTeam {
  return buildPlayerCardTeamFromSeasonTeam(team);
}

function inactiveTeamRef(
  inactive: MarketInactive,
  season: SeasonState | null,
): PlayerCardTeam | null {
  const seasonTeam = inactive.lastTeamId
    ? season?.teams.find((t) => t.id === inactive.lastTeamId)
    : undefined;
  if (seasonTeam) return buildPlayerCardTeamFromSeasonTeam(seasonTeam);
  return buildPlayerCardTeam(inactive.lastTeamName ?? inactive.lastTeamId);
}

function resolveLive(
  idx: LiveIndex,
  playerId: string | undefined,
  opts: PlayerCardResolveOpts | undefined,
): PlayerCardData | null {
  const hint = opts?.hint;
  const faRow = hint?.faRow;
  // Transfer chips may pass lane-only hints; id can also live on hint.player
  // for legacy call sites that omit the playerId prop.
  const resolvedId = playerId ?? hint?.player?.id;
  let rostered = resolvedId ? idx.rosterById.get(resolvedId) : undefined;
  let inactive =
    faRow?.entry ??
    (resolvedId ? idx.inactiveById.get(resolvedId) : undefined) ??
    undefined;

  // Id-less (or stale-id) transfer rows: locate the live roster / pool row by
  // name + lane so we never fall through to a sparse TransferPlayer stub.
  if (!rostered && !inactive && idx.season) {
    const name = hint?.player?.name?.trim();
    const lane = hint?.lane ?? hint?.player?.lane;
    if (name && lane) {
      for (const team of idx.season.teams) {
        const p = team.players.find(
          (x) => x.lane === lane && x.name?.trim() === name,
        );
        if (p) {
          rostered = { player: p, team };
          break;
        }
      }
      if (!rostered) {
        for (const e of idx.season.franchise?.inactivePool ?? []) {
          if (e.player.lane === lane && e.player.name?.trim() === name) {
            inactive = e;
            break;
          }
        }
      }
    }
  }

  // Live roster / inactive pool always beat a thin transfer/news snapshot hint.
  // Never let a sparse stub replace a successful live resolve.
  const hintPlayer = hint?.player;
  const player =
    rostered?.player ??
    inactive?.player ??
    (hintPlayer && !isSparsePlayerHint(hintPlayer) ? hintPlayer : undefined) ??
    hintPlayer;
  if (!player) return null;

  const effectiveId = resolvedId ?? player.id;
  const season = idx.season;
  const franchiseYear = season?.franchise?.year;
  const hallHit = effectiveId ? idx.hallHits().get(effectiveId) : undefined;

  // A player can sit in the pool AND be back on a roster in the same window
  // (signed back mid-offseason) — the roster always wins.
  const status: PlayerCardStatus = rostered
    ? "active"
    : inactive
      ? inactiveStatusOf(inactive.status)
      : (hallHit?.careerStatus ?? "active");

  const team: PlayerCardTeam | null = rostered
    ? teamRefOf(rostered.team)
    : inactive
      ? inactiveTeamRef(inactive, season ?? null)
      : hint?.teamName
        ? buildPlayerCardTeam(hint.teamName)
        : null;

  const line = effectiveId ? idx.seasonLines().get(effectiveId) : undefined;
  const titles = effectiveId ? idx.titles().get(effectiveId) : undefined;
  const form =
    rostered && season
      ? (idx.playerForms[playerFormKey(rostered.team.id, rostered.player.lane)] ??
        null)
      : null;

  const breakdown =
    inactive && season
      ? inactiveValueBreakdown(inactive, idx.championsById, season.currentMeta)
      : null;
  const left = inactive ? yearsLeft(inactive.inactiveYears) : null;

  return {
    ...(effectiveId ? { playerId: effectiveId } : {}),
    name: player.name ?? "Unknown",
    lane: player.lane ?? hint?.lane,
    tier: player.tier,
    ...(player.potential ? { potential: player.potential } : {}),
    ...(player.age != null ? { age: player.age } : {}),
    ...(player.debutYear != null ? { debutYear: player.debutYear } : {}),
    ...(player.homeRegion ? { homeRegion: player.homeRegion } : {}),
    ...(player.acclimation != null ? { acclimation: player.acclimation } : {}),
    status,
    ...(inactive
      ? {
          statusYears: statusBadgeYears(status, inactive.inactiveYears),
          yearsLeftToFa: faRow?.yearsLeftToFa ?? left?.toFa,
          yearsLeftToRetire: faRow?.yearsLeftToRetire ?? left?.toRetire,
        }
      : {}),
    team,
    teamLabel: rostered ? "Team" : "Last team",
    form,
    ...(inactive
      ? {
          lastActiveGrade: inactive.lastActiveGrade ?? null,
          shadowGrade: inactive.shadowGrade ?? null,
          value: faRow?.value ?? breakdown?.total ?? null,
          valueBreakdown: faRow?.breakdown ?? breakdown,
          upgradeVsSlot: faRow?.upgradeVsSlot ?? null,
        }
      : {}),
    goodChamps: player.goodChamps ?? [],
    badChamps: player.badChamps ?? [],
    season: line ? kdaLine(season?.name ?? "This season", line, titles) : null,
    career: hallHit ? careerFromHit(hallHit) : null,
    highlights: careerHighlights({
      splitTitles: titles?.split ?? 0,
      intlTitles: titles?.intlTitles ?? 0,
      titles: hallHit?.titles ?? 0,
      mvps: hallHit?.mvps ?? line?.mvps ?? 0,
      allPro: hallHit?.allPro ?? 0,
    }),
    scope: franchiseYear != null ? `Live · Year ${franchiseYear}` : "Live season",
    archived: false,
  };
}

/**
 * Live-season card data for every player name in the app — roster, inactive
 * pool, stats tables and match recaps all resolve through here. Mounted once at
 * the app root so tournament / series screens (siblings of the season
 * dashboard) are covered too; `SeasonHistoryView` nests its own archive
 * provider on top.
 */
export function LivePlayerCardProvider({
  onOpenProfile,
  children,
}: {
  /** Hands a player id to the Hall's Search tab. Omit to make names hover-only. */
  onOpenProfile?: (playerId: string) => void;
  children: ReactNode;
}) {
  const season = useDraftStore((s) => s.season);
  const champions = useDraftStore((s) => s.champions);
  const playerForms = useDraftStore((s) => s.playerForms);
  const seasonHistory = useDraftStore((s) => s.seasonHistory);
  const realities = useDraftStore((s) => s.realities);

  const championsById = useMemo(
    () => new Map(champions.map((c) => [c.id, c])),
    [champions],
  );

  // The Hall this season belongs to — a reality carries rosters across years,
  // season mode keeps its own one-off archive. Careers come from whichever.
  const hallEntries = useMemo(() => {
    const fid = season?.franchise?.id;
    if (fid) return realities.find((r) => r.id === fid)?.history ?? [];
    return seasonHistory;
  }, [season?.franchise?.id, realities, seasonHistory]);

  const index = useMemo<LiveIndex>(() => {
    const rosterById = new Map<string, { player: Player; team: SeasonTeam }>();
    for (const team of season?.teams ?? []) {
      for (const player of team.players) {
        if (player.id) rosterById.set(player.id, { player, team });
      }
    }
    const inactiveById = new Map<string, MarketInactive>();
    for (const entry of season?.franchise?.inactivePool ?? []) {
      if (entry.player.id) inactiveById.set(entry.player.id, entry);
    }
    return {
      season: season ?? null,
      championsById,
      playerForms,
      rosterById,
      inactiveById,
      hallEntries,
      seasonLines: lazily(() => {
        const out = new Map<string, PlayerSeasonLine>();
        if (!season) return out;
        for (const l of computePlayerSeasonLines(season)) out.set(l.playerId, l);
        return out;
      }),
      titles: lazily(() =>
        season ? computePlayerTitleCounts(season) : new Map(),
      ),
      hallHits: lazily(() => {
        const out = new Map<string, PlayerHit>();
        if (hallEntries.length === 0) return out;
        for (const hit of listPlayers(hallEntries)) out.set(hit.id, hit);
        return out;
      }),
      hallIds: lazily(() => archivedPlayerIds(hallEntries)),
    };
  }, [season, championsById, playerForms, hallEntries]);

  // Read the freshest index at hover time without re-rendering every name in
  // the app whenever the season ticks.
  const indexRef = useRef(index);
  useLayoutEffect(() => { indexRef.current = index; }, [index]);
  const navRef = useRef(onOpenProfile);
  useLayoutEffect(() => { navRef.current = onOpenProfile; }, [onOpenProfile]);

  // Only offer the click affordance once there is an archive to land in — a
  // brand-new reality's first year has no Hall page to open yet.
  const hasProfileNav = !!onOpenProfile && hallEntries.length > 0;

  const value = useMemo<PlayerCardContextValue>(
    () => ({
      resolve: (playerId, opts) => resolveLive(indexRef.current, playerId, opts),
      hasProfileNav,
      canOpenProfile: (playerId) =>
        !!playerId &&
        !!navRef.current &&
        hallEntries.length > 0 &&
        isLiveProfileTarget(indexRef.current, playerId),
      openProfile: (playerId) => {
        if (!isLiveProfileTarget(indexRef.current, playerId)) return;
        navRef.current?.(playerId);
      },
      get championsById() {
        return indexRef.current.championsById;
      },
    }),
    [hasProfileNav, hallEntries.length],
  );

  return (
    <PlayerCardContext.Provider value={value}>
      {children}
    </PlayerCardContext.Provider>
  );
}

// ─── Season History resolver ─────────────────────────────────────────────────

interface HistoryIndex {
  entries: SeasonHistoryEntry[];
  entryById: Map<string, SeasonHistoryEntry>;
  championsById: Map<number, Champion>;
  hits: () => Map<string, PlayerHit>;
  statusAsOf: (seasonId: string) => Map<string, CareerStatusInfo>;
  liveInactiveById: Map<string, InactivePlayerSnapshot>;
}

function resolveHistory(
  idx: HistoryIndex,
  playerId: string | undefined,
  opts: PlayerCardResolveOpts | undefined,
): PlayerCardData | null {
  if (!playerId) return null;
  const hit = idx.hits().get(playerId);
  const entry = opts?.seasonId ? idx.entryById.get(opts.seasonId) : undefined;
  const hint = opts?.hint;
  const hintPlayer = hint?.player;
  // Year pin → that season's roster. Career → newest archive appearance for
  // identity (tier/champs/team); never treat that snapshot as "active" status.
  // When seasonId is pinned, latestPlayerRosterSnapshot / career hit identity
  // must NOT override — that mixed "current team" into year-scoped Hall rows.
  const yearSnap = entry ? archivedRosterSnapshot(entry, playerId, opts?.phaseScope) : null;
  const latestSnap = !entry
    ? latestPlayerRosterSnapshot(idx.entries, playerId)
    : null;
  const identitySnap = yearSnap ?? latestSnap;
  const inactiveSnap =
    (opts?.phaseScope ? undefined : entry?.inactivePlayers?.find((p) => p.playerId === playerId)) ??
    (entry ? undefined : idx.liveInactiveById.get(playerId));
  // Numbers for the archived year come from that season's own career record.
  const yearRecord = entry?.playerCareers?.find((r) => r.playerId === playerId);
  if (
    !hit &&
    !identitySnap &&
    !inactiveSnap &&
    !hintPlayer &&
    !yearRecord &&
    !hint?.teamName
  ) {
    return null;
  }

  const asOf = entry && !opts?.phaseScope ? idx.statusAsOf(entry.id).get(playerId) : undefined;
  // Year-scoped status stays inside that archive — never live-overlaid hit.
  const status: PlayerCardStatus = entry
    ? (asOf?.status ??
      (yearSnap
        ? "active"
        : inactiveSnap
          ? inactiveStatusOf(inactiveSnap.status)
          : "active"))
    : (hit?.careerStatus ??
      (inactiveSnap
        ? inactiveStatusOf(inactiveSnap.status)
        : "active"));
  const inactiveYears =
    asOf?.inactiveYears ??
    inactiveSnap?.inactiveYears ??
    (entry ? undefined : hit?.inactiveYears);

  const team = historyPlayerCardTeam({
    yearPinned: entry != null,
    identitySnap,
    inactiveSnap,
    entry,
    yearRecord,
    hintTeamName: hint?.teamName,
    careerTeam: hit?.team,
  });

  const left = inactiveYears != null ? yearsLeft(inactiveYears) : null;

  const lane = entry
    ? (identitySnap?.lane ??
      inactiveSnap?.lane ??
      hint?.lane ??
      hintPlayer?.lane ??
      yearRecord?.lane)
    : (identitySnap?.lane ??
      inactiveSnap?.lane ??
      hit?.lane ??
      hint?.lane ??
      hintPlayer?.lane);
  const tier = entry
    ? (identitySnap?.tier ?? inactiveSnap?.tier ?? hintPlayer?.tier)
    : (identitySnap?.tier ??
      inactiveSnap?.tier ??
      hit?.tier ??
      hintPlayer?.tier);

  return {
    playerId,
    name:
      identitySnap?.name ??
      inactiveSnap?.playerName ??
      (entry ? yearRecord?.playerName : hit?.name) ??
      hintPlayer?.name ??
      hit?.name ??
      "Unknown",
    ...(lane ? { lane } : {}),
    ...(tier ? { tier } : {}),
    ...(identitySnap?.potential ?? inactiveSnap?.potential
      ? { potential: (identitySnap?.potential ?? inactiveSnap?.potential)! }
      : {}),
    ...(identitySnap?.age ??
    yearRecord?.age ??
    inactiveSnap?.age ??
    hintPlayer?.age
      ? {
          age: (identitySnap?.age ??
            yearRecord?.age ??
            inactiveSnap?.age ??
            hintPlayer?.age)!,
        }
      : {}),
    ...(identitySnap?.debutYear ??
    inactiveSnap?.debutYear ??
    (entry ? undefined : hit?.debutYear)
      ? {
          debutYear: (identitySnap?.debutYear ??
            inactiveSnap?.debutYear ??
            hit?.debutYear)!,
        }
      : {}),
    status,
    ...(status !== "active"
      ? {
          statusYears: statusBadgeYears(status, inactiveYears),
          yearsLeftToFa: entry ? left?.toFa : (hit?.yearsLeftToFa ?? left?.toFa),
          yearsLeftToRetire: entry
            ? left?.toRetire
            : (hit?.yearsLeftToRetire ?? left?.toRetire),
        }
      : {}),
    team,
    teamLabel: status === "active" ? "Team" : "Last team",
    form: null,
    lastActiveGrade:
      inactiveSnap?.lastActiveGrade ??
      (entry ? null : (hit?.lastActiveGrade ?? null)),
    shadowGrade:
      inactiveSnap?.shadowGrade ?? (entry ? null : (hit?.shadowGrade ?? null)),
    goodChamps:
      identitySnap?.goodChamps ?? inactiveSnap?.goodChamps ?? [],
    badChamps: identitySnap?.badChamps ?? inactiveSnap?.badChamps ?? [],
    season:
      entry && yearRecord
        ? {
            label: entry.name,
            games: yearRecord.games,
            ...(yearRecord.wins != null ? { wins: yearRecord.wins } : {}),
            kills: yearRecord.kills,
            deaths: yearRecord.deaths ?? 0,
            assists: yearRecord.assists ?? 0,
            avgRating:
              yearRecord.ratingGames && yearRecord.ratingGames > 0
                ? (yearRecord.ratingSum ?? 0) / yearRecord.ratingGames
                : null,
            mvps: yearRecord.mvps,
            pentakills: yearRecord.pentakills ?? 0,
            splitTitles: yearRecord.splitTitles,
            intlTitles: yearRecord.intlTitles,
          }
        : null,
    career: hit ? careerFromHit(hit) : null,
    highlights: careerHighlights({
      titles: hit?.titles ?? 0,
      mvps: hit?.mvps ?? 0,
      allPro: hit?.allPro ?? 0,
      pentakills: hit?.pentakills ?? 0,
    }),
    scope: entry
      ? `${entry.name}${yearSnap?.transferred ? " · transferred" : yearSnap ? ` · ${yearSnap.stage}` : ""}`
      : latestSnap
        ? `Career · as of ${latestSnap.entry.name}`
        : "Career to date",
    archived: entry != null,
  };
}

/**
 * Archive-backed cards for the Hall of Seasons. Names inside a season card pass
 * that entry's `seasonId` so the tooltip shows the tier/team/status the year
 * FROZE, while search hits and career rows fall back to the latest state.
 */
export function HistoryPlayerCardProvider({
  entries,
  liveInactive,
  liveRosterIds,
  onOpenProfile,
  children,
}: {
  entries: SeasonHistoryEntry[];
  /** Live franchise pool — overlays current status for the active reality. */
  liveInactive?: readonly InactivePlayerSnapshot[];
  liveRosterIds?: ReadonlySet<string>;
  onOpenProfile?: (playerId: string) => void;
  children: ReactNode;
}) {
  const champions = useDraftStore((s) => s.champions);
  const championsById = useMemo(
    () => new Map(champions.map((c) => [c.id, c])),
    [champions],
  );

  const index = useMemo<HistoryIndex>(() => {
    const statusCache = new Map<string, Map<string, CareerStatusInfo>>();
    const liveInactiveById = new Map<string, InactivePlayerSnapshot>();
    for (const snap of liveInactive ?? []) {
      if (snap.playerId && !liveRosterIds?.has(snap.playerId)) {
        liveInactiveById.set(snap.playerId, snap);
      }
    }
    return {
      entries,
      entryById: new Map(entries.map((e) => [e.id, e])),
      championsById,
      liveInactiveById,
      hits: lazily(() => {
        const out = new Map<string, PlayerHit>();
        const opts = liveInactive ? { liveInactive, liveRosterIds } : undefined;
        for (const hit of listPlayers(entries, opts)) out.set(hit.id, hit);
        return out;
      }),
      statusAsOf: (seasonId: string) => {
        let cached = statusCache.get(seasonId);
        if (!cached) {
          cached = playerCareerStatuses(entries, {
            asOfSeasonId: seasonId,
            preferInactive: true,
          });
          statusCache.set(seasonId, cached);
        }
        return cached;
      },
    };
  }, [entries, championsById, liveInactive, liveRosterIds]);

  const indexRef = useRef(index);
  useLayoutEffect(() => { indexRef.current = index; }, [index]);
  const navRef = useRef(onOpenProfile);
  useLayoutEffect(() => { navRef.current = onOpenProfile; }, [onOpenProfile]);
  const hasProfileNav = !!onOpenProfile;

  const value = useMemo<PlayerCardContextValue>(
    () => ({
      resolve: (playerId, opts) =>
        resolveHistory(indexRef.current, playerId, opts),
      hasProfileNav,
      canOpenProfile: (playerId) => !!playerId && !!navRef.current,
      openProfile: (playerId) => navRef.current?.(playerId),
      get championsById() {
        return indexRef.current.championsById;
      },
    }),
    [hasProfileNav],
  );

  return (
    <PlayerCardContext.Provider value={value}>
      {children}
    </PlayerCardContext.Provider>
  );
}

/** Disables hover cards for a subtree (e.g. inside an already-open profile). */
export function NoPlayerCards({ children }: { children: ReactNode }) {
  return (
    <PlayerCardContext.Provider value={null}>
      {children}
    </PlayerCardContext.Provider>
  );
}
