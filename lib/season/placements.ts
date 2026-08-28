// Derive split placements and international outcomes from archived season
// résumés (full placement arrays when present, champions/runners-up fallback).

import type { SeasonHistoryEntry, SeasonHistoryTeamRef } from "./history";
import { teamRecordKey } from "./historyRecords";
import {
  INTERNATIONAL_DISPLAY_ORDER,
  LEAGUE_IDS,
  type InternationalId,
  type LeagueId,
  type SplitId,
} from "./types";

export const SPLIT_IDS: readonly SplitId[] = ["winter", "spring", "summer"];

/** Finals reached per split × region (e.g. LCK Winter: 2). */
export type SplitFinalsReachedMap = Partial<
  Record<SplitId, Partial<Record<LeagueId, number>>>
>;

export type IntlOutcomeKind =
  | "champion"
  | "finalist"
  | "playoffs-exit"
  | "playins-exit"
  | "did-not-qualify";

export interface IntlOutcome {
  kind: IntlOutcomeKind;
  /** 1-based finish when known; null for did-not-qualify or unknown legacy. */
  placement: number | null;
}

function teamMatches(
  ref: SeasonHistoryTeamRef,
  team: { name: string; leagueId: LeagueId },
): boolean {
  return ref.name === team.name && ref.leagueId === team.leagueId;
}

function indexInPlacements(
  placements: SeasonHistoryTeamRef[] | undefined,
  team: { name: string; leagueId: LeagueId },
): number {
  if (!placements?.length) return -1;
  return placements.findIndex((r) => teamMatches(r, team));
}

function intlEventRan(
  entry: SeasonHistoryEntry,
  event: InternationalId,
): boolean {
  return (
    (entry.intlPlacements?.[event]?.length ?? 0) > 0 ||
    entry.intlChampions[event] != null ||
    entry.intlRunnersUp?.[event] != null ||
    (event === "worlds" && (entry.champion != null || entry.runnerUp != null))
  );
}

function teamInIntlPhaseRoster(
  entry: SeasonHistoryEntry,
  team: { name: string; leagueId: LeagueId },
  event: InternationalId,
): boolean {
  const phase = entry.phaseRosters?.find(
    (p) => p.kind === "international" && p.event === event,
  );
  return (
    phase?.teams.some(
      (t) => t.teamName === team.name && t.leagueId === team.leagueId,
    ) ?? false
  );
}

/** Teams in the main bracket for an international event. */
export function intlMainBracketSize(
  entry: SeasonHistoryEntry,
  event: InternationalId,
): number | null {
  const stored = entry.intlMainBracketSizes?.[event];
  if (stored != null && stored > 0) return stored;

  const full = entry.intlPlacements?.[event];
  if (!full?.length) return null;

  const phase = entry.phaseRosters?.find(
    (p) => p.kind === "international" && p.event === event,
  );
  if (phase?.teams.length) {
    const phaseKeys = new Set(
      phase.teams.map((t) => `${t.leagueId}:${t.teamName}`),
    );
    const placedFromPhase = full.filter((t) =>
      phaseKeys.has(`${t.leagueId}:${t.name}`),
    ).length;
    // Main-bracket-only snapshot: every snapshotted org placed in the main
    // section (play-in exits trail the snapshot in intlPlacements).
    if (
      placedFromPhase === phase.teams.length &&
      phase.teams.length <= full.length
    ) {
      return phase.teams.length;
    }
  }

  // Play-in disabled or no reliable main-bracket snapshot — every entrant
  // finished in the main event.
  return full.length;
}

/** 1-based domestic split finish, or null when unplaced / unknown. */
export function teamSplitPlacement(
  entry: SeasonHistoryEntry,
  team: { name: string; leagueId: LeagueId },
  split: SplitId,
): number | null {
  const full = entry.splitPlacements?.[split]?.[team.leagueId];
  const idx = indexInPlacements(full, team);
  if (idx >= 0) return idx + 1;
  if (entry.splitChampions[split]?.[team.leagueId]?.name === team.name) return 1;
  if (entry.splitRunnersUp?.[split]?.[team.leagueId]?.name === team.name) return 2;
  return null;
}

/** 1-based international finish, or null when the team did not place. */
export function teamIntlPlacement(
  entry: SeasonHistoryEntry,
  team: { name: string; leagueId: LeagueId },
  event: InternationalId,
): number | null {
  const full = entry.intlPlacements?.[event];
  const idx = indexInPlacements(full, team);
  if (idx >= 0) return idx + 1;
  const champ = entry.intlChampions[event];
  if (champ && teamMatches(champ, team)) return 1;
  const ru = entry.intlRunnersUp?.[event];
  if (ru && teamMatches(ru, team)) return 2;
  if (event === "worlds") {
    if (entry.champion && teamMatches(entry.champion, team)) return 1;
    if (entry.runnerUp && teamMatches(entry.runnerUp, team)) return 2;
  }
  return null;
}

