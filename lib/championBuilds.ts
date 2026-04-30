// Champion item build profiles. Combines:
//   1. Item stats from Meraki (`data/items.json`, refreshed via npm script)
//   2. Curated archetype-based core builds (in this file — stable across
//      patches because archetypes change slowly)
//
// We don't have per-champion-per-role builds (Meraki doesn't publish them,
// and OPGG scraping is fragile). Instead, an archetype's typical build path
// is encoded here, and item stats accumulate per the spike timeline.
//
// This produces realistic-feeling stat curves: a marksman has 30 AD + boots
// at min 8, mythic+IE at min 18, full crit by min 32. A tank similarly
// progresses through Sunfire → Heartsteel → resists.

import itemsData from "./data/items.json";
import type { ChampionMeta } from "./championMeta";

export interface ItemStats {
  ad: number;
  ap: number;
  armor: number;
  mr: number;
  hp: number;
  abilityHaste: number;
  attackSpeed: number;
  crit: number;
  armorPen: number;
  magicPen: number;
  lifesteal: number;
  omnivamp: number;
  movespeed: number;
}

interface MerakiItem extends ItemStats {
  name: string;
  cost: number;
  isAntiHeal: boolean;
}

const ITEMS: Readonly<Record<string, MerakiItem>> =
  itemsData as Record<string, MerakiItem>;

const ZERO: ItemStats = {
  ad: 0,
  ap: 0,
  armor: 0,
  mr: 0,
  hp: 0,
  abilityHaste: 0,
  attackSpeed: 0,
  crit: 0,
  armorPen: 0,
  magicPen: 0,
  lifesteal: 0,
  omnivamp: 0,
  movespeed: 0,
};

function getItem(name: string): ItemStats {
  return ITEMS[name] ?? ZERO;
}

function sumItems(...names: string[]): ItemStats {
  const out: ItemStats = { ...ZERO };
  for (const n of names) {
    const it = getItem(n);
    for (const k of Object.keys(out) as (keyof ItemStats)[]) {
      out[k] += it[k];
    }
  }
  return out;
}

// ─── Curated build paths per archetype ─────────────────────────────────────
//
// Each entry is { atMinute → cumulative item names }. Picked to match what
// a typical mid-elo player buys in 2024-2025 LoL. Names match Meraki's
// item.name field exactly (e.g. "Berserker's Greaves" not "Berserker Greaves").
//
// Order: spike1 (boots) < spike2 (mythic/2nd item) < spike3 (3-item powerspike)
// < spike4 (4-item) < full (6-item plateau).

interface BuildSpike {
  minute: number;
  items: string[];
}

interface BuildPath {
  spikes: BuildSpike[];
}

