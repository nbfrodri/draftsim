// Refresh script — fetches the latest Meraki Analytics champion abilities
// and item stats, parses defensively, writes to lib/data/{abilities,items}.json.
//
// Run with: npm run refresh-data
// Recommended cadence: once per Riot patch (~2 weeks).
//
// Network calls: 1 (champion index) + 171 (per-champion) + 1 (items.json).
// All Meraki CDN, no auth required. Total ~3-5 MB downloaded.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MERAKI = "https://cdn.merakianalytics.com/riot/lol/resources/latest/en-US";

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed: ${url} (${res.status})`);
  return res.json();
}

// ─── CC duration extraction ─────────────────────────────────────────────────
//
// Meraki ability effects come as English descriptions. We regex them for
// hard-CC keywords + duration. Patterns are conservative — if we can't
// parse a number, we treat it as 0 (so soft CC like slow doesn't inflate
// the lockdown total).

// Verb conjugations: third-person s, past -ed, gerund -ing, plus the bare
// stem. Each pattern allows arbitrary words between the verb and the
// duration (e.g. "stuns them for 1 second", "knocks all enemies up for 1.5
// seconds") because Meraki descriptions vary.
const CC_PATTERNS = [
  /\bstun(?:s|ned|ning)?\b[^.]{0,40}?(\d+(?:\.\d+)?)\s*second/i,
  // "knock(s/ed/ing) [target/them/enemies] up for X seconds" — allow
  // arbitrary words between "knock" and "up".
  /\bknock(?:s|ed|ing)?\b[^.]{0,30}?\b(?:up|back|aside|airborne)\b[^.]{0,40}?(\d+(?:\.\d+)?)\s*second/i,
  /\broot(?:s|ed|ing)?\b[^.]{0,40}?(\d+(?:\.\d+)?)\s*second/i,
  /\bimmobiliz(?:es?|ed|ing)\b[^.]{0,40}?(\d+(?:\.\d+)?)\s*second/i,
  /\bsilenc(?:es?|ed|ing)\b[^.]{0,40}?(\d+(?:\.\d+)?)\s*second/i,
  /\bcharm(?:s|ed|ing)?\b[^.]{0,40}?(\d+(?:\.\d+)?)\s*second/i,
  /\bfear(?:s|ed|ing)?\b[^.]{0,40}?(\d+(?:\.\d+)?)\s*second/i,
  /\btaunt(?:s|ed|ing)?\b[^.]{0,40}?(\d+(?:\.\d+)?)\s*second/i,
  /\bsuppress(?:es?|ed|ing)\b[^.]{0,40}?(\d+(?:\.\d+)?)\s*second/i,
  /\bsleep(?:s|ed|ing)?\b[^.]{0,40}?(\d+(?:\.\d+)?)\s*second/i,
  /\bpolymorph(?:s|ed|ing)?\b[^.]{0,40}?(\d+(?:\.\d+)?)\s*second/i,
];

function maxCCFromText(text) {
  if (!text) return 0;
  let max = 0;
  for (const re of CC_PATTERNS) {
    const m = text.match(re);
    if (m) {
      const v = parseFloat(m[1]);
      if (!Number.isNaN(v)) max = Math.max(max, v);
    }
  }
  return max;
}

function extractCCFromAbility(ability) {
  if (!ability) return 0;
  let max = 0;
  // Effects array — each has description, sometimes leveling info.
  for (const eff of ability.effects ?? []) {
    max = Math.max(max, maxCCFromText(eff.description ?? ""));
  }
  // Sometimes the top-level description has it too.
  max = Math.max(max, maxCCFromText(ability.description ?? ""));
  max = Math.max(max, maxCCFromText(ability.blurb ?? ""));
  return max;
}

function parseUltCooldown(ability) {
  if (!ability) return 90;
  const cd = ability.cooldown?.modifiers?.[0]?.values;
  if (Array.isArray(cd) && typeof cd[0] === "number") return cd[0];
  return 90;
}

function parseCastTime(ability) {
  if (!ability) return 0;
  const ct = ability.castTime;
  if (typeof ct === "number") return ct;
  if (typeof ct === "string") {
    const v = parseFloat(ct);
    if (!Number.isNaN(v)) return v;
  }
  return 0;
}

function detectResets(allAbilitiesText) {
  const t = allAbilitiesText.toLowerCase();
  if (/reset(?:s)?\s+the\s+cooldown/.test(t)) return true;
  if (/can\s+(?:be\s+)?recast/.test(t)) return true;
  if (/refund(?:s)?\s+(?:the\s+)?cooldown/.test(t)) return true;
  if (/restores?\s+\w+\s+stack/.test(t)) return true;
  // Charge-based abilities (Akali R, Khazix R)
  return false;
}

function extractAbilityProfile(alias, data) {
  const abilities = data.abilities ?? {};
  const slots = ["P", "Q", "W", "E", "R"];
  // CC duration: take the maximum across the kit. A champion with a
  // 1.5s knockup AND a 0.5s slow gets credited 1.5 (the longest hard CC).
  let hardCCDuration = 0;
  for (const slot of slots) {
    const arr = abilities[slot] ?? [];
    for (const a of arr) {
      hardCCDuration = Math.max(hardCCDuration, extractCCFromAbility(a));
    }
  }
  // Cap to realistic values — anything > 4s is parsing noise.
  hardCCDuration = Math.min(hardCCDuration, 4);

  const ult = abilities.R?.[0];
  const ultCooldown = parseUltCooldown(ult);
  const ultCastTime = parseCastTime(ult);

  // Reset detection from full ability text.
  const allText = JSON.stringify(abilities);
  const hasResets = detectResets(allText);

  // Burst window heuristic: how long does this champion need to dump their
  // damage? Asesinos & cast-once abilities = short window. DoT mages, hyper-
  // carries = longer. Approximate from ult cast time + champion archetype
  // signals (we don't have direct burst data, so use cast time as a proxy).
  let burstWindowSeconds = 4; // default
  // Marksman role from Meraki
  const roles = (data.roles ?? []).map((r) => r.toLowerCase());
  if (roles.includes("marksman")) burstWindowSeconds = 8;
  if (roles.includes("assassin")) burstWindowSeconds = 2.5;
  if (roles.includes("mage") && !roles.includes("controller"))
    burstWindowSeconds = 3;

  return {
    alias,
    hardCCDuration: Number(hardCCDuration.toFixed(2)),
    ultCooldown,
    ultCastTime,
    hasResets,
    burstWindowSeconds,
  };
}

// ─── Item stats extraction ──────────────────────────────────────────────────

function flat(obj, key) {
  return obj?.[key]?.flat ?? 0;
}

function extractItemStats(item) {
  const s = item.stats ?? {};
  return {
    name: item.name,
    ad: flat(s, "attackDamage"),
    ap: flat(s, "abilityPower"),
    armor: flat(s, "armor"),
    mr: flat(s, "magicResistance"),
    hp: flat(s, "health"),
    mana: flat(s, "mana"),
    abilityHaste: flat(s, "abilityHaste"),
    attackSpeed: flat(s, "attackSpeed"),
    crit: flat(s, "criticalStrikeChance"),
    armorPen: flat(s, "armorPenetration"),
    magicPen: flat(s, "magicPenetration"),
    lifesteal: flat(s, "lifesteal"),
    omnivamp: flat(s, "omnivamp"),
    movespeed: flat(s, "movespeed"),
    cost: item.shop?.prices?.total ?? 0,
    // Tags help downstream code categorize (Mythic, Legendary, Boots, etc.)
    tags: item.shop?.tags ?? item.shop?.purchasable === false ? ["component"] : [],
    // Some items are anti-heal (Mortal Reminder, Bramble, Executioner's,
    // Chempunk Chainsword, Morellonomicon). Detect by passive description.
    isAntiHeal: /grievous\s+wounds|reduce.+healing/i.test(
      JSON.stringify(item.passives ?? {}) + (item.description ?? ""),
    ),
  };
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("→ Fetching champion index...");
  const champions = await fetchJSON(`${MERAKI}/champions.json`);
  const aliases = Object.keys(champions);
  console.log(`  ${aliases.length} champions`);

  const abilities = {};
  let parsed = 0;
  for (const alias of aliases) {
    try {
      const data = await fetchJSON(`${MERAKI}/champions/${alias}.json`);
      abilities[alias] = extractAbilityProfile(alias, data);
      parsed++;
      if (parsed % 30 === 0) {
        console.log(`  ${parsed}/${aliases.length} parsed`);
      }
    } catch (e) {
      console.warn(`  ! ${alias}: ${e.message}`);
    }
  }
  console.log(`  ${parsed} abilities profiled`);

  console.log("→ Fetching items...");
  const items = await fetchJSON(`${MERAKI}/items.json`);
  const itemsOut = {};
  for (const item of Object.values(items)) {
    if (!item.name) continue;
    itemsOut[item.name] = extractItemStats(item);
  }
  console.log(`  ${Object.keys(itemsOut).length} items extracted`);

  const dataDir = path.join(__dirname, "..", "lib", "data");
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(
    path.join(dataDir, "abilities.json"),
    JSON.stringify(abilities, null, 2),
  );
  await fs.writeFile(
    path.join(dataDir, "items.json"),
    JSON.stringify(itemsOut, null, 2),
  );
  console.log("✓ Written to lib/data/{abilities,items}.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
