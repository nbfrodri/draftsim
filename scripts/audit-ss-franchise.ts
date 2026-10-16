// Disposable production-engine audit: no store, database or personal saves.
import catalogue from "../lib/data/champions.json";
import type { Champion } from "../lib/types";
import type { PlayerFormMap } from "../lib/playerForm";
import { createRng } from "../lib/rng";
import { developmentTier } from "../lib/playerSS";
import { generateSeasonTeams } from "../lib/season/teamGen";
import { LEAGUE_IDS, type SeasonConfig, type SeasonState } from "../lib/season/types";
import { advanceTransferWindow, applyTournamentUpdate, createSeason, currentPhase, nextPendingTournament } from "../lib/season/engine";
import { seedFranchise, startNextSeasonWithArchive } from "../lib/season/franchise";
import { autoPlayMatch } from "../lib/sim/autoPlayMatch";
import { evolveMetaForTournament } from "../lib/metaEvolution";
import { CHAMPION_META, setActiveMetaOverride } from "../lib/championMeta";
import { startSwissPlayoffs, startGroupsPlayoffs } from "../lib/tournament";
import { deriveStar } from "../lib/players";

const champions = catalogue.champions as Champion[];
const config: SeasonConfig = {
	name: "SS franchise audit", sharedLeagueConfig: true, controlledTeamId: null,
	aiDifficulty: "normal", liveMeta: true, patchShift: true, fearless: false,
	playerDevelopment: true, playerTransfers: true, formDrift: true,
	intlEarlySeries: "bo1", intlFinalsSeries: "bo1",
	leagueConfigs: Object.fromEntries(LEAGUE_IDS.map(id => [id, {
		format: "round-robin", regularSeries: "bo1", playoffSeries: "bo1", playoffTeams: 2, roundRobinLegs: 2,
	}])) as SeasonConfig["leagueConfigs"],
};

function holders(season: SeasonState) {
	const rows = season.teams.flatMap(team => team.players.filter(p => p.tier === "SS").map(player => ({ team, player })));
	if (rows.length > 5 || new Set(rows.map(r => r.player.lane)).size !== rows.length) throw new Error("Duplicate SS ownership");
	if (rows.some(r => !r.player.id || !r.player.ss || !["S", "S+"].includes(developmentTier(r.player)))) throw new Error("Invalid SS evidence");
	if (season.franchise?.inactivePool?.some(p => p.player.tier === "SS")) throw new Error("Inactive SS holder");
	return rows;
}

const originalRandom = Math.random;
try {
	for (const seed of [7, 19, 43]) {
		const rng = createRng(seed);
		Math.random = rng;
		setActiveMetaOverride(null);
		const world = generateSeasonTeams(champions, rng);
		const teams = LEAGUE_IDS.flatMap(id => world.filter(t => t.leagueId === id).slice(0, 4));
		let season = seedFranchise(createSeason({ config, teams, activeMeta: {
			metaOverride: null, metaEnabled: true, synergyOverride: null, counterOverride: null,
		} }), "SS audit", true, rng, champions);
		let forms: PlayerFormMap = {};
		let previous = new Map<string, string>();
		let games = 0;
		let replacements = 0;
		let ssGames = 0;
		let ssWins = 0;
		let matches = 0;
		for (let year = 1; year <= 3; year++) {
			while (season.status !== "complete") {
				if (++matches > 10_000) throw new Error("Season failed to advance");
				const phaseIndex = season.phaseIndex;
				const t = nextPendingTournament(season);
				if (!t) {
					if (currentPhase(season)?.kind !== "transfer") throw new Error("Missing playable tournament");
					season = advanceTransferWindow(season, champions);
				} else {
					const match = t.matches.find(m => !m.winner && !m.isBye && m.blueTeamId && m.redTeamId);
					if (!match) {
						const bracket = t.format.startsWith("swiss-playoffs") ? startSwissPlayoffs(t)
							: t.format.startsWith("groups-playoffs") ? startGroupsPlayoffs(t) : t;
						if (bracket === t) throw new Error(`No playable match: ${t.name}`);
						season = applyTournamentUpdate(season, bracket, champions);
						continue;
					}
					setActiveMetaOverride(t.metaSnapshot?.metaOverride ?? null);
					let played;
					[played, forms] = autoPlayMatch(t, match.id, champions, forms);
					const series = played.matches.find(m => m.id === match.id)!.series!;
					const ssIds = new Set(t.teams.flatMap(team => team.players?.filter(p => p.tier === "SS").map(p => p.id) ?? []));
					for (const game of series.games) {
						games++;
						for (const side of ["blue", "red"] as const) {
							for (const id of game.recap?.perPickIds?.[side] ?? []) {
								if (id && ssIds.has(id)) { ssGames++; if (game.winner === side) ssWins++; }
							}
						}
					}
					played = evolveMetaForTournament(played, champions, rng).tournament;
					season = applyTournamentUpdate(season, played, champions);
				}
				const active = holders(season);
				if (season.phaseIndex !== phaseIndex || season.status === "complete") {
					const now = new Map(active.map(r => [r.player.lane, r.player.id!]));
					for (const [lane, id] of now) if (previous.has(lane) && previous.get(lane) !== id) replacements++;
					previous = now;
					const bottomD = champions.filter(c => c.lanes.includes("bottom") &&
						(season.currentMeta.metaOverride?.[c.alias] ?? CHAMPION_META[c.alias]?.metaTiers)?.bottom === "D").length;
					console.log(JSON.stringify({ seed, year, phaseIndex, games, bottomD, holders: active.map(r => ({
						id: r.player.id, lane: r.player.lane, team: r.team.name, region: r.team.leagueId, stars: deriveStar(r.team.players),
					})) }));
				}
			}
			if (year < 3) {
				const next = startNextSeasonWithArchive(season, champions, rng);
				if (!next.archived) throw new Error("Missing season archive");
				season = next.season;
				holders(season);
			}
		}
		console.log(JSON.stringify({ summary: true, seed, years: 3, teams: teams.length, games, replacements, ssGames, ssWins }));
	}
} finally {
	Math.random = originalRandom;
	setActiveMetaOverride(null);
}
