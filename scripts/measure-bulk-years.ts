// Disposable production-engine benchmark. No store, database or personal saves.
// node --expose-gc --import tsx scripts/measure-bulk-years.ts [years=30]
// JSONL output: per-year samples plus summaries at 10, 30 and the final year.
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

// Fast mode isolates archival/lifecycle costs using synthetic game recaps.
// --full-match-sim additionally runs production AI drafting and match simulation.
const fullMatchSim = process.argv.includes("--full-match-sim");
const years = Number(process.argv[2] ?? 30);
if (!Number.isSafeInteger(years) || years < 1 || years > 50) throw new Error("Years must be an integer in [1, 50]");
const champions = catalogue.champions as Champion[];
const config: SeasonConfig = {
	name: "Bulk archive measurement", sharedLeagueConfig: true, controlledTeamId: null,
	aiDifficulty: "normal", liveMeta: false, patchShift: false, fearless: false,
	playerDevelopment: true, playerTransfers: true, formDrift: true,
	intlEarlySeries: "bo1", intlFinalsSeries: "bo1",
	leagueConfigs: Object.fromEntries(LEAGUE_IDS.map(id => [id, {
		format: "round-robin-playoffs", regularSeries: "bo1", playoffSeries: "bo1", playoffTeams: 4, roundRobinLegs: 2,
	}])) as SeasonConfig["leagueConfigs"],
};
const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value));
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
try {
	let season = seedFranchise(createSeason({ config, teams: generateSeasonTeams(champions, rng), activeMeta: {
		metaOverride: null, metaEnabled: true, synergyOverride: null, counterOverride: null,
	} }), "Bulk measurement", true, rng, champions);
	let history: SeasonHistoryEntry[] = [];
	let feed: SimResultEntry[] = [];
	const seen = new Set<string>();
	const cache: SimResultEntryCache = new Map();
	const samples: Record<string, number>[] = [];
	const collect = () => { feed = compressSimResultsFeed([...feed, ...collectSimResultUpdates(season, seen, cache)]); };
	console.log(JSON.stringify({ config, years, teams: season.teams.length, node: process.version, forcedGC: !!global.gc, fullMatchSim }));
	for (let year = 1; year <= years; year++) {
		let forms: PlayerFormMap = {};
		let matches = 0;
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
					if (fullMatchSim) [played, forms] = autoPlayMatch(t, match.id, champions, forms);
					else played = playFixtureMatch(t, match.id);
					season = applyTournamentUpdate(season, played, champions);
				}
			}
			if (season.phaseIndex !== phaseIndex || season.status === "complete") collect();
		}
		const simulationMs = performance.now() - started;
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
		const serializeStart = performance.now();
		const historyBytes = bytes(history);
		const serializeMs = performance.now() - serializeStart;
		const heapBeforeGC = process.memoryUsage().heapUsed;
		global.gc?.();
		const sample = { year, matches, simulationMs, entryBytes, eventBytes, archiveMs, rolloverMs, historyBytes, serializeMs,
			heapBeforeGC, heapAfterGC: process.memoryUsage().heapUsed, feedBytes: bytes(feed), feedEntries: feed.length };
		samples.push(sample);
		console.log(JSON.stringify(sample));
		if ([10, 30, years].includes(year)) console.log(JSON.stringify({ summary: true, ...sample,
			meanArchiveMs: samples.reduce((n, s) => n + s.archiveMs, 0) / year,
			meanRolloverMs: samples.reduce((n, s) => n + s.rolloverMs, 0) / year,
			eventFraction: samples.reduce((n, s) => n + s.eventBytes, 0) / samples.reduce((n, s) => n + s.entryBytes, 0),
		}));
	}
} finally { Math.random = originalRandom; }
