"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { IconArrowsDiff, IconSearch, IconX } from "@tabler/icons-react";
import { LANE_ORDER } from "@/lib/players";
import { ssCompare, type SSPlayerIndexEntry, type SSSeasonView, type SSTimelineCell } from "@/lib/season/ssHistory";
import { LEAGUE_IDS } from "@/lib/season/types";
import { useEscapeLayer } from "@/lib/useEscapeLayer";
import { resolveTeamLogo } from "@/lib/season/realTeams";
import { roleLabel } from "@/lib/roles";
import { plural } from "@/lib/plural";
import PlayerNameLink from "../player/PlayerNameLink";
import TeamNameLink from "../team/TeamNameLink";
import { TIER_CLS } from "../season/TierChip";
import RegionMark from "../RegionMark";
import RoleLabel from "../RoleLabel";
import LaneIcon from "../LaneIcon";
import PlaygroundSelect from "./PlaygroundSelect";

export const SS_COMPARE_LIMIT = 4;
const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-rift-gold";
const th = "px-2 py-1.5 text-left text-[10px] font-semibold text-rift-mutedbright";
const td = "px-2 py-1.5 align-middle";

type Season = ReturnType<typeof ssCompare>["seasons"][number];
const seasonShort = (s: Season) => s.year !== undefined ? String(s.year) : s.name;
const phaseText = (cell: SSTimelineCell) => cell.state === "held" && cell.phases?.length ? cell.phases.map(p => p.label).join(", ") : "phase not recorded";

function cellLabel(season: Season, cell: SSTimelineCell) {
	if (cell.state === "unknown") return `${season.name}: SS not recorded`;
	if (cell.state === "none") return `${season.name}: no SS`;
	return `${season.name}: SS${cell.team ? ` with ${cell.team.teamName}` : ""} · ${phaseText(cell)}`;
}

function HeldTile({ season, cell }: { season: Season; cell: Extract<SSTimelineCell, { state: "held" }> }) {
	const phase = cell.phases?.at(-1);
	return <span title={cellLabel(season, cell)} className={`mx-auto flex size-8 items-center justify-center border ${TIER_CLS.SS}`}>
		{cell.team
			? <TeamNameLink teamId={cell.team.teamId} name={cell.team.teamName} leagueId={cell.team.leagueId} logoUrl={resolveTeamLogo(cell.team.teamName, cell.team.logoUrl)} logoSize={18} seasonId={season.seasonId} phaseScope={phase?.split ?? phase?.event} className="inline-flex items-center justify-center"><span className="sr-only">{cellLabel(season, cell)}</span></TeamNameLink>
			: <span className="font-display text-[10px] leading-none">SS<span className="sr-only">{cellLabel(season, cell)}</span></span>}
	</span>;
}

