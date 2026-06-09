// Curated champion meta-dataset for the match simulator.
//
// SOURCE: community-consensus knowledge (LoL Wiki, Mobalytics, op.gg patterns)
// for the 2024–2026 patches. There is no public API that classifies champions
// by power-curve, archetype, mobility, CC type, or tier — these are hand-tagged.
// Review when:
//   • a champion gets reworked (recent: Skarner, Aurelion Sol, Udyr, Shyvana)
//   • a new champion releases (verify alias matches CommunityDragon)
//   • the meta shifts a champion's typical power curve significantly
//   • a balance patch significantly changes a champion's tier
//
// Aliases match the `alias` field returned by CommunityDragon (Riot internal).
// Notable quirks: Wukong → "MonkeyKing", Nunu & Willump → "Nunu",
// Renata Glasc → "Renata", K'Sante → "KSante".
//
// Mobility classification rule of thumb:
//   high   — has a real dash/blink/jump on a short cooldown (Riven Q, Lee Sin Q,
//            Kassadin R, Akali E, Yasuo E on minions). Stays mobile in fights.
//   medium — one strong mobility tool on long CD or speed buff (Camille E,
//            Pantheon W, Fiora Q, Sivir R, Xayah E recall).
//   low    — stationary or only slow/zone control (Veigar, Jinx, Karthus,
//            most enchanters and traditional control mages).
//
// Meta tier rule of thumb (per role, ~patch 26.08 snapshot):
//   S+   — premier, near-mandatory pick or ban (3-5 per role)
//   S    — clear strong contender, regularly seen in pro/high elo
//   A    — solid, playable, depending on draft
//   B    — situational, flex, niche
//   C    — pocket pick, off-meta but viable
//   D    — weak / off-meta, not recommended
//
// metaTiers is a partial record — only roles a champion can be played in
// receive a tier. Missing roles imply "not played there meaningfully".

export type Phase = "early" | "mid" | "mid-late" | "late";
export type CC = "hard" | "soft" | "none";
export type Mobility = "low" | "medium" | "high";
export type MetaTier = "S+" | "S" | "A" | "B" | "C" | "D";

import type { Lane } from "./types";

export type Archetype =
  | "engage"
  | "peel"
  | "poke"
  | "dive"
  | "pick"
  | "wombo"
  | "hyper-carry"
  | "splitpush"
  | "assassin"
  | "tank"
  | "enchanter"
  | "burst"
  | "skirmish"
  | "sustain";

export interface ChampionMeta {
  phase: Phase;
  archetypes: Archetype[];
  cc: CC;
  mobility: Mobility;
  metaTiers: Partial<Record<Lane, MetaTier>>;
}

export const TIER_VALUE: Record<MetaTier, number> = {
  "S+": 6,
  S: 5,
  A: 4,
  B: 3,
  C: 2,
  D: 1,
};

export const TIER_ORDER: readonly MetaTier[] = ["S+", "S", "A", "B", "C", "D"];

export const CHAMPION_META: Record<string, ChampionMeta> = {
  Aatrox: {
    phase: "mid",
    archetypes: ["dive", "skirmish", "sustain"],
    cc: "hard",
    mobility: "medium",
    metaTiers: { top: "S+" },
  },
  Ahri: {
    phase: "mid",
    archetypes: ["burst", "pick", "assassin"],
    cc: "hard",
    mobility: "high",
    metaTiers: { middle: "S" },
  },
  Akali: {
    phase: "mid",
    archetypes: ["assassin", "burst"],
    cc: "none",
    mobility: "high",
    metaTiers: { middle: "S+", top: "A" },
  },
  Akshan: {
    phase: "mid",
    archetypes: ["skirmish", "pick"],
    cc: "none",
    mobility: "high",
    metaTiers: { middle: "B", bottom: "A" },
  },
  Alistar: {
    phase: "mid",
    archetypes: ["tank", "engage", "peel"],
    cc: "hard",
    mobility: "medium",
    metaTiers: { support: "S" },
  },
  Ambessa: {
    phase: "mid",
    archetypes: ["dive", "skirmish"],
    cc: "soft",
    mobility: "high",
    metaTiers: { top: "S+" },
  },
  Amumu: {
    phase: "mid",
    archetypes: ["tank", "engage", "wombo"],
    cc: "hard",
    mobility: "medium",
    metaTiers: { jungle: "B", support: "C" },
  },
  Anivia: {
    phase: "late",
    archetypes: ["burst", "poke", "peel"],
    cc: "hard",
    mobility: "low",
    metaTiers: { middle: "A" },
  },
  Annie: {
    phase: "mid",
    archetypes: ["burst", "wombo"],
    cc: "hard",
    mobility: "low",
    metaTiers: { middle: "B", support: "A" },
  },
  Aphelios: {
    phase: "mid-late",
    archetypes: ["hyper-carry"],
    cc: "soft",
    mobility: "low",
    metaTiers: { bottom: "S" },
  },
  Ashe: {
    phase: "mid",
    archetypes: ["poke", "pick", "peel"],
    cc: "hard",
    mobility: "low",
    metaTiers: { bottom: "S", support: "B" },
  },
  AurelionSol: {
    phase: "late",
    archetypes: ["burst", "wombo", "poke"],
    cc: "hard",
    mobility: "low",
    metaTiers: { middle: "A" },
  },
  Aurora: {
    phase: "mid",
    archetypes: ["burst", "peel"],
    cc: "soft",
    mobility: "medium",
    metaTiers: { middle: "S", top: "B" },
  },
  Azir: {
    phase: "late",
    archetypes: ["wombo", "poke", "peel"],
    cc: "hard",
    mobility: "medium",
    metaTiers: { middle: "A" },
  },
  Bard: {
    phase: "mid",
    archetypes: ["pick", "peel", "wombo"],
    cc: "hard",
    mobility: "medium",
    metaTiers: { support: "S+" },
  },
  Belveth: {
    phase: "mid-late",
    archetypes: ["skirmish", "dive", "hyper-carry"],
    cc: "hard",
    mobility: "high",
    metaTiers: { jungle: "S+" },
  },
  Blitzcrank: {
    phase: "mid",
    archetypes: ["pick", "engage"],
    cc: "hard",
    mobility: "low",
    metaTiers: { support: "A" },
  },
  Brand: {
    phase: "mid",
    archetypes: ["burst", "wombo", "poke"],
    cc: "hard",
    mobility: "low",
    metaTiers: { support: "A", middle: "B" },
  },
  Braum: {
    phase: "mid",
    archetypes: ["tank", "peel", "engage"],
    cc: "hard",
    mobility: "low",
    metaTiers: { support: "S" },
  },
  Briar: {
    phase: "mid",
    archetypes: ["skirmish", "dive", "sustain"],
    cc: "hard",
    mobility: "medium",
    metaTiers: { jungle: "S+" },
  },
  Caitlyn: {
    phase: "mid-late",
    archetypes: ["poke", "hyper-carry"],
    cc: "soft",
    mobility: "medium",
    metaTiers: { bottom: "S+" },
  },
  Camille: {
    phase: "mid",
    archetypes: ["splitpush", "dive", "skirmish"],
    cc: "hard",
    mobility: "high",
    metaTiers: { top: "S+", jungle: "B" },
  },
  Cassiopeia: {
    phase: "late",
    archetypes: ["poke", "burst", "skirmish"],
    cc: "hard",
    mobility: "low",
    metaTiers: { middle: "S", top: "B" },
  },
  Chogath: {
    phase: "mid",
    archetypes: ["tank", "engage"],
    cc: "hard",
    mobility: "low",
    metaTiers: { top: "B", jungle: "C" },
  },
  Corki: {
    phase: "mid-late",
    archetypes: ["poke", "burst"],
    cc: "none",
    mobility: "medium",
    metaTiers: { middle: "B", bottom: "A" },
  },
  Darius: {
    phase: "early",
    archetypes: ["dive", "skirmish", "sustain"],
    cc: "hard",
    mobility: "low",
    metaTiers: { top: "S" },
  },
  Diana: {
    phase: "mid",
    archetypes: ["assassin", "dive", "wombo"],
    cc: "hard",
    mobility: "high",
    metaTiers: { jungle: "S", middle: "A" },
  },
  DrMundo: {
    phase: "late",
    archetypes: ["tank", "sustain"],
    cc: "soft",
    mobility: "low",
    metaTiers: { top: "B" },
  },
  Draven: {
    phase: "early",
    archetypes: ["hyper-carry", "skirmish"],
    cc: "soft",
    mobility: "low",
    metaTiers: { bottom: "A" },
  },
  Ekko: {
    phase: "mid",
    archetypes: ["assassin", "dive"],
    cc: "hard",
    mobility: "high",
    metaTiers: { jungle: "S", middle: "A" },
  },
  Elise: {
    phase: "early",
    archetypes: ["dive", "pick"],
    cc: "hard",
    mobility: "medium",
    metaTiers: { jungle: "B", support: "C" },
  },
  Evelynn: {
    phase: "mid",
    archetypes: ["assassin", "pick"],
    cc: "hard",
    mobility: "high",
    metaTiers: { jungle: "B" },
  },
  Ezreal: {
    phase: "mid-late",
    archetypes: ["poke", "skirmish"],
    cc: "none",
    mobility: "high",
    metaTiers: { bottom: "S", middle: "B" },
  },
  Fiddlesticks: {
    phase: "mid",
    archetypes: ["wombo", "burst"],
    cc: "hard",
    mobility: "low",
    metaTiers: { jungle: "A", support: "C" },
  },
  Fiora: {
    phase: "mid",
    archetypes: ["splitpush", "skirmish"],
    cc: "hard",
    mobility: "medium",
    metaTiers: { top: "S+" },
  },
  Fizz: {
    phase: "mid",
    archetypes: ["assassin", "burst"],
    cc: "hard",
    mobility: "high",
    metaTiers: { middle: "A", top: "C" },
  },
  Galio: {
    phase: "mid",
    archetypes: ["engage", "wombo", "tank"],
    cc: "hard",
    mobility: "medium",
    metaTiers: { middle: "S", support: "A" },
  },
  Gangplank: {
    phase: "late",
    archetypes: ["splitpush", "poke"],
    cc: "soft",
    mobility: "low",
    metaTiers: { top: "A", middle: "C" },
  },
  Garen: {
    phase: "mid",
    archetypes: ["dive", "skirmish"],
    cc: "soft",
    mobility: "low",
    metaTiers: { top: "S", support: "C" },
  },
  Gnar: {
    phase: "mid",
    archetypes: ["poke", "wombo"],
    cc: "hard",
    mobility: "medium",
    metaTiers: { top: "A" },
  },
  Gragas: {
    phase: "mid",
    archetypes: ["engage", "wombo"],
    cc: "hard",
    mobility: "medium",
    metaTiers: { jungle: "B", top: "C", middle: "C" },
  },
  Graves: {
    phase: "mid",
    archetypes: ["skirmish"],
    cc: "soft",
    mobility: "medium",
    metaTiers: { jungle: "S" },
  },
  Gwen: {
    phase: "mid-late",
    archetypes: ["skirmish", "sustain", "splitpush"],
    cc: "none",
    mobility: "medium",
    metaTiers: { top: "A", jungle: "C" },
  },
  Hecarim: {
    phase: "mid",
    archetypes: ["dive", "engage"],
    cc: "hard",
    mobility: "high",
    metaTiers: { jungle: "S+" },
  },
  Heimerdinger: {
    phase: "mid",
    archetypes: ["poke", "peel"],
    cc: "hard",
    mobility: "low",
    metaTiers: { top: "B", support: "A", middle: "C" },
  },
  Hwei: {
    phase: "mid",
    archetypes: ["burst", "poke", "peel"],
    cc: "hard",
    mobility: "low",
    metaTiers: { middle: "S", support: "B" },
  },
  Illaoi: {
    phase: "mid",
    archetypes: ["skirmish", "sustain"],
    cc: "soft",
    mobility: "low",
    metaTiers: { top: "B" },
  },
  Irelia: {
    phase: "mid",
    archetypes: ["skirmish", "dive"],
    cc: "hard",
    mobility: "high",
    metaTiers: { top: "A", middle: "B" },
  },
  Ivern: {
    phase: "mid",
    archetypes: ["peel", "enchanter"],
    cc: "hard",
    mobility: "low",
    metaTiers: { jungle: "B" },
  },
  Janna: {
    phase: "mid",
    archetypes: ["peel", "enchanter"],
    cc: "hard",
    mobility: "low",
    metaTiers: { support: "S" },
  },
  JarvanIV: {
    phase: "mid",
    archetypes: ["engage", "dive"],
    cc: "hard",
    mobility: "medium",
    metaTiers: { jungle: "A" },
  },
  Jax: {
    phase: "mid-late",
    archetypes: ["splitpush", "skirmish"],
    cc: "hard",
    mobility: "high",
    metaTiers: { top: "S+", jungle: "B" },
  },
  Jayce: {
    phase: "mid",
    archetypes: ["poke"],
    cc: "hard",
    mobility: "medium",
    metaTiers: { top: "A", middle: "C" },
  },
  Jhin: {
    phase: "mid",
    archetypes: ["poke", "hyper-carry", "pick"],
    cc: "soft",
    mobility: "low",
    metaTiers: { bottom: "S+" },
  },
  Jinx: {
    phase: "late",
    archetypes: ["hyper-carry"],
    cc: "soft",
    mobility: "low",
    metaTiers: { bottom: "S" },
  },
  KSante: {
    phase: "mid",
    archetypes: ["tank", "engage", "skirmish"],
    cc: "hard",
    mobility: "medium",
    metaTiers: { top: "S" },
  },
  Kaisa: {
    phase: "mid-late",
    archetypes: ["hyper-carry", "dive"],
    cc: "soft",
    mobility: "high",
    metaTiers: { bottom: "S+" },
  },
  Kalista: {
    phase: "mid",
    archetypes: ["hyper-carry", "pick"],
    cc: "hard",
    mobility: "high",
    metaTiers: { bottom: "B" },
  },
  Karma: {
    phase: "mid",
    archetypes: ["enchanter", "poke", "peel"],
    cc: "hard",
    mobility: "low",
    metaTiers: { support: "S+", middle: "C" },
  },
  Karthus: {
    phase: "late",
    archetypes: ["wombo", "burst"],
    cc: "hard",
    mobility: "low",
    metaTiers: { jungle: "S", middle: "B" },
  },
  Kassadin: {
    phase: "late",
    archetypes: ["assassin", "skirmish"],
    cc: "soft",
    mobility: "high",
    metaTiers: { middle: "A" },
  },
  Katarina: {
    phase: "mid",
    archetypes: ["assassin", "wombo"],
    cc: "none",
    mobility: "high",
    metaTiers: { middle: "B" },
  },
  Kayle: {
    phase: "late",
    archetypes: ["hyper-carry", "splitpush"],
    cc: "soft",
    mobility: "low",
    metaTiers: { top: "A", middle: "C" },
  },
  Kayn: {
    phase: "mid",
    archetypes: ["assassin", "skirmish", "dive"],
    cc: "hard",
    mobility: "high",
    metaTiers: { jungle: "A" },
  },
  Kennen: {
    phase: "mid",
    archetypes: ["wombo", "burst"],
    cc: "hard",
    mobility: "medium",
    metaTiers: { top: "B", middle: "C" },
  },
  Khazix: {
    phase: "mid",
    archetypes: ["assassin"],
    cc: "soft",
    mobility: "high",
    metaTiers: { jungle: "S" },
  },
  Kindred: {
    phase: "mid-late",
    archetypes: ["hyper-carry", "skirmish"],
    cc: "soft",
    mobility: "medium",
    metaTiers: { jungle: "A" },
  },
  Kled: {
    phase: "mid",
    archetypes: ["dive", "engage"],
    cc: "hard",
    mobility: "medium",
    metaTiers: { top: "B", jungle: "C" },
  },
  KogMaw: {
    phase: "late",
    archetypes: ["hyper-carry"],
    cc: "soft",
    mobility: "low",
    metaTiers: { bottom: "A" },
  },
  Leblanc: {
    phase: "mid",
    archetypes: ["assassin", "burst", "pick"],
    cc: "hard",
    mobility: "high",
    metaTiers: { middle: "S" },
  },
  LeeSin: {
    phase: "early",
    archetypes: ["skirmish", "dive", "engage"],
    cc: "hard",
    mobility: "high",
    metaTiers: { jungle: "S" },
  },
  Leona: {
    phase: "mid",
    archetypes: ["tank", "engage"],
    cc: "hard",
    mobility: "medium",
    metaTiers: { support: "S" },
  },
  Lillia: {
    phase: "mid",
    archetypes: ["skirmish", "wombo"],
    cc: "hard",
    mobility: "medium",
    metaTiers: { jungle: "S+", top: "C" },
  },
  Lissandra: {
    phase: "mid",
    archetypes: ["burst", "wombo"],
    cc: "hard",
    mobility: "medium",
    metaTiers: { middle: "A" },
  },
  Lucian: {
    phase: "mid",
    archetypes: ["burst", "skirmish"],
    cc: "none",
    mobility: "high",
    metaTiers: { middle: "A", bottom: "S" },
  },
  Lulu: {
    phase: "mid",
    archetypes: ["peel", "enchanter"],
    cc: "hard",
    mobility: "low",
    metaTiers: { support: "S+", middle: "C", top: "C" },
  },
  Lux: {
    phase: "mid",
    archetypes: ["poke", "burst", "peel"],
    cc: "hard",
    mobility: "low",
    metaTiers: { support: "A", middle: "B" },
  },
  Malphite: {
    phase: "mid",
    archetypes: ["tank", "engage", "wombo"],
    cc: "hard",
    mobility: "medium",
    metaTiers: { top: "A", support: "B" },
  },
  Malzahar: {
    phase: "mid",
    archetypes: ["burst", "pick"],
    cc: "hard",
    mobility: "low",
    metaTiers: { middle: "A" },
  },
  Maokai: {
    phase: "mid",
    archetypes: ["tank", "engage"],
    cc: "hard",
    mobility: "low",
    metaTiers: { support: "S", top: "A", jungle: "C" },
  },
  MasterYi: {
    phase: "mid-late",
    archetypes: ["skirmish", "splitpush"],
    cc: "none",
    mobility: "high",
    metaTiers: { jungle: "S" },
  },
  Mel: {
    phase: "mid",
    archetypes: ["burst", "peel"],
    cc: "hard",
    mobility: "low",
    metaTiers: { middle: "S+", support: "B" },
  },
  Milio: {
    phase: "mid",
    archetypes: ["peel", "enchanter"],
    cc: "hard",
    mobility: "low",
    metaTiers: { support: "S+" },
  },
  MissFortune: {
    phase: "mid",
    archetypes: ["wombo", "poke"],
    cc: "soft",
    mobility: "medium",
    metaTiers: { bottom: "S", support: "B" },
  },
  MonkeyKing: {
    phase: "mid",
    archetypes: ["dive", "wombo"],
    cc: "hard",
    mobility: "medium",
    metaTiers: { top: "B", jungle: "A" },
  }, // Wukong
  Mordekaiser: {
    phase: "mid",
    archetypes: ["dive", "skirmish", "sustain"],
    cc: "hard",
    mobility: "low",
    metaTiers: { top: "S", jungle: "C" },
  },
  Morgana: {
    phase: "mid",
    archetypes: ["peel", "pick"],
    cc: "hard",
    mobility: "low",
    metaTiers: { support: "S", middle: "B" },
  },
  Naafiri: {
    phase: "mid",
    archetypes: ["assassin", "dive"],
    cc: "none",
    mobility: "high",
    metaTiers: { middle: "S", jungle: "C" },
  },
  Nami: {
    phase: "mid",
    archetypes: ["enchanter", "peel", "wombo"],
    cc: "hard",
    mobility: "low",
    metaTiers: { support: "S+" },
  },
  Nasus: {
    phase: "late",
    archetypes: ["splitpush", "skirmish", "sustain"],
    cc: "soft",
    mobility: "low",
    metaTiers: { top: "B" },
  },
  Nautilus: {
    phase: "mid",
    archetypes: ["tank", "engage", "pick"],
    cc: "hard",
    mobility: "medium",
    metaTiers: { support: "S" },
  },
  Neeko: {
    phase: "mid",
    archetypes: ["burst", "wombo"],
    cc: "hard",
    mobility: "medium",
    metaTiers: { middle: "A", support: "A" },
  },
  Nidalee: {
    phase: "early",
    archetypes: ["poke", "skirmish"],
    cc: "soft",
    mobility: "high",
    metaTiers: { jungle: "B" },
  },
  Nilah: {
    phase: "mid-late",
    archetypes: ["hyper-carry", "skirmish"],
    cc: "hard",
    mobility: "medium",
    metaTiers: { bottom: "A" },
  },
  Nocturne: {
    phase: "mid",
    archetypes: ["dive", "engage", "assassin"],
    cc: "hard",
    mobility: "high",
    metaTiers: { jungle: "A", middle: "C" },
  },
  Nunu: {
    phase: "mid",
    archetypes: ["engage", "peel"],
    cc: "hard",
    mobility: "low",
    metaTiers: { jungle: "A" },
  },
  Olaf: {
    phase: "early",
    archetypes: ["skirmish", "dive"],
    cc: "soft",
    mobility: "low",
    metaTiers: { top: "A", jungle: "S" },
  },
  Orianna: {
    phase: "mid",
    archetypes: ["wombo", "peel", "poke"],
    cc: "hard",
    mobility: "low",
    metaTiers: { middle: "S" },
  },
  Ornn: {
    phase: "mid",
    archetypes: ["tank", "engage", "wombo"],
    cc: "hard",
    mobility: "low",
    metaTiers: { top: "B" },
  },
  Pantheon: {
    phase: "early",
    archetypes: ["dive", "engage"],
    cc: "hard",
    mobility: "medium",
    metaTiers: { support: "A", top: "B", middle: "C", jungle: "C" },
  },
  Poppy: {
    phase: "mid",
    archetypes: ["tank", "engage", "peel"],
    cc: "hard",
    mobility: "medium",
    metaTiers: { top: "A", support: "A", jungle: "B" },
  },
  Pyke: {
    phase: "mid",
    archetypes: ["pick", "assassin", "engage"],
    cc: "hard",
    mobility: "high",
    metaTiers: { support: "S+", middle: "C" },
  },
  Qiyana: {
    phase: "mid",
    archetypes: ["assassin", "wombo"],
    cc: "hard",
    mobility: "high",
    metaTiers: { middle: "A" },
  },
  Quinn: {
    phase: "mid",
    archetypes: ["splitpush", "skirmish"],
    cc: "hard",
    mobility: "high",
    metaTiers: { top: "A", middle: "C" },
  },
  Rakan: {
    phase: "mid",
    archetypes: ["engage", "peel", "enchanter"],
    cc: "hard",
    mobility: "high",
    metaTiers: { support: "S+" },
  },
  Rammus: {
    phase: "mid",
    archetypes: ["tank", "engage"],
    cc: "hard",
    mobility: "medium",
    metaTiers: { jungle: "A", top: "C" },
  },
  RekSai: {
    phase: "mid",
    archetypes: ["skirmish", "dive"],
    cc: "hard",
    mobility: "medium",
    metaTiers: { jungle: "B" },
  },
  Rell: {
    phase: "mid",
    archetypes: ["tank", "engage", "wombo"],
    cc: "hard",
    mobility: "medium",
    metaTiers: { support: "A", jungle: "C" },
  },
  Renata: {
    phase: "mid",
    archetypes: ["enchanter", "peel", "wombo"],
    cc: "hard",
    mobility: "low",
    metaTiers: { support: "A" },
  },
  Renekton: {
    phase: "early",
    archetypes: ["dive", "skirmish"],
    cc: "hard",
    mobility: "medium",
    metaTiers: { top: "A" },
  },
  Rengar: {
    phase: "mid",
    archetypes: ["assassin"],
    cc: "soft",
    mobility: "high",
    metaTiers: { jungle: "S", top: "C" },
  },
  Riven: {
    phase: "mid-late",
    archetypes: ["skirmish", "dive"],
    cc: "hard",
    mobility: "high",
    metaTiers: { top: "S" },
  },
  Rumble: {
    phase: "mid",
    archetypes: ["wombo", "skirmish"],
    cc: "soft",
    mobility: "low",
    metaTiers: { top: "B", middle: "C" },
  },
  Ryze: {
    phase: "mid-late",
    archetypes: ["burst", "wombo"],
    cc: "hard",
    mobility: "low",
    metaTiers: { middle: "B", top: "C" },
  },
  Samira: {
    phase: "mid",
    archetypes: ["wombo", "skirmish", "hyper-carry"],
    cc: "soft",
    mobility: "medium",
    metaTiers: { bottom: "A" },
  },
  Sejuani: {
    phase: "mid",
    archetypes: ["tank", "engage", "wombo"],
    cc: "hard",
    mobility: "medium",
    metaTiers: { jungle: "A" },
  },
  Senna: {
    phase: "late",
    archetypes: ["hyper-carry", "poke"],
    cc: "hard",
    mobility: "low",
    metaTiers: { support: "S", bottom: "A" },
  },
  Seraphine: {
    phase: "mid-late",
    archetypes: ["wombo", "peel", "enchanter"],
    cc: "hard",
    mobility: "low",
    metaTiers: { support: "A", middle: "B", bottom: "C" },
  },
  Sett: {
    phase: "mid",
    archetypes: ["dive", "skirmish", "engage"],
    cc: "hard",
    mobility: "low",
    metaTiers: { top: "S", support: "A", middle: "C" },
  },
  Shaco: {
    phase: "early",
    archetypes: ["assassin", "pick"],
    cc: "none",
    mobility: "high",
    metaTiers: { jungle: "S", support: "B" },
  },
  Shen: {
    phase: "mid",
    archetypes: ["tank", "peel", "engage"],
    cc: "hard",
    mobility: "medium",
    metaTiers: { top: "B", support: "B" },
  },
  Shyvana: {
    phase: "mid-late",
    archetypes: ["skirmish", "dive", "poke"],
    cc: "hard",
    mobility: "medium",
    metaTiers: { jungle: "A", top: "C" },
  }, // 26.06 rework
  Singed: {
    phase: "mid",
    archetypes: ["splitpush"],
    cc: "hard",
    mobility: "low",
    metaTiers: { top: "B" },
  },
  Sion: {
    phase: "mid-late",
    archetypes: ["tank", "engage"],
    cc: "hard",
    mobility: "low",
    metaTiers: { top: "B", support: "C" },
  },
  Sivir: {
    phase: "mid-late",
    archetypes: ["hyper-carry", "peel"],
    cc: "soft",
    mobility: "medium",
    metaTiers: { bottom: "A" },
  },
  Skarner: {
    phase: "mid",
    archetypes: ["tank", "engage"],
    cc: "hard",
    mobility: "medium",
    metaTiers: { jungle: "A", top: "C" },
  },
  Smolder: {
    phase: "late",
    archetypes: ["hyper-carry"],
    cc: "soft",
    mobility: "medium",
    metaTiers: { bottom: "S" },
  },
  Sona: {
    phase: "mid",
    archetypes: ["enchanter", "peel", "wombo"],
    cc: "hard",
    mobility: "low",
    metaTiers: { support: "A", middle: "C" },
  },
  Soraka: {
    phase: "mid",
    archetypes: ["enchanter", "peel"],
    cc: "soft",
    mobility: "low",
    metaTiers: { support: "S" },
  },
  Swain: {
    phase: "mid",
    archetypes: ["burst", "wombo", "sustain"],
    cc: "hard",
    mobility: "low",
    metaTiers: { support: "A", top: "B", middle: "B" },
  },
  Sylas: {
    phase: "mid",
    archetypes: ["dive", "skirmish"],
    cc: "hard",
    mobility: "high",
    metaTiers: { middle: "S+", top: "A" },
  },
  Syndra: {
    phase: "mid-late",
    archetypes: ["burst", "wombo"],
    cc: "hard",
    mobility: "low",
    metaTiers: { middle: "A" },
  },
  TahmKench: {
    phase: "mid",
    archetypes: ["tank", "peel", "sustain"],
    cc: "hard",
    mobility: "medium",
    metaTiers: { support: "A", top: "A" },
  },
  Taliyah: {
    phase: "mid",
    archetypes: ["wombo", "poke"],
    cc: "hard",
    mobility: "medium",
    metaTiers: { middle: "A", jungle: "A" },
  },
  Talon: {
    phase: "mid",
    archetypes: ["assassin"],
    cc: "soft",
    mobility: "high",
    metaTiers: { middle: "A", jungle: "B" },
  },
  Taric: {
    phase: "mid",
    archetypes: ["tank", "peel", "engage"],
    cc: "hard",
    mobility: "low",
    metaTiers: { support: "A" },
  },
  Teemo: {
    phase: "mid-late",
    archetypes: ["splitpush", "poke"],
    cc: "soft",
    mobility: "low",
    metaTiers: { top: "B", middle: "C", support: "C" },
  },
  Thresh: {
    phase: "mid-late",
    archetypes: ["pick", "engage", "peel"],
    cc: "hard",
    mobility: "low",
    metaTiers: { support: "S+" },
  },
  Tristana: {
    phase: "mid-late",
    archetypes: ["hyper-carry", "dive"],
    cc: "hard",
    mobility: "high",
    metaTiers: { bottom: "S", middle: "B" },
  },
  Trundle: {
    phase: "mid",
    archetypes: ["dive", "skirmish", "splitpush"],
    cc: "soft",
    mobility: "low",
    metaTiers: { jungle: "A", top: "A" },
  },
  Tryndamere: {
    phase: "mid-late",
    archetypes: ["splitpush", "skirmish"],
    cc: "soft",
    mobility: "medium",
    metaTiers: { top: "A" },
  },
  TwistedFate: {
    phase: "mid",
    archetypes: ["pick", "wombo"],
    cc: "hard",
    mobility: "medium",
    metaTiers: { middle: "A", support: "C" },
  },
  Twitch: {
    phase: "late",
    archetypes: ["hyper-carry", "poke"],
    cc: "soft",
    mobility: "low",
    metaTiers: { bottom: "S", jungle: "C" },
  },
  Udyr: {
    phase: "mid",
    archetypes: ["skirmish", "dive"],
    cc: "hard",
    mobility: "medium",
    metaTiers: { jungle: "A" },
  },
  Urgot: {
    phase: "mid",
    archetypes: ["dive", "sustain"],
    cc: "hard",
    mobility: "medium",
    metaTiers: { top: "A" },
  },
  Varus: {
    phase: "mid",
    archetypes: ["poke", "hyper-carry"],
    cc: "hard",
    mobility: "low",
    metaTiers: { bottom: "A", support: "B" },
  },
  Vayne: {
    phase: "late",
    archetypes: ["hyper-carry", "splitpush"],
    cc: "hard",
    mobility: "high",
    metaTiers: { bottom: "S+", top: "C" },
  },
  Veigar: {
    phase: "late",
    archetypes: ["burst", "wombo"],
    cc: "hard",
    mobility: "low",
    metaTiers: { middle: "S", support: "B" },
  },
  Velkoz: {
    phase: "mid",
    archetypes: ["poke", "burst"],
    cc: "hard",
    mobility: "low",
    metaTiers: { middle: "A", support: "A" },
  },
  Vex: {
    phase: "mid",
    archetypes: ["burst", "peel"],
    cc: "hard",
    mobility: "medium",
    metaTiers: { middle: "A", support: "B" },
  },
  Vi: {
    phase: "mid",
    archetypes: ["engage", "dive"],
    cc: "hard",
    mobility: "medium",
    metaTiers: { jungle: "A" },
  },
  Viego: {
    phase: "mid",
    archetypes: ["skirmish", "dive"],
    cc: "hard",
    mobility: "medium",
    metaTiers: { jungle: "A" },
  },
  Viktor: {
    phase: "mid-late",
    archetypes: ["wombo", "burst"],
    cc: "hard",
    mobility: "low",
    metaTiers: { middle: "A" },
  },
  Vladimir: {
    phase: "mid-late",
    archetypes: ["sustain", "burst", "wombo"],
    cc: "soft",
    mobility: "low",
    metaTiers: { middle: "B", top: "B" },
  },
  Volibear: {
    phase: "mid",
    archetypes: ["dive", "skirmish"],
    cc: "hard",
    mobility: "medium",
    metaTiers: { top: "A", jungle: "A" },
  },
  Warwick: {
    phase: "mid",
    archetypes: ["dive", "skirmish", "sustain"],
    cc: "hard",
    mobility: "medium",
    metaTiers: { jungle: "A", top: "B" },
  },
  Xayah: {
    phase: "mid-late",
    archetypes: ["hyper-carry", "peel"],
    cc: "hard",
    mobility: "medium",
    metaTiers: { bottom: "S" },
  },
  Xerath: {
    phase: "mid",
    archetypes: ["poke", "burst"],
    cc: "hard",
    mobility: "low",
    metaTiers: { middle: "B", support: "A" },
  },
  XinZhao: {
    phase: "mid",
    archetypes: ["engage", "dive"],
    cc: "hard",
    mobility: "medium",
    metaTiers: { jungle: "A" },
  },
  Yasuo: {
    phase: "mid",
    archetypes: ["skirmish", "wombo"],
    cc: "hard",
    mobility: "high",
    metaTiers: { middle: "S+", top: "A" },
  },
  Yone: {
    phase: "mid",
    archetypes: ["skirmish", "dive"],
    cc: "hard",
    mobility: "high",
    metaTiers: { middle: "S+", top: "A" },
  },
  Yorick: {
    phase: "mid-late",
    archetypes: ["splitpush", "sustain"],
    cc: "soft",
    mobility: "low",
    metaTiers: { top: "A" },
  },
  Yunara: {
    phase: "mid-late",
    archetypes: ["hyper-carry", "skirmish"],
    cc: "soft",
    mobility: "medium",
    metaTiers: { bottom: "S+" },
  }, // 25.14 release — magic-crit ADC
  Yuumi: {
    phase: "mid",
    archetypes: ["enchanter", "peel"],
    cc: "hard",
    mobility: "high",
    metaTiers: { support: "S+" },
  }, // attached W
  Zac: {
    phase: "mid",
    archetypes: ["tank", "engage", "wombo"],
    cc: "hard",
    mobility: "medium",
    metaTiers: { jungle: "A", support: "C" },
  },
  Zaahen: {
    phase: "mid-late",
    archetypes: ["skirmish", "dive", "sustain"],
    cc: "hard",
    mobility: "medium",
    metaTiers: { top: "S+", jungle: "A" },
  }, // 25.23 release — Darkin fighter, launched overtuned
  Zed: {
    phase: "mid",
    archetypes: ["assassin"],
    cc: "soft",
    mobility: "high",
    metaTiers: { middle: "A" },
  },
  Zeri: {
    phase: "mid-late",
    archetypes: ["hyper-carry", "skirmish"],
    cc: "soft",
    mobility: "high",
    metaTiers: { bottom: "S+" },
  },
  Ziggs: {
    phase: "mid-late",
    archetypes: ["poke", "burst"],
    cc: "hard",
    mobility: "low",
    metaTiers: { middle: "B", bottom: "A" },
  },
  Zilean: {
    phase: "mid",
    archetypes: ["peel", "enchanter"],
    cc: "hard",
    mobility: "low",
    metaTiers: { support: "A", middle: "C" },
  },
  Zoe: {
    phase: "mid",
    archetypes: ["burst", "pick"],
    cc: "hard",
    mobility: "medium",
    metaTiers: { middle: "A" },
  },
  Zyra: {
    phase: "mid",
    archetypes: ["burst", "wombo"],
    cc: "hard",
    mobility: "low",
    metaTiers: { support: "A", middle: "C" },
  },
};

