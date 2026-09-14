import type { SeasonHistoryEntry, SeasonHistoryTeamRef } from "./history";
import {
  INTERNATIONAL_DISPLAY_ORDER,
  type InternationalId,
  type LeagueId,
  type SplitId,
} from "./types";
import type { Lane } from "../types";

export type Trophy = SplitId | InternationalId;
export const TROPHIES: readonly Trophy[] = [
  "winter",
  "spring",
  "summer",
  ...INTERNATIONAL_DISPLAY_ORDER,
];
export const TROPHY_LABELS: Record<Trophy, string> = {
  winter: "Winter",
  spring: "Spring",
  summer: "Summer",
  "first-stand": "First Stand",
  msi: "MSI",
  worlds: "Worlds",
  "global-cup": "Global Cup",
};
export const TROPHY_COLORS: Record<Trophy, string> = {
  winter: "#79bbdf",
  spring: "#7fc9a2",
  summer: "#e6ab65",
  "first-stand": "#b7a0e5",
  msi: "#e88399",
  worlds: "#e0c477",
  "global-cup": "#65d5ce",
};
export interface TitleEntity {
  id: string;
  name: string;
  team: SeasonHistoryTeamRef;
  lane?: Lane;
}
interface Appearance {
  entity: TitleEntity;
  year: number;
  region: LeagueId;
  trophy: Trophy;
}
export interface TitleAward {
  id: string;
  year: number;
  seasonName: string;
  trophy: Trophy;
  team: SeasonHistoryTeamRef;
  players: TitleEntity[];
  missingRoster: boolean;
}
export interface TitleDataset {
  years: number[];
  awards: TitleAward[];
  teams: Appearance[];
  players: Appearance[];
  inferredYears: boolean;
}
export interface TitleFilters {
  mode: "teams" | "players";
  position?: Lane;
  regions: readonly LeagueId[];
  trophies: readonly Trophy[];
  from: number;
  to: number;
}
export interface TitleRow extends TitleEntity {
  total: number;
  counts: Record<Trophy, number>;
  awards: TitleAward[];
  regions: LeagueId[];
  yearly: { year: number; total: number }[];
}
const CALENDAR_ORDER: readonly Trophy[] = [
  "winter",
  "first-stand",
  "spring",
  "msi",
  "summer",
  "worlds",
  "global-cup",
];
const teamKey = (team: SeasonHistoryTeamRef) => `${team.leagueId}:${team.name}`;

/** Build once per Hall source. Never use end-of-year rosters to infer event winners. */
export function buildTitleDataset(
  entries: readonly SeasonHistoryEntry[],
): TitleDataset {
  const unique = new Map<string, SeasonHistoryEntry>();
  for (const entry of entries) {
    if (
      !unique.has(entry.id) ||
      unique.get(entry.id)!.archivedAt < entry.archivedAt
    )
      unique.set(entry.id, entry);
  }
  const chronological = [...unique.values()].sort(
    (a, b) => a.archivedAt - b.archivedAt || a.id.localeCompare(b.id),
  );
  const data: TitleDataset = {
    years: [],
    awards: [],
    teams: [],
    players: [],
    inferredYears: false,
  };
  for (const [index, entry] of chronological.entries()) {
    const match = /\bYear\s+(\d+)\s*$/i.exec(entry.name);
    const year = match ? Number(match[1]) : index + 1;
    if (!match) data.inferredYears = true;
    data.years.push(year);
    const refs = new Map<string, SeasonHistoryTeamRef>();
    const remember = (team: SeasonHistoryTeamRef | null | undefined) => {
      if (team) refs.set(teamKey(team), team);
    };
    remember(entry.champion);
    remember(entry.runnerUp);
    Object.values(entry.intlChampions).forEach(remember);
    Object.values(entry.splitChampions).forEach((byLeague) =>
      Object.values(byLeague).forEach(remember),
    );
    Object.values(entry.intlPlacements ?? {}).forEach((teams) =>
      teams.forEach(remember),
    );
    Object.values(entry.splitPlacements ?? {}).forEach((byLeague) =>
      Object.values(byLeague).forEach((teams) => teams.forEach(remember)),
    );
    const addParticipants = (trophy: Trophy, teams: SeasonHistoryTeamRef[]) => {
      for (const team of teams)
        data.teams.push({
          entity: { id: teamKey(team), name: team.name, team },
          year,
          region: team.leagueId,
          trophy,
        });
    };
    for (const event of INTERNATIONAL_DISPLAY_ORDER)
      addParticipants(event, entry.intlPlacements?.[event] ?? []);
    for (const split of ["winter", "spring", "summer"] as const) {
      for (const teams of Object.values(entry.splitPlacements?.[split] ?? {}))
        addParticipants(split, teams);
    }
    const phases = entry.phaseRosters ?? [];
    for (const phase of phases) {
      const trophy = phase.kind === "split" ? phase.split : phase.event;
      if (!trophy) continue;
      for (const roster of phase.teams) {
        const team = refs.get(`${roster.leagueId}:${roster.teamName}`) ?? {
          name: roster.teamName,
          leagueId: roster.leagueId,
          logoUrl: roster.logoUrl,
          iconKey: "shield",
          color: "#c8aa6e",
        };
        data.teams.push({
          entity: { id: teamKey(team), name: team.name, team },
          year,
          region: team.leagueId,
          trophy,
        });
        for (const player of roster.players) {
          if (!player.id) continue;
          data.players.push({
            entity: {
              id: player.id,
              name: player.name ?? player.id,
              lane: player.lane,
              team,
            },
            year,
            region: team.leagueId,
            trophy,
          });
        }
      }
    }
    const addAward = (trophy: Trophy, team: SeasonHistoryTeamRef) => {
      const players = new Map<string, TitleEntity>();
      let missingRoster = true;
      for (const phase of phases) {
        if ((phase.kind === "split" ? phase.split : phase.event) !== trophy)
          continue;
        const roster = phase.teams.find(
          (t) => t.teamName === team.name && t.leagueId === team.leagueId,
        );
        if (roster?.players.length && roster.players.every((p) => !!p.id))
          missingRoster = false;
        for (const player of roster?.players ?? []) {
          if (player.id)
            players.set(player.id, {
              id: player.id,
              name: player.name ?? player.id,
              lane: player.lane,
              team,
            });
        }
      }
      data.awards.push({
        id: `${entry.id}:${trophy}:${teamKey(team)}`,
        year,
        seasonName: entry.name,
        trophy,
        team,
        players: [...players.values()],
        missingRoster,
      });
      data.teams.push({
        entity: { id: teamKey(team), name: team.name, team },
        year,
        region: team.leagueId,
        trophy,
      });
    };
    for (const split of ["winter", "spring", "summer"] as const) {
      for (const team of Object.values(entry.splitChampions[split] ?? {}))
        if (team) addAward(split, team);
    }
    for (const event of INTERNATIONAL_DISPLAY_ORDER) {
      // Legacy headline Worlds is the same trophy, not an extra title.
      const team =
        entry.intlChampions[event] ??
        (event === "worlds" ? entry.champion : null);
      if (team) addAward(event, team);
    }
  }
  data.years = [...new Set(data.years)].sort((a, b) => a - b);
  return data;
}

