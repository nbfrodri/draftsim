"use client";

import { useMemo, useState } from "react";
import { IconChartBar } from "@tabler/icons-react";
import { useDraftStore } from "@/store/draftStore";
import { isDesktop } from "@/lib/desktopStorage";
import { isRealityHistoryLoaded } from "@/lib/desktopSqlite";
import { LANE_ORDER } from "@/lib/players";
import { rankEventPlayers } from "@/lib/eventStats";
import { plural } from "@/lib/plural";
import type { Lane } from "@/lib/types";
import type { SeasonHistoryEntry } from "@/lib/season/history";
import { LEAGUE_IDS, type LeagueId } from "@/lib/season/types";
import { aggregateAllTimeEventStats, allTimeEventYears, type AllTimeEventFilters, type AllTimeEventKind, type AllTimeEventPin } from "@/lib/season/allTimeEventStats";
import CollapsibleSection from "../CollapsibleSection";
import PlayerNameLink from "../player/PlayerNameLink";
import RoleLabel from "../RoleLabel";
import RegionMark from "../RegionMark";
import EventChampionTables, { type ChampionTableFilters } from "../tournament/EventChampionTables";
import PlaygroundSelect from "./PlaygroundSelect";
import TeamNameLink from "../team/TeamNameLink";
import ChipRow from "../ChipRow";
import SplitIcon from "../season/SplitIcon";
import EventIdentityIcon from "../tournament/EventIdentityIcon";

const segment = "inline-flex items-center gap-1.5 border px-2.5 py-1.5 text-[11px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-rift-gold";
const segmentState = (on: boolean) => on ? "border-rift-gold/50 bg-rift-gold/10 text-rift-goldbright" : "border-rift-line/50 text-rift-mutedbright hover:border-rift-gold/40 hover:text-rift-goldbright";
const EVENT_OPTIONS: { value: AllTimeEventKind; label: string }[] = [
	{ value: "all", label: "All" }, { value: "domestic", label: "Domestic" }, { value: "international", label: "International" },
	{ value: "winter", label: "Winter" }, { value: "spring", label: "Spring" }, { value: "summer", label: "Summer" },
	{ value: "first-stand", label: "First Stand" }, { value: "msi", label: "MSI" }, { value: "worlds", label: "Worlds" }, { value: "global-cup", label: "Global Cup" },
];
const avg = (sum: number, n: number) => n ? (sum / n).toFixed(2) : "—";
const pinHint = (pin?: AllTimeEventPin) => pin ? {
	archive: pin.archive,
	coverageLabel: pin.fromYear === undefined ? "Records cover undated seasons" : `Records cover Year ${pin.fromYear}${pin.toYear !== pin.fromYear ? ` – Year ${pin.toYear}` : ""}${pin.undated ? " and undated seasons" : ""}`,
} : undefined;

/** Lazily mounted, so the aggregation only runs after the panel is first opened. */
export default function AllTimeEventStats({ entries }: { entries: readonly SeasonHistoryEntry[] }) {
	return <CollapsibleSection headingLevel={3} ariaLabel="All-time event statistics" label="All-time event statistics" className="" headingClassName="font-display text-sm"
		icon={<IconChartBar size={15} className="shrink-0 text-rift-gold" aria-hidden="true" />} summary={<span className="hidden sm:inline">Players &amp; champions across years</span>}>
		<Body entries={entries} />
	</CollapsibleSection>;
}

