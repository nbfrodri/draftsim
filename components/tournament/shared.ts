// Shared types, constants, and small components used across the
// tournament module (bracket, replay, recap).

import type { AIDifficulty, DraftMode, SeriesFormat, Side } from "@/lib/types";
import type { TournamentState } from "@/lib/tournament";

// ─── Per-match override state ─────────────────────────────────────────
// When a user clicks "Start Match" on a pending match we open an inline
// override modal that lets them change the format/mode/fearless/aiSide
// for THIS match only (the match record's settings, not the tournament
// defaults). Confirm starts the match with the overrides applied.
export interface MatchOverride {
  format: SeriesFormat;
  fearless: boolean;
  mode: DraftMode;
  aiSide: Side | null;
  aiDifficulty: AIDifficulty;
}

// Header label per tournament format. Keep in sync with the option list
// in TournamentSetup so the dashboard echoes the same wording the user
// picked. New stage+playoff variants get explicit two-word labels so
// the format is unambiguous at a glance.
export function formatHeaderLabel(format: TournamentState["format"]): string {
  switch (format) {
    case "single-elim":
      return "Single Elimination";
    case "double-elim":
      return "Double Elimination";
    case "round-robin":
      return "Round Robin";
    case "swiss":
      return "Swiss";
    case "swiss-playoffs":
      return "Swiss + Playoffs";
    case "swiss-playoffs-de":
      return "Swiss + DE Playoffs";
    case "groups-playoffs":
      return "Groups + Playoffs";
    case "groups-playoffs-de":
      return "Groups + DE Playoffs";
    case "round-robin-playoffs":
      return "Round Robin + DE Playoffs";
    default:
      return "Tournament";
  }
}
