"use client";
import { useLayoutEffect } from "react";

import {
createContext,
useContext,
useMemo,
useRef,
type ReactNode,
} from "react";

import { deriveStar } from "@/lib/players";
import type { SeasonHistoryEntry } from "@/lib/season/history";
import { buildTeamIdentity,refFor } from "@/lib/season/historySearch";
import {
archivedAcademyCount,
archivedSeasonTeamWinRates,
archivedTeamKeys,
archivedTeamSnapshot,
archivedTeamSnapshotForScope,
averageTierFromRoster,
buildTeamCardIdentity,
careerArchivedTeamH2H,
careerTeamWinRates,
latestAcademyCount,
latestTeamRoster,
liveAcademyCount,
liveAllTimeTeamH2H,
liveTeamStandingLabel,
liveTeamWinRates,
liveTitleCounts,
liveTitleHighlights,
rosterLinesFromPlayers,
teamCardFromSeasonTeam,
teamNavKey,
teamTitleHighlightsFromEntry,
titleCountsFromEntry,
titleCountsFromRecords,
type TeamCardData,
type TeamCardHint,
} from "@/lib/season/teamCard";
import type { LeagueId,SeasonTeam } from "@/lib/season/types";
import type { Roster } from "@/lib/types";
import { useDraftStore } from "@/store/draftStore";

export type { TeamCardHint };

export interface TeamCardResolveOpts {
  /** Archived season entry id — render THAT year's snapshot. */
  seasonId?: string;
  /** Prefer roster from this split/intl phase within the pinned season. */
  phaseScope?: import("@/lib/season/types").SplitId | import("@/lib/season/types").InternationalId;
  hint?: TeamCardHint;
  /** Match-box opponent — attach H2H when both sides resolve. */
  opponentTeamId?: string;
  opponentHint?: TeamCardHint;
}

export interface TeamCardContextValue {
  resolve(
    teamId: string | undefined,
    opts?: TeamCardResolveOpts,
  ): TeamCardData | null;
  hasProfileNav: boolean;
  canOpenProfile(navKey: string | undefined): boolean;
  openProfile(navKey: string): void;
}

const TeamCardContext = createContext<TeamCardContextValue | null>(null);

export function useTeamCardContext(): TeamCardContextValue | null {
  return useContext(TeamCardContext);
}

function lazily<T>(compute: () => T): () => T {
  let box: { v: T } | null = null;
  return () => (box ??= { v: compute() }).v;
}

/** Stable cache key for feed snapshot hovers (minimal player fields). */
function snapshotResolveKey(teamId: string, players: Roster): string {
  let key = teamId;
  for (const p of players) {
    key += `|${p.lane}:${p.tier}:${p.name ?? ""}:${p.id ?? ""}`;
  }
  return key;
}

interface LiveIndex {
  season: import("@/lib/season/types").SeasonState | null;
  teamsById: Map<string, SeasonTeam>;
  academyByTeam: Map<string, number>;
  hallEntries: SeasonHistoryEntry[];
  hallKeys: () => Set<string>;
  snapshotCardCache: Map<string, TeamCardData>;
}

