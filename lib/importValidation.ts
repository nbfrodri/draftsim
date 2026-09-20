import { validMarketOrigin } from "./season/marketOrigin";
import { TOTAL_ACTIONS } from "./draftOrder";
import type { SeasonState } from "./season/types";
import { LEAGUE_IDS } from "./season/types";
import type { TournamentState } from "./tournament";

type Obj = Record<string, unknown>;
export const record = (v: unknown): v is Obj => v !== null && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const integer = (v: unknown): v is number => finite(v) && Number.isSafeInteger(v) && v >= 0;
const nullableText = (v: unknown) => v === null || text(v);
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(text);
const numbers = (v: unknown) => Array.isArray(v) && v.every(integer);
const enumeration = (v: unknown, values: readonly string[]) => typeof v === "string" && values.includes(v);
const seriesFormats = ["bo1", "bo3", "bo5"];
const modes = ["pvp", "pvai", "aivai"];
const difficulties = ["easy", "normal", "hard"];
const sides = (v: unknown) => v === null || v === "blue" || v === "red";
const lanes = ["top", "jungle", "middle", "bottom", "support"];
export const TOURNAMENT_FORMATS = [
  "single-elim", "round-robin", "double-elim", "swiss", "swiss-playoffs", "groups-playoffs",
  "round-robin-playoffs", "swiss-playoffs-de", "groups-playoffs-de", "triple-elim",
  "round-robin-playoffs-te", "swiss-playoffs-te", "groups-playoffs-te", "round-robin-playoffs-step",
] as const;

/** Bound traversal and disallow prototype keys before merging imported dictionaries. */
export function validateImportTree(value: unknown, maxNodes = 2_000_000): void {
  let visited = 0;
  // Depth is capped at 64, so recursion stays bounded without queuing every
  // sibling or allocating Object.entries tuples for multi-million-node files.
  const visit = (node: unknown, depth: number): void => {
    if (++visited > maxNodes || depth > 64) throw new Error("Import is too complex.");
    if (typeof node === "number" && !Number.isFinite(node)) throw new Error("Invalid number in import.");
    if (Array.isArray(node)) {
      for (const child of node) visit(child, depth + 1);
    } else if (node && typeof node === "object") {
      for (const key in node) {
        if (!Object.hasOwn(node, key)) continue;
        if (key === "__proto__" || key === "constructor" || key === "prototype") throw new Error("Unsafe key in import.");
        visit((node as Obj)[key], depth + 1);
      }
    }
  };
  visit(value, 0);
}

const optional = (value: unknown, check: (v: unknown) => boolean) => value === undefined || check(value);
const arrayOf = (value: unknown, check: (v: unknown) => boolean) => Array.isArray(value) && value.every(check);
const finiteNumbers = (value: unknown) => arrayOf(value, finite);
const tierMap = (value: unknown): boolean => value === null || (record(value) &&
  Object.values(value).every(row => record(row) && Object.entries(row).every(([lane, tier]) =>
    lanes.includes(lane) && enumeration(tier, ["S+", "S", "A", "B", "C", "D"]))));
const synergies = (value: unknown): boolean => value == null || arrayOf(value, s =>
  record(s) && strings(s.champs) && s.champs.length === 2 && finite(s.bonus) && typeof s.tag === "string");
const counters = (value: unknown): boolean => value == null || arrayOf(value, c =>
  Array.isArray(c) && c.length === 3 && text(c[0]) && text(c[1]) && finite(c[2]));
const sideRows = (value: unknown, check: (v: unknown) => boolean): boolean => record(value) &&
  ["blue", "red"].every(side => Array.isArray(value[side]) && (value[side] as unknown[]).length === 5 && (value[side] as unknown[]).every(check));
const event = (value: unknown): boolean => record(value) && finite(value.minute) &&
  enumeration(value.side, ["blue", "red"]) && typeof value.type === "string" &&
  typeof value.description === "string" && finite(value.probDelta);
