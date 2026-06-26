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

  // Per-kill post-fight push gold for the deciding fight. Higher than the
  // mid-game teamfight's KILL_PUSH (super minions from open inhibs + uncontested
  // map make closing kills convert to more objective gold), but grounded in a
  // constant instead of a bare ×200 so the end-game gold chart stays sane.
  CLOSING_KILL_PUSH_GOLD: 120,
  MIDFIGHT_KILL_PUSH_GOLD: 60,

  // Voracious Atakhan: its taker banks +20% on the value of a won teamfight's
  // kills (kill gold, NOT the trivial CS spread the bonus used to land on).
  VORACIOUS_KILL_BONUS: 0.2,

  // Baron empowered-recall / siege window after it is taken (minutes). Its
  // tower-pressure edge only applies while the buff is live.
  BARON_DURATION: 3,

  // Pick → objective causal chain: how hard a fresh pick/vision-pick tilts the
  // next neutral objective toward the side that got the kill (logit units), and
  // for how long the man-advantage lasts (minutes). Modest — it nudges, momentum
  // still does the heavy lifting. The bias scales up with game time (death
  // timers grow), capped at PICK_ADVANTAGE_LATE_MULT.
  PICK_ADVANTAGE_BIAS: 0.5,
  PICK_ADVANTAGE_WINDOW: 3,
  PICK_ADVANTAGE_LATE_MULT: 2,

  // Map state: each enemy tower a side cracks opens the map for them — more
  // vision and more picks. Tower-take advantage (net towers) tilts the next
  // vision/pick roll by this per-tower logit, and total towers down raises the
  // vision-pick CHANCE by this per-tower amount.
  MAP_CONTROL_BIAS: 0.08,
  MAP_CONTROL_VISION_CHANCE: 0.03,

  // Composition win-condition pursuit: how hard a comp's drafted macro pulls
  // events toward its preferred play — a splitpush comp generates cross-map
  // trades / backdoors, a grouping comp forces the teamfight. Blue-positive,
  // cancels when both sides share a macro (e.g. default group-vs-group).
  MACRO_EVENT_BIAS: 0.3,

  // Lane snowball: each lane kill (gank/solo/roam) feeds that lane's LIVE
  // advantage (g/min-equivalent), so a fed lane keeps producing kills and
  // objective prio. Symmetric — either side can snowball.
  LANE_SNOWBALL_PER_KILL: 30,

  // Objective → fight strength: a live Baron/Elder/Soul makes its holder win
  // the actual teamfight harder (added to fight dominance 0..0.6), not just
  // shift win-prob. Soul's value is type-specific (see SOUL_FIGHT_EDGE).
  OBJ_FIGHT_EDGE_BARON: 0.12,
  OBJ_FIGHT_EDGE_ELDER: 0.2,

  // Vision/score → steals: the contesting side's map control protects the pit
  // (per net tower), and a side far behind on gold throws desperation smites.
  STEAL_VISION_REDUCTION: 0.02,
  STEAL_DESPERATION: 0.06,
  STEAL_DESPERATION_DEFICIT: 3000,

  // Gold lead → earlier power spike: a fed carry itemizes faster. Max minutes a
  // spike is pulled forward when that side is well ahead.
  SPIKE_LEAD_SHIFT_MAX: 1.2,
  SPIKE_LEAD_NORM: 4000,

  // Gank → counter-gank: a gank makes the enemy jungler's counter-gank both
  // more likely and biased back toward the team that just got ganked.
  COUNTERGANK_AFTER_GANK_CHANCE: 0.18,
  COUNTERGANK_RESPONSE_BIAS: 0.5,

  // Wave-crash → tower: crashing the wave into the tower builds plate/turret
  // pressure for the crashing side (and a touch of lane snowball).
  WAVECRASH_TOWER_PRESSURE: 0.18,

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
