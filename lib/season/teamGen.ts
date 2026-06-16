// Region-flavored team identity + roster generation for season mode.
// Names are fictional (place/brand + mascot per region), colors and
// icons are drawn without replacement across the whole season so all 60
// teams look distinct, and roster strength follows a per-league star
// distribution (major regions field stronger rosters on average) so
// internationals feel realistic.

import type { Champion } from "../types";
import { makeTeamId, TEAM_COLORS, TEAM_ICON_KEYS } from "../tournament";
import { randomizeRoster, type RNG } from "../players";
import { PERSONALITY_LIST } from "../draftAI";
import {
  LEAGUE_IDS,
  TEAMS_PER_LEAGUE,
  type LeagueId,
  type SeasonTeam,
} from "./types";

// ─── Name pools ────────────────────────────────────────────────────────────

const NAME_POOLS: Record<LeagueId, { first: string[]; second: string[] }> = {
  LCK: {
    first: [
      "Seoul", "Busan", "Incheon", "Daejeon", "Gwangju", "Jeju",
      "Ulsan", "Suwon", "Hanseong", "Gangnam", "Mapo", "Haeundae",
    ],
    second: [
      "Dynasty", "Tigers", "Phoenix", "Guardians", "Sentinels",
      "Monarchs", "Spirits", "Wraiths", "Crane", "Taegeuk", "Drakes",
      "Vanguard",
    ],
  },
  LPL: {
    first: [
      "Shanghai", "Beijing", "Chengdu", "Hangzhou", "Shenzhen",
      "Wuhan", "Xi'an", "Nanjing", "Suzhou", "Chongqing", "Macau",
      "Harbin",
    ],
    second: [
      "Dragons", "Emperors", "Jade", "Lotus", "Thunder", "Warriors",
      "Qilin", "Tempest", "Pandas", "Monsoon", "Dynasty", "Comets",
    ],
  },
  LEC: {
    first: [
      "Berlin", "Madrid", "Paris", "Nordic", "Alpine", "Iberia",
      "Praha", "Warsaw", "Milano", "Rotterdam", "Helsinki", "Atlantic",
    ],
    second: [
      "Wolves", "Knights", "Ravens", "Lions", "Titans", "Valkyries",
      "Drakkar", "Legion", "Griffins", "Corsairs", "Aurora", "Bears",
    ],
  },
  LCS: {
    first: [
      "Liberty", "Pacific", "Denver", "Brooklyn", "Texas", "Vegas",
      "Chicago", "Seattle", "Miami", "Phoenix", "Motor City", "Bay Area",
    ],
    second: [
      "Eagles", "Outlaws", "Rebels", "Storm", "Apex", "Hawks",
      "Mustangs", "Renegades", "Comets", "Coyotes", "Stampede", "Frost",
    ],
  },
  CBLOL: {
    first: [
      "Rio", "São Paulo", "Bahia", "Amazonia", "Brasilia", "Recife",
      "Curitiba", "Fortaleza", "Santos", "Minas", "Porto Alegre",
      "Manaus",
    ],
    second: [
      "Jaguars", "Vipers", "Kings", "Saints", "Sharks", "Toucans",
      "Carnaval", "Capoeira", "Falcons", "Piranhas", "Sunset", "Verde",
    ],
  },
  LCP: {
    first: [
      "Taipei", "Hanoi", "Tokyo", "Sydney", "Manila", "Bangkok",
      "Singapore", "Saigon", "Osaka", "Kuala Lumpur", "Jakarta",
      "Auckland",
    ],
    second: [
      "Typhoon", "Garuda", "Sakura", "Dragons", "Raiders", "Suns",
      "Mariners", "Krakens", "Monsoon", "Tigers", "Islanders", "Comets",
    ],
  },
};

// Average roster strength per league — stars are shuffled across the 10
// teams so the top org isn't always slot #1. Major regions (LCK/LPL)
// average higher, which is what makes seed-1-of-LCK beating
// seed-4-of-a-minor-region the LIKELY outcome at internationals.
const STAR_DISTRIBUTIONS: Record<LeagueId, number[]> = {
  LCK: [5, 5, 4, 4, 4, 3, 3, 3, 2, 2],
  LPL: [5, 5, 4, 4, 4, 3, 3, 3, 2, 2],
  LEC: [5, 4, 4, 4, 3, 3, 3, 2, 2, 2],
  LCS: [5, 4, 4, 3, 3, 3, 3, 2, 2, 2],
  CBLOL: [4, 4, 4, 3, 3, 3, 2, 2, 2, 1],
  LCP: [4, 4, 4, 3, 3, 3, 2, 2, 2, 1],
};