export function validRecap(value: unknown): boolean {
  if (!record(value) || !finite(value.durationMinutes)) return false;
  if (!(value.mvp === null || (record(value.mvp) && enumeration(value.mvp.side, ["blue", "red"]) &&
    enumeration(value.mvp.lane, lanes) && integer(value.mvp.championId) &&
    ["kills", "deaths", "assists", "laneGoldDiff"].every(k => finite((value.mvp as Obj)[k]))))) return false;
  if (!(value.biggestSwing === null || event(value.biggestSwing))) return false;
  if (!optional(value.notableEvents, v => arrayOf(v, event)) ||
    !optional(value.winProbTimeline, v => arrayOf(v, p => record(p) && finite(p.minute) && finite(p.blueProb))) ||
    !optional(value.goldLeadTimeline, v => arrayOf(v, p => record(p) && finite(p.minute) && finite(p.goldLead))) ||
    !optional(value.perPickKDA, v => sideRows(v, p => record(p) && integer(p.k) && integer(p.d) && integer(p.a))) ||
    !optional(value.ratings, v => sideRows(v, finite)) ||
    !optional(value.perPickNames, v => sideRows(v, x => x === null || typeof x === "string")) ||
    !optional(value.perPickIds, v => sideRows(v, x => x === null || typeof x === "string"))) return false;
  if (!optional(value.pentakills, v => arrayOf(v, p => record(p) && finite(p.minute) &&
    enumeration(p.side, ["blue", "red"]) && integer(p.championId)))) return false;
  if (!optional(value.recapC, c => record(c) &&
    ["wp", "gl"].every(k => optional(c[k], v => finiteNumbers(v) && (v as number[]).length % 2 === 0)) &&
    optional(c.kda, v => finiteNumbers(v) && (v as number[]).length === 30) &&
    optional(c.rt, v => finiteNumbers(v) && (v as number[]).length === 10) &&
    optional(c.ne, v => arrayOf(v, p => record(p) && finite(p.m) && (p.s === 0 || p.s === 1) &&
      typeof p.t === "string" && typeof p.d === "string" && finite(p.p))))) return false;
  return true;
}

const tiers = ["D", "C", "B", "A", "S", "S+"];
const player = (p: unknown): boolean => record(p) && enumeration(p.lane, lanes) &&
  enumeration(p.tier, tiers) && numbers(p.goodChamps) && numbers(p.badChamps) &&
  ["id", "name"].every(k => optional(p[k], x => typeof x === "string")) &&
  ["age", "debutYear"].every(k => optional(p[k], integer)) && optional(p.potential, x => enumeration(x, tiers));
const coach = (c: unknown): boolean => record(c) && text(c.id) && text(c.name) &&
  text(c.personalityId) && finite(c.rating) && c.rating >= 1 && c.rating <= 5 &&
  ["adaptability", "motivation"].every(k => finite(c[k]) && (c[k] as number) >= 0 && (c[k] as number) <= 1);
const inactive = (p: unknown): boolean => record(p) && player(p.player) &&
  enumeration(p.status, ["academy", "free-agent", "retired"]) && integer(p.inactiveYears) &&
  integer(p.demotedYear) && typeof p.lastTeamId === "string";
const demand = (d: unknown): boolean => record(d) &&
  ["id", "playerId", "fromTeamId"].every(k => text(d[k])) && enumeration(d.lane, lanes) &&
  enumeration(d.playerTier, tiers) && enumeration(d.kind, ["leave", "call-up", "depart-academy"]) &&
  enumeration(d.wantRole, ["starter", "academy", "fa"]) && finite(d.preferenceGap) &&
  enumeration(d.status, ["pending", "honored", "overridden", "expired"]) &&
  optional(d.rankedPrefs, v => arrayOf(v, p => record(p) && text(p.teamId) &&
    enumeration(p.role, ["starter", "academy"]) && finite(p.score)));
function roster(v: unknown): boolean {
  return Array.isArray(v) && v.length === 5 && new Set(v.map(p => record(p) ? p.lane : null)).size === 5 &&
    v.every(player);
}
function uniqueIds(v: Obj[]): boolean {
  return v.every(x => text(x.id)) && new Set(v.map(x => x.id)).size === v.length;
}
function defaults(v: unknown): boolean {
  return record(v) && enumeration(v.format, seriesFormats) && enumeration(v.mode, modes) &&
    enumeration(v.aiDifficulty, difficulties) && typeof v.fearless === "boolean" && sides(v.aiSide);
}
export function validSeries(v: unknown): boolean {
  if (!record(v) || !text(v.id) || !defaults(v) || !text(v.blueTeam) || !text(v.redTeam) ||
    !enumeration(v.status, ["drafting", "strategy", "between-games", "complete"]) || !sides(v.winner) ||
    !Array.isArray(v.games) || v.games.length < 1 || v.games.length > (v.format === "bo1" ? 1 : v.format === "bo3" ? 3 : 5)) return false;
  const last = v.games[v.games.length - 1];
  if (!record(last) || (v.status === "drafting" ? last.status !== "drafting" : last.status !== "complete") ||
    (v.status === "complete" && v.winner === null)) return false;
  return v.games.every(g => record(g) && text(g.id) && integer(g.gameNumber) && g.gameNumber >= 1 && integer(g.actionIndex) && g.actionIndex <= TOTAL_ACTIONS &&
    enumeration(g.status, ["drafting", "complete"]) && text(g.blueTeam) && text(g.redTeam) && sides(g.winner) &&
    ["bluePicks", "redPicks", "blueBans", "redBans"].every(key =>
      Array.isArray(g[key]) && (g[key] as unknown[]).length === 5 && (g[key] as unknown[]).every(x => x === null || integer(x))) &&
    ["blueRoles", "redRoles"].every(key =>
      Array.isArray(g[key]) && (g[key] as unknown[]).length === 5 && (g[key] as unknown[]).every(x => x === null || enumeration(x, lanes))) &&
    (g.recap === undefined || validRecap(g.recap)));
}

