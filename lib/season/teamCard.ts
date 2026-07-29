// Shared data model behind the team trading-card hover tooltip.
//
//   • LIVE season — roster, form, standings, academy count as they are now.
//   • SEASON HISTORY — that year's phase-roster snapshot + titles from the archive.

import { deriveStar, LANE_ORDER, playerForLane, tierValue, valueToTier } from "../players";
import type { Lane, PlayerTier, Roster } from "../types";
import { compareMatchChronology, computeStandings } from "../tournament";
import { currentPhase } from "./engine";
import type { SeasonHistoryEntry } from "./history";
import {
  computeTeamRecords,
  franchiseKeysMatch,
} from "./historyRecords";
import { resolveTeamLogo } from "./realTeams";
import {
  INTERNATIONAL_LABELS,
  SPLIT_LABELS,
  seasonTeam,
  type InternationalId,
  type LeagueId,
  type PhaseInactiveSnapshot,
  type PhaseRosterSnapshot,
  type SeasonState,
  type SeasonTeam,
  type SplitId,
} from "./types";
import type { InactivePlayerSnapshot } from "./playerLifecycle";

export const RECENT_SERIES_WINDOW = 20;
/** Last-N series for match-context H2H on team hover cards. */
export const RECENT_H2H_WINDOW = 5;

export interface TeamSeriesWinLoss {
  wins: number;
  losses: number;
  /** Series win rate 0..1; null when no series played. */
  winRate: number | null;
}

export interface TeamCardWinRates {
  overall: TeamSeriesWinLoss;
  /** Last up-to-20 series (exact on live seasons; scope-ordered on archives). */
  recent: TeamSeriesWinLoss & { sampleSize: number };
}

/** Head-to-head vs a specific opponent (match-box hover context). */
export interface TeamCardH2H {
  opponentName: string;
  meetings: number;
  /** All-time (Hall archive + live when available). */
  overall: TeamSeriesWinLoss;
  /**
   * Last up-to-{@link RECENT_H2H_WINDOW} meetings.
   * Live cards use current-season chronology (archives lack a match log).
   * sampleSize 0 when unknown (archive-only).
   */
  recent: TeamSeriesWinLoss & { sampleSize: number };
}

export interface TeamCardTitleCounts {
  split: number;
  intl: number;
  worlds: number;
  total: number;
}

export interface TeamCardRosterLine {
  lane: Lane;
  tier: PlayerTier;
  name?: string;
  playerId?: string;
}

export interface TeamCardData {
  /** Live season team id — resolver input, not shown. */
  teamId?: string;
  /** Hall navigation key — `leagueId:teamName`. */
  navKey: string;
  name: string;
  leagueId: LeagueId;
  iconKey?: string;
  logoUrl?: string;
  color?: string;
  roster: TeamCardRosterLine[];
  academyCount: number;
  starRating: number;
  avgTier: PlayerTier;
  standing?: string | null;
  form?: number | null;
  /** Short accolade chips for the scoped year / live season. */
  highlights: string[];
  /** Domestic + international title totals for the card scope. */
  titleCounts?: TeamCardTitleCounts | null;
  /** Series win rates — career or scoped year depending on resolver. */
  winRates?: TeamCardWinRates | null;
  /** Vs opponent when hovering a team inside a match box. */
  h2h?: TeamCardH2H | null;
  scope: string;
  archived: boolean;
}

export interface TeamCardHint {
  team?: Pick<
    SeasonTeam,
    "id" | "name" | "leagueId" | "iconKey" | "logoUrl" | "color" | "players"
  >;
  name?: string;
  leagueId?: LeagueId;
  iconKey?: string;
  logoUrl?: string;
  color?: string;
  players?: Roster;
}

export function teamNavKey(team: { name: string; leagueId: LeagueId }): string {
  return `${team.leagueId}:${team.name}`;
}

export function averageTierFromRoster(
  roster: Roster | readonly TeamCardRosterLine[],
): PlayerTier {
  if (!roster.length) return "B";
  const mean =
    roster.reduce((sum, p) => sum + tierValue(p.tier), 0) / roster.length;
  return valueToTier(mean);
}

export function rosterLinesFromPlayers(players: Roster): TeamCardRosterLine[] {
  return LANE_ORDER.map((lane) => {
    const p = playerForLane(players, lane);
    if (!p) return { lane, tier: "B" as PlayerTier };
    return {
      lane,
      tier: p.tier,
      ...(p.name ? { name: p.name } : {}),
      ...(p.id ? { playerId: p.id } : {}),
    };
  });
}

