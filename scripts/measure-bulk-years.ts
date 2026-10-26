// Disposable production-engine benchmark. No store, personal saves or app database.
// node --expose-gc --import tsx scripts/measure-bulk-years.ts [years=30] [--full-match-sim] [--app-formats] [--persist]
// JSONL output: per-year samples plus summaries at 10, 30 and the final year.
// --app-formats uses the New Season defaults (bo5 playoffs, bo3/bo5 internationals)
// instead of the all-bo1 measurement config.
// --persist saves the store's persisted shape through the real desktop path
// (savePersistedStateToDbExecutor) into an in-memory node:sqlite database and
// records every persist_batch statement and the IPC JSON payload, plus the
// structured-clone size (v8.serialize) of bulk-worker requests and responses.
import { serialize as v8Serialize } from "node:v8";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import catalogue from "../lib/data/champions.json";
import type { Champion } from "../lib/types";
import type { PlayerFormMap } from "../lib/playerForm";
import { createRng } from "../lib/rng";
import { generateSeasonTeams } from "../lib/season/teamGen";
import { LEAGUE_IDS, type SeasonConfig } from "../lib/season/types";
import { advanceTransferWindow, applyTournamentUpdate, createSeason, currentPhase, nextPendingTournament } from "../lib/season/engine";
import { seedFranchise, startNextSeasonWithArchive } from "../lib/season/franchise";
import { buildSeasonHistoryEntry, type SeasonHistoryEntry } from "../lib/season/history";
import { autoPlayMatch } from "../lib/sim/autoPlayMatch";
import { startSwissPlayoffs, startGroupsPlayoffs, startRoundRobinPlayoffs, recordMatchWinner, type TournamentState } from "../lib/tournament";
import { collectSimResultUpdates, compressSimResultsFeed, type SimResultEntry, type SimResultEntryCache } from "../lib/season/simResultsSummary";
import { createSeries, requiredWins } from "../lib/series";
import { savePersistedStateToDbExecutor, type SqlExecutor } from "../lib/desktopSqlite";
import { SCHEMA_SQL } from "../lib/desktopSqliteSchema";
import { compactEncodeSeasonForPersist, encodeSeasonForDesktopDb } from "../lib/recapCompression";
import { compactEncodeRealitiesForPersist } from "../store/persistenceEncoding";
import { DEFAULT_INTL_CONFIGS, DEFAULT_LEAGUE_CONFIG } from "../components/season/configCards";
import type { PersistedStoreState } from "../lib/desktopSqliteSchema";
import type { SavedReality } from "../store/types";

// Fast mode isolates archival/lifecycle costs using synthetic game recaps.
// --full-match-sim additionally runs production AI drafting and match simulation.
const fullMatchSim = process.argv.includes("--full-match-sim");
const appFormats = process.argv.includes("--app-formats");
const measurePersist = process.argv.includes("--persist");
const years = Number(process.argv.slice(2).find(a => !a.startsWith("--")) ?? 30);
if (!Number.isSafeInteger(years) || years < 1 || years > 50) throw new Error("Years must be an integer in [1, 50]");
const champions = catalogue.champions as Champion[];
const config: SeasonConfig = {
	name: "Bulk archive measurement", sharedLeagueConfig: true, controlledTeamId: null,
	aiDifficulty: "normal", liveMeta: false, patchShift: false, fearless: false,
	playerDevelopment: true, playerTransfers: true, formDrift: true,
	intlEarlySeries: "bo1", intlFinalsSeries: "bo1",
	leagueConfigs: Object.fromEntries(LEAGUE_IDS.map(id => [id, appFormats ? { ...DEFAULT_LEAGUE_CONFIG } : {
		format: "round-robin-playoffs", regularSeries: "bo1", playoffSeries: "bo1", playoffTeams: 4, roundRobinLegs: 2,
	}])) as SeasonConfig["leagueConfigs"],
	...(appFormats ? { intlConfigs: DEFAULT_INTL_CONFIGS, intlEarlySeries: "bo3", intlFinalsSeries: "bo5" } as const : {}),
};
const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value));

