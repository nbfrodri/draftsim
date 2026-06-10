// Stateless helper functions used by both pick and ban scoring. Pure — no
// side effects, no module state. Each helper exists in isolation so it can
// be unit-tested without standing up a full draft.

import { POSITIONAL_LANES, assignLanesToPicks } from "../draftEngine";
import { DRAFT_ORDER, TOTAL_ACTIONS } from "../draftOrder";
import {
  getActiveCounterOverride,
  getChampionMeta,
  getCounterOverrideVersion,
  getMetaEnabled,
  getMetaTier,
  getSynergy,
  TIER_VALUE,
  type Archetype,
  type ChampionMeta,
} from "../championMeta";
import type { RNG } from "../rng";
import type { Champion, GameDraft, Lane, Side } from "../types";
import {
  AP_BUILDERS_OVERRIDE,
  HYBRID_DAMAGE,
  NEITHER_DAMAGE,
  HARD_COUNTERS,
  IDENTITIES,
  FALLBACK_META,
} from "./data";

// ─── Lookup map for hard counters ──────────────────────────────────────────
// Memoized against the override version from championMeta. When a random
// counters override is applied, the next lookup rebuilds the map from the
// override list; without an override we always reuse the baseline lookup
// built from HARD_COUNTERS.

function buildCounterLookup(
  source: ReadonlyArray<readonly [string, string, number]>,
): ReadonlyMap<string, ReadonlyMap<string, number>> {
  const m = new Map<string, Map<string, number>>();
  for (const [c, v, b] of source) {
    if (!m.has(c)) m.set(c, new Map());
    m.get(c)!.set(v, b);
  }
  return m;
}

const BASELINE_COUNTER_LOOKUP = buildCounterLookup(HARD_COUNTERS);

let _cachedCounterLookup: ReadonlyMap<string, ReadonlyMap<string, number>> =
  BASELINE_COUNTER_LOOKUP;
let _cachedCounterVersion = 0;

function getCounterLookup(): ReadonlyMap<string, ReadonlyMap<string, number>> {
  const override = getActiveCounterOverride();
  if (!override) return BASELINE_COUNTER_LOOKUP;
  const v = getCounterOverrideVersion();
  if (v !== _cachedCounterVersion) {
    _cachedCounterLookup = buildCounterLookup(override);
    _cachedCounterVersion = v;
  }
  return _cachedCounterLookup;
}

// ─── byId cache ─────────────────────────────────────────────────────────────

// WeakMap-backed cache so we build the id→Champion lookup at most once per
// roster array reference. The roster is stable across a session (set in
// the store on app load), so in practice this is a single allocation for
// the entire app lifetime — not per AI decision.
const byIdCache = new WeakMap<readonly Champion[], Map<number, Champion>>();

export function getById(champions: readonly Champion[]): Map<number, Champion> {
  let m = byIdCache.get(champions);
  if (!m) {
    m = new Map<number, Champion>();
    for (const c of champions) m.set(c.id, c);
    byIdCache.set(champions, m);
  }
  return m;
}

// ─── Trivial accessors ──────────────────────────────────────────────────────

export function metaFor(champ: Champion): ChampionMeta {
  return getChampionMeta(champ.alias) ?? FALLBACK_META;
}

export function picksFor(game: GameDraft, side: Side): (number | null)[] {
  return side === "blue" ? game.bluePicks : game.redPicks;
}

export function bansFor(game: GameDraft, side: Side): (number | null)[] {
  return side === "blue" ? game.blueBans : game.redBans;
}

export function countNonNull(arr: (number | null)[]): number {
  let n = 0;
  for (const x of arr) if (x != null) n++;
  return n;
}

// ─── Damage classification ─────────────────────────────────────────────────

export function isAP(c: Champion): boolean {
  if (NEITHER_DAMAGE.has(c.alias)) return false;
  if (HYBRID_DAMAGE.has(c.alias)) return true;
  if (AP_BUILDERS_OVERRIDE.has(c.alias)) return true;
  return c.roles.some((r) => r.toLowerCase() === "mage");
}

