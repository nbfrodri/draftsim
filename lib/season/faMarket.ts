// Academy / free-agent market: transferValue scoring, shadow form, league-wide
// FA contention, academy pass-for-better-FA, open FA replaces, and board helpers.
// Kept separate from playerLifecycle year-counting so both can evolve without
// stepping on each other. Does NOT import playerLifecycle (avoids cycles).

import type { Champion, Lane, Player, PlayerTier } from "../types";
import { PLAYER_TIER_VALUE, valueToTier, type RNG } from "../players";
import { transferValue, poolFit } from "./transfers";
import type { SeasonMetaSnapshot } from "./types";
import { driftPlayerPool } from "./poolDrift";

/** Mirror of lifecycle constants — keep in sync with playerLifecycle.ts. */
const ACADEMY_YEARS = 3;
const TOTAL_INACTIVE_BEFORE_RETIRE = 7; // ACADEMY_YEARS + FREE_AGENT_YEARS (4)
const FREE_AGENT_YEARS = TOTAL_INACTIVE_BEFORE_RETIRE - ACADEMY_YEARS;
/**
 * Earliest academy→FA for weak depth (personal tenure floor).
 * Soft default remains {@link ACADEMY_YEARS} (3); hard ceiling {@link ACADEMY_YEARS_MAX}.
 */
export const ACADEMY_YEARS_MIN = 2;
/** Hard academy ceiling — surplus past soft max may grace once, then must exit. */
export const ACADEMY_YEARS_MAX = 4;
/**
 * League-wide max academy→FA transitions per year-end advance. Main anti-wave
 * tool: synchronized soft-max cohorts drip across years instead of dumping.
 * Tuned for ~40–60 teams (~TARGET_FA_POOL board depth).
 */
export const ACADEMY_GRADUATE_CAP_PER_YEAR = 16;
/** Pressure-value below this → personal tenure {@link ACADEMY_YEARS_MIN}.
 *  Catches D / ice-cold C; typical C (~−1.35) stays soft 3. */
export const ACADEMY_EARLY_EXIT_MAX_VALUE = -1.6;
/** Pressure-value at/above → personal tenure {@link ACADEMY_YEARS_MAX} (A+). */
export const ACADEMY_EXTEND_MIN_VALUE = 1.25;

export type MarketEntrantSource = "rookie" | "academy" | "free-agent";
export type MarketNote =
  | "academy-pass"
  | "academy-recall"
  | "fa-sign"
  /** User signed an FA into the org academy (not main roster). */
  | "fa-academy"
  /** AI stashed a desirable FA into academy when roster did not need them. */
  | "academy-stash"
  /** User/AI released an academy player to free agency. */
  | "academy-release"
  /** Cap bump: longest-tenured academy → FA to free a slot. */
  | "academy-bump"
  /** Year-end academy clock expired → free agent. */
  | "became-fa"
  /** Generated rookie parked directly into org academy (not main roster). */
  | "academy-rookie"
  /** Unsigned inactive path ended (FA max / graduate overflow / cull). */
  | "retired"
  | "rookie-gate"
  | "open-fa"
  /** Followed-team manual bench — slot left open until FA / academy / AI fill. */
  | "manual-demote"
  /** Followed-team AI-decide voluntary bench (same window as manual-demote). */
  | "ai-demote"
  /** Agency: main-roster player left for preferred org / FA. */
  | "agency-leave"
  /** Agency: prospect demanded and received a call-up. */
  | "agency-callup"
  /** Agency: academy prospect departed to another org / FA. */
  | "agency-depart"
  /** Agency: user overrode a leave/call-up demand (player stayed). */
  | "agency-override"
  /** Agency: FA preferred this org (or user priority signed them). */
  | "agency-sign";

/** Minimal inactive shape used by the market (compatible with MarketInactive). */
export interface MarketInactive {
  player: Player;
  status: "academy" | "free-agent" | "retired";
  inactiveYears: number;
  /**
   * Franchise year the player left the **main roster** (demote / cut / mint).
   * Stable identity used by archive filters and Hall tenure rows — it is NOT
   * the badge clock. Moves inside the inactive path (academy → FA, FA →
   * academy stash) keep it and reset {@link clockYear} instead.
   */
  demotedYear: number;
  /**
   * Franchise year {@link inactiveYears} was last (re)set to its 1-based
   * start. Year-end {@link advanceInactivePool} skips the badge tick when this
   * equals the closing year, so a clock started mid-year archives at ·1y
   * instead of burning 1→2 the same season. Missing on pre-clockYear saves —
   * always read via {@link inactiveClockYear}.
   */
  clockYear?: number;
  lastTeamId: string;
  lastTeamName?: string;
  lastActiveGrade?: number | null;
  shadowGrade?: number | null;
  /**
   * Personal offset on the value-based academy stay ({@link academyTenureYears}).
   * Desyncs graduation waves *without* faking the badge clock — the opening
   * cohort stagger uses −1 so half the seed graduates a year early while every
   * mint still starts (and archives) at Academy · 1y.
   */
  academyTenureShift?: number;
}

/**
 * Year the badge clock started for `entry`. Falls back to `demotedYear` for
 * saves written before `clockYear` existed (same value for every entry whose
 * clock never moved inside the inactive path).
 */
export function inactiveClockYear(entry: {
  clockYear?: number;
  demotedYear: number;
}): number {
  return entry.clockYear ?? entry.demotedYear;
}

export interface MarketTeamInput {
  id: string;
  name: string;
  players: readonly Player[];
  leagueId?: string;
}

export interface MarketNewsEvent {
  teamId: string;
  lane: Lane;
  departedName?: string;
  departedTier?: PlayerTier;
  departedAge?: number;
  departedId?: string;
  entrantName: string;
  entrantTier: PlayerTier;
  entrantPotential: PlayerTier;
  entrantId?: string;
  entrantSource: MarketEntrantSource;
  passedAcademyName?: string;
  beatenNames?: string[];
  marketNote?: MarketNote;
  /** Split / window label — stamped by franchise when appended to rosterNews. */
  timeMark?: string;
}

// ── Tunable knobs ───────────────────────────────────────────────────────────
/**
 * FA must beat same-org academy by this transferValue gap to win a vacancy.
 * Raised from 0.8 → 1.05 so affiliate recalls lock unless FA is clearly better.
 */
export const ACADEMY_PASS_GAP = 1.05;
/**
 * Returnee below this value loses to the rookie / mint path (weak FA / cold).
 * Loosened from -0.35 → -0.55 so mid academy still fills vacancies.
 */
export const ROOKIE_VALUE_FLOOR = -0.55;
/**
 * AI/user open-market: FA must beat incumbent by this much (tight FA valve).
 * Unchanged — academy call-ups use {@link ACADEMY_OPEN_REPLACE_GAP} instead.
 */
export const FA_OPEN_REPLACE_GAP = 0.9;
/**
 * Academy call-up / AI promote vs incumbent transferValue gain required.
 * Was sharing FA's 0.9 bar; lowered to 0.55 so modest upgrades over weak
 * starters fire more often without loosening FA signs.
 */
export const ACADEMY_OPEN_REPLACE_GAP = 0.55;
/** Max AI open-market FA replaces per team per offseason. */
export const MAX_OPEN_FA_REPLACES_PER_TEAM = 1;
/** Max AI academy→roster promotes per team per academy-promote pass. */
export const MAX_OPEN_ACADEMY_PROMOTES_PER_TEAM = 1;
/**
 * Per-team chance the AI attempts an academy promote when a clear upgrade
 * exists (mid-split / offseason academy maintenance). Raised willingness
 * without guaranteeing a promote every checkpoint.
 */
export const AI_ACADEMY_PROMOTE_CHANCE = 0.62;
/** Max user FA signs (followed team) per offseason window. */
export const USER_MAX_FA_SIGNS = 2;
/**
 * Max manual bench/demotes the followed team may make per shopping window
 * (mid-season transfer or post-Worlds offseason). Same budget as FA signs —
 * enough to reshape 1–2 lanes without emptying the roster.
 */
export const USER_MAX_MANUAL_DEMOTES = 2;
/**
 * Max academy players per org (`status === "academy"` && `lastTeamId`), any
 * lane mix. Role-independent — total ≤ this per team.
 */
export const ACADEMY_MAX_PER_TEAM = 5;
/**
 * Rookies parked in each org academy when a reality starts (aging on).
 * Kept at 2 (was 3) so year-3 academy→FA waves don't flood the FA board.
 * Must stay ≤ {@link ACADEMY_MAX_PER_TEAM}.
 */
export const INITIAL_ACADEMY_ROOKIES_PER_TEAM = 2;
/** Max AI FA→academy stashes per team per open-FA / stash pass. */
export const MAX_AI_ACADEMY_STASH_PER_TEAM = 1;
/**
 * Minimum inactiveTransferValue for AI to stash an FA in academy when the
 * main roster does not need them (no open-replace win on that lane).
 * Lowered 1.15 → 0.55 so solid B+/A board depth parks in academy instead of
 * sitting unsigned — FA→academy is the default mid-season path.
 */
export const AI_ACADEMY_STASH_MIN_VALUE = 0.55;
/**
 * Per-team chance the AI attempts an FA→academy stash when eligible
 * (offseason / default). High — year-end is the big academy stock window.
 */
export const AI_ACADEMY_STASH_CHANCE = 0.78;
/**
 * Mid-split stash willingness (3 checkpoints/year). Lower than offseason so
 * FA board isn't drained every international, but high enough that mid-season
 * FA→academy news actually appears.
 */
export const AI_ACADEMY_STASH_CHANCE_MID_SPLIT = 0.42;
/**
 * Per-team chance an AI open-FA roster replace is attempted at a mid-split
 * checkpoint. Sparse on purpose — FA→main stays rare vs academy stash;
 * {@link FA_OPEN_REPLACE_GAP} stays the strict upgrade bar.
 */
export const AI_OPEN_FA_CHANCE_MID_SPLIT = 0.14;
/** Max AI academy→FA releases per team per maintenance pass. */
export const MAX_AI_ACADEMY_RELEASE_PER_TEAM = 1;
/**
 * AI may release when org academy is at least this full (near-cap declutter).
 * 3 (was 4) so weak depth leaves gradually before the year-3 dump.
 */
export const AI_ACADEMY_RELEASE_MIN_COUNT = 3;
/**
 * Soft value ceiling: low transferValue / cold meta still qualifies alone.
 * Higher-value players can still be released when same-lane depth or aging
 * cold-shadow scores clear {@link AI_ACADEMY_RELEASE_MIN_SCORE}.
 */
export const AI_ACADEMY_RELEASE_MAX_VALUE = 0.55;
/** Minimum strategic score to release (see {@link academyReleaseScore}). */
export const AI_ACADEMY_RELEASE_MIN_SCORE = 1.75;
/**
 * Chance an eligible near-full team releases one academy player. Raised so
 * year-2/3 weak pieces drip into FA instead of a synchronized year-3 wave.
 * Tuned with {@link TARGET_FA_POOL} — demotion rates stay untouched.
 */
export const AI_ACADEMY_RELEASE_CHANCE = 0.36;
/**
 * Target unsigned FA count in a full multi-region league (~40–60 teams,
 * ~200–300 actives). Enough board depth for orgs to stock academy (N/5)
 * without starving vacancy fills. Fed by academy clock → FA, cap bumps,
 * and strategic AI release — not by raising demotion rates.
 *
 * Pressure valves (see {@link applyAcademyGraduateCap} /
 * {@link applyFaGraduatePressure} / {@link cullWeakFaWhenOversized}):
 * - League-wide {@link ACADEMY_GRADUATE_CAP_PER_YEAR} caps academy→FA waves
 * - FA ≥ {@link TARGET_FA_POOL}.max → weak academy graduates retire instead
 * - FA > {@link FA_OVERFLOW_ACCEL_ABOVE} → weak long-tenure FA retire early
 */
export const TARGET_FA_POOL = { min: 22, max: 48 };
/**
 * Unsigned free agents seeded when a reality starts (aging on).
 * Matches {@link TARGET_FA_POOL}.min so year-1 boards have usable depth
 * without waiting for academy→FA waves (~1 FA per ~2–3 teams in a
 * 40–60 team league). Tunable — keep near the FA board floor.
 */
