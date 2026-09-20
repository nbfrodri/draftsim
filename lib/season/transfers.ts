// Between-splits player transfers — a light, fully automatic free-agency
// window. After a split wraps (and player development has run), standout
// players move up and weak links move down. A player's TRANSFER VALUE blends
// three signals so champion pools matter beyond raw tier:
//   • skill tier            (PLAYER_TIER_VALUE, the dominant term)
//   • this split's grades   (avg 1-10 match rating for their roster slot)
//   • champion-pool fit     (how strong their pool is under the CURRENT patch)
// so a star whose pool went cold this patch can lose a seat to an equal-tier
// player whose mains are S-tier now. Cross-region, ~1-2 moves per lane per
// split — deriveStar re-rates teams automatically from the swapped rosters.
//
// Self-contained (no engine/stats imports) to stay off the season import
// cycle; the grade walk mirrors teamSeasonGrades(), scoped to one split.

import type { Champion, Lane, Player, PlayerTier } from "../types";
import {
  LANE_ORDER,
  PLAYER_TIER_VALUE,
  MAIN_POOL,
  SECONDARY_COMFORT,
  deriveStar,
} from "../players";
import {
  CHAMPION_META,
  TIER_VALUE as META_TIER_VALUE,
  type MetaTier,
} from "../championMeta";
import { computeGameRatings } from "../matchSimulator";
import {
  LEAGUE_IDS,
  QUALIFYING_SPLIT,
  TEAMS_PER_LEAGUE,
  type InternationalId,
  type LeagueId,
  type PlayerTransfer,
  type ProposedTransfer,
  type SeasonMetaSnapshot,
  type SeasonPhase,
  type SeasonState,
  type SeasonTeam,
  type SplitId,
  type TransferPlayer,
} from "./types";

// ── Calibration knobs (ponytail: tune here, not in the logic) ──────────────
// How much a great/poor split and a hot/cold pool move transfer value,
// relative to skill tier (1 tier-step = 1.0). A standout split (grade ~8) or a
// fully S-tier pool each swing value by ~+1 — meaningful, but skill still leads.
const W_PERF = 0.35; // × (grade − 5.5); grade is 1..10
const W_META = 0.4; //  × pool-fit, where fit ≈ avg(metaTierValue − B) over pool
const GRADE_NEUTRAL = 5.5;
const POOL_NEUTRAL = META_TIER_VALUE.B; // a "B"-meta champion is neutral fit
// A swap needs roughly this much value justification, and at most this many
// moves happen per lane per window. With 60 teams (six regions) the gap guard
// is what really limits volume — only genuine mismatches move — so the cap is
// generous: up to MAX_MOVES_PER_LANE × 5 lanes ≈ 30 cross-region moves/window.
const VALUE_GAP_MIN = 0.8;
const MAX_MOVES_PER_LANE = 6;
// How much value the OTHER team may lose and still agree to a user-initiated
// swap (they accept incoming ≥ outgoing − tolerance). Roughly half a tier of
// give — enough for lateral / pool-fit trades, not enough to rob a superstar.
const WILLING_TOL = 0.6;
// The post-Worlds offseason is the big window — teams are far more willing to
// move players, and the auto market is much more active (lower gap, higher cap).
const OFFSEASON_WILLING_TOL = 1.3;
const OFFSEASON_GAP_MIN = 0.35;
const OFFSEASON_MAX_MOVES = 10;

// Cross-region moves are HARD: top players don't get poached abroad, they stay
// franchise cornerstones in their own region — so the best talent doesn't all
// funnel into the strongest regions. Only players AT OR BELOW this tier cross
// regions in the auto market; anyone better stays home (they can still move
// WITHIN their region). ponytail: dial down to "B" for even stricter borders.
const CROSS_REGION_TIER_CAP = PLAYER_TIER_VALUE.A; // S / S+ never cross
function crossRegionBlocked(
  star: { tier: PlayerTier },
  fromLeague: string,
  toLeague: string,
): boolean {
  return fromLeague !== toLeague && PLAYER_TIER_VALUE[star.tier] > CROSS_REGION_TIER_CAP;
}

/** Inline vacancy check — avoid importing faMarket (cycle via transferValue). */
function isVacancyStub(p: Player | null | undefined): boolean {
  return !!p?.id?.startsWith("__vacancy__");
}

// Champion's meta tier in a lane under this snapshot: the split's full,
// patch-shifted override first, then the baseline dataset. Null = untiered
// there (skipped from pool fit). Mirrors applyPatchShift's source order.
function metaTierAt(
  alias: string,
  lane: Lane,
  meta: SeasonMetaSnapshot,
): MetaTier | null {
  return meta.metaOverride?.[alias]?.[lane] ?? CHAMPION_META[alias]?.metaTiers?.[lane] ?? null;
}

// Pool fit: weighted average of (metaTierValue − neutral) over the player's
// liked champs in their lane, mains full weight and secondaries SECONDARY_COMFORT
// (same weighting poolBias uses). 0 when no pool champ is tiered in the lane.
export function poolFit(
  player: Player,
  byId: Map<number, Champion>,
  meta: SeasonMetaSnapshot,
): number {
  let wsum = 0;
  let vsum = 0;
  player.goodChamps.forEach((id, i) => {
    const champ = byId.get(id);
    if (!champ) return;
    const tier = metaTierAt(champ.alias, player.lane, meta);
    if (!tier) return;
    const w = i < MAIN_POOL ? 1 : SECONDARY_COMFORT;
    wsum += w;
    vsum += w * (META_TIER_VALUE[tier] - POOL_NEUTRAL);
  });
  return wsum > 0 ? vsum / wsum : 0;
}

// How much an un-acclimated cross-region import is discounted: a brand-new
// import (acclimation 0) is worth ~0.5 tiers less right now, fading to 0 as
// they settle — teams price in the language-barrier dip.
const W_COHESION = 0.5;

