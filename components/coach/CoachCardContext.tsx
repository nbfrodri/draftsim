"use client";

import {
  createContext,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
} from "react";

import { useDraftStore } from "@/store/draftStore";
import { coachPlaystyle, type Coach } from "@/lib/season/coach";
import type { SeasonHistoryEntry } from "@/lib/season/history";
import {
  coachProfile,
  computeCoachRecords,
  listCoachesRich,
  type CoachHit,
  type CoachRecord,
} from "@/lib/season/historySearch";
import {
  archivedCoachNames,
  archivedCoachSnapshot,
  buildCoachCardTeam,
  buildCoachCardTeamFromSeasonTeam,
  coachCardFromLive,
  coachTitleHighlights,
  coachYearTitleLabels,
  liveCoachTitleCounts,
  liveCoachYearLabels,
  titleCountsFromCoachRecord,
  type CoachCardData,
  type CoachCardHint,
} from "@/lib/season/coachCard";
import type { SeasonState, SeasonTeam } from "@/lib/season/types";

export type { CoachCardHint };

export interface CoachCardResolveOpts {
  /** Archived season entry id — render THAT year's snapshot. */
  seasonId?: string;
  hint?: CoachCardHint;
}

export interface CoachCardContextValue {
  resolve(
    coachName: string | undefined,
    opts?: CoachCardResolveOpts,
  ): CoachCardData | null;
  hasProfileNav: boolean;
  canOpenProfile(coachName: string | undefined): boolean;
  openProfile(coachName: string): void;
}

const CoachCardContext = createContext<CoachCardContextValue | null>(null);

export function useCoachCardContext(): CoachCardContextValue | null {
  return useContext(CoachCardContext);
}

function lazily<T>(compute: () => T): () => T {
  let box: { v: T } | null = null;
  return () => (box ??= { v: compute() }).v;
}

// ─── Live season resolver ────────────────────────────────────────────────────

interface LiveIndex {
  season: SeasonState | null;
  coachesByName: Map<string, { coach: Coach; team: SeasonTeam }>;
  hallEntries: SeasonHistoryEntry[];
  hallNames: () => Set<string>;
  hallHits: () => Map<string, CoachHit>;
  hallRecords: () => Map<string, CoachRecord>;
  hallProfile: (name: string) => ReturnType<typeof coachProfile>;
}

function resolveLive(
  idx: LiveIndex,
  coachName: string | undefined,
  opts: CoachCardResolveOpts | undefined,
): CoachCardData | null {
  const hint = opts?.hint;
  const name =
    coachName?.trim() ||
    hint?.coach?.name?.trim() ||
    hint?.name?.trim() ||
    "";
  if (!name && !hint?.coach) return null;

  const rostered = name ? idx.coachesByName.get(name) : undefined;
  const coach = rostered?.coach ?? hint?.coach;
  if (!coach && !name) return null;

  const resolvedName = coach?.name ?? name;
  const team =
    rostered?.team ??
    (hint?.team
      ? (hint.team as SeasonTeam)
      : hint?.teamName && hint.leagueId
        ? ({
            id: "",
            name: hint.teamName,
            leagueId: hint.leagueId,
            iconKey: "shield",
            color: "",
            players: [],
            personalityId: "",
          } satisfies SeasonTeam)
        : null);

  const season = idx.season;
  const franchiseYear = season?.franchise?.year;
  const hallHit = idx.hallHits().get(resolvedName);
  const hallRec = idx.hallRecords().get(resolvedName);
  const hallProf = idx.hallProfile(resolvedName);

  if (coach) {
    const liveTitles =
      season && team && team.id
        ? liveCoachTitleCounts(season, team)
        : null;
    const liveLabels =
      season && team && team.id ? liveCoachYearLabels(season, team) : [];
    const careerTitles = hallRec
      ? titleCountsFromCoachRecord(hallRec)
      : hallHit
        ? {
            split: 0,
            intl: 0,
            worlds: 0,
            total: hallHit.titles,
          }
        : liveTitles;
    const highlights =
      liveLabels.length > 0
        ? liveLabels
        : coachTitleHighlights({
            worlds: careerTitles?.worlds,
            intl: careerTitles?.intl,
            split: careerTitles?.split,
            total: careerTitles?.total ?? hallHit?.titles,
          });

    return coachCardFromLive(coach, {
      team: team && "players" in team ? team : null,
      titleCounts: careerTitles,
      highlights,
      seasons: hallProf?.tenures.length ?? undefined,
      scope:
        franchiseYear != null ? `Live · Year ${franchiseYear}` : "Live season",
    });
  }

  // Hint-only / hall-only fallback (no live coach object).
  const rating = hint?.rating ?? hallHit?.rating ?? 3;
  const playstyle = hint?.playstyle ?? hallHit?.playstyle;
  const teamRef =
    team && "leagueId" in team
      ? buildCoachCardTeam(team.name, {
          leagueId: team.leagueId,
          iconKey: "iconKey" in team ? team.iconKey : undefined,
          logoUrl: "logoUrl" in team ? team.logoUrl : undefined,
          color: "color" in team ? team.color : undefined,
        })
      : hallHit?.team
        ? buildCoachCardTeam(hallHit.team.name, {
            leagueId: hallHit.team.leagueId,
            iconKey: hallHit.team.iconKey,
            logoUrl: hallHit.team.logoUrl,
            color: hallHit.team.color,
          })
        : null;

  const careerTitles = hallRec
    ? titleCountsFromCoachRecord(hallRec)
    : hallHit
      ? { split: 0, intl: 0, worlds: 0, total: hallHit.titles }
      : null;

  return {
    name: resolvedName,
    rating,
    ...(playstyle ? { playstyle } : {}),
    ...(hint?.adaptability != null ? { adaptability: hint.adaptability } : {}),
    ...(hint?.motivation != null ? { motivation: hint.motivation } : {}),
    team: teamRef,
    ...(hallProf?.tenures.length ? { seasons: hallProf.tenures.length } : {}),
    titleCounts: careerTitles,
    highlights: coachTitleHighlights({
      worlds: careerTitles?.worlds,
      intl: careerTitles?.intl,
      split: careerTitles?.split,
      total: careerTitles?.total ?? hallHit?.titles,
    }),
    scope:
      franchiseYear != null ? `Live · Year ${franchiseYear}` : "Live season",
    archived: false,
  };
}