/** Every team key that appears on an archived roster — drives click-to-profile. */
export function archivedTeamKeys(
  entries: readonly SeasonHistoryEntry[],
): Set<string> {
  const out = new Set<string>();
  for (const entry of entries) {
    for (const phase of entry.phaseRosters ?? []) {
      for (const t of phase.teams) {
        out.add(teamNavKey({ name: t.teamName, leagueId: t.leagueId }));
      }
    }
  }
  return out;
}

type ArchivedTeamSnap = {
  players: Roster;
  stage: string;
  logoUrl?: string;
};

/** Latest phase roster for a team within one archived season. */
export function archivedTeamSnapshot(
  entry: SeasonHistoryEntry,
  team: { name: string; leagueId: LeagueId },
): ArchivedTeamSnap | null {
  const phases = [...(entry.phaseRosters ?? [])].sort(
    (a, b) => a.phaseIndex - b.phaseIndex,
  );
  let latest: ArchivedTeamSnap | null = null;
  let latestNonEmpty: ArchivedTeamSnap | null = null;
  for (const phase of phases) {
    const found = phase.teams.find(
      (t) => t.teamName === team.name && t.leagueId === team.leagueId,
    );
    if (!found) continue;
    const snap: ArchivedTeamSnap = {
      players: found.players as Roster,
      stage: phase.label,
      ...(found.logoUrl ? { logoUrl: found.logoUrl } : {}),
    };
    latest = snap;
    // Prefer a non-empty stage roster — some late phases archive the team
    // chrome with an empty players array and would otherwise blank the card.
    if (found.players.length > 0) latestNonEmpty = snap;
  }
  return latestNonEmpty ?? latest;
}

function snapFromPhase(
  phase: PhaseRosterSnapshot,
  team: { name: string; leagueId: LeagueId },
): ArchivedTeamSnap | null {
  const found = phase.teams.find(
    (t) => t.teamName === team.name && t.leagueId === team.leagueId,
  );
  if (!found) return null;
  return {
    players: found.players as Roster,
    stage: phase.label,
    ...(found.logoUrl ? { logoUrl: found.logoUrl } : {}),
  };
}

/**
 * Phase roster for a team within one archived season, preferring the split or
 * international stage that matches `scope`. Falls back to {@link archivedTeamSnapshot}.
 */
export function archivedTeamSnapshotForScope(
  entry: SeasonHistoryEntry,
  team: { name: string; leagueId: LeagueId },
  scope: SplitId | InternationalId,
): ArchivedTeamSnap | null {
  const phases = [...(entry.phaseRosters ?? [])].sort(
    (a, b) => a.phaseIndex - b.phaseIndex,
  );
  let scoped: ArchivedTeamSnap | null = null;
  let scopedNonEmpty: ArchivedTeamSnap | null = null;
  for (const phase of phases) {
    const phaseScope = phase.split ?? phase.event;
    if (phaseScope !== scope) continue;
    const snap = snapFromPhase(phase, team);
    if (!snap) continue;
    scoped = snap;
    if (snap.players.length > 0) scopedNonEmpty = snap;
  }
  return scopedNonEmpty ?? scoped ?? archivedTeamSnapshot(entry, team);
}

/** Live academy size: inactive pool rows with status academy for this org. */
export function liveAcademyCount(
  pool: readonly { status: string; lastTeamId: string; lastTeamName?: string }[],
  team: { id?: string; name?: string },
): number {
  let n = 0;
  for (const e of pool) {
    if (e.status !== "academy") continue;
    if (team.id && e.lastTeamId === team.id) n++;
    else if (team.name && e.lastTeamName === team.name) n++;
  }
  return n;
}

function academyStampMatchesTeam(
  stamp: { teamId?: string; teamName?: string },
  team: { name: string; teamId?: string },
): boolean {
  if (team.teamId && stamp.teamId === team.teamId) return true;
  if (stamp.teamName === team.name) return true;
  return false;
}

function countPhaseAcademy(
  inactive: readonly PhaseInactiveSnapshot[],
  team: { name: string; teamId?: string },
): number {
  let n = 0;
  for (const p of inactive) {
    if (p.status !== "academy") continue;
    if (academyStampMatchesTeam(p, team)) n++;
  }
  return n;
}

function countYearEndAcademy(
  pool: readonly InactivePlayerSnapshot[],
  team: { name: string; teamId?: string },
): number {
  let n = 0;
  for (const p of pool) {
    if (p.status !== "academy") continue;
    if (
      academyStampMatchesTeam(
        { teamId: p.lastTeamId, teamName: p.lastTeamName },
        team,
      )
    ) {
      n++;
    }
  }
  return n;
}

/**
 * Pick the phase-inactive stamp that pairs with {@link archivedTeamSnapshot}:
 * prefer the latest non-empty roster phase that recorded `inactive`.
 */
