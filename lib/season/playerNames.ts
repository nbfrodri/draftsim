// Player handles for rosters: real pro handles where the bundled snapshot
// covers a team (lib/season/realPlayerNames.json, built by
// scripts/fetch-player-names.mjs from the public LoL Esports API), and a
// procedurally-generated handle otherwise. Handles are cosmetic identity that
// travels with the player through transfers.

import type { Lane } from "../types";
import { makePlayerId, type RNG } from "../players";
import realPlayersJson from "./realPlayerNames.json";
import realCoachesJson from "./realCoachNames.json";

/** Reject trailing digits and Roman-numeral suffixes (generated-name rules). */
export function isValidHandle(name: string): boolean {
  const t = name.trim();
  if (!t) return false;
  if (/\d$/.test(t)) return false;
  if (/\s+(?:X|IX|VIII|VII|VI|V|IV|III|II|I)$/i.test(t)) return false;
  return true;
}

// ─── Real handles ────────────────────────────────────────────────────────────

type RealRoster = Partial<Record<Lane, string | null>>;
const RAW = realPlayersJson as Record<string, Record<string, RealRoster>>;

function normalizeTeamName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const REAL_BY_TEAM: Map<string, RealRoster> = (() => {
  const map = new Map<string, RealRoster>();
  for (const byTeam of Object.values(RAW)) {
    for (const [name, roster] of Object.entries(byTeam)) {
      map.set(normalizeTeamName(name), roster);
    }
  }
  return map;
})();

/** Real per-lane handles for a team name (accent/case/punctuation
 *  insensitive), or an empty object when the snapshot doesn't cover it. */
export function realPlayersForTeam(teamName: string | undefined): RealRoster {
  if (!teamName) return {};
  return REAL_BY_TEAM.get(normalizeTeamName(teamName)) ?? {};
}

const COACH_BY_TEAM: Map<string, string> = (() => {
  const map = new Map<string, string>();
  const raw = realCoachesJson as Record<string, Record<string, string | null>>;
  for (const byTeam of Object.values(raw)) {
    for (const [name, coach] of Object.entries(byTeam)) {
      if (coach) map.set(normalizeTeamName(name), coach);
    }
  }
  return map;
})();

/** Real head-coach handle for a team, or undefined when not covered. */
export function realCoachForTeam(teamName: string | undefined): string | undefined {
  if (!teamName) return undefined;
  return COACH_BY_TEAM.get(normalizeTeamName(teamName));
}

// ─── Generated handles ───────────────────────────────────────────────────────
// Pro-style coined handles with optional regional flavor. Never ends with a
// digit and never carries a Roman-numeral suffix (Ralz8 / Skaz IV banned).

const ONSETS_GLOBAL = [
  "Vex", "Kyro", "Zeph", "Nyx", "Riven", "Volt", "Drax", "Sol", "Kael", "Fenn",
  "Ryze", "Jinx", "Zed", "Aero", "Bly", "Cinder", "Dusk", "Echo", "Frost",
  "Glyph", "Hex", "Iro", "Jett", "Korr", "Lux", "Myst", "Nova", "Orin", "Pyre",
  "Quill", "Raze", "Surge", "Talon", "Umbra", "Vyse", "Wraith", "Xan", "Yor", "Zix",
];
const CODAS_GLOBAL = [
  "", "", "", "ix", "or", "en", "ar", "yn", "us", "el", "ax", "io", "ee", "oh",
  "za", "ku", "mi", "ro", "sy", "th",
];

