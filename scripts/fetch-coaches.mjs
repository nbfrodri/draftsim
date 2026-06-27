// Bundle real HEAD-COACH handles from Leaguepedia (Fandom Cargo API). Unlike a
// plain Role="Coach" query — which returns the whole coaching staff (head +
// assistants + analysts) and so often grabs an assistant — this reads the
// RosterChanges table filtered to RoleDisplay="Head Coach" and takes each
// team's MOST RECENT head-coach event: if it's a Join the player is the current
// head coach; a Leave means the seat is currently vacant (left null).
// Writes lib/season/realCoachNames.json:  { [league]: { [teamName]: name|null } }
// Throttled hard to respect Leaguepedia's rate limit. Re-runnable: it merges
// with the prior file so successive runs accumulate coverage.
//   npm run fetch-coaches

import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const snap = JSON.parse(await readFile(resolve(ROOT, "lib/season/realTeamNames.json"), "utf8"));
const API = "https://lol.fandom.com/api.php";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Our name → its canonical Leaguepedia name (LP uses short forms). Mirrors
// fetch-player-names.mjs so both pull from the same team identities.
const LP_NAME = {
  "Gen.G Esports": "Gen.G", "kt Rolster": "KT Rolster", "NONGSHIM RED FORCE": "Nongshim RedForce",
  "BNK FEARX": "BNK FearX", "HANJIN BRION": "Hanwha Life Esports Challengers", "DN SOOPers": "DN Freecs",
  "KIWOOM DRX": "DRX", "BILIBILI GAMING": "Bilibili Gaming", "Beijing JDG Esports": "JD Gaming",
  "TOP ESPORTS": "Top Esports", "WeiboGaming": "Weibo Gaming", "Suzhou LNG Esports": "LNG Esports",
  "THUNDER TALK GAMING": "ThunderTalk Gaming", "Shenzhen NINJAS IN PYJAMAS": "Ninjas in Pyjamas.CN",
  "Xi'an Team WE": "Team WE", "LEVIATÁN": "Leviatán", "KaBuM!": "KaBuM! e-Sports",
  "The Chiefs Esports Club": "Chiefs Esports Club", "Relove Deep Cross Gaming": "Deep Cross Gaming",
  "Team Secret Whales": "Team Secret (Vietnamese Team)", "MVK Esports": "MGN Vikings Esports",
  "Dplus KIA": "Dplus KIA", "Cloud9 Kia": "Cloud9", "NRG Kia": "NRG",
  "Team Liquid Alienware": "Team Liquid", "RED Canids Kalunga": "RED Canids",
  "GIANTX": "GIANTX", "Movistar KOI": "Movistar KOI",
};
const strip = (s) =>
  s.replace(/\b(Esports|Gaming|Kia|Alienware|Kalunga|e-Sports)\b/gi, "").replace(/\s+/g, " ").trim();
const primary = (name) => LP_NAME[name] ?? (strip(name) || name);
const variants = (name) =>
  [...new Set([name, strip(name), name.replace(/\bEsports\b/gi, "").trim()])].filter(Boolean);

// Query RosterChanges for ALL coach-role Join/Leave events, newest first. We
// fetch RoleDisplay so the resolver can prefer "Head Coach" but fall back to a
// team's lone plain "Coach" (small regions often record one un-prefixed coach).
async function queryCoaches(names) {
  const where =
    "(" + names.map((n) => `Team="${n.replace(/"/g, '\\"')}"`).join(" OR ") +
    `) AND RoleDisplay LIKE "%Coach%"`;
  const url =
    `${API}?action=cargoquery&format=json&tables=RosterChanges` +
    `&fields=Player,Team,Direction,RoleDisplay,Date_Sort=Date&where=` +
    encodeURIComponent(where) +
    `&order_by=${encodeURIComponent("Date_Sort DESC")}&limit=500&origin=*`;
  const res = await fetch(url, { headers: { "User-Agent": "draftsim/1.0 (coach import)" } });
  const j = await res.json();
  if (j.error) throw new Error(`${j.error.code}: ${j.error.info}`);
  return (j.cargoquery || []).map((x) => x.title);
}

