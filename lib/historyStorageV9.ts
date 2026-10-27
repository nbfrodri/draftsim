/**
 * Storage v9 history migration (docs/plans/2026-10-27-history-storage-v9.md):
 * every archived year is rewritten compressed, with its event records moved to
 * `reality_event_records`. Each row commits on its own, and only rows still in
 * plain JSON are selected, so an interrupted run resumes where it stopped.
 * The caller takes the recovery copy before the first row is rewritten.
 */
import type { SqlExecutor } from "./desktopSqlite";
import { UPSERT_EVENT_RECORDS_SQL } from "./desktopSqliteSchema";
import type { SqlStatement } from "./persistBatchTransport";
import { compressStoredJson, decompressStoredJson } from "./storedJson";

/**
 * Large text crosses the WebView IPC bridge in pieces of at most this many
 * characters. One select of a long reality's history (hundreds of MB) can kill
 * the renderer at startup; writes are already chunked the same way.
 */
export const READ_CHUNK_CHARS = 1 << 20;

/** `sql` selects `substr(column, ?, ?) AS part`; its own bind values follow the two substr ones. */
export async function selectTextInChunks(db: SqlExecutor, sql: string, bindValues: unknown[], chars: number): Promise<string> {
	const parts: string[] = [];
	for (let start = 1; start <= chars; start += READ_CHUNK_CHARS) {
		const rows = await db.select<{ part: string | null }>(sql, [start, READ_CHUNK_CHARS, ...bindValues]);
		parts.push(rows[0]?.part ?? "");
	}
	return parts.join("");
}

const PLAIN_ROWS_SQL = `SELECT reality_id, entry_id, LENGTH(entry_json) AS chars FROM reality_history WHERE substr(entry_json, 1, 6) != '{"$z":' ORDER BY reality_id, sort_order`;
const HISTORY_PART_SQL = "SELECT substr(entry_json, ?, ?) AS part FROM reality_history WHERE reality_id = ? AND entry_id = ?";
const RECORDS_PART_SQL = "SELECT substr(records_json, ?, ?) AS part FROM reality_event_records WHERE reality_id = ? AND entry_id = ?";
const UPDATE_ROW_SQL = "UPDATE reality_history SET entry_json = ? WHERE reality_id = ? AND entry_id = ?";
const invalid = () => new Error("Saved history is invalid; refusing to overwrite it.");

export async function countPlainHistoryRows(db: SqlExecutor): Promise<number> {
	return (await db.select<{ reality_id: string }>(PLAIN_ROWS_SQL)).length;
}

async function commit(db: SqlExecutor, statements: SqlStatement[]): Promise<void> {
	if (db.batch) { await db.batch(statements); return; }
	for (const s of statements) await db.execute(s.query, s.bindValues);
}

/** Rewrites every plain row; returns how many were converted. */
export async function migrateHistoryToV9(db: SqlExecutor, onProgress: (done: number, total: number) => void = () => {}): Promise<number> {
	const rows = await db.select<{ reality_id: string; entry_id: string; chars: number }>(PLAIN_ROWS_SQL);
	for (let i = 0; i < rows.length; i++) {
		onProgress(i, rows.length);
		const { reality_id: realityId, entry_id: entryId, chars } = rows[i]!;
		let entry: unknown;
		try { entry = JSON.parse(await selectTextInChunks(db, HISTORY_PART_SQL, [realityId, entryId], chars)); } catch { throw invalid(); }
		// Loaders skip null rows; keep them null rather than inventing an archive.
		if (entry !== null && (typeof entry !== "object" || Array.isArray(entry))) throw invalid();
		const { eventRecords, ...rest } = (entry ?? {}) as { eventRecords?: unknown[] };
		const statements: SqlStatement[] = [];
		// Records first: if the row update failed, the row stays plain and is retried.
		if (Array.isArray(eventRecords) && eventRecords.length) {
			statements.push({ query: UPSERT_EVENT_RECORDS_SQL, bindValues: [realityId, entryId, await compressStoredJson(JSON.stringify(eventRecords)), eventRecords.length] });
		}
		statements.push({ query: UPDATE_ROW_SQL, bindValues: [await compressStoredJson(entry === null ? "null" : JSON.stringify(rest)), realityId, entryId] });
		await commit(db, statements);
	}
	onProgress(rows.length, rows.length);
	return rows.length;
}

/** Reads back every history row and record set; throws if anything does not decode. */
export async function verifyHistoryV9(db: SqlExecutor): Promise<{ rows: number; records: number }> {
	const history = await db.select<{ reality_id: string; entry_id: string; chars: number }>("SELECT reality_id, entry_id, LENGTH(entry_json) AS chars FROM reality_history");
	for (const row of history) {
		const value: unknown = JSON.parse(await decompressStoredJson(await selectTextInChunks(db, HISTORY_PART_SQL, [row.reality_id, row.entry_id], row.chars)));
		if (value !== null && (typeof value !== "object" || Array.isArray(value))) throw invalid();
	}
	const records = await db.select<{ reality_id: string; entry_id: string; chars: number }>("SELECT reality_id, entry_id, LENGTH(records_json) AS chars FROM reality_event_records");
	for (const row of records) {
		if (!Array.isArray(JSON.parse(await decompressStoredJson(await selectTextInChunks(db, RECORDS_PART_SQL, [row.reality_id, row.entry_id], row.chars))))) throw invalid();
	}
	return { rows: history.length, records: records.length };
}
