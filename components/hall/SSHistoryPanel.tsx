"use client";

import { useMemo } from "react";
import { LANE_ORDER } from "@/lib/players";
import { ssHistory, playerSSHistory, closingSSHolders, type SSArchive } from "@/lib/season/ssHistory";
import type { SSHolder } from "@/lib/season/types";
import { resolveTeamLogo } from "@/lib/season/realTeams";
import LaneIcon from "../LaneIcon";
import PlayerNameLink from "../player/PlayerNameLink";
import TeamNameLink from "../team/TeamNameLink";
import TierChip from "../season/TierChip";

function Holder({ holder, seasonId }: { holder: SSHolder; seasonId: string }) {
	return <div className="min-w-0 space-y-1">
		<div className="flex min-w-0 items-center gap-1.5"><LaneIcon lane={holder.lane} size="xs" /><TierChip tier="SS" size="xs" /><PlayerNameLink playerId={holder.playerId} name={holder.playerName} fallback="Unknown player" seasonId={seasonId} className="min-w-0 truncate text-rift-goldbright" /></div>
		{holder.team ? <TeamNameLink teamId={holder.team.teamId} name={holder.team.teamName} leagueId={holder.team.leagueId} logoUrl={resolveTeamLogo(holder.team.teamName, holder.team.logoUrl)} seasonId={seasonId} logoSize={12} className="inline-flex max-w-full items-center gap-1 truncate text-rift-mutedbright" /> : <span className="text-rift-mutedbright">Review-time team unknown</span>}
	</div>;
}

export default function SSHistoryPanel({ entry }: { entry: SSArchive }) {
	const checkpoints = useMemo(() => ssHistory(entry), [entry]);
	const latest = checkpoints.at(-1);
	const closing = useMemo(() => closingSSHolders(entry), [entry]);
	const held = new Set(checkpoints.flatMap(c => c.holders.map(h => h.playerId)));
	return <section aria-label="Season SS history" className="min-w-0 border border-rift-line/40 bg-rift-bg/20 p-3 text-[11px]">
		<h3 className="font-display text-xs text-rift-goldbright">SS history</h3>
		<p className="my-2 text-rift-mutedbright">Holders after each competitive phase review. Separate from the tier used during the event and from All-Pro awards.</p>
		{latest ? <div className="mb-3"><p className="mb-2 text-rift-mutedbright">Last recorded review · {latest.label} · {latest.holders.length}/5 seats · Players with recorded SS reviews this year: {held.size}</p><div aria-label="Last reviewed SS holders" className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">{latest.holders.map(h => <Holder key={h.playerId} holder={h} seasonId={entry.id} />)}</div></div> : <p className="text-rift-mutedbright">SS reviews were not recorded for this season.</p>}
		<div className="space-y-2">{checkpoints.map(c => <details key={c.phaseIndex} className="border border-rift-line/30 p-2">
			<summary className="cursor-pointer font-display text-rift-goldbright focus-visible:outline focus-visible:outline-rift-gold">{c.label} · SS review · {c.holders.length}/5</summary>
			<div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">{LANE_ORDER.map(lane => {
				const holder = c.holders.find(h => h.lane === lane);
				return <div key={lane} className="min-w-0 border border-rift-line/30 p-2">{holder ? <><Holder holder={holder} seasonId={entry.id} /><p className="mt-2 text-rift-mutedbright">{holder.decision ?? "Observed · earlier ownership unknown"} · {holder.evidence.games} rated games · score {holder.evidence.score.toFixed(2)}</p>{holder.decision === "carried" && <p className="text-rift-mutedbright">Carried evidence · {holder.evidence.phaseLabel}</p>}</> : <p className="flex items-center gap-1.5 text-rift-mutedbright"><LaneIcon lane={lane} size="xs" />Vacant</p>}</div>;
			})}</div>
			{c.lost.map(h => <div key={`${h.playerId}-${h.lane}`} className="mt-2"><span className="text-rift-mutedbright">Lost SS at this review</span><Holder holder={h} seasonId={entry.id} /></div>)}
		</details>)}</div>
		{closing && <details className="mt-3 border-t border-rift-line/30 pt-2"><summary className="cursor-pointer text-rift-goldbright">Closing recorded ownership · {closing.length}/5</summary><div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">{closing.map(h => <Holder key={h.playerId} holder={h} seasonId={entry.id} />)}</div>{!closing.length && <p className="text-rift-mutedbright">All seats vacant at the last recorded boundary.</p>}</details>}
		{(entry.ssLosses ?? []).map(l => <div key={`${l.phaseIndex}-${l.holder.playerId}-${l.holder.lane}`} className="mt-2 border-t border-rift-line/30 pt-2"><p className="mb-1 text-rift-mutedbright">{l.label} · Lost SS · {l.reason}</p><Holder holder={l.holder} seasonId={entry.id} /></div>)}
	</section>;
}

export function SSCareerSummary({ history }: { history: ReturnType<typeof playerSSHistory> }) {
	return <div className="mb-3 border border-rift-line/30 bg-rift-bg/20 p-2 text-[11px] text-rift-mutedbright" aria-label="SS career summary">
		<span className="font-display text-rift-goldbright">SS · </span>Confirmed acquisitions: {history.acquisitions} · Review checkpoints held: {history.checkpoints} · Years with recorded ownership: {history.years}
		{history.first && <p>First confirmed acquisition · {history.first.season} · {history.first.label}</p>}
		{history.partial && <p>Partial history: missing records cannot establish exact acquisition dates or uninterrupted ownership.</p>}
	</div>;
}

export function SSCareerYear({ history, seasonId }: { history: ReturnType<typeof playerSSHistory>; seasonId: string }) {
	const rows = history.rows.filter(r => r.seasonId === seasonId);
	const losses = history.losses.filter(r => r.seasonId === seasonId);
	const opening = history.openings.find(r => r.seasonId === seasonId);
	return <details className="mt-2 border-t border-rift-line/30 pt-2">
		<summary className="cursor-pointer text-rift-goldbright focus-visible:outline focus-visible:outline-rift-gold">SS history · Checkpoints held: {rows.length}</summary>
		{opening && <div className="mt-2"><p className="mb-1 text-rift-mutedbright">SS at season opening · continuity reference</p><Holder holder={opening.holder} seasonId={seasonId} /></div>}
		{!opening && !rows.length && !losses.length && <p className="mt-2 text-rift-mutedbright">No SS ownership recorded for this player in this year.</p>}
		<ol className="mt-2 space-y-2">{[...rows.map(r => ({ ...r, action: r.holder.decision ?? "Observed · earlier ownership unknown" })), ...losses.map(r => ({ ...r, action: `Lost SS · ${r.reason}` }))].sort((a, b) => a.phaseIndex - b.phaseIndex).map((r, i) => <li key={`${r.phaseIndex}-${i}`} className="min-w-0"><p className="mb-1 text-rift-mutedbright">{r.label} · {r.action}</p><Holder holder={r.holder} seasonId={seasonId} /></li>)}</ol>
	</details>;
}