// A player's transfer value: skill + split form + pool fit − language barrier.
// `grade` is the slot's average match rating this split (null = didn't play).
export function transferValue(
  player: Player,
  grade: number | null,
  byId: Map<number, Champion>,
  meta: SeasonMetaSnapshot,
): number {
  let v = PLAYER_TIER_VALUE[player.tier];
  if (grade != null) v += W_PERF * (grade - GRADE_NEUTRAL);
  v += W_META * poolFit(player, byId, meta);
  const acc = Math.max(0, Math.min(1, player.acclimation ?? 1)); // guard NaN/out-of-range
  v -= W_COHESION * (1 - acc);
  return v;
}

// A fresh cross-region import starts behind the language barrier. An IN-SEASON
// move is the cold-start case (mid-split disruption); an OFFSEASON move gets a
// full preseason to adjust, so it lands far more settled — an offseason rebuild
// integrates much faster than a panic trade.
export const IMPORT_ACC_INSEASON = 0.15;
export const IMPORT_ACC_OFFSEASON = 0.5;

// Re-settle a player after a transfer to `toLeague` (they came from
// `fromLeague`). Coming home → fully acclimated; lateral within a region →
// unchanged; a fresh cross-region move → resets acclimation low (the barrier),
// higher when `preseason` (offseason window — time to adjust before the year).
export function settle(
  player: Player,
  fromLeague: string,
  toLeague: string,
  preseason = false,
): Player {
  if (!player.homeRegion) return player;
  if (toLeague === player.homeRegion) return { ...player, acclimation: 1 };
  if (toLeague === fromLeague) return player;
  return {
    ...player,
    acclimation: preseason ? IMPORT_ACC_OFFSEASON : IMPORT_ACC_INSEASON,
  };
}

// ── Split grades (per team, per lane slot) ─────────────────────────────────
// Average 1-10 match rating for each roster slot across the split's
// tournaments. Scoped variant of teamSeasonGrades(); kept here to avoid the
// engine↔stats import cycle. ponytail: if a third caller appears, fold the two.
function splitLaneGrades(
  season: SeasonState,
  tournamentIds: string[],
): Map<string, (number | null)[]> {
  const sums = new Map<string, number[]>();
  const counts = new Map<string, number[]>();
  const ensure = (m: Map<string, number[]>, id: string) => {
    let row = m.get(id);
    if (!row) {
      row = [0, 0, 0, 0, 0];
      m.set(id, row);
    }
    return row;
  };
  for (const tid of tournamentIds) {
    const t = season.tournaments[tid];
    if (!t) continue;
    for (const match of t.matches) {
      if (match.isBye || !match.series) continue;
      for (const teamId of [match.blueTeamId, match.redTeamId]) {
        if (!teamId) continue;
        const side: "blue" | "red" = teamId === match.blueTeamId ? "blue" : "red";
        for (const game of match.series.games) {
          if (game.status !== "complete" || game.winner == null) continue;
          const recap = game.recap;
          if (!recap) continue;
          let ratings = recap.ratings ?? null;
          if (!ratings && recap.perPickKDA) ratings = computeGameRatings(recap, game.winner);
          if (!ratings) continue;
          const notes = side === "blue" ? ratings.blue : ratings.red;
          const s = ensure(sums, teamId);
          const c = ensure(counts, teamId);
          for (let i = 0; i < 5; i++) {
            const v = notes[i];
            if (typeof v !== "number" || !Number.isFinite(v)) continue;
            s[i] += v;
            c[i] += 1;
          }
        }
      }
    }
  }
  const out = new Map<string, (number | null)[]>();
  for (const [teamId, s] of sums) {
    const c = counts.get(teamId)!;
    out.set(teamId, s.map((sum, i) => (c[i] > 0 ? sum / c[i] : null)));
  }
  return out;
}

// ── Destination desirability ───────────────────────────────────────────────
// How attractive a team is to move TO: this split's league finish + a fixed
// region-prestige bonus (LEAGUE_IDS is the canonical inter-league ranking). A
// top team in a top region is the most desirable seat; winning a weaker region
// rates near a mid-table strong-region team. ponytail: fixed prestige order;
// wire leagueStrength in here if regionTides should sway the market too.
// How strongly region PRESTIGE (vs. the team's own finish/strength) pulls
// transfers. At 1.0 a top region's pull rivals a team's whole finish, so good
// players funnel into LCK/LPL and minor regions hollow out over the years.
// Scaling it down lets team strength dominate, spreading talent to strong teams
// in ANY region. ponytail: tune here — 0 = region-blind, 1 = original behavior.
export const TRANSFER_PRESTIGE_WEIGHT = 0.5;
function regionBonus(league: LeagueId): number {
  return (LEAGUE_IDS.length - LEAGUE_IDS.indexOf(league)) * TRANSFER_PRESTIGE_WEIGHT; // LCK .. LCP
}

function destScores(season: SeasonState, split: SplitId): Map<string, number> {
  const finishByLeague = (split && season.splitResults[split]) || {};
  const out = new Map<string, number>();
  for (const team of season.teams) {
    const order = finishByLeague[team.leagueId] ?? [];
    const idx = order.indexOf(team.id);
    const finish = idx >= 0 ? TEAMS_PER_LEAGUE - idx : TEAMS_PER_LEAGUE / 2; // 10..1
    out.set(team.id, regionBonus(team.leagueId) + finish);
  }
  return out;
}

// ── Swap planner (pure, testable) ──────────────────────────────────────────
export interface LaneEntry {
  teamId: string;
  value: number;
  dest: number; // destination desirability of this player's current team
}
export interface PlannedSwap {
  aTeamId: string; // the stuck star (high value, undesirable team) → moves up
  bTeamId: string; // the weak link (low value, desirable team)    → moves down
}

const norm = (x: number, lo: number, hi: number) => (hi > lo ? (x - lo) / (hi - lo) : 0.5);