export const INITIAL_OPENING_FA_POOL = TARGET_FA_POOL.min;
/**
 * When unsigned FA count is already ≥ {@link TARGET_FA_POOL}.max at year-end
 * academy→FA, keep at most this many new graduates (highest value); the rest
 * retire instead of joining the FA board.
 */
export const FA_OVERFLOW_KEEP_GRADUATES = 6;
/**
 * When FA count exceeds this after year-end advance, cull lowest-value FAs
 * that already have ≥2 FA years until count ≤ {@link TARGET_FA_POOL}.max.
 */
export const FA_OVERFLOW_ACCEL_ABOVE = TARGET_FA_POOL.max + 8;
/**
 * Max AI academy-rookie intakes per team per calendar year (across mid-split
 * + offseason maintenance passes). Counted via debutYear === year academy
 * rows (opening seed in year 1 already fills this budget).
 */
export const MAX_AI_ACADEMY_ROOKIE_PER_TEAM = 1;
/**
 * When FA pool is below this, AI may mint an academy rookie if the org has
 * room (depth without draining the FA board). Offseason only — mid-split
 * intake is depth-driven.
 */
export const AI_ACADEMY_ROOKIE_FA_THIN = TARGET_FA_POOL.min;
/** Chance an eligible team takes an academy rookie (offseason / default). */
export const AI_ACADEMY_ROOKIE_CHANCE = 0.22;
/**
 * Mid-split academy-rookie chance (lower than offseason so 3 checkpoints/year
 * don't refill every org).
 */
export const AI_ACADEMY_ROOKIE_CHANCE_MID_SPLIT = 0.08;
/** Also consider academy rookies when org academy is below this count. */
export const AI_ACADEMY_ROOKIE_DEPTH_BELOW = 2;
/**
 * Soft ceiling for followed-team "Add academy rookie" — leaves one slot for
 * demotion parking so user mints don't force year-3 bumps into FA. Hard cap
 * remains {@link ACADEMY_MAX_PER_TEAM} for demotes / FA→academy.
 */
export const USER_ACADEMY_ROOKIE_SOFT_MAX = ACADEMY_MAX_PER_TEAM - 1;

/** Roster stub while a manual demote leaves a lane open. */
export const VACANCY_ID_PREFIX = "__vacancy__";

export function isRosterVacancy(p: Player | null | undefined): boolean {
  return !!p?.id?.startsWith(VACANCY_ID_PREFIX);
}

/** Placeholder kept in a roster slot until FA / academy recall / AI fill. */
export function makeVacancyPlaceholder(lane: Lane): Player {
  return {
    id: `${VACANCY_ID_PREFIX}${lane}`,
    lane,
    tier: "D",
    goodChamps: [],
    badChamps: [],
  };
}

/** Count of academy players belonging to `teamId` (`lastTeamId` match). */
export function countTeamAcademy(
  pool: readonly MarketInactive[],
  teamId: string,
): number {
  let n = 0;
  for (const e of pool) {
    if (e.status === "academy" && e.lastTeamId === teamId) n++;
  }
  return n;
}

/**
 * Academy entries for `teamId` (display / My Team / Team Browser). Same-window
 * demotees are included — callers that block call-ups must filter separately.
 */
export function listTeamAcademy(
  pool: readonly MarketInactive[],
  teamId: string,
): MarketInactive[] {
  return pool
    .filter((e) => e.status === "academy" && e.lastTeamId === teamId)
    .sort(
      (a, b) =>
        b.inactiveYears - a.inactiveYears ||
        a.demotedYear - b.demotedYear ||
        (a.player.name ?? "").localeCompare(b.player.name ?? ""),
    );
}

/** All free agents in the inactive pool (browse / season FA panel). */
export function listFreeAgents(
  pool: readonly MarketInactive[],
): MarketInactive[] {
  return pool
    .filter((e) => e.status === "free-agent")
    .sort(
      (a, b) =>
        PLAYER_TIER_VALUE[b.player.tier] - PLAYER_TIER_VALUE[a.player.tier] ||
        b.inactiveYears - a.inactiveYears ||
        (a.player.name ?? "").localeCompare(b.player.name ?? ""),
    );
}

/** True when `teamId`'s academy is under {@link ACADEMY_MAX_PER_TEAM}. */
export function teamAcademyHasRoom(
  pool: readonly MarketInactive[],
  teamId: string,
): boolean {
  return countTeamAcademy(pool, teamId) < ACADEMY_MAX_PER_TEAM;
}

/**
 * Soft room for user "Add academy rookie" — under
 * {@link USER_ACADEMY_ROOKIE_SOFT_MAX} so demotions keep a free slot.
 */
export function teamAcademyHasRookieSoftRoom(
  pool: readonly MarketInactive[],
  teamId: string,
): boolean {
  return countTeamAcademy(pool, teamId) < USER_ACADEMY_ROOKIE_SOFT_MAX;
}

/**
 * Academy rookies minted in `year` for `teamId` (debutYear + demotedYear match).
 * Opening seed and AI/user academy-rookie adds all stamp both to `year`.
 */
export function countAcademyRookiesMintedInYear(
  pool: readonly MarketInactive[],
  teamId: string,
  year: number,
): number {
  let n = 0;
  for (const e of pool) {
    if (e.status !== "academy" || e.lastTeamId !== teamId) continue;
    if (e.demotedYear !== year) continue;
    if (e.player.debutYear !== year) continue;
    n++;
  }
  return n;
}

/**
 * Index of the academy player for `teamId` most due to leave.
 *
 * Legibility rule: when `year` is given, players whose academy clock started
 * *this* year sort last, so a same-year demotee gets at least one archived
 * Academy · 1y row before the cap can bump them straight back to FA. Within a
 * cohort: highest inactiveYears, then earliest clock, then earliest demotion.
 */
export function findOldestTeamAcademyIdx(
  pool: readonly MarketInactive[],
  teamId: string,
  year?: number,
): number {
  const arrivedThisYear = (e: MarketInactive) =>
    year != null && inactiveClockYear(e) === year;
  let best = -1;
  for (let i = 0; i < pool.length; i++) {
    const e = pool[i]!;
    if (e.status !== "academy" || e.lastTeamId !== teamId) continue;
    if (best < 0) {
      best = i;
      continue;
    }
    const b = pool[best]!;
    if (arrivedThisYear(e) !== arrivedThisYear(b)) {
      if (!arrivedThisYear(e)) best = i;
      continue;
    }
    const ey = Math.max(1, e.inactiveYears < 1 ? 1 : e.inactiveYears);
    const by = Math.max(1, b.inactiveYears < 1 ? 1 : b.inactiveYears);
    if (ey !== by) {
      if (ey > by) best = i;
      continue;
    }
    const ec = inactiveClockYear(e);
    const bc = inactiveClockYear(b);
    if (ec !== bc) {
      if (ec < bc) best = i;
      continue;
    }
    if (e.demotedYear < b.demotedYear) best = i;
  }
  return best;
}

/**
 * Flip an academy entry to free-agent at FA · 1y (`inactiveYears =
 * ACADEMY_YEARS + 1`). Always snap the FA clock so variable academy tenure
 * (2–4y) does not shorten/lengthen the 4y FA window.
 *
 * `year` restarts the badge clock ({@link MarketInactive.clockYear}) — pass it
 * for mid-year snaps (release / cap bump) so the year-end advance does not
 * immediately tick the fresh FA · 1y to 2y. The year-end graduate path leaves
 * it unset: that clock already ticked this offseason.
 */
export function toFreeAgentFromAcademy(
  entry: MarketInactive,
  year?: number,
): MarketInactive {
  return {
    ...entry,
    status: "free-agent",
    inactiveYears: ACADEMY_YEARS + 1,
    ...(year != null ? { clockYear: year } : {}),
  };
}

/**
 * Cap rule when academy is full: bump longest-tenured academy → FA
 * ({@link toFreeAgentFromAcademy}). Preferred over blocking demotions so
 * system / manual / AI demotes and open-FA cuts still proceed.
 */
export function bumpOldestAcademyToFa(
  pool: readonly MarketInactive[],
  teamId: string,
  year?: number,
): { pool: MarketInactive[]; bumped: MarketInactive | null } {
  const idx = findOldestTeamAcademyIdx(pool, teamId, year);
  if (idx < 0) return { pool: [...pool], bumped: null };
  const bumped = toFreeAgentFromAcademy(pool[idx]!, year);
  return {
    pool: pool.map((e, i) => (i === idx ? bumped : e)),
    bumped,
  };
}

/**
 * Park `entry` into the team's academy. If at {@link ACADEMY_MAX_PER_TEAM},
 * bumps the oldest academy player to FA first, then inserts.
 * Does not mutate `pool`. The bump inherits `entry`'s clock year — both moves
 * happen on the same day.
 * Same-id rows already in the pool are replaced (never duplicated) — a ghost
 * copy next to a main-roster starter is what produced "same player, higher
 * tier" Out→In digest noise after academy development.
 */
export function addToTeamAcademy(
  pool: readonly MarketInactive[],
  entry: MarketInactive,
): { pool: MarketInactive[]; bumped: MarketInactive | null } {
  if (entry.player.id) {
    const existing = pool.findIndex((e) => e.player.id === entry.player.id);
    if (existing >= 0) {
      const next = [...pool];
      next[existing] = entry;
      return { pool: next, bumped: null };
    }
  }
  let bumped: MarketInactive | null = null;
  let next: MarketInactive[];
  if (countTeamAcademy(pool, entry.lastTeamId) >= ACADEMY_MAX_PER_TEAM) {
    const res = bumpOldestAcademyToFa(
      pool,
      entry.lastTeamId,
      inactiveClockYear(entry),
    );
    next = res.pool;
    bumped = res.bumped;
  } else {
    next = [...pool];
  }
  next.push(entry);
  return { pool: next, bumped };
}

/**
 * Status / bench rows intentionally stamp the same person on both sides.
 * Everything else with matching departed/entrant id (or name) is fake churn.
 */
const SAME_PLAYER_STATUS_NOTES = new Set<MarketNote>([
  "became-fa",
  "retired",
  "academy-bump",
  "academy-release",
  "agency-override",
  "agency-leave",
  "manual-demote",
  "ai-demote",
]);

/** True when a digest row is a same-person Out→In (tier-only / ghost-copy noise). */
export function isSamePlayerReplaceNoise(n: {
  marketNote?: MarketNote;
  departedId?: string;
  entrantId?: string;
  departedName?: string;
  entrantName?: string;
}): boolean {
  if (n.marketNote && SAME_PLAYER_STATUS_NOTES.has(n.marketNote)) return false;
  if (n.departedId && n.entrantId && n.departedId === n.entrantId) return true;
  if (
    n.departedName &&
    n.entrantName &&
    n.departedName === n.entrantName &&
    n.entrantName !== ""
  ) {
    return true;
  }
  return false;
}

/**
 * Drop inactive-pool ghosts whose id still sits on a main roster. If the ghost
 * is a higher tier (academy develop while a stale roster copy lingered), merge
 * that tier onto the roster in place — never emit an Out→In replace.
 */
export function reconcileRosterPoolDuplicates<
  T extends { id: string; players: Player[] },
>(
  teams: readonly T[],
  pool: readonly MarketInactive[],
): { teams: T[]; inactivePool: MarketInactive[] } {
  const rosterById = new Map<string, { ti: number; pi: number }>();
  teams.forEach((t, ti) => {
    t.players.forEach((p, pi) => {
      if (p?.id && !isRosterVacancy(p)) rosterById.set(p.id, { ti, pi });
    });
  });
  const nextTeams = teams.map((t) => ({ ...t, players: [...t.players] }));
  const nextPool: MarketInactive[] = [];
  for (const e of pool) {
    if (isRosterVacancy(e.player)) continue;
    const id = e.player.id;
    if (!id || !rosterById.has(id)) {
      nextPool.push(e);
      continue;
    }
    const loc = rosterById.get(id)!;
    const rosterP = nextTeams[loc.ti]!.players[loc.pi]!;
    let next = rosterP;
    if (PLAYER_TIER_VALUE[e.player.tier] > PLAYER_TIER_VALUE[rosterP.tier]) {
      next = { ...next, tier: e.player.tier };
    }
    const potPool = PLAYER_TIER_VALUE[e.player.potential ?? e.player.tier];
    const potRost = PLAYER_TIER_VALUE[next.potential ?? next.tier];
    if (potPool > potRost) {
      next = { ...next, potential: e.player.potential ?? e.player.tier };
    }
    nextTeams[loc.ti]!.players[loc.pi] = next;
  }
  return { teams: nextTeams, inactivePool: nextPool };
}