/** Whether a franchise entered an international (main bracket or play-in). */
export function teamParticipatedIntl(
  entry: SeasonHistoryEntry,
  team: { name: string; leagueId: LeagueId },
  event: InternationalId,
): boolean {
  if (teamIntlPlacement(entry, team, event) != null) return true;

  const placements = entry.intlPlacements?.[event];
  if (placements?.length) {
    // Full entrant roll — phase rosters snapshot every org for career view.
    return false;
  }

  // Legacy archives without intlPlacements[] — infer from phase snapshot.
  if (!intlEventRan(entry, event)) return false;
  return teamInIntlPhaseRoster(entry, team, event);
}

/** Classify an international result for one team in one archived season. */
export function teamIntlOutcome(
  entry: SeasonHistoryEntry,
  team: { name: string; leagueId: LeagueId },
  event: InternationalId,
): IntlOutcome {
  const placement = teamIntlPlacement(entry, team, event);
  if (placement == null) {
    if (!teamParticipatedIntl(entry, team, event)) {
      return { kind: "did-not-qualify", placement: null };
    }
    return { kind: "playoffs-exit", placement: null };
  }
  if (placement === 1) return { kind: "champion", placement: 1 };
  if (placement === 2) return { kind: "finalist", placement: 2 };
  const mainSize = intlMainBracketSize(entry, event);
  if (mainSize != null && placement > mainSize) {
    return { kind: "playins-exit", placement };
  }
  return { kind: "playoffs-exit", placement };
}

/** Short label for UI chips (e.g. "#3", "Final · #2", "DNQ"). */
export function splitPlacementLabel(placement: number): string {
  return `#${placement}`;
}

export function intlOutcomeLabel(outcome: IntlOutcome): string {
  switch (outcome.kind) {
    case "champion":
      return outcome.placement ? `#${outcome.placement}` : "Champion";
    case "finalist":
      return "Final · #2";
    case "playoffs-exit":
      return outcome.placement
        ? `#${outcome.placement}`
        : "Eliminated · Playoffs";
    case "playins-exit":
      return outcome.placement ? `#${outcome.placement}` : "Eliminated · Play-In";
    case "did-not-qualify":
      return "Didn't qualify";
  }
}

/** True when a team reached the international final (#1 or #2). */
export function reachedIntlFinal(placement: number | null): boolean {
  return placement != null && placement <= 2;
}

/** True when a team reached the domestic split final (#1 or #2). */
export function reachedSplitFinal(placement: number | null): boolean {
  return placement != null && placement <= 2;
}

export function bumpSplitFinalsReached(
  map: SplitFinalsReachedMap,
  split: SplitId,
  leagueId: LeagueId,
): void {
  const byLeague = map[split] ?? {};
  byLeague[leagueId] = (byLeague[leagueId] ?? 0) + 1;
  map[split] = byLeague;
}

/** Display order: region power ranking, then winter → spring → summer. */
export function splitFinalsReachedEntries(
  map: SplitFinalsReachedMap,
): Array<{ split: SplitId; leagueId: LeagueId; count: number }> {
  const out: Array<{ split: SplitId; leagueId: LeagueId; count: number }> = [];
  for (const split of SPLIT_IDS) {
    const byLeague = map[split];
    if (!byLeague) continue;
    for (const leagueId of LEAGUE_IDS) {
      const count = byLeague[leagueId];
      if (count != null && count > 0) out.push({ split, leagueId, count });
    }
  }
  return out;
}

/** Count finals reached (#1 or #2) per international event for one franchise. */
export function intlFinalsReachedForTeam(
  entries: SeasonHistoryEntry[],
  teamKey: string,
): Partial<Record<InternationalId, number>> {
  const out: Partial<Record<InternationalId, number>> = {};
  for (const e of entries) {
    const parsed = parseFranchiseKey(teamKey);
    if (!parsed) continue;
    const team = { name: parsed.name, leagueId: parsed.leagueId };
    for (const event of INTERNATIONAL_DISPLAY_ORDER) {
      const placement = teamIntlPlacement(e, team, event);
      if (!reachedIntlFinal(placement)) continue;
      out[event] = (out[event] ?? 0) + 1;
    }
  }
  return out;
}

/** Count split finals reached per split × region for one franchise. */
export function splitFinalsReachedForTeam(
  entries: SeasonHistoryEntry[],
  teamKey: string,
): SplitFinalsReachedMap {
  const out: SplitFinalsReachedMap = {};
  const parsed = parseFranchiseKey(teamKey);
  if (!parsed) return out;
  const team = { name: parsed.name, leagueId: parsed.leagueId };
  for (const e of entries) {
    for (const split of SPLIT_IDS) {
      const placement = teamSplitPlacement(e, team, split);
      if (!reachedSplitFinal(placement)) continue;
      bumpSplitFinalsReached(out, split, team.leagueId);
    }
  }
  return out;
}

function parseFranchiseKey(
  key: string,
): { leagueId: LeagueId; name: string } | null {
  const i = key.indexOf(":");
  if (i < 0) return null;
  return { leagueId: key.slice(0, i) as LeagueId, name: key.slice(i + 1) };
}

/** Same key convention as historyRecords (`leagueId:name`). */
export function franchiseKeyForRef(ref: SeasonHistoryTeamRef): string {
  return teamRecordKey(ref);
}