/** Up to four SS careers side by side; `picked` may be owned by the records panel so rows elsewhere can add players. */
export default function SSCompareTimelines({ views, players, picked: pickedProp, onPickedChange }: {
	views: readonly SSSeasonView[];
	players: readonly SSPlayerIndexEntry[];
	picked?: readonly string[];
	onPickedChange?: (ids: string[]) => void;
}) {
	const id = useId();
	const [ownPicked, setOwnPicked] = useState<string[]>([]);
	const picked = pickedProp ?? ownPicked;
	const setPicked = (next: string[]) => { if (onPickedChange) onPickedChange(next); else setOwnPicked(next); };
	const [query, setQuery] = useState("");
	const [role, setRole] = useState("all");
	const [region, setRegion] = useState("all");
	const [open, setOpen] = useState(false);
	const [active, setActive] = useState(0);
	const [message, setMessage] = useState("");
	const input = useRef<HTMLInputElement>(null);
	const list = useRef<HTMLUListElement>(null);
	const byId = useMemo(() => new Map(players.map(p => [p.playerId, p])), [players]);
	const matches = useMemo(() => players.filter(p => !picked.includes(p.playerId) && (role === "all" || p.lane === role) && (region === "all" || p.regions.some(l => l === region)) && (p.playerName ?? "Unknown player").toLowerCase().includes(query.trim().toLowerCase())), [players, picked, role, region, query]);
	const comparison = useMemo(() => ssCompare(views, picked), [views, picked]);
	const overlap = new Set(picked.length > 1 ? comparison.overlapSeasons : []);
	const activeIndex = Math.min(active, matches.length - 1);
	const full = picked.length >= SS_COMPARE_LIMIT;
	useEscapeLayer(open, () => setOpen(false), 200, false);
	useEffect(() => {
		if (open) list.current?.querySelectorAll('[role="option"]')[activeIndex]?.scrollIntoView({ block: "nearest" });
	}, [open, activeIndex]);
	const choose = (playerId: string) => {
		if (full) { setMessage("You can compare up to 4 players. Remove a player to add another."); return; }
		if (!picked.includes(playerId)) setPicked([...picked, playerId]);
		setQuery(""); setActive(0); setMessage(""); input.current?.focus(); setOpen(false);
	};
	const name = (p: SSPlayerIndexEntry | undefined, playerId: string, renderAs?: "span") => <PlayerNameLink playerId={playerId} name={p?.playerName} fallback="Unknown player" seasonId={p?.seasonId} phaseScope={p?.phases.at(-1)?.split ?? p?.phases.at(-1)?.event} renderAs={renderAs} className="min-w-0 truncate font-display text-rift-goldbright" />;

	return <section aria-label="Compare SS timelines" className="min-w-0 border border-rift-line/40 bg-rift-bg/30">
		<header className="flex flex-wrap items-center justify-between gap-2 border-b border-rift-line/30 px-3 py-2.5">
			<h4 className="inline-flex items-center gap-2 font-display text-rift-goldbright"><IconArrowsDiff size={15} className="text-rift-gold" aria-hidden />Compare timelines</h4>
			<span aria-label="Selected player count" className="border border-rift-line/50 px-2 py-0.5 text-[10px] tabular-nums text-rift-mutedbright">{picked.length}/{SS_COMPARE_LIMIT} players</span>
		</header>
		<div className="space-y-3 p-3">
			<p className="text-rift-mutedbright">Pick any recorded SS holder here or with Compare in the records above. Gold columns are seasons every selected player held SS.</p>
			<div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
				<div className="relative col-span-2 min-w-0 sm:col-span-1" onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
					<label htmlFor={id} className="mb-1.5 block text-[10px] text-rift-mutedbright">Find an SS holder</label>
					<IconSearch size={14} aria-hidden className="pointer-events-none absolute bottom-2.5 left-2.5 text-rift-mutedbright" />
					<input ref={input} id={id} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-list`} aria-activedescendant={open && activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined} autoComplete="off" placeholder={full ? "Remove a player to add another" : "Search players…"} value={query}
						className={`min-h-8 w-full border border-rift-line/60 bg-rift-bg py-1.5 pl-8 pr-2.5 text-rift-goldbright ${focusRing}`}
						onChange={event => { setQuery(event.target.value); setActive(0); setOpen(true); }} onFocus={() => setOpen(true)} onClick={() => setOpen(true)} onKeyDown={event => {
							if (event.key === "Tab") { setOpen(false); return; }
							if (["ArrowDown", "ArrowUp"].includes(event.key)) { event.preventDefault(); setOpen(true); setActive(current => !open ? event.key === "ArrowDown" ? 0 : Math.max(0, matches.length - 1) : Math.max(0, Math.min(matches.length - 1, current + (event.key === "ArrowDown" ? 1 : -1)))); }
							if (open && (event.key === "Home" || event.key === "End") && event.altKey) { event.preventDefault(); setActive(event.key === "Home" ? 0 : Math.max(0, matches.length - 1)); }
							if (event.key === "Enter" && open) { event.preventDefault(); if (matches[activeIndex]) choose(matches[activeIndex].playerId); }
						}} />
					{open && <div className="absolute left-0 right-0 top-full z-30 mt-1 border border-rift-gold/50 bg-rift-panel shadow-xl">
						<ul ref={list} id={`${id}-list`} role="listbox" aria-label="SS holder results" className="max-h-64 overflow-y-auto" onMouseDown={event => event.preventDefault()}>
							{matches.map((p, index) => <li key={p.playerId} id={`${id}-option-${index}`} role="option" aria-label={`${p.playerName ?? "Unknown player"} · ${p.lane} · ${p.regions.join(", ") || "Region unknown"}`} aria-selected={index === activeIndex} aria-disabled={full} onMouseEnter={() => setActive(index)} onClick={() => choose(p.playerId)} className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2 ${index === activeIndex ? "bg-rift-gold/10" : ""}`}>
								<span className="flex min-w-0 items-center gap-2"><RoleLabel lane={p.lane} size="sm" />{name(p, p.playerId, "span")}</span>
								<span className="inline-flex shrink-0 items-center gap-1.5 text-[10px] text-rift-mutedbright">{p.regions.map(l => <RegionMark key={l} league={l} size={12} />)}{plural(p.seasons, "season")}</span>
							</li>)}
						</ul>{!matches.length && <p className="px-3 py-3 text-rift-mutedbright">No matching unselected SS holders.</p>}
					</div>}
				</div>
				<PlaygroundSelect label="Role" ariaLabel="Compare role" value={role} onChange={value => { setRole(value); setActive(0); }} options={[{ value: "all", label: "All roles" }, ...LANE_ORDER.map(lane => ({ value: lane, label: roleLabel(lane), icon: <LaneIcon lane={lane} size="sm" /> }))]} />
				<PlaygroundSelect label="Region" ariaLabel="Compare region" value={region} onChange={value => { setRegion(value); setActive(0); }} options={[{ value: "all", label: "All regions" }, ...LEAGUE_IDS.map(l => ({ value: l, label: l, icon: <RegionMark league={l} size={14} /> }))]} />
			</div>
			<p role="status" className="text-[10px] text-rift-mutedbright">{message || (full ? "You can compare up to 4 players. Remove a player to add another." : `${plural(matches.length, "matching holder")} · ${picked.length}/${SS_COMPARE_LIMIT} selected`)}</p>
			{picked.length > 0 ? <ul aria-label="Selected players" className="flex flex-wrap gap-1.5">{picked.map(playerId => {
				const p = byId.get(playerId);
				return <li key={playerId} className="inline-flex max-w-full items-center gap-1.5 border border-rift-gold/50 bg-rift-gold/10 py-0.5 pl-2 pr-0.5">
					{p?.lane && <LaneIcon lane={p.lane} size="sm" />}{name(p, playerId)}
					<button type="button" aria-label={`Remove ${p?.playerName ?? "Unknown player"}`} className={`inline-flex size-6 items-center justify-center text-rift-mutedbright hover:text-rift-goldbright ${focusRing}`} onClick={() => { setPicked(picked.filter(x => x !== playerId)); setMessage(""); input.current?.focus(); }}><IconX size={13} aria-hidden /></button>
				</li>;
			})}</ul> : <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Quick picks"><span className="text-[10px] text-rift-mutedbright">Quick picks</span>{matches.slice(0, 4).map(p => <button type="button" key={p.playerId} className={`inline-flex items-center gap-1.5 border border-rift-line/50 px-2 py-1 hover:border-rift-gold/60 ${focusRing}`} onClick={() => choose(p.playerId)}><LaneIcon lane={p.lane} size="sm" />{name(p, p.playerId, "span")}</button>)}</div>}

			{comparison.rows.length > 0 && <>
				<p className="text-[10px] text-rift-mutedbright sm:hidden">Scroll horizontally to see every season →</p>
				<div className="relative max-w-full overflow-x-auto border border-rift-line/30" role="region" aria-label="Scrollable SS timelines" tabIndex={0}>
					<table aria-label="SS timeline comparison" className="w-full border-collapse text-xs">
						<thead><tr className="border-b border-rift-line/40">
							<th scope="col" className={`${th} sticky left-0 z-10 min-w-[128px] bg-rift-panel`}>Player</th>
							{comparison.seasons.map(s => {
								const shared = overlap.has(s.seasonId);
								return <th key={s.seasonId} scope="col" title={s.name} data-overlap={shared || undefined} className={`min-w-11 px-1 py-1.5 text-center text-[10px] font-semibold tabular-nums ${shared ? "bg-rift-gold/20 text-rift-goldbright" : "text-rift-mutedbright"}`}>
									{seasonShort(s)}<span className="sr-only">{` · ${s.name}${shared ? " · Shared SS season" : ""}${s.known ? "" : " · not recorded"}`}</span>
								</th>;
							})}
						</tr></thead>
						<tbody className="divide-y divide-rift-line/20">{comparison.rows.map(row => {
							const p = byId.get(row.playerId);
							return <tr key={row.playerId}>
								<th scope="row" className={`${td} sticky left-0 z-10 max-w-[160px] bg-rift-panel text-left font-normal`}><span className="flex min-w-0 items-center gap-1.5">{p?.lane && <LaneIcon lane={p.lane} size="sm" />}{name(p, row.playerId)}</span></th>
								{row.cells.map((cell, index) => {
									const season = comparison.seasons[index];
									const shared = overlap.has(season.seasonId);
									return <td key={season.seasonId} data-overlap={shared || undefined} className={`px-1 py-1.5 text-center ${shared ? "bg-rift-gold/10" : ""}`}>
										{cell.state === "held" ? <HeldTile season={season} cell={cell} />
											: <span title={cellLabel(season, cell)} className={`mx-auto flex size-8 items-center justify-center text-rift-mutedbright ${cell.state === "unknown" ? "border border-dashed border-rift-line/50" : ""}`}>{cell.state === "unknown" ? "?" : <span aria-hidden className="size-1 rounded-full bg-rift-line" />}<span className="sr-only">{cellLabel(season, cell)}</span></span>}
									</td>;
								})}
							</tr>;
						})}</tbody>
					</table>
				</div>
				<p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-rift-mutedbright">
					<span className="inline-flex items-center gap-1.5"><span aria-hidden className={`size-3 border ${TIER_CLS.SS}`} />Held SS (team logo)</span>
					<span className="inline-flex items-center gap-1.5"><span aria-hidden className="size-1 rounded-full bg-rift-line" />No SS</span>
					<span className="inline-flex items-center gap-1.5"><span aria-hidden className="inline-flex size-3 items-center justify-center border border-dashed border-rift-line/50 text-[8px]">?</span>Not recorded</span>
					<span className="inline-flex items-center gap-1.5"><span aria-hidden className="size-3 bg-rift-gold/20" />Shared season</span>
				</p>
				<div role="region" aria-label="Scrollable SS summary" tabIndex={0} className={`relative max-w-full overflow-x-auto ${focusRing}`}>
					<table aria-label="SS comparison summary" className="w-full min-w-[480px] border-collapse text-xs">
						<thead><tr className="border-b border-rift-line/40">{["Player", "SS seasons", "Longest streak", "First – last", "Teams", "Regions"].map(label => <th key={label} scope="col" className={`${th} whitespace-nowrap`}>{label}</th>)}</tr></thead>
						<tbody className="divide-y divide-rift-line/20">{comparison.rows.map(row => <tr key={row.playerId}>
							<th scope="row" className={`${td} text-left font-normal`}>{name(byId.get(row.playerId), row.playerId)}</th>
							<td className={`${td} tabular-nums`}>{row.summary.seasons}</td>
							<td className={`${td} whitespace-nowrap`}>{row.summary.longestStreak ? `${row.summary.longestStreak.open ? "At least " : ""}${plural(row.summary.longestStreak.length, "year")}` : "Unknown"}</td>
							<td className={`${td} whitespace-nowrap`}>{row.summary.firstSeason ? `${row.summary.firstSeason.name}${row.summary.lastSeason && row.summary.lastSeason.seasonId !== row.summary.firstSeason.seasonId ? ` – ${row.summary.lastSeason.name}` : ""}` : "Unknown"}</td>
							<td className={`${td} tabular-nums`}>{row.summary.distinctTeams || "Unknown"}</td>
							<td className={td}><span className="inline-flex gap-1.5">{row.summary.regions.length ? row.summary.regions.map(l => <RegionMark key={l} league={l} size={14} />) : "Unknown"}</span></td>
						</tr>)}</tbody>
					</table>
				</div>
			</>}
		</div>
	</section>;
}
