import type { Lane, Player, PlayerTier } from "../types";
import type { MarketInactive } from "./faMarket";
import type { SeasonState } from "./types";
import type { SimResultEntry, SimResultTeamRef } from "./simResultsSummary";

export interface LivePlayerMove {
  year: number;
  label: string;
  from: string;
  to: string;
  fromTeam?: SimResultTeamRef;
  toTeam?: SimResultTeamRef;
}
export interface LivePlayerSearchRow {
  id: string;
  name: string;
  lane: Lane;
  tier: PlayerTier;
  player?: Player;
  team?: SimResultTeamRef;
  status: string;
  moves: LivePlayerMove[];
}
export function buildLivePlayerFeed(
  entries: readonly SimResultEntry[],
): LivePlayerSearchRow[] {
  const rows = new Map<string, LivePlayerSearchRow>();
  const ensure = (
    id: string | undefined,
    name: string | undefined,
    lane: Lane,
    tier: PlayerTier,
  ) => {
    if (!id) return;
    let row = rows.get(id);
    if (!row) {
      row = {
        id,
        name: name || "Unknown player",
        lane,
        tier,
        status: "Last seen in live results",
        moves: [],
      };
      rows.set(id, row);
    }
    return row;
  };
  for (const entry of entries) {
    if (entry.kind === "split" || entry.kind === "intl") {
      const teams =
        entry.kind === "split"
          ? entry.leagues.flatMap((l) => l.placements)
          : entry.placements;
      for (const team of teams)
        for (const player of entry.rosterSnapshots?.[team.id] ?? []) {
          const row = ensure(player.id, player.name, player.lane, player.tier);
          if (row) {
            row.team = team;
            row.status = "Main roster";
            row.tier = player.tier;
          }
        }
    }
    if (entry.kind !== "roster-moves") continue;
    for (const move of entry.moves) {
      const add = (
        id: string | undefined,
        name: string | undefined,
        tier: PlayerTier,
        from: string,
        to: string,
        team: SimResultTeamRef | undefined,
        status: string,
        fromTeam?: SimResultTeamRef,
        toTeam?: SimResultTeamRef,
      ) => {
        const row = ensure(id, name, move.lane, tier);
        if (!row) return;
        row.moves.push({
          year: entry.year,
          label: entry.label,
          from,
          to,
          fromTeam,
          toTeam,
        });
        row.team = team;
        row.status = status;
        row.tier = tier;
      };
      if (!move.kind) {
        add(
          move.starId,
          move.starName,
          move.starTier,
          move.fromTeam.name,
          move.toTeam.name,
          move.toTeam,
          "Main roster",
          move.fromTeam,
          move.toTeam,
        );
        add(
          move.swapId,
          move.swapName,
          move.swapTier,
          move.toTeam.name,
          move.fromTeam.name,
          move.fromTeam,
          "Main roster",
          move.toTeam,
          move.fromTeam,
        );
      } else if (move.kind === "retire" || move.kind === "demotion") {
        const status = move.kind === "retire" ? "Retired" : "Academy";
        add(
          move.swapId,
          move.swapName,
          move.swapTier,
          move.fromTeam.name,
          status,
          move.kind === "demotion" ? move.fromTeam : undefined,
          status,
          move.fromTeam,
        );
      } else {
        add(
          move.starId,
          move.starName,
          move.starTier,
          move.kind === "callup" ? "Academy" : "Free agent",
          move.toTeam.name,
          move.toTeam,
          "Main roster",
          undefined,
          move.toTeam,
        );
        // A displaced starter's destination is reported separately; never infer a swap.
      }
    }
  }
  return [...rows.values()];
}

/** Merge only when rosters/pool change; never rescan the feed for match updates. */
export function mergeLivePlayerSearch(
  feed: readonly LivePlayerSearchRow[],
  teams: SeasonState["teams"],
  inactive: readonly MarketInactive[],
): LivePlayerSearchRow[] {
  const rows = new Map(feed.map((row) => [row.id, { ...row }]));
  const rostered = new Set<string>();
  const teamById = new Map(teams.map((team) => [team.id, team]));
  const teamByName = new Map(teams.map((team) => [team.name, team]));
  const upsert = (
    player: Player,
    team: SimResultTeamRef | undefined,
    status: string,
  ) => {
    if (!player.id) return;
    rows.set(player.id, {
      id: player.id,
      name: player.name || rows.get(player.id)?.name || "Unknown player",
      lane: player.lane,
      tier: player.tier,
      player,
      team,
      status,
      moves: rows.get(player.id)?.moves ?? [],
    });
  };
  for (const team of teams)
    for (const player of team.players) {
      if (player.id) rostered.add(player.id);
      upsert(player, team, "Main roster");
    }
  for (const entry of inactive) {
    if (entry.player.id && rostered.has(entry.player.id)) continue;
    const team =
      entry.status === "academy"
        ? (teamById.get(entry.lastTeamId) ??
          teamByName.get(entry.lastTeamName ?? ""))
        : undefined;
    upsert(
      entry.player,
      team,
      entry.status === "academy"
        ? "Academy"
        : entry.status === "retired"
          ? "Retired"
          : "Free agent",
    );
  }
  return [...rows.values()].sort(
    (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
  );
}

export function livePlayerSearch(
  entries: readonly SimResultEntry[],
  season: SeasonState | null,
): LivePlayerSearchRow[] {
  return mergeLivePlayerSearch(
    buildLivePlayerFeed(entries),
    season?.teams ?? [],
    season?.franchise?.inactivePool ?? [],
  );
}
