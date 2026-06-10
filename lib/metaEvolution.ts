// Live meta evolution during a tournament (pure lib logic).
//
// A tournament normally plays on a FIXED meta snapshot captured at
// creation (TournamentState.metaSnapshot). When the opt-in
// `liveMeta` flag is set, the meta is allowed to EVOLVE between
// rounds: champions that dominate (high presence + high win rate)
// rise a tier, champions that flop (high presence + low win rate)
// fall a tier, and — with a small random chance — a couple of
// untouched sleepers can "emerge" upward, simulating patch-cycle
// discovery.
//
// Everything here is pure: callers (the store) pass the current
// TournamentState and receive a NEW state with an updated
// metaSnapshot + appended metaEvolutionLog. The snapshot keeps the
// exact `MetaOverride` shape the draft engine and simulator already
// consume (getMetaTier / getEffectiveTier read the active override),
// so re-applying the evolved snapshot via setActiveMetaOverride is
// all the store needs for evolved tiers to affect subsequent drafts
// and the draft AI with zero further changes.
//
// Rules are deliberately conservative and bounded (grounded in the
// recap's MetaShiftPanel projectTier approach, but hardened):
//   • max ±1 tier step per champion per evolution event
//   • a champion needs ≥ MIN_GAMES_FOR_SHIFT completed games to move
//   • win rates are shrunk toward 50% with a 3-game prior (same
//     formula the recap panel uses) so tiny samples can't swing tiers
//   • champions that weren't picked or banned never drift (except the
//     bounded "emerging" chance, which is deterministic given an rng)

import {
  CHAMPION_META,
  TIER_ORDER,
  TIER_VALUE,
  type MetaOverride,
  type MetaTier,
} from "./championMeta";
import { LANE_ORDER } from "./players";
import type { RNG } from "./rng";
import type { Champion, Lane } from "./types";
import { formatHasPlayoffs, type TournamentState } from "./tournament";

// ─── Tuning constants (exported so tests assert against the real values) ───

// Minimum completed games a champion must have PLAYED (picks, not bans)
// before its tier is allowed to move. Mirrors the recap's "best WR"
// sample guard.
export const MIN_GAMES_FOR_SHIFT = 3;
// Presence = (games played + bans) / total completed games. A champion
// must be present in at least this fraction of games to be considered
// "defining the meta" — only those champions shift from evidence.
export const HIGH_PRESENCE_THRESHOLD = 0.3;
// Shrunk-WR thresholds for a rise / fall. With the 3-game prior a 3-0
// champion sits at 0.75 (rises) while a 2-1 sits at ~0.58 (stays).
export const RISE_SHRUNK_WR = 0.6;
export const FALL_SHRUNK_WR = 0.4;
// Shrink prior: 3 phantom games at 50% — identical to the recap panel.
export const SHRINK_PRIOR_GAMES = 3;
export const SHRINK_PRIOR_WR = 0.5;
// "Emerging sleeper" lottery: champions with presence below this AND
// zero games played are candidates to randomly rise one tier.
export const LOW_PRESENCE_THRESHOLD = 0.05;
// Per-candidate chance (per evolution event) of an emerging rise.
export const EMERGING_CHANCE = 0.015;
// Hard cap of emerging rises per evolution event.
export const MAX_EMERGING_PER_EVENT = 2;

// ─── Types ──────────────────────────────────────────────────────────────────

export type MetaChangeReason = "dominant" | "underperforming" | "emerging";

// One tier movement produced by an evolution event. Stored on
// TournamentState.metaEvolutionLog so the UI can render a "patch
// notes" style feed of how the meta moved during the tournament.
export interface MetaChange {
  championId: number;
  alias: string;
  lane: Lane;
  from: MetaTier;
  to: MetaTier;
  reason: MetaChangeReason;
  // Human-readable label of the round that triggered the event, e.g.
  // "Matchday 2", "Round 1", "Losers Round 3", "Grand Final".
  roundLabel: string;
  // Evidence backing the change (0 games / null WR for "emerging").
  games: number;
  winRate: number | null;
  presence: number;
}

