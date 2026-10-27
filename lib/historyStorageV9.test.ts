import { afterEach, describe, expect, it } from "vitest";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { SCHEMA_SQL } from "./desktopSqliteSchema";
import { loadPersistedStateFromDbExecutor, resetSqliteStorageForTests, setDesktopDatabaseForTests, upgradeHistoryStorage, type SqlExecutor } from "./desktopSqlite";
import { countPlainHistoryRows, migrateHistoryToV9, verifyHistoryV9 } from "./historyStorageV9";
import { loadEventRecords } from "./eventRecordsAccess";
import { isCompressedStoredJson } from "./storedJson";
import type { SeasonHistoryEntry } from "./season/history";

function v8Database(entries: Record<string, unknown>[]) {
	const sqlite = new DatabaseSync(":memory:");
	sqlite.exec(SCHEMA_SQL);
	sqlite.exec("UPDATE schema_meta SET value = '8' WHERE key = 'persist_version'");
	sqlite.prepare("INSERT INTO global_state (store_key, state_json, updated_at) VALUES ('draftsim-store', ?, 1)").run(JSON.stringify({ activeRealityId: "r", _draftsimFragments: [] }));
	sqlite.prepare("INSERT INTO realities (id, name, year, season_json, updated_at) VALUES ('r', 'Reality', 3, '{}', 1)").run();
	entries.forEach((e, i) => sqlite.prepare("INSERT INTO reality_history (reality_id, entry_id, entry_json, sort_order) VALUES ('r', ?, ?, ?)").run(String(e.id), JSON.stringify(e), i));
	let failAfter = Infinity;
	const executor: SqlExecutor = {
		execute: async (q, v = []) => ({ rowsAffected: Number(sqlite.prepare(q).run(...v as SQLInputValue[]).changes) }),
		select: async <T>(q: string, v: unknown[] = []) => sqlite.prepare(q).all(...v as SQLInputValue[]) as T[],
		batch: async statements => {
			if (failAfter-- <= 0) throw new Error("power cut");
			sqlite.exec("BEGIN");
			try { for (const s of statements) sqlite.prepare(s.query).run(...s.bindValues as SQLInputValue[]); sqlite.exec("COMMIT"); }
			catch (error) { sqlite.exec("ROLLBACK"); throw error; }
		},
	};
	return { sqlite, executor, failAfterBatches: (n: number) => { failAfter = n; } };
}

const year = (n: number, records = true) => ({
	id: `y${n}`, name: `Year ${n} ${"Ñandú 🏆 ".repeat(50)}`, archivedAt: n, complete: true, champion: null, runnerUp: null, intlChampions: {}, splitChampions: {},
	...(records ? { eventRecords: [{ id: `e${n}`, label: "LCK · Winter", version: 2, scopes: [{ id: "all", label: "All", stats: { games: n } }] }] } : {}),
});

afterEach(() => { resetSqliteStorageForTests(); setDesktopDatabaseForTests(null); });

describe("storage v9 history migration", () => {
	it("compresses every year, moves records apart and loads the same archive", async () => {
		const original = [year(3), year(2), year(1, false)];
		const { sqlite, executor } = v8Database(original);
		let backups = 0;
		await upgradeHistoryStorage(executor, "8", async () => { backups++; });
		expect(backups).toBe(1);
		expect(sqlite.prepare("SELECT value FROM schema_meta WHERE key = 'persist_version'").get()!.value).toBe("9");
		expect(await countPlainHistoryRows(executor)).toBe(0);
		for (const row of sqlite.prepare("SELECT entry_json FROM reality_history").all()) expect(isCompressedStoredJson(String(row.entry_json))).toBe(true);
		expect(sqlite.prepare("SELECT entry_id, record_count FROM reality_event_records ORDER BY entry_id").all().map(r => [r.entry_id, r.record_count])).toEqual([["y2", 1], ["y3", 1]]);
		expect(await verifyHistoryV9(executor)).toEqual({ rows: 3, records: 2 });

		setDesktopDatabaseForTests(executor);
		const history = (await loadPersistedStateFromDbExecutor(executor, "draftsim-store"))!.realities![0].history as SeasonHistoryEntry[];
		const { eventRecords: _records, ...withoutRecords } = original[0];
		expect(history[0]).toEqual({ ...withoutRecords, eventRecordsDeferred: { realityId: "r", count: 1 } });
		expect(history[2]).toEqual(original[2]);
		const loaded = await loadEventRecords(history);
		expect(loaded.get(history[0])).toEqual(original[0].eventRecords);
		expect(loaded.get(history[2])).toBeUndefined();
	});

	it("resumes after an interruption without taking a second recovery copy or losing records", async () => {
		const original = [year(3), year(2), year(1)];
		const { executor, failAfterBatches } = v8Database(original);
		failAfterBatches(1);
		let backups = 0;
		await expect(upgradeHistoryStorage(executor, "8", async () => { backups++; })).rejects.toThrow("power cut");
		expect(await countPlainHistoryRows(executor)).toBe(2);
		failAfterBatches(Infinity);
		await upgradeHistoryStorage(executor, "9", async () => { backups++; });
		expect(backups).toBe(1);
		expect(await verifyHistoryV9(executor)).toEqual({ rows: 3, records: 3 });
	});

	it("marks an empty v8 database as v9 without a recovery copy and leaves it unchanged otherwise", async () => {
		const { sqlite, executor } = v8Database([]);
		let backups = 0;
		await upgradeHistoryStorage(executor, "8", async () => { backups++; });
		expect(backups).toBe(0);
		expect(sqlite.prepare("SELECT value FROM schema_meta WHERE key = 'persist_version'").get()!.value).toBe("9");
		expect(await migrateHistoryToV9(executor)).toBe(0);
	});

	it("refuses to rewrite a damaged row and keeps it as it was", async () => {
		const { sqlite, executor } = v8Database([year(1)]);
		sqlite.prepare("UPDATE reality_history SET entry_json = '[1,2]'").run();
		await expect(upgradeHistoryStorage(executor, "8", async () => {})).rejects.toThrow("refusing to overwrite");
		expect(sqlite.prepare("SELECT entry_json FROM reality_history").get()!.entry_json).toBe("[1,2]");
	});
});
