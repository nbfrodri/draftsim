// Player careers for franchise/reality mode: stable ids, ageing, growth and
// decline, performance-based demotion (academy → free agency → retired), and
// slot fills (returnees preferred over rookies). Pure and deterministic given
// an RNG.
//
// Demotion checkpoints: after each split (winter/spring/summer) AND the
// post-Worlds offseason. Aging + academy→FA→retire advances only at the
// year-end offseason.
//
// Age influences growth/decline only — there is NO age-forced retirement.
// Demotion: UNDERPERFORM_STREAK_TO_DEMOTE consecutive underperforming
// checkpoints → academy. An international title resets the bad streak.
// Path: Active → Academy (3y, same-org recall only) → FA (4y, any team) →
// Retired if unsigned (~7 inactive years). inactiveYears is 1-based from
// demotion day (Academy · 1y immediately; after 3 year-ends → FA · 1y).

import type { Champion, Lane, Player, PlayerTier } from "../types";
import {
  PLAYER_TIER_VALUE,
  PLAYER_TIERS,
  LANE_ORDER,
  valueToTier,
  randomizeChampPools,
  makePlayerId,
  type RNG,
} from "../players";
import { generateHandle, isValidHandle, normalizeHandle } from "./playerNames";
// Re-export for callers that imported isValidHandle from lifecycle.
export { isValidHandle } from "./playerNames";
import rookiePool from "./rookieNames.json";
import type { SeasonMetaSnapshot } from "./types";
import {
  NEUTRAL_META,
  applyComebackRust,
  inactiveMarketGrade,
  pickScoredReturnee,
  resolveCompetitiveFills,
  runOpenFaReplacePass,
  runOpenAcademyReplacePass,
  runAiAcademyReleasePass,
  runAiAcademyStashPass,
  executeAddAcademyRookie,
  shallowestAcademyLane,
  teamAcademyHasRoom,
  countTeamAcademy,
  addToTeamAcademy,
  makeBecameFaNews,
  tickInactiveYear,
  MAX_AI_ACADEMY_ROOKIE_PER_TEAM,
  AI_ACADEMY_ROOKIE_CHANCE,
  AI_ACADEMY_ROOKIE_CHANCE_MID_SPLIT,
  AI_ACADEMY_ROOKIE_FA_THIN,
  AI_ACADEMY_ROOKIE_DEPTH_BELOW,
  countAcademyRookiesMintedInYear,
  applyFaGraduatePressure,
  cullWeakFaWhenOversized,
  academyTenureYears,
  applyAcademyGraduateCap,
  inactiveClockYear,
  ACADEMY_YEARS_MIN,
  ACADEMY_YEARS_MAX,
  ACADEMY_GRADUATE_CAP_PER_YEAR,
  reconcileRosterPoolDuplicates,
  isSamePlayerReplaceNoise,
  type MarketNote as FaMarketNote,
  type MarketVacancy,
  type MarketInactive,
  makeRetiredNews,
} from "./faMarket";

export {
  ACADEMY_YEARS_MIN,
  ACADEMY_YEARS_MAX,
  ACADEMY_GRADUATE_CAP_PER_YEAR,
  academyTenureYears,
  applyAcademyGraduateCap,
  inactiveClockYear,
};

// Real sub/academy/prospect handles, bucketed BY LANE so a debut gets a
// position-authentic name (a real top laner debuts top, not support). The pool
// ships either flat (legacy, no position data) or as { lane: string[] } from
// `npm run fetch-rookie-names`; normalize both.
// ponytail: drop the flat-array branch once the regenerated keyed file lands.
const LANE_KEYS: readonly Lane[] = ["top", "jungle", "middle", "bottom", "support"];
const POOL_BY_LANE: Record<Lane, string[]> = (() => {
  const byLane: Record<Lane, string[]> = {
    top: [], jungle: [], middle: [], bottom: [], support: [],
  };
  if (Array.isArray(rookiePool)) {
    for (const l of LANE_KEYS) byLane[l] = rookiePool as string[];
  } else {
    const keyed = rookiePool as Partial<Record<Lane, string[]>>;
    for (const l of LANE_KEYS) byLane[l] = keyed[l] ?? [];
  }
  return byLane;
})();

function rookieName(lane: Lane, rng: RNG, taken: Set<string>, region?: string): string {
  const pool = POOL_BY_LANE[lane];
  const reserved = new Set([...taken].map(normalizeHandle));
  for (let i = 0; i < 12 && pool.length > 0; i++) {
    const n = pool[Math.floor(rng() * pool.length)];
    if (!reserved.has(normalizeHandle(n)) && isValidHandle(n)) {
      taken.add(n);
      return n;
    }
  }
  return generateHandle(rng, taken, region);
}

// ── Tunable knobs (ponytail: tune here, not in the logic) ───────────────────
const DEBUT_AGE_MIN = 17;
const PRIME_FROM = 20;
const GROWTH_UNTIL = 23;
const DECLINE_FROM = 29;
// Rare generational S+ upside for young prospects.
const SPLUS_POTENTIAL_CHANCE = 0.03;
const CHANGE_RATE = 0.6; // active roster tier change/year — academy uses slower ACADEMY_DEV_CHANCE
const PERF_NEUTRAL = 5.5;
const PERF_WEIGHT = 0.18;
const ROOKIE_AGE_MAX = 19;

/** Grade must be this far below the role's mean to count as "well below".
 *  Tuned via lifecycleSim (3 mid-split + 1 offseason checkpoints/year) with
 *  same-org academy recalls: target ~3–5% of actives demoted/year. */
export const GRADE_GAP_THRESHOLD = 0.9;
/** Consecutive underperforming checkpoints before demotion to academy. */
export const UNDERPERFORM_STREAK_TO_DEMOTE = 5;
/** Years in academy before moving to free agency (soft / typical mid-value).
 *  Personal tenure is 2–4 via {@link academyTenureYears}; hard ceiling
 *  {@link ACADEMY_YEARS_MAX}. League-wide {@link ACADEMY_GRADUATE_CAP_PER_YEAR}
 *  caps synchronized waves. */
export const ACADEMY_YEARS = 3;
/** Years in free agency (after academy) before true retirement if unsigned. */
export const FREE_AGENT_YEARS = 4;
/** Total inactive years (academy + FA) before retirement (3 + 4 = 7). */
export const TOTAL_INACTIVE_BEFORE_RETIRE = ACADEMY_YEARS + FREE_AGENT_YEARS;