// A fully-completed round (every match in the bucket has a winner).
// `key` is a stable machine id used to mark rounds as processed
// (TournamentState.metaEvolvedRounds); `label` is for the log/UI.
export interface CompletedRound {
  key: string;
  label: string;
}

// Per-champion evidence aggregated from completed games.
export interface ChampionEvolutionStat {
  championId: number;
  games: number; // games played (picks) with a recorded winner
  wins: number;
  bans: number;
  presence: number; // (games + bans) / totalGames
  laneGames: Partial<Record<Lane, number>>;
}

// ─── Round-completion detection ─────────────────────────────────────────────
//
// Works across every tournament format by bucketing matches into
// "round" units along the same axes the format-override keys use:
//   • stage matches (round-robin / swiss / groups stage) → main:<round>
//   • standalone single-elim rounds                      → wb:<round>
//   • winners / losers bracket rounds                    → wb:/lb:<round>
//     (prefixed po: when the bracket is a *-playoffs stage)
//   • grand final / reset                                → gf / gf-reset
// A bucket counts as a completed round when it contains at least one
// match and every match in it has a recorded winner. Swiss generates
// rounds lazily and pre-resolves byes, so this works there too; TBD
// bracket matches have no winner and naturally hold their round open.

interface RoundBucket extends CompletedRound {
  order: number;
  total: number;
  done: number;
}

function bucketForMatch(
  tournament: TournamentState,
  match: TournamentState["matches"][number],
): { key: string; label: string; order: number } {
  const po = formatHasPlayoffs(tournament.format);
  const p = po ? "po:" : "";
  const pLabel = po ? "Playoff " : "";
  if (match.bracket === "grand-final") {
    return { key: `${p}gf`, label: "Grand Final", order: 30000 };
  }
  if (match.bracket === "grand-final-reset") {
    return { key: `${p}gf-reset`, label: "Grand Final Reset", order: 30001 };
  }
  if (match.bracket === "winners") {
    return {
      key: `${p}wb:${match.round}`,
      label: `${pLabel}Round ${match.round}`,
      order: 10000 + match.round,
    };
  }
  if (match.bracket === "losers") {
    return {
      key: `${p}lb:${match.round}`,
      label: `${pLabel}Losers Round ${match.round}`,
      order: 20000 + match.round,
    };
  }
  // No bracket tag: standalone single-elim rounds, or a regular stage
  // (round-robin matchdays / swiss rounds / group matchdays).
  if (tournament.format === "single-elim") {
    return {
      key: `wb:${match.round}`,
      label: `Round ${match.round}`,
      order: 10000 + match.round,
    };
  }
  const isSwissStage =
    tournament.format === "swiss" ||
    tournament.format === "swiss-playoffs" ||
    tournament.format === "swiss-playoffs-de";
  return {
    key: `main:${match.round}`,
    label: isSwissStage
      ? `Swiss Round ${match.round}`
      : `Matchday ${match.round}`,
    order: match.round,
  };
}

// Every fully-completed round in the tournament, in play order.
export function listCompletedRounds(
  tournament: TournamentState,
): CompletedRound[] {
  const buckets = new Map<string, RoundBucket>();
  for (const match of tournament.matches) {
    const { key, label, order } = bucketForMatch(tournament, match);
    let b = buckets.get(key);
    if (!b) {
      b = { key, label, order, total: 0, done: 0 };
      buckets.set(key, b);
    }
    b.total++;
    if (match.winner != null) b.done++;
  }
  return [...buckets.values()]
    .filter((b) => b.total > 0 && b.done === b.total)
    .sort((a, b) => a.order - b.order)
    .map((b) => ({ key: b.key, label: b.label }));
}

// The earliest completed round that has NOT yet triggered an evolution
// event, or null when there's nothing new. The store can use this as a
// cheap "should I evolve?" probe, though evolveMetaForTournament
// already performs the same check internally.
export function detectCompletedRound(
  tournament: TournamentState,
): CompletedRound | null {
  const processed = new Set(tournament.metaEvolvedRounds ?? []);
  for (const round of listCompletedRounds(tournament)) {
    if (!processed.has(round.key)) return round;
  }
  return null;
}

