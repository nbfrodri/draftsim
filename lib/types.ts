import type { TeamStrategy } from "./sim/strategies";

export type Side = "blue" | "red";
export type ActionKind = "ban" | "pick";
export type SeriesFormat = "bo1" | "bo3" | "bo5";
export type Lane = "top" | "jungle" | "middle" | "bottom" | "support";

// Draft mode controls which sides are AI-driven.
//   pvp   — both sides human (default, original behavior)
//   pvai  — one side human, one side AI (specified by aiSide)
//   aivai — both sides AI; user just watches the draft unfold
export type DraftMode = "pvp" | "pvai" | "aivai";

// AI strength. Modulates sampling temperature and which optional scoring
// stages run. Easy is intentionally beatable; Hard plays close to optimal.
//   easy   — wide top-5 sampling, no lookahead/anticipation, no identity
//   normal — current default (top-3, full feature set)
//   hard   — tight top-3 with low temp, full features, near-deterministic
export type AIDifficulty = "easy" | "normal" | "hard";

export interface Champion {
  id: number;
  name: string;
  alias: string;
  roles: string[];
  iconUrl: string;
  lanes: Lane[];
}

// ─── Player identities ───────────────────────────────────────────────────────
// Each team fields 5 players, one per lane. A player's identity — lane, skill
// tier, and champion pools — is fixed for the life of a series, and in
// tournament mode persists across every match. A team's star rating is DERIVED
// from its roster (see `deriveStar` in lib/players.ts), not stored separately.
export type PlayerTier = "S" | "A" | "B" | "C" | "D";

export interface Player {
  // Stable, permanent identity — survives transfers AND seasons, so a player's
  // career (awards, teams, titles) can be followed across a franchise timeline.
  // Optional: legacy/one-off rosters may lack it; assign on load when missing.
  id?: string;
  // In-game handle (e.g. "Faker"). Cosmetic identity that travels with the
  // player through transfers. Optional — absent on legacy/manually-built
  // rosters, which simply render by lane. Real handles where available, a
  // generated one otherwise.
  name?: string;
  // Age in years. Drives between-season growth (young) and decline (veteran)
  // and eventual retirement in franchise mode. Optional — only stamped on
  // franchise/reality rosters; one-off seasons leave it unset.
  age?: number;
  // Hidden ceiling tier a player can grow toward while young; once reached,
  // age + performance govern whether they hold it or decline. Optional, like
  // age. Defaults to the current tier when absent (no headroom).
  potential?: PlayerTier;
  // The league (region) the player is native to — set at creation, fixed.
  // Used to decide the language-barrier penalty on cross-region transfers.
  homeRegion?: string;
  // How settled the player is in their CURRENT team's region, 0..1. 1 = native
  // or fully acclimated; a fresh cross-region import starts low and climbs each
  // split/offseason. `(1 − acclimation)` is the language-barrier penalty applied
  // to lane performance and transfer value. Absent ⇒ treated as 1 (no penalty).
  acclimation?: number;
  // Position the player occupies. Fixed identity — a player tagged `top`
  // always drafts for top.
  lane: Lane;
  // Skill tier in their lane. Fixed identity. Feeds the derived team star
  // (macro) and a per-lane performance bias (micro) in the simulator.
  tier: PlayerTier;
  // Up to 3 champions this player plays well — a bonus when they end up on
  // one of these. Champion ids.
  goodChamps: number[];
  // Up to 3 champions this player plays badly — a penalty. Disjoint from
  // goodChamps. Champion ids.
  badChamps: number[];
}

// Exactly 5 players in positional lane order [top, jungle, middle, bottom,
// support] so a roster lines up 1:1 with blueRoles/redRoles pick slots.
export type Roster = Player[];

export interface DraftAction {
  index: number;
  kind: ActionKind;
  side: Side;
  slot: number;
}

