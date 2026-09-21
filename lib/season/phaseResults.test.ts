import { expect, it } from "vitest";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { makeAuditSeason } from "../auditFixtures";
import { SCHEMA_SQL, type PersistedStoreState } from "../desktopSqliteSchema";
import { loadPersistedStateFromDbExecutor, savePersistedStateToDbExecutor, resetSqliteStorageForTests, type SqlExecutor } from "../desktopSqlite";
import { seasonAtPhase } from "./phaseResults";
import type { SeasonState } from "./types";

it("preserves event identity and rosters through transfers and SQLite save/load", async () => {
  const season = makeAuditSeason("Event snapshots");
  const phase = season.phases[0];
  const tournament = season.tournaments[phase.tournamentIds[0]];
  const entrant = tournament.teams[0];
  const original = structuredClone(entrant);
  const live = season.teams.find(t => t.id === entrant.id)!;
  live.name = "Renamed current team";
  live.players[0].name = "Replacement player";
  live.players[0].id = "replacement";
  live.players[0].goodChamps.push(99999);
  expect(entrant).toEqual(original);
  tournament.status = "complete";
  phase.status = "complete";
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA_SQL);
  const executor: SqlExecutor = {
    execute: async (q, v = []) => ({ rowsAffected: Number(db.prepare(q).run(...v as SQLInputValue[]).changes) }),
    select: async <T>(q: string, v: unknown[] = []) => db.prepare(q).all(...v as SQLInputValue[]) as T[],
  };
  try {
    resetSqliteStorageForTests();
    await savePersistedStateToDbExecutor(executor, "draftsim-store", { season } as PersistedStoreState);
    const loaded = (await loadPersistedStateFromDbExecutor(executor, "draftsim-store"))!.season as SeasonState;
    const frozen = seasonAtPhase(loaded, loaded.phases[0]).teams.find(t => t.id === entrant.id)!;
    expect(frozen.name).toBe(original.name);
    expect(frozen.players).toEqual(original.players);
    expect(loaded.teams.find(t => t.id === entrant.id)!.name).toBe("Renamed current team");
  } finally { db.close(); resetSqliteStorageForTests(); }
});

it("uses phase stamps for legacy rosters and never fills missing data with current players", () => {
  const season = makeAuditSeason();
  const phase = season.phases[0];
  const t = season.tournaments[phase.tournamentIds[0]];
  const entrant = t.teams[0];
  const players = structuredClone(entrant.players!);
  delete entrant.players;
  expect(seasonAtPhase(season, phase).teams.find(t => t.id === entrant.id)!.players).toEqual([]);
  season.phaseRosters = [{ phaseIndex: 0, label: phase.label, kind: "split", split: phase.split,
    teams: [{ teamId: entrant.id, teamName: entrant.name, leagueId: entrant.leagueId!, players }] }];
  expect(seasonAtPhase(season, phase).teams.find(t => t.id === entrant.id)!.players).toEqual(players);
  // Same-named clubs from different regions remain distinct.
  const other = season.tournaments[phase.tournamentIds[1]].teams[0];
  other.name = entrant.name;
  const frozen = seasonAtPhase(season, phase);
  expect(frozen.teams.filter(t => t.name === entrant.name)).toHaveLength(2);
});