// ─── Evidence aggregation ───────────────────────────────────────────────────

// Aggregate per-champion presence (pick + ban) and win evidence from
// every completed game in the tournament. Lane attribution uses the
// game's assigned roles when available (blueRoles/redRoles), falling
// back to positional lane order for legacy games.
export function computeChampionPresence(tournament: TournamentState): {
  totalGames: number;
  stats: Map<number, ChampionEvolutionStat>;
} {
  const stats = new Map<number, ChampionEvolutionStat>();
  let totalGames = 0;
  const ensure = (id: number): ChampionEvolutionStat => {
    let s = stats.get(id);
    if (!s) {
      s = { championId: id, games: 0, wins: 0, bans: 0, presence: 0, laneGames: {} };
      stats.set(id, s);
    }
    return s;
  };
  for (const match of tournament.matches) {
    if (!match.series) continue;
    for (const game of match.series.games) {
      if (game.winner == null) continue; // skip in-progress games
      totalGames++;
      const sides: Array<{
        picks: (number | null)[];
        roles: (Lane | null)[];
        won: boolean;
      }> = [
        { picks: game.bluePicks, roles: game.blueRoles, won: game.winner === "blue" },
        { picks: game.redPicks, roles: game.redRoles, won: game.winner === "red" },
      ];
      for (const side of sides) {
        for (let i = 0; i < side.picks.length; i++) {
          const id = side.picks[i];
          if (id == null) continue;
          const s = ensure(id);
          s.games++;
          if (side.won) s.wins++;
          const lane = side.roles?.[i] ?? LANE_ORDER[i] ?? "middle";
          s.laneGames[lane] = (s.laneGames[lane] ?? 0) + 1;
        }
      }
      for (const id of [...game.blueBans, ...game.redBans]) {
        if (id != null) ensure(id).bans++;
      }
    }
  }
  if (totalGames > 0) {
    for (const s of stats.values()) {
      s.presence = (s.games + s.bans) / totalGames;
    }
  }
  return { totalGames, stats };
}

// ─── Tier math ──────────────────────────────────────────────────────────────

// The champion's effective tier map under a snapshot override. Mirrors
// getMetaTiers semantics WITHOUT touching module-global state: when the
// override carries the champion it is authoritative (no merging),
// otherwise the curated baseline applies.
function effectiveTiers(
  override: MetaOverride | null,
  alias: string,
): Partial<Record<Lane, MetaTier>> {
  const fromOverride = override?.[alias];
  if (fromOverride !== undefined) return fromOverride;
  return CHAMPION_META[alias]?.metaTiers ?? {};
}

// Move a tier by `step` (+1 = better, -1 = worse), clamped to the
// ladder. TIER_ORDER runs S+ → D with index 0 best, so a positive step
// moves DOWN in index. Returns null for unknown tiers.
function stepTier(base: MetaTier, step: number): MetaTier | null {
  const idx = TIER_ORDER.indexOf(base);
  if (idx < 0) return null;
  const next = Math.max(0, Math.min(TIER_ORDER.length - 1, idx - step));
  return TIER_ORDER[next];
}

// Lane the shift applies to: the champion's most-played lane this
// tournament if it has a tier there; otherwise its best-tiered lane
// (the champion's "real" footprint); null when the champion has no
// tier data at all (unknown champions never shift).
function shiftLaneFor(
  stat: ChampionEvolutionStat,
  tiers: Partial<Record<Lane, MetaTier>>,
): Lane | null {
  let mostPlayed: Lane | null = null;
  let mostGames = 0;
  for (const lane of LANE_ORDER) {
    const g = stat.laneGames[lane] ?? 0;
    if (g > mostGames) {
      mostGames = g;
      mostPlayed = lane;
    }
  }
  if (mostPlayed && tiers[mostPlayed] != null) return mostPlayed;
  let bestLane: Lane | null = null;
  let bestValue = 0;
  for (const lane of LANE_ORDER) {
    const t = tiers[lane];
    if (!t) continue;
    if (TIER_VALUE[t] > bestValue) {
      bestValue = TIER_VALUE[t];
      bestLane = lane;
    }
  }
  return bestLane;
}

