// Bundle real player handles BY LANE from the LoL Esports API (the public
// lolesports.com backend), so rookies debut with a position-authentic name (a
// real top laner debuts top, not support). Writes lib/season/rookieNames.json:
//   { top: [...], jungle: [...], middle: [...], bottom: [...], support: [...] }
//
// Why this source (not Leaguepedia like fetch-player-names): it returns every
// team's FULL squad with each player's role in ONE request and isn't aggressively
// rate-limited. The "full squad, no starter flag" that makes it wrong for STARTING
// rosters is exactly right for a rookie pool — we WANT subs/academy/prospects.
// Current starters (realPlayerNames.json) are excluded so a rookie never debuts
// as a name already on the field. NEVER clobbers: if the API returns nothing the
// bundled pool is left untouched.
//   npm run fetch-rookie-names

import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Public site key shipped by lolesports.com (same one the web client uses).
const KEY = "0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z";
const API = "https://esports-api.lolesports.com/persisted/gw/getTeams?hl=en-US";
const ROLE_LANE = { top: "top", jungle: "jungle", mid: "middle", bottom: "bottom", support: "support" };
const LANES = ["top", "jungle", "middle", "bottom", "support"];

// Retired/iconic IRL pros, by their real lane — seeded into the pool so a legend
// can debut as a rookie at the RIGHT position (a fun easter egg). Merged after
// the live fetch and deduped, so they survive every regen.
const LEGENDS = {
  top: [
    "MaRin", "Smeb", "Duke", "Acorn", "Flame", "Looper", "Khan", "Wunder", "Hauntzer", "Impact",
    "ZionSpartan", "Dyrus", "Darshan", "sOAZ", "Balls", "Quas", "Gamsu", "Cabochard", "Vizicsacsi",
    "Letme", "Koro1", "Save", "Profit", "Untara", "Ssumday", "CuVee", "Expession", "Lindarang",
  ],
  jungle: [
    "Bengi", "ClearLove", "DanDy", "Ambition", "KaKAO", "Reignover", "Blank", "Spirit", "inSec",
    "Meteos", "Svenskeren", "Mlxg", "Diamondprox", "Cyanide", "Xmithie", "Crumbz", "Lira", "Trick",
    "Amazing", "Shook", "Watch", "Beyond", "Haru", "Score",
  ],
  middle: [
    "Pawn", "xPeke", "Dade", "Easyhoon", "Bjergsen", "Crown", "Pobelter", "Ryu", "Froggen", "Coco",
    "Kuro", "Febiven", "Hai", "Scarra", "Bischu", "Fenix", "Nagne", "Ggoong", "Frozen", "Cruzer",
    "Mickey", "Sun", "Naehyun", "Goldenglue",
  ],
  bottom: [
    "Uzi", "Deft", "Bang", "PraY", "Imp", "Doublelift", "Sneaky", "Piglet", "WildTurtle", "Bebe",
    "Mystic", "Stixxay", "Altec", "Apse", "Kobe", "NaMei", "San", "Hjarnan", "Steeelback", "Forg1ven",
    "Emperor", "Smlz",
  ],
  support: [
    "MadLife", "Mata", "Wolf", "GorillA", "aphromoo", "Mithy", "Smoothie", "Olleh", "Wadid", "PoohManDu",
    "Heart", "Lustboy", "Tusin", "Vander", "Kasing", "Edward", "Xpecial", "Adrian", "Snowflower",
    "Biofrost", "Zeyzal", "Krepo", "BunnyFuFuu",
  ],
};

// Handles already starting somewhere — don't hand them to a rookie.
const starters = new Set();
try {
  const real = JSON.parse(await readFile(resolve(ROOT, "lib/season/realPlayerNames.json"), "utf8"));
  for (const byTeam of Object.values(real))
    for (const roster of Object.values(byTeam))
      for (const h of Object.values(roster)) if (h) starters.add(h);
} catch { /* optional */ }

const res = await fetch(API, { headers: { "x-api-key": KEY } });
const j = await res.json();
const teams = j?.data?.teams ?? [];
if (!Array.isArray(teams) || teams.length === 0) {
  console.log("No data from the LoL Esports API — left rookieNames.json untouched.");
  process.exit(1);
}

const byLane = { top: [], jungle: [], middle: [], bottom: [], support: [] };
const seen = new Set();
let skipped = 0;
for (const t of teams) {
  for (const p of t.players ?? []) {
    const lane = ROLE_LANE[p.role]; // skips "none" (coaches/staff)
    const h = (p.summonerName ?? "").trim();
    if (!lane || !h) continue;
    if (seen.has(h)) continue; //       a handle appears on many team entries
    if (starters.has(h)) { skipped++; continue; }
    seen.add(h);
    byLane[lane].push(h);
  }
}

const total = LANES.reduce((n, l) => n + byLane[l].length, 0);
if (total === 0) {
  console.log("API returned teams but no usable players — left rookieNames.json untouched.");
  process.exit(1);
}
// Seed the retired legends into their real lanes (deduped, and never if they're
// somehow a current starter).
let legends = 0;
for (const l of LANES) for (const h of LEGENDS[l]) {
  if (seen.has(h) || starters.has(h)) continue;
  seen.add(h);
  byLane[l].push(h);
  legends++;
}
for (const l of LANES) byLane[l].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
await writeFile(resolve(ROOT, "lib/season/rookieNames.json"), JSON.stringify(byLane) + "\n");
console.log(`Wrote rookieNames.json · ${LANES.map((l) => `${l}:${byLane[l].length}`).join(" ")} ` +
  `(${total + legends} total, ${skipped} current starters excluded, ${legends} retired legends added)`);
