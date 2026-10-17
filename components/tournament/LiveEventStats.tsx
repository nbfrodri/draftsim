"use client";

import { useMemo } from "react";
import type { TournamentState } from "@/lib/tournament";
import type { Champion } from "@/lib/types";
import type { SeasonState } from "@/lib/season/types";
import { seasonEventGroups } from "@/lib/season/eventHistory";
import EventStatsPanel from "./EventStatsPanel";

export default function LiveEventStats({ tournament, season, champions }: { tournament: TournamentState; season: SeasonState | null; champions: readonly Champion[] }) {
	const group = useMemo(() => season && season.id === tournament.seasonId ? seasonEventGroups(season).find(g => g.tournaments.some(t => t.id === tournament.id)) : undefined, [season, tournament.id, tournament.seasonId]);
	const tournaments = useMemo(() => group ? group.tournaments.map(t => t.id === tournament.id ? tournament : t) : [tournament], [group, tournament]);
	const identity = useMemo(() => group?.identity ?? { id: tournament.id, label: tournament.name }, [group, tournament.id, tournament.name]);
	return <EventStatsPanel tournaments={tournaments} identity={identity} champions={champions} />;
}
