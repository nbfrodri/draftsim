import { it, expect } from "vitest";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { makeAuditSeason } from "../auditFixtures";
import { SCHEMA_SQL, type PersistedStoreState } from "../desktopSqliteSchema";
import { loadPersistedStateFromDbExecutor, savePersistedStateToDbExecutor, resetSqliteStorageForTests, type SqlExecutor } from "../desktopSqlite";
import { validSeason } from "../importValidation";

it("preserves SS evidence through actual SQLite saves, lazy load and subsequent writes", async () => {
	const db = new DatabaseSync(":memory:");
	db.exec(SCHEMA_SQL);
	const executor: SqlExecutor = {
		execute: async (query, values = []) => ({ rowsAffected: Number(db.prepare(query).run(...values as SQLInputValue[]).changes) }),
		select: async <T>(query: string, values: unknown[] = []) => db.prepare(query).all(...values as SQLInputValue[]) as T[],
	};
	try {
		const season = makeAuditSeason("SS persistence");
		const p = season.teams[0].players[0];
		p.tier = "SS";
		p.potential = "S+";
		p.ss = { baseTier: "S+", lane: p.lane, seasonId: season.id, phaseIndex: 0, phaseLabel: "Winter", score: 7.25, games: 16 };
		season.ssReviews = [{ phaseIndex: 0, label: "Winter", holders: [{ playerId: p.id!, lane: p.lane, evidence: p.ss }] }];
		const rid = season.franchise.id;
		const state = { season, activeRealityId: rid, realities: [{ id: rid, name: "SS persistence", year: 1, season, history: [] }] } as PersistedStoreState;
		resetSqliteStorageForTests();
		await savePersistedStateToDbExecutor(executor, "draftsim-store", state);
		const loaded = (await loadPersistedStateFromDbExecutor(executor, "draftsim-store"))!;
		expect(loaded.season!.teams[0].players[0]).toMatchObject({ tier: "SS", ss: p.ss });
		expect(loaded.season!.ssReviews).toEqual(season.ssReviews);
		expect(validSeason(loaded.season)).toBe(true);
		resetSqliteStorageForTests();
		await savePersistedStateToDbExecutor(executor, "draftsim-store", loaded);
		const reloaded = (await loadPersistedStateFromDbExecutor(executor, "draftsim-store"))!;
		expect(reloaded.season!.teams[0].players[0].ss).toEqual(p.ss);
	} finally {
		db.close();
		resetSqliteStorageForTests();
	}
});
