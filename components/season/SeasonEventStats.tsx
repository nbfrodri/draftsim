"use client";

import { useMemo, useState } from "react";
import { seasonEventGroups } from "@/lib/season/eventHistory";
import type { SeasonState } from "@/lib/season/types";
import { IconChartBar } from "@tabler/icons-react";
import type { Champion } from "@/lib/types";
import CollapsibleSection from "../CollapsibleSection";
import EventStatsPanel from "../tournament/EventStatsPanel";

export default function SeasonEventStats({ season, champions }: { season: SeasonState; champions: readonly Champion[] }) {
	const groups = useMemo(() => seasonEventGroups(season).filter(g => g.tournaments.length), [season]);
	const [selected, setSelected] = useState("");
	const group = groups.find(g => g.identity.id === selected) ?? groups.find(g => g.identity.phaseIndex === season.phaseIndex) ?? groups.at(-1);
	if (!group) return null;
	return <CollapsibleSection label="Event Statistics" icon={<IconChartBar size={15} className="shrink-0 text-rift-gold" aria-hidden="true" />} summary={group.identity.label} className="my-4">
		<div className="space-y-3 p-3"><label className="flex flex-col gap-1 text-[10px] uppercase tracking-wider text-rift-mutedbright">Event<select aria-label="Statistics event" className="max-w-full border border-rift-line/60 bg-rift-bg px-2 py-1.5 text-xs normal-case tracking-normal focus-visible:outline focus-visible:outline-2 focus-visible:outline-rift-gold" value={group.identity.id} onChange={e => setSelected(e.target.value)}>{groups.map(g => <option key={g.identity.id} value={g.identity.id}>{g.identity.label}</option>)}</select></label><EventStatsPanel key={group.identity.id} tournaments={group.tournaments} identity={group.identity} champions={champions} /></div>
	</CollapsibleSection>;
}
