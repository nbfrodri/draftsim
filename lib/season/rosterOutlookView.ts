import type { Player } from "../types";
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
  summary: string;
  evidence: Array<{ label: string; text: string }>;
}
export interface RosterOutlook { window: OutlookWindow; samples: number; rows: OutlookRow[] }
export interface OutlookProgress { completed: number; total: number }

export function isOutlookRookie(player: Pick<Player, "debutYear">, year?: number) {
  return year != null && player.debutYear === year;
}

export function outlookPercent(count: number, samples: number) {
  if (count === 0 || samples === 0) return "0%";
  if (count === samples) return "100%";
  const rounded = Math.round(100 * count / samples);
  return rounded === 0 ? "<1%" : rounded === 100 ? ">99%" : `${rounded}%`;
}

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