export function getChampionMeta(alias: string): ChampionMeta | null {
  return CHAMPION_META[alias] ?? null;
}

// ─── Meta override (randomized meta) ─────────────────────────────────────
// A user-applied override that swaps tiers per (alias, lane). When set, all
// tier lookups consult this first; falling through to CHAMPION_META otherwise.
// Stored as module state so non-React consumers (matchSimulator) see the
// active override without prop drilling.

export type MetaOverride = Record<string, Partial<Record<Lane, MetaTier>>>;

let _activeOverride: MetaOverride | null = null;
// Global "meta enabled" flag. When false, getMetaTier returns null for
// everyone — effectively flattening the meta so the AI and simulator
// treat all champions as equivalent in their playable lanes. Useful for
// users who want to draft / sim without the meta tier list nudging
// outcomes.
let _metaEnabled = true;

export function setActiveMetaOverride(o: MetaOverride | null): void {
  _activeOverride = o;
}

export function getActiveMetaOverride(): MetaOverride | null {
  return _activeOverride;
}

export function setMetaEnabled(b: boolean): void {
  _metaEnabled = b;
}

export function getMetaEnabled(): boolean {
  return _metaEnabled;
}

// Returns the active tier for (alias, lane). When an override is active and
// has an entry for this champion, the override is AUTHORITATIVE — lanes not
// listed in the override are treated as "not played" (returns null), even if
// the baseline had them. This means randomizing the meta can drop a champion
// from off-role tier lists (Pantheon's baseline mid/jg "C" disappears unless
// the override re-includes them).
//
// If no override entry exists for the champion at all (e.g., default meta or
// the champion wasn't part of the randomization), the baseline applies.
export function getMetaTier(alias: string, lane: Lane): MetaTier | null {
  // Meta disabled — treat the world as if no tier data exists. AI's
  // bestLaneTierValue falls back to "C" baseline; simulator's
  // metaStrengthScore averages out; UI hides the tier badges.
  if (!_metaEnabled) return null;
  if (_activeOverride) {
    const overrideTiers = _activeOverride[alias];
    if (overrideTiers !== undefined) {
      return overrideTiers[lane] ?? null;
    }
  }
  const meta = CHAMPION_META[alias];
  if (!meta) return null;
  return meta.metaTiers[lane] ?? null;
}

// Returns the active tier map for a champion. Same authoritative semantics
// as getMetaTier — when override has the champion, it fully replaces the
// baseline tiers (no merging).
export function getMetaTiers(alias: string): Partial<Record<Lane, MetaTier>> {
  if (_activeOverride) {
    const override = _activeOverride[alias];
    if (override !== undefined) return { ...override };
  }
  return CHAMPION_META[alias]?.metaTiers ?? {};
}

const ALL_LANES: readonly Lane[] = [
  "top",
  "jungle",
  "middle",
  "bottom",
  "support",
];

// Map a numeric tier value back to its tier label. TIER_ORDER runs S+→D
// for values 6→1, so the index is (6 - value).
function tierForValue(value: number): MetaTier {
  const clamped = Math.max(TIER_VALUE.D, Math.min(TIER_VALUE["S+"], value));
  return TIER_ORDER[TIER_VALUE["S+"] - clamped];
}

// The tier a champion effectively has in a lane, INCLUDING an off-position
// fallback. When the champion has an explicit tier for the lane, that wins.
// Otherwise — a champion played off its meta roles — the tier is derived
// from the tiers it DOES have: the median of its known tiers, floored to a
// whole tier, then dropped one notch (floored at D). Rationale: an off-role
// pick is meaningfully worse than the champion's real footprint, but a
// strong champion flexed into a NEARBY role it can still play is better than
// a baseline pocket pick, and a weak champion stays weak.
//
// When `playableLanes` is supplied (the champion's Meraki roles) and the
// lane is NOT one of them, the champion is being forced into a role it can't
// really play — it floors at "D" (hard off-meta) no matter how strong it is
// in its real roles. That's the realistic outcome: a mid-only champion
// jammed into support is bad regardless of its mid tier. A champion that CAN
// play the lane but simply lacks a meta tier there gets the softer median-1
// fallback. Omit `playableLanes` to skip the gate (callers that only want
// the strength-based fallback, e.g. the champ-select badge, which already
// renders only champions that play the filtered lane).
//
// Returns null only when meta is disabled, or the champion has no tier in
// ANY lane (truly unknown) — callers keep their own last-resort default
// (historically "C") for that case.
export function getEffectiveTier(
  alias: string,
  lane: Lane,
  playableLanes?: readonly Lane[],
): MetaTier | null {
  const explicit = getMetaTier(alias, lane);
  if (explicit) return explicit;
  // getMetaTier returns null when the meta is disabled; mirror that so the
  // fallback never resurrects tier data the user turned off.
  if (!_metaEnabled) return null;
  const known: number[] = [];
  for (const l of ALL_LANES) {
    if (l === lane) continue;
    const t = getMetaTier(alias, l);
    if (t) known.push(TIER_VALUE[t]);
  }
  if (known.length === 0) return null;
  // Out-of-position realism: a champion shoved into a lane it can't play is
  // hard off-meta, full stop — strength in its real roles doesn't carry over.
  if (playableLanes && !playableLanes.includes(lane)) return "D";
  known.sort((a, b) => a - b);
  const mid =
    known.length % 2 === 1
      ? known[(known.length - 1) / 2]
      : (known[known.length / 2 - 1] + known[known.length / 2]) / 2;
  // Floor the median toward the lower tier, then drop one notch.
  return tierForValue(Math.floor(mid) - 1);
}

// ─── Meta override serialization ───────────────────────────────────────────
//
// Format used for exporting / importing custom meta tier lists. Wrapped in
// a versioned envelope so the format can evolve without breaking imports.
//
//   {
//     "version": 1,
//     "exportedAt": "2026-04-30T12:34:56Z",
//     "tiers": {
//       "Aatrox":   { "top": "S+" },
//       "Caitlyn":  { "bottom": "S+" },
//       ...
//     }
//   }

const META_EXPORT_VERSION = 1;
const VALID_LANES: ReadonlySet<Lane> = new Set([
  "top",
  "jungle",
  "middle",
  "bottom",
  "support",
]);
const VALID_TIERS: ReadonlySet<MetaTier> = new Set(TIER_ORDER);

export function serializeMetaOverride(override: MetaOverride): string {
  // Sort keys alphabetically so diffs and copy-pastes are stable.
  const sortedAliases = Object.keys(override).sort();
  const tiers: MetaOverride = {};
  for (const alias of sortedAliases) {
    const championTiers = override[alias];
    if (!championTiers) continue;
    // Drop empty entries (no lanes set) — they convey no information.
    const lanes = Object.keys(championTiers) as Lane[];
    if (lanes.length === 0) continue;
    // Sort lanes by canonical positional order so the JSON reads naturally.
    const sortedLanes: Partial<Record<Lane, MetaTier>> = {};
    for (const l of [
      "top",
      "jungle",
      "middle",
      "bottom",
      "support",
    ] as Lane[]) {
      const tier = championTiers[l];
      if (tier) sortedLanes[l] = tier;
    }
    tiers[alias] = sortedLanes;
  }
  const envelope = {
    version: META_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    tiers,
  };
  return JSON.stringify(envelope, null, 2);
}

export interface ParseMetaResult {
  override: MetaOverride | null;
  error: string | null;
  // Counts for user feedback after a successful parse.
  championCount: number;
  skippedEntries: number;
}

// ─── Encoded meta codes (opaque copy/paste format) ────────────────────────
//
// Deflate-compressed + base64url-encoded MetaOverride, prefixed so the
// format is self-describing. Looks like `META1:H4sIAAAA...`. Compared to
// raw JSON the encoded form is:
//   • Roughly half the size (a full meta is ~3 kB JSON → ~1.3 kB code).
//   • Opaque — no champion names or tiers visible to the user, so it
//     reads as a "share code" rather than editable data.
//   • URL-safe — base64url uses `-_` not `+/=` so it survives query strings.
//   • Reversible (no key/secret needed; this is encoding, not encryption).
//
// `encodeMetaOverride` is async because CompressionStream is async. The
// import path also accepts raw JSON for backward compatibility with codes
// users may have copied before this format existed.

const META_CODE_PREFIX = "META1:";