function resolveLive(
  idx: LiveIndex,
  teamId: string | undefined,
  opts: TeamCardResolveOpts | undefined,
): TeamCardData | null {
  const season = idx.season;
  if (!season) return null;

  const hint = opts?.hint;
  const hintName = hint?.team?.name ?? hint?.name;
  const hintLeague = hint?.team?.leagueId ?? hint?.leagueId;

  // Prefer stable season-team id so series / titles match tournament match ids.
  const byId = teamId ? idx.teamsById.get(teamId) : undefined;
  const byHintId = hint?.team?.id ? idx.teamsById.get(hint.team.id) : undefined;
  const byName =
    !byId && !byHintId && hintName && hintLeague
      ? [...idx.teamsById.values()].find(
          (t) => t.name === hintName && t.leagueId === hintLeague,
        )
      : undefined;

  const resolved =
    byId ??
    byHintId ??
    byName ??
    (hint?.team as SeasonTeam | undefined) ??
    (hintName && hintLeague
      ? ({
          id: teamId ?? hint?.team?.id ?? "",
          name: hintName,
          leagueId: hintLeague,
          iconKey: hint?.iconKey ?? hint?.team?.iconKey ?? "shield",
          color: hint?.color ?? hint?.team?.color ?? "",
          players: hint?.players ?? hint?.team?.players ?? [],
          personalityId: "",
        } satisfies SeasonTeam)
      : null);

  if (!resolved) return null;

  const franchiseYear = season.franchise?.year;
  const standing = liveTeamStandingLabel(season, resolved.id);
  const form = season.teamForm?.[resolved.id] ?? null;

  const academyCount =
    idx.academyByTeam.get(resolved.id) ??
    liveAcademyCount(season.franchise?.inactivePool ?? [], resolved);

  const opponentId =
    opts?.opponentTeamId ??
    opts?.opponentHint?.team?.id ??
    undefined;
  const h2h =
    opponentId && resolved.id
      ? liveAllTimeTeamH2H(
          season,
          idx.hallEntries,
          resolved.id,
          opponentId,
        )
      : null;

  // When the caller supplies snapshot players (e.g. from a Live Results feed
  // entry), prefer those over the live roster so hover shows the team as it
  // was at that specific event, not the current post-transfer lineup.
  const snapshotPlayers = hint?.players ?? null;
  const snapshotCacheKey = snapshotPlayers
    ? snapshotResolveKey(resolved.id, snapshotPlayers)
    : null;
  if (snapshotCacheKey) {
    const cached = idx.snapshotCardCache.get(snapshotCacheKey);
    if (cached) return cached;
  }

  const teamForCard = snapshotPlayers
    ? { ...resolved, players: snapshotPlayers }
    : resolved;
  const card = teamCardFromSeasonTeam(teamForCard, {
    academyCount,
    form,
    standing,
    highlights: liveTitleHighlights(season, resolved),
    titleCounts: liveTitleCounts(season, resolved),
    winRates: liveTeamWinRates(season, resolved.id),
    ...(h2h ? { h2h } : {}),
    scope: snapshotPlayers
      ? "Event roster snapshot"
      : franchiseYear != null
        ? `Live · Year ${franchiseYear}`
        : "Live season",
    archived: false,
  });
  if (snapshotCacheKey) {
    idx.snapshotCardCache.set(snapshotCacheKey, card);
  }
  return card;
}

export function LiveTeamCardProvider({
  onOpenProfile,
  children,
}: {
  onOpenProfile?: (navKey: string) => void;
  children: ReactNode;
}) {
  const season = useDraftStore((s) => s.season);
  const tournamentTeams = useDraftStore(s => s.tournament?.teams);
  const tournamentSeasonId = useDraftStore(s => s.tournament?.seasonId);
  const tournamentSeasonIdRef = useRef(tournamentSeasonId);
  useLayoutEffect(() => { tournamentSeasonIdRef.current = tournamentSeasonId; }, [tournamentSeasonId]);
  const tournamentIndex = useMemo(() => new Map(tournamentTeams?.map(team => [team.id, team])), [tournamentTeams]);
  const tournamentIndexRef = useRef(tournamentIndex);
  useLayoutEffect(() => { tournamentIndexRef.current = tournamentIndex; }, [tournamentIndex]);
  const seasonHistory = useDraftStore((s) => s.seasonHistory);
  const realities = useDraftStore((s) => s.realities);

  const hallEntries = useMemo(() => {
    const fid = season?.franchise?.id;
    if (fid) return realities.find((r) => r.id === fid)?.history ?? [];
    return seasonHistory;
  }, [season?.franchise?.id, realities, seasonHistory]);

  const snapshotCardCache = useMemo(() => ({
    seasonId: season?.id, values: new Map<string, TeamCardData>(),
  }).values, [season?.id]);

  const index = useMemo<LiveIndex>(() => {
    const teamsById = new Map<string, SeasonTeam>();
    for (const t of season?.teams ?? []) teamsById.set(t.id, t);
    const academyByTeam = new Map<string, number>();
    const pool = season?.franchise?.inactivePool ?? [];
    for (const t of season?.teams ?? []) {
      academyByTeam.set(t.id, liveAcademyCount(pool, t));
    }
    return {
      season: season ?? null,
      teamsById,
      academyByTeam,
      hallEntries,
      hallKeys: lazily(() => archivedTeamKeys(hallEntries)),
      snapshotCardCache,
    };
  }, [season, hallEntries, snapshotCardCache]);

  const indexRef = useRef(index);
  useLayoutEffect(() => { indexRef.current = index; }, [index]);
  const navRef = useRef(onOpenProfile);
  useLayoutEffect(() => { navRef.current = onOpenProfile; }, [onOpenProfile]);

  const hasProfileNav = !!onOpenProfile && hallEntries.length > 0;

  const value = useMemo<TeamCardContextValue>(
    () => ({
      resolve: (teamId, opts) => {
        const snapshot = opts?.hint?.tournamentTeam ?? (teamId && !opts?.hint?.players ? tournamentIndexRef.current.get(teamId) : undefined);
        if (snapshot) {
          const idx = indexRef.current;
          // Keep known season standings, academy and H2H while pinning the
          // player roster. Custom tournaments must not borrow another team's data.
          const live = idx.season && idx.season.id === tournamentSeasonIdRef.current && idx.teamsById.has(snapshot.id) ? resolveLive(idx, snapshot.id, {
            ...opts, hint: { ...opts?.hint, players: snapshot.players },
          }) : null;
          const leagueId = snapshot.leagueId ?? live?.leagueId;
          const roster = snapshot.players ? rosterLinesFromPlayers(snapshot.players) : [];
          return {
            ...live,
            name: snapshot.name, teamId: snapshot.id,
            navKey: leagueId ? `${leagueId}:${snapshot.name}` : `tournament:${snapshot.id}`,
            leagueId, iconKey: snapshot.iconKey ?? "shield", logoUrl: snapshot.logoUrl, color: snapshot.color,
            roster, academyCount: live?.academyCount ?? 0,
            starRating: snapshot.players ? deriveStar(snapshot.players) : snapshot.starRating ?? 3,
            avgTier: averageTierFromRoster(roster), highlights: live?.highlights ?? [], scope: "Tournament roster", archived: false,
          };
        }
        if (!indexRef.current.season) {
          const hint = opts?.hint;
          if (!hint?.name || !hint.leagueId) return null;
          const roster = rosterLinesFromPlayers(hint.players ?? hint.team?.players ?? []);
          return {
            ...buildTeamCardIdentity(hint.name, hint.leagueId, {
              iconKey: hint.iconKey ?? hint.team?.iconKey,
              logoUrl: hint.logoUrl ?? hint.team?.logoUrl,
              color: hint.color ?? hint.team?.color,
            }),
            ...(teamId ? { teamId } : {}),
            roster,
            academyCount: 0,
            starRating: deriveStar(hint.players ?? hint.team?.players ?? []),
            avgTier: averageTierFromRoster(roster),
            highlights: [],
            scope: "Team",
            archived: false,
          };
        }
        return resolveLive(indexRef.current, teamId, opts);
      },
      hasProfileNav,
      canOpenProfile: (navKey) =>
        !!navKey && !!navRef.current && indexRef.current.hallKeys().has(navKey),
      openProfile: (navKey) => {
        if (!indexRef.current.hallKeys().has(navKey)) return;
        navRef.current?.(navKey);
      },
    }),
    [hasProfileNav],
  );

  return (
    <TeamCardContext.Provider value={value}>{children}</TeamCardContext.Provider>
  );
}

