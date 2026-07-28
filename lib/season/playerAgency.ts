// Player agency — high-tier / high-value players soft-prefer stronger orgs
// and starting roles at transfer windows + offseason only. Preferences are
// ranked; the best offer wins, with optional hard target when the gap is
// large. Prospects can demand a call-up or leave their academy. The followed
// team always has priority (override), but AI still competes so the market
// is not user-OP. Soft scoring + caps keep windows from melting every roster.

import type { Champion, Lane, Player, PlayerTier } from "../types";
import { PLAYER_TIER_VALUE, deriveStar, type RNG } from "../players";
import { transferValue } from "./transfers";
import {
  ACADEMY_OPEN_REPLACE_GAP,
  inactiveTransferValue,
  isRosterVacancy,
  type MarketInactive,
  type MarketNote,
} from "./faMarket";
import type { SeasonMetaSnapshot } from "./types";

// ── Thresholds / knobs (ponytail: tune here) ────────────────────────────────

/** Tier floor for agency — A / S / S+ only (PLAYER_TIER_VALUE ≥ 1). */
export const AGENCY_MIN_TIER_VALUE = 1;
/**
 * Transfer-value floor alongside tier. Typical A with cold form (~0.6) sits
 * below; solid A / hot B+ (if somehow tier-eligible) clears it.
 */
export const AGENCY_MIN_VALUE = 0.85;
/**
 * Preference gap (best dest − current seat) required to demand a leave.
 * ~one soft role-step; avoids lateral noise.
 */
export const AGENCY_LEAVE_GAP = 0.9;
/**
 * Stronger gap → lock a specific target team instead of open ranking.
 */
export const AGENCY_TARGET_TEAM_GAP = 1.35;
/** Soft refuse: destination must not trail current seat by more than this. */
export const AGENCY_ACCEPT_TOLERANCE = 0.45;
/** Per-player chance an eligible leave/call-up demand fires this window. */
export const AGENCY_LEAVE_CHANCE = 0.28;
export const AGENCY_CALLUP_CHANCE = 0.38;
export const AGENCY_DEPART_ACADEMY_CHANCE = 0.22;
/** Soft cap — avoid roster meltdown. */
export const AGENCY_MAX_LEAVES_PER_TEAM = 1;
export const AGENCY_MAX_LEAVES_TRANSFER = 8;
export const AGENCY_MAX_LEAVES_OFFSEASON = 14;
/** Max pending call-up / academy-depart demands league-wide per window. */
export const AGENCY_MAX_PROSPECT_DEMANDS = 10;

/** Destination role attractiveness (starter >> academy stash). */
export const AGENCY_W_ORG = 0.55; // × (deriveStar − 3)
export const AGENCY_W_ROLE_STARTER = 1.15;
export const AGENCY_W_ROLE_ACADEMY = -0.55;
export const AGENCY_W_REGION = 0.28;
/** Bonus when destination has a vacant starter slot in the player's lane. */
export const AGENCY_W_VACANCY = 0.7;
/** Soft penalty for sitting on a weak org's academy with no call-up path. */
export const AGENCY_W_STUCK_ACADEMY = -0.35;

export type AgencyDemandKind = "leave" | "call-up" | "depart-academy";
export type AgencyWantRole = "starter" | "academy" | "fa";
export type AgencyDemandStatus =
  | "pending"
  | "honored"
  | "overridden"
  | "expired";

export interface AgencyPref {
  teamId: string;
  teamName?: string;
  role: "starter" | "academy";
  score: number;
}

export interface AgencyDemand {
  id: string;
  playerId: string;
  playerName?: string;
  playerTier: PlayerTier;
  lane: Lane;
  kind: AgencyDemandKind;
  fromTeamId: string;
  fromTeamName?: string;
  /** Preferred destination — omit / undefined for open FA. */
  wantTeamId?: string;
  wantTeamName?: string;
  wantRole: AgencyWantRole;
  preferenceGap: number;
  rankedPrefs?: AgencyPref[];
  status: AgencyDemandStatus;
}

export type AgencyMarketNote = Extract<
  MarketNote,
  | "agency-leave"
  | "agency-callup"
  | "agency-depart"
  | "agency-override"
  | "agency-sign"
>;

export interface AgencyTeamInput {
  id: string;
  name: string;
  players: readonly Player[];
  leagueId?: string;
}

export interface AgencyEvalContext {
  teams: readonly AgencyTeamInput[];
  pool: readonly MarketInactive[];
  byId: Map<number, Champion>;
  meta: SeasonMetaSnapshot;
  /** Followed team — always wins ties / can override. */
  controlledTeamId?: string | null;
  gradeOf?: (playerId: string) => number | null;
}