/** Target demotion rate band used by the sim harness (fraction of actives/year).
 *  Upper bound widened after competitive FA/rookie fills and the 3y academy
 *  stay (more affiliate recalls recycle into later demotions). Still rare-but-real
 *  vs a mass-churn sim — do not raise demotion knobs to "fix" this band. */
export const TARGET_DEMOTION_RATE = { min: 0.03, max: 0.16 };

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export type CareerStatus = "active" | "academy" | "free-agent" | "retired";

/** Snapshot of a player off the active roster (academy / FA / retired). */
export interface InactivePlayer {
  player: Player;
  status: "academy" | "free-agent" | "retired";
  /**
   * 1-based years on the inactive path (badge years). Set to 1 on demotion day
   * so the UI shows "Academy · 1y" immediately; increments each year-end while
   * unsigned. Academy badges use 1…ACADEMY_YEARS; FA badges use
   * (inactiveYears − ACADEMY_YEARS) → 1…FREE_AGENT_YEARS.
   */
  inactiveYears: number;
  /** Franchise year they left the **main roster** (archive filter / tenure). */
  demotedYear: number;
  /**
   * Franchise year {@link inactiveYears} was last reset to 1 (or to FA · 1y).
   * Drives the year-end skip in {@link advanceInactivePool}; falls back to
   * `demotedYear` on saves written before this field existed.
   */
  clockYear?: number;
  lastTeamId: string;
  lastTeamName?: string;
  /** Last active-season grade at demotion (frozen form signal). */
  lastActiveGrade?: number | null;
  /** Shadow form while inactive — blended with lastActive for market/aging. */
  shadowGrade?: number | null;
  /** Personal offset on the value-based academy stay ({@link academyTenureYears}). */
  academyTenureShift?: number;
}

/**
 * Backfill {@link InactivePlayer.clockYear} on pools loaded from saves written
 * before the badge clock was split from `demotedYear`. Idempotent; returns the
 * same array reference when nothing is missing so callers can skip writes.
 *
 * Historical mid-year academy→FA snaps cannot be recovered (the save never
 * recorded when the clock moved), so those entries keep the old behaviour for
 * one more year-end. Everything minted / demoted afterwards is correct.
 */
export function backfillInactiveClockYears<T extends InactivePlayer>(
  pool: readonly T[],
): T[] {
  if (pool.every((e) => e.clockYear != null)) return [...pool];
  return pool.map((e) =>
    e.clockYear != null ? e : { ...e, clockYear: e.demotedYear },
  );
}

/** Compact archive form for Hall/search (no full champ pools required). */
export interface InactivePlayerSnapshot {
  playerId: string;
  playerName?: string;
  lane: Lane;
  tier: PlayerTier;
  age?: number;
  /** Peak / growth ceiling — same richness as active roster rows. */
  potential?: PlayerTier;
  goodChamps?: number[];
  badChamps?: number[];
  /** Franchise year minted as a rookie (academy or safety); unset for founders. */
  debutYear?: number;
  status: "academy" | "free-agent" | "retired";
  inactiveYears: number;
  demotedYear: number;
  /** Year the badge clock started (see {@link InactivePlayer.clockYear}). */
  clockYear?: number;
  lastTeamId: string;
  lastTeamName?: string;
  lastActiveGrade?: number | null;
  shadowGrade?: number | null;
  /** Personal academy-tenure offset — lets the Hall compute `y to FA`. */
  academyTenureShift?: number;
}

export function toInactiveSnapshot(p: InactivePlayer): InactivePlayerSnapshot {
  return {
    playerId: p.player.id ?? "",
    ...(p.player.name ? { playerName: p.player.name } : {}),
    lane: p.player.lane,
    tier: p.player.tier,
    ...(p.player.age != null ? { age: p.player.age } : {}),
    ...(p.player.potential ? { potential: p.player.potential } : {}),
    ...(p.player.goodChamps?.length ? { goodChamps: [...p.player.goodChamps] } : {}),
    ...(p.player.badChamps?.length ? { badChamps: [...p.player.badChamps] } : {}),
    ...(p.player.debutYear != null ? { debutYear: p.player.debutYear } : {}),
    status: p.status,
    inactiveYears: p.inactiveYears,
    demotedYear: p.demotedYear,
    ...(p.clockYear != null ? { clockYear: p.clockYear } : {}),
    lastTeamId: p.lastTeamId,
    ...(p.lastTeamName ? { lastTeamName: p.lastTeamName } : {}),
    ...(p.lastActiveGrade != null ? { lastActiveGrade: p.lastActiveGrade } : {}),
    ...(p.shadowGrade != null ? { shadowGrade: p.shadowGrade } : {}),
    ...(p.academyTenureShift != null
      ? { academyTenureShift: p.academyTenureShift }
      : {}),
  };
}

/**
 * Inactive-pool snapshot for a just-completed year about to be archived.
 *
 * Year-end offseason advances academy→FA→retire on the closing tick, but
 * players minted/demoted in that same calendar year skip the year clock
 * ({@link advanceInactivePool} + `closingYear`) so a brand-new academy mint
 * archives as Acy · 1y — not 2y. Hall still stamps post-offseason status so
 * academy→FA / FA→retired transitions land on the year that closed.
 *
 * `archivedYear` drops pool rows whose `demotedYear` is *after* the year being
 * archived (year-end intake minted for the upcoming season).
 */
export function inactiveSnapshotsForArchivedYear(
  _preOffseason: readonly InactivePlayer[],
  postOffseason: readonly InactivePlayer[],
  archivedYear?: number,
): InactivePlayerSnapshot[] {
  const rows =
    archivedYear == null
      ? postOffseason
      : postOffseason.filter((e) => e.demotedYear <= archivedYear);
  return rows.map(toInactiveSnapshot);
}

/** One season's outcome for underperformance evaluation. */
export interface SeasonPlayerOutcome {
  playerId: string;
  grade: number | null;
  tier: PlayerTier;
  lane: Lane;
  splitTitles: number;
  intlTitles: number;
}

