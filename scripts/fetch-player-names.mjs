// Bundle real pro PLAYER handles from the OFFICIAL LoL Esports API (the
// lolesports.com backend) — the authoritative source, so it wins over any stale
// bundled data. The team objects don't reliably carry rosters, so the truth is
// each team's latest completed MATCH lineup (the actual starting five via the
// live-stats feed); teams with no recent match fall back to the team-object
// roster, then to whatever a prior run already had. Not rate-limited.
// Writes lib/season/realPlayerNames.json:
//   { [league]: { [teamName]: { top, jungle, middle, bottom, support } } }
//   npm run fetch-player-names

import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
// Zamudo/Kisno/Sushee are a best guess — correct if wrong.
const MANUAL = {
  "PSG Talon": { support: "Woody" },
  "The Chiefs Esports Club": { middle: "JimieN" },
  "NRG Kia": { top: "Zamudo", jungle: "Kisno", middle: "PhyMini", bottom: "Sushee", support: "Spica" },
};

// Existing bundled rosters — the last-resort fallback for teams the official API
// can't cover (no roster object AND no recent match: defunct/offseason orgs).
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
// WHEN — { roster, date }. A stale date (team hasn't played in ~a year) lets the
// resolver drop a defunct team's roster rather than steal current players.
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
    if (lane && !roster[lane] && nm.startsWith(`${team.code} `)) roster[lane] = nm.slice(team.code.length + 1);
  }
  return Object.keys(roster).length ? { roster, date: Date.parse(ev.startTime) || 0 } : null;
}

// Fallback: the team-object roster (full squad, no starter flag → first per role).
function teamObjRoster(team) {
  if (!team?.players?.length) return null;
  const roster = {};
  for (const p of team.players) {
    const l = ROLE2LANE[p.role];
    if (l && !roster[l] && p.summonerName) roster[l] = p.summonerName;
  }
  return Object.keys(roster).length ? roster : null;
}

// Gather each team's lineup (with date) and team-object roster.
const lineups = new Map(); // ourName → { roster, date }
const teamObjs = new Map(); // ourName → { lane: handle }
const noEsTeam = new Set(); // teams the official feed doesn't know at all
for (const teams of Object.values(snap)) {
  for (const t of teams) {
    const es = esTeams.get(norm(ALIAS[t.name] ?? t.name));
    if (!es) { noEsTeam.add(t.name); continue; }
    const line = await lineupRoster(es).catch(() => null);
    if (line) lineups.set(t.name, line);
    const obj = teamObjRoster(es);
    if (obj) teamObjs.set(t.name, obj);
  }
}

const teamOf = new Map(); // ourName → its league key (for output)
for (const [lg, teams] of Object.entries(snap)) for (const t of teams) teamOf.set(t.name, lg);

// Lineup candidates, freshest first — a player goes to the team that played him
// MOST RECENTLY. This alone resolves transfers AND defunct teams: a player who
// left 100 Thieves (last game months ago) for an active team is claimed by the
// active team's recent lineup, stripping him from the defunct one. No absolute
// age cutoff — that would wrongly drop active teams whose league is between
// splits (e.g. LCP) relative to one currently playing (e.g. LEC).
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
  if (!handle || assigned.has(handle) || out[teamOf.get(team)][team][lane]) return false;
  out[teamOf.get(team)][team][lane] = handle;
  assigned.add(handle);
  return true;
};

const via = { manual: 0, lineup: 0, teamObj: 0, prev: 0 };
// Round 0 — hand-verified overrides claim their handle first, so a conflicting
// feed pick for the same player is dropped from the other team.
for (const [team, lanes] of Object.entries(MANUAL))
  for (const [lane, handle] of Object.entries(lanes)) if (setLane(team, lane, handle)) via.manual++;
// Round 1 — official lineups, by recency (the authoritative starting fives).
for (const c of cands) if (setLane(c.team, c.lane, c.handle)) via.lineup++;
// Round 2 — team-object rosters for active teams without a usable lineup.
for (const [team, roster] of teamObjs) for (const l of LANES) if (setLane(team, l, roster[l])) via.teamObj++;
// Round 3 — prior bundled data ONLY for teams the official feed doesn't know
// (so a defunct team the feed DOES list stays empty → generated, not stale).
for (const team of noEsTeam) for (const l of LANES) if (setLane(team, l, prev[team]?.[l])) via.prev++;

let filled = 0, total = 0;
const misses = [];
for (const [lg, teams] of Object.entries(snap)) for (const t of teams) {
  const n = LANES.filter((l) => out[lg][t.name][l]).length;
  filled += n; total += 5;
  if (n === 0) misses.push(`${lg}:${t.name}`);
}
await writeFile(resolve(ROOT, "lib/season/realPlayerNames.json"), JSON.stringify(out, null, 2) + "\n");
console.log(`Lanes ${filled}/${total} (${Math.round((100 * filled) / total)}%) · ` +
  `${via.manual} manual + ${via.lineup} via lineup + ${via.teamObj} via team roster + ${via.prev} kept from prior`);
if (misses.length) console.log("Empty (not in the official feed):", misses.join(", "));