interface HistoryIndex {
  entries: SeasonHistoryEntry[];
  entryById: Map<string, SeasonHistoryEntry>;
  identity: ReturnType<typeof buildTeamIdentity>;
  hallKeys: () => Set<string>;
}

function resolveHistory(
  idx: HistoryIndex,
  teamId: string | undefined,
  opts: TeamCardResolveOpts | undefined,
): TeamCardData | null {
  const hint = opts?.hint;
  const entry = opts?.seasonId ? idx.entryById.get(opts.seasonId) : undefined;

  const name =
    hint?.team?.name ?? hint?.name ?? (teamId?.includes(":") ? teamId.slice(teamId.indexOf(":") + 1) : undefined);
  const leagueId =
    hint?.team?.leagueId ??
    hint?.leagueId ??
    (teamId?.includes(":") ? (teamId.slice(0, teamId.indexOf(":")) as LeagueId) : undefined);

  if (!name || !leagueId) return null;

  const ref = refFor(idx.identity, name, leagueId, hint?.logoUrl ?? hint?.team?.logoUrl);
  // Year-scoped: that season's phase roster. Career / all-time: newest
  // non-empty archived snapshot (hint players only as last resort).
  const yearSnap = entry
    ? opts?.phaseScope
      ? archivedTeamSnapshotForScope(entry, { name, leagueId }, opts.phaseScope)
      : archivedTeamSnapshot(entry, { name, leagueId })
    : null;
  const latest = !entry
    ? latestTeamRoster(idx.entries, { name, leagueId })
    : null;
  const snap = yearSnap ?? latest;
  const hintPlayers = hint?.players ?? hint?.team?.players ?? [];
  const rosterPlayers = snap?.players?.length
    ? snap.players
    : hintPlayers;
  const roster = rosterLinesFromPlayers(rosterPlayers);

  const highlights = entry
    ? teamTitleHighlightsFromEntry(entry, { name, leagueId })
    : [];
  const titleCounts = entry
    ? titleCountsFromEntry(entry, { name, leagueId })
    : titleCountsFromRecords(idx.entries, { name, leagueId });
  const winRates = entry
    ? archivedSeasonTeamWinRates(entry, { name, leagueId })
    : careerTeamWinRates(idx.entries, { name, leagueId });
  const academyCount = entry
    ? archivedAcademyCount(entry, { name, leagueId })
    : latestAcademyCount(idx.entries, { name, leagueId });

  const oppName =
    opts?.opponentHint?.team?.name ?? opts?.opponentHint?.name;
  const oppLeague =
    opts?.opponentHint?.team?.leagueId ?? opts?.opponentHint?.leagueId;
  // Overall is all-time across Hall seasons (not the pinned year alone).
  const h2h =
    oppName && oppLeague
      ? careerArchivedTeamH2H(
          idx.entries,
          { name, leagueId },
          { name: oppName, leagueId: oppLeague },
        )
      : null;

  return {
    ...(teamId && !teamId.includes(":") ? { teamId } : {}),
    ...buildTeamCardIdentity(name, leagueId, {
      iconKey: ref.iconKey ?? hint?.iconKey ?? hint?.team?.iconKey,
      logoUrl:
        snap?.logoUrl ??
        ref.logoUrl ??
        hint?.logoUrl ??
        hint?.team?.logoUrl,
      color: ref.color ?? hint?.color ?? hint?.team?.color,
    }),
    roster,
    academyCount,
    starRating: deriveStar(rosterPlayers),
    avgTier: averageTierFromRoster(roster),
    highlights,
    titleCounts,
    winRates,
    ...(h2h ? { h2h } : {}),
    scope: entry
      ? `${entry.name}${yearSnap ? ` · ${yearSnap.stage}` : ""}`
      : latest
        ? `Career · roster ${latest.entry.name}`
        : "Career to date",
    archived: entry != null,
  };
}

