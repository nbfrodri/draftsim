import { LANE_ORDER, deriveStar } from "./players";
import { developmentTier } from "./playerSS";
import type { TournamentState, TournamentMatch } from "./tournament";
import type { Lane } from "./types";
import type { LeagueId } from "./season/types";

export interface EventCheckpoint { key: string; label: string; gameIds: string[] }
export interface EventTeam { id: string; name: string; leagueId?: LeagueId; logoUrl?: string }
export interface EventPlayer {
	key: string; playerId: string; name: string; lane: Lane; teams: EventTeam[];
	games: number; wins: number; rated: number; ratingSum: number; adjusted: number; sum: number; squares: number;
	goldGames: number; goldSum: number; kills: number; deaths: number; assists: number; kdaGames: number;
	opportunities: number;
}
export interface PickStats { picks: number; wins: number; losses: number }
export interface EventChampion extends PickStats {
	championId: number; bans: number; pickGames: number; banGames: number; presenceGames: number;
	roles: Partial<Record<Lane, PickStats & { games: number }>>;
}
export interface EventStats { games: number; players: EventPlayer[]; champions: EventChampion[] }

/** Version-1 checkpoint order; identities and team artwork live once in the final rows. */
export const EVENT_METRICS = ["games", "wins", "rated", "ratingSum", "adjusted", "sum", "squares", "goldGames", "goldSum", "kills", "deaths", "assists", "kdaGames", "opportunities"] as const;
export interface EventPlayerPoint { key: string; name: string; teams: number[]; values: number[] }
export function packEventPlayer(p: EventPlayer, identity: EventPlayer): EventPlayerPoint {
	return { key: p.key, name: p.name, teams: p.teams.map(t => identity.teams.findIndex(c => c.id === t.id && c.leagueId === t.leagueId)), values: EVENT_METRICS.map(k => p[k]) };
}
export function unpackEventPlayer(p: EventPlayerPoint, identity: EventPlayer): EventPlayer {
	const totals = Object.fromEntries(EVENT_METRICS.map((key, i) => [key, p.values[i]])) as Pick<EventPlayer, typeof EVENT_METRICS[number]>;
	return { ...identity, name: p.name, teams: p.teams.map(i => identity.teams[i]), ...totals };
}

export function isPlayoffMatch(t: TournamentState, m: TournamentMatch): boolean {
	if (!t.format.includes("playoffs")) return !["round-robin", "swiss"].includes(t.format);
	return !!m.bracket || !!m.feedsInto || t.matches.some(other => other.feedsInto?.matchId === m.id);
}

/** Called after a series result, before state is persisted; never on read/render. */
export function recordEventCheckpoint(t: TournamentState, matchId: string): TournamentState {
	const m = t.matches.find(row => row.id === matchId);
	if (!m || m.isBye || !m.winner) return t;
	const group = m.bracket ?? (isPlayoffMatch(t, m) ? "playoffs" : "regular");
	const key = `${group}:${m.round}`;
	if (t.eventCheckpoints?.some(c => c.key === key)) return t;
	const peers = t.matches.filter(row => row.round === m.round && (row.bracket ?? (isPlayoffMatch(t, row) ? "playoffs" : "regular")) === group);
	if (peers.some(row => !row.isBye && !row.winner)) return t;
	const gameIds = t.matches.filter(row => !row.isBye).flatMap(row => row.series?.games.filter(g => g.status === "complete" && g.winner).map(g => g.id) ?? []);
	if (!gameIds.length) return t;
	return { ...t, eventCheckpoints: [...(t.eventCheckpoints ?? []), { key, label: `${group.replaceAll("-", " ")} · Round ${m.round}`, gameIds: [...new Set(gameIds)] }] };
}

const count = (): PickStats => ({ picks: 0, wins: 0, losses: 0 });

