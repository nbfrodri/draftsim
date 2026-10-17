"use client";

import { useMemo, useState } from "react";
import { IconChevronDown, IconChartBar } from "@tabler/icons-react";
import type { Champion, Lane } from "@/lib/types";
import type { TournamentState } from "@/lib/tournament";
import { LANE_ORDER } from "@/lib/players";
import { rankEventPlayers, type EventPlayer } from "@/lib/eventStats";
import { buildEventRecord, eventCheckpointPlayers, type EventRecord } from "@/lib/season/eventHistory";
import { resolveTeamLogo } from "@/lib/season/realTeams";
import PlayerNameLink from "../player/PlayerNameLink";
import TeamNameLink from "../team/TeamNameLink";
import LaneIcon from "../LaneIcon";
import SplitIcon from "../season/SplitIcon";
import LeagueIcon from "../LeagueIcon";
import EventChampionTables, { type ChampionTableFilters } from "./EventChampionTables";

type Props = { champions: readonly Champion[]; seasonId?: string } & ({ record: EventRecord; tournaments?: never; identity?: never } | { record?: never; tournaments: readonly TournamentState[]; identity: Omit<EventRecord, "version" | "scopes" | "championLanes"> });
const control = "border border-rift-line/60 bg-rift-bg px-2 py-1.5 text-xs text-rift-mutedbright focus-visible:outline focus-visible:outline-rift-gold";
const avg = (sum: number, n: number, digits = 2) => n ? (sum / n).toFixed(digits) : "—";
interface View { scopeId: string; lane: Lane; point: string; sort: string; champions: ChampionTableFilters }

export default function EventStatsPanel(props: Props) {
	const [open, setOpen] = useState(false);
	const [view, setView] = useState<View>({ scopeId: "all", lane: "top", point: "current", sort: "performance", champions: { role: "all", limit: "10" } });
	const identity = props.record ?? props.identity;
	return <section aria-label={`${identity.label} event statistics`} className="my-3 min-w-0 border border-rift-line/50 bg-rift-panel/30">
		<button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-3 py-3 text-left text-sm text-rift-goldbright focus-visible:outline focus-visible:outline-rift-gold">
			{identity.split ? <SplitIcon split={identity.split} size={16} /> : identity.event ? <LeagueIcon league={identity.event} size={16} /> : <IconChartBar size={16} />}
			<span className="min-w-0 flex-1 font-display">{identity.label} · Player Rankings</span><span className="hidden text-xs text-rift-mutedbright sm:inline">Players &amp; champions</span><IconChevronDown size={16} className={open ? "rotate-180" : ""} />
		</button>
		{open && <EventStatsContent {...props} view={view} updateView={patch => setView(current => ({ ...current, ...patch }))} />}
	</section>;
}