// Pick up to MAX_MOVES_PER_LANE poach pairs: the most "underplaced" player
// (high value, low-desirability team) swaps with the most "overplaced" one
// (low value, high-desirability team), provided the value gap clears the floor
// and the move is genuinely upward. Each team is used at most once per lane.
export function planLaneSwaps(
  entries: LaneEntry[],
  // The offseason (biggest window of the year) passes a lower gap + higher cap
  // so far more players change teams than during the lighter in-season windows.
  opts: { gapMin?: number; maxMoves?: number } = {},
): PlannedSwap[] {
  const gapMin = opts.gapMin ?? VALUE_GAP_MIN;
  const maxMoves = opts.maxMoves ?? MAX_MOVES_PER_LANE;
  const swaps: PlannedSwap[] = [];
  const used = new Set<string>();
  for (let move = 0; move < maxMoves; move++) {
    const pool = entries.filter((e) => !used.has(e.teamId));
    if (pool.length < 2) break;
    const vs = pool.map((e) => e.value);
    const ds = pool.map((e) => e.dest);
    const [vlo, vhi] = [Math.min(...vs), Math.max(...vs)];
    const [dlo, dhi] = [Math.min(...ds), Math.max(...ds)];
    let star: LaneEntry | null = null; // max(vNorm − dNorm)
    let link: LaneEntry | null = null; // max(dNorm − vNorm)
    let starM = -Infinity;
    let linkM = -Infinity;
    for (const e of pool) {
      const m = norm(e.value, vlo, vhi) - norm(e.dest, dlo, dhi);
      if (m > starM) (starM = m), (star = e);
      if (-m > linkM) (linkM = -m), (link = e);
    }
    if (!star || !link || star.teamId === link.teamId) break;
    if (star.value - link.value < gapMin) break;
    if (link.dest <= star.dest) break; // weak link's team must be the better seat
    swaps.push({ aTeamId: star.teamId, bTeamId: link.teamId });
    used.add(star.teamId);
    used.add(link.teamId);
  }
  return swaps;
}

function snapshot(player: Player, grade: number | null): TransferPlayer {
  return {
    ...(player.id ? { id: player.id } : {}),
    ...(player.name ? { name: player.name } : {}),
    tier: player.tier,
    grade,
    goodChamps: [...player.goodChamps],
  };
}

// Roster-stability reward: in a transfer window that saw real movement, teams
// that made NO transfer (kept their roster between splits) carry a small form
// edge into the next split over the teams that reshuffled. Form is relative
// (starRatingBias uses the blue−red difference), so this is a genuine in-season
// compensation for stability, and it decays like any form.
export const STABILITY_FORM_BONUS = 0.15;
export function rewardRosterStability(
  teamForm: Record<string, number>,
  teamIds: readonly string[],
  involved: ReadonlySet<string>,
  bonus = STABILITY_FORM_BONUS,
): Record<string, number> {
  const next = { ...teamForm };
  for (const id of teamIds) {
    if (involved.has(id)) continue; // a team that moved someone gets no bonus
    next[id] = Math.max(-1, Math.min(1, (next[id] ?? 0) + bonus));
  }
  return next;
}

// ── Entry point ────────────────────────────────────────────────────────────
// Runs as a transfer window opens — i.e. when the FIRST STAND / MSI
// international that precedes it completes. Performance is read across the
// qualifying split plus that international; champion-pool fit uses the
// just-shifted patch. Stores the window's auto-applied moves under
// transfersByEvent[event]; moves touching the followed team become proposals.
export function applyTransfers(
  season: SeasonState,
  champions: readonly Champion[],
  intlPhase: SeasonPhase,
): SeasonState {
  if (!season.config.playerTransfers) return season;
  const event = intlPhase.event;
  if (!event || event === "worlds") return season; // no window after Worlds
  const split = QUALIFYING_SPLIT[event];
  const byId = new Map(champions.map((c) => [c.id, c]));
  // Grade over the qualifying split's games plus this international's.
  const grades = splitLaneGrades(season, windowGradeTids(season, event));
  const dest = destScores(season, split);
  const meta = season.currentMeta;

  // Mutable team lookup; swaps below rewrite the lane slot in place.
  const teams = new Map(season.teams.map((t) => [t.id, { ...t, players: [...t.players] }]));
  const transfers: PlayerTransfer[] = [];
  const proposals: ProposedTransfer[] = [];
  const controlledId = season.config.controlledTeamId;
  const gradeOf = (teamId: string, li: number) => grades.get(teamId)?.[li] ?? null;

  // Per-team window cap — the SAME limit the user has applies to every team, so
  // no AI side overhauls more than its allotment across lanes this window.
  const cap = maxUserTransfers(event);
  const teamMoves = new Map<string, number>();
  const atCap = (id: string) => (teamMoves.get(id) ?? 0) >= cap;
  const bump = (id: string) => teamMoves.set(id, (teamMoves.get(id) ?? 0) + 1);

  for (let li = 0; li < LANE_ORDER.length; li++) {
    const lane = LANE_ORDER[li];
    const entries: LaneEntry[] = [];
    for (const team of teams.values()) {
      const player = team.players[li];
      // Vacancy stubs are not transferable players (would show as "Unknown").
      if (!player || isVacancyStub(player)) continue;
      entries.push({
        teamId: team.id,
        value: transferValue(player, gradeOf(team.id, li), byId, meta),
        dest: dest.get(team.id) ?? 0,
      });
    }
    for (const { aTeamId, bTeamId } of planLaneSwaps(entries)) {
      // Either side already used its window allotment → skip (don't even propose
      // a move to a team that's full, since accepting would exceed its cap).
      if (atCap(aTeamId) || atCap(bTeamId)) continue;
      const a = teams.get(aTeamId)!;
      const b = teams.get(bTeamId)!;
      const pa = a.players[li]; // stuck star → goes to b (better seat)
      const pb = b.players[li]; // weak link → goes to a (the poacher's old slot)
      // Same-id / vacancy noops are not real transfers (tier-only noise).
      if (!pa || !pb || isVacancyStub(pa) || isVacancyStub(pb)) continue;
      if (pa.id && pb.id && pa.id === pb.id) continue;
      if (pa.name && pb.name && pa.name === pb.name) continue;
      // Neither side of a cross-region swap may be elite — value (not tier)
      // ranks the pair, so a slumping S-tier can land as the weak-link `pb`;
      // keep top talent home so it doesn't funnel into the strongest regions.
      if (
        crossRegionBlocked(pa, a.leagueId, b.leagueId) ||
        crossRegionBlocked(pb, b.leagueId, a.leagueId)
      )
        continue;
      const starSnap = snapshot(pa, gradeOf(aTeamId, li));
      const swapSnap = snapshot(pb, gradeOf(bTeamId, li));
      // A move touching the followed team is the user's call — propose it, but
      // leave both rosters untouched until they accept.
      if (controlledId && (aTeamId === controlledId || bTeamId === controlledId)) {
        const isController = aTeamId === controlledId; // controller is the poached star
        proposals.push({
          event,
          lane,
          laneIndex: li,
          controlledTeamId: controlledId,
          otherTeamId: isController ? bTeamId : aTeamId,
          kind: isController ? "outgoing" : "incoming",
          mine: isController ? starSnap : swapSnap,
          theirs: isController ? swapSnap : starSnap,
        });
        continue;
      }
      a.players[li] = settle(pb, b.leagueId, a.leagueId);
      b.players[li] = settle(pa, a.leagueId, b.leagueId);
      transfers.push({ event, lane, fromTeamId: aTeamId, toTeamId: bTeamId, star: starSnap, swap: swapSnap });
      bump(aTeamId);
      bump(bTeamId);
    }
  }

  if (transfers.length === 0 && proposals.length === 0) return season;
  // NOTE: the roster-stability form bonus is NOT applied here — it's awarded
  // when the window CLOSES (awardStabilityBonus, called from the engine), using
  // the FINAL transfersByEvent[event]. That way a followed team that DECLINES a
  // proposal (so it never lands in transfersByEvent) correctly counts as having
  // sat the window out, with no double-counting.
  return {
    ...season,
    teams: [...teams.values()],
    transfersByEvent: { ...season.transfersByEvent, [event]: transfers },
    proposedTransfers: proposals,
  };
}

