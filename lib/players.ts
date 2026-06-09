import type { Champion, Lane, Player, PlayerTier, Roster } from "./types";
import { getMetaTiers } from "./championMeta";

// Pure player-identity utilities: deriving a team's star rating from its
// roster, generating coherent random rosters (so a 5★ team never ends up with
// five D-tier players), building champion pools, and normalizing
// persisted/imported rosters. Framework-free and deterministic given an RNG —
// every randomized helper takes an optional `rng` so tests can seed it.

export type RNG = () => number;

// Positional lane order — matches blueRoles/redRoles indexing so a Roster
// aligns 1:1 with the pick slots once a draft resolves.
export const LANE_ORDER: readonly Lane[] = [
  "top",
  "jungle",
  "middle",
  "bottom",
  "support",
];

export const PLAYER_TIERS: readonly PlayerTier[] = ["S", "A", "B", "C", "D"];

// Tier → numeric value, centered on B = 0 so the mean maps cleanly onto a
// 1..5 star rating (see deriveStar). Range [-2, 2].
export const PLAYER_TIER_VALUE: Record<PlayerTier, number> = {
  S: 2,
  A: 1,
  B: 0,
  C: -1,
  D: -2,
};

// Max champions in each of a player's pools (liked / disliked).
export const MAX_POOL = 3;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function tierValue(t: PlayerTier): number {
  return PLAYER_TIER_VALUE[t];
}

// Inverse of PLAYER_TIER_VALUE: nearest tier for a numeric value.
//   value -2 → D, -1 → C, 0 → B, 1 → A, 2 → S
export function valueToTier(v: number): PlayerTier {
  const idx = clamp(Math.round(v), -2, 2) + 2; // -2..2 → 0..4
  return (["D", "C", "B", "A", "S"] as PlayerTier[])[idx];
}

// Derive a 1..5 star rating from a roster: rounded mean tier-value recentred
// on 3. 5×S → 5, all B → 3, 5×D → 1. Empty/missing → 3 (neutral).
export function deriveStar(roster: Roster | null | undefined): number {
  if (!roster || roster.length === 0) return 3;
  const mean =
    roster.reduce((sum, p) => sum + PLAYER_TIER_VALUE[p.tier], 0) /
    roster.length;
  return clamp(Math.round(3 + mean), 1, 5);
}

// Lanes a champion can be drafted into. Mirrors the meta editor's union of
// Meraki lanes + our own meta-tier lanes, so brand-new champions (empty
// c.lanes) still resolve to the lanes we tier them in.
export function playableLanes(champ: Champion): Lane[] {
  const set = new Set<Lane>(champ.lanes);
  const tiers = getMetaTiers(champ.alias);
  for (const lane of LANE_ORDER) {
    if (tiers[lane] != null) set.add(lane);
  }
  return LANE_ORDER.filter((l) => set.has(l));
}

export function playableInLane(champ: Champion, lane: Lane): boolean {
  if (champ.lanes.includes(lane)) return true;
  return getMetaTiers(champ.alias)[lane] != null;
}

// Find the player assigned to a lane, or null.
export function playerForLane(
  roster: Roster | null | undefined,
  lane: Lane | null | undefined,
): Player | null {
  if (!roster || lane == null) return null;
  return roster.find((p) => p.lane === lane) ?? null;
}

// Champion-pool sign for a (player, champion): +1 liked, -1 disliked, 0
// neutral. Consumers (simulator, AI) scale this by their own weight. Pure —
// lets later phases apply the bias without re-implementing the lookup.
export function poolBias(
  player: Player | null | undefined,
  championId: number | null | undefined,
): number {
  if (!player || championId == null) return 0;
  if (player.goodChamps.includes(championId)) return 1;
  if (player.badChamps.includes(championId)) return -1;
  return 0;
}

