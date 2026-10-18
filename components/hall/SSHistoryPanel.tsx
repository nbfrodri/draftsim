"use client";

import { useMemo } from "react";
import { IconArrowRight, IconCalendar, IconTrophy } from "@tabler/icons-react";
import { LANE_ORDER } from "@/lib/players";
import { ssHistory, ssHistorySummary, playerSSHistory, closingSSHolders, type SSArchive } from "@/lib/season/ssHistory";
import type { SSHolder, SSReview } from "@/lib/season/types";
import { resolveTeamLogo } from "@/lib/season/realTeams";
import RoleLabel from "../RoleLabel";
import RegionMark from "../RegionMark";
import { plural } from "@/lib/plural";
import CollapsibleSection from "../CollapsibleSection";
import LeagueIcon from "../LeagueIcon";
import SplitIcon from "../season/SplitIcon";
import PlayerNameLink from "../player/PlayerNameLink";
import TeamNameLink from "../team/TeamNameLink";

const summaryClass = "cursor-pointer rounded-sm py-2 font-display text-rift-goldbright focus-visible:outline focus-visible:outline-2 focus-visible:outline-rift-gold";
const metricLabel = "text-[10px] text-rift-mutedbright";
const decisions = { gained: "Gained SS", retained: "Retained SS", carried: "Carried from previous season" };
const reasons: Record<string, string> = { decline: "Base tier no longer eligible", inactive: "Left the active roster", "role-change": "Changed role", offseason: "Offseason roster change", Review: "Ownership changed at review" };

function PhaseIcon({ phase }: { phase: Pick<SSReview, "split" | "event"> }) {
	return phase.split ? <SplitIcon split={phase.split} size={18} /> : phase.event ? <LeagueIcon league={phase.event} size={18} /> : <IconCalendar size={18} className="text-rift-mutedbright" aria-hidden />;
}

function HolderTeam({ holder, seasonId }: { holder: SSHolder; seasonId: string }) {
	return holder.team ? <span className="inline-flex min-w-0 max-w-full items-center gap-2"><RegionMark league={holder.team.leagueId} size={16} /><TeamNameLink teamId={holder.team.teamId} name={holder.team.teamName} leagueId={holder.team.leagueId} logoUrl={resolveTeamLogo(holder.team.teamName, holder.team.logoUrl)} seasonId={seasonId} logoSize={18} className="inline-flex max-w-full items-center gap-2 text-xs text-rift-mutedbright" /></span> : <span className="text-xs text-rift-mutedbright">Historical team unknown</span>;
}

function Holder({ holder, seasonId, showRole = true }: { holder: SSHolder; seasonId: string; showRole?: boolean }) {
	return <div className="min-w-0 space-y-2"><div className="flex min-w-0 items-center gap-2">{showRole && <RoleLabel lane={holder.lane} className="shrink-0 text-[10px] text-rift-mutedbright" />}<PlayerNameLink playerId={holder.playerId} name={holder.playerName} fallback="Unknown player" seasonId={seasonId} title={holder.playerName} className="min-w-0 truncate font-display text-rift-goldbright" /></div><HolderTeam holder={holder} seasonId={seasonId} /></div>;
}

function Evidence({ holder }: { holder: SSHolder }) {
	return <div className="mt-2 border-t border-rift-line/30 pt-2"><dl className="flex gap-x-5 tabular-nums"><div><dt className={metricLabel}>Score</dt><dd className="mt-0.5 font-display text-[13px] text-rift-goldbright">{holder.evidence.score.toFixed(2)}</dd></div><div><dt className={metricLabel}>Evidence</dt><dd className="mt-0.5 font-display text-[13px] text-rift-goldbright">{holder.evidence.games} rated games</dd></div></dl>{holder.decision === "carried" && <p className="mt-1 text-[10px] text-rift-mutedbright">Evidence from {holder.evidence.phaseLabel} in the previous season.</p>}</div>;
}

