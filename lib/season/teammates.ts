import type { SeasonHistoryEntry, SeasonHistoryTeamRef } from "./history";
import type { Lane } from "../types";
import type { Trophy } from "./titlePlayground";

export interface CareerTeammate {
  id: string;
  name: string;
  lane: Lane;
  team: SeasonHistoryTeamRef;
  seasonId: string;
  phaseScope?: import("./types").SplitId | import("./types").InternationalId;
  seasons: { id: string; name: string; titles: Trophy[] }[];
  events: number;
}

/** A shared season requires both stable identities on the same event roster.
 * Multiple events or clubs in one archived season still count as one season. */
export function careerTeammates(
  entries: readonly SeasonHistoryEntry[],
  playerId: string,
): CareerTeammate[] {
  const unique = new Map<string, SeasonHistoryEntry>();
  for (const entry of entries) {
    if (!entry.complete) continue;
    if (
      !unique.has(entry.id) ||
      unique.get(entry.id)!.archivedAt < entry.archivedAt
    )
      unique.set(entry.id, entry);
  }
  const peers = new Map<string, { row: CareerTeammate; events: Set<string> }>();
  for (const entry of [...unique.values()].sort(
    (a, b) => a.archivedAt - b.archivedAt,
  )) {
    for (const phase of [...(entry.phaseRosters ?? [])].sort(
      (a, b) => a.phaseIndex - b.phaseIndex,
    )) {
      for (const team of phase.teams) {
        if (!team.players.some((p) => p.id === playerId)) continue;
        for (const player of team.players) {
          if (!player.id || player.id === playerId) continue;
          let peer = peers.get(player.id);
          if (!peer) {
            peer = {
              row: {
                id: player.id,
                name: player.name ?? player.id,
                lane: player.lane,
                team: {
                  name: team.teamName,
                  leagueId: team.leagueId,
                  logoUrl: team.logoUrl,
                  iconKey: "shield",
                  color: "#c8aa6e",
                },
                seasonId: entry.id,
                seasons: [],
                events: 0,
              },
              events: new Set(),
            };
            peers.set(player.id, peer);
          }
          peer.row.name = player.name ?? peer.row.name;
          peer.row.lane = player.lane;
          peer.row.team = {
            ...peer.row.team,
            name: team.teamName,
            leagueId: team.leagueId,
            logoUrl: team.logoUrl,
          };
          peer.row.seasonId = entry.id;
          peer.row.phaseScope = phase.split ?? phase.event;
          if (!peer.row.seasons.some((s) => s.id === entry.id))
            peer.row.seasons.push({
              id: entry.id,
              name: entry.name,
              titles: [],
            });
          const season = peer.row.seasons.find((s) => s.id === entry.id)!;
          const trophy = phase.kind === "split" ? phase.split : phase.event;
          const winner =
            phase.kind === "split" && phase.split
              ? entry.splitChampions[phase.split]?.[team.leagueId]
              : phase.event
                ? (entry.intlChampions[phase.event] ??
                  (phase.event === "worlds" ? entry.champion : undefined))
                : undefined;
          if (
            trophy &&
            winner?.name === team.teamName &&
            winner.leagueId === team.leagueId &&
            !season.titles.includes(trophy)
          )
            season.titles.push(trophy);
          peer.events.add(
            JSON.stringify([
              entry.id,
              phase.kind,
              phase.split ?? phase.event ?? phase.phaseIndex,
            ]),
          );
          peer.row.events = peer.events.size;
        }
      }
    }
  }
  return [...peers.values()]
    .map((p) => p.row)
    .sort(
      (a, b) =>
        b.seasons.length - a.seasons.length ||
        b.events - a.events ||
        a.name.localeCompare(b.name) ||
        a.id.localeCompare(b.id),
    );
}