function phaseInactiveForTeam(
  phases: readonly PhaseRosterSnapshot[],
  team: { name: string; leagueId: LeagueId },
): { inactive: PhaseInactiveSnapshot[]; teamId?: string } | null {
  const ordered = [...phases].sort((a, b) => a.phaseIndex - b.phaseIndex);
  let teamId: string | undefined;
  let withInactive: PhaseInactiveSnapshot[] | undefined;
  let withInactiveNonEmpty: PhaseInactiveSnapshot[] | undefined;
  for (const phase of ordered) {
    const found = phase.teams.find(
      (t) => t.teamName === team.name && t.leagueId === team.leagueId,
    );
    if (!found) continue;
    if (!teamId) teamId = found.teamId;
    if (phase.inactive === undefined) continue;
    withInactive = phase.inactive;
    if (found.players.length > 0) withInactiveNonEmpty = phase.inactive;
  }
  const inactive = withInactiveNonEmpty ?? withInactive;
  if (inactive === undefined) return null;
  return { inactive, ...(teamId ? { teamId } : {}) };
}

function resolveArchivedTeamId(
  entry: SeasonHistoryEntry,
  team: { name: string; leagueId: LeagueId },
): string | undefined {
  for (const phase of entry.phaseRosters ?? []) {
    const found = phase.teams.find(
      (t) => t.teamName === team.name && t.leagueId === team.leagueId,
    );
    if (found?.teamId) return found.teamId;
  }
  return undefined;
}

/**
 * Academy size for one archived year.
 * Prefer mid-year {@link PhaseInactiveSnapshot}; else end-of-year
 * `inactivePlayers`; `0` when neither source exists.
 */
export function archivedAcademyCount(
  entry: SeasonHistoryEntry,
  team: { name: string; leagueId: LeagueId },
): number {
  const teamId = resolveArchivedTeamId(entry, team);
  const org = { name: team.name, ...(teamId ? { teamId } : {}) };

  const phaseHit = phaseInactiveForTeam(entry.phaseRosters ?? [], team);
  if (phaseHit) {
    return countPhaseAcademy(phaseHit.inactive, {
      name: team.name,
      teamId: phaseHit.teamId ?? teamId,
    });
  }

  if (entry.inactivePlayers !== undefined) {
    return countYearEndAcademy(entry.inactivePlayers, org);
  }

  return 0;
}

/**
 * Newest archive that recorded academy/FA pool data for this franchise.
 * Used by career / unscoped history cards.
 */
export function latestAcademyCount(
  entries: readonly SeasonHistoryEntry[],
  team: { name: string; leagueId: LeagueId },
): number {
  const ordered = [...entries].sort((a, b) => b.archivedAt - a.archivedAt);
  for (const entry of ordered) {
    const hasPhaseInactive = (entry.phaseRosters ?? []).some(
      (p) => p.inactive !== undefined,
    );
    if (!hasPhaseInactive && entry.inactivePlayers === undefined) continue;
    return archivedAcademyCount(entry, team);
  }
  return 0;
}

/**
 * Newest archived season's non-empty phase roster for a franchise.
 * Used by career / all-time team cards when no `seasonId` is pinned.
 */
export function latestTeamRoster(
  entries: readonly SeasonHistoryEntry[],
  team: { name: string; leagueId: LeagueId },
): (ArchivedTeamSnap & { entry: SeasonHistoryEntry }) | null {
  const ordered = [...entries].sort((a, b) => b.archivedAt - a.archivedAt);
  let emptyFallback: (ArchivedTeamSnap & { entry: SeasonHistoryEntry }) | null =
    null;
  for (const entry of ordered) {
    const snap = archivedTeamSnapshot(entry, team);
    if (!snap) continue;
    const withEntry = { ...snap, entry };
    if (snap.players.length > 0) return withEntry;
    emptyFallback ??= withEntry;
  }
  return emptyFallback;
}

/** Accolade chips for one archived year (or live season tally). */
export function teamTitleHighlights(input: {
  splitTitles?: Partial<Record<SplitId, boolean>>;
  intlTitles?: Partial<Record<InternationalId, boolean>>;
  worlds?: "champion" | "finalist" | null;
}): string[] {
  const out: string[] = [];
  if (input.worlds === "champion") out.push("Season champion");
  else if (input.worlds === "finalist") out.push("Season finalist");
  for (const split of ["winter", "spring", "summer"] as SplitId[]) {
    if (input.splitTitles?.[split]) out.push(SPLIT_LABELS[split]);
  }
  for (const ev of ["first-stand", "msi", "worlds", "global-cup"] as InternationalId[]) {
    if (input.intlTitles?.[ev]) out.push(INTERNATIONAL_LABELS[ev]);
  }
  return out.slice(0, 5);
}

