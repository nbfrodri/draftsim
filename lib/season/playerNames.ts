// Player handles for rosters: real pro handles where the bundled snapshot
// covers a team (lib/season/realPlayerNames.json, built by
// scripts/fetch-player-names.mjs from the public LoL Esports API), and a
// procedurally-generated handle otherwise. Handles are cosmetic identity that
// travels with the player through transfers.

import type { Lane } from "../types";
import { makePlayerId, type RNG } from "../players";
import realPlayersJson from "./realPlayerNames.json";
import realCoachesJson from "./realCoachNames.json";

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

// Flat map: normalized team name → its per-lane real handles.
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

// Real head-coach name per team (same bundled-snapshot approach as players).
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
// Single-token coined handles assembled from syllables — the texture of real
// esports handles (Faker, Caps, Chovy, Bin) without copying any. Thousands of
// combinations, so season-wide uniqueness is easy.

const ONSETS = [
  "Vex", "Kyro", "Zeph", "Nyx", "Riven", "Volt", "Drax", "Sol", "Kael", "Fenn",
  "Ryze", "Jinx", "Kr5", "Zed", "Aero", "Bly", "Cinder", "Dusk", "Echo", "Frost",
  "Glyph", "Hex", "Iro", "Jett", "Korr", "Lux", "Myst", "Nova", "Orin", "Pyre",
  "Quill", "Raze", "Surge", "Talon", "Umbra", "Vyse", "Wraith", "Xan", "Yor", "Zix",
];
const CODAS = [
  "", "", "", "ix", "or", "en", "ar", "yn", "us", "el", "ax", "io", "ee", "oh",
  "za", "ku", "mi", "ro", "sy", "th",
];

/** A unique generated handle; mutates `taken` to track used handles. */
export function generateHandle(rng: RNG, taken: Set<string>): string {
  for (let attempt = 0; attempt < 60; attempt++) {
    const onset = ONSETS[Math.floor(rng() * ONSETS.length)];
    const coda = CODAS[Math.floor(rng() * CODAS.length)];
    const handle = onset + coda;
    if (!taken.has(handle)) {
      taken.add(handle);
      return handle;
    }
  }
  // Exhausted (vanishingly unlikely) — number it.
  let n = taken.size;
  let handle: string;
  do {
    handle = `${ONSETS[0]}${n++}`;
  } while (taken.has(handle));
  taken.add(handle);
  return handle;
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
): T[] {
  const real = realPlayersForTeam(teamName);
  return players.map((p) => {
    const id = p.id ?? makePlayerId(rng); // stable identity for career stats
    const realHandle = real[p.lane];
    if (realHandle) {
      taken.add(realHandle);
      return { ...p, id, name: realHandle };
    }
    return { ...p, id, name: generateHandle(rng, taken) };
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