/** Roster-news row when a player becomes a free agent. */
export function makeBecameFaNews(
  entry: MarketInactive,
  marketNote: Extract<MarketNote, "became-fa" | "academy-release" | "academy-bump">,
): MarketNewsEvent {
  const p = entry.player;
  return {
    teamId: entry.lastTeamId,
    lane: p.lane,
    ...(p.name ? { departedName: p.name } : {}),
    departedTier: p.tier,
    ...(p.age != null ? { departedAge: p.age } : {}),
    ...(p.id ? { departedId: p.id } : {}),
    entrantName: p.name ?? "",
    entrantTier: p.tier,
    entrantPotential: p.potential ?? p.tier,
    ...(p.id ? { entrantId: p.id } : {}),
    entrantSource: "free-agent",
    marketNote,
  };
}

/** Roster-news row when an inactive player retires (FA clock / overflow valves). */
export function makeRetiredNews(entry: MarketInactive): MarketNewsEvent {
  const p = entry.player;
  return {
    teamId: entry.lastTeamId,
    lane: p.lane,
    ...(p.name ? { departedName: p.name } : {}),
    departedTier: p.tier,
    ...(p.age != null ? { departedAge: p.age } : {}),
    ...(p.id ? { departedId: p.id } : {}),
    entrantName: p.name ?? "",
    entrantTier: p.tier,
    entrantPotential: p.potential ?? p.tier,
    ...(p.id ? { entrantId: p.id } : {}),
    entrantSource: "free-agent",
    marketNote: "retired",
  };
}

/**
 * Release a specific academy player belonging to `teamId` → free-agent.
 * Does not mutate `pool`. Pass the current franchise `year` so the fresh
 * FA · 1y clock survives this year-end (see {@link toFreeAgentFromAcademy}).
 */
export function releaseAcademyToFa(
  pool: readonly MarketInactive[],
  teamId: string,
  playerId: string,
  year?: number,
): { pool: MarketInactive[]; released: MarketInactive | null } {
  const idx = pool.findIndex(
    (e) =>
      e.status === "academy" &&
      e.lastTeamId === teamId &&
      e.player.id === playerId,
  );
  if (idx < 0) return { pool: [...pool], released: null };
  const released = toFreeAgentFromAcademy(pool[idx]!, year);
  const next = pool.map((e, i) => (i === idx ? released : e));
  return { pool: next, released };
}

/** Blend weight of lastActiveGrade vs shadow (before year decay). */
export const SHADOW_BLEND_LAST = 0.6;
/** Each inactive year shifts blend toward shadow by this fraction. */
export const SHADOW_DECAY_PER_YEAR = 0.15;
/** Acclimation penalty per inactive year on return (comeback rust). */
export const COMEBACK_RUST_PER_YEAR = 0.08;
/**
 * Academy development chance per year-end tick (tier / potential bump).
 * Intentionally slower than main-roster CHANGE_RATE (~0.6 in
 * playerLifecycle): academy kids improve for real, but not as fast as
 * active-lane aging/growth. Call-up / main roster is the fast path —
 * there is no academy turbo. Bumped 0.36 → 0.45 so affiliates compete for
 * call-ups more often while still trailing the main-roster growth rate.
 */
export const ACADEMY_DEV_CHANCE = 0.45;
/**
 * Within an academy-dev roll, chance the bump is a full tier step toward
 * potential (else potential ceiling only, or a light shadow nudge).
 * Keeps average academy progress well below active CHANGE_RATE outcomes.
 */
export const ACADEMY_DEV_TIER_BUMP_CHANCE = 0.55;
/** Shadow form bump when academy earns a tier step (smaller than old 0.6). */
export const ACADEMY_DEV_SHADOW_TIER = 0.28;
/** Shadow form bump when academy only raises potential / soft develop. */
export const ACADEMY_DEV_SHADOW_SOFT = 0.14;
/** Light pool drift rate for parked players (vs ~0.35 for actives). */
export const INACTIVE_POOL_DRIFT_RATE = 0.22;
/** Recommended FA board: minimum upgrade vs followed slot to highlight. */
export const FA_RECOMMEND_MIN_UPGRADE = 0.35;

const GRADE_NEUTRAL = 5.5;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export const NEUTRAL_META: SeasonMetaSnapshot = {
  metaOverride: null,
  metaEnabled: false,
  synergyOverride: null,
  counterOverride: null,
};

/** Blended form used for market scoring + inactive aging. */
export function inactiveMarketGrade(entry: MarketInactive): number | null {
  const last = entry.lastActiveGrade;
  const shadow = entry.shadowGrade;
  if (last == null && shadow == null) return null;
  if (last == null) return shadow!;
  if (shadow == null) return last;
  const years = Math.max(0, (entry.inactiveYears < 1 ? 1 : entry.inactiveYears) - 1);
  const lastW = clamp(SHADOW_BLEND_LAST - SHADOW_DECAY_PER_YEAR * years, 0.25, 0.85);
  return last * lastW + shadow * (1 - lastW);
}

/** transferValue for an inactive entry vs current meta. */
export function inactiveTransferValue(
  entry: MarketInactive,
  byId: Map<number, Champion>,
  meta: SeasonMetaSnapshot,
): number {
  return transferValue(entry.player, inactiveMarketGrade(entry), byId, meta);
}

export interface ValueBreakdown {
  total: number;
  tier: number;
  form: number;
  metaFit: number;
}

export function inactiveValueBreakdown(
  entry: MarketInactive,
  byId: Map<number, Champion>,
  meta: SeasonMetaSnapshot,
): ValueBreakdown {
  const grade = inactiveMarketGrade(entry);
  const tier = PLAYER_TIER_VALUE[entry.player.tier];
  const form = grade != null ? 0.35 * (grade - GRADE_NEUTRAL) : 0;
  const metaFit = 0.4 * poolFit(entry.player, byId, meta);
  const acc = Math.max(0, Math.min(1, entry.player.acclimation ?? 1));
  const total = tier + form + metaFit - 0.5 * (1 - acc);
  return { total, tier, form, metaFit };
}

/** Comeback rust: discount acclimation from years parked. */
export function applyComebackRust(
  player: Player,
  inactiveYears: number,
  toLeagueId?: string,
): Player {
  const years = Math.max(0, inactiveYears < 1 ? 0 : inactiveYears - 1);
  const rust = clamp(1 - COMEBACK_RUST_PER_YEAR * years, 0.35, 1);
  const home = player.homeRegion;
  let baseAcc = player.acclimation ?? 1;
  if (home && toLeagueId && home !== toLeagueId) baseAcc = 0.5;
  else if (home && toLeagueId && home === toLeagueId) baseAcc = 1;
  return { ...player, badStreak: 0, acclimation: clamp(baseAcc * rust, 0.2, 1) };
}

/**
 * Shadow grade tick + real academy development track (tier/potential) + light
 * pool drift. Called during year-end advance for non-retired inactives.
 *
 * Academy growth is gated by {@link ACADEMY_DEV_CHANCE} (slower than active
 * CHANGE_RATE ~0.6) with smaller shadow bumps. Main-roster aging still
 * ages academy players chronologically in advanceInactivePool; young academy
 * growth is intentional here, not a second full agePlayer growth pass.
 */
export function tickInactiveYear(
  entry: MarketInactive,
  champions: readonly Champion[],
  rng: RNG,
): { player: Player; shadowGrade: number; developed: boolean } {
  let player = entry.player;
  let developed = false;
  const grade = inactiveMarketGrade(entry);
  const expected = GRADE_NEUTRAL + PLAYER_TIER_VALUE[player.tier] * 0.7;
  const prevShadow = entry.shadowGrade ?? grade ?? expected;
  // Academy "games": milder performance signal while developing (vs old 0.45–1.35).
  const academyBoost = entry.status === "academy" ? 0.2 + rng() * 0.45 : 0;
  const noise = (rng() - 0.5) * 1.1;
  let shadowGrade = clamp(
    prevShadow * 0.5 + expected * 0.5 + noise + academyBoost,
    1,
    10,
  );

  if (entry.status === "academy" && rng() < ACADEMY_DEV_CHANCE) {
    const tierVal = PLAYER_TIER_VALUE[player.tier];
    const potVal = PLAYER_TIER_VALUE[player.potential ?? player.tier];
    // Prefer raising current skill toward potential; else raise ceiling.
    if (tierVal < potVal && rng() < ACADEMY_DEV_TIER_BUMP_CHANCE) {
      player = { ...player, tier: valueToTier(tierVal + 1) };
      shadowGrade = clamp(shadowGrade + ACADEMY_DEV_SHADOW_TIER, 1, 10);
      developed = true;
    } else if (potVal < 3) {
      player = { ...player, potential: valueToTier(potVal + 1) };
      // Soft: occasionally also nudge tier when potential opens room.
      if (tierVal < potVal + 1 && rng() < 0.28) {
        player = { ...player, tier: valueToTier(tierVal + 1) };
      }
      shadowGrade = clamp(shadowGrade + ACADEMY_DEV_SHADOW_SOFT, 1, 10);
      developed = true;
    } else if (tierVal < 2 && rng() < 0.12) {
      // Rare S-tier breakthrough for maxed-potential academy kids.
      player = { ...player, tier: valueToTier(tierVal + 1) };
      developed = true;
    } else {
      // Dev roll "hit" but no tier/pot room — light shadow practice only.
      shadowGrade = clamp(shadowGrade + ACADEMY_DEV_SHADOW_SOFT, 1, 10);
      developed = true;
    }
  }

  if (rng() < INACTIVE_POOL_DRIFT_RATE) {
    player = driftPlayerPool(player, champions, rng);
  }

  return { player, shadowGrade, developed };
}

export interface MarketVacancy {
  teamId: string;
  teamName: string;
  leagueId?: string;
  lane: Lane;
  slotIndex: number;
  departedName?: string;
  departedTier?: PlayerTier;
  departedAge?: number;
  departedId?: string;
  departedGrade?: number | null;
}

export interface MarketFill {
  vacancy: MarketVacancy;
  /** Null when source is rookie — orchestrator generates the player. */
  entrant: Player | null;
  source: MarketEntrantSource;
  /** Pool index removed when signing a returnee; -1 for rookie. */
  poolIdx: number;
  passedAcademyName?: string;
  beatenNames?: string[];
  marketNote?: MarketNote;
}

function eligibleAcademy(
  pool: readonly MarketInactive[],
  lane: Lane,
  teamId: string,
  excludePlayerIds?: ReadonlySet<string>,
): { entry: MarketInactive; idx: number }[] {
  return pool
    .map((entry, idx) => ({ entry, idx }))
    .filter(
      ({ entry }) =>
        entry.status === "academy" &&
        entry.player.lane === lane &&
        !!entry.player.id &&
        entry.lastTeamId === teamId &&
        !excludePlayerIds?.has(entry.player.id),
    );
}

function eligibleFa(
  pool: readonly MarketInactive[],
  lane: Lane,
  excludePlayerIds?: ReadonlySet<string>,
): { entry: MarketInactive; idx: number }[] {
  return pool
    .map((entry, idx) => ({ entry, idx }))
    .filter(
      ({ entry }) =>
        entry.status === "free-agent" &&
        entry.player.lane === lane &&
        !!entry.player.id &&
        !excludePlayerIds?.has(entry.player.id),
    );
}

/**
 * Mid-split / simple fill: score local candidates with transferValue.
 * No cross-team FA auction (first vacancy processed wins the FA).
 * `excludePlayerIds` — same-pass demotees must not fill any vacancy this pass.
 */
