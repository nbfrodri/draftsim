import type { MarketInactive } from "./faMarket";
import type { Player } from "../types";
import type { SeasonTeam } from "./types";

/** Frozen main roster immediately before and after a committed market update. */
export interface MarketTeamSnapshot {
  teamId: string;
  name: string;
  leagueId: SeasonTeam["leagueId"];
  color: string;
  iconKey: string;
  logoUrl?: string;
  before: Player[];
  after: Player[];
  academyBefore?: Player[];
  academyAfter?: Player[];
}
export function captureMarketTeamSnapshots(
  before: readonly SeasonTeam[],
  after: readonly { id: string; players: readonly Player[] }[],
  ids: readonly string[],
  pools?: { before: readonly MarketInactive[]; after: readonly MarketInactive[] },
): MarketTeamSnapshot[] {
  return [...new Set(ids)].flatMap(id => {
    const old = before.find(team => team.id === id);
    const next = after.find(team => team.id === id);
    if (!old || !next) return [];
    return [{ teamId: id, name: old.name, leagueId: old.leagueId, color: old.color, iconKey: old.iconKey,
      ...(old.logoUrl ? { logoUrl: old.logoUrl } : {}),
      ...(pools ? {
        academyBefore: structuredClone(pools.before.filter(p => p.status === "academy" && p.lastTeamId === id).map(p => p.player)),
        academyAfter: structuredClone(pools.after.filter(p => p.status === "academy" && p.lastTeamId === id).map(p => p.player)),
      } : {}), before: structuredClone(old.players), after: structuredClone([...next.players]) }];
  });
}
