import type { Lane, Side } from "./types";

// Lane-ordered (top, jungle, middle, bottom, support), matching GameRatings.
const GAP_LANES: { lane: Lane; label: string }[] = [
  { lane: "top", label: "Top Gap" },
  { lane: "jungle", label: "Jungle Gap" },
  { lane: "middle", label: "Mid Gap" },
  { lane: "bottom", label: "Bot Gap" },
  { lane: "support", label: "Support Gap" },
];

// The win bonus alone splits two average players by 0.9; 2 points is a lane
// one player clearly took over.
export const ROLE_GAP_MIN = 2;

export interface RoleGap {
  lane: Lane;
  label: string;
  /** Side whose player out-rated their lane opponent. */
  side: Side;
  /** Rating difference, one decimal. */
  diff: number;
}

/** Lanes where one player out-rated their opponent by at least `min`,
 *  biggest gap first. Non-positive ratings mean "not rated" and are skipped. */
export function roleGaps(
  blue: readonly (number | null | undefined)[],
  red: readonly (number | null | undefined)[],
  min = ROLE_GAP_MIN,
): RoleGap[] {
  const gaps: RoleGap[] = [];
  GAP_LANES.forEach(({ lane, label }, i) => {
    const b = blue[i];
    const r = red[i];
    if (b == null || r == null || !(b > 0) || !(r > 0)) return;
    const diff = Math.round(Math.abs(b - r) * 10) / 10;
    if (diff >= min) gaps.push({ lane, label, side: b > r ? "blue" : "red", diff });
  });
  return gaps.sort((a, b) => b.diff - a.diff);
}
