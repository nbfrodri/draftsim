import type { DraftAction } from "./types";

// Standard LoL tournament draft order (used by LCS/LEC/LCK/LPL/Worlds).
// 20 actions total: 6 bans → 6 picks → 4 bans → 4 picks.
// Phase 1 bans alternate starting with blue.
// Phase 1 picks: B-R-R-B-B-R (snake).
// Phase 2 bans alternate starting with red.
// Phase 2 picks: R-B-B-R.
export const DRAFT_ORDER: DraftAction[] = [
  { index: 0,  kind: "ban",  side: "blue", slot: 0 },
  { index: 1,  kind: "ban",  side: "red",  slot: 0 },
  { index: 2,  kind: "ban",  side: "blue", slot: 1 },
  { index: 3,  kind: "ban",  side: "red",  slot: 1 },
  { index: 4,  kind: "ban",  side: "blue", slot: 2 },
  { index: 5,  kind: "ban",  side: "red",  slot: 2 },

  { index: 6,  kind: "pick", side: "blue", slot: 0 },
  { index: 7,  kind: "pick", side: "red",  slot: 0 },
  { index: 8,  kind: "pick", side: "red",  slot: 1 },
  { index: 9,  kind: "pick", side: "blue", slot: 1 },
  { index: 10, kind: "pick", side: "blue", slot: 2 },
  { index: 11, kind: "pick", side: "red",  slot: 2 },

  { index: 12, kind: "ban",  side: "red",  slot: 3 },
  { index: 13, kind: "ban",  side: "blue", slot: 3 },
  { index: 14, kind: "ban",  side: "red",  slot: 4 },
  { index: 15, kind: "ban",  side: "blue", slot: 4 },

  { index: 16, kind: "pick", side: "red",  slot: 3 },
  { index: 17, kind: "pick", side: "blue", slot: 3 },
  { index: 18, kind: "pick", side: "blue", slot: 4 },
  { index: 19, kind: "pick", side: "red",  slot: 4 },
];

export const TOTAL_ACTIONS = DRAFT_ORDER.length;

export function phaseLabel(actionIndex: number): string {
  if (actionIndex < 6) return "Ban Phase 1";
  if (actionIndex < 12) return "Pick Phase 1";
  if (actionIndex < 16) return "Ban Phase 2";
  if (actionIndex < 20) return "Pick Phase 2";
  return "Complete";
}