// Award the roster-stability bonus for a CLOSED transfer window: every team
// that made no move this window (not in the final transfersByEvent[event]) gets
// a small form edge over the teams that reshuffled. Idempotent per window only
// if called once at close. No-op when form isn't tracked or the window saw no
// churn (a relative bonus is meaningless if nobody moved).
export function awardStabilityBonus(
  season: SeasonState,
  event: InternationalId,
): SeasonState {
  if (!season.teamForm) return season;
  const moves = season.transfersByEvent?.[event] ?? [];
  if (moves.length === 0) return season;
  const involved = new Set<string>();
  for (const m of moves) {
    involved.add(m.fromTeamId);
    involved.add(m.toTeamId);
  }
  return {
    ...season,
    teamForm: rewardRosterStability(
      season.teamForm,
      season.teams.map((t) => t.id),
      involved,
    ),
  };
}

// Apply or dismiss a pending followed-team transfer (by index into
// season.proposedTransfers). Accepting swaps the two teams' players in that
// lane and logs it into the window's recap; either way the proposal is
// removed. deriveStar re-rates teams automatically.
export function resolveTransfer(
  season: SeasonState,
  index: number,
  accept: boolean,
): SeasonState {
  const props = season.proposedTransfers;
  if (!props || index < 0 || index >= props.length) return season;
  const prop = props[index];
  const remaining = props.filter((_, i) => i !== index);
  // Accepting counts toward the followed team's per-window cap (and the
  // one-move-per-role rule) — drop the proposal as if declined once either is
  // hit, so accepting proposals can't exceed the limit the shop path enforces.
  if (
    accept &&
    (userTransferCapReached(season, prop.event, prop.controlledTeamId) ||
      teamMovedAtLane(season, prop.event, prop.controlledTeamId, prop.lane))
  ) {
    return { ...season, proposedTransfers: remaining };
  }
  if (!accept) return { ...season, proposedTransfers: remaining };
  const teams = season.teams.map((t) =>
    t.id === prop.controlledTeamId || t.id === prop.otherTeamId
      ? { ...t, players: [...t.players] }
      : t,
  );
  const a = teams.find((t) => t.id === prop.controlledTeamId);
  const b = teams.find((t) => t.id === prop.otherTeamId);
  if (!a || !b) return { ...season, proposedTransfers: remaining };
  const li = prop.laneIndex;
  const toA = settle(b.players[li], b.leagueId, a.leagueId);
  const toB = settle(a.players[li], a.leagueId, b.leagueId);
  a.players[li] = toA;
  b.players[li] = toB;
  // Log into the window recap, oriented star (up) → swap (down).
  const incoming = prop.kind === "incoming";
  const record: PlayerTransfer = {
    event: prop.event,
    lane: prop.lane,
    fromTeamId: incoming ? prop.otherTeamId : prop.controlledTeamId,
    toTeamId: incoming ? prop.controlledTeamId : prop.otherTeamId,
    star: incoming ? prop.theirs : prop.mine,
    swap: incoming ? prop.mine : prop.theirs,
  };
  const log = [...(season.transfersByEvent?.[prop.event] ?? []), record];
  return {
    ...season,
    teams,
    proposedTransfers: remaining,
    transfersByEvent: { ...season.transfersByEvent, [prop.event]: log },
  };
}

// ── User-initiated shopping ─────────────────────────────────────────────────
// The window's grading scope: the qualifying split's games plus that
// international's. Shared by applyTransfers and the shopping search so values
// match exactly.
function windowGradeTids(season: SeasonState, event: InternationalId): string[] {
  const split = QUALIFYING_SPLIT[event];
  const splitPhase = season.phases.find((p) => p.kind === "split" && p.split === split);
  const intlPhase = season.phases.find((p) => p.kind === "international" && p.event === event);
  return [...(splitPhase?.tournamentIds ?? []), ...(intlPhase?.tournamentIds ?? [])];
}