export function teamTitleHighlightsFromEntry(
  entry: SeasonHistoryEntry,
  team: { name: string; leagueId: LeagueId },
): string[] {
  const splitTitles: Partial<Record<SplitId, boolean>> = {};
  for (const split of Object.keys(entry.splitChampions) as SplitId[]) {
    if (entry.splitChampions[split]?.[team.leagueId]?.name === team.name) {
      splitTitles[split] = true;
    }
  }
  const intlTitles: Partial<Record<InternationalId, boolean>> = {};
  for (const ev of Object.keys(entry.intlChampions) as InternationalId[]) {
    if (entry.intlChampions[ev]?.name === team.name) intlTitles[ev] = true;
  }
  const worlds =
    entry.champion?.name === team.name && entry.champion?.leagueId === team.leagueId
      ? ("champion" as const)
      : entry.runnerUp?.name === team.name &&
          entry.runnerUp?.leagueId === team.leagueId
        ? ("finalist" as const)
        : null;
  return teamTitleHighlights({ splitTitles, intlTitles, worlds });
}

export function buildTeamCardIdentity(
  name: string,
  leagueId: LeagueId,
  opts?: {
    iconKey?: string;
    logoUrl?: string;
    color?: string;
  },
): Pick<TeamCardData, "name" | "leagueId" | "iconKey" | "logoUrl" | "color" | "navKey"> {
  const logo = resolveTeamLogo(name, opts?.logoUrl);
  return {
    navKey: teamNavKey({ name, leagueId }),
    name,
    leagueId,
    iconKey: opts?.iconKey ?? "shield",
    ...(opts?.color ? { color: opts.color } : {}),
    ...(logo ? { logoUrl: logo } : {}),
  };
}

/** Current split standing when the league tournament has a table. */
export function liveTeamStandingLabel(
  season: SeasonState,
  teamId: string,
): string | null {
  const team = seasonTeam(season, teamId);
  if (!team) return null;

  const phase = currentPhase(season);
  if (phase?.split) {
    for (const tid of phase.tournamentIds) {
      const t = season.tournaments[tid];
      if (!t || t.status === "complete") continue;
      const row = computeStandings(t).find((s) => s.team.id === teamId);
      if (row) return `#${row.rank} · ${row.wins}-${row.losses}`;
    }
  }

  const splits = ["summer", "spring", "winter"] as SplitId[];
  for (const split of splits) {
    const order = season.splitResults[split]?.[team.leagueId];
    if (!order?.length) continue;
    const idx = order.indexOf(teamId);
    if (idx >= 0) return `${SPLIT_LABELS[split]} · #${idx + 1}`;
  }
  return null;
}

function wlRecord(wins: number, losses: number): TeamSeriesWinLoss {
  const n = wins + losses;
  return { wins, losses, winRate: n > 0 ? wins / n : null };
}

function recentFromSeries(results: ("W" | "L")[]): TeamCardWinRates["recent"] {
  const slice = results.slice(-RECENT_SERIES_WINDOW);
  const wins = slice.filter((r) => r === "W").length;
  const losses = slice.length - wins;
  return { ...wlRecord(wins, losses), sampleSize: slice.length };
}

/** Completed non-bye series for one team, in season phase order. */
export function liveTeamSeriesResults(
  season: SeasonState,
  teamId: string,
): ("W" | "L")[] {
  if (!teamId) return [];
  const out: ("W" | "L")[] = [];
  const seen = new Set<string>();

  const pushTournament = (tid: string) => {
    if (seen.has(tid)) return;
    const t = season.tournaments?.[tid];
    if (!t) return;
    seen.add(tid);
    const played = t.matches
      .filter(
        (m) =>
          !m.isBye &&
          m.winner != null &&
          m.blueTeamId != null &&
          m.redTeamId != null &&
          (m.blueTeamId === teamId || m.redTeamId === teamId),
      )
      .sort(compareMatchChronology);
    for (const m of played) {
      out.push(m.winner!.teamId === teamId ? "W" : "L");
    }
  };

  // Calendar order via phases (preferred — matches season chronology).
  for (const phase of season.phases ?? []) {
    for (const tid of phase.tournamentIds ?? []) pushTournament(tid);
  }
  // Orphans / mid-create tournaments not yet listed on a phase.
  for (const tid of Object.keys(season.tournaments ?? {})) pushTournament(tid);

  return out;
}

export function liveTeamWinRates(
  season: SeasonState,
  teamId: string,
): TeamCardWinRates {
  const results = liveTeamSeriesResults(season, teamId);
  const wins = results.filter((r) => r === "W").length;
  return {
    overall: wlRecord(wins, results.length - wins),
    recent: recentFromSeries(results),
  };
}

