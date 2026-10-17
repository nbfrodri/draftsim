"use client";

import { useMemo, useState } from "react";
import { IconChartBar } from "@tabler/icons-react";
import type { Champion, Lane } from "@/lib/types";
import type { TournamentState } from "@/lib/tournament";
import { LANE_ORDER } from "@/lib/players";
import { rankEventPlayers, type EventPlayer } from "@/lib/eventStats";
import { buildEventRecord, eventCheckpointPlayers, type EventRecord } from "@/lib/season/eventHistory";
import { resolveTeamLogo } from "@/lib/season/realTeams";
import PlayerNameLink from "../player/PlayerNameLink";
import TeamNameLink from "../team/TeamNameLink";
import RoleLabel from "../RoleLabel";
import RegionMark from "../RegionMark";
import CollapsibleSection from "../CollapsibleSection";
import SplitIcon from "../season/SplitIcon";
import LeagueIcon from "../LeagueIcon";
import EventChampionTables, { type ChampionTableFilters } from "./EventChampionTables";

type Props = { champions: readonly Champion[]; seasonId?: string } & ({ record: EventRecord; tournaments?: never; identity?: never } | { record?: never; tournaments: readonly TournamentState[]; identity: Omit<EventRecord, "version" | "scopes" | "championLanes"> });
const control = "border border-rift-line/60 bg-rift-bg px-2 py-1.5 text-xs text-rift-mutedbright focus-visible:outline focus-visible:outline-2 focus-visible:outline-rift-gold";
const segment = "inline-flex items-center gap-1.5 border px-2.5 py-1.5 text-[11px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-rift-gold";
const segmentState = (on: boolean) => on ? "border-rift-gold/50 bg-rift-gold/10 text-rift-goldbright" : "border-rift-line/50 text-rift-mutedbright hover:border-rift-gold/40 hover:text-rift-goldbright";
const avg = (sum: number, n: number, digits = 2) => n ? (sum / n).toFixed(digits) : "—";
interface View { scopeId: string; lane: Lane; point: string; sort: string; champions: ChampionTableFilters }

