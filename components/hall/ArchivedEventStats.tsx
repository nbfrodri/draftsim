"use client";

import { IconChartBar } from "@tabler/icons-react";
import { useMemo } from "react";
import { useDraftStore } from "@/store/draftStore";
import { eventRecordCount, eventRecordsAvailability } from "@/lib/eventRecordsAccess";
import type { SeasonHistoryEntry } from "@/lib/season/history";
import { plural } from "@/lib/plural";
import CollapsibleSection from "../CollapsibleSection";
import EventStatsPanel from "../tournament/EventStatsPanel";
import { useEventRecords } from "./useEventRecords";

export default function ArchivedEventStats({ entry }: { entry: SeasonHistoryEntry }) {
	const count = eventRecordCount(entry);
	return <CollapsibleSection ariaLabel="Archived event statistics" label="Event Statistics" icon={<IconChartBar size={15} className="shrink-0 text-rift-gold" aria-hidden="true" />} summary={count ? plural(count, "event") : "Not recorded"} className="" keepMounted>
		<Body entry={entry} />
	</CollapsibleSection>;
}

function Body({ entry }: { entry: SeasonHistoryEntry }) {
	const champions = useDraftStore(s => s.champions);
	const entries = useMemo(() => [entry], [entry]);
	const { state, retry } = useEventRecords(entries);
	return <div className="space-y-1 p-3">
		{eventRecordsAvailability(entry) === "none" ? <p className="text-xs text-rift-mutedbright">Event rankings were not recorded for this season.</p>
			: state.status === "loading" ? <p role="status" className="text-xs text-rift-mutedbright">Loading event statistics…</p>
				: state.status === "error" ? <div className="text-xs text-rift-mutedbright">
					<p role="alert">Could not load event statistics.</p>
					<button type="button" onClick={retry} className="mt-2 border border-rift-gold/50 px-3 py-2 text-rift-goldbright focus-visible:outline focus-visible:outline-2 focus-visible:outline-rift-gold">Retry</button>
				</div>
					: state.records.get(entry)?.map(record => <EventStatsPanel key={record.id} record={record} champions={champions} seasonId={entry.id} />)}
	</div>;
}
