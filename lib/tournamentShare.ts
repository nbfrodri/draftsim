import { record,validTournament,validateImportTree } from "./importValidation";
import { normalizeRoster,rosterFromStar } from "./players";
import { assertShareInputSize,base64UrlDecode,base64UrlEncode,deflateString,inflateString } from "./shareCodec";
import type { TournamentState } from "./tournament";
const TOURNAMENT_CODE_PREFIX = "TOUR1:";

export async function encodeTournament(
  tournament: TournamentState,
): Promise<string> {
  const json = JSON.stringify(tournament);
  const compressed = await deflateString(json);
  return TOURNAMENT_CODE_PREFIX + base64UrlEncode(compressed);
}

export interface ParseTournamentResult {
  tournament: TournamentState | null;
  error: string | null;
}

export async function decodeTournament(
  input: string,
): Promise<ParseTournamentResult> {
  try { assertShareInputSize(input); } catch (error) {
    return { tournament: null, error: (error as Error).message };
  }
  const trimmed = input.trim();
  let json: string;
  if (trimmed.startsWith(TOURNAMENT_CODE_PREFIX)) {
    try {
      const b64 = trimmed.slice(TOURNAMENT_CODE_PREFIX.length);
      const bytes = base64UrlDecode(b64);
      json = await inflateString(bytes);
    } catch (e) {
      return {
        tournament: null,
        error: `Invalid tournament code: ${e instanceof Error ? e.message : "decode failed"}`,
      };
    }
  } else {
    json = trimmed;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    return {
      tournament: null,
      error: `Invalid JSON: ${e instanceof Error ? e.message : "parse error"}`,
    };
  }
  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { tournament: null, error: "Expected object at root" };
  }
  try { validateImportTree(parsed); } catch (error) {
    return { tournament: null, error: (error as Error).message };
  }
  if (!record(parsed) || !Array.isArray(parsed.teams) || !parsed.teams.every(record)) {
    return { tournament: null, error: "Tournament teams invalid" };
  }
  const normalized = {
    ...parsed,
    teams: parsed.teams.map(team => ({
      ...team,
      players: Array.isArray(team.players) && team.players.length
        ? normalizeRoster(team.players)
        : rosterFromStar(typeof team.starRating === "number" ? team.starRating : 3),
    })),
  };
  if (!validTournament(normalized)) return { tournament: null, error: "Tournament shape invalid" };
  const withRosters = normalized;
  return { tournament: withRosters, error: null };
}