/** Mean grade per lane across a set of outcomes (for role-relative underperformance). */
export function computeRoleMeans(
  outcomes: Iterable<SeasonPlayerOutcome>,
): Partial<Record<Lane, number>> {
  const sum: Partial<Record<Lane, number>> = {};
  const cnt: Partial<Record<Lane, number>> = {};
  for (const o of outcomes) {
    if (o.grade == null) continue;
    sum[o.lane] = (sum[o.lane] ?? 0) + o.grade;
    cnt[o.lane] = (cnt[o.lane] ?? 0) + 1;
  }
  const out: Partial<Record<Lane, number>> = {};
  for (const lane of LANE_KEYS) {
    const c = cnt[lane];
    if (c && c > 0) out[lane] = (sum[lane] ?? 0) / c;
  }
  return out;
}

// A starting age + potential for an EXISTING player when a reality begins.
export function initCareer(player: Player, rng: RNG): Player {
  const age = player.age ?? 18 + Math.floor(rng() * 8);
  const tierVal = PLAYER_TIER_VALUE[player.tier];
  const headroom = age <= GROWTH_UNTIL ? Math.floor(rng() * 3) : Math.floor(rng() * 2);
  let potVal = clamp(tierVal + headroom, -2, 2);
  if (player.tier === "S+") potVal = 3;
  else if (potVal >= 2 && age <= GROWTH_UNTIL && rng() < SPLUS_POTENTIAL_CHANCE) potVal = 3;
  const potential = valueToTier(potVal);
  return {
    ...player,
    id: player.id ?? makePlayerId(rng),
    age,
    potential,
    badStreak: player.badStreak ?? 0,
  };
}

/** Stamp ids + ages + potentials onto a roster at reality creation. */
export function seedRosterCareers(roster: readonly Player[], rng: RNG): Player[] {
  return roster.map((p) => initCareer(p, rng));
}

export function makeRookie(
  lane: Lane,
  champions: readonly Champion[],
  rng: RNG,
  taken: Set<string>,
  region?: string,
): Player {
  const age = DEBUT_AGE_MIN + Math.floor(rng() * (ROOKIE_AGE_MAX - DEBUT_AGE_MIN + 1));
  const startVal = clamp(-1 + Math.floor(rng() * 3), -2, 1);
  const tier = valueToTier(startVal);
  let potVal = clamp(startVal + 1 + Math.floor(rng() * 3), -2, 2);
  if (potVal >= 2 && rng() < SPLUS_POTENTIAL_CHANCE) potVal = 3;
  const potential = valueToTier(potVal);
  const pools = randomizeChampPools(lane, champions, rng, tier);
  return {
    id: makePlayerId(rng),
    name: rookieName(lane, rng, taken, region),
    lane,
    tier,
    age,
    potential,
    badStreak: 0,
    goodChamps: pools.goodChamps,
    badChamps: pools.badChamps,
    ...(region ? { homeRegion: region } : {}),
    acclimation: 1,
  };
}

/** Age one player a year. Age never forces retirement — only growth/decline. */
export function agePlayer(player: Player, perf: number | null, rng: RNG): Player {
  const age = (player.age ?? 22) + 1;
  const tierVal = PLAYER_TIER_VALUE[player.tier];
  const potVal = PLAYER_TIER_VALUE[player.potential ?? player.tier];
  let pressure = 0;
  if (age >= PRIME_FROM && age <= GROWTH_UNTIL && tierVal < potVal) pressure += 0.45;
  if (age >= DECLINE_FROM) pressure -= 0.35 * ((age - (DECLINE_FROM - 1)) / 3);
  pressure -= 0.1 * (tierVal / 2);
  if (perf != null) pressure += PERF_WEIGHT * (perf - PERF_NEUTRAL);

  let tier: PlayerTier = player.tier;
  if (rng() < CHANGE_RATE) {
    const pUp = clamp(0.5 + pressure, 0.05, 0.95);
    const dir = rng() < pUp ? 1 : -1;
    let nextVal = tierVal + dir;
    if (dir > 0) nextVal = Math.min(nextVal, potVal);
    nextVal = clamp(nextVal, -2, 3);
    tier = valueToTier(nextVal);
  }
  return { ...player, age, tier };
}

/**
 * Underperforming checkpoint = at least 2 of 3 factors, and the grade factor
 * MUST be one of them (otherwise C/D + untitled journeymen mass-demote). Tuned
 * via lifecycleSim so ~3–5% of actives demote per year.
 *  1. Grade ≥ GRADE_GAP_THRESHOLD below role mean  (required)
 *  2. Ends checkpoint at tier C or D
 *  3. No split title AND no international title
 */
export function isUnderperformingSeason(
  outcome: {
    grade: number | null;
    tier: PlayerTier;
    splitTitles: number;
    intlTitles: number;
  },
  roleMean: number | null,
  gradeGap: number = GRADE_GAP_THRESHOLD,
): boolean {
  const gradeBelow =
    outcome.grade != null &&
    roleMean != null &&
    outcome.grade <= roleMean - gradeGap;
  if (!gradeBelow) return false;
  let hits = 1; // grade already counted
  if (outcome.tier === "C" || outcome.tier === "D") hits += 1;
  if (outcome.splitTitles <= 0 && outcome.intlTitles <= 0) hits += 1;
  return hits >= 2;
}

/** Update badStreak from this season's outcome. Intl title always resets. */
export function nextBadStreak(
  prev: number | undefined,
  outcome: {
    grade: number | null;
    tier: PlayerTier;
    splitTitles: number;
    intlTitles: number;
  },
  roleMean: number | null,
  gradeGap: number = GRADE_GAP_THRESHOLD,
): number {
  if (outcome.intlTitles > 0) return 0;
  if (isUnderperformingSeason(outcome, roleMean, gradeGap)) return (prev ?? 0) + 1;
  return 0;
}

export type EntrantSource = "rookie" | "academy" | "free-agent";

/** Why this entrant won the slot (FA auction / academy pass / rookie gate). */
export type MarketNote = FaMarketNote;

/** Offseason roster news: demotion + who entered (rookie vs returnee). */
export interface RosterNewsEvent {
  lane: Lane;
  departedName?: string;
  departedTier?: PlayerTier;
  departedAge?: number;
  departedId?: string;
  entrantName: string;
  entrantTier: PlayerTier;
  entrantPotential: PlayerTier;
  entrantId?: string;
  entrantSource: EntrantSource;
  /** Same-org academy available but passed for a clearly better FA. */
  passedAcademyName?: string;
  /** Rival FAs / incumbent beaten in bidding copy. */
  beatenNames?: string[];
  marketNote?: MarketNote;
  /**
   * Split / window label when the event happened (e.g. "Winter",
   * "First Stand window", "Offseason"). Optional for older saves.
   */
  timeMark?: string;
}

