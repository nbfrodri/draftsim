"use client";

import { useEffect, useMemo, useState } from "react";
import { eventRecordsAvailability, loadEventRecords } from "@/lib/eventRecordsAccess";
import type { EventRecord } from "@/lib/season/eventHistory";
import type { SeasonHistoryEntry } from "@/lib/season/history";

type RecordsState = { status: "loading" } | { status: "error" } | { status: "ready"; records: Map<SeasonHistoryEntry, EventRecord[]> };

/** Use inside a lazily mounted body. Keep the entries list stable between renders. */
export function useEventRecords(entries: readonly SeasonHistoryEntry[]) {
	// Inline-only histories are ready on their first render, without a loading flash.
	const inlineRecords = useMemo(() => {
		const records = new Map<SeasonHistoryEntry, EventRecord[]>();
		for (const entry of entries) {
			if (eventRecordsAvailability(entry) === "deferred") return null;
			if (entry.eventRecords?.length) records.set(entry, entry.eventRecords);
		}
		return records;
	}, [entries]);
	const [attempt, setAttempt] = useState(0);
	const [result, setResult] = useState<{ entries: readonly SeasonHistoryEntry[]; attempt: number; state: RecordsState } | null>(null);

	useEffect(() => {
		if (inlineRecords) return;
		let active = true;
		void loadEventRecords(entries).then(
			records => { if (active) setResult({ entries, attempt, state: { status: "ready", records } }); },
			() => { if (active) setResult({ entries, attempt, state: { status: "error" } }); },
		);
		return () => { active = false; };
	}, [entries, inlineRecords, attempt]);

	// A changed scope or retry must never render the previous request's records/error.
	const state: RecordsState = inlineRecords ? { status: "ready", records: inlineRecords }
		: result?.entries === entries && result.attempt === attempt ? result.state : { status: "loading" };
	return { state, retry: () => setAttempt(n => n + 1) };
}