/** Series results for `teamId` vs `opponentId` only, phase chronology. */
export function liveTeamH2HResults(
  season: SeasonState,
  teamId: string,
  opponentId: string,
): ("W" | "L")[] {
  if (!teamId || !opponentId || teamId === opponentId) return [];
  const out: ("W" | "L")[] = [];
  const seen = new Set<string>();

  const pushTournament = (tid: string) => {
    if (seen.has(tid)) return;
    const t = season.tournaments?.[tid];
    if (!t) return;
    seen.add(tid);
    const played = [...t.matches]
      .filter(
        (m) =>
          !m.isBye &&
          m.winner != null &&
          ((m.blueTeamId === teamId && m.redTeamId === opponentId) ||
            (m.redTeamId === teamId && m.blueTeamId === opponentId)),
      )
      .sort(compareMatchChronology);
    for (const m of played) {
      out.push(m.winner!.teamId === teamId ? "W" : "L");
    }
  };

  for (const phase of season.phases ?? []) {
    for (const tid of phase.tournamentIds ?? []) pushTournament(tid);
  }
  for (const tid of Object.keys(season.tournaments ?? {})) pushTournament(tid);

  return out;
}

export function liveTeamH2H(
  season: SeasonState,
  teamId: string,
  opponentId: string,
  recentN: number = RECENT_H2H_WINDOW,
): TeamCardH2H | null {
  const results = liveTeamH2HResults(season, teamId, opponentId);
  if (results.length === 0) return null;
  const opponent = seasonTeam(season, opponentId);
  const wins = results.filter((r) => r === "W").length;
  const slice = results.slice(-Math.max(1, recentN));
  const recentWins = slice.filter((r) => r === "W").length;
  return {
    opponentName: opponent?.name ?? "Opponent",
    meetings: results.length,
    overall: wlRecord(wins, results.length - wins),
    recent: {
      ...wlRecord(recentWins, slice.length - recentWins),
      sampleSize: slice.length,
    },
  };
}

/** One archived season's H2H W-L for a franchise pair (no recent match log). */
function archivedPairWL(
  entry: SeasonHistoryEntry,
  team: { name: string; leagueId: LeagueId },
  opponent: { name: string; leagueId: LeagueId },
): { wins: number; losses: number; meetings: number } | null {
  const aKey = teamNavKey(team);
  const bKey = teamNavKey(opponent);
  if (franchiseKeysMatch(aKey, bKey)) return null;
  for (const r of h2hRows(entry)) {
    const ra = teamNavKey(r.teamA);
    const rb = teamNavKey(r.teamB);
    const teamIsA = franchiseKeysMatch(ra, aKey) && franchiseKeysMatch(rb, bKey);
    const teamIsB = franchiseKeysMatch(rb, aKey) && franchiseKeysMatch(ra, bKey);
    if (!teamIsA && !teamIsB) continue;
    const wins = teamIsA ? r.aWins : r.bWins;
    const losses = teamIsA ? r.bWins : r.aWins;
    if (wins + losses <= 0) return null;
    return { wins, losses, meetings: r.meetings };
  }
  return null;
}

/** Archive H2H from frozen headToHead / rivalries (overall only; no match log). */
export function archivedTeamH2H(
  entry: SeasonHistoryEntry,
  team: { name: string; leagueId: LeagueId },
  opponent: { name: string; leagueId: LeagueId },
): TeamCardH2H | null {
  const row = archivedPairWL(entry, team, opponent);
  if (!row) return null;
  return {
    opponentName: opponent.name,
    meetings: row.meetings,
    overall: wlRecord(row.wins, row.losses),
    recent: { wins: 0, losses: 0, winRate: null, sampleSize: 0 },
  };
}

/**
 * All-time archive H2H: sum headToHead / rivalries across every Hall season.
 * Recent is unknown (no chronologic match log in archives).
 */
export function careerArchivedTeamH2H(
  entries: readonly SeasonHistoryEntry[],
  team: { name: string; leagueId: LeagueId },
  opponent: { name: string; leagueId: LeagueId },
): TeamCardH2H | null {
  const aKey = teamNavKey(team);
  const bKey = teamNavKey(opponent);
  if (franchiseKeysMatch(aKey, bKey)) return null;
  let wins = 0;
  let losses = 0;
  let meetings = 0;
  for (const entry of entries) {
    const row = archivedPairWL(entry, team, opponent);
    if (!row) continue;
    wins += row.wins;
    losses += row.losses;
    meetings += row.meetings;
  }
  if (wins + losses <= 0) return null;
  return {
    opponentName: opponent.name,
    meetings,
    overall: wlRecord(wins, losses),
    recent: { wins: 0, losses: 0, winRate: null, sampleSize: 0 },
  };
}

/**
 * Match-box H2H for a live season: overall = Hall archive + current live
 * meetings; recent = last N from the live season only (archives have no
 * match chronology). With an empty Hall, overall equals current-season H2H.
 */