/** True when player clears tier + value agency gates. */
export function hasPlayerAgency(
  player: Player,
  value: number,
): boolean {
  if (PLAYER_TIER_VALUE[player.tier] < AGENCY_MIN_TIER_VALUE) return false;
  return value >= AGENCY_MIN_VALUE;
}

/** Org strength signal in preference units (centered on average 3★ roster). */
export function orgStrengthScore(players: readonly Player[]): number {
  return AGENCY_W_ORG * (deriveStar([...players]) - 3);
}

export function regionFitBonus(
  player: Player,
  teamLeagueId: string | undefined,
): number {
  if (!player.homeRegion || !teamLeagueId) return 0;
  return player.homeRegion === teamLeagueId ? AGENCY_W_REGION : 0;
}

/**
 * Soft attractiveness of sitting on `team` in `role` for `player`.
 * Higher = more desirable. Does not include "vs current" gap.
 */
export function destinationScore(
  player: Player,
  team: AgencyTeamInput,
  role: "starter" | "academy",
): number {
  let s = orgStrengthScore(team.players);
  s += role === "starter" ? AGENCY_W_ROLE_STARTER : AGENCY_W_ROLE_ACADEMY;
  s += regionFitBonus(player, team.leagueId);
  if (role === "starter") {
    const slot = team.players.find((p) => p.lane === player.lane);
    if (slot && isRosterVacancy(slot)) s += AGENCY_W_VACANCY;
  }
  return s;
}

/** Current seat score for a main-roster player. */
export function currentStarterSeatScore(
  player: Player,
  team: AgencyTeamInput,
): number {
  return destinationScore(player, team, "starter");
}

/** Current seat score for an academy prospect. */
export function currentAcademySeatScore(
  player: Player,
  team: AgencyTeamInput,
): number {
  return destinationScore(player, team, "academy") + AGENCY_W_STUCK_ACADEMY;
}

/**
 * Rank starter (and optional academy) destinations for a player.
 * Excludes `excludeTeamId` (usually current org) from starter bids unless
 * `includeHome` — used for call-up scoring of the home org.
 */
export function rankDestinations(
  player: Player,
  teams: readonly AgencyTeamInput[],
  opts?: {
    excludeTeamId?: string;
    includeAcademy?: boolean;
    includeHome?: boolean;
    limit?: number;
  },
): AgencyPref[] {
  const prefs: AgencyPref[] = [];
  const limit = opts?.limit ?? 5;
  for (const team of teams) {
    if (
      opts?.excludeTeamId &&
      team.id === opts.excludeTeamId &&
      !opts.includeHome
    ) {
      continue;
    }
    prefs.push({
      teamId: team.id,
      teamName: team.name,
      role: "starter",
      score: destinationScore(player, team, "starter"),
    });
    if (opts?.includeAcademy) {
      prefs.push({
        teamId: team.id,
        teamName: team.name,
        role: "academy",
        score: destinationScore(player, team, "academy"),
      });
    }
  }
  prefs.sort((a, b) => b.score - a.score);
  return prefs.slice(0, limit);
}

/**
 * Would an agency player accept this destination?
 * Non-agency always accepts. Followed-team offers always accept (user priority).
 * Soft: accept if offer ≥ current − tolerance, or if offer beats alternatives
 * enough that refusing would be spiteful.
 */
export function wouldAcceptDestination(
  player: Player,
  value: number,
  currentScore: number,
  offerScore: number,
  toTeamId: string,
  controlledTeamId?: string | null,
  forceOverride = false,
): boolean {
  if (forceOverride) return true;
  if (!hasPlayerAgency(player, value)) return true;
  if (controlledTeamId && toTeamId === controlledTeamId) return true;
  return offerScore >= currentScore - AGENCY_ACCEPT_TOLERANCE;
}

/** FA / open-market: agency player prefers stronger of two bidding teams. */
export function preferOffer(
  player: Player,
  value: number,
  a: { teamId: string; score: number },
  b: { teamId: string; score: number },
  controlledTeamId?: string | null,
): "a" | "b" {
  if (controlledTeamId) {
    if (a.teamId === controlledTeamId && b.teamId !== controlledTeamId) return "a";
    if (b.teamId === controlledTeamId && a.teamId !== controlledTeamId) return "b";
  }
  if (!hasPlayerAgency(player, value)) {
    return a.score >= b.score ? "a" : "b";
  }
  return a.score >= b.score ? "a" : "b";
}

function makeDemandId(playerId: string, kind: AgencyDemandKind): string {
  return `${playerId}:${kind}`;
}

export interface GenerateAgencyDemandsOpts {
  /** Transfer window vs offseason volume caps. */
  window: "transfer" | "offseason";
  controlledTeamId?: string | null;
  gradeOf?: (playerId: string) => number | null;
}