export function validTournament(v: unknown): v is TournamentState {
  if (!record(v) || !text(v.id) || !text(v.name) || !enumeration(v.format, TOURNAMENT_FORMATS) ||
    !enumeration(v.status, ["setup", "in-progress", "complete"]) || !finite(v.createdAt) || !finite(v.updatedAt) ||
    !Array.isArray(v.teams) || !v.teams.every(record) || !uniqueIds(v.teams) ||
    !Array.isArray(v.matches) || !v.matches.every(record) || !uniqueIds(v.matches) ||
    !defaults(v.defaults) || !record(v.fearlessConfig) ||
    !["perSeries", "perTeam", "global"].every(k => typeof (v.fearlessConfig as Obj)[k] === "boolean") ||
    !record(v.teamPickHistory) || !Object.values(v.teamPickHistory).every(numbers) ||
    !numbers(v.globalPickHistory) || !optional(v.seasonStageKind, x => enumeration(x, ["split", "international"])) || !optional(v.metaSnapshot, meta)) return false;
  const teamIds = new Set(v.teams.map(t => t.id));
  const matchIds = new Set(v.matches.map(m => m.id));
  const teamRef = (id: unknown) => id === null || (text(id) && teamIds.has(id));
  const link = (l: unknown) => l == null || (record(l) && text(l.matchId) && matchIds.has(l.matchId) && enumeration(l.slot, ["blue", "red"]));
  if (v.activeMatchId != null && !matchIds.has(v.activeMatchId)) return false;
  return v.teams.every(t => text(t.name) && (t.players === undefined || roster(t.players))) &&
    v.matches.every(m => integer(m.round) && m.round >= 1 && m.round <= 10000 && defaults(m) &&
      teamRef(m.blueTeamId) && teamRef(m.redTeamId) && link(m.feedsInto) && link(m.losersFeedsInto) &&
      (m.series === null || validSeries(m.series)) &&
      (m.winner === null || (record(m.winner) && text(m.winner.teamId) && teamIds.has(m.winner.teamId) &&
        integer(m.winner.blueWins) && integer(m.winner.redWins))));
}

