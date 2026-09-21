import type { GameDraft } from "./types";
import { LANES } from "./lanes";

/** Use the game side and positional recap lane, never series-level team order. */
export function replayPentakills(game: GameDraft) {
  return (game.recap?.pentakills ?? []).map(penta => {
    const picks = penta.side === "blue" ? game.bluePicks : game.redPicks;
    const roles = penta.side === "blue" ? game.blueRoles : game.redRoles;
    const index = picks.indexOf(penta.championId);
    const lane = penta.lane ?? (index >= 0 ? roles?.[index] ?? LANES[index]?.key : undefined);
    // Recap names/IDs are in lane order, even when the draft picks are not.
    const laneIndex = LANES.findIndex(entry => entry.key === lane);
    return {
      ...penta, lane,
      playerName: laneIndex >= 0 ? game.recap?.perPickNames?.[penta.side]?.[laneIndex] : undefined,
      playerId: laneIndex >= 0 ? game.recap?.perPickIds?.[penta.side]?.[laneIndex] : undefined,
    };
  });
}

/** Repeated pentas by the same participant share one badge within a game. */
export function groupedReplayPentakills(game: GameDraft) {
  const groups = new Map<string, ReturnType<typeof replayPentakills>[number] & { count: number }>();
  for (const penta of replayPentakills(game)) {
    // Side and lane keep unnamed legacy players and opponents distinct.
    const key = JSON.stringify([penta.side, penta.playerId ?? null, penta.lane ?? null, penta.championId]);
    const group = groups.get(key);
    if (group) group.count++;
    else groups.set(key, { ...penta, count: 1 });
  }
  return [...groups.values()];
}