/**
 * Scan main rosters + academies for agency demands this shopping window.
 * Does not mutate teams — pure demand list. Caps keep chaos down.
 */
export function generateAgencyDemands(
  teams: readonly AgencyTeamInput[],
  pool: readonly MarketInactive[],
  byId: Map<number, Champion>,
  meta: SeasonMetaSnapshot,
  rng: RNG,
  opts: GenerateAgencyDemandsOpts,
): AgencyDemand[] {
  const demands: AgencyDemand[] = [];
  const leavesByTeam = new Map<string, number>();
  const maxLeaves =
    opts.window === "offseason"
      ? AGENCY_MAX_LEAVES_OFFSEASON
      : AGENCY_MAX_LEAVES_TRANSFER;
  let leaveCount = 0;
  let prospectCount = 0;
  const teamById = new Map(teams.map((t) => [t.id, t]));

  // ── Main-roster leave demands ──────────────────────────────────────────
  const rosterCandidates: Array<{
    team: AgencyTeamInput;
    player: Player;
    value: number;
    current: number;
    prefs: AgencyPref[];
    gap: number;
  }> = [];

  for (const team of teams) {
    for (const player of team.players) {
      if (!player.id || isRosterVacancy(player)) continue;
      const grade = opts.gradeOf?.(player.id) ?? null;
      const value = transferValue(player, grade, byId, meta);
      if (!hasPlayerAgency(player, value)) continue;
      const current = currentStarterSeatScore(player, team);
      const prefs = rankDestinations(player, teams, {
        excludeTeamId: team.id,
        includeAcademy: false,
        limit: 4,
      });
      const best = prefs[0];
      if (!best) continue;
      const gap = best.score - current;
      if (gap < AGENCY_LEAVE_GAP) continue;
      rosterCandidates.push({ team, player, value, current, prefs, gap });
    }
  }

  rosterCandidates.sort((a, b) => b.gap - a.gap || b.value - a.value);
  for (const c of rosterCandidates) {
    if (leaveCount >= maxLeaves) break;
    const used = leavesByTeam.get(c.team.id) ?? 0;
    if (used >= AGENCY_MAX_LEAVES_PER_TEAM) continue;
    if (rng() > AGENCY_LEAVE_CHANCE) continue;

    const best = c.prefs[0]!;
    const target =
      c.gap >= AGENCY_TARGET_TEAM_GAP
        ? best
        : undefined;
    const wantRole: AgencyWantRole = target ? target.role : "fa";
    demands.push({
      id: makeDemandId(c.player.id!, "leave"),
      playerId: c.player.id!,
      ...(c.player.name ? { playerName: c.player.name } : {}),
      playerTier: c.player.tier,
      lane: c.player.lane,
      kind: "leave",
      fromTeamId: c.team.id,
      fromTeamName: c.team.name,
      ...(target
        ? { wantTeamId: target.teamId, wantTeamName: target.teamName }
        : {}),
      wantRole,
      preferenceGap: c.gap,
      rankedPrefs: c.prefs.slice(0, 3),
      status: "pending",
    });
    leavesByTeam.set(c.team.id, used + 1);
    leaveCount++;
  }

  // ── Academy call-up / depart ───────────────────────────────────────────
  const prospectCandidates: Array<{
    entry: MarketInactive;
    team: AgencyTeamInput;
    value: number;
    kind: "call-up" | "depart-academy";
    prefs: AgencyPref[];
    gap: number;
  }> = [];

  for (const entry of pool) {
    if (entry.status !== "academy" || !entry.player.id) continue;
    const team = teamById.get(entry.lastTeamId);
    if (!team) continue;
    const value = inactiveTransferValue(entry, byId, meta);
    if (!hasPlayerAgency(entry.player, value)) continue;

    const incumbent = team.players.find((p) => p.lane === entry.player.lane);
    const canCallUp =
      !!incumbent &&
      (isRosterVacancy(incumbent) ||
        inactiveTransferValue(entry, byId, meta) -
          transferValue(
            incumbent,
            incumbent.id ? (opts.gradeOf?.(incumbent.id) ?? null) : null,
            byId,
            meta,
          ) >=
          ACADEMY_OPEN_REPLACE_GAP);

    if (canCallUp) {
      const homeStarter = destinationScore(entry.player, team, "starter");
      const current = currentAcademySeatScore(entry.player, team);
      const gap = homeStarter - current;
      if (gap >= AGENCY_LEAVE_GAP * 0.55) {
        prospectCandidates.push({
          entry,
          team,
          value,
          kind: "call-up",
          prefs: [
            {
              teamId: team.id,
              teamName: team.name,
              role: "starter",
              score: homeStarter,
            },
          ],
          gap,
        });
      }
    }

    // Depart: stronger org (starter or academy) beats staying put.
    const current = currentAcademySeatScore(entry.player, team);
    const prefs = rankDestinations(entry.player, teams, {
      excludeTeamId: team.id,
      includeAcademy: true,
      limit: 4,
    });
    const best = prefs[0];
    if (best && best.score - current >= AGENCY_LEAVE_GAP) {
      prospectCandidates.push({
        entry,
        team,
        value,
        kind: "depart-academy",
        prefs,
        gap: best.score - current,
      });
    }
  }

  prospectCandidates.sort((a, b) => b.gap - a.gap || b.value - a.value);
  const seenProspect = new Set<string>();
  for (const c of prospectCandidates) {
    if (prospectCount >= AGENCY_MAX_PROSPECT_DEMANDS) break;
    const pid = c.entry.player.id!;
    if (seenProspect.has(pid)) continue;
    const chance =
      c.kind === "call-up" ? AGENCY_CALLUP_CHANCE : AGENCY_DEPART_ACADEMY_CHANCE;
    if (rng() > chance) continue;
    seenProspect.add(pid);

    const best = c.prefs[0]!;
    const target =
      c.kind === "call-up" || c.gap >= AGENCY_TARGET_TEAM_GAP ? best : undefined;
    const wantRole: AgencyWantRole =
      c.kind === "call-up"
        ? "starter"
        : target
          ? target.role
          : "fa";

    demands.push({
      id: makeDemandId(pid, c.kind),
      playerId: pid,
      ...(c.entry.player.name ? { playerName: c.entry.player.name } : {}),
      playerTier: c.entry.player.tier,
      lane: c.entry.player.lane,
      kind: c.kind,
      fromTeamId: c.team.id,
      fromTeamName: c.team.name,
      ...(target
        ? { wantTeamId: target.teamId, wantTeamName: target.teamName }
        : {}),
      wantRole,
      preferenceGap: c.gap,
      rankedPrefs: c.prefs.slice(0, 3),
      status: "pending",
    });
    prospectCount++;
  }

  return demands;
}

