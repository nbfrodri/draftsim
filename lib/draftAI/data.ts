// Curated data tables used across the draft AI. Pure data — no logic.
// Each table is keyed by champion alias (matching `Champion.alias` from
// CommunityDragon).

import type { Archetype, ChampionMeta } from "../championMeta";

// ─── Damage classification overrides ────────────────────────────────────────

// Champions whose Riot role tags would mis-classify them as AD when they
// actually build full AP (assassins/fighters that itemize ability power).
// Without this override, e.g., Akali (tagged "Assassin") gets counted as
// AD and trips the "too much AD" penalty even though she does magic damage.
export const AP_BUILDERS_OVERRIDE: ReadonlySet<string> = new Set([
  "Akali",
  "Ekko",
  "Fizz",
  "Mordekaiser",
  "Singed",
  "Teemo",
  // Tagged Assassin only but builds AP:
  "Evelynn", // also tagged Mage so fine, but listed for clarity
  // Tagged Fighter only but builds AP:
  "Rumble", // also tagged Mage so fine
]);

// Genuine hybrid damage champions — count for both AP and AD when computing
// damage profile. Their itemization or kit threatens both types meaningfully.
export const HYBRID_DAMAGE: ReadonlySet<string> = new Set([
  "Kayle",
  "Kennen",
]);

// Champions tagged Tank/Fighter that build pure tank items and contribute
// negligible damage of either type. Excluded from both AP and AD counts so
// they don't artificially balance an otherwise-lopsided comp.
export const NEITHER_DAMAGE: ReadonlySet<string> = new Set([
  "Sion",
  "Maokai",
  "Zac",
  "Ornn",
  "Rell",
]);

// ─── Hard counter table ─────────────────────────────────────────────────────

