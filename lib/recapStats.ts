import type { GameRecap, Side } from "./types";

/** Sum team kills from a recap — prefers stored totals, falls back to perPickKDA. */
export function teamKillsFromRecap(recap: GameRecap, side: Side): number | null {
  if (side === "blue" && recap.blueKills != null) return recap.blueKills;
  if (side === "red" && recap.redKills != null) return recap.redKills;
  const kda = recap.perPickKDA?.[side];
  if (!kda?.length) return null;
  return kda.reduce((sum, row) => sum + row.k, 0);
}

/** Both teams' kill totals when any data exists. */
export function gameKillTotals(recap: GameRecap): {
  blue: number;
  red: number;
} | null {
  const blue = teamKillsFromRecap(recap, "blue");
  const red = teamKillsFromRecap(recap, "red");
  if (blue == null || red == null) return null;
  return { blue, red };
}
