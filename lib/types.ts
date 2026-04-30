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
  // The single event that swung win-prob the most. Used to summarize the
  // narrative ("won behind a stolen Baron", "comeback after key shutdown").
  biggestSwing: {
    minute: number;
    side: Side;
    type: string;
    description: string;
    probDelta: number; // signed: positive = blue gained, negative = red gained
  } | null;
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
  // Only meaningful when mode === "pvai" or "aivai".
  aiDifficulty: AIDifficulty;
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
}
