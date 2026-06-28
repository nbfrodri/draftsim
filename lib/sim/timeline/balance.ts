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

  // ─── Comeback bias (NEGATIVE feedback for the event feed) ─────────────────
  // The causal links are all positive feedback (snowball), so a lead saturates
  // the event-side roll and the feed reads one-sided. This opposes the current
  // leader on SCRAPPY plays only (picks/vision/skirmishes/trades) — the losing
  // team still scraps for those — while objectives + the deciding fight keep
  // the leader's full edge. FACTOR = how much of the gold+momentum lead is
  // cancelled for those plays; CAP bounds it so the underdog never dominates.
  COMEBACK_BIAS_FACTOR: 0.6,
  COMEBACK_BIAS_CAP: 2.0,
  // A side far behind on gold mounts a desperation defensive STAND — wins a
  // fight it shouldn't, clawing back. Deficit to trigger + per-check chance.
  STAND_GOLD_DEFICIT: 4000,
  STAND_CHANCE: 0.33,
  // A far-AHEAD team gets greedy and throws (face-checks an objective). Deficit
  // to qualify + per-check chance. The trailing team gets the swing.
  THROW_GOLD_DEFICIT: 4500,
  THROW_CHANCE: 0.3,
  // Counter-jungle invade: chance + how far behind it puts the enemy jungler
  // (fewer ganks). GANK_DAMP = chance subtracted from a behind-jungler's gank.
  COUNTER_JUNGLE_CHANCE: 0.22,
  JUNGLE_BEHIND_GANK_DAMP: 0.18,
  // Mid-game backdoor attempt by a splitpush comp: chance, and odds it's caught
  // (vs cracks a tower).
  BACKDOOR_ATTEMPT_CHANCE: 0.3,
  BACKDOOR_CAUGHT_ODDS: 0.45,
  // Base-race finish chance in the closing sequence (both nexuses low).
  BASE_RACE_CHANCE: 0.12,
  // A live Baron/Elder accelerates the inhibitor siege (extra inhib in the
  // cascade) and the super-minion tower pressure it generates.
  BUFF_SIEGE_INHIB_BONUS: 1,

  // ─── Polish: thin early events now feed the causal state ──────────────────
  // Plates / scuttle convert into lane-lead snowball (kills-equivalent units,
  // ×LANE_SNOWBALL_PER_KILL). Small — a plate edge is real but not a kill.
  PLATE_LANE_SNOWBALL: 0.6,
  SCUTTLE_JUNGLE_SNOWBALL: 0.5,
  // A near-ace mid teamfight (winner − loser kills ≥ this) buys a longer free-
  // objective window (ace → free Baron) and may flash a multikill flair.
  ACE_KILL_MARGIN: 4,
  ACE_PICKADV_MULT: 1.7,
  // New early/late flavor beats.
  LEVEL_SPIKE_GANK_CHANCE: 0.25,
  VISION_SWEEP_CHANCE: 0.25,
  BARON_DANCE_CHANCE: 0.3,
  // Chance a clean 5-0 ace (mid teamfight or closing) is a single-champion
  // PENTAKILL rather than a spread team ace. Rare — kept special.
  PENTAKILL_CHANCE: 0.1,

  // ─── New event beats (richer/varied feed) ─────────────────────────────────
  // Kept modest so calibration holds; every POSITIVE beat carries comebackBias
  // so a lead doesn't saturate the feed. Balanced by the negative beats below.
  // Tower dive: a collapse onto a side lane that dives the turret (1-2 kills,
  // may trade 1 to tower aggro). Fed by wave-crash/tower pressure (wave→dive).
  TOWER_DIVE_CHANCE: 0.24,
  TOWER_DIVE_TRADE_ODDS: 0.35, // odds the divers trade a death to the tower
  // Poke/siege comp chips a tower over a window — pressure + gold, no kills.
  POKE_SIEGE_CHANCE: 0.42,
  POKE_SIEGE_TOWER_PRESSURE: 0.3,
  // Teleport flank: a top-laner TPs cross-map and flips a contested skirmish.
  TP_FLANK_CHANCE: 0.26,
  // Early cheese (proxy / lvl-2 all-in): high-variance early gamble.
  CHEESE_CHANCE: 0.12,
  CHEESE_SUCCESS_ODDS: 0.55,
  // Disengage / peel: a trailing team gets dived but PEELS and survives — a
  // defensive NEGATIVE-feedback beat (no deaths for them, small momentum back).
  DISENGAGE_CHANCE: 0.38,
  DISENGAGE_GOLD_DEFICIT: 2500,
  // Last-stand: the losing team repels the final push ONCE before losing.
  LAST_STAND_CHANCE: 0.25,
  // Splitpush comp is down a body in the 5v5 → its mid teamfight is slightly
  // harder to win (negative feedback against the splitpush side).
  SPLITPUSH_TEAMFIGHT_DAMP: 0.22,
  // A high-CC ("wombo") teamfight comp converts a won 5v5 harder (+kill spread).
  WOMBO_KILL_BONUS: 1,
  // Grubs → lane: Touch of the Void helps the laners shove/dive (small lane
  // snowball on the side lanes, on top of the tower pressure).
  GRUB_LANE_SNOWBALL: 0.4,
  // Roam → tower: a successful roam opens the side lane → a touch of tower
  // pressure for the roaming side (the roam → collapse → tower chain).
  ROAM_TOWER_PRESSURE: 0.12,
  // First-tower gold bonus (real LoL ≈ 150g shared) — the first turret of the
  // game pays a little extra on top of the structure bounty.
  FIRST_TOWER_BONUS: 150,
  // Player form → highlight plays. A hot-streak carry (form in [-1,+1]) is more
  // likely to BE the outplaying side and to be the one who pops off. Symmetric
  // (nets to 0 when both teams are equally hot / forms absent), so it never
  // disturbs the mirror calibration. Magnitudes small — form nudges, it doesn't
  // decide the game.
  FORM_OUTPLAY_BIAS: 0.4, // per net-form-point on the outplay side roll (logit)
  FORM_LANE_WEIGHT: 1.5, // how hard form skews WHICH lane gets the highlight

  // ─── Anti-streak mean-reversion (event-feed clustering) ───────────────────
  // The event-side roll reads the snowballing gold/momentum on every event, so
  // a leader gets long uninterrupted RUNS of plays even though the clamp caps
  // their per-roll probability — the feed reads as one team's highlight reel.
  // This nudges the next roll AWAY from the side that just had a run, scaling
  // with run length (capped). Symmetric (history-based, not strength-based) so
  // it scatters the trailing team's plays through the feed without changing who
  // wins (Monte-Carlo calibration tracks any residual; the mirror cancels).
  // Modelled as recent-IMBALANCE pushback (not a hard run-counter): whenever
  // the last WINDOW events skew to one side past a deadzone, bias the next roll
  // back toward the other team, scaled by the skew (capped). Pre-empts runs from
  // forming AND catches near-streaks ("6 of the last 8"). The redistributed
  // plays are the low-stakes scrappy bulk; the closing fight is decided
  // separately (decideClosingWinner), so outcomes are preserved.
  ANTI_STREAK_WINDOW: 8, // how many recent event sides to weigh
  ANTI_STREAK_DEADZONE: 1, // ignore natural skews up to this imbalance
  ANTI_STREAK_PER_EVENT: 0.5, // logit per imbalance point beyond the deadzone
  ANTI_STREAK_CAP: 2.6, // max anti-streak logit

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

  // Summoner/ultimate cooldown edge: a catch (pick) burns the victim's Flash/
  // ult, and a punished throw / caught backdoor burns the AGGRESSOR's — leaving
  // one side a key cooldown down for the next teamfight or objective. A transient
  // tilt on those rolls (logit), decaying on its own. Symmetric (either side can
  // force or waste cooldowns) so it cancels in the calibration mirror. Modelled
  // on PICK_ADVANTAGE — slightly smaller, same window + late-game scaling (death
  // timers grow, so a flash-down late is far more punishing).
  COOLDOWN_EDGE_BIAS: 0.35,
  COOLDOWN_EDGE_WINDOW: 3,
  COOLDOWN_EDGE_LATE_MULT: 2,

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

  // Gold lead → bigger power spike: a fed carry's core item swings harder.
  // (In the time-ordered engine a spike's minute is fixed at schedule time, so
  // the lead is recast as extra impact rather than an earlier spike.)
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