export default function SSHistoryPanel({ entry }: { entry: SSArchive }) {
	const counts = useMemo(() => ssHistorySummary(entry), [entry]);
	const summary = counts ? `${plural(counts.reviews, "review")} · ${plural(counts.holders, "holder")}` : "Not recorded";
	return <CollapsibleSection ariaLabel="Season SS history" label="SS history" icon={<IconTrophy size={15} className="shrink-0 text-rift-gold" aria-hidden="true" />} summary={summary} className="">
		<SSHistoryBody entry={entry} />
	</CollapsibleSection>;
}

function SSHistoryBody({ entry }: { entry: SSArchive }) {
	const checkpoints = useMemo(() => ssHistory(entry), [entry]);
	const closing = useMemo(() => closingSSHolders(entry), [entry]);
	return (
		<div className="p-3 text-xs md:p-4">
		<p className="mb-3 leading-relaxed text-rift-mutedbright">Ownership after each phase review. Tournament cards keep the tier actually used during play.</p>
		{!checkpoints.length && <p className="py-2 text-rift-mutedbright">{entry.ssReviews === undefined ? "SS reviews were not recorded for this season." : "No SS reviews took place this season."}</p>}
		<div className="space-y-2">{checkpoints.map(c => {
			const losses = (entry.ssLosses ?? []).filter(l => l.phaseIndex === c.phaseIndex);
			return <div key={c.phaseIndex}>
				{losses.filter(l => !l.afterReview).map(l => <LossRow key={l.holder.playerId} loss={l} seasonId={entry.id} />)}
				<details className="border border-rift-line/50 bg-rift-bg/30 px-3"><summary className={summaryClass}><span className="ml-1 inline-flex max-w-full items-center gap-2 align-middle"><PhaseIcon phase={c} /><span>{c.label} · SS review · {c.holders.length}/5</span></span></summary>
					<div className="grid grid-cols-1 gap-2 border-t border-rift-line/30 py-3 sm:grid-cols-2 xl:grid-cols-5">{LANE_ORDER.map(lane => {
						const holder = c.holders.find(h => h.lane === lane);
						return <article key={lane} className="min-w-0 border border-rift-line/50 bg-rift-bg/30"><h4 className="flex items-center gap-1.5 border-b border-rift-line/40 px-3 py-2 text-[10px] font-semibold text-rift-goldbright"><RoleLabel lane={lane} size="sm" />{!holder && <span className="ml-auto font-normal text-rift-mutedbright">Vacant</span>}</h4>{holder && <div className="p-3"><Holder holder={holder} seasonId={entry.id} showRole={false} /><p className="mt-3 text-xs font-display text-rift-goldbright">{holder.decision ? decisions[holder.decision] : "Observed · earlier ownership unknown"}</p><Evidence holder={holder} /></div>}</article>;
					})}</div>
					{c.lost.map(h => <div key={h.playerId} className="mb-3 border-t border-rift-line/30 pt-3"><p className="mb-2 text-rift-mutedbright">Lost SS · ownership changed at this review</p><Holder holder={h} seasonId={entry.id} /></div>)}
				</details>
				{losses.filter(l => l.afterReview).map(l => <LossRow key={l.holder.playerId} loss={l} seasonId={entry.id} />)}
			</div>;
		})}</div>
		{(entry.ssLosses ?? []).filter(l => !checkpoints.some(c => c.phaseIndex === l.phaseIndex)).map(l => <LossRow key={`${l.phaseIndex}:${l.holder.playerId}`} loss={l} seasonId={entry.id} />)}
		{closing && <details className="mt-3 border border-rift-line/50 bg-rift-bg/30 px-3"><summary className={summaryClass}>Closing recorded ownership · {closing.length}/5</summary><div className="grid grid-cols-1 gap-3 border-t border-rift-line/30 py-3 sm:grid-cols-2 xl:grid-cols-5">{closing.map(h => <Holder key={h.playerId} holder={h} seasonId={entry.id} />)}</div>{!closing.length && <p className="pb-3 text-rift-mutedbright">All seats vacant at the last recorded boundary.</p>}</details>}
		</div>
	);
}