// Format: [counter, victim, bonus]. Picking `counter` against a drafted
// `victim` adds `bonus` to the lane matchup score; the reverse (picking
// `victim` into `counter`) deducts the same amount. ~70 well-known LoL
// matchups across all lanes. Curated, not exhaustive — a missing entry
// just falls back to the generic mobility/phase heuristic.
export const HARD_COUNTERS: ReadonlyArray<readonly [string, string, number]> = [
  // ─── Top lane ─────────────────────────────────────────────────────
  ["Malphite", "Yasuo", 6],
  ["Malphite", "Yone", 6],
  ["Malphite", "Tryndamere", 4],
  ["Pantheon", "Yone", 5],
  ["Pantheon", "Yasuo", 5],
  ["Pantheon", "Akali", 4],
  ["Pantheon", "Riven", 4],
  ["Renekton", "Aatrox", 4],
  ["Renekton", "Riven", 4],
  ["Renekton", "Camille", 3],
  ["Garen", "Darius", 3],
  ["Yorick", "Nasus", 5],
  ["Olaf", "MasterYi", 5],
  ["Olaf", "Nocturne", 4],
  ["Cassiopeia", "Akali", 3],
  ["Quinn", "Darius", 4],
  ["Quinn", "Sett", 3],
  ["Vayne", "Nasus", 4],
  ["Teemo", "Tryndamere", 4],
  ["Singed", "Tryndamere", 3],
  ["Kennen", "Renekton", 3],
  ["Gnar", "Renekton", 3],
  ["Jayce", "Aatrox", 3],
  ["Fiora", "Sett", 3],
  ["Shen", "Riven", 3],
  ["Camille", "Aatrox", 3],
  ["Mordekaiser", "Hecarim", 3],
  // Top — extended set
  ["Yorick", "Vladimir", 3],
  ["Mordekaiser", "Tryndamere", 4],
  ["Volibear", "Yasuo", 3],
  ["Heimerdinger", "Tryndamere", 4],
  ["MonkeyKing", "Vayne", 3],
  ["TahmKench", "Riven", 3],
  ["KSante", "Aatrox", 3],
  ["Gwen", "Riven", 3],
  ["Jax", "Riven", 3],
  ["Garen", "Mordekaiser", 3],
  ["Singed", "MasterYi", 4],
  ["Sion", "Akali", 3],
  ["Quinn", "Yone", 3],
  ["Vayne", "Tryndamere", 4],
  ["Sett", "Renekton", 3],
  ["Camille", "Quinn", 3],
  ["Pantheon", "Mordekaiser", 3],
  ["Renekton", "Yorick", 3],
  ["Maokai", "Akali", 3],
  ["Shen", "Akali", 3],
  ["Kennen", "Aatrox", 3],
  ["Ornn", "Riven", 3],

  // ─── Mid lane ─────────────────────────────────────────────────────
  ["Diana", "Yasuo", 3],
  ["Leblanc", "Karthus", 3],
  ["Talon", "Cassiopeia", 3],
  ["Annie", "Yasuo", 3],
  ["Galio", "Yasuo", 3],
  ["Anivia", "Yasuo", 4],
  ["Yasuo", "Lissandra", -3], // Lissandra R cancels Yasuo's flow
  ["Vladimir", "Talon", 3],
  ["Kassadin", "Xerath", 4],
  // (Fizz, Lux entry consolidated below in mid extended section.)
  ["Sylas", "Karma", 2],
  ["Annie", "Veigar", 3],
  // Mid — extended set
  ["Veigar", "Yasuo", 4],
  ["Lissandra", "Kassadin", 3],
  ["Anivia", "Yone", 3],
  ["Brand", "Karthus", 3],
  ["Cassiopeia", "Lux", 3],
  ["Syndra", "Akali", 3],
  ["Orianna", "Kassadin", 3],
  ["Chogath", "Yasuo", 3],
  ["Leblanc", "Akali", 3],
  ["Talon", "Leblanc", 3],
  ["Diana", "Akali", 3],
  ["Vladimir", "Akali", 3],
  ["Ekko", "Akali", 3],
  ["Karma", "Yone", 3],
  ["Zoe", "Yasuo", 3],
  ["Annie", "Zed", 3],
  ["Galio", "Akali", 3],
  ["Lissandra", "Talon", 3],
  ["Malzahar", "Yasuo", 3],
  // (Pantheon vs Yasuo dup removed — earlier entry at +5 is authoritative.)
  ["Xerath", "Yasuo", 3],
  ["Lux", "Akali", -2], // Lux struggles vs Akali shroud


  // ─── Jungle ───────────────────────────────────────────────────────
  ["Khazix", "Rengar", 3],
  ["Vi", "Leblanc", 3],
  ["Kindred", "MasterYi", 4],
  ["Ekko", "MasterYi", 3],
  ["LeeSin", "Yasuo", 2],
  // Jungle — extended set
  ["Rammus", "MasterYi", 5],
  ["Khazix", "Leblanc", 3],
  ["Fiddlesticks", "Kindred", 3],
  ["Hecarim", "Kindred", 3],
  ["Graves", "LeeSin", 3],
  ["Karthus", "MasterYi", 3],
  ["Olaf", "Karthus", 4],
  ["Vi", "Kassadin", 3],
  ["Diana", "Kayn", 3],
  ["Nocturne", "Caitlyn", 3],
  ["Shaco", "MasterYi", 2],
  ["JarvanIV", "Yasuo", 3],
  ["Skarner", "MasterYi", 4],
  ["Lillia", "Hecarim", 3],

  // ─── Bot ADC ──────────────────────────────────────────────────────
  ["Vayne", "Chogath", 5],
  ["Vayne", "Sion", 4],
  ["Caitlyn", "Draven", 3],
  ["Caitlyn", "Lucian", 3],
  ["Tristana", "Caitlyn", 2],
  ["Ezreal", "Draven", 3],
  ["MissFortune", "Twitch", 3],
  ["Jhin", "Vayne", 2],
  // Bot — extended set
  ["Caitlyn", "Sivir", 3],
  ["Lucian", "Vayne", 3],
  ["Caitlyn", "Twitch", 3],
  ["Sivir", "Vayne", 3],
  ["Tristana", "Vayne", 3],
  // (Smolder vs Draven entry removed — Draven actually counters Smolder
  // because Smolder needs to stack/scale; the negative entry below is the
  // authoritative one.)
  ["Caitlyn", "MissFortune", 2],
  ["Vayne", "Aphelios", 2],
  ["Draven", "Vayne", 2],

  // ─── Support ──────────────────────────────────────────────────────
  ["Pyke", "Senna", 3],
  ["Blitzcrank", "Yuumi", 5],
  ["Leona", "Yuumi", 4],
  ["Zyra", "Janna", 3],
  ["Morgana", "Blitzcrank", 4],
  ["Nautilus", "Yuumi", 4],
  // (Karma vs Brand entry removed — Karma actually struggles vs Brand
  // zone control; the negative entry below is the authoritative one.)
  ["Thresh", "Blitzcrank", 2],
  // Support — extended set
  ["Janna", "Pyke", 3],
  ["Lulu", "Pyke", 3],
  ["Karma", "Blitzcrank", 3],
  ["Bard", "Blitzcrank", 3],
  ["Janna", "Leona", 3],
  ["Lulu", "Leona", 3],
  ["Lux", "Pyke", 3],
  ["Soraka", "Brand", 3],
  ["Sona", "Brand", 3],
  ["Milio", "Pyke", 3],
  ["Renata", "Pyke", 3],
  ["Yuumi", "Brand", -3], // Yuumi has no escape from Brand zone control

  // ─── Top — additional set (~25 pairs) ─────────────────────────────
  // Tank-busters vs immobile bruisers
  ["Vayne", "Mordekaiser", 4], // Vayne %max-HP true damage shreds Morde HP pool
  ["Vayne", "Sett", 3],
  ["Vayne", "Garen", 4],
  ["Vayne", "Renekton", 3],
  ["Fiora", "Garen", 4], // Fiora R kills Garen on vital procs
  ["Fiora", "Mordekaiser", 4],
  ["Fiora", "Aatrox", 3],
  ["Fiora", "Darius", 3],
  // Range vs melee
  ["Quinn", "Renekton", 3],
  ["Quinn", "Garen", 4],
  ["Teemo", "Darius", 4], // Teemo kites Darius
  ["Teemo", "Sett", 3],
  ["Teemo", "Aatrox", 3],
  ["Kennen", "Darius", 3],
  // Sustain vs poke
  ["Aatrox", "Quinn", -3], // Aatrox can't catch Quinn
  ["Volibear", "Vayne", -2],
  // Bully matchups (early-game dominance)
  ["Riven", "Volibear", 3],
  ["Riven", "Garen", 3],
  ["Camille", "Sett", 3],
  ["Camille", "Mordekaiser", 4],
  ["Darius", "Riven", 3], // Darius wins extended trades
  ["Darius", "Yorick", 4],
  ["Aatrox", "Sett", 3],
  ["Trundle", "Sion", 3], // Trundle R steals Sion's HP
  ["Trundle", "DrMundo", 3],
  ["Olaf", "Mordekaiser", 4], // Olaf R immune to Morde R
  ["Olaf", "Vladimir", 3],
  ["Olaf", "Fiora", 3],
  ["Ambessa", "Sett", 3],
  ["Ambessa", "Riven", 3],
  ["KSante", "Darius", 3], // KSante wall + R out of all-in
  ["KSante", "Sett", 3],
  ["Tryndamere", "Sett", 3],
  ["Yorick", "Quinn", 3], // Yorick maiden + ghouls overwhelm Quinn
  // Zaahen — Darkin skirmisher; wins extended trades against burst/squishy
  // bruisers, loses to range and untargetable damage.
  ["Zaahen", "Riven", 3], // Zaahen out-sustains Riven's burst window
  ["Zaahen", "Akali", 3],
  ["Zaahen", "Aatrox", 3],
  ["Zaahen", "Mordekaiser", 3],
  ["Quinn", "Zaahen", 3], // Quinn kites the melee
  ["Vayne", "Zaahen", 3], // %max-HP true damage shreds Darkin sustain
  ["Teemo", "Zaahen", 3],
  ["Fiora", "Zaahen", 3], // Fiora's vital procs out-trade Darkin sustain

  // ─── Mid — additional set (~25 pairs) ─────────────────────────────
  // Burst vs immobile
  ["Zed", "Lux", 3],
  ["Zed", "Velkoz", 3],
  ["Zed", "Xerath", 4],
  ["Talon", "Anivia", 4],
  ["Talon", "Lux", 4], // Talon R from fog
  ["Talon", "Veigar", 3],
  ["Talon", "Velkoz", 3],
  ["Akali", "Veigar", 3], // Akali shroud dodges cage
  ["Akali", "Velkoz", 3],
  ["Akali", "Xerath", 3],
  ["Akali", "Karthus", 3],
  ["Leblanc", "Lux", 4],
  ["Leblanc", "Velkoz", 3],
  ["Leblanc", "Xerath", 3],
  ["Fizz", "Lux", 3],
  ["Fizz", "Veigar", 3],
  ["Fizz", "Anivia", 3],
  ["Fizz", "Velkoz", 3],
  ["Fizz", "Xerath", 3],
  ["Diana", "Lux", 3],
  // Anti-mobility / point-click
  // (Pantheon vs Akali dup removed — earlier entry at L58 is authoritative.)
  ["Pantheon", "Zed", 3],
  ["Pantheon", "Fizz", 3],
  ["Annie", "Akali", 3],
  ["Lissandra", "Akali", 3], // R stops her from leaving
  ["Lissandra", "Zed", 3],
  ["Lissandra", "Fizz", 3],
  ["Anivia", "Zed", -2], // Anivia can wall, but loses to clean Zed combos
  ["Galio", "Zed", 3],
  ["Galio", "Leblanc", 3],
  // Scaling matchups
  ["Kassadin", "Veigar", 3], // Kass scales out of veigar's lane
  ["Kassadin", "Zed", -3], // Pre-6 Zed bullies Kassadin
  ["Aurora", "Yasuo", 3],
  ["Aurora", "Yone", 3],
  ["Hwei", "Akali", 3],
  ["Naafiri", "Lux", 3],
  ["Naafiri", "Veigar", 3],
  ["Sylas", "Veigar", 3],
  ["Sylas", "Lux", 3], // Sylas R steals Lux R
  ["Twisted Fate", "Akali", 2],

  // ─── Jungle — additional set (~15 pairs) ──────────────────────────
  // Anti-stealth / anti-mobility
  ["Lillia", "Khazix", 3],
  ["Vi", "Khazix", 3], // Vi R cancels Khazix isolation
  ["Vi", "Rengar", 3],
  ["Pantheon", "Khazix", 4], // Stun cancels jump
  ["Skarner", "Khazix", 3],
  // Anti-tank
  ["Olaf", "Sejuani", 3],
  ["Olaf", "Maokai", 3],
  ["Olaf", "Zac", 3], // Olaf R immune to Zac CC
  ["Vi", "Sejuani", 2],
  ["Briar", "Sejuani", 3],
  ["Briar", "Karthus", 3], // Briar runs down Karthus
  // Anti-scaling JG
  ["Hecarim", "Karthus", 3], // Hecarim ganks pre-6 Karthus
  ["Hecarim", "MasterYi", 3],
  ["Nocturne", "Karthus", 3], // Nocturne R catches farming Karthus
  ["Nocturne", "Kindred", 3],
  ["Diana", "MasterYi", 4], // Diana R AOE pulls in Yi
  ["JarvanIV", "MasterYi", 4], // JIV R cage on Yi
  ["JarvanIV", "Khazix", 3],
  ["Sejuani", "Khazix", 3],
  ["Sejuani", "MasterYi", 3],
  ["Maokai", "Khazix", 3],

  // ─── Bot — additional set (~15 pairs) ─────────────────────────────
  // Range bullies
  ["Caitlyn", "Kalista", 3],
  ["Caitlyn", "Smolder", 3],
  ["Caitlyn", "KogMaw", 3],
  ["Draven", "KogMaw", 4], // Draven runs down KogMaw early
  ["Draven", "Aphelios", 3],
  ["Draven", "Jinx", 3],
  ["Draven", "Sivir", 3],
  ["Draven", "Senna", -2], // Senna scales past Draven
  // Late-game scaling
  ["Smolder", "Draven", -3], // Smolder needs to scale; Draven kills him
  ["Vayne", "Caitlyn", -2], // Caitlyn out-ranges Vayne
  ["Senna", "Caitlyn", 2], // Senna scales infinitely
  // Hyper-carries vs squishy
  ["Smolder", "Aphelios", 1],

  // ─── Support — additional set (~12 pairs) ─────────────────────────
  // Anti-engage
  ["Janna", "Alistar", 3],
  ["Janna", "Nautilus", 3],
  ["Janna", "Rakan", 3],
  ["Lulu", "Alistar", 3],
  ["Soraka", "Pyke", 4], // Soraka heals through Pyke execute threshold
  ["Soraka", "Lux", 3],
  ["Milio", "Leona", 3],
  ["Milio", "Nautilus", 3],
  ["Milio", "Blitzcrank", 3],
  // Hook duels
  ["Thresh", "Pyke", 2],
  ["Nautilus", "Thresh", 2],
  // Mage matchups
  ["Lux", "Brand", -2], // Lux out-ranges Brand
  ["Zyra", "Lux", -1],
  ["Karma", "Brand", -1], // Karma shield blocks one Brand spell
  ["Senna", "Lux", 2], // Senna scaling
  ["Senna", "Brand", 2],
  // Roam-heavy supports
  ["Bard", "Pyke", 2],
  ["Pyke", "Yuumi", 5], // Pyke executes Yuumi solo
  ["Rakan", "Yuumi", 3],
  ["Alistar", "Yuumi", 4],
  // ─── Bulk balance additions ───────────────────────────────────────────
  // Auto-generated to bring every champion to >= 5 counter relations.
  // Generated via curated rules (anti-mobility CC vs assassins, range vs
  // immobile melee, sustain vs burst, tank-busters vs HP walls, etc.).
  ["Pantheon", "Talon", 3], // Point-click stops dash
  ["Pantheon", "Diana", 3], // Point-click stops dash
  ["Pantheon", "Naafiri", 3], // Point-click stops dash
  ["Pantheon", "Kassadin", 3], // Point-click stops dash
  ["Pantheon", "Rengar", 3], // Point-click stops dash
  ["Pantheon", "Evelynn", 3], // Point-click stops dash
  ["Pantheon", "Ekko", 3], // Point-click stops dash
  ["Pantheon", "Sylas", 3], // Point-click stops dash
  ["Pantheon", "Qiyana", 3], // Point-click stops dash
  ["Pantheon", "Katarina", 3], // Point-click stops dash
  ["Pantheon", "Viego", 3], // Point-click stops dash
  ["Annie", "Talon", 3], // Point-click stops dash
  ["Annie", "Fizz", 3], // Point-click stops dash
  ["Annie", "Diana", 3], // Point-click stops dash
  ["Annie", "Naafiri", 3], // Point-click stops dash
  ["Annie", "Kassadin", 3], // Point-click stops dash
  ["Annie", "Ekko", 3], // Point-click stops dash
  ["Annie", "Sylas", 3], // Point-click stops dash
  ["Annie", "Qiyana", 3], // Point-click stops dash
  ["Annie", "Katarina", 3], // Point-click stops dash
  ["Annie", "Yone", 3], // Point-click stops dash
  ["Lissandra", "Diana", 3], // Point-click stops dash
  ["Lissandra", "Naafiri", 3], // Point-click stops dash
  ["Lissandra", "Ekko", 3], // Point-click stops dash
  ["Lissandra", "Sylas", 3], // Point-click stops dash
  ["Lissandra", "Qiyana", 3], // Point-click stops dash
  ["Lissandra", "Katarina", 3], // Point-click stops dash
  ["Lissandra", "Yone", 3], // Point-click stops dash
  ["Galio", "Talon", 3], // Point-click stops dash
  ["Galio", "Fizz", 3], // Point-click stops dash
  ["Galio", "Diana", 3], // Point-click stops dash
  ["Galio", "Naafiri", 3], // Point-click stops dash
  ["Galio", "Kassadin", 3], // Point-click stops dash
  ["Galio", "Ekko", 3], // Point-click stops dash
  ["Galio", "Sylas", 3], // Point-click stops dash
  ["Galio", "Qiyana", 3], // Point-click stops dash
  ["Galio", "Katarina", 3], // Point-click stops dash
  ["Galio", "Yone", 3], // Point-click stops dash
  ["Malzahar", "Akali", 3], // Point-click stops dash
  ["Malzahar", "Zed", 3], // Point-click stops dash
  ["Malzahar", "Talon", 3], // Point-click stops dash
  ["Malzahar", "Fizz", 3], // Point-click stops dash
  ["Malzahar", "Diana", 3], // Point-click stops dash
  ["Malzahar", "Naafiri", 3], // Point-click stops dash
  ["Malzahar", "Kassadin", 3], // Point-click stops dash
  ["Malzahar", "Ekko", 3], // Point-click stops dash
  ["Malzahar", "Sylas", 3], // Point-click stops dash
  ["Malzahar", "Qiyana", 3], // Point-click stops dash
  ["Malzahar", "Katarina", 3], // Point-click stops dash
  ["Malzahar", "Yone", 3], // Point-click stops dash
  ["Veigar", "Zed", 3], // Point-click stops dash
  ["Veigar", "Diana", 3], // Point-click stops dash
  ["Veigar", "Ekko", 3], // Point-click stops dash
  ["Veigar", "Qiyana", 3], // Point-click stops dash
  ["Veigar", "Katarina", 3], // Point-click stops dash
  ["Veigar", "Yone", 3], // Point-click stops dash
  ["Cassiopeia", "Zed", 3], // Point-click stops dash
  ["Cassiopeia", "Fizz", 3], // Point-click stops dash
  ["Cassiopeia", "Diana", 3], // Point-click stops dash
  ["Cassiopeia", "Naafiri", 3], // Point-click stops dash
  ["Cassiopeia", "Kassadin", 3], // Point-click stops dash
  ["Cassiopeia", "Rengar", 3], // Point-click stops dash
  ["Cassiopeia", "Ekko", 3], // Point-click stops dash
  ["Cassiopeia", "Sylas", 3], // Point-click stops dash
  ["Cassiopeia", "Qiyana", 3], // Point-click stops dash
  ["Cassiopeia", "Katarina", 3], // Point-click stops dash
  ["Cassiopeia", "Yone", 3], // Point-click stops dash
  ["Quinn", "Mordekaiser", 3], // Range kites melee
  ["Quinn", "Sion", 3], // Range kites melee
  ["Quinn", "Volibear", 3], // Range kites melee
  ["Quinn", "Tryndamere", 3], // Range kites melee
  ["Quinn", "Olaf", 3], // Range kites melee
  ["Quinn", "Ornn", 3], // Range kites melee
  ["Quinn", "Chogath", 3], // Range kites melee
  ["Quinn", "Nasus", 3], // Range kites melee
  ["Quinn", "DrMundo", 3], // Range kites melee
  ["Teemo", "Garen", 3], // Range kites melee
  ["Teemo", "Mordekaiser", 3], // Range kites melee
  ["Teemo", "Sion", 3], // Range kites melee
  ["Teemo", "Volibear", 3], // Range kites melee
  ["Teemo", "Olaf", 3], // Range kites melee
  ["Teemo", "Ornn", 3], // Range kites melee
  ["Teemo", "Chogath", 3], // Range kites melee
  ["Teemo", "Nasus", 3], // Range kites melee
  ["Teemo", "DrMundo", 3], // Range kites melee
  ["Teemo", "Renekton", 3], // Range kites melee
  ["Heimerdinger", "Garen", 3], // Range kites melee
  ["Heimerdinger", "Mordekaiser", 3], // Range kites melee
  ["Heimerdinger", "Sion", 3], // Range kites melee
  ["Heimerdinger", "Volibear", 3], // Range kites melee
  ["Heimerdinger", "Olaf", 3], // Range kites melee
  ["Heimerdinger", "Sett", 3], // Range kites melee
  ["Heimerdinger", "Ornn", 3], // Range kites melee
  ["Heimerdinger", "Chogath", 3], // Range kites melee
  ["Heimerdinger", "Nasus", 3], // Range kites melee
  ["Heimerdinger", "DrMundo", 3], // Range kites melee
  ["Heimerdinger", "Aatrox", 3], // Range kites melee
  ["Heimerdinger", "Renekton", 3], // Range kites melee
  ["Heimerdinger", "Darius", 3], // Range kites melee
  ["Kennen", "Garen", 3], // Range kites melee
  ["Kennen", "Mordekaiser", 3], // Range kites melee
  ["Kennen", "Sion", 3], // Range kites melee
  ["Kennen", "Volibear", 3], // Range kites melee
  ["Kennen", "Tryndamere", 3], // Range kites melee
  ["Kennen", "Olaf", 3], // Range kites melee
  ["Kennen", "Sett", 3], // Range kites melee
  ["Kennen", "Ornn", 3], // Range kites melee
  ["Kennen", "Chogath", 3], // Range kites melee
  ["Kennen", "Nasus", 3], // Range kites melee
  ["Kennen", "DrMundo", 3], // Range kites melee
  ["Gnar", "Garen", 3], // Range kites melee
  ["Gnar", "Mordekaiser", 3], // Range kites melee
  ["Gnar", "Sion", 3], // Range kites melee
  ["Gnar", "Volibear", 3], // Range kites melee
  ["Gnar", "Tryndamere", 3], // Range kites melee
  ["Gnar", "Olaf", 3], // Range kites melee
  ["Gnar", "Sett", 3], // Range kites melee
  ["Gnar", "Ornn", 3], // Range kites melee
  ["Gnar", "Chogath", 3], // Range kites melee
  ["Gnar", "Nasus", 3], // Range kites melee
  ["Gnar", "DrMundo", 3], // Range kites melee
  ["Gnar", "Aatrox", 3], // Range kites melee
  ["Gnar", "Darius", 3], // Range kites melee
  ["Jayce", "Garen", 3], // Range kites melee
  ["Jayce", "Mordekaiser", 3], // Range kites melee
  ["Jayce", "Sion", 3], // Range kites melee
  ["Jayce", "Volibear", 3], // Range kites melee
  ["Jayce", "Tryndamere", 3], // Range kites melee
  ["Jayce", "Olaf", 3], // Range kites melee
  ["Jayce", "Sett", 3], // Range kites melee
  ["Jayce", "Ornn", 3], // Range kites melee
  ["Jayce", "Chogath", 3], // Range kites melee
  ["Jayce", "Nasus", 3], // Range kites melee
  ["Jayce", "DrMundo", 3], // Range kites melee
  ["Jayce", "Renekton", 3], // Range kites melee
  ["Jayce", "Darius", 3], // Range kites melee
  ["Vayne", "Olaf", 3], // Range kites melee
  ["Vayne", "Ornn", 3], // Range kites melee
  ["Vayne", "DrMundo", 3], // Range kites melee
  ["Vayne", "Aatrox", 3], // Range kites melee
  ["Vayne", "Darius", 3], // Range kites melee
  ["Aatrox", "Akali", 2], // Sustain out-trades burst
  ["Aatrox", "Riven", 2], // Sustain out-trades burst
  ["Aatrox", "Pantheon", 2], // Sustain out-trades burst
  ["Vladimir", "Riven", 2], // Sustain out-trades burst
  ["Vladimir", "Camille", 2], // Sustain out-trades burst
  ["Vladimir", "Pantheon", 2], // Sustain out-trades burst
  ["Vladimir", "Kennen", 2], // Sustain out-trades burst
  ["Vladimir", "Jayce", 2], // Sustain out-trades burst
  ["Trundle", "Akali", 2], // Sustain out-trades burst
  ["Trundle", "Riven", 2], // Sustain out-trades burst
  ["Trundle", "Camille", 2], // Sustain out-trades burst
  ["Trundle", "Pantheon", 2], // Sustain out-trades burst
  ["Trundle", "Kennen", 2], // Sustain out-trades burst
  ["Trundle", "Jayce", 2], // Sustain out-trades burst
  ["Volibear", "Akali", 2], // Sustain out-trades burst
  ["Volibear", "Camille", 2], // Sustain out-trades burst
  ["Volibear", "Pantheon", 2], // Sustain out-trades burst
  ["DrMundo", "Akali", 2], // Sustain out-trades burst
  ["DrMundo", "Riven", 2], // Sustain out-trades burst
  ["DrMundo", "Camille", 2], // Sustain out-trades burst
  ["DrMundo", "Pantheon", 2], // Sustain out-trades burst
  ["Garen", "Akali", 2], // Sustain out-trades burst
  ["Garen", "Camille", 2], // Sustain out-trades burst
  ["Garen", "Pantheon", 2], // Sustain out-trades burst
  ["Yorick", "Akali", 2], // Sustain out-trades burst
  ["Yorick", "Riven", 2], // Sustain out-trades burst
  ["Yorick", "Camille", 2], // Sustain out-trades burst
  ["Yorick", "Pantheon", 2], // Sustain out-trades burst
  ["Yorick", "Kennen", 2], // Sustain out-trades burst
  ["Yorick", "Jayce", 2], // Sustain out-trades burst
  ["Sett", "Akali", 2], // Sustain out-trades burst
  ["Sett", "Riven", 2], // Sustain out-trades burst
  ["Sett", "Pantheon", 2], // Sustain out-trades burst
  ["Nasus", "Akali", 2], // Sustain out-trades burst
  ["Nasus", "Riven", 2], // Sustain out-trades burst
  ["Nasus", "Camille", 2], // Sustain out-trades burst
  ["Nasus", "Pantheon", 2], // Sustain out-trades burst
  ["Olaf", "Akali", 2], // Sustain out-trades burst
  ["Olaf", "Riven", 2], // Sustain out-trades burst
  ["Olaf", "Camille", 2], // Sustain out-trades burst
  ["Olaf", "Pantheon", 2], // Sustain out-trades burst
  ["Mordekaiser", "Akali", 2], // Sustain out-trades burst
  ["Mordekaiser", "Riven", 2], // Sustain out-trades burst
  ["Vayne", "Maokai", 3], // Tank-buster vs HP wall
  ["Vayne", "TahmKench", 3], // Tank-buster vs HP wall
  ["Fiora", "Sion", 3], // Tank-buster vs HP wall
  ["Fiora", "DrMundo", 3], // Tank-buster vs HP wall
  ["Fiora", "Chogath", 3], // Tank-buster vs HP wall
  ["Fiora", "Ornn", 3], // Tank-buster vs HP wall
  ["Fiora", "Nasus", 3], // Tank-buster vs HP wall
  ["Fiora", "Maokai", 3], // Tank-buster vs HP wall
  ["Fiora", "TahmKench", 3], // Tank-buster vs HP wall
  ["Fiora", "Volibear", 3], // Tank-buster vs HP wall
  ["Twitch", "Chogath", 3], // Tank-buster vs HP wall
  ["Twitch", "Maokai", 3], // Tank-buster vs HP wall
  ["Twitch", "Mordekaiser", 3], // Tank-buster vs HP wall
  ["Twitch", "Volibear", 3], // Tank-buster vs HP wall
  ["Belveth", "Chogath", 3], // Tank-buster vs HP wall
  ["Belveth", "Maokai", 3], // Tank-buster vs HP wall
  ["Belveth", "Mordekaiser", 3], // Tank-buster vs HP wall
  ["Belveth", "Volibear", 3], // Tank-buster vs HP wall
  ["Draven", "Yunara", 2], // Early bully runs down scaler
  ["Lucian", "Smolder", 2], // Early bully runs down scaler
  ["Lucian", "KogMaw", 2], // Early bully runs down scaler
  ["Lucian", "Senna", 2], // Early bully runs down scaler
  ["Lucian", "Kayle", 2], // Early bully runs down scaler
  ["Lucian", "Vladimir", 2], // Early bully runs down scaler
  ["Lucian", "Yunara", 2], // Early bully runs down scaler
  ["Lucian", "AurelionSol", 2], // Early bully runs down scaler
  ["Lucian", "Veigar", 2], // Early bully runs down scaler
  ["Pantheon", "Senna", 2], // Early bully runs down scaler
  ["Pantheon", "Vayne", 2], // Early bully runs down scaler
  ["Pantheon", "Kayle", 2], // Early bully runs down scaler
  ["Pantheon", "AurelionSol", 2], // Early bully runs down scaler
  ["Pantheon", "Veigar", 2], // Early bully runs down scaler
  ["Renekton", "Kayle", 2], // Early bully runs down scaler
  ["Renekton", "Vladimir", 2], // Early bully runs down scaler
  ["Renekton", "Nasus", 2], // Early bully runs down scaler
  ["Tristana", "Smolder", 2], // Early bully runs down scaler
  ["Tristana", "KogMaw", 2], // Early bully runs down scaler
  ["Tristana", "Senna", 2], // Early bully runs down scaler
  ["Tristana", "Kayle", 2], // Early bully runs down scaler
  ["Tristana", "Vladimir", 2], // Early bully runs down scaler
  ["Tristana", "Yunara", 2], // Early bully runs down scaler
  ["Tristana", "AurelionSol", 2], // Early bully runs down scaler
  ["Tristana", "Veigar", 2], // Early bully runs down scaler
  ["Malphite", "Xerath", 2], // Engage closes poke gap
  ["Malphite", "Velkoz", 2], // Engage closes poke gap
  ["Malphite", "Heimerdinger", 2], // Engage closes poke gap
  ["Malphite", "Lux", 2], // Engage closes poke gap
  ["Malphite", "Veigar", 2], // Engage closes poke gap
  ["Amumu", "Xerath", 2], // Engage closes poke gap
  ["Amumu", "Velkoz", 2], // Engage closes poke gap
  ["Amumu", "Heimerdinger", 2], // Engage closes poke gap
  ["Amumu", "Lux", 2], // Engage closes poke gap
  ["Amumu", "Veigar", 2], // Engage closes poke gap
  ["Diana", "Xerath", 2], // Engage closes poke gap
  ["Diana", "Velkoz", 2], // Engage closes poke gap
  ["Diana", "Heimerdinger", 2], // Engage closes poke gap
  ["Diana", "Ziggs", 2], // Engage closes poke gap
  ["Diana", "Corki", 2], // Engage closes poke gap
  ["Pantheon", "Xerath", 2], // Engage closes poke gap
  ["Pantheon", "Velkoz", 2], // Engage closes poke gap
  ["Pantheon", "Heimerdinger", 2], // Engage closes poke gap
  ["Pantheon", "Lux", 2], // Engage closes poke gap
  ["Pantheon", "Ziggs", 2], // Engage closes poke gap
  ["Pantheon", "Corki", 2], // Engage closes poke gap
  ["Galio", "Xerath", 2], // Engage closes poke gap
  ["Galio", "Velkoz", 2], // Engage closes poke gap
  ["Galio", "Heimerdinger", 2], // Engage closes poke gap
  ["Galio", "Lux", 2], // Engage closes poke gap
  ["Galio", "Ziggs", 2], // Engage closes poke gap
  ["Galio", "Corki", 2], // Engage closes poke gap
  ["Galio", "Veigar", 2], // Engage closes poke gap
  ["Lillia", "Heimerdinger", 2], // Engage closes poke gap
  ["Nocturne", "Xerath", 2], // Engage closes poke gap
  ["Nocturne", "Velkoz", 2], // Engage closes poke gap
  ["Nocturne", "Heimerdinger", 2], // Engage closes poke gap
  ["Nocturne", "Lux", 2], // Engage closes poke gap
  ["Nocturne", "Ziggs", 2], // Engage closes poke gap
  ["Nocturne", "Corki", 2], // Engage closes poke gap
  ["Nocturne", "Veigar", 2], // Engage closes poke gap

  // ─── Bulk balance additions (pass 2) ──────────────────────────────────
  ["Blitzcrank", "Soraka", 2], // Hook catches immobile sup
  ["Blitzcrank", "Janna", 2], // Hook catches immobile sup
  ["Blitzcrank", "Sona", 2], // Hook catches immobile sup
  ["Blitzcrank", "Nami", 2], // Hook catches immobile sup
  ["Blitzcrank", "Lulu", 2], // Hook catches immobile sup
  ["Blitzcrank", "Seraphine", 2], // Hook catches immobile sup
  ["Blitzcrank", "Renata", 2], // Hook catches immobile sup
  ["Pyke", "Sona", 2], // Hook catches immobile sup
  ["Pyke", "Nami", 2], // Hook catches immobile sup
  ["Pyke", "Karma", 2], // Hook catches immobile sup
  ["Pyke", "Seraphine", 2], // Hook catches immobile sup
  ["Thresh", "Soraka", 2], // Hook catches immobile sup
  ["Thresh", "Yuumi", 2], // Hook catches immobile sup
  ["Thresh", "Janna", 2], // Hook catches immobile sup
  ["Thresh", "Sona", 2], // Hook catches immobile sup
  ["Thresh", "Nami", 2], // Hook catches immobile sup
  ["Thresh", "Karma", 2], // Hook catches immobile sup
  ["Thresh", "Milio", 2], // Hook catches immobile sup
  ["Thresh", "Lulu", 2], // Hook catches immobile sup
  ["Thresh", "Seraphine", 2], // Hook catches immobile sup
  ["Thresh", "Renata", 2], // Hook catches immobile sup
  ["Nautilus", "Soraka", 2], // Hook catches immobile sup
  ["Nautilus", "Sona", 2], // Hook catches immobile sup
  ["Nautilus", "Nami", 2], // Hook catches immobile sup
  ["Nautilus", "Karma", 2], // Hook catches immobile sup
  ["Nautilus", "Lulu", 2], // Hook catches immobile sup
  ["Nautilus", "Seraphine", 2], // Hook catches immobile sup
  ["Nautilus", "Renata", 2], // Hook catches immobile sup
  ["Morgana", "Soraka", 2], // Hook catches immobile sup
  ["Morgana", "Yuumi", 2], // Hook catches immobile sup
  ["Morgana", "Janna", 2], // Hook catches immobile sup
  ["Morgana", "Sona", 2], // Hook catches immobile sup
  ["Morgana", "Nami", 2], // Hook catches immobile sup
  ["Morgana", "Karma", 2], // Hook catches immobile sup
  ["Morgana", "Milio", 2], // Hook catches immobile sup
  ["Morgana", "Lulu", 2], // Hook catches immobile sup
  ["Morgana", "Seraphine", 2], // Hook catches immobile sup
  ["Morgana", "Renata", 2], // Hook catches immobile sup
  ["Leona", "Soraka", 2], // Tank engage breaks enchanter peel
  ["Leona", "Sona", 2], // Tank engage breaks enchanter peel
  ["Leona", "Nami", 2], // Tank engage breaks enchanter peel
  ["Leona", "Karma", 2], // Tank engage breaks enchanter peel
  ["Leona", "Seraphine", 2], // Tank engage breaks enchanter peel
  ["Alistar", "Soraka", 2], // Tank engage breaks enchanter peel
  ["Alistar", "Sona", 2], // Tank engage breaks enchanter peel
  ["Alistar", "Nami", 2], // Tank engage breaks enchanter peel
  ["Alistar", "Karma", 2], // Tank engage breaks enchanter peel
  ["Alistar", "Milio", 2], // Tank engage breaks enchanter peel
  ["Alistar", "Seraphine", 2], // Tank engage breaks enchanter peel
  ["Rell", "Soraka", 2], // Tank engage breaks enchanter peel
  ["Rell", "Yuumi", 2], // Tank engage breaks enchanter peel
  ["Rell", "Janna", 2], // Tank engage breaks enchanter peel
  ["Rell", "Sona", 2], // Tank engage breaks enchanter peel
  ["Rell", "Nami", 2], // Tank engage breaks enchanter peel
  ["Rell", "Karma", 2], // Tank engage breaks enchanter peel
  ["Rell", "Milio", 2], // Tank engage breaks enchanter peel
  ["Rell", "Lulu", 2], // Tank engage breaks enchanter peel
  ["Rell", "Seraphine", 2], // Tank engage breaks enchanter peel
  ["Braum", "Soraka", 2], // Tank engage breaks enchanter peel
  ["Braum", "Yuumi", 2], // Tank engage breaks enchanter peel
  ["Braum", "Janna", 2], // Tank engage breaks enchanter peel
  ["Braum", "Sona", 2], // Tank engage breaks enchanter peel
  ["Braum", "Nami", 2], // Tank engage breaks enchanter peel
  ["Braum", "Karma", 2], // Tank engage breaks enchanter peel
  ["Braum", "Milio", 2], // Tank engage breaks enchanter peel
  ["Braum", "Lulu", 2], // Tank engage breaks enchanter peel
  ["Braum", "Seraphine", 2], // Tank engage breaks enchanter peel
  ["TahmKench", "Soraka", 2], // Tank engage breaks enchanter peel
  ["TahmKench", "Yuumi", 2], // Tank engage breaks enchanter peel
  ["TahmKench", "Janna", 2], // Tank engage breaks enchanter peel
  ["TahmKench", "Sona", 2], // Tank engage breaks enchanter peel
  ["TahmKench", "Nami", 2], // Tank engage breaks enchanter peel
  ["TahmKench", "Karma", 2], // Tank engage breaks enchanter peel
  ["TahmKench", "Milio", 2], // Tank engage breaks enchanter peel
  ["TahmKench", "Lulu", 2], // Tank engage breaks enchanter peel
  ["TahmKench", "Seraphine", 2], // Tank engage breaks enchanter peel
  ["Bard", "Soraka", 2], // Tank engage breaks enchanter peel
  ["Bard", "Yuumi", 2], // Tank engage breaks enchanter peel
  ["Bard", "Janna", 2], // Tank engage breaks enchanter peel
  ["Bard", "Sona", 2], // Tank engage breaks enchanter peel
  ["Bard", "Nami", 2], // Tank engage breaks enchanter peel
  ["Bard", "Karma", 2], // Tank engage breaks enchanter peel
  ["Bard", "Milio", 2], // Tank engage breaks enchanter peel
  ["Bard", "Lulu", 2], // Tank engage breaks enchanter peel
  ["Bard", "Seraphine", 2], // Tank engage breaks enchanter peel
  ["Brand", "Janna", 2], // Burst sup out-trades peel sup
  ["Brand", "Nami", 2], // Burst sup out-trades peel sup
  ["Brand", "Lulu", 2], // Burst sup out-trades peel sup
  ["Brand", "Milio", 2], // Burst sup out-trades peel sup
  ["Brand", "Renata", 2], // Burst sup out-trades peel sup
  ["Brand", "Seraphine", 2], // Burst sup out-trades peel sup
  ["Zyra", "Soraka", 2], // Burst sup out-trades peel sup
  ["Zyra", "Yuumi", 2], // Burst sup out-trades peel sup
  ["Zyra", "Sona", 2], // Burst sup out-trades peel sup
  ["Zyra", "Nami", 2], // Burst sup out-trades peel sup
  ["Zyra", "Lulu", 2], // Burst sup out-trades peel sup
  ["Zyra", "Milio", 2], // Burst sup out-trades peel sup
  ["Zyra", "Karma", 2], // Burst sup out-trades peel sup
  ["Zyra", "Renata", 2], // Burst sup out-trades peel sup
  ["Zyra", "Seraphine", 2], // Burst sup out-trades peel sup
  ["Velkoz", "Janna", 2], // Burst sup out-trades peel sup
  ["Velkoz", "Soraka", 2], // Burst sup out-trades peel sup
  ["Velkoz", "Yuumi", 2], // Burst sup out-trades peel sup
  ["Velkoz", "Sona", 2], // Burst sup out-trades peel sup
  ["Velkoz", "Nami", 2], // Burst sup out-trades peel sup
  ["Velkoz", "Lulu", 2], // Burst sup out-trades peel sup
  ["Velkoz", "Milio", 2], // Burst sup out-trades peel sup
  ["Velkoz", "Karma", 2], // Burst sup out-trades peel sup
  ["Velkoz", "Renata", 2], // Burst sup out-trades peel sup
  ["Velkoz", "Seraphine", 2], // Burst sup out-trades peel sup
  ["Xerath", "Janna", 2], // Burst sup out-trades peel sup
  ["Xerath", "Soraka", 2], // Burst sup out-trades peel sup
  ["Xerath", "Yuumi", 2], // Burst sup out-trades peel sup
  ["Xerath", "Sona", 2], // Burst sup out-trades peel sup
  ["Xerath", "Nami", 2], // Burst sup out-trades peel sup
  ["Xerath", "Lulu", 2], // Burst sup out-trades peel sup
  ["Xerath", "Milio", 2], // Burst sup out-trades peel sup
  ["Xerath", "Karma", 2], // Burst sup out-trades peel sup
  ["Xerath", "Renata", 2], // Burst sup out-trades peel sup
  ["Xerath", "Seraphine", 2], // Burst sup out-trades peel sup
  ["Lux", "Janna", 2], // Burst sup out-trades peel sup
  ["Lux", "Yuumi", 2], // Burst sup out-trades peel sup
  ["Lux", "Sona", 2], // Burst sup out-trades peel sup
  ["Lux", "Nami", 2], // Burst sup out-trades peel sup
  ["Lux", "Lulu", 2], // Burst sup out-trades peel sup
  ["Lux", "Milio", 2], // Burst sup out-trades peel sup
  ["Lux", "Karma", 2], // Burst sup out-trades peel sup
  ["Lux", "Renata", 2], // Burst sup out-trades peel sup
  ["Lux", "Seraphine", 2], // Burst sup out-trades peel sup
  ["LeeSin", "Karthus", 2], // Early invade vs scaling JG
  ["LeeSin", "MasterYi", 2], // Early invade vs scaling JG
  ["LeeSin", "Shyvana", 2], // Early invade vs scaling JG
  ["LeeSin", "Kindred", 2], // Early invade vs scaling JG
  ["XinZhao", "Karthus", 2], // Early invade vs scaling JG
  ["XinZhao", "MasterYi", 2], // Early invade vs scaling JG
  ["XinZhao", "Shyvana", 2], // Early invade vs scaling JG
  ["XinZhao", "Kindred", 2], // Early invade vs scaling JG
  ["Pantheon", "Karthus", 2], // Early invade vs scaling JG
  ["Pantheon", "MasterYi", 2], // Early invade vs scaling JG
  ["Pantheon", "Shyvana", 2], // Early invade vs scaling JG
  ["Pantheon", "Kindred", 2], // Early invade vs scaling JG
  ["Elise", "Karthus", 2], // Early invade vs scaling JG
  ["Elise", "MasterYi", 2], // Early invade vs scaling JG
  ["Elise", "Shyvana", 2], // Early invade vs scaling JG
  ["Elise", "Kindred", 2], // Early invade vs scaling JG
  ["Graves", "Karthus", 2], // Early invade vs scaling JG
  ["Graves", "MasterYi", 2], // Early invade vs scaling JG
  ["Graves", "Shyvana", 2], // Early invade vs scaling JG
  ["Graves", "Kindred", 2], // Early invade vs scaling JG
  ["Nidalee", "Karthus", 2], // Early invade vs scaling JG
  ["Nidalee", "MasterYi", 2], // Early invade vs scaling JG
  ["Nidalee", "Shyvana", 2], // Early invade vs scaling JG
  ["Nidalee", "Kindred", 2], // Early invade vs scaling JG
  ["RekSai", "Karthus", 2], // Early invade vs scaling JG
  ["RekSai", "MasterYi", 2], // Early invade vs scaling JG
  ["RekSai", "Shyvana", 2], // Early invade vs scaling JG
  ["RekSai", "Kindred", 2], // Early invade vs scaling JG
  ["Vayne", "Rammus", 2], // %HP shred vs HP stacker
  ["Fiora", "Rammus", 2], // %HP shred vs HP stacker
  ["Twitch", "Rammus", 2], // %HP shred vs HP stacker
  ["Twitch", "Zac", 2], // %HP shred vs HP stacker
  ["Belveth", "Rammus", 2], // %HP shred vs HP stacker
  ["Belveth", "Zac", 2], // %HP shred vs HP stacker
  ["Kayle", "Sion", 2], // %HP shred vs HP stacker
  ["Kayle", "Maokai", 2], // %HP shred vs HP stacker
  ["Kayle", "Ornn", 2], // %HP shred vs HP stacker
  ["Kayle", "Chogath", 2], // %HP shred vs HP stacker
  ["Kayle", "Sett", 2], // %HP shred vs HP stacker
  ["Kayle", "DrMundo", 2], // %HP shred vs HP stacker
  ["Kayle", "Mordekaiser", 2], // %HP shred vs HP stacker
  ["Kayle", "Volibear", 2], // %HP shred vs HP stacker
  ["Kayle", "Nasus", 2], // %HP shred vs HP stacker
  ["Kayle", "TahmKench", 2], // %HP shred vs HP stacker
  ["Kayle", "Garen", 2], // %HP shred vs HP stacker
  ["Kayle", "Rammus", 2], // %HP shred vs HP stacker
  ["Gwen", "Sion", 2], // %HP shred vs HP stacker
  ["Gwen", "Maokai", 2], // %HP shred vs HP stacker
  ["Gwen", "Ornn", 2], // %HP shred vs HP stacker
  ["Gwen", "Chogath", 2], // %HP shred vs HP stacker
  ["Gwen", "Sett", 2], // %HP shred vs HP stacker
  ["Gwen", "DrMundo", 2], // %HP shred vs HP stacker
  ["Gwen", "Mordekaiser", 2], // %HP shred vs HP stacker
  ["Gwen", "Volibear", 2], // %HP shred vs HP stacker
  ["Gwen", "Nasus", 2], // %HP shred vs HP stacker
  ["Gwen", "TahmKench", 2], // %HP shred vs HP stacker
  ["Gwen", "Garen", 2], // %HP shred vs HP stacker
  ["Gwen", "Rammus", 2], // %HP shred vs HP stacker
  ["Gwen", "Zac", 2], // %HP shred vs HP stacker
  ["Xerath", "Sylas", 2], // Wave poke vs immobile mid
  ["Xerath", "Talon", 2], // Wave poke vs immobile mid
  ["Xerath", "Naafiri", 2], // Wave poke vs immobile mid
  ["Xerath", "Yone", 2], // Wave poke vs immobile mid
  ["Velkoz", "Kassadin", 2], // Wave poke vs immobile mid
  ["Velkoz", "Sylas", 2], // Wave poke vs immobile mid
  ["Velkoz", "Naafiri", 2], // Wave poke vs immobile mid
  ["Velkoz", "Yasuo", 2], // Wave poke vs immobile mid
  ["Velkoz", "Yone", 2], // Wave poke vs immobile mid
  ["Lux", "Kassadin", 2], // Wave poke vs immobile mid
  ["Lux", "Yasuo", 2], // Wave poke vs immobile mid
  ["Lux", "Yone", 2], // Wave poke vs immobile mid
  ["Karma", "Akali", 2], // Wave poke vs immobile mid
  ["Karma", "Fizz", 2], // Wave poke vs immobile mid
  ["Karma", "Kassadin", 2], // Wave poke vs immobile mid
  ["Karma", "Talon", 2], // Wave poke vs immobile mid
  ["Karma", "Naafiri", 2], // Wave poke vs immobile mid
  ["Karma", "Yasuo", 2], // Wave poke vs immobile mid
  ["Brand", "Akali", 2], // Wave poke vs immobile mid
  ["Brand", "Fizz", 2], // Wave poke vs immobile mid
  ["Brand", "Kassadin", 2], // Wave poke vs immobile mid
  ["Brand", "Sylas", 2], // Wave poke vs immobile mid
  ["Brand", "Talon", 2], // Wave poke vs immobile mid
  ["Brand", "Naafiri", 2], // Wave poke vs immobile mid
  ["Brand", "Yasuo", 2], // Wave poke vs immobile mid
  ["Brand", "Yone", 2], // Wave poke vs immobile mid
  ["Ziggs", "Akali", 2], // Wave poke vs immobile mid
  ["Ziggs", "Fizz", 2], // Wave poke vs immobile mid
  ["Ziggs", "Kassadin", 2], // Wave poke vs immobile mid
  ["Ziggs", "Sylas", 2], // Wave poke vs immobile mid
  ["Ziggs", "Talon", 2], // Wave poke vs immobile mid
  ["Ziggs", "Naafiri", 2], // Wave poke vs immobile mid
  ["Ziggs", "Yasuo", 2], // Wave poke vs immobile mid
  ["Ziggs", "Yone", 2], // Wave poke vs immobile mid
  ["Heimerdinger", "Akali", 2], // Wave poke vs immobile mid
  ["Heimerdinger", "Fizz", 2], // Wave poke vs immobile mid
  ["Heimerdinger", "Kassadin", 2], // Wave poke vs immobile mid
  ["Heimerdinger", "Sylas", 2], // Wave poke vs immobile mid
  ["Heimerdinger", "Talon", 2], // Wave poke vs immobile mid
  ["Heimerdinger", "Naafiri", 2], // Wave poke vs immobile mid
  ["Heimerdinger", "Yasuo", 2], // Wave poke vs immobile mid
  ["Heimerdinger", "Yone", 2], // Wave poke vs immobile mid
  ["Kayle", "Tryndamere", 2], // Scales out of bully
  ["Mordekaiser", "Nasus", 3], // Death realm 1v1
  ["Olaf", "Volibear", 3], // Ult + sustained DPS
  ["Trundle", "Volibear", 2], // Steals HP
  ["Trundle", "Garen", 2], // Sustains through judgment
  ["Darius", "Sett", 2], // Bleed runs down
  ["Teemo", "Trundle", 3], // Shrooms zone melee
  ["Singed", "Olaf", 3], // Proxy + fling
  ["Singed", "Garen", 3], // Proxy + flip
  ["Pantheon", "Twitch", 2], // Reveal beats stealth
  ["Pantheon", "Pyke", 2], // Reveal beats stealth
  ["Pantheon", "Shaco", 2], // Reveal beats stealth
  ["Pantheon", "Teemo", 2], // Reveal beats stealth
  ["LeeSin", "Twitch", 2], // Reveal beats stealth
  ["LeeSin", "Evelynn", 2], // Reveal beats stealth
  ["LeeSin", "Khazix", 2], // Reveal beats stealth
  ["LeeSin", "Rengar", 2], // Reveal beats stealth
  ["LeeSin", "Shaco", 2], // Reveal beats stealth
  ["Karthus", "Twitch", 2], // Reveal beats stealth
  ["Karthus", "Evelynn", 2], // Reveal beats stealth
  ["Karthus", "Khazix", 2], // Reveal beats stealth
  ["Karthus", "Pyke", 2], // Reveal beats stealth
  ["Karthus", "Rengar", 2], // Reveal beats stealth
  ["Karthus", "Shaco", 2], // Reveal beats stealth
  ["Karthus", "Teemo", 2], // Reveal beats stealth
  ["Galio", "Ahri", 3], // Magic shield
  ["Diana", "Kassadin", 2], // Pull cancels blink
  ["Cassiopeia", "Yasuo", 4], // Grounds windwall away
  ["Anivia", "Cassiopeia", 2], // Wall + slow
  ["Renata", "Yasuo", 2], // Berserk converts windwall
  ["Vex", "Ahri", 2], // Fear cancels charm
  ["Mel", "Sylas", 2], // Reflects steal
  ["Olaf", "Kayn", 3], // Ult immune to forms
  ["Olaf", "Lillia", 3], // Ult cancels sleep
  ["Vi", "Lillia", 2], // Vault interrupts sleep windup
  ["Lillia", "MasterYi", 2], // Sleep R disables Yi
  ["Sejuani", "Diana", 2], // Permaslow keeps her in
  ["Skarner", "Rengar", 2], // Drag through jungle
  ["Briar", "MasterYi", 3], // Berserker outpaces
  ["Briar", "Lillia", 3], // Bloodthirst out-trades
  ["Kindred", "Briar", 2], // Lamb's Respite cancels execute
  ["Diana", "Khazix", 2], // Pull cancels jump
  ["Diana", "Rengar", 2], // Pull cancels pounce
  ["RekSai", "Evelynn", 2], // Burrow reveals stealth
  ["Graves", "Evelynn", 3], // Smoke screen blocks charm
  ["XinZhao", "Khazix", 2], // Knockup cancels jump
  ["Lillia", "Nocturne", 2], // Sleep cancels paranoia
  ["Shaco", "Twitch", 2], // Reveals invisible
  ["Fiddlesticks", "Briar", 2], // Fear breaks bloodthirst
  ["Fiddlesticks", "Khazix", 2], // Fear cancels jump
  ["Caitlyn", "Yunara", 3], // Range out-trades
  ["Kalista", "Yunara", 2], // Mobility kites
  ["Yunara", "KogMaw", 2], // Magic crit shreds
  ["Aphelios", "Sivir", 2], // Out-DPSes shielded
  ["Jhin", "Aphelios", 2], // Crit out-trades
  ["Kaisa", "Aphelios", 2], // Dive over shields
  ["Jinx", "Aphelios", 2], // Late-game out-DPS
  ["MissFortune", "Aphelios", 2], // AOE clears
  ["Ezreal", "Kalista", 2], // Skillshot kites bond
  ["Twitch", "Aphelios", 2], // Stealth bypass
  ["Smolder", "Jinx", 2], // Range scales
  ["Sivir", "Jhin", 2], // Spell shield blocks W
  ["Draven", "Tristana", 2], // Runs down lane
  ["Kalista", "Sivir", 2], // Sentinel breaks shield
  ["Bard", "Brand", 2], // Stasis stops burn
  ["TahmKench", "Pyke", 3], // Devour saves from execute
  ["Vayne", "Camille", 2], // Tumble dodges hookshot

  // ─── Hand-curated final pass ──────────────────────────────────────────
  ["Ahri", "Veigar", 3], // Charm cancels cage
  ["Ahri", "Karthus", 3], // Charm cancels requiem
  ["Ahri", "Xerath", 3], // Mobility kites snipes
  ["Ahri", "Lux", 3], // Charm beats bind
  ["Annie", "Ahri", 2], // Stun cancels charm
  ["Ambessa", "Mordekaiser", 2], // Dash beats death realm
  ["Ambessa", "Garen", 2], // Mobility kites
  ["Ambessa", "Nasus", 2], // Burst kills before stack
  ["Quinn", "Ambessa", 2], // Range kites dive
  ["Vayne", "Ambessa", 2], // %HP shreds bruiser
  ["Caitlyn", "Aphelios", 3], // Range out-pokes
  ["Lucian", "Aphelios", 2], // Early dash all-in
  ["Pantheon", "Aphelios", 2], // Stun catches reload
  ["Caitlyn", "Ashe", 2], // Range out-pokes
  ["Draven", "Ashe", 2], // Early bully runs down
  ["Lucian", "Ashe", 2], // Dash all-in
  ["Pantheon", "Ashe", 2], // Stun catches Volley
  ["Talon", "AurelionSol", 3], // Roam + assassinate
  ["Zed", "AurelionSol", 3], // Burst before R
  ["Annie", "AurelionSol", 3], // Stun stops channels
  ["Pantheon", "Aurora", 2], // Stun stops cosmic beyond
  ["Talon", "Aurora", 2], // Burst before R
  ["Annie", "Aurora", 2], // Stun cancels combo
  ["Pantheon", "Azir", 4], // Stun cancels shuffle
  ["Talon", "Azir", 4], // Roam kills Azir early
  ["Zed", "Azir", 3], // Out-presses early
  ["Fizz", "Azir", 3], // Dash through soldiers
  ["Diana", "Azir", 3], // Pull cancels emperor
  ["Akali", "Azir", 3], // Shroud through soldiers
  ["Lissandra", "Akshan", 2], // Tomb stops revive
  ["Malzahar", "Akshan", 2], // Suppression cancels grapple
  ["Pantheon", "Akshan", 2], // Stun catches grapple
  ["Lucian", "Corki", 2], // Dash all-in
  ["Caitlyn", "Corki", 2], // Range out-pokes
  ["Draven", "Corki", 2], // Runs down mana
  ["Skarner", "Elise", 2], // Layered CC outlasts
  ["Maokai", "Elise", 2], // Roots beat E setup
  ["Tristana", "Ezreal", 2], // Reset all-in
  ["Pantheon", "Ezreal", 2], // Stun catches arcane shift
  ["Olaf", "Fiddlesticks", 4], // Ult immune to fear
  ["Pantheon", "Fiddlesticks", 3], // Stun cancels channel
  ["LeeSin", "Fiddlesticks", 3], // Kick cancels channel
  ["Vi", "Fiddlesticks", 3], // Vault cancels channel
  ["Diana", "Fiddlesticks", 2], // Pull cancels channel
  ["Karthus", "Fiddlesticks", 2], // Scales out of fear
  ["Pantheon", "Gragas", 3], // Stun catches roll
  ["Annie", "Gragas", 2], // Stun cancels slam
  ["Veigar", "Gragas", 2], // Cage stops dive
  ["Lux", "Gragas", 2], // Bind cancels combo
  ["Pantheon", "Hwei", 3], // Stun cancels chain
  ["Talon", "Hwei", 3], // Burst before chain
  ["Naafiri", "Hwei", 2], // Pack out-pressures
  ["Annie", "Hwei", 2], // Stun cancels combo
  ["Vayne", "Illaoi", 3], // Tumble dodges E
  ["Quinn", "Illaoi", 4], // Range kites tentacles
  ["Teemo", "Illaoi", 4], // Range kites + blind
  ["Heimerdinger", "Illaoi", 4], // Turret zone vs tentacles
  ["Camille", "Illaoi", 2], // Hookshot dodges E
  ["Pantheon", "Irelia", 4], // Stun cancels Q chain
  ["Annie", "Irelia", 3], // Stun shuts down dance
  ["Veigar", "Irelia", 3], // Cage stops Q resets
  ["Lissandra", "Irelia", 3], // Tomb stops dance
  ["Anivia", "Irelia", 3], // Wall + slow
  ["Olaf", "Ivern", 3], // Ult ignores brush peel
  ["MasterYi", "Ivern", 3], // Late out-DPS
  ["Kindred", "Ivern", 2], // Mobility kites Daisy
  ["Briar", "Ivern", 2], // Bloodthirst out-trades
  ["Olaf", "JarvanIV", 2], // Ult immune to cataclysm
  ["Karthus", "JarvanIV", 2], // Scales past tempo
  ["Vayne", "Jax", 3], // Tumble + %HP shreds
  ["Fiora", "Jax", 3], // Parry counterstrike
  ["Quinn", "Jax", 3], // Range kites stuns
  ["Teemo", "Jax", 3], // Blind stops Q
  ["Draven", "Jhin", 2], // Runs down 4-shot reload
  ["Tristana", "Jhin", 2], // Reset all-in mid-reload
  ["Pantheon", "Jhin", 2], // Stun catches W root
  ["Lucian", "Jinx", 2], // Dash all-in pre-6
  ["Pantheon", "Jinx", 2], // Stun catches rocket
  ["Caitlyn", "Jinx", 2], // Range out-pokes
  ["Vayne", "KSante", 4], // %HP shreds knockback
  ["Fiora", "KSante", 3], // Parry knockback
  ["Olaf", "KSante", 3], // Ult ignores wall
  ["Caitlyn", "Kaisa", 2], // Range out-pokes
  ["Draven", "Kaisa", 2], // Early all-in
  ["Lucian", "Kaisa", 2], // Dash all-in
  ["Draven", "Kalista", 2], // Runs down rend stacks
  ["Lucian", "Kalista", 2], // Dash all-in
  ["Pantheon", "Kayn", 3], // Stun cancels R
  ["Annie", "Kayn", 2], // Stun cancels jump
  ["Vayne", "Kled", 3], // %HP through mount
  ["Quinn", "Kled", 3], // Range kites jump
  ["Pantheon", "Kled", 2], // Stun before mount
  ["Pantheon", "Mel", 2], // Stun cancels reflect
  ["Talon", "Mel", 2], // Burst before R
  ["Annie", "Mel", 2], // Stun cancels combo
  ["Draven", "MissFortune", 2], // Early bully
  ["Pantheon", "MissFortune", 2], // Stun cancels Bullet Time
  ["Pantheon", "MonkeyKing", 2], // Stun cancels cyclone
  ["Olaf", "MonkeyKing", 2], // Ult ignores cyclone
  ["Pantheon", "Neeko", 3], // Stun cancels R
  ["Talon", "Neeko", 3], // Burst before bloom
  ["Annie", "Neeko", 2], // Stun cancels combo
  ["Olaf", "Nidalee", 3], // Ult ignores spear poke
  ["Maokai", "Nidalee", 2], // Roots cancel pounce
  ["Caitlyn", "Nilah", 3], // Range out-pokes
  ["Draven", "Nilah", 3], // Runs down lane
  ["Lucian", "Nilah", 2], // Dash all-in
  ["Olaf", "Nunu", 4], // Ult cancels channel
  ["Pantheon", "Nunu", 3], // Stun cancels snowball
  ["LeeSin", "Nunu", 3], // Kick cancels channel
  ["Vi", "Nunu", 3], // Vault cancels channel
  ["Pantheon", "Orianna", 2], // Stun cancels shockwave
  ["Talon", "Orianna", 2], // Roam burst pre-6
  ["Akali", "Orianna", 2], // Shroud through ball
  ["Vayne", "Poppy", 2], // Tumble + %HP
  ["Fiora", "Poppy", 2], // Parry pin
  ["Quinn", "Poppy", 3], // Range kites pin
  ["Brand", "Rakan", 2], // Burn beats engage
  ["Zyra", "Rakan", 2], // Plants out-trade
  ["Leona", "Rakan", 2], // Sun cancels engage
  ["Vayne", "Rumble", 3], // %HP shreds
  ["Quinn", "Rumble", 3], // Range kites flame
  ["Pantheon", "Rumble", 2], // Stun cancels equalizer
  ["Pantheon", "Ryze", 3], // Stun cancels chain
  ["Talon", "Ryze", 3], // Roam before scaling
  ["Annie", "Ryze", 2], // Stun cancels combo
  ["Pantheon", "Samira", 2], // Stun cancels Inferno Trigger
  ["Annie", "Samira", 2], // Stun cancels combo
  ["Caitlyn", "Samira", 2], // Range out-pokes
  ["Olaf", "Shen", 2], // Ignores swords
  ["Vayne", "Shen", 3], // %HP shreds
  ["Trundle", "Shen", 2], // Steals HP
  ["Pantheon", "Singed", 2], // Stun catches fling
  ["Vayne", "Singed", 3], // %HP shreds tank
  ["Quinn", "Singed", 3], // Range kites fling
  ["Vayne", "Skarner", 3], // %HP shreds
  ["Fiora", "Skarner", 2], // Parry drag
  ["Olaf", "Skarner", 2], // Ult immune
  ["Pantheon", "Swain", 2], // Stun cancels drain
  ["Talon", "Swain", 2], // Burst before R
  ["Vayne", "Swain", 3], // %HP shreds drain
  ["Pantheon", "Syndra", 2], // Stun catches sphere
  ["Talon", "Syndra", 3], // Burst before R
  ["Pantheon", "TwistedFate", 3], // Stun cancels TP
  ["Talon", "TwistedFate", 3], // Burst before R
  ["Zed", "TwistedFate", 3], // Out-presses pre-6
  ["Annie", "TwistedFate", 3], // Stun cancels combo
  ["Pantheon", "Taliyah", 2], // Stun cancels worked ground
  ["Talon", "Taliyah", 2], // Burst pre-6
  ["Annie", "Taliyah", 2], // Stun cancels combo
  ["Pyke", "Taric", 3], // Execute through R
  ["Brand", "Taric", 3], // Burn beats heal
  ["Blitzcrank", "Taric", 3], // Hook out of bastion
  ["Karthus", "Udyr", 2], // Scales past invade
  ["Maokai", "Udyr", 2], // Roots cancel charge
  ["Pantheon", "Udyr", 2], // Stun cancels bear
  ["Vayne", "Urgot", 3], // Tumble + %HP
  ["Quinn", "Urgot", 3], // Range kites
  ["Fiora", "Urgot", 2], // Parry chomp
  ["Caitlyn", "Varus", 2], // Range out-pokes
  ["Draven", "Varus", 2], // Early bully
  ["Lucian", "Varus", 2], // Dash all-in
  ["Pantheon", "Vex", 3], // Stun cancels doom
  ["Talon", "Vex", 3], // Burst before fear
  ["Annie", "Vex", 2], // Stun cancels combo
  ["Olaf", "Viego", 3], // Ult immune to possession
  ["LeeSin", "Viego", 2], // Kick cancels combo
  ["Maokai", "Viego", 2], // Roots beat dash
  ["Pantheon", "Viktor", 3], // Stun cancels chaos storm
  ["Talon", "Viktor", 3], // Burst pre-6
  ["Zed", "Viktor", 3], // Out-presses early
  ["Annie", "Viktor", 2], // Stun cancels combo
  ["Olaf", "Warwick", 3], // Ult immune to suppress
  ["Karthus", "Warwick", 2], // Scales past invade
  ["Pantheon", "Warwick", 2], // Stun catches dive
  ["Caitlyn", "Xayah", 2], // Range out-pokes
  ["Draven", "Xayah", 2], // Early bully
  ["Pantheon", "Xayah", 2], // Stun catches feathers
  ["Vayne", "Zac", 3], // %HP shreds blob
  ["Fiora", "Zac", 2], // Parry slingshot
  ["Caitlyn", "Zeri", 2], // Range out-pokes
  ["Draven", "Zeri", 2], // Early bully
  ["Pantheon", "Zeri", 2], // Stun cancels burst
  ["Pyke", "Zilean", 3], // Execute through revive
  ["Brand", "Zilean", 3], // Burn through bombs
  ["Leona", "Zilean", 2], // Sun cancels stasis windup
  ["Pantheon", "Zoe", 2], // Stun cancels combo
  ["Talon", "Zoe", 3], // Roam before R range
  ["Annie", "Zoe", 2], // Stun cancels combo
  ["Karthus", "Akshan", 2], // Requiem after revive
  ["Heimerdinger", "Singed", 3], // Turrets zone proxy
  ["Pantheon", "Gangplank", 2], // Stun catches barrel
  ["Vayne", "Gangplank", 2], // Tumble dodges barrels
  ["Quinn", "Gangplank", 2], // Range pokes oranges
  ["Annie", "Lux", 2], // Stun cancels bind
  ["Annie", "Karthus", 2], // Stun cancels requiem
  ["Annie", "Brand", 2], // Stun beats burn windup

  // ─── Final pass — closing remaining counter gaps ──────────────────────
  ["Akshan", "Soraka", 2], // Conqueror through heal
  ["Akshan", "Yuumi", 2], // Reveal hits Yuumi
  ["Akshan", "Sona", 2], // Skirmish kills sona
  ["Ashe", "MissFortune", 2], // Long-range R catches
  ["Ashe", "Sivir", 2], // Slow chain kites shield
  ["Ashe", "Kalista", 2], // Slow stops jumps
  ["Ezreal", "Sivir", 2], // Outranges spell shield window
  ["Ezreal", "Twitch", 2], // Skillshot range
  ["Ezreal", "Caitlyn", 2], // Mobile through traps
  ["Gangplank", "Sett", 2], // Barrels poke brawler
  ["Gangplank", "Mordekaiser", 2], // Range out of death realm
  ["Gangplank", "Garen", 2], // Range kites spin
  ["Gragas", "Lillia", 2], // Body slam cancels sleep
  ["Gragas", "MasterYi", 2], // R cancels meditate
  ["Gragas", "Karthus", 2], // Slam cancels requiem
  ["Ivern", "Khazix", 2], // Brushes block isolation
  ["Ivern", "Rengar", 2], // Brushes block leap
  ["Ivern", "Twitch", 2], // Daisy reveals stealth
  ["Kaisa", "Twitch", 2], // Dive on stealth
  ["Kaisa", "Ezreal", 2], // Dive over poke
  ["Kaisa", "Senna", 2], // Dive late scaler
  ["Kayn", "Hecarim", 2], // Burst out-trades charge
  ["Kayn", "MasterYi", 2], // Wallhop cancels Q
  ["Kayn", "Karthus", 2], // Burst before R
  ["Kled", "Tryndamere", 2], // Dismount + remount sustain
  ["Kled", "Garen", 2], // Pocket pistol pokes spin
  ["Kled", "Mordekaiser", 2], // Mobility kites death realm
  ["Mel", "Akali", 2], // Reflects burst combos
  ["Mel", "Veigar", 2], // Reflects cage burst
  ["Mel", "Brand", 2], // Reflects pyroclasm
  ["MonkeyKing", "Tryndamere", 2], // Cyclone out-trades crit
  ["MonkeyKing", "Yorick", 2], // Decoy clears maiden
  ["MonkeyKing", "Garen", 2], // Cyclone breaks spin
  ["Neeko", "Lulu", 2], // Bloom catches polymorph
  ["Neeko", "Sona", 2], // AOE clears auras
  ["Neeko", "Soraka", 2], // AOE catches healer
  ["Nilah", "Senna", 2], // All-in beats scaling
  ["Nilah", "Yuumi", 2], // Dive ignores attached
  ["Nilah", "Sivir", 2], // Empowered AA breaks shield
  ["Nunu", "Heimerdinger", 2], // Snowball clears turrets
  ["Nunu", "Sona", 2], // R cancels crescendo
  ["Nunu", "Janna", 2], // R beats disengage radius
  ["Orianna", "Karthus", 2], // Shockwave cancels requiem
  ["Orianna", "MasterYi", 2], // Ball + slow kites
  ["Orianna", "Tryndamere", 2], // Shockwave away
  ["Poppy", "Yasuo", 2], // Pin cancels last breath
  ["Poppy", "Yone", 2], // Pin cancels twin
  ["Poppy", "Zed", 2], // Heroic stops shadow
  ["Rumble", "Garen", 2], // Equalizer zone
  ["Rumble", "Volibear", 2], // Burn beats sustain
  ["Rumble", "Sett", 2], // Equalizer over melee
  ["Ryze", "Veigar", 2], // Burst out-trades cage
  ["Ryze", "Karthus", 2], // Late mage out-DPS
  ["Ryze", "Soraka", 2], // Chain through heal
  ["Samira", "Janna", 2], // Windwall blocks tornado
  ["Samira", "Sona", 2], // Windwall blocks crescendo
  ["Samira", "Lux", 2], // Windwall blocks bind
  ["Swain", "Yasuo", 2], // Drain through windwall
  ["Swain", "Akali", 2], // Drain through shroud
  ["Swain", "Twitch", 2], // Drain reveals stealth
  ["Syndra", "Sivir", 2], // Sphere E breaks shield
  ["Syndra", "Yuumi", 2], // Stun pulls attached
  ["Syndra", "Soraka", 2], // Burst out-paces heal
  ["Taliyah", "Yasuo", 2], // Wall blocks last breath
  ["Taliyah", "Yone", 2], // Wall blocks twin
  ["Taliyah", "Akali", 2], // Wall stops shroud escape
  ["Taric", "Vayne", 2], // Bastion R saves carry
  ["Taric", "Aphelios", 2], // R saves through burst
  ["Taric", "Twitch", 2], // Bastion + invisible spray
  ["TwistedFate", "Karthus", 2], // Gold card stops requiem
  ["TwistedFate", "Sona", 2], // Gold card stops crescendo
  ["TwistedFate", "Yuumi", 2], // Stun catches detached
  ["Udyr", "Lulu", 2], // Bear breaks polymorph
  ["Udyr", "Yuumi", 2], // Bear pin catches
  ["Urgot", "Sett", 2], // Chomp out-DPSes brawler
  ["Urgot", "Mordekaiser", 2], // Chomp ignores death realm CD
  ["Urgot", "Aatrox", 2], // Chomp interrupts Q
  ["Varus", "Sivir", 2], // Q out-ranges shield
  ["Varus", "Yuumi", 2], // R chains both bodies
  ["Varus", "Sona", 2], // Long-range Q pokes
  ["Vex", "Akali", 2], // Fear breaks shroud
  ["Vex", "Zed", 2], // Fear cancels shadow
  ["Vex", "Yasuo", 2], // Fear catches dash window
  ["Viego", "Sona", 2], // R kills aura sup
  ["Viego", "Soraka", 2], // Possess heal carrier
  ["Viego", "Yuumi", 2], // Possess catches detached
  ["Viktor", "Sona", 2], // Storm ignores aura
  ["Viktor", "Yuumi", 2], // Storm catches detached
  ["Viktor", "Soraka", 2], // Storm out-poke heal
  ["Warwick", "Yuumi", 2], // Suppression catches
  ["Warwick", "Soraka", 2], // Bloodthirst out-trades heal
  ["Warwick", "Sona", 2], // R catches crescendo windup
  ["Xayah", "Twitch", 2], // Featherstorm reveals
  ["Xayah", "Yuumi", 2], // AOE catches detached
  ["Xayah", "Sivir", 2], // Feathers ignore shield
  ["Zeri", "Soraka", 2], // Spark Surge poke
  ["Zeri", "Sona", 2], // Out-DPS aura
  ["Zeri", "Yuumi", 2], // Mobility chases
  ["Zilean", "Yuumi", 2], // Bombs catch attached
  ["Zilean", "Soraka", 2], // Stasis prevents heal
  ["Zilean", "Sona", 2], // Stasis cancels crescendo
  ["Zoe", "Karthus", 2], // Sleep cancels requiem
  ["Zoe", "Soraka", 2], // Sleep cancels heal
  ["Zoe", "Sona", 2], // Sleep cancels crescendo

  // ─── Per-direction balance pass ───────────────────────────────────────
  ["Caitlyn", "Annie", 2], // Range out-pokes
  ["Pantheon", "Annie", 2], // Stun beats stun trade
  ["Lissandra", "Annie", 2], // Tomb stops Tibbers
  ["Vladimir", "Annie", 2], // Pool dodges Tibbers
  ["Quinn", "Galio", 3], // AD + range
  ["Camille", "Galio", 2], // AD bypasses magic shield
  ["Twitch", "Lucian", 2], // Stealth bypasses dash
  ["Briar", "LeeSin", 2], // Bloodthirst out-trades
  ["Olaf", "LeeSin", 2], // Ult immune to kick
  ["Trundle", "Quinn", 2], // Pillar + sustain
  ["Riven", "Quinn", 2], // All-in out-trades poke
  ["Vayne", "Cassiopeia", 2], // Tumble bypasses ground
  ["Quinn", "Cassiopeia", 2], // Range pokes
  ["Leona", "Bard", 3], // Sun out-engages roam
  ["Nautilus", "Bard", 2], // Hook in lane while Bard roams
  ["Pantheon", "Belveth", 2], // Stun cancels void surge
  ["LeeSin", "Belveth", 2], // Kick interrupts dash chain
  ["Talon", "Belveth", 2], // Burst before stacks
  ["Brand", "Braum", 3], // AOE around shield
  ["Zyra", "Braum", 3], // Plants ignore shield direction
  ["Pyke", "Braum", 2], // Execute under shield
  ["Lux", "Braum", 2], // Bind beats wall
  ["Quinn", "Fiora", 3], // Range kites parry
  ["Vladimir", "Fiora", 3], // Pool through parry
  ["Teemo", "Fiora", 3], // Blind cancels Q
  ["Camille", "Gnar", 2], // Hookshot closes
  ["Riven", "Gnar", 2], // All-in mini form
  ["Briar", "Graves", 2], // Bloodthirst out-trades
  ["Quinn", "Gwen", 3], // Range outside mist
  ["Pantheon", "Gwen", 2], // Stun cancels Q chain
  ["Vayne", "Malphite", 4], // %HP through armor
  ["Fiora", "Malphite", 3], // Parry knockup
  ["Quinn", "Malphite", 2], // Range out-pokes
  ["Pyke", "Morgana", 2], // Execute past spell shield
  ["Brand", "Morgana", 2], // Burn through shield
  ["Lux", "Morgana", 2], // Range out-pokes
  ["Brand", "Rell", 2], // Burn beats engage
  ["Briar", "RekSai", 2], // Bloodthirst out-trades
  ["Camille", "Teemo", 3], // Hookshot through shrooms
  ["TahmKench", "Teemo", 2], // Eats Teemo
  ["Karthus", "Vi", 2], // Scales past tempo
  ["MasterYi", "Vi", 2], // Late out-DPS
  ["Briar", "Vi", 2], // Bloodthirst
  ["Trundle", "Mordekaiser", 2], // Steals stats
  ["Yuumi", "Sona", 1], // Attached out-shoves
  ["Yuumi", "Soraka", 1], // Out-scales heal duel
  ["Yuumi", "Karma", 1], // Out-scales late game
  ["Yasuo", "Karthus", 2], // Mobility kites Q
  ["Yone", "Karthus", 2], // Burst before R
  ["MasterYi", "Soraka", 3], // Q meditate ignores heal
  ["MasterYi", "Yuumi", 3], // Bypass attached
  ["Khazix", "Yuumi", 3], // Isolation eats squishy
  ["Khazix", "Soraka", 3], // Isolation kills heal
  ["Kassadin", "Karthus", 2], // Late blink past requiem
  ["Nami", "Sona", 1], // Bubble cancels crescendo
  ["Nami", "Soraka", 1], // Bubble cancels heal
  ["Nami", "Yuumi", 2], // Bubble forces detach
  ["Rengar", "Yuumi", 3], // Predator ignores attach
  ["Rengar", "Soraka", 3], // Predator kills heal
  ["Tryndamere", "Karthus", 2], // Splitpush + Undying Rage
  ["Riven", "Karthus", 2], // Burst before R
  ["Sion", "Soraka", 2], // Q knockup cancels heal
  ["Sion", "Yuumi", 2], // Charge catches attached
  ["Sion", "Sona", 1], // Q knockup cancels crescendo
  ["Sivir", "Soraka", 1], // Outpushes heal
  ["Sivir", "Yuumi", 1], // Out-shoves attached
  ["Sivir", "Sona", 1], // Wave clear
  ["Aphelios", "Soraka", 1], // Late shreds heal
  ["Aphelios", "Yuumi", 1], // Late catches attached
  ["AurelionSol", "Soraka", 1], // Scales past heal
  ["AurelionSol", "Yuumi", 1], // AOE catches attached
  ["Aurora", "Soraka", 2], // Knockback breaks heal
  ["Aurora", "Yuumi", 2], // Knockback detaches
  ["Azir", "Soraka", 1], // Late shuffle catches
  ["Azir", "Yuumi", 1], // Soldiers catch attached
  ["Chogath", "Soraka", 2], // Knockup cancels heal
  ["Chogath", "Yuumi", 2], // Knockup detaches
  ["Chogath", "Smolder", 2], // Health pool absorbs poke
  ["Corki", "Soraka", 1], // Out-DPS heal
  ["Corki", "Yuumi", 1], // AOE catches
  ["Ekko", "Soraka", 2], // Burst beats heal
  ["Ekko", "Yuumi", 2], // Burst catches attached
  ["Evelynn", "Soraka", 3], // Charm before heal
  ["Evelynn", "Yuumi", 3], // Charm catches attached
  ["Hwei", "Soraka", 2], // Multi-spell beats heal
  ["Hwei", "Yuumi", 2], // AOE catches attached
  ["Irelia", "Soraka", 2], // Dance beats heal
  ["Irelia", "Yuumi", 2], // Reset catches attached
  ["Jax", "Soraka", 2], // Splitpush ignores heal
  ["Jax", "Yuumi", 1], // Splitpush ignores attach
  ["Jhin", "Soraka", 2], // W root cancels heal
  ["Jhin", "Yuumi", 1], // W catches detached
  ["Jinx", "Soraka", 1], // Late out-DPS
  ["Jinx", "Yuumi", 1], // Late catches detached
  ["Kaisa", "Soraka", 2], // Dive past heal
  ["Kaisa", "Yuumi", 2], // Dive catches attached
  ["Kalista", "Soraka", 2], // Rend stacks ignore heal
  ["Kalista", "Yuumi", 1], // Bond bypasses attach
  ["Katarina", "Soraka", 3], // Resets through heal
  ["Katarina", "Yuumi", 3], // AOE catches attached
  ["Katarina", "Karthus", 2], // Burst before R
  ["KogMaw", "Soraka", 1], // Out-DPS heal late
  ["KogMaw", "Yuumi", 1], // Out-DPS attached
  ["MissFortune", "Soraka", 2], // Bullet Time AOE heal
  ["MissFortune", "Yuumi", 2], // Bullet Time AOE detach
  ["Qiyana", "Soraka", 2], // Combo beats heal
  ["Qiyana", "Yuumi", 2], // Combo catches detach
  ["Qiyana", "Karthus", 2], // Burst before R
  ["Rakan", "Soraka", 2], // Charge cancels heal
  ["Rammus", "Soraka", 2], // Taunt + thornmail
  ["Rammus", "Yuumi", 1], // Roll catches detached
  ["Renata", "Soraka", 2], // Berserk converts heal
  ["Renata", "Yuumi", 2], // R catches attached
  ["Seraphine", "Soraka", 1], // Out-paces heal
  ["Seraphine", "Yuumi", 1], // AOE catches detach
  ["Shaco", "Soraka", 2], // Stealth burst
  ["Shaco", "Yuumi", 2], // Stealth catches detach
  ["Shen", "Soraka", 1], // Out-shoves heal
  ["Shyvana", "Soraka", 2], // Dragon form ignores heal
  ["Smolder", "Soraka", 1], // Late R catches heal
  ["Smolder", "Yuumi", 1], // AOE catches detach
  ["Udyr", "Soraka", 2], // Stun cancels heal
  ["Yunara", "Soraka", 2], // Late shreds heal
  ["Yunara", "Yuumi", 2], // Late catches attached
  ["Yunara", "Sona", 1], // Out-DPS aura sup
  ["Zac", "Soraka", 2], // Slingshot cancels heal
  ["Zac", "Yuumi", 2], // Slingshot catches attached

  // ─── Per-direction final ──────────────────────────────────────────────
  ["AurelionSol", "Caitlyn", 1], // Singularity catches range
  ["AurelionSol", "Heimerdinger", 1], // Out-scales turret zone
  ["AurelionSol", "Senna", 1], // Out-scales late
  ["Azir", "Caitlyn", 1], // Shuffle catches range
  ["Azir", "Twitch", 1], // Soldiers reveal stealth
  ["Azir", "Kalista", 1], // Wall stops jumps
  ["Corki", "Smolder", 2], // Out-poke pre-stacks
  ["Corki", "KogMaw", 2], // Out-range early
  ["Corki", "Senna", 2], // Out-poke pre-stacks
  ["Evelynn", "Senna", 2], // Charm before scaling
  ["Evelynn", "Smolder", 2], // Charm before stacks
  ["Illaoi", "Garen", 3], // Test of Spirit beats spin
  ["Illaoi", "Sett", 3], // Tentacles out-trade
  ["Illaoi", "Mordekaiser", 2], // Tentacles in death realm
  ["Irelia", "Garen", 2], // Q resets through silence
  ["KogMaw", "Sett", 2], // Late shreds tank
  ["KogMaw", "Mordekaiser", 2], // %HP shreds
  ["KogMaw", "Sion", 2], // %HP late shreds HP wall
  ["Ornn", "Mordekaiser", 1], // Knockup interrupts pool
  ["Ornn", "Sett", 1], // Tank vs brawler
  ["Ornn", "Tryndamere", 1], // Knockup cancels crit
  ["Rakan", "Sona", 2], // Charge cancels crescendo
  ["Rengar", "Sona", 2], // Predator catches aura
  ["Rengar", "Smolder", 2], // Burst before stacks
  ["Rengar", "Senna", 2], // Burst before scaling
  ["Seraphine", "Sona", 1], // Aura war
  ["Seraphine", "Karma", 1], // Out-scales late
  ["Seraphine", "Senna", 1], // AOE catches scaling
  ["Shyvana", "Sona", 2], // Charge cancels aura
  ["Shyvana", "Senna", 2], // Charge ignores scaling
  ["Shyvana", "Smolder", 2], // All-in pre-stacks
  ["Sona", "Karma", 1], // Aura beats mantra
  ["Sona", "Senna", 1], // Aura war
  ["Sona", "Smolder", 1], // Out-poke pre-stacks
  ["Yasuo", "Caitlyn", 2], // Windwall blocks net
  ["Yasuo", "Senna", 1], // Windwall blocks Q
  ["Yone", "Caitlyn", 2], // Twin Breath through net
  ["Yone", "Senna", 1], // Mobility ignores Q
  ["Zac", "Sona", 2], // Slingshot cancels crescendo
  ["Zac", "Senna", 2], // Slingshot catches scaling
  ["Zac", "Smolder", 2], // Slingshot catches stacks
  ["Zac", "Karthus", 2], // Slingshot cancels requiem
  ["Brand", "Alistar", 2], // Burn through tankiness
  ["Aatrox", "Ambessa", 2], // Sustain out-trades dive
  ["Trundle", "Ambessa", 2], // Steals stats
  ["Janna", "Amumu", 2], // Tornado cancels engage
  ["Lulu", "Amumu", 2], // Poly cancels bandage
  ["Soraka", "Amumu", 2], // Sustain through curse
  ["Zyra", "Bard", 2], // Plants beat roam-leaver
  ["Alistar", "Bard", 2], // Engage in lane while gone
  ["Maokai", "Briar", 2], // Roots cancel charge
  ["Janna", "Briar", 2], // Tornado cancels engage
  ["Soraka", "Elise", 1], // Heal through early
  ["Janna", "Elise", 1], // Disengage early
  ["Lulu", "Elise", 1], // Poly cancels rappel
  ["Brand", "Galio", 2], // Burn through magic shield
  ["Karthus", "Galio", 2], // Scales past taunt
  ["Vayne", "Galio", 2], // Tumble dodges taunt
  ["Akali", "Gnar", 2], // Shroud through mega form
  ["Pantheon", "Gnar", 2], // Stun catches mini form
  ["Janna", "Graves", 2], // Disengage smokescreen
  ["Maokai", "Graves", 2], // Roots cancel dash
  ["Sejuani", "Graves", 2], // Glacial slows kite
  ["Janna", "Gwen", 2], // Tornado breaks mist
  ["Lulu", "Gwen", 2], // Poly cancels Q chain
  ["Soraka", "Gwen", 2], // Sustain out-heals
  ["Janna", "JarvanIV", 2], // Tornado cancels cataclysm
  ["Lulu", "JarvanIV", 2], // Poly cancels combo
  ["Soraka", "JarvanIV", 2], // Heal through cage
  ["Lulu", "Lissandra", 1], // Poly cancels tomb
  ["Soraka", "Lissandra", 1], // Heal through tomb timing
  ["Janna", "Lucian", 2], // Tornado cancels dash
  ["Soraka", "Lucian", 2], // Heal through poke
  ["Lulu", "Lucian", 2], // Poly cancels dash all-in
  ["Janna", "Malzahar", 2], // Tornado cancels suppress
  ["Lulu", "Malzahar", 2], // Poly cancels R
  ["Soraka", "Malzahar", 2], // Heal through R
  ["Janna", "MonkeyKing", 2], // Tornado cancels cyclone
  ["Lulu", "MonkeyKing", 2], // Poly cancels combo
  ["Soraka", "MonkeyKing", 2], // Heal through cyclone
  ["Janna", "Nidalee", 2], // Tornado cancels pounce
  ["Lulu", "Nidalee", 2], // Poly cancels jump
  ["Soraka", "Nidalee", 2], // Heal through poke
  ["Janna", "Nocturne", 2], // Tornado cancels R
  ["Lulu", "Nocturne", 2], // Poly cancels paranoia
  ["Soraka", "Nocturne", 2], // Heal through R
  ["Janna", "RekSai", 2], // Tornado cancels emergence
  ["Lulu", "RekSai", 2], // Poly cancels burrow
  ["Soraka", "RekSai", 2], // Heal through R
  ["Janna", "Syndra", 2], // Tornado cancels combo
  ["Lulu", "Syndra", 2], // Poly cancels stun
  ["Janna", "Tristana", 2], // Tornado cancels jump
  ["Lulu", "Tristana", 2], // Poly cancels reset
  ["Soraka", "Tristana", 2], // Heal through poke
  ["Janna", "Trundle", 2], // Tornado cancels pillar
  ["Lulu", "Trundle", 2], // Poly cancels Q
  ["Soraka", "Trundle", 2], // Heal duel
  ["Janna", "XinZhao", 2], // Tornado cancels combo
  ["Lulu", "XinZhao", 2], // Poly cancels knockup
  ["Soraka", "XinZhao", 2], // Heal through dive

  // ─── Closing victim gaps for Rell + Thresh ────────────────────────────
  ["Lux", "Thresh", 2], // Bind beats hook range
  ["Brand", "Thresh", 1], // Burn beats hook setup
  ["Lux", "Rell", 2], // Bind beats crash setup

  // ─── Final 5 victim gaps ──────────────────────────────────────────────
["Pyke", "Lissandra", 2], // Execute through tomb gap
  ["Brand", "Lissandra", 2], // Burn through self-tomb
  ["Talon", "Nautilus", 2], // Burst beats hook
  ["Akali", "Nautilus", 2], // Shroud through hook
  ["Pyke", "Rell", 2], // Execute through magnetism
  ["Akali", "Thresh", 2], // Shroud through hook
  ["Brand", "Zyra", 2], // Burn through plants
  ["Pyke", "Zyra", 2], // Execute through plants

  // ─── Final-pass small gap-fills ───────────────────────────────────────
  ["Tryndamere", "Garen", 2], // Crit + Undying Rage out-trades
  ["Tryndamere", "Olaf", 2], // Outscales berserker
  ["Tryndamere", "Renekton", 2], // Outscales early bully

];

