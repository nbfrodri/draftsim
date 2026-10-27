import { afterEach, describe, expect, it, vi } from "vitest";
import type { EventRecord } from "./season/eventHistory";
import type { SeasonHistoryEntry } from "./season/history";
import { eventRecordCount, eventRecordsAvailability, loadEventRecords, setEventRecordsLoader } from "./eventRecordsAccess";

const record = (id: string) => ({ id, label: id, version: 2, scopes: [] }) as unknown as EventRecord;
const entry = (id: string, extra: Partial<SeasonHistoryEntry> = {}) => ({ id, name: id, archivedAt: 1, complete: true, champion: null, runnerUp: null, intlChampions: {}, splitChampions: {}, ...extra }) as SeasonHistoryEntry;

afterEach(() => setEventRecordsLoader(async () => new Map()));

describe("event records access", () => {
	it("tells inline, deferred and unrecorded years apart", () => {
		expect(eventRecordsAvailability(entry("a", { eventRecords: [record("r")] }))).toBe("inline");
		expect(eventRecordsAvailability(entry("b", { eventRecordsDeferred: { realityId: "x", count: 3 } }))).toBe("deferred");
		expect(eventRecordsAvailability(entry("c"))).toBe("none");
		expect(eventRecordCount(entry("b", { eventRecordsDeferred: { realityId: "x", count: 3 } }))).toBe(3);
	});

	it("loads deferred records per reality and keeps same-id seasons of different realities apart", async () => {
		const loader = vi.fn(async (realityId: string, ids: readonly string[]) => new Map(ids.map(id => [id, [record(`${realityId}:${id}`)]])));
		setEventRecordsLoader(loader);
		const inline = entry("y1", { eventRecords: [record("inline")] });
		const a = entry("y2", { eventRecordsDeferred: { realityId: "A", count: 1 } });
		const b = entry("y2", { eventRecordsDeferred: { realityId: "B", count: 1 } });
		const loaded = await loadEventRecords([inline, a, b, entry("y3")]);
		expect(loaded.get(inline)![0].id).toBe("inline");
		expect(loaded.get(a)![0].id).toBe("A:y2");
		expect(loaded.get(b)![0].id).toBe("B:y2");
		expect(loader).toHaveBeenCalledTimes(2);
	});

	it("rejects when a deferred read fails so views can offer a retry", async () => {
		setEventRecordsLoader(async () => { throw new Error("disk"); });
		await expect(loadEventRecords([entry("y", { eventRecordsDeferred: { realityId: "A", count: 1 } })])).rejects.toThrow("disk");
	});
});
