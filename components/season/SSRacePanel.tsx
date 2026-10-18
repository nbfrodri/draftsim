"use client";

import { useMemo, useState } from "react";
import { IconTrophy } from "@tabler/icons-react";
import { computeSSRace, type SSRaceLane, type SSRacePlayer } from "@/lib/season/ssRace";
import { SS_REPLACE_MARGIN } from "@/lib/season/ssPlayers";
import type { SeasonState } from "@/lib/season/types";
import type { Lane } from "@/lib/types";
import { ROLE_LABELS } from "@/lib/roles";
import CollapsibleSection from "../CollapsibleSection";
import RoleLabel from "../RoleLabel";
import RegionMark from "../RegionMark";
import PlayerNameLink from "../player/PlayerNameLink";
import TeamNameLink from "../team/TeamNameLink";
import TierChip from "./TierChip";

const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-rift-gold";

function PlayerIdentity({ row }: { row: SSRacePlayer }) {
	return (
		<div className="min-w-0 space-y-1.5">
			<div className="flex items-center gap-1.5 font-display text-[13px] text-rift-goldbright">
				<TierChip tier={row.player.tier} size="md" />
				<PlayerNameLink playerId={row.player.id} name={row.player.name} className="min-w-0 max-w-full" />
			</div>
			<div className="flex min-w-0 items-center gap-2"><RegionMark league={row.team.leagueId} size={16} /><TeamNameLink
				teamId={row.team.id} name={row.team.name} leagueId={row.team.leagueId}
				iconKey={row.team.iconKey} logoUrl={row.team.logoUrl} color={row.team.color}
				hint={{ team: row.team }} logoSize={16}
				className="inline-flex max-w-full items-center gap-1.5 text-[11px] text-rift-mutedbright"
			/></div>
		</div>
	);
}

function goldAverage(row: SSRacePlayer): string {
	if (!row.stats?.goldDiffGames) return "—";
	const value = Math.round(row.stats.goldDiffSum / row.stats.goldDiffGames);
	return `${value > 0 ? "+" : ""}${value.toLocaleString("en-US")}`;
}

function chanceLabel(chance: number | null): string {
	if (chance === null) return "—";
	if (chance === 100) return ">99%";
	return chance === 0 ? "<1%" : `~${chance}%`;
}

function PlayerMetrics({ row, className = "grid-cols-2" }: { row: SSRacePlayer; className?: string }) {
	const metrics = [
		["Avg grade", row.stats?.avgRating?.toFixed(1) ?? "—"],
		["Avg gold diff", goldAverage(row)],
		["Win rate", row.stats?.games ? `${Math.round(row.stats.wins / row.stats.games * 100)}%` : "—"],
		["Rated games", String(row.games)],
	];
	return (
		<dl className={`grid gap-x-3 gap-y-2.5 tabular-nums ${className}`}>
			{metrics.map(([label, value]) => (
				<div key={label}>
					<dt className="text-[10px] text-rift-mutedbright">{label}</dt>
					<dd className="mt-0.5 font-display text-[13px] text-rift-goldbright">{value}</dd>
				</div>
			))}
		</dl>
	);
}