/** Stamp `timeMark` on news rows that lack one (additive; preserves existing). */
export function withRosterTimeMark<T extends { timeMark?: string }>(
  items: readonly T[],
  mark: string,
): T[] {
  if (!mark) return [...items];
  return items.map((n) => (n.timeMark ? n : { ...n, timeMark: mark }));
}

/** @deprecated Alias kept for older imports — prefer RosterNewsEvent. */
export type RookieDebut = RosterNewsEvent & {
  /** Legacy field names used by older UI — mapped from RosterNewsEvent. */
  retiredName?: string;
  retiredTier: PlayerTier;
  retiredAge?: number;
  rookieName: string;
  rookieTier: PlayerTier;
  rookiePotential: PlayerTier;
};

/** Adapt a RosterNewsEvent into the legacy RookieDebut shape for older UI. */
export function asRookieDebut(n: RosterNewsEvent): RookieDebut {
  return {
    ...n,
    ...(n.departedName ? { retiredName: n.departedName } : {}),
    retiredTier: n.departedTier ?? n.entrantTier,
    ...(n.departedAge != null ? { retiredAge: n.departedAge } : {}),
    rookieName: n.entrantName,
    rookieTier: n.entrantTier,
    rookiePotential: n.entrantPotential,
  };
}

export interface OffseasonTeamInput {
  id: string;
  name: string;
  players: readonly Player[];
  /** Region / league id — flavors generated handles. */
  leagueId?: string;
}

export interface OffseasonLifecycleResult {
  teams: { id: string; players: Player[] }[];
  inactivePool: InactivePlayer[];
  news: Array<RosterNewsEvent & { teamId: string }>;
}

/**
 * Pick a returnee for `teamId`'s open lane slot (mid-split / non-competitive).
 * Scores with transferValue when meta is available; academy pass-for-better-FA
 * still applies locally. Prefer same-org academy unless FA clears the gap.
 * `excludePlayerIds` blocks same-pass demotees from instant recall.
 */
function pickReturnee(
  pool: InactivePlayer[],
  lane: Lane,
  teamId: string,
  rng: RNG,
  byId: Map<number, Champion>,
  meta: SeasonMetaSnapshot,
  excludePlayerIds?: ReadonlySet<string>,
): {
  idx: number;
  entry: InactivePlayer;
  passedAcademyName?: string;
  marketNote?: MarketNote;
} | null {
  return pickScoredReturnee(pool, lane, teamId, byId, meta, rng, excludePlayerIds);
}

/** Age inactive players one year and advance academy → FA → retired.
 *
 * Counting is 1-based from demotion (`inactiveYears` starts at 1):
 *   demote → Academy 1y
 *   +1 year-end → Academy 2y
 *   +1 year-end → Academy 3y (typical soft max)
 *   +1 year-end → FA 1y  (or stay to 4y if high-value / graduate-capped)
 *   … FA 2y, 3y, 4y
 *   +1 year-end → Retired
 * Personal tenure: weak may hit FA after {@link ACADEMY_YEARS_MIN}; high-value
 * may stay through {@link ACADEMY_YEARS_MAX}. Soft default remains
 * {@link ACADEMY_YEARS}. Callers should run {@link applyAcademyGraduateCap}
 * after this to throttle synchronized waves.
 * So FA while `inactiveYears <= TOTAL_INACTIVE_BEFORE_RETIRE` (after snap),
 * else retired. Legacy saves with `inactiveYears === 0` are treated as 1
 * before incrementing.
 *
 * When `closingYear` is set, entries whose badge clock started that year
 * ({@link inactiveClockYear}) still age/tick shadow form but do **not**
 * increment `inactiveYears` or change status — their first calendar year on
 * the current clock must archive as Acy · 1y / FA · 1y, not burn 1→2 on the
 * same season it started. The clock is keyed off `clockYear` (not
 * `demotedYear`) so mid-year academy→FA snaps and FA→academy stashes get their
 * own first year too. Cohort desync rides on `academyTenureShift`
 * (graduation), never on a mint-time badge offset.
 *
 * Also ticks shadow grade, academy development, and light pool drift.
 * Academy tier growth is **only** via ACADEMY_DEV_CHANCE (slower than main
 * roster CHANGE_RATE) — call-up is the fast development path.
 */
export function advanceInactivePool(
  pool: readonly InactivePlayer[],
  rng: RNG,
  champions: readonly Champion[] = [],
  closingYear?: number,
): InactivePlayer[] {
  const out: InactivePlayer[] = [];
  for (const entry of pool) {
    if (entry.status === "retired") {
      out.push(entry);
      continue;
    }
    const tick = tickInactiveYear(entry, champions, rng);
    const perf = inactiveMarketGrade({
      ...entry,
      player: tick.player,
      shadowGrade: tick.shadowGrade,
    });
    // Academy: chronological age only — no agePlayer CHANGE_RATE growth/decline.
    // Slow ACADEMY_DEV_CHANCE is the affiliate track; main roster is the turbo.
    const aged =
      entry.status === "academy"
        ? { ...tick.player, age: (tick.player.age ?? 22) + 1 }
        : agePlayer(tick.player, perf, rng);

    // First calendar year on this clock: age only — keep badge years / status.
    if (closingYear != null && inactiveClockYear(entry) === closingYear) {
      out.push({
        ...entry,
        player: aged,
        shadowGrade: tick.shadowGrade,
      });
      continue;
    }

    // Normalize legacy 0-based storage to 1-based before the year-end tick.
    const baseYears = entry.inactiveYears < 1 ? 1 : entry.inactiveYears;
    const inactiveYears = baseYears + 1;
    let status: InactivePlayer["status"] = entry.status;
    if (status === "academy") {
      const tenure = academyTenureYears({
        ...entry,
        player: aged,
        inactiveYears,
        shadowGrade: tick.shadowGrade,
      });
      // Strict `>` so years 1…tenure stay academy.
      if (inactiveYears > tenure) status = "free-agent";
    }
    if (inactiveYears > TOTAL_INACTIVE_BEFORE_RETIRE) status = "retired";
    out.push({
      ...entry,
      player: aged,
      inactiveYears,
      status,
      shadowGrade: tick.shadowGrade,
    });
  }
  return out;
}