// The open transfer window's event, or null when not sitting on one.
function openWindowEvent(season: SeasonState): InternationalId | null {
  const phase = season.phases[season.phaseIndex];
  return phase?.kind === "transfer" && phase.event ? phase.event : null;
}

/**
 * Moves that count toward the active window's cap / one-per-role locks.
 * For Worlds during offseason, skips prior-year carry frozen at
 * `worldsOffseasonBaseline` so the fresh window starts at zero.
 */
export function activeWindowTransfers(
  season: Pick<SeasonState, "transfersByEvent" | "worldsOffseasonBaseline">,
  event: InternationalId,
): PlayerTransfer[] {
  const moves = season.transfersByEvent?.[event] ?? [];
  if (event !== "worlds") return moves;
  const baseline = season.worldsOffseasonBaseline ?? 0;
  return baseline > 0 ? moves.slice(baseline) : moves;
}

/**
 * Authoritative event for a transfer row: prefer the stamp on the move, fall
 * back to the bucket key it was stored under.
 */
export function transferEventStamp(
  move: { event?: InternationalId },
  bucket: InternationalId,
): InternationalId {
  return move.event ?? bucket;
}

/**
 * League-digest moves for one accordion section.
 *
 * Groups by each move's `event` stamp across every `transfersByEvent` bucket
 * so First Stand / MSI rows cannot "leak" into Post Worlds just because they
 * were appended to the worlds array (carry / offseason write bugs).
 */
export function transfersForDigestEvent(
  season: Pick<SeasonState, "transfersByEvent" | "worldsOffseasonBaseline"> & Partial<Pick<SeasonState, "status">>,
  event: InternationalId,
): PlayerTransfer[] {
  const byEvent = season.transfersByEvent ?? {};
  const out: PlayerTransfer[] = [];
  const seen = new Set<string>();
  for (const [bucket, moves] of Object.entries(byEvent) as Array<
    [InternationalId, PlayerTransfer[] | undefined]
  >) {
    for (const [index, m] of (moves ?? []).entries()) {
      if (transferEventStamp(m, bucket) !== event) continue;
      if (season.status === "complete" && event === "worlds" && bucket === "worlds"
        && index < (season.worldsOffseasonBaseline ?? 0)) continue;
      const key = transferDedupeKey({ ...m, event });
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(m);
    }
  }
  return out;
}

/**
 * Transfers to freeze into Hall for this season: drop prior-year Worlds carry
 * (below `worldsOffseasonBaseline` with stamp `worlds`) and attribute every
 * row by its event stamp so mis-bucketed mid-season moves land in the right
 * Post First Stand / Post MSI section.
 */
export function transfersForHistoryArchive(
  season: Pick<SeasonState, "transfersByEvent" | "worldsOffseasonBaseline">,
): PlayerTransfer[] {
  const byEvent = season.transfersByEvent ?? {};
  const baseline = season.worldsOffseasonBaseline ?? 0;
  const out: PlayerTransfer[] = [];
  for (const [bucket, moves] of Object.entries(byEvent) as Array<
    [InternationalId, PlayerTransfer[] | undefined]
  >) {
    const list = moves ?? [];
    for (let i = 0; i < list.length; i++) {
      const m = list[i]!;
      const stamp = transferEventStamp(m, bucket);
      if (
        bucket === "worlds" &&
        baseline > 0 &&
        i < baseline &&
        stamp === "worlds"
      ) {
        // Already archived with the prior year — do not re-attribute here.
        continue;
      }
      out.push(stamp === m.event ? m : { ...m, event: stamp });
    }
  }
  return out;
}

function transferDedupeKey(m: PlayerTransfer): string {
  return [
    m.event,
    m.lane,
    m.fromTeamId,
    m.toTeamId,
    m.star.id ?? m.star.name ?? "",
    m.swap.id ?? m.swap.name ?? "",
  ].join("|");
}

/**
 * Move every row into the bucket matching its `event` stamp (deduped).
 * Call at season completion so First Stand / MSI rows that leaked into
 * `worlds` (prior-year carry array) do not inflate the offseason baseline
 * or Post Worlds digest.
 */
export function rebucketTransfersByStamp(
  byEvent: Partial<Record<InternationalId, PlayerTransfer[]>> | undefined,
): Partial<Record<InternationalId, PlayerTransfer[]>> {
  if (!byEvent) return {};
  const next: Partial<Record<InternationalId, PlayerTransfer[]>> = {};
  const seen = new Set<string>();
  for (const [bucket, moves] of Object.entries(byEvent) as Array<
    [InternationalId, PlayerTransfer[] | undefined]
  >) {
    for (const m of moves ?? []) {
      const stamp = transferEventStamp(m, bucket);
      const row = stamp === m.event ? m : { ...m, event: stamp };
      const key = transferDedupeKey(row);
      if (seen.has(key)) continue;
      seen.add(key);
      (next[stamp] ??= []).push(row);
    }
  }
  return next;
}

// Each team makes at most ONE move per role per window. Has `teamId` already
// been part of a transfer at `lane` this window?
export function teamMovedAtLane(
  season: SeasonState,
  event: InternationalId,
  teamId: string,
  lane: Lane,
): boolean {
  return activeWindowTransfers(season, event).some(
    (m) => m.lane === lane && (m.fromTeamId === teamId || m.toTeamId === teamId),
  );
}

// The followed team may make at most this many transfers per window — on
// distinct roles (the 1-per-role cap already guarantees distinct positions).
// In-season windows (First Stand, MSI) are tighter; the post-Worlds offseason
// is the big window of the year.
export const USER_MAX_TRANSFERS_PER_WINDOW = 2;
export const USER_MAX_TRANSFERS_OFFSEASON = 4;

// Per-window cap, by event — the offseason ("worlds") allows more.
export function maxUserTransfers(event: InternationalId): number {
  return event === "worlds"
    ? USER_MAX_TRANSFERS_OFFSEASON
    : USER_MAX_TRANSFERS_PER_WINDOW;
}