// Compact match summary persisted on a GameDraft after a simulated game
// resolves. Extracts just what the series recap needs (MVP and biggest
// swing event) so we don't have to retain the full event timeline — that
// would bloat state across long series.
export interface GameRecap {
  // Match length in minutes, used for "5-min ace" / "long-game grind"
  // flavor in the recap copy.
  durationMinutes: number;
  mvp: {
    side: Side;
    lane: Lane;
    championId: number;
    kills: number;
    deaths: number;
    assists: number;
    laneGoldDiff: number; // signed from this player's perspective
    playerName?: string; // roster handle, when known at sim time
    playerId?: string; // stable player id, for career aggregation
  } | null;
  // Per-lane gold differential at the end of the game, signed from
  // BLUE's perspective (positive = blue ahead in that lane). Optional
  // because legacy persisted recaps may not have it. Powers the
  // post-tournament replay panel's gold-diff readout per pick.
  laneGoldDiff?: Partial<Record<Lane, number>>;
  // The single event that swung win-prob the most. Used to summarize the
  // narrative ("won behind a stolen Baron", "comeback after key shutdown").
  biggestSwing: {
    minute: number;
    side: Side;
    type: string;
    description: string;
    probDelta: number; // signed: positive = blue gained, negative = red gained
  } | null;
  // Sparse blue-side win-probability snapshots through the game. Each
  // entry is one event's post-event probability; consumers can render a
  // step chart by drawing line segments between consecutive points.
  // Optional because legacy recaps don't carry it.
  winProbTimeline?: Array<{
    minute: number;
    blueProb: number; // 0..1
  }>;
  // Sparse team gold-lead snapshots through the game. Signed from blue's
  // perspective (positive = blue ahead in total team gold). One entry per
  // event; consumers render a line chart. Optional / legacy-safe.
  goldLeadTimeline?: Array<{
    minute: number;
    goldLead: number; // signed integer, blue-positive
  }>;
  // Compact event log: just enough to mark notable moments on the chart
  // (kills, dragons, barons, towers, etc). Optional / legacy-safe.
  notableEvents?: Array<{
    minute: number;
    side: Side;
    type: string;
    description: string;
    probDelta: number; // signed change at this event
  }>;
  // Per-pick KDA at game end. 5 entries blue + 5 entries red, indexed by
  // positional lane (top, jungle, middle, bottom, support). Used to
  // render damage-dealt bars in the replay (synthesized from KDA +
  // champion archetype). Optional / legacy-safe.
  perPickKDA?: {
    blue: Array<{ k: number; d: number; a: number }>;
    red: Array<{ k: number; d: number; a: number }>;
  };
  // Per-pick roster handles, 5 per side indexed by positional lane like
  // perPickKDA. Filled when the rosters are known at sim time; lets the
  // scoreboard / replay / MVP card show who played each pick without
  // re-threading rosters. Optional / legacy-safe.
  perPickNames?: {
    blue: Array<string | null>;
    red: Array<string | null>;
  };
  // Per-pick stable player ids, parallel to perPickNames. Lets season/career
  // stats credit the exact player. Optional / legacy-safe.
  perPickIds?: {
    blue: Array<string | null>;
    red: Array<string | null>;
  };
  // Per-pick performance ratings on a 1-10 scale (one decimal), 5 entries
  // per side indexed by positional lane like perPickKDA. Blends KDA quality,
  // lane gold outcome, kill involvement and win/loss — see computeGameRatings
  // in lib/matchSimulator.ts. Optional / legacy-safe: recaps persisted before
  // this feature lack it; the UI can recompute via computeGameRatings.
  ratings?: {
    blue: number[];
    red: number[];
  };
  // Pentakills in this game — a single champion solo-acing the enemy team.
  // Rare. Each entry names the champion + the team that scored it, so a
  // season can aggregate them into a pentakill leaderboard. Optional / legacy.
  pentakills?: Array<{
    minute: number;
    side: Side;
    championId: number;
    championName: string;
    teamName: string;
    // Lane the solo-ace came from. Optional: recaps persisted before this
    // existed lack it (the board falls back to no lane tag).
    lane?: Lane;
  }>;
}

export interface GameDraft {
  id: string;
  gameNumber: number;
  blueTeam: string;
  redTeam: string;
  blueBans: (number | null)[];
  redBans: (number | null)[];
  bluePicks: (number | null)[];
  redPicks: (number | null)[];
  // Role assigned to each pick slot (length 5). Null until draft completes,
  // then auto-assigned from champion lane data. User can swap after.
  blueRoles: (Lane | null)[];
  redRoles: (Lane | null)[];
  actionIndex: number;
  status: "drafting" | "complete";
  winner: Side | null;
  // Game plan each team commits to after the draft and before the match
  // simulates (chosen on the StrategyView). Optional / legacy-safe: when
  // absent, the simulator falls back to a neutral DEFAULT_STRATEGY so older
  // persisted games (and any caller that skips the strategy step) behave
  // exactly as before. Affects the simulation — see lib/sim/strategies.ts.
  blueStrategy?: TeamStrategy;
  redStrategy?: TeamStrategy;
  // Optional simulation summary, populated when the user resolves a game
  // via Apply Simulation. Manual winner declarations leave it null. The
  // series recap reads this to synthesize per-game storylines.
  recap?: GameRecap;
}