/**
 * Display years in academy (1…ACADEMY_YEARS_MAX while academy). Active → 0.
 * Legacy `inactiveYears === 0` academy rows display as 1y. FA/retired use soft
 * {@link ACADEMY_YEARS} (clock snaps to FA · 1y on transition).
 */
export function yearsInAcademy(
  status: CareerStatus | InactivePlayer["status"],
  inactiveYears: number,
): number {
  if (status === "active") return 0;
  if (status === "academy") return Math.min(ACADEMY_YEARS_MAX, Math.max(1, inactiveYears));
  return Math.min(Math.max(1, inactiveYears), ACADEMY_YEARS);
}

/**
 * Display years as free agent after academy (1…FREE_AGENT_YEARS).
 * `inactiveYears − ACADEMY_YEARS`, floored at 1 for FA/retired badges so a
 * just-transitioned FA never shows 0y. Clamped to FREE_AGENT_YEARS when retired.
 */
export function yearsAsFreeAgent(
  status: CareerStatus | InactivePlayer["status"],
  inactiveYears: number,
): number {
  if (status !== "free-agent" && status !== "retired") return 0;
  const raw = inactiveYears - ACADEMY_YEARS;
  if (raw <= 0) return status === "free-agent" ? 1 : 0;
  return Math.min(FREE_AGENT_YEARS, raw);
}

export interface DemotionPassOptions {
  /** When true, age each active before evaluating underperformance (year-end). */
  ageActives?: boolean;
  /** When true, advance academy → FA → retired on the unsigned pool (year-end). */
  advancePool?: boolean;
  gradeGap?: number;
  /** Current patch meta for poolFit / transferValue scoring. */
  meta?: SeasonMetaSnapshot;
  /**
   * Year-end: resolve FA fills league-wide (each FA once). Mid-split keeps
   * local scored fills when false.
   */
  competitiveMarket?: boolean;
  /**
   * Year-end: AI open FA replaces for clearly weaker lanes. Mid-split enables
   * this with a low {@link openFaAttemptChance} so sparse FA→main can fire
   * while academy stash remains the primary mid-season FA path. Deferred
   * followed teams stay skipped via {@link skipOpenFaTeamIds}.
   */
  openFaMarket?: boolean;
  /**
   * Per-team chance for {@link runOpenFaReplacePass} (default 1 = full
   * offseason window). Mid-split passes {@link AI_OPEN_FA_CHANCE_MID_SPLIT}.
   */
  openFaAttemptChance?: number;
  /**
   * AI academy release / stash / rookie intake. Defaults to {@link openFaMarket}.
   * Mid-split enables this (primary FA→academy stash) alongside light open FA.
   */
  academyMaintenance?: boolean;
  /**
   * Teams the AI open-FA / academy-maintenance passes must not touch (followed
   * team already shopped during the offseason / transfer window).
   */
  skipOpenFaTeamIds?: ReadonlySet<string>;
  /**
   * Franchise year for **new mints only** (rookie `debutYear` / academy
   * intake). Defaults to `year`. Year-end passes `nextYear` so intake belongs
   * to the upcoming season; every cut / demote / clock restart in the same
   * pass keeps `year` (= closing year) so it archives with the year that
   * closed.
   */
  intakeYear?: number;
  /**
   * Soft FA auction boost (player agency / user priority). Added to bid value
   * in {@link resolveCompetitiveFills} so stars prefer stronger orgs.
   */
  faBidBoost?: (
    fa: import("./faMarket").MarketInactive,
    vacancy: import("./faMarket").MarketVacancy,
  ) => number;
}

/**
 * Demotion pass: evaluate underperformance streaks, demote to academy, fill
 * slots via scored academy/FA market (competitive at year-end). Used mid-split
 * (no aging / no pool advance; optional academy maintenance) and at the
 * year-end offseason (with aging + pool advance + optional open FA window).
 *
 * `year` is the closing / current franchise year: it stamps every demotion /
 * cut / clock restart and keys the inactive-pool advance skip. Only brand-new
 * mints use {@link DemotionPassOptions.intakeYear} when set.
 */
