// Bundle real pro PLAYER handles from the OFFICIAL LoL Esports API (the
// lolesports.com backend) — the authoritative source, so it wins over any stale
// bundled data. The team objects don't reliably carry rosters, so the truth is
// each team's latest completed MATCH lineup (the actual starting five via the
// live-stats feed); teams with no recent match fall back to the team-object
// roster, then to whatever a prior run already had. Not rate-limited.
// Writes lib/season/realPlayerNames.json:
//   { [league]: { [teamName]: { top, jungle, middle, bottom, support } } }
//   npm run fetch-player-names
//
// Academy / Challengers / sub-cup traps:
//   • getTeams lists academy players first (no starter flag)
//   • schedule can surface Challengers or cup games under the same team code
// Sticky prior starters (still on the org) win before match lineups; a full
// academy five is also dropped when prior starters remain on the squad.

import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  isLikelyAcademyLineup,
  preferPriorOnTeamObject,
  stickyPriorStarters,
  trimHandle,
} from "./rosterFetchHelpers.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const snap = JSON.parse(await readFile(resolve(ROOT, "lib/season/realTeamNames.json"), "utf8"));
const KEY = "0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z"; // public lolesports.com site key
const ES = "https://esports-api.lolesports.com/persisted/gw";
const ES_H = { headers: { "x-api-key": KEY } };
const LANES = ["top", "jungle", "middle", "bottom", "support"];
const ROLE2LANE = { top: "top", jungle: "jungle", mid: "middle", bottom: "bottom", support: "support" };
const norm = (s) =>
  (s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const esGet = async (path) => await (await fetch(`${ES}/${path}`, ES_H)).json();
// Our name → its EXACT LoL Esports name, only where a normalized match misses.
// Never alias a main team to its "… Academy" entry (wrong, benched five).
const ALIAS = {};

// Hand-verified lanes the official feed can't resolve (defunct orgs, or a player
// the recency resolver assigned elsewhere). Applied FIRST, so these claim their
// handle and any conflicting feed pick is dropped. NRG positions for
// Zamudo/Kisno/Sushee are a best guess — correct if wrong. PSG / Chiefs keep
// full prior starters because getTeams currently returns an empty squad.
const MANUAL = {
  "PSG Talon": {
    top: "Azhi",
    jungle: "Karsa",
    middle: "Maple",
    bottom: "Betty",
    support: "Woody",
  },
  "The Chiefs Esports Club": {
    top: "BioPanther",
    jungle: "Whynot",
    middle: "JimieN",
    bottom: "Slayder",
    support: "Luon",
  },
  "NRG Kia": { top: "Zamudo", jungle: "Kisno", middle: "PhyMini", bottom: "Sushee", support: "Spica" },
};

// Existing bundled rosters — fallback for gaps / academy false-positives.
const prev = {};
try {
  const p = JSON.parse(await readFile(resolve(ROOT, "lib/season/realPlayerNames.json"), "utf8"));
  for (const teams of Object.values(p)) for (const [n, r] of Object.entries(teams)) prev[n] = r;
} catch { /* first run */ }

// League name → id (getTeams only carries the league NAME, not its id).
const leagues = new Map();
for (const l of (await esGet("getLeagues?hl=en-US"))?.data?.leagues ?? []) leagues.set(l.name, l.id);

// Team objects by normalized name (kept even when their roster is empty — we
// still need the code + homeLeague to find their matches).
const esTeams = new Map();
for (const t of (await esGet("getTeams?hl=en-US"))?.data?.teams ?? []) {
  const k = norm(t.name);
  if (!esTeams.has(k)) esTeams.set(k, t);
}

// One schedule fetch per league, cached: its recent events. Returns the team's
// most recent COMPLETED event (carries startTime — we resolve transfers by which
// team played the player most recently).
const schedCache = new Map();
async function latestEvent(leagueId, code) {
  if (!schedCache.has(leagueId)) {
    const evs = (await esGet(`getSchedule?hl=en-US&leagueId=${leagueId}`))?.data?.schedule?.events ?? [];
    schedCache.set(leagueId, evs);
  }
  const mine = schedCache.get(leagueId)
    .filter((e) => e.state === "completed" && e.match?.teams?.some((t) => t.code === code));
  return mine.length ? mine[mine.length - 1] : null;
}

// Authoritative: the five who actually played the team's most recent game, plus
// WHEN — { roster, date }.
async function lineupRoster(team) {
  const leagueId = leagues.get(team?.homeLeague?.name);
  if (!leagueId || !team?.code) return null;
  const ev = await latestEvent(leagueId, team.code);
  if (!ev) return null;
  const games = (await esGet(`getEventDetails?hl=en-US&id=${ev.match.id}`))
    ?.data?.event?.match?.games?.filter((g) => g.state === "completed") ?? [];
  if (!games.length) return null;
  const wj = await (await fetch(`https://feed.lolesports.com/livestats/v1/window/${games[games.length - 1].id}`)).json();
  const md = wj?.gameMetadata;
  if (!md) return null;
  const all = [...(md.blueTeamMetadata?.participantMetadata ?? []), ...(md.redTeamMetadata?.participantMetadata ?? [])];
  const roster = {};
  for (const p of all) {
    const lane = ROLE2LANE[p.role];
    const nm = p.summonerName ?? ""; // live-stats prefixes the team code: "100T Dhokla"
    if (lane && !roster[lane] && nm.startsWith(`${team.code} `)) {
      roster[lane] = trimHandle(nm.slice(team.code.length + 1));
    }
  }
  return Object.keys(roster).length ? { roster, date: Date.parse(ev.startTime) || 0 } : null;
}

function squadHandles(es) {
  return (es?.players ?? []).map((p) => p.summonerName);
}

// Gather each team's lineup (with date) and team-object roster.
const lineups = new Map(); // ourName → { roster, date }
const teamObjs = new Map(); // ourName → { lane: handle }
const esByOurName = new Map(); // ourName → es team
const noEsTeam = new Set();
let skippedAcademy = 0;
for (const teams of Object.values(snap)) {
  for (const t of teams) {
    const es = esTeams.get(norm(ALIAS[t.name] ?? t.name));
    if (!es) { noEsTeam.add(t.name); continue; }
    esByOurName.set(t.name, es);
    const line = await lineupRoster(es).catch(() => null);
    if (line) {
      if (isLikelyAcademyLineup(prev[t.name], line.roster, squadHandles(es))) skippedAcademy++;
      else lineups.set(t.name, line);
    }
    const obj = preferPriorOnTeamObject(es.players, ROLE2LANE, prev[t.name]);
    if (obj) teamObjs.set(t.name, obj);
  }
}

const teamOf = new Map();
for (const [lg, teams] of Object.entries(snap)) for (const t of teams) teamOf.set(t.name, lg);

const cands = [];
for (const [name, { roster, date }] of lineups)
  for (const lane of LANES) if (roster[lane]) cands.push({ team: name, lane, handle: roster[lane], date });
cands.sort((a, b) => b.date - a.date);

const out = {};
for (const lg of Object.keys(snap)) out[lg] = {};
for (const [lg, teams] of Object.entries(snap)) for (const t of teams)
  out[lg][t.name] = { top: null, jungle: null, middle: null, bottom: null, support: null };
const assigned = new Set();
const setLane = (team, lane, handle) => {
  const h = trimHandle(handle);
  if (!h || assigned.has(h) || out[teamOf.get(team)][team][lane]) return false;
  out[teamOf.get(team)][team][lane] = h;
  assigned.add(h);
  return true;
};

const via = { manual: 0, sticky: 0, lineup: 0, teamObj: 0, prev: 0 };
// Round 0 — hand-verified overrides.
for (const [team, lanes] of Object.entries(MANUAL))
  for (const [lane, handle] of Object.entries(lanes)) if (setLane(team, lane, handle)) via.manual++;
// Round 0.5 — prior starters still on the org (blocks sub/cup false positives).
for (const [team, es] of esByOurName) {
  const sticky = stickyPriorStarters(prev[team], squadHandles(es));
  for (const [lane, handle] of Object.entries(sticky)) if (setLane(team, lane, handle)) via.sticky++;
}
// Round 1 — official lineups by recency (fills vacated lanes / transfers).
for (const c of cands) if (setLane(c.team, c.lane, c.handle)) via.lineup++;
// Round 2 — team-object rosters for remaining gaps.
for (const [team, roster] of teamObjs) for (const l of LANES) if (setLane(team, l, roster[l])) via.teamObj++;
// Round 3 — prior bundled data for remaining gaps.
for (const [team, roster] of Object.entries(prev)) {
  if (!teamOf.has(team)) continue;
  for (const l of LANES) if (setLane(team, l, roster?.[l])) via.prev++;
}

let filled = 0, total = 0;
const misses = [];
for (const [lg, teams] of Object.entries(snap)) for (const t of teams) {
  const n = LANES.filter((l) => out[lg][t.name][l]).length;
  filled += n; total += 5;
  if (n === 0) misses.push(`${lg}:${t.name}`);
}
await writeFile(resolve(ROOT, "lib/season/realPlayerNames.json"), JSON.stringify(out, null, 2) + "\n");
console.log(`Lanes ${filled}/${total} (${Math.round((100 * filled) / total)}%) · ` +
  `${via.manual} manual + ${via.sticky} sticky + ${via.lineup} via lineup + ${via.teamObj} via team roster + ${via.prev} kept from prior` +
  (skippedAcademy ? ` · skipped ${skippedAcademy} academy lineups` : ""));
if (misses.length) console.log("Empty (not in the official feed):", misses.join(", "));
