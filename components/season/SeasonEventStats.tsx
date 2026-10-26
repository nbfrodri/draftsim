"use client";

import { useMemo, useState } from "react";
import ChipRow from "../ChipRow";
import { seasonEventGroups } from "@/lib/season/eventHistory";
import type { LeagueId, SeasonState } from "@/lib/season/types";
import { IconChartBar } from "@tabler/icons-react";
import type { Champion } from "@/lib/types";
import { syncKey, type Keyed } from "@/lib/keyedState";
import CollapsibleSection from "../CollapsibleSection";
import EventStatsPanel, { INITIAL_VIEW, type View } from "../tournament/EventStatsPanel";
import { eventPickerEvents, eventPickerKey, resolveEventSelection, selectPickerEvent, selectPickerRegion, type EventPickerSelection } from "@/lib/season/eventPicker";
import RegionMark from "../RegionMark";
import EventIdentityIcon from "../tournament/EventIdentityIcon";
import SplitIcon from "./SplitIcon";

export default function SeasonEventStats({ season, champions }: { season: SeasonState; champions: readonly Champion[] }) {
	const groups = useMemo(() => seasonEventGroups(season).filter(g => g.tournaments.length), [season]);
	const events = useMemo(() => eventPickerEvents(groups), [groups]);
	const [selected, setSelected] = useState<EventPickerSelection>();
	const [view, setView] = useState<Keyed<View>>({ key: "", value: INITIAL_VIEW });
	const identity = resolveEventSelection(groups, season.phaseIndex, selected);
	const group = groups.find(g => g.identity.id === identity?.id);
	if (!group) return null;
	const event = events.find(e => e.key === eventPickerKey(group.identity))!;
	const selection = { groupId: group.identity.id, rememberedRegion: selected?.rememberedRegion ?? group.identity.leagueId };
	const synced = syncKey(view, group.identity.id, INITIAL_VIEW);
	if (synced !== view) setView(synced);
	return <CollapsibleSection label="Event Statistics" icon={<IconChartBar size={15} className="shrink-0 text-rift-gold" aria-hidden="true" />} summary={group.identity.label} className="my-4">
		<div className="space-y-3 p-3">
			<ChipRow label="Event" value={event.key} options={events.map(e => ({ value: e.key, label: e.label, icon: e.split ? <SplitIcon split={e.split} size={14} /> : <EventIdentityIcon identity={{ event: e.event }} size={14} /> }))} onChange={key => setSelected(selectPickerEvent(groups, key, selection))} />
			{event.split && <ChipRow label="Region" value={group.identity.leagueId ?? "unknown"} options={event.regions.map(region => ({ value: region ?? "unknown", label: region ?? "Not recorded", icon: <RegionMark league={region} /> }))} onChange={region => setSelected(selectPickerRegion(groups, event.key, region === "unknown" ? undefined : region as LeagueId))} />}
			<p className="text-xs text-rift-mutedbright">{group.identity.leagueId ? `${group.identity.leagueId} · ${event.label}` : event.split ? `Not recorded · ${event.label}` : event.label}</p>
			<EventStatsPanel key={group.identity.id} tournaments={group.tournaments} identity={group.identity} embedded champions={champions} view={synced.value} onViewChange={fn => setView(v => ({ key: v.key, value: fn(v.value) }))} />
		</div>
	</CollapsibleSection>;
}