export function liveAllTimeTeamH2H(
  season: SeasonState,
  hallEntries: readonly SeasonHistoryEntry[],
  teamId: string,
  opponentId: string,
  recentN: number = RECENT_H2H_WINDOW,
): TeamCardH2H | null {
  if (!teamId || !opponentId || teamId === opponentId) return null;
  const team = seasonTeam(season, teamId);
  const opponent = seasonTeam(season, opponentId);
  if (!team || !opponent) return liveTeamH2H(season, teamId, opponentId, recentN);

  const liveResults = liveTeamH2HResults(season, teamId, opponentId);
  const liveWins = liveResults.filter((r) => r === "W").length;
  const liveLosses = liveResults.length - liveWins;

  const archived = careerArchivedTeamH2H(
    hallEntries,
    { name: team.name, leagueId: team.leagueId },
    { name: opponent.name, leagueId: opponent.leagueId },
  );
  const archWins = archived?.overall.wins ?? 0;
  const archLosses = archived?.overall.losses ?? 0;
  const archMeetings = archived?.meetings ?? 0;

  const totalWins = archWins + liveWins;
  const totalLosses = archLosses + liveLosses;
  if (totalWins + totalLosses <= 0) return null;

  const slice = liveResults.slice(-Math.max(1, recentN));
  const recentWins = slice.filter((r) => r === "W").length;
  return {
    opponentName: opponent.name,
    meetings: archMeetings + liveResults.length,
    overall: wlRecord(totalWins, totalLosses),
    recent:
      slice.length > 0
        ? {
            ...wlRecord(recentWins, slice.length - recentWins),
            sampleSize: slice.length,
          }
        : { wins: 0, losses: 0, winRate: null, sampleSize: 0 },
  };
}

type ScopeWL = { wins: number; losses: number };

function h2hRows(entry: SeasonHistoryEntry) {
  return entry.headToHead?.length
    ? entry.headToHead
    : (entry.rivalries ?? []);
}

/** Aggregate series W-L for one franchise within a single archived season. */
export function archivedSeasonTeamWL(
  entry: SeasonHistoryEntry,
  team: { name: string; leagueId: LeagueId },
): TeamSeriesWinLoss {
  const key = teamNavKey(team);
  let wins = 0;
  let losses = 0;
  for (const r of h2hRows(entry)) {
    const aKey = teamNavKey(r.teamA);
    const bKey = teamNavKey(r.teamB);
    if (franchiseKeysMatch(aKey, key)) {
      wins += r.aWins;
      losses += r.bWins;
    } else if (franchiseKeysMatch(bKey, key)) {
      wins += r.bWins;
      losses += r.aWins;
    }
  }
  if (wins + losses === 0) {
    const best = entry.leagueBestTeams?.[team.leagueId];
    if (best && franchiseKeysMatch(teamNavKey(best.team), key)) {
      return wlRecord(best.wins, best.losses);
    }
  }
  return wlRecord(wins, losses);
}

/** Per-stage series totals for one franchise in one archived season. */
function archivedSeasonScopeWL(
  entry: SeasonHistoryEntry,
  team: { name: string; leagueId: LeagueId },
): Map<SplitId | InternationalId, ScopeWL> {
  const key = teamNavKey(team);
  const scopes = new Map<SplitId | InternationalId, ScopeWL>();
  const bump = (scope: SplitId | InternationalId, w: number, l: number) => {
    const cur = scopes.get(scope) ?? { wins: 0, losses: 0 };
    cur.wins += w;
    cur.losses += l;
    scopes.set(scope, cur);
  };
  for (const r of h2hRows(entry)) {
    const aKey = teamNavKey(r.teamA);
    const bKey = teamNavKey(r.teamB);
    const isA = franchiseKeysMatch(aKey, key);
    const isB = franchiseKeysMatch(bKey, key);
    if (!isA && !isB) continue;
    for (const s of r.byScope ?? []) {
      if (isA) bump(s.scope, s.aWins, s.bWins);
      else bump(s.scope, s.bWins, s.aWins);
    }
  }
  return scopes;
}

function phaseScopeOrder(
  entry: SeasonHistoryEntry,
): (SplitId | InternationalId)[] {
  const out: (SplitId | InternationalId)[] = [];
  const seen = new Set<string>();
  for (const ph of [...(entry.phaseRosters ?? [])].sort(
    (a, b) => a.phaseIndex - b.phaseIndex,
  )) {
    const scope = ph.split ?? ph.event;
    if (!scope || seen.has(scope)) continue;
    seen.add(scope);
    out.push(scope);
  }
  return out;
}

