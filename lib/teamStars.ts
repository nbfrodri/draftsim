/** Shared team-strength scale. Player tiers and coach ratings are separate scales. */
export function normalizeTeamStars(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 3;
  return Math.max(1, Math.min(5, Math.round(value * 2) / 2));
}