export function LiveCoachCardProvider({
  onOpenProfile,
  children,
}: {
  onOpenProfile?: (coachName: string) => void;
  children: ReactNode;
}) {
  const season = useDraftStore((s) => s.season);
  const seasonHistory = useDraftStore((s) => s.seasonHistory);
  const realities = useDraftStore((s) => s.realities);

  const hallEntries = useMemo(() => {
    const fid = season?.franchise?.id;
    if (fid) return realities.find((r) => r.id === fid)?.history ?? [];
    return seasonHistory;
  }, [season?.franchise?.id, realities, seasonHistory]);

  const index = useMemo<LiveIndex>(() => {
    const coachesByName = new Map<string, { coach: Coach; team: SeasonTeam }>();
    for (const team of season?.teams ?? []) {
      if (team.coach?.name) {
        coachesByName.set(team.coach.name, { coach: team.coach, team });
      }
    }
    return {
      season: season ?? null,
      coachesByName,
      hallEntries,
      hallNames: lazily(() => archivedCoachNames(hallEntries)),
      hallHits: lazily(() => {
        const out = new Map<string, CoachHit>();
        for (const hit of listCoachesRich(hallEntries)) out.set(hit.name, hit);
        return out;
      }),
      hallRecords: lazily(() => {
        const out = new Map<string, CoachRecord>();
        for (const r of computeCoachRecords(hallEntries)) out.set(r.name, r);
        return out;
      }),
      hallProfile: (() => {
        const cache = new Map<string, ReturnType<typeof coachProfile>>();
        return (n: string) => {
          if (!cache.has(n)) cache.set(n, coachProfile(hallEntries, n));
          return cache.get(n)!;
        };
      })(),
    };
  }, [season, hallEntries]);

  const indexRef = useRef(index);
  indexRef.current = index;
  const navRef = useRef(onOpenProfile);
  navRef.current = onOpenProfile;

  const hasProfileNav = !!onOpenProfile && hallEntries.length > 0;

  const value = useMemo<CoachCardContextValue>(
    () => ({
      resolve: (coachName, opts) =>
        resolveLive(indexRef.current, coachName, opts),
      hasProfileNav,
      canOpenProfile: (coachName) =>
        !!coachName &&
        !!navRef.current &&
        indexRef.current.hallNames().has(coachName),
      openProfile: (coachName) => {
        if (!indexRef.current.hallNames().has(coachName)) return;
        navRef.current?.(coachName);
      },
    }),
    [hasProfileNav],
  );

  return (
    <CoachCardContext.Provider value={value}>{children}</CoachCardContext.Provider>
  );
}

// ─── Season History resolver ─────────────────────────────────────────────────

interface HistoryIndex {
  entries: SeasonHistoryEntry[];
  entryById: Map<string, SeasonHistoryEntry>;
  hits: () => Map<string, CoachHit>;
  records: () => Map<string, CoachRecord>;
  profile: (name: string) => ReturnType<typeof coachProfile>;
  hallNames: () => Set<string>;
}

