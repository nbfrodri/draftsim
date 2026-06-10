// Tournament / league mode — pure data + bracket math.
//
// Phase 1 ships single-elimination only with power-of-2 team counts (2/4/8).
// The data model already accommodates round-robin and per-match overrides
// for Phase 2 — the missing logic is just helpers in this file.

import type {
  AIDifficulty,
  DraftMode,
  Roster,
  SeriesFormat,
  SeriesState,
  Side,
} from "./types";
import { deriveStar, normalizeRoster, rosterFromStar } from "./players";

// ─── Types ─────────────────────────────────────────────────────────────────

export type TournamentFormat =
  | "single-elim"
  | "round-robin"
  | "double-elim"
  | "swiss"
  | "swiss-playoffs"
  | "groups-playoffs"
  // Stage + double-elim playoff variants. Each runs the regular stage
  // (round-robin / swiss / groups) to determine playoff seeding, then
  // drops the top-N teams into a double-elim bracket (W + L + grand
  // final) instead of a single-elim tree. Same plumbing as the
  // single-elim playoff variants above, only the playoff-bracket
  // generator differs.
  | "round-robin-playoffs"
  | "swiss-playoffs-de"
  | "groups-playoffs-de";

// Returns true when the format runs a regular stage and then promotes
// top-N teams into a separate playoff bracket. Used to centralize the
// stage-vs-playoff logic so individual call sites don't have to keep
// listing every variant. Plain "round-robin", "swiss", "single-elim",
// "double-elim" return false.
export function formatHasPlayoffs(format: TournamentFormat): boolean {
  return (
    format === "swiss-playoffs" ||
    format === "swiss-playoffs-de" ||
    format === "groups-playoffs" ||
    format === "groups-playoffs-de" ||
    format === "round-robin-playoffs"
  );
}

// Which playoff-bracket shape a *-playoffs format uses. Single-elim by
// default; double-elim for the *-de variants and round-robin-playoffs
// (the user-facing label for that format is "Round Robin + DE Playoffs",
// so it always uses double-elim). Returns "single-elim" for non-playoff
// formats — caller should branch on formatHasPlayoffs first.
export function playoffBracketKindFor(
  format: TournamentFormat,
): "single-elim" | "double-elim" {
  if (
    format === "swiss-playoffs-de" ||
    format === "groups-playoffs-de" ||
    format === "round-robin-playoffs"
  ) {
    return "double-elim";
  }
  return "single-elim";
}

// Stage-format companion for *-playoffs formats. Returns the underlying
// stage that runs before the playoff bracket: round-robin for the
// groups/round-robin variants, swiss for the swiss variants. Used by
// tournament setup labels and for routing dashboard rendering.
export function stageFormatFor(
  format: TournamentFormat,
): "round-robin" | "swiss" | "groups" | null {
  if (format === "swiss-playoffs" || format === "swiss-playoffs-de") {
    return "swiss";
  }
  if (format === "groups-playoffs" || format === "groups-playoffs-de") {
    return "groups";
  }
  if (format === "round-robin-playoffs") return "round-robin";
  return null;
}

// For double-elimination only: which sub-bracket a match lives in.
//   "winners"            — the standard upper bracket. A loss drops the
//                          team to the losers bracket at a fixed
//                          position.
//   "losers"             — lower bracket. A loss eliminates.
//   "grand-final"        — first champion-deciding match (W-bracket
//                          champion vs L-bracket champion). If the
//                          L-side wins, a "grand-final-reset" match is
//                          dynamically generated and the tournament
//                          stays in-progress.
//   "grand-final-reset"  — second grand final. Same two teams, played
//                          only when the L-side won the first grand
//                          final. Whichever side wins this is champion.
// Matches in single-elim and round-robin tournaments leave this field
// undefined.
export type TournamentBracket =
  | "winners"
  | "losers"
  | "grand-final"
  | "grand-final-reset";

export interface TournamentTeam {
  id: string;
  name: string;
  // 1..N, where 1 is the top seed. Used for bracket position assignment.
  seed: number;
  // 1..5 strength rating set at tournament creation. Modulates per-game
  // win probability via a sigmoid bias on the team-score diff so a
  // higher-rated roster wins more often even with similar drafts. 3 is
  // neutral (no bias). Defaults to 3 when the field is missing on
  // legacy persisted state.
  starRating?: number;
  // Per-team AI difficulty override. When set, this team's AI uses
  // this difficulty for any tournament match it plays (instead of the
  // tournament-wide default). Useful for handicap matches inside a
  // tournament — e.g. one boss team plays Hard while underdogs play
  // Easy. Undefined = inherit from tournament defaults.
  aiDifficulty?: AIDifficulty;
  // Cosmetic icon name (one of TEAM_ICON_KEYS — Tabler icon keys). The
  // dashboard renders this next to the team name in match cards,
  // replays, and history. Falls back to a "shield" icon when missing.
  iconKey?: string;
  // Cosmetic accent color for the team (hex string, e.g. "#e11d48").
  // Picked from TEAM_COLORS in setup. Renders as a small swatch and
  // tints the team name accent in match cards. Undefined = use the
  // default sider colors (blue/red).
  color?: string;
  // Player roster (5 players, positional lane order). Persistent identity
  // across every match the team plays. The team's effective star rating is
  // DERIVED from this roster (see teamStarRating) — `starRating` above is
  // kept for the legacy macro and as a generation seed. Undefined on teams
  // created/persisted before this feature; filled on decode and at
  // tournament creation.
  players?: Roster;
  // Draft personality id for this team (see lib/draftAI/personalities.ts).
  // When set, the AI uses the named personality's scoring weights and
  // sampling overrides for every draft action this team takes in the
  // tournament. Undefined → 'balanced' (exact historical behavior).
  // Randomly assigned at tournament creation for AI teams that don't have
  // one pre-set, so every tournament has varied drafting styles.
  personalityId?: string;
}

// Curated 64-color palette for team accents. Designed to be visually
// distinguishable on the dark theme — saturation and lightness chosen
// so all colors have decent contrast against rift-bg. 16 hue families
// × 4 variants (deep / saturated / muted / bright). User-selectable
// via the team-color picker; randomize-colors button samples without
// replacement when team count ≤ 64.
export const TEAM_COLORS = [
  // Reds
  "#dc2626", "#ef4444", "#f87171", "#b91c1c",
  // Oranges
  "#ea580c", "#f97316", "#fb923c", "#c2410c",
  // Ambers
  "#d97706", "#f59e0b", "#fbbf24", "#b45309",
  // Yellows / golds
  "#ca8a04", "#eab308", "#fde047", "#a16207",
  // Limes
  "#65a30d", "#84cc16", "#a3e635", "#4d7c0f",
  // Greens
  "#16a34a", "#22c55e", "#4ade80", "#15803d",
  // Emeralds
  "#059669", "#10b981", "#34d399", "#047857",
  // Teals
  "#0d9488", "#14b8a6", "#2dd4bf", "#0f766e",
  // Cyans
  "#0891b2", "#06b6d4", "#22d3ee", "#0e7490",
  // Skies
  "#0284c7", "#0ea5e9", "#38bdf8", "#075985",
  // Blues
  "#2563eb", "#3b82f6", "#60a5fa", "#1e40af",
  // Indigos
  "#4f46e5", "#6366f1", "#818cf8", "#3730a3",
  // Violets
  "#7c3aed", "#8b5cf6", "#a78bfa", "#5b21b6",
  // Purples
  "#9333ea", "#a855f7", "#c084fc", "#6b21a8",
  // Fuchsias
  "#c026d3", "#d946ef", "#e879f9", "#a21caf",
  // Pinks / roses
  "#db2777", "#ec4899", "#f472b6", "#9f1239",
] as const;
export type TeamColor = (typeof TEAM_COLORS)[number];

// Curated icon set used for team logos (64 entries). Strings here are
// keys; the dashboard maps them to imported Tabler React components.
// 32-team tournaments draw without replacement, so 64 covers anything
// reasonable plus headroom.
export const TEAM_ICON_KEYS = [
  "shield",
  "sword",
  "crown",
  "flame",
  "skull",
  "star",
  "stars",
  "heart",
  "diamond",
  "diamonds",
  "spade",
  "clubs",
  "hexagon",
  "octagon",
  "square",
  "bolt",
  "snowflake",
  "axe",
  "bow",
  "hammer",
  "trident",
  "helmet",
  "anchor",
  "horseshoe",
  "feather",
  "ghost",
  "alien",
  "wand",
  "sparkles",
  "spiral",
  "sphere",
  "cat",
  "paw",
  "horse",
  "dog",
  "bat",
  "spider",
  "fish",
  "butterfly",
  "cloud",
  "sun",
  "moon",
  "rocket",
  "leaf",
  "mountain",
  "tower",
  "tent",
  "beach",
  "sailboat",
  "fountain",
  "pyramid",
  "cactus",
  "flower",
  "carrot",
  "cherry",
  "apple",
  "lemon",
  "cookie",
  "egg",
  "compass",
  "key",
  "lock",
  "magnet",
  "telescope",
  "tornado",
  "umbrella",
  "lifebuoy",
  "scissors",
  "parachute",
  "backpack",
  "hourglass",
  "clock",
  "music",
  "atom",
  "galaxy",
  "planet",
  "candle",
  "coffin",
  "ankh",
  "bone",
  "bulb",
  "bell",
  "flag",
  "award",
  "mask",
  "eye",
  "fingerprint",
] as const;
export type TeamIconKey = (typeof TEAM_ICON_KEYS)[number];

// Effective star rating with a sane default for legacy / partial data.
export function teamStarRating(team: TournamentTeam | null): number {
  if (!team) return 3;
  // The roster is the source of truth: when a team has players, its star
  // rating is the derived mean of their tiers. Falls back to the stored
  // `starRating` for legacy teams that have no roster yet.
  if (Array.isArray(team.players) && team.players.length > 0) {
    return deriveStar(team.players);
  }
  const r = team.starRating;
  if (typeof r !== "number" || !Number.isFinite(r)) return 3;
  return Math.max(1, Math.min(5, Math.round(r)));
}

