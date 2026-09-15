// Shared data model behind the player trading-card hover tooltip.
//
// One shape (`PlayerCardData`) is rendered by `components/player/PlayerHoverCard`
// no matter where the name was clicked from. Two very different worlds feed it:
//
//   • LIVE season — the player as they are RIGHT NOW (roster tier, this year's
//     production, hot/cold form, market value while in the inactive pool).
//   • SEASON HISTORY — the player as that year ARCHIVED them (tier/team/status
//     frozen in the phase-roster snapshot), plus their career to date.
//
// Everything here is pure so the resolvers in the React provider stay thin and
// the year-snapshot lookup is testable without mounting anything.

import type { Lane, Player, PlayerTier } from "../types";
import type { SeasonHistoryEntry } from "./history";
import { resolveTeamLogo } from "./realTeams";
import type { SeasonTeam, TransferPlayer, SeasonState } from "./types";
import type { ValueBreakdown } from "./faMarket";
import {
  TOTAL_INACTIVE_BEFORE_RETIRE,
  yearsAsFreeAgent,
  yearsInAcademy,
  type CareerStatus,
} from "./playerLifecycle";
import type { LeagueId } from "./types";

export type PlayerCardStatus = CareerStatus;

export interface PlayerCardTeam {
  name: string;
  leagueId?: LeagueId | null;
  iconKey?: string;
  logoUrl?: string;
  color?: string;
}