// Use generic items that exist in Meraki's CDN. If a name isn't found,
// sumItems just contributes zeros — graceful degradation.
const BUILDS: Record<string, BuildPath> = {
  "hyper-carry": {
    spikes: [
      { minute: 8, items: ["Berserker's Greaves", "Doran's Blade"] },
      { minute: 14, items: ["Berserker's Greaves", "Kraken Slayer"] },
      { minute: 20, items: ["Berserker's Greaves", "Kraken Slayer", "Phantom Dancer"] },
      { minute: 26, items: ["Berserker's Greaves", "Kraken Slayer", "Phantom Dancer", "Infinity Edge"] },
      { minute: 32, items: ["Berserker's Greaves", "Kraken Slayer", "Phantom Dancer", "Infinity Edge", "Lord Dominik's Regards"] },
      { minute: 40, items: ["Berserker's Greaves", "Kraken Slayer", "Phantom Dancer", "Infinity Edge", "Lord Dominik's Regards", "Bloodthirster"] },
    ],
  },
  burst: {
    spikes: [
      { minute: 8, items: ["Sorcerer's Shoes"] },
      { minute: 14, items: ["Sorcerer's Shoes", "Luden's Companion"] },
      { minute: 20, items: ["Sorcerer's Shoes", "Luden's Companion", "Shadowflame"] },
      { minute: 26, items: ["Sorcerer's Shoes", "Luden's Companion", "Shadowflame", "Rabadon's Deathcap"] },
      { minute: 32, items: ["Sorcerer's Shoes", "Luden's Companion", "Shadowflame", "Rabadon's Deathcap", "Void Staff"] },
      { minute: 40, items: ["Sorcerer's Shoes", "Luden's Companion", "Shadowflame", "Rabadon's Deathcap", "Void Staff", "Banshee's Veil"] },
    ],
  },
  poke: {
    spikes: [
      { minute: 8, items: ["Sorcerer's Shoes"] },
      { minute: 14, items: ["Sorcerer's Shoes", "Liandry's Torment"] },
      { minute: 20, items: ["Sorcerer's Shoes", "Liandry's Torment", "Blackfire Torch"] },
      { minute: 26, items: ["Sorcerer's Shoes", "Liandry's Torment", "Blackfire Torch", "Rabadon's Deathcap"] },
      { minute: 32, items: ["Sorcerer's Shoes", "Liandry's Torment", "Blackfire Torch", "Rabadon's Deathcap", "Void Staff"] },
      { minute: 40, items: ["Sorcerer's Shoes", "Liandry's Torment", "Blackfire Torch", "Rabadon's Deathcap", "Void Staff", "Cryptbloom"] },
    ],
  },
  assassin: {
    spikes: [
      { minute: 8, items: ["Plated Steelcaps"] },
      { minute: 14, items: ["Plated Steelcaps", "Eclipse"] },
      { minute: 20, items: ["Plated Steelcaps", "Eclipse", "Profane Hydra"] },
      { minute: 26, items: ["Plated Steelcaps", "Eclipse", "Profane Hydra", "Edge of Night"] },
      { minute: 32, items: ["Plated Steelcaps", "Eclipse", "Profane Hydra", "Edge of Night", "Black Cleaver"] },
      { minute: 40, items: ["Plated Steelcaps", "Eclipse", "Profane Hydra", "Edge of Night", "Black Cleaver", "Guardian Angel"] },
    ],
  },
  tank: {
    spikes: [
      { minute: 8, items: ["Plated Steelcaps"] },
      { minute: 14, items: ["Plated Steelcaps", "Sunfire Aegis"] },
      { minute: 20, items: ["Plated Steelcaps", "Sunfire Aegis", "Heartsteel"] },
      { minute: 26, items: ["Plated Steelcaps", "Sunfire Aegis", "Heartsteel", "Thornmail"] },
      { minute: 32, items: ["Plated Steelcaps", "Sunfire Aegis", "Heartsteel", "Thornmail", "Force of Nature"] },
      { minute: 40, items: ["Plated Steelcaps", "Sunfire Aegis", "Heartsteel", "Thornmail", "Force of Nature", "Spirit Visage"] },
    ],
  },
  "skirmish": {
    spikes: [
      { minute: 8, items: ["Plated Steelcaps"] },
      { minute: 14, items: ["Plated Steelcaps", "Goredrinker"] },
      { minute: 20, items: ["Plated Steelcaps", "Goredrinker", "Black Cleaver"] },
      { minute: 26, items: ["Plated Steelcaps", "Goredrinker", "Black Cleaver", "Death's Dance"] },
      { minute: 32, items: ["Plated Steelcaps", "Goredrinker", "Black Cleaver", "Death's Dance", "Sterak's Gage"] },
      { minute: 40, items: ["Plated Steelcaps", "Goredrinker", "Black Cleaver", "Death's Dance", "Sterak's Gage", "Guardian Angel"] },
    ],
  },
  dive: {
    spikes: [
      { minute: 8, items: ["Plated Steelcaps"] },
      { minute: 14, items: ["Plated Steelcaps", "Trinity Force"] },
      { minute: 20, items: ["Plated Steelcaps", "Trinity Force", "Sterak's Gage"] },
      { minute: 26, items: ["Plated Steelcaps", "Trinity Force", "Sterak's Gage", "Black Cleaver"] },
      { minute: 32, items: ["Plated Steelcaps", "Trinity Force", "Sterak's Gage", "Black Cleaver", "Death's Dance"] },
      { minute: 40, items: ["Plated Steelcaps", "Trinity Force", "Sterak's Gage", "Black Cleaver", "Death's Dance", "Guardian Angel"] },
    ],
  },
  enchanter: {
    spikes: [
      { minute: 8, items: ["Mobility Boots", "World Atlas"] },
      { minute: 14, items: ["Mobility Boots", "World Atlas", "Moonstone Renewer"] },
      { minute: 20, items: ["Mobility Boots", "World Atlas", "Moonstone Renewer", "Ardent Censer"] },
      { minute: 26, items: ["Mobility Boots", "World Atlas", "Moonstone Renewer", "Ardent Censer", "Staff of Flowing Water"] },
      { minute: 32, items: ["Mobility Boots", "World Atlas", "Moonstone Renewer", "Ardent Censer", "Staff of Flowing Water", "Redemption"] },
      { minute: 40, items: ["Mobility Boots", "World Atlas", "Moonstone Renewer", "Ardent Censer", "Staff of Flowing Water", "Redemption", "Mikael's Blessing"] },
    ],
  },
  peel: {
    spikes: [
      { minute: 8, items: ["Mobility Boots", "World Atlas"] },
      { minute: 14, items: ["Mobility Boots", "World Atlas", "Locket of the Iron Solari"] },
      { minute: 20, items: ["Mobility Boots", "World Atlas", "Locket of the Iron Solari", "Knight's Vow"] },
      { minute: 26, items: ["Mobility Boots", "World Atlas", "Locket of the Iron Solari", "Knight's Vow", "Zeke's Convergence"] },
      { minute: 32, items: ["Mobility Boots", "World Atlas", "Locket of the Iron Solari", "Knight's Vow", "Zeke's Convergence", "Frozen Heart"] },
      { minute: 40, items: ["Mobility Boots", "World Atlas", "Locket of the Iron Solari", "Knight's Vow", "Zeke's Convergence", "Frozen Heart", "Force of Nature"] },
    ],
  },
};