export function isAD(c: Champion): boolean {
  if (NEITHER_DAMAGE.has(c.alias)) return false;
  if (HYBRID_DAMAGE.has(c.alias)) return true;
  // Explicit AP overrides shouldn't double-count as AD even if they're
  // tagged Assassin / Fighter (e.g., Akali, Ekko, Fizz, Mordekaiser).
  if (AP_BUILDERS_OVERRIDE.has(c.alias)) return false;
  const roles = c.roles.map((r) => r.toLowerCase());
  if (roles.includes("marksman") || roles.includes("assassin")) return true;
  if (roles.includes("fighter") && !roles.includes("mage")) return true;
  return false;
}

// ─── Lane / archetype profiling ────────────────────────────────────────────

// Lanes still open for a partial draft. Uses the same greedy assignment as
// post-draft, then subtracts assigned lanes from the full set.
export function openLanes(
  picks: (number | null)[],
  champions: Champion[],
): Set<Lane> {
  const assigned = assignLanesToPicks(picks, champions);
  const open = new Set<Lane>(POSITIONAL_LANES);
  for (const lane of assigned) if (lane) open.delete(lane);
  return open;
}

export function inferLaneAssignment(
  picks: (number | null)[],
  champions: Champion[],
): (Lane | null)[] {
  return assignLanesToPicks(picks, champions);
}

export function archetypeCounts(
  picks: (number | null)[],
  byId: Map<number, Champion>,
): Record<Archetype, number> {
  const counts: Record<Archetype, number> = {
    engage: 0,
    peel: 0,
    poke: 0,
    dive: 0,
    pick: 0,
    wombo: 0,
    "hyper-carry": 0,
    splitpush: 0,
    assassin: 0,
    tank: 0,
    enchanter: 0,
    burst: 0,
    skirmish: 0,
    sustain: 0,
  };
  for (const id of picks) {
    if (id == null) continue;
    const champ = byId.get(id);
    if (!champ) continue;
    for (const a of metaFor(champ).archetypes) counts[a]++;
  }
  return counts;
}

// "Real" damage threat — distinct from `damageProfile` which only counts
// AP/AD distribution. A team can be 4 AD + 1 AP and still lack damage if
// those are tanks/skirmishers. This counts champions that actually exist
// to break enemy frontline: marksmen, hyper-carries, bursts, pokes, and
// damage-tagged mages (excluding pure peel/enchanter mages like Lulu).
export function isDamageDealer(c: Champion): boolean {
  const meta = metaFor(c);
  if (meta.archetypes.includes("hyper-carry")) return true;
  if (meta.archetypes.includes("burst")) return true;
  if (meta.archetypes.includes("poke")) return true;
  const roles = c.roles.map((r) => r.toLowerCase());
  if (roles.includes("marksman")) return true;
  // Mage-tagged but not primarily peel/enchanter (so Brand counts, Lulu
  // doesn't).
  if (
    roles.includes("mage") &&
    !meta.archetypes.includes("enchanter") &&
    !meta.archetypes.includes("peel")
  )
    return true;
  return false;
}

export function damageDealerCount(
  picks: (number | null)[],
  byId: Map<number, Champion>,
): number {
  let n = 0;
  for (const id of picks) {
    if (id == null) continue;
    const c = byId.get(id);
    if (!c) continue;
    if (isDamageDealer(c)) n++;
  }
  return n;
}

// Per-phase counts on a partial draft. Used by the AI to shape comps
// across the early/mid/late curve — a team with 0 early presence and 3
// late scalers is asking to get run over, just as 5 early picks all
// fall off when the game runs long. Mirrors the simulator's scaling-
// advantage logic so the AI's mental model matches what the sim actually
// rewards.
export interface PhaseProfile {
  early: number;
  mid: number;
  midLate: number;
  late: number;
}

