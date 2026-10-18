"use client";

import { useMemo, useState } from "react";
import { seasonEventGroups } from "@/lib/season/eventHistory";
import type { SeasonState } from "@/lib/season/types";
import { IconChartBar } from "@tabler/icons-react";
import type { Champion } from "@/lib/types";
import { syncKey, type Keyed } from "@/lib/keyedState";
import CollapsibleSection from "../CollapsibleSection";
import EventStatsPanel, { INITIAL_VIEW, type View } from "../tournament/EventStatsPanel";
import PlaygroundSelect from "../hall/PlaygroundSelect";
import EventIdentityIcon from "../tournament/EventIdentityIcon";
import SplitIcon from "./SplitIcon";
import LeagueIcon from "../LeagueIcon";

export default function SeasonEventStats({ season, champions }: { season: SeasonState; champions: readonly Champion[] }) {
	const groups = useMemo(() => seasonEventGroups(season).filter(g => g.tournaments.length), [season]);
	const [selected, setSelected] = useState("");
	const [view, setView] = useState<Keyed<View>>({ key: "", value: INITIAL_VIEW });
	const group = groups.find(g => g.identity.id === selected) ?? groups.find(g => g.identity.phaseIndex === season.phaseIndex) ?? groups.at(-1);
	if (!group) return null;
	const synced = syncKey(view, group.identity.id, INITIAL_VIEW);
	if (synced !== view) setView(synced);
	return <CollapsibleSection label="Event Statistics" icon={<IconChartBar size={15} className="shrink-0 text-rift-gold" aria-hidden="true" />} summary={group.identity.label} className="my-4">
		<div className="space-y-3 p-3">
			<PlaygroundSelect label="Statistics event" className="w-full sm:w-fit sm:min-w-[14rem]" value={group.identity.id} onChange={setSelected}
				groups={Object.fromEntries(groups.map(({ identity }) => [season.phases[identity.phaseIndex!].label, identity.event ? <LeagueIcon key={identity.id} league={identity.event} size={14} /> : identity.split ? <SplitIcon key={identity.id} split={identity.split} size={14} /> : null]))}
				options={groups.map(({ identity }) => ({ value: identity.id, label: identity.label, displayLabel: identity.label.replace(`${identity.leagueId ?? "League"} · `, ""), icon: <EventIdentityIcon identity={identity} />, group: season.phases[identity.phaseIndex!].label }))} />
			<EventStatsPanel key={group.identity.id} tournaments={group.tournaments} identity={group.identity} embedded champions={champions} view={synced.value} onViewChange={fn => setView(v => ({ key: v.key, value: fn(v.value) }))} />
		</div>
	</CollapsibleSection>;
}