// ── Persistence measurement (disposable in-memory SQLite, real encoders) ──
type Statement = { query: string; bindValues: unknown[] };
type PersistSample = {
	statements: number; payloadBytes: number; stringifyMs: number; saveMs: number;
	largestStatementBytes: number; largestStatement: string;
	seasonRowBytes: number; seasonFragmentBytes: number; historyRowBytes: number; otherBytes: number;
};
function createMeasuredExecutor() {
	const sqlite = new DatabaseSync(":memory:");
	sqlite.exec(SCHEMA_SQL);
	const run = (query: string, values: unknown[] = []) => sqlite.prepare(query).run(...values as SQLInputValue[]);
	let last: Statement[] = [];
	const executor: SqlExecutor = {
		execute: async (query, values = []) => ({ rowsAffected: Number(run(query, values).changes) }),
		select: async <T>(query: string, values: unknown[] = []) => sqlite.prepare(query).all(...values as SQLInputValue[]) as T[],
		batch: async (statements) => {
			last = statements;
			sqlite.exec("BEGIN");
			try { for (const s of statements) run(s.query, s.bindValues); sqlite.exec("COMMIT"); }
			catch (error) { sqlite.exec("ROLLBACK"); throw error; }
		},
	};
	return { executor, takeStatements: () => { const s = last; last = []; return s; } };
}
const statementLabel = (s: Statement) => {
	if (s.query.includes("INTO realities")) return "realities.season_json";
	if (s.query.includes("INTO global_fragments")) return `global_fragments.${String(s.bindValues[1])}`;
	if (s.query.includes("INTO reality_history")) return "reality_history.entry_json";
	return s.query.replace(/\s+/g, " ").slice(0, 40);
};
// Same replacer shape as Tauri's process-ipc-message-fn.js, which stringifies
// the whole args object with a replacer before fetch().
const tauriReplacer = (_key: string, value: unknown) => value instanceof Map ? Object.fromEntries(value.entries()) : value;
async function summarizeBatch(statements: Statement[], saveMs: number): Promise<PersistSample> {
	const stringifyStart = performance.now();
	const payload = JSON.stringify({ statements }, tauriReplacer);
	const stringifyMs = performance.now() - stringifyStart;
	const sample: PersistSample = { statements: statements.length, payloadBytes: Buffer.byteLength(payload), stringifyMs, saveMs,
		largestStatementBytes: 0, largestStatement: "", seasonRowBytes: 0, seasonFragmentBytes: 0, historyRowBytes: 0, otherBytes: 0 };
	for (const s of statements) {
		const size = bytes(s);
		const label = statementLabel(s);
		if (size > sample.largestStatementBytes) { sample.largestStatementBytes = size; sample.largestStatement = label; }
		if (label === "realities.season_json") sample.seasonRowBytes += size;
		else if (label === "global_fragments.season") sample.seasonFragmentBytes += size;
		else if (label === "reality_history.entry_json") sample.historyRowBytes += size;
		else sample.otherBytes += size;
	}
	return sample;
}
const REALITY_ID = "measure-reality";
type MeasuredSeason = Parameters<typeof compactEncodeSeasonForPersist>[0];
// Mirrors the store's partialize() for a franchise-only session.
function persistedState(season: MeasuredSeason, realities: SavedReality[], playerForms: PlayerFormMap): PersistedStoreState {
	return {
		bulkYearJobs: {}, series: null, soundEnabled: true, volume: 1, aiRationaleHistory: [], tournament: null,
		tournamentHistory: [], savedTournaments: [], metaPresets: [], pairingsPresets: [],
		season: compactEncodeSeasonForPersist(season), seasonViewOpen: true, preSeasonMetaSnapshot: null,
		savedSeasons: [], seasonHistory: [], realities: compactEncodeRealitiesForPersist(realities),
		activeRealityId: REALITY_ID, playerForms, sideChoicePending: null, preTournamentMetaSnapshot: null,
	} as unknown as PersistedStoreState;
}
async function measuredSave(db: ReturnType<typeof createMeasuredExecutor>, state: PersistedStoreState): Promise<PersistSample> {
	const started = performance.now();
	await savePersistedStateToDbExecutor(db.executor, "draftsim-store", state);
	return await summarizeBatch(db.takeStatements(), performance.now() - started);
}
const prefixed = (prefix: string, sample: PersistSample) => Object.fromEntries(Object.entries(sample).map(([k, v]) => [`${prefix}${k[0].toUpperCase()}${k.slice(1)}`, v]));
// Structured clone (postMessage) cost proxy: v8.serialize uses the same ValueSerializer.
const cloneBytes = (value: unknown) => v8Serialize(value).byteLength;
function playFixtureMatch(t: TournamentState, matchId: string): TournamentState {
	const match = t.matches.find(m => m.id === matchId)!;
	const blue = t.teams.find(team => team.id === match.blueTeamId)!;
	const red = t.teams.find(team => team.id === match.redTeamId)!;
	const winner = Math.random() < 0.5 ? "blue" : "red";
	const wins = requiredWins(match.format);
	const series = createSeries({ format: match.format, mode: "aivai", aiDifficulty: "normal", aiSide: null, fearless: false, timerEnabled: false, blueTeam: blue.name, redTeam: red.name });
	series.games = Array.from({ length: wins }, (_, i) => ({
		...series.games[0], id: `${match.id}:game:${i}`, status: "complete", winner,
		bluePicks: [1, 2, 3, 4, 5], redPicks: [6, 7, 8, 9, 10],
		recap: { durationMinutes: 30, mvp: null, biggestSwing: null,
			perPickIds: { blue: blue.players!.map(p => p.id!), red: red.players!.map(p => p.id!) },
			perPickNames: { blue: blue.players!.map(p => p.name ?? null), red: red.players!.map(p => p.name ?? null) },
			ratings: { blue: blue.players!.map(() => Math.round((4 + Math.random() * 6) * 10) / 10), red: red.players!.map(() => Math.round((4 + Math.random() * 6) * 10) / 10) },
			perPickKDA: { blue: blue.players!.map(() => ({ k: 4, d: 3, a: 8 })), red: red.players!.map(() => ({ k: 3, d: 4, a: 6 })) },
			laneGoldDiff: { top: 100, jungle: -200, middle: 300, bottom: -400, support: 50 },
		},
	}));
	series.status = "complete";
	series.winner = winner;
	return recordMatchWinner({ ...t, matches: t.matches.map(m => m.id === matchId ? { ...m, series } : m) }, matchId,
		{ teamId: winner === "blue" ? blue.id : red.id, blueWins: winner === "blue" ? wins : 0, redWins: winner === "red" ? wins : 0 });
}
const originalRandom = Math.random;
const rng = createRng(731);
Math.random = rng;
(async () => { try {
	let season = seedFranchise(createSeason({ config, teams: generateSeasonTeams(champions, rng), activeMeta: {
		metaOverride: null, metaEnabled: true, synergyOverride: null, counterOverride: null,
	} }), "Bulk measurement", true, rng, champions);
	let history: SeasonHistoryEntry[] = [];
	let feed: SimResultEntry[] = [];
	const seen = new Set<string>();
	const cache: SimResultEntryCache = new Map();
	const samples: Record<string, unknown>[] = [];
	const collect = () => { feed = compressSimResultsFeed([...feed, ...collectSimResultUpdates(season, seen, cache)]); };
	console.log(JSON.stringify({ config, years, teams: season.teams.length, node: process.version, forcedGC: !!global.gc, fullMatchSim, appFormats, measurePersist }));
	const db = measurePersist ? createMeasuredExecutor() : null;
	const realityAt = (s: MeasuredSeason): SavedReality => ({ id: REALITY_ID, name: "Bulk measurement", year: s.franchise!.year, season: s, history });
	// realities[].season only changes at bulk checkpoints; mid-year sets touch the global season.
	let reality = realityAt(season);
	if (db) await measuredSave(db, persistedState(season, [reality], {}));
	for (let year = 1; year <= years; year++) {
		let forms: PlayerFormMap = {};
		let matches = 0;
		const clone = { samples: 0, requestTotal: 0, requestMax: 0, responseTotal: 0, responseMax: 0, championsBytes: 0 };
		// Bulk publishes after every match; a gap of 500 ms or more lets the debounced save fire mid-year.
		const matchTimes = { played: 0, maxMs: 0, over250: 0, over500: 0 };
		const started = performance.now();
		while (season.status !== "complete") {
			if (++matches > 10000) throw new Error("Season failed to advance");
			const phaseIndex = season.phaseIndex;
			const t = nextPendingTournament(season);
			if (!t) {
				if (currentPhase(season)?.kind !== "transfer") throw new Error("Missing playable tournament");
				season = advanceTransferWindow(season, champions);
			} else {
				const match = t.matches.find(m => !m.winner && !m.isBye && m.blueTeamId && m.redTeamId);
				if (!match) {
					const bracket = t.format.startsWith("swiss-playoffs") ? startSwissPlayoffs(t)
						: t.format.startsWith("groups-playoffs") ? startGroupsPlayoffs(t)
							: t.format.startsWith("round-robin-playoffs") ? startRoundRobinPlayoffs(t) : t;
					if (bracket === t) throw new Error(`No playable match: ${t.name}`);
					season = applyTournamentUpdate(season, bracket, champions);
				} else {
					let played;
					const sampleClone = measurePersist && matches % 25 === 1;
					const request = sampleClone ? cloneBytes({ type: "autoPlayMatch", id: matches, tournament: t, matchId: match.id, champions, playerForms: forms }) : 0;
					const matchStart = performance.now();
					if (fullMatchSim) [played, forms] = autoPlayMatch(t, match.id, champions, forms);
					else played = playFixtureMatch(t, match.id);
					const matchMs = performance.now() - matchStart;
					matchTimes.played++; matchTimes.maxMs = Math.max(matchTimes.maxMs, matchMs);
					if (matchMs >= 250) matchTimes.over250++;
					if (matchMs >= 500) matchTimes.over500++;
					if (sampleClone) {
						const response = cloneBytes({ id: matches, tournament: played, playerForms: forms });
						clone.samples++; clone.requestTotal += request; clone.responseTotal += response;
						clone.requestMax = Math.max(clone.requestMax, request); clone.responseMax = Math.max(clone.responseMax, response);
						clone.championsBytes ||= cloneBytes(champions);
					}
					season = applyTournamentUpdate(season, played, champions);
				}
			}
			if (season.phaseIndex !== phaseIndex || season.status === "complete") collect();
		}
		const simulationMs = performance.now() - started;
		// Worst mid-year save: the debounced snapshot of a completed season before rollover.
		const midYear = db ? prefixed("midYear", await measuredSave(db, persistedState(season, [reality], forms))) : {};
		const seasonEncodings = db ? { seasonDesktopDbBytes: bytes(encodeSeasonForDesktopDb(season)), seasonPersistBytes: bytes(compactEncodeSeasonForPersist(season)) } : {};
		if (process.argv.includes("--season-breakdown")) {
			const top = (value: object) => Object.fromEntries(Object.entries(value).map(([k, v]): [string, number] => [k, bytes(v ?? null)]).sort((a, b) => b[1] - a[1]).slice(0, 8));
			console.log(JSON.stringify({ year, season: top(season), franchise: top(season.franchise ?? {}) }));
		}
		// Isolated archive timing is additional work, excluded from rollover timing.
		const archiveStart = performance.now();
		const measured = buildSeasonHistoryEntry(season, 1);
		const archiveMs = performance.now() - archiveStart;
		const entryBytes = bytes(measured), eventBytes = bytes(measured.eventRecords);
		const rolloverStart = performance.now();
		const next = startNextSeasonWithArchive(season, champions, rng);
		const rolloverMs = performance.now() - rolloverStart;
		if (!next.archived) throw new Error("Missing archive");
		history = [next.archived, ...history];
		season = next.season;
		collect(); cache.clear();
		// Bulk checkpoint: season, reality row and history are published together and flushed.
		reality = realityAt(season);
		const checkpoint = db ? prefixed("checkpoint", await measuredSave(db, persistedState(season, [reality], {}))) : {};
		const serializeStart = performance.now();
		const historyBytes = bytes(history);
		const serializeMs = performance.now() - serializeStart;
		const heapBeforeGC = process.memoryUsage().heapUsed;
		global.gc?.();
		const sample = { year, matches, simulationMs, entryBytes, eventBytes, archiveMs, rolloverMs, historyBytes, serializeMs,
			heapBeforeGC, heapAfterGC: process.memoryUsage().heapUsed, feedBytes: bytes(feed), feedEntries: feed.length,
			matchesPlayed: matchTimes.played, matchMaxMs: matchTimes.maxMs, matchesOver250Ms: matchTimes.over250, matchesOver500Ms: matchTimes.over500,
			...seasonEncodings, ...midYear, ...checkpoint,
			...(clone.samples ? { cloneSamples: clone.samples, cloneRequestMeanBytes: clone.requestTotal / clone.samples, cloneRequestMaxBytes: clone.requestMax,
				cloneResponseMeanBytes: clone.responseTotal / clone.samples, cloneResponseMaxBytes: clone.responseMax, cloneChampionsBytes: clone.championsBytes } : {}) };
		samples.push(sample);
		console.log(JSON.stringify(sample));
		if ([10, 30, years].includes(year)) console.log(JSON.stringify({ summary: true, ...sample,
			meanArchiveMs: samples.reduce((n, s) => n + Number(s.archiveMs), 0) / year,
			meanRolloverMs: samples.reduce((n, s) => n + Number(s.rolloverMs), 0) / year,
			eventFraction: samples.reduce((n, s) => n + Number(s.eventBytes), 0) / samples.reduce((n, s) => n + Number(s.entryBytes), 0),
		}));
	}
} finally { Math.random = originalRandom; } })().catch(error => { console.error(error); process.exitCode = 1; });