async function run(nameToTeam, chunk = 6, throttle = 8000) {
  const names = [...nameToTeam.keys()];
  const hits = new Map(); // our team → coach handle (or explicit null = vacant)
  for (let i = 0; i < names.length; i += chunk) {
    const batch = names.slice(i, i + chunk);
    let rows = [], ok = false;
    for (let attempt = 0; attempt < 6; attempt++) {
      try { rows = await queryCoaches(batch); ok = true; break; }
      catch { process.stderr.write(`  rl, wait… `); await sleep(13000); }
    }
    // A batch that never succeeded must NOT mark its teams as resolved — leave
    // them for the next pass / rerun instead of recording false vacancies.
    if (!ok) { await sleep(throttle); continue; }
    // Net membership per (team, player) per role bucket: joins − leaves. Net > 0
    // = currently in the seat (handles same-date Join+Leave pairs and re-signings
    // a "newest event wins" rule gets wrong). Buckets: "head" = RoleDisplay
    // "Head Coach"; "coach" = exactly "Coach" (NOT Assistant/Strategic/etc.).
    const byTeam = new Map(); // team → Map(player → { head:{net,recent}, coach:{net,recent} })
    for (const r of rows) {
      const team = nameToTeam.get(r.Team);
      if (!team) continue;
      const bucket = r.RoleDisplay === "Head Coach" ? "head" : r.RoleDisplay === "Coach" ? "coach" : null;
      if (!bucket) continue; // ignore Assistant / Strategic / Performance coaches
      // Leaguepedia appends a disambiguating real name in parens when the
      // handle is ambiguous ("Edo (Park Jun-seok)") — keep just the handle.
      const player = r.Player.replace(/\s*\(.*\)$/, "").trim();
      const players = byTeam.get(team) ?? new Map();
      const cur = players.get(player) ?? { head: { net: 0, recent: "" }, coach: { net: 0, recent: "" } };
      cur[bucket].net += r.Direction === "Join" ? 1 : -1;
      if (r.Direction === "Join" && r.Date > cur[bucket].recent) cur[bucket].recent = r.Date;
      players.set(player, cur);
      byTeam.set(team, players);
    }
    for (const [team, players] of byTeam) {
      if (hits.has(team)) continue;
      // 1) Prefer a current Head Coach (most recent join among net-positive).
      let head = null;
      for (const [player, b] of players) {
        if (b.head.net > 0 && (!head || b.head.recent > head.recent)) head = { player, recent: b.head.recent };
      }
      if (head) { hits.set(team, head.player); continue; }
      // 2) Fallback: a team with NO head coach but exactly ONE current plain
      //    "Coach" — that lone coach is the de-facto head (common in small
      //    regions). Multiple current coaches = ambiguous, leave for null.
      const plain = [...players].filter(([, b]) => b.coach.net > 0).map(([player]) => player);
      hits.set(team, plain.length === 1 ? plain[0] : null);
    }
    process.stderr.write(`  ${Math.min(i + chunk, names.length)}/${names.length}\r`);
    await sleep(throttle);
  }
  return hits;
}

// Merge with the prior file so reruns accumulate past the rate limit.
const coaches = new Map(); // our team → handle (non-null only; null = unknown/vacant)
try {
  const prev = JSON.parse(await readFile(resolve(ROOT, "lib/season/realCoachNames.json"), "utf8"));
  for (const byTeam of Object.values(prev)) {
    for (const [team, name] of Object.entries(byTeam)) if (name) coaches.set(team, name);
  }
} catch { /* first run */ }

const teamList = Object.values(snap).flat().map((t) => t.name);
const remaining = () => teamList.filter((n) => !coaches.has(n));

// Pass 1: primary LP names.
const p1 = new Map(remaining().map((n) => [primary(n), n]));
if (p1.size) for (const [team, name] of await run(p1)) if (name && !coaches.has(team)) coaches.set(team, name);

// Pass 2: name variants for whatever still missed.
const p2 = new Map();
for (const n of remaining()) for (const v of variants(n)) if (!p2.has(v)) p2.set(v, n);
if (p2.size) for (const [team, name] of await run(p2)) if (name && !coaches.has(team)) coaches.set(team, name);

const out = {};
let hit = 0, total = 0;
const misses = [];
for (const [lg, teams] of Object.entries(snap)) {
  out[lg] = {};
  for (const t of teams) {
    const name = coaches.get(t.name) ?? null;
    out[lg][t.name] = name;
    total++;
    if (name) hit++; else misses.push(`${lg}:${t.name}`);
  }
}
await writeFile(resolve(ROOT, "lib/season/realCoachNames.json"), JSON.stringify(out, null, 2) + "\n");
console.log(`\nHead coaches: ${hit}/${total} (${Math.round((100 * hit) / total)}%)`);
if (misses.length) console.log("Misses:", misses.join(", "));
