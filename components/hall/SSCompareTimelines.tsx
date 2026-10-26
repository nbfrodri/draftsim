"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { LANE_ORDER } from "@/lib/players";
import { ssCompare, type SSPlayerIndexEntry, type SSSeasonView } from "@/lib/season/ssHistory";
import { LEAGUE_IDS } from "@/lib/season/types";
import { useEscapeLayer } from "@/lib/useEscapeLayer";
import { resolveTeamLogo } from "@/lib/season/realTeams";
import { roleLabel } from "@/lib/roles";
import { plural } from "@/lib/plural";
import PlayerNameLink from "../player/PlayerNameLink";
import TeamNameLink from "../team/TeamNameLink";
import SSBadge from "../SSBadge";
import RegionMark from "../RegionMark";
import RoleLabel from "../RoleLabel";
import LaneIcon from "../LaneIcon";
import PlaygroundSelect from "./PlaygroundSelect";
import SSPhaseIcons from "./SSPhaseIcons";

const buttonClass = "inline-flex items-center gap-1.5 border border-rift-line/50 px-2 py-1.5 text-rift-goldbright hover:border-rift-gold/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rift-gold";
const cellClass = "border-b border-rift-line/30 px-3 py-3 text-left";

export default function SSCompareTimelines({ views, players }: { views: readonly SSSeasonView[]; players: readonly SSPlayerIndexEntry[] }) {
	const id = useId();
	const [picked, setPicked] = useState<string[]>([]);
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
	useEscapeLayer(open, () => setOpen(false), 200, false);
	useEffect(() => {
		if (open) list.current?.querySelectorAll('[role="option"]')[activeIndex]?.scrollIntoView({ block: "nearest" });
	}, [open, activeIndex]);
	const choose = (playerId: string) => {
		if (picked.length >= 4) { setMessage("You can compare up to 4 players. Remove a player to add another."); return; }
		setPicked(current => current.includes(playerId) ? current : [...current, playerId]);
		setQuery(""); setActive(0); setMessage(""); input.current?.focus(); setOpen(false);
	};
	const name = (p: SSPlayerIndexEntry, renderAs?: "span") => <PlayerNameLink playerId={p.playerId} name={p.playerName} fallback="Unknown player" seasonId={p.seasonId} phaseScope={p.phases.at(-1)?.split ?? p.phases.at(-1)?.event} renderAs={renderAs} className="font-display text-rift-goldbright" />;

	return <section aria-label="Compare SS timelines" className="min-w-0 space-y-3">
		<div className="flex flex-wrap items-baseline justify-between gap-2"><h4 className="font-display text-rift-goldbright">Compare timelines</h4><span className="text-rift-mutedbright" aria-label="Selected player count">{picked.length}/4 players</span></div>
		<p className="text-rift-mutedbright">Search every recorded SS holder. Highlighted seasons are years in which every selected player held SS, even at different reviews.</p>
		<div className="flex flex-wrap items-end gap-3">
			<div className="relative min-w-0 flex-1 basis-56" onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
				<label htmlFor={id} className="mb-1.5 block text-[10px] text-rift-mutedbright">Find an SS holder</label>
				<input ref={input} id={id} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-list`} aria-activedescendant={open && activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined} autoComplete="off" placeholder="Search players…" value={query}
					className="min-h-8 w-full border border-rift-line/60 bg-rift-bg px-2.5 py-1.5 text-rift-goldbright focus-visible:outline focus-visible:outline-2 focus-visible:outline-rift-gold"
					onChange={event => { setQuery(event.target.value); setActive(0); setOpen(true); }} onFocus={() => setOpen(true)} onClick={() => setOpen(true)} onKeyDown={event => {
						if (event.key === "Tab") { setOpen(false); return; }
						if (["ArrowDown", "ArrowUp"].includes(event.key)) { event.preventDefault(); setOpen(true); setActive(current => !open ? event.key === "ArrowDown" ? 0 : Math.max(0, matches.length - 1) : Math.max(0, Math.min(matches.length - 1, current + (event.key === "ArrowDown" ? 1 : -1)))); }
						if (open && (event.key === "Home" || event.key === "End") && event.altKey) { event.preventDefault(); setActive(event.key === "Home" ? 0 : Math.max(0, matches.length - 1)); }
						if (event.key === "Enter" && open) { event.preventDefault(); if (matches[activeIndex]) choose(matches[activeIndex].playerId); }
					}} />
				{open && <div className="absolute left-0 right-0 top-full z-30 mt-1 border border-rift-gold/50 bg-rift-panel shadow-xl">
					<ul ref={list} id={`${id}-list`} role="listbox" aria-label="SS holder results" className="max-h-64 overflow-y-auto" onMouseDown={event => event.preventDefault()}>
						{matches.map((p, index) => <li key={p.playerId} id={`${id}-option-${index}`} role="option" aria-label={`${p.playerName ?? "Unknown player"} · ${p.lane} · ${p.regions.join(", ") || "Region unknown"}`} aria-selected={index === activeIndex} aria-disabled={picked.length >= 4} onMouseEnter={() => setActive(index)} onClick={() => choose(p.playerId)} className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2 ${index === activeIndex ? "bg-rift-gold/10" : ""}`}>
							<span className="flex min-w-0 items-center gap-2"><RoleLabel lane={p.lane} size="sm" />{name(p, "span")}</span><span className="shrink-0 text-[10px] text-rift-mutedbright">{p.regions.join(" · ") || "Region unknown"} · {plural(p.seasons, "season")}</span>
						</li>)}
					</ul>{!matches.length && <p className="px-3 py-3 text-rift-mutedbright">No matching unselected SS holders.</p>}
				</div>}
			</div>
			<PlaygroundSelect label="Role" ariaLabel="Compare role" value={role} onChange={value => { setRole(value); setActive(0); }} options={[{ value: "all", label: "All roles" }, ...LANE_ORDER.map(lane => ({ value: lane, label: roleLabel(lane), icon: <LaneIcon lane={lane} size="sm" /> }))]} />
			<PlaygroundSelect label="Region" ariaLabel="Compare region" value={region} onChange={value => { setRegion(value); setActive(0); }} options={[{ value: "all", label: "All regions" }, ...LEAGUE_IDS.map(l => ({ value: l, label: l, icon: <RegionMark league={l} size={14} /> }))]} />
		</div>
		<p role="status" className="text-rift-mutedbright">{message || (picked.length === 4 ? "You can compare up to 4 players. Remove a player to add another." : `${matches.length} matching holders · ${picked.length}/4 selected`)}</p>
		{picked.length > 0 ? <ul aria-label="Selected players" className="flex flex-wrap gap-2">{picked.map(playerId => {
			const p = byId.get(playerId)!;
			return <li key={playerId} className="inline-flex max-w-full items-center gap-2 border border-rift-gold/50 bg-rift-gold/10 pl-2">{name(p)}<button type="button" aria-label={`Remove ${p.playerName ?? "Unknown player"}`} className={`${buttonClass} border-0`} onClick={() => { setPicked(current => current.filter(x => x !== playerId)); setMessage(""); input.current?.focus(); }}>×</button></li>;
		})}</ul> : <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Quick picks"><span className="text-rift-mutedbright">Quick picks</span>{matches.slice(0, 4).map(p => <button type="button" key={p.playerId} className={buttonClass} onClick={() => choose(p.playerId)}>{name(p, "span")}</button>)}</div>}
		{comparison.rows.length > 0 && <>
			<p className="text-[10px] text-rift-mutedbright sm:hidden">Scroll horizontally to see every season →</p>
			<div className="max-w-full overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-rift-gold" role="region" aria-label="Scrollable SS timelines" tabIndex={0}>
				<table aria-label="SS timeline comparison" className="w-full border-collapse text-xs"><thead><tr><th scope="col" className={`${cellClass} sticky left-0 z-10 min-w-[160px] bg-rift-panel text-rift-mutedbright`}>Player</th>{comparison.seasons.map(s => <th key={s.seasonId} scope="col" data-overlap={overlap.has(s.seasonId) || undefined} className={`${cellClass} min-w-[160px] ${overlap.has(s.seasonId) ? "bg-rift-gold/15 text-rift-goldbright" : "text-rift-mutedbright"}`}><span className="block whitespace-nowrap">{s.name}</span><SSPhaseIcons phases={s.phases} />{overlap.has(s.seasonId) && <span className="block text-[10px] font-normal">Shared SS season</span>}</th>)}</tr></thead>
					<tbody>{comparison.rows.map(row => <tr key={row.playerId}><th scope="row" className={`${cellClass} sticky left-0 z-10 bg-rift-panel`}>{name(byId.get(row.playerId)!)}</th>{row.cells.map((cell, index) => {
						const season = comparison.seasons[index];
						const phase = cell.state === "held" ? cell.phases?.at(-1) : undefined;
						return <td key={season.seasonId} data-overlap={overlap.has(season.seasonId) || undefined} className={`${cellClass} ${overlap.has(season.seasonId) ? "bg-rift-gold/10" : ""}`}>
							{cell.state === "held" ? <div className="space-y-1.5"><span className="inline-flex items-center gap-2"><span aria-label="Held SS"><SSBadge /></span><SSPhaseIcons phases={cell.phases} /></span>{cell.team ? <TeamNameLink teamId={cell.team.teamId} name={cell.team.teamName} leagueId={cell.team.leagueId} logoUrl={resolveTeamLogo(cell.team.teamName, cell.team.logoUrl)} seasonId={season.seasonId} phaseScope={phase?.split ?? phase?.event} className="flex items-center gap-1.5 text-rift-mutedbright" /> : <span className="block text-[10px] text-rift-mutedbright">Team unknown</span>}</div> : <span className="text-rift-mutedbright" aria-label={cell.state === "unknown" ? "Not recorded" : "Did not hold SS"}>{cell.state === "unknown" ? "?" : "–"}</span>}
						</td>;
					})}</tr>)}</tbody>
				</table>
			</div>
			<p className="text-[10px] text-rift-mutedbright">SS = recorded ownership · – = no recorded ownership in a recorded season · ? = season not recorded. Team and phase details may be unknown.</p>
			<div role="region" aria-label="Scrollable SS summary" tabIndex={0} className="max-w-full overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-rift-gold"><table aria-label="SS comparison summary" className="w-full text-xs"><thead><tr>{["Player", "SS seasons", "Longest streak", "First season", "Last season", "Distinct teams", "Regions"].map(label => <th key={label} scope="col" className={`${cellClass} whitespace-nowrap text-rift-mutedbright`}>{label}</th>)}</tr></thead><tbody>{comparison.rows.map(row => <tr key={row.playerId}>
				<th scope="row" className={cellClass}>{name(byId.get(row.playerId)!)}</th><td className={`${cellClass} tabular-nums`}>{row.summary.seasons}</td><td className={`${cellClass} whitespace-nowrap`}>{row.summary.longestStreak ? `${row.summary.longestStreak.open ? "At least " : ""}${plural(row.summary.longestStreak.length, "year")}` : "Unknown"}</td><td className={`${cellClass} whitespace-nowrap`}>{row.summary.firstSeason?.name ?? "Unknown"}</td><td className={`${cellClass} whitespace-nowrap`}>{row.summary.lastSeason?.name ?? "Unknown"}</td><td className={`${cellClass} tabular-nums`}>{row.summary.distinctTeams || "Unknown"}</td><td className={cellClass}><span className="inline-flex gap-2">{row.summary.regions.length ? row.summary.regions.map(l => <RegionMark key={l} league={l} size={16} />) : "Unknown"}</span></td>
			</tr>)}</tbody></table></div>
		</>}
	</section>;
}
