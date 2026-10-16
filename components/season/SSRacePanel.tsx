"use client";

import { useMemo, useState } from "react";
import { computeSSRace, type SSRacePlayer } from "@/lib/season/ssRace";
import { SS_REPLACE_MARGIN } from "@/lib/season/ssPlayers";
import type { SeasonState } from "@/lib/season/types";
import type { Lane } from "@/lib/types";
import LaneIcon from "../LaneIcon";
import PlayerNameLink from "../player/PlayerNameLink";
import TeamNameLink from "../team/TeamNameLink";
import TierChip from "./TierChip";

const ROLE_NAMES: Record<Lane, string> = { top: "Top", jungle: "Jungle", middle: "Mid", bottom: "ADC", support: "Support" };

function PlayerIdentity({ row }: { row: SSRacePlayer }) {
	return (
		<div className="min-w-0 space-y-1">
			<div className="flex items-center gap-2 font-display text-sm text-rift-goldbright">
				<TierChip tier={row.player.tier} size="md" />
				<PlayerNameLink playerId={row.player.id} name={row.player.name} />
			</div>
			<TeamNameLink teamId={row.team.id} name={row.team.name} leagueId={row.team.leagueId} iconKey={row.team.iconKey} logoUrl={row.team.logoUrl} color={row.team.color} hint={{ team: row.team }} logoSize={18} className="inline-flex max-w-full items-center gap-1.5 text-xs text-rift-mutedbright" />
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

function PlayerMetrics({ row }: { row: SSRacePlayer }) {
	const metrics = [
		["Avg grade", row.stats?.avgRating?.toFixed(1) ?? "—"],
		["Avg gold diff", goldAverage(row)],
		["Win rate", row.stats?.games ? `${Math.round(row.stats.wins / row.stats.games * 100)}%` : "—"],
		["Rated games", String(row.games)],
	];
	return <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs tabular-nums">{metrics.map(([label, value]) => <div key={label}><dt className="text-rift-mutedbright">{label}</dt><dd className="font-display text-rift-goldbright">{value}</dd></div>)}</dl>;
}

function Contender({ row }: { row: SSRacePlayer }) {
	return (
		<li className="border border-rift-line bg-rift-panel/60 p-3">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<PlayerIdentity row={row} />
				<div className="text-right text-xs text-rift-mutedbright">
					<div>Estimated chance</div>
					<div className="font-display text-lg tabular-nums text-rift-bluebright">{row.eligible ? chanceLabel(row.chance) : row.chance === null ? "—" : "0%"}</div>
				</div>
			</div>
			<div className="my-3"><PlayerMetrics row={row} /></div>
			<div className="flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums text-rift-mutedbright">
				<span>SS score: {row.score?.toFixed(2) ?? "—"}</span>
				{row.gap !== null && <span>Gap to seat: {row.gap.toFixed(2)}</span>}
				<span>Participation: {row.games}/{row.requiredGames} required</span>
			</div>
			<p className={`mt-2 text-xs ${row.projected ? "text-cyan-100" : "text-rift-mutedbright"}`}>
				{row.eligible ? row.projected ? "Projected SS with current results" : "Eligible · chasing the seat" : row.reasons.join(" · ")}
			</p>
		</li>
	);
}

export default function SSRacePanel({ season }: { season: SeasonState }) {
	const race = useMemo(() => computeSSRace(season), [season]);
	const [lane, setLane] = useState<Lane>("top");
	const [showAll, setShowAll] = useState(false);
	const selected = race.find(row => row.lane === lane)!;
	const contenders = showAll ? selected.contenders : selected.contenders.slice(0, 5);
	return (
		<section aria-labelledby="ss-race-heading" className="mb-6 border border-rift-line bg-rift-panel/40 p-3 md:p-4">
			<h2 id="ss-race-heading" className="font-display text-base text-cyan-100">SS Race</h2>
			<p className="mt-1 text-xs text-rift-mutedbright">One world seat per role. Ownership changes only at competitive phase reviews; live projections include completed games in the current phase.</p>
			<h3 className="mb-2 mt-4 font-display text-sm text-rift-goldbright">Current SS players</h3>
			<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
				{race.map(({ lane: role, holder }) => (
					<article key={role} aria-label={`${ROLE_NAMES[role]} SS holder`} className="min-w-0 border border-cyan-300/25 bg-cyan-300/5 p-3">
						<h4 className="mb-3 flex items-center gap-2 font-display text-xs text-cyan-100"><LaneIcon lane={role} />{ROLE_NAMES[role]}</h4>
						{holder ? <>
							<PlayerIdentity row={holder} />
							<div className="my-3"><PlayerMetrics row={holder} /></div>
							<p className="text-xs text-rift-mutedbright">Live SS score: {holder.score?.toFixed(2) ?? "—"}</p>
							<p className="mt-1 text-xs text-rift-mutedbright">Awarded: {holder.player.ss?.phaseLabel} · score {holder.player.ss?.score.toFixed(2)}</p>
							{holder.carry && <p className="mt-1 text-xs text-cyan-100">Previous-season grace period</p>}
							{!holder.eligible && !holder.carry && <p className="mt-1 text-xs text-rift-mutedbright">Review requirement: {holder.reasons.join(" · ")}</p>}
						</> : <p className="text-xs text-rift-mutedbright">No SS holder yet. Assigned at a phase review when an eligible player qualifies.</p>}
					</article>
				))}
			</div>
			<h3 className="mb-2 mt-5 font-display text-sm text-rift-goldbright">SS contenders</h3>
			<div role="group" aria-label="Contender role" className="mb-3 flex flex-wrap gap-2">{race.map(row => <button type="button" key={row.lane} aria-pressed={row.lane === lane} onClick={() => { setLane(row.lane); setShowAll(false); }} className={`inline-flex items-center gap-1.5 border px-3 py-2 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-rift-bluebright ${lane === row.lane ? "border-cyan-200 text-cyan-100 bg-cyan-300/10" : "border-rift-line text-rift-mutedbright hover:text-rift-goldbright"}`}><LaneIcon lane={row.lane} />{ROLE_NAMES[row.lane]}</button>)}</div>
			<p className="mb-2 text-xs text-rift-mutedbright">Chance estimates reflect uncertainty in current results, not future-match odds or a guarantee.</p>
			<details className="mb-3 text-xs leading-relaxed text-rift-mutedbright">
				<summary className="w-fit cursor-pointer py-1 text-rift-bluebright">Selection rules &amp; estimates</summary>
				<p className="mt-2">S/S+ base tier, at least 8 rated games, 60% participation and recent domestic activity are required. Challengers must beat an eligible holder by {SS_REPLACE_MARGIN.toFixed(2)} score. Estimates repeatedly resample recorded grades using these same selection rules; all eligible players compete, including those outside the displayed top five. Too few rated games means no estimate; other unmet requirements mean 0%. SS score adjusts grades for opposition, sample size and consistency.</p>
			</details>
			{contenders.length ? <ul aria-label={`${ROLE_NAMES[lane]} SS contenders`} className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{contenders.map(row => <Contender key={row.player.id} row={row} />)}</ul> : <p className="py-3 text-sm text-rift-mutedbright">No S/S+ challengers in this role. Lower tiers must develop before they can qualify.</p>}
			{selected.contenders.length > 5 && <button type="button" onClick={() => setShowAll(!showAll)} className="mt-3 border border-rift-line px-3 py-2 text-xs text-rift-mutedbright hover:text-rift-goldbright">{showAll ? "Show top 5" : `Show all ${selected.contenders.length} contenders`}</button>}
			<p className="mt-3 text-xs text-rift-mutedbright">Season stats follow the player across teams. Gold diff is measured at game end against the lane opponent. — means no recorded data.</p>
		</section>
	);
}
