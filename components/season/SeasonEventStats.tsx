"use client";

import { useMemo, useState } from "react";
import { seasonEventGroups } from "@/lib/season/eventHistory";
import type { SeasonState } from "@/lib/season/types";
import type { Champion } from "@/lib/types";
import EventStatsPanel from "../tournament/EventStatsPanel";

export default function SeasonEventStats({ season, champions }: { season: SeasonState; champions: readonly Champion[] }) {
	const groups = useMemo(() => seasonEventGroups(season).filter(g => g.tournaments.length), [season]);
	const [selected, setSelected] = useState("");
	const group = groups.find(g => g.identity.id === selected) ?? groups.find(g => g.identity.phaseIndex === season.phaseIndex) ?? groups.at(-1);
	if (!group) return null;
	return <div className="my-4 min-w-0"><label className="flex flex-wrap items-center gap-2 text-xs text-rift-mutedbright">Event statistics<select aria-label="Statistics event" className="max-w-full border border-rift-line bg-rift-bg px-2 py-1.5 focus-visible:outline-rift-gold" value={group.identity.id} onChange={e => setSelected(e.target.value)}>{groups.map(g => <option key={g.identity.id} value={g.identity.id}>{g.identity.label}</option>)}</select></label><EventStatsPanel key={group.identity.id} tournaments={group.tournaments} identity={group.identity} champions={champions} /></div>;
}
