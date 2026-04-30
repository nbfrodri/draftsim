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
  status: "drafting" | "between-games" | "complete";
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
}

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
}
