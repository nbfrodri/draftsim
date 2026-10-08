import type { Champion, Player } from "../types";
import type { RNG } from "../players";
import { isRosterVacancy, inactiveMarketGrade, inactiveTransferValue } from "./faMarket";
import { applyMidSplitDemotions, buildSeasonOutcomes, buildSplitCheckpointOutcomes,
  fillRosterVacancies, resolveOffseasonPlayerMarket } from "./franchise";
import { seedAgencyWindow } from "./franchiseAgency";
import { GRADE_GAP_THRESHOLD, nextBadStreak, UNDERPERFORM_STREAK_TO_DEMOTE } from "./playerLifecycle";
import { applyTransfers, rebucketTransfersByStamp, transferValue } from "./transfers";
import { INTERNATIONAL_LABELS, QUALIFYING_SPLIT, SPLIT_LABELS,
  type InternationalId, type LeagueId, type SeasonState, type SplitId } from "./types";

export const OUTLOOK_SAMPLES = 160;
export type OutlookStatus = "main" | "academy" | "free-agent" | "retired";
export type OutlookOutcome = "stay" | "transfer" | "academy" | "main" | "free-agent" | "retired" | "unknown";
export const OUTLOOK_OUTCOMES: OutlookOutcome[] = ["stay", "transfer", "academy", "main", "free-agent", "retired", "unknown"];
export const OUTLOOK_LABELS: Record<OutlookOutcome, string> = {
  stay: "Stay", transfer: "Other team", academy: "To academy", main: "To main roster",
  "free-agent": "Become FA", retired: "Retire", unknown: "Unknown",
};
export interface OutlookWindow {
  kind: "split" | "transfer" | "offseason" | "none";
  label: string;
  opening: boolean;
  split?: SplitId;
  event?: InternationalId;
}
export interface OutlookSeat { status: OutlookStatus; teamId?: string }
export interface OutlookRow {
  id: string;
  player: Player;
  seat: OutlookSeat;
  region?: LeagueId;
  grade: number | null;
  roleMean: number | null;
  nextStreak: number | null;
  value: number;
  counts: Record<OutlookOutcome, number>;
  manualChoiceCount: number;
  destinations: Array<OutlookSeat & { count: number }>;
}
export interface RosterOutlook { window: OutlookWindow; samples: number; rows: OutlookRow[] }

/** A checkpoint is the next place where this save can actually move players. */
export function nextRosterWindow(season: SeasonState): OutlookWindow {
  const aging = !!season.franchise?.aging;
  const transfers = !!season.config.playerTransfers;
  if (!aging && !transfers) return { kind: "none", opening: false, label: "Automatic roster moves are disabled" };
  if (season.status === "complete") {
    return season.franchise
      ? { kind: "offseason", opening: false, label: "Current offseason · remaining decisions" }
      : { kind: "none", opening: false, label: "Season complete · no franchise offseason" };
  }
  for (let i = season.phaseIndex; i < season.phases.length; i++) {
    const phase = season.phases[i];
    if (phase.status === "complete") continue;
    if (aging && phase.kind === "split" && phase.split) {
      const deferred = transfers && season.config.controlledTeamId && phase.split !== "summer";
      if (!deferred) return { kind: "split", opening: true, split: phase.split, label: `After ${SPLIT_LABELS[phase.split]}` };
    }
    if (transfers && phase.kind === "transfer" && (phase.event === "first-stand" || phase.event === "msi")) {
      const opening = i !== season.phaseIndex || phase.status === "pending";
      const split = aging && season.config.controlledTeamId
        ? season.franchise?.pendingMidSplitDemotion ?? (opening ? QUALIFYING_SPLIT[phase.event] : undefined)
        : undefined;
      return { kind: "transfer", opening, event: phase.event, split,
        label: `Post ${INTERNATIONAL_LABELS[phase.event]}${opening ? "" : " · remaining decisions"}` };
    }
  }
  return season.franchise
    ? { kind: "offseason", opening: true, label: "End-of-year offseason" }
    : { kind: "none", opening: false, label: "No remaining automatic roster window" };
}

