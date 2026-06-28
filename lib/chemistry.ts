import type { Lane, Player, Roster } from "./types";
import { playerForLane, makePlayerId } from "./players";
import { createRng, type RNG } from "./rng";

// Player teammate chemistry. Every PAIR of teammates has a signed chemistry
// value — some duos click, some clash — rolled once when a roster is first put
// into play and STORED on the players (Player.synergy: teammateId → value in
// roughly [-1,+1]). A well-gelled laner out-performs; a clashing one
// under-performs. This is PLAYER chemistry (who's on the roster), distinct from
// the champion-synergy the draft AI already scores (which champions were
// picked).
//
// Two smaller, derived signals stack on top of the stored pair value (the user
// asked for these too): same homeRegion (gated by how settled both are) and the
// structural bot-lane (ADC+support) duo. Both are positive-only nudges.
//
// Pure + framework-free. Every signal degrades to 0 when its data is absent, so
// a roster with no synergy/region behaves exactly as before — chemistry is
// additive on top of the existing tier/pool/form lane model, and the sim only
// uses the blue−red DIFFERENCE so symmetric rosters cancel to 0.

export const CHEM_SAME_REGION = 0.25; // same-region pair, fully settled
export const CHEM_DUO = 0.25; // bot-lane (bottom+support) structural duo

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function settle(a: Player, b: Player): number {
  return Math.min(a.acclimation ?? 1, b.acclimation ?? 1);
}

function isBotDuo(a: Lane, b: Lane): boolean {
  return (
    (a === "bottom" && b === "support") || (a === "support" && b === "bottom")
  );
}

// The stored, generated chemistry between two specific players (mirrored on
// both, so reading either direction works). 0 when unset.
function storedPairSynergy(a: Player, b: Player): number {
  const fromA = a.id != null && b.id != null ? a.synergy?.[b.id] : undefined;
  if (typeof fromA === "number") return fromA;
  const fromB = a.id != null && b.id != null ? b.synergy?.[a.id] : undefined;
  return typeof fromB === "number" ? fromB : 0;
}

// Signed chemistry of one teammate pair: the stored value (primary) plus the
// derived region/duo nudges.
export function pairChemistry(a: Player, b: Player): number {
  let c = storedPairSynergy(a, b);
  if (a.homeRegion && b.homeRegion && a.homeRegion === b.homeRegion) {
    c += CHEM_SAME_REGION * settle(a, b);
  }
  if (isBotDuo(a.lane, b.lane)) c += CHEM_DUO * settle(a, b);
  return c;
}

// A single player's signed chemistry with the rest of their roster, in
// [-1, +1]. Summed over teammates and halved so a couple of strong pairings (or
// one elite/toxic duo) move the needle without four-way averaging washing them
// out.
export function playerChemistry(
  roster: Roster | null | undefined,
  lane: Lane | null | undefined,
): number {
  const me = playerForLane(roster, lane);
  if (!roster || !me) return 0;
  let sum = 0;
  for (const other of roster) {
    if (other === me) continue;
    sum += pairChemistry(me, other);
  }
  return clamp(sum / 2, -1, 1);
}

// Projected chemistry if `incoming` were signed into `roster` at `lane` (the
// rest of the roster stays). Cross-team pairs have no rolled synergy, so this
// reflects the DERIVED signals only — a same-region signing gels faster, a bot
// laner pairs with the existing support. Neutral (~0) when neither applies.
export function projectedChemistry(
  roster: Roster,
  incoming: Player,
  lane: Lane,
): number {
  const hypo = [...roster.filter((p) => p.lane !== lane), { ...incoming, lane }];
  return playerChemistry(hypo, lane);
}

// Per-lane chemistry lane-gold bias for the simulator, in the same shape as the
// other playerLane*Bias helpers (see computeLaneAdvantages). Signed: a gelled
// laner gains, a clashing one bleeds. ~`k` g/min per chemistry point of
// differential — "meaningful", on par with champion-pool fit. 0 when neither
// side supplies chemistry, so default sims stay unchanged.
export const CHEM_LANE_K = 12;
export function laneChemistryBias(
  bluePlayers: Roster | undefined,
  redPlayers: Roster | undefined,
  lane: Lane,
  k: number = CHEM_LANE_K,
): number {
  return (
    (playerChemistry(bluePlayers, lane) - playerChemistry(redPlayers, lane)) * k
  );
}

// ── Generation ───────────────────────────────────────────────────────────────

// FNV-1a over a string → uint32 seed for createRng. Lets synergy generation use
// an INDEPENDENT, deterministic rng so it never perturbs the caller's seeded
// stream (existing sim goldens stay reproducible).
function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Stable content signature of a roster, used to seed generation when no
// explicit key is given. Differs between two random rosters (different pools),
// so blue and red get different chemistry rather than mirror-cancelling.
function rosterSeed(roster: Roster): string {
  return roster
    .map((p) => `${p.lane}:${p.tier}:${p.goodChamps.join(",")}:${p.badChamps.join(",")}`)
    .join("|");
}