// ─── Comp identity templates ────────────────────────────────────────────────

// The AI locks onto an identity once its `trigger` fires (after at least 2
// picks) and rewards subsequent picks that complete it via `needed`
// archetypes. With the best-match selection (see helpers.identityTarget),
// order matters less than `needed` overlap with current picks, but more
// specific identities are still listed first as a tiebreaker.
export const IDENTITIES: ReadonlyArray<{
  label: string;
  trigger: (c: Record<Archetype, number>) => boolean;
  needed: ReadonlyArray<Archetype>;
}> = [
  {
    label: "Wombo Combo",
    trigger: (c) => c.wombo >= 1 && c.engage >= 1,
    needed: ["wombo", "engage"],
  },
  {
    label: "Protect The Carry",
    trigger: (c) => c["hyper-carry"] >= 1 && c.peel >= 1,
    needed: ["peel", "enchanter", "hyper-carry"],
  },
  {
    label: "Hyper Engage",
    trigger: (c) => c.engage >= 2,
    needed: ["engage", "tank", "dive"],
  },
  {
    label: "Pick Comp",
    trigger: (c) => c.pick >= 1 && (c.assassin >= 1 || c.burst >= 1),
    needed: ["pick", "assassin", "burst"],
  },
  {
    label: "Poke / Siege",
    trigger: (c) => c.poke >= 2,
    needed: ["poke"],
  },
  {
    label: "Dive Comp",
    trigger: (c) => c.dive >= 2,
    needed: ["dive", "engage"],
  },
  {
    label: "Tank Stack",
    trigger: (c) => c.tank >= 2 && c.engage >= 1,
    needed: ["tank", "engage"],
  },
  {
    label: "1-3-1 Splitpush",
    trigger: (c) => c.splitpush >= 1,
    needed: ["splitpush", "poke", "wombo"],
  },
  {
    label: "AP Burst",
    trigger: (c) => c.burst >= 2,
    needed: ["burst", "engage", "pick"],
  },
  {
    label: "Bruiser Brawl",
    trigger: (c) => c.skirmish >= 2 && c.sustain >= 1,
    needed: ["skirmish", "sustain", "tank"],
  },
  {
    label: "Standard Teamfight",
    trigger: (c) => c.engage >= 1 && c["hyper-carry"] >= 1,
    needed: ["engage", "peel", "hyper-carry"],
  },
];