export function runDemotionPass(
  teams: readonly OffseasonTeamInput[],
  outcomesById: Map<string, SeasonPlayerOutcome>,
  roleMeans: Partial<Record<Lane, number | null>>,
  inactivePoolIn: readonly InactivePlayer[],
  champions: readonly Champion[],
  rng: RNG,
  taken: Set<string>,
  year: number,
  opts: DemotionPassOptions = {},
): OffseasonLifecycleResult {
  const gradeGap = opts.gradeGap ?? GRADE_GAP_THRESHOLD;
  const ageActives = opts.ageActives ?? false;
  const advancePool = opts.advancePool ?? false;
  const meta = opts.meta ?? NEUTRAL_META;
  const byId = new Map(champions.map((c) => [c.id, c]));
  const competitive = opts.competitiveMarket ?? advancePool;
  const openFa = opts.openFaMarket ?? advancePool;
  const academyMaint = opts.academyMaintenance ?? openFa;
  const mintYear = opts.intakeYear ?? year;

  // Advance the *existing* unsigned pool before demotions so a player demoted
  // this offseason starts at inactiveYears=1 (Academy · 1y) and still gets
  // three full year-end advances before FA (1→2→3 academy, 3→4 FA). Advancing
  // after demote would burn 1→2 in the same pass and shorten academy stay.
  // Skip the year clock for entries whose badge clock started in `year` so
  // opening academy seeds archive as Acy · 1y on their first season.
  const news: Array<RosterNewsEvent & { teamId: string }> = [];
  let pool: InactivePlayer[];
  // Heal ghost copies (same id on roster + inactive pool) before demotion /
  // market so academy develop never surfaces as Out→In of the same player.
  const reconciled = reconcileRosterPoolDuplicates(
    teams.map((t) => ({ id: t.id, players: [...t.players] })),
    inactivePoolIn as MarketInactive[],
  );
  const teamsIn = teams.map((t) => {
    const healed = reconciled.teams.find((x) => x.id === t.id);
    return healed ? { ...t, players: healed.players } : t;
  });
  const inactiveHealed = reconciled.inactivePool as InactivePlayer[];
  for (const entry of inactivePoolIn) {
    if (entry.player.name) taken.add(entry.player.name);
  }

  if (advancePool) {
    // Saves written before `clockYear` existed heal here (one pass, in place)
    // so this year-end already keys the badge skip off the new field.
    const before = backfillInactiveClockYears(inactiveHealed);
    let advanced = advanceInactivePool(before, rng, champions, year);
    // Structural desync: league-wide graduate cap, then soft FA pressure valves.
    advanced = applyAcademyGraduateCap(before, advanced);
    advanced = applyFaGraduatePressure(before, advanced);
    advanced = cullWeakFaWhenOversized(advanced);
    pool = advanced;
    // Announce academy → FA and new retirements from the year-end clock.
    const beforeById = new Map(
      before.filter((e) => e.player.id).map((e) => [e.player.id!, e] as const),
    );
    for (const after of pool) {
      if (!after.player.id) continue;
      const prev = beforeById.get(after.player.id);
      if (after.status === "free-agent" && prev?.status === "academy") {
        news.push(makeBecameFaNews(after as MarketInactive, "became-fa"));
      } else if (after.status === "retired" && prev && prev.status !== "retired") {
        news.push(makeRetiredNews(after as MarketInactive));
      }
    }
  } else {
    pool = backfillInactiveClockYears(inactiveHealed);
  }
  const resultTeams: { id: string; players: (Player | null)[] }[] = [];
  const vacancies: MarketVacancy[] = [];
  // Players demoted this pass must not fill vacancies (no leave→instant return).
  const samePassDemoteIds = new Set<string>();

  for (const team of teamsIn) {
    const nextPlayers: (Player | null)[] = [];
    for (let slotIndex = 0; slotIndex < team.players.length; slotIndex++) {
      const p = team.players[slotIndex]!;
      if (p.name) taken.add(p.name);
      const outcome = p.id ? outcomesById.get(p.id) : undefined;
      const grade = outcome?.grade ?? null;
      const base = ageActives ? agePlayer(p, grade, rng) : p;
      const laneMean = roleMeans[base.lane] ?? null;
      const streak = nextBadStreak(
        base.badStreak,
        {
          grade,
          tier: base.tier,
          splitTitles: outcome?.splitTitles ?? 0,
          intlTitles: outcome?.intlTitles ?? 0,
        },
        laneMean,
        gradeGap,
      );
      const withStreak = { ...base, badStreak: streak };

      if (streak >= UNDERPERFORM_STREAK_TO_DEMOTE && withStreak.id) {
        samePassDemoteIds.add(withStreak.id);
        // Cap: bump oldest academy → FA if this org is already at max.
        const parked = addToTeamAcademy(pool, {
          player: { ...withStreak, badStreak: 0 },
          status: "academy",
          // 1-based: badge shows Academy · 1y on demotion day.
          inactiveYears: 1,
          demotedYear: year,
          clockYear: year,
          lastTeamId: team.id,
          lastTeamName: team.name,
          ...(grade != null ? { lastActiveGrade: grade, shadowGrade: grade } : {}),
        });
        pool = parked.pool;
        if (parked.bumped) news.push(makeBecameFaNews(parked.bumped, "academy-bump"));
        vacancies.push({
          teamId: team.id,
          teamName: team.name,
          leagueId: team.leagueId,
          lane: withStreak.lane,
          slotIndex: nextPlayers.length,
          ...(withStreak.name ? { departedName: withStreak.name } : {}),
          departedTier: withStreak.tier,
          ...(withStreak.age != null ? { departedAge: withStreak.age } : {}),
          departedId: withStreak.id,
          departedGrade: grade,
        });
        nextPlayers.push(null);
      } else {
        nextPlayers.push(withStreak);
      }
    }
    resultTeams.push({ id: team.id, players: nextPlayers });
  }

  const teamIndex = new Map(resultTeams.map((t, i) => [t.id, i]));

  if (competitive && vacancies.length > 0) {
    const { fills, remainingPool } = resolveCompetitiveFills(
      vacancies,
      pool,
      byId,
      meta,
      rng,
      samePassDemoteIds,
      opts.faBidBoost,
    );
    pool = remainingPool;
    for (const fill of fills) {
      const ti = teamIndex.get(fill.vacancy.teamId);
      if (ti == null || !fill.entrant) continue;
      if (fill.entrant.name) taken.add(fill.entrant.name);
      resultTeams[ti]!.players[fill.vacancy.slotIndex] = fill.entrant;
      const fillNews = {
        teamId: fill.vacancy.teamId,
        lane: fill.vacancy.lane,
        ...(fill.vacancy.departedName ? { departedName: fill.vacancy.departedName } : {}),
        ...(fill.vacancy.departedTier ? { departedTier: fill.vacancy.departedTier } : {}),
        ...(fill.vacancy.departedAge != null ? { departedAge: fill.vacancy.departedAge } : {}),
        ...(fill.vacancy.departedId ? { departedId: fill.vacancy.departedId } : {}),
        entrantName: fill.entrant.name ?? "",
        entrantTier: fill.entrant.tier,
        entrantPotential: fill.entrant.potential ?? fill.entrant.tier,
        ...(fill.entrant.id ? { entrantId: fill.entrant.id } : {}),
        entrantSource: fill.source,
        ...(fill.passedAcademyName ? { passedAcademyName: fill.passedAcademyName } : {}),
        ...(fill.beatenNames ? { beatenNames: fill.beatenNames } : {}),
        ...(fill.marketNote ? { marketNote: fill.marketNote } : {}),
      };
      if (!isSamePlayerReplaceNoise(fillNews)) news.push(fillNews);
    }
  } else {
    // Mid-split: local scored fill per vacancy (academy/FA only — no main-roster mint).
    for (const v of vacancies) {
      const ti = teamIndex.get(v.teamId);
      if (ti == null) continue;
      const pick = pickReturnee(
        pool,
        v.lane,
        v.teamId,
        rng,
        byId,
        meta,
        samePassDemoteIds,
      );
      if (!pick) continue; // leave null — academy-first mint / retry / safety below
      const [takenEntry] = pool.splice(pick.idx, 1);
      const entrant = applyComebackRust(
        takenEntry!.player,
        takenEntry!.inactiveYears,
        v.leagueId,
      );
      const source: EntrantSource =
        takenEntry!.status === "academy" ? "academy" : "free-agent";
      if (entrant.name) taken.add(entrant.name);
      resultTeams[ti]!.players[v.slotIndex] = entrant;
      const midNews = {
        teamId: v.teamId,
        lane: v.lane,
        ...(v.departedName ? { departedName: v.departedName } : {}),
        ...(v.departedTier ? { departedTier: v.departedTier } : {}),
        ...(v.departedAge != null ? { departedAge: v.departedAge } : {}),
        ...(v.departedId ? { departedId: v.departedId } : {}),
        entrantName: entrant.name ?? "",
        entrantTier: entrant.tier,
        entrantPotential: entrant.potential ?? entrant.tier,
        ...(entrant.id ? { entrantId: entrant.id } : {}),
        entrantSource: source,
        ...(pick.passedAcademyName ? { passedAcademyName: pick.passedAcademyName } : {}),
        ...(pick.marketNote ? { marketNote: pick.marketNote } : {}),
      };
      if (!isSamePlayerReplaceNoise(midNews)) news.push(midNews);
    }
  }

  // Academy-first vacancy mint: park a prospect in org academy, then call them
  // up into the open slot (never a direct main-roster rookie-gate).
  const vacancyBySlot = new Map(
    vacancies.map((v) => [`${v.teamId}:${v.slotIndex}`, v] as const),
  );
  for (const t of resultTeams) {
    const src = teamsIn.find((x) => x.id === t.id);
    for (let i = 0; i < t.players.length; i++) {
      if (t.players[i]) continue;
      const lane = src?.players[i]?.lane ?? LANE_KEYS[i]!;
      const vac = vacancyBySlot.get(`${t.id}:${i}`);
      if (!teamAcademyHasRoom(pool, t.id)) continue;
      const rook = makeRookie(lane, champions, rng, taken, src?.leagueId);
      rook.debutYear = mintYear;
      const parked = executeAddAcademyRookie(
        pool,
        t.id,
        src?.name ?? t.id,
        rook,
        mintYear,
      );
      if (!parked.ok) continue;
      // Immediately call up the just-minted academy prospect into the vacancy.
      pool = parked.inactivePool.filter((e) => e.player.id !== rook.id);
      t.players[i] = rook;
      const mintNews = {
        teamId: t.id,
        lane,
        ...(vac?.departedName ? { departedName: vac.departedName } : {}),
        ...(vac?.departedTier ? { departedTier: vac.departedTier } : {}),
        ...(vac?.departedAge != null ? { departedAge: vac.departedAge } : {}),
        ...(vac?.departedId ? { departedId: vac.departedId } : {}),
        entrantName: rook.name ?? "",
        entrantTier: rook.tier,
        entrantPotential: rook.potential ?? rook.tier,
        ...(rook.id ? { entrantId: rook.id } : {}),
        entrantSource: "academy" as const,
        marketNote: "academy-rookie" as const,
      };
      if (!isSamePlayerReplaceNoise(mintNews)) news.push(mintNews);
    }
  }

  let finalTeams: { id: string; players: Player[] }[] = resultTeams.map((t) => ({
    id: t.id,
    // Temporary: keep safety for open-FA / academy-maint which need full rosters.
    // True safety-rookie mint happens only after academy maintenance below.
    players: t.players.map((p, i) => {
      if (p) return p;
      const src = teamsIn.find((x) => x.id === t.id);
      const lane = src?.players[i]?.lane ?? LANE_KEYS[i]!;
      const vac = vacancyBySlot.get(`${t.id}:${i}`);
      const rook = makeRookie(lane, champions, rng, taken, src?.leagueId);
      rook.debutYear = mintYear;
      news.push({
        teamId: t.id,
        lane,
        ...(vac?.departedName ? { departedName: vac.departedName } : {}),
        ...(vac?.departedTier ? { departedTier: vac.departedTier } : {}),
        ...(vac?.departedAge != null ? { departedAge: vac.departedAge } : {}),
        ...(vac?.departedId ? { departedId: vac.departedId } : {}),
        entrantName: rook.name ?? "",
        entrantTier: rook.tier,
        entrantPotential: rook.potential ?? rook.tier,
        ...(rook.id ? { entrantId: rook.id } : {}),
        entrantSource: "rookie",
        // Hard safety only: academy was full / mint failed — games need 5 bodies.
        marketNote: "rookie-gate",
      });
      return rook;
    }),
  }));

  if (openFa) {
    const opened = runOpenFaReplacePass(
      finalTeams.map((t) => {
        const src = teamsIn.find((x) => x.id === t.id);
        return {
          id: t.id,
          name: src?.name ?? t.id,
          leagueId: src?.leagueId,
          players: t.players,
        };
      }),
      pool,
      byId,
      meta,
      outcomesById,
      rng,
      // Cut incumbents belong to the closing year, not the upcoming intake.
      year,
      {
        ...(opts.skipOpenFaTeamIds ? { skipTeamIds: opts.skipOpenFaTeamIds } : {}),
        ...(opts.openFaAttemptChance != null
          ? { attemptChance: opts.openFaAttemptChance }
          : {}),
      },
    );
    finalTeams = opened.teams;
    pool = opened.inactivePool;
    news.push(...opened.news);
  }

  if (academyMaint) {
    const makeTeamInputs = (rosters: { id: string; players: Player[] }[]) =>
      rosters.map((t) => {
        const src = teamsIn.find((x) => x.id === t.id);
        return {
          id: t.id,
          name: src?.name ?? t.id,
          leagueId: src?.leagueId,
          players: t.players,
        };
      });
    const skipOpts = opts.skipOpenFaTeamIds
      ? { skipTeamIds: opts.skipOpenFaTeamIds }
      : undefined;
    const midSplit = !advancePool;
    // Affiliate call-ups over weak starters (looser gap + promote chance).
    // Never re-call same-pass demotees (leave→instant return).
    const promoted = runOpenAcademyReplacePass(
      makeTeamInputs(finalTeams),
      pool,
      byId,
      meta,
      outcomesById,
      rng,
      // Displaced incumbents are cuts from the closing year.
      year,
      {
        ...(skipOpts ?? {}),
        ...(samePassDemoteIds.size > 0
          ? { excludePlayerIds: samePassDemoteIds }
          : {}),
      },
    );
    finalTeams = promoted.teams;
    pool = promoted.inactivePool;
    news.push(...promoted.news);
    const teamInputs = makeTeamInputs(finalTeams);
    // Rare declutter: strategic academy→FA near the cap (feeds FA pool).
    const released = runAiAcademyReleasePass(
      teamInputs,
      pool,
      byId,
      meta,
      rng,
      year,
      skipOpts,
    );
    pool = released.inactivePool;
    news.push(...released.news);
    // Stash desirable FAs the roster does not need (respects academy cap;
    // skips when FA board is thin). Mid-split uses a lighter chance.
    // Clock restarts on the closing year — an intake-year stamp would freeze
    // the new Acy · 1y badge for two seasons.
    const stashed = runAiAcademyStashPass(
      teamInputs,
      pool,
      byId,
      meta,
      rng,
      year,
      {
        ...(skipOpts ?? {}),
        midSplit,
      },
    );
    pool = stashed.inactivePool;
    news.push(...stashed.news);
    // Mint academy rookies when FA is thin or org academy is shallow.
    // Mid-split uses a lower chance + yearly cap (see runAiAcademyRookiePass).
    const rookied = runAiAcademyRookiePass(
      teamInputs,
      pool,
      champions,
      rng,
      taken,
      mintYear,
      {
        ...(skipOpts ?? {}),
        midSplit,
      },
    );
    pool = rookied.inactivePool;
    news.push(...rookied.news);
  }

  return { teams: finalTeams, inactivePool: pool, news };
}

