// Bundle real pro PLAYER handles from Leaguepedia (Fandom Cargo API) — accurate
// CURRENT starting rosters, unlike the LoL Esports feed (full squad, no starter
// flag). Writes lib/season/realPlayerNames.json:
//   { [league]: { [teamName]: { top, jungle, middle, bottom, support } } }
// Gaps are left null (the app fills a generated handle). Throttled hard to
// respect Leaguepedia's rate limit.  npm run fetch-player-names

import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const snap = JSON.parse(await readFile(resolve(ROOT, "lib/season/realTeamNames.json"), "utf8"));
const API = "https://lol.fandom.com/api.php";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ROLE_LANE = { Top: "top", Jungle: "jungle", Mid: "middle", Bot: "bottom", Support: "support" };
const LANES = ["top", "jungle", "middle", "bottom", "support"];

// Our name → its canonical Leaguepedia name (LP uses short forms).
const LP_NAME = {
  "Gen.G Esports": "Gen.G", "kt Rolster": "KT Rolster", "NONGSHIM RED FORCE": "Nongshim RedForce",
  "BNK FEARX": "BNK FearX", "HANJIN BRION": "Hanwha Life Esports Challengers", "DN SOOPers": "DN Freecs",
  "KIWOOM DRX": "DRX", "BILIBILI GAMING": "Bilibili Gaming", "Beijing JDG Esports": "JD Gaming",
  "TOP ESPORTS": "Top Esports", "WeiboGaming": "Weibo Gaming", "Suzhou LNG Esports": "LNG Esports",
  "THUNDER TALK GAMING": "ThunderTalk Gaming", "Shenzhen NINJAS IN PYJAMAS": "Ninjas in Pyjamas.CN",
  "Xi'an Team WE": "Team WE", "LEVIATÁN": "Leviatán", "KaBuM!": "KaBuM! e-Sports",
  "The Chiefs Esports Club": "Chiefs Esports Club", "Relove Deep Cross Gaming": "Deep Cross Gaming",
  "Team Secret Whales": "Team Secret (Vietnamese Team)", "MVK Esports": "MGN Vikings Esports",
  // `strip` removes "KIA", which would mangle these — pin them explicitly.
  "Dplus KIA": "Dplus KIA", "Cloud9 Kia": "Cloud9", "NRG Kia": "NRG",
  "Team Liquid Alienware": "Team Liquid", "RED Canids Kalunga": "RED Canids",
  "GIANTX": "GIANTX", "Movistar KOI": "Movistar KOI",
};
// Strip sponsor / suffix noise Leaguepedia drops from team names.
const strip = (s) =>
  s.replace(/\b(Esports|Gaming|Kia|Alienware|Kalunga|e-Sports)\b/gi, "").replace(/\s+/g, " ").trim();
const primary = (name) => LP_NAME[name] ?? (strip(name) || name);
// Backups to try for teams that miss on the primary name.
const variants = (name) =>
  [...new Set([name, strip(name), name.replace(/\bEsports\b/gi, "").trim()])].filter(Boolean);

async function queryRosters(names) {
  const where =
    "(" + names.map((n) => `Team="${n.replace(/"/g, '\\"')}"`).join(" OR ") +
    `) AND IsRetired="0" AND (Role="Top" OR Role="Jungle" OR Role="Mid" OR Role="Bot" OR Role="Support")`;
  const url = `${API}?action=cargoquery&format=json&tables=Players&fields=ID,Role,Team&where=` +
    encodeURIComponent(where) + "&limit=500&origin=*";
  const res = await fetch(url, { headers: { "User-Agent": "draftsim/1.0 (roster import)" } });
  const j = await res.json();
  if (j.error) throw new Error(`${j.error.code}: ${j.error.info}`);
  return (j.cargoquery || []).map((x) => x.title);
}

async function run(nameToTeam, chunk = 10, throttle = 4500) {
  const names = [...nameToTeam.keys()];
  const hits = new Map(); // our team → {lane: handle}
  for (let i = 0; i < names.length; i += chunk) {
    const batch = names.slice(i, i + chunk);
    let rows = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      try { rows = await queryRosters(batch); break; }
      catch (e) { process.stderr.write(`  rl, wait… `); await sleep(7000); }
    }
    for (const r of rows) {
      const lane = ROLE_LANE[r.Role];
      const team = nameToTeam.get(r.Team);
      if (!lane || !team) continue;
      const roster = hits.get(team) ?? {};
      if (!roster[lane]) roster[lane] = r.ID;
      hits.set(team, roster);
    }
    process.stderr.write(`  ${Math.min(i + chunk, names.length)}/${names.length}\r`);
    await sleep(throttle);
  }
  return hits;
}

// Merge with whatever a prior run already resolved, so successive runs
// accumulate coverage past the rate limit instead of starting over.
const rosters = new Map();
try {
  const prev = JSON.parse(await readFile(resolve(ROOT, "lib/season/realPlayerNames.json"), "utf8"));
  for (const byTeam of Object.values(prev)) {
    for (const [team, r] of Object.entries(byTeam)) {
      const kept = {};
      for (const l of LANES) if (r[l]) kept[l] = r[l];
      if (Object.keys(kept).length) rosters.set(team, kept);
    }
  }
} catch { /* first run */ }

const teamList = Object.values(snap).flat().map((t) => t.name);
const remaining = () => teamList.filter((n) => !rosters.has(n));

// Pass 1: primary names for still-missing teams.
const p1 = new Map(remaining().map((n) => [primary(n), n]));
if (p1.size) for (const [team, r] of await run(p1)) if (!rosters.has(team)) rosters.set(team, r);

// Pass 2: name variants for whatever still missed.
const p2 = new Map();
for (const n of remaining()) for (const v of variants(n)) if (!p2.has(v)) p2.set(v, n);
if (p2.size) for (const [team, r] of await run(p2)) if (!rosters.has(team)) rosters.set(team, r);

const out = {};
let teamsHit = 0, lanesFilled = 0, lanesTotal = 0;
const misses = [];
for (const [lg, teams] of Object.entries(snap)) {
  out[lg] = {};
  for (const t of teams) {
    const roster = rosters.get(t.name) ?? {};
    const full = {};
    for (const l of LANES) { full[l] = roster[l] ?? null; if (full[l]) lanesFilled++; lanesTotal++; }
    if (Object.values(roster).some(Boolean)) teamsHit++; else misses.push(`${lg}:${t.name}`);
    out[lg][t.name] = full;
  }
}
await writeFile(resolve(ROOT, "lib/season/realPlayerNames.json"), JSON.stringify(out, null, 2) + "\n");
console.log(`\nTeams hit: ${teamsHit}/60 · lanes ${lanesFilled}/${lanesTotal} (${Math.round(100*lanesFilled/lanesTotal)}%)`);
if (misses.length) console.log("Misses:", misses.join(", "));
