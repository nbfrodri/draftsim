"use client";

import { useDraftStore } from "@/store/draftStore";
import type { SeasonHistoryEntry } from "@/lib/season/history";
import EventStatsPanel from "../tournament/EventStatsPanel";

export default function ArchivedEventStats({ entry }: { entry: SeasonHistoryEntry }) {
	const champions = useDraftStore(s => s.champions);
	return <section aria-label="Archived event statistics" className="min-w-0"><h3 className="font-display text-sm text-rift-goldbright">Event statistics</h3>{entry.eventRecords ? entry.eventRecords.map(record => <EventStatsPanel key={record.id} record={record} champions={champions} seasonId={entry.id} />) : <p className="mt-2 text-xs text-rift-mutedbright">Event rankings were not recorded for this season.</p>}</section>;
}
