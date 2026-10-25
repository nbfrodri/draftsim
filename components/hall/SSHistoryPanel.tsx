"use client";

import { useMemo, useState } from "react";
import { IconArrowRight, IconCalendar, IconTrophy } from "@tabler/icons-react";
import { LANE_ORDER } from "@/lib/players";
import { ssHistory, ssHistorySummary, playerSSHistory, closingSSHolders, ssRecords, ssSeasonViews, ssRegionView, ssTimeline, type SSArchive } from "@/lib/season/ssHistory";
import { LEAGUE_IDS, type LeagueId, type SSHolder, type SSReview } from "@/lib/season/types";
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

const th = "px-2 py-1.5 text-left text-[10px] font-semibold text-rift-mutedbright";
const td = "px-2 py-1.5 align-middle";
const chip = (on: boolean) => `rounded-sm border px-2 py-1 text-[11px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-rift-gold ${on ? "border-rift-gold/60 bg-rift-gold/10 text-rift-goldbright" : "border-rift-line/50 text-rift-mutedbright hover:text-rift-goldbright"}`;

function Table({ label, head, children }: { label: string; head: string[]; children: React.ReactNode }) {
	return <div className="overflow-x-auto"><table aria-label={label} className="w-full min-w-[320px] border-collapse text-xs"><thead><tr className="border-b border-rift-line/40">{head.map(h => <th key={h} scope="col" className={th}>{h}</th>)}</tr></thead><tbody className="divide-y divide-rift-line/20">{children}</tbody></table></div>;
}

/** All-time SS records across the archive. Projection is computed only once the panel is first opened. */
export function SSRecordsPanel({ entries }: { entries: readonly SSArchive[] }) {
	return <CollapsibleSection ariaLabel="All-time SS records" label="SS records" icon={<IconTrophy size={15} className="shrink-0 text-rift-gold" aria-hidden="true" />} summary={plural(entries.length, "season")} className="my-3">
		<SSRecordsBody entries={entries} />
	</CollapsibleSection>;
}