/** Pending demands that involve the followed team (from or want). */
export function userFacingAgencyDemands(
  demands: readonly AgencyDemand[] | undefined,
  controlledTeamId: string | null | undefined,
): AgencyDemand[] {
  if (!demands?.length || !controlledTeamId) return [];
  return demands.filter(
    (d) =>
      d.status === "pending" &&
      (d.fromTeamId === controlledTeamId || d.wantTeamId === controlledTeamId),
  );
}

/** Short UI line: "Player wants T1 starter" / "demands call-up" / … */
export function formatAgencyWants(demand: AgencyDemand): string {
  const name = demand.playerName ?? "Player";
  if (demand.kind === "call-up") {
    return `${name} wants a starting role`;
  }
  if (demand.kind === "depart-academy") {
    if (demand.wantTeamName) {
      return `${name} wants ${demand.wantTeamName} (${demand.wantRole})`;
    }
    return `${name} wants out of academy`;
  }
  // leave
  if (demand.wantTeamName) {
    return `${name} wants ${demand.wantTeamName}`;
  }
  if (demand.rankedPrefs?.[0]?.teamName) {
    return `${name} wants ${demand.rankedPrefs[0].teamName}`;
  }
  return `${name} wants a better situation`;
}

/**
 * Soft org preference weight for FA auction bids.
 * Agency FAs add destination attractiveness so stronger orgs win ties.
 * Non-agency → 0. User team gets a small priority bump on top.
 */
export function agencyFaBidBoost(
  player: Player,
  value: number,
  team: AgencyTeamInput,
  controlledTeamId?: string | null,
): number {
  if (!hasPlayerAgency(player, value)) {
    return controlledTeamId && team.id === controlledTeamId ? 0.15 : 0;
  }
  let boost = destinationScore(player, team, "starter") * 0.35;
  if (controlledTeamId && team.id === controlledTeamId) boost += 0.55;
  return boost;
}

/** Mark a demand overridden (user keeps the player). */
export function overrideDemand(
  demands: readonly AgencyDemand[],
  demandId: string,
): AgencyDemand[] {
  return demands.map((d) =>
    d.id === demandId && d.status === "pending"
      ? { ...d, status: "overridden" as const }
      : d,
  );
}

/** Mark a demand honored after the move applied. */
export function honorDemand(
  demands: readonly AgencyDemand[],
  demandId: string,
): AgencyDemand[] {
  return demands.map((d) =>
    d.id === demandId && d.status === "pending"
      ? { ...d, status: "honored" as const }
      : d,
  );
}

/** Expire all still-pending demands (window closed). */
export function expirePendingDemands(
  demands: readonly AgencyDemand[],
): AgencyDemand[] {
  return demands.map((d) =>
    d.status === "pending" ? { ...d, status: "expired" as const } : d,
  );
}