export function pickScoredReturnee(
  pool: MarketInactive[],
  lane: Lane,
  teamId: string,
  byId: Map<number, Champion>,
  meta: SeasonMetaSnapshot,
  rng: RNG,
  excludePlayerIds?: ReadonlySet<string>,
): {
  idx: number;
  entry: MarketInactive;
  passedAcademyName?: string;
  marketNote?: MarketNote;
} | null {
  const academy = eligibleAcademy(pool, lane, teamId, excludePlayerIds);
  const fas = eligibleFa(pool, lane, excludePlayerIds);
  if (academy.length === 0 && fas.length === 0) return null;

  const score = (e: MarketInactive) => inactiveTransferValue(e, byId, meta);
  academy.sort((a, b) => score(b.entry) - score(a.entry) || (rng() < 0.5 ? -1 : 1));
  fas.sort((a, b) => score(b.entry) - score(a.entry) || (rng() < 0.5 ? -1 : 1));

  const bestAcy = academy[0] ?? null;
  const bestFa = fas[0] ?? null;
  const acyV = bestAcy ? score(bestAcy.entry) : -Infinity;
  const faV = bestFa ? score(bestFa.entry) : -Infinity;

  if (bestAcy && (!bestFa || faV < acyV + ACADEMY_PASS_GAP)) {
    if (acyV < ROOKIE_VALUE_FLOOR) return null;
    return { idx: bestAcy.idx, entry: bestAcy.entry, marketNote: "academy-recall" };
  }
  if (bestFa) {
    if (faV < ROOKIE_VALUE_FLOOR) return null;
    return {
      idx: bestFa.idx,
      entry: bestFa.entry,
      ...(bestAcy?.entry.player.name
        ? { passedAcademyName: bestAcy.entry.player.name, marketNote: "academy-pass" as const }
        : { marketNote: "fa-sign" as const }),
    };
  }
  return null;
}

/**
 * Year-end competitive market: lock academy recalls that aren't clearly beaten,
 * then greedily assign each FA once to the highest-value vacancy.
 * `excludePlayerIds` — same-pass demotees must not fill any vacancy this pass.
 * `bidBoost` — optional soft preference (player agency / user priority) added
 * to FA bid value so stronger orgs win contention without chaos.
 */
export function resolveCompetitiveFills(
  vacancies: MarketVacancy[],
  pool: MarketInactive[],
  byId: Map<number, Champion>,
  meta: SeasonMetaSnapshot,
  rng: RNG,
  excludePlayerIds?: ReadonlySet<string>,
  bidBoost?: (fa: MarketInactive, vacancy: MarketVacancy) => number,
): { fills: MarketFill[]; remainingPool: MarketInactive[] } {
  const working = [...pool];
  const fills: MarketFill[] = [];
  const claimed = new Set<number>();
  const faLocked = new Set<number>();

  // Pass 1: academy locks when FA doesn't clear the gap.
  for (let vi = 0; vi < vacancies.length; vi++) {
    const v = vacancies[vi]!;
    const academy = eligibleAcademy(working, v.lane, v.teamId, excludePlayerIds).filter(
      (c) => !faLocked.has(c.idx),
    );
    if (academy.length === 0) continue;
    academy.sort(
      (a, b) =>
        inactiveTransferValue(b.entry, byId, meta) -
        inactiveTransferValue(a.entry, byId, meta),
    );
    const bestAcy = academy[0]!;
    const acyV = inactiveTransferValue(bestAcy.entry, byId, meta);
    const fas = eligibleFa(working, v.lane, excludePlayerIds).filter(
      (c) => !faLocked.has(c.idx),
    );
    let bestFaV = -Infinity;
    for (const f of fas) {
      bestFaV = Math.max(bestFaV, inactiveTransferValue(f.entry, byId, meta));
    }
    if (bestFaV < acyV + ACADEMY_PASS_GAP) {
      if (acyV < ROOKIE_VALUE_FLOOR) continue;
      const entrant = applyComebackRust(
        bestAcy.entry.player,
        bestAcy.entry.inactiveYears,
        v.leagueId,
      );
      faLocked.add(bestAcy.idx);
      claimed.add(vi);
      fills.push({
        vacancy: v,
        entrant,
        source: "academy",
        poolIdx: bestAcy.idx,
        marketNote: "academy-recall",
      });
    }
  }

  // Pass 2: FA auction — greedy by transferValue (+ optional agency boost).
  type Bid = {
    vi: number;
    poolIdx: number;
    value: number;
    rawValue: number;
    faName?: string;
  };
  const bids: Bid[] = [];
  for (let vi = 0; vi < vacancies.length; vi++) {
    if (claimed.has(vi)) continue;
    const v = vacancies[vi]!;
    for (const { entry, idx } of eligibleFa(working, v.lane, excludePlayerIds)) {
      if (faLocked.has(idx)) continue;
      const rawValue = inactiveTransferValue(entry, byId, meta);
      const boost = bidBoost ? bidBoost(entry, v) : 0;
      bids.push({
        vi,
        poolIdx: idx,
        value: rawValue + boost,
        rawValue,
        ...(entry.player.name ? { faName: entry.player.name } : {}),
      });
    }
  }
  bids.sort((a, b) => b.value - a.value || (rng() < 0.5 ? -1 : 1));

  const vacancyTaken = new Set<number>(claimed);
  const faNamesByVacancy = new Map<number, string[]>();
  for (const b of bids) {
    if (!b.faName) continue;
    const arr = faNamesByVacancy.get(b.vi) ?? [];
    arr.push(b.faName);
    faNamesByVacancy.set(b.vi, arr);
  }

  for (const b of bids) {
    if (vacancyTaken.has(b.vi) || faLocked.has(b.poolIdx)) continue;
    if (b.rawValue < ROOKIE_VALUE_FLOOR) continue;
    const v = vacancies[b.vi]!;
    const entry = working[b.poolIdx]!;
    const academy = eligibleAcademy(working, v.lane, v.teamId, excludePlayerIds);
    const passed = academy[0]?.entry.player.name;
    const entrant = applyComebackRust(entry.player, entry.inactiveYears, v.leagueId);
    vacancyTaken.add(b.vi);
    faLocked.add(b.poolIdx);
    const rivals = (faNamesByVacancy.get(b.vi) ?? []).filter((n) => n !== entrant.name);
    const agencyNote = bidBoost && b.value - b.rawValue >= 0.4;
    fills.push({
      vacancy: v,
      entrant,
      source: "free-agent",
      poolIdx: b.poolIdx,
      ...(passed
        ? { passedAcademyName: passed, marketNote: "academy-pass" as const }
        : {
            marketNote: (agencyNote ? "agency-sign" : "fa-sign") as MarketNote,
          }),
      ...(rivals.length > 0 ? { beatenNames: rivals.slice(0, 2) } : {}),
    });
  }

  // Pass 3 omitted (academy-first): remaining vacancies stay open so the
  // lifecycle can mint into academy / retry pool fills before any main-roster
  // safety rookie. `rookie-gate` is reserved for hard null-slot safety only.

  const removeIdx = [...faLocked].sort((a, b) => b - a);
  const remainingPool = [...working];
  for (const idx of removeIdx) remainingPool.splice(idx, 1);

  return { fills, remainingPool };
}

/**
 * AI open FA window: only replace clearly weaker lanes (choice A).
 *
 * `demoteYear` stamps the **cut incumbent** — it is the closing/current year,
 * never the upcoming intake year, so a year-end cut still lands in the closing
 * season's archive as Academy · 1y.
 */
export function runOpenFaReplacePass(
  teams: { id: string; name: string; leagueId?: string; players: Player[] }[],
  pool: MarketInactive[],
  byId: Map<number, Champion>,
  meta: SeasonMetaSnapshot,
  outcomesById: Map<string, { grade: number | null }>,
  rng: RNG,
  demoteYear: number,
  opts?: { skipTeamIds?: ReadonlySet<string>; attemptChance?: number },
): {
  teams: { id: string; players: Player[] }[];
  inactivePool: MarketInactive[];
  news: Array<MarketNewsEvent>;
} {
  let working = [...pool];
  const news: Array<MarketNewsEvent> = [];
  const resultTeams = teams.map((t) => ({ id: t.id, players: [...t.players] }));
  const teamReplaces = new Map<number, number>();
  const usedSlot = new Set<string>();
  const skip = opts?.skipTeamIds;
  const attemptChance = opts?.attemptChance ?? 1;
  // Roll once per team so mid-split light chance doesn't re-roll every bid.
  const allowTeam = new Set<string>();
  for (const t of teams) {
    if (skip?.has(t.id)) continue;
    if (attemptChance >= 1 || rng() < attemptChance) allowTeam.add(t.id);
  }

  type Bid = {
    teamIdx: number;
    slot: number;
    poolIdx: number;
    gain: number;
    fa: MarketInactive;
    incumbent: Player;
  };

  let guard = teams.length * MAX_OPEN_FA_REPLACES_PER_TEAM + 2;
  while (guard-- > 0) {
    let best: Bid | null = null;
    for (let ti = 0; ti < resultTeams.length; ti++) {
      if (!allowTeam.has(teams[ti]!.id)) continue;
      const used = teamReplaces.get(ti) ?? 0;
      if (used >= MAX_OPEN_FA_REPLACES_PER_TEAM) continue;
      const roster = resultTeams[ti]!.players;
      for (let slot = 0; slot < roster.length; slot++) {
        if (usedSlot.has(`${ti}:${slot}`)) continue;
        const incumbent = roster[slot]!;
        const incV = transferValue(
          incumbent,
          incumbent.id ? (outcomesById.get(incumbent.id)?.grade ?? null) : null,
          byId,
          meta,
        );
        for (let pi = 0; pi < working.length; pi++) {
          const fa = working[pi]!;
          if (fa.status !== "free-agent" || fa.player.lane !== incumbent.lane || !fa.player.id) {
            continue;
          }
          const gain = inactiveTransferValue(fa, byId, meta) - incV;
          if (gain >= FA_OPEN_REPLACE_GAP && (!best || gain > best.gain)) {
            best = { teamIdx: ti, slot, poolIdx: pi, gain, fa, incumbent };
          }
        }
      }
    }
    if (!best) break;

    const team = teams[best.teamIdx]!;
    const entrant = applyComebackRust(best.fa.player, best.fa.inactiveYears, team.leagueId);
    // Ghost copy in FA pool (same id still on roster) — merge any higher tier
    // in place and drop the ghost. Never emit Out→In "same player, higher tier".
    if (best.incumbent.id && entrant.id && best.incumbent.id === entrant.id) {
      working.splice(best.poolIdx, 1);
      if (PLAYER_TIER_VALUE[entrant.tier] > PLAYER_TIER_VALUE[best.incumbent.tier]) {
        resultTeams[best.teamIdx]!.players[best.slot] = {
          ...best.incumbent,
          tier: entrant.tier,
          potential: entrant.potential ?? best.incumbent.potential,
        };
      }
      continue;
    }
    const vacant = isRosterVacancy(best.incumbent);
    working.splice(best.poolIdx, 1);
    if (!vacant) {
      const grade = best.incumbent.id
        ? (outcomesById.get(best.incumbent.id)?.grade ?? null)
        : null;
      // Leaving the roster always parks in academy first — never FA on cut day.
      // Cap: bump oldest academy → FA if this org is already at ACADEMY_MAX_PER_TEAM.
      // Vacancy stubs must never be parked into the inactive pool.
      const parked = addToTeamAcademy(working, {
        player: { ...best.incumbent, badStreak: 0 },
        status: "academy",
        inactiveYears: 1,
        demotedYear: demoteYear,
        clockYear: demoteYear,
        lastTeamId: team.id,
        lastTeamName: team.name,
        ...(grade != null ? { lastActiveGrade: grade, shadowGrade: grade } : {}),
      });
      working = parked.pool;
      if (parked.bumped) news.push(makeBecameFaNews(parked.bumped, "academy-bump"));
    }
    resultTeams[best.teamIdx]!.players[best.slot] = entrant;
    teamReplaces.set(best.teamIdx, (teamReplaces.get(best.teamIdx) ?? 0) + 1);
    usedSlot.add(`${best.teamIdx}:${best.slot}`);
    const openFaNews = {
      teamId: team.id,
      lane: entrant.lane,
      ...(!vacant && best.incumbent.name ? { departedName: best.incumbent.name } : {}),
      ...(!vacant ? { departedTier: best.incumbent.tier } : {}),
      ...(!vacant && best.incumbent.age != null
        ? { departedAge: best.incumbent.age }
        : {}),
      ...(!vacant && best.incumbent.id ? { departedId: best.incumbent.id } : {}),
      entrantName: entrant.name ?? "",
      entrantTier: entrant.tier,
      entrantPotential: entrant.potential ?? entrant.tier,
      ...(entrant.id ? { entrantId: entrant.id } : {}),
      entrantSource: "free-agent" as const,
      marketNote: "open-fa" as const,
      ...(!vacant && best.incumbent.name ? { beatenNames: [best.incumbent.name] } : {}),
    };
    if (!isSamePlayerReplaceNoise(openFaNews)) news.push(openFaNews);
  }

  return { teams: resultTeams, inactivePool: working, news };
}