function CurrentSeat({ row: { lane, holder } }: { row: SSRaceLane }) {
	return (
		<article aria-label={`${ROLE_LABELS[lane]} SS holder`} className="min-w-0 border border-rift-line/50 bg-rift-bg/30">
			<h4 className="flex items-center gap-1.5 border-b border-rift-line/40 px-3 py-2 text-[10px] font-semibold text-rift-goldbright">
				<RoleLabel lane={lane} size="sm" />
				{!holder && <span className="ml-auto font-normal text-rift-mutedbright">Vacant</span>}
			</h4>
			{holder ? <div className="p-3">
				<PlayerIdentity row={holder} />
				<div className="my-3"><PlayerMetrics row={holder} /></div>
				<div className="flex flex-wrap items-center justify-between gap-1 border-t border-rift-line/30 pt-2 text-[10px] text-rift-mutedbright">
					<span>Live SS score <span className="font-display tabular-nums text-rift-goldbright">{holder.score?.toFixed(2) ?? "—"}</span></span>
					<span title={`Last awarded score: ${holder.player.ss?.score.toFixed(2)}`}>{holder.player.ss?.phaseLabel}</span>
				</div>
				{holder.carry && <p className="mt-2 text-[10px] text-rift-gold">Previous-season grace period</p>}
				{!holder.eligible && !holder.carry && <p className="mt-2 text-[10px] text-rift-mutedbright">Review requirement: {holder.reasons.join(" · ")}</p>}
			</div> : <p className="px-3 py-3 text-[10px] text-rift-mutedbright">Awaiting a qualifying player.</p>}
		</article>
	);
}

function ChanceEstimate({ row }: { row: SSRacePlayer }) {
	const chance = row.eligible ? row.chance : row.chance === null ? null : 0;
	return (
		<div className="text-right">
			<div className="text-[10px] text-rift-mutedbright">Estimated chance</div>
			<div className="font-display text-xl tabular-nums text-rift-goldbright">{row.eligible ? chanceLabel(chance) : chance === null ? "—" : "0%"}</div>
			<div aria-hidden="true" className="mt-1 h-1 bg-rift-line/60">
				<div className="h-full bg-rift-gold/75" style={{ width: `${chance ?? 0}%` }} />
			</div>
		</div>
	);
}

function Contender({ row, rank }: { row: SSRacePlayer; rank: number }) {
	return (
		<li className="border-t border-rift-line/40 bg-rift-bg/20 px-3 py-3 first:border-t-0">
			<div className="grid grid-cols-[minmax(0,1fr)_7rem] items-start gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.6fr)_7rem] lg:items-center">
				<div className="flex min-w-0 items-start gap-2.5">
					<span className="mt-0.5 w-4 shrink-0 text-[11px] tabular-nums text-rift-mutedbright">{rank}</span>
					<PlayerIdentity row={row} />
				</div>
				<div className="col-span-2 row-start-2 lg:col-span-1 lg:row-start-auto"><PlayerMetrics row={row} className="grid-cols-2 sm:grid-cols-4" /></div>
				<div className="col-start-2 row-start-1 lg:col-start-3"><ChanceEstimate row={row} /></div>
			</div>
			<div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-rift-line/25 pt-2 text-[10px] tabular-nums text-rift-mutedbright">
				<span>SS score <span className="font-display text-rift-goldbright">{row.score?.toFixed(2) ?? "—"}</span></span>
				{row.gap !== null && <span>Gap to seat {row.gap.toFixed(2)}</span>}
				<span>Participation {row.games}/{row.requiredGames} required</span>
				<span className={`sm:ml-auto ${row.projected ? "text-rift-goldbright" : "text-rift-mutedbright"}`}>
					{row.eligible ? row.projected ? "Projected SS with current results" : "Eligible · chasing the seat" : "Requirements pending"}
				</span>
			</div>
			{!row.eligible && <p className="mt-2 text-[10px] text-rift-mutedbright">{row.reasons.join(" · ")}</p>}
		</li>
	);
}

