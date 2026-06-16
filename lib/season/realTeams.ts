// Real pro teams (names + logos) for season mode, fetched client-side
// from the public LoL Esports API (the same one lolesports.com uses; it
// sends Access-Control-Allow-Origin: * so it works from the browser and
// the Tauri WebView without a backend). For each league we walk its
// tournaments newest-first and collect teams from the standings until we
// have a full league's worth — the newest split of a league can be
// unplayed (empty standings) or smaller than 10 teams. Each standings
// entry already carries the team's logo URL alongside its name, so we
// get icons for free from the same payload.

import { LEAGUE_IDS, TEAMS_PER_LEAGUE, type LeagueId } from "./types";
import bundledTeamsJson from "./realTeamNames.json";

/** A real pro team: display name plus an optional logo URL. In the
 *  bundled snapshot `logoUrl` is a local bundled path (/team-logos/…),
 *  with `logoRemote` keeping the original source URL for re-downloading
 *  (see scripts/fetch-team-logos.mjs). A live API fetch instead returns a
 *  remote https `logoUrl` and no `logoRemote`. */
export interface RealTeam {
  name: string;
  logoUrl?: string;
  logoRemote?: string;
}

/** Bundled offline snapshot — 10 real pro teams per region, with logos.
 *  Applied instantly by the "Real Names" button and used as the fallback
 *  when the live API is unreachable. */
export const BUNDLED_TEAMS: Record<LeagueId, RealTeam[]> =
  bundledTeamsJson as Record<LeagueId, RealTeam[]>;

// Normalize a team name for fuzzy matching: drop accents, case, and any
// non-alphanumerics so "kt Rolster" and "KT Rolster" collapse together.
function normalizeTeamName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const NAME_TO_LOGO: Map<string, string> = (() => {
  const map = new Map<string, string>();
  for (const teams of Object.values(BUNDLED_TEAMS)) {
    for (const team of teams) {
      if (team.logoUrl) map.set(normalizeTeamName(team.name), team.logoUrl);
    }
  }
  return map;
})();

/** Best-effort logo for a team identified only by name — used to backfill
 *  real logos onto seasons archived before logos were stored. Returns the
 *  bundled logo whose team name matches (accent/case/punctuation
 *  insensitive), or undefined when there's no match. */
export function logoForTeamName(name: string | undefined): string | undefined {
  if (!name) return undefined;
  return NAME_TO_LOGO.get(normalizeTeamName(name));
}

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
  image?: string;
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

/** Upgrade a logo URL to https so it isn't blocked as mixed content when
 *  the app is served over https. The host serves the same asset over both
 *  schemes; most of the API's logo URLs are http. */
function toHttpsLogo(url: string | undefined): string | undefined {
  if (!url) return undefined;
  return url.startsWith("http://") ? `https://${url.slice("http://".length)}` : url;
}

/** Pull teams (name + logo) out of a standings payload, in standings
 *  order, skipping placeholders. Exported for tests. */
export function extractStandingsTeams(
  standing: ApiStanding | undefined,
): RealTeam[] {
  const teams: RealTeam[] = [];
  for (const stage of standing?.stages ?? []) {
    for (const section of stage.sections ?? []) {
      for (const ranking of section.rankings ?? []) {
        for (const team of ranking.teams ?? []) {
          if (team.name && team.name !== "TBD")
            teams.push({ name: team.name, logoUrl: toHttpsLogo(team.image) });
        }
      }
      for (const match of section.matches ?? []) {
        for (const team of match.teams ?? []) {
          if (team.name && team.name !== "TBD")
            teams.push({ name: team.name, logoUrl: toHttpsLogo(team.image) });
        }
      }
    }
  }
  return teams;
}

async function fetchLeagueTeams(
  leagueApiId: string,
  signal: AbortSignal | undefined,
): Promise<RealTeam[]> {
  const data = await getJson<{
    data: { leagues: { tournaments: ApiTournament[] }[] };
  }>(`getTournamentsForLeague?hl=en-US&leagueId=${leagueApiId}`, signal);
  // Tournaments come newest-first.
  const tournaments = data.data.leagues[0]?.tournaments ?? [];

  const teams: RealTeam[] = [];
  for (const t of tournaments.slice(0, MAX_TOURNAMENTS_PER_LEAGUE)) {
    if (teams.length >= TEAMS_PER_LEAGUE) break;
    const standings = await getJson<{ data: { standings: ApiStanding[] } }>(
      `getStandings?hl=en-US&tournamentId=${t.id}`,
      signal,
    );
    for (const team of extractStandingsTeams(standings.data.standings[0])) {
      if (!teams.some((x) => x.name === team.name)) teams.push(team);
    }
  }
  return teams;
}

/** Dedupe teams across leagues by name (an org can field teams in two
 *  regions), keeping league order and capping each league at
 *  TEAMS_PER_LEAGUE. Exported for tests. */
export function dedupeAcrossLeagues(
  raw: Record<LeagueId, RealTeam[]>,
): Record<LeagueId, RealTeam[]> {
  const seen = new Set<string>();
  const out = {} as Record<LeagueId, RealTeam[]>;
  for (const league of LEAGUE_IDS) {
    const kept: RealTeam[] = [];
    for (const team of raw[league] ?? []) {
      if (kept.length >= TEAMS_PER_LEAGUE) break;
      if (seen.has(team.name)) continue;
      seen.add(team.name);
      kept.push(team);
    }
    out[league] = kept;
  }
  return out;
}

/** Fetch real teams (names + logos) for every sim league. Leagues
 *  resolve in parallel; each list is at most TEAMS_PER_LEAGUE long and
 *  may be shorter if the API has fewer current teams — callers should
 *  keep generated names for the remainder. */
export async function fetchRealTeams(
  signal?: AbortSignal,
): Promise<Record<LeagueId, RealTeam[]>> {
  const leaguesRes = await getJson<{ data: { leagues: ApiLeague[] } }>(
    "getLeagues?hl=en-US",
    signal,
  );
  const bySlug = new Map(leaguesRes.data.leagues.map((l) => [l.slug, l]));

  const lists = await Promise.all(
    LEAGUE_IDS.map(async (league) => {
      const apiLeague = bySlug.get(LEAGUE_SLUGS[league]);
      if (!apiLeague) return [league, []] as const;
      return [league, await fetchLeagueTeams(apiLeague.id, signal)] as const;
    }),
  );

  const deduped = dedupeAcrossLeagues(
    Object.fromEntries(lists) as Record<LeagueId, RealTeam[]>,
  );

  // Prefer a bundled local logo when the team name matches, so seasons
  // created from a live fetch still show logos offline; fall back to the
  // remote URL for teams not in the bundle.
  for (const league of LEAGUE_IDS) {
    for (const team of deduped[league]) {
      team.logoUrl = logoForTeamName(team.name) ?? team.logoUrl;
    }
  }
  return deduped;
}