function SSRecordsBody({ entries }: { entries: readonly SSArchive[] }) {
	const views = useMemo(() => ssSeasonViews(entries), [entries]);
	const records = useMemo(() => ssRecords(entries), [entries]);
	const [region, setRegion] = useState<LeagueId | undefined>();
	const [picked, setPicked] = useState<string[]>([]);
	const regionRows = useMemo(() => region ? ssRegionView(views, region).filter(v => v.holders.length || !v.known) : [], [views, region]);
	const timeline = useMemo(() => ssTimeline(views, picked), [views, picked]);
	const names = new Map(records.seasons.map(p => [p.playerId, p.playerName]));
	const candidates = records.seasons.slice(0, 12);
	const toggle = (id: string) => setPicked(p => p.includes(id) ? p.filter(x => x !== id) : p.length >= 4 ? p : [...p, id]);
	if (!records.knownSeasons) return <p className="p-3 text-xs text-rift-mutedbright">No SS history has been recorded yet.</p>;
	return <div className="space-y-5 p-3 text-xs md:p-4">
		{records.unknownSeasons > 0 && <p className="text-rift-mutedbright">{plural(records.unknownSeasons, "season")} without recorded SS data are left out, not counted as zero.</p>}
		<section aria-label="Most SS seasons"><h4 className="mb-1 font-display text-rift-goldbright">Most SS seasons</h4>
			<Table label="Most SS seasons" head={["Player", "Seasons", "Longest streak"]}>{records.seasons.slice(0, 5).map(p => {
				const s = records.streaks.find(x => x.playerId === p.playerId);
				return <tr key={p.playerId}><td className={td}><PlayerNameLink playerId={p.playerId} name={p.playerName} fallback="Unknown player" className="font-display text-rift-goldbright" /></td><td className={`${td} tabular-nums`}>{p.seasons}</td><td className={`${td} tabular-nums`}>{s ? `${plural(s.length, "year")} (${s.startName}${s.length > 1 ? ` – ${s.endName}` : ""})${s.open ? " · at least" : ""}` : "Unknown"}</td></tr>;
			})}</Table></section>
		<section aria-label="Most SS by team"><h4 className="mb-1 font-display text-rift-goldbright">Most SS by team</h4>
			{records.teams.length ? <Table label="Most SS by team" head={["Team", "SS seasons", "Players", "Peak at once"]}>{records.teams.slice(0, 5).map(t => <tr key={t.key}><td className={td}><span className="inline-flex items-center gap-2"><RegionMark league={t.leagueId} size={16} /><span className="font-display text-rift-goldbright">{t.teamName}</span></span></td><td className={`${td} tabular-nums`}>{t.holderSeasons}</td><td className={`${td} tabular-nums`}>{t.distinctHolders}</td><td className={`${td} tabular-nums`}>{t.peak}</td></tr>)}</Table> : <p className="text-rift-mutedbright">No team attribution recorded.</p>}
			{records.unattributed > 0 && <p className="mt-1 text-rift-mutedbright">{plural(records.unattributed, "holder season")} with unknown team excluded.</p>}</section>
		<section aria-label="SS holders by region"><h4 className="mb-1 font-display text-rift-goldbright">Distinct holders by region</h4>
			<div className="flex flex-wrap gap-1.5" role="group" aria-label="Region">{LEAGUE_IDS.filter(l => records.regions.some(r => r.leagueId === l)).map(l => { const r = records.regions.find(x => x.leagueId === l)!; return <button key={l} type="button" aria-pressed={region === l} onClick={() => setRegion(region === l ? undefined : l)} className={`${chip(region === l)} inline-flex items-center gap-1.5`}><LeagueIcon league={l} size={14} />{l}<span className="tabular-nums text-rift-mutedbright">{r.distinctHolders}</span></button>; })}</div>
			{region && <ul className="mt-2 space-y-1.5" aria-label={`${region} SS by season`}>{regionRows.map(v => <li key={v.seasonId} className="border border-rift-line/30 px-2 py-1.5"><span className="font-display text-rift-goldbright">{v.name}</span>{!v.known ? <span className="ml-2 text-rift-mutedbright">SS not recorded</span> : <span className="ml-2 inline-flex flex-wrap gap-x-3 gap-y-1">{v.holders.map(x => <span key={x.playerId} className="inline-flex items-center gap-1.5"><RoleLabel lane={x.lane} size="sm" className="text-[10px] text-rift-mutedbright" /><PlayerNameLink playerId={x.playerId} name={x.playerName} fallback="Unknown player" seasonId={v.seasonId} className="text-rift-goldbright" /><span className="text-rift-mutedbright">{x.team.teamName}</span></span>)}</span>}</li>)}</ul>}</section>
		<section aria-label="Compare SS timelines"><h4 className="mb-1 font-display text-rift-goldbright">Compare timelines</h4>
			<div className="flex flex-wrap gap-1.5" role="group" aria-label="Players to compare (up to 4)">{candidates.map(p => <button key={p.playerId} type="button" aria-pressed={picked.includes(p.playerId)} onClick={() => toggle(p.playerId)} className={chip(picked.includes(p.playerId))}>{p.playerName ?? "Unknown player"}</button>)}</div>
			{timeline.rows.length > 0 && <div className="mt-2 overflow-x-auto"><table aria-label="SS timeline comparison" className="min-w-full border-collapse text-xs"><thead><tr className="border-b border-rift-line/40"><th scope="col" className={th}>Player</th>{timeline.seasons.map(s => <th key={s.seasonId} scope="col" className={`${th} whitespace-nowrap`}>{s.name}</th>)}</tr></thead><tbody className="divide-y divide-rift-line/20">{timeline.rows.map(r => <tr key={r.playerId}><th scope="row" className={`${td} whitespace-nowrap text-left font-display text-rift-goldbright`}>{r.playerName ?? names.get(r.playerId) ?? "Unknown player"}</th>{r.cells.map((c, i) => <td key={i} className={`${td} text-center`}>{c.state === "held" ? <span className="inline-flex items-center justify-center gap-1 text-rift-goldbright" title={c.team ? `${c.team.teamName} (${c.team.leagueId})` : "Team unknown"}>{c.team ? <RegionMark league={c.team.leagueId} size={14} /> : null}<span aria-label="Held SS">SS</span></span> : c.state === "none" ? <span className="text-rift-mutedbright" aria-label="Did not hold SS">–</span> : <span className="text-rift-mutedbright" aria-label="Not recorded" title="SS not recorded for this season">?</span>}</td>)}</tr>)}</tbody></table></div>}</section>
	</div>;
}