/**
 * AI academy promote pass: swap a same-org academy prospect onto the main
 * roster when they clear {@link ACADEMY_OPEN_REPLACE_GAP} vs the incumbent.
 * Runs during academy maintenance (mid-split + offseason). Per-team chance
 * {@link AI_ACADEMY_PROMOTE_CHANCE}; at most
 * {@link MAX_OPEN_ACADEMY_PROMOTES_PER_TEAM}. Cap / FA valves unchanged —
 * this only makes affiliate call-ups less rare.
 * `excludePlayerIds` blocks same-pass demotees from instant re-call.
 * `demoteYear` stamps the displaced incumbent (closing year, not intake year).
 */
export function runOpenAcademyReplacePass(
  teams: { id: string; name: string; leagueId?: string; players: Player[] }[],
  pool: MarketInactive[],
  byId: Map<number, Champion>,
  meta: SeasonMetaSnapshot,
  outcomesById: Map<string, { grade: number | null }>,
  rng: RNG,
  demoteYear: number,
  opts?: { skipTeamIds?: ReadonlySet<string>; excludePlayerIds?: ReadonlySet<string> },
): {
  teams: { id: string; players: Player[] }[];
  inactivePool: MarketInactive[];
  news: Array<MarketNewsEvent>;
} {
  let working = [...pool];
  const news: Array<MarketNewsEvent> = [];
  const resultTeams = teams.map((t) => ({ id: t.id, players: [...t.players] }));
  const teamPromotes = new Map<number, number>();
  const usedSlot = new Set<string>();
  const skip = opts?.skipTeamIds;
  const exclude = opts?.excludePlayerIds;
  /** Teams that already rolled (and maybe skipped) this pass. */
  const rolled = new Set<number>();

  type Bid = {
    teamIdx: number;
    slot: number;
    poolIdx: number;
    gain: number;
    acy: MarketInactive;
    incumbent: Player;
  };

  let guard = teams.length * MAX_OPEN_ACADEMY_PROMOTES_PER_TEAM + 2;
  while (guard-- > 0) {
    let best: Bid | null = null;
    for (let ti = 0; ti < resultTeams.length; ti++) {
      if (skip?.has(teams[ti]!.id)) continue;
      const used = teamPromotes.get(ti) ?? 0;
      if (used >= MAX_OPEN_ACADEMY_PROMOTES_PER_TEAM) continue;
      if (!rolled.has(ti)) {
        rolled.add(ti);
        if (rng() > AI_ACADEMY_PROMOTE_CHANCE) {
          teamPromotes.set(ti, MAX_OPEN_ACADEMY_PROMOTES_PER_TEAM);
          continue;
        }
      }
      const roster = resultTeams[ti]!.players;
      const teamId = teams[ti]!.id;
      for (let slot = 0; slot < roster.length; slot++) {
        if (usedSlot.has(`${ti}:${slot}`)) continue;
        const incumbent = roster[slot]!;
        if (isRosterVacancy(incumbent)) continue;
        const incV = transferValue(
          incumbent,
          incumbent.id ? (outcomesById.get(incumbent.id)?.grade ?? null) : null,
          byId,
          meta,
        );
        for (let pi = 0; pi < working.length; pi++) {
          const acy = working[pi]!;
          if (
            acy.status !== "academy" ||
            acy.lastTeamId !== teamId ||
            acy.player.lane !== incumbent.lane ||
            !acy.player.id
          ) {
            continue;
          }
          if (exclude?.has(acy.player.id)) continue;
          const gain = inactiveTransferValue(acy, byId, meta) - incV;
          if (gain >= ACADEMY_OPEN_REPLACE_GAP && (!best || gain > best.gain)) {
            best = { teamIdx: ti, slot, poolIdx: pi, gain, acy, incumbent };
          }
        }
      }
    }
    if (!best) break;

    const team = teams[best.teamIdx]!;
    const entrant = applyComebackRust(best.acy.player, best.acy.inactiveYears, team.leagueId);
    // Ghost academy copy of the starter — merge tier growth in place, no digest row.
    if (best.incumbent.id && entrant.id && best.incumbent.id === entrant.id) {
      working.splice(best.poolIdx, 1);
      if (PLAYER_TIER_VALUE[entrant.tier] > PLAYER_TIER_VALUE[best.incumbent.tier]) {
        resultTeams[best.teamIdx]!.players[best.slot] = {
          ...best.incumbent,
          tier: entrant.tier,
          potential: entrant.potential ?? best.incumbent.potential,
        };
      }
      continue;
    }
    const grade = best.incumbent.id
      ? (outcomesById.get(best.incumbent.id)?.grade ?? null)
      : null;
    working.splice(best.poolIdx, 1);
    const parked = addToTeamAcademy(working, {
      player: { ...best.incumbent, badStreak: 0 },
      status: "academy",
      inactiveYears: 1,
      demotedYear: demoteYear,
      clockYear: demoteYear,
      lastTeamId: team.id,
      lastTeamName: team.name,
      ...(grade != null ? { lastActiveGrade: grade, shadowGrade: grade } : {}),
    });
    working = parked.pool;
    if (parked.bumped) news.push(makeBecameFaNews(parked.bumped, "academy-bump"));
    resultTeams[best.teamIdx]!.players[best.slot] = entrant;
    teamPromotes.set(best.teamIdx, (teamPromotes.get(best.teamIdx) ?? 0) + 1);
    usedSlot.add(`${best.teamIdx}:${best.slot}`);
    const recallNews = {
      teamId: team.id,
      lane: entrant.lane,
      ...(best.incumbent.name ? { departedName: best.incumbent.name } : {}),
      departedTier: best.incumbent.tier,
      ...(best.incumbent.age != null ? { departedAge: best.incumbent.age } : {}),
      ...(best.incumbent.id ? { departedId: best.incumbent.id } : {}),
      entrantName: entrant.name ?? "",
      entrantTier: entrant.tier,
      entrantPotential: entrant.potential ?? entrant.tier,
      ...(entrant.id ? { entrantId: entrant.id } : {}),
      entrantSource: "academy" as const,
      marketNote: "academy-recall" as const,
      ...(best.incumbent.name ? { beatenNames: [best.incumbent.name] } : {}),
    };
    if (!isSamePlayerReplaceNoise(recallNews)) news.push(recallNews);
  }

  return { teams: resultTeams, inactivePool: working, news };
}

/** Board row for Offseason / transfer-window FA UI. */
export interface FaBoardRow {
  entry: MarketInactive;
  value: number;
  breakdown: ValueBreakdown;
  yearsLeftToRetire: number;
  yearsLeftToFa: number;
  upgradeVsSlot: number | null;
  recommended: boolean;
}

const fmtGrade = (n: number | null | undefined) =>
  n == null || Number.isNaN(n) ? "–" : n.toFixed(1);

/**
 * FA badge year from total inactive years, clamped to the 4y FA window.
 * Legacy saves can carry an over-run clock (retired-eligible but still listed);
 * the badge must not read "FA 5y".
 */
export function faBadgeYears(inactiveYears: number): number {
  const years = inactiveYears < 1 ? 1 : inactiveYears;
  return Math.min(FREE_AGENT_YEARS, Math.max(1, years - ACADEMY_YEARS));
}

/**
 * Native `title` tooltip for FA board rows (no shared Tooltip component).
 * Keep Sign buttons free of this string so hover doesn't block actions.
 */
export function formatFaBoardTooltip(row: FaBoardRow): string {
  const { entry, breakdown, value, yearsLeftToRetire, yearsLeftToFa, upgradeVsSlot } = row;
  const p = entry.player;
  const years = Math.max(1, entry.inactiveYears < 1 ? 1 : entry.inactiveYears);
  const statusLine =
    entry.status === "academy"
      ? `Academy ${Math.min(ACADEMY_YEARS_MAX, years)}y · ${yearsLeftToFa}y to FA`
      : entry.status === "free-agent"
        ? `FA ${faBadgeYears(years)}y · ${yearsLeftToRetire}y to retire`
        : "Retired";
  const lastTeam = entry.lastTeamName ?? entry.lastTeamId ?? "—";
  const lines = [
    [
      p.name ?? "Unknown",
      p.lane,
      p.age != null ? `age ${p.age}` : null,
    ]
      .filter(Boolean)
      .join(" · "),
    `Tier ${p.tier}${p.potential && p.potential !== p.tier ? ` · pot ${p.potential}` : ""}`,
    `Last grade ${fmtGrade(entry.lastActiveGrade)} · shadow ${fmtGrade(entry.shadowGrade)}`,
    `Value ${value.toFixed(1)} (tier ${breakdown.tier.toFixed(1)} / form ${breakdown.form.toFixed(1)} / meta ${breakdown.metaFit.toFixed(1)})`,
    statusLine,
    `Last team: ${lastTeam}`,
  ];
  if (upgradeVsSlot != null) {
    lines.push(`vs your slot: ${upgradeVsSlot >= 0 ? "+" : ""}${upgradeVsSlot.toFixed(1)}`);
  }
  return lines.join("\n");
}

export function buildFaBoard(
  pool: readonly MarketInactive[],
  lane: Lane | "all",
  byId: Map<number, Champion>,
  meta: SeasonMetaSnapshot,
  slotPlayer?: Player | null,
  slotGrade?: number | null,
  /** When browsing all lanes, upgrades are vs each roster lane slot. */
  roster?: readonly Player[],
  /** Same-window demotees — hidden from fills this pass. */
  excludePlayerIds?: ReadonlySet<string>,
): FaBoardRow[] {
  const rows: FaBoardRow[] = [];
  for (const entry of pool) {
    if (entry.status !== "free-agent") continue;
    if (lane !== "all" && entry.player.lane !== lane) continue;
    if (entry.player.id && excludePlayerIds?.has(entry.player.id)) continue;
    const breakdown = inactiveValueBreakdown(entry, byId, meta);
    const yearsLeftToRetire = Math.max(
      0,
      TOTAL_INACTIVE_BEFORE_RETIRE - Math.max(1, entry.inactiveYears),
    );
    const yearsLeftToFa = 0;
    let upgradeVsSlot: number | null = null;
    if (slotPlayer && slotPlayer.lane === entry.player.lane) {
      upgradeVsSlot = isRosterVacancy(slotPlayer)
        ? 99
        : breakdown.total - transferValue(slotPlayer, slotGrade ?? null, byId, meta);
    } else if (roster) {
      const slot = roster.find((p) => p.lane === entry.player.lane);
      if (slot) {
        upgradeVsSlot = isRosterVacancy(slot)
          ? 99
          : breakdown.total - transferValue(slot, null, byId, meta);
      }
    }
    rows.push({
      entry,
      value: breakdown.total,
      breakdown,
      yearsLeftToRetire,
      yearsLeftToFa,
      upgradeVsSlot,
      recommended:
        upgradeVsSlot != null && upgradeVsSlot >= FA_RECOMMEND_MIN_UPGRADE,
    });
  }
  rows.sort((a, b) => {
    if (a.recommended !== b.recommended) return a.recommended ? -1 : 1;
    return b.value - a.value;
  });
  return rows;
}

