import { LANE_ORDER } from "../players";
import type { SeasonHistoryEntry } from "./history";
import type { SeasonState, SSHolder, SSReview, SSLoss } from "./types";

export function snapshotSSHolders(teams: SeasonState["teams"]): SSHolder[] {
	return LANE_ORDER.flatMap(lane => teams.flatMap(t => t.players.filter(p => p.lane === lane && p.tier === "SS" && p.id && p.ss).map(p => ({
		playerId: p.id!, lane, evidence: { ...p.ss! }, ...(p.name ? { playerName: p.name } : {}),
		team: { teamId: t.id, teamName: t.name, leagueId: t.leagueId, ...(t.logoUrl ? { logoUrl: t.logoUrl } : {}) },
	}))));
}

/** Called at mutation boundaries, never during hydration or historical rendering. */
export function recordSSLosses(before: SeasonState, after: SeasonState, fallback: SSLoss["reason"] = "inactive"): SeasonState {
	const active = new Map(after.teams.flatMap(t => t.players.map(p => [p.id, p] as const)));
	const losses = snapshotSSHolders(before.teams).filter(h => {
		const p = active.get(h.playerId);
		return !p || p.tier !== "SS" || p.lane !== h.lane;
	}).map(holder => {
		const p = active.get(holder.playerId);
		return { phaseIndex: before.phaseIndex, afterReview: !!before.ssReviews?.some(r => r.phaseIndex === before.phaseIndex), label: before.status === "complete" ? "Offseason" : before.phases[before.phaseIndex]?.label ?? "Roster change", holder,
			reason: p && p.lane !== holder.lane ? "role-change" as const : p && p.tier !== "SS" ? "decline" as const : fallback };
	});
	if (!losses.length) return after;
	return { ...after, ssLosses: [...(after.ssLosses ?? []), ...losses.filter(l => !(after.ssLosses ?? []).some(x => x.phaseIndex === l.phaseIndex && x.holder.playerId === l.holder.playerId && x.holder.lane === l.holder.lane))] };
}

export type SSArchive = Pick<SeasonHistoryEntry, "id" | "name" | "ssReviews" | "ssOpening" | "ssLosses" | "phaseRosters"> & Partial<Pick<SeasonHistoryEntry, "archivedAt" | "franchiseYear">>;
export interface SSCheckpoint extends SSReview {
	lost: SSHolder[];
	knownBefore: boolean;
}

export function ssHistory(entry: SSArchive): SSCheckpoint[] {
	let previous = entry.ssOpening;
	let previousPhase = -1;
	return [...(entry.ssReviews ?? [])].sort((a, b) => a.phaseIndex - b.phaseIndex).map(review => {
		const phase = entry.phaseRosters?.find(p => p.phaseIndex === review.phaseIndex);
		if (entry.phaseRosters?.some(p => p.phaseIndex > previousPhase && p.phaseIndex < review.phaseIndex && !(entry.ssReviews ?? []).some(r => r.phaseIndex === p.phaseIndex))) previous = undefined;
		const losses = (entry.ssLosses ?? []).filter(l => (l.phaseIndex > previousPhase || l.phaseIndex === previousPhase && l.afterReview) && (l.phaseIndex < review.phaseIndex || l.phaseIndex === review.phaseIndex && !l.afterReview));
		const remaining = previous?.filter(h => !losses.some(l => l.holder.playerId === h.playerId && l.holder.lane === h.lane));
		const knownBefore = remaining !== undefined;
		const holders = review.holders.map(h => {
			const roster = entry.phaseRosters?.find(p => p.phaseIndex === review.phaseIndex);
			const teams = roster?.teams.filter(t => t.players.some(p => p.id === h.playerId && p.lane === h.lane)) ?? [];
			const team = teams.length === 1 ? teams[0] : undefined;
			const player = team?.players.find(p => p.id === h.playerId);
			return { ...h,
				...(h.playerName ? {} : player?.name ? { playerName: player.name } : {}),
				// Legacy entrant teams are not proof of review-time membership after transfers.
				decision: h.decision ?? (remaining?.some(p => p.playerId === h.playerId && p.lane === h.lane) ? "retained" : knownBefore ? "gained" : undefined),
			};
		});
		const lost = (remaining ?? []).filter(h => !holders.some(p => p.playerId === h.playerId && p.lane === h.lane));
		previous = holders;
		previousPhase = review.phaseIndex;
		return { ...review, split: review.split ?? phase?.split, event: review.event ?? phase?.event, holders, lost, knownBefore };
	});
}

export function playerSSHistory(entries: readonly SSArchive[], playerId: string) {
	const years = [...entries].sort((a, b) => a.archivedAt !== undefined && b.archivedAt !== undefined ? a.archivedAt - b.archivedAt : (a.franchiseYear ?? 0) - (b.franchiseYear ?? 0)).map(entry => ({ entry, checkpoints: ssHistory(entry) }));
	const rows = years.flatMap(({ entry, checkpoints }) => checkpoints.flatMap(c => c.holders.filter(h => h.playerId === playerId).map(holder => ({ seasonId: entry.id, season: entry.name, phaseIndex: c.phaseIndex, label: c.label, split: c.split, event: c.event, holder }))));
	const losses = years.flatMap(({ entry, checkpoints }) => [
		...checkpoints.flatMap(c => c.lost.filter(h => h.playerId === playerId).map(holder => ({ seasonId: entry.id, season: entry.name, phaseIndex: c.phaseIndex, label: c.label, split: c.split, event: c.event, holder, reason: "Review" }))),
		...(entry.ssLosses ?? []).filter(l => l.holder.playerId === playerId).map(l => {
			const phase = l.label === "Offseason" ? undefined : entry.phaseRosters?.find(p => p.phaseIndex === l.phaseIndex);
			return { seasonId: entry.id, season: entry.name, split: phase?.split, event: phase?.event, ...l };
		}),
	]);
	const openings = years.flatMap(({ entry }) => (entry.ssOpening ?? []).filter(h => h.playerId === playerId).map(holder => ({ seasonId: entry.id, holder })));
	return {
		rows, acquisitions: rows.filter(r => r.holder.decision === "gained").length,
		losses, openings,
		checkpoints: rows.length, years: new Set([...rows.map(r => r.seasonId), ...years.filter(({ entry }) => entry.ssOpening?.some(h => h.playerId === playerId) || entry.ssLosses?.some(l => l.holder.playerId === playerId)).map(({ entry }) => entry.id)]).size,
		partial: years.some(({ entry, checkpoints }) => entry.ssOpening === undefined || checkpoints.some(c => !c.knownBefore)),
		first: rows.find(r => r.holder.decision === "gained"),
	};
}

export function closingSSHolders(entry: SSArchive): SSHolder[] | undefined {
	const last = ssHistory(entry).at(-1);
	return last?.holders.filter(h => !(entry.ssLosses ?? []).some(l => l.holder.playerId === h.playerId && l.holder.lane === h.lane && (l.phaseIndex > last.phaseIndex || l.phaseIndex === last.phaseIndex && l.afterReview)));
}