export function selectTitleRows(data: TitleDataset, filters: TitleFilters) {
  const years = data.years.filter((y) => y >= filters.from && y <= filters.to);
  const regions = new Set(filters.regions);
  const trophies = new Set(filters.trophies);
  const matches = (year: number, region: LeagueId, trophy: Trophy) =>
    year >= filters.from &&
    year <= filters.to &&
    regions.has(region) &&
    trophies.has(trophy);
  const rows = new Map<string, TitleRow>();
  const ensure = (entity: TitleEntity) => {
    let row = rows.get(entity.id);
    if (!row) {
      row = {
        ...entity,
        total: 0,
        counts: Object.fromEntries(TROPHIES.map((t) => [t, 0])) as Record<
          Trophy,
          number
        >,
        awards: [],
        regions: [],
        yearly: [],
      };
      rows.set(entity.id, row);
    }
    return row;
  };
  for (const appearance of data[filters.mode]) {
    if (!matches(appearance.year, appearance.region, appearance.trophy))
      continue;
    if (
      filters.mode === "players" &&
      filters.position &&
      appearance.entity.lane !== filters.position
    )
      continue;
    const row = ensure(appearance.entity);
    if (!row.regions.includes(appearance.region))
      row.regions.push(appearance.region);
  }
  const awards = data.awards.filter((a) =>
    matches(a.year, a.team.leagueId, a.trophy),
  );
  for (const award of awards) {
    const entities =
      filters.mode === "teams"
        ? [{ id: teamKey(award.team), name: award.team.name, team: award.team }]
        : award.players;
    for (const entity of entities) {
      if (
        filters.mode === "players" &&
        filters.position &&
        (!("lane" in entity) || entity.lane !== filters.position)
      )
        continue;
      const row = ensure(entity);
      row.total++;
      row.counts[award.trophy]++;
      row.awards.push(award);
      if (!row.regions.includes(award.team.leagueId))
        row.regions.push(award.team.leagueId);
    }
  }
  for (const row of rows.values()) {
    row.awards.sort(
      (a, b) =>
        a.year - b.year ||
        CALENDAR_ORDER.indexOf(a.trophy) - CALENDAR_ORDER.indexOf(b.trophy) ||
        a.id.localeCompare(b.id),
    );
    // Display the club from the latest selected title, not the current club.
    const latest = row.awards.at(-1);
    if (latest) {
      row.team = latest.team;
      if (filters.mode === "players")
        row.lane =
          latest.players.find((player) => player.id === row.id)?.lane ??
          row.lane;
    }
    let total = 0;
    const byYear = new Map<number, number>();
    for (const award of row.awards)
      byYear.set(award.year, (byYear.get(award.year) ?? 0) + 1);
    row.yearly = years.map((year) => ({
      year,
      total: (total += byYear.get(year) ?? 0),
    }));
  }
  return {
    rows: [...rows.values()].sort(
      (a, b) =>
        b.total - a.total ||
        a.name.localeCompare(b.name) ||
        a.id.localeCompare(b.id),
    ),
    awards: awards.length,
    missingRosters: awards.filter((a) => a.missingRoster).length,
    years,
  };
}