// How many transfers the followed team has already made this window.
export function userTransferCount(
  season: SeasonState,
  event: InternationalId,
  teamId: string,
): number {
  return activeWindowTransfers(season, event).filter(
    (m) => m.fromTeamId === teamId || m.toTeamId === teamId,
  ).length;
}

// Has the followed team hit its per-window transfer cap?
export function userTransferCapReached(
  season: SeasonState,
  event: InternationalId,
  teamId: string,
): boolean {
  return userTransferCount(season, event, teamId) >= maxUserTransfers(event);
}

// One other team's player as a possible swap for a followed-team roster slot.
export interface TransferCandidate {
  otherTeamId: string;
  lane: Lane;
  theirs: TransferPlayer;
  mineValue: number;
  theirsValue: number;
  // Would the other team agree? (They accept incoming ≥ outgoing − tolerance.)
  willing: boolean;
  upgrade: number; // theirsValue − mineValue (positive = better for you)
}

// Search every other team for a swap of the followed team's player at `lane`,
// during the open window. Willing candidates (the other team would agree) come
// first, best upgrade first. Pure — the UI calls it directly.
export function transferCandidates(
  season: SeasonState,
  champions: readonly Champion[],
  lane: Lane,
): TransferCandidate[] {
  const event = openWindowEvent(season);
  const controlledId = season.config.controlledTeamId;
  if (!event || !controlledId || !season.config.playerTransfers) return [];
  const me = season.teams.find((t) => t.id === controlledId);
  const li = LANE_ORDER.indexOf(lane);
  if (!me || li < 0 || !me.players[li]) return [];
  // One move per role: nothing to shop once your team has used this lane.
  if (teamMovedAtLane(season, event, controlledId, lane)) return [];
  // Hit the per-window cap → nothing more to shop on any lane.
  if (userTransferCapReached(season, event, controlledId)) return [];
  const byId = new Map(champions.map((c) => [c.id, c]));
  const grades = splitLaneGrades(season, windowGradeTids(season, event));
  const meta = season.currentMeta;
  const mineValue = transferValue(me.players[li], grades.get(controlledId)?.[li] ?? null, byId, meta);
  const out: TransferCandidate[] = [];
  for (const team of season.teams) {
    if (team.id === controlledId) continue;
    // A team that already used this role this window can't trade it again.
    if (teamMovedAtLane(season, event, team.id, lane)) continue;
    const p = team.players[li];
    if (!p) continue;
    const grade = grades.get(team.id)?.[li] ?? null;
    const v = transferValue(p, grade, byId, meta);
    out.push({
      otherTeamId: team.id,
      lane,
      theirs: snapshot(p, grade),
      mineValue,
      theirsValue: v,
      willing: mineValue >= v - WILLING_TOL,
      upgrade: v - mineValue,
    });
  }
  out.sort((a, b) => Number(b.willing) - Number(a.willing) || b.upgrade - a.upgrade);
  return out;
}

// Execute a user-shopped swap (followed team ⇄ otherTeam at `lane`) if the
// other team would agree. Logs it into the window recap and supersedes any
// pending auto-proposal on that lane. No-op if not on a window or not willing.
export function executeUserTransfer(
  season: SeasonState,
  champions: readonly Champion[],
  lane: Lane,
  otherTeamId: string,
): SeasonState {
  const event = openWindowEvent(season);
  const controlledId = season.config.controlledTeamId;
  if (!event || !controlledId) return season;
  const li = LANE_ORDER.indexOf(lane);
  const me = season.teams.find((t) => t.id === controlledId);
  const other = season.teams.find((t) => t.id === otherTeamId);
  if (li < 0 || !me || !other || !me.players[li] || !other.players[li]) return season;
  // One move per role per window — for both sides.
  if (
    teamMovedAtLane(season, event, controlledId, lane) ||
    teamMovedAtLane(season, event, otherTeamId, lane)
  ) {
    return season;
  }
  // The user's per-window transfer cap.
  if (userTransferCapReached(season, event, controlledId)) return season;
  const byId = new Map(champions.map((c) => [c.id, c]));
  const grades = splitLaneGrades(season, windowGradeTids(season, event));
  const meta = season.currentMeta;
  const myGrade = grades.get(controlledId)?.[li] ?? null;
  const theirGrade = grades.get(otherTeamId)?.[li] ?? null;
  const pMine = me.players[li];
  const pThem = other.players[li];
  const vMine = transferValue(pMine, myGrade, byId, meta);
  const vThem = transferValue(pThem, theirGrade, byId, meta);
  if (vMine < vThem - WILLING_TOL) return season; // they wouldn't agree

  const teams = season.teams.map((t) =>
    t.id === controlledId || t.id === otherTeamId ? { ...t, players: [...t.players] } : t,
  );
  const m2 = teams.find((t) => t.id === controlledId)!;
  const o2 = teams.find((t) => t.id === otherTeamId)!;
  const incoming = settle(o2.players[li], o2.leagueId, m2.leagueId);
  const outgoing = settle(m2.players[li], m2.leagueId, o2.leagueId);
  m2.players[li] = incoming;
  o2.players[li] = outgoing;

  const mineSnap = snapshot(pMine, myGrade);
  const themSnap = snapshot(pThem, theirGrade);
  const themBetter = vThem >= vMine;
  const record: PlayerTransfer = {
    event,
    lane,
    fromTeamId: themBetter ? otherTeamId : controlledId,
    toTeamId: themBetter ? controlledId : otherTeamId,
    star: themBetter ? themSnap : mineSnap,
    swap: themBetter ? mineSnap : themSnap,
  };
  const log = [...(season.transfersByEvent?.[event] ?? []), record];
  return {
    ...season,
    teams,
    // The shopped lane's auto-proposal (if any) is now stale — drop it.
    proposedTransfers: (season.proposedTransfers ?? []).filter((p) => p.laneIndex !== li),
    transfersByEvent: { ...season.transfersByEvent, [event]: log },
  };
}

