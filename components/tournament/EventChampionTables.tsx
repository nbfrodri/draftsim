"use client";

import { useMemo } from "react";
import type { Champion, Lane } from "@/lib/types";
import type { EventStats } from "@/lib/eventStats";
import { LANE_ORDER } from "@/lib/players";
import RoleLabel from "../RoleLabel";

const selectClass = "border border-rift-line bg-rift-bg px-2 py-1.5 text-xs text-rift-mutedbright focus-visible:outline focus-visible:outline-2 focus-visible:outline-rift-gold";

export interface ChampionTableFilters { role: Lane | "all"; limit: "10" | "all" }

export default function EventChampionTables({ stats, champions, lanes, filters, onFilterChange }: { stats: EventStats; champions: readonly Champion[]; lanes: Record<string, Lane[]>; filters: ChampionTableFilters; onFilterChange: (patch: Partial<ChampionTableFilters>) => void }) {
	const { role, limit } = filters;
	const byId = useMemo(() => new Map(champions.map(c => [c.id, c])), [champions]);
	return <section aria-label="Champion statistics" className="space-y-3 border-t border-rift-line/40 pt-4">
		<div className="flex flex-wrap items-center justify-between gap-3"><h4 className="font-display text-sm text-rift-goldbright">Champion statistics</h4><div className="flex flex-wrap items-center gap-2">
			<fieldset aria-label="Champion role" className="m-0 flex min-w-0 flex-wrap gap-1.5 border-0 p-0">{(["all", ...LANE_ORDER] as const).map(l => <button type="button" key={l} aria-pressed={l === role} onClick={() => onFilterChange({ role: l })} className={`inline-flex items-center gap-1.5 border px-2.5 py-1.5 text-[11px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-rift-gold ${l === role ? "border-rift-gold/50 bg-rift-gold/10 text-rift-goldbright" : "border-rift-line/50 text-rift-mutedbright hover:border-rift-gold/40 hover:text-rift-goldbright"}`}>{l === "all" ? "All" : <RoleLabel lane={l} size="sm" />}</button>)}</fieldset>
			<label className="text-xs text-rift-mutedbright">Show <select className={selectClass} aria-label="Champion limit" value={limit} onChange={e => onFilterChange({ limit: e.target.value as ChampionTableFilters["limit"] })}><option value="10">Top 10</option><option value="all">All</option></select></label>
		</div></div>
		<p className="text-xs text-rift-mutedbright">Completed games · picks use the played role; bans and presence use playable roles. WR always describes picked appearances. {role !== "all" && "Unknown playable roles are excluded from bans/presence filters."}</p>
		<div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(min(20rem,100%),1fr))]">{(["picks", "bans", "presenceGames"] as const).map(metric => {
			const rows = stats.champions.flatMap(c => {
				const info = byId.get(c.championId);
				const roleStats = role === "all" ? c : c.roles[role];
				if (metric !== "picks" && role !== "all" && !lanes[c.championId]?.includes(role)) return [];
				const value = metric === "picks" ? roleStats?.picks ?? 0 : c[metric];
				const wrStats = metric === "picks" ? roleStats : c;
				return value ? [{ c, info, value, wrStats }] : [];
			}).sort((a, b) => b.value - a.value || a.c.championId - b.c.championId);
			return <div key={metric} className="min-w-0 border border-rift-line/50 bg-rift-bg/30">
				<h5 className="border-b border-rift-line/40 px-3 py-2 font-display text-xs text-rift-goldbright">{metric === "picks" ? "Most Picked" : metric === "bans" ? "Most Banned" : "Presence"} <span className="font-body text-rift-mutedbright">· {rows.length}</span></h5>
				<div className="overflow-x-auto"><table className="w-full text-left text-xs tabular-nums"><thead className="border-b border-rift-line/40 text-[10px] uppercase tracking-wider text-rift-mutedbright"><tr><th className="whitespace-nowrap p-2">Champion</th><th className="whitespace-nowrap p-2">{metric === "presenceGames" ? "Games" : "Count"}</th><th className="whitespace-nowrap p-2">Rate</th><th className="whitespace-nowrap p-2">W–L</th><th className="whitespace-nowrap p-2">WR</th></tr></thead><tbody>{rows.slice(0, limit === "all" ? undefined : 10).map(({ c, info, value, wrStats }) => {
					const n = (wrStats?.wins ?? 0) + (wrStats?.losses ?? 0);
					const uniqueGames = metric === "bans" ? c.banGames : metric === "presenceGames" ? c.presenceGames : role === "all" ? c.pickGames : c.roles[role]?.games ?? 0;
					return <tr key={c.championId} className="border-b border-rift-line/20 text-rift-mutedbright transition-colors hover:bg-rift-gold/[0.04]"><td className="p-2"><span className="flex items-center gap-2">{info && <img src={info.iconUrl} alt="" width={24} height={24} className="h-6 w-6 shrink-0" />}<span>{info?.name ?? `Champion ${c.championId}`}</span></span></td><td className="p-2">{value}</td><td className="p-2">{stats.games ? `${Math.round(Math.min(uniqueGames, stats.games) / stats.games * 100)}%` : "—"}</td><td className="p-2 whitespace-nowrap">{n ? `${wrStats!.wins}–${wrStats!.losses}` : "—"}</td><td className="p-2" title={n < 3 ? "Small sample: fewer than 3 games" : `${n} picked games`}>{n ? `${Math.round(wrStats!.wins / n * 100)}%${n < 3 ? "*" : ""}` : "—"}</td></tr>;
				})}</tbody></table></div>{!rows.length && <p className="p-3 text-xs text-rift-mutedbright">No recorded appearances for this filter.</p>}
			</div>;
		})}</div><p className="text-xs text-rift-mutedbright">* Fewer than 3 picked games. Banned-only champions have no win rate.</p>
	</section>;
}