/**
 * AI: park a generated rookie into academy (not main roster) when the org has
 * room and either the FA board is thin ({@link AI_ACADEMY_ROOKIE_FA_THIN},
 * offseason only) or academy depth is low ({@link AI_ACADEMY_ROOKIE_DEPTH_BELOW}).
 * At most {@link MAX_AI_ACADEMY_ROOKIE_PER_TEAM} per team per calendar year
 * (counted via {@link countAcademyRookiesMintedInYear}). Mid-split uses
 * {@link AI_ACADEMY_ROOKIE_CHANCE_MID_SPLIT} and depth-only eligibility.
 */
export function runAiAcademyRookiePass(
  teams: { id: string; name: string; leagueId?: string }[],
  pool: InactivePlayer[],
  champions: readonly Champion[],
  rng: RNG,
  taken: Set<string>,
  year: number,
  opts?: { skipTeamIds?: ReadonlySet<string>; midSplit?: boolean },
): {
  inactivePool: InactivePlayer[];
  news: Array<RosterNewsEvent & { teamId: string }>;
} {
  let working: InactivePlayer[] = [...pool];
  const news: Array<RosterNewsEvent & { teamId: string }> = [];
  const skip = opts?.skipTeamIds;
  const midSplit = opts?.midSplit ?? false;
  const chance = midSplit ? AI_ACADEMY_ROOKIE_CHANCE_MID_SPLIT : AI_ACADEMY_ROOKIE_CHANCE;
  const faCount = working.filter((e) => e.status === "free-agent").length;
  const faThin = !midSplit && faCount < AI_ACADEMY_ROOKIE_FA_THIN;

  for (const team of teams) {
    if (skip?.has(team.id)) continue;
    if (countAcademyRookiesMintedInYear(working, team.id, year) >= MAX_AI_ACADEMY_ROOKIE_PER_TEAM) {
      continue;
    }
    if (!teamAcademyHasRoom(working, team.id)) continue;
    const acyN = countTeamAcademy(working, team.id);
    const needDepth = acyN < AI_ACADEMY_ROOKIE_DEPTH_BELOW;
    if (!faThin && !needDepth) continue;
    if (rng() > chance) continue;

    const lane = shallowestAcademyLane(working, team.id, LANE_ORDER, rng);
    const rook = makeRookie(lane, champions, rng, taken, team.leagueId);
    rook.debutYear = year;
    const res = executeAddAcademyRookie(working, team.id, team.name, rook, year);
    if (!res.ok) continue;
    working = res.inactivePool as InactivePlayer[];
    news.push(...(res.news as Array<RosterNewsEvent & { teamId: string }>));
  }

  return { inactivePool: working, news };
}