// Count consecutive match wins for `teamId` ending at the most recently
// completed match they played. Walks the team's completed match history
// in chronological order (by round, then by match-id stability) and
// counts the trailing run of wins. Excludes the current `excludeMatchId`
// so a team's bias for the match they're currently playing doesn't
// double-count an in-progress series. Returns 0 for legacy / partial
// data or teams with no completed matches yet.
//
// Used by tournamentSeriesContext below to feed starRatingBias the
// "team on a roll" signal — winners of a tournament typically rack up
// 3-4 consecutive series wins by the final, and that momentum is real
// (preparation, confidence, scouting advantages all compound).
export function teamWinStreak(
  tournament: TournamentState,
  teamId: string,
  excludeMatchId?: string,
): number {
  // Filter to completed matches the team participated in. Sort by round
  // ascending, then by match.id (stable insertion order proxy) so the
  // walk is deterministic across formats.
  const played = tournament.matches
    .filter((m) => m.id !== excludeMatchId)
    .filter(
      (m) =>
        m.winner != null && (m.blueTeamId === teamId || m.redTeamId === teamId),
    )
    .sort((a, b) => a.round - b.round || a.id.localeCompare(b.id));
  let streak = 0;
  // Walk backwards from the most recent completed match: each consecutive
  // win extends the streak; first loss breaks it.
  for (let i = played.length - 1; i >= 0; i--) {
    const m = played[i];
    if (m.winner?.teamId === teamId) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

// Classify a tournament match's round depth so the simulator can
// differentiate "early bracket noise" from "elimination-pressure
// rounds". Returns:
//   - "final"        — last single-elim round, last DE round, or the
//                      round-robin championship match
//   - "semifinal"    — penultimate single-elim/DE round
//   - "quarterfinal" — second-to-last bracket round (single-elim/DE)
//   - "early"        — group stage, round-robin regular play, swiss
//                      regular play, or earlier bracket rounds
//
// Round-robin / swiss matches have no inherent "final" — those only
// emerge after the playoff bracket starts (the *-playoffs formats use
// the bracket subset for late-round detection). For pure round-robin
// and pure swiss, every match returns "early" since no match
// eliminates a team.
export function tournamentRoundDepth(
  tournament: TournamentState,
  matchId: string,
): "early" | "quarterfinal" | "semifinal" | "final" {
  const match = tournament.matches.find((m) => m.id === matchId);
  if (!match) return "early";
  // Round-robin / swiss / groups stage matches are never elimination
  // rounds; treat as early regardless of round number.
  const isStageMatch =
    !match.bracket && // double-elim matches always have a bracket tag
    (tournament.format === "round-robin" ||
      tournament.format === "swiss" ||
      // For *-playoffs formats, stage matches are identified by
      // groupId presence (groups) or by being in the early matches
      // pool before any bracket matches were generated. The simplest
      // heuristic: stage matches lack `feedsInto` (they don't advance
      // anywhere within a bracket).
      (formatHasPlayoffs(tournament.format) && !match.feedsInto && !match.bracket));
  if (isStageMatch) return "early";
  // Bracket matches (single-elim, double-elim, *-playoffs bracket
  // portion). Compute max round number among bracket matches in the
  // SAME bracket family (winners-bracket subset for double-elim, full
  // bracket for single-elim).
  //
  // Distinguishing "bracket" from "stage" matches: bracket finals carry
  // `feedsInto: null` (same as round-robin stage matches), so we can't
  // use that field alone. A match is treated as a bracket match if EITHER
  //   - it has `feedsInto` truthy (every non-final bracket match), OR
  //   - some other match's `feedsInto.matchId` points back at it
  //     (catches the final, which is fed-into but doesn't itself feed).
  const fedIntoIds = new Set<string>();
  for (const m of tournament.matches) {
    if (m.feedsInto?.matchId) fedIntoIds.add(m.feedsInto.matchId);
  }
  const isBracketMatch = (m: TournamentMatch): boolean =>
    m.feedsInto != null || fedIntoIds.has(m.id) || m.bracket != null;
  const peers = tournament.matches.filter((m) => {
    if (match.bracket) {
      // Double-elim or playoff DE: scope to same bracket type
      // (winners / losers / grand-final).
      return m.bracket === match.bracket;
    }
    // Single-elim: scope to bracket matches only (filter out stage
    // matches that share the no-bracket tag).
    return !m.bracket && isBracketMatch(m);
  });
  const maxRound = peers.reduce((acc, m) => Math.max(acc, m.round), 0);
  if (maxRound === 0) return "early";
  // Grand-final and grand-final-reset are always "final".
  if (match.bracket === "grand-final" || match.bracket === "grand-final-reset") {
    return "final";
  }
  if (match.round === maxRound) return "final";
  if (match.round === maxRound - 1) return "semifinal";
  if (match.round === maxRound - 2) return "quarterfinal";
  return "early";
}

// Bundled tournament-context lookup: star ratings + win streaks +
// round depth for both sides of a given match. Returns null if the
// match doesn't have both teams set yet. Consumed by createSeries call
// sites in the store to populate SeriesState.tournament* fields in one
// pass (instead of three independent lookups per side).
export interface TournamentSeriesContext {
  blueStarRating: number;
  redStarRating: number;
  blueWinStreak: number;
  redWinStreak: number;
  roundDepth: "early" | "quarterfinal" | "semifinal" | "final";
}

export function tournamentSeriesContext(
  tournament: TournamentState,
  matchId: string,
): TournamentSeriesContext | null {
  const match = tournament.matches.find((m) => m.id === matchId);
  if (!match || match.blueTeamId == null || match.redTeamId == null) {
    return null;
  }
  const blueTeam = tournament.teams.find((t) => t.id === match.blueTeamId);
  const redTeam = tournament.teams.find((t) => t.id === match.redTeamId);
  return {
    blueStarRating: teamStarRating(blueTeam ?? null),
    redStarRating: teamStarRating(redTeam ?? null),
    blueWinStreak: teamWinStreak(tournament, match.blueTeamId, matchId),
    redWinStreak: teamWinStreak(tournament, match.redTeamId, matchId),
    roundDepth: tournamentRoundDepth(tournament, matchId),
  };
}

export interface TournamentMatch {
  id: string;
  // 1-indexed round number. Round 1 is the first round of matches; the
  // final round is log2(N) for an N-team bracket.
  round: number;
  // Slot ids reference TournamentTeam.id. null when the slot is "TBD"
  // (e.g. the winner of a downstream match hasn't been decided yet).
  blueTeamId: string | null;
  redTeamId: string | null;
  // Per-match settings inherited from tournament defaults at creation.
  // Phase 2 wires UI to override these per match.
  format: SeriesFormat;
  fearless: boolean;
  mode: DraftMode;
  aiSide: Side | null;
  aiDifficulty: AIDifficulty;
  // Live state — populated when the match starts. Cleared after winner
  // is recorded (we keep a snapshot via `winner` instead of holding the
  // full SeriesState forever).
  series: SeriesState | null;
  // Result when complete. Includes the winning team id and the per-side
  // game count (so the UI can show "Blue 3-1 Red").
  winner: {
    teamId: string;
    blueWins: number;
    redWins: number;
  } | null;
  // For elimination brackets: the next match this winner advances into.
  // `slot` says whether the winner takes the blue or red position there.
  // Null on the final match (no destination).
  feedsInto: { matchId: string; slot: "blue" | "red" } | null;
  // ─── Double-elim only ─────────────────────────────────────────────────
  // Which sub-bracket this match belongs to. Undefined for single-elim
  // and round-robin (which use the existing flat `feedsInto` model).
  bracket?: TournamentBracket;
  // For winners-bracket matches in double-elim: where the LOSER drops to
  // in the losers bracket. Null on the W-Final (W-Final loser feeds
  // straight into the L-Final via this field as well — set by the
  // generator). Undefined outside double-elim.
  losersFeedsInto?: { matchId: string; slot: "blue" | "red" } | null;
  // Groups+playoffs only: which group this group-stage match belongs to
  // (e.g. "A", "B", …). Playoff bracket matches leave this undefined.
  // Empty string is treated the same as undefined for compatibility
  // with snapshots that pre-date multi-group support.
  groupId?: string;
  // Swiss only: true when this is a synthetic bye match generated because
  // the team count is odd. The match is pre-resolved with the bye
  // recipient as winner (blueTeamId set, redTeamId null, winner populated
  // at creation). Consumers that iterate matches to start/simulate skip
  // it (blueTeamId && redTeamId guard already handles this), and
  // computeSwissStandings handles it specially so the bye win is credited
  // without a real opponent entry that would skew Buchholz.
  isBye?: boolean;
}

export interface TournamentFearlessConfig {
  // Phase 1 supports per-series only. Phase 2 will add the cross-match
  // levels; the toggles ship in v1 of the data model so future tournaments
  // load with the right shape.
  perSeries: boolean;
  perTeam: boolean;
  global: boolean;
}

export interface TournamentDefaults {
  format: SeriesFormat;
  fearless: boolean;
  mode: DraftMode;
  aiSide: Side | null;
  aiDifficulty: AIDifficulty;
  timerEnabled: boolean;
}

// Per-match SeriesFormat overrides keyed by structured strings. Each
// generator looks up overrides[key] before falling back to
// defaults.format. The setup form writes these; generators consume at
// match-creation time. Persisted on TournamentState so playoff
// promotion (which generates matches AFTER tournament creation) can
// still read them.
//
// Key shapes:
//   "main:<round>"  — main stage matchday/round
//                     (round-robin, swiss, groups stage)
//   "wb:<round>"    — winners-bracket round (standalone single-elim
//                     or standalone double-elim W bracket)
//   "lb:<round>"    — losers-bracket round (standalone double-elim)
//   "gf"            — grand final (standalone double-elim)
//   "po:wb:<round>" — playoff winners-bracket round (*-playoffs)
//   "po:lb:<round>" — playoff losers-bracket round (DE *-playoffs)
//   "po:gf"         — playoff grand final (DE *-playoffs)
//
// Missing keys fall back to defaults.format. Saving a key with the
// same value as defaults.format is harmless but redundant.
export type FormatOverrides = Record<string, SeriesFormat>;

// Look up the SeriesFormat for a match. Tries each key in order and
// returns the first defined override; falls back to defaults.format
// when none match. Multiple keys allow generators to look up a
// specific match (e.g. "main:3") then a stage-wide fallback ("main")
// — the setup UI writes "main" as a single picker for the whole
// regular stage but the data model still supports per-matchday
// granularity if anyone wires it later.
export function pickFormat(
  defaults: TournamentDefaults,
  overrides: FormatOverrides | undefined,
  ...keys: string[]
): SeriesFormat {
  if (!overrides) return defaults.format;
  for (const k of keys) {
    const v = overrides[k];
    if (v) return v;
  }
  return defaults.format;
}

export interface TournamentState {
  id: string;
  name: string;
  format: TournamentFormat;
  status: "setup" | "in-progress" | "complete";
  teams: TournamentTeam[];
  matches: TournamentMatch[];
  // Single-elim only: when true, after every round completes, the next
  // round's pairings are re-arranged so the highest-seeded survivor
  // faces the lowest-seeded survivor (instead of following fixed
  // bracket order). Cosmetic when chalk holds; meaningful on upsets.
  // Defaults to false on legacy state. Has no effect on other formats.
  reseedBetweenRounds?: boolean;
  // Double-elim only: when true, the W-bracket champion can clinch the
  // tournament with a single grand-final win regardless of who wins
  // game one — i.e. the L-bracket champion must win TWO consecutive
  // matches to take the title (true grand-final convention used by
  // some pro circuits). When false (default), any L-side first-game
  // win forces a bracket reset.
  trueGrandFinal?: boolean;
  // Swiss only: total number of rounds the tournament will play. Each
  // round generates dynamically as the previous one completes; this
  // bound tells the system when to stop. ceil(log2(N)) by default at
  // creation time. Undefined for non-Swiss tournaments.
  swissTotalRounds?: number;
  // Swiss-playoffs only: how many top-of-standings teams advance to the
  // single-elim playoff bracket. Defaults to a sensible power of 2
  // (4 / 8 / 16) based on team count. Undefined for plain swiss.
  swissPlayoffsAdvancing?: number;
  // Swiss-playoffs only: false until the user freezes standings and
  // generates the playoff bracket.
  swissPlayoffsStarted?: boolean;
  // Round-robin-playoffs only: how many top-of-standings teams advance
  // to the playoff bracket. Defaults to a power of 2 ≥ 4 (4 or 8) so
  // both single-elim and double-elim brackets fit cleanly. Undefined
  // for non-RR-playoffs formats.
  rrPlayoffsAdvancing?: number;
  // Round-robin-playoffs only: false until the user freezes standings
  // and generates the playoff bracket.
  rrPlayoffsStarted?: boolean;
  // Groups-playoffs only: configuration captured at creation. Defines
  // how many groups, teams per group, and how many advance from each
  // group to the single-elim playoff. Undefined for other formats.
  groupsPlayoffs?: {
    groupCount: number; // number of groups (e.g. 2 = "A" and "B")
    advancingPerGroup: number; // top N from EACH group advance
    playoffStarted: boolean; // false until standings frozen + bracket generated
    // Backwards-compatible alias for advancingPerGroup × groupCount;
    // legacy v1 used a single value here. Kept so old persisted
    // snapshots still load without losing the playoff size.
    advancingTeams?: number;
  };
  // Per-match format overrides — see FormatOverrides docs for key
  // schema. When the playoff bracket is generated lazily (Swiss-/
  // groups-/round-robin-playoffs), the promotion functions read this
  // map to apply the user's per-round customizations to the new
  // matches. Undefined for legacy snapshots; treated as empty map.
  formatOverrides?: FormatOverrides;
  fearlessConfig: TournamentFearlessConfig;
  // Cross-match aggregates (populated in Phase 2).
  teamPickHistory: Record<string, number[]>;
  globalPickHistory: number[];
  defaults: TournamentDefaults;
  createdAt: number;
  updatedAt: number;
  // When a match is being played, this id points to it. The DraftApp
  // routes to the active match's series flow when set, and back to the
  // dashboard when null.
  activeMatchId: string | null;
  // Snapshot of the meta configuration at tournament creation time.
  // Saved alongside the tournament so a save/load round-trip restores
  // the AI's view of the meta. All four fields are optional so legacy
  // snapshots (only metaOverride/metaEnabled) still rehydrate cleanly:
  //   • metaOverride null → tournament was played on default tiers
  //   • metaEnabled false → AI ignored tier weighting entirely
  //   • synergyOverride null → default CHAMPION_SYNERGIES list was used
  //   • counterOverride null → default HARD_COUNTERS list was used
  metaSnapshot?: {
    metaOverride: import("./championMeta").MetaOverride | null;
    metaEnabled: boolean;
    synergyOverride?: import("./championMeta").Synergy[] | null;
    counterOverride?: import("./championMeta").CounterPair[] | null;
  };
  // Side-assignment rule applied to all series created from this tournament.
  // Omitted → "loser-blue" (default). Stored so newly-started matches
  // (and resume-from-export) use the same rule the tournament was created with.
  sideRule?: import("./series").SideRule;
  // ─── Live meta evolution (opt-in, see lib/metaEvolution.ts) ─────────
  // When true, the meta snapshot EVOLVES between rounds: after every
  // completed round the store calls evolveMetaForTournament, which
  // shifts champion tiers (±1 max per event) based on observed
  // presence + win rate and stores the result back here. All three
  // fields are optional so legacy snapshots, serialization and
  // default-created tournaments (flag absent → feature off) are
  // completely unaffected.
  liveMeta?: boolean;
  // Append-only log of tier changes produced by evolution events —
  // what moved, where, why, and after which round. Rendered by the
  // dashboard as a "patch notes" feed.
  metaEvolutionLog?: import("./metaEvolution").MetaChange[];
  // Round keys (see listCompletedRounds in lib/metaEvolution.ts) that
  // already triggered an evolution event. Guards double-processing
  // when the store re-checks after every match.
  metaEvolvedRounds?: string[];
}

// ─── Bracket seeding algorithm ────────────────────────────────────────────
//
// Standard tournament seeding for power-of-2 N. Returns the seeds in
// bracket order: adjacent pairs are round-1 matchups. For N=8:
//   [1, 8, 4, 5, 3, 6, 2, 7]
// → R1 matches: (1v8) (4v5) (3v6) (2v7)
// → R2 matches: winner(1v8) vs winner(4v5), winner(3v6) vs winner(2v7)
// → Final:     winner(R2[0]) vs winner(R2[1])

export function bracketSeedOrder(n: number): number[] {
  if (!isPowerOfTwo(n) || n < 2) {
    throw new Error(`bracketSeedOrder: n must be power of 2 ≥ 2, got ${n}`);
  }
  if (n === 2) return [1, 2];
  const half = bracketSeedOrder(n / 2);
  const out: number[] = [];
  for (const seed of half) {
    out.push(seed, n + 1 - seed);
  }
  return out;
}

function isPowerOfTwo(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

// ─── Match generation ─────────────────────────────────────────────────────

let _matchCounter = 0;
function makeMatchId(): string {
  // Deterministic enough; tournament ids are scoped under the parent
  // tournament so collisions across tournaments don't matter.
  _matchCounter++;
  return `m-${Date.now().toString(36)}-${_matchCounter.toString(36)}`;
}

export function makeTeamId(): string {
  return `t-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export function makeTournamentId(): string {
  return `tour-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

// Build the full bracket structure. Accepts any team count >= 2.
// Non-power-of-2 counts get padded with byes — top seeds are paired
// against the byes in round 1 and auto-advance directly into the
// matching round-2 slot (no real "match" generated for the bye pair).
//
// Examples:
//   • 8 teams → 4 R1 matches, 2 R2, 1 final = 7 matches
//   • 7 teams → 3 R1 matches (top seed has bye, auto-advances), 2 R2, 1 final = 6
//   • 5 teams → 1 R1 match (3 byes auto-advance), 2 R2, 1 final = 4
//   • 3 teams → 1 R1 match, 1 final (top seed has bye to final) = 2
export function generateSingleElimBracket(
  teams: TournamentTeam[],
  defaults: TournamentDefaults,
  formatOverrides?: FormatOverrides,
  // Prefix for the override key. "" for standalone single-elim,
  // "po:" when this single-elim acts as a playoff bracket. Round-N
  // matches look up `${keyPrefix}wb:${round}`.
  keyPrefix: string = "",
): TournamentMatch[] {
  const n = teams.length;
  if (n < 2) {
    throw new Error(`Single-elim requires at least 2 teams (got ${n})`);
  }
  // Pad to next power of 2 — the rest are virtual byes (null).
  const padded = nextPowerOfTwo(n);
  const totalRounds = Math.log2(padded);
  const seedOrder = bracketSeedOrder(padded);
  const bySeed = new Map<number, TournamentTeam>();
  for (const t of teams) bySeed.set(t.seed, t);

  // ─── Round 1 ────────────────────────────────────────────────────────
  // Each seedOrder[i],[i+1] pair is a potential R1 match. If either side
  // is a "bye" (seed > n), we DON'T create a match — the present seed
  // auto-advances. We track this in `r1Slots` so subsequent rounds can
  // write the team id directly into the right R2 slot.
  const allMatches: TournamentMatch[] = [];
  const roundMatches: TournamentMatch[][] = [];
  const round1: TournamentMatch[] = [];
  // For each R1 pair (i/2 index), record either the match id (real
  // match) or the auto-advancing team id (bye).
  type R1Slot =
    | { kind: "match"; matchId: string }
    | { kind: "bye"; teamId: string };
  const r1Slots: R1Slot[] = [];
  for (let i = 0; i < seedOrder.length; i += 2) {
    const seedA = seedOrder[i];
    const seedB = seedOrder[i + 1];
    const teamA = bySeed.get(seedA) ?? null;
    const teamB = bySeed.get(seedB) ?? null;
    if (teamA && teamB) {
      const m: TournamentMatch = {
        id: makeMatchId(),
        round: 1,
        blueTeamId: teamA.id,
        redTeamId: teamB.id,
        format: pickFormat(defaults, formatOverrides, `${keyPrefix}wb:1`),
        fearless: defaults.fearless,
        mode: defaults.mode,
        aiSide: defaults.aiSide,
        aiDifficulty: defaults.aiDifficulty,
        series: null,
        winner: null,
        feedsInto: null, // wired below
      };
      round1.push(m);
      r1Slots.push({ kind: "match", matchId: m.id });
    } else if (teamA || teamB) {
      // One side is a bye — the present team advances.
      const advancer = (teamA ?? teamB)!;
      r1Slots.push({ kind: "bye", teamId: advancer.id });
    } else {
      // Both sides bye — shouldn't happen with a valid seeding (we'd
      // have a smaller bracket). Defensive: skip.
      r1Slots.push({ kind: "bye", teamId: "" });
    }
  }
  roundMatches.push(round1);
  allMatches.push(...round1);

  // ─── Subsequent rounds ──────────────────────────────────────────────
  // Track each previous-round slot's resolution. For R2 we use r1Slots;
  // for R3+ we build new slots based on the previous round's matches
  // (no byes possible past R1).
  let prevSlots: R1Slot[] = r1Slots;

  for (let r = 2; r <= totalRounds; r++) {
    const thisRound: TournamentMatch[] = [];
    const thisSlots: R1Slot[] = [];
    for (let i = 0; i < prevSlots.length; i += 2) {
      const slotA = prevSlots[i];
      const slotB = prevSlots[i + 1];
      const m: TournamentMatch = {
        id: makeMatchId(),
        round: r,
        // Pre-populate slots for any bye-resolved teams; leave null
        // when the previous-round match still needs to resolve.
        blueTeamId: slotA.kind === "bye" ? slotA.teamId : null,
        redTeamId: slotB.kind === "bye" ? slotB.teamId : null,
        format: pickFormat(defaults, formatOverrides, `${keyPrefix}wb:${r}`),
        fearless: defaults.fearless,
        mode: defaults.mode,
        aiSide: defaults.aiSide,
        aiDifficulty: defaults.aiDifficulty,
        series: null,
        winner: null,
        feedsInto: null,
      };
      thisRound.push(m);
      thisSlots.push({ kind: "match", matchId: m.id });
      // Wire prev-round matches' feedsInto pointing here.
      if (slotA.kind === "match") {
        const prev = allMatches.find((x) => x.id === slotA.matchId);
        if (prev) prev.feedsInto = { matchId: m.id, slot: "blue" };
      }
      if (slotB.kind === "match") {
        const prev = allMatches.find((x) => x.id === slotB.matchId);
        if (prev) prev.feedsInto = { matchId: m.id, slot: "red" };
      }
    }
    roundMatches.push(thisRound);
    allMatches.push(...thisRound);
    prevSlots = thisSlots;
  }
  return allMatches;
}

function nextPowerOfTwo(n: number): number {
  if (n <= 1) return 1;
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

// ─── Round-robin generation ────────────────────────────────────────────────
//
// Builds the full N*(N-1)/2 match schedule for a round-robin. Uses the
// "circle method" for round-robin scheduling so matches spread evenly
// across rounds (each team plays at most once per round). For odd N a
// virtual "bye" team is inserted; teams matched against the bye in a
// round simply skip that round.
//
// Output: matches grouped by `round` (matchday). For 6 teams there are
// 5 rounds × 3 matches = 15. For 4 teams: 3 × 2 = 6. For odd N=5: 5
// rounds × 2 matches (one team gets a bye each round, no match created
// for it).

export function generateRoundRobinMatches(
  teams: TournamentTeam[],
  defaults: TournamentDefaults,
  formatOverrides?: FormatOverrides,
): TournamentMatch[] {
  if (teams.length < 2) {
    throw new Error("Round-robin needs at least 2 teams");
  }
  // Pad with a sentinel "bye" if odd count. Sentinel id is null after
  // normalization; we skip pairings against it.
  const padded: (TournamentTeam | null)[] = [...teams];
  if (padded.length % 2 === 1) padded.push(null);
  const n = padded.length;
  const totalRounds = n - 1;
  const matchesPerRound = n / 2;

  // Circle method: fix team[0], rotate the rest by one each round.
  // Round k pair (i, n-1-i) for i in 0..matchesPerRound-1, then rotate
  // padded[1..n-1] by one position.
  const rotation = padded.slice();
  const out: TournamentMatch[] = [];
  for (let round = 1; round <= totalRounds; round++) {
    for (let i = 0; i < matchesPerRound; i++) {
      const a = rotation[i];
      const b = rotation[n - 1 - i];
      if (!a || !b) continue; // bye
      // Alternate which team is "blue" each round so totals are fair.
      const isBlue = (round + i) % 2 === 0;
      const blueTeam = isBlue ? a : b;
      const redTeam = isBlue ? b : a;
      out.push({
        id: makeMatchId(),
        round,
        blueTeamId: blueTeam.id,
        redTeamId: redTeam.id,
        format: pickFormat(
          defaults,
          formatOverrides,
          `main:${round}`,
          "main",
        ),
        fearless: defaults.fearless,
        mode: defaults.mode,
        aiSide: defaults.aiSide,
        aiDifficulty: defaults.aiDifficulty,
        series: null,
        winner: null,
        // Round-robin matches don't feed anywhere — finals decided by
        // standings table.
        feedsInto: null,
      });
    }
    // Rotate (keep rotation[0] fixed; shift the rest right by 1).
    const last = rotation[n - 1];
    for (let i = n - 1; i > 1; i--) rotation[i] = rotation[i - 1];
    rotation[1] = last;
  }
  return out;
}

// ─── Groups + playoffs (Phase 4 / 5) ──────────────────────────────────
//
// Real "groups" implementation: divide the teams into N groups, run a
// round-robin within each, then promote the top-K from each group into
// a single-elim playoff bracket. Group stage matches carry a `groupId`
// (letter "A", "B", …) so the dashboard can render each group as its
// own panel.
//
// Default mapping by team count (overridable in TournamentSetup):
//   • 4 teams  → 1 group of 4, top 2 advance (degenerate but valid)
//   • 6 teams  → 2 groups of 3, top 2 advance per group (4 in playoffs)
//   • 8 teams  → 2 groups of 4, top 2 advance per group (4 in playoffs)
//   • 12 teams → 3 groups of 4, top 2 advance per group (6 in playoffs)
//   • 16 teams → 4 groups of 4, top 2 advance per group (8 in playoffs)
//   • 24 teams → 6 groups of 4, top 2 advance per group (12 in playoffs,
//                seeded into 16-bracket with 4 byes)
//   • 32 teams → 8 groups of 4, top 2 advance per group (16 in playoffs)
export function inferGroupsConfig(teamCount: number): {
  groupCount: number;
  advancingPerGroup: number;
} {
  if (teamCount <= 4) return { groupCount: 1, advancingPerGroup: 2 };
  if (teamCount <= 6) return { groupCount: 2, advancingPerGroup: 2 };
  if (teamCount <= 8) return { groupCount: 2, advancingPerGroup: 2 };
  if (teamCount <= 12) return { groupCount: 3, advancingPerGroup: 2 };
  if (teamCount <= 16) return { groupCount: 4, advancingPerGroup: 2 };
  if (teamCount <= 24) return { groupCount: 6, advancingPerGroup: 2 };
  return { groupCount: 8, advancingPerGroup: 2 };
}

// Distribute teams into groups using snake-draft seeding so groups are
// roughly balanced by seed (group A gets seed 1, group B gets seed 2,
// etc., wrapping back). Returns an array of arrays — one per group.
function partitionIntoGroups(
  teams: TournamentTeam[],
  groupCount: number,
): TournamentTeam[][] {
  const groups: TournamentTeam[][] = Array.from(
    { length: groupCount },
    () => [],
  );
  const sorted = [...teams].sort((a, b) => a.seed - b.seed);
  for (let i = 0; i < sorted.length; i++) {
    // Snake order: round 0 left-to-right, round 1 right-to-left, …
    const round = Math.floor(i / groupCount);
    const slot = i % groupCount;
    const groupIdx = round % 2 === 0 ? slot : groupCount - 1 - slot;
    groups[groupIdx].push(sorted[i]);
  }
  return groups;
}

// Group label by index — A, B, C, …. After Z (rare) wraps to A1, B1, …
function groupLabelForIndex(idx: number): string {
  if (idx < 26) return String.fromCharCode(65 + idx);
  return String.fromCharCode(65 + (idx % 26)) + Math.floor(idx / 26);
}

export function generateGroupStageMatches(
  teams: TournamentTeam[],
  cfg: { groupCount: number; advancingPerGroup: number },
  defaults: TournamentDefaults,
  formatOverrides?: FormatOverrides,
): TournamentMatch[] {
  if (cfg.groupCount < 1) {
    throw new Error("Groups+playoffs requires at least 1 group");
  }
  const groups = partitionIntoGroups(teams, cfg.groupCount);
  const out: TournamentMatch[] = [];
  for (let gi = 0; gi < groups.length; gi++) {
    const gTeams = groups[gi];
    if (gTeams.length < 2) continue;
    const groupId = groupLabelForIndex(gi);
    // Per-matchday format overrides (`main:<round>`) apply to every
    // group's matchday-N — there's only one main-stage round axis.
    const groupMatches = generateRoundRobinMatches(
      gTeams,
      defaults,
      formatOverrides,
    );
    for (const m of groupMatches) m.groupId = groupId;
    out.push(...groupMatches);
  }
  return out;
}

// ─── Double-elimination generation (Phase 4) ─────────────────────────
//
// Standard double-elim: each team must lose twice to be eliminated. The
// bracket is split into a "winners" upper bracket (the usual single-elim
// tree) and a "losers" lower bracket that catches W-side losers. The
// W-bracket champion meets the L-bracket champion in the Grand Final.
//
// Bracket reset (the L-side champion winning the first grand final
// triggering a second grand final) is intentionally deferred to a
// follow-up — v1 ships with a single grand-final match where the W-side
// champion has no advantage beyond having played fewer matches. The
// bracket UI calls this out explicitly. A later patch can introduce a
// reset match by generating it lazily once the first grand final
// resolves with the L-side winning.
//
// L-bracket structure for N=2^k teams (k>=2):
//   - L round 1: pairs the W-R1 losers (N/4 matches).
//   - For each subsequent W round r (2..k):
//     - if there are L-side queue winners that need to be brought down to
//       match the incoming W-side losers' count, a "consolidate" L round
//       runs first.
//     - then a "drop-in" L round pairs the L-side queue with the W-Rr
//       losers.
// Total L rounds = 2 * (k - 1).
//
// Restricted to powers of 2 ≥ 4. The dashboard view is verified for
// 4, 8, and 16-team layouts; sizes beyond that are mathematically
// supported but UI density may need tuning.

export function generateDoubleElimBracket(
  teams: TournamentTeam[],
  defaults: TournamentDefaults,
  formatOverrides?: FormatOverrides,
  // "" for standalone DE; "po:" when this DE is acting as the playoff
  // bracket of a *-playoffs-de tournament. Threads through to W-/L-/
  // GF override key lookups.
  keyPrefix: string = "",
): TournamentMatch[] {
  const n = teams.length;
  if (n < 4 || (n & (n - 1)) !== 0) {
    throw new Error(
      `Double-elim requires a power-of-2 team count ≥ 4 (got ${n})`,
    );
  }
  // Step 1: build the W-side bracket (re-use single-elim shape).
  const wMatches = generateSingleElimBracket(
    teams,
    defaults,
    formatOverrides,
    keyPrefix,
  );
  for (const m of wMatches) m.bracket = "winners";
  const wRoundCount = Math.log2(n);
  const wByRound: TournamentMatch[][] = [];
  for (let r = 1; r <= wRoundCount; r++) {
    wByRound.push(wMatches.filter((m) => m.round === r));
  }

  // Step 2: build the L-bracket.
  // We track the "L queue" — the list of L-side matches whose winners
  // proceed to the next L round. Each L round either CONSOLIDATES the
  // queue (pairs queue winners against each other) or DROPS-IN W-side
  // losers (pairs queue winners against W-Rr losers).
  const lMatches: TournamentMatch[] = [];
  type LQueueItem =
    // Winner of a real L-side match, identified by id.
    | { kind: "match"; matchId: string }
    // A W-side loser feeding into the L-side. Resolved at runtime via
    // losersFeedsInto on the W-side match — the L-side match's slot is
    // filled when that W-side match completes.
    | { kind: "wLoser"; wMatchId: string };

  // L-R1: drop-in W-R1 losers paired up. N/4 matches for N teams.
  // For N=4 there's only 1 match (2 W-R1 losers). For N=8 there are 2.
  let lQueue: LQueueItem[] = [];
  let lRoundIdx = 1;
  const wR1Losers = wByRound[0];
  const r1Matches: TournamentMatch[] = [];
  for (let i = 0; i < wR1Losers.length; i += 2) {
    const wA = wR1Losers[i];
    const wB = wR1Losers[i + 1];
    const m: TournamentMatch = {
      id: makeMatchId(),
      round: lRoundIdx,
      // Slot is filled when the corresponding W-side match completes.
      blueTeamId: null,
      redTeamId: null,
      format: pickFormat(
        defaults,
        formatOverrides,
        `${keyPrefix}lb:${lRoundIdx}`,
      ),
      fearless: defaults.fearless,
      mode: defaults.mode,
      aiSide: defaults.aiSide,
      aiDifficulty: defaults.aiDifficulty,
      series: null,
      winner: null,
      feedsInto: null,
      bracket: "losers",
      losersFeedsInto: undefined,
    };
    // Wire the W-side matches to drop their losers into this L match.
    wA.losersFeedsInto = { matchId: m.id, slot: "blue" };
    if (wB) wB.losersFeedsInto = { matchId: m.id, slot: "red" };
    r1Matches.push(m);
  }
  lMatches.push(...r1Matches);
  lQueue = r1Matches.map((m) => ({ kind: "match", matchId: m.id }));
  lRoundIdx++;

  // For each subsequent W round (R2..Rk), drop-in. Between drops, a
  // consolidate round if needed. The consolidate happens AFTER the drop
  // round in the standard layout (the merged queue then halves itself
  // before the next drop), except no consolidate after the very last
  // drop (the queue's winner heads straight to the grand final).
  for (let wRound = 2; wRound <= wRoundCount; wRound++) {
    const wLosers = wByRound[wRound - 1]; // 0-indexed
    // Drop-in round: pair lQueue (in order) against wLosers (in order).
    if (lQueue.length !== wLosers.length) {
      throw new Error(
        `Double-elim L-bracket alignment broken at L round ${lRoundIdx}: queue=${lQueue.length} W=${wLosers.length}`,
      );
    }
    const dropMatches: TournamentMatch[] = [];
    for (let i = 0; i < wLosers.length; i++) {
      const queueItem = lQueue[i];
      const wL = wLosers[i];
      const m: TournamentMatch = {
        id: makeMatchId(),
        round: lRoundIdx,
        blueTeamId: null,
        redTeamId: null,
        format: pickFormat(
          defaults,
          formatOverrides,
          `${keyPrefix}lb:${lRoundIdx}`,
        ),
        fearless: defaults.fearless,
        mode: defaults.mode,
        aiSide: defaults.aiSide,
        aiDifficulty: defaults.aiDifficulty,
        series: null,
        winner: null,
        feedsInto: null,
        bracket: "losers",
        losersFeedsInto: undefined,
      };
      // Wire previous-L queue winner → blue slot of this match.
      if (queueItem.kind === "match") {
        const prev = lMatches.find((x) => x.id === queueItem.matchId);
        if (prev) prev.feedsInto = { matchId: m.id, slot: "blue" };
      }
      // Wire W-side loser → red slot.
      wL.losersFeedsInto = { matchId: m.id, slot: "red" };
      dropMatches.push(m);
    }
    lMatches.push(...dropMatches);
    lQueue = dropMatches.map((m) => ({ kind: "match", matchId: m.id }));
    lRoundIdx++;

    // Consolidate round (only when queue still has > 1 entry and there
    // are more W-side rounds left to drop in). Cuts queue by half.
    if (lQueue.length > 1 && wRound < wRoundCount) {
      const consolidate: TournamentMatch[] = [];
      for (let i = 0; i < lQueue.length; i += 2) {
        const a = lQueue[i];
        const b = lQueue[i + 1];
        const m: TournamentMatch = {
          id: makeMatchId(),
          round: lRoundIdx,
          blueTeamId: null,
          redTeamId: null,
          format: pickFormat(
            defaults,
            formatOverrides,
            `${keyPrefix}lb:${lRoundIdx}`,
          ),
          fearless: defaults.fearless,
          mode: defaults.mode,
          aiSide: defaults.aiSide,
          aiDifficulty: defaults.aiDifficulty,
          series: null,
          winner: null,
          feedsInto: null,
          bracket: "losers",
          losersFeedsInto: undefined,
        };
        if (a.kind === "match") {
          const pa = lMatches.find((x) => x.id === a.matchId);
          if (pa) pa.feedsInto = { matchId: m.id, slot: "blue" };
        }
        if (b && b.kind === "match") {
          const pb = lMatches.find((x) => x.id === b.matchId);
          if (pb) pb.feedsInto = { matchId: m.id, slot: "red" };
        }
        consolidate.push(m);
      }
      lMatches.push(...consolidate);
      lQueue = consolidate.map((m) => ({ kind: "match", matchId: m.id }));
      lRoundIdx++;
    }
  }

  // After the loop, lQueue should have exactly 1 entry — the L-Final.
  if (lQueue.length !== 1) {
    throw new Error(
      `Double-elim L-bracket should resolve to a single L-Final, got ${lQueue.length}`,
    );
  }
  const lFinalItem = lQueue[0];
  const lFinalMatch =
    lFinalItem.kind === "match"
      ? lMatches.find((m) => m.id === lFinalItem.matchId) ?? null
      : null;

  // Step 3: Grand Final. W-bracket final winner vs L-bracket final winner.
  const wFinal = wMatches.find(
    (m) => m.round === wRoundCount && m.feedsInto == null,
  );
  if (!wFinal || !lFinalMatch) {
    throw new Error("Double-elim bracket assembly failed: missing finals");
  }
  const grandFinal: TournamentMatch = {
    id: makeMatchId(),
    // Cosmetic round number — placed AFTER the highest L-round so the
    // dashboard sorts it last visually.
    round: lRoundIdx,
    blueTeamId: null,
    redTeamId: null,
    format: pickFormat(defaults, formatOverrides, `${keyPrefix}gf`),
    fearless: defaults.fearless,
    mode: defaults.mode,
    aiSide: defaults.aiSide,
    aiDifficulty: defaults.aiDifficulty,
    series: null,
    winner: null,
    feedsInto: null,
    bracket: "grand-final",
    losersFeedsInto: undefined,
  };
  // W-Final winner → blue slot of grand final
  wFinal.feedsInto = { matchId: grandFinal.id, slot: "blue" };
  // L-Final winner → red slot
  lFinalMatch.feedsInto = { matchId: grandFinal.id, slot: "red" };

  return [...wMatches, ...lMatches, grandFinal];
}

// ─── Swiss generation (Phase 4) ───────────────────────────────────────
//
// Swiss rounds generate one at a time. Round 1 pairs by seed
// (1 vs N/2+1, 2 vs N/2+2, …). Each subsequent round groups teams by
// current win count, sorts within groups by SoS+seed, and pairs
// highest-with-lowest within each group, avoiding rematches when
// possible. Total rounds = ceil(log2(N)).
//
// v1 limitations: requires even N. Cross-group pairings happen only as
// fallback when a group has no valid same-group pairing left. Score-
// group merging is naive (greedy) — fine for ≤16 teams.

function generateSwissRound1(
  teams: TournamentTeam[],
  defaults: TournamentDefaults,
  formatOverrides?: FormatOverrides,
): TournamentMatch[] {
  const sorted = [...teams].sort((a, b) => a.seed - b.seed);
  const isOdd = sorted.length % 2 === 1;
  // For an odd count, the lowest-seeded team (last in sorted order)
  // receives the bye in round 1 — they are the highest seed number.
  let byeTeam: TournamentTeam | null = null;
  let active = sorted;
  if (isOdd) {
    byeTeam = sorted[sorted.length - 1];
    active = sorted.slice(0, sorted.length - 1);
  }
  const half = active.length / 2;
  const matches: TournamentMatch[] = [];
  for (let i = 0; i < half; i++) {
    const blue = active[i];
    const red = active[i + half];
    matches.push({
      id: makeMatchId(),
      round: 1,
      blueTeamId: blue.id,
      redTeamId: red.id,
      format: pickFormat(defaults, formatOverrides, "main:1", "main"),
      fearless: defaults.fearless,
      mode: defaults.mode,
      aiSide: defaults.aiSide,
      aiDifficulty: defaults.aiDifficulty,
      series: null,
      winner: null,
      feedsInto: null,
    });
  }
  if (byeTeam) {
    matches.push(makeBye(byeTeam, 1, defaults, formatOverrides));
  }
  return matches;
}

// Build a synthetic pre-resolved bye match for the given team/round.
function makeBye(
  team: TournamentTeam,
  round: number,
  defaults: TournamentDefaults,
  formatOverrides?: FormatOverrides,
): TournamentMatch {
  return {
    id: makeMatchId(),
    round,
    blueTeamId: team.id,
    redTeamId: null,
    format: pickFormat(defaults, formatOverrides, `main:${round}`, "main"),
    fearless: defaults.fearless,
    mode: defaults.mode,
    aiSide: defaults.aiSide,
    aiDifficulty: defaults.aiDifficulty,
    series: null,
    winner: { teamId: team.id, blueWins: 1, redWins: 0 },
    feedsInto: null,
    isBye: true,
  };
}

export function generateSwissBracket(
  teams: TournamentTeam[],
  defaults: TournamentDefaults,
  formatOverrides?: FormatOverrides,
  // Optional override of the auto-derived round count
  // (default ceil(log2 N)). Useful for shorter Swiss events.
  totalRoundsOverride?: number,
): { matches: TournamentMatch[]; totalRounds: number } {
  const n = teams.length;
  if (n < 4) {
    throw new Error(`Swiss requires at least 4 teams (got ${n})`);
  }
  const totalRounds =
    typeof totalRoundsOverride === "number" &&
    Number.isFinite(totalRoundsOverride) &&
    totalRoundsOverride >= 1
      ? Math.floor(totalRoundsOverride)
      : Math.ceil(Math.log2(n));
  return {
    matches: generateSwissRound1(teams, defaults, formatOverrides),
    totalRounds,
  };
}

// Compute team standings WITHOUT bracket-style advancement (Swiss has
// no bracket — purely table-driven). Wins, then strength of schedule
// (sum of opponents' wins), then seed.
export interface SwissStanding {
  team: TournamentTeam;
  played: number;
  wins: number;
  losses: number;
  // Total individual games won/lost across every match (distinct from
  // match wins). Used as a deep tiebreaker.
  gamesWon: number;
  gamesLost: number;
  // Buchholz = sum of opponents' match wins (classic Swiss tiebreaker;
  // identical to the older `sos` field — kept for clarity).
  buchholz: number;
  // Median Buchholz = Buchholz with the highest and lowest opponent
  // wins discarded. Reduces the impact of the strongest/weakest paired
  // opponent. Equal to buchholz when ≤2 opponents have been faced.
  medianBuchholz: number;
  // Backwards-compatible alias for buchholz (still used by some UI).
  sos: number;
  rank: number;
}

export function computeSwissStandings(
  tournament: TournamentState,
): SwissStanding[] {
  const wins = new Map<string, number>();
  const losses = new Map<string, number>();
  const gamesWon = new Map<string, number>();
  const gamesLost = new Map<string, number>();
  const opponents = new Map<string, string[]>();
  for (const team of tournament.teams) {
    wins.set(team.id, 0);
    losses.set(team.id, 0);
    gamesWon.set(team.id, 0);
    gamesLost.set(team.id, 0);
    opponents.set(team.id, []);
  }
  for (const m of tournament.matches) {
    if (!m.winner) continue;
    // Swiss bye: synthetic match with only the bye recipient set. Credit
    // their win without adding an opponent (no Buchholz contribution).
    if (m.isBye) {
      const byeId = m.winner.teamId;
      wins.set(byeId, (wins.get(byeId) ?? 0) + 1);
      // played count is tracked via the opponents list length; for byes
      // we push a sentinel empty string so `played` increments by 1 while
      // the Buchholz sum contribution stays 0 (wins.get("") returns 0).
      opponents.get(byeId)!.push("");
      continue;
    }
    if (!m.blueTeamId || !m.redTeamId) continue;
    const blueId = m.blueTeamId;
    const redId = m.redTeamId;
    opponents.get(blueId)!.push(redId);
    opponents.get(redId)!.push(blueId);
    gamesWon.set(blueId, (gamesWon.get(blueId) ?? 0) + m.winner.blueWins);
    gamesWon.set(redId, (gamesWon.get(redId) ?? 0) + m.winner.redWins);
    gamesLost.set(blueId, (gamesLost.get(blueId) ?? 0) + m.winner.redWins);
    gamesLost.set(redId, (gamesLost.get(redId) ?? 0) + m.winner.blueWins);
    if (m.winner.teamId === blueId) {
      wins.set(blueId, (wins.get(blueId) ?? 0) + 1);
      losses.set(redId, (losses.get(redId) ?? 0) + 1);
    } else {
      wins.set(redId, (wins.get(redId) ?? 0) + 1);
      losses.set(blueId, (losses.get(blueId) ?? 0) + 1);
    }
  }
  const out: SwissStanding[] = tournament.teams.map((team) => {
    const oppList = opponents.get(team.id) ?? [];
    const oppWins = oppList.map((oid) => wins.get(oid) ?? 0);
    const buchholz = oppWins.reduce((a, b) => a + b, 0);
    // Median Buchholz: drop highest and lowest opp-wins from sum.
    let medianBuchholz = buchholz;
    if (oppWins.length >= 3) {
      const sorted = [...oppWins].sort((a, b) => a - b);
      medianBuchholz = buchholz - sorted[0] - sorted[sorted.length - 1];
    }
    return {
      team,
      played: oppList.length,
      wins: wins.get(team.id) ?? 0,
      losses: losses.get(team.id) ?? 0,
      gamesWon: gamesWon.get(team.id) ?? 0,
      gamesLost: gamesLost.get(team.id) ?? 0,
      buchholz,
      medianBuchholz,
      sos: buchholz,
      rank: 0,
    };
  });
  out.sort((a, b) => {
    if (a.wins !== b.wins) return b.wins - a.wins;
    if (a.medianBuchholz !== b.medianBuchholz)
      return b.medianBuchholz - a.medianBuchholz;
    if (a.buchholz !== b.buchholz) return b.buchholz - a.buchholz;
    // Game differential before raw games-won so the user-visible "+/-"
    // is what's actually breaking ties.
    const aDiff = a.gamesWon - a.gamesLost;
    const bDiff = b.gamesWon - b.gamesLost;
    if (aDiff !== bDiff) return bDiff - aDiff;
    if (a.gamesWon !== b.gamesWon) return b.gamesWon - a.gamesWon;
    return a.team.seed - b.team.seed;
  });
  out.forEach((s, i) => (s.rank = i + 1));
  return out;
}

// Generate the matches for round (currentRound+1) in a Swiss tournament.
// Returns an empty array when the tournament has reached its total
// rounds (caller should mark it complete).
//
// Odd-team-count handling: when the number of teams is odd, exactly one
// team cannot be paired each round. Standard Swiss rules award that team
// an automatic bye win. The bye recipient is chosen as the lowest-ranked
// unpaired team that has NOT yet received a bye this tournament — if all
// remaining candidates have had a bye already, the lowest-ranked is picked
// again (minimises repeat byes).
function generateNextSwissRound(
  tournament: TournamentState,
  currentRound: number,
): TournamentMatch[] {
  if (
    tournament.swissTotalRounds == null ||
    currentRound >= tournament.swissTotalRounds
  ) {
    return [];
  }
  const standings = computeSwissStandings(tournament);
  const prevOpponents = new Map<string, Set<string>>();
  for (const team of tournament.teams) prevOpponents.set(team.id, new Set());
  for (const m of tournament.matches) {
    if (!m.blueTeamId || !m.redTeamId) continue;
    prevOpponents.get(m.blueTeamId)!.add(m.redTeamId);
    prevOpponents.get(m.redTeamId)!.add(m.blueTeamId);
  }

  const round = currentRound + 1;
  const isOdd = tournament.teams.length % 2 === 1;

  // Determine which teams have already received a bye so we can prefer
  // teams that haven't had one yet.
  const byeRecipients = new Set<string>();
  for (const m of tournament.matches) {
    if (m.isBye && m.winner) byeRecipients.add(m.winner.teamId);
  }

  // For odd team count: pre-select the bye recipient before greedy
  // pairing so the remaining even pool pairs cleanly.
  let byeTeam: TournamentTeam | null = null;
  if (isOdd) {
    // Walk standings bottom-to-top; pick the first team that hasn't had a
    // bye. If every team has had one, fall back to the lowest-ranked.
    for (let i = standings.length - 1; i >= 0; i--) {
      const candidate = standings[i].team;
      if (!byeRecipients.has(candidate.id)) {
        byeTeam = candidate;
        break;
      }
    }
    if (!byeTeam) {
      // All have had a bye — give it to the lowest-ranked team.
      byeTeam = standings[standings.length - 1].team;
    }
  }

  // Greedy: walk standings top to bottom, pair each unmatched team
  // with the next unmatched team they haven't played, falling back to
  // a rematch if no fresh pairing is left.
  const paired = new Set<string>();
  if (byeTeam) paired.add(byeTeam.id); // exclude bye recipient from regular pairing
  const result: TournamentMatch[] = [];

  for (let i = 0; i < standings.length; i++) {
    const a = standings[i].team;
    if (paired.has(a.id)) continue;
    let pairedB: TournamentTeam | null = null;
    for (let j = i + 1; j < standings.length; j++) {
      const b = standings[j].team;
      if (paired.has(b.id)) continue;
      if (prevOpponents.get(a.id)!.has(b.id)) continue;
      pairedB = b;
      break;
    }
    if (!pairedB) {
      for (let j = i + 1; j < standings.length; j++) {
        const b = standings[j].team;
        if (paired.has(b.id)) continue;
        pairedB = b;
        break;
      }
    }
    if (!pairedB) continue;
    paired.add(a.id);
    paired.add(pairedB.id);
    // Alternate sides each round so totals balance.
    const aIsBlue = (round + i) % 2 === 0;
    const blue = aIsBlue ? a : pairedB;
    const red = aIsBlue ? pairedB : a;
    result.push({
      id: makeMatchId(),
      round,
      blueTeamId: blue.id,
      redTeamId: red.id,
      format: pickFormat(
        tournament.defaults,
        tournament.formatOverrides,
        `main:${round}`,
        "main",
      ),
      fearless: tournament.defaults.fearless,
      mode: tournament.defaults.mode,
      aiSide: tournament.defaults.aiSide,
      aiDifficulty: tournament.defaults.aiDifficulty,
      series: null,
      winner: null,
      feedsInto: null,
    });
  }

  // Append the bye match last so it sorts with its round peers.
  if (byeTeam) {
    result.push(
      makeBye(
        byeTeam,
        round,
        tournament.defaults,
        tournament.formatOverrides,
      ),
    );
  }

  return result;
}

// ─── Standings (round-robin) ──────────────────────────────────────────────

export interface TeamStanding {
  team: TournamentTeam;
  played: number;
  wins: number;
  losses: number;
  // Total individual GAMES won across every match — distinct from
  // match-wins. A team going 3-1 in a Bo3 contributes 3 to gamesWon
  // (and 1 to gamesLost). Used as a tiebreaker for formats without a
  // final so a team that won more games is ranked higher.
  gamesWon: number;
  gamesLost: number;
  // Game-level differential — sum of (gamesWon - gamesLost) across all
  // matches. Useful as a tiebreaker after games-won.
  gameDiff: number;
  // Sort rank — 1 = top, N = bottom. Recomputed on each call.
  rank: number;
}

// Compute standings from completed matches. Teams sorted by:
//   1. Match wins (desc)
//   2. Game differential (desc) — the visible "+/-" column drives tiebreakers
//      so two 2-1 teams resolve in the order the user reads in the table
//   3. Head-to-head among ties (still applied after +/- so a team that
//      dominated easier opponents but lost the direct H2H still drops)
//   4. Total games won (desc) — splits ties when +/- is also equal
//   5. Seed (asc — top seed wins last-resort tie)
export function computeStandings(
  tournament: TournamentState,
): TeamStanding[] {
  const standings = new Map<string, TeamStanding>();
  for (const team of tournament.teams) {
    standings.set(team.id, {
      team,
      played: 0,
      wins: 0,
      losses: 0,
      gamesWon: 0,
      gamesLost: 0,
      gameDiff: 0,
      rank: 0,
    });
  }
  for (const match of tournament.matches) {
    if (!match.winner) continue;
    // Skip playoff-bracket matches — they shouldn't pollute the
    // round-robin / group-stage standings table that this function
    // produces. Playoff matches carry a `bracket` value
    // (winners/losers/grand-final). Plain RR / group / swiss-stage
    // matches leave it undefined.
    if (match.bracket !== undefined) continue;
    // Swiss bye: credit the win without a real opponent.
    if (match.isBye) {
      const byeRow = standings.get(match.winner.teamId);
      if (byeRow) {
        byeRow.played++;
        byeRow.wins++;
        byeRow.gamesWon += match.winner.blueWins;
        byeRow.gameDiff += match.winner.blueWins;
      }
      continue;
    }
    const blueId = match.blueTeamId;
    const redId = match.redTeamId;
    if (blueId == null || redId == null) continue;
    const blueRow = standings.get(blueId);
    const redRow = standings.get(redId);
    if (!blueRow || !redRow) continue;
    blueRow.played++;
    redRow.played++;
    blueRow.gamesWon += match.winner.blueWins;
    blueRow.gamesLost += match.winner.redWins;
    redRow.gamesWon += match.winner.redWins;
    redRow.gamesLost += match.winner.blueWins;
    blueRow.gameDiff += match.winner.blueWins - match.winner.redWins;
    redRow.gameDiff += match.winner.redWins - match.winner.blueWins;
    if (match.winner.teamId === blueId) {
      blueRow.wins++;
      redRow.losses++;
    } else {
      redRow.wins++;
      blueRow.losses++;
    }
  }

  // Head-to-head map: teamA→teamB→winsByA
  const h2h: Record<string, Record<string, number>> = {};
  for (const match of tournament.matches) {
    if (!match.winner) continue;
    if (match.bracket !== undefined) continue;
    const blueId = match.blueTeamId;
    const redId = match.redTeamId;
    if (blueId == null || redId == null) continue;
    const winnerId = match.winner.teamId;
    const loserId = winnerId === blueId ? redId : blueId;
    h2h[winnerId] ??= {};
    h2h[winnerId][loserId] = (h2h[winnerId][loserId] ?? 0) + 1;
  }

  const arr = [...standings.values()];
  arr.sort((a, b) => {
    if (a.wins !== b.wins) return b.wins - a.wins;
    // Game differential FIRST (the visible "+/-" column). For two 2-1
    // teams, the one with more games won AND fewer games lost (higher
    // gameDiff) ranks higher — matching what the user reads in the table.
    if (a.gameDiff !== b.gameDiff) return b.gameDiff - a.gameDiff;
    // Then head-to-head: did one beat the other directly when +/- is tied?
    const aOverB = h2h[a.team.id]?.[b.team.id] ?? 0;
    const bOverA = h2h[b.team.id]?.[a.team.id] ?? 0;
    if (aOverB !== bOverA) return bOverA - aOverB;
    if (a.gamesWon !== b.gamesWon) return b.gamesWon - a.gamesWon;
    return a.team.seed - b.team.seed;
  });
  arr.forEach((s, i) => (s.rank = i + 1));
  return arr;
}

// ─── Tournament construction ──────────────────────────────────────────────

export interface CreateTournamentParams {
  name: string;
  format: TournamentFormat;
  teams: TournamentTeam[];
  defaults: TournamentDefaults;
  fearlessConfig?: Partial<TournamentFearlessConfig>;
  reseedBetweenRounds?: boolean;
  trueGrandFinal?: boolean;
  // Per-match format overrides — see FormatOverrides docs. Optional;
  // undefined or empty means every match uses defaults.format.
  formatOverrides?: FormatOverrides;
  // Override the auto-derived Swiss round count (default: ceil(log2 N)).
  // Ignored for non-Swiss formats. Useful for shorter or longer Swiss
  // events (e.g. 5 rounds for 16 teams instead of the default 4).
  swissTotalRoundsOverride?: number;
  // Override the auto-derived advancing count for *-playoffs formats.
  // Ignored for non-*-playoffs formats.
  swissPlayoffsAdvancingOverride?: number;
  rrPlayoffsAdvancingOverride?: number;
  // Override the auto-derived groups config (groupCount × advancing).
  // Ignored for non-groups-playoffs formats.
  groupsConfigOverride?: { groupCount: number; advancingPerGroup: number };
  // Snapshot of the live meta to bundle with the tournament. The store
  // captures it from useDraftStore at creation time and passes here.
  metaSnapshot?: {
    metaOverride: import("./championMeta").MetaOverride | null;
    metaEnabled: boolean;
    synergyOverride?: import("./championMeta").Synergy[] | null;
    counterOverride?: import("./championMeta").CounterPair[] | null;
  };
  // Opt-in live meta evolution (see TournamentState.liveMeta). Omitted
  // or false → the meta snapshot stays fixed for the whole tournament,
  // exactly as before this feature existed.
  liveMeta?: boolean;
  // Side-assignment rule applied to all series in this tournament. Omitted
  // → "loser-blue" (pre-existing default behavior).
  sideRule?: import("./series").SideRule;
}

export function createTournament(
  params: CreateTournamentParams,
): TournamentState {
  // Sort teams by seed so storage order matches bracket assumptions.
  const teams = [...params.teams].sort((a, b) => a.seed - b.seed);
  let matches: TournamentMatch[];
  let swissTotalRounds: number | undefined;
  let groupsPlayoffs: TournamentState["groupsPlayoffs"] | undefined;
  const fo = params.formatOverrides;
  if (params.format === "single-elim") {
    matches = generateSingleElimBracket(teams, params.defaults, fo);
  } else if (params.format === "round-robin") {
    matches = generateRoundRobinMatches(teams, params.defaults, fo);
  } else if (params.format === "double-elim") {
    matches = generateDoubleElimBracket(teams, params.defaults, fo);
  } else if (params.format === "swiss") {
    const swiss = generateSwissBracket(
      teams,
      params.defaults,
      fo,
      params.swissTotalRoundsOverride,
    );
    matches = swiss.matches;
    swissTotalRounds = swiss.totalRounds;
  } else if (
    params.format === "swiss-playoffs" ||
    params.format === "swiss-playoffs-de"
  ) {
    const swiss = generateSwissBracket(
      teams,
      params.defaults,
      fo,
      params.swissTotalRoundsOverride,
    );
    matches = swiss.matches;
    swissTotalRounds = swiss.totalRounds;
  } else if (
    params.format === "groups-playoffs" ||
    params.format === "groups-playoffs-de"
  ) {
    // Groups+playoffs starts as a per-group round-robin stage; the
    // playoff bracket gets generated when the user freezes standings.
    const inferred = inferGroupsConfig(teams.length);
    const cfg = params.groupsConfigOverride ?? inferred;
    matches = generateGroupStageMatches(teams, cfg, params.defaults, fo);
    groupsPlayoffs = {
      groupCount: cfg.groupCount,
      advancingPerGroup: cfg.advancingPerGroup,
      playoffStarted: false,
    };
  } else if (params.format === "round-robin-playoffs") {
    // Same regular stage as plain round-robin; playoff bracket gets
    // generated when the user freezes standings (analogous to swiss-
    // playoffs / groups-playoffs flow).
    matches = generateRoundRobinMatches(teams, params.defaults, fo);
  } else {
    throw new Error(`Unsupported tournament format: ${params.format}`);
  }
  const now = Date.now();
  return {
    id: makeTournamentId(),
    name: params.name.trim() || "Untitled Tournament",
    format: params.format,
    status: "in-progress",
    teams,
    matches,
    reseedBetweenRounds: params.reseedBetweenRounds ?? false,
    trueGrandFinal: params.trueGrandFinal ?? false,
    metaSnapshot: params.metaSnapshot,
    // Only materialize the flag when ON so default tournaments
    // serialize byte-identically to pre-feature snapshots.
    ...(params.liveMeta ? { liveMeta: true } : {}),
    swissTotalRounds,
    swissPlayoffsAdvancing:
      params.format === "swiss-playoffs"
        ? params.swissPlayoffsAdvancingOverride ??
          Math.min(8, Math.max(4, Math.floor(teams.length / 2)))
        : params.format === "swiss-playoffs-de"
          ? // DE playoffs require a power-of-2 ≥ 4 advancing count, so
            // snap to the nearest power-of-2 in {4, 8, 16}. User
            // overrides also get clamped so the playoff generator
            // doesn't choke on an invalid count.
            clampToPowerOf2AtLeast4(
              params.swissPlayoffsAdvancingOverride ??
                Math.min(16, Math.max(4, Math.floor(teams.length / 2))),
            )
          : undefined,
    swissPlayoffsStarted:
      params.format === "swiss-playoffs" ||
      params.format === "swiss-playoffs-de"
        ? false
        : undefined,
    rrPlayoffsAdvancing:
      params.format === "round-robin-playoffs"
        ? clampToPowerOf2AtLeast4(
            params.rrPlayoffsAdvancingOverride ??
              Math.min(16, Math.max(4, Math.floor(teams.length / 2))),
          )
        : undefined,
    rrPlayoffsStarted:
      params.format === "round-robin-playoffs" ? false : undefined,
    groupsPlayoffs,
    formatOverrides: params.formatOverrides,
    fearlessConfig: {
      perSeries: params.fearlessConfig?.perSeries ?? true,
      perTeam: params.fearlessConfig?.perTeam ?? false,
      global: params.fearlessConfig?.global ?? false,
    },
    teamPickHistory: {},
    globalPickHistory: [],
    defaults: params.defaults,
    createdAt: now,
    updatedAt: now,
    activeMatchId: null,
    // Only materialize sideRule when explicitly set — keeps default
    // tournaments byte-identical to pre-feature snapshots.
    ...(params.sideRule ? { sideRule: params.sideRule } : {}),
  };
}

// ─── Advancement ──────────────────────────────────────────────────────────

// Mark a match as decided and propagate the winner to the next match's slot.
// Returns a NEW TournamentState — pure transformation, never mutates input.
// Also flips tournament status to "complete" if this was the final match.
export function recordMatchWinner(
  tournament: TournamentState,
  matchId: string,
  winner: { teamId: string; blueWins: number; redWins: number },
): TournamentState {
  const matches = tournament.matches.map((m) => {
    if (m.id !== matchId) return m;
    return { ...m, winner };
  });
  const finishedMatch = matches.find((m) => m.id === matchId);
  if (!finishedMatch) return tournament;
  // Advance: if the match has a feedsInto target, write the winner team
  // id into the right slot of the destination match. Round-robin matches
  // have feedsInto == null and skip this step.
  if (finishedMatch.feedsInto) {
    const destIdx = matches.findIndex(
      (m) => m.id === finishedMatch.feedsInto!.matchId,
    );
    if (destIdx >= 0) {
      const dest = matches[destIdx];
      const slotKey =
        finishedMatch.feedsInto.slot === "blue" ? "blueTeamId" : "redTeamId";
      matches[destIdx] = { ...dest, [slotKey]: winner.teamId };
    }
  }
  // Double-elim only: also propagate the LOSER to the L-bracket if the
  // finished match was a W-bracket match with a losersFeedsInto target.
  if (finishedMatch.losersFeedsInto) {
    const blueId = finishedMatch.blueTeamId;
    const redId = finishedMatch.redTeamId;
    if (blueId != null && redId != null) {
      const loserId = winner.teamId === blueId ? redId : blueId;
      const destIdx = matches.findIndex(
        (m) => m.id === finishedMatch.losersFeedsInto!.matchId,
      );
      if (destIdx >= 0) {
        const dest = matches[destIdx];
        const slotKey =
          finishedMatch.losersFeedsInto.slot === "blue"
            ? "blueTeamId"
            : "redTeamId";
        matches[destIdx] = { ...dest, [slotKey]: loserId };
      }
    }
  }
  // Tournament complete when:
  //   - single-elim: this match was the final (no feedsInto)
  //   - round-robin: every match now has a winner
  //   - double-elim: this match was the grand final
  //   - *-playoffs (SE): the playoff bracket final (the only
  //     winners-bracket match whose feedsInto is null)
  //   - *-playoffs-de / round-robin-playoffs: the grand final (or its
  //     reset) — handled by the shared double-elim branch below.
  let status: TournamentState["status"] = tournament.status;
  // Single-elim playoff brackets used by the SE-playoff variants share
  // the same shape — bracket="winners", feedsInto null on the final —
  // so the same completion check covers all of them.
  const isSEPlayoffsFinal =
    (tournament.format === "groups-playoffs" ||
      tournament.format === "swiss-playoffs") &&
    finishedMatch.bracket === "winners" &&
    !finishedMatch.feedsInto;
  // DE-playoff variants use the same grand-final / grand-final-reset
  // shape as standalone double-elim. Group them so the completion +
  // bracket-reset logic is shared (the existing double-elim branch
  // below now fires for these formats too).
  const isDEPlayoffsContext =
    tournament.format === "double-elim" ||
    tournament.format === "swiss-playoffs-de" ||
    tournament.format === "groups-playoffs-de" ||
    tournament.format === "round-robin-playoffs";
  if (tournament.format === "single-elim" && !finishedMatch.feedsInto) {
    status = "complete";
  } else if (tournament.format === "round-robin") {
    if (matches.every((m) => m.winner != null)) {
      status = "complete";
    }
  } else if (isSEPlayoffsFinal) {
    // Playoff bracket final (the only winners-bracket match in
    // groups-playoffs / swiss-playoffs whose feedsInto is null) —
    // tournament is over.
    status = "complete";
  } else if (
    tournament.format === "swiss" ||
    ((tournament.format === "swiss-playoffs" ||
      tournament.format === "swiss-playoffs-de") &&
      finishedMatch.bracket === undefined)
  ) {
    // Swiss completes when all rounds have run AND every match has a
    // winner. If the just-finished match was the last unfinished match
    // in its round, generate the next round (or mark complete).
    const round = finishedMatch.round;
    const sameRound = matches.filter(
      (m) => m.round === round && m.bracket === undefined,
    );
    if (sameRound.every((m) => m.winner != null)) {
      const total = tournament.swissTotalRounds ?? round;
      if (round >= total) {
        // For plain Swiss the tournament finishes here. For
        // swiss-playoffs / swiss-playoffs-de the user advances to the
        // playoff bracket via a separate "Generate Playoff Bracket"
        // action — leave status as in-progress.
        if (tournament.format === "swiss") {
          status = "complete";
        }
      } else {
        const nextMatches = generateNextSwissRound(
          { ...tournament, matches },
          round,
        );
        matches.push(...nextMatches);
      }
    }
  } else if (
    isDEPlayoffsContext &&
    (finishedMatch.bracket === "grand-final" ||
      finishedMatch.bracket === "grand-final-reset")
  ) {
    // Grand final: the W-side champion sits in the BLUE slot (per the
    // generator's wiring). If they win the first grand final, the
    // tournament is complete. If the L-side champion (red slot) wins,
    // standard double-elim convention is to play a second match —
    // "bracket reset" — which actually decides the tournament.
    if (finishedMatch.bracket === "grand-final-reset") {
      // Reset match always decides the tournament regardless of winner.
      status = "complete";
    } else if (tournament.trueGrandFinal) {
      // True grand-final convention: a single grand final decides
      // regardless of which bracket each team came from. No reset.
      status = "complete";
    } else {
      const wSideTeamId = finishedMatch.blueTeamId;
      if (wSideTeamId && winner.teamId === wSideTeamId) {
        // W-side won outright — done.
        status = "complete";
      } else {
        // L-side champion forced a reset. Append a new match with the
        // same teams/format/etc; the dashboard renders it as the second
        // grand final, and recording its winner completes the tournament
        // via the branch above.
        const reset: TournamentMatch = {
          id: makeMatchId(),
          round: finishedMatch.round + 1,
          blueTeamId: finishedMatch.blueTeamId,
          redTeamId: finishedMatch.redTeamId,
          format: finishedMatch.format,
          fearless: finishedMatch.fearless,
          mode: finishedMatch.mode,
          aiSide: finishedMatch.aiSide,
          aiDifficulty: finishedMatch.aiDifficulty,
          series: null,
          winner: null,
          feedsInto: null,
          bracket: "grand-final-reset",
          losersFeedsInto: undefined,
        };
        matches.push(reset);
      }
    }
  }
  // Single-elim re-seeding: when the toggle is on AND the just-finished
  // match was the LAST one in its round, re-pair the next round's slots
  // by seed. Highest remaining seed plays lowest. Skipped if there's no
  // next round (the final).
  let finalMatches = matches;
  if (
    tournament.format === "single-elim" &&
    tournament.reseedBetweenRounds &&
    finishedMatch.feedsInto
  ) {
    const round = finishedMatch.round;
    const sameRound = matches.filter(
      (m) => m.round === round && m.bracket === undefined,
    );
    const allDone = sameRound.every((m) => m.winner != null);
    if (allDone) {
      finalMatches = applySingleElimReseed(tournament, matches, round);
    }
  }
  return {
    ...tournament,
    matches: finalMatches,
    status,
    updatedAt: Date.now(),
    activeMatchId: null,
  };
}

// Re-arrange the (round+1) matches so the highest-seeded survivor of
// `round` plays the lowest-seeded, second-highest plays second-lowest,
// etc. The next round's match ids stay the same — only the slot
// assignments (blueTeamId/redTeamId) shuffle. Returns a new matches
// array with the re-pairing applied; pure transformation.
function applySingleElimReseed(
  tournament: TournamentState,
  matches: TournamentMatch[],
  round: number,
): TournamentMatch[] {
  const sameRound = matches.filter(
    (m) =>
      m.round === round && m.bracket === undefined && m.winner != null,
  );
  if (sameRound.length === 0) return matches;
  const survivors: TournamentTeam[] = [];
  for (const m of sameRound) {
    const winId = m.winner!.teamId;
    const team = tournament.teams.find((t) => t.id === winId);
    if (team) survivors.push(team);
  }
  // Sort survivors ascending by seed (1 = best).
  survivors.sort((a, b) => a.seed - b.seed);
  // Pair high-seed-vs-low-seed.
  const nextRound = matches.filter(
    (m) => m.round === round + 1 && m.bracket === undefined,
  );
  if (nextRound.length === 0) return matches;
  // Each next-round match takes [survivors[i], survivors[N-1-i]] for
  // i in 0..N/2. Survivors might be fewer than 2*nextRound.length when
  // byes were involved; defensive — if mismatched, leave alone.
  if (survivors.length !== nextRound.length * 2) return matches;
  const updated = matches.map((m) => ({ ...m }));
  for (let i = 0; i < nextRound.length; i++) {
    const blueTeam = survivors[i];
    const redTeam = survivors[survivors.length - 1 - i];
    const targetIdx = updated.findIndex((m) => m.id === nextRound[i].id);
    if (targetIdx >= 0) {
      updated[targetIdx] = {
        ...updated[targetIdx],
        blueTeamId: blueTeam.id,
        redTeamId: redTeam.id,
      };
    }
  }
  return updated;
}

// Groups+playoffs: convert the completed group stage into a single-elim
// playoff with the top-N teams seeded by group standings. The new
// playoff matches are appended to the tournament's match list with
// bracket="winners" so the dashboard renders them in a separate panel.
// Returns the updated tournament; idempotent if the playoff has already
// been generated.

// Generate the playoff bracket matches for a given top-N seeded team
// list. Branches on `kind`:
//   • single-elim — calls generateSingleElimBracket and tags each match
//     bracket="winners" so the dashboard groups them in a "Knockout"
//     panel separate from the regular stage.
//   • double-elim — calls generateDoubleElimBracket which already tags
//     matches with bracket="winners"/"losers"/"grand-final". The result
//     fits straight into the same advancement pipeline used by the
//     standalone double-elim format (recordMatchWinner already handles
//     grand-final / bracket-reset for any tournament whose finished
//     match has bracket==="grand-final").
//
// The double-elim path requires the seeded team list to be a power of 2
// ≥ 4 — caller is responsible for trimming. We don't pad with phantom
// byes here because mid-bracket byes in a DE generator are awkward
// (drop-ins from W-side don't have a clean partner). The advancing
// count UI restricts to 4 / 8 / 16 to avoid this case.
function buildPlayoffMatches(
  seededTeams: TournamentTeam[],
  defaults: TournamentDefaults,
  kind: "single-elim" | "double-elim",
  formatOverrides?: FormatOverrides,
): TournamentMatch[] {
  if (kind === "double-elim") {
    // "po:" prefix routes the override lookups to the playoff key
    // namespace (po:wb / po:lb / po:gf), distinct from any standalone
    // DE keys the user might have set elsewhere.
    return generateDoubleElimBracket(
      seededTeams,
      defaults,
      formatOverrides,
      "po:",
    );
  }
  const matches = generateSingleElimBracket(
    seededTeams,
    defaults,
    formatOverrides,
    "po:",
  );
  for (const m of matches) m.bracket = "winners";
  return matches;
}

// Swiss + playoffs: when the Swiss stage completes, promote the top-N
// teams (by Swiss standings) into a single-elim or double-elim playoff
// bracket. The playoff matches are appended with bracket fields so they
// render in their own panel. Handles both swiss-playoffs (SE) and
// swiss-playoffs-de (DE) — the latter trims top-N to the largest
// power-of-2 ≥ 4 ≤ advancing so the DE generator's preconditions hold.
export function startSwissPlayoffs(
  tournament: TournamentState,
): TournamentState {
  if (
    tournament.format !== "swiss-playoffs" &&
    tournament.format !== "swiss-playoffs-de"
  ) {
    return tournament;
  }
  if (tournament.swissPlayoffsStarted) return tournament;
  const kind = playoffBracketKindFor(tournament.format);
  let advancing = tournament.swissPlayoffsAdvancing ?? 4;
  if (kind === "double-elim") advancing = clampToPowerOf2AtLeast4(advancing);
  const standings = computeSwissStandings(tournament);
  if (standings.length < 2) return tournament;
  const top = standings.slice(0, advancing);
  if (top.length < 2) return tournament;
  if (kind === "double-elim" && !isPowerOfTwoAtLeast4(top.length)) {
    return tournament;
  }
  // Re-seed: standings rank → bracket seed.
  const reseededTeams: TournamentTeam[] = top.map((s, i) => ({
    ...s.team,
    seed: i + 1,
  }));
  const playoffMatches = buildPlayoffMatches(
    reseededTeams,
    tournament.defaults,
    kind,
    tournament.formatOverrides,
  );
  return {
    ...tournament,
    matches: [...tournament.matches, ...playoffMatches],
    swissPlayoffsStarted: true,
    updatedAt: Date.now(),
  };
}

// Round-robin + playoffs: every team plays each other once (regular
// round-robin stage), then top-N by standings advance to the playoff
// bracket. Mirrors startSwissPlayoffs for the swiss case. The user-
// facing label is "Round Robin + DE Playoffs" — there's no SE variant
// (use plain round-robin if you don't want a knockout phase, or
// single-elim if you don't need a regular stage).
export function startRoundRobinPlayoffs(
  tournament: TournamentState,
): TournamentState {
  if (tournament.format !== "round-robin-playoffs") return tournament;
  if (tournament.rrPlayoffsStarted) return tournament;
  const kind = playoffBracketKindFor(tournament.format); // always "double-elim"
  let advancing = tournament.rrPlayoffsAdvancing ?? 4;
  if (kind === "double-elim") advancing = clampToPowerOf2AtLeast4(advancing);
  const standings = computeStandings(tournament);
  if (standings.length < 2) return tournament;
  const top = standings.slice(0, advancing);
  if (top.length < 2) return tournament;
  if (kind === "double-elim" && !isPowerOfTwoAtLeast4(top.length)) {
    return tournament;
  }
  const reseededTeams: TournamentTeam[] = top.map((s, i) => ({
    ...s.team,
    seed: i + 1,
  }));
  const playoffMatches = buildPlayoffMatches(
    reseededTeams,
    tournament.defaults,
    kind,
    tournament.formatOverrides,
  );
  return {
    ...tournament,
    matches: [...tournament.matches, ...playoffMatches],
    rrPlayoffsStarted: true,
    updatedAt: Date.now(),
  };
}

// Snap an arbitrary advancing count to the largest power of 2 ≥ 4 that
// is ≤ the input. 4 → 4; 5..7 → 4; 8..15 → 8; 16+ → 16. Caps at 16
// because a 32-team DE playoff is impractically large for stage-based
// tournaments (the standalone double-elim format covers that).
function clampToPowerOf2AtLeast4(n: number): number {
  if (n < 4) return 4;
  if (n >= 16) return 16;
  if (n >= 8) return 8;
  return 4;
}

function isPowerOfTwoAtLeast4(n: number): boolean {
  return n >= 4 && (n & (n - 1)) === 0;
}

// Compute standings restricted to a single group (groups+playoffs).
// Same shape as computeStandings but only counts matches with the
// given groupId. Used both for the per-group dashboard panel and to
// seed the playoff bracket.
export function computeGroupStandings(
  tournament: TournamentState,
  groupId: string,
): TeamStanding[] {
  // Project a tournament view restricted to the group: filter matches
  // and teams to those participating in this group, then reuse
  // computeStandings.
  const groupMatches = tournament.matches.filter(
    (m) => m.groupId === groupId,
  );
  const teamIds = new Set<string>();
  for (const m of groupMatches) {
    if (m.blueTeamId) teamIds.add(m.blueTeamId);
    if (m.redTeamId) teamIds.add(m.redTeamId);
  }
  const groupTeams = tournament.teams.filter((t) => teamIds.has(t.id));
  return computeStandings({
    ...tournament,
    teams: groupTeams,
    matches: groupMatches,
  });
}

export function startGroupsPlayoffs(
  tournament: TournamentState,
): TournamentState {
  if (
    tournament.format !== "groups-playoffs" &&
    tournament.format !== "groups-playoffs-de"
  ) {
    return tournament;
  }
  if (tournament.groupsPlayoffs?.playoffStarted) return tournament;
  const cfg = tournament.groupsPlayoffs;
  if (!cfg) return tournament;
  const kind = playoffBracketKindFor(tournament.format);
  const groupCount = cfg.groupCount;
  const advancingPerGroup = cfg.advancingPerGroup;
  // For each group, take top-K. Snake-seed across groups so #1 from
  // group A meets #2 from group B (etc.) — standard pro convention.
  const advancing: TournamentTeam[] = [];
  for (let rank = 0; rank < advancingPerGroup; rank++) {
    for (let gi = 0; gi < groupCount; gi++) {
      const groupId = groupLabelForIndex(gi);
      const standings = computeGroupStandings(tournament, groupId);
      const team = standings[rank]?.team;
      if (team) advancing.push(team);
    }
  }
  if (advancing.length < 2) return tournament;
  // For DE playoffs, trim to the largest power-of-2 ≥ 4 — the DE
  // generator can't accept arbitrary counts. Trims from the bottom
  // (lowest-seeded promoted team gets bumped if needed). The setup UI
  // restricts groupCount × advancingPerGroup so this rarely fires, but
  // we belt-and-brace here because saved tournaments can have legacy
  // configs.
  let trimmed = advancing;
  if (kind === "double-elim") {
    const target = largestPowerOf2AtLeast4LessThanOrEqual(advancing.length);
    if (target < 4) return tournament;
    trimmed = advancing.slice(0, target);
  }
  // Re-seed by promotion order. Snake order above gives reasonable
  // pairings: top-of-group-A vs top-of-group-B in the final, etc.
  const reseededTeams: TournamentTeam[] = trimmed.map((t, i) => ({
    ...t,
    seed: i + 1,
  }));
  const playoffMatches = buildPlayoffMatches(
    reseededTeams,
    tournament.defaults,
    kind,
    tournament.formatOverrides,
  );
  return {
    ...tournament,
    matches: [...tournament.matches, ...playoffMatches],
    groupsPlayoffs: {
      ...cfg,
      playoffStarted: true,
    },
    updatedAt: Date.now(),
  };
}

// Largest power of 2 ≥ 4 that is ≤ n. Used to trim a top-N list down to
// a DE-bracket-friendly size when the user's group config produces
// e.g. 6 advancing teams (→ 4 spots).
function largestPowerOf2AtLeast4LessThanOrEqual(n: number): number {
  if (n < 4) return 0;
  if (n >= 16) return 16;
  if (n >= 8) return 8;
  return 4;
}

// ─── Lookups ──────────────────────────────────────────────────────────────

export function getTeam(
  tournament: TournamentState,
  teamId: string | null,
): TournamentTeam | null {
  if (teamId == null) return null;
  return tournament.teams.find((t) => t.id === teamId) ?? null;
}

export function getMatch(
  tournament: TournamentState,
  matchId: string | null,
): TournamentMatch | null {
  if (matchId == null) return null;
  return tournament.matches.find((m) => m.id === matchId) ?? null;
}

// Effective lockout for the active match — union of per-series fearless
// (from the in-progress series, if any) and cross-match fearless from
// the tournament's fearlessConfig. Callers pass this into the AI / draft
// engine instead of the bare `fearlessLockedSet(series)`.
export function effectiveLockedSet(
  tournament: TournamentState | null,
  perSeriesLocked: Set<number>,
): Set<number> {
  const out = new Set<number>(perSeriesLocked);
  if (!tournament || tournament.activeMatchId == null) return out;
  const cross = crossMatchFearlessLocked(tournament, tournament.activeMatchId);
  for (const id of cross) out.add(id);
  return out;
}

// Cross-match fearless lockout for an upcoming match. Computes the set
// of champion ids that should be considered "already used" entering
// this match, based on the tournament's fearlessConfig:
//
//   • perTeam: champion ids picked by THIS match's blue or red team in
//     prior matches of the tournament (each team carries their own pool
//     forward).
//   • global: every champion id picked by anyone in any prior match
//     (most punishing — shrinks the available pool every match).
//
// Per-series fearless is handled separately by `fearlessLockedSet` in
// lib/series.ts using the in-match game history; that's orthogonal to
// this function. Returned set is the cross-match contribution only;
// callers union it with the per-series set when needed.
export function crossMatchFearlessLocked(
  tournament: TournamentState,
  matchId: string,
): Set<number> {
  const out = new Set<number>();
  const cfg = tournament.fearlessConfig;
  if (!cfg.perTeam && !cfg.global) return out;
  const match = tournament.matches.find((m) => m.id === matchId);
  if (!match) return out;
  if (cfg.global) {
    for (const id of tournament.globalPickHistory) out.add(id);
  }
  if (cfg.perTeam) {
    if (match.blueTeamId) {
      for (const id of tournament.teamPickHistory[match.blueTeamId] ?? []) {
        out.add(id);
      }
    }
    if (match.redTeamId) {
      for (const id of tournament.teamPickHistory[match.redTeamId] ?? []) {
        out.add(id);
      }
    }
  }
  return out;
}

// Update `teamPickHistory` and `globalPickHistory` by appending all
// champion ids picked in a finished series. Used by finishMatch in the
// store to advance the cross-match aggregates.
export function appendMatchPicks(
  tournament: TournamentState,
  matchId: string,
  series: SeriesState,
): TournamentState {
  const match = tournament.matches.find((m) => m.id === matchId);
  if (!match) return tournament;
  const teamPickHistory = { ...tournament.teamPickHistory };
  const globalPickHistory = [...tournament.globalPickHistory];
  for (const game of series.games) {
    if (match.blueTeamId) {
      const arr = teamPickHistory[match.blueTeamId] ?? [];
      const next = arr.slice();
      for (const id of game.bluePicks) {
        if (id != null && !next.includes(id)) next.push(id);
      }
      teamPickHistory[match.blueTeamId] = next;
    }
    if (match.redTeamId) {
      const arr = teamPickHistory[match.redTeamId] ?? [];
      const next = arr.slice();
      for (const id of game.redPicks) {
        if (id != null && !next.includes(id)) next.push(id);
      }
      teamPickHistory[match.redTeamId] = next;
    }
    for (const id of game.bluePicks) {
      if (id != null && !globalPickHistory.includes(id)) {
        globalPickHistory.push(id);
      }
    }
    for (const id of game.redPicks) {
      if (id != null && !globalPickHistory.includes(id)) {
        globalPickHistory.push(id);
      }
    }
  }
  return { ...tournament, teamPickHistory, globalPickHistory };
}

// ─── Tournament aggregates ─────────────────────────────────────────────
// Read every completed match's per-game data to surface tournament-wide
// stats: per-champion picks / bans / win-rate, plus a high-level summary
// (matches played, total games, fearless flag, most contested champ,
// roster diversity, etc). Used by the post-tournament dashboard view.

export interface ChampionStat {
  championId: number;
  picks: number;
  bans: number;
  wins: number;
  losses: number;
  // Win rate as 0..1, or null when picks === 0.
  winRate: number | null;
}

export function computeChampionStats(
  tournament: TournamentState,
): ChampionStat[] {
  // championId → mutable stat row
  const rows = new Map<number, ChampionStat>();
  function bump(id: number, key: keyof Omit<ChampionStat, "championId" | "winRate">) {
    let r = rows.get(id);
    if (!r) {
      r = { championId: id, picks: 0, bans: 0, wins: 0, losses: 0, winRate: null };
      rows.set(id, r);
    }
    r[key] += 1;
  }
  for (const match of tournament.matches) {
    if (!match.series) continue;
    for (const game of match.series.games) {
      // Bans
      for (const id of [...game.blueBans, ...game.redBans]) {
        if (id != null) bump(id, "bans");
      }
      // Picks + win/loss attribution
      const blueWon = game.winner === "blue";
      for (const id of game.bluePicks) {
        if (id == null) continue;
        bump(id, "picks");
        if (game.winner != null) {
          bump(id, blueWon ? "wins" : "losses");
        }
      }
      for (const id of game.redPicks) {
        if (id == null) continue;
        bump(id, "picks");
        if (game.winner != null) {
          bump(id, blueWon ? "losses" : "wins");
        }
      }
    }
  }
  // Compute win rate
  for (const r of rows.values()) {
    const games = r.wins + r.losses;
    r.winRate = games > 0 ? r.wins / games : null;
  }
  return [...rows.values()].sort((a, b) => {
    // Sort: picks + bans desc (relevance), then win rate desc, then id asc
    const aPriority = a.picks + a.bans;
    const bPriority = b.picks + b.bans;
    if (aPriority !== bPriority) return bPriority - aPriority;
    const awr = a.winRate ?? -1;
    const bwr = b.winRate ?? -1;
    if (awr !== bwr) return bwr - awr;
    return a.championId - b.championId;
  });
}

// Per-champion KDA aggregate across the tournament. Sums kills, deaths,
// and assists from every game's `recap.perPickKDA` for a given champion,
// regardless of which lane they were slotted into. Used by the post-
// tournament leaderboard so the user can see who actually carried.
export interface ChampionKDAStat {
  championId: number;
  games: number;
  kills: number;
  deaths: number;
  assists: number;
  // KDA = (K + A) / max(1, D). The conventional ratio — capped at 0
  // games returns null so the UI can hide undefined champions.
  kda: number;
}

export function computeChampionKDAStats(
  tournament: TournamentState,
): ChampionKDAStat[] {
  const POSITIONAL_LANE_COUNT = 5;
  const rows = new Map<number, ChampionKDAStat>();
  function bump(
    id: number,
    k: number,
    d: number,
    a: number,
  ): void {
    let r = rows.get(id);
    if (!r) {
      r = { championId: id, games: 0, kills: 0, deaths: 0, assists: 0, kda: 0 };
      rows.set(id, r);
    }
    r.games += 1;
    r.kills += k;
    r.deaths += d;
    r.assists += a;
  }
  for (const match of tournament.matches) {
    if (!match.series) continue;
    for (const game of match.series.games) {
      if (!game.recap?.perPickKDA) continue;
      const { blue: blueKDA, red: redKDA } = game.recap.perPickKDA;
      for (let i = 0; i < POSITIONAL_LANE_COUNT; i++) {
        const blueId = game.bluePicks[i];
        const blueEntry = blueKDA[i];
        if (blueId != null && blueEntry) {
          bump(blueId, blueEntry.k, blueEntry.d, blueEntry.a);
        }
        const redId = game.redPicks[i];
        const redEntry = redKDA[i];
        if (redId != null && redEntry) {
          bump(redId, redEntry.k, redEntry.d, redEntry.a);
        }
      }
    }
  }
  // Compute KDA ratio (K + A) / D, with D clamped to 1 so a 10/0/5
  // champion shows a meaningful number rather than infinity.
  for (const r of rows.values()) {
    r.kda = (r.kills + r.assists) / Math.max(1, r.deaths);
  }
  return [...rows.values()];
}

// High-level tournament summary used by the post-tournament recap.
// Aggregates play surface area without going per-champion — that's what
// `computeChampionStats` is for. The summary is meant for the headline
// "X matches, Y games, Z champions touched" stat block and a couple of
// flavor callouts (most contested, longest series).
export interface TournamentSummary {
  totalMatches: number;
  totalGames: number;
  totalPicks: number;
  totalBans: number;
  uniqueChampionsPlayed: number;
  uniqueChampionsBanned: number;
  // Roster coverage: 0..1, fraction of total roster touched by a pick or
  // ban. Caller passes the roster size; null when not provided. Bigger
  // number = more diverse tournament. Fearless tournaments naturally
  // push this up since each team rotates picks game-to-game.
  rosterCoverage: number | null;
  // Longest series: highest game count in any single match. For Bo1 that's
  // always 1; for a Bo5 that went 3-2 it would be 5.
  longestSeriesGames: number;
  // Most contested = highest combined picks+bans. Useful "menace of the
  // tournament" callout. null when no matches have completed.
  mostContestedChampionId: number | null;
  mostContestedPresence: number;
  // Best-WR champion among those with at least 3 games played. Uses the
  // sample threshold so a 1-0 random pick doesn't appear here. null when
  // no champion meets the threshold.
  bestWRChampionId: number | null;
  bestWR: number | null;
  bestWRGames: number;
}

export function computeTournamentSummary(
  tournament: TournamentState,
  rosterSize: number | null = null,
): TournamentSummary {
  let totalMatches = 0;
  let totalGames = 0;
  let totalPicks = 0;
  let totalBans = 0;
  let longestSeriesGames = 0;
  const playedSet = new Set<number>();
  const bannedSet = new Set<number>();
  for (const match of tournament.matches) {
    if (!match.winner || !match.series) continue;
    totalMatches++;
    const games = match.series.games;
    totalGames += games.length;
    if (games.length > longestSeriesGames) longestSeriesGames = games.length;
    for (const g of games) {
      for (const id of [...g.bluePicks, ...g.redPicks]) {
        if (id != null) {
          totalPicks++;
          playedSet.add(id);
        }
      }
      for (const id of [...g.blueBans, ...g.redBans]) {
        if (id != null) {
          totalBans++;
          bannedSet.add(id);
        }
      }
    }
  }
  const stats = computeChampionStats(tournament);
  const mostContested = stats[0];
  // Best WR with ≥3 games of evidence — protects against tiny-sample noise.
  const MIN_WR_GAMES = 3;
  let bestWRChampionId: number | null = null;
  let bestWR: number | null = null;
  let bestWRGames = 0;
  for (const s of stats) {
    const games = s.wins + s.losses;
    if (games < MIN_WR_GAMES || s.winRate == null) continue;
    if (bestWR == null || s.winRate > bestWR) {
      bestWR = s.winRate;
      bestWRChampionId = s.championId;
      bestWRGames = games;
    }
  }
  const touched = new Set<number>([...playedSet, ...bannedSet]);
  const rosterCoverage =
    rosterSize && rosterSize > 0 ? touched.size / rosterSize : null;
  return {
    totalMatches,
    totalGames,
    totalPicks,
    totalBans,
    uniqueChampionsPlayed: playedSet.size,
    uniqueChampionsBanned: bannedSet.size,
    rosterCoverage,
    longestSeriesGames,
    mostContestedChampionId:
      mostContested && mostContested.picks + mostContested.bans > 0
        ? mostContested.championId
        : null,
    mostContestedPresence: mostContested
      ? mostContested.picks + mostContested.bans
      : 0,
    bestWRChampionId,
    bestWR,
    bestWRGames,
  };
}

// Per-champion attribution: for a single champion, how often each team
// picked them, won with them, lost with them, and banned them. Powers
// the post-tournament champion search panel. Returns null when the
// champion never appears in any pick or ban across the tournament.
export interface ChampionAttribution {
  championId: number;
  // Aggregate stats across the whole tournament (mirrors ChampionStat).
  totalPicks: number;
  totalBans: number;
  totalWins: number;
  totalLosses: number;
  // Per-team breakdown — one row per team that picked or banned this
  // champion. Sorted by picks desc; teams that only banned the champion
  // appear at the bottom.
  byTeam: Array<{
    teamId: string;
    picks: number;
    bans: number;
    wins: number;
    losses: number;
  }>;
}

export function computeChampionAttribution(
  tournament: TournamentState,
  championId: number,
): ChampionAttribution | null {
  type Row = {
    teamId: string;
    picks: number;
    bans: number;
    wins: number;
    losses: number;
  };
  const rows = new Map<string, Row>();
  function ensure(teamId: string): Row {
    let r = rows.get(teamId);
    if (!r) {
      r = { teamId, picks: 0, bans: 0, wins: 0, losses: 0 };
      rows.set(teamId, r);
    }
    return r;
  }
  let totalPicks = 0;
  let totalBans = 0;
  let totalWins = 0;
  let totalLosses = 0;
  for (const match of tournament.matches) {
    if (!match.series) continue;
    const blueId = match.blueTeamId;
    const redId = match.redTeamId;
    for (const game of match.series.games) {
      // Picks
      if (blueId) {
        const count = game.bluePicks.filter((id) => id === championId).length;
        if (count > 0) {
          const r = ensure(blueId);
          r.picks += count;
          totalPicks += count;
          if (game.winner != null) {
            if (game.winner === "blue") {
              r.wins += count;
              totalWins += count;
            } else {
              r.losses += count;
              totalLosses += count;
            }
          }
        }
      }
      if (redId) {
        const count = game.redPicks.filter((id) => id === championId).length;
        if (count > 0) {
          const r = ensure(redId);
          r.picks += count;
          totalPicks += count;
          if (game.winner != null) {
            if (game.winner === "red") {
              r.wins += count;
              totalWins += count;
            } else {
              r.losses += count;
              totalLosses += count;
            }
          }
        }
      }
      // Bans (the team doing the banning gets the ban credit, not the
      // team being targeted — there's no "targeted" relationship in
      // pickban data anyway).
      if (blueId) {
        const count = game.blueBans.filter((id) => id === championId).length;
        if (count > 0) {
          ensure(blueId).bans += count;
          totalBans += count;
        }
      }
      if (redId) {
        const count = game.redBans.filter((id) => id === championId).length;
        if (count > 0) {
          ensure(redId).bans += count;
          totalBans += count;
        }
      }
    }
  }
  if (rows.size === 0) return null;
  const byTeam = [...rows.values()].sort((a, b) => {
    // Picks desc primary, then bans desc, then wins desc as flavor.
    if (a.picks !== b.picks) return b.picks - a.picks;
    if (a.bans !== b.bans) return b.bans - a.bans;
    return b.wins - a.wins;
  });
  return {
    championId,
    totalPicks,
    totalBans,
    totalWins,
    totalLosses,
    byTeam,
  };
}

// For each team, compile the list of champions they played (with
// per-champion W/L). Powers the per-team breakdown panel. Sorted by
// picks desc within each team. Teams that didn't play a single match
// don't appear (defensive — every team should have at least one match
// in a real tournament).
export interface TeamChampionPick {
  championId: number;
  picks: number;
  wins: number;
  losses: number;
}
export interface TeamBreakdownEntry {
  teamId: string;
  champions: TeamChampionPick[];
}
export function computeTeamBreakdown(
  tournament: TournamentState,
): TeamBreakdownEntry[] {
  const out = new Map<string, Map<number, TeamChampionPick>>();
  function ensure(teamId: string, championId: number): TeamChampionPick {
    let inner = out.get(teamId);
    if (!inner) {
      inner = new Map();
      out.set(teamId, inner);
    }
    let r = inner.get(championId);
    if (!r) {
      r = { championId, picks: 0, wins: 0, losses: 0 };
      inner.set(championId, r);
    }
    return r;
  }
  for (const match of tournament.matches) {
    if (!match.series) continue;
    const blueId = match.blueTeamId;
    const redId = match.redTeamId;
    for (const game of match.series.games) {
      if (blueId) {
        for (const id of game.bluePicks) {
          if (id == null) continue;
          const r = ensure(blueId, id);
          r.picks++;
          if (game.winner != null) {
            if (game.winner === "blue") r.wins++;
            else r.losses++;
          }
        }
      }
      if (redId) {
        for (const id of game.redPicks) {
          if (id == null) continue;
          const r = ensure(redId, id);
          r.picks++;
          if (game.winner != null) {
            if (game.winner === "red") r.wins++;
            else r.losses++;
          }
        }
      }
    }
  }
  return [...out.entries()].map(([teamId, inner]) => ({
    teamId,
    champions: [...inner.values()].sort((a, b) => {
      if (a.picks !== b.picks) return b.picks - a.picks;
      if (a.wins !== b.wins) return b.wins - a.wins;
      return a.championId - b.championId;
    }),
  }));
}

// Per-champion live W/L inside a tournament, used by the AI to shift its
// meta evaluation based on observed performance ("the in-tournament
// meta"). Distinct from `computeChampionStats` in that it returns just
// the WR signal in a Map keyed by championId for O(1) AI lookup, and
// only counts champions that have actually played a game.
export interface TournamentChampionWREntry {
  games: number;
  wins: number;
  winRate: number;
}

export function computeTournamentChampionWR(
  tournament: TournamentState,
): Map<number, TournamentChampionWREntry> {
  const out = new Map<number, TournamentChampionWREntry>();
  function bumpGame(id: number, won: boolean) {
    const cur = out.get(id) ?? { games: 0, wins: 0, winRate: 0 };
    cur.games++;
    if (won) cur.wins++;
    cur.winRate = cur.wins / cur.games;
    out.set(id, cur);
  }
  for (const match of tournament.matches) {
    if (!match.series) continue;
    for (const game of match.series.games) {
      // Only count games with a recorded winner (skip in-progress).
      if (game.winner == null) continue;
      const blueWon = game.winner === "blue";
      for (const id of game.bluePicks) {
        if (id != null) bumpGame(id, blueWon);
      }
      for (const id of game.redPicks) {
        if (id != null) bumpGame(id, !blueWon);
      }
    }
  }
  return out;
}

// All matches grouped by round. Used by BracketView.
export function matchesByRound(
  tournament: TournamentState,
): TournamentMatch[][] {
  const totalRounds = Math.max(0, ...tournament.matches.map((m) => m.round));
  const out: TournamentMatch[][] = [];
  for (let r = 1; r <= totalRounds; r++) {
    out.push(tournament.matches.filter((m) => m.round === r));
  }
  return out;
}

// ─── Export / share code ──────────────────────────────────────────────
//
// TOUR1:base64+deflate-encoded tournament snapshot. Same pattern as the
// META1: meta codes — opaque, ~50% smaller than raw JSON, URL-safe.
// Decoders accept either raw JSON or the encoded prefix form.

const TOURNAMENT_CODE_PREFIX = "TOUR1:";

async function deflateString(input: string): Promise<Uint8Array> {
  const stream = new Blob([input])
    .stream()
    .pipeThrough(new CompressionStream("deflate-raw"));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

async function inflateString(bytes: Uint8Array): Promise<string> {
  const stream = new Blob([bytes])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return await new Response(stream).text();
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(input: string): Uint8Array {
  const sanitized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = (4 - (sanitized.length % 4)) % 4;
  const padded = sanitized + "=".repeat(padding);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export async function encodeTournament(
  tournament: TournamentState,
): Promise<string> {
  const json = JSON.stringify(tournament);
  const compressed = await deflateString(json);
  return TOURNAMENT_CODE_PREFIX + base64UrlEncode(compressed);
}

export interface ParseTournamentResult {
  tournament: TournamentState | null;
  error: string | null;
}

export async function decodeTournament(
  input: string,
): Promise<ParseTournamentResult> {
  const trimmed = input.trim();
  let json: string;
  if (trimmed.startsWith(TOURNAMENT_CODE_PREFIX)) {
    try {
      const b64 = trimmed.slice(TOURNAMENT_CODE_PREFIX.length);
      const bytes = base64UrlDecode(b64);
      json = await inflateString(bytes);
    } catch (e) {
      return {
        tournament: null,
        error: `Invalid tournament code: ${e instanceof Error ? e.message : "decode failed"}`,
      };
    }
  } else {
    json = trimmed;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    return {
      tournament: null,
      error: `Invalid JSON: ${e instanceof Error ? e.message : "parse error"}`,
    };
  }
  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { tournament: null, error: "Expected object at root" };
  }
  // Light shape validation — defensive against shape drift but we
  // trust our own exporter for full integrity.
  const t = parsed as Partial<TournamentState>;
  const validFormats: TournamentFormat[] = [
    "single-elim",
    "round-robin",
    "double-elim",
    "swiss",
    "swiss-playoffs",
    "groups-playoffs",
    "round-robin-playoffs",
    "swiss-playoffs-de",
    "groups-playoffs-de",
  ];
  if (
    typeof t.id !== "string" ||
    typeof t.name !== "string" ||
    !Array.isArray(t.teams) ||
    !Array.isArray(t.matches) ||
    !validFormats.includes(t.format as TournamentFormat)
  ) {
    return { tournament: null, error: "Tournament shape invalid" };
  }
  // Ensure every team carries a well-formed roster. Codes exported before
  // the players feature have none → synthesize a uniform roster from the
  // stored star rating (deriveStar(result) === starRating). Codes that do
  // carry rosters get normalized (capped/disjoint pools, valid tiers).
  const withRosters: TournamentState = {
    ...(parsed as TournamentState),
    teams: (t.teams as TournamentTeam[]).map((team) => ({
      ...team,
      players:
        Array.isArray(team.players) && team.players.length > 0
          ? normalizeRoster(team.players)
          : rosterFromStar(
              typeof team.starRating === "number" ? team.starRating : 3,
            ),
    })),
  };
  return { tournament: withRosters, error: null };
}

// Tournament-wide champion crowning. For single-elim: winner of the
// final match (the one with feedsInto == null). For round-robin: top of
// the standings table.
export function tournamentChampion(
  tournament: TournamentState,
): TournamentTeam | null {
  if (tournament.status !== "complete") return null;
  if (tournament.format === "single-elim") {
    const final = tournament.matches.find((m) => m.feedsInto == null);
    if (!final?.winner) return null;
    return getTeam(tournament, final.winner.teamId);
  }
  if (tournament.format === "round-robin") {
    const standings = computeStandings(tournament);
    return standings[0]?.team ?? null;
  }
  if (tournament.format === "double-elim") {
    // Reset trumps the first grand final when present — its winner
    // decides the tournament.
    const reset = tournament.matches.find(
      (m) => m.bracket === "grand-final-reset",
    );
    const decider =
      reset ?? tournament.matches.find((m) => m.bracket === "grand-final");
    if (!decider?.winner) return null;
    return getTeam(tournament, decider.winner.teamId);
  }
  if (tournament.format === "swiss") {
    const standings = computeSwissStandings(tournament);
    return standings[0]?.team ?? null;
  }
  // *-playoffs (single-elim and double-elim variants) all crown the
  // playoff-bracket champion once that bracket exists. SE playoff
  // brackets only produce bracket="winners" matches, so the final is
  // the one with feedsInto null. DE playoff brackets produce W/L/GF —
  // the decider is grand-final-reset (if forced) or grand-final.
  const isPlayoffsFormat =
    tournament.format === "swiss-playoffs" ||
    tournament.format === "swiss-playoffs-de" ||
    tournament.format === "groups-playoffs" ||
    tournament.format === "groups-playoffs-de" ||
    tournament.format === "round-robin-playoffs";
  if (isPlayoffsFormat) {
    const reset = tournament.matches.find(
      (m) => m.bracket === "grand-final-reset",
    );
    const grandFinal = tournament.matches.find(
      (m) => m.bracket === "grand-final",
    );
    const decider = reset ?? grandFinal ?? null;
    if (decider) {
      if (!decider.winner) return null;
      return getTeam(tournament, decider.winner.teamId);
    }
    // SE-playoff path: final is the bracket="winners" match with no
    // feedsInto.
    const seFinal = tournament.matches.find(
      (m) => m.bracket === "winners" && m.feedsInto == null,
    );
    if (seFinal?.winner) return getTeam(tournament, seFinal.winner.teamId);
    // No playoff bracket yet — defensive fallback to standings top.
    if (
      tournament.format === "swiss-playoffs" ||
      tournament.format === "swiss-playoffs-de"
    ) {
      return computeSwissStandings(tournament)[0]?.team ?? null;
    }
    return null;
  }
  return null;
}
