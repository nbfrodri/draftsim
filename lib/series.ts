import { createGame } from "./draftEngine";
import { deriveStar } from "./players";
import type { RNG } from "./rng";
import type {
  AIDifficulty,
  DraftMode,
  GameDraft,
  GameRecap,
  Roster,
  SeriesFormat,
  SeriesState,
  Side,
} from "./types";

// ─── Side selection between games ───────────────────────────────────────────
// How blue/red are assigned for game 2+ of a Bo3/Bo5.
//
// "loser-blue"  — DEFAULT. Reproduces the pre-existing behavior exactly: the
//                 store's auto-advance swapped sides whenever the previous
//                 game's winner was on blue, which means the LOSER of every
//                 game always lands on blue side for the next one (a small
//                 built-in comeback mechanic, since blue carries
//                 BLUE_SIDE_BONUS + first pick). `sideRule: undefined`
//                 behaves identically.
// "fixed"       — teams keep their current sides for the whole series.
// "alternate"   — teams swap sides every game regardless of results.
// "loser-picks" — competitive standard: the loser of the previous game
//                 chooses its side for the next game. recordWinner records
//                 the chooser on `sideChooser`; the caller (human UI or
//                 chooseSideAI) then calls applySideChoice to start the
//                 next game.
export type SideRule = "loser-blue" | "fixed" | "alternate" | "loser-picks";

// Augment SeriesState with the (optional, legacy-safe) side-selection fields.
// Declared here rather than in lib/types.ts so the whole feature lives in
// this module. Both fields are optional: series created before this feature
// (or with the default rule) never set them and behave exactly as before.
declare module "./types" {
  interface SeriesState {
    // Side-assignment rule for games 2+. undefined ⇒ "loser-blue" (the
    // pre-existing behavior — see effectiveSideRule).
    sideRule?: SideRule;
    // Only used under "loser-picks": the team NAME (not side — names are
    // stable across swaps) that holds side choice for the upcoming game.
    // Set by recordWinner when a non-final game resolves; cleared when the
    // next game starts. null/undefined ⇒ no pending choice.
    sideChooser?: string | null;
  }
}

export function requiredWins(format: SeriesFormat): number {
  if (format === "bo1") return 1;
  if (format === "bo3") return 2;
  return 3;
}

export function maxGames(format: SeriesFormat): number {
  if (format === "bo1") return 1;
  if (format === "bo3") return 3;
  return 5;
}

export function createSeries(params: {
  format: SeriesFormat;
  fearless: boolean;
  timerEnabled: boolean;
  blueTeam: string;
  redTeam: string;
  mode: DraftMode;
  aiSide: Side | null;
  aiDifficulty: AIDifficulty;
  blueAiDifficulty?: AIDifficulty;
  redAiDifficulty?: AIDifficulty;
  // Optional star ratings (tournament context only).
  blueStarRating?: number;
  redStarRating?: number;
  // Tournament momentum context. SIGNED streaks: +N consecutive series
  // wins feed a "team on a roll" score-bias bump; -N consecutive losses
  // feed the mirror-image "team in a slump" penalty. Round-depth tag
  // enables underdog protection in semis/finals. (Field names keep the
  // historical "WinStreak" suffix for save compatibility — legacy
  // snapshots only ever stored values ≥ 0.)
  blueWinStreak?: number;
  redWinStreak?: number;
  tournamentRound?: "early" | "quarterfinal" | "semifinal" | "final";
  // Optional player rosters. When provided and an explicit star rating
  // isn't, the team's star derives from the roster (deriveStar).
  bluePlayers?: Roster;
  redPlayers?: Roster;
  // Side-assignment rule for games 2+. Omitted ⇒ default ("loser-blue",
  // the pre-existing behavior).
  sideRule?: SideRule;
  // Draft personality ids for each side's AI. Follow the team across swaps.
  // Undefined → 'balanced' (exact historical behavior).
  bluePersonalityId?: string;
  redPersonalityId?: string;
}): SeriesState {
  return {
    id: `series-${Date.now()}`,
    format: params.format,
    fearless: params.fearless,
    timerEnabled: params.timerEnabled,
    blueTeam: params.blueTeam,
    redTeam: params.redTeam,
    games: [createGame(1, params.blueTeam, params.redTeam)],
    status: "drafting",
    winner: null,
    mode: params.mode,
    aiSide: params.mode === "pvai" ? params.aiSide : null,
    aiDifficulty: params.aiDifficulty,
    blueAiDifficulty: params.blueAiDifficulty,
    redAiDifficulty: params.redAiDifficulty,
    // Star rating: explicit value wins; otherwise derive it from the roster
    // (the roster is the source of truth for team strength). Stays undefined
    // when neither is provided — non-tournament series with no rosters get
    // no win bias, exactly as before.
    blueStarRating:
      params.blueStarRating ??
      (params.bluePlayers ? deriveStar(params.bluePlayers) : undefined),
    redStarRating:
      params.redStarRating ??
      (params.redPlayers ? deriveStar(params.redPlayers) : undefined),
    blueWinStreak: params.blueWinStreak,
    redWinStreak: params.redWinStreak,
    tournamentRound: params.tournamentRound,
    bluePlayers: params.bluePlayers,
    redPlayers: params.redPlayers,
    // Only persist the rule when explicitly set — keeps the default state
    // shape byte-identical to pre-feature series.
    ...(params.sideRule ? { sideRule: params.sideRule } : {}),
    // Only persist personality ids when explicitly set.
    ...(params.bluePersonalityId ? { bluePersonalityId: params.bluePersonalityId } : {}),
    ...(params.redPersonalityId ? { redPersonalityId: params.redPersonalityId } : {}),
  };
}