function Body({ entries }: { entries: readonly SeasonHistoryEntry[] }) {
	const realities = useDraftStore(s => s.realities);
	const champions = useDraftStore(s => s.champions);
	const [scope, setScope] = useState<"current" | "all">("current");
	const [event, setEvent] = useState<AllTimeEventKind>("all");
	const [leagueId, setLeagueId] = useState<LeagueId | "all">("all");
	const [from, setFrom] = useState("");
	const [to, setTo] = useState("");
	const [lane, setLane] = useState<Lane>("top");
	const [limit, setLimit] = useState<"10" | "all">("10");
	const [champFilters, setChampFilters] = useState<ChampionTableFilters>({ role: "all", limit: "10" });

	// Dormant realities are never loaded or written here; only histories already in memory count.
	const { histories, skipped } = useMemo(() => {
		if (scope === "current") return { histories: [entries], skipped: 0 };
		const loaded: (readonly SeasonHistoryEntry[])[] = [];
		let skipped = 0;
		for (const r of realities) {
			if (!isDesktop() || isRealityHistoryLoaded(r.id) || r.history.length > 0) loaded.push(r.history);
			else skipped++;
		}
		return { histories: loaded, skipped };
	}, [scope, entries, realities]);
	const years = useMemo(() => allTimeEventYears(histories), [histories]);
	const filters = useMemo<AllTimeEventFilters>(() => ({ event, leagueId, fromYear: from ? Number(from) : null, toYear: to ? Number(to) : null }), [event, leagueId, from, to]);
	const data = useMemo(() => aggregateAllTimeEventStats(histories, filters), [histories, filters]);
	const ranked = useMemo(() => rankEventPlayers(data.stats.players, lane), [data.stats.players, lane]);
	const { coverage } = data;
	const yearOptions = (blank: string) => [{ value: "", label: blank }, ...years.map(y => ({ value: String(y), label: `Year ${y}` }))];
	const rows = limit === "all" ? ranked : ranked.slice(0, 10);
	const domestic = event === "all" || event === "domestic" || event === "winter" || event === "spring" || event === "summer";

	return <div className="space-y-4 p-3 md:p-4">
		<div className="flex flex-wrap gap-3">
			<PlaygroundSelect label="Reality" ariaLabel="Reality scope" value={scope} onChange={v => setScope(v as "current" | "all")} options={[{ value: "current", label: "Selected history" }, ...(realities.length ? [{ value: "all", label: "All realities" }] : [])]} />
			<PlaygroundSelect label="From" ariaLabel="From year" value={from} onChange={setFrom} options={yearOptions("Earliest")} />
			<PlaygroundSelect label="To" ariaLabel="To year" value={to} onChange={setTo} options={yearOptions("Latest")} />
		</div>
		<ChipRow label="Event" value={event} onChange={v => {
			setEvent(v as AllTimeEventKind);
			if (!["all", "domestic", "winter", "spring", "summer"].includes(v)) setLeagueId("all");
		}} options={EVENT_OPTIONS.map(option => ({ ...option, icon: option.value === "winter" || option.value === "spring" || option.value === "summer" ? <SplitIcon split={option.value} size={16} /> : <EventIdentityIcon identity={option.value === "first-stand" || option.value === "msi" || option.value === "worlds" || option.value === "global-cup" ? { event: option.value } : {}} size={16} /> }))} />
		{domestic && <ChipRow label="Region" value={leagueId} onChange={v => setLeagueId(v as LeagueId | "all")} options={[{ value: "all", label: "All regions" }, ...LEAGUE_IDS.map(l => ({ value: l, label: l, icon: <RegionMark league={l} size={14} /> }))]} />}
		<p role="status" className="text-[11px] leading-relaxed text-rift-mutedbright">
			{plural(coverage.events, "event")} from {plural(coverage.recordedSeasons, "season")} · {plural(data.stats.games, "completed game")}.{" "}
			<span className={coverage.unrecordedSeasons ? "text-rift-goldbright" : ""}>Not recorded: {coverage.unrecordedSeasons} of {plural(coverage.seasons, "season")}</span>
			{coverage.unrecordedSeasons > 0 && " (older archives without event statistics; unknown, not counted as zero)"}.
			{coverage.excludedSeasons > 0 && ` ${plural(coverage.excludedSeasons, "season")} outside the year range.`}
			{leagueId !== "all" && " A region filter covers domestic events only."}
			{scope === "all" && ` Only realities with history loaded in memory are included${skipped ? ` (${plural(skipped, "reality", "realities")} not loaded yet; open them in the Hall to include them)` : ""}.`}
		</p>
		<div className="flex flex-wrap items-end justify-between gap-2">
			<fieldset aria-label="All-time player role" className="m-0 flex min-w-0 flex-wrap gap-1.5 border-0 p-0">{LANE_ORDER.map(role => <button type="button" key={role} aria-pressed={role === lane} onClick={() => setLane(role)} className={`${segment} ${segmentState(role === lane)}`}><RoleLabel lane={role} size="sm" /></button>)}</fieldset>
			<PlaygroundSelect label="Show" ariaLabel="Player limit" value={limit} onChange={v => setLimit(v as "10" | "all")} options={[{ value: "10", label: "Top 10" }, { value: "all", label: "All players" }]} />
		</div>
		<div className="overflow-x-auto border border-rift-line/40"><table aria-label={`All-time ${lane} player rankings`} className="w-full text-left text-xs tabular-nums"><thead className="border-b border-rift-line/40 bg-rift-bg/40 text-[10px] uppercase tracking-wider text-rift-mutedbright"><tr>{["Rank", "Player / team", "Score", "Avg grade", "Games", "WR"].map((h, i) => <th key={h} scope="col" className={`whitespace-nowrap px-2 py-2 font-semibold ${i > 1 ? "text-right" : ""}`}>{h}</th>)}</tr></thead><tbody>{rows.map((p, i) => <tr key={p.key} className="border-b border-rift-line/25 text-rift-mutedbright last:border-b-0 hover:bg-rift-gold/[0.04]">
			<td className="px-2 py-3 font-display text-rift-goldbright">#{i + 1}</td>
			<td className="px-2 py-3"><span className="inline-flex items-center gap-1.5"><RoleLabel lane={p.lane} className="text-[10px]" /><PlayerNameLink playerId={p.playerId} name={p.name} seasonId={data.playerPins[p.key]?.seasonId} phaseScope={data.playerPins[p.key]?.phaseScope} hint={{ name: p.name, lane: p.lane, ...pinHint(data.playerPins[p.key]) }} className="font-display text-rift-goldbright" /></span>
				<div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px]">{p.teams.map(t => {
					const pin = data.teamPins[`${t.leagueId ?? ""}|${t.name}`];
					return <TeamNameLink key={`${t.leagueId}|${t.name}`} teamId={t.id} name={t.name} leagueId={t.leagueId} logoUrl={t.logoUrl} seasonId={pin?.seasonId} phaseScope={pin?.phaseScope} hint={{ name: t.name, leagueId: t.leagueId, logoUrl: t.logoUrl, ...pinHint(pin) }} logoSize={14} className="inline-flex items-center gap-1.5" />;
				})}</div>
				{!p.qualified && <p className="mt-1 text-[10px]">{p.score === null ? "Partial scoring evidence" : `Provisional · ${p.rated}/${p.required} rated games`}</p>}</td>
			<td className="px-2 py-3 text-right font-display text-rift-goldbright">{p.score?.toFixed(2) ?? "—"}</td>
			<td className="px-2 py-3 text-right" title={`${p.rated} rated games`}>{avg(p.ratingSum, p.rated)}</td>
			<td className="px-2 py-3 text-right">{p.games}</td>
			<td className="px-2 py-3 text-right">{Math.round(p.wins / p.games * 100)}%</td>
		</tr>)}</tbody></table>{!ranked.length && <p className="px-3 py-5 text-xs text-rift-mutedbright">No identified participants with recorded games in this role for these filters.</p>}</div>
		<p className="text-[11px] text-rift-mutedbright">Event performance only, summed per player and role across the selected events with the same score and qualification rules as single events. Unknown evidence is not zero.</p>
		<EventChampionTables stats={data.stats} champions={champions} lanes={data.lanes} filters={champFilters} onFilterChange={patch => setChampFilters(c => ({ ...c, ...patch }))} />
	</div>;
}
