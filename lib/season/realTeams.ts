// Real pro team names for season mode, fetched client-side from the
// public LoL Esports API (the same one lolesports.com uses; it sends
// Access-Control-Allow-Origin: * so it works from the browser and the
// Tauri WebView without a backend). For each league we walk its
// tournaments newest-first and collect team names from the standings
// until we have a full league's worth — the newest split of a league
// can be unplayed (empty standings) or smaller than 10 teams.

import { LEAGUE_IDS, TEAMS_PER_LEAGUE, type LeagueId } from "./types";
import bundledNamesJson from "./realTeamNames.json";

/** Bundled offline snapshot — 10 real pro teams per region. Applied
 *  instantly by the "Real Names" button and used as the fallback when
 *  the live API is unreachable. */
export const BUNDLED_TEAM_NAMES: Record<LeagueId, string[]> =
  bundledNamesJson as Record<LeagueId, string[]>;

const API_BASE = "https://esports-api.lolesports.com/persisted/gw";
// Public web client key embedded in lolesports.com — not a secret.
const API_KEY = "0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z";

// API league slug per sim league.
const LEAGUE_SLUGS: Record<LeagueId, string> = {
  LCK: "lck",
  LPL: "lpl",
  LEC: "lec",
  LCS: "lcs",
  CBLOL: "cblol-brazil",
  LCP: "lcp",
};

// How many tournaments back we are willing to walk per league.
const MAX_TOURNAMENTS_PER_LEAGUE = 6;

// ─── Minimal API response shapes ───────────────────────────────────────────

interface ApiLeague {
  id: string;
  slug: string;
}

interface ApiTournament {
  id: string;
  slug: string;
}

interface ApiStandingTeam {
  name?: string;
}

interface ApiStanding {
  stages?: {
    sections?: {
      rankings?: { teams?: ApiStandingTeam[] }[];
      matches?: { teams?: ApiStandingTeam[] }[];
    }[];
  }[];
}

async function getJson<T>(
  path: string,
  signal: AbortSignal | undefined,
): Promise<T> {
  const res = await fetch(`${API_BASE}/${path}`, {
    headers: { "x-api-key": API_KEY },
    signal,
  });
  if (!res.ok) throw new Error(`LoL Esports API ${res.status} on ${path}`);
  return (await res.json()) as T;
}

/** Pull team names out of a standings payload, in standings order,
 *  skipping placeholders. Exported for tests. */
export function extractStandingsNames(
  standing: ApiStanding | undefined,
): string[] {
  const names: string[] = [];
  for (const stage of standing?.stages ?? []) {
    for (const section of stage.sections ?? []) {
      for (const ranking of section.rankings ?? []) {
        for (const team of ranking.teams ?? []) {
          if (team.name && team.name !== "TBD") names.push(team.name);
        }
      }
      for (const match of section.matches ?? []) {
        for (const team of match.teams ?? []) {
          if (team.name && team.name !== "TBD") names.push(team.name);
        }
      }
    }
  }
  return names;
}

async function fetchLeagueNames(
  leagueApiId: string,
  signal: AbortSignal | undefined,
): Promise<string[]> {
  const data = await getJson<{
    data: { leagues: { tournaments: ApiTournament[] }[] };
  }>(`getTournamentsForLeague?hl=en-US&leagueId=${leagueApiId}`, signal);
  // Tournaments come newest-first.
  const tournaments = data.data.leagues[0]?.tournaments ?? [];

  const names: string[] = [];
  for (const t of tournaments.slice(0, MAX_TOURNAMENTS_PER_LEAGUE)) {
    if (names.length >= TEAMS_PER_LEAGUE) break;
    const standings = await getJson<{ data: { standings: ApiStanding[] } }>(
      `getStandings?hl=en-US&tournamentId=${t.id}`,
      signal,
    );
    for (const name of extractStandingsNames(standings.data.standings[0])) {
      if (!names.includes(name)) names.push(name);
    }
  }
  return names;
}

/** Dedupe names across leagues (an org can field teams in two regions),
 *  keeping league order and capping each league at TEAMS_PER_LEAGUE.
 *  Exported for tests. */
export function dedupeAcrossLeagues(
  raw: Record<LeagueId, string[]>,
): Record<LeagueId, string[]> {
  const seen = new Set<string>();
  const out = {} as Record<LeagueId, string[]>;
  for (const league of LEAGUE_IDS) {
    const kept: string[] = [];
    for (const name of raw[league] ?? []) {
      if (kept.length >= TEAMS_PER_LEAGUE) break;
      if (seen.has(name)) continue;
      seen.add(name);
      kept.push(name);
    }
    out[league] = kept;
  }
  return out;
}

/** Fetch real team names for every sim league. Leagues resolve in
 *  parallel; each list is at most TEAMS_PER_LEAGUE long and may be
 *  shorter if the API has fewer current teams — callers should keep
 *  generated names for the remainder. */
export async function fetchRealTeamNames(
  signal?: AbortSignal,
): Promise<Record<LeagueId, string[]>> {
  const leaguesRes = await getJson<{ data: { leagues: ApiLeague[] } }>(
    "getLeagues?hl=en-US",
    signal,
  );
  const bySlug = new Map(leaguesRes.data.leagues.map((l) => [l.slug, l]));

  const lists = await Promise.all(
    LEAGUE_IDS.map(async (league) => {
      const apiLeague = bySlug.get(LEAGUE_SLUGS[league]);
      if (!apiLeague) return [league, []] as const;
      return [league, await fetchLeagueNames(apiLeague.id, signal)] as const;
    }),
  );

  return dedupeAcrossLeagues(
    Object.fromEntries(lists) as Record<LeagueId, string[]>,
  );
}
