import type { InternationalId } from "./types";

export type InternationalHonor = "triple-crown" | "grand-slam";

/** Career completion, based on recorded titles rather than total trophy count. */
export function internationalHonor(
  titles: Partial<Record<InternationalId, number>>,
): InternationalHonor | null {
  if (!["first-stand", "msi", "worlds"].every((event) => (titles[event as InternationalId] ?? 0) > 0)) return null;
  return (titles["global-cup"] ?? 0) > 0 ? "grand-slam" : "triple-crown";
}
