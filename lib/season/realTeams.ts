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
import type { Lane } from "../types";
import { realPlayersForTeam } from "./playerNames";
import bundledTeamsJson from "./realTeamNames.json";

/** A real pro team: display name plus an optional logo URL. In the
 *  bundled snapshot `logoUrl` is a local bundled path (/team-logos/…),
 *  with `logoRemote` keeping the original source URL for re-downloading
 *  (see scripts/fetch-team-logos.mjs). A live API fetch instead returns a
 *  remote https `logoUrl` and no `logoRemote`. `players` (real per-lane
 *  handles) is filled by the live fetch only — the bundled snapshot has
 *  none, so bundled-named teams fall back to generated handles. */
export interface RealTeam {
  name: string;
  logoUrl?: string;
  logoRemote?: string;
  players?: Partial<Record<Lane, string>>;
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

// ─── Player rosters ──────────────────────────────────────────────────────
// One getTeams call returns every team with its current roster, so we fetch
// it once and match each named team to its five lane handles. Best-effort:
// roles can be noisy / placeholder, so junk entries are skipped and any lane
// without a real handle is left for the caller's generated fallback.

const ROLE_TO_LANE: Record<string, Lane> = {
  top: "top",
  jungle: "jungle",
  mid: "middle",
  bottom: "bottom",
  support: "support",
};
const isJunkHandle = (n: string | undefined): boolean =>
  !n || /test|\bjg\d|\bmid\d|player\d|tbd|sub\d/i.test(n);

interface ApiRosterTeam {
  name?: string;
  players?: { summonerName?: string; role?: string }[];
}

/** Map normalized team name → that team's per-lane handles, from getTeams. */
async function fetchTeamRosters(
  signal: AbortSignal | undefined,
): Promise<Map<string, Partial<Record<Lane, string>>>> {
  const data = await getJson<{ data: { teams: ApiRosterTeam[] } }>(
    "getTeams?hl=en-US",
    signal,
  );
  const map = new Map<string, Partial<Record<Lane, string>>>();
  for (const t of data.data.teams ?? []) {
    if (!t.name || !(t.players && t.players.length)) continue;
    const roster: Partial<Record<Lane, string>> = {};
    for (const p of t.players) {
      const lane = p.role ? ROLE_TO_LANE[p.role] : undefined;
      const handle = p.summonerName?.trim();
      if (!lane || roster[lane] || isJunkHandle(handle)) continue;
      roster[lane] = handle;
    }
    if (Object.keys(roster).length > 0) map.set(normalizeTeamName(t.name), roster);
  }
  return map;
}

/** Best roster for a team name: exact normalized match, else a contains
 *  match (handles "Gen.G" vs "Gen.G Esports"-style differences). */
function matchRoster(
  name: string,
  rosters: Map<string, Partial<Record<Lane, string>>>,
): Partial<Record<Lane, string>> | undefined {
  const n = normalizeTeamName(name);
  const exact = rosters.get(n);
  if (exact) return exact;
  for (const [k, r] of rosters) if (k && (k.includes(n) || n.includes(k))) return r;
  return undefined;
}

/** Fetch real teams (names + logos + rosters) for every sim league.
 *  Leagues resolve in parallel; each list is at most TEAMS_PER_LEAGUE long
 *  and may be shorter if the API has fewer current teams — callers should
 *  keep generated names/handles for the remainder. */
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

  // Rosters come from a single getTeams call. Best-effort: if it fails, teams
  // still get their names + logos and the caller fills generated handles.
  let rosters: Map<string, Partial<Record<Lane, string>>> = new Map();
  try {
    rosters = await fetchTeamRosters(signal);
  } catch {
    /* names/logos already resolved — proceed without real handles */
  }

  // Every handle the bundle assigns as a starter, across all teams. Bundled
  // starters are authoritative; the unreliable live feed (full org list, no
  // starter flag, loose name match) must never reuse one to fill ANOTHER team's
  // empty slot — that's how a starter (e.g. JimieN on The Chiefs) duplicated
  // onto a team whose bundled slot was empty (Ground Zero's middle).
  const bundledStarters = new Set<string>();
  for (const league of LEAGUE_IDS)
    for (const team of deduped[league])
      for (const h of Object.values(realPlayersForTeam(team.name))) if (h) bundledStarters.add(h);

  for (const league of LEAGUE_IDS) {
    for (const team of deduped[league]) {
      // Prefer a bundled local logo when the team name matches, so seasons
      // created from a live fetch still show logos offline; fall back to the
      // remote URL for teams not in the bundle.
      team.logoUrl = logoForTeamName(team.name) ?? team.logoUrl;
      // Prefer the accurate bundled roster (Leaguepedia starters); fill any
      // gaps from the live LoL Esports squad. The live feed alone is unreliable
      // (full org list, no starter flag), so it's only a fallback.
      const bundled = realPlayersForTeam(team.name);
      const live = matchRoster(team.name, rosters);
      const merged: Partial<Record<Lane, string>> = {};
      for (const lane of ["top", "jungle", "middle", "bottom", "support"] as Lane[]) {
        const lh = live?.[lane];
        // A live handle is only usable if it isn't a bundled starter elsewhere.
        const handle = bundled[lane] || (lh && !bundledStarters.has(lh) ? lh : undefined);
        if (handle) merged[lane] = handle;
      }
      if (Object.keys(merged).length > 0) team.players = merged;
    }
  }
  return deduped;
}