// Resolve the active side rule. undefined means the series predates the
// feature (or didn't opt in) — that's the historical "loser ends up on
// blue" auto-swap, named "loser-blue".
export function effectiveSideRule(series: SeriesState): SideRule {
  return series.sideRule ?? "loser-blue";
}

// Compute the next game's side assignment under the active rule, as
// { blueTeam, redTeam } team names ready for startNextGame. Returns null
// when the assignment isn't determined by the rule alone:
//   - "loser-picks": a choice is pending — read `sideChooser` and call
//     applySideChoice (human UI) or chooseSideAI + applySideChoice (AI).
//   - the previous game has no winner yet, or the series isn't between games.
export function nextGameSides(
  series: SeriesState,
): { blueTeam: string; redTeam: string } | null {
  if (series.status !== "between-games") return null;
  const rule = effectiveSideRule(series);
  if (rule === "fixed") {
    return { blueTeam: series.blueTeam, redTeam: series.redTeam };
  }
  if (rule === "alternate") {
    return { blueTeam: series.redTeam, redTeam: series.blueTeam };
  }
  if (rule === "loser-picks") return null;
  // "loser-blue" (default): the loser of the last game takes blue side.
  // Identical to the store's historical auto-swap (swap iff blue just won).
  const last = series.games[series.games.length - 1];
  if (!last?.winner) return null;
  const swap = last.winner === "blue";
  return swap
    ? { blueTeam: series.redTeam, redTeam: series.blueTeam }
    : { blueTeam: series.blueTeam, redTeam: series.redTeam };
}

