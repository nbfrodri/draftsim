// Disposable seeded gameplay audit. No store, database or personal saves.
import catalogue from "../lib/data/champions.json";
import type { Champion } from "../lib/types";
import { createRng } from "../lib/rng";
import { generateSeasonTeams } from "../lib/season/teamGen";
import { createSeason, applyPatchShift } from "../lib/season/engine";
import { reviewSSPlayers } from "../lib/season/ssPlayers";
import { developmentTier } from "../lib/playerSS";
import { createTournament } from "../lib/tournament";
import { autoPlayMatch } from "../lib/sim/autoPlayMatch";
import { evolveMetaForTournament } from "../lib/metaEvolution";
import { randomizeMeta } from "../lib/metaRandomizer";
import { CHAMPION_META, TIER_ORDER, setActiveMetaOverride } from "../lib/championMeta";
import { LANE_ORDER } from "../lib/players";
import { LEAGUE_IDS, type SeasonConfig, type SeasonMetaSnapshot } from "../lib/season/types";

const champions = catalogue.champions as Champion[];
const config: SeasonConfig = {
	name: "Disposable balance audit", sharedLeagueConfig: true, controlledTeamId: null,
	aiDifficulty: "normal", liveMeta: true, patchShift: true, fearless: false,
	leagueConfigs: Object.fromEntries(LEAGUE_IDS.map(id => [id, { format: "round-robin", regularSeries: "bo1", playoffSeries: "bo3", playoffTeams: 2 }])) as SeasonConfig["leagueConfigs"],
};
function distribution(override: ReturnType<typeof randomizeMeta> | null) {
	return Object.fromEntries(LANE_ORDER.map(lane => [lane, Object.fromEntries(TIER_ORDER.map(tier => [tier, champions.filter(c => c.lanes.includes(lane) && (override?.[c.alias] ?? CHAMPION_META[c.alias]?.metaTiers)?.[lane] === tier).length]))]));
}
const originalRandom = Math.random;
try {
	for (const mode of ["default", "randomized", "custom"]) for (const [liveMeta, patchShift] of [[false, false], [true, false], [false, true], [true, true]]) for (const seed of [7, 19, 43]) {
		const rng = createRng(seed);
		Math.random = rng;
		const world = generateSeasonTeams(champions, rng);
		let teams = world.filter(t => t.leagueId === "LCK").slice(0, 4);
		const randomized = randomizeMeta(champions, rng);
		let meta: SeasonMetaSnapshot = { metaOverride: mode === "default" ? null : mode === "custom" ? { ...randomized, Ashe: { bottom: "A" }, Annie: {} } : randomized, metaEnabled: true, synergyOverride: null, counterOverride: null };
		const initial = distribution(meta.metaOverride);
		const checkpoints: unknown[] = [];
		let previous: string[] = [];
		let replacements = 0;
		let totalGames = 0;
		for (let year = 1; year <= 2; year++) {
			let season = createSeason({ config: { ...config, liveMeta, patchShift }, teams: [...teams, ...world.filter(t => t.leagueId !== "LCK")], activeMeta: meta });
			season.teams = teams;
			season.phases = [];
			season.tournaments = {};
			for (const split of ["winter", "spring", "summer"] as const) {
				let t = createTournament({ name: split, format: "round-robin", roundRobinLegs: 2, teams: season.teams.map((team, i) => ({ ...team, seed: i + 1 })),
					defaults: { format: "bo1", mode: "aivai", aiSide: null, aiDifficulty: "normal", timerEnabled: false, fearless: false }, liveMeta, metaSnapshot: meta });
				for (const id of t.matches.map(m => m.id)) {
					setActiveMetaOverride(t.metaSnapshot?.metaOverride ?? null);
					[t] = autoPlayMatch(t, id, champions);
					t = evolveMetaForTournament(t, champions, rng).tournament;
				}
				totalGames += t.matches.reduce((n, m) => n + (m.series?.games.length ?? 0), 0);
				season.tournaments[t.id] = t;
				season.phases.push({ kind: "split", split, label: split, status: "complete", tournamentIds: [t.id] });
				season.phaseIndex = season.phases.length - 1;
				season = reviewSSPlayers(season);
				const holders = season.teams.flatMap(team => team.players.filter(p => p.tier === "SS"));
				if (new Set(holders.map(p => p.lane)).size !== holders.length || holders.length > 5) throw new Error("Duplicate SS ownership");
				if (holders.some(p => !["S", "S+"].includes(developmentTier(p)))) throw new Error("Invalid SS base tier");
				const ids = holders.map(p => p.id!);
				replacements += ids.filter(id => previous.length && !previous.includes(id)).length;
				previous = ids;
				meta = { ...meta, metaOverride: t.metaSnapshot?.metaOverride ?? null };
				if (patchShift) meta = applyPatchShift(meta, champions, rng, 0.08);
				checkpoints.push({ year, split, holders: holders.map(p => ({ id: p.id, lane: p.lane, score: Number(p.ss!.score.toFixed(3)) })), meta: distribution(meta.metaOverride) });
			}
			teams = season.teams;
		}
		console.log(JSON.stringify({ mode, liveMeta, patchShift, seed, totalGames, replacements, initial, checkpoints }));
	}
} finally {
	Math.random = originalRandom;
	setActiveMetaOverride(null);
}