// Regional syllable sets — mild flavor, still read as pro handles.
const REGIONAL: Record<string, { onsets: string[]; codas: string[] }> = {
  LCK: {
    onsets: ["Jin", "Hyeon", "Min", "Seo", "Yun", "Kye", "Hwan", "Dor", "Pea", "Ker", "Show", "Gum", "Kan", "Vic"],
    codas: ["", "woo", "ho", "jae", "jun", "ha", "ri", "on", "in", "eo"],
  },
  LPL: {
    onsets: ["Xing", "Wei", "Tian", "Bin", "Ning", "Rook", "Xia", "Jack", "Cry", "Sof", "Gala"],
    codas: ["", "ming", "yu", "hao", "jie", "feng", "xin", "qi", "lan"],
  },
  LEC: {
    onsets: ["Caps", "Rekk", "Wunder", "Jank", "Miky", "Carz", "Human", "Larss", "Upset", "Raz", "Comp", "Yike"],
    codas: ["", "les", "er", "en", "ix", "or", "yn", "us", "el"],
  },
  LCS: {
    onsets: ["Blab", "Core", "Impact", "Bjerg", "Double", "Sneaky", "Contract", "Inspired", "Yeon", "Quad", "River"],
    codas: ["", "er", "ie", "ix", "or", "en", "us", "el", "y"],
  },
  CBLOL: {
    onsets: ["Robo", "Cariok", "Route", "Ceos", "Guigo", "Netuno", "Titan", "Dynqueo"],
    codas: ["", "ao", "inho", "ito", "ix", "or", "en"],
  },
  LCP: {
    onsets: ["Rest", "Betty", "Shunn", "Junjia", "Azhi", "Karsa", "Maple", "Doggo", "Hong", "FoFo"],
    codas: ["", "ao", "en", "ix", "or", "yu", "in"],
  },
};

function syllableSets(region?: string): { onsets: string[]; codas: string[] } {
  const regional = region ? REGIONAL[region] : undefined;
  if (!regional) return { onsets: ONSETS_GLOBAL, codas: CODAS_GLOBAL };
  // Mix regional + global so we don't exhaust short regional pools.
  return {
    onsets: [...regional.onsets, ...ONSETS_GLOBAL],
    codas: [...regional.codas, ...CODAS_GLOBAL],
  };
}

/** A unique generated handle; mutates `taken`. Optional `region` (league id)
 *  adds regional syllable flavor. Never trailing digit / Roman suffix. */
export function generateHandle(rng: RNG, taken: Set<string>, region?: string): string {
  const { onsets, codas } = syllableSets(region);
  for (let attempt = 0; attempt < 80; attempt++) {
    const onset = onsets[Math.floor(rng() * onsets.length)]!;
    const coda = codas[Math.floor(rng() * codas.length)]!;
    const handle = onset + coda;
    if (!taken.has(handle) && isValidHandle(handle)) {
      taken.add(handle);
      return handle;
    }
  }
  // Exhausted — append a letter suffix (never a digit).
  const base = onsets[0] ?? "Vex";
  for (let i = 0; i < 26 * 26; i++) {
    const a = String.fromCharCode(97 + (i % 26));
    const b = String.fromCharCode(97 + Math.floor(i / 26) % 26);
    const handle = `${base}${a}${b}`;
    if (!taken.has(handle) && isValidHandle(handle)) {
      taken.add(handle);
      return handle;
    }
  }
  // Absolute last resort (still no trailing digit).
  const fallback = `${base}xx`;
  taken.add(fallback);
  return fallback;
}

/** Name a roster's players in place: real handle per lane where the team
 *  snapshot has one, a generated handle otherwise. Returns new player objects
 *  (does not mutate the input). `taken` keeps generated handles unique across
 *  however many rosters share it. */
export function nameRoster<T extends { lane: Lane; name?: string; id?: string }>(
  players: readonly T[],
  teamName: string | undefined,
  rng: RNG,
  taken: Set<string>,
  region?: string,
): T[] {
  const real = realPlayersForTeam(teamName);
  return players.map((p) => {
    const id = p.id ?? makePlayerId(rng);
    const realHandle = real[p.lane];
    if (realHandle) {
      taken.add(realHandle);
      return { ...p, id, name: realHandle };
    }
    return { ...p, id, name: generateHandle(rng, taken, region) };
  });
}

/** Overlay an explicit per-lane handle map onto a roster, keeping each
 *  player's existing (generated) handle for any lane the map doesn't cover.
 *  Used for the live-fetched real rosters at season creation. */
export function overlayNames<T extends { lane: Lane; name?: string }>(
  players: readonly T[],
  byLane: Partial<Record<Lane, string | null>>,
): T[] {
  return players.map((p) => {
    const handle = byLane[p.lane];
    return handle ? { ...p, name: handle } : { ...p };
  });
}

/** Overlay the BUNDLED real handles for a team name (generated fallback) —
 *  the offline path, when no live roster was fetched. */
export function realOrKeep<T extends { lane: Lane; name?: string }>(
  players: readonly T[],
  teamName: string,
): T[] {
  return overlayNames(players, realPlayersForTeam(teamName));
}