function shuffled<T>(arr: readonly T[], rng: RNG): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function pickName(
  league: LeagueId,
  taken: Set<string>,
  rng: RNG,
): string {
  const pool = NAME_POOLS[league];
  // Try random combos; pools give 144 combos per league so collisions
  // across 10 picks are rare. Deterministic fallback scan guarantees
  // termination.
  for (let attempt = 0; attempt < 40; attempt++) {
    const name = `${pool.first[Math.floor(rng() * pool.first.length)]} ${
      pool.second[Math.floor(rng() * pool.second.length)]
    }`;
    if (!taken.has(name)) {
      taken.add(name);
      return name;
    }
  }
  for (const f of pool.first) {
    for (const s of pool.second) {
      const name = `${f} ${s}`;
      if (!taken.has(name)) {
        taken.add(name);
        return name;
      }
    }
  }
  // Pools exhausted (impossible with 144 combos / 10 teams) — number it.
  const fallback = `${pool.first[0]} ${pool.second[0]} ${taken.size}`;
  taken.add(fallback);
  return fallback;
}

function randomPersonalityId(rng: RNG): string {
  return PERSONALITY_LIST[Math.floor(rng() * PERSONALITY_LIST.length)].id;
}

// ─── Generation ────────────────────────────────────────────────────────────

/** Generate all 60 season teams (6 leagues × 10), globally-unique
 *  names/colors/icons, league-weighted roster strength. */
export function generateSeasonTeams(
  champions: readonly Champion[],
  rng: RNG = Math.random,
): SeasonTeam[] {
  const takenNames = new Set<string>();
  const colors = shuffled(TEAM_COLORS, rng);
  const icons = shuffled(TEAM_ICON_KEYS, rng);
  let cosmeticIdx = 0;

  const teams: SeasonTeam[] = [];
  for (const league of LEAGUE_IDS) {
    const stars = shuffled(STAR_DISTRIBUTIONS[league], rng);
    for (let i = 0; i < TEAMS_PER_LEAGUE; i++) {
      teams.push({
        id: makeTeamId(),
        leagueId: league,
        name: pickName(league, takenNames, rng),
        color: colors[cosmeticIdx % colors.length],
        iconKey: icons[cosmeticIdx % icons.length],
        players: randomizeRoster({ champions, star: stars[i], rng }),
        personalityId: randomPersonalityId(rng),
      });
      cosmeticIdx++;
    }
  }
  return teams;
}

/** Backfill missing cosmetic identity (icon/color/personality) on
 *  persisted teams — seasons saved by builds that predate these fields
 *  (or hand-imported data) would otherwise render an invisible color
 *  swatch and the generic shield icon. Picks unused icons/colors so
 *  backfilled teams stay distinct. Returns the SAME array when nothing
 *  is missing so callers can cheap-check with `===`. */
export function ensureTeamIdentities(
  teams: readonly SeasonTeam[],
  rng: RNG = Math.random,
): SeasonTeam[] {
  const needsFix = teams.some(
    (t) => !t.iconKey || !t.color || !t.personalityId,
  );
  if (!needsFix) return teams as SeasonTeam[];
  const takenIcons = new Set(teams.map((t) => t.iconKey).filter(Boolean));
  const takenColors = new Set(teams.map((t) => t.color).filter(Boolean));
  const freeIcons = shuffled(
    TEAM_ICON_KEYS.filter((k) => !takenIcons.has(k)),
    rng,
  );
  const freeColors = shuffled(
    TEAM_COLORS.filter((c) => !takenColors.has(c)),
    rng,
  );
  return teams.map((t) => {
    if (t.iconKey && t.color && t.personalityId) return t;
    return {
      ...t,
      iconKey:
        t.iconKey ||
        freeIcons.pop() ||
        TEAM_ICON_KEYS[Math.floor(rng() * TEAM_ICON_KEYS.length)],
      color:
        t.color ||
        freeColors.pop() ||
        TEAM_COLORS[Math.floor(rng() * TEAM_COLORS.length)],
      personalityId: t.personalityId || randomPersonalityId(rng),
    };
  });
}

/** Re-roll one team's cosmetic identity (name/color/icon/personality),
 *  keeping its roster and id. `teams` provides the uniqueness context. */
export function rerollTeamIdentity(
  team: SeasonTeam,
  teams: readonly SeasonTeam[],
  rng: RNG = Math.random,
): SeasonTeam {
  const takenNames = new Set(
    teams.filter((t) => t.id !== team.id).map((t) => t.name),
  );
  const takenIcons = new Set(
    teams.filter((t) => t.id !== team.id).map((t) => t.iconKey),
  );
  const takenColors = new Set(
    teams.filter((t) => t.id !== team.id).map((t) => t.color),
  );
  const freeIcons = TEAM_ICON_KEYS.filter((k) => !takenIcons.has(k));
  const freeColors = TEAM_COLORS.filter((c) => !takenColors.has(c));
  return {
    ...team,
    name: pickName(team.leagueId, takenNames, rng),
    // Re-rolling reverts to a generated name, so drop any real-team logo.
    logoUrl: undefined,
    iconKey:
      freeIcons.length > 0
        ? freeIcons[Math.floor(rng() * freeIcons.length)]
        : TEAM_ICON_KEYS[Math.floor(rng() * TEAM_ICON_KEYS.length)],
    color:
      freeColors.length > 0
        ? freeColors[Math.floor(rng() * freeColors.length)]
        : TEAM_COLORS[Math.floor(rng() * TEAM_COLORS.length)],
    personalityId: randomPersonalityId(rng),
  };
}