// Triangular roll in (−1, +1) centered on 0 — most pairs mild, a few strongly
// + or −. Two decimals for tidy stored values.
function signedRoll(rng: RNG): number {
  return Math.round((rng() - rng()) * 100) / 100;
}

// True when every player has an id and every teammate pair already carries a
// stored value — i.e. there's nothing for assignSynergies to do.
function isFullyAssigned(roster: Roster): boolean {
  if (roster.some((p) => p.id == null)) return false;
  for (let i = 0; i < roster.length; i++) {
    for (let j = i + 1; j < roster.length; j++) {
      const a = roster[i];
      const b = roster[j];
      const has =
        a.synergy?.[b.id!] != null || b.synergy?.[a.id!] != null;
      if (!has) return false;
    }
  }
  return true;
}

// Roll and STORE signed chemistry for any teammate pair that doesn't have one
// yet, returning a NEW roster (input not mutated). PER-PAIR idempotent: pairs
// that already carry a value keep it (so re-entering play never re-rolls a
// surviving duo, and a roster reshaped by a transfer only rolls the NEW
// pairings — the duos that stayed together keep their drifted chemistry).
// Players without an id get a stable one (chemistry keys survive transfers).
// Uses an independent rng seeded from `seedKey` (default: roster content), so
// it never consumes the ambient random stream.
export function assignSynergies(roster: Roster, seedKey?: string): Roster {
  if (isFullyAssigned(roster)) return roster;
  const rng = createRng(hashString(seedKey ?? rosterSeed(roster)));
  const players = roster.map((p) => ({
    ...p,
    id: p.id ?? makePlayerId(rng),
    synergy: { ...(p.synergy ?? {}) } as Record<string, number>,
  }));
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const a = players[i];
      const b = players[j];
      if (a.synergy[b.id] != null || b.synergy[a.id] != null) continue; // keep
      const v = signedRoll(rng);
      a.synergy[b.id] = v;
      b.synergy[a.id] = v;
    }
  }
  return players;
}

// ── Drift over the realities/franchise timeline ──────────────────────────────
// Chemistry isn't fixed: in a multi-season realities timeline it rises and
// falls with results and time spent together, like real relationships. Both
// helpers are pure, operate on ONE team's roster, touch only current-teammate
// pairs, and clamp to [-1, +1]. Wired into the season engine (results) and the
// offseason (time) — see lib/season/engine.ts + franchise.ts.

// How far a tournament result moves each pair (× normalized finish in [-1,+1]:
// winning the event gels the roster, finishing last frays it).
export const CHEM_RESULT_STEP = 0.05;
// Familiarity gained per season a pair stays together, and the ceiling that
// pure time-together drifts toward (winning pushes higher; losing pulls below).
export const CHEM_TIME_STEP = 0.03;
export const CHEM_TIME_TARGET = 0.35;
// One-shot preseason "bootcamp" step — far larger than a normal season's drift.
// Applied to an offseason-assembled roster so a freshly built lineup (or a new
// duo from a trade) doesn't start cold: the preseason eases new/clashing pairs
// up toward the familiarity ceiling before the year begins.
export const CHEM_PRESEASON_STEP = 0.12;

function driftRoster(roster: Roster, fn: (cur: number) => number): Roster {
  const players = roster.map((p) => ({
    ...p,
    synergy: { ...(p.synergy ?? {}) } as Record<string, number>,
  }));
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const a = players[i];
      const b = players[j];
      if (a.id == null || b.id == null) continue;
      // Only drift pairs that already carry an innate roll. Minting a value for
      // a never-rolled pair (e.g. a rookie just inserted) would write 0+step and
      // then make isFullyAssigned report it as assigned, permanently suppressing
      // its real signed roll. Leave unrolled pairs for assignSynergies.
      const hasA = a.synergy[b.id] != null;
      const hasB = b.synergy[a.id] != null;
      if (!hasA && !hasB) continue;
      const cur = hasA ? a.synergy[b.id]! : b.synergy[a.id]!;
      const next = clamp(fn(cur), -1, 1);
      a.synergy[b.id] = next;
      b.synergy[a.id] = next;
    }
  }
  return players;
}

// Results drift: nudge every current pair by the team's normalized finish.
// `finish` is +1 for winning the event, −1 for finishing last, 0 in the middle.
export function driftSynergiesFromResult(roster: Roster, finish: number): Roster {
  if (finish === 0) return roster;
  return driftRoster(roster, (cur) => cur + finish * CHEM_RESULT_STEP);
}

// Time drift: a season spent together builds familiarity. Pairs below the
// familiarity ceiling ease up toward it (even a clashing pair slowly mends);
// pairs already above it (a proven, winning duo) are left alone.
export function driftSynergiesOverTime(roster: Roster, step = CHEM_TIME_STEP): Roster {
  return driftRoster(roster, (cur) =>
    cur < CHEM_TIME_TARGET ? Math.min(CHEM_TIME_TARGET, cur + step) : cur,
  );
}
