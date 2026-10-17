"use client";

import { IconChartBar } from "@tabler/icons-react";
import { useDraftStore } from "@/store/draftStore";
import type { SeasonHistoryEntry } from "@/lib/season/history";
import CollapsibleSection from "../CollapsibleSection";
import EventStatsPanel from "../tournament/EventStatsPanel";

export default function ArchivedEventStats({ entry }: { entry: SeasonHistoryEntry }) {
	const champions = useDraftStore(s => s.champions);
	const count = entry.eventRecords?.length ?? 0;
	return <CollapsibleSection ariaLabel="Archived event statistics" label="Event statistics" icon={<IconChartBar size={15} className="shrink-0 text-rift-gold" aria-hidden="true" />} summary={count ? `${count} ${count === 1 ? "event" : "events"}` : "Not recorded"} className="">
		<div className="space-y-1 p-3">{entry.eventRecords ? entry.eventRecords.map(record => <EventStatsPanel key={record.id} record={record} champions={champions} seasonId={entry.id} />) : <p className="text-xs text-rift-mutedbright">Event rankings were not recorded for this season.</p>}</div>
	</CollapsibleSection>;
}
