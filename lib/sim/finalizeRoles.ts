import {
  POSITIONAL_LANES,
  reorderPicksByPosition,
} from "@/lib/draftEngine";
import { optimizeRoleAssignment } from "@/lib/draftAI/roleAssign";
import {
  difficultyForSide,
} from "@/lib/series";
import type { Champion, GameDraft, SeriesState, Side } from "@/lib/types";

function isAISide(series: SeriesState, side: Side): boolean {
  if (series.mode === "aivai") return true;
  if (series.mode === "pvai") return series.aiSide === side;
  return false;
}

function positionalPicksForSide(
  picks: (number | null)[],
  champions: Champion[],
  series: SeriesState | undefined,
  side: Side,
): (number | null)[] {
  if (
    series &&
    isAISide(series, side) &&
    difficultyForSide(series, side) !== "easy"
  ) {
    const roster = side === "blue" ? series.bluePlayers : series.redPlayers;
    return optimizeRoleAssignment(picks, champions, roster);
  }
  return reorderPicksByPosition(picks, champions);
}

export function finalizeRoles(
  game: GameDraft,
  champions: Champion[],
  series?: SeriesState,
): GameDraft {
  if (game.status !== "complete") return game;
  return {
    ...game,
    bluePicks: positionalPicksForSide(game.bluePicks, champions, series, "blue"),
    redPicks: positionalPicksForSide(game.redPicks, champions, series, "red"),
    blueRoles: [...POSITIONAL_LANES],
    redRoles: [...POSITIONAL_LANES],
  };
}