// How much an opposing player's comfort/discomfort on a champion should move
// the AI's ban/deny decisions. A champion an S-tier player mains is a far
// scarier signature pick than one a D-tier player dabbles in, so the weight
// scales hard with skill. Range (0, 1].
export const PLAYER_SKILL_WEIGHT: Record<PlayerTier, number> = {
  S: 1.0,
  A: 0.75,
  B: 0.5,
  C: 0.3,
  D: 0.15,
};

// Strongest "comfort" any player on a roster has on a champion: the max skill
// weight among players who list it in goodChamps (0 if none). Lets the AI
// target the opponent's signature picks — weighted by how good the player
// actually is — for bans (remove it) and denial (take it first).
export function rosterComfortWeight(
  roster: Roster | null | undefined,
  championId: number | null | undefined,
): number {
  if (!roster || championId == null) return 0;
  let best = 0;
  for (const p of roster) {
    if (p.goodChamps.includes(championId)) {
      const w = PLAYER_SKILL_WEIGHT[p.tier];
      if (w > best) best = w;
    }
  }
  return best;
}

// Strongest "discomfort": max skill weight among players who list the
// champion in badChamps (0 if none). Used to gently DISCOURAGE spending a ban
// on a champion the opponent is weak on — better to leave it available so
// they pick it themselves.
export function rosterDiscomfortWeight(
  roster: Roster | null | undefined,
  championId: number | null | undefined,
): number {
  if (!roster || championId == null) return 0;
  let best = 0;
  for (const p of roster) {
    if (p.badChamps.includes(championId)) {
      const w = PLAYER_SKILL_WEIGHT[p.tier];
      if (w > best) best = w;
    }
  }
  return best;
}

// ── Random helpers ──────────────────────────────────────────────────────────

function shuffle<T>(arr: readonly T[], rng: RNG): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Generate 5 tiers (one per LANE_ORDER lane) whose derived star equals the
// target. Each lane is seeded near the target mean with jitter and rounded to
// a tier, then individual lanes are nudged ±1 until deriveStar matches exactly.
// The nudge loop is bounded and always converges — each step moves the mean
// toward the target — so a target star reliably yields a roster of that star
// (no "5★ team of D players").
export function randomizeTiersForStar(
  star: number,
  rng: RNG = Math.random,
): PlayerTier[] {
  const target = clamp(Math.round(star), 1, 5);
  const base = target - 3; // target mean in tier-value units, [-2, 2]
  const SPREAD = 1.1;
  const values: number[] = [];
  for (let i = 0; i < LANE_ORDER.length; i++) {
    const jitter = (rng() * 2 - 1) * SPREAD;
    values.push(clamp(Math.round(base + jitter), -2, 2));
  }
  const starOf = (vs: number[]) =>
    clamp(Math.round(3 + vs.reduce((s, v) => s + v, 0) / vs.length), 1, 5);
  let guard = 0;
  while (starOf(values) !== target && guard++ < 200) {
    const tooLow = starOf(values) < target;
    const movable = values
      .map((_, i) => i)
      .filter((i) => (tooLow ? values[i] < 2 : values[i] > -2));
    if (movable.length === 0) break;
    const i = movable[Math.floor(rng() * movable.length)];
    values[i] += tooLow ? 1 : -1;
  }
  return values.map(valueToTier);
}

// Pick up to MAX_POOL liked + MAX_POOL disliked champion ids for a lane, drawn
// from champions playable in that lane. Pools are disjoint. Counts default to
// MAX_POOL each, shrinking gracefully when few champions are eligible.
export function randomizeChampPools(
  lane: Lane,
  champions: readonly Champion[],
  rng: RNG = Math.random,
): { goodChamps: number[]; badChamps: number[] } {
  const eligible = shuffle(
    champions.filter((c) => playableInLane(c, lane)),
    rng,
  );
  const goodCount = Math.min(MAX_POOL, eligible.length);
  const badCount = Math.min(MAX_POOL, eligible.length - goodCount);
  return {
    goodChamps: eligible.slice(0, goodCount).map((c) => c.id),
    badChamps: eligible.slice(goodCount, goodCount + badCount).map((c) => c.id),
  };
}