function bestTieredLane(
  tiers: Partial<Record<Lane, MetaTier>>,
): { lane: Lane; tier: MetaTier } | null {
  let best: { lane: Lane; tier: MetaTier } | null = null;
  for (const lane of LANE_ORDER) {
    const t = tiers[lane];
    if (!t) continue;
    if (!best || TIER_VALUE[t] > TIER_VALUE[best.tier]) best = { lane, tier: t };
  }
  return best;
}

// ─── One evolution event ────────────────────────────────────────────────────

export interface MetaEvolutionEventResult {
  metaOverride: MetaOverride | null;
  changes: MetaChange[];
}

// Apply ONE evolution event: evaluate the evidence accumulated so far
// against `snapshotOverride` and produce the next override + changes.
// Pure; exported primarily for tests and advanced callers — the store
// should use evolveMetaForTournament below.
export function computeMetaEvolutionEvent(args: {
  tournament: TournamentState;
  champions: readonly Champion[];
  snapshotOverride: MetaOverride | null;
  roundLabel: string;
  rng?: RNG;
}): MetaEvolutionEventResult {
  const { tournament, champions, snapshotOverride, roundLabel } = args;
  const rng = args.rng ?? Math.random;
  const { totalGames, stats } = computeChampionPresence(tournament);
  if (totalGames === 0) {
    return { metaOverride: snapshotOverride, changes: [] };
  }
  const byId = new Map<number, Champion>();
  for (const c of champions) byId.set(c.id, c);

  const changes: MetaChange[] = [];
  // Start from a shallow copy so the input override is never mutated.
  const next: MetaOverride = { ...(snapshotOverride ?? {}) };
  const changedAliases = new Set<string>();

  const applyShift = (
    champion: Champion,
    lane: Lane,
    from: MetaTier,
    step: 1 | -1,
    reason: MetaChangeReason,
    stat: ChampionEvolutionStat | null,
  ): boolean => {
    const to = stepTier(from, step);
    if (!to || to === from) return false; // clamped at ladder edge
    const tiers = effectiveTiers(snapshotOverride, champion.alias);
    // Write the FULL lane map (override entries are authoritative —
    // a partial entry would silently drop the champion's other lanes).
    next[champion.alias] = { ...tiers, [lane]: to };
    changedAliases.add(champion.alias);
    changes.push({
      championId: champion.id,
      alias: champion.alias,
      lane,
      from,
      to,
      reason,
      roundLabel,
      games: stat?.games ?? 0,
      winRate: stat && stat.games > 0 ? stat.wins / stat.games : null,
      presence: stat?.presence ?? 0,
    });
    return true;
  };

  // 1) Evidence-driven shifts — deterministic, iterated in championId
  //    order so results are stable.
  const ordered = [...stats.values()].sort(
    (a, b) => a.championId - b.championId,
  );
  for (const stat of ordered) {
    if (stat.games < MIN_GAMES_FOR_SHIFT) continue; // sample guard
    if (stat.presence < HIGH_PRESENCE_THRESHOLD) continue;
    const shrunkWR =
      (stat.wins + SHRINK_PRIOR_WR * SHRINK_PRIOR_GAMES) /
      (stat.games + SHRINK_PRIOR_GAMES);
    let step: 1 | -1;
    let reason: MetaChangeReason;
    if (shrunkWR >= RISE_SHRUNK_WR) {
      step = 1;
      reason = "dominant";
    } else if (shrunkWR <= FALL_SHRUNK_WR) {
      step = -1;
      reason = "underperforming";
    } else {
      continue;
    }
    const champion = byId.get(stat.championId);
    if (!champion) continue;
    const tiers = effectiveTiers(snapshotOverride, champion.alias);
    const lane = shiftLaneFor(stat, tiers);
    if (!lane) continue; // no tier data anywhere → unknown, never moves
    const from = tiers[lane];
    if (!from) continue;
    applyShift(champion, lane, from, step, reason, stat);
  }

  // 2) Emerging sleepers — a couple of untouched, low-presence champs
  //    get a small chance to rise one tier. Deterministic given the rng
  //    (candidates walked in ascending championId order). Champions
  //    already at S/S+ don't "emerge" — they're established.
  let emerged = 0;
  const candidates = [...champions].sort((a, b) => a.id - b.id);
  for (const champion of candidates) {
    if (emerged >= MAX_EMERGING_PER_EVENT) break;
    if (changedAliases.has(champion.alias)) continue;
    const stat = stats.get(champion.id) ?? null;
    if ((stat?.games ?? 0) > 0) continue;
    if ((stat?.presence ?? 0) >= LOW_PRESENCE_THRESHOLD) continue;
    const tiers = effectiveTiers(snapshotOverride, champion.alias);
    const best = bestTieredLane(tiers);
    if (!best) continue; // no tier data → not part of the meta
    if (TIER_VALUE[best.tier] > TIER_VALUE.A) continue; // already strong
    if (rng() >= EMERGING_CHANCE) continue;
    if (applyShift(champion, best.lane, best.tier, 1, "emerging", stat)) {
      emerged++;
    }
  }

  if (changes.length === 0) {
    return { metaOverride: snapshotOverride, changes: [] };
  }
  return { metaOverride: next, changes };
}

