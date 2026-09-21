import type { Champion, Lane, Side } from "./types";
import type { TournamentTeam } from "./tournament";
import { LANES } from "./lanes";

export type MatchTeam = Pick<TournamentTeam, "name" | "logoUrl" | "iconKey" | "color"> & Partial<Pick<TournamentTeam, "id" | "leagueId" | "players">>;
export interface MatchParticipant { side: Side; lane: Lane; championName?: string; name?: string; id?: string; }
export interface MatchPresentation { teams: Record<Side, MatchTeam>; players: MatchParticipant[]; }
export function buildMatchPresentation(teams: Record<Side, MatchTeam>, byId: Map<number, Champion>, data: Record<Side, {
  picks: (number | null)[]; roles?: (Lane | null)[]; names?: (string | null)[]; ids?: (string | null)[];
}>): MatchPresentation {
  const players: MatchParticipant[] = [];
  for (const side of ["blue", "red"] as const) {
    data[side].picks.forEach((id, i) => {
      const lane = data[side].roles?.[i] ?? LANES[i]?.key;
      if (!lane) return;
      const roster = teams[side].players?.find(p => p.lane === lane);
      const recordedId = data[side].ids?.[i];
      const recordedName = data[side].names?.[i];
      const compatibleRoster = (recordedId ? roster?.id === recordedId : recordedName ? roster?.name === recordedName : true) ? roster : undefined;
      players.push({ side, lane, championName: id != null ? byId.get(id)?.name : undefined,
        name: data[side].names?.[i] ?? compatibleRoster?.name,
        id: recordedId ?? compatibleRoster?.id });
    });
  }
  return { teams, players };
}
/** Only unambiguous complete names are eligible for inline substitution. */
export function participantAliases(players: MatchParticipant[]) {
  const aliases = new Map<string, MatchParticipant>();
  const ambiguous = new Set<string>();
  for (const player of players) for (const name of [player.championName, player.name]) {
    if (!name || !player.name) continue;
    if (aliases.has(name) && aliases.get(name) !== player) ambiguous.add(name);
    else aliases.set(name, player);
  }
  for (const name of ambiguous) aliases.delete(name);
  return aliases;
}