// Convert a series's per-team star ratings into a score-diff bias for
// the simulator. Returns 0 when ratings aren't set (non-tournament).
// SIGMOID_K in matchSimulator is 0.05, so a bias of ~9 score points per
// star ≈ +11pp win-prob per star at the slope. A 5★ vs 1★ blowout
// (diff = 4) reaches around +43% extra blue win-prob — a chalk
// favorite, but not deterministic. Even matchups (3★ vs 3★) get zero
// bias. The gradient was bumped from 6.0 because higher-rated rosters
// were losing to lower-rated rosters too often: in-game variance
// (gold-lead random walk + closing-fight combat ratio) was washing
// out the per-event side bias. A stronger K compounds across all 20+
// rolls so the favorite reliably banks an early gold lead.
const STAR_RATING_BIAS_K = 9.0;
// Per-consecutive-result bonus/penalty. ~1.5 points per game in the
// streak ≈ ±2pp win-prob per series at the slope. Symmetric: a win
// streak adds, a LOSS streak subtracts the same gradient (tilt is the
// mirror image of momentum). Capped in both directions so a snowball
// doesn't snowball the simulator: 4 consecutive results = ±6 points,
// equivalent to a one-star bump/drop. Streak flips sign on the first
// opposite result.
const WIN_STREAK_BIAS_K = 1.5;
const WIN_STREAK_BIAS_CAP = 6.0;
// Underdog protection. Now scoped tighter: only fires when the star
// gap is severe (≥ 3) AND the round is a final. Reflects user intent:
// a 5★ team should reliably beat a 4★ team — only the largest gaps
// (1★/2★ vs 4★/5★) get a real upset window, and only when the stage
// is meaningful. UNDERDOG_BLUNT now keeps 65% of the favorite's edge
// (was 40%); UNDERDOG_FLAT shrunk to 1.5 score-pts (was 2.5). Net for
// a 5★ vs 1★ final: bias = 9*4*0.65 - 1.5 ≈ 21.9 → ~75% favorite,
// leaving ~25% as the genuine "upset" probability.
const UNDERDOG_BLUNT = 0.35;
const UNDERDOG_FLAT = 1.5;
const UNDERDOG_MIN_GAP = 3;
export function starRatingBias(series: SeriesState): number {
  const blue = series.blueStarRating;
  const red = series.redStarRating;
  if (typeof blue !== "number" || typeof red !== "number") return 0;
  let starBias = (blue - red) * STAR_RATING_BIAS_K;
  // Underdog protection in finals only. Operates on the star bias
  // alone — leaves streak and base draft signals untouched, since they
  // already reflect the underdog's real form. Scoped to FINAL (not
  // semis) and a star gap ≥ 3 so only the most consequential
  // mismatches earn an upset window. A 5★ vs 4★ final still plays
  // chalk; a 5★ vs 1★ final is the one with a real comeback story.
  const round = series.tournamentRound;
  const isFinal = round === "final";
  if (isFinal) {
    const starGap = Math.abs(blue - red);
    if (starGap >= UNDERDOG_MIN_GAP) {
      // Blunt the chalk: scale the star-rating bias down so the
      // underdog isn't already buried by the seed gap before the draft
      // even runs.
      starBias *= 1 - UNDERDOG_BLUNT;
      // Add a flat bonus toward the underdog (the lower-rated side).
      // Sign is opposite of starBias direction: if blue is favored,
      // underdog flat helps red (negative). And vice versa.
      if (blue > red) starBias -= UNDERDOG_FLAT;
      else starBias += UNDERDOG_FLAT;
    }
  }
  // Streak bonus/penalty. Each side's SIGNED streak (+wins / -losses)
  // feeds the bias: a team riding a 3-match win streak earns a
  // measurable edge, a team mired in a 3-match skid concedes one — the
  // "form" component of upset/chalk. Magnitude capped per side.
  const streakBias = (streak: number) =>
    Math.sign(streak) *
    Math.min(WIN_STREAK_BIAS_CAP, Math.abs(streak) * WIN_STREAK_BIAS_K);
  const blueStreakBias = streakBias(series.blueWinStreak ?? 0);
  const redStreakBias = streakBias(series.redWinStreak ?? 0);
  return starBias + (blueStreakBias - redStreakBias);
}

// Pick the effective AI difficulty for a given side. Per-side overrides
// take precedence over the default `aiDifficulty`. Used by the AI
// scoring path to apply different sampling knobs per AI when AI vs AI
// is configured as a handicap match.
export function difficultyForSide(
  series: SeriesState,
  side: Side,
): AIDifficulty {
  if (side === "blue" && series.blueAiDifficulty) return series.blueAiDifficulty;
  if (side === "red" && series.redAiDifficulty) return series.redAiDifficulty;
  return series.aiDifficulty;
}

export function currentGame(series: SeriesState): GameDraft {
  return series.games[series.games.length - 1];
}

// Champions "locked out" by fearless — only *picked* (not banned) champions count.
export function fearlessLockedSet(series: SeriesState): Set<number> {
  return fearlessLocksBeforeGame(series, series.games.length - 1);
}