function EventStatsContent(props: Props & { view: View; updateView: (patch: Partial<View>) => void }) {
	const record = useMemo(() => props.record ?? buildEventRecord(props.tournaments, props.identity), [props.record, props.tournaments, props.identity]);
	const { scopeId, lane, point, sort } = props.view;
	const setScope = (scopeId: string) => props.updateView({ scopeId, point: "current" });
	const setLane = (lane: Lane) => props.updateView({ lane });
	const setPoint = (point: string) => props.updateView({ point });
	const setSort = (sort: string) => props.updateView({ sort });
	const scope = record.scopes.find(s => s.id === scopeId) ?? record.scopes[0];
	const pointIndex = scope.checkpoints.findIndex(c => c.id === point);
	const checkpoint = scope.checkpoints[pointIndex];
	const players = useMemo(() => checkpoint ? eventCheckpointPlayers(scope, checkpoint) : scope.stats.players, [scope, checkpoint]);
	const ranked = useMemo(() => rankEventPlayers(players, lane), [players, lane]);
	const previous = scope.checkpoints[pointIndex >= 0 ? pointIndex - 1 : scope.checkpoints.length - 1];
	const previousRanks = new Map(previous ? rankEventPlayers(eventCheckpointPlayers(scope, previous), lane).map((p, i) => [p.key, { rank: i + 1, qualified: p.qualified }]) : []);
	const sorted = [...ranked].sort((a, b) => {
		const value = (p: typeof a) => sort === "grade" ? (p.rated ? p.ratingSum / p.rated : -Infinity) : sort === "gold" ? (p.goldGames ? p.goldSum / p.goldGames : -Infinity) : sort === "games" ? p.games : sort === "wins" ? p.wins / p.games : 0;
		return sort === "performance" ? 0 : value(b) - value(a) || a.key.localeCompare(b.key);
	});
	const phaseScope = record.split ?? record.event;
	const lanes = useMemo(() => Object.keys(record.championLanes).length ? record.championLanes : props.record ? {} : Object.fromEntries(props.champions.map(c => [c.id, c.lanes])), [record.championLanes, props.record, props.champions]);
	return <div className="space-y-4 border-t border-rift-line/40 p-3 md:p-4">
		<div className="flex flex-wrap gap-3"><label className="text-xs text-rift-mutedbright">Stage <select aria-label="Ranking stage" className={control} value={scope.id} onChange={e => { setScope(e.target.value); setPoint("current"); }}>{record.scopes.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
			<label className="text-xs text-rift-mutedbright">Evolution <select aria-label="Ranking checkpoint" className={control} value={checkpoint ? point : "current"} onChange={e => setPoint(e.target.value)}><option value="current">Current / final standings</option>{scope.checkpoints.map(c => <option key={c.id} value={c.id}>{c.label} · {c.games} games</option>)}</select></label>
		</div>
		<div className="grid grid-cols-2 gap-2 sm:grid-cols-5" aria-label="Role leaders">{LANE_ORDER.map(role => {
			const leader = rankEventPlayers(players, role)[0];
			return <div key={role} className="min-w-0 border border-rift-line/30 bg-rift-bg/30 p-2"><div className="mb-1 flex items-center gap-1 text-xs text-rift-mutedbright"><LaneIcon lane={role} size="xs" />{role}</div>{leader ? <><PlayerNameLink playerId={leader.playerId} name={leader.name} seasonId={props.seasonId} phaseScope={phaseScope} className="block truncate text-xs font-display text-rift-goldbright" /><PlayerTeams player={leader} seasonId={props.seasonId} phaseScope={phaseScope} /><span className="text-[10px] text-rift-mutedbright">{leader.qualified ? "Leading" : "Provisional"} · {leader.score?.toFixed(2) ?? "Partial evidence"}</span></> : <p className="text-xs text-rift-mutedbright">No recorded games</p>}</div>;
		})}</div>
		<div className="flex flex-wrap items-center justify-between gap-2"><div className="flex flex-wrap gap-1" aria-label="Player role">{LANE_ORDER.map(role => <button type="button" key={role} aria-pressed={role === lane} onClick={() => setLane(role)} className={`${control} flex items-center gap-1 ${role === lane ? "border-rift-gold text-rift-goldbright" : ""}`}><LaneIcon lane={role} size="xs" />{role}</button>)}</div><label className="text-xs text-rift-mutedbright">Sort <select aria-label="Player sort" className={control} value={sort} onChange={e => setSort(e.target.value)}><option value="performance">Performance score</option><option value="grade">Avg grade</option><option value="gold">Avg gold diff</option><option value="games">Games</option><option value="wins">Win rate</option></select></label></div>
		<p className="text-xs text-rift-mutedbright">{checkpoint ? `${checkpoint.label} · ${checkpoint.games} games at this checkpoint` : `${scope.stats.games} completed games · current / final standings`}. {scope.checkpoints.length ? "Movement compares performance rank with the previous recorded checkpoint." : "Earlier round history was not recorded. Current statistics remain available."}</p>
		<div className="overflow-x-auto"><table className="w-full text-left text-xs tabular-nums"><thead className="border-y border-rift-line/40 text-rift-mutedbright"><tr>{["Rank", "Player / team", "Score", "Avg grade", "Avg gold ±", "Games", "WR", "KDA"].map(h => <th key={h} className="whitespace-nowrap px-2 py-2">{h}</th>)}</tr></thead><tbody>{sorted.map(p => {
			const rank = ranked.indexOf(p) + 1, prev = previousRanks.get(p.key);
			const change = !prev ? "New" : p.qualified && !prev.qualified ? "Qualified" : prev.rank === rank ? "—" : `${prev.rank > rank ? "↑" : "↓"}${Math.abs(prev.rank - rank)}`;
			return <tr key={p.key} className="border-b border-rift-line/25 text-rift-mutedbright">
				<td className="px-2 py-3"><span className="font-display text-rift-goldbright">#{rank}</span>{previous && <span className="ml-1 text-[10px]" title="Performance rank movement">{change}</span>}</td>
				<td className="px-2 py-3"><PlayerNameLink playerId={p.playerId} name={p.name} seasonId={props.seasonId} phaseScope={phaseScope} className="font-display text-rift-goldbright" /><PlayerTeams player={p} seasonId={props.seasonId} phaseScope={phaseScope} />{!p.qualified && <p className="mt-1 text-[10px]">{p.score === null ? "Partial scoring evidence" : `Provisional · ${p.rated}/${p.required} rated games`}</p>}</td>
				<td className="px-2 py-3">{p.score?.toFixed(2) ?? "—"}</td>
				<td className="px-2 py-3" title={`${p.rated} rated games`}>{avg(p.ratingSum, p.rated)}</td>
				<td className="px-2 py-3" title={`${p.goldGames} games with recorded gold difference`}>{avg(p.goldSum, p.goldGames, 0)}</td>
				<td className="px-2 py-3">{p.games}</td>
				<td className="px-2 py-3">{Math.round(p.wins / p.games * 100)}%</td>
				<td className="px-2 py-3" title={`${p.kdaGames} games with recorded KDA`}>{p.kdaGames ? ((p.kills + p.assists) / Math.max(1, p.deaths)).toFixed(2) : "—"}</td>
			</tr>;
		})}</tbody></table>{!ranked.length && <p className="py-5 text-xs text-rift-mutedbright">No identified participants with recorded games in this role.</p>}</div>
		<details className="text-xs text-rift-mutedbright"><summary className="cursor-pointer text-rift-goldbright">How rankings work</summary><p className="mt-2 max-w-3xl leading-relaxed">Event performance only; no tiers or awards are assigned. Score adjusts grades for opposition and an existing SS advantage, shrinks small samples towards 6 using 12 prior games, and accounts for consistency. Qualification needs 3 rated games and 60% of team opportunities. Qualified rows lead; eliminated players remain. Exact score ties use rated games, then stable identity. Displayed scores are rounded. Unknown evidence is not zero.</p></details>
		<p className="text-xs text-rift-mutedbright">Champion tables below show current / final statistics for the selected stage.</p><EventChampionTables stats={scope.stats} champions={props.champions} lanes={lanes} filters={props.view.champions} onFilterChange={patch => props.updateView({ champions: { ...props.view.champions, ...patch } })} />
	</div>;
}

function PlayerTeams({ player, seasonId, phaseScope }: { player: EventPlayer; seasonId?: string; phaseScope?: EventRecord["split"] | EventRecord["event"] }) {
	return <div className="mt-1 flex flex-wrap gap-2 text-[10px]">{player.teams.map(team => <TeamNameLink key={`${team.leagueId}:${team.id}`} teamId={team.id} name={team.name} leagueId={team.leagueId} logoUrl={resolveTeamLogo(team.name, team.logoUrl)} seasonId={seasonId} phaseScope={phaseScope} logoSize={14} />)}</div>;
}
