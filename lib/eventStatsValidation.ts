import { LANE_ORDER } from "./players";
import { LEAGUE_IDS } from "./season/types";
import { EVENT_METRICS, unpackEventPlayer, type EventPlayer, type EventPlayerPoint } from "./eventStats";

type Obj = Record<string, unknown>;
const obj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 8192;
const count = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= 1_000_000;
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 1e12;
const optional = (v: unknown, check: (v: unknown) => boolean) => v === undefined || check(v);
const rows = (v: unknown, max: number, check: (v: unknown) => boolean): v is unknown[] => Array.isArray(v) && v.length <= max && v.every(check);
const lane = (v: unknown) => typeof v === "string" && LANE_ORDER.includes(v as never);
const unique = (v: unknown[], key: string) => new Set(v.map(r => (r as Obj)[key])).size === v.length;

export function validChampionLanes(v: unknown): boolean {
	return obj(v) && Object.keys(v).length <= 2000 && Object.entries(v).every(([id, roles]) => /^\d{1,8}$/.test(id) && rows(roles, 5, lane) && new Set(roles).size === roles.length);
}

export function validEventCheckpoints(v: unknown, gameIds: Set<string>): boolean {
	let previous = new Set<string>();
	return rows(v, 10000, c => {
		if (!obj(c) || !text(c.key) || !text(c.label) || !rows(c.gameIds, 100000, id => text(id) && gameIds.has(id))) return false;
		const current = new Set(c.gameIds as string[]);
		if (current.size !== c.gameIds.length || [...previous].some(id => !current.has(id))) return false;
		previous = current; return true;
	}) && unique(v, "key");
}

function player(v: unknown): boolean {
	if (!obj(v) || !text(v.key) || !text(v.playerId) || !text(v.name) || !lane(v.lane) || v.key !== `${v.playerId}:${v.lane}`) return false;
	if (!rows(v.teams, 100, t => obj(t) && text(t.id) && text(t.name) && optional(t.leagueId, l => typeof l === "string" && LEAGUE_IDS.includes(l as never)) && optional(t.logoUrl, text))) return false;
	if (!["games", "wins", "rated", "adjusted", "goldGames", "kdaGames", "kills", "deaths", "assists", "opportunities"].every(k => count(v[k]))) return false;
	if (!["ratingSum", "sum", "squares", "goldSum"].every(k => finite(v[k]))) return false;
	if ((v.games as number) < 1 || !(v.teams as unknown[]).length) return false;
	return (v.wins as number) <= (v.games as number) && (v.rated as number) <= (v.games as number) && (v.adjusted as number) <= (v.rated as number) && (v.goldGames as number) <= (v.games as number) && (v.kdaGames as number) <= (v.games as number) && (v.opportunities as number) >= (v.games as number) && (v.ratingSum as number) >= 0 && (v.ratingSum as number) <= (v.rated as number) * 10 && (v.sum as number) >= 0 && (v.sum as number) <= (v.adjusted as number) * 10 && (v.squares as number) >= 0 && (v.squares as number) <= (v.adjusted as number) * 100;
}
const players = (v: unknown) => rows(v, 2000, player) && unique(v, "key");
const picks = (v: unknown) => obj(v) && count(v.picks) && count(v.wins) && count(v.losses) && v.wins + v.losses === v.picks;
function stats(v: unknown): boolean {
	if (!obj(v) || !count(v.games) || !players(v.players) || !(v.players as Obj[]).every(p => (p.games as number) <= (v.games as number))) return false;
	return rows(v.champions, 2000, c => {
		if (!obj(c) || !count(c.championId) || !picks(c) || (c.picks as number) > 10 * (v.games as number)) return false;
		if (!["bans", "pickGames", "banGames", "presenceGames"].every(k => count(c[k]) && (c[k] as number) <= (k === "bans" ? 10 : 1) * (v.games as number))) return false;
		if ((c.pickGames as number) > (c.picks as number) || (c.banGames as number) > (c.bans as number) || (c.presenceGames as number) < Math.max(c.pickGames as number, c.banGames as number)) return false;
		return obj(c.roles) && Object.entries(c.roles).every(([key, value]) => lane(key) && obj(value) && picks(value) && count(value.games) && value.games <= (v.games as number) && value.games <= (value.picks as number) && (value.picks as number) <= (c.picks as number));
	}) && unique(v.champions, "championId");
}

export function validEventRecords(v: unknown): boolean {
	return rows(v, 500, e => obj(e) && e.version === 1 && text(e.id) && text(e.label) && optional(e.phaseIndex, count) && optional(e.split, s => ["winter", "spring", "summer"].includes(String(s))) && optional(e.event, s => ["first-stand", "msi", "worlds", "global-cup"].includes(String(s))) && optional(e.leagueId, l => LEAGUE_IDS.includes(l as never)) && validChampionLanes(e.championLanes) && rows(e.scopes, 5, s => {
		if (!obj(s) || !["all", "regular", "playoffs", "play-in", "main"].includes(String(s.id)) || !text(s.label) || !stats(s.stats)) return false;
		const final = s.stats as Obj; const identities = new Map((final.players as EventPlayer[]).map(p => [p.key, p]));
		let games = 0;
		return rows(s.checkpoints, 10000, c => {
			if (!obj(c) || !text(c.id) || !text(c.label) || !count(c.games) || c.games <= games || c.games > (final.games as number)) return false;
			if (!rows(c.players, 2000, p => {
				if (!obj(p) || !text(p.key) || !text(p.name) || !rows(p.values, EVENT_METRICS.length, finite) || p.values.length !== EVENT_METRICS.length) return false;
				const identity = identities.get(p.key);
				if (!identity || !rows(p.teams, 100, n => count(n) && n < identity.teams.length) || !p.teams.length || new Set(p.teams).size !== p.teams.length) return false;
				const expanded = unpackEventPlayer(p as unknown as EventPlayerPoint, identity);
				return player(expanded) && expanded.games <= (c.games as number);
			}) || !unique(c.players, "key")) return false;
			games = c.games; return true;
		}) && unique(s.checkpoints, "id");
	}) && e.scopes.length > 0 && (e.scopes[0] as Obj).id === "all" && unique(e.scopes, "id")) && unique(v, "id");
}