export default function EventStatsPanel(props: Props) {
	const [view, setView] = useState<View>({ scopeId: "all", lane: "top", point: "current", sort: "performance", champions: { role: "all", limit: "10" } });
	const identity = props.record ?? props.identity;
	const games = props.record?.scopes[0]?.stats.games;
	return <CollapsibleSection ariaLabel={`${identity.label} event statistics`} label={`${identity.label} · Player Rankings`} headingClassName="font-display text-sm"
		icon={identity.split ? <SplitIcon split={identity.split} size={16} /> : identity.event ? <LeagueIcon league={identity.event} size={16} /> : <IconChartBar size={16} aria-hidden="true" />}
		summary={games !== undefined ? `${games} games` : <span className="hidden sm:inline">Players &amp; champions</span>}>
		<EventStatsContent {...props} view={view} updateView={patch => setView(current => ({ ...current, ...patch }))} />
	</CollapsibleSection>;
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
	const label = "text-[10px] uppercase tracking-wider text-rift-mutedbright";
	return <div className="space-y-4 p-3 md:p-4">
		<div className="flex flex-wrap gap-3"><label className={`flex flex-col gap-1 ${label}`}>Stage <select aria-label="Ranking stage" className={control} value={scope.id} onChange={e => { setScope(e.target.value); setPoint("current"); }}>{record.scopes.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
			<label className={`flex flex-col gap-1 ${label}`}>Evolution <select aria-label="Ranking checkpoint" className={control} value={checkpoint ? point : "current"} onChange={e => setPoint(e.target.value)}><option value="current">Current / final standings</option>{scope.checkpoints.map(c => <option key={c.id} value={c.id}>{c.label} · {c.games} games</option>)}</select></label>
		</div>
		<div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5" aria-label="Role leaders">{LANE_ORDER.map(role => {
			const leader = rankEventPlayers(players, role)[0];
			return <article key={role} className="min-w-0 border border-rift-line/50 bg-rift-bg/30"><h4 className="flex items-center border-b border-rift-line/40 px-3 py-2 text-[10px] font-semibold text-rift-goldbright"><RoleLabel lane={role} size="sm" /></h4>
				{leader ? <div className="p-3"><PlayerNameLink playerId={leader.playerId} name={leader.name} seasonId={props.seasonId} phaseScope={phaseScope} className="block truncate text-[13px] font-display text-rift-goldbright" /><PlayerTeams player={leader} seasonId={props.seasonId} phaseScope={phaseScope} /><div className="mt-3 flex items-baseline justify-between gap-2 border-t border-rift-line/30 pt-2"><span className="font-display text-xl tabular-nums text-rift-goldbright">{leader.score?.toFixed(2) ?? "—"}</span><span className="text-[10px] text-rift-mutedbright">{leader.qualified ? "Leading" : "Provisional"}{leader.score === null && " · Partial evidence"}</span></div></div> : <p className="px-3 py-3 text-[10px] text-rift-mutedbright">No recorded games</p>}</article>;
		})}</div>
		<div className="flex flex-wrap items-end justify-between gap-2"><fieldset aria-label="Player role" className="m-0 flex min-w-0 flex-wrap gap-1.5 border-0 p-0">{LANE_ORDER.map(role => <button type="button" key={role} aria-pressed={role === lane} onClick={() => setLane(role)} className={`${segment} ${segmentState(role === lane)}`}><RoleLabel lane={role} size="sm" /></button>)}</fieldset><label className={`flex flex-col gap-1 ${label}`}>Sort <select aria-label="Player sort" className={control} value={sort} onChange={e => setSort(e.target.value)}><option value="performance">Performance score</option><option value="grade">Avg grade</option><option value="gold">Avg gold diff</option><option value="games">Games</option><option value="wins">Win rate</option></select></label></div>
		<p className="text-[11px] leading-relaxed text-rift-mutedbright">{checkpoint ? `${checkpoint.label} · ${checkpoint.games} games at this checkpoint` : `${scope.stats.games} completed games · current / final standings`}. {scope.checkpoints.length ? "Movement compares performance rank with the previous recorded checkpoint." : "Earlier round history was not recorded. Current statistics remain available."}</p>
		<div className="overflow-x-auto border border-rift-line/40"><table className="w-full text-left text-xs tabular-nums"><thead className="border-b border-rift-line/40 bg-rift-bg/40 text-[10px] uppercase tracking-wider text-rift-mutedbright"><tr>{["Rank", "Player / team", "Score", "Avg grade", "Avg gold ±", "Games", "WR", "KDA"].map((h, i) => <th key={h} className={`whitespace-nowrap px-2 py-2 font-semibold ${i > 1 ? "text-right" : ""}`}>{h}</th>)}</tr></thead><tbody>{sorted.map(p => {
			const rank = ranked.indexOf(p) + 1, prev = previousRanks.get(p.key);
			const change = !prev ? "New" : p.qualified && !prev.qualified ? "Qualified" : prev.rank === rank ? "—" : `${prev.rank > rank ? "↑" : "↓"}${Math.abs(prev.rank - rank)}`;
			const chip = change.startsWith("↑") || change === "Qualified" ? "text-rift-goldbright" : change.startsWith("↓") ? "text-rift-redbright" : "text-rift-mutedbright";
			return <tr key={p.key} className="border-b border-rift-line/25 text-rift-mutedbright transition-colors last:border-b-0 hover:bg-rift-gold/[0.04]">
				<td className="px-2 py-3"><span className="font-display text-rift-goldbright">#{rank}</span>{previous && <span className={`ml-1.5 border border-rift-line/40 px-1 text-[10px] ${chip}`} title="Performance rank movement">{change}</span>}</td>
				<td className="px-2 py-3"><PlayerNameLink playerId={p.playerId} name={p.name} seasonId={props.seasonId} phaseScope={phaseScope} className="font-display text-rift-goldbright" /><PlayerTeams player={p} seasonId={props.seasonId} phaseScope={phaseScope} />{!p.qualified && <p className="mt-1 text-[10px] text-rift-muted">{p.score === null ? "Partial scoring evidence" : `Provisional · ${p.rated}/${p.required} rated games`}</p>}</td>
				<td className="px-2 py-3 text-right font-display text-rift-goldbright">{p.score?.toFixed(2) ?? "—"}</td>
				<td className="px-2 py-3 text-right" title={`${p.rated} rated games`}>{avg(p.ratingSum, p.rated)}</td>
				<td className="px-2 py-3 text-right" title={`${p.goldGames} games with recorded gold difference`}>{avg(p.goldSum, p.goldGames, 0)}</td>
				<td className="px-2 py-3 text-right">{p.games}</td>
				<td className="px-2 py-3 text-right">{Math.round(p.wins / p.games * 100)}%</td>
				<td className="px-2 py-3 text-right" title={`${p.kdaGames} games with recorded KDA`}>{p.kdaGames ? ((p.kills + p.assists) / Math.max(1, p.deaths)).toFixed(2) : "—"}</td>
			</tr>;
		})}</tbody></table>{!ranked.length && <p className="px-3 py-5 text-xs text-rift-mutedbright">No identified participants with recorded games in this role.</p>}</div>
		<details className="border-t border-rift-line/40 pt-2 text-[11px] leading-relaxed text-rift-mutedbright"><summary className="w-fit cursor-pointer py-1 text-rift-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-rift-gold">How rankings work</summary><p className="mt-2 max-w-3xl">Event performance only; no tiers or awards are assigned. Score adjusts grades for opposition and an existing SS advantage, shrinks small samples towards 6 using 12 prior games, and accounts for consistency. Qualification needs 3 rated games and 60% of team opportunities. Qualified rows lead; eliminated players remain. Exact score ties use rated games, then stable identity. Displayed scores are rounded. Unknown evidence is not zero.</p></details>
		<p className="text-[11px] text-rift-mutedbright">Champion tables below show current / final statistics for the selected stage.</p><EventChampionTables stats={scope.stats} champions={props.champions} lanes={lanes} filters={props.view.champions} onFilterChange={patch => props.updateView({ champions: { ...props.view.champions, ...patch } })} />
	</div>;
}

function PlayerTeams({ player, seasonId, phaseScope }: { player: EventPlayer; seasonId?: string; phaseScope?: EventRecord["split"] | EventRecord["event"] }) {
	return <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px]">{player.teams.map(team => <span key={`${team.leagueId}:${team.id}`} className="inline-flex min-w-0 items-center gap-1.5"><RegionMark league={team.leagueId} size={14} /><TeamNameLink teamId={team.id} name={team.name} leagueId={team.leagueId} logoUrl={resolveTeamLogo(team.name, team.logoUrl)} seasonId={seasonId} phaseScope={phaseScope} logoSize={14} /></span>)}</div>;
}