/** Best recommended FA per lane for the followed team. */
export function recommendedFasForTeam(
  pool: readonly MarketInactive[],
  roster: readonly Player[],
  byId: Map<number, Champion>,
  meta: SeasonMetaSnapshot,
  gradeOf?: (playerId: string) => number | null,
): FaBoardRow[] {
  const out: FaBoardRow[] = [];
  for (const p of roster) {
    const grade = p.id && gradeOf ? gradeOf(p.id) : null;
    const board = buildFaBoard(pool, p.lane, byId, meta, p, grade);
    const best = board.find((r) => r.recommended);
    if (best) out.push(best);
  }
  out.sort((a, b) => (b.upgradeVsSlot ?? 0) - (a.upgradeVsSlot ?? 0));
  return out;
}

/**
 * Followed-team academy board: only this org's academy (`lastTeamId` match).
 * Other orgs' academy is never listed / not poachable.
 */
export function buildAcademyBoard(
  pool: readonly MarketInactive[],
  teamId: string,
  lane: Lane | "all",
  byId: Map<number, Champion>,
  meta: SeasonMetaSnapshot,
  slotPlayer?: Player | null,
  slotGrade?: number | null,
  roster?: readonly Player[],
  /** Same-window demotees — cannot be recalled this pass. */
  excludePlayerIds?: ReadonlySet<string>,
): FaBoardRow[] {
  const rows: FaBoardRow[] = [];
  for (const entry of pool) {
    if (entry.status !== "academy") continue;
    if (entry.lastTeamId !== teamId) continue;
    if (lane !== "all" && entry.player.lane !== lane) continue;
    if (!entry.player.id) continue;
    if (excludePlayerIds?.has(entry.player.id)) continue;
    const breakdown = inactiveValueBreakdown(entry, byId, meta);
    const yearsLeftToRetire = Math.max(
      0,
      TOTAL_INACTIVE_BEFORE_RETIRE - Math.max(1, entry.inactiveYears),
    );
    const toFa = yearsLeftToFa(entry);
    let upgradeVsSlot: number | null = null;
    if (slotPlayer && slotPlayer.lane === entry.player.lane) {
      upgradeVsSlot = isRosterVacancy(slotPlayer)
        ? 99
        : breakdown.total - transferValue(slotPlayer, slotGrade ?? null, byId, meta);
    } else if (roster) {
      const slot = roster.find((p) => p.lane === entry.player.lane);
      if (slot) {
        upgradeVsSlot = isRosterVacancy(slot)
          ? 99
          : breakdown.total - transferValue(slot, null, byId, meta);
      }
    }
    rows.push({
      entry,
      value: breakdown.total,
      breakdown,
      yearsLeftToRetire,
      yearsLeftToFa: toFa,
      upgradeVsSlot,
      recommended:
        upgradeVsSlot != null && upgradeVsSlot >= FA_RECOMMEND_MIN_UPGRADE,
    });
  }
  rows.sort((a, b) => {
    if (a.recommended !== b.recommended) return a.recommended ? -1 : 1;
    return b.value - a.value;
  });
  return rows;
}

/** Best recommended academy call-ups per lane for the followed team. */
export function recommendedAcademyForTeam(
  pool: readonly MarketInactive[],
  teamId: string,
  roster: readonly Player[],
  byId: Map<number, Champion>,
  meta: SeasonMetaSnapshot,
  gradeOf?: (playerId: string) => number | null,
): FaBoardRow[] {
  const out: FaBoardRow[] = [];
  for (const p of roster) {
    const grade = p.id && gradeOf ? gradeOf(p.id) : null;
    const board = buildAcademyBoard(pool, teamId, p.lane, byId, meta, p, grade);
    const best = board.find((r) => r.recommended);
    if (best) out.push(best);
  }
  out.sort((a, b) => (b.upgradeVsSlot ?? 0) - (a.upgradeVsSlot ?? 0));
  return out;
}

/** Tooltip alias — same market info layout as FA rows (handles academy status). */
export const formatAcademyBoardTooltip = formatFaBoardTooltip;

/**
 * User signs an FA into a lane only when they clearly beat the incumbent
 * (same gap as AI open market), releasing the incumbent to this org's academy.
 * Vacant slots (manual demote) skip the gap and do not park a stub.
 */
export function executeUserFaSign(
  teams: MarketTeamInput[],
  pool: readonly MarketInactive[],
  teamId: string,
  lane: Lane,
  faPlayerId: string,
  byId: Map<number, Champion>,
  meta: SeasonMetaSnapshot,
  year: number,
  gradeOf?: (playerId: string) => number | null,
  opts?: { requireGap?: boolean; excludePlayerIds?: ReadonlySet<string> },
): {
  teams: { id: string; players: Player[] }[];
  inactivePool: MarketInactive[];
  news: Array<MarketNewsEvent>;
  ok: boolean;
  reason?: string;
} {
  const passthrough = {
    teams: teams.map((t) => ({ id: t.id, players: [...t.players] })),
    inactivePool: [...pool],
    news: [] as Array<MarketNewsEvent>,
  };
  if (opts?.excludePlayerIds?.has(faPlayerId)) {
    return { ...passthrough, ok: false, reason: "same-window-demote" };
  }
  const team = teams.find((t) => t.id === teamId);
  if (!team) return { ...passthrough, ok: false, reason: "no-team" };
  const slot = team.players.findIndex((p) => p.lane === lane);
  if (slot < 0) return { ...passthrough, ok: false, reason: "no-slot" };
  const faIdx = pool.findIndex(
    (e) => e.status === "free-agent" && e.player.id === faPlayerId && e.player.lane === lane,
  );
  if (faIdx < 0) return { ...passthrough, ok: false, reason: "fa-gone" };

  const fa = pool[faIdx]!;
  const incumbent = team.players[slot]!;
  const vacant = isRosterVacancy(incumbent);
  const requireGap = opts?.requireGap ?? true;
  if (requireGap && !vacant) {
    const incGrade = incumbent.id && gradeOf ? gradeOf(incumbent.id) : null;
    const gain =
      inactiveTransferValue(fa, byId, meta) -
      transferValue(incumbent, incGrade, byId, meta);
    if (gain < FA_OPEN_REPLACE_GAP) {
      return { ...passthrough, ok: false, reason: "gap" };
    }
  }

  const entrant = applyComebackRust(fa.player, fa.inactiveYears, team.leagueId);
  let nextPool = pool.filter((_, i) => i !== faIdx);
  const newsOut: MarketNewsEvent[] = [];
  if (!vacant) {
    const grade = incumbent.id && gradeOf ? gradeOf(incumbent.id) : null;
    // Outgoing incumbent → academy of this org (same rule as demotion / open FA).
    // Cap: bump oldest academy → FA if full.
    const parked = addToTeamAcademy(nextPool, {
      player: { ...incumbent, badStreak: 0 },
      status: "academy",
      inactiveYears: 1,
      demotedYear: year,
      clockYear: year,
      lastTeamId: team.id,
      lastTeamName: team.name,
      ...(grade != null ? { lastActiveGrade: grade, shadowGrade: grade } : {}),
    });
    nextPool = parked.pool;
    if (parked.bumped) newsOut.push(makeBecameFaNews(parked.bumped, "academy-bump"));
  }
  const nextTeams = teams.map((t) => {
    if (t.id !== teamId) return { id: t.id, players: [...t.players] };
    const players = [...t.players];
    players[slot] = entrant;
    return { id: t.id, players };
  });

  return {
    teams: nextTeams,
    inactivePool: nextPool,
    news: [
      ...newsOut,
      {
        teamId,
        lane,
        ...(!vacant && incumbent.name ? { departedName: incumbent.name } : {}),
        ...(!vacant ? { departedTier: incumbent.tier } : {}),
        ...(!vacant && incumbent.age != null ? { departedAge: incumbent.age } : {}),
        ...(!vacant && incumbent.id ? { departedId: incumbent.id } : {}),
        entrantName: entrant.name ?? "",
        entrantTier: entrant.tier,
        entrantPotential: entrant.potential ?? entrant.tier,
        ...(entrant.id ? { entrantId: entrant.id } : {}),
        entrantSource: "free-agent",
        marketNote: "fa-sign",
        ...(!vacant && incumbent.name ? { beatenNames: [incumbent.name] } : {}),
      },
    ],
    ok: true,
  };
}

/**
 * User recalls their own academy player into a lane when they beat the
 * incumbent by {@link ACADEMY_OPEN_REPLACE_GAP} (looser than FA's
 * {@link FA_OPEN_REPLACE_GAP}). Same-org exclusivity enforced.
 * Incumbent drops to this org's academy. Vacant slots skip the gap / stub park.
 * Same-window demotees cannot be recalled (`excludePlayerIds`).
 */
export function executeUserAcademyRecall(
  teams: MarketTeamInput[],
  pool: readonly MarketInactive[],
  teamId: string,
  lane: Lane,
  academyPlayerId: string,
  byId: Map<number, Champion>,
  meta: SeasonMetaSnapshot,
  year: number,
  gradeOf?: (playerId: string) => number | null,
  opts?: { requireGap?: boolean; excludePlayerIds?: ReadonlySet<string> },
): {
  teams: { id: string; players: Player[] }[];
  inactivePool: MarketInactive[];
  news: Array<MarketNewsEvent>;
  ok: boolean;
  reason?: string;
} {
  const passthrough = {
    teams: teams.map((t) => ({ id: t.id, players: [...t.players] })),
    inactivePool: [...pool],
    news: [] as Array<MarketNewsEvent>,
  };
  if (opts?.excludePlayerIds?.has(academyPlayerId)) {
    return { ...passthrough, ok: false, reason: "same-window-demote" };
  }
  const team = teams.find((t) => t.id === teamId);
  if (!team) return { ...passthrough, ok: false, reason: "no-team" };
  const slot = team.players.findIndex((p) => p.lane === lane);
  if (slot < 0) return { ...passthrough, ok: false, reason: "no-slot" };
  const acyIdx = pool.findIndex(
    (e) =>
      e.status === "academy" &&
      e.lastTeamId === teamId &&
      e.player.id === academyPlayerId &&
      e.player.lane === lane,
  );
  if (acyIdx < 0) return { ...passthrough, ok: false, reason: "acy-gone" };

  const acy = pool[acyIdx]!;
  const incumbent = team.players[slot]!;
  const vacant = isRosterVacancy(incumbent);
  const requireGap = opts?.requireGap ?? true;
  if (requireGap && !vacant) {
    const incGrade = incumbent.id && gradeOf ? gradeOf(incumbent.id) : null;
    const gain =
      inactiveTransferValue(acy, byId, meta) -
      transferValue(incumbent, incGrade, byId, meta);
    if (gain < ACADEMY_OPEN_REPLACE_GAP) {
      return { ...passthrough, ok: false, reason: "gap" };
    }
  }

  const entrant = applyComebackRust(acy.player, acy.inactiveYears, team.leagueId);
  let nextPool = pool.filter((_, i) => i !== acyIdx);
  const newsOut: MarketNewsEvent[] = [];
  if (!vacant) {
    const grade = incumbent.id && gradeOf ? gradeOf(incumbent.id) : null;
    // Cap: bump oldest → FA if full (recall already freed one slot, but
    // concurrent parks can still hit the cap).
    const parked = addToTeamAcademy(nextPool, {
      player: { ...incumbent, badStreak: 0 },
      status: "academy",
      inactiveYears: 1,
      demotedYear: year,
      clockYear: year,
      lastTeamId: team.id,
      lastTeamName: team.name,
      ...(grade != null ? { lastActiveGrade: grade, shadowGrade: grade } : {}),
    });
    nextPool = parked.pool;
    if (parked.bumped) newsOut.push(makeBecameFaNews(parked.bumped, "academy-bump"));
  }
  const nextTeams = teams.map((t) => {
    if (t.id !== teamId) return { id: t.id, players: [...t.players] };
    const players = [...t.players];
    players[slot] = entrant;
    return { id: t.id, players };
  });

  return {
    teams: nextTeams,
    inactivePool: nextPool,
    news: [
      ...newsOut,
      {
        teamId,
        lane,
        ...(!vacant && incumbent.name ? { departedName: incumbent.name } : {}),
        ...(!vacant ? { departedTier: incumbent.tier } : {}),
        ...(!vacant && incumbent.age != null ? { departedAge: incumbent.age } : {}),
        ...(!vacant && incumbent.id ? { departedId: incumbent.id } : {}),
        entrantName: entrant.name ?? "",
        entrantTier: entrant.tier,
        entrantPotential: entrant.potential ?? entrant.tier,
        ...(entrant.id ? { entrantId: entrant.id } : {}),
        entrantSource: "academy",
        marketNote: "academy-recall",
        ...(!vacant && incumbent.name ? { beatenNames: [incumbent.name] } : {}),
      },
    ],
    ok: true,
  };
}

