/**
 * Event records of archived years may stay in desktop storage until a view
 * needs them (docs/plans/2026-10-27-history-storage-v9.md). Views read records
 * only through this module, so "not loaded yet" is never shown as "not recorded".
 */
import type { EventRecord } from "./season/eventHistory";
import type { SeasonHistoryEntry } from "./season/history";

export type EventRecordsAvailability = "inline" | "deferred" | "none";

export function eventRecordsAvailability(entry: SeasonHistoryEntry): EventRecordsAvailability {
	if (entry.eventRecords?.length) return "inline";
	return entry.eventRecordsDeferred?.count ? "deferred" : "none";
}

/** Number of recorded events, known without loading them. */
export function eventRecordCount(entry: SeasonHistoryEntry): number {
	return entry.eventRecords?.length || entry.eventRecordsDeferred?.count || 0;
}

export type EventRecordsLoader = (realityId: string, entryIds: readonly string[]) => Promise<Map<string, EventRecord[]>>;

let loader: EventRecordsLoader = async () => new Map();
/** Desktop storage registers the real loader; tests may register a fake one. */
export function setEventRecordsLoader(next: EventRecordsLoader): void { loader = next; }

/**
 * Records per entry object (season ids can repeat across realities); inline
 * entries resolve without I/O. Rejects if a deferred read fails.
 */
export async function loadEventRecords(entries: readonly SeasonHistoryEntry[]): Promise<Map<SeasonHistoryEntry, EventRecord[]>> {
	const result = new Map<SeasonHistoryEntry, EventRecord[]>();
	const byReality = new Map<string, SeasonHistoryEntry[]>();
	for (const entry of entries) {
		if (entry.eventRecords?.length) result.set(entry, entry.eventRecords);
		else if (entry.eventRecordsDeferred?.count) {
			const id = entry.eventRecordsDeferred.realityId;
			byReality.set(id, [...byReality.get(id) ?? [], entry]);
		}
	}
	for (const [realityId, group] of byReality) {
		const loaded = await loader(realityId, group.map(e => e.id));
		for (const entry of group) result.set(entry, loaded.get(entry.id) ?? []);
	}
	return result;
}

/** Entries with deferred records loaded back inline and the marker removed (exports keep their format). */
export async function joinDeferredEventRecords(entries: readonly SeasonHistoryEntry[]): Promise<SeasonHistoryEntry[]> {
	if (!entries.some(e => e.eventRecordsDeferred)) return [...entries];
	const loaded = await loadEventRecords(entries);
	return entries.map(entry => {
		if (!entry.eventRecordsDeferred) return entry;
		const { eventRecordsDeferred: _deferred, ...rest } = entry;
		const records = loaded.get(entry);
		return records?.length ? { ...rest, eventRecords: records } : rest;
	});
}