/**
 * Full league offseason: age actives, evaluate demotions, competitive FA
 * market, open FA replaces, advance the inactive pool.
 */
export function runOffseasonLifecycle(
  teams: readonly OffseasonTeamInput[],
  outcomesById: Map<string, SeasonPlayerOutcome>,
  roleMeans: Partial<Record<Lane, number | null>>,
  inactivePoolIn: readonly InactivePlayer[],
  champions: readonly Champion[],
  rng: RNG,
  taken: Set<string>,
  year: number,
  gradeGap: number = GRADE_GAP_THRESHOLD,
  meta: SeasonMetaSnapshot = NEUTRAL_META,
  opts?: {
    openFaMarket?: boolean;
    skipOpenFaTeamIds?: ReadonlySet<string>;
    /** Upcoming franchise year for new mints; defaults to `year`. */
    intakeYear?: number;
    faBidBoost?: DemotionPassOptions["faBidBoost"];
  },
): OffseasonLifecycleResult {
  return runDemotionPass(
    teams,
    outcomesById,
    roleMeans,
    inactivePoolIn,
    champions,
    rng,
    taken,
    year,
    {
      ageActives: true,
      advancePool: true,
      gradeGap,
      meta,
      competitiveMarket: true,
      openFaMarket: opts?.openFaMarket ?? true,
      ...(opts?.skipOpenFaTeamIds ? { skipOpenFaTeamIds: opts.skipOpenFaTeamIds } : {}),
      ...(opts?.intakeYear != null ? { intakeYear: opts.intakeYear } : {}),
      ...(opts?.faBidBoost ? { faBidBoost: opts.faBidBoost } : {}),
    },
  );
}

/**
 * @deprecated Prefer runOffseasonLifecycle. Kept for call sites that only
 * age a single roster without demotion/pool (tests / aging-off paths).
 * Never demotes — ages in place; does not replace anyone.
 */
export function offseasonEvolveRoster(
  roster: readonly Player[],
  gradesByLane: readonly (number | null)[],
  champions: readonly Champion[],
  rng: RNG,
  taken: Set<string>,
  debuts?: RookieDebut[],
  debutYear?: number,
): Player[] {
  // Legacy behavior for tests that still expect age-forced retirement was
  // replaced: we age everyone and never drop slots. `debuts` stays empty.
  void champions;
  void debuts;
  void debutYear;
  return roster.map((p, i) => {
    if (p.name) taken.add(p.name);
    return agePlayer(p, gradesByLane[i] ?? null, rng);
  });
}

export const ALL_TIERS = PLAYER_TIERS;