function meta(v: unknown): boolean {
  return record(v) && typeof v.metaEnabled === "boolean" &&
    tierMap(v.metaOverride) && synergies(v.synergyOverride) && counters(v.counterOverride);
}
export function validSeason(v: unknown): v is SeasonState {
  if (!record(v) || !text(v.id) || !text(v.name) || !finite(v.createdAt) || !finite(v.updatedAt) ||
    !enumeration(v.status, ["in-progress", "complete"]) || !record(v.config) ||
    !record(v.config.leagueConfigs) || !record(v.tournaments) || !Object.values(v.tournaments).every(validTournament) ||
    !Array.isArray(v.teams) || !v.teams.every(record) || !uniqueIds(v.teams) ||
    !Array.isArray(v.phases) || !integer(v.phaseIndex) || v.phaseIndex > v.phases.length ||
    !record(v.splitResults) || !record(v.intlResults) || !meta(v.currentMeta) || !optional(v.initialMeta, meta)) return false;
  const teamIds = new Set(v.teams.map(t => t.id));
  const resultIds = (ids: unknown) => strings(ids) && ids.every(id => teamIds.has(id));
  if (!Object.values(v.intlResults).every(resultIds) ||
    !Object.values(v.splitResults).every(split => record(split) && Object.values(split).every(resultIds))) return false;
  const config = v.config;
  if (!["sharedLeagueConfig", "liveMeta", "patchShift", "fearless"].every(k => typeof config[k] === "boolean") ||
    !enumeration(config.aiDifficulty, difficulties) ||
    !(config.controlledTeamId === null || teamIds.has(config.controlledTeamId))) return false;
  if (!LEAGUE_IDS.every(id => {
    const c = (config.leagueConfigs as Obj)[id];
    return record(c) && enumeration(c.format, TOURNAMENT_FORMATS) &&
      enumeration(c.regularSeries, seriesFormats) && enumeration(c.playoffSeries, seriesFormats) && integer(c.playoffTeams);
  })) return false;
  if (!v.teams.every(t => text(t.name) && text(t.color) && text(t.iconKey) &&
    enumeration(t.leagueId, LEAGUE_IDS) && roster(t.players) && optional(t.coach, coach))) return false;
  if (!v.phases.every(p => record(p) && text(p.label) && strings(p.tournamentIds) &&
    enumeration(p.kind, ["split", "international", "transfer"]) &&
    enumeration(p.status, ["pending", "in-progress", "complete"]) &&
    (p.kind !== "split" || enumeration(p.split, ["winter", "spring", "summer"])) &&
    (p.kind === "split" || enumeration(p.event, ["first-stand", "msi", "worlds", "global-cup"])) &&
    (p.status === "pending" || p.tournamentIds.every(id => Object.hasOwn(v.tournaments as Obj, id))))) return false;
  const originRows = (rows: unknown) => Array.isArray(rows) && rows.every(row => record(row) && optional(row.origin, validMarketOrigin));
  if (!optional(v.rosterNews, originRows) || !optional(v.transfersByEvent, value => record(value) && Object.values(value).every(originRows))) return false;
  return optional(v.offseasonRosterNewsBaseline, integer) &&
    nullableText(v.champion) && (v.champion === null || teamIds.has(v.champion)) &&
    optional(v.phaseRosters, x => arrayOf(x, phaseRoster)) &&
    (v.franchise === undefined || (record(v.franchise) && text(v.franchise.id) && text(v.franchise.name) && integer(v.franchise.year) &&
      typeof v.franchise.aging === "boolean" && optional(v.franchise.inactivePool, x => arrayOf(x, inactive)) &&
      optional(v.franchise.agencyDemands, x => arrayOf(x, demand)) &&
      ["usedNames", "sameWindowDemoteIds", "sameWindowRookieIds"].every(k => optional((v.franchise as Obj)[k], strings))));
}

const snapshotPlayer = (p: unknown): boolean => record(p) && enumeration(p.lane, lanes) &&
  enumeration(p.tier, tiers) && optional(p.goodChamps, numbers) && optional(p.badChamps, numbers) &&
  ["id", "name"].every(k => optional(p[k], x => typeof x === "string")) &&
  ["age", "debutYear"].every(k => optional(p[k], integer));
const phaseRoster = (row: unknown): boolean => record(row) && integer(row.phaseIndex) &&
  typeof row.label === "string" && enumeration(row.kind, ["split", "international"]) &&
  arrayOf(row.teams, t => record(t) && text(t.teamId) && text(t.teamName) && enumeration(t.leagueId, LEAGUE_IDS) &&
    optional(t.coach, c => record(c) && text(c.name) && finite(c.rating)) &&
    arrayOf(t.players, snapshotPlayer)) &&
  optional(row.inactive, v => arrayOf(v, p => record(p) && text(p.playerId) && enumeration(p.status, ["academy", "free-agent"])));
const playerCareer = (p: unknown): boolean => record(p) && text(p.playerId) && typeof p.playerName === "string" &&
  (p.leagueId === null || enumeration(p.leagueId, LEAGUE_IDS)) &&
  ["games", "kills", "mvps", "allPro", "splitTitles", "intlAppearances", "intlTitles"].every(k => integer(p[k])) &&
  ["wins", "deaths", "assists", "pentakills", "ratingGames", "goldDiffGames", "allProSplit", "allProGlobalSplit", "allProSeason", "intlMvps", "splitMvps", "age"].every(k => optional(p[k], integer)) &&
  ["ratingSum", "goldDiffSum"].every(k => optional(p[k], finite)) &&
  optional(p.lane, x => enumeration(x, lanes)) && optional(p.teamName, x => typeof x === "string") &&
  optional(p.champs, v => arrayOf(v, c => record(c) && integer(c.championId) && integer(c.games) && integer(c.wins)));

