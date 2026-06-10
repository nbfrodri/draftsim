// Centralized balance constants for the timeline state machine.
//
// These are pure renames of the inline magic numbers that previously lived
// in generateTimeline (lib/matchSimulator.ts) — the values are IDENTICAL.
// Tuning the sim's feel happens here; the phase code reads these names so
// the formulas stay legible.
export const BALANCE = {
  // ─── Gold economy (team-equivalent gold per unit) ─────────────────────────
  // Real-LoL gold values (rounded for clarity):
  //   - kill: ~300g local + assist gold ≈ 300 team-equivalent
  //   - turret plate: ~125g, turret kill: ~250g local + 100g/ally global ≈ 550
  //   - inhibitor: ~400g local + super-minion pressure ≈ 800 team-equivalent
  KILL_GOLD: 300,
  TOWER_GOLD: 550,
  INHIB_GOLD: 800,

  // ─── Momentum ──────────────────────────────────────────────────────────────
  // Multiplicative decay applied before each event's impact lands.
  MOMENTUM_DECAY: 0.7,

  // ─── Event-side / snapshot logit coefficients ─────────────────────────────
  COMP_DIFF_WEIGHT: 0.022,
  GOLD_LEAD_NORM: 4500,
  MOMENTUM_WEIGHT: 1.2,
  BLUE_SIDE_BONUS: 0.1,
  // Event-side rolls are clamped so upsets are always possible.
  EVENT_PROB_MIN: 0.18,
  EVENT_PROB_MAX: 0.82,
  // Win-prob snapshots get a wider band (display, not a roll).
  SNAPSHOT_PROB_MIN: 0.03,
  SNAPSHOT_PROB_MAX: 0.97,

  // ─── Objective logit (persistent win-odds tilts) ──────────────────────────
  DRAKE_LOGIT_PER_STACK: 0.08,
  SOUL_LOGIT: 0.45,
  ELDER_LOGIT: 0.7,
  ATAKHAN_LOGIT: 0.22,

  // ─── Gold-lead weight by game phase ───────────────────────────────────────
  // Linear interp between (GOLD_WEIGHT_EARLY_MIN, GOLD_WEIGHT_EARLY) and
  // (GOLD_WEIGHT_LATE_MIN, GOLD_WEIGHT_LATE).
  GOLD_WEIGHT_EARLY: 1.8,
  GOLD_WEIGHT_LATE: 0.55,
  GOLD_WEIGHT_EARLY_MIN: 6,
  GOLD_WEIGHT_LATE_MIN: 35,
  GOLD_WEIGHT_SPAN: 29,
  GOLD_WEIGHT_DROP: 1.25,

  // ─── Tower pressure ────────────────────────────────────────────────────────
  TOWER_PRESSURE_BIAS: 0.45,
  TOWER_PRESSURE_CONSUME: 0.5,
  GRUB_TOWER_PRESSURE: 0.12,
  HERALD_TOWER_PRESSURE: 1,
  BARON_TOWER_PRESSURE: 1.2,

  // ─── Comeback detection (the "MOMENTUM SHIFT!" flair) ─────────────────────
  COMEBACK_MIN_IMPACT: 0.25,
  COMEBACK_GOLD_DEFICIT: 2500,
  COMEBACK_MOMENTUM_DEFICIT: 0.4,

  // ─── Objective steal ──────────────────────────────────────────────────────
  STEAL_CHANCE_CAP: 0.45,

  // ─── Shutdown thresholds ──────────────────────────────────────────────────
  SHUTDOWN_BIG_LEAD: 4500,
  SHUTDOWN_MID_LEAD: 2500,
  SHUTDOWN_BIG_CHANCE: 0.55,
  SHUTDOWN_MID_CHANCE: 0.35,

  // ─── Inhibitor cascade thresholds ─────────────────────────────────────────
  STOMP_LEAD: 8000,
  MAJOR_LEAD: 5000,

  // ─── Closing-fight logit ──────────────────────────────────────────────────
  CLOSING_DIFF_WEIGHT: 0.028,
  CLOSING_GOLD_NORM: 5000,
  CLOSING_MOMENTUM_WEIGHT: 0.9,
  CLOSING_OBJECTIVE_WEIGHT: 0.4,
  CLOSING_COMBAT_WEIGHT: 0.7,

  // ─── Late-game scaling payoff ─────────────────────────────────────────────
  LATE_RAMP_START: 27, // minutes — zero payoff at/under this duration
  LATE_RAMP_DIV: 8, // ramp slope: ~2.9 at the 50-min cap
  SCALING_PAYOFF_WEIGHT: 0.26,
  SCALING_PAYOFF_CAP: 3,
} as const;