/** Private deterministic stream: inspecting a forecast cannot advance live RNG. */
function scenarioRng(seed: number): RNG {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function rosterSeats(season: Pick<SeasonState, "teams" | "franchise">) {
  const seats = new Map<string, OutlookSeat>();
  for (const team of season.teams) for (const player of team.players) {
    if (player.id && !isRosterVacancy(player)) seats.set(player.id, { status: "main", teamId: team.id });
  }
  for (const entry of season.franchise?.inactivePool ?? []) {
    if (!entry.player.id || seats.has(entry.player.id)) continue;
    seats.set(entry.player.id, { status: entry.status,
      ...(entry.status === "academy" ? { teamId: entry.lastTeamId } : {}) });
  }
  return seats;
}

export function classifyOutlook(before: OutlookSeat, after?: OutlookSeat): OutlookOutcome {
  if (!after) return "unknown";
  if (before.status === after.status && before.teamId === after.teamId) return "stay";
  if (after.status === "retired" || after.status === "free-agent") return after.status;
  if (before.teamId && after.teamId && before.teamId !== after.teamId) return "transfer";
  return after.status === "academy" ? "academy" : "main";
}

function manualPlayers(season: SeasonState) {
  const ids = new Set<string>();
  for (const demand of season.franchise?.agencyDemands ?? []) {
    if (demand.status === "pending" && demand.fromTeamId === season.config.controlledTeamId) ids.add(demand.playerId);
  }
  for (const proposal of season.proposedTransfers ?? []) {
    if (proposal.mine.id) ids.add(proposal.mine.id);
    if (proposal.theirs.id) ids.add(proposal.theirs.id);
  }
  return ids;
}

/** Freeze performance/meta, run only real roster rules. Never simulate games or
 * fabricate future titles, standings, patches, manual decisions or development. */
export function sampleRosterWindow(season: SeasonState, champions: readonly Champion[], window: OutlookWindow, rng: RNG) {
  let next = season;
  let manual = manualPlayers(next);
  if (window.kind === "split" && window.split) next = applyMidSplitDemotions(next, window.split, champions, rng);
  if (window.kind === "transfer") {
    if (window.opening) {
      const phaseIndex = next.phases.findIndex(p => p.kind === "transfer" && p.event === window.event);
      next = { ...next, phaseIndex: phaseIndex >= 0 ? phaseIndex : next.phaseIndex,
        proposedTransfers: [], franchise: next.franchise ? {
        ...next.franchise, agencyDemands: [], sameWindowDemoteIds: [], sameWindowRookieIds: [],
        faSignsThisWindow: 0, manualDemotesThisWindow: 0, pendingMidSplitDemotion: window.split,
      } : undefined };
      const intl = next.phases.find(p => p.kind === "international" && p.event === window.event);
      if (intl) next = applyTransfers(next, champions, intl);
      // The live engine seeds transfer agency only in a followed-team window.
      if (next.config.controlledTeamId) next = seedAgencyWindow(next, champions, rng, "transfer");
      manual = manualPlayers(next);
    }
    if (next.franchise?.aging) {
      next = fillRosterVacancies(next, champions, rng);
      if (window.split) next = applyMidSplitDemotions(next, window.split, champions, rng);
    }
  }
  if (window.kind === "offseason") {
    if (window.opening) {
      const moves = rebucketTransfersByStamp(next.transfersByEvent);
      next = { ...next, status: "complete", transfersByEvent: moves,
        worldsOffseasonBaseline: moves.worlds?.length ?? 0,
        offseasonRosterNewsBaseline: next.rosterNews?.length ?? 0,
        franchise: next.franchise ? { ...next.franchise, agencyDemands: [], sameWindowDemoteIds: [],
          sameWindowRookieIds: [], faSignsThisWindow: 0, manualDemotesThisWindow: 0 } : undefined };
      next = seedAgencyWindow(next, champions, rng, "offseason");
      manual = manualPlayers(next);
    }
    const result = resolveOffseasonPlayerMarket(next, champions, rng);
    next = { ...next, teams: result.evolvedTeams,
      franchise: next.franchise ? { ...next.franchise, inactivePool: result.nextInactivePool } : undefined };
  }
  return { season: next, manual };
}

export function buildRosterOutlook(season: SeasonState, champions: readonly Champion[], samples = OUTLOOK_SAMPLES): RosterOutlook {
  if (!Number.isInteger(samples) || samples < 1 || samples > 2000) throw new Error("Invalid forecast sample count");
  if (!champions.length) throw new Error("Champion data is not available yet");
  const window = nextRosterWindow(season);
  const seats = rosterSeats(season);
  const teams = new Map(season.teams.map(t => [t.id, t]));
  const byId = new Map(champions.map(c => [c.id, c]));
  const evaluation = window.split ? buildSplitCheckpointOutcomes(season, window.split) : buildSeasonOutcomes(season);
  const hasDemotionCheckpoint = window.kind === "split" || window.kind === "offseason" || !!window.split;
  const rows = new Map<string, OutlookRow>();
  const add = (player: Player, grade: number | null, value: number) => {
    if (!player.id || rows.has(player.id)) return;
    const seat = seats.get(player.id);
    if (!seat || seat.status === "retired") return;
    const outcome = evaluation.outcomes.get(player.id);
    const roleMean = seat.status === "main" ? evaluation.roleMeans[player.lane] ?? null : null;
    const region = seat.teamId ? teams.get(seat.teamId)?.leagueId : player.homeRegion;
    rows.set(player.id, { id: player.id, player, seat, region: region as LeagueId | undefined, grade, roleMean, value,
      nextStreak: hasDemotionCheckpoint && outcome && grade != null && roleMean != null && season.franchise?.aging
        ? nextBadStreak(player.badStreak, outcome, roleMean) : null,
      counts: { stay: 0, transfer: 0, academy: 0, main: 0, "free-agent": 0, retired: 0, unknown: 0 },
      manualChoiceCount: 0, destinations: [] });
  };
  for (const team of season.teams) for (const player of team.players) {
    if (isRosterVacancy(player)) continue;
    const grade = player.id ? evaluation.outcomes.get(player.id)?.grade ?? null : null;
    add(player, grade, transferValue(player, grade, byId, season.currentMeta));
  }
  for (const entry of season.franchise?.inactivePool ?? []) {
    add(entry.player, inactiveMarketGrade(entry), inactiveTransferValue(entry, byId, season.currentMeta));
  }
  // Each sample starts from the same state. Shared engine helpers return new
  // objects; the worker itself has a structured-cloned copy of the live save.
  for (let i = 0; i < samples; i++) {
    const result = sampleRosterWindow(season, champions, window, scenarioRng(0x524f5354 + i * 7919));
    const finalSeats = rosterSeats(result.season);
    for (const row of rows.values()) {
      const after = finalSeats.get(row.id);
      row.counts[classifyOutlook(row.seat, after)]++;
      if (result.manual.has(row.id)) row.manualChoiceCount++;
      if (after) {
        const existing = row.destinations.find(d => d.status === after.status && d.teamId === after.teamId);
        if (existing) existing.count++;
        else row.destinations.push({ ...after, count: 1 });
      }
    }
  }
  for (const row of rows.values()) row.destinations.sort((a, b) => b.count - a.count);
  return { window, samples, rows: [...rows.values()] };
}

export function outlookEvidence(row: OutlookRow): string[] {
  const evidence: string[] = [];
  if (row.grade == null) evidence.push("No recorded performance in this evaluation period.");
  else if (row.seat.status !== "main") evidence.push(`Market performance estimate: ${row.grade.toFixed(2)} (inactive development and last recorded grade).`);
  else evidence.push(`Recorded average: ${row.grade.toFixed(2)}.`);
  if (row.roleMean != null && row.grade != null) {
    evidence.push(`Same-role mean: ${row.roleMean.toFixed(2)}. Gap: ${(row.roleMean - row.grade).toFixed(2)}; underperformance threshold: ${GRADE_GAP_THRESHOLD.toFixed(2)}.`);
  }
  if (row.nextStreak != null) evidence.push(`Underperformance streak: ${row.player.badStreak ?? 0} → ${row.nextStreak}/${UNDERPERFORM_STREAK_TO_DEMOTE} checkpoints, before any year-end tier change.`);
  evidence.push(`Value using this performance period: ${row.value.toFixed(2)}. Outcomes also depend on available replacements, academy space, player preferences and window caps.`);
  return evidence;
}
