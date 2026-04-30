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
  Aatrox: { phase: "mid", archetypes: ["dive", "skirmish", "sustain"], cc: "hard", mobility: "medium", metaTiers: { top: "S+" } },
  Ahri: { phase: "mid", archetypes: ["burst", "pick", "assassin"], cc: "hard", mobility: "high", metaTiers: { middle: "S" } },
  Akali: { phase: "mid", archetypes: ["assassin", "burst"], cc: "none", mobility: "high", metaTiers: { middle: "S+", top: "A" } },
  Akshan: { phase: "mid", archetypes: ["skirmish", "pick"], cc: "none", mobility: "high", metaTiers: { middle: "B", bottom: "A" } },
  Alistar: { phase: "mid", archetypes: ["tank", "engage", "peel"], cc: "hard", mobility: "medium", metaTiers: { support: "S" } },
  Ambessa: { phase: "mid", archetypes: ["dive", "skirmish"], cc: "soft", mobility: "high", metaTiers: { top: "S+" } },
  Amumu: { phase: "mid", archetypes: ["tank", "engage", "wombo"], cc: "hard", mobility: "medium", metaTiers: { jungle: "B", support: "C" } },
  Anivia: { phase: "late", archetypes: ["burst", "poke", "peel"], cc: "hard", mobility: "low", metaTiers: { middle: "A" } },
  Annie: { phase: "mid", archetypes: ["burst", "wombo"], cc: "hard", mobility: "low", metaTiers: { middle: "B", support: "A" } },
  Aphelios: { phase: "mid-late", archetypes: ["hyper-carry"], cc: "soft", mobility: "low", metaTiers: { bottom: "S" } },
  Ashe: { phase: "mid", archetypes: ["poke", "pick", "peel"], cc: "hard", mobility: "low", metaTiers: { bottom: "S", support: "B" } },
  AurelionSol: { phase: "late", archetypes: ["burst", "wombo", "poke"], cc: "hard", mobility: "low", metaTiers: { middle: "A" } },
  Aurora: { phase: "mid", archetypes: ["burst", "peel"], cc: "soft", mobility: "medium", metaTiers: { middle: "S", top: "B" } },
  Azir: { phase: "late", archetypes: ["wombo", "poke", "peel"], cc: "hard", mobility: "medium", metaTiers: { middle: "A" } },
  Bard: { phase: "mid", archetypes: ["pick", "peel", "wombo"], cc: "hard", mobility: "medium", metaTiers: { support: "S+" } },
  Belveth: { phase: "mid", archetypes: ["skirmish", "dive", "hyper-carry"], cc: "hard", mobility: "high", metaTiers: { jungle: "S+" } },
  Blitzcrank: { phase: "mid", archetypes: ["pick", "engage"], cc: "hard", mobility: "low", metaTiers: { support: "A" } },
  Brand: { phase: "mid", archetypes: ["burst", "wombo", "poke"], cc: "hard", mobility: "low", metaTiers: { support: "A", middle: "B" } },
  Braum: { phase: "mid", archetypes: ["tank", "peel", "engage"], cc: "hard", mobility: "low", metaTiers: { support: "S" } },
  Briar: { phase: "mid", archetypes: ["skirmish", "dive", "sustain"], cc: "hard", mobility: "medium", metaTiers: { jungle: "S+" } },
  Caitlyn: { phase: "mid-late", archetypes: ["poke", "hyper-carry"], cc: "soft", mobility: "medium", metaTiers: { bottom: "S+" } },
  Camille: { phase: "mid", archetypes: ["splitpush", "dive", "skirmish"], cc: "hard", mobility: "high", metaTiers: { top: "S+", jungle: "B" } },
  Cassiopeia: { phase: "late", archetypes: ["poke", "burst", "skirmish"], cc: "hard", mobility: "low", metaTiers: { middle: "S", top: "B" } },
  Chogath: { phase: "mid", archetypes: ["tank", "engage"], cc: "hard", mobility: "low", metaTiers: { top: "B", jungle: "C" } },
  Corki: { phase: "mid-late", archetypes: ["poke", "burst"], cc: "none", mobility: "medium", metaTiers: { middle: "B", bottom: "A" } },
  Darius: { phase: "early", archetypes: ["dive", "skirmish", "sustain"], cc: "hard", mobility: "low", metaTiers: { top: "S" } },
  Diana: { phase: "mid", archetypes: ["assassin", "dive", "wombo"], cc: "hard", mobility: "high", metaTiers: { jungle: "S", middle: "A" } },
  DrMundo: { phase: "late", archetypes: ["tank", "sustain"], cc: "soft", mobility: "low", metaTiers: { top: "B" } },
  Draven: { phase: "early", archetypes: ["hyper-carry", "skirmish"], cc: "soft", mobility: "low", metaTiers: { bottom: "A" } },
  Ekko: { phase: "mid", archetypes: ["assassin", "dive"], cc: "hard", mobility: "high", metaTiers: { jungle: "S", middle: "A" } },
  Elise: { phase: "early", archetypes: ["dive", "pick"], cc: "hard", mobility: "medium", metaTiers: { jungle: "B", support: "C" } },
  Evelynn: { phase: "mid", archetypes: ["assassin", "pick"], cc: "hard", mobility: "high", metaTiers: { jungle: "B" } },
  Ezreal: { phase: "mid-late", archetypes: ["poke", "skirmish"], cc: "none", mobility: "high", metaTiers: { bottom: "S", middle: "B" } },
  Fiddlesticks: { phase: "mid", archetypes: ["wombo", "burst"], cc: "hard", mobility: "low", metaTiers: { jungle: "A", support: "C" } },
  Fiora: { phase: "mid", archetypes: ["splitpush", "skirmish"], cc: "hard", mobility: "medium", metaTiers: { top: "S+" } },
  Fizz: { phase: "mid", archetypes: ["assassin", "burst"], cc: "hard", mobility: "high", metaTiers: { middle: "A", top: "C" } },
  Galio: { phase: "mid", archetypes: ["engage", "wombo", "tank"], cc: "hard", mobility: "medium", metaTiers: { middle: "S", support: "A" } },
  Gangplank: { phase: "late", archetypes: ["splitpush", "poke"], cc: "soft", mobility: "low", metaTiers: { top: "A", middle: "C" } },
  Garen: { phase: "mid", archetypes: ["dive", "skirmish"], cc: "soft", mobility: "low", metaTiers: { top: "S", support: "C" } },
  Gnar: { phase: "mid", archetypes: ["poke", "wombo"], cc: "hard", mobility: "medium", metaTiers: { top: "A" } },
  Gragas: { phase: "mid", archetypes: ["engage", "wombo"], cc: "hard", mobility: "medium", metaTiers: { jungle: "B", top: "C", middle: "C" } },
  Graves: { phase: "mid", archetypes: ["skirmish"], cc: "soft", mobility: "medium", metaTiers: { jungle: "S" } },
  Gwen: { phase: "mid-late", archetypes: ["skirmish", "sustain", "splitpush"], cc: "none", mobility: "medium", metaTiers: { top: "A", jungle: "C" } },
  Hecarim: { phase: "mid", archetypes: ["dive", "engage"], cc: "hard", mobility: "high", metaTiers: { jungle: "S+" } },
  Heimerdinger: { phase: "mid", archetypes: ["poke", "peel"], cc: "hard", mobility: "low", metaTiers: { top: "B", support: "A", middle: "C" } },
  Hwei: { phase: "mid", archetypes: ["burst", "poke", "peel"], cc: "hard", mobility: "low", metaTiers: { middle: "S", support: "B" } },
  Illaoi: { phase: "mid", archetypes: ["skirmish", "sustain"], cc: "soft", mobility: "low", metaTiers: { top: "B" } },
  Irelia: { phase: "mid", archetypes: ["skirmish", "dive"], cc: "hard", mobility: "high", metaTiers: { top: "A", middle: "B" } },
  Ivern: { phase: "mid", archetypes: ["peel", "enchanter"], cc: "hard", mobility: "low", metaTiers: { jungle: "B" } },
  Janna: { phase: "mid", archetypes: ["peel", "enchanter"], cc: "hard", mobility: "low", metaTiers: { support: "S" } },
  JarvanIV: { phase: "mid", archetypes: ["engage", "dive"], cc: "hard", mobility: "medium", metaTiers: { jungle: "A" } },
  Jax: { phase: "mid-late", archetypes: ["splitpush", "skirmish"], cc: "hard", mobility: "high", metaTiers: { top: "S+", jungle: "B" } },
  Jayce: { phase: "mid", archetypes: ["poke"], cc: "hard", mobility: "medium", metaTiers: { top: "A", middle: "C" } },
  Jhin: { phase: "mid", archetypes: ["poke", "hyper-carry", "pick"], cc: "soft", mobility: "low", metaTiers: { bottom: "S+" } },
  Jinx: { phase: "late", archetypes: ["hyper-carry"], cc: "soft", mobility: "low", metaTiers: { bottom: "S" } },
  KSante: { phase: "mid", archetypes: ["tank", "engage", "skirmish"], cc: "hard", mobility: "medium", metaTiers: { top: "S" } },
  Kaisa: { phase: "mid-late", archetypes: ["hyper-carry", "dive"], cc: "soft", mobility: "high", metaTiers: { bottom: "S+" } },
  Kalista: { phase: "mid", archetypes: ["hyper-carry", "pick"], cc: "hard", mobility: "high", metaTiers: { bottom: "B" } },
  Karma: { phase: "mid", archetypes: ["enchanter", "poke", "peel"], cc: "hard", mobility: "low", metaTiers: { support: "S+", middle: "C" } },
  Karthus: { phase: "late", archetypes: ["wombo", "burst"], cc: "hard", mobility: "low", metaTiers: { jungle: "S", middle: "B" } },
  Kassadin: { phase: "late", archetypes: ["assassin", "skirmish"], cc: "soft", mobility: "high", metaTiers: { middle: "A" } },
  Katarina: { phase: "mid", archetypes: ["assassin", "wombo"], cc: "none", mobility: "high", metaTiers: { middle: "B" } },
  Kayle: { phase: "late", archetypes: ["hyper-carry", "splitpush"], cc: "soft", mobility: "low", metaTiers: { top: "A", middle: "C" } },
  Kayn: { phase: "mid", archetypes: ["assassin", "skirmish", "dive"], cc: "hard", mobility: "high", metaTiers: { jungle: "A" } },
  Kennen: { phase: "mid", archetypes: ["wombo", "burst"], cc: "hard", mobility: "medium", metaTiers: { top: "B", middle: "C" } },
  Khazix: { phase: "mid", archetypes: ["assassin"], cc: "soft", mobility: "high", metaTiers: { jungle: "S" } },
  Kindred: { phase: "mid-late", archetypes: ["hyper-carry", "skirmish"], cc: "soft", mobility: "medium", metaTiers: { jungle: "A" } },
  Kled: { phase: "mid", archetypes: ["dive", "engage"], cc: "hard", mobility: "medium", metaTiers: { top: "B", jungle: "C" } },
  KogMaw: { phase: "late", archetypes: ["hyper-carry"], cc: "soft", mobility: "low", metaTiers: { bottom: "A" } },
  Leblanc: { phase: "mid", archetypes: ["assassin", "burst", "pick"], cc: "hard", mobility: "high", metaTiers: { middle: "S" } },
  LeeSin: { phase: "early", archetypes: ["skirmish", "dive", "engage"], cc: "hard", mobility: "high", metaTiers: { jungle: "S" } },
  Leona: { phase: "mid", archetypes: ["tank", "engage"], cc: "hard", mobility: "medium", metaTiers: { support: "S" } },
  Lillia: { phase: "mid", archetypes: ["skirmish", "wombo"], cc: "hard", mobility: "medium", metaTiers: { jungle: "S+", top: "C" } },
  Lissandra: { phase: "mid", archetypes: ["burst", "wombo"], cc: "hard", mobility: "medium", metaTiers: { middle: "A" } },
  Lucian: { phase: "mid", archetypes: ["burst", "skirmish"], cc: "none", mobility: "high", metaTiers: { middle: "A", bottom: "S" } },
  Lulu: { phase: "mid", archetypes: ["peel", "enchanter"], cc: "hard", mobility: "low", metaTiers: { support: "S+", middle: "C", top: "C" } },
  Lux: { phase: "mid", archetypes: ["poke", "burst", "peel"], cc: "hard", mobility: "low", metaTiers: { support: "A", middle: "B" } },
  Malphite: { phase: "mid", archetypes: ["tank", "engage", "wombo"], cc: "hard", mobility: "medium", metaTiers: { top: "A", support: "B" } },
  Malzahar: { phase: "mid", archetypes: ["burst", "pick"], cc: "hard", mobility: "low", metaTiers: { middle: "A" } },
  Maokai: { phase: "mid", archetypes: ["tank", "engage"], cc: "hard", mobility: "low", metaTiers: { support: "S", top: "A", jungle: "C" } },
  MasterYi: { phase: "mid-late", archetypes: ["skirmish", "splitpush"], cc: "none", mobility: "high", metaTiers: { jungle: "S" } },
  Mel: { phase: "mid", archetypes: ["burst", "peel"], cc: "hard", mobility: "low", metaTiers: { middle: "S+", support: "B" } },
  Milio: { phase: "mid", archetypes: ["peel", "enchanter"], cc: "hard", mobility: "low", metaTiers: { support: "S+" } },
  MissFortune: { phase: "mid", archetypes: ["wombo", "poke"], cc: "soft", mobility: "medium", metaTiers: { bottom: "S", support: "B" } },
  MonkeyKing: { phase: "mid", archetypes: ["dive", "wombo"], cc: "hard", mobility: "medium", metaTiers: { top: "B", jungle: "A" } }, // Wukong
  Mordekaiser: { phase: "mid", archetypes: ["dive", "skirmish", "sustain"], cc: "hard", mobility: "low", metaTiers: { top: "S", jungle: "C" } },
  Morgana: { phase: "mid", archetypes: ["peel", "pick"], cc: "hard", mobility: "low", metaTiers: { support: "S", middle: "B" } },
  Naafiri: { phase: "mid", archetypes: ["assassin", "dive"], cc: "none", mobility: "high", metaTiers: { middle: "S", jungle: "C" } },
  Nami: { phase: "mid", archetypes: ["enchanter", "peel", "wombo"], cc: "hard", mobility: "low", metaTiers: { support: "S+" } },
  Nasus: { phase: "late", archetypes: ["splitpush", "skirmish", "sustain"], cc: "soft", mobility: "low", metaTiers: { top: "B" } },
  Nautilus: { phase: "mid", archetypes: ["tank", "engage", "pick"], cc: "hard", mobility: "medium", metaTiers: { support: "S" } },
  Neeko: { phase: "mid", archetypes: ["burst", "wombo"], cc: "hard", mobility: "medium", metaTiers: { middle: "A", support: "A" } },
  Nidalee: { phase: "early", archetypes: ["poke", "skirmish"], cc: "soft", mobility: "high", metaTiers: { jungle: "B" } },
  Nilah: { phase: "mid-late", archetypes: ["hyper-carry", "skirmish"], cc: "hard", mobility: "medium", metaTiers: { bottom: "A" } },
  Nocturne: { phase: "mid", archetypes: ["dive", "engage", "assassin"], cc: "hard", mobility: "high", metaTiers: { jungle: "A", middle: "C" } },
  Nunu: { phase: "mid", archetypes: ["engage", "peel"], cc: "hard", mobility: "low", metaTiers: { jungle: "A" } },
  Olaf: { phase: "early", archetypes: ["skirmish", "dive"], cc: "soft", mobility: "low", metaTiers: { top: "A", jungle: "S" } },
  Orianna: { phase: "mid", archetypes: ["wombo", "peel", "poke"], cc: "hard", mobility: "low", metaTiers: { middle: "S" } },
  Ornn: { phase: "mid", archetypes: ["tank", "engage", "wombo"], cc: "hard", mobility: "low", metaTiers: { top: "B" } },
  Pantheon: { phase: "early", archetypes: ["dive", "engage"], cc: "hard", mobility: "medium", metaTiers: { support: "A", top: "B", middle: "C", jungle: "C" } },
  Poppy: { phase: "mid", archetypes: ["tank", "engage", "peel"], cc: "hard", mobility: "medium", metaTiers: { top: "A", support: "A", jungle: "B" } },
  Pyke: { phase: "mid", archetypes: ["pick", "assassin", "engage"], cc: "hard", mobility: "high", metaTiers: { support: "S+", middle: "C" } },
  Qiyana: { phase: "mid", archetypes: ["assassin", "wombo"], cc: "hard", mobility: "high", metaTiers: { middle: "A" } },
  Quinn: { phase: "mid", archetypes: ["splitpush", "skirmish"], cc: "hard", mobility: "high", metaTiers: { top: "A", middle: "C" } },
  Rakan: { phase: "mid", archetypes: ["engage", "peel", "enchanter"], cc: "hard", mobility: "high", metaTiers: { support: "S+" } },
  Rammus: { phase: "mid", archetypes: ["tank", "engage"], cc: "hard", mobility: "medium", metaTiers: { jungle: "A", top: "C" } },
  RekSai: { phase: "mid", archetypes: ["skirmish", "dive"], cc: "hard", mobility: "medium", metaTiers: { jungle: "B" } },
  Rell: { phase: "mid", archetypes: ["tank", "engage", "wombo"], cc: "hard", mobility: "medium", metaTiers: { support: "A", jungle: "C" } },
  Renata: { phase: "mid", archetypes: ["enchanter", "peel", "wombo"], cc: "hard", mobility: "low", metaTiers: { support: "A" } },
  Renekton: { phase: "early", archetypes: ["dive", "skirmish"], cc: "hard", mobility: "medium", metaTiers: { top: "A" } },
  Rengar: { phase: "mid", archetypes: ["assassin"], cc: "soft", mobility: "high", metaTiers: { jungle: "S", top: "C" } },
  Riven: { phase: "mid", archetypes: ["skirmish", "dive"], cc: "hard", mobility: "high", metaTiers: { top: "S" } },
  Rumble: { phase: "mid", archetypes: ["wombo", "skirmish"], cc: "soft", mobility: "low", metaTiers: { top: "B", middle: "C" } },
  Ryze: { phase: "mid-late", archetypes: ["burst", "wombo"], cc: "hard", mobility: "low", metaTiers: { middle: "B", top: "C" } },
  Samira: { phase: "mid", archetypes: ["wombo", "skirmish", "hyper-carry"], cc: "soft", mobility: "medium", metaTiers: { bottom: "A" } },
  Sejuani: { phase: "mid", archetypes: ["tank", "engage", "wombo"], cc: "hard", mobility: "medium", metaTiers: { jungle: "A" } },
  Senna: { phase: "late", archetypes: ["hyper-carry", "poke"], cc: "hard", mobility: "low", metaTiers: { support: "S", bottom: "A" } },
  Seraphine: { phase: "mid", archetypes: ["wombo", "peel", "enchanter"], cc: "hard", mobility: "low", metaTiers: { support: "A", middle: "B", bottom: "C" } },
  Sett: { phase: "mid", archetypes: ["dive", "skirmish", "engage"], cc: "hard", mobility: "low", metaTiers: { top: "S", support: "A", middle: "C" } },
  Shaco: { phase: "early", archetypes: ["assassin", "pick"], cc: "none", mobility: "high", metaTiers: { jungle: "S", support: "B" } },
  Shen: { phase: "mid", archetypes: ["tank", "peel", "engage"], cc: "hard", mobility: "medium", metaTiers: { top: "B", support: "B" } },
  Shyvana: { phase: "mid-late", archetypes: ["skirmish", "dive", "poke"], cc: "hard", mobility: "medium", metaTiers: { jungle: "A", top: "C" } }, // 26.06 rework
  Singed: { phase: "mid", archetypes: ["splitpush"], cc: "hard", mobility: "low", metaTiers: { top: "B" } },
  Sion: { phase: "mid-late", archetypes: ["tank", "engage"], cc: "hard", mobility: "low", metaTiers: { top: "B", support: "C" } },
  Sivir: { phase: "mid", archetypes: ["hyper-carry", "peel"], cc: "soft", mobility: "medium", metaTiers: { bottom: "A" } },
  Skarner: { phase: "mid", archetypes: ["tank", "engage"], cc: "hard", mobility: "medium", metaTiers: { jungle: "A", top: "C" } },
  Smolder: { phase: "late", archetypes: ["hyper-carry"], cc: "soft", mobility: "medium", metaTiers: { bottom: "S" } },
  Sona: { phase: "mid", archetypes: ["enchanter", "peel", "wombo"], cc: "hard", mobility: "low", metaTiers: { support: "A", middle: "C" } },
  Soraka: { phase: "mid", archetypes: ["enchanter", "peel"], cc: "soft", mobility: "low", metaTiers: { support: "S" } },
  Swain: { phase: "mid", archetypes: ["burst", "wombo", "sustain"], cc: "hard", mobility: "low", metaTiers: { support: "A", top: "B", middle: "B" } },
  Sylas: { phase: "mid", archetypes: ["dive", "skirmish"], cc: "hard", mobility: "high", metaTiers: { middle: "S+", top: "A" } },
  Syndra: { phase: "mid-late", archetypes: ["burst", "wombo"], cc: "hard", mobility: "low", metaTiers: { middle: "A" } },
  TahmKench: { phase: "mid", archetypes: ["tank", "peel", "sustain"], cc: "hard", mobility: "medium", metaTiers: { support: "A", top: "A" } },
  Taliyah: { phase: "mid", archetypes: ["wombo", "poke"], cc: "hard", mobility: "medium", metaTiers: { middle: "A", jungle: "A" } },
  Talon: { phase: "mid", archetypes: ["assassin"], cc: "soft", mobility: "high", metaTiers: { middle: "A", jungle: "B" } },
  Taric: { phase: "mid", archetypes: ["tank", "peel", "engage"], cc: "hard", mobility: "low", metaTiers: { support: "A" } },
  Teemo: { phase: "mid-late", archetypes: ["splitpush", "poke"], cc: "soft", mobility: "low", metaTiers: { top: "B", middle: "C", support: "C" } },
  Thresh: { phase: "mid", archetypes: ["pick", "engage", "peel"], cc: "hard", mobility: "low", metaTiers: { support: "S+" } },
  Tristana: { phase: "mid-late", archetypes: ["hyper-carry", "dive"], cc: "hard", mobility: "high", metaTiers: { bottom: "S", middle: "B" } },
  Trundle: { phase: "mid", archetypes: ["dive", "skirmish", "splitpush"], cc: "soft", mobility: "low", metaTiers: { jungle: "A", top: "A" } },
  Tryndamere: { phase: "mid-late", archetypes: ["splitpush", "skirmish"], cc: "soft", mobility: "medium", metaTiers: { top: "A" } },
  TwistedFate: { phase: "mid", archetypes: ["pick", "wombo"], cc: "hard", mobility: "medium", metaTiers: { middle: "A", support: "C" } },
  Twitch: { phase: "late", archetypes: ["hyper-carry", "poke"], cc: "soft", mobility: "low", metaTiers: { bottom: "S", jungle: "C" } },
  Udyr: { phase: "mid", archetypes: ["skirmish", "dive"], cc: "hard", mobility: "medium", metaTiers: { jungle: "A" } },
  Urgot: { phase: "mid", archetypes: ["dive", "sustain"], cc: "hard", mobility: "medium", metaTiers: { top: "A" } },
  Varus: { phase: "mid", archetypes: ["poke", "hyper-carry"], cc: "hard", mobility: "low", metaTiers: { bottom: "A", support: "B" } },
  Vayne: { phase: "late", archetypes: ["hyper-carry", "splitpush"], cc: "hard", mobility: "high", metaTiers: { bottom: "S+", top: "C" } },
  Veigar: { phase: "late", archetypes: ["burst", "wombo"], cc: "hard", mobility: "low", metaTiers: { middle: "S", support: "B" } },
  Velkoz: { phase: "mid", archetypes: ["poke", "burst"], cc: "hard", mobility: "low", metaTiers: { middle: "A", support: "A" } },
  Vex: { phase: "mid", archetypes: ["burst", "peel"], cc: "hard", mobility: "medium", metaTiers: { middle: "A", support: "B" } },
  Vi: { phase: "mid", archetypes: ["engage", "dive"], cc: "hard", mobility: "medium", metaTiers: { jungle: "A" } },
  Viego: { phase: "mid", archetypes: ["skirmish", "dive"], cc: "hard", mobility: "medium", metaTiers: { jungle: "A" } },
  Viktor: { phase: "mid-late", archetypes: ["wombo", "burst"], cc: "hard", mobility: "low", metaTiers: { middle: "A" } },
  Vladimir: { phase: "late", archetypes: ["sustain", "burst", "wombo"], cc: "soft", mobility: "low", metaTiers: { middle: "B", top: "B" } },
  Volibear: { phase: "mid", archetypes: ["dive", "skirmish"], cc: "hard", mobility: "medium", metaTiers: { top: "A", jungle: "A" } },
  Warwick: { phase: "mid", archetypes: ["dive", "skirmish", "sustain"], cc: "hard", mobility: "medium", metaTiers: { jungle: "A", top: "B" } },
  Xayah: { phase: "mid-late", archetypes: ["hyper-carry", "peel"], cc: "hard", mobility: "medium", metaTiers: { bottom: "S" } },
  Xerath: { phase: "mid", archetypes: ["poke", "burst"], cc: "hard", mobility: "low", metaTiers: { middle: "B", support: "A" } },
  XinZhao: { phase: "mid", archetypes: ["engage", "dive"], cc: "hard", mobility: "medium", metaTiers: { jungle: "A" } },
  Yasuo: { phase: "mid", archetypes: ["skirmish", "wombo"], cc: "hard", mobility: "high", metaTiers: { middle: "S+", top: "A" } },
  Yone: { phase: "mid", archetypes: ["skirmish", "dive"], cc: "hard", mobility: "high", metaTiers: { middle: "S+", top: "A" } },
  Yorick: { phase: "mid-late", archetypes: ["splitpush", "sustain"], cc: "soft", mobility: "low", metaTiers: { top: "A" } },
  Yunara: { phase: "late", archetypes: ["hyper-carry", "skirmish"], cc: "soft", mobility: "medium", metaTiers: { bottom: "S+" } }, // 25.14 release — magic-crit ADC
  Yuumi: { phase: "mid", archetypes: ["enchanter", "peel"], cc: "hard", mobility: "high", metaTiers: { support: "S+" } }, // attached W
  Zac: { phase: "mid", archetypes: ["tank", "engage", "wombo"], cc: "hard", mobility: "medium", metaTiers: { jungle: "A", support: "C" } },
  Zaahen: { phase: "mid-late", archetypes: ["skirmish", "dive", "sustain"], cc: "hard", mobility: "medium", metaTiers: { top: "A", jungle: "C" } }, // 25.23 release — Darkin fighter
  Zed: { phase: "mid", archetypes: ["assassin"], cc: "soft", mobility: "high", metaTiers: { middle: "A" } },
  Zeri: { phase: "mid-late", archetypes: ["hyper-carry", "skirmish"], cc: "soft", mobility: "high", metaTiers: { bottom: "S+" } },
  Ziggs: { phase: "mid-late", archetypes: ["poke", "burst"], cc: "hard", mobility: "low", metaTiers: { middle: "B", bottom: "A" } },
  Zilean: { phase: "mid", archetypes: ["peel", "enchanter"], cc: "hard", mobility: "low", metaTiers: { support: "A", middle: "C" } },
  Zoe: { phase: "mid", archetypes: ["burst", "pick"], cc: "hard", mobility: "medium", metaTiers: { middle: "A" } },
  Zyra: { phase: "mid", archetypes: ["burst", "wombo"], cc: "hard", mobility: "low", metaTiers: { support: "A", middle: "C" } },
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
  { champs: ["Malphite", "MissFortune"], bonus: 2, tag: "Knockup → Bullet Time" },
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
  { champs: ["Camille", "TwistedFate"], bonus: 2, tag: "Splitpush + Map Pressure" },

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
  { champs: ["Anivia", "Kassadin"], bonus: 2, tag: "Wall Trap → Cleanup" },
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
  { champs: ["JarvanIV", "Lissandra"], bonus: 2, tag: "Cataclysm + Frozen Tomb" },
  { champs: ["Anivia", "JarvanIV"], bonus: 2, tag: "Cataclysm + Glacial Storm" },
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
  { champs: ["Blitzcrank", "MissFortune"], bonus: 2, tag: "Hook + Bullet Time" },
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
  { champs: ["Janna", "MissFortune"], bonus: 2, tag: "Disengage + Bullet Time" },

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
];

// Pre-built lookup map keyed by alphabetical pair string for O(1) access.
const SYNERGY_LOOKUP: Map<string, Synergy> = (() => {
  const map = new Map<string, Synergy>();
  for (const s of CHAMPION_SYNERGIES) {
    const [a, b] = s.champs;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    map.set(key, s);
  }
  return map;
})();

export function getSynergy(aliasA: string, aliasB: string): Synergy | null {
  const key = aliasA < aliasB ? `${aliasA}|${aliasB}` : `${aliasB}|${aliasA}`;
  return SYNERGY_LOOKUP.get(key) ?? null;
}