function resolveHistory(
  idx: HistoryIndex,
  coachName: string | undefined,
  opts: CoachCardResolveOpts | undefined,
): CoachCardData | null {
  const hint = opts?.hint;
  const name =
    coachName?.trim() ||
    hint?.coach?.name?.trim() ||
    hint?.name?.trim() ||
    "";
  if (!name) return null;

  const entry = opts?.seasonId ? idx.entryById.get(opts.seasonId) : undefined;
  const snap = entry ? archivedCoachSnapshot(entry, name) : null;
  const hit = idx.hits().get(name);
  const rec = idx.records().get(name);
  const prof = idx.profile(name);
  if (!snap && !hit && !hint?.coach && !hint?.rating) return null;

  const rating =
    snap?.rating ?? hint?.coach?.rating ?? hint?.rating ?? hit?.rating ?? 3;
  const playstyle =
    snap?.playstyle ??
    hint?.playstyle ??
    (hint?.coach ? coachPlaystyle(hint.coach) || undefined : undefined) ??
    hit?.playstyle ??
    prof?.playstyle;

  // Year pin: archive snap / call-site hint only — never career most-recent hit.team.
  const team = snap
    ? buildCoachCardTeam(snap.teamName, {
        leagueId: snap.leagueId,
        logoUrl: snap.logoUrl,
      })
    : hint?.team
      ? buildCoachCardTeamFromSeasonTeam(hint.team as SeasonTeam)
      : hint?.teamName
        ? buildCoachCardTeam(hint.teamName, {
            leagueId: hint.leagueId,
          })
        : entry
          ? null
          : hit?.team
            ? buildCoachCardTeam(hit.team.name, {
                leagueId: hit.team.leagueId,
                iconKey: hit.team.iconKey,
                logoUrl: hit.team.logoUrl,
                color: hit.team.color,
              })
            : null;

  const careerTitles = rec
    ? titleCountsFromCoachRecord(rec)
    : hit
      ? { split: 0, intl: 0, worlds: 0, total: hit.titles }
      : null;

  const yearLabels =
    entry && snap
      ? coachYearTitleLabels(entry, {
          name: snap.teamName,
          leagueId: snap.leagueId,
        })
      : [];

  return {
    name,
    ...(hint?.coach?.id ? { coachId: hint.coach.id } : {}),
    rating,
    ...(playstyle ? { playstyle } : {}),
    ...(hint?.coach?.adaptability != null || hint?.adaptability != null
      ? {
          adaptability:
            hint?.coach?.adaptability ?? hint?.adaptability,
        }
      : {}),
    ...(hint?.coach?.motivation != null || hint?.motivation != null
      ? { motivation: hint?.coach?.motivation ?? hint?.motivation }
      : {}),
    team,
    ...(prof?.tenures.length ? { seasons: prof.tenures.length } : {}),
    titleCounts: careerTitles,
    highlights:
      yearLabels.length > 0
        ? yearLabels
        : coachTitleHighlights({
            worlds: careerTitles?.worlds,
            intl: careerTitles?.intl,
            split: careerTitles?.split,
            total: careerTitles?.total ?? hit?.titles,
          }),
    scope: entry
      ? `${entry.name}${snap ? ` · ${snap.stage}` : ""}`
      : "Career to date",
    archived: entry != null,
  };
}

export function HistoryCoachCardProvider({
  entries,
  onOpenProfile,
  children,
}: {
  entries: SeasonHistoryEntry[];
  onOpenProfile?: (coachName: string) => void;
  children: ReactNode;
}) {
  const index = useMemo<HistoryIndex>(() => {
    return {
      entries,
      entryById: new Map(entries.map((e) => [e.id, e])),
      hallNames: lazily(() => archivedCoachNames(entries)),
      hits: lazily(() => {
        const out = new Map<string, CoachHit>();
        for (const hit of listCoachesRich(entries)) out.set(hit.name, hit);
        return out;
      }),
      records: lazily(() => {
        const out = new Map<string, CoachRecord>();
        for (const r of computeCoachRecords(entries)) out.set(r.name, r);
        return out;
      }),
      profile: (() => {
        const cache = new Map<string, ReturnType<typeof coachProfile>>();
        return (n: string) => {
          if (!cache.has(n)) cache.set(n, coachProfile(entries, n));
          return cache.get(n)!;
        };
      })(),
    };
  }, [entries]);

  const indexRef = useRef(index);
  indexRef.current = index;
  const navRef = useRef(onOpenProfile);
  navRef.current = onOpenProfile;
  const hasProfileNav = !!onOpenProfile;

  const value = useMemo<CoachCardContextValue>(
    () => ({
      resolve: (coachName, opts) =>
        resolveHistory(indexRef.current, coachName, opts),
      hasProfileNav,
      canOpenProfile: (coachName) => !!coachName && !!navRef.current,
      openProfile: (coachName) => navRef.current?.(coachName),
    }),
    [hasProfileNav],
  );

  return (
    <CoachCardContext.Provider value={value}>{children}</CoachCardContext.Provider>
  );
}

export function NoCoachCards({ children }: { children: ReactNode }) {
  return (
    <CoachCardContext.Provider value={null}>{children}</CoachCardContext.Provider>
  );
}