/** Approximate last-N series from archived scope buckets (newest stages first). */
function archivedRecentWL(
  entry: SeasonHistoryEntry,
  team: { name: string; leagueId: LeagueId },
  limit = RECENT_SERIES_WINDOW,
): TeamCardWinRates["recent"] {
  const scopes = archivedSeasonScopeWL(entry, team);
  const order = phaseScopeOrder(entry);
  let wins = 0;
  let losses = 0;
  let sample = 0;
  for (let i = order.length - 1; i >= 0 && sample < limit; i--) {
    const row = scopes.get(order[i]!);
    if (!row) continue;
    const take = Math.min(limit - sample, row.wins + row.losses);
    if (take <= 0) continue;
    const scopeWR = row.wins + row.losses > 0 ? row.wins / (row.wins + row.losses) : 0.5;
    const w = Math.round(take * scopeWR);
    wins += w;
    losses += take - w;
    sample += take;
  }
  if (sample === 0) {
    const overall = archivedSeasonTeamWL(entry, team);
    const total = overall.wins + overall.losses;
    const cap = Math.min(limit, total);
    if (cap === 0) return { wins: 0, losses: 0, winRate: null, sampleSize: 0 };
    const ratio = total > 0 ? overall.wins / total : 0;
    const w = Math.round(cap * ratio);
    return { wins: w, losses: cap - w, winRate: cap > 0 ? w / cap : null, sampleSize: cap };
  }
  return { ...wlRecord(wins, losses), sampleSize: sample };
}

export function archivedSeasonTeamWinRates(
  entry: SeasonHistoryEntry,
  team: { name: string; leagueId: LeagueId },
): TeamCardWinRates {
  return {
    overall: archivedSeasonTeamWL(entry, team),
    recent: archivedRecentWL(entry, team),
  };
}

/** Career series W-L across every archived season (head-to-head ledger). */
export function careerTeamWL(
  entries: readonly SeasonHistoryEntry[],
  team: { name: string; leagueId: LeagueId },
): TeamSeriesWinLoss {
  let wins = 0;
  let losses = 0;
  for (const e of entries) {
    const row = archivedSeasonTeamWL(e, team);
    wins += row.wins;
    losses += row.losses;
  }
  return wlRecord(wins, losses);
}

/** Last-N series walking archived seasons newest-first (scope buckets). */
export function careerTeamRecentWL(
  entries: readonly SeasonHistoryEntry[],
  team: { name: string; leagueId: LeagueId },
  limit = RECENT_SERIES_WINDOW,
): TeamCardWinRates["recent"] {
  const ordered = [...entries].sort((a, b) => b.archivedAt - a.archivedAt);
  let wins = 0;
  let losses = 0;
  let sample = 0;
  for (const e of ordered) {
    if (sample >= limit) break;
    const scopes = archivedSeasonScopeWL(e, team);
    const phaseOrder = phaseScopeOrder(e);
    for (let i = phaseOrder.length - 1; i >= 0 && sample < limit; i--) {
      const row = scopes.get(phaseOrder[i]!);
      if (!row) continue;
      const take = Math.min(limit - sample, row.wins + row.losses);
      if (take <= 0) continue;
      const scopeWR = row.wins + row.losses > 0 ? row.wins / (row.wins + row.losses) : 0.5;
      const w = Math.round(take * scopeWR);
      wins += w;
      losses += take - w;
      sample += take;
    }
    if (sample >= limit) break;
    const seasonRow = archivedSeasonTeamWL(e, team);
    const remaining = limit - sample;
    const seasonTotal = seasonRow.wins + seasonRow.losses;
    const scopedTotal = [...scopes.values()].reduce(
      (s, r) => s + r.wins + r.losses,
      0,
    );
    const extra = seasonTotal - scopedTotal;
    if (extra > 0 && sample < limit) {
      const take = Math.min(remaining, extra);
      const ratio = seasonTotal > 0 ? seasonRow.wins / seasonTotal : 0.5;
      const w = Math.round(take * ratio);
      wins += w;
      losses += take - w;
      sample += take;
    }
  }
  if (sample === 0) {
    const overall = careerTeamWL(entries, team);
    const cap = Math.min(limit, overall.wins + overall.losses);
    if (cap === 0) return { wins: 0, losses: 0, winRate: null, sampleSize: 0 };
    const w = Math.round(cap * (overall.winRate ?? 0.5));
    return { wins: w, losses: cap - w, winRate: cap > 0 ? w / cap : null, sampleSize: cap };
  }
  return { ...wlRecord(wins, losses), sampleSize: sample };
}

export function careerTeamWinRates(
  entries: readonly SeasonHistoryEntry[],
  team: { name: string; leagueId: LeagueId },
): TeamCardWinRates {
  return {
    overall: careerTeamWL(entries, team),
    recent: careerTeamRecentWL(entries, team),
  };
}