/** Build a card team row — skips empty/org-less names (e.g. unattached FA). */
export function buildPlayerCardTeam(
  name: string | undefined | null,
  opts?: {
    leagueId?: LeagueId | null;
    iconKey?: string;
    color?: string;
    logoUrl?: string;
  },
): PlayerCardTeam | null {
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

export function buildPlayerCardTeamFromSeasonTeam(team: SeasonTeam): PlayerCardTeam {
  return buildPlayerCardTeam(team.name, {
    leagueId: team.leagueId,
    iconKey: team.iconKey,
    color: team.color,
    logoUrl: team.logoUrl,
  })!;
}

/** Resolve last-team chrome for an inactive snapshot inside one archived year. */
export function buildPlayerCardTeamFromInactiveSnap(
  snap: { lastTeamId: string; lastTeamName?: string },
  entry?: SeasonHistoryEntry,
): PlayerCardTeam | null {
  if (entry && snap.lastTeamId) {
    for (const phase of entry.phaseRosters ?? []) {
      for (const t of phase.teams) {
        if (t.teamId === snap.lastTeamId) {
          return buildPlayerCardTeam(t.teamName, {
            leagueId: t.leagueId,
            logoUrl: t.logoUrl,
          });
        }
      }
    }
  }
  return buildPlayerCardTeam(snap.lastTeamName ?? snap.lastTeamId);
}

/** Production inside ONE season — the card's headline stat grid. */
export interface PlayerCardSeasonLine {
  /** "2031 Season" / "Year 4" — whatever scope the numbers cover. */
  label: string;
  games: number;
  wins?: number;
  kills: number;
  deaths: number;
  assists: number;
  avgRating: number | null;
  mvps: number;
  pentakills: number;
  splitTitles?: number;
  intlTitles?: number;
}

/** Everything summed across archived seasons (Hall careers). */
export interface PlayerCardCareer {
  seasons?: number;
  games: number;
  /** 0..1, null when no season recorded wins. */
  winRate: number | null;
  /** Career average game rating, null when nothing was rated. */
  grade: number | null;
  kills: number;
  mvps: number;
  allPro: number;
  /** Split + international trophies combined. */
  titles: number;
  pentakills: number;
}

export interface PlayerCardData {
  playerId?: string;
  name: string;
  lane?: Lane;
  tier?: PlayerTier;
  potential?: PlayerTier;
  age?: number;
  debutYear?: number;
  homeRegion?: string;
  /** 0..1 — below 1 marks an import still settling into the region. */
  acclimation?: number;
  status: PlayerCardStatus;
  /** Years shown on the status pill (Acy · 2y / FA · 1y / Ret · 7y). */
  statusYears?: number;
  yearsLeftToFa?: number;
  yearsLeftToRetire?: number;
  team?: PlayerCardTeam | null;
  /** "Team" while active, "Last team" once academy / FA / retired. */
  teamLabel: string;
  /** Live hot-cold form in [-1, 1]; null when the season doesn't track it. */
  form?: number | null;
  lastActiveGrade?: number | null;
  shadowGrade?: number | null;
  /** Market value while in the inactive pool (FA / academy boards). */
  value?: number | null;
  valueBreakdown?: ValueBreakdown | null;
  /** Signed delta vs the roster slot the board is shopping for. */
  upgradeVsSlot?: number | null;
  goodChamps: number[];
  badChamps: number[];
  season?: PlayerCardSeasonLine | null;
  career?: PlayerCardCareer | null;
  /** Short accolade chips — "3× Worlds", "Rookie ’31", "All-Pro ×4". */
  highlights: string[];
  /** Provenance footer — "Live season" vs "Archived · 2031". */
  scope: string;
  /** True when the card shows a frozen year snapshot rather than live state. */
  archived: boolean;
}

/** Years the status pill should read, clamped to each stage's window. */
export function statusBadgeYears(
  status: PlayerCardStatus,
  inactiveYears: number | undefined,
): number | undefined {
  if (status === "active" || inactiveYears == null) return undefined;
  if (status === "academy") return yearsInAcademy(status, inactiveYears);
  if (status === "free-agent") return yearsAsFreeAgent(status, inactiveYears);
  return Math.min(TOTAL_INACTIVE_BEFORE_RETIRE, Math.max(1, inactiveYears));
}

/** The roster row a player held in one archived season, newest stage first. */
export interface ArchivedRosterSnapshot {
  lane: Lane;
  tier: PlayerTier;
  potential?: PlayerTier;
  age?: number;
  debutYear?: number;
  name?: string;
  goodChamps: number[];
  badChamps: number[];
  teamId: string;
  teamName: string;
  leagueId: LeagueId;
  logoUrl?: string;
  /** Stage label the snapshot came from ("Summer Split", "Worlds", …). */
  stage: string;
  /** True when the player appeared for more than one team that year. */
  transferred: boolean;
}

/**
 * That year's roster snapshot for a player — the LAST stage they played, so a
 * mid-year transfer shows the team they finished on (and flags the move).
 * Returns null when the player never took the stage that season.
 */
export function archivedRosterSnapshot(
  entry: SeasonHistoryEntry,
  playerId: string,
  phaseScope?: import("@/lib/season/types").SplitId | import("@/lib/season/types").InternationalId,
): ArchivedRosterSnapshot | null {
  const phases = [...(entry.phaseRosters ?? [])].sort(
    (a, b) => a.phaseIndex - b.phaseIndex,
  );
  let latest: ArchivedRosterSnapshot | null = null;
  const teamIds = new Set<string>();
  for (const phase of phases) {
    if (phaseScope && (phase.split ?? phase.event) !== phaseScope) continue;
    for (const team of phase.teams) {
      const found = team.players.find((p) => p.id === playerId);
      if (!found) continue;
      teamIds.add(team.teamId);
      latest = {
        lane: found.lane,
        tier: found.tier,
        goodChamps: found.goodChamps ?? [],
        badChamps: found.badChamps ?? [],
        teamId: team.teamId,
        teamName: team.teamName,
        leagueId: team.leagueId,
        stage: phase.label,
        transferred: false,
        ...(found.potential ? { potential: found.potential } : {}),
        ...(found.age != null ? { age: found.age } : {}),
        ...(found.debutYear != null ? { debutYear: found.debutYear } : {}),
        ...(found.name ? { name: found.name } : {}),
        ...(team.logoUrl ? { logoUrl: team.logoUrl } : {}),
      };
      break;
    }
  }
  if (latest) latest.transferred = teamIds.size > 1;
  return latest;
}

/**
 * Newest archived season where the player appears on a phase roster.
 * Career / all-time cards use this for identity (tier, champs, team) when no
 * `seasonId` is pinned — stats still come from the Hall career aggregate.
 *
 * Callers with a year pin must use {@link archivedRosterSnapshot} on that
 * entry instead — never this — or Hall timeline cards leak "current" teams.
 */
export function latestPlayerRosterSnapshot(
  entries: readonly SeasonHistoryEntry[],
  playerId: string,
): (ArchivedRosterSnapshot & { entry: SeasonHistoryEntry }) | null {
  const ordered = [...entries].sort((a, b) => b.archivedAt - a.archivedAt);
  for (const entry of ordered) {
    const snap = archivedRosterSnapshot(entry, playerId);
    if (snap) return { ...snap, entry };
  }
  return null;
}

/**
 * Team row for a Hall player card. When `yearPinned`, career/live most-recent
 * team is ignored — only that year's roster / inactive / year record / hint.
 */
export function historyPlayerCardTeam(opts: {
  yearPinned: boolean;
  identitySnap: {
    teamName: string;
    leagueId: LeagueId;
    logoUrl?: string;
  } | null;
  inactiveSnap?: { lastTeamId: string; lastTeamName?: string } | null;
  entry?: SeasonHistoryEntry;
  yearRecord?: { teamName?: string; leagueId?: LeagueId | null } | null;
  hintTeamName?: string;
  careerTeam?: {
    name: string;
    leagueId?: LeagueId | null;
    iconKey?: string;
    color?: string;
    logoUrl?: string;
  } | null;
}): PlayerCardTeam | null {
  const {
    yearPinned,
    identitySnap,
    inactiveSnap,
    entry,
    yearRecord,
    hintTeamName,
    careerTeam,
  } = opts;
  if (identitySnap) {
    return buildPlayerCardTeam(identitySnap.teamName, {
      leagueId: identitySnap.leagueId,
      logoUrl: identitySnap.logoUrl,
    });
  }
  if (inactiveSnap) {
    return buildPlayerCardTeamFromInactiveSnap(inactiveSnap, entry);
  }
  if (yearPinned) {
    if (yearRecord?.teamName) {
      return buildPlayerCardTeam(yearRecord.teamName, {
        leagueId: yearRecord.leagueId,
      });
    }
    return hintTeamName ? buildPlayerCardTeam(hintTeamName) : null;
  }
  if (careerTeam) {
    return buildPlayerCardTeam(careerTeam.name, {
      leagueId: careerTeam.leagueId,
      iconKey: careerTeam.iconKey,
      color: careerTeam.color,
      logoUrl: careerTeam.logoUrl,
    });
  }
  return hintTeamName ? buildPlayerCardTeam(hintTeamName) : null;
}

/** Every player id that appears on an archived roster — drives click-to-profile. */
export function archivedPlayerIds(
  entries: readonly SeasonHistoryEntry[],
): Set<string> {
  const out = new Set<string>();
  for (const entry of entries) {
    for (const phase of entry.phaseRosters ?? []) {
      for (const team of phase.teams) {
        for (const p of team.players) if (p.id) out.add(p.id);
      }
    }
    for (const snap of entry.inactivePlayers ?? []) {
      if (snap.playerId) out.add(snap.playerId);
    }
    for (const rec of entry.playerCareers ?? []) {
      if (rec.playerId) out.add(rec.playerId);
    }
  }
  return out;
}

/** Rehydrate a transfer-window snapshot into a minimal {@link Player} for hover hints. */
export function playerFromTransferSnapshot(
  tp: TransferPlayer,
  lane: Lane,
): Player {
  return {
    ...(tp.id ? { id: tp.id } : {}),
    ...(tp.name ? { name: tp.name } : {}),
    lane,
    tier: tp.tier,
    goodChamps: tp.goodChamps,
    badChamps: [],
  };
}

/**
 * True when a hint `Player` looks like a transfer/news stub (tier + pool only)
 * rather than a live roster row with age / potential / region / etc.
 */
export function isSparsePlayerHint(p: Player): boolean {
  return (
    p.age == null &&
    p.potential == null &&
    p.acclimation == null &&
    p.debutYear == null &&
    !p.homeRegion &&
    (p.badChamps?.length ?? 0) === 0
  );
}

/**
 * Find the live roster / inactive-pool player for a card hover.
 * Prefers stable id; falls back to name + lane for id-less universes.
 */
export function findLivePlayerForCard(
  season: SeasonState | null | undefined,
  opts: { playerId?: string; name?: string; lane?: Lane },
): { player: Player; teamName?: string } | null {
  if (!season) return null;
  const pool = season.franchise?.inactivePool;

  if (opts.playerId) {
    for (const team of season.teams) {
      const p = team.players.find((x) => x.id === opts.playerId);
      if (p) return { player: p, teamName: team.name };
    }
    if (pool) {
      for (const e of pool) {
        if (e.player.id === opts.playerId) {
          return {
            player: e.player,
            ...(e.lastTeamName ? { teamName: e.lastTeamName } : {}),
          };
        }
      }
    }
  }

  const name = opts.name?.trim();
  if (name && opts.lane) {
    for (const team of season.teams) {
      const p = team.players.find(
        (x) => x.lane === opts.lane && x.name?.trim() === name,
      );
      if (p) return { player: p, teamName: team.name };
    }
    if (pool) {
      for (const e of pool) {
        if (e.player.lane === opts.lane && e.player.name?.trim() === name) {
          return {
            player: e.player,
            ...(e.lastTeamName ? { teamName: e.lastTeamName } : {}),
          };
        }
      }
    }
  }

  return null;
}

/** Accolade chips for the card footer — most prestigious first, capped at 4. */
export function careerHighlights(input: {
  intlTitles?: number;
  splitTitles?: number;
  titles?: number;
  mvps?: number;
  allPro?: number;
  pentakills?: number;
}): string[] {
  const out: string[] = [];
  const push = (n: number | undefined, label: string) => {
    if (n && n > 0) out.push(`${n}× ${label}`);
  };
  push(input.intlTitles, "Intl");
  push(input.splitTitles, "Split");
  if (!input.intlTitles && !input.splitTitles) push(input.titles, "Title");
  push(input.mvps, "MVP");
  push(input.allPro, "All-Pro");
  push(input.pentakills, "Penta");
  return out.slice(0, 4);
}
