import { LANE_ORDER } from "../players";
import type { SeasonHistoryEntry } from "./history";
import { LEAGUE_IDS, type LeagueId, type SeasonState, type SSHolder, type SSReview, type SSLoss } from "./types";

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

export function ssHistorySummary(entry: SSArchive): { reviews: number; holders: number } | undefined {
	if (entry.ssReviews === undefined) return undefined;
	return { reviews: entry.ssReviews.length, holders: new Set(entry.ssReviews.flatMap(r => r.holders.map(h => h.playerId))).size };
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
	let streak: { value: SSStreak | undefined } | undefined;
	return {
		/** Computed on first read so callers that never show it pay nothing. */
		get streak() { return (streak ??= { value: playerSSStreak(entries, playerId) }).value; },
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

// ---- Cross-season records (derived from the lazily projected archive; nothing persisted) ----

export type SSPhase = Pick<SSReview, "phaseIndex" | "label" | "split" | "event">;

export interface SSSeasonView {
	seasonId: string;
	name: string;
	/** Franchise year; undefined when the archive predates it. */
	year?: number;
	/** False when this season has no recorded SS data at all (unknown, not "nobody held SS"). */
	known: boolean;
	/** playerId -> holder seen in this season (latest observation) and every team observed. */
	holders: Map<string, { holder: SSHolder; teams: Map<string, NonNullable<SSHolder["team"]>>; phases?: (SSPhase & { team?: SSHolder["team"] })[] }>;
	/** Only checkpoints with observed ownership; opening evidence may belong to a prior year. */
	phases?: SSPhase[];
	/** Highest simultaneous holder count per team key at one review. */
	peakByTeam: Map<string, number>;
}

export const ssTeamKey = (t: { leagueId: string; teamName: string }) => `${t.leagueId}:${t.teamName}`;

function chronological<T extends SSArchive>(entries: readonly T[]): T[] {
	return [...entries].sort((a, b) => a.archivedAt !== undefined && b.archivedAt !== undefined ? a.archivedAt - b.archivedAt : (a.franchiseYear ?? 0) - (b.franchiseYear ?? 0));
}

export function ssSeasonViews(entries: readonly SSArchive[]): SSSeasonView[] {
	return chronological(entries).map(entry => {
		const holders: SSSeasonView["holders"] = new Map();
		const peakByTeam = new Map<string, number>();
		const seen = (h: SSHolder, phase?: SSPhase) => {
			const cur = holders.get(h.playerId) ?? { holder: h, teams: new Map(), phases: [] };
			cur.holder = { ...h, ...(h.playerName ? {} : cur.holder.playerName ? { playerName: cur.holder.playerName } : {}) };
			if (h.team) { cur.teams.delete(ssTeamKey(h.team)); cur.teams.set(ssTeamKey(h.team), h.team); }
			if (phase) (cur.phases ??= []).push({ ...phase, ...(h.team ? { team: h.team } : {}) });
			holders.set(h.playerId, cur);
		};
		const checkpoints = ssHistory(entry);
		const observations: { holder: SSHolder; order: number; phase?: SSPhase }[] = (entry.ssOpening ?? []).map(holder => ({ holder, order: -1 }));
		for (const c of checkpoints) {
			const counts = new Map<string, number>();
			for (const h of c.holders) {
				observations.push({ holder: h, order: c.phaseIndex * 3 + 1, phase: { phaseIndex: c.phaseIndex, label: c.label, split: c.split, event: c.event } });
				if (h.team) { const k = ssTeamKey(h.team); counts.set(k, (counts.get(k) ?? 0) + 1); }
			}
			for (const [k, n] of counts) peakByTeam.set(k, Math.max(peakByTeam.get(k) ?? 0, n));
		}
		for (const l of entry.ssLosses ?? []) observations.push({ holder: l.holder, order: l.phaseIndex * 3 + (l.afterReview ? 2 : 0) });
		for (const observation of observations.sort((a, b) => a.order - b.order)) seen(observation.holder, observation.phase);
		return { seasonId: entry.id, name: entry.name, ...(entry.franchiseYear !== undefined ? { year: entry.franchiseYear } : {}), known: entry.ssReviews !== undefined || entry.ssOpening !== undefined || !!entry.ssLosses?.length, holders, peakByTeam, phases: checkpoints.filter(c => c.holders.length).map(c => ({ phaseIndex: c.phaseIndex, label: c.label, split: c.split, event: c.event })) };
	});
}

export interface SSStreak { playerId: string; playerName?: string; length: number; startYear: number; endYear: number; startName: string; endName: string;
	/** True when an unknown year borders the run, so the real streak may be longer. */
	open: boolean }

/** Longest run of consecutive franchise years with recorded SS ownership per player. Unknown years break a run and flag it open. */
export function ssStreaks(views: readonly SSSeasonView[]): SSStreak[] {
	const dated = views.filter(v => v.year !== undefined).sort((a, b) => a.year! - b.year!);
	const best = new Map<string, SSStreak>();
	const runs = new Map<string, { start: SSSeasonView; last: SSSeasonView; length: number; openStart: boolean }>();
	const close = (id: string, openEnd: boolean) => {
		const r = runs.get(id); if (!r) return;
		runs.delete(id);
		const cur = best.get(id);
		if (!cur || r.length > cur.length) best.set(id, { playerId: id, playerName: r.last.holders.get(id)?.holder.playerName, length: r.length, startYear: r.start.year!, endYear: r.last.year!, startName: r.start.name, endName: r.last.name, open: r.openStart || openEnd });
	};
	let prev: SSSeasonView | undefined;
	for (const v of dated) {
		const contiguous = prev !== undefined && v.year === prev.year! + 1;
		const gapUnknown = !contiguous && prev !== undefined && v.year! > prev.year! + 1; // missing archive years are unknown too
		for (const id of [...runs.keys()]) if (!contiguous || !v.known || !v.holders.has(id)) close(id, !contiguous || !v.known);
		if (v.known) for (const id of v.holders.keys()) {
			const r = runs.get(id);
			if (r) { r.last = v; r.length++; } else runs.set(id, { start: v, last: v, length: 1, openStart: gapUnknown || (prev !== undefined && !prev.known) });
		}
		prev = v;
	}
	for (const id of [...runs.keys()]) close(id, false);
	return [...best.values()].sort((a, b) => b.length - a.length || a.startYear - b.startYear || a.playerId.localeCompare(b.playerId));
}

/** One player's longest recorded SS streak, or undefined when no recorded SS season exists for them. */
export function playerSSStreak(entries: readonly SSArchive[], playerId: string): SSStreak | undefined {
	return ssStreaks(ssSeasonViews(entries)).find(s => s.playerId === playerId);
}

export interface SSRecords {
	/** Most SS seasons per player (only seasons with recorded data count). */
	seasons: { playerId: string; playerName?: string; seasons: number; lane?: SSHolder["lane"]; team?: SSHolder["team"] }[];
	teams: { key: string; teamName: string; leagueId: LeagueId; logoUrl?: string; holderSeasons: number; distinctHolders: number; peak: number }[];
	regions: { leagueId: LeagueId; distinctHolders: number; holderSeasons: number }[];
	streaks: SSStreak[];
	knownSeasons: number;
	unknownSeasons: number;
	/** Holder-seasons with no recorded team, excluded from team and region tables. */
	unattributed: number;
}

export function ssRecords(entries: readonly SSArchive[]): SSRecords {
	const views = ssSeasonViews(entries);
	const players = new Map<string, { name?: string; seasons: number; holder?: SSHolder }>();
	const teams = new Map<string, { team: NonNullable<SSHolder["team"]>; keys: Set<string>; holders: Set<string>; peak: number }>();
	const regions = new Map<LeagueId, { holders: Set<string>; keys: Set<string> }>();
	let unattributed = 0;
	for (const v of views) {
		if (!v.known) continue;
		for (const [id, { holder, teams: ts }] of v.holders) {
			const p = players.get(id) ?? { seasons: 0 };
			p.seasons++; p.name = holder.playerName ?? p.name; p.holder = holder; players.set(id, p);
			if (!ts.size) unattributed++;
			const seenRegions = new Set<LeagueId>();
			for (const [k, t] of ts) {
				const cur = teams.get(k) ?? { team: t, keys: new Set(), holders: new Set(), peak: 0 };
				cur.team = t; cur.keys.add(`${v.seasonId}:${id}`); cur.holders.add(id); teams.set(k, cur);
				if (!seenRegions.has(t.leagueId)) {
					seenRegions.add(t.leagueId);
					const r = regions.get(t.leagueId) ?? { holders: new Set(), keys: new Set() };
					r.holders.add(id); r.keys.add(`${v.seasonId}:${id}`); regions.set(t.leagueId, r);
				}
			}
		}
		for (const [k, n] of v.peakByTeam) { const t = teams.get(k); if (t) t.peak = Math.max(t.peak, n); }
	}
	const order = (a: string, b: string) => a.localeCompare(b);
	return {
		seasons: [...players].map(([playerId, p]) => ({ playerId, ...(p.name ? { playerName: p.name } : {}), seasons: p.seasons,
			// Attribute only the latest observed holder; missing legacy fields stay unknown.
			...(p.holder?.lane ? { lane: p.holder.lane } : {}), ...(p.holder?.team ? { team: p.holder.team } : {}),
		})).sort((a, b) => b.seasons - a.seasons || order(a.playerId, b.playerId)),
		teams: [...teams].map(([key, t]) => ({ key, teamName: t.team.teamName, leagueId: t.team.leagueId, ...(t.team.logoUrl ? { logoUrl: t.team.logoUrl } : {}), holderSeasons: t.keys.size, distinctHolders: t.holders.size, peak: t.peak })).sort((a, b) => b.holderSeasons - a.holderSeasons || b.peak - a.peak || order(a.key, b.key)),
		regions: [...regions].map(([leagueId, r]) => ({ leagueId, distinctHolders: r.holders.size, holderSeasons: r.keys.size })).sort((a, b) => b.distinctHolders - a.distinctHolders || LEAGUE_IDS.indexOf(a.leagueId) - LEAGUE_IDS.indexOf(b.leagueId)),
		streaks: ssStreaks(views),
		knownSeasons: views.filter(v => v.known).length,
		unknownSeasons: views.filter(v => !v.known).length,
		unattributed,
	};
}

/** Per-region view: who held SS while representing a team from the region, by season. */
export function ssRegionView(views: readonly SSSeasonView[], leagueId: LeagueId) {
	return views.map(v => {
		const holders = !v.known ? [] : [...v.holders.values()].filter(h => [...h.teams.values()].some(t => t.leagueId === leagueId)).map(h => ({
			playerId: h.holder.playerId, lane: h.holder.lane, playerName: h.holder.playerName,
			phases: h.phases?.filter(p => p.team?.leagueId === leagueId),
			team: [...h.teams.values()].filter(t => t.leagueId === leagueId).at(-1)!,
		}));
		const phases = [...new Map(holders.flatMap(h => h.phases ?? []).map(p => [p.phaseIndex, p])).values()].sort((a, b) => a.phaseIndex - b.phaseIndex);
		return { seasonId: v.seasonId, name: v.name, known: v.known, phases, holders };
	});
}

export type SSTimelineCell = { state: "held"; team?: NonNullable<SSHolder["team"]>; phases?: SSPhase[] } | { state: "none" } | { state: "unknown" };
export interface SSTimeline { seasons: { seasonId: string; name: string; year?: number; known: boolean; phases?: SSPhase[] }[]; rows: { playerId: string; playerName?: string; cells: SSTimelineCell[] }[] }

/** Comparable season-by-season timeline for chosen players. Seasons without recorded SS data are "unknown", never "none". */
export function ssTimeline(views: readonly SSSeasonView[], playerIds: readonly string[]): SSTimeline {
	return {
		seasons: views.map(v => ({ seasonId: v.seasonId, name: v.name, ...(v.year !== undefined ? { year: v.year } : {}), known: v.known, phases: v.phases })),
		rows: [...new Set(playerIds)].map(playerId => ({
			playerId,
			playerName: [...views].reverse().map(v => v.holders.get(playerId)?.holder.playerName).find(Boolean),
			cells: views.map((v): SSTimelineCell => {
				if (!v.known) return { state: "unknown" };
				const h = v.holders.get(playerId);
				if (!h) return { state: "none" };
				return { state: "held", ...(h.holder.team ? { team: h.holder.team } : {}), phases: h.phases ?? [] };
			}),
		})),
	};
}

export interface SSPlayerIndexEntry {
	playerId: string;
	playerName?: string;
	lane: SSHolder["lane"];
	team?: SSHolder["team"];
	seasonId: string;
	phases: SSPhase[];
	seasons: number;
	regions: LeagueId[];
}

/** Complete holder catalogue, ranked by recorded seasons; identity is always the stable id. */
export function ssPlayerIndex(views: readonly SSSeasonView[], records?: SSRecords): SSPlayerIndexEntry[] {
	const players = new Map<string, SSPlayerIndexEntry>();
	for (const v of views) if (v.known) for (const [playerId, h] of v.holders) {
		const previous = players.get(playerId);
		const regions = new Set([...(previous?.regions ?? []), ...[...h.teams.values()].map(t => t.leagueId)]);
		players.set(playerId, { playerId, playerName: h.holder.playerName ?? previous?.playerName, lane: h.holder.lane, team: h.holder.team, seasonId: v.seasonId, phases: h.phases ?? [], seasons: (previous?.seasons ?? 0) + 1, regions: LEAGUE_IDS.filter(l => regions.has(l)) });
	}
	const rank = records ? new Map(records.seasons.map((p, i) => [p.playerId, i])) : undefined;
	return [...players.values()].sort((a, b) => rank ? (rank.get(a.playerId) ?? Infinity) - (rank.get(b.playerId) ?? Infinity) || a.playerId.localeCompare(b.playerId) : b.seasons - a.seasons || a.playerId.localeCompare(b.playerId));
}

/** Season overlap means ownership somewhere in the same season, not necessarily at the same review. */
export function ssCompare(views: readonly SSSeasonView[], playerIds: readonly string[]) {
	const timeline = ssTimeline(views, playerIds);
	const streaks = new Map(ssStreaks(views).map(s => [s.playerId, s]));
	return {
		seasons: timeline.seasons,
		overlapSeasons: timeline.rows.length ? views.filter((v, i) => v.known && timeline.rows.every(r => r.cells[i].state === "held")).map(v => v.seasonId) : [],
		rows: timeline.rows.map(row => {
			const held = views.filter(v => v.known && v.holders.has(row.playerId));
			const teams = new Map(held.flatMap(v => [...v.holders.get(row.playerId)!.teams]));
			const regions = new Set([...teams.values()].map(t => t.leagueId));
			const season = (v?: SSSeasonView) => v ? { seasonId: v.seasonId, name: v.name } : undefined;
			return { ...row, summary: { seasons: held.length, longestStreak: streaks.get(row.playerId), firstSeason: season(held[0]), lastSeason: season(held.at(-1)), distinctTeams: teams.size, regions: LEAGUE_IDS.filter(l => regions.has(l)) } };
		}),
	};
}