// ── Offseason (post-Worlds) transfer window ─────────────────────────────────
// Run BETWEEN seasons in a franchise: the biggest window of the year. Uses the
// just-finished season's per-lane grades + each team's strength/prestige to
// auto-shuffle rosters across every region (all teams, no proposals — it's the
// offseason market). `gradeOf` returns a player's last-season grade (1-10) for
// (teamId, laneIndex). Returns the evolved teams + a recap keyed "worlds".
export function offseasonTransferPass(
  teams: readonly SeasonTeam[],
  gradeOf: (teamId: string, laneIndex: number) => number | null,
  byId: Map<number, Champion>,
  meta: SeasonMetaSnapshot,
  // The followed team handles its OWN offseason interactively, so the auto
  // market leaves it (and any lane it already moved) alone.
  skipTeamId?: string | null,
  movedLanes?: (teamId: string, laneIndex: number) => boolean,
  // Moves already made this window (the user's interactive offseason signings) —
  // seed each involved team's count so the auto market respects the per-team
  // cap including swaps the user already triggered with them.
  priorMoves: readonly PlayerTransfer[] = [],
): { teams: SeasonTeam[]; moves: PlayerTransfer[] } {
  const map = new Map(teams.map((t) => [t.id, { ...t, players: [...t.players] }]));
  const moves: PlayerTransfer[] = [];
  // Scaled-down region prestige (see TRANSFER_PRESTIGE_WEIGHT) so a strong TEAM
  // in a minor region is a real destination, not always out-pulled by region.
  const prestige = (lg: LeagueId) =>
    (LEAGUE_IDS.length - LEAGUE_IDS.indexOf(lg)) * TRANSFER_PRESTIGE_WEIGHT;
  // Per-team offseason cap — every team, same limit the user has.
  const cap = maxUserTransfers("worlds");
  const teamMoves = new Map<string, number>();
  for (const m of priorMoves) {
    teamMoves.set(m.fromTeamId, (teamMoves.get(m.fromTeamId) ?? 0) + 1);
    teamMoves.set(m.toTeamId, (teamMoves.get(m.toTeamId) ?? 0) + 1);
  }
  const atCap = (id: string) => (teamMoves.get(id) ?? 0) >= cap;
  const bump = (id: string) => teamMoves.set(id, (teamMoves.get(id) ?? 0) + 1);
  for (let li = 0; li < LANE_ORDER.length; li++) {
    const lane = LANE_ORDER[li];
    const entries: LaneEntry[] = [];
    for (const t of map.values()) {
      const p = t.players[li];
      if (!p || isVacancyStub(p)) continue;
      if (t.id === skipTeamId) continue; // user's team — they shop it themselves
      if (movedLanes?.(t.id, li)) continue; // already transacted this lane
      entries.push({
        teamId: t.id,
        value: transferValue(p, gradeOf(t.id, li), byId, meta),
        dest: deriveStar(t.players) + prestige(t.leagueId),
      });
    }
    for (const { aTeamId, bTeamId } of planLaneSwaps(entries, {
      gapMin: OFFSEASON_GAP_MIN,
      maxMoves: OFFSEASON_MAX_MOVES,
    })) {
      if (atCap(aTeamId) || atCap(bTeamId)) continue; // either side full this window
      const a = map.get(aTeamId)!;
      const b = map.get(bTeamId)!;
      const pa = a.players[li];
      const pb = b.players[li];
      if (!pa || !pb || isVacancyStub(pa) || isVacancyStub(pb)) continue;
      if (pa.id && pb.id && pa.id === pb.id) continue;
      if (pa.name && pb.name && pa.name === pb.name) continue;
      // Elite players (either side) stay in their region even in the big window.
      if (
        crossRegionBlocked(pa, a.leagueId, b.leagueId) ||
        crossRegionBlocked(pb, b.leagueId, a.leagueId)
      )
        continue;
      a.players[li] = settle(pb, b.leagueId, a.leagueId, true); // offseason: preseason to adjust
      b.players[li] = settle(pa, a.leagueId, b.leagueId, true);
      bump(aTeamId);
      bump(bTeamId);
      moves.push({
        event: "worlds",
        lane,
        fromTeamId: aTeamId,
        toTeamId: bTeamId,
        star: snapshot(pa, gradeOf(aTeamId, li)),
        swap: snapshot(pb, gradeOf(bTeamId, li)),
      });
    }
  }
  return { teams: [...map.values()], moves };
}

// ── Interactive offseason shopping (followed team) ──────────────────────────
// Same idea as transferCandidates/executeUserTransfer, but for the post-Worlds
// offseason on a COMPLETED season: it doesn't need an open transfer phase, uses
// the WHOLE season's grades, and records under the "worlds" window.
const OFFSEASON = "worlds" as const;

function wholeSeasonGrades(season: SeasonState) {
  return splitLaneGrades(season, Object.keys(season.tournaments));
}

export function offseasonCandidates(
  season: SeasonState,
  champions: readonly Champion[],
  lane: Lane,
): TransferCandidate[] {
  if (!season.config.playerTransfers) return [];
  const controlledId = season.config.controlledTeamId;
  const me = season.teams.find((t) => t.id === controlledId);
  const li = LANE_ORDER.indexOf(lane);
  if (!controlledId || !me || li < 0 || !me.players[li]) return [];
  if (teamMovedAtLane(season, OFFSEASON, controlledId, lane)) return [];
  if (userTransferCapReached(season, OFFSEASON, controlledId)) return [];
  const byId = new Map(champions.map((c) => [c.id, c]));
  const grades = wholeSeasonGrades(season);
  const meta = season.currentMeta;
  const mineValue = transferValue(me.players[li], grades.get(controlledId)?.[li] ?? null, byId, meta);
  const out: TransferCandidate[] = [];
  for (const team of season.teams) {
    if (team.id === controlledId) continue;
    if (teamMovedAtLane(season, OFFSEASON, team.id, lane)) continue;
    const p = team.players[li];
    if (!p) continue;
    const grade = grades.get(team.id)?.[li] ?? null;
    const v = transferValue(p, grade, byId, meta);
    out.push({
      otherTeamId: team.id,
      lane,
      theirs: snapshot(p, grade),
      mineValue,
      theirsValue: v,
      willing: mineValue >= v - OFFSEASON_WILLING_TOL,
      upgrade: v - mineValue,
    });
  }
  out.sort((a, b) => Number(b.willing) - Number(a.willing) || b.upgrade - a.upgrade);
  return out;
}

