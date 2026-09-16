import type { SeasonHistoryEntry } from "./history";
import type { Lane } from "../types";

export interface ChampionPlayerRecord {
  id: string;
  name: string;
  lane?: Lane;
  seasonId: string;
  games: number;
  wins: number;
  losses: number;
}
export interface ChampionRecord {
  championId: number;
  games: number;
  wins: number;
  losses: number;
  players: ChampionPlayerRecord[];
}

/** Aggregate archived picks, scoped to one Hall source. Re-archived years replace older copies. */
export function championRecords(entries: readonly SeasonHistoryEntry[]) {
  const unique = new Map<string, SeasonHistoryEntry>();
  for (const e of entries)
    if (
      e.complete &&
      (!unique.has(e.id) || unique.get(e.id)!.archivedAt < e.archivedAt)
    )
      unique.set(e.id, e);
  const byChampion = new Map<number, Map<string, ChampionPlayerRecord>>();
  let incompleteSeasons = 0;
  for (const entry of [...unique.values()].sort(
    (a, b) => b.archivedAt - a.archivedAt,
  )) {
    const lanes = new Map<string, Lane>();
    for (const phase of [...(entry.phaseRosters ?? [])].sort(
      (a, b) => a.phaseIndex - b.phaseIndex,
    ))
      for (const team of phase.teams)
        for (const player of team.players)
          if (player.id) lanes.set(player.id, player.lane);
    let incomplete = !entry.playerCareers?.length;
    const seenPlayers = new Set<string>();
    for (const player of entry.playerCareers ?? []) {
      if (!player.playerId || seenPlayers.has(player.playerId)) continue;
      seenPlayers.add(player.playerId);
      if (
        !player.champs ||
        player.champs.reduce((sum, c) => sum + c.games, 0) < player.games
      )
        incomplete = true;
      for (const champ of player.champs ?? []) {
        if (champ.games <= 0) continue;
        let players = byChampion.get(champ.championId);
        if (!players) {
          players = new Map();
          byChampion.set(champ.championId, players);
        }
        let row = players.get(player.playerId);
        if (!row) {
          row = {
            id: player.playerId,
            name: player.playerName,
            lane: player.lane ?? lanes.get(player.playerId),
            seasonId: entry.id,
            games: 0,
            wins: 0,
            losses: 0,
          };
          players.set(player.playerId, row);
        }
        row.games += champ.games;
        row.wins += champ.wins;
        row.losses += Math.max(0, champ.games - champ.wins);
      }
    }
    if (incomplete) incompleteSeasons++;
  }
  const rows: ChampionRecord[] = [...byChampion]
    .map(([championId, byPlayer]) => {
      const players = [...byPlayer.values()].sort(
        (a, b) =>
          b.games - a.games ||
          b.wins - a.wins ||
          a.name.localeCompare(b.name) ||
          a.id.localeCompare(b.id),
      );
      return {
        championId,
        players,
        games: players.reduce((s, p) => s + p.games, 0),
        wins: players.reduce((s, p) => s + p.wins, 0),
        losses: players.reduce((s, p) => s + p.losses, 0),
      };
    })
    .sort(
      (a, b) =>
        b.games - a.games || b.wins - a.wins || a.championId - b.championId,
    );
  return { rows, incompleteSeasons, seasons: unique.size };
}