export function phaseProfile(
  picks: (number | null)[],
  byId: Map<number, Champion>,
): PhaseProfile {
  const profile: PhaseProfile = { early: 0, mid: 0, midLate: 0, late: 0 };
  for (const id of picks) {
    if (id == null) continue;
    const c = byId.get(id);
    if (!c) continue;
    const meta = metaFor(c);
    if (meta.phase === "early") profile.early++;
    else if (meta.phase === "mid") profile.mid++;
    else if (meta.phase === "mid-late") profile.midLate++;
    else if (meta.phase === "late") profile.late++;
  }
  return profile;
}

export function damageProfile(
  picks: (number | null)[],
  byId: Map<number, Champion>,
): { ap: number; ad: number } {
  let ap = 0;
  let ad = 0;
  for (const id of picks) {
    if (id == null) continue;
    const champ = byId.get(id);
    if (!champ) continue;
    if (isAP(champ)) ap++;
    if (isAD(champ)) ad++;
  }
  return { ap, ad };
}

// Lane the AI intends to slot this champion into, plus the meta tier value
// in that lane. Mirrors the first-available-in-champ.lanes-order logic of
// `assignLanesToPicks` (the post-draft assigner) — without that alignment,
// the AI's surfaced "intended lane" can disagree with where the champion
// actually ends up in the team panel after the draft completes (bug U8).
//
// Champion.lanes is sourced from Meraki and is ordered primary→secondary,
// which usually also matches highest-tier→lower. The previous "best tier
// across open lanes" implementation could pick a higher-tier secondary
// over a lower-tier primary, then the post-draft greedy assignment would
// override and slot the champ into the primary anyway — causing a visible
// mismatch.
export function bestLaneTierValue(
  champ: Champion,
  open: Set<Lane>,
): { value: number; lane: Lane | null } {
  // When the meta master switch is off, no champion gets a tier signal —
  // the AI's lane-fit baseline becomes 0 instead of the uniform "C"
  // fallback that previously added +6 to every score. This way, with
  // meta off, differentiation between picks comes entirely from comp
  // gaps / synergy / identity / matchup — and meta-strong picks like
  // Yasuo lose their built-in advantage in the AI's eyes.
  const metaOn = getMetaEnabled();
  for (const lane of champ.lanes) {
    if (!open.has(lane)) continue;
    if (!metaOn) return { value: 0, lane };
    const tier = getMetaTier(champ.alias, lane) ?? "C";
    return { value: TIER_VALUE[tier], lane };
  }
  return { value: 0, lane: null };
}

// Number of distinct meta-tiered lanes the champ has — used as flex bonus.
// Counts lanes where the champ is at tier B or higher.
export function flexLaneCount(champ: Champion): number {
  let n = 0;
  for (const lane of champ.lanes) {
    const tier = getMetaTier(champ.alias, lane);
    if (tier && TIER_VALUE[tier] >= TIER_VALUE.B) n++;
  }
  return n;
}

// ─── Synergy ───────────────────────────────────────────────────────────────

// Synergy from CHAMPION_SYNERGIES table (explicit pairings). Caps at +6.
export function synergyWith(
  candidate: Champion,
  others: (number | null)[],
  byId: Map<number, Champion>,
): number {
  let total = 0;
  for (const id of others) {
    if (id == null) continue;
    const mate = byId.get(id);
    if (!mate || mate.alias === candidate.alias) continue;
    const s = getSynergy(candidate.alias, mate.alias);
    if (s) total += s.bonus;
  }
  return Math.min(6, total);
}

