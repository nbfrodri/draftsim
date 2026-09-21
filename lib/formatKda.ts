export interface KdaTotals { k: number; d: number; a: number }

/** Pass null for absent/unobserved data; explicit zeroes are a recorded perfect game. */
export function formatKda(totals: KdaTotals | null | undefined, digits = 1): string {
  if (!totals || ![totals.k, totals.d, totals.a].every(n => Number.isFinite(n) && n >= 0)) return "—";
  return totals.d === 0 ? "Perfect KDA" : `${((totals.k + totals.a) / totals.d).toFixed(digits)} KDA`;
}

/** Legacy aggregate zeroes do not prove KDA coverage. */
export function formatAggregateKda(k: number, d: number, a: number): string {
  return formatKda(k + d + a > 0 ? { k, d, a } : null, 2);
}
