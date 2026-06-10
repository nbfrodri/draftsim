// Seeded, injectable random number generation.
//
// Every randomized module (matchSimulator, metaRandomizer, draftAI, sim
// descriptions) accepts an optional `rng?: RNG` parameter that defaults to
// Math.random, so production behavior is unchanged while tests and
// reproducible simulations can pass `createRng(seed)` to get a fully
// deterministic run — same seed, same result.

// Any zero-arg function returning a float in [0, 1). Structurally identical
// to the RNG type in lib/players.ts so the two interoperate freely.
export type RNG = () => number;

// mulberry32 — small, fast, high-quality-enough 32-bit PRNG. Returns floats
// in [0, 1). Deterministic for a given seed.
export function createRng(seed: number): RNG {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── RNG-parameterized utility helpers ──────────────────────────────────────
// Mirror the helpers in lib/sim/descriptions.ts, but take the RNG as the
// first argument instead of closing over Math.random.

export function pickRandom<T>(rng: RNG, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

// Uniform integer in [lo, hi], inclusive on both ends.
export function rollInt(rng: RNG, lo: number, hi: number): number {
  return Math.floor(rng() * (hi - lo + 1)) + lo;
}

// Uniform float in [min, max).
export function jitter(rng: RNG, min: number, max: number): number {
  return min + rng() * (max - min);
}

// Fisher–Yates shuffle. Returns a new array; does not mutate the input.
export function shuffle<T>(rng: RNG, arr: readonly T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
