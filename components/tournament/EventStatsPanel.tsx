"use client";

import { useMemo, useState } from "react";
import type { Champion, Lane } from "@/lib/types";
import type { TournamentState } from "@/lib/tournament";
import { LANE_ORDER } from "@/lib/players";
import { rankEventPlayers, type EventPlayer } from "@/lib/eventStats";
import { buildEventRecord, eventCheckpointPlayers, type EventRecord } from "@/lib/season/eventHistory";
import { resolveTeamLogo } from "@/lib/season/realTeams";
import PlayerNameLink from "../player/PlayerNameLink";
import TeamNameLink from "../team/TeamNameLink";
import { plural } from "@/lib/plural";
import RoleLabel from "../RoleLabel";
import RegionMark from "../RegionMark";
import CollapsibleSection from "../CollapsibleSection";
import PlaygroundSelect from "../hall/PlaygroundSelect";
import EventIdentityIcon from "./EventIdentityIcon";
import EventChampionTables, { type ChampionTableFilters } from "./EventChampionTables";

type Props = { champions: readonly Champion[]; seasonId?: string; embedded?: boolean; view?: View; onViewChange?: (update: (current: View) => View) => void } & ({ record: EventRecord; tournaments?: never; identity?: never } | { record?: never; tournaments: readonly TournamentState[]; identity: Omit<EventRecord, "version" | "scopes" | "championLanes"> });
const segment = "inline-flex items-center gap-1.5 border px-2.5 py-1.5 text-[11px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-rift-gold";
const segmentState = (on: boolean) => on ? "border-rift-gold/50 bg-rift-gold/10 text-rift-goldbright" : "border-rift-line/50 text-rift-mutedbright hover:border-rift-gold/40 hover:text-rift-goldbright";
const avg = (sum: number, n: number, digits = 2) => n ? (sum / n).toFixed(digits) : "—";
export const INITIAL_VIEW: View = { scopeId: "all", lane: "top", point: "current", sort: "performance", champions: { role: "all", limit: "10" } };
export interface View { scopeId: string; lane: Lane; point: string; sort: string; champions: ChampionTableFilters }

export default function EventStatsPanel(props: Props) {
	const [ownView, setOwnView] = useState<View>(INITIAL_VIEW);
	const view = props.view ?? ownView;
	const applyView = (fn: (current: View) => View) => { if (props.onViewChange) props.onViewChange(fn); else setOwnView(fn); };
	const identity = props.record ?? props.identity;
	const games = props.record?.scopes[0]?.stats.games;
	const content = <EventStatsContent {...props} view={view} updateView={patch => applyView(c => ({ ...c, ...patch }))} updateChampions={patch => applyView(c => ({ ...c, champions: { ...c.champions, ...patch } }))} />;
	if (props.embedded) return <section aria-label={`${identity.label} event statistics`}>{content}</section>;
	return <CollapsibleSection headingLevel={4} ariaLabel={`${identity.label} event statistics`} label={`${identity.label} · Player Rankings`} headingClassName="font-display text-sm"
		icon={<EventIdentityIcon identity={identity} />}
		summary={games !== undefined ? plural(games, "game") : <span className="hidden sm:inline">Players &amp; champions</span>}>
		{content}
	</CollapsibleSection>;
}

