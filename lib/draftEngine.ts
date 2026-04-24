import { DRAFT_ORDER, TOTAL_ACTIONS } from "./draftOrder";
import type { Champion, DraftAction, GameDraft, Lane } from "./types";

export function createGame(
  gameNumber: number,
  blueTeam: string,
  redTeam: string,
): GameDraft {
  return {
    id: `game-${gameNumber}-${Date.now()}`,
    gameNumber,
    blueTeam,
    redTeam,
    blueBans: [null, null, null, null, null],
    redBans: [null, null, null, null, null],
    bluePicks: [null, null, null, null, null],
    redPicks: [null, null, null, null, null],
    blueRoles: [null, null, null, null, null],
    redRoles: [null, null, null, null, null],
    actionIndex: 0,
    status: "drafting",
    winner: null,
  };
}

// Positional ordering used for post-draft display. Slot 0 = top, …, slot 4 = support.
export const POSITIONAL_LANES: readonly Lane[] = [
  "top",
  "jungle",
  "middle",
  "bottom",
  "support",
] as const;

// Greedy role assignment: for each pick, assign its primary lane if still
// available; fall back to any remaining lane. Null pick → null assignment.
// Assumes exactly 5 picks and 5 lanes (standard draft).
export function assignLanesToPicks(
  picks: (number | null)[],
  champions: Champion[],
): (Lane | null)[] {
  const byId = new Map(champions.map((c) => [c.id, c]));
  const available = new Set<Lane>(POSITIONAL_LANES);
  const assigned: (Lane | null)[] = [null, null, null, null, null];

  for (let i = 0; i < picks.length; i++) {
    const id = picks[i];
    if (id == null) continue;
    const champ = byId.get(id);
    if (!champ) continue;
    for (const lane of champ.lanes) {
      if (available.has(lane)) {
        assigned[i] = lane;
        available.delete(lane);
        break;
      }
    }
  }

  // Pass 2: any pick that still has no role gets the next remaining lane.
  const remaining = POSITIONAL_LANES.filter((l) => available.has(l));
  for (let i = 0; i < assigned.length; i++) {
    if (assigned[i] != null || picks[i] == null) continue;
    const next = remaining.shift();
    if (next) assigned[i] = next;
  }

  return assigned;
}

// Reorder draft-ordered picks into positional order: slot i = champion assigned
// to POSITIONAL_LANES[i]. Used when a game completes so UI can show picks in
// Top→Jungle→Mid→ADC→Support order with swap-by-champion semantics.
export function reorderPicksByPosition(
  picks: (number | null)[],
  champions: Champion[],
): (number | null)[] {
  const assigned = assignLanesToPicks(picks, champions);
  const byLane: Partial<Record<Lane, number | null>> = {};
  for (let i = 0; i < picks.length; i++) {
    const lane = assigned[i];
    if (lane && picks[i] != null) byLane[lane] = picks[i];
  }
  return POSITIONAL_LANES.map((l) => byLane[l] ?? null);
}

export function currentAction(game: GameDraft): DraftAction | null {
  if (game.actionIndex >= TOTAL_ACTIONS) return null;
  return DRAFT_ORDER[game.actionIndex];
}

export function usedChampionsInGame(game: GameDraft): Set<number> {
  const set = new Set<number>();
  for (const id of [
    ...game.blueBans,
    ...game.redBans,
    ...game.bluePicks,
    ...game.redPicks,
  ]) {
    if (id != null) set.add(id);
  }
  return set;
}

export function isChampionAvailable(
  championId: number,
  game: GameDraft,
  fearlessLocked: ReadonlySet<number>,
): boolean {
  if (fearlessLocked.has(championId)) return false;
  if (usedChampionsInGame(game).has(championId)) return false;
  return true;
}

export function applyLock(game: GameDraft, championId: number): GameDraft {
  const action = currentAction(game);
  if (!action) return game;
  const next: GameDraft = {
    ...game,
    blueBans: [...game.blueBans],
    redBans: [...game.redBans],
    bluePicks: [...game.bluePicks],
    redPicks: [...game.redPicks],
    actionIndex: game.actionIndex + 1,
  };
  if (action.kind === "ban") {
    if (action.side === "blue") next.blueBans[action.slot] = championId;
    else next.redBans[action.slot] = championId;
  } else {
    if (action.side === "blue") next.bluePicks[action.slot] = championId;
    else next.redPicks[action.slot] = championId;
  }
  if (next.actionIndex >= TOTAL_ACTIONS) {
    next.status = "complete";
  }
  return next;
}

// Swap the two champions between positional slots. Roles stay fixed in
// positional order [top, jungle, middle, bottom, support].
export function swapChampions(
  game: GameDraft,
  side: "blue" | "red",
  slotA: number,
  slotB: number,
): GameDraft {
  if (slotA === slotB) return game;
  const key = side === "blue" ? "bluePicks" : "redPicks";
  const next = { ...game, [key]: [...game[key]] } as GameDraft;
  const arr = next[key];
  [arr[slotA], arr[slotB]] = [arr[slotB], arr[slotA]];
  return next;
}

// Timer expired with no hovered champion. Bans skip; picks random-fill.
export function applyTimeout(
  game: GameDraft,
  allChampionIds: readonly number[],
  fearlessLocked: ReadonlySet<number>,
): GameDraft {
  const action = currentAction(game);
  if (!action) return game;
  if (action.kind === "ban") {
    // Skip ban: advance index, leave slot null.
    const next: GameDraft = {
      ...game,
      actionIndex: game.actionIndex + 1,
    };
    if (next.actionIndex >= TOTAL_ACTIONS) {
      next.status = "complete";
    }
    return next;
  }
  // Random available pick.
  const used = usedChampionsInGame(game);
  const pool = allChampionIds.filter(
    (id) => !used.has(id) && !fearlessLocked.has(id),
  );
  if (pool.length === 0) return game;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  return applyLock(game, pick);
}