/**
 * Sign an FA into the followed org's academy (not main roster). Resets the
 * academy badge clock to 1y at the new org while keeping `demotedYear` (the
 * year they left a main roster). Does **not** bump when full — caller / UI
 * must check {@link teamAcademyHasRoom} (reason `"academy-full"`).
 */
export function executeUserFaToAcademy(
  pool: readonly MarketInactive[],
  teamId: string,
  teamName: string,
  faPlayerId: string,
  year: number,
  opts?: { excludePlayerIds?: ReadonlySet<string> },
): {
  inactivePool: MarketInactive[];
  news: Array<MarketNewsEvent>;
  ok: boolean;
  reason?: string;
} {
  const passthrough = {
    inactivePool: [...pool],
    news: [] as Array<MarketNewsEvent>,
  };
  if (opts?.excludePlayerIds?.has(faPlayerId)) {
    return { ...passthrough, ok: false, reason: "same-window-demote" };
  }
  if (!teamAcademyHasRoom(pool, teamId)) {
    return { ...passthrough, ok: false, reason: "academy-full" };
  }
  const faIdx = pool.findIndex(
    (e) => e.status === "free-agent" && e.player.id === faPlayerId,
  );
  if (faIdx < 0) return { ...passthrough, ok: false, reason: "fa-gone" };
  const fa = pool[faIdx]!;
  const lane = fa.player.lane;
  let nextPool = pool.filter((_, i) => i !== faIdx);
  // Room already checked — no bump expected.
  nextPool = addToTeamAcademy(nextPool, {
    player: { ...fa.player, badStreak: 0 },
    status: "academy",
    inactiveYears: 1,
    demotedYear: fa.demotedYear,
    clockYear: year,
    lastTeamId: teamId,
    lastTeamName: teamName,
    ...(fa.lastActiveGrade != null
      ? { lastActiveGrade: fa.lastActiveGrade, shadowGrade: fa.shadowGrade ?? fa.lastActiveGrade }
      : fa.shadowGrade != null
        ? { shadowGrade: fa.shadowGrade }
        : {}),
  }).pool;
  return {
    inactivePool: nextPool,
    news: [
      {
        teamId,
        lane,
        entrantName: fa.player.name ?? "",
        entrantTier: fa.player.tier,
        entrantPotential: fa.player.potential ?? fa.player.tier,
        ...(fa.player.id ? { entrantId: fa.player.id } : {}),
        entrantSource: "free-agent",
        marketNote: "fa-academy",
      },
    ],
    ok: true,
  };
}

/**
 * Release a same-org academy player to free agency (FA · 1y clock).
 * `year` restarts the badge clock so the release archives as FA · 1y.
 */
export function executeUserAcademyRelease(
  pool: readonly MarketInactive[],
  teamId: string,
  academyPlayerId: string,
  year?: number,
): {
  inactivePool: MarketInactive[];
  news: Array<MarketNewsEvent>;
  ok: boolean;
  reason?: string;
} {
  const passthrough = {
    inactivePool: [...pool],
    news: [] as Array<MarketNewsEvent>,
  };
  const { pool: nextPool, released } = releaseAcademyToFa(
    pool,
    teamId,
    academyPlayerId,
    year,
  );
  if (!released) return { ...passthrough, ok: false, reason: "acy-gone" };
  return {
    inactivePool: nextPool,
    news: [makeBecameFaNews(released, "academy-release")],
    ok: true,
  };
}

/**
 * Strategic score for releasing an academy player → FA. Higher = more
 * release-worthy. Combines: low transferValue / meta fit, better same-lane
 * academy mate (redundant depth), aging + cold shadow, and final academy
 * year (about to hit the 3y → FA clock). Callers still require near-cap
 * occupancy and a rare chance roll.
 */
export function academyReleaseScore(
  entry: MarketInactive,
  orgAcademy: readonly MarketInactive[],
  byId: Map<number, Champion>,
  meta: SeasonMetaSnapshot,
): number {
  const value = inactiveTransferValue(entry, byId, meta);
  const breakdown = inactiveValueBreakdown(entry, byId, meta);
  let score = 0;

  // Low value / cold meta — alone can clear the min score when very weak.
  if (value <= AI_ACADEMY_RELEASE_MAX_VALUE) {
    score += 1.4 + (AI_ACADEMY_RELEASE_MAX_VALUE - value);
  }
  if (breakdown.metaFit < -0.15) score += 0.6;

  // Better same-lane academy mate → release the weaker depth piece.
  let bestMateVal = -Infinity;
  for (const m of orgAcademy) {
    if (m.player.id === entry.player.id) continue;
    if (m.player.lane !== entry.player.lane) continue;
    bestMateVal = Math.max(bestMateVal, inactiveTransferValue(m, byId, meta));
  }
  if (bestMateVal > -Infinity) {
    const gap = bestMateVal - value;
    if (gap >= 0.45) score += 1.2 + Math.min(2, gap);
  }

  // Aging / cold shadow — veterans cooling in the affiliate.
  const age = entry.player.age ?? 22;
  const shadow = entry.shadowGrade ?? entry.lastActiveGrade ?? GRADE_NEUTRAL;
  if (age >= 26 && shadow < 5.2) score += 1.2;
  if (age >= 28) score += 0.7;
  if (shadow < 4.5) score += 0.9;

  // Near personal tenure: prefer purposeful early cuts so weak depth drips
  // to FA instead of a synchronized soft-max dump.
  const years = Math.max(1, entry.inactiveYears < 1 ? 1 : entry.inactiveYears);
  const tenure = academyTenureYears(entry);
  if (years >= tenure) score += 2.0;
  else if (years >= tenure - 1) score += 1.2;

  return score;
}

/**
 * AI: purposeful academy→FA releases when an org is near the cap
 * (≥ {@link AI_ACADEMY_RELEASE_MIN_COUNT}). Picks the highest
 * {@link academyReleaseScore} candidate (low value, same-lane depth, aging
 * cold shadow, year-2/3 tenure) — drips weak depth out before the year-3
 * clock dump. At most {@link MAX_AI_ACADEMY_RELEASE_PER_TEAM} per team.
 * Announces via academy-release news (became-FA board).
 */
export function runAiAcademyReleasePass(
  teams: { id: string; name: string }[],
  pool: MarketInactive[],
  byId: Map<number, Champion>,
  meta: SeasonMetaSnapshot,
  rng: RNG,
  /** Closing / current franchise year — restarts the released FA · 1y clock. */
  releaseYear?: number,
  opts?: { skipTeamIds?: ReadonlySet<string> },
): {
  inactivePool: MarketInactive[];
  news: Array<MarketNewsEvent>;
} {
  let working = [...pool];
  const news: Array<MarketNewsEvent> = [];
  const skip = opts?.skipTeamIds;
  const releasedByTeam = new Map<string, number>();

  for (const team of teams) {
    if (skip?.has(team.id)) continue;
    if ((releasedByTeam.get(team.id) ?? 0) >= MAX_AI_ACADEMY_RELEASE_PER_TEAM) continue;
    if (countTeamAcademy(working, team.id) < AI_ACADEMY_RELEASE_MIN_COUNT) continue;
    if (rng() > AI_ACADEMY_RELEASE_CHANCE) continue;

    const org = working.filter(
      (e) => e.status === "academy" && e.lastTeamId === team.id && !!e.player.id,
    );
    let bestIdx = -1;
    let bestScore = -Infinity;
    for (let i = 0; i < working.length; i++) {
      const e = working[i]!;
      if (e.status !== "academy" || e.lastTeamId !== team.id || !e.player.id) continue;
      const s = academyReleaseScore(e, org, byId, meta);
      if (s < AI_ACADEMY_RELEASE_MIN_SCORE) continue;
      if (s > bestScore || (s === bestScore && rng() < 0.5)) {
        bestScore = s;
        bestIdx = i;
      }
    }
    if (bestIdx < 0) continue;
    const victim = working[bestIdx]!;
    const pid = victim.player.id!;
    const { pool: next, released } = releaseAcademyToFa(
      working,
      team.id,
      pid,
      releaseYear,
    );
    if (!released) continue;
    working = next;
    releasedByTeam.set(team.id, (releasedByTeam.get(team.id) ?? 0) + 1);
    news.push(makeBecameFaNews(released, "academy-release"));
  }

  return { inactivePool: working, news };
}

/**
 * Park a generated prospect into the org academy (room required — no bump).
 * Used by user "Add academy rookie" and AI academy-rookie intake.
 */
export function executeAddAcademyRookie(
  pool: readonly MarketInactive[],
  teamId: string,
  teamName: string,
  rookie: Player,
  year: number,
): {
  inactivePool: MarketInactive[];
  news: Array<MarketNewsEvent>;
  ok: boolean;
  reason?: string;
} {
  const passthrough = {
    inactivePool: [...pool],
    news: [] as Array<MarketNewsEvent>,
  };
  if (!teamAcademyHasRoom(pool, teamId)) {
    return { ...passthrough, ok: false, reason: "academy-full" };
  }
  if (!rookie.id) return { ...passthrough, ok: false, reason: "no-id" };
  const nextPool = addToTeamAcademy(pool, {
    player: { ...rookie, badStreak: 0 },
    status: "academy",
    inactiveYears: 1,
    demotedYear: year,
    clockYear: year,
    lastTeamId: teamId,
    lastTeamName: teamName,
  }).pool;
  return {
    inactivePool: nextPool,
    news: [
      {
        teamId,
        lane: rookie.lane,
        entrantName: rookie.name ?? "",
        entrantTier: rookie.tier,
        entrantPotential: rookie.potential ?? rookie.tier,
        entrantId: rookie.id,
        entrantSource: "rookie",
        marketNote: "academy-rookie",
      },
    ],
    ok: true,
  };
}

/**
 * Lane with the fewest academy players for `teamId` (depth fill). Ties broken
 * by LANE order via caller shuffle / rng preference.
 */
export function shallowestAcademyLane(
  pool: readonly MarketInactive[],
  teamId: string,
  lanes: readonly Lane[],
  rng: RNG,
): Lane {
  const counts = new Map<Lane, number>();
  for (const lane of lanes) counts.set(lane, 0);
  for (const e of pool) {
    if (e.status !== "academy" || e.lastTeamId !== teamId) continue;
    counts.set(e.player.lane, (counts.get(e.player.lane) ?? 0) + 1);
  }
  let best = lanes[0]!;
  let bestN = Infinity;
  for (const lane of lanes) {
    const n = counts.get(lane) ?? 0;
    if (n < bestN || (n === bestN && rng() < 0.5)) {
      bestN = n;
      best = lane;
    }
  }
  return best;
}

/**
 * AI: stash a desirable FA into academy when the main roster does not need
 * them (FA does not clear {@link FA_OPEN_REPLACE_GAP} vs same-lane incumbent)
 * and the org has academy room. At most {@link MAX_AI_ACADEMY_STASH_PER_TEAM}.
 * Mid-split uses {@link AI_ACADEMY_STASH_CHANCE_MID_SPLIT}; offseason uses
 * {@link AI_ACADEMY_STASH_CHANCE}.
 *
 * `stashYear` is the closing / current year: it restarts the academy badge
 * clock while `demotedYear` keeps pointing at the year they left a main
 * roster. Passing an intake year here would freeze the new Acy · 1y badge for
 * two calendar years.
 */