// Map a champion's archetype list to a build path. Picks the first
// matching archetype in priority order (so a champ tagged both
// "hyper-carry" and "skirmish" gets the carry build).
const ARCHETYPE_PRIORITY = [
  "hyper-carry",
  "burst",
  "assassin",
  "poke",
  "dive",
  "skirmish",
  "tank",
  "enchanter",
  "peel",
] as const;

function buildPathFor(meta: ChampionMeta): BuildPath {
  for (const a of ARCHETYPE_PRIORITY) {
    if (meta.archetypes.includes(a)) return BUILDS[a];
  }
  // Default to skirmish if nothing matches.
  return BUILDS.skirmish;
}

// First-major-item completion spike. The "I'm online" moment after the
// boots+component opener. For most builds this lands ~minute 14 and is
// the spike that makes a carry threatening in fights — Kraken Slayer for
// marksmen, Luden's for burst mages, Eclipse for assassins.
//
// `keyItem` is the most distinctive non-boots item in the second spike,
// surfaced in the event description ("Caitlyn completes Kraken Slayer").
// `isCarrySpike` flags archetypes whose first-item completion meaningfully
// shifts fight outcomes — only those generate timeline events. Tank /
// enchanter / peel spikes are real but undramatic (event-log noise).
export interface KeyPowerSpike {
  minute: number;
  keyItem: string;
  isCarrySpike: boolean;
}

const CARRY_SPIKE_ARCHETYPES: ReadonlySet<string> = new Set([
  "hyper-carry",
  "burst",
  "assassin",
  "poke",
  "skirmish",
  "dive",
]);

const BOOTS_NAMES: ReadonlySet<string> = new Set([
  "Berserker's Greaves",
  "Sorcerer's Shoes",
  "Plated Steelcaps",
  "Mercury's Treads",
  "Mobility Boots",
  "Ionian Boots of Lucidity",
  "Boots",
]);

export function getKeyPowerSpike(meta: ChampionMeta): KeyPowerSpike {
  const path = buildPathFor(meta);
  // Use the second spike (post-boots, first big item). Fallback to the
  // first if a build only has one entry.
  const spike = path.spikes[1] ?? path.spikes[0];
  // Pick the first non-boots item — that's the mythic/core that defines
  // this spike. World Atlas is a support starter; skip it too.
  const keyItem =
    spike.items.find(
      (n) => !BOOTS_NAMES.has(n) && n !== "World Atlas" && n !== "Doran's Blade",
    ) ?? spike.items[spike.items.length - 1];
  const isCarrySpike = meta.archetypes.some((a) =>
    CARRY_SPIKE_ARCHETYPES.has(a),
  );
  return { minute: spike.minute, keyItem, isCarrySpike };
}

// Linear interpolation between spikes — items don't pop in instantly,
// but components are bought on the way. Returns cumulative stats for a
// given champion archetype at a given game time.
export function buildStatsAt(meta: ChampionMeta, gameTime: number): ItemStats {
  const path = buildPathFor(meta);
  const spikes = path.spikes;
  if (spikes.length === 0) return ZERO;
  if (gameTime <= spikes[0].minute) {
    // Before first spike: scale from zero up to the first item set.
    const t = Math.max(0, gameTime / spikes[0].minute);
    return scale(sumItems(...spikes[0].items), t);
  }
  // Find the bracket [prev, next] containing gameTime.
  for (let i = 0; i < spikes.length - 1; i++) {
    const prev = spikes[i];
    const next = spikes[i + 1];
    if (gameTime <= next.minute) {
      const prevStats = sumItems(...prev.items);
      const nextStats = sumItems(...next.items);
      const t = (gameTime - prev.minute) / (next.minute - prev.minute);
      return lerp(prevStats, nextStats, t);
    }
  }
  // Past full build.
  return sumItems(...spikes[spikes.length - 1].items);
}

function scale(s: ItemStats, k: number): ItemStats {
  const out = { ...ZERO };
  for (const key of Object.keys(s) as (keyof ItemStats)[]) {
    out[key] = s[key] * k;
  }
  return out;
}

function lerp(a: ItemStats, b: ItemStats, t: number): ItemStats {
  const out = { ...ZERO };
  for (const key of Object.keys(a) as (keyof ItemStats)[]) {
    out[key] = a[key] + (b[key] - a[key]) * t;
  }
  return out;
}