// Implicit archetype-pair synergies that aren't enumerated in
// CHAMPION_SYNERGIES. Bug fix (#8): skip pairs where the explicit table
// already fires, otherwise scoring double-counts (e.g., Malphite+Yasuo
// would get both the explicit "Knockup Wombo" bonus and the implicit
// engage+wombo bonus).
export function archetypeSynergyBonus(
  candidate: Champion,
  teammates: (number | null)[],
  byId: Map<number, Champion>,
): number {
  const cand = metaFor(candidate);
  let bonus = 0;
  for (const id of teammates) {
    if (id == null) continue;
    const mate = byId.get(id);
    if (!mate) continue;
    // Skip pairs already covered by the explicit table — avoid double-counting.
    if (getSynergy(candidate.alias, mate.alias)) continue;
    const m = metaFor(mate);
    // Wombo flow: an engager + an AOE finisher
    const candEng =
      cand.archetypes.includes("engage") || cand.archetypes.includes("wombo");
    const candFinisher =
      cand.archetypes.includes("burst") || cand.archetypes.includes("wombo");
    const mateEng =
      m.archetypes.includes("engage") || m.archetypes.includes("wombo");
    const mateFinisher =
      m.archetypes.includes("burst") || m.archetypes.includes("wombo");
    if (candEng && mateFinisher) bonus += 0.6;
    if (mateEng && candFinisher) bonus += 0.6;
    // Protect flow: hyper-carry + peeler/enchanter
    if (
      cand.archetypes.includes("hyper-carry") &&
      (m.archetypes.includes("peel") || m.archetypes.includes("enchanter"))
    )
      bonus += 0.6;
    if (
      m.archetypes.includes("hyper-carry") &&
      (cand.archetypes.includes("peel") ||
        cand.archetypes.includes("enchanter"))
    )
      bonus += 0.6;
    // Dive pile-on: two divers amplify each other
    if (cand.archetypes.includes("dive") && m.archetypes.includes("dive"))
      bonus += 0.4;
    // Pick comp amplification: pick + burst/assassin
    if (
      cand.archetypes.includes("pick") &&
      (m.archetypes.includes("assassin") || m.archetypes.includes("burst"))
    )
      bonus += 0.4;
  }
  return Math.min(3, bonus);
}

// ─── Lane matchup ───────────────────────────────────────────────────────────

export function hardCounterValue(
  counter: Champion,
  victim: Champion,
): number {
  return getCounterLookup().get(counter.alias)?.get(victim.alias) ?? 0;
}

// Counter severity classification. The HARD_COUNTERS table uses bonuses
// 1-6 where higher means stronger matchup advantage; the magnitude is
// also a stand-in for severity:
//
//   bonus 0-1 — situational / soft counter (depends on player)
//   bonus 2-3 — solid soft counter (favored, not unwinnable)
//   bonus 4-5 — hard counter (lane is genuinely lost in equal skill)
//   bonus 6+  — extreme counter (Malphite Yasuo, Yorick Nasus tier)
//
// Surface this so callers can apply non-linear weighting (e.g., the AI
// should NEVER pick into an extreme counter, but a soft one is fine).
export type CounterSeverity = "neutral" | "soft" | "medium" | "hard" | "extreme";

export function counterSeverity(absBonus: number): CounterSeverity {
  if (absBonus >= 6) return "extreme";
  if (absBonus >= 4) return "hard";
  if (absBonus >= 2) return "medium";
  if (absBonus >= 1) return "soft";
  return "neutral";
}

export function isHardCounter(absBonus: number): boolean {
  return absBonus >= 4;
}

// Champion-vs-champion lane matchup. Combines the curated hard-counter
// table with archetype/mobility/phase heuristics. Range roughly ±10 for
// hard-counter pairs, ±5 for archetype-only matchups.
export function laneMatchup(
  myChamp: Champion,
  oppChamp: Champion,
): number {
  let score = 0;
  // Curated hard-counter table — directional.
  score += hardCounterValue(myChamp, oppChamp);
  score -= hardCounterValue(oppChamp, myChamp);
  const my = metaFor(myChamp);
  const opp = metaFor(oppChamp);
  // Mobility: high vs low is a hard counter in lane.
  if (my.mobility === "high" && opp.mobility === "low") score += 5;
  if (opp.mobility === "high" && my.mobility === "low") score -= 5;
  // Phase: an early-game bully into a late-game scaler can snowball.
  const myLate = my.phase === "late" || my.phase === "mid-late";
  const oppLate = opp.phase === "late" || opp.phase === "mid-late";
  if (my.phase === "early" && oppLate) score += 3;
  if (opp.phase === "early" && myLate) score -= 3;
  // Sustain bruisers eat burst mages alive in extended trades.
  if (my.archetypes.includes("sustain") && opp.archetypes.includes("burst"))
    score += 1;
  if (opp.archetypes.includes("sustain") && my.archetypes.includes("burst"))
    score -= 1;
  return score;
}