// Build a full 5-lane roster. When `star` is given, tiers are generated to
// match it; otherwise tiers are uniformly random. Pools are randomized unless
// `pools: false`.
export function randomizeRoster(opts: {
  champions: readonly Champion[];
  star?: number;
  pools?: boolean;
  rng?: RNG;
}): Roster {
  const rng = opts.rng ?? Math.random;
  const tiers =
    opts.star != null
      ? randomizeTiersForStar(opts.star, rng)
      : LANE_ORDER.map(
          () => PLAYER_TIERS[Math.floor(rng() * PLAYER_TIERS.length)],
        );
  return LANE_ORDER.map((lane, i) => {
    const pools =
      opts.pools === false
        ? { goodChamps: [], badChamps: [] }
        : randomizeChampPools(lane, opts.champions, rng);
    return {
      lane,
      tier: tiers[i],
      goodChamps: pools.goodChamps,
      badChamps: pools.badChamps,
    };
  });
}

// A neutral roster (all B, empty pools) — the starting point for manual
// editing in the UI.
export function emptyRoster(): Roster {
  return LANE_ORDER.map((lane) => ({
    lane,
    tier: "B" as PlayerTier,
    goodChamps: [],
    badChamps: [],
  }));
}

// A uniform roster whose every player sits at the tier matching `star` (so
// deriveStar(result) === star), with empty pools. Deterministic — no RNG or
// champion list needed. Used as a legacy fallback when filling rosters for
// teams persisted before this feature existed (they carry only a starRating).
export function rosterFromStar(star: number): Roster {
  const tier = valueToTier(clamp(Math.round(star), 1, 5) - 3);
  return LANE_ORDER.map((lane) => ({
    lane,
    tier,
    goodChamps: [],
    badChamps: [],
  }));
}

// Coerce arbitrary/persisted/imported data into a well-formed 5-lane roster in
// positional order. Drops unknown lanes, defaults bad tiers to B, dedupes and
// caps pools, enforces good/bad disjointness (good wins), and — when a champion
// list is supplied — filters pools to champions actually playable in the lane.
// Legacy-safe: missing lanes are filled with neutral players.
export function normalizeRoster(
  raw: unknown,
  champions?: readonly Champion[],
): Roster {
  const byId = champions
    ? new Map(champions.map((c) => [c.id, c]))
    : null;
  const byLane = new Map<Lane, Player>();
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (!entry || typeof entry !== "object") continue;
      const lane = (entry as { lane?: unknown }).lane as Lane;
      if (!LANE_ORDER.includes(lane) || byLane.has(lane)) continue;
      const rawTier = (entry as { tier?: unknown }).tier as PlayerTier;
      const tier: PlayerTier = PLAYER_TIERS.includes(rawTier) ? rawTier : "B";
      const eligible = (id: number): boolean => {
        if (!byId) return true;
        const c = byId.get(id);
        return c ? playableInLane(c, lane) : false;
      };
      const cleanIds = (v: unknown): number[] =>
        Array.isArray(v)
          ? Array.from(
              new Set(v.filter((x): x is number => typeof x === "number")),
            ).filter(eligible)
          : [];
      const good = cleanIds((entry as { goodChamps?: unknown }).goodChamps).slice(
        0,
        MAX_POOL,
      );
      const goodSet = new Set(good);
      const bad = cleanIds((entry as { badChamps?: unknown }).badChamps)
        .filter((id) => !goodSet.has(id))
        .slice(0, MAX_POOL);
      byLane.set(lane, { lane, tier, goodChamps: good, badChamps: bad });
    }
  }
  return LANE_ORDER.map(
    (lane) =>
      byLane.get(lane) ?? {
        lane,
        tier: "B" as PlayerTier,
        goodChamps: [],
        badChamps: [],
      },
  );
}
