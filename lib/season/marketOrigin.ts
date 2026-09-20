import type { SeasonState } from "./types";
/** Immutable ownership captured when a market event is created. */
export interface MarketOrigin {
  seasonId: string;
  year: number;
  windowId: string;
}
export type MarketSeason = Pick<SeasonState, "id" | "franchise">;
export function marketOrigin(season: MarketSeason, window: string): MarketOrigin {
  const label = window === "worlds" ? "Offseason" : window === "first-stand" ? "First Stand window" : window === "msi" ? "MSI window" : window;
  return { seasonId: season.id, year: season.franchise?.year ?? 1, windowId: `${season.id}:${label}` };
}
export function belongsToMarketWindow(origin: MarketOrigin, season: MarketSeason, window: string): boolean {
  const expected = marketOrigin(season, window);
  return origin.seasonId === expected.seasonId && origin.year === expected.year && origin.windowId === expected.windowId;
}
export function validMarketOrigin(value: unknown): value is MarketOrigin {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.seasonId === "string" && v.seasonId.length > 0 && v.seasonId.length <= 256
    && Number.isSafeInteger(v.year) && (v.year as number) >= 1
    && typeof v.windowId === "string" && v.windowId.startsWith(`${v.seasonId}:`) && v.windowId.length > v.seasonId.length + 1 && v.windowId.length <= 512;
}