export interface SeriesState {
  id: string;
  format: SeriesFormat;
  fearless: boolean;
  timerEnabled: boolean;
  blueTeam: string;
  redTeam: string;
  games: GameDraft[];
  // "strategy" sits between "drafting" and "between-games": the draft is
  // locked and each team is choosing its game plan (StrategyView). On
  // confirm the status advances to "between-games" and the chosen plans are
  // written onto the current GameDraft.
  status: "drafting" | "strategy" | "between-games" | "complete";
  winner: Side | null;
  mode: DraftMode;
  // Only meaningful when mode === "pvai"; null otherwise. The AI controls
  // every action whose `side` matches this value.
  aiSide: Side | null;
  // Default AI difficulty. Used when only one AI participates (pvai),
  // and as a fallback when per-side overrides aren't set.
  aiDifficulty: AIDifficulty;
  // Per-side difficulty overrides — meaningful when mode === "aivai" so
  // each AI can have its own strength (e.g. blue Hard vs red Easy as a
  // handicap match). When undefined, falls back to `aiDifficulty`.
  // Defined as optional so legacy state without these fields still
  // works (default behavior = both sides use aiDifficulty).
  blueAiDifficulty?: AIDifficulty;
  redAiDifficulty?: AIDifficulty;
  // Per-team star rating from tournament context (1..5). Only set when
  // this series is a tournament match — populated by the store's
  // `startMatch`. The simulator turns the (blue - red) diff into a
  // sigmoid bias on the team-score so higher-rated rosters win more
  // often. Undefined in stand-alone series (no bias applied).
  blueStarRating?: number;
  redStarRating?: number;
  // Tournament momentum & round context. Populated when the series is
  // created from a tournament match. Used by starRatingBias to layer
  // win-streak rewards (teams on a roll get a small score-bias bump)
  // and underdog protection in semis/finals (low-rated teams that
  // reached late rounds get a counter-bias against higher-rated
  // opponents — they're not chalk anymore, the bracket says so).
  // Undefined for stand-alone series and for round-1 tournament matches
  // (no streak yet, no late-round bracket).
  blueWinStreak?: number;
  redWinStreak?: number;
  // Round-depth tag: "early" | "quarterfinal" | "semifinal" | "final".
  // The latter two enable underdog protection. Undefined outside
  // tournaments.
  tournamentRound?: "early" | "quarterfinal" | "semifinal" | "final";
  // Season-realism modifiers, populated from the season's per-team state
  // when the matching feature is enabled (see lib/season). All optional —
  // undefined leaves starRatingBias byte-identical to the classic model.
  //   form   — signed hot/cold strength delta in [-1, 1] (regresses to 0)
  //   clutch — stable elimination-round tilt in [-1, 1]; presence also
  //            enables within-series momentum (the series leader gets a
  //            small per-game-lead bump).
  blueForm?: number;
  redForm?: number;
  blueClutch?: number;
  redClutch?: number;
  // Per-team player rosters (5 players each, positional lane order). Carry
  // the player identities for the life of the series so the simulator and
  // AI can apply per-lane tier and champion-pool effects. Optional /
  // legacy-safe: undefined for series created before this feature, and for
  // single series where the user didn't configure rosters. The team's star
  // rating derives from this roster (see deriveStar in lib/players.ts).
  bluePlayers?: Roster;
  redPlayers?: Roster;
  // Draft personality id for the blue/red AI (see lib/draftAI/personalities.ts).
  // These follow the TEAM (not side) across mid-series side swaps so each
  // team always uses its own personality regardless of which side it's on.
  // Undefined → 'balanced' (exact historical behavior).
  bluePersonalityId?: string;
  redPersonalityId?: string;
  // Match-variance intensity from the season config (see VariancePreset).
  // Drives deciding-game coin-flippiness, favorites choking under
  // elimination, and chalky↔chaotic scaling of the star bias in
  // starRatingBias. Undefined ⇒ classic model (no variance effects).
  variancePreset?: VariancePreset;
}

// Match-variance intensity. A single dial over how often the better team
// actually wins: "chalky" sharpens the favorite's edge, "chaotic" flattens
// it (more upsets), "balanced" is the gentle middle. See SeasonConfig and
// starRatingBias (lib/series.ts).
export type VariancePreset = "chalky" | "balanced" | "chaotic";

export interface SimulationSettings {
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
  // Optional player rosters for single-series mode. When set, the team's
  // star rating derives from the roster and the macro win bias applies.
  bluePlayers?: Roster;
  redPlayers?: Roster;
  // Side-assignment rule for games 2+ of a Bo3/Bo5. Omitted → "loser-blue".
  sideRule?: import("./series").SideRule;
  // Draft personality ids for the blue/red AI. Omitted → 'balanced'.
  bluePersonalityId?: string;
  redPersonalityId?: string;
}