export function HistoryTeamCardProvider({
  entries,
  onOpenProfile,
  children,
}: {
  entries: SeasonHistoryEntry[];
  onOpenProfile?: (navKey: string) => void;
  children: ReactNode;
}) {
  const index = useMemo<HistoryIndex>(() => {
    return {
      entries,
      entryById: new Map(entries.map((e) => [e.id, e])),
      identity: buildTeamIdentity(entries),
      hallKeys: lazily(() => archivedTeamKeys(entries)),
    };
  }, [entries]);

  const indexRef = useRef(index);
  useLayoutEffect(() => { indexRef.current = index; }, [index]);
  const navRef = useRef(onOpenProfile);
  useLayoutEffect(() => { navRef.current = onOpenProfile; }, [onOpenProfile]);
  const hasProfileNav = !!onOpenProfile;

  const value = useMemo<TeamCardContextValue>(
    () => ({
      resolve: (teamId, opts) => {
        const hint = opts?.hint;
        const navFromHint =
          hint?.name && hint.leagueId
            ? teamNavKey({ name: hint.name, leagueId: hint.leagueId })
            : hint?.team
              ? teamNavKey({ name: hint.team.name, leagueId: hint.team.leagueId })
              : undefined;
        const key = teamId?.includes(":") ? teamId : navFromHint;
        return resolveHistory(indexRef.current, key ?? teamId, opts);
      },
      hasProfileNav,
      canOpenProfile: (navKey) => !!navKey && !!navRef.current,
      openProfile: (navKey) => navRef.current?.(navKey),
    }),
    [hasProfileNav],
  );

  return (
    <TeamCardContext.Provider value={value}>{children}</TeamCardContext.Provider>
  );
}

export function NoTeamCards({ children }: { children: ReactNode }) {
  return <TeamCardContext.Provider value={null}>{children}</TeamCardContext.Provider>;
}

/** Pin all team cards in a completed phase to the participants displayed there. */
export function PhaseTeamCardProvider({ teams, label, children }: {
  teams: SeasonTeam[]; label: string; children: ReactNode;
}) {
  const parent = useTeamCardContext();
  const value = useMemo<TeamCardContextValue | null>(() => {
    if (!parent) return null;
    const byId = new Map(teams.map(team => [team.id, team]));
    return {
      ...parent,
      resolve: (teamId, opts) => {
        const team = byId.get(teamId ?? opts?.hint?.team?.id ?? "");
        if (!team) return null;
        const card = parent.resolve(team.id, { ...opts, hint: { tournamentTeam: team } });
        return card ? { ...card, scope: `${label} · Event roster snapshot` } : null;
      },
    };
  }, [parent, teams, label]);
  return <TeamCardContext.Provider value={value}>{children}</TeamCardContext.Provider>;
}