export function executeOffseasonUserTransfer(
  season: SeasonState,
  champions: readonly Champion[],
  lane: Lane,
  otherTeamId: string,
): SeasonState {
  const controlledId = season.config.controlledTeamId;
  const li = LANE_ORDER.indexOf(lane);
  const me = season.teams.find((t) => t.id === controlledId);
  const other = season.teams.find((t) => t.id === otherTeamId);
  if (!controlledId || li < 0 || !me || !other || !me.players[li] || !other.players[li]) return season;
  if (
    teamMovedAtLane(season, OFFSEASON, controlledId, lane) ||
    teamMovedAtLane(season, OFFSEASON, otherTeamId, lane)
  ) {
    return season;
  }
  if (userTransferCapReached(season, OFFSEASON, controlledId)) return season;
  const byId = new Map(champions.map((c) => [c.id, c]));
  const grades = wholeSeasonGrades(season);
  const meta = season.currentMeta;
  const myGrade = grades.get(controlledId)?.[li] ?? null;
  const theirGrade = grades.get(otherTeamId)?.[li] ?? null;
  const pMine = me.players[li];
  const pThem = other.players[li];
  const vMine = transferValue(pMine, myGrade, byId, meta);
  const vThem = transferValue(pThem, theirGrade, byId, meta);
  if (vMine < vThem - OFFSEASON_WILLING_TOL) return season; // offseason: easier deals
  const teams = season.teams.map((t) =>
    t.id === controlledId || t.id === otherTeamId ? { ...t, players: [...t.players] } : t,
  );
  const m2 = teams.find((t) => t.id === controlledId)!;
  const o2 = teams.find((t) => t.id === otherTeamId)!;
  m2.players[li] = settle(o2.players[li], o2.leagueId, m2.leagueId, true); // offseason: preseason to adjust
  o2.players[li] = settle(pMine, m2.leagueId, o2.leagueId, true);
  const mineSnap = snapshot(pMine, myGrade);
  const themSnap = snapshot(pThem, theirGrade);
  const themBetter = vThem >= vMine;
  const record: PlayerTransfer = {
    event: OFFSEASON,
    lane,
    fromTeamId: themBetter ? otherTeamId : controlledId,
    toTeamId: themBetter ? controlledId : otherTeamId,
    star: themBetter ? themSnap : mineSnap,
    swap: themBetter ? mineSnap : themSnap,
  };
  const log = [...(season.transfersByEvent?.[OFFSEASON] ?? []), record];
  return { ...season, teams, transfersByEvent: { ...season.transfersByEvent, [OFFSEASON]: log } };
}

// ─── AI auto-decision for the followed team ──────────────────────────────────
// A user who follows a team can hand the window to the AI: accept the proposals
// that improve the roster, decline the rest, then shop the best available
// upgrade on each free lane (respecting the per-window cap). Pure — composes the
// same resolve/execute helpers the manual UI calls, so the result is identical
// to the user clicking through them.

const AI_UPGRADE_MIN = 0.1; // only swap for a real improvement

function snapValue(
  tp: TransferPlayer,
  lane: Lane,
  byId: Map<number, Champion>,
  meta: SeasonMetaSnapshot,
): number {
  const p: Player = { lane, tier: tp.tier, goodChamps: tp.goodChamps, badChamps: [] };
  return transferValue(p, tp.grade, byId, meta);
}

/** In-season window: resolve the followed team's pending proposals (accept
 *  upgrades, decline the rest) then shop the best willing upgrade per lane. */
export function aiResolveUserTransferWindow(
  season: SeasonState,
  champions: readonly Champion[],
): SeasonState {
  let s = season;
  const byId = new Map(champions.map((c) => [c.id, c]));
  // resolveTransfer removes proposal 0 each call, so loop on the head.
  while ((s.proposedTransfers?.length ?? 0) > 0) {
    const p = s.proposedTransfers![0];
    const accept =
      snapValue(p.theirs, p.lane, byId, s.currentMeta) >
      snapValue(p.mine, p.lane, byId, s.currentMeta);
    s = resolveTransfer(s, 0, accept);
  }
  // executeUserTransfer no-ops once the cap / one-per-role limit is hit.
  for (const lane of LANE_ORDER) {
    const best = transferCandidates(s, champions, lane).find(
      (c) => c.willing && c.upgrade > AI_UPGRADE_MIN,
    );
    if (best) s = executeUserTransfer(s, champions, lane, best.otherTeamId);
  }
  return s;
}

/** Offseason window: shop the best willing upgrade per lane for the followed
 *  team (coach is decided separately by bestCoachHire). */
export function aiResolveUserOffseason(
  season: SeasonState,
  champions: readonly Champion[],
): SeasonState {
  let s = season;
  for (const lane of LANE_ORDER) {
    const best = offseasonCandidates(s, champions, lane).find(
      (c) => c.willing && c.upgrade > AI_UPGRADE_MIN,
    );
    if (best) s = executeOffseasonUserTransfer(s, champions, lane, best.otherTeamId);
  }
  return s;
}

/** The team whose coach is the biggest CLEAR upgrade over the followed team's
 *  (≥ 0.3★), or null. The caller performs the swap (offseason only). */
export function bestCoachHire(season: SeasonState): string | null {
  const me = season.config.controlledTeamId;
  const mine = season.teams.find((t) => t.id === me);
  if (!mine) return null;
  let bestId: string | null = null;
  let bestRating = (mine.coach?.rating ?? 0) + 0.3;
  for (const t of season.teams) {
    if (t.id === me || !t.coach) continue;
    if (t.coach.rating > bestRating) {
      bestRating = t.coach.rating;
      bestId = t.id;
    }
  }
  return bestId;
}