export function validHistoryEntry(v: unknown): boolean {
  if (!record(v) || !text(v.id) || !text(v.name) || !finite(v.archivedAt) ||
    typeof v.complete !== "boolean" || !record(v.intlChampions) || !record(v.splitChampions)) return false;
  const team = (t: unknown) => t === null || (record(t) && text(t.name) && enumeration(t.leagueId, LEAGUE_IDS) && text(t.color) && text(t.iconKey));
  const objectRows = ["awardTally", "allProTeams", "intlMvps", "splitMvps", "rookieOfYear", "playerCareers", "phaseRosters", "transfers", "rivalries", "headToHead", "inactivePlayers"];
  if (!objectRows.every(key => optional(v[key], rows => arrayOf(rows, record)))) return false;
  if (!optional(v.phaseRosters, rows => arrayOf(rows, phaseRoster))) return false;
  if (!optional(v.allProTeams, rows => arrayOf(rows, row => record(row) &&
    arrayOf(row.members, member => record(member) && enumeration(member.lane, lanes) && team(member.team))))) return false;
  const requiredTeam = (t: unknown) => t !== null && team(t);
  const ratingAward = (a: unknown): boolean => record(a) && enumeration(a.lane, lanes) &&
    requiredTeam(a.team) && finite(a.avgRating) && integer(a.games);
  const teamMap = (x: unknown): boolean => record(x) && Object.values(x).every(requiredTeam);
  const placementMap = (x: unknown): boolean => record(x) && Object.values(x).every(v => arrayOf(v, requiredTeam));
  if (!optional(v.playerCareers, rows => arrayOf(rows, playerCareer)) ||
    !optional(v.awardTally, rows => arrayOf(rows, a => record(a) && requiredTeam(a.team) &&
      enumeration(a.lane, lanes) && integer(a.mvp) && integer(a.allPro))) ||
    !["intlMvps", "splitMvps", "rookieOfYear"].every(k => optional(v[k], rows => arrayOf(rows, ratingAward))) ||
    !optional(v.allProTeams, rows => arrayOf(rows, a => record(a) &&
      enumeration(a.scope, ["split-league", "split-global", "season-global"]) &&
      optional(a.split, x => enumeration(x, ["winter", "spring", "summer"])) &&
      optional(a.leagueId, x => enumeration(x, LEAGUE_IDS)) && arrayOf(a.members, ratingAward))) ||
    !optional(v.intlRunnersUp, teamMap) ||
    !optional(v.splitRunnersUp, x => record(x) && Object.values(x).every(teamMap)) ||
    !optional(v.intlPlacements, placementMap) ||
    !optional(v.splitPlacements, x => record(x) && Object.values(x).every(placementMap)) ||
    !optional(v.leagueBestTeams, x => record(x) && Object.values(x).every(t => record(t) && requiredTeam(t.team) &&
      ["wins", "losses", "titles"].every(k => integer(t[k])))) ||
    !["headToHead", "rivalries"].every(k => optional(v[k], rows => arrayOf(rows, r => record(r) &&
      requiredTeam(r.teamA) && requiredTeam(r.teamB) && ["meetings", "aWins", "bWins"].every(k => integer(r[k])) &&
      optional(r.byScope, scopes => arrayOf(scopes, q => record(q) && text(q.scope) &&
        ["meetings", "aWins", "bWins"].every(k => integer(q[k]))))))) ||
    !optional(v.transfers, rows => arrayOf(rows, t => record(t) && team(t.from) && team(t.to) &&
      optional(t.origin, validMarketOrigin) && enumeration(t.lane, lanes) && enumeration(t.inTier, tiers) && enumeration(t.outTier, tiers))) ||
    !optional(v.inactivePlayers, rows => arrayOf(rows, p => record(p) && text(p.playerId) &&
      enumeration(p.lane, lanes) && enumeration(p.tier, tiers) &&
      enumeration(p.status, ["academy", "free-agent", "retired"]) && integer(p.inactiveYears) && integer(p.demotedYear)))) return false;
  if (!optional(v.initialMetaOverride, tierMap) || !optional(v.finalMetaOverride, tierMap)) return false;
  return team(v.champion) && team(v.runnerUp) && Object.values(v.intlChampions).every(team) &&
    Object.values(v.splitChampions).every(x => record(x) && Object.values(x).every(team));
}