/** Title totals for one archived year. */
export function titleCountsFromEntry(
  entry: SeasonHistoryEntry,
  team: { name: string; leagueId: LeagueId },
): TeamCardTitleCounts {
  const key = teamNavKey(team);
  let split = 0;
  for (const splitId of Object.keys(entry.splitChampions) as SplitId[]) {
    const champ = entry.splitChampions[splitId]?.[team.leagueId];
    if (champ && franchiseKeysMatch(teamNavKey(champ), key)) split++;
  }
  let intl = 0;
  let worlds = 0;
  for (const ev of Object.keys(entry.intlChampions) as InternationalId[]) {
    const champ = entry.intlChampions[ev];
    if (champ && franchiseKeysMatch(teamNavKey(champ), key)) {
      intl++;
      if (ev === "worlds") worlds++;
    }
  }
  if (
    entry.champion &&
    franchiseKeysMatch(teamNavKey(entry.champion), key) &&
    worlds === 0
  ) {
    worlds = 1;
    intl++;
  }
  return { split, intl, worlds, total: split + intl };
}

/** Career title totals from the Hall records board. */
export function titleCountsFromRecords(
  entries: readonly SeasonHistoryEntry[],
  team: { name: string; leagueId: LeagueId },
): TeamCardTitleCounts | null {
  const key = teamNavKey(team);
  const rec = computeTeamRecords([...entries]).find((r) =>
    franchiseKeysMatch(r.key, key),
  );
  if (!rec) return null;
  return {
    split: rec.splitTitles,
    intl: rec.intlTotal,
    worlds: rec.worldsTitles,
    total: rec.totalTitles,
  };
}

/** Live season trophy tally (splits + internationals won so far). */
export function liveTitleCounts(
  season: SeasonState,
  team: SeasonTeam,
): TeamCardTitleCounts {
  let split = 0;
  for (const splitId of Object.keys(season.splitResults) as SplitId[]) {
    const order = season.splitResults[splitId]?.[team.leagueId];
    if (order?.[0] === team.id) split++;
  }
  let intl = 0;
  let worlds = 0;
  for (const [ev, order] of Object.entries(season.intlResults) as Array<
    [InternationalId, string[]]
  >) {
    if (order[0] === team.id) {
      intl++;
      if (ev === "worlds") worlds++;
    }
  }
  return { split, intl, worlds, total: split + intl };
}

/** Live season accolade chips from trophies won so far. */
export function liveTitleHighlights(
  season: SeasonState,
  team: SeasonTeam,
): string[] {
  const splitTitles: Partial<Record<SplitId, boolean>> = {};
  for (const splitId of Object.keys(season.splitResults) as SplitId[]) {
    const order = season.splitResults[splitId]?.[team.leagueId];
    if (order?.[0] === team.id) splitTitles[splitId] = true;
  }
  const intlTitles: Partial<Record<InternationalId, boolean>> = {};
  for (const [ev, order] of Object.entries(season.intlResults) as Array<
    [InternationalId, string[]]
  >) {
    if (order[0] === team.id) intlTitles[ev] = true;
  }
  const worlds =
    season.intlResults.worlds?.[0] === team.id
      ? ("champion" as const)
      : season.intlResults.worlds?.[1] === team.id
        ? ("finalist" as const)
        : null;
  return teamTitleHighlights({ splitTitles, intlTitles, worlds });
}

export function teamCardFromSeasonTeam(
  team: SeasonTeam,
  opts: {
    academyCount: number;
    form?: number | null;
    standing?: string | null;
    highlights?: string[];
    titleCounts?: TeamCardTitleCounts | null;
    winRates?: TeamCardWinRates | null;
    h2h?: TeamCardH2H | null;
    scope: string;
    archived: boolean;
  },
): TeamCardData {
  const roster = rosterLinesFromPlayers(team.players);
  return {
    teamId: team.id,
    ...buildTeamCardIdentity(team.name, team.leagueId, {
      iconKey: team.iconKey,
      logoUrl: team.logoUrl,
      color: team.color,
    }),
    roster,
    academyCount: opts.academyCount,
    starRating: deriveStar(team.players),
    avgTier: averageTierFromRoster(team.players),
    ...(opts.standing != null ? { standing: opts.standing } : {}),
    ...(opts.form != null ? { form: opts.form } : {}),
    highlights: opts.highlights ?? [],
    // Always attach when provided — live resolver passes both so Series /
    // Titles sections can render whenever the season has data.
    titleCounts: opts.titleCounts ?? null,
    winRates: opts.winRates ?? null,
    ...(opts.h2h != null ? { h2h: opts.h2h } : {}),
    scope: opts.scope,
    archived: opts.archived,
  };
}
