"use client";

import { useMemo, useState } from "react";
import type { TournamentState } from "@/lib/tournament";
import type { Champion } from "@/lib/types";
import type { SeasonState } from "@/lib/season/types";
import { seasonEventGroups } from "@/lib/season/eventHistory";
import { IconChartBar } from "@tabler/icons-react";
import CollapsibleSection from "../CollapsibleSection";
import EventStatsPanel, { INITIAL_VIEW, type View } from "./EventStatsPanel";

export default function LiveEventStats({ tournament, season, champions }: { tournament: TournamentState; season: SeasonState | null; champions: readonly Champion[] }) {
	const [view, setView] = useState<View>(INITIAL_VIEW);
	const group = useMemo(() => season && season.id === tournament.seasonId ? seasonEventGroups(season).find(g => g.tournaments.some(t => t.id === tournament.id)) : undefined, [season, tournament.id, tournament.seasonId]);
	const tournaments = useMemo(() => group ? group.tournaments.map(t => t.id === tournament.id ? tournament : t) : [tournament], [group, tournament]);
	const identity = useMemo(() => group?.identity ?? { id: tournament.id, label: tournament.name }, [group, tournament.id, tournament.name]);
	return <CollapsibleSection label="Event Statistics" icon={<IconChartBar size={15} className="shrink-0 text-rift-gold" aria-hidden="true" />} summary={identity.label} className="my-4"><div className="p-3"><EventStatsPanel tournaments={tournaments} identity={identity} embedded champions={champions} view={view} onViewChange={setView} /></div></CollapsibleSection>;
}