// ─── Store-facing entry point ───────────────────────────────────────────────

export interface MetaEvolutionResult {
  // New TournamentState with evolved metaSnapshot, appended
  // metaEvolutionLog and updated metaEvolvedRounds bookkeeping.
  // === the input state when nothing needed to happen (liveMeta off,
  // meta disabled, or no newly-completed round).
  tournament: TournamentState;
  // Convenience pointer to tournament.metaSnapshot. The store should
  // re-apply snapshot.metaOverride via setActiveMetaOverride /
  // saveMetaOverride so the draft AI and simulator see evolved tiers.
  snapshot: TournamentState["metaSnapshot"];
  // Changes produced by THIS call only (the full history lives on
  // tournament.metaEvolutionLog).
  changes: MetaChange[];
}

// Fire meta evolution for every newly-completed round. Designed so the
// store can call it unconditionally after recording a match result:
// when nothing new completed (or the feature is off) it returns the
// input state untouched. One evolution event fires per newly-completed
// round, each bounded to ±1 tier per champion.
export function evolveMetaForTournament(
  tournament: TournamentState,
  champions: readonly Champion[],
  rng: RNG = Math.random,
): MetaEvolutionResult {
  const unchanged: MetaEvolutionResult = {
    tournament,
    snapshot: tournament.metaSnapshot,
    changes: [],
  };
  // HARD GUARD: default tournaments (no liveMeta) never evolve.
  if (tournament.liveMeta !== true) return unchanged;
  // Meta disabled for this tournament → tiers don't exist, nothing to
  // evolve.
  if (tournament.metaSnapshot?.metaEnabled === false) return unchanged;
  const processed = new Set(tournament.metaEvolvedRounds ?? []);
  const pending = listCompletedRounds(tournament).filter(
    (r) => !processed.has(r.key),
  );
  if (pending.length === 0) return unchanged;

  let override = tournament.metaSnapshot?.metaOverride ?? null;
  const allChanges: MetaChange[] = [];
  for (const round of pending) {
    const event = computeMetaEvolutionEvent({
      tournament,
      champions,
      snapshotOverride: override,
      roundLabel: round.label,
      rng,
    });
    override = event.metaOverride;
    allChanges.push(...event.changes);
  }

  const snapshot: TournamentState["metaSnapshot"] = {
    metaEnabled: true,
    ...(tournament.metaSnapshot ?? {}),
    metaOverride: override,
  };
  const next: TournamentState = {
    ...tournament,
    metaSnapshot: snapshot,
    metaEvolutionLog: [...(tournament.metaEvolutionLog ?? []), ...allChanges],
    metaEvolvedRounds: [
      ...(tournament.metaEvolvedRounds ?? []),
      ...pending.map((r) => r.key),
    ],
    updatedAt: Date.now(),
  };
  return { tournament: next, snapshot, changes: allChanges };
}