// ─── Damage balance ─────────────────────────────────────────────────────────

// AP/AD imbalance penalty/bonus. Scales with how lopsided the team already
// is — a 4th AP into 0 ADs is much worse than the 3rd, so the penalty grows.
export function damageBalanceDelta(
  candidate: Champion,
  myDmg: { ap: number; ad: number },
): number {
  const candAP = isAP(candidate);
  const candAD = isAD(candidate);
  if (!candAP && !candAD) return 0;
  let delta = 0;
  // Filling a true gap: big bonus for the first one of an absent type.
  if (candAP && myDmg.ap === 0) delta += 5;
  if (candAD && myDmg.ad === 0) delta += 5;
  // Stacking what we already have: progressive penalty.
  if (candAP && myDmg.ap >= 2) delta -= (myDmg.ap - 1) * 3;
  if (candAD && myDmg.ad >= 2) delta -= (myDmg.ad - 1) * 3;
  return delta;
}

// ─── Identity targeting ─────────────────────────────────────────────────────

export interface IdentityTarget {
  label: string;
  needed: ReadonlySet<Archetype>;
}

// Bug fix (#10): the old version used first-match priority, so multiple
// triggers would always resolve to the most-specific identity even if a
// less-specific one fit the team much better. The new version scores each
// triggered identity by how many of its `needed` archetypes the team
// already has — closest-to-formed wins. Ties broken by IDENTITIES order.
export function identityTarget(
  myCounts: Record<Archetype, number>,
  picksLocked: number,
): IdentityTarget | null {
  if (picksLocked < 2) return null;
  let best: { label: string; needed: ReadonlyArray<Archetype>; score: number } | null =
    null;
  for (const id of IDENTITIES) {
    if (!id.trigger(myCounts)) continue;
    let score = 0;
    for (const a of id.needed) score += myCounts[a];
    if (best == null || score > best.score) {
      best = { label: id.label, needed: id.needed, score };
    }
  }
  if (!best) return null;
  return { label: best.label, needed: new Set(best.needed) };
}

// ─── Sampling ───────────────────────────────────────────────────────────────

// Softmax-weighted sample from the top-N candidates by score. Takes an
// optional RNG (defaults to Math.random) so seeded callers are deterministic.
export function sampleTopN<T>(
  scored: { item: T; score: number }[],
  n: number,
  temperature: number,
  rng: RNG = Math.random,
): T | null {
  if (scored.length === 0) return null;
  const sorted = [...scored].sort((a, b) => b.score - a.score);
  const top = sorted.slice(0, Math.min(n, sorted.length));
  const max = top[0].score;
  const weights = top.map((t) => Math.exp((t.score - max) / temperature));
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return top[0].item;
  let r = rng() * sum;
  for (let i = 0; i < top.length; i++) {
    r -= weights[i];
    if (r <= 0) return top[i].item;
  }
  return top[top.length - 1].item;
}

// ─── Action sequence helpers ────────────────────────────────────────────────

export function nextActionIsEnemyPick(
  game: GameDraft,
  mySide: Side,
): boolean {
  const idx = game.actionIndex + 1;
  if (idx >= TOTAL_ACTIONS) return false;
  const next = DRAFT_ORDER[idx];
  return next.kind === "pick" && next.side !== mySide;
}

// Number of pick/ban actions remaining for a given side after the current
// action resolves. Used by the lookahead penalty to dampen counter-pick
// damage when the side has flexibility to compensate later in the draft.
export function remainingActionsForSide(
  game: GameDraft,
  side: Side,
): { picks: number; bans: number } {
  let picks = 0;
  let bans = 0;
  for (let i = game.actionIndex + 1; i < TOTAL_ACTIONS; i++) {
    const a = DRAFT_ORDER[i];
    if (a.side !== side) continue;
    if (a.kind === "pick") picks++;
    else bans++;
  }
  return { picks, bans };
}
