// Region-flavored team identity + roster generation for season mode.
// Names are fictional (place/brand + mascot per region), colors and
// icons are drawn without replacement across the whole season so all 60
// teams look distinct, and roster strength follows a per-league star
// distribution (major regions field stronger rosters on average) so
// internationals feel realistic.

import type { Champion, Lane, PlayerTier } from "../types";
import { makeTeamId, TEAM_COLORS, TEAM_ICON_KEYS } from "../tournament";
import { randomizeRoster, deriveStar, PLAYER_TIER_VALUE, LANE_ORDER, type RNG } from "../players";
import { assignSynergies } from "../chemistry";
import { nameRoster } from "./playerNames";
import { makeCoach } from "./coach";
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
  const takenHandles = new Set<string>(); // player handles, unique season-wide
  const colors = shuffled(TEAM_COLORS, rng);
  const icons = shuffled(TEAM_ICON_KEYS, rng);
  let cosmeticIdx = 0;

  const teams: SeasonTeam[] = [];
  for (const league of LEAGUE_IDS) {
    const stars = shuffled(STAR_DISTRIBUTIONS[league], rng);
    for (let i = 0; i < TEAMS_PER_LEAGUE; i++) {
      const name = pickName(league, takenNames, rng);
      teams.push({
        id: makeTeamId(),
        leagueId: league,
        name,
        color: colors[cosmeticIdx % colors.length],
        iconKey: icons[cosmeticIdx % icons.length],
        // Generated handles now (teams are fictional-named); the "Real Names"
        // button overlays real handles where the snapshot has them. Each player
        // is native to this league (homeRegion) and fully acclimated.
        players: assignSynergies(
          nameRoster(
            randomizeRoster({ champions, star: stars[i], rng }),
            name,
            rng,
            takenHandles,
          ).map((p) => ({ ...p, homeRegion: league, acclimation: 1 })),
          name,
        ),
        personalityId: randomPersonalityId(rng),
        coach: makeCoach(stars[i], rng, takenHandles),
      });
      cosmeticIdx++;
    }
  }
  return assignRoleElites(teams);
}

// ─── Elite "S+" tier ─────────────────────────────────────────────────────────
// S+ is the clear elite: the best SPLUS_PER_ROLE players AT EACH ROLE across the
// whole world — a recognizable "top 5 per role", visible from the start and
// spread across regions/positions. It's a RELATIVE marker, recomputed at world
// generation AND every offseason (so it tracks who's actually elite as players
// develop and transfer): per role, the S-caliber field is ranked by team
// strength (a stable name hash tiebreak), the top N get S+, the rest drop to S.
// Incumbents get a half-star edge so the set doesn't yo-yo year to year.
export const SPLUS_PER_ROLE = 5;
const SPLUS_INCUMBENT_EDGE = 500; // ~half a star of hysteresis (star scaled ×1000)

function hashStr(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Recompute the S+ elite (top SPLUS_PER_ROLE per role). Pure — returns evolved
 *  teams. At generation no one is S+ yet so it acts as initial promotion; run
 *  again each offseason to demote the slipped and promote risers. */
export function assignRoleElites(teams: readonly SeasonTeam[]): SeasonTeam[] {
  const out = teams.map((t) => ({ ...t, players: [...t.players] }));
  for (const lane of LANE_ORDER) {
    const field: Array<{ ti: number; pi: number; score: number }> = [];
    out.forEach((team, ti) => {
      const pi = team.players.findIndex((p) => p.lane === lane);
      if (pi < 0) return;
      const p = team.players[pi];
      const isPlus = p.tier === "S+";
      // Eligible = the S-caliber field (S or S+); lower tiers can't be elite.
      if (!isPlus && PLAYER_TIER_VALUE[p.tier] < PLAYER_TIER_VALUE.S) return;
      // Team strength is the skill proxy; name hash (rng-seeded, stable) breaks
      // ties deterministically; incumbents carry a half-star edge.
      const score =
        deriveStar(team.players) * 1000 +
        (isPlus ? SPLUS_INCUMBENT_EDGE : 0) +
        (hashStr(p.name ?? `${ti}-${lane}`) % 1000);
      field.push({ ti, pi, score });
    });
    field.sort((a, b) => b.score - a.score);
    field.forEach((f, rank) => {
      const want: PlayerTier = rank < SPLUS_PER_ROLE ? "S+" : "S";
      if (out[f.ti].players[f.pi].tier !== want) {
        out[f.ti].players[f.pi] = { ...out[f.ti].players[f.pi], tier: want };
      }
    });
  }
  return out;
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