export function runAiAcademyStashPass(
  teams: { id: string; name: string; leagueId?: string; players: Player[] }[],
  pool: MarketInactive[],
  byId: Map<number, Champion>,
  meta: SeasonMetaSnapshot,
  rng: RNG,
  stashYear: number,
  opts?: { skipTeamIds?: ReadonlySet<string>; midSplit?: boolean },
): {
  inactivePool: MarketInactive[];
  news: Array<MarketNewsEvent>;
} {
  let working = [...pool];
  const news: Array<MarketNewsEvent> = [];
  const skip = opts?.skipTeamIds;
  const stashedByTeam = new Map<string, number>();
  const midSplit = opts?.midSplit ?? false;
  const chance = midSplit ? AI_ACADEMY_STASH_CHANCE_MID_SPLIT : AI_ACADEMY_STASH_CHANCE;
  // Roll once per team so mid-split chance doesn't re-roll every bid.
  const allowTeam = new Set<string>();
  for (const t of teams) {
    if (skip?.has(t.id)) continue;
    if (chance >= 1 || rng() < chance) allowTeam.add(t.id);
  }

  // Don't drain a thin FA board — orgs still need vacancy fills.
  const faCount = working.filter((e) => e.status === "free-agent").length;
  if (faCount < AI_ACADEMY_ROOKIE_FA_THIN) {
    return { inactivePool: working, news };
  }

  type Bid = { teamIdx: number; poolIdx: number; value: number; fa: MarketInactive };
  let guard = teams.length * MAX_AI_ACADEMY_STASH_PER_TEAM + 2;
  while (guard-- > 0) {
    let best: Bid | null = null;
    for (let ti = 0; ti < teams.length; ti++) {
      const team = teams[ti]!;
      if (!allowTeam.has(team.id)) continue;
      if ((stashedByTeam.get(team.id) ?? 0) >= MAX_AI_ACADEMY_STASH_PER_TEAM) continue;
      if (!teamAcademyHasRoom(working, team.id)) continue;

      for (let pi = 0; pi < working.length; pi++) {
        const fa = working[pi]!;
        if (fa.status !== "free-agent" || !fa.player.id) continue;
        const value = inactiveTransferValue(fa, byId, meta);
        if (value < AI_ACADEMY_STASH_MIN_VALUE) continue;
        const incumbent = team.players.find((p) => p.lane === fa.player.lane);
        if (incumbent && !isRosterVacancy(incumbent)) {
          const gain = value - transferValue(incumbent, null, byId, meta);
          // Roster "needs" them — leave for open-FA / user sign, don't stash.
          if (gain >= FA_OPEN_REPLACE_GAP) continue;
        }
        if (!best || value > best.value || (value === best.value && rng() < 0.5)) {
          best = { teamIdx: ti, poolIdx: pi, value, fa };
        }
      }
    }
    if (!best) break;

    const team = teams[best.teamIdx]!;
    const fa = working[best.poolIdx]!;
    working.splice(best.poolIdx, 1);
    working = addToTeamAcademy(working, {
      player: { ...fa.player, badStreak: 0 },
      status: "academy",
      inactiveYears: 1,
      demotedYear: fa.demotedYear,
      clockYear: stashYear,
      lastTeamId: team.id,
      lastTeamName: team.name,
      ...(fa.lastActiveGrade != null
        ? { lastActiveGrade: fa.lastActiveGrade, shadowGrade: fa.shadowGrade ?? fa.lastActiveGrade }
        : fa.shadowGrade != null
          ? { shadowGrade: fa.shadowGrade }
          : {}),
    }).pool;
    stashedByTeam.set(team.id, (stashedByTeam.get(team.id) ?? 0) + 1);
    news.push({
      teamId: team.id,
      lane: fa.player.lane,
      entrantName: fa.player.name ?? "",
      entrantTier: fa.player.tier,
      entrantPotential: fa.player.potential ?? fa.player.tier,
      ...(fa.player.id ? { entrantId: fa.player.id } : {}),
      entrantSource: "free-agent",
      marketNote: "academy-stash",
    });

    // Stop if further stashes would push FA below the thin floor.
    if (working.filter((e) => e.status === "free-agent").length < AI_ACADEMY_ROOKIE_FA_THIN) {
      break;
    }
  }

  return { inactivePool: working, news };
}

/** Crude value for pressure-valve sorts when meta may be unavailable. */
function graduatePressureValue(entry: MarketInactive): number {
  const tier = PLAYER_TIER_VALUE[entry.player.tier] ?? 0;
  const pot = entry.player.potential
    ? (PLAYER_TIER_VALUE[entry.player.potential] ?? tier)
    : tier;
  const shadow = entry.shadowGrade ?? entry.lastActiveGrade ?? GRADE_NEUTRAL;
  return tier + 0.35 * pot + 0.08 * (shadow - GRADE_NEUTRAL);
}

/**
 * Personal academy stay before year-end clock can send them to FA.
 * Weak → {@link ACADEMY_YEARS_MIN}, typical → soft 3, high-value → {@link ACADEMY_YEARS_MAX},
 * then shifted by {@link MarketInactive.academyTenureShift} (cohort desync).
 * A shift may push below {@link ACADEMY_YEARS_MIN} — that is the point: an
 * early-exit prospect leaves after one full year-end tick.
 */
export function academyTenureYears(entry: MarketInactive): number {
  const v = graduatePressureValue(entry);
  const base =
    v < ACADEMY_EARLY_EXIT_MAX_VALUE
      ? ACADEMY_YEARS_MIN
      : v >= ACADEMY_EXTEND_MIN_VALUE
        ? ACADEMY_YEARS_MAX
        : ACADEMY_YEARS;
  const shift = entry.academyTenureShift ?? 0;
  if (shift === 0) return base;
  return Math.max(1, Math.min(ACADEMY_YEARS_MAX, base + shift));
}

/**
 * Structural anti-wave: after year-end advance, keep at most
 * {@link ACADEMY_GRADUATE_CAP_PER_YEAR} new academy→FA transitions (highest
 * value). Surplus under {@link ACADEMY_YEARS_MAX} stay academy one more year;
 * surplus already past the hard ceiling retire (weakest exit the system).
 * Snaps kept graduates to FA · 1y so variable tenure does not skew FA clocks.
 *
 * Composes with {@link applyFaGraduatePressure} (call this first).
 */
export function applyAcademyGraduateCap(
  before: readonly MarketInactive[],
  after: readonly MarketInactive[],
): MarketInactive[] {
  const beforeById = new Map(
    before.filter((e) => e.player.id).map((e) => [e.player.id!, e] as const),
  );
  const graduateIdx: number[] = [];
  for (let i = 0; i < after.length; i++) {
    const e = after[i]!;
    if (e.status !== "free-agent" || !e.player.id) continue;
    const prev = beforeById.get(e.player.id);
    if (prev?.status === "academy") graduateIdx.push(i);
  }
  if (graduateIdx.length === 0) return [...after];

  // No clock restart: this graduation *is* the year-end tick, so the fresh
  // FA · 1y must tick again next year-end.
  const snapFa = (e: MarketInactive): MarketInactive => toFreeAgentFromAcademy(e);

  if (graduateIdx.length <= ACADEMY_GRADUATE_CAP_PER_YEAR) {
    const set = new Set(graduateIdx);
    return after.map((e, i) => (set.has(i) ? snapFa(e) : e));
  }

  const ranked = graduateIdx
    .map((i) => ({ i, v: graduatePressureValue(after[i]!) }))
    .sort((a, b) => b.v - a.v || a.i - b.i);
  const keepFa = new Set(
    ranked.slice(0, ACADEMY_GRADUATE_CAP_PER_YEAR).map((r) => r.i),
  );
  const gradSet = new Set(graduateIdx);

  return after.map((e, i) => {
    if (!gradSet.has(i)) return e;
    if (keepFa.has(i)) return snapFa(e);
    const prev = e.player.id ? beforeById.get(e.player.id) : undefined;
    const advancedYears = prev
      ? (prev.inactiveYears < 1 ? 1 : prev.inactiveYears) + 1
      : e.inactiveYears < 1
        ? 1
        : e.inactiveYears;
    if (advancedYears <= ACADEMY_YEARS_MAX) {
      return { ...e, status: "academy" as const, inactiveYears: advancedYears };
    }
    return { ...e, status: "retired" as const, inactiveYears: advancedYears };
  });
}

/**
 * Year-end pressure valve: when unsigned FA count (excluding new academy
 * graduates) is already ≥ {@link TARGET_FA_POOL}.max, only the top
 * {@link FA_OVERFLOW_KEEP_GRADUATES} graduates by value become FA — the rest
 * retire. Keeps academy max / FA year clocks unchanged for everyone else.
 *
 * `before` / `after` are the pool pre/post {@link advanceInactivePool}.
 */
export function applyFaGraduatePressure(
  before: readonly MarketInactive[],
  after: readonly MarketInactive[],
): MarketInactive[] {
  const beforeById = new Map(
    before.filter((e) => e.player.id).map((e) => [e.player.id!, e] as const),
  );
  const faExcludingGraduates = after.filter((e) => {
    if (e.status !== "free-agent" || !e.player.id) return false;
    const prev = beforeById.get(e.player.id);
    return !(prev?.status === "academy");
  }).length;

  if (faExcludingGraduates < TARGET_FA_POOL.max) return [...after];

  const graduateIdx: number[] = [];
  for (let i = 0; i < after.length; i++) {
    const e = after[i]!;
    if (e.status !== "free-agent" || !e.player.id) continue;
    const prev = beforeById.get(e.player.id);
    if (prev?.status === "academy") graduateIdx.push(i);
  }
  if (graduateIdx.length <= FA_OVERFLOW_KEEP_GRADUATES) return [...after];

  const ranked = graduateIdx
    .map((i) => ({ i, v: graduatePressureValue(after[i]!) }))
    .sort((a, b) => b.v - a.v || a.i - b.i);
  const retireIdx = new Set(ranked.slice(FA_OVERFLOW_KEEP_GRADUATES).map((r) => r.i));
  return after.map((e, i) => (retireIdx.has(i) ? { ...e, status: "retired" as const } : e));
}

/**
 * When FA count > {@link FA_OVERFLOW_ACCEL_ABOVE}, retire lowest-value FAs that
 * already have ≥2 FA years (inactiveYears ≥ ACADEMY_YEARS + 2) until the pool
 * is back to {@link TARGET_FA_POOL}.max. Does not touch fresh FA · 1y.
 */
export function cullWeakFaWhenOversized(
  pool: readonly MarketInactive[],
): MarketInactive[] {
  const faIdx: number[] = [];
  for (let i = 0; i < pool.length; i++) {
    if (pool[i]!.status === "free-agent") faIdx.push(i);
  }
  if (faIdx.length <= FA_OVERFLOW_ACCEL_ABOVE) return [...pool];

  const eligible = faIdx
    .filter((i) => {
      const y = pool[i]!.inactiveYears < 1 ? 1 : pool[i]!.inactiveYears;
      return y >= ACADEMY_YEARS + 2;
    })
    .map((i) => ({ i, v: graduatePressureValue(pool[i]!) }))
    .sort((a, b) => a.v - b.v || a.i - b.i);

  const excess = faIdx.length - TARGET_FA_POOL.max;
  if (excess <= 0 || eligible.length === 0) return [...pool];
  const retireIdx = new Set(eligible.slice(0, excess).map((r) => r.i));
  if (retireIdx.size === 0) return [...pool];
  return pool.map((e, i) => (retireIdx.has(i) ? { ...e, status: "retired" as const } : e));
}

export function yearsLeftToRetire(entry: MarketInactive): number {
  if (entry.status === "retired") return 0;
  return Math.max(0, TOTAL_INACTIVE_BEFORE_RETIRE - Math.max(1, entry.inactiveYears));
}

export function yearsLeftToFa(entry: MarketInactive): number {
  if (entry.status !== "academy") return 0;
  return Math.max(0, academyTenureYears(entry) - Math.max(1, entry.inactiveYears));
}

