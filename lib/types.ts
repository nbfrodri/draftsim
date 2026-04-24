export type Side = "blue" | "red";
export type ActionKind = "ban" | "pick";
export type SeriesFormat = "bo1" | "bo3" | "bo5";
export type Lane = "top" | "jungle" | "middle" | "bottom" | "support";

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
}

export interface SimulationSettings {
  format: SeriesFormat;
  fearless: boolean;
  timerEnabled: boolean;
  blueTeam: string;
  redTeam: string;
}