function LossRow({ loss, seasonId }: { loss: NonNullable<SSArchive["ssLosses"]>[number]; seasonId: string }) {
	return <div className="my-2 border border-l-2 border-rift-line/40 border-l-rift-red/60 bg-rift-bg/20 px-3 py-2"><p className="mb-2 flex items-center gap-2 text-xs text-rift-mutedbright"><IconCalendar size={14} />{loss.label} · Lost SS — {reasons[loss.reason]}</p><Holder holder={loss.holder} seasonId={seasonId} /></div>;
}

export function SSCareerSummary({ history }: { history: ReturnType<typeof playerSSHistory> }) {
	return <div aria-label="SS career summary"><dl className="grid grid-cols-3 gap-3 text-xs text-rift-mutedbright">{[["Times gained SS", history.acquisitions], ["Reviews held", history.checkpoints], ["Years with recorded SS", history.years]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd className="mt-1 font-display text-xl tabular-nums text-rift-goldbright">{value}</dd></div>)}</dl>{history.first && <p className="mt-2 text-xs text-rift-mutedbright">First confirmed acquisition · {history.first.season} · {history.first.label}</p>}{history.partial && <p className="mt-2 text-xs text-rift-mutedbright">Partial history: these counts reflect recorded evidence, not a complete lifetime total.</p>}</div>;
}

export function SSCareerYear({ history, seasonId }: { history: ReturnType<typeof playerSSHistory>; seasonId: string }) {
	const rows = history.rows.filter(r => r.seasonId === seasonId);
	const losses = history.losses.filter(r => r.seasonId === seasonId);
	const opening = history.openings.find(r => r.seasonId === seasonId);
	const events = [...rows.map(r => ({ ...r, order: r.phaseIndex * 3 + 1, action: r.holder.decision ? decisions[r.holder.decision] : "Ownership observed", reason: "" })), ...losses.map(r => ({ ...r, order: r.phaseIndex * 3 + ("afterReview" in r ? r.afterReview ? 2 : 0 : 1), action: "Lost SS", reason: reasons[r.reason] ?? r.reason }))].sort((a, b) => a.order - b.order);
	return <details className="mt-3 border border-rift-line/50 bg-rift-bg/30 px-3"><summary className={summaryClass}>SS history · {plural(rows.length, "review")} held</summary>
		<p className="mb-3 text-xs leading-relaxed text-rift-mutedbright">When ownership changed, which team the player represented, and the evidence behind each review. Retaining or carrying SS is not another acquisition.</p>
		{opening && <div className="mb-3 border border-l-2 border-rift-line/40 border-l-rift-gold/60 bg-rift-bg/20 px-3 py-2"><p className="mb-2 flex items-center gap-2 text-xs text-rift-goldbright"><IconCalendar size={16} />Season opening · Carried from previous season</p><HolderTeam holder={opening.holder} seasonId={seasonId} /><p className="mt-1 text-xs text-rift-mutedbright">Continuity reference, not a new award.</p></div>}
		{!opening && !events.length && <p className="pb-3 text-xs text-rift-mutedbright">No ownership evidence available for this year.</p>}
		<ol className="divide-y divide-rift-line/30">{events.map(r => <li key={`${r.phaseIndex}:${r.action}:${r.holder.playerId}`} className="py-3"><div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs"><span className="inline-flex items-center gap-2 font-display text-rift-goldbright"><PhaseIcon phase={r} />{r.label}</span><IconArrowRight size={13} className="text-rift-mutedbright" aria-hidden /><span className="text-rift-goldbright">{r.action}</span></div><div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1"><RoleLabel lane={r.holder.lane} size="sm" className="text-[10px] text-rift-mutedbright" /><HolderTeam holder={r.holder} seasonId={seasonId} /></div>{r.reason ? <p className="mt-2 text-xs text-rift-mutedbright">{r.reason}</p> : <Evidence holder={r.holder} />}</li>)}</ol>
	</details>;
}