// ─── Misc constants ─────────────────────────────────────────────────────────

export const FALLBACK_META: ChampionMeta = {
  phase: "mid",
  archetypes: ["skirmish"],
  cc: "soft",
  mobility: "medium",
  metaTiers: {},
};

// All sampling parameters below are intuition-tuned. Picks are more
// sample-driven (variety matters across runs); bans are more deterministic
// (a wrong ban tends to lose the game; a wrong pick can be salvaged by the
// rest of the draft). Fine-tuning would benefit from playthroughs.

// PICK_TOP_N = 3
// Number of top-scored candidates to sample from when the AI picks. Larger
// = more variety, but past 5 the marginal options become noticeably weak
// vs the top choice.
export const PICK_TOP_N = 3;

// PICK_TEMPERATURE = 2.0
// Softmax temperature for pick sampling. With temperature 2 and a +3 score
// gap, the lower candidate has ~22% relative weight (so chosen wins ~70%).
// Higher = more random picks; lower = more deterministic.
export const PICK_TEMPERATURE = 2.0;

// POCKET_PICK_PROB = 0.05
// Chance per pick to widen sampling pool to top-7 instead of top-3, giving
// a "pocket pick" surprise. 5% means ~1 in 20 picks is a wildcard — visible
// but not destructive across a single draft (4-5 picks per side).
export const POCKET_PICK_PROB = 0.05;
export const POCKET_PICK_TOP_N = 7;

// BAN_TOP_N = 3, BAN_TEMPERATURE = 1.5
// Bans are weighted slightly more toward determinism than picks because the
// scoring signal is generally cleaner (anticipation + threat are concrete
// negative values, not relative comparisons).
export const BAN_TOP_N = 3;
export const BAN_TEMPERATURE = 1.5;

// LOOKAHEAD_TOP_K = 5
// Lookahead is expensive (1 prediction call per candidate, each costing N
// scoring evaluations). Limiting to top-5 keeps the cost bounded — only
// the realistic candidates get re-evaluated. Past top-5 the candidate is
// rarely going to win the sampling roll anyway.
export const LOOKAHEAD_TOP_K = 5;