async function deflate(input: string): Promise<Uint8Array> {
  const stream = new Blob([input])
    .stream()
    .pipeThrough(new CompressionStream("deflate-raw"));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

async function inflate(bytes: Uint8Array): Promise<string> {
  const stream = new Blob([bytes])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return await new Response(stream).text();
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  // String.fromCharCode in a loop is fine for kB-scale payloads (avoids
  // call-stack issues from spreading big TypedArrays into apply).
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlDecode(input: string): Uint8Array {
  const sanitized = input.replace(/-/g, "+").replace(/_/g, "/");
  // base64 requires length to be a multiple of 4 — repad with `=`.
  const padding = (4 - (sanitized.length % 4)) % 4;
  const padded = sanitized + "=".repeat(padding);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

export async function encodeMetaOverride(
  override: MetaOverride,
): Promise<string> {
  // Reuse the existing JSON serializer so encoded output matches what
  // `parseMetaOverride` expects after decompression — single source of
  // truth for the on-the-wire format.
  const json = serializeMetaOverride(override);
  const compressed = await deflate(json);
  return META_CODE_PREFIX + base64UrlEncode(compressed);
}

export async function decodeMetaOverride(
  input: string,
  validAliases?: ReadonlySet<string>,
): Promise<ParseMetaResult> {
  const trimmed = input.trim();
  if (trimmed.startsWith(META_CODE_PREFIX)) {
    let json: string;
    try {
      const b64 = trimmed.slice(META_CODE_PREFIX.length);
      const bytes = base64UrlDecode(b64);
      json = await inflate(bytes);
    } catch (e) {
      return {
        override: null,
        error: `Invalid meta code: ${e instanceof Error ? e.message : "decode failed"}`,
        championCount: 0,
        skippedEntries: 0,
      };
    }
    return parseMetaOverride(json, validAliases);
  }
  // Backward-compat: also accept raw JSON. Same forgiving parser.
  return parseMetaOverride(trimmed, validAliases);
}

// Parse a JSON string into a MetaOverride. Forgiving: silently skips
// unknown champion aliases (rosters change between patches), invalid lanes,
// and invalid tiers. Hard-fails only on structural problems (not JSON,
// missing tiers object, etc.).
//
// `validAliases` is optional. When provided, alias entries that aren't in
// the set are dropped (not an error — Riot champion list can change).
// When omitted, all syntactically-valid aliases are kept.
export function parseMetaOverride(
  json: string,
  validAliases?: ReadonlySet<string>,
): ParseMetaResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    return {
      override: null,
      error: `Invalid JSON: ${e instanceof Error ? e.message : "parse error"}`,
      championCount: 0,
      skippedEntries: 0,
    };
  }
  if (parsed == null || typeof parsed !== "object") {
    return {
      override: null,
      error: "Expected a JSON object at the root",
      championCount: 0,
      skippedEntries: 0,
    };
  }
  // Allow either an envelope (with tiers field) or a bare MetaOverride. The
  // bare form is convenient for users who want to type the JSON by hand.
  const envelope = parsed as { version?: unknown; tiers?: unknown };
  let rawTiers: unknown;
  if (envelope.tiers !== undefined) {
    if (
      typeof envelope.version === "number" &&
      envelope.version > META_EXPORT_VERSION
    ) {
      // Newer format — try to parse anyway but warn.
      console.warn(
        `[meta] Importing meta version ${envelope.version} (current is ${META_EXPORT_VERSION}); some fields may be ignored`,
      );
    }
    rawTiers = envelope.tiers;
  } else {
    // Bare MetaOverride form.
    rawTiers = parsed;
  }
  if (
    rawTiers == null ||
    typeof rawTiers !== "object" ||
    Array.isArray(rawTiers)
  ) {
    return {
      override: null,
      error:
        "Expected `tiers` to be an object mapping champion alias → lane tiers",
      championCount: 0,
      skippedEntries: 0,
    };
  }
  const out: MetaOverride = {};
  let championCount = 0;
  let skippedEntries = 0;
  for (const [alias, value] of Object.entries(
    rawTiers as Record<string, unknown>,
  )) {
    if (validAliases && !validAliases.has(alias)) {
      skippedEntries++;
      continue;
    }
    if (value == null || typeof value !== "object" || Array.isArray(value)) {
      skippedEntries++;
      continue;
    }
    const championTiers: Partial<Record<Lane, MetaTier>> = {};
    let kept = 0;
    for (const [laneKey, tierVal] of Object.entries(
      value as Record<string, unknown>,
    )) {
      if (!VALID_LANES.has(laneKey as Lane)) continue;
      if (typeof tierVal !== "string" || !VALID_TIERS.has(tierVal as MetaTier))
        continue;
      championTiers[laneKey as Lane] = tierVal as MetaTier;
      kept++;
    }
    if (kept === 0) {
      skippedEntries++;
      continue;
    }
    out[alias] = championTiers;
    championCount++;
  }
  return {
    override: out,
    error: null,
    championCount,
    skippedEntries,
  };
}

// ─── Champion-pair synergies ───────────────────────────────────────────────
//
// Famous champion pairings whose kits combo or amplify each other beyond what
// archetype-level scoring captures. Keys are alphabetical aliases so order
// doesn't matter when looking up. Bonus 1-3:
//   3 — iconic, frame-perfect combos that define drafts (Malphite-Yasuo)
//   2 — strong paired play patterns regularly seen in pro
//   1 — minor situational synergy
// Tag is the cast-friendly label shown in the UI.

export interface Synergy {
  champs: [string, string];
  bonus: number;
  tag: string;
}

export const CHAMPION_SYNERGIES: Synergy[] = [
  // ─── Wombo combo (knockup → AOE follow-up) ────────────────────────────────
  { champs: ["Malphite", "Yasuo"], bonus: 3, tag: "Knockup Wombo" },
  { champs: ["Orianna", "Yasuo"], bonus: 3, tag: "Shockwave Combo" },
  { champs: ["Kennen", "Malphite"], bonus: 2, tag: "Wombo AOE" },
  { champs: ["Malphite", "Orianna"], bonus: 2, tag: "Wombo AOE" },
  {
    champs: ["Malphite", "MissFortune"],
    bonus: 2,
    tag: "Knockup → Bullet Time",
  },
  { champs: ["Diana", "Kennen"], bonus: 2, tag: "Pull + AOE Stun" },
  { champs: ["Diana", "Yasuo"], bonus: 2, tag: "Wombo Combo" },
  { champs: ["Sejuani", "Yasuo"], bonus: 2, tag: "Glacial → Last Breath" },
  { champs: ["JarvanIV", "Yasuo"], bonus: 2, tag: "Cataclysm → Last Breath" },
  { champs: ["MonkeyKing", "Yasuo"], bonus: 2, tag: "Cyclone → Last Breath" },
  { champs: ["Galio", "Yasuo"], bonus: 2, tag: "Engage Wombo" },
  { champs: ["Galio", "Kennen"], bonus: 2, tag: "Multi-engage" },
  { champs: ["Amumu", "MissFortune"], bonus: 2, tag: "Curse → Bullet Time" },
  { champs: ["Amumu", "Kennen"], bonus: 2, tag: "Bandage Wombo" },
  { champs: ["Rell", "Yasuo"], bonus: 2, tag: "Crash → Last Breath" },
  { champs: ["Gnar", "Malphite"], bonus: 2, tag: "Wall Wombo" },
  { champs: ["Zac", "Yasuo"], bonus: 2, tag: "Slingshot → Last Breath" },

  // ─── Lover pair (intrinsic kit synergy) ───────────────────────────────────
  { champs: ["Rakan", "Xayah"], bonus: 2, tag: "Lovers" },

  // ─── Protect the carry ────────────────────────────────────────────────────
  { champs: ["Lulu", "Vayne"], bonus: 3, tag: "Hyper-Protect" },
  { champs: ["Lulu", "Twitch"], bonus: 2, tag: "Polymorph + Stealth" },
  { champs: ["Jinx", "Lulu"], bonus: 2, tag: "Polymorph + Hyper-Carry" },
  { champs: ["KogMaw", "Lulu"], bonus: 2, tag: "Untouchable Carry" },
  { champs: ["Janna", "Vayne"], bonus: 2, tag: "Disengage Carry" },
  { champs: ["Janna", "Tristana"], bonus: 2, tag: "Peel Hyper" },
  { champs: ["MasterYi", "Yuumi"], bonus: 3, tag: "Untargetable Splitpush" },
  { champs: ["Vayne", "Yuumi"], bonus: 2, tag: "Attached Hyper-Carry" },
  { champs: ["Kayn", "Yuumi"], bonus: 2, tag: "Attached Skirmish" },
  { champs: ["Soraka", "Twitch"], bonus: 2, tag: "Heal + Invisible Carry" },
  { champs: ["Senna", "Soraka"], bonus: 2, tag: "Sustain + Scaling" },
  { champs: ["Milio", "Vayne"], bonus: 2, tag: "Cleanse + Hyper-Carry" },
  { champs: ["Aphelios", "Milio"], bonus: 2, tag: "Cleanse Hyper" },

  // ─── Bot lane burst pairs ────────────────────────────────────────────────
  { champs: ["Lucian", "Nami"], bonus: 3, tag: "Tidecaller's Blessing" },
  { champs: ["Karma", "Lucian"], bonus: 2, tag: "Mantra Burst" },
  { champs: ["Braum", "Lucian"], bonus: 2, tag: "Concussive Combo" },
  { champs: ["Caitlyn", "Lulu"], bonus: 2, tag: "Trap Cage Lockdown" },
  { champs: ["Caitlyn", "Morgana"], bonus: 2, tag: "Bind into Trap" },

  // ─── Pick comps (catch + delete) ─────────────────────────────────────────
  { champs: ["Kalista", "Thresh"], bonus: 3, tag: "Soul Bond" },
  { champs: ["Caitlyn", "Thresh"], bonus: 2, tag: "Hook into Trap" },
  { champs: ["Thresh", "Vayne"], bonus: 2, tag: "Hook into Stun" },
  { champs: ["Lucian", "Pyke"], bonus: 2, tag: "Hook + Execute" },
  { champs: ["Pyke", "Tristana"], bonus: 2, tag: "Hook + Burst" },
  { champs: ["Blitzcrank", "Brand"], bonus: 3, tag: "Hook into Triple Proc" },
  { champs: ["Blitzcrank", "Veigar"], bonus: 2, tag: "Hook into Stun Cage" },
  { champs: ["Nautilus", "Yasuo"], bonus: 2, tag: "Hook into Wombo" },
  { champs: ["Lucian", "Nautilus"], bonus: 2, tag: "Hook + Burst" },

  // ─── Engage + lockdown ───────────────────────────────────────────────────
  { champs: ["Leona", "Lucian"], bonus: 2, tag: "Solar Flare + Burst" },
  { champs: ["Leona", "Yasuo"], bonus: 2, tag: "Engage + Wombo" },
  { champs: ["Alistar", "Tristana"], bonus: 2, tag: "Headbutt Combo" },
  { champs: ["Diana", "Rakan"], bonus: 2, tag: "Engage + Pull" },

  // ─── Splitpush + global pressure ─────────────────────────────────────────
  { champs: ["Tryndamere", "TwistedFate"], bonus: 2, tag: "1-3-1 with Global" },
  {
    champs: ["Camille", "TwistedFate"],
    bonus: 2,
    tag: "Splitpush + Map Pressure",
  },

  // ─── Crit/scaling synergies ──────────────────────────────────────────────
  { champs: ["Jhin", "Senna"], bonus: 2, tag: "Crit + Scaling Botlane" },

  // ─── More wombo combos with Yasuo (any knockup → Last Breath) ────────────
  { champs: ["LeeSin", "Yasuo"], bonus: 2, tag: "Insec → Last Breath" },
  { champs: ["Hecarim", "Yasuo"], bonus: 2, tag: "Charge Wombo" },
  { champs: ["Maokai", "Yasuo"], bonus: 2, tag: "Wave Wombo" },
  { champs: ["Volibear", "Yasuo"], bonus: 2, tag: "Stun Wombo" },
  { champs: ["Annie", "Yasuo"], bonus: 2, tag: "Tibbers Wombo" },
  { champs: ["Veigar", "Yasuo"], bonus: 2, tag: "Cage Wombo" },
  { champs: ["Alistar", "Yasuo"], bonus: 2, tag: "Pulverize → Last Breath" },
  { champs: ["Nautilus", "Veigar"], bonus: 2, tag: "Hook into Cage" },

  // ─── Pick / lockdown extensions ─────────────────────────────────────────
  { champs: ["Caitlyn", "Leona"], bonus: 2, tag: "Sun + Trap Lockdown" },
  { champs: ["Caitlyn", "Nautilus"], bonus: 2, tag: "Root + Trap" },
  { champs: ["Skarner", "Veigar"], bonus: 2, tag: "Drag into Cage" },
  { champs: ["Bard", "Twitch"], bonus: 2, tag: "Stasis + Invisible Carry" },

  // ─── Global / map pressure ──────────────────────────────────────────────
  { champs: ["Talon", "TwistedFate"], bonus: 3, tag: "Double Global Roam" },
  { champs: ["Pantheon", "TwistedFate"], bonus: 2, tag: "Global Engage" },

  // ─── Protect / scaling carry add-ons ────────────────────────────────────
  { champs: ["Jhin", "Yuumi"], bonus: 2, tag: "Attached Crit Hyper" },
  { champs: ["Karma", "Senna"], bonus: 2, tag: "Mantra Poke + Scaling" },
  { champs: ["Pantheon", "Kayle"], bonus: 2, tag: "Bully + Scaling Carry" },
  { champs: ["Kayle", "Rakan"], bonus: 2, tag: "Engage + Scaling Protect" },

  // ─── More Yasuo wombos (any AOE knockup → Last Breath) ──────────────────
  { champs: ["Amumu", "Yasuo"], bonus: 2, tag: "Curse Wombo" },
  { champs: ["Skarner", "Yasuo"], bonus: 2, tag: "Drag → Last Breath" },
  { champs: ["Pantheon", "Yasuo"], bonus: 2, tag: "Stun → Last Breath" },
  { champs: ["KSante", "Yasuo"], bonus: 2, tag: "All Out Wombo" },
  { champs: ["Diana", "MonkeyKing"], bonus: 2, tag: "Spin + Pull AOE" },

  // ─── Orianna shockwave combos ──────────────────────────────────────────
  { champs: ["JarvanIV", "Orianna"], bonus: 2, tag: "Cataclysm Shockwave" },
  { champs: ["Sejuani", "Orianna"], bonus: 2, tag: "Glacial Shockwave" },
  { champs: ["MonkeyKing", "Orianna"], bonus: 2, tag: "Cyclone Shockwave" },
  { champs: ["Amumu", "Orianna"], bonus: 2, tag: "Bandage Shockwave" },
  { champs: ["Galio", "Orianna"], bonus: 2, tag: "Engage Shockwave" },
  { champs: ["Nautilus", "Orianna"], bonus: 2, tag: "Hook Shockwave" },

  // ─── Karthus Requiem chains (CC + global execute) ──────────────────────
  { champs: ["Karthus", "Maokai"], bonus: 2, tag: "Root + Requiem" },
  { champs: ["Karthus", "Sejuani"], bonus: 2, tag: "Slow + Requiem" },
  { champs: ["Karthus", "Nautilus"], bonus: 2, tag: "Hook + Requiem" },
  { champs: ["Amumu", "Karthus"], bonus: 2, tag: "Curse + Requiem" },
  { champs: ["Karthus", "Yasuo"], bonus: 2, tag: "Wombo + Global" },

  // ─── Brand AOE pick combos ─────────────────────────────────────────────
  { champs: ["Brand", "Pyke"], bonus: 2, tag: "Hook + Triple Proc" },
  { champs: ["Brand", "Nautilus"], bonus: 2, tag: "Hook + AOE Burn" },
  { champs: ["Brand", "Morgana"], bonus: 2, tag: "Root + Triple Proc" },
  { champs: ["Brand", "Sejuani"], bonus: 2, tag: "Slow + Triple Proc" },

  // ─── Late-game scaling enchanter pairs ────────────────────────────────
  { champs: ["KogMaw", "Soraka"], bonus: 2, tag: "Heal + Late Carry" },
  { champs: ["Kayle", "Soraka"], bonus: 2, tag: "Heal + Scaling" },
  { champs: ["Kayle", "Lulu"], bonus: 2, tag: "Polymorph + Scaling" },
  { champs: ["Kayle", "Yuumi"], bonus: 2, tag: "Attached Scaling" },
  { champs: ["KogMaw", "Milio"], bonus: 2, tag: "Cleanse + Late Carry" },
  { champs: ["Milio", "Twitch"], bonus: 2, tag: "Cleanse + Stealth" },
  { champs: ["Aphelios", "Soraka"], bonus: 2, tag: "Heal + Hyper" },

  // ─── Tahm Kench eating carries (devour saves) ─────────────────────────
  { champs: ["TahmKench", "Vayne"], bonus: 2, tag: "Devour Hyper-Carry" },
  { champs: ["KogMaw", "TahmKench"], bonus: 2, tag: "Devour Late-Carry" },
  { champs: ["TahmKench", "Twitch"], bonus: 2, tag: "Devour Stealth Carry" },

  // ─── Splitpush + global pressure extras ──────────────────────────────
  { champs: ["Quinn", "TwistedFate"], bonus: 2, tag: "Sidelane + Global" },
  { champs: ["Fiora", "TwistedFate"], bonus: 2, tag: "1v1 + Map Pressure" },
  { champs: ["Singed", "Yuumi"], bonus: 2, tag: "Proxy + Untargetable" },
  { champs: ["Camille", "Fiora"], bonus: 2, tag: "Top + Jungle Splitpush" },
  { champs: ["Sion", "TwistedFate"], bonus: 2, tag: "Charge + Global" },

  // ─── Mid + jg assassin coordination ──────────────────────────────────
  { champs: ["Talon", "Zed"], bonus: 3, tag: "Double Roam Burst" },
  { champs: ["Khazix", "Rengar"], bonus: 2, tag: "Predator Pair" },
  { champs: ["Akali", "Talon"], bonus: 2, tag: "Coordinated Assassins" },
  { champs: ["Akali", "Zed"], bonus: 2, tag: "Mid + Jungle Burst" },
  { champs: ["Khazix", "Leblanc"], bonus: 2, tag: "Isolate + Burst" },

  // ─── Late-game wall + cage stalling ──────────────────────────────────
  { champs: ["Anivia", "Veigar"], bonus: 2, tag: "Wall + Cage" },
  { champs: ["Anivia", "Karthus"], bonus: 2, tag: "Wall + Requiem" },

  // ─── Engage + AOE mage finishing ─────────────────────────────────────
  { champs: ["Maokai", "Veigar"], bonus: 2, tag: "Root + Cage" },
  { champs: ["Sejuani", "Veigar"], bonus: 2, tag: "Slow + Cage" },
  { champs: ["Leona", "Veigar"], bonus: 2, tag: "Sun + Cage" },

  // ─── Pyke + Thresh hook chain ────────────────────────────────────────
  { champs: ["Pyke", "Thresh"], bonus: 2, tag: "Double Hook" },

  // ─── Heavy CC chain lockdown ─────────────────────────────────────────
  { champs: ["Leona", "Morgana"], bonus: 2, tag: "Sun + Root" },
  { champs: ["Morgana", "Nautilus"], bonus: 2, tag: "Hook Root Chain" },
  { champs: ["Lissandra", "Sejuani"], bonus: 2, tag: "Frozen Tomb Lockdown" },

  // ─── Yuumi exotic attachments ────────────────────────────────────────
  { champs: ["Briar", "Yuumi"], bonus: 2, tag: "Rabid Splitpush" },
  { champs: ["Olaf", "Yuumi"], bonus: 2, tag: "Berserker Attached" },
  { champs: ["Jax", "Yuumi"], bonus: 2, tag: "Splitpush Attached" },

  // ─── Vayne extra peels ───────────────────────────────────────────────
  { champs: ["Renata", "Vayne"], bonus: 2, tag: "Berserk + Hyper-Carry" },

  // ─── Lucian + alternate enchanter ────────────────────────────────────
  { champs: ["Lucian", "Lulu"], bonus: 2, tag: "Polymorph + Burst" },
  { champs: ["Lucian", "Milio"], bonus: 2, tag: "Cleanse + Burst" },

  // ─── Jarvan IV cataclysm wombo (arena trap + AOE) ────────────────────
  { champs: ["JarvanIV", "Rumble"], bonus: 3, tag: "Cataclysm + Equalizer" },
  { champs: ["Galio", "JarvanIV"], bonus: 2, tag: "Cataclysm + Idol Durand" },
  {
    champs: ["JarvanIV", "Lissandra"],
    bonus: 2,
    tag: "Cataclysm + Frozen Tomb",
  },
  {
    champs: ["Anivia", "JarvanIV"],
    bonus: 2,
    tag: "Cataclysm + Glacial Storm",
  },
  { champs: ["JarvanIV", "Kennen"], bonus: 2, tag: "Cataclysm + Maelstrom" },
  { champs: ["JarvanIV", "Ziggs"], bonus: 2, tag: "Cataclysm + Mega Inferno" },
  { champs: ["Brand", "JarvanIV"], bonus: 2, tag: "Cataclysm + Pyroclasm" },
  { champs: ["Diana", "JarvanIV"], bonus: 2, tag: "Cataclysm + Moonfall" },
  { champs: ["JarvanIV", "Veigar"], bonus: 2, tag: "Cataclysm + Cage" },

  // ─── Ahri charm setups (mid laner pulls into engage) ─────────────────
  { champs: ["Ahri", "Vi"], bonus: 3, tag: "Charm + Vault Breaker" },
  { champs: ["Ahri", "JarvanIV"], bonus: 2, tag: "Charm + Cataclysm" },
  { champs: ["Ahri", "Rumble"], bonus: 2, tag: "Charm + Equalizer" },
  { champs: ["Ahri", "LeeSin"], bonus: 2, tag: "Charm + Insec" },
  { champs: ["Ahri", "Talon"], bonus: 2, tag: "Charm Roam Pair" },
  { champs: ["Ahri", "Sejuani"], bonus: 2, tag: "Charm + Glacial" },
  { champs: ["Ahri", "Pyke"], bonus: 2, tag: "Charm + Execute" },
  { champs: ["Ahri", "Hecarim"], bonus: 2, tag: "Charm + Charge" },
  { champs: ["Ahri", "Diana"], bonus: 2, tag: "Charm + Moonfall" },

  // ─── Vi vault breaker engage chains ──────────────────────────────────
  { champs: ["Orianna", "Vi"], bonus: 3, tag: "Vault Breaker + Shockwave" },
  { champs: ["Karthus", "Vi"], bonus: 2, tag: "Vault + Requiem" },
  { champs: ["Vi", "Yasuo"], bonus: 2, tag: "Vault → Last Breath" },
  { champs: ["Brand", "Vi"], bonus: 2, tag: "Vault + Pyroclasm" },
  { champs: ["Veigar", "Vi"], bonus: 2, tag: "Vault + Cage" },

  // ─── Caitlyn extra lockdowns ─────────────────────────────────────────
  { champs: ["Caitlyn", "Karma"], bonus: 2, tag: "Mantra E + Trap Range" },
  { champs: ["Caitlyn", "Sona"], bonus: 2, tag: "Crescendo + Traps" },
  { champs: ["Caitlyn", "Janna"], bonus: 2, tag: "Disengage + Traps" },
  { champs: ["Bard", "Caitlyn"], bonus: 2, tag: "Stasis + Traps" },

  // ─── Hecarim wombo extras ────────────────────────────────────────────
  { champs: ["Hecarim", "Karthus"], bonus: 2, tag: "Charge + Requiem" },
  { champs: ["Hecarim", "Kennen"], bonus: 2, tag: "Onslaught + Maelstrom" },
  { champs: ["Brand", "Hecarim"], bonus: 2, tag: "Charge + Pyroclasm" },
  { champs: ["Hecarim", "Orianna"], bonus: 2, tag: "Charge + Shockwave" },

  // ─── Diana moonfall extras ──────────────────────────────────────────
  { champs: ["Brand", "Diana"], bonus: 2, tag: "Moonfall + Pyroclasm" },
  { champs: ["Diana", "Karthus"], bonus: 2, tag: "Moonfall + Requiem" },
  { champs: ["Diana", "Veigar"], bonus: 2, tag: "Moonfall + Cage" },
  { champs: ["Diana", "Orianna"], bonus: 2, tag: "Moonfall + Shockwave" },

  // ─── Lillia sleep wombo (R AOE drowsy → setup) ──────────────────────
  { champs: ["Karthus", "Lillia"], bonus: 3, tag: "Sleep + Requiem" },
  { champs: ["Lillia", "Yasuo"], bonus: 2, tag: "Sleep → Last Breath" },
  { champs: ["Lillia", "Veigar"], bonus: 2, tag: "Sleep + Cage" },
  { champs: ["Brand", "Lillia"], bonus: 2, tag: "Sleep + Pyroclasm" },

  // ─── Yone twin (with Yasuo or Vi engage) ────────────────────────────
  { champs: ["Yasuo", "Yone"], bonus: 2, tag: "Twin Breath" },
  { champs: ["Vi", "Yone"], bonus: 2, tag: "Vault + Twin" },

  // ─── Mid + JG burst pairs ───────────────────────────────────────────
  { champs: ["Akali", "Vi"], bonus: 2, tag: "Mid + JG Burst" },
  { champs: ["LeeSin", "Veigar"], bonus: 2, tag: "Cage on Insec" },
  { champs: ["Kassadin", "LeeSin"], bonus: 2, tag: "R Blink + Insec" },

  // ─── Pick comp extras (Blitz, Pyke, Thresh) ─────────────────────────
  { champs: ["Blitzcrank", "Caitlyn"], bonus: 2, tag: "Hook + Trap" },
  { champs: ["Blitzcrank", "Vayne"], bonus: 2, tag: "Hook + Crit Hyper" },
  { champs: ["Blitzcrank", "Jhin"], bonus: 2, tag: "Hook + Killshot" },
  {
    champs: ["Blitzcrank", "MissFortune"],
    bonus: 2,
    tag: "Hook + Bullet Time",
  },
  { champs: ["Jhin", "Thresh"], bonus: 2, tag: "Hook + Killshot" },
  { champs: ["Lucian", "Thresh"], bonus: 3, tag: "Lantern Dash + Burst" },
  { champs: ["Pyke", "Vayne"], bonus: 2, tag: "Hook + Crit Stun" },
  { champs: ["Pyke", "Twitch"], bonus: 2, tag: "Stealth Pick" },
  { champs: ["Caitlyn", "Pyke"], bonus: 2, tag: "Hook + Trap" },

  // ─── Morgana root chains ────────────────────────────────────────────
  { champs: ["Lucian", "Morgana"], bonus: 2, tag: "Root + Burst" },
  { champs: ["MissFortune", "Morgana"], bonus: 2, tag: "Root + Bullet Time" },
  { champs: ["Karthus", "Morgana"], bonus: 2, tag: "Root + Requiem" },
  { champs: ["Lux", "Morgana"], bonus: 2, tag: "Root + Finales" },
  { champs: ["Maokai", "Morgana"], bonus: 2, tag: "Root Chain" },

  // ─── Nautilus + AOE ─────────────────────────────────────────────────
  { champs: ["MissFortune", "Nautilus"], bonus: 2, tag: "Hook + Bullet Time" },
  { champs: ["Nautilus", "Twitch"], bonus: 2, tag: "Hook + Spray" },
  { champs: ["Lissandra", "Nautilus"], bonus: 2, tag: "Hook + Frozen Tomb" },

  // ─── Karma + carries (Mantra E empower) ────────────────────────────
  { champs: ["Jhin", "Karma"], bonus: 2, tag: "Mantra Speed + Crit" },
  { champs: ["Karma", "Vayne"], bonus: 2, tag: "Mantra Speed + Mobile" },
  { champs: ["Ezreal", "Karma"], bonus: 2, tag: "Mantra E Empower" },

  // ─── Rakan engage carries ───────────────────────────────────────────
  { champs: ["Rakan", "Twitch"], bonus: 2, tag: "Engage + Stealth" },
  { champs: ["Rakan", "Vayne"], bonus: 2, tag: "Engage + Crit" },
  { champs: ["MissFortune", "Rakan"], bonus: 2, tag: "Engage + Bullet Time" },
  { champs: ["Aphelios", "Rakan"], bonus: 2, tag: "Engage + Late Carry" },
  { champs: ["Rakan", "Tristana"], bonus: 2, tag: "Engage + Reset" },
  { champs: ["Jinx", "Rakan"], bonus: 2, tag: "Engage + Hyper" },

  // ─── Soraka heals ───────────────────────────────────────────────────
  { champs: ["Jhin", "Soraka"], bonus: 2, tag: "Heal + Crit" },
  { champs: ["Soraka", "Tristana"], bonus: 2, tag: "Heal + Reset Hyper" },
  { champs: ["Soraka", "Vayne"], bonus: 2, tag: "Heal + Late Hyper" },

  // ─── Janna disengage + carries ─────────────────────────────────────
  { champs: ["Janna", "KogMaw"], bonus: 2, tag: "Disengage + Late Carry" },
  { champs: ["Aphelios", "Janna"], bonus: 2, tag: "Disengage + Hyper" },
  { champs: ["Janna", "Jhin"], bonus: 2, tag: "Disengage + Crit" },
  {
    champs: ["Janna", "MissFortune"],
    bonus: 2,
    tag: "Disengage + Bullet Time",
  },

  // ─── Yuumi exotic attached partners ────────────────────────────────
  { champs: ["Warwick", "Yuumi"], bonus: 2, tag: "Bloodthirst Attached" },
  { champs: ["Garen", "Yuumi"], bonus: 2, tag: "Spin Attached" },
  { champs: ["Rengar", "Yuumi"], bonus: 2, tag: "Predator Attached" },
  { champs: ["Hecarim", "Yuumi"], bonus: 2, tag: "Charge Attached" },
  { champs: ["Camille", "Yuumi"], bonus: 2, tag: "Hookshot Attached" },
  { champs: ["Fiora", "Yuumi"], bonus: 2, tag: "Splitpush Attached" },
  { champs: ["Trundle", "Yuumi"], bonus: 2, tag: "Splitpush Sustain" },

  // ─── Splitpush + global pressure extras ────────────────────────────
  { champs: ["TwistedFate", "Yorick"], bonus: 2, tag: "Splitpush + Global" },
  { champs: ["Gangplank", "TwistedFate"], bonus: 3, tag: "Double Global" },
  { champs: ["Camille", "Tryndamere"], bonus: 2, tag: "Top + JG Splitpush" },

  // ─── Heavy CC stack engage ─────────────────────────────────────────
  { champs: ["Leona", "Sejuani"], bonus: 2, tag: "Engage Stack" },
  { champs: ["Lissandra", "Rell"], bonus: 2, tag: "Stun + Frozen Tomb" },
  { champs: ["Lissandra", "Maokai"], bonus: 2, tag: "Root + Frozen Tomb" },

  // ─── KSante AOE knockup ────────────────────────────────────────────
  { champs: ["KSante", "Orianna"], bonus: 2, tag: "All Out + Shockwave" },

  // ─── Wukong + AOE mage finishers ──────────────────────────────────
  { champs: ["Karthus", "MonkeyKing"], bonus: 2, tag: "Cyclone + Requiem" },
  { champs: ["MonkeyKing", "Veigar"], bonus: 2, tag: "Cyclone + Cage" },
  { champs: ["Brand", "MonkeyKing"], bonus: 2, tag: "Cyclone + Pyroclasm" },

  // ─── Volibear + AOE mage finishers ────────────────────────────────
  { champs: ["Karthus", "Volibear"], bonus: 2, tag: "Stun + Requiem" },
  { champs: ["Veigar", "Volibear"], bonus: 2, tag: "Stun + Cage" },

  // ─── Bot lane signature pairs ─────────────────────────────────────────
  { champs: ["Aphelios", "Thresh"], bonus: 3, tag: "Hook + Late Carry" },
  { champs: ["Ashe", "Seraphine"], bonus: 3, tag: "Stun Chain Wombo" },
  { champs: ["MissFortune", "Rell"], bonus: 3, tag: "Crash + Bullet Time" },
  { champs: ["Janna", "Sivir"], bonus: 2, tag: "Spell Shield + Disengage" },

  // ─── Leona engages with carries ───────────────────────────────────────
  { champs: ["Leona", "Vayne"], bonus: 2, tag: "Sun + Crit Stun" },
  { champs: ["Leona", "Tristana"], bonus: 2, tag: "Engage + Reset" },
  { champs: ["Jhin", "Leona"], bonus: 2, tag: "Engage + Killshot" },
  { champs: ["Kaisa", "Leona"], bonus: 2, tag: "Engage + Dive" },
  { champs: ["Aphelios", "Leona"], bonus: 2, tag: "Engage + Late Carry" },
  { champs: ["Leona", "MissFortune"], bonus: 2, tag: "Sun + Bullet Time" },
  { champs: ["Ezreal", "Leona"], bonus: 2, tag: "Sun + Skillshot" },

  // ─── Nautilus engage with carries ─────────────────────────────────────
  { champs: ["Nautilus", "Vayne"], bonus: 2, tag: "Root + Crit Stun" },
  { champs: ["Nautilus", "Tristana"], bonus: 2, tag: "Hook + Reset" },
  { champs: ["Aphelios", "Nautilus"], bonus: 2, tag: "Hook + Late Carry" },
  { champs: ["Ezreal", "Nautilus"], bonus: 2, tag: "Hook + Skillshot" },
  { champs: ["Kaisa", "Nautilus"], bonus: 2, tag: "Hook + Dive" },
  { champs: ["Jinx", "Nautilus"], bonus: 2, tag: "Hook + Hyper-Carry" },
  { champs: ["Ashe", "Nautilus"], bonus: 2, tag: "Hook + Slow Chain" },

  // ─── Alistar wombo with carries ───────────────────────────────────────
  { champs: ["Alistar", "Kaisa"], bonus: 2, tag: "Pulverize + Dive" },
  { champs: ["Alistar", "Aphelios"], bonus: 2, tag: "Peel + Late Carry" },
  { champs: ["Alistar", "Twitch"], bonus: 2, tag: "Engage + Stealth Spray" },
  { champs: ["Alistar", "Jinx"], bonus: 2, tag: "Headbutt + Hyper" },

  // ─── Thresh hook + ADC variants ───────────────────────────────────────
  { champs: ["Ezreal", "Thresh"], bonus: 2, tag: "Lantern + Skillshot" },
  { champs: ["Kaisa", "Thresh"], bonus: 2, tag: "Hook + R Reset" },
  { champs: ["Ashe", "Thresh"], bonus: 2, tag: "Slow + Hook Chain" },

  // ─── Blitzcrank hook + ADC ────────────────────────────────────────────
  { champs: ["Blitzcrank", "Ezreal"], bonus: 2, tag: "Hook + Skillshot" },
  { champs: ["Blitzcrank", "Senna"], bonus: 2, tag: "Hook + Global Stun" },
  { champs: ["Ashe", "Blitzcrank"], bonus: 2, tag: "Hook + Crystal Arrow" },

  // ─── Pyke pick chains ─────────────────────────────────────────────────
  { champs: ["Aphelios", "Pyke"], bonus: 2, tag: "Hook + Late Carry" },
  { champs: ["Pyke", "Senna"], bonus: 2, tag: "Hook + Global" },
  { champs: ["Kaisa", "Pyke"], bonus: 2, tag: "Hook + Dive" },

  // ─── Mage support poke (siege bot) ────────────────────────────────────
  { champs: ["Caitlyn", "Lux"], bonus: 2, tag: "Root + Trap" },
  { champs: ["Jhin", "Lux"], bonus: 2, tag: "Root + Killshot" },
  { champs: ["Ashe", "Lux"], bonus: 2, tag: "Double Lockdown" },
  { champs: ["Caitlyn", "Xerath"], bonus: 2, tag: "Siege Poke" },
  { champs: ["Ashe", "Xerath"], bonus: 2, tag: "Long Range Poke" },
  { champs: ["Jhin", "Xerath"], bonus: 2, tag: "Long Range Snipes" },
  { champs: ["Brand", "Caitlyn"], bonus: 2, tag: "Burn + Range" },
  { champs: ["Ashe", "Brand"], bonus: 2, tag: "Slow + Triple Proc" },
  { champs: ["Brand", "Jhin"], bonus: 2, tag: "Burn + Crit" },
  { champs: ["Caitlyn", "Heimerdinger"], bonus: 2, tag: "Turret Siege" },
  { champs: ["Heimerdinger", "Jhin"], bonus: 2, tag: "Turret + Crit" },

  // ─── Nami Tidecaller's empower (any AA carry) ────────────────────────
  { champs: ["Ezreal", "Nami"], bonus: 2, tag: "Tidecaller's Q" },
  { champs: ["Nami", "Twitch"], bonus: 2, tag: "Tidecaller's Spray" },
  { champs: ["Nami", "Vayne"], bonus: 2, tag: "Tidecaller's Crit" },
  { champs: ["Jinx", "Nami"], bonus: 2, tag: "Slow + Hyper" },
  { champs: ["Aphelios", "Nami"], bonus: 2, tag: "Tidecaller's Late" },

  // ─── Renata empowered carries ────────────────────────────────────────
  { champs: ["Renata", "Twitch"], bonus: 2, tag: "Berserk + Spray" },
  { champs: ["Jinx", "Renata"], bonus: 2, tag: "Berserk + Hyper" },
  { champs: ["KogMaw", "Renata"], bonus: 2, tag: "Berserk + Late Carry" },

  // ─── Milio cleanse (anti-cc partners) ────────────────────────────────
  { champs: ["Caitlyn", "Milio"], bonus: 2, tag: "Cleanse + Range" },
  { champs: ["Jhin", "Milio"], bonus: 2, tag: "Cleanse + Crit" },

  // ─── Yuumi attached + ADC ────────────────────────────────────────────
  { champs: ["Caitlyn", "Yuumi"], bonus: 2, tag: "Attached Siege" },

  // ─── Karma bot variants ──────────────────────────────────────────────
  { champs: ["Aphelios", "Karma"], bonus: 2, tag: "Mantra + Late Carry" },

  // ─── Hecarim charges into mid mages ──────────────────────────────────
  { champs: ["Hecarim", "Lissandra"], bonus: 2, tag: "Charge + Frozen Tomb" },
  { champs: ["Anivia", "Hecarim"], bonus: 2, tag: "Charge + Glacial Storm" },
  { champs: ["Hecarim", "Veigar"], bonus: 2, tag: "Charge + Cage" },

  // ─── Vi vault breaker chains (cont.) ─────────────────────────────────
  { champs: ["Mel", "Vi"], bonus: 2, tag: "Vault + Sphere" },
  { champs: ["Anivia", "Vi"], bonus: 2, tag: "Vault + Wall Trap" },
  { champs: ["Cassiopeia", "Vi"], bonus: 2, tag: "Vault + R AOE Stun" },
  { champs: ["Lissandra", "Vi"], bonus: 2, tag: "Vault + Frozen Tomb" },

  // ─── Lee Sin insec / kick setups ─────────────────────────────────────
  { champs: ["LeeSin", "Lux"], bonus: 2, tag: "Kick + Finales" },
  { champs: ["Cassiopeia", "LeeSin"], bonus: 2, tag: "Kick + R AOE Stun" },
  { champs: ["Galio", "LeeSin"], bonus: 2, tag: "Kick + Idol Durand" },
  { champs: ["Karthus", "LeeSin"], bonus: 2, tag: "Kick + Requiem" },
  { champs: ["LeeSin", "Lissandra"], bonus: 2, tag: "Kick + Frozen Tomb" },

  // ─── Sejuani lockdown chains ─────────────────────────────────────────
  { champs: ["Anivia", "Sejuani"], bonus: 2, tag: "Glacial + Storm" },
  { champs: ["Sejuani", "Velkoz"], bonus: 2, tag: "Slow + Beam" },
  { champs: ["Sejuani", "Xerath"], bonus: 2, tag: "Slow + Snipes" },
  { champs: ["Cassiopeia", "Sejuani"], bonus: 2, tag: "Slow + R AOE Stun" },

  // ─── Jarvan + AOE/control mages (cont.) ──────────────────────────────
  { champs: ["JarvanIV", "Lux"], bonus: 2, tag: "Cataclysm + Finales" },
  { champs: ["JarvanIV", "Velkoz"], bonus: 2, tag: "Cataclysm + Beam" },
  { champs: ["Cassiopeia", "JarvanIV"], bonus: 2, tag: "Cataclysm + R Stun" },
  { champs: ["JarvanIV", "Xerath"], bonus: 2, tag: "Cataclysm + Snipes" },

  // ─── Maokai roots into AOE ───────────────────────────────────────────
  { champs: ["Anivia", "Maokai"], bonus: 2, tag: "Root + Glacial Storm" },
  { champs: ["Lux", "Maokai"], bonus: 2, tag: "Root + Finales" },

  // ─── Diana / Lillia / Wukong + Lux finishing ─────────────────────────
  { champs: ["Diana", "Lux"], bonus: 2, tag: "Moonfall + Finales" },
  { champs: ["Lillia", "Lux"], bonus: 2, tag: "Sleep + Finales" },
  { champs: ["Lux", "MonkeyKing"], bonus: 2, tag: "Cyclone + Finales" },

  // ─── Briar dive setups ───────────────────────────────────────────────
  { champs: ["Briar", "Karthus"], bonus: 2, tag: "Fear + Requiem" },
  { champs: ["Briar", "Veigar"], bonus: 2, tag: "Fear + Cage" },
  { champs: ["Briar", "Yasuo"], bonus: 2, tag: "Fear → Last Breath" },

  // ─── Skarner drag chains ─────────────────────────────────────────────
  { champs: ["Karthus", "Skarner"], bonus: 2, tag: "Drag + Requiem" },
  { champs: ["Lissandra", "Skarner"], bonus: 2, tag: "Drag + Frozen Tomb" },

  // ─── Khazix isolate ──────────────────────────────────────────────────
  { champs: ["Ahri", "Khazix"], bonus: 2, tag: "Charm + Isolate" },
  { champs: ["Khazix", "Veigar"], bonus: 2, tag: "Cage + Isolate" },

  // ─── Galio engage (mid pivot) ────────────────────────────────────────
  { champs: ["Galio", "Hecarim"], bonus: 2, tag: "Multi-engage" },
  { champs: ["Galio", "Vi"], bonus: 2, tag: "Multi-engage" },
  { champs: ["Galio", "Veigar"], bonus: 2, tag: "Engage + Cage" },
  { champs: ["Brand", "Galio"], bonus: 2, tag: "Engage + Pyroclasm" },
  { champs: ["Galio", "Karthus"], bonus: 2, tag: "Engage + Requiem" },

  // ─── Cassiopeia R AOE stun setups ────────────────────────────────────
  { champs: ["Cassiopeia", "Karthus"], bonus: 2, tag: "R Stun + Requiem" },
  { champs: ["Cassiopeia", "Veigar"], bonus: 2, tag: "R Stun + Cage" },
  { champs: ["Cassiopeia", "Yasuo"], bonus: 2, tag: "R Stun + Wombo" },

  // ─── Yone wombo finish ───────────────────────────────────────────────
  { champs: ["Karthus", "Yone"], bonus: 2, tag: "Wombo + Requiem" },
  { champs: ["Veigar", "Yone"], bonus: 2, tag: "Wombo + Cage" },

  // ─── Modern champion synergies (Aurora, Smolder, Mel, Ambessa, etc.) ──
  // Aurora — mid mage with self-knockup AOE; engages with brawlers
  { champs: ["Aurora", "Sett"], bonus: 2, tag: "Engage + Brawl" },
  { champs: ["Aurora", "Ambessa"], bonus: 2, tag: "Mid + Top Dive" },
  { champs: ["Aurora", "Briar"], bonus: 2, tag: "AOE + Bloodthirst" },
  { champs: ["Aurora", "JarvanIV"], bonus: 2, tag: "Cataclysm + AOE" },
  { champs: ["Aurora", "Vi"], bonus: 2, tag: "Vault + Knockback" },

  // Smolder — late-game stacking ADC; needs heavy peel to scale
  { champs: ["Smolder", "Lulu"], bonus: 3, tag: "Late Carry + Peel" },
  { champs: ["Smolder", "Janna"], bonus: 2, tag: "Disengage + Late Carry" },
  { champs: ["Smolder", "Soraka"], bonus: 2, tag: "Heal + Late Carry" },
  { champs: ["Smolder", "Milio"], bonus: 2, tag: "Cleanse + Late Carry" },
  {
    champs: ["Smolder", "TahmKench"],
    bonus: 2,
    tag: "Devour + Stacking Carry",
  },
  { champs: ["Smolder", "Yuumi"], bonus: 3, tag: "Attached Stacking Carry" },

  // Mel — mid mage with reflect ult; pairs with engage that forces ults
  { champs: ["Mel", "Malphite"], bonus: 2, tag: "Reflect + Wombo" },
  { champs: ["Mel", "JarvanIV"], bonus: 2, tag: "Reflect + Cataclysm" },
  { champs: ["Mel", "Sejuani"], bonus: 2, tag: "Reflect + Glacial" },
  { champs: ["Mel", "Amumu"], bonus: 2, tag: "Reflect + Bandage" },

  // Ambessa — top dive bruiser, modern champion
  { champs: ["Ambessa", "Yasuo"], bonus: 2, tag: "Dash → Last Breath" },
  { champs: ["Ambessa", "Ahri"], bonus: 2, tag: "Charm + Dive" },
  { champs: ["Ambessa", "Karthus"], bonus: 2, tag: "Dive + Requiem" },
  { champs: ["Ambessa", "Orianna"], bonus: 2, tag: "Dive + Shockwave" },

  // Briar — chaotic skirmish jungler
  { champs: ["Briar", "Lulu"], bonus: 2, tag: "Bloodthirst + Polymorph" },
  { champs: ["Briar", "Janna"], bonus: 2, tag: "Speed Up + Berserker" },
  { champs: ["Briar", "Galio"], bonus: 2, tag: "Engage + Berserker" },

  // Zaahen — Darkin top/jg skirmisher with sustained CC; pairs with engage
  // setup (he capitalizes on locked-down targets) and AOE wombo finishers.
  { champs: ["Zaahen", "Yasuo"], bonus: 2, tag: "Darkin → Last Breath" },
  { champs: ["Zaahen", "Karthus"], bonus: 2, tag: "Dive + Requiem" },
  { champs: ["Zaahen", "Orianna"], bonus: 2, tag: "Dive + Shockwave" },
  { champs: ["Zaahen", "JarvanIV"], bonus: 2, tag: "Cataclysm + Skirmish" },
  { champs: ["Zaahen", "Lulu"], bonus: 2, tag: "Polymorph + Sustain Brawl" },
  { champs: ["Zaahen", "Sejuani"], bonus: 2, tag: "Glacial + Skirmish" },
  { champs: ["Zaahen", "Yuumi"], bonus: 2, tag: "Attached Bruiser" },

  // Hwei — mid mage with multi-spell kit
  { champs: ["Hwei", "Yasuo"], bonus: 2, tag: "Multi-CC + Wombo" },
  { champs: ["Hwei", "JarvanIV"], bonus: 2, tag: "Multi-CC + Cataclysm" },
  { champs: ["Hwei", "Karthus"], bonus: 2, tag: "Multi-CC + Requiem" },

  // Naafiri — pack-hunter assassin
  { champs: ["Naafiri", "Talon"], bonus: 2, tag: "Pack Roam + Assassin" },
  { champs: ["Naafiri", "Vi"], bonus: 2, tag: "Pack + Vault" },
  { champs: ["Naafiri", "Yasuo"], bonus: 2, tag: "Pack + Wombo" },

  // K'Sante — top tank with R-form-shifting
  { champs: ["KSante", "Karthus"], bonus: 2, tag: "All Out + Requiem" },
  { champs: ["KSante", "Lillia"], bonus: 2, tag: "All Out + Sleep" },
  { champs: ["KSante", "Veigar"], bonus: 2, tag: "Knockback + Cage" },

  // ─── Engage + AOE follow-up (more thorough coverage) ─────────────────
  // Note: Sejuani+Karthus, Maokai+Karthus, Rell+Yasuo, Rell+MissFortune
  // already exist earlier in the list — not re-listed here.
  { champs: ["Rell", "Karthus"], bonus: 2, tag: "Crash + Requiem" },
  { champs: ["Rell", "Veigar"], bonus: 2, tag: "Crash + Cage" },
  { champs: ["Rell", "Orianna"], bonus: 2, tag: "Crash + Shockwave" },
  { champs: ["Rell", "Brand"], bonus: 2, tag: "Crash + Pyroclasm" },
  { champs: ["Zac", "Karthus"], bonus: 2, tag: "Slingshot + Requiem" },
  { champs: ["Zac", "Veigar"], bonus: 2, tag: "Slingshot + Cage" },
  { champs: ["Zac", "Orianna"], bonus: 2, tag: "Slingshot + Shockwave" },
  { champs: ["Zac", "MissFortune"], bonus: 2, tag: "Slingshot + Bullet Time" },

  // ─── Pick / catch chains (more enchanter + ADC variants) ─────────────
  // Caitlyn+Morgana already listed earlier — not re-listed.
  { champs: ["Morgana", "Twitch"], bonus: 2, tag: "Root + Stealth Spray" },
  { champs: ["Morgana", "Aphelios"], bonus: 2, tag: "Root + Late Carry" },
  { champs: ["Morgana", "Jhin"], bonus: 2, tag: "Root + Killshot" },
  { champs: ["Morgana", "Kalista"], bonus: 2, tag: "Root + Bond" },
  { champs: ["Pantheon", "Caitlyn"], bonus: 2, tag: "Stun + Trap" },

  // ─── Splitpush / global pressure ──────────────────────────────────────
  // Camille+Fiora already listed in mid+jg burst pairs section — not re-listed.
  { champs: ["Fiora", "Trundle"], bonus: 2, tag: "Top + JG Duel" },
  { champs: ["Jax", "Tryndamere"], bonus: 2, tag: "Late-game Splitpush" },
  { champs: ["Pantheon", "Shen"], bonus: 3, tag: "Double Global TP" },
  { champs: ["Galio", "Pantheon"], bonus: 2, tag: "Global Engage Pair" },
  { champs: ["Karthus", "Pantheon"], bonus: 2, tag: "Global Pair" },
  { champs: ["Shen", "TwistedFate"], bonus: 2, tag: "Double Global" },

  // ─── Heavy lockdown chains (3+ CC) ────────────────────────────────────
  // Sejuani+Maokai, Lissandra+Sejuani already listed earlier.
  { champs: ["Sejuani", "Maokai"], bonus: 2, tag: "Slow + Roots Chain" },
  { champs: ["Lissandra", "Veigar"], bonus: 2, tag: "Tomb + Cage" },
  { champs: ["Leona", "Lissandra"], bonus: 2, tag: "Sun + Tomb" },
  { champs: ["Amumu", "Veigar"], bonus: 2, tag: "Bandage + Cage" },

  // ─── Late-game scaling pairs ──────────────────────────────────────────
  { champs: ["Kayle", "Senna"], bonus: 2, tag: "Late + Late Scaling" },
  { champs: ["KogMaw", "Karma"], bonus: 2, tag: "Mantra + Late Carry" },
  { champs: ["Veigar", "Senna"], bonus: 2, tag: "Stacking Pair" },
  { champs: ["Smolder", "Kayle"], bonus: 2, tag: "Hyper Scaling Duo" },
  { champs: ["AurelionSol", "Kayle"], bonus: 2, tag: "Hyper Scaling Duo" },

  // ─── Mid + JG burst pairs (more) ─────────────────────────────────────
  // Talon+Zed already listed in pickcomp + assassin coordination section.
  { champs: ["Diana", "Vi"], bonus: 2, tag: "Pull + Vault Combo" },
  { champs: ["Sylas", "Vi"], bonus: 2, tag: "Steal + Vault" },
  { champs: ["Sylas", "Karthus"], bonus: 2, tag: "Steal + Requiem" },
  { champs: ["Talon", "Khazix"], bonus: 2, tag: "Double Roam Burst" },
  { champs: ["Talon", "Diana"], bonus: 2, tag: "Roam + Pull" },
  { champs: ["Zed", "Khazix"], bonus: 2, tag: "Mid + JG Assassins" },

  // ─── Lane-specific synergies (top + jg) ──────────────────────────────
  { champs: ["Riven", "LeeSin"], bonus: 2, tag: "Top + JG Skirmish" },
  { champs: ["Aatrox", "Hecarim"], bonus: 2, tag: "Top + JG Charge" },
  { champs: ["Sett", "Hecarim"], bonus: 2, tag: "Top + JG Engage" },
  { champs: ["Mordekaiser", "Maokai"], bonus: 2, tag: "Death Realm + Roots" },

  // ─── Bot + JG synergies ──────────────────────────────────────────────
  { champs: ["Caitlyn", "Vi"], bonus: 2, tag: "ADC + JG Lockdown" },
  { champs: ["Jhin", "Sejuani"], bonus: 2, tag: "Crit + Slow" },
  { champs: ["Vayne", "Karthus"], bonus: 2, tag: "Hyper + Global" },

  // ─── Anti-engage / disengage stacks ──────────────────────────────────
  // Janna+Sivir already listed earlier in disengage variants section.
  { champs: ["Janna", "Lulu"], bonus: 2, tag: "Double Disengage" },
  { champs: ["Lulu", "Sivir"], bonus: 2, tag: "Polymorph + Spell Shield" },
  { champs: ["Karma", "Sivir"], bonus: 2, tag: "Mantra + Spell Shield" },
  // ─── Bulk balance additions ───────────────────────────────────────────
  // Auto-generated to bring every champion to >= 5 synergies. Pairings are
  // archetype-rule-based (engage→Yasuo wombo, hook→burst, hyper→peel, etc.)
  // and deduped against the curated entries above.
  { champs: ["Maokai", "Yone"], bonus: 2, tag: "Engage + Twin Breath" },
  { champs: ["Sejuani", "Yone"], bonus: 2, tag: "Engage + Twin Breath" },
  { champs: ["Amumu", "Yone"], bonus: 2, tag: "Engage + Twin Breath" },
  { champs: ["Alistar", "Yone"], bonus: 2, tag: "Engage + Twin Breath" },
  { champs: ["Rell", "Yone"], bonus: 2, tag: "Engage + Twin Breath" },
  { champs: ["Galio", "Yone"], bonus: 2, tag: "Engage + Twin Breath" },
  { champs: ["Hecarim", "Yone"], bonus: 2, tag: "Engage + Twin Breath" },
  { champs: ["JarvanIV", "Yone"], bonus: 2, tag: "Engage + Twin Breath" },
  { champs: ["Diana", "Yone"], bonus: 2, tag: "Engage + Twin Breath" },
  { champs: ["Zac", "Yone"], bonus: 2, tag: "Engage + Twin Breath" },
  { champs: ["KSante", "Yone"], bonus: 2, tag: "Engage + Twin Breath" },
  { champs: ["Skarner", "Yone"], bonus: 2, tag: "Engage + Twin Breath" },
  { champs: ["Lillia", "Yone"], bonus: 2, tag: "Engage + Twin Breath" },
  { champs: ["Nautilus", "Yone"], bonus: 2, tag: "Engage + Twin Breath" },
  { champs: ["Pantheon", "Yone"], bonus: 2, tag: "Engage + Twin Breath" },
  { champs: ["Volibear", "Yone"], bonus: 2, tag: "Engage + Twin Breath" },
  { champs: ["Lissandra", "Yasuo"], bonus: 2, tag: "Engage to Last Breath" },
  { champs: ["Lissandra", "Yone"], bonus: 2, tag: "Engage + Twin Breath" },
  { champs: ["Maokai", "Brand"], bonus: 2, tag: "Engage + Pyroclasm" },
  { champs: ["Maokai", "Orianna"], bonus: 2, tag: "Engage + Shockwave" },
  { champs: ["Maokai", "AurelionSol"], bonus: 2, tag: "Engage + Singularity" },
  { champs: ["Maokai", "MissFortune"], bonus: 2, tag: "Engage + Bullet Time" },
  { champs: ["Maokai", "Aurora"], bonus: 2, tag: "Engage + Cosmic Beyond" },
  { champs: ["Maokai", "Hwei"], bonus: 2, tag: "Engage + Spiraling Despair" },
  {
    champs: ["Maokai", "Velkoz"],
    bonus: 2,
    tag: "Engage + Lifeform Disintegration",
  },
  { champs: ["Maokai", "Mel"], bonus: 2, tag: "Engage + Reflection" },
  { champs: ["Sejuani", "AurelionSol"], bonus: 2, tag: "Engage + Singularity" },
  { champs: ["Sejuani", "MissFortune"], bonus: 2, tag: "Engage + Bullet Time" },
  { champs: ["Sejuani", "Aurora"], bonus: 2, tag: "Engage + Cosmic Beyond" },
  { champs: ["Sejuani", "Hwei"], bonus: 2, tag: "Engage + Spiraling Despair" },
  { champs: ["Sejuani", "Lux"], bonus: 2, tag: "Engage + Final Spark" },
  { champs: ["Amumu", "Brand"], bonus: 2, tag: "Engage + Pyroclasm" },
  { champs: ["Amumu", "AurelionSol"], bonus: 2, tag: "Engage + Singularity" },
  { champs: ["Amumu", "Aurora"], bonus: 2, tag: "Engage + Cosmic Beyond" },
  { champs: ["Amumu", "Hwei"], bonus: 2, tag: "Engage + Spiraling Despair" },
  {
    champs: ["Amumu", "Velkoz"],
    bonus: 2,
    tag: "Engage + Lifeform Disintegration",
  },
  { champs: ["Amumu", "Lux"], bonus: 2, tag: "Engage + Final Spark" },
  { champs: ["Alistar", "Karthus"], bonus: 2, tag: "Engage + Requiem" },
  { champs: ["Alistar", "Veigar"], bonus: 2, tag: "Engage + Cage" },
  { champs: ["Alistar", "Brand"], bonus: 2, tag: "Engage + Pyroclasm" },
  { champs: ["Alistar", "Orianna"], bonus: 2, tag: "Engage + Shockwave" },
  { champs: ["Alistar", "AurelionSol"], bonus: 2, tag: "Engage + Singularity" },
  { champs: ["Alistar", "MissFortune"], bonus: 2, tag: "Engage + Bullet Time" },
  { champs: ["Alistar", "Aurora"], bonus: 2, tag: "Engage + Cosmic Beyond" },
  { champs: ["Alistar", "Hwei"], bonus: 2, tag: "Engage + Spiraling Despair" },
  {
    champs: ["Alistar", "Velkoz"],
    bonus: 2,
    tag: "Engage + Lifeform Disintegration",
  },
  { champs: ["Alistar", "Lux"], bonus: 2, tag: "Engage + Final Spark" },
  { champs: ["Alistar", "Mel"], bonus: 2, tag: "Engage + Reflection" },
  { champs: ["Rell", "AurelionSol"], bonus: 2, tag: "Engage + Singularity" },
  { champs: ["Rell", "Aurora"], bonus: 2, tag: "Engage + Cosmic Beyond" },
  { champs: ["Rell", "Hwei"], bonus: 2, tag: "Engage + Spiraling Despair" },
  {
    champs: ["Rell", "Velkoz"],
    bonus: 2,
    tag: "Engage + Lifeform Disintegration",
  },
  { champs: ["Rell", "Lux"], bonus: 2, tag: "Engage + Final Spark" },
  { champs: ["Rell", "Mel"], bonus: 2, tag: "Engage + Reflection" },
  { champs: ["Galio", "AurelionSol"], bonus: 2, tag: "Engage + Singularity" },
  { champs: ["Galio", "MissFortune"], bonus: 2, tag: "Engage + Bullet Time" },
  { champs: ["Galio", "Aurora"], bonus: 2, tag: "Engage + Cosmic Beyond" },
  { champs: ["Galio", "Hwei"], bonus: 2, tag: "Engage + Spiraling Despair" },
  {
    champs: ["Galio", "Velkoz"],
    bonus: 2,
    tag: "Engage + Lifeform Disintegration",
  },
  { champs: ["Galio", "Lux"], bonus: 2, tag: "Engage + Final Spark" },
  { champs: ["Galio", "Mel"], bonus: 2, tag: "Engage + Reflection" },
  { champs: ["Hecarim", "AurelionSol"], bonus: 2, tag: "Engage + Singularity" },
  { champs: ["Hecarim", "MissFortune"], bonus: 2, tag: "Engage + Bullet Time" },
  { champs: ["Hecarim", "Aurora"], bonus: 2, tag: "Engage + Cosmic Beyond" },
  { champs: ["Hecarim", "Hwei"], bonus: 2, tag: "Engage + Spiraling Despair" },
  {
    champs: ["Hecarim", "Velkoz"],
    bonus: 2,
    tag: "Engage + Lifeform Disintegration",
  },
  { champs: ["Hecarim", "Lux"], bonus: 2, tag: "Engage + Final Spark" },
  { champs: ["Hecarim", "Mel"], bonus: 2, tag: "Engage + Reflection" },
  { champs: ["JarvanIV", "Karthus"], bonus: 2, tag: "Engage + Requiem" },
  {
    champs: ["JarvanIV", "AurelionSol"],
    bonus: 2,
    tag: "Engage + Singularity",
  },
  {
    champs: ["JarvanIV", "MissFortune"],
    bonus: 2,
    tag: "Engage + Bullet Time",
  },
  { champs: ["Diana", "AurelionSol"], bonus: 2, tag: "Engage + Singularity" },
  { champs: ["Diana", "MissFortune"], bonus: 2, tag: "Engage + Bullet Time" },
  { champs: ["Diana", "Aurora"], bonus: 2, tag: "Engage + Cosmic Beyond" },
  { champs: ["Diana", "Hwei"], bonus: 2, tag: "Engage + Spiraling Despair" },
  {
    champs: ["Diana", "Velkoz"],
    bonus: 2,
    tag: "Engage + Lifeform Disintegration",
  },
  { champs: ["Diana", "Mel"], bonus: 2, tag: "Engage + Reflection" },
  { champs: ["Zac", "Brand"], bonus: 2, tag: "Engage + Pyroclasm" },
  { champs: ["Zac", "AurelionSol"], bonus: 2, tag: "Engage + Singularity" },
  { champs: ["Zac", "Aurora"], bonus: 2, tag: "Engage + Cosmic Beyond" },
  { champs: ["Zac", "Hwei"], bonus: 2, tag: "Engage + Spiraling Despair" },
  {
    champs: ["Zac", "Velkoz"],
    bonus: 2,
    tag: "Engage + Lifeform Disintegration",
  },
  { champs: ["Zac", "Lux"], bonus: 2, tag: "Engage + Final Spark" },
  { champs: ["Zac", "Mel"], bonus: 2, tag: "Engage + Reflection" },
  { champs: ["KSante", "Brand"], bonus: 2, tag: "Engage + Pyroclasm" },
  { champs: ["KSante", "AurelionSol"], bonus: 2, tag: "Engage + Singularity" },
  { champs: ["KSante", "MissFortune"], bonus: 2, tag: "Engage + Bullet Time" },
  { champs: ["KSante", "Aurora"], bonus: 2, tag: "Engage + Cosmic Beyond" },
  { champs: ["KSante", "Hwei"], bonus: 2, tag: "Engage + Spiraling Despair" },
  {
    champs: ["KSante", "Velkoz"],
    bonus: 2,
    tag: "Engage + Lifeform Disintegration",
  },
  { champs: ["KSante", "Lux"], bonus: 2, tag: "Engage + Final Spark" },
  { champs: ["KSante", "Mel"], bonus: 2, tag: "Engage + Reflection" },
  { champs: ["Skarner", "Brand"], bonus: 2, tag: "Engage + Pyroclasm" },
  { champs: ["Skarner", "Orianna"], bonus: 2, tag: "Engage + Shockwave" },
  { champs: ["Skarner", "AurelionSol"], bonus: 2, tag: "Engage + Singularity" },
  { champs: ["Skarner", "MissFortune"], bonus: 2, tag: "Engage + Bullet Time" },
  { champs: ["Skarner", "Aurora"], bonus: 2, tag: "Engage + Cosmic Beyond" },
  { champs: ["Skarner", "Hwei"], bonus: 2, tag: "Engage + Spiraling Despair" },
  {
    champs: ["Skarner", "Velkoz"],
    bonus: 2,
    tag: "Engage + Lifeform Disintegration",
  },
  { champs: ["Skarner", "Lux"], bonus: 2, tag: "Engage + Final Spark" },
  { champs: ["Skarner", "Mel"], bonus: 2, tag: "Engage + Reflection" },
  { champs: ["Lillia", "Orianna"], bonus: 2, tag: "Engage + Shockwave" },
  { champs: ["Lillia", "AurelionSol"], bonus: 2, tag: "Engage + Singularity" },
  { champs: ["Lillia", "MissFortune"], bonus: 2, tag: "Engage + Bullet Time" },
  { champs: ["Lillia", "Aurora"], bonus: 2, tag: "Engage + Cosmic Beyond" },
  { champs: ["Lillia", "Hwei"], bonus: 2, tag: "Engage + Spiraling Despair" },
  {
    champs: ["Lillia", "Velkoz"],
    bonus: 2,
    tag: "Engage + Lifeform Disintegration",
  },
  { champs: ["Lillia", "Mel"], bonus: 2, tag: "Engage + Reflection" },
  {
    champs: ["Nautilus", "AurelionSol"],
    bonus: 2,
    tag: "Engage + Singularity",
  },
  { champs: ["Nautilus", "Aurora"], bonus: 2, tag: "Engage + Cosmic Beyond" },
  { champs: ["Nautilus", "Hwei"], bonus: 2, tag: "Engage + Spiraling Despair" },
  {
    champs: ["Nautilus", "Velkoz"],
    bonus: 2,
    tag: "Engage + Lifeform Disintegration",
  },
  { champs: ["Nautilus", "Lux"], bonus: 2, tag: "Engage + Final Spark" },
  { champs: ["Nautilus", "Mel"], bonus: 2, tag: "Engage + Reflection" },
  { champs: ["Pantheon", "Veigar"], bonus: 2, tag: "Engage + Cage" },
  { champs: ["Pantheon", "Brand"], bonus: 2, tag: "Engage + Pyroclasm" },
  { champs: ["Pantheon", "Orianna"], bonus: 2, tag: "Engage + Shockwave" },
  {
    champs: ["Pantheon", "AurelionSol"],
    bonus: 2,
    tag: "Engage + Singularity",
  },
  {
    champs: ["Pantheon", "MissFortune"],
    bonus: 2,
    tag: "Engage + Bullet Time",
  },
  { champs: ["Pantheon", "Aurora"], bonus: 2, tag: "Engage + Cosmic Beyond" },
  { champs: ["Pantheon", "Hwei"], bonus: 2, tag: "Engage + Spiraling Despair" },
  {
    champs: ["Pantheon", "Velkoz"],
    bonus: 2,
    tag: "Engage + Lifeform Disintegration",
  },
  { champs: ["Pantheon", "Lux"], bonus: 2, tag: "Engage + Final Spark" },
  { champs: ["Pantheon", "Mel"], bonus: 2, tag: "Engage + Reflection" },
  { champs: ["Vi", "AurelionSol"], bonus: 2, tag: "Engage + Singularity" },
  { champs: ["Vi", "MissFortune"], bonus: 2, tag: "Engage + Bullet Time" },
  { champs: ["Vi", "Hwei"], bonus: 2, tag: "Engage + Spiraling Despair" },
  {
    champs: ["Vi", "Velkoz"],
    bonus: 2,
    tag: "Engage + Lifeform Disintegration",
  },
  { champs: ["Vi", "Lux"], bonus: 2, tag: "Engage + Final Spark" },
  { champs: ["Volibear", "Brand"], bonus: 2, tag: "Engage + Pyroclasm" },
  { champs: ["Volibear", "Orianna"], bonus: 2, tag: "Engage + Shockwave" },
  {
    champs: ["Volibear", "AurelionSol"],
    bonus: 2,
    tag: "Engage + Singularity",
  },
  {
    champs: ["Volibear", "MissFortune"],
    bonus: 2,
    tag: "Engage + Bullet Time",
  },
  { champs: ["Volibear", "Aurora"], bonus: 2, tag: "Engage + Cosmic Beyond" },
  { champs: ["Volibear", "Hwei"], bonus: 2, tag: "Engage + Spiraling Despair" },
  {
    champs: ["Volibear", "Velkoz"],
    bonus: 2,
    tag: "Engage + Lifeform Disintegration",
  },
  { champs: ["Volibear", "Lux"], bonus: 2, tag: "Engage + Final Spark" },
  { champs: ["Volibear", "Mel"], bonus: 2, tag: "Engage + Reflection" },
  { champs: ["Lissandra", "Karthus"], bonus: 2, tag: "Engage + Requiem" },
  { champs: ["Lissandra", "Brand"], bonus: 2, tag: "Engage + Pyroclasm" },
  {
    champs: ["Lissandra", "MissFortune"],
    bonus: 2,
    tag: "Engage + Bullet Time",
  },
  { champs: ["Lissandra", "Aurora"], bonus: 2, tag: "Engage + Cosmic Beyond" },
  {
    champs: ["Lissandra", "Hwei"],
    bonus: 2,
    tag: "Engage + Spiraling Despair",
  },
  {
    champs: ["Lissandra", "Velkoz"],
    bonus: 2,
    tag: "Engage + Lifeform Disintegration",
  },
  { champs: ["Lissandra", "Lux"], bonus: 2, tag: "Engage + Final Spark" },
  { champs: ["Lissandra", "Mel"], bonus: 2, tag: "Engage + Reflection" },
  { champs: ["Blitzcrank", "Lux"], bonus: 2, tag: "Hook setup + Burst" },
  { champs: ["Blitzcrank", "Annie"], bonus: 2, tag: "Hook setup + Burst" },
  { champs: ["Blitzcrank", "Akali"], bonus: 2, tag: "Hook setup + Burst" },
  { champs: ["Blitzcrank", "Zed"], bonus: 2, tag: "Hook setup + Burst" },
  { champs: ["Blitzcrank", "Talon"], bonus: 2, tag: "Hook setup + Burst" },
  { champs: ["Blitzcrank", "Diana"], bonus: 2, tag: "Hook setup + Burst" },
  { champs: ["Blitzcrank", "Karthus"], bonus: 2, tag: "Hook setup + Burst" },
  { champs: ["Blitzcrank", "Syndra"], bonus: 2, tag: "Hook setup + Burst" },
  { champs: ["Blitzcrank", "Mel"], bonus: 2, tag: "Hook setup + Burst" },
  { champs: ["Pyke", "Veigar"], bonus: 2, tag: "Hook setup + Burst" },
  { champs: ["Pyke", "Lux"], bonus: 2, tag: "Hook setup + Burst" },
  { champs: ["Pyke", "Annie"], bonus: 2, tag: "Hook setup + Burst" },
  { champs: ["Pyke", "Akali"], bonus: 2, tag: "Hook setup + Burst" },
  { champs: ["Pyke", "Zed"], bonus: 2, tag: "Hook setup + Burst" },
  { champs: ["Pyke", "Talon"], bonus: 2, tag: "Hook setup + Burst" },
  { champs: ["Pyke", "Diana"], bonus: 2, tag: "Hook setup + Burst" },
  { champs: ["Pyke", "Karthus"], bonus: 2, tag: "Hook setup + Burst" },
  { champs: ["Pyke", "Syndra"], bonus: 2, tag: "Hook setup + Burst" },
  { champs: ["Pyke", "Mel"], bonus: 2, tag: "Hook setup + Burst" },
  { champs: ["Thresh", "Veigar"], bonus: 2, tag: "Hook setup + Burst" },
  { champs: ["Thresh", "Brand"], bonus: 2, tag: "Hook setup + Burst" },
  { champs: ["Thresh", "Lux"], bonus: 2, tag: "Hook setup + Burst" },
  { champs: ["Thresh", "Annie"], bonus: 2, tag: "Hook setup + Burst" },
  { champs: ["Thresh", "Akali"], bonus: 2, tag: "Hook setup + Burst" },
  { champs: ["Thresh", "Zed"], bonus: 2, tag: "Hook setup + Burst" },
  { champs: ["Thresh", "Talon"], bonus: 2, tag: "Hook setup + Burst" },
  { champs: ["Thresh", "Diana"], bonus: 2, tag: "Hook setup + Burst" },
  { champs: ["Thresh", "Karthus"], bonus: 2, tag: "Hook setup + Burst" },
  { champs: ["Thresh", "Syndra"], bonus: 2, tag: "Hook setup + Burst" },
  { champs: ["Thresh", "Mel"], bonus: 2, tag: "Hook setup + Burst" },
  { champs: ["Nautilus", "Annie"], bonus: 2, tag: "Hook setup + Burst" },
  { champs: ["Nautilus", "Akali"], bonus: 2, tag: "Hook setup + Burst" },
  { champs: ["Nautilus", "Zed"], bonus: 2, tag: "Hook setup + Burst" },
  { champs: ["Nautilus", "Talon"], bonus: 2, tag: "Hook setup + Burst" },
  { champs: ["Nautilus", "Diana"], bonus: 2, tag: "Hook setup + Burst" },
  { champs: ["Nautilus", "Syndra"], bonus: 2, tag: "Hook setup + Burst" },
  { champs: ["Morgana", "Veigar"], bonus: 2, tag: "Hook setup + Burst" },
  { champs: ["Morgana", "Annie"], bonus: 2, tag: "Hook setup + Burst" },
  { champs: ["Morgana", "Akali"], bonus: 2, tag: "Hook setup + Burst" },
  { champs: ["Morgana", "Zed"], bonus: 2, tag: "Hook setup + Burst" },
  { champs: ["Morgana", "Talon"], bonus: 2, tag: "Hook setup + Burst" },
  { champs: ["Morgana", "Diana"], bonus: 2, tag: "Hook setup + Burst" },
  { champs: ["Morgana", "Syndra"], bonus: 2, tag: "Hook setup + Burst" },
  { champs: ["Morgana", "Mel"], bonus: 2, tag: "Hook setup + Burst" },
  { champs: ["Lissandra", "Annie"], bonus: 2, tag: "Hook setup + Burst" },
  { champs: ["Lissandra", "Akali"], bonus: 2, tag: "Hook setup + Burst" },
  { champs: ["Lissandra", "Talon"], bonus: 2, tag: "Hook setup + Burst" },
  { champs: ["Lissandra", "Diana"], bonus: 2, tag: "Hook setup + Burst" },
  { champs: ["Ahri", "Veigar"], bonus: 2, tag: "Hook setup + Burst" },
  { champs: ["Ahri", "Brand"], bonus: 2, tag: "Hook setup + Burst" },
  { champs: ["Ahri", "Lux"], bonus: 2, tag: "Hook setup + Burst" },
  { champs: ["Ahri", "Annie"], bonus: 2, tag: "Hook setup + Burst" },
  { champs: ["Ahri", "Akali"], bonus: 2, tag: "Hook setup + Burst" },
  { champs: ["Ahri", "Karthus"], bonus: 2, tag: "Hook setup + Burst" },
  { champs: ["Ahri", "Mel"], bonus: 2, tag: "Hook setup + Burst" },
  { champs: ["Vayne", "Sona"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["Vayne", "Seraphine"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["Aphelios", "Lulu"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["Aphelios", "Yuumi"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["Aphelios", "Renata"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["Aphelios", "Sona"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["Aphelios", "Seraphine"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["Jinx", "Janna"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["Jinx", "Soraka"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["Jinx", "Yuumi"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["Jinx", "Milio"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["Jinx", "Karma"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["Jinx", "Sona"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["Jinx", "Seraphine"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["Twitch", "Janna"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["Twitch", "Yuumi"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["Twitch", "Karma"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["Twitch", "Sona"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["Twitch", "Seraphine"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["KogMaw", "Yuumi"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["KogMaw", "Sona"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["KogMaw", "Nami"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["KogMaw", "Seraphine"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["Smolder", "Renata"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["Smolder", "Karma"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["Smolder", "Sona"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["Smolder", "Nami"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["Smolder", "Seraphine"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["Kaisa", "Lulu"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["Kaisa", "Janna"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["Kaisa", "Soraka"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["Kaisa", "Yuumi"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["Kaisa", "Milio"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["Kaisa", "Renata"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["Kaisa", "Karma"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["Kaisa", "Sona"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["Kaisa", "Nami"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["Kaisa", "Seraphine"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["Kalista", "Lulu"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["Kalista", "Janna"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["Kalista", "Soraka"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["Kalista", "Yuumi"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["Kalista", "Milio"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["Kalista", "Renata"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["Kalista", "Karma"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["Kalista", "Sona"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["Kalista", "Nami"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["Kalista", "Seraphine"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["Tristana", "Lulu"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["Tristana", "Yuumi"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["Tristana", "Milio"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["Tristana", "Renata"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["Tristana", "Karma"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["Tristana", "Sona"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["Tristana", "Nami"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["Tristana", "Seraphine"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["Yunara", "Lulu"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["Yunara", "Janna"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["Yunara", "Soraka"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["Yunara", "Yuumi"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["Yunara", "Milio"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["Yunara", "Renata"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["Yunara", "Karma"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["Yunara", "Sona"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["Yunara", "Nami"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["Yunara", "Seraphine"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["Caitlyn", "Soraka"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["Caitlyn", "Renata"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["Caitlyn", "Nami"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["Caitlyn", "Seraphine"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["Fiora", "Pantheon"], bonus: 2, tag: "Splitpush + Global" },
  { champs: ["Fiora", "Shen"], bonus: 2, tag: "Splitpush + Global" },
  { champs: ["Fiora", "Karthus"], bonus: 2, tag: "Splitpush + Global" },
  { champs: ["Camille", "Pantheon"], bonus: 2, tag: "Splitpush + Global" },
  { champs: ["Camille", "Shen"], bonus: 2, tag: "Splitpush + Global" },
  { champs: ["Camille", "Karthus"], bonus: 2, tag: "Splitpush + Global" },
  { champs: ["Tryndamere", "Pantheon"], bonus: 2, tag: "Splitpush + Global" },
  { champs: ["Tryndamere", "Shen"], bonus: 2, tag: "Splitpush + Global" },
  { champs: ["Tryndamere", "Karthus"], bonus: 2, tag: "Splitpush + Global" },
  { champs: ["Jax", "TwistedFate"], bonus: 2, tag: "Splitpush + Global" },
  { champs: ["Jax", "Pantheon"], bonus: 2, tag: "Splitpush + Global" },
  { champs: ["Jax", "Shen"], bonus: 2, tag: "Splitpush + Global" },
  { champs: ["Jax", "Karthus"], bonus: 2, tag: "Splitpush + Global" },
  { champs: ["Trundle", "TwistedFate"], bonus: 2, tag: "Splitpush + Global" },
  { champs: ["Trundle", "Pantheon"], bonus: 2, tag: "Splitpush + Global" },
  { champs: ["Trundle", "Shen"], bonus: 2, tag: "Splitpush + Global" },
  { champs: ["Trundle", "Karthus"], bonus: 2, tag: "Splitpush + Global" },
  { champs: ["Yorick", "Pantheon"], bonus: 2, tag: "Splitpush + Global" },
  { champs: ["Yorick", "Shen"], bonus: 2, tag: "Splitpush + Global" },
  { champs: ["Yorick", "Karthus"], bonus: 2, tag: "Splitpush + Global" },
  { champs: ["Singed", "TwistedFate"], bonus: 2, tag: "Splitpush + Global" },
  { champs: ["Singed", "Pantheon"], bonus: 2, tag: "Splitpush + Global" },
  { champs: ["Singed", "Shen"], bonus: 2, tag: "Splitpush + Global" },
  { champs: ["Singed", "Karthus"], bonus: 2, tag: "Splitpush + Global" },
  { champs: ["Nasus", "TwistedFate"], bonus: 2, tag: "Splitpush + Global" },
  { champs: ["Nasus", "Pantheon"], bonus: 2, tag: "Splitpush + Global" },
  { champs: ["Nasus", "Shen"], bonus: 2, tag: "Splitpush + Global" },
  { champs: ["Nasus", "Karthus"], bonus: 2, tag: "Splitpush + Global" },
  { champs: ["Gangplank", "Pantheon"], bonus: 2, tag: "Splitpush + Global" },
  { champs: ["Gangplank", "Shen"], bonus: 2, tag: "Splitpush + Global" },
  { champs: ["Gangplank", "Karthus"], bonus: 2, tag: "Splitpush + Global" },
  { champs: ["Talon", "Rengar"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Talon", "Kayn"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Talon", "Nidalee"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Talon", "Evelynn"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Talon", "Shaco"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Talon", "Graves"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Talon", "Viego"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Talon", "RekSai"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Akali", "Khazix"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Akali", "Rengar"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Akali", "Kayn"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Akali", "Nidalee"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Akali", "Evelynn"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Akali", "Shaco"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Akali", "Graves"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Akali", "Viego"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Akali", "RekSai"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Diana", "Khazix"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Diana", "Rengar"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Diana", "Kayn"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Diana", "Nidalee"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Diana", "Evelynn"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Diana", "Shaco"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Diana", "Graves"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Diana", "Viego"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Diana", "RekSai"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Zed", "Rengar"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Zed", "Kayn"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Zed", "Nidalee"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Zed", "Evelynn"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Zed", "Shaco"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Zed", "Graves"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Zed", "Viego"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Zed", "RekSai"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Fizz", "Khazix"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Fizz", "Rengar"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Fizz", "Kayn"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Fizz", "Nidalee"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Fizz", "Evelynn"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Fizz", "Shaco"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Fizz", "Graves"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Fizz", "Viego"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Fizz", "RekSai"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Naafiri", "Khazix"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Naafiri", "Rengar"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Naafiri", "Kayn"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Naafiri", "Nidalee"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Naafiri", "Evelynn"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Naafiri", "Shaco"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Naafiri", "Graves"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Naafiri", "Viego"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Naafiri", "RekSai"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Sylas", "Khazix"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Sylas", "Rengar"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Sylas", "Kayn"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Sylas", "Nidalee"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Sylas", "Evelynn"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Sylas", "Shaco"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Sylas", "Graves"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Sylas", "Viego"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Sylas", "RekSai"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Katarina", "Khazix"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Katarina", "Rengar"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Katarina", "Kayn"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Katarina", "Nidalee"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Katarina", "Evelynn"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Katarina", "Shaco"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Katarina", "Graves"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Katarina", "Viego"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Katarina", "RekSai"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Qiyana", "Khazix"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Qiyana", "Rengar"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Qiyana", "Kayn"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Qiyana", "Nidalee"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Qiyana", "Evelynn"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Qiyana", "Shaco"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Qiyana", "Graves"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Qiyana", "Viego"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Qiyana", "RekSai"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Ekko", "Khazix"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Ekko", "Rengar"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Ekko", "Kayn"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Ekko", "Nidalee"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Ekko", "Evelynn"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Ekko", "Shaco"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Ekko", "Graves"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Ekko", "Viego"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Ekko", "RekSai"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Ahri", "Rengar"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Ahri", "Kayn"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Ahri", "Nidalee"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Ahri", "Evelynn"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Ahri", "Shaco"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Ahri", "Graves"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Ahri", "Viego"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Ahri", "RekSai"], bonus: 2, tag: "Mid + JG Roam" },
  { champs: ["Kayle", "Milio"], bonus: 2, tag: "Sustain + Late Scaling" },
  { champs: ["Kayle", "TahmKench"], bonus: 2, tag: "Sustain + Late Scaling" },
  { champs: ["Kayle", "Nami"], bonus: 2, tag: "Sustain + Late Scaling" },
  { champs: ["Senna", "Yuumi"], bonus: 2, tag: "Sustain + Late Scaling" },
  { champs: ["Senna", "Milio"], bonus: 2, tag: "Sustain + Late Scaling" },
  { champs: ["Senna", "TahmKench"], bonus: 2, tag: "Sustain + Late Scaling" },
  { champs: ["Senna", "Nami"], bonus: 2, tag: "Sustain + Late Scaling" },
  {
    champs: ["Aphelios", "TahmKench"],
    bonus: 2,
    tag: "Sustain + Late Scaling",
  },
  { champs: ["Ryze", "Soraka"], bonus: 2, tag: "Sustain + Late Scaling" },
  { champs: ["Ryze", "Yuumi"], bonus: 2, tag: "Sustain + Late Scaling" },
  { champs: ["Ryze", "Milio"], bonus: 2, tag: "Sustain + Late Scaling" },
  { champs: ["Ryze", "TahmKench"], bonus: 2, tag: "Sustain + Late Scaling" },
  { champs: ["Ryze", "Nami"], bonus: 2, tag: "Sustain + Late Scaling" },
  { champs: ["Vladimir", "Soraka"], bonus: 2, tag: "Sustain + Late Scaling" },
  { champs: ["Vladimir", "Yuumi"], bonus: 2, tag: "Sustain + Late Scaling" },
  { champs: ["Vladimir", "Milio"], bonus: 2, tag: "Sustain + Late Scaling" },
  {
    champs: ["Vladimir", "TahmKench"],
    bonus: 2,
    tag: "Sustain + Late Scaling",
  },
  { champs: ["Vladimir", "Nami"], bonus: 2, tag: "Sustain + Late Scaling" },
  { champs: ["Jinx", "TahmKench"], bonus: 2, tag: "Sustain + Late Scaling" },
  {
    champs: ["AurelionSol", "Soraka"],
    bonus: 2,
    tag: "Sustain + Late Scaling",
  },
  { champs: ["AurelionSol", "Yuumi"], bonus: 2, tag: "Sustain + Late Scaling" },
  { champs: ["AurelionSol", "Milio"], bonus: 2, tag: "Sustain + Late Scaling" },
  {
    champs: ["AurelionSol", "TahmKench"],
    bonus: 2,
    tag: "Sustain + Late Scaling",
  },
  { champs: ["AurelionSol", "Nami"], bonus: 2, tag: "Sustain + Late Scaling" },
  { champs: ["Yunara", "TahmKench"], bonus: 2, tag: "Sustain + Late Scaling" },
  { champs: ["Veigar", "Soraka"], bonus: 2, tag: "Sustain + Late Scaling" },
  { champs: ["Veigar", "Yuumi"], bonus: 2, tag: "Sustain + Late Scaling" },
  { champs: ["Veigar", "Milio"], bonus: 2, tag: "Sustain + Late Scaling" },
  { champs: ["Veigar", "TahmKench"], bonus: 2, tag: "Sustain + Late Scaling" },
  { champs: ["Veigar", "Nami"], bonus: 2, tag: "Sustain + Late Scaling" },
  { champs: ["Maokai", "Vayne"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Maokai", "Aphelios"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Maokai", "Jinx"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Maokai", "Twitch"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Maokai", "KogMaw"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Maokai", "Smolder"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Maokai", "Kaisa"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Maokai", "Kalista"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Maokai", "Tristana"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Maokai", "Yunara"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Maokai", "Caitlyn"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Sejuani", "Vayne"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Sejuani", "Aphelios"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Sejuani", "Jinx"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Sejuani", "Twitch"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Sejuani", "KogMaw"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Sejuani", "Smolder"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Sejuani", "Kaisa"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Sejuani", "Kalista"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Sejuani", "Tristana"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Sejuani", "Yunara"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Sejuani", "Caitlyn"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Amumu", "Vayne"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Amumu", "Aphelios"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Amumu", "Jinx"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Amumu", "Twitch"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Amumu", "KogMaw"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Amumu", "Smolder"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Amumu", "Kaisa"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Amumu", "Kalista"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Amumu", "Tristana"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Amumu", "Yunara"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Amumu", "Caitlyn"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Sion", "Vayne"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Sion", "Aphelios"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Sion", "Jinx"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Sion", "Twitch"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Sion", "KogMaw"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Sion", "Smolder"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Sion", "Kaisa"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Sion", "Kalista"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Sion", "Tristana"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Sion", "Yunara"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Sion", "Caitlyn"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Ornn", "Vayne"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Ornn", "Aphelios"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Ornn", "Jinx"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Ornn", "Twitch"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Ornn", "KogMaw"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Ornn", "Smolder"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Ornn", "Kaisa"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Ornn", "Kalista"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Ornn", "Tristana"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Ornn", "Yunara"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Ornn", "Caitlyn"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Chogath", "Vayne"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Chogath", "Aphelios"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Chogath", "Jinx"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Chogath", "Twitch"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Chogath", "KogMaw"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Chogath", "Smolder"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Chogath", "Kaisa"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Chogath", "Kalista"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Chogath", "Tristana"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Chogath", "Yunara"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Chogath", "Caitlyn"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["DrMundo", "Vayne"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["DrMundo", "Aphelios"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["DrMundo", "Jinx"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["DrMundo", "Twitch"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["DrMundo", "KogMaw"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["DrMundo", "Smolder"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["DrMundo", "Kaisa"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["DrMundo", "Kalista"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["DrMundo", "Tristana"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["DrMundo", "Yunara"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["DrMundo", "Caitlyn"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Rammus", "Vayne"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Rammus", "Aphelios"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Rammus", "Jinx"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Rammus", "Twitch"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Rammus", "KogMaw"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Rammus", "Smolder"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Rammus", "Kaisa"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Rammus", "Kalista"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Rammus", "Tristana"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Rammus", "Yunara"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Rammus", "Caitlyn"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Zac", "Vayne"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Zac", "Aphelios"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Zac", "Jinx"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Zac", "Twitch"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Zac", "KogMaw"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Zac", "Smolder"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Zac", "Kaisa"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Zac", "Kalista"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Zac", "Tristana"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Zac", "Yunara"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Zac", "Caitlyn"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["KSante", "Vayne"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["KSante", "Aphelios"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["KSante", "Jinx"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["KSante", "Twitch"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["KSante", "KogMaw"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["KSante", "Smolder"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["KSante", "Kaisa"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["KSante", "Kalista"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["KSante", "Tristana"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["KSante", "Yunara"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["KSante", "Caitlyn"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Malphite", "Vayne"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  {
    champs: ["Malphite", "Aphelios"],
    bonus: 2,
    tag: "Frontline + Hyper-Carry",
  },
  { champs: ["Malphite", "Jinx"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Malphite", "Twitch"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Malphite", "KogMaw"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Malphite", "Smolder"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Malphite", "Kaisa"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Malphite", "Kalista"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  {
    champs: ["Malphite", "Tristana"],
    bonus: 2,
    tag: "Frontline + Hyper-Carry",
  },
  { champs: ["Malphite", "Yunara"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Malphite", "Caitlyn"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Shen", "Vayne"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Shen", "Aphelios"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Shen", "Jinx"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Shen", "Twitch"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Shen", "KogMaw"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Shen", "Smolder"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Shen", "Kaisa"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Shen", "Kalista"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Shen", "Tristana"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Shen", "Yunara"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Shen", "Caitlyn"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Volibear", "Vayne"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  {
    champs: ["Volibear", "Aphelios"],
    bonus: 2,
    tag: "Frontline + Hyper-Carry",
  },
  { champs: ["Volibear", "Jinx"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Volibear", "Twitch"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Volibear", "KogMaw"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Volibear", "Smolder"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Volibear", "Kaisa"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Volibear", "Kalista"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  {
    champs: ["Volibear", "Tristana"],
    bonus: 2,
    tag: "Frontline + Hyper-Carry",
  },
  { champs: ["Volibear", "Yunara"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Volibear", "Caitlyn"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["TahmKench", "Kaisa"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  {
    champs: ["TahmKench", "Kalista"],
    bonus: 2,
    tag: "Frontline + Hyper-Carry",
  },
  {
    champs: ["TahmKench", "Tristana"],
    bonus: 2,
    tag: "Frontline + Hyper-Carry",
  },
  {
    champs: ["TahmKench", "Caitlyn"],
    bonus: 2,
    tag: "Frontline + Hyper-Carry",
  },
  { champs: ["Galio", "Vayne"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Galio", "Aphelios"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Galio", "Jinx"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Galio", "Twitch"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Galio", "KogMaw"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Galio", "Smolder"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Galio", "Kaisa"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Galio", "Kalista"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Galio", "Tristana"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Galio", "Yunara"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Galio", "Caitlyn"], bonus: 2, tag: "Frontline + Hyper-Carry" },
  { champs: ["Caitlyn", "Jayce"], bonus: 2, tag: "Poke / Siege Pair" },
  { champs: ["Caitlyn", "Velkoz"], bonus: 2, tag: "Poke / Siege Pair" },
  { champs: ["Caitlyn", "Ezreal"], bonus: 2, tag: "Poke / Siege Pair" },
  { champs: ["Caitlyn", "Ziggs"], bonus: 2, tag: "Poke / Siege Pair" },
  { champs: ["Caitlyn", "Corki"], bonus: 2, tag: "Poke / Siege Pair" },
  { champs: ["Caitlyn", "Varus"], bonus: 2, tag: "Poke / Siege Pair" },
  { champs: ["Xerath", "Jayce"], bonus: 2, tag: "Poke / Siege Pair" },
  { champs: ["Xerath", "Velkoz"], bonus: 2, tag: "Poke / Siege Pair" },
  { champs: ["Xerath", "Heimerdinger"], bonus: 2, tag: "Poke / Siege Pair" },
  { champs: ["Xerath", "Lux"], bonus: 2, tag: "Poke / Siege Pair" },
  { champs: ["Xerath", "Karma"], bonus: 2, tag: "Poke / Siege Pair" },
  { champs: ["Xerath", "Brand"], bonus: 2, tag: "Poke / Siege Pair" },
  { champs: ["Xerath", "Ezreal"], bonus: 2, tag: "Poke / Siege Pair" },
  { champs: ["Xerath", "Smolder"], bonus: 2, tag: "Poke / Siege Pair" },
  { champs: ["Xerath", "Ziggs"], bonus: 2, tag: "Poke / Siege Pair" },
  { champs: ["Xerath", "Corki"], bonus: 2, tag: "Poke / Siege Pair" },
  { champs: ["Xerath", "Varus"], bonus: 2, tag: "Poke / Siege Pair" },
  { champs: ["Jayce", "Velkoz"], bonus: 2, tag: "Poke / Siege Pair" },
  { champs: ["Jayce", "Heimerdinger"], bonus: 2, tag: "Poke / Siege Pair" },
  { champs: ["Jayce", "Lux"], bonus: 2, tag: "Poke / Siege Pair" },
  { champs: ["Jayce", "Karma"], bonus: 2, tag: "Poke / Siege Pair" },
  { champs: ["Jayce", "Brand"], bonus: 2, tag: "Poke / Siege Pair" },
  { champs: ["Jayce", "Ezreal"], bonus: 2, tag: "Poke / Siege Pair" },
  { champs: ["Jayce", "Smolder"], bonus: 2, tag: "Poke / Siege Pair" },
  { champs: ["Jayce", "Ziggs"], bonus: 2, tag: "Poke / Siege Pair" },
  { champs: ["Jayce", "Corki"], bonus: 2, tag: "Poke / Siege Pair" },
  { champs: ["Jayce", "Varus"], bonus: 2, tag: "Poke / Siege Pair" },
  { champs: ["Velkoz", "Heimerdinger"], bonus: 2, tag: "Poke / Siege Pair" },
  { champs: ["Velkoz", "Lux"], bonus: 2, tag: "Poke / Siege Pair" },
  { champs: ["Velkoz", "Karma"], bonus: 2, tag: "Poke / Siege Pair" },
  { champs: ["Velkoz", "Brand"], bonus: 2, tag: "Poke / Siege Pair" },
  { champs: ["Velkoz", "Ezreal"], bonus: 2, tag: "Poke / Siege Pair" },
  { champs: ["Velkoz", "Smolder"], bonus: 2, tag: "Poke / Siege Pair" },
  { champs: ["Velkoz", "Ziggs"], bonus: 2, tag: "Poke / Siege Pair" },
  { champs: ["Velkoz", "Corki"], bonus: 2, tag: "Poke / Siege Pair" },
  { champs: ["Velkoz", "Varus"], bonus: 2, tag: "Poke / Siege Pair" },
  { champs: ["Heimerdinger", "Lux"], bonus: 2, tag: "Poke / Siege Pair" },
  { champs: ["Heimerdinger", "Karma"], bonus: 2, tag: "Poke / Siege Pair" },
  { champs: ["Heimerdinger", "Brand"], bonus: 2, tag: "Poke / Siege Pair" },
  { champs: ["Heimerdinger", "Ezreal"], bonus: 2, tag: "Poke / Siege Pair" },
  { champs: ["Heimerdinger", "Smolder"], bonus: 2, tag: "Poke / Siege Pair" },
  { champs: ["Heimerdinger", "Ziggs"], bonus: 2, tag: "Poke / Siege Pair" },
  { champs: ["Heimerdinger", "Corki"], bonus: 2, tag: "Poke / Siege Pair" },
  { champs: ["Heimerdinger", "Varus"], bonus: 2, tag: "Poke / Siege Pair" },
  { champs: ["Lux", "Karma"], bonus: 2, tag: "Poke / Siege Pair" },
  { champs: ["Lux", "Brand"], bonus: 2, tag: "Poke / Siege Pair" },
  { champs: ["Lux", "Ezreal"], bonus: 2, tag: "Poke / Siege Pair" },
  { champs: ["Lux", "Smolder"], bonus: 2, tag: "Poke / Siege Pair" },
  { champs: ["Lux", "Ziggs"], bonus: 2, tag: "Poke / Siege Pair" },
  { champs: ["Lux", "Corki"], bonus: 2, tag: "Poke / Siege Pair" },
  { champs: ["Lux", "Varus"], bonus: 2, tag: "Poke / Siege Pair" },
  { champs: ["Karma", "Brand"], bonus: 2, tag: "Poke / Siege Pair" },
  { champs: ["Karma", "Ziggs"], bonus: 2, tag: "Poke / Siege Pair" },
  { champs: ["Karma", "Corki"], bonus: 2, tag: "Poke / Siege Pair" },
  { champs: ["Karma", "Varus"], bonus: 2, tag: "Poke / Siege Pair" },
  { champs: ["Brand", "Ezreal"], bonus: 2, tag: "Poke / Siege Pair" },
  { champs: ["Brand", "Smolder"], bonus: 2, tag: "Poke / Siege Pair" },
  { champs: ["Brand", "Ziggs"], bonus: 2, tag: "Poke / Siege Pair" },
  { champs: ["Brand", "Corki"], bonus: 2, tag: "Poke / Siege Pair" },
  { champs: ["Brand", "Varus"], bonus: 2, tag: "Poke / Siege Pair" },
  { champs: ["Ezreal", "Smolder"], bonus: 2, tag: "Poke / Siege Pair" },
  { champs: ["Ezreal", "Ziggs"], bonus: 2, tag: "Poke / Siege Pair" },
  { champs: ["Ezreal", "Corki"], bonus: 2, tag: "Poke / Siege Pair" },
  { champs: ["Ezreal", "Varus"], bonus: 2, tag: "Poke / Siege Pair" },
  { champs: ["Smolder", "Ziggs"], bonus: 2, tag: "Poke / Siege Pair" },
  { champs: ["Smolder", "Corki"], bonus: 2, tag: "Poke / Siege Pair" },
  { champs: ["Smolder", "Varus"], bonus: 2, tag: "Poke / Siege Pair" },
  { champs: ["Ziggs", "Corki"], bonus: 2, tag: "Poke / Siege Pair" },
  { champs: ["Ziggs", "Varus"], bonus: 2, tag: "Poke / Siege Pair" },
  { champs: ["Corki", "Varus"], bonus: 2, tag: "Poke / Siege Pair" },

  // ─── Bulk balance additions (pass 2) ──────────────────────────────────
  { champs: ["Fiddlesticks", "Yasuo"], bonus: 2, tag: "Fear setup + Drain" },
  { champs: ["Fiddlesticks", "Veigar"], bonus: 2, tag: "Fear setup + Drain" },
  { champs: ["Fiddlesticks", "Karthus"], bonus: 2, tag: "Fear setup + Drain" },
  { champs: ["Fiddlesticks", "Orianna"], bonus: 2, tag: "Fear setup + Drain" },
  { champs: ["Fiddlesticks", "Maokai"], bonus: 2, tag: "Fear setup + Drain" },
  { champs: ["Fiddlesticks", "Lulu"], bonus: 2, tag: "Fear setup + Drain" },
  { champs: ["Fiddlesticks", "Janna"], bonus: 2, tag: "Fear setup + Drain" },
  { champs: ["Nocturne", "Caitlyn"], bonus: 2, tag: "Paranoia + Pick" },
  { champs: ["Nocturne", "Talon"], bonus: 2, tag: "Paranoia + Pick" },
  { champs: ["Nocturne", "Khazix"], bonus: 2, tag: "Paranoia + Pick" },
  { champs: ["Nocturne", "Karthus"], bonus: 2, tag: "Paranoia + Pick" },
  { champs: ["Nocturne", "Pantheon"], bonus: 2, tag: "Paranoia + Pick" },
  { champs: ["Elise", "Pantheon"], bonus: 2, tag: "Early Tempo Pair" },
  { champs: ["Elise", "Talon"], bonus: 2, tag: "Early Tempo Pair" },
  { champs: ["Elise", "Lucian"], bonus: 2, tag: "Early Tempo Pair" },
  { champs: ["Elise", "Draven"], bonus: 2, tag: "Early Tempo Pair" },
  { champs: ["Elise", "Renekton"], bonus: 2, tag: "Early Tempo Pair" },
  { champs: ["Evelynn", "Karthus"], bonus: 2, tag: "Stealth Pick + Burst" },
  { champs: ["Evelynn", "Veigar"], bonus: 2, tag: "Stealth Pick + Burst" },
  { champs: ["Evelynn", "Orianna"], bonus: 2, tag: "Stealth Pick + Burst" },
  { champs: ["Evelynn", "Lulu"], bonus: 2, tag: "Stealth Pick + Burst" },
  { champs: ["Evelynn", "Sett"], bonus: 2, tag: "Stealth Pick + Burst" },
  { champs: ["Gragas", "Yasuo"], bonus: 2, tag: "Body Slam + Wombo" },
  { champs: ["Gragas", "Veigar"], bonus: 2, tag: "Body Slam + Wombo" },
  { champs: ["Gragas", "Karthus"], bonus: 2, tag: "Body Slam + Wombo" },
  { champs: ["Gragas", "Orianna"], bonus: 2, tag: "Body Slam + Wombo" },
  { champs: ["Gragas", "MissFortune"], bonus: 2, tag: "Body Slam + Wombo" },
  { champs: ["Gnar", "Yasuo"], bonus: 2, tag: "GNAR! + Wombo" },
  { champs: ["Gnar", "Karthus"], bonus: 2, tag: "GNAR! + Wombo" },
  { champs: ["Gnar", "Veigar"], bonus: 2, tag: "GNAR! + Wombo" },
  { champs: ["Gnar", "Orianna"], bonus: 2, tag: "GNAR! + Wombo" },
  { champs: ["Gwen", "Karthus"], bonus: 2, tag: "Skirmish + Peel" },
  { champs: ["Gwen", "Lulu"], bonus: 2, tag: "Skirmish + Peel" },
  { champs: ["Gwen", "Yuumi"], bonus: 2, tag: "Skirmish + Peel" },
  { champs: ["Gwen", "Janna"], bonus: 2, tag: "Skirmish + Peel" },
  { champs: ["Gwen", "Soraka"], bonus: 2, tag: "Skirmish + Peel" },
  { champs: ["Illaoi", "Yasuo"], bonus: 2, tag: "Test of Spirit Setup" },
  { champs: ["Illaoi", "Orianna"], bonus: 2, tag: "Test of Spirit Setup" },
  { champs: ["Illaoi", "Maokai"], bonus: 2, tag: "Test of Spirit Setup" },
  { champs: ["Illaoi", "Sejuani"], bonus: 2, tag: "Test of Spirit Setup" },
  { champs: ["Illaoi", "Lulu"], bonus: 2, tag: "Test of Spirit Setup" },
  { champs: ["Irelia", "Karthus"], bonus: 2, tag: "Reset Skirmish + Buff" },
  { champs: ["Irelia", "Lulu"], bonus: 2, tag: "Reset Skirmish + Buff" },
  { champs: ["Irelia", "Yuumi"], bonus: 2, tag: "Reset Skirmish + Buff" },
  { champs: ["Irelia", "Sejuani"], bonus: 2, tag: "Reset Skirmish + Buff" },
  { champs: ["Irelia", "Orianna"], bonus: 2, tag: "Reset Skirmish + Buff" },
  { champs: ["Ivern", "Vayne"], bonus: 2, tag: "Daisy + Hyper-Carry" },
  { champs: ["Ivern", "Aphelios"], bonus: 2, tag: "Daisy + Hyper-Carry" },
  { champs: ["Ivern", "Jinx"], bonus: 2, tag: "Daisy + Hyper-Carry" },
  { champs: ["Ivern", "KogMaw"], bonus: 2, tag: "Daisy + Hyper-Carry" },
  { champs: ["Ivern", "Smolder"], bonus: 2, tag: "Daisy + Hyper-Carry" },
  { champs: ["Ivern", "Twitch"], bonus: 2, tag: "Daisy + Hyper-Carry" },
  { champs: ["Kassadin", "Lulu"], bonus: 2, tag: "Late-game Blink Carry" },
  { champs: ["Kassadin", "Janna"], bonus: 2, tag: "Late-game Blink Carry" },
  { champs: ["Kassadin", "Soraka"], bonus: 2, tag: "Late-game Blink Carry" },
  { champs: ["Kassadin", "Maokai"], bonus: 2, tag: "Late-game Blink Carry" },
  { champs: ["Kassadin", "Yuumi"], bonus: 2, tag: "Late-game Blink Carry" },
  { champs: ["Kindred", "Yasuo"], bonus: 2, tag: "Lamb's Respite Wombo" },
  { champs: ["Kindred", "Karthus"], bonus: 2, tag: "Lamb's Respite Wombo" },
  { champs: ["Kindred", "Orianna"], bonus: 2, tag: "Lamb's Respite Wombo" },
  { champs: ["Kindred", "Lulu"], bonus: 2, tag: "Lamb's Respite Wombo" },
  { champs: ["Kled", "Karthus"], bonus: 2, tag: "Mount Charge + Setup" },
  { champs: ["Kled", "Orianna"], bonus: 2, tag: "Mount Charge + Setup" },
  { champs: ["Kled", "Lulu"], bonus: 2, tag: "Mount Charge + Setup" },
  { champs: ["Kled", "Janna"], bonus: 2, tag: "Mount Charge + Setup" },
  { champs: ["Kled", "Pantheon"], bonus: 2, tag: "Mount Charge + Setup" },
  { champs: ["Malzahar", "Yasuo"], bonus: 2, tag: "Suppression + Burst" },
  { champs: ["Malzahar", "Karthus"], bonus: 2, tag: "Suppression + Burst" },
  { champs: ["Malzahar", "Veigar"], bonus: 2, tag: "Suppression + Burst" },
  { champs: ["Malzahar", "Lulu"], bonus: 2, tag: "Suppression + Burst" },
  { champs: ["MasterYi", "Lulu"], bonus: 2, tag: "Untouchable Splitpush" },
  { champs: ["MasterYi", "Soraka"], bonus: 2, tag: "Untouchable Splitpush" },
  { champs: ["MasterYi", "Janna"], bonus: 2, tag: "Untouchable Splitpush" },
  { champs: ["MasterYi", "Karthus"], bonus: 2, tag: "Untouchable Splitpush" },
  { champs: ["Neeko", "Yasuo"], bonus: 2, tag: "Pop Blossom Wombo" },
  { champs: ["Neeko", "Karthus"], bonus: 2, tag: "Pop Blossom Wombo" },
  { champs: ["Neeko", "Veigar"], bonus: 2, tag: "Pop Blossom Wombo" },
  { champs: ["Neeko", "Orianna"], bonus: 2, tag: "Pop Blossom Wombo" },
  { champs: ["Neeko", "Maokai"], bonus: 2, tag: "Pop Blossom Wombo" },
  { champs: ["Nidalee", "Karthus"], bonus: 2, tag: "Hunter Pair" },
  { champs: ["Nilah", "Lulu"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["Nilah", "Janna"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["Nilah", "Soraka"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["Nilah", "Yuumi"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["Nilah", "Milio"], bonus: 2, tag: "Hyper-Carry + Peel" },
  { champs: ["Nunu", "Yasuo"], bonus: 2, tag: "Absolute Zero Wombo" },
  { champs: ["Nunu", "Karthus"], bonus: 2, tag: "Absolute Zero Wombo" },
  { champs: ["Nunu", "Orianna"], bonus: 2, tag: "Absolute Zero Wombo" },
  { champs: ["Nunu", "Lulu"], bonus: 2, tag: "Absolute Zero Wombo" },
  { champs: ["Nunu", "Veigar"], bonus: 2, tag: "Absolute Zero Wombo" },
  { champs: ["Poppy", "Yasuo"], bonus: 2, tag: "Verdict Wombo" },
  { champs: ["Poppy", "Veigar"], bonus: 2, tag: "Verdict Wombo" },
  { champs: ["Poppy", "Karthus"], bonus: 2, tag: "Verdict Wombo" },
  { champs: ["Poppy", "Orianna"], bonus: 2, tag: "Verdict Wombo" },
  { champs: ["Qiyana", "Karthus"], bonus: 2, tag: "Terrain Stun Combo" },
  { champs: ["Qiyana", "Veigar"], bonus: 2, tag: "Terrain Stun Combo" },
  { champs: ["Qiyana", "Lulu"], bonus: 2, tag: "Terrain Stun Combo" },
  { champs: ["Qiyana", "Sejuani"], bonus: 2, tag: "Terrain Stun Combo" },
  { champs: ["RekSai", "Karthus"], bonus: 2, tag: "Burrow Pick" },
  { champs: ["RekSai", "Veigar"], bonus: 2, tag: "Burrow Pick" },
  { champs: ["RekSai", "Lulu"], bonus: 2, tag: "Burrow Pick" },
  { champs: ["RekSai", "Orianna"], bonus: 2, tag: "Burrow Pick" },
  { champs: ["Ryze", "Lulu"], bonus: 2, tag: "Late Mage Carry" },
  { champs: ["Ryze", "Janna"], bonus: 2, tag: "Late Mage Carry" },
  { champs: ["Ryze", "Karthus"], bonus: 2, tag: "Late Mage Carry" },
  { champs: ["Ryze", "Maokai"], bonus: 2, tag: "Late Mage Carry" },
  { champs: ["Samira", "Lulu"], bonus: 2, tag: "Style + Engage" },
  { champs: ["Samira", "Janna"], bonus: 2, tag: "Style + Engage" },
  { champs: ["Samira", "Yuumi"], bonus: 2, tag: "Style + Engage" },
  { champs: ["Samira", "Soraka"], bonus: 2, tag: "Style + Engage" },
  { champs: ["Samira", "Milio"], bonus: 2, tag: "Style + Engage" },
  { champs: ["Samira", "Sejuani"], bonus: 2, tag: "Style + Engage" },
  { champs: ["Samira", "Leona"], bonus: 2, tag: "Style + Engage" },
  { champs: ["Samira", "Nautilus"], bonus: 2, tag: "Style + Engage" },
  { champs: ["Shyvana", "Lulu"], bonus: 2, tag: "Dragon Form Wombo" },
  { champs: ["Shyvana", "Karthus"], bonus: 2, tag: "Dragon Form Wombo" },
  { champs: ["Shyvana", "Janna"], bonus: 2, tag: "Dragon Form Wombo" },
  { champs: ["Shyvana", "Orianna"], bonus: 2, tag: "Dragon Form Wombo" },
  { champs: ["Sivir", "Yuumi"], bonus: 2, tag: "On The Hunt + Peel" },
  { champs: ["Sivir", "Milio"], bonus: 2, tag: "On The Hunt + Peel" },
  { champs: ["Sivir", "Nami"], bonus: 2, tag: "On The Hunt + Peel" },
  { champs: ["Swain", "Lulu"], bonus: 2, tag: "Drain Tank Setup" },
  { champs: ["Swain", "Janna"], bonus: 2, tag: "Drain Tank Setup" },
  { champs: ["Swain", "Yuumi"], bonus: 2, tag: "Drain Tank Setup" },
  { champs: ["Swain", "Karthus"], bonus: 2, tag: "Drain Tank Setup" },
  { champs: ["Taliyah", "Karthus"], bonus: 2, tag: "Wall Trap + Wombo" },
  { champs: ["Taliyah", "Veigar"], bonus: 2, tag: "Wall Trap + Wombo" },
  { champs: ["Taliyah", "Orianna"], bonus: 2, tag: "Wall Trap + Wombo" },
  { champs: ["Taliyah", "Lulu"], bonus: 2, tag: "Wall Trap + Wombo" },
  { champs: ["Taric", "Vayne"], bonus: 2, tag: "Cosmic Radiance Hyper" },
  { champs: ["Taric", "Aphelios"], bonus: 2, tag: "Cosmic Radiance Hyper" },
  { champs: ["Taric", "Jinx"], bonus: 2, tag: "Cosmic Radiance Hyper" },
  { champs: ["Taric", "Kayle"], bonus: 2, tag: "Cosmic Radiance Hyper" },
  { champs: ["Taric", "MasterYi"], bonus: 2, tag: "Cosmic Radiance Hyper" },
  { champs: ["Taric", "Twitch"], bonus: 2, tag: "Cosmic Radiance Hyper" },
  { champs: ["Teemo", "Lulu"], bonus: 2, tag: "Shroom Map + Peel" },
  { champs: ["Teemo", "Yuumi"], bonus: 2, tag: "Shroom Map + Peel" },
  { champs: ["Teemo", "Janna"], bonus: 2, tag: "Shroom Map + Peel" },
  { champs: ["Teemo", "Karma"], bonus: 2, tag: "Shroom Map + Peel" },
  { champs: ["Teemo", "Karthus"], bonus: 2, tag: "Shroom Map + Peel" },
  { champs: ["Udyr", "Karthus"], bonus: 2, tag: "Awakened Stun + Wombo" },
  { champs: ["Udyr", "Orianna"], bonus: 2, tag: "Awakened Stun + Wombo" },
  { champs: ["Udyr", "Lulu"], bonus: 2, tag: "Awakened Stun + Wombo" },
  { champs: ["Udyr", "Veigar"], bonus: 2, tag: "Awakened Stun + Wombo" },
  { champs: ["Urgot", "Yasuo"], bonus: 2, tag: "Fear Pick + Wombo" },
  { champs: ["Urgot", "Karthus"], bonus: 2, tag: "Fear Pick + Wombo" },
  { champs: ["Urgot", "Orianna"], bonus: 2, tag: "Fear Pick + Wombo" },
  { champs: ["Urgot", "Lulu"], bonus: 2, tag: "Fear Pick + Wombo" },
  { champs: ["Urgot", "Veigar"], bonus: 2, tag: "Fear Pick + Wombo" },
  { champs: ["Vex", "Karthus"], bonus: 2, tag: "Doom + Wombo" },
  { champs: ["Vex", "Veigar"], bonus: 2, tag: "Doom + Wombo" },
  { champs: ["Vex", "Orianna"], bonus: 2, tag: "Doom + Wombo" },
  { champs: ["Vex", "Lulu"], bonus: 2, tag: "Doom + Wombo" },
  { champs: ["Viktor", "Lulu"], bonus: 2, tag: "Chaos Storm Setup" },
  { champs: ["Viktor", "Janna"], bonus: 2, tag: "Chaos Storm Setup" },
  { champs: ["Viktor", "Yuumi"], bonus: 2, tag: "Chaos Storm Setup" },
  { champs: ["Viktor", "Karthus"], bonus: 2, tag: "Chaos Storm Setup" },
  { champs: ["Viktor", "Maokai"], bonus: 2, tag: "Chaos Storm Setup" },
  { champs: ["Warwick", "Karthus"], bonus: 2, tag: "Infinite Duress Pair" },
  { champs: ["Warwick", "Lulu"], bonus: 2, tag: "Infinite Duress Pair" },
  { champs: ["Warwick", "Orianna"], bonus: 2, tag: "Infinite Duress Pair" },
  { champs: ["Xayah", "Janna"], bonus: 2, tag: "Featherstorm + Peel" },
  { champs: ["Xayah", "Lulu"], bonus: 2, tag: "Featherstorm + Peel" },
  { champs: ["Xayah", "Yuumi"], bonus: 2, tag: "Featherstorm + Peel" },
  { champs: ["Xayah", "Karma"], bonus: 2, tag: "Featherstorm + Peel" },
  { champs: ["Xayah", "Milio"], bonus: 2, tag: "Featherstorm + Peel" },
  { champs: ["Xayah", "Soraka"], bonus: 2, tag: "Featherstorm + Peel" },
  { champs: ["Xayah", "Nami"], bonus: 2, tag: "Featherstorm + Peel" },
  { champs: ["XinZhao", "Karthus"], bonus: 2, tag: "Talon Knockup Combo" },
  { champs: ["XinZhao", "Veigar"], bonus: 2, tag: "Talon Knockup Combo" },
  { champs: ["XinZhao", "Orianna"], bonus: 2, tag: "Talon Knockup Combo" },
  { champs: ["XinZhao", "Lulu"], bonus: 2, tag: "Talon Knockup Combo" },
  { champs: ["XinZhao", "Yasuo"], bonus: 2, tag: "Talon Knockup Combo" },
  { champs: ["Zeri", "Lulu"], bonus: 2, tag: "Spark Surge + Peel" },
  { champs: ["Zeri", "Janna"], bonus: 2, tag: "Spark Surge + Peel" },
  { champs: ["Zeri", "Yuumi"], bonus: 2, tag: "Spark Surge + Peel" },
  { champs: ["Zeri", "Soraka"], bonus: 2, tag: "Spark Surge + Peel" },
  { champs: ["Zeri", "Milio"], bonus: 2, tag: "Spark Surge + Peel" },
  { champs: ["Zeri", "Karma"], bonus: 2, tag: "Spark Surge + Peel" },
  { champs: ["Zilean", "Vayne"], bonus: 2, tag: "Chronoshift Late-Carry" },
  { champs: ["Zilean", "Aphelios"], bonus: 2, tag: "Chronoshift Late-Carry" },
  { champs: ["Zilean", "Jinx"], bonus: 2, tag: "Chronoshift Late-Carry" },
  { champs: ["Zilean", "MasterYi"], bonus: 2, tag: "Chronoshift Late-Carry" },
  { champs: ["Zilean", "KogMaw"], bonus: 2, tag: "Chronoshift Late-Carry" },
  { champs: ["Zilean", "Twitch"], bonus: 2, tag: "Chronoshift Late-Carry" },
  { champs: ["Zilean", "Smolder"], bonus: 2, tag: "Chronoshift Late-Carry" },
  { champs: ["Zilean", "Yunara"], bonus: 2, tag: "Chronoshift Late-Carry" },
  { champs: ["Zoe", "Karthus"], bonus: 2, tag: "Sleep Pick + Burst" },
  { champs: ["Zoe", "Veigar"], bonus: 2, tag: "Sleep Pick + Burst" },
  { champs: ["Zoe", "Pantheon"], bonus: 2, tag: "Sleep Pick + Burst" },
  { champs: ["Zoe", "Lulu"], bonus: 2, tag: "Sleep Pick + Burst" },
  { champs: ["Zyra", "Vayne"], bonus: 2, tag: "Root + AA Carry" },
  { champs: ["Zyra", "Aphelios"], bonus: 2, tag: "Root + AA Carry" },
  { champs: ["Zyra", "Jinx"], bonus: 2, tag: "Root + AA Carry" },
  { champs: ["Zyra", "Caitlyn"], bonus: 2, tag: "Root + AA Carry" },
  { champs: ["Zyra", "Smolder"], bonus: 2, tag: "Root + AA Carry" },
  { champs: ["Zyra", "Twitch"], bonus: 2, tag: "Root + AA Carry" },
  { champs: ["Bard", "Vayne"], bonus: 2, tag: "Stasis Setup + AA" },
  { champs: ["Bard", "Aphelios"], bonus: 2, tag: "Stasis Setup + AA" },
  { champs: ["Bard", "Jinx"], bonus: 2, tag: "Stasis Setup + AA" },
  { champs: ["Bard", "Smolder"], bonus: 2, tag: "Stasis Setup + AA" },
  { champs: ["Bard", "Ezreal"], bonus: 2, tag: "Stasis Setup + AA" },
  { champs: ["Braum", "Vayne"], bonus: 2, tag: "Concussive Stun + AA" },
  { champs: ["Braum", "Aphelios"], bonus: 2, tag: "Concussive Stun + AA" },
  { champs: ["Braum", "Jinx"], bonus: 2, tag: "Concussive Stun + AA" },
  { champs: ["Braum", "Twitch"], bonus: 2, tag: "Concussive Stun + AA" },
  { champs: ["Braum", "Caitlyn"], bonus: 2, tag: "Concussive Stun + AA" },
  { champs: ["Braum", "Tristana"], bonus: 2, tag: "Concussive Stun + AA" },
  { champs: ["Braum", "Smolder"], bonus: 2, tag: "Concussive Stun + AA" },
  { champs: ["Braum", "Yunara"], bonus: 2, tag: "Concussive Stun + AA" },
  { champs: ["Akshan", "Karthus"], bonus: 2, tag: "Revive + Global" },
  { champs: ["Akshan", "Pantheon"], bonus: 2, tag: "Revive + Global" },
  { champs: ["Akshan", "TwistedFate"], bonus: 2, tag: "Revive + Global" },
  { champs: ["Akshan", "Lulu"], bonus: 2, tag: "Revive + Global" },
  { champs: ["Azir", "Yasuo"], bonus: 2, tag: "Shurima Wall + Wombo" },
  { champs: ["Azir", "Lulu"], bonus: 2, tag: "Shurima Wall + Wombo" },
  { champs: ["Azir", "Janna"], bonus: 2, tag: "Shurima Wall + Wombo" },
  { champs: ["Azir", "Maokai"], bonus: 2, tag: "Shurima Wall + Wombo" },
  { champs: ["Azir", "Sejuani"], bonus: 2, tag: "Shurima Wall + Wombo" },
  { champs: ["Azir", "Karthus"], bonus: 2, tag: "Shurima Wall + Wombo" },
  { champs: ["Belveth", "Lulu"], bonus: 2, tag: "Hyper-Carry JG + Peel" },
  { champs: ["Belveth", "Janna"], bonus: 2, tag: "Hyper-Carry JG + Peel" },
  { champs: ["Belveth", "Yuumi"], bonus: 2, tag: "Hyper-Carry JG + Peel" },
  { champs: ["Belveth", "Karthus"], bonus: 2, tag: "Hyper-Carry JG + Peel" },
  { champs: ["Belveth", "Soraka"], bonus: 2, tag: "Hyper-Carry JG + Peel" },
  { champs: ["Renekton", "Hecarim"], bonus: 2, tag: "Early Bully Pair" },
  { champs: ["Renekton", "JarvanIV"], bonus: 2, tag: "Early Bully Pair" },
  { champs: ["Renekton", "Pantheon"], bonus: 2, tag: "Early Bully Pair" },
  { champs: ["Renekton", "TwistedFate"], bonus: 2, tag: "Early Bully Pair" },
  { champs: ["Renekton", "Karthus"], bonus: 2, tag: "Early Bully Pair" },
  { champs: ["Rumble", "Yasuo"], bonus: 2, tag: "Equalizer Wombo" },
  { champs: ["Rumble", "Karthus"], bonus: 2, tag: "Equalizer Wombo" },
  { champs: ["Rumble", "Orianna"], bonus: 2, tag: "Equalizer Wombo" },
  { champs: ["Rumble", "Lulu"], bonus: 2, tag: "Equalizer Wombo" },
  { champs: ["Rumble", "Maokai"], bonus: 2, tag: "Equalizer Wombo" },
  { champs: ["Garen", "Karthus"], bonus: 2, tag: "Spin + Wombo" },
  { champs: ["Garen", "Lulu"], bonus: 2, tag: "Spin + Wombo" },
  { champs: ["Garen", "Sejuani"], bonus: 2, tag: "Spin + Wombo" },
  { champs: ["Mordekaiser", "Karthus"], bonus: 2, tag: "Death Realm Pair" },
  { champs: ["Mordekaiser", "Lulu"], bonus: 2, tag: "Death Realm Pair" },
  { champs: ["Mordekaiser", "Yuumi"], bonus: 2, tag: "Death Realm Pair" },
  { champs: ["Mordekaiser", "Sejuani"], bonus: 2, tag: "Death Realm Pair" },
  { champs: ["Mordekaiser", "Orianna"], bonus: 2, tag: "Death Realm Pair" },
  { champs: ["Nasus", "Lulu"], bonus: 2, tag: "Stack Late + Peel" },
  { champs: ["Nasus", "Yuumi"], bonus: 2, tag: "Stack Late + Peel" },
  { champs: ["Nasus", "Janna"], bonus: 2, tag: "Stack Late + Peel" },
  { champs: ["Nasus", "Soraka"], bonus: 2, tag: "Stack Late + Peel" },
  { champs: ["Olaf", "Karthus"], bonus: 2, tag: "Ragnarok Charge" },
  { champs: ["Olaf", "Lulu"], bonus: 2, tag: "Ragnarok Charge" },
  { champs: ["Olaf", "Orianna"], bonus: 2, tag: "Ragnarok Charge" },
  { champs: ["Quinn", "Pantheon"], bonus: 2, tag: "Roam + Range" },
  { champs: ["Quinn", "Karthus"], bonus: 2, tag: "Roam + Range" },
  { champs: ["Riven", "Karthus"], bonus: 2, tag: "Q Reset + Peel" },
  { champs: ["Riven", "Lulu"], bonus: 2, tag: "Q Reset + Peel" },
  { champs: ["Riven", "Yuumi"], bonus: 2, tag: "Q Reset + Peel" },
  { champs: ["Riven", "Janna"], bonus: 2, tag: "Q Reset + Peel" },
  { champs: ["Riven", "Sejuani"], bonus: 2, tag: "Q Reset + Peel" },
  { champs: ["Sett", "Yasuo"], bonus: 2, tag: "The Show Stopper Wombo" },
  { champs: ["Sett", "Karthus"], bonus: 2, tag: "The Show Stopper Wombo" },
  { champs: ["Sett", "Orianna"], bonus: 2, tag: "The Show Stopper Wombo" },
  { champs: ["Sett", "Lulu"], bonus: 2, tag: "The Show Stopper Wombo" },
  { champs: ["Sett", "Sejuani"], bonus: 2, tag: "The Show Stopper Wombo" },
  { champs: ["Yorick", "Lulu"], bonus: 2, tag: "Maiden + Global" },
  { champs: ["Aatrox", "Lulu"], bonus: 2, tag: "Drain + Setup" },
  { champs: ["Aatrox", "Yuumi"], bonus: 2, tag: "Drain + Setup" },
  { champs: ["Aatrox", "Janna"], bonus: 2, tag: "Drain + Setup" },
  { champs: ["Aatrox", "Soraka"], bonus: 2, tag: "Drain + Setup" },
  { champs: ["Aatrox", "Karthus"], bonus: 2, tag: "Drain + Setup" },
  { champs: ["Aatrox", "JarvanIV"], bonus: 2, tag: "Drain + Setup" },
  { champs: ["Darius", "Karthus"], bonus: 2, tag: "Apprehend + Setup" },
  { champs: ["Darius", "Lulu"], bonus: 2, tag: "Apprehend + Setup" },
  { champs: ["Darius", "Yuumi"], bonus: 2, tag: "Apprehend + Setup" },
  { champs: ["Darius", "Hecarim"], bonus: 2, tag: "Apprehend + Setup" },
  { champs: ["Darius", "JarvanIV"], bonus: 2, tag: "Apprehend + Setup" },
  { champs: ["Draven", "Hecarim"], bonus: 2, tag: "Early Bully Pair" },
  { champs: ["Draven", "JarvanIV"], bonus: 2, tag: "Early Bully Pair" },
  { champs: ["Draven", "Pantheon"], bonus: 2, tag: "Early Bully Pair" },
  { champs: ["Draven", "Vi"], bonus: 2, tag: "Early Bully Pair" },
  { champs: ["Draven", "Diana"], bonus: 2, tag: "Early Bully Pair" },
  { champs: ["Draven", "Leona"], bonus: 2, tag: "Early Bully Pair" },
  { champs: ["Draven", "Nautilus"], bonus: 2, tag: "Early Bully Pair" },
  { champs: ["Draven", "Alistar"], bonus: 2, tag: "Early Bully Pair" },
  { champs: ["Draven", "Thresh"], bonus: 2, tag: "Early Bully Pair" },
  { champs: ["Leblanc", "Talon"], bonus: 2, tag: "Coordinated Mid+JG Burst" },
  { champs: ["Leblanc", "Diana"], bonus: 2, tag: "Coordinated Mid+JG Burst" },
  { champs: ["Leblanc", "Akali"], bonus: 2, tag: "Coordinated Mid+JG Burst" },

  // ─── Hand-curated final pass ──────────────────────────────────────────
  { champs: ["Akshan", "Sett"], bonus: 2, tag: "Roam + Brawl" },
  { champs: ["Akshan", "Hecarim"], bonus: 2, tag: "Roam + Charge" },
  { champs: ["Akshan", "Vi"], bonus: 2, tag: "Pick + Lockdown" },
  { champs: ["Akshan", "Sejuani"], bonus: 2, tag: "Roam + Engage" },
  { champs: ["Akshan", "Brand"], bonus: 2, tag: "Pick + Burn" },
  { champs: ["Gangplank", "Sejuani"], bonus: 2, tag: "Cannon + Slow Field" },
  { champs: ["Gangplank", "Maokai"], bonus: 2, tag: "Cannon + Roots" },
  { champs: ["Gangplank", "JarvanIV"], bonus: 2, tag: "Cannon + Cataclysm" },
  { champs: ["Gangplank", "Hecarim"], bonus: 2, tag: "Cannon + Charge" },
  { champs: ["Garen", "Hecarim"], bonus: 2, tag: "Top + JG Engage" },
  { champs: ["Garen", "Vi"], bonus: 2, tag: "Top + JG Lockdown" },
  { champs: ["Garen", "JarvanIV"], bonus: 2, tag: "Top + JG Engage" },
  { champs: ["Olaf", "Hecarim"], bonus: 2, tag: "Top + JG Charge" },
  { champs: ["Olaf", "JarvanIV"], bonus: 2, tag: "Top + JG Engage" },
  { champs: ["Olaf", "Sejuani"], bonus: 2, tag: "Bursts of Speed Pair" },
  { champs: ["Poppy", "Hecarim"], bonus: 2, tag: "Pin + Charge" },
  { champs: ["Poppy", "Sett"], bonus: 2, tag: "Top Engage Pair" },
  { champs: ["Poppy", "Sejuani"], bonus: 2, tag: "Pin + Slow" },
  { champs: ["Poppy", "Vi"], bonus: 2, tag: "Pin + Vault" },
  { champs: ["Quinn", "Sejuani"], bonus: 2, tag: "Top Roam + Engage" },
  { champs: ["Quinn", "Hecarim"], bonus: 2, tag: "Roam + Charge" },
  { champs: ["Quinn", "Vi"], bonus: 2, tag: "Roam + Vault" },
  { champs: ["Quinn", "Brand"], bonus: 2, tag: "Roam + Burn" },
  { champs: ["Shyvana", "Sejuani"], bonus: 2, tag: "Dragon Engage" },
  { champs: ["Shyvana", "Maokai"], bonus: 2, tag: "Dragon Form + Roots" },
  { champs: ["Shyvana", "Sett"], bonus: 2, tag: "Late Brawl Pair" },
  { champs: ["Shyvana", "Pantheon"], bonus: 2, tag: "Charge + Spear" },
  { champs: ["Swain", "Sejuani"], bonus: 2, tag: "Pull + Slow" },
  { champs: ["Swain", "Maokai"], bonus: 2, tag: "Pull + Roots" },
  { champs: ["Swain", "Hecarim"], bonus: 2, tag: "Pull + Charge" },
  { champs: ["Swain", "Sett"], bonus: 2, tag: "Drain Tank Pair" },
  { champs: ["Taliyah", "Pantheon"], bonus: 2, tag: "Roam + Wall" },
  { champs: ["Taliyah", "Sejuani"], bonus: 2, tag: "Wall + Slow" },
  { champs: ["Taliyah", "Maokai"], bonus: 2, tag: "Wall + Roots" },
  { champs: ["Taliyah", "Hecarim"], bonus: 2, tag: "Wall + Charge" },
  { champs: ["Udyr", "Maokai"], bonus: 2, tag: "Stun + Roots" },
  { champs: ["Udyr", "Sett"], bonus: 2, tag: "JG + Top Brawl" },
  { champs: ["Udyr", "Pantheon"], bonus: 2, tag: "Engage + Spear" },
  { champs: ["Vex", "Hecarim"], bonus: 2, tag: "Fear + Charge" },
  { champs: ["Vex", "JarvanIV"], bonus: 2, tag: "Fear + Cataclysm" },
  { champs: ["Vex", "Vi"], bonus: 2, tag: "Fear + Vault" },
  { champs: ["Vex", "Sejuani"], bonus: 2, tag: "Fear + Engage" },
  { champs: ["Warwick", "Sejuani"], bonus: 2, tag: "Suppression + Slow" },
  { champs: ["Warwick", "Maokai"], bonus: 2, tag: "Suppression + Roots" },
  { champs: ["Warwick", "Sett"], bonus: 2, tag: "Bloodthirst + Brawl" },
  { champs: ["Warwick", "Pantheon"], bonus: 2, tag: "Suppression + Spear" },
  { champs: ["Zoe", "Sejuani"], bonus: 2, tag: "Sleep + Slow" },
  { champs: ["Zoe", "Maokai"], bonus: 2, tag: "Sleep + Roots" },
  { champs: ["Zoe", "Hecarim"], bonus: 2, tag: "Sleep + Charge" },
  { champs: ["Zoe", "Vi"], bonus: 2, tag: "Sleep + Vault" },
  { champs: ["Zoe", "JarvanIV"], bonus: 2, tag: "Sleep + Cataclysm" },

  // ─── Final-pass small gap-fills ───────────────────────────────────────
  {
    champs: ["Kindred", "Veigar"],
    bonus: 2,
    tag: "Lamb's Respite + Cage zone",
  },
  {
    champs: ["Kindred", "Pantheon"],
    bonus: 2,
    tag: "Global pair + Lamb's Respite",
  },
  { champs: ["Leblanc", "Maokai"], bonus: 2, tag: "Root + Sigil chain" },
  { champs: ["Leblanc", "JarvanIV"], bonus: 2, tag: "Cataclysm + Sigil chain" },
  {
    champs: ["Malzahar", "JarvanIV"],
    bonus: 2,
    tag: "Cataclysm + Suppression",
  },
  { champs: ["Malzahar", "Sejuani"], bonus: 2, tag: "Glacial + Suppression" },
];

// ─── Synergy override ──────────────────────────────────────────────────────
// Mirrors the meta-tier override pattern. When an override is active, the
// override list REPLACES CHAMPION_SYNERGIES — getSynergy and any UI that
// reads getActiveSynergies() see only the overridden pairs. Bumped version
// counter lets dependent caches (counter lookup in helpers.ts, etc.)
// invalidate without prop drilling.
let _activeSynergyOverride: Synergy[] | null = null;
let _synergyOverrideVersion = 0;

export function setActiveSynergyOverride(o: Synergy[] | null): void {
  _activeSynergyOverride = o;
  _synergyOverrideVersion++;
}

export function getActiveSynergyOverride(): Synergy[] | null {
  return _activeSynergyOverride;
}

export function getActiveSynergies(): readonly Synergy[] {
  return _activeSynergyOverride ?? CHAMPION_SYNERGIES;
}

export function getSynergyOverrideVersion(): number {
  return _synergyOverrideVersion;
}

// Pre-built lookup map for the BASELINE table — built once at module load.
// When an override is active we build a fresh map from the override list
// on demand and memoize it against the override version so consumers
// don't pay the rebuild on every getSynergy call.
const BASELINE_SYNERGY_LOOKUP: Map<string, Synergy> = (() => {
  const map = new Map<string, Synergy>();
  for (const s of CHAMPION_SYNERGIES) {
    const [a, b] = s.champs;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    map.set(key, s);
  }
  return map;
})();

let _cachedSynergyLookup: Map<string, Synergy> = BASELINE_SYNERGY_LOOKUP;
let _cachedSynergyVersion = 0;

function activeSynergyLookup(): Map<string, Synergy> {
  if (!_activeSynergyOverride) return BASELINE_SYNERGY_LOOKUP;
  if (_cachedSynergyVersion === _synergyOverrideVersion)
    return _cachedSynergyLookup;
  const map = new Map<string, Synergy>();
  for (const s of _activeSynergyOverride) {
    const [a, b] = s.champs;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    map.set(key, s);
  }
  _cachedSynergyLookup = map;
  _cachedSynergyVersion = _synergyOverrideVersion;
  return map;
}

export function getSynergy(aliasA: string, aliasB: string): Synergy | null {
  const key = aliasA < aliasB ? `${aliasA}|${aliasB}` : `${aliasB}|${aliasA}`;
  return activeSynergyLookup().get(key) ?? null;
}

// ─── Counter override ──────────────────────────────────────────────────────
// Same pattern as the synergy override. The counter list lives in
// lib/draftAI/data.ts (HARD_COUNTERS) — when an override is active, the
// counter lookup in lib/draftAI/helpers.ts swaps to this list instead.
// Pairs are [counter, victim, bonus] so a single lane matchup can produce
// directional swings.
export type CounterPair = readonly [string, string, number];

let _activeCounterOverride: readonly CounterPair[] | null = null;
let _counterOverrideVersion = 0;

export function setActiveCounterOverride(
  o: readonly CounterPair[] | null,
): void {
  _activeCounterOverride = o;
  _counterOverrideVersion++;
}

export function getActiveCounterOverride(): readonly CounterPair[] | null {
  return _activeCounterOverride;
}

export function getCounterOverrideVersion(): number {
  return _counterOverrideVersion;
}