function EventStatsContent(props: Props & { view: View; updateView: (patch: Partial<View>) => void; updateChampions: (patch: Partial<ChampionTableFilters>) => void }) {
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
	const hasPlayIn = scope.checkpoints.some(c => c.label.startsWith("Play-in · "));
	return <div className="space-y-4 p-3 md:p-4">
		<div className="flex flex-wrap gap-3">
			<PlaygroundSelect label="Stage" ariaLabel="Ranking stage" value={scope.id} onChange={setScope} options={record.scopes.map(s => ({ value: s.id, label: s.label, icon: s.id === "all" ? <EventIdentityIcon identity={record} /> : undefined }))} />
			<PlaygroundSelect label="Evolution" ariaLabel="Ranking checkpoint" value={checkpoint ? point : "current"} onChange={setPoint} options={[{ value: "current", label: "Current / final standings" }, ...scope.checkpoints.map(c => ({ value: c.id, label: c.label, detail: plural(c.games, "game"), group: hasPlayIn ? c.label.startsWith("Play-in · ") ? "Play-in" : "Main event" : undefined }))]} />
		</div>
		<div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5" aria-label="Role leaders">{LANE_ORDER.map(role => {
			const leader = rankEventPlayers(players, role)[0];
			return <article key={role} className="min-w-0 border border-rift-line/50 bg-rift-bg/30"><h4 className="flex items-center border-b border-rift-line/40 px-3 py-2 text-[10px] font-semibold text-rift-goldbright"><RoleLabel lane={role} size="sm" /></h4>
				{leader ? <div className="p-3"><PlayerNameLink playerId={leader.playerId} name={leader.name} seasonId={props.seasonId} phaseScope={phaseScope} className="block truncate text-[13px] font-display text-rift-goldbright" /><PlayerTeams player={leader} seasonId={props.seasonId} phaseScope={phaseScope} /><div className="mt-3 flex items-baseline justify-between gap-2 border-t border-rift-line/30 pt-2"><span className="font-display text-xl tabular-nums text-rift-goldbright">{leader.score?.toFixed(2) ?? "—"}</span><span className="text-[10px] text-rift-mutedbright">{leader.qualified ? "Leading" : "Provisional"}{leader.score === null && " · Partial evidence"}</span></div></div> : <p className="px-3 py-3 text-[10px] text-rift-mutedbright">No recorded games</p>}</article>;
		})}</div>
		<div className="flex flex-wrap items-end justify-between gap-2"><fieldset aria-label="Player role" className="m-0 flex min-w-0 flex-wrap gap-1.5 border-0 p-0">{LANE_ORDER.map(role => <button type="button" key={role} aria-pressed={role === lane} onClick={() => setLane(role)} className={`${segment} ${segmentState(role === lane)}`}><RoleLabel lane={role} size="sm" /></button>)}</fieldset><PlaygroundSelect label="Sort" ariaLabel="Player sort" value={sort} onChange={setSort} options={[{ value: "performance", label: "Performance score" }, { value: "grade", label: "Avg grade" }, { value: "gold", label: "Avg gold diff" }, { value: "games", label: "Games" }, { value: "wins", label: "Win rate" }]} /></div>
		<p className="text-[11px] leading-relaxed text-rift-mutedbright">{checkpoint ? `${checkpoint.label} · ${plural(checkpoint.games, "game")} at this checkpoint` : `${plural(scope.stats.games, "completed game")} · current / final standings`}. {scope.checkpoints.length ? "Movement compares performance rank with the previous recorded checkpoint." : "Earlier round history was not recorded. Current statistics remain available."}</p>
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
		<p className="text-[11px] text-rift-mutedbright">Champion tables below show current / final statistics for the selected stage.</p><EventChampionTables stats={scope.stats} champions={props.champions} lanes={lanes} filters={props.view.champions} onFilterChange={props.updateChampions} />
	</div>;
}

function PlayerTeams({ player, seasonId, phaseScope }: { player: EventPlayer; seasonId?: string; phaseScope?: EventRecord["split"] | EventRecord["event"] }) {
	return <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px]">{player.teams.map(team => <span key={`${team.leagueId}:${team.id}`} className="inline-flex min-w-0 items-center gap-1.5"><RegionMark league={team.leagueId} size={14} /><TeamNameLink teamId={team.id} name={team.name} leagueId={team.leagueId} logoUrl={resolveTeamLogo(team.name, team.logoUrl)} seasonId={seasonId} phaseScope={phaseScope} logoSize={14} /></span>)}</div>;
}