function SSRaceContent({ season, lane, onLaneChange }: { season: SeasonState; lane: Lane; onLaneChange: (lane: Lane) => void }) {
	const race = useMemo(() => computeSSRace(season), [season]);
	const [showAll, setShowAll] = useState(false);
	const selected = race.find(row => row.lane === lane)!;
	const contenders = showAll ? selected.contenders : selected.contenders.slice(0, 5);
	return (
		<div className="space-y-5 p-3 md:p-4">
			<section aria-labelledby="ss-holders-heading">
				<div className="mb-3 flex flex-wrap items-baseline justify-between gap-1">
					<h3 id="ss-holders-heading" className="font-display text-xs text-rift-goldbright">Current SS players</h3>
					<p className="text-[10px] text-rift-mutedbright">One world seat per role · Reviewed at phase end</p>
				</div>
				<div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">{race.map(row => <CurrentSeat key={row.lane} row={row} />)}</div>
			</section>
			<section aria-labelledby="ss-contenders-heading">
				<h3 id="ss-contenders-heading" className="mb-3 font-display text-xs text-rift-goldbright">SS contenders</h3>
				<fieldset aria-label="Contender role" className="mb-3 flex min-w-0 flex-wrap gap-1.5 border-0 p-0">
					{race.map(row => <button
						type="button" key={row.lane} aria-pressed={row.lane === lane}
						onClick={() => { onLaneChange(row.lane); setShowAll(false); }}
						className={`inline-flex items-center gap-1.5 border px-2.5 py-1.5 text-[11px] transition-colors ${FOCUS} ${lane === row.lane ? "border-rift-gold/50 bg-rift-gold/10 text-rift-goldbright" : "border-rift-line/50 text-rift-mutedbright hover:border-rift-gold/40 hover:text-rift-goldbright"}`}
					><RoleLabel lane={row.lane} /></button>)}
				</fieldset>
				<div className="border border-rift-line/50">
					{contenders.length ? <ol aria-label={`${ROLE_LABELS[lane]} SS contenders`}>{contenders.map((row, index) => <Contender key={row.player.id} row={row} rank={index + 1} />)}</ol> : <p className="px-3 py-5 text-[11px] leading-relaxed text-rift-mutedbright">No S/S+ challengers in this role. Lower tiers must develop before they can qualify.</p>}
				</div>
				{selected.contenders.length > 5 && <button type="button" onClick={() => setShowAll(!showAll)} className={`mt-2 border border-rift-line/50 px-3 py-1.5 text-[11px] text-rift-mutedbright hover:border-rift-gold/40 hover:text-rift-goldbright ${FOCUS}`}>{showAll ? "Show top 5" : `Show all ${selected.contenders.length} contenders`}</button>}
				<p className="mt-2 text-[10px] leading-relaxed text-rift-mutedbright">Estimates reflect current results, not future-match odds. Ownership changes only at phase reviews.</p>
			</section>
			<details className="border-t border-rift-line/40 pt-2 text-[11px] leading-relaxed text-rift-mutedbright">
				<summary className={`w-fit cursor-pointer py-1 text-rift-gold ${FOCUS}`}>Selection rules &amp; estimates</summary>
				<p className="mt-2">S/S+ base tier, at least 8 rated games, 60% participation and recent domestic activity are required. Challengers must beat an eligible holder by {SS_REPLACE_MARGIN.toFixed(2)} score. Estimates repeatedly resample recorded grades using these same selection rules; all eligible players compete, including those outside the displayed top five. Too few rated games means no estimate; other unmet requirements mean 0%. SS score adjusts grades for opposition, sample size and consistency.</p>
				<p className="mt-2">Season stats follow the player across teams. Gold diff is measured at game end against the lane opponent. — means no recorded data.</p>
			</details>
		</div>
	);
}

export default function SSRacePanel({ season }: { season: SeasonState }) {
	const [lane, setLane] = useState<Lane>("top");
	const holders = useMemo(() => new Set(season.teams.flatMap(t => t.players.filter(p => p.tier === "SS").map(p => p.lane))).size, [season.teams]);
	return (
		<CollapsibleSection ariaLabel="SS Race" headingLevel={2} className="mb-7" icon={<IconTrophy size={15} className="shrink-0 text-rift-gold" aria-hidden="true" />}
			label={<>SS Race<span className="ml-2 hidden font-body text-[10px] font-normal normal-case tracking-normal text-rift-mutedbright sm:inline">World leaders &amp; contenders</span></>}
			summary={`${holders}/5 holders`}>
			<SSRaceContent season={season} lane={lane} onLaneChange={setLane} />
		</CollapsibleSection>
	);
}