/** Explicit IDs are required for player joins; absent identities remain unknown. */
export function computeEventStats(tournaments: readonly TournamentState[], gameKeys?: ReadonlySet<string>): EventStats {
	const players = new Map<string, EventPlayer>();
	const champions = new Map<number, EventChampion>();
	const teamGames = new Map<string, number>();
	const memberships = new Map<string, Set<string>>();
	let games = 0;
	const seen = new Set<string>();
	for (const t of tournaments) {
		const teams = new Map(t.teams.map(team => [team.id, team]));
		for (const m of t.matches) {
			if (m.isBye) continue;
			const matchBlue = teams.get(m.blueTeamId ?? ""), matchRed = teams.get(m.redTeamId ?? "");
			if (!matchBlue || !matchRed) continue;
			for (const g of m.series?.games ?? []) {
				const gameKey = `${t.id}:${g.id}`;
				if (g.status !== "complete" || !g.winner || seen.has(gameKey) || (gameKeys && !gameKeys.has(gameKey))) continue;
				seen.add(gameKey); games++;
				const swapped = g.blueTeam === matchRed.name && g.redTeam === matchBlue.name;
				const appeared = new Set<number>(), picked = new Set<number>(), banned = new Set<number>();
				const rolePicks = new Set<string>();
				const ensureChampion = (id: number) => {
					let c = champions.get(id);
					if (!c) { c = { championId: id, ...count(), bans: 0, pickGames: 0, banGames: 0, presenceGames: 0, roles: {} }; champions.set(id, c); }
					appeared.add(id); return c;
				};
				for (const side of ["blue", "red"] as const) {
					const team = (side === "blue") !== swapped ? matchBlue : matchRed;
					const opponent = team === matchBlue ? matchRed : matchBlue;
					const teamKey = `${t.id}:${team.id}`;
					teamGames.set(teamKey, (teamGames.get(teamKey) ?? 0) + 1);
					const won = g.winner === side;
					for (const [i, lane] of LANE_ORDER.entries()) {
						const id = g.recap?.perPickIds?.[side]?.[i];
						if (!id) continue;
						const key = `${id}:${lane}`;
						const entrant = team.players?.find(p => p.id === id && p.lane === lane);
						let p = players.get(key);
						if (!p) {
							p = { key, playerId: id, name: g.recap?.perPickNames?.[side]?.[i] ?? entrant?.name ?? "Unknown player", lane, teams: [], games: 0, wins: 0, rated: 0, ratingSum: 0, adjusted: 0, sum: 0, squares: 0, goldGames: 0, goldSum: 0, kills: 0, deaths: 0, assists: 0, kdaGames: 0, opportunities: 0 };
							players.set(key, p);
						}
						if (!p.teams.some(x => x.id === team.id && x.leagueId === team.leagueId)) p.teams.push({ id: team.id, name: team.name, ...(team.leagueId ? { leagueId: team.leagueId } : {}), ...(team.logoUrl ? { logoUrl: team.logoUrl } : {}) });
						const clubs = memberships.get(key) ?? new Set<string>(); clubs.add(teamKey); memberships.set(key, clubs);
						p.games++; if (won) p.wins++;
						const rating = g.recap?.ratings?.[side]?.[i];
						if (typeof rating === "number" && Number.isFinite(rating) && rating >= 1 && rating <= 10) {
							p.rated++; p.ratingSum += rating;
							if (entrant && opponent.players?.length === 5) {
								const strength = deriveStar(opponent.players.map(player => ({ tier: developmentTier(player) })));
								const value = Math.max(1, Math.min(10, rating + (strength - 3) * 0.1 - (entrant.tier === "SS" ? 0.1 : 0)));
								p.adjusted++; p.sum += value; p.squares += value * value;
							}
						}
						const gold = g.recap?.laneGoldDiff?.[lane];
						if (typeof gold === "number" && Number.isFinite(gold)) { p.goldGames++; p.goldSum += side === "blue" ? gold : -gold; }
						const kda = g.recap?.perPickKDA?.[side]?.[i];
						if (kda) { p.kdaGames++; p.kills += kda.k; p.deaths += kda.d; p.assists += kda.a; }
					}
					for (const id of side === "blue" ? g.blueBans : g.redBans) if (id !== null) { ensureChampion(id).bans++; banned.add(id); }
					(side === "blue" ? g.bluePicks : g.redPicks).forEach((id, i) => {
						if (id === null) return;
						const c = ensureChampion(id); c.picks++; c[won ? "wins" : "losses"]++; picked.add(id);
						const role = (side === "blue" ? g.blueRoles : g.redRoles)[i];
						if (role) {
							const r = c.roles[role] ?? { ...count(), games: 0 };
							r.picks++; r[won ? "wins" : "losses"]++;
							if (!rolePicks.has(`${id}:${role}`)) { r.games++; rolePicks.add(`${id}:${role}`); }
							c.roles[role] = r;
						}
					});
				}
				for (const id of appeared) champions.get(id)!.presenceGames++;
				for (const id of picked) champions.get(id)!.pickGames++;
				for (const id of banned) champions.get(id)!.banGames++;
			}
		}
	}
	for (const p of players.values()) p.opportunities = [...memberships.get(p.key)!].reduce((n, id) => n + (teamGames.get(id) ?? 0), 0);
	return { games, players: [...players.values()], champions: [...champions.values()] };
}

export function eventPlayerScore(p: EventPlayer): number | null {
	if (!p.adjusted || p.adjusted !== p.rated) return null;
	const variance = Math.max(0, p.squares / p.adjusted - (p.sum / p.adjusted) ** 2);
	return (p.sum + 72) / (p.adjusted + 12) - Math.sqrt(variance) * 0.1;
}

export function rankEventPlayers(players: readonly EventPlayer[], lane: Lane) {
	return players.filter(p => p.lane === lane).map(p => {
		const required = Math.max(3, Math.ceil(p.opportunities * 0.6));
		const score = eventPlayerScore(p);
		return { ...p, score, required, qualified: p.rated >= required && score !== null };
	}).sort((a, b) => Number(b.qualified) - Number(a.qualified) || (b.score ?? -1) - (a.score ?? -1) || b.rated - a.rated || a.key.localeCompare(b.key));
}