// Champions locked by fearless entering a specific game index (0-based).
// Empty for game 0; for game N, accumulates picks from games 0..N-1.
export function fearlessLocksBeforeGame(
  series: SeriesState,
  gameIndex: number,
): Set<number> {
  const set = new Set<number>();
  if (!series.fearless) return set;
  const end = Math.min(gameIndex, series.games.length);
  for (let i = 0; i < end; i++) {
    const g = series.games[i];
    for (const id of [...g.bluePicks, ...g.redPicks]) {
      if (id != null) set.add(id);
    }
  }
  return set;
}

// Wins aggregated by team *name*, so sides flipping mid-series doesn't split
// one team's wins across the blue/red buckets.
export function winsByTeamName(series: SeriesState): Map<string, number> {
  const counts = new Map<string, number>();
  for (const g of series.games) {
    if (g.winner == null) continue;
    const name = g.winner === "blue" ? g.blueTeam : g.redTeam;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return counts;
}

// Score keyed by the current side assignment. Uses team-name aggregation
// under the hood so swapping sides between games doesn't misattribute wins.
export function seriesScore(series: SeriesState): { blue: number; red: number } {
  const wins = winsByTeamName(series);
  return {
    blue: wins.get(series.blueTeam) ?? 0,
    red: wins.get(series.redTeam) ?? 0,
  };
}

// A series is decided when any team (by identity) has reached the win threshold.
// Returns the current side that team occupies; null if nobody has clinched yet.
export function isSeriesDecided(series: SeriesState): Side | null {
  const wins = winsByTeamName(series);
  const need = requiredWins(series.format);
  for (const [name, w] of wins) {
    if (w < need) continue;
    if (name === series.blueTeam) return "blue";
    if (name === series.redTeam) return "red";
  }
  return null;
}

export function recordWinner(
  series: SeriesState,
  winner: Side,
  recap?: GameRecap,
): SeriesState {
  const games = [...series.games];
  const last = games[games.length - 1];
  games[games.length - 1] = {
    ...last,
    winner,
    // Only attach recap if provided (manual winner declarations leave it
    // unset). Don't overwrite an existing recap with undefined.
    ...(recap ? { recap } : {}),
  };
  const updated: SeriesState = { ...series, games };
  const decided = isSeriesDecided(updated);
  if (decided) {
    updated.status = "complete";
    updated.winner = decided;
    // No upcoming game — drop any stale pending choice.
    if (updated.sideChooser != null) updated.sideChooser = null;
  } else {
    updated.status = "between-games";
    // Under "loser-picks" the LOSER of this game holds side choice for the
    // next one. Recorded by team NAME so the entitlement survives any side
    // bookkeeping. Other rules (incl. the default) never set this field, so
    // pre-feature behavior is untouched.
    if (effectiveSideRule(updated) === "loser-picks") {
      const last = games[games.length - 1];
      updated.sideChooser = winner === "blue" ? last.redTeam : last.blueTeam;
    }
  }
  return updated;
}

// Apply the pending side choice under "loser-picks": put the chooser's team
// on `side` for the upcoming game and start it. No-op (returns the series
// unchanged) when there's no pending chooser or the series isn't between
// games — mirroring startNextGame's guard style.
export function applySideChoice(series: SeriesState, side: Side): SeriesState {
  if (series.status !== "between-games") return series;
  const chooser = series.sideChooser;
  if (!chooser) return series;
  const other =
    chooser === series.blueTeam ? series.redTeam : series.blueTeam;
  const blueTeam = side === "blue" ? chooser : other;
  const redTeam = side === "blue" ? other : chooser;
  return startNextGame(series, blueTeam, redTeam);
}

// ─── AI side choice ─────────────────────────────────────────────────────────
// Plain-data input so callers (store, tournament auto-sim) don't need to
// thread full series state through.
export interface SideChoiceInput {
  // The chooser's roster, if known. Players' goodChamps describe the team's
  // known champion pools.
  players?: Roster;
  // Champion ids this team itself picked in earlier games of the series.
  pickHistory?: number[];
}

// Blue-side base preference: blue gets first pick + BLUE_SIDE_BONUS in the
// simulator, so a generic team should want it most of the time.
const SIDE_AI_BLUE_BASE = 0.85;
// How much a maximal counter-pick signal can pull toward red. At full
// signal blueProb = 0.85 - 0.5 = 0.35, i.e. the team actually prefers red.
const SIDE_AI_RED_PULL = 0.5;
// Pool size at which a roster counts as maximally flexible: 3 goodChamps
// per player × 5 players, all distinct.
const SIDE_AI_FULL_POOL = 15;

// Heuristic side choice for the AI under "loser-picks".
//
// Rationale: blue is preferred by default (draft priority + side bonus).
// Red's compensation is the counter-pick slot (last pick), which only pays
// off for teams flexible enough to actually flex into counters. We proxy
// "counter-pick style" with two cheap, plain-data signals:
//   - pool breadth: distinct champions across the roster's goodChamps
//     (wide known pools ⇒ can comfortably pick reactively), and
//   - pick diversity: distinct champions / total picks in the team's own
//     series history so far (never repeating ⇒ flexible drafting), weighted
//     by history depth so one game's trivially-distinct 5 picks don't read
//     as a style statement (full weight from 2 games / 10 picks on).
// The stronger of the two scales a pull from the blue-leaning base toward
// red. With no signal available the choice stays blue-leaning with mild
// rng variation (15% red), so it never becomes fully deterministic.
export function chooseSideAI(
  input: SideChoiceInput,
  rng: RNG = Math.random,
): Side {
  let signal = 0;
  if (input.players && input.players.length > 0) {
    const pool = new Set<number>();
    for (const p of input.players) for (const id of p.goodChamps) pool.add(id);
    signal = Math.max(signal, Math.min(1, pool.size / SIDE_AI_FULL_POOL));
  }
  if (input.pickHistory && input.pickHistory.length > 0) {
    const len = input.pickHistory.length;
    const distinct = new Set(input.pickHistory).size;
    const diversity = (distinct / len) * Math.min(1, len / 10);
    signal = Math.max(signal, diversity);
  }
  const blueProb = SIDE_AI_BLUE_BASE - SIDE_AI_RED_PULL * signal;
  return rng() < blueProb ? "blue" : "red";
}

// Start next game. Caller decides which side is which (side-swap UI).
// When teams swap sides, every per-side field that's actually a property
// of the TEAM (aiSide for PvAI, per-team AI difficulties, star ratings,
// win streaks) must follow the team — otherwise the human ends up
// controlling whichever roster the AI was driving last game, and
// tournament biases point at the wrong side.
export function startNextGame(
  series: SeriesState,
  blueTeam: string,
  redTeam: string,
): SeriesState {
  if (series.status !== "between-games") return series;
  const nextGameNumber = series.games.length + 1;
  if (nextGameNumber > maxGames(series.format)) return series;
  const swap = blueTeam === series.redTeam && redTeam === series.blueTeam;
  return {
    ...series,
    blueTeam,
    redTeam,
    status: "drafting",
    games: [...series.games, createGame(nextGameNumber, blueTeam, redTeam)],
    // The choice (if any) has been consumed — clear it. Conditional spread
    // keeps the state shape of non-loser-picks series byte-identical to
    // pre-feature behavior.
    ...(series.sideChooser != null ? { sideChooser: null } : {}),
    ...(swap
      ? {
          aiSide:
            series.aiSide === "blue"
              ? ("red" as Side)
              : series.aiSide === "red"
              ? ("blue" as Side)
              : series.aiSide,
          blueAiDifficulty: series.redAiDifficulty,
          redAiDifficulty: series.blueAiDifficulty,
          blueStarRating: series.redStarRating,
          redStarRating: series.blueStarRating,
          blueWinStreak: series.redWinStreak,
          redWinStreak: series.blueWinStreak,
          // Player rosters follow their team across the side swap, so
          // blue*/red* always describe the CURRENT sides (matching the
          // star-rating convention above). Keeps the simulator's per-lane
          // player effects and the AI's roster aligned to the right side.
          bluePlayers: series.redPlayers,
          redPlayers: series.bluePlayers,
          // Draft personalities follow their team across side swaps — each
          // team always uses its own personality regardless of side.
          bluePersonalityId: series.redPersonalityId,
          redPersonalityId: series.bluePersonalityId,
        }
      : {}),
  };
}
