import { isDesktop } from "@/lib/desktopStorage";
import { compactEncodeSeasonForPersist,compactEncodeTournamentForPersist,slimTournamentForArchive } from "@/lib/recapCompression";
import type { TournamentState } from "@/lib/tournament";
import type { SavedReality } from "./types";
const encodedRealityCache = new WeakMap<SavedReality, SavedReality>();
let lastRealitiesInput: SavedReality[] | null = null;
let lastRealitiesResult: SavedReality[] | null = null;

export function compactEncodeRealitiesForPersist(
  realities: SavedReality[],
): SavedReality[] {
  if (realities === lastRealitiesInput && lastRealitiesResult !== null) {
    return lastRealitiesResult;
  }
  const result = realities.map((r) => {
    const cached = encodedRealityCache.get(r);
    if (cached) return cached;
    const encoded = { ...r, season: compactEncodeSeasonForPersist(r.season) };
    encodedRealityCache.set(r, encoded);
    return encoded;
  });
  lastRealitiesInput = realities;
  lastRealitiesResult = result;
  return result;
}

// Snapshot a completed tournament into the history list. No-op if the
// tournament isn't complete or already exists in history.
//
// Desktop mode: cap raised to 200; full recaps are kept with compact
// encoding (recapC) so replay charts survive in history. The file-based
// storage has no 5 MB quota so we don't need to slim down.
//
// Web mode: cap is 5 and recaps are slimmed to stay under localStorage
// quota (same behaviour as before).
export function archiveCompletedTournament(
  tournament: TournamentState,
  history: TournamentState[],
): TournamentState[] {
  if (tournament.status !== "complete") return history;
  // Season stages don't archive individually — the season engine owns
  // their lifecycle and they'd flood history (a season has 20+ stages).
  if (tournament.seasonId) return history;
  if (history.some((t) => t.id === tournament.id)) return history;
  if (isDesktop()) {
    // Keep full recaps with compact encoding on desktop — files have no
    // meaningful quota, and compact encoding keeps sizes reasonable.
    const compact = compactEncodeTournamentForPersist(tournament);
    const next = [compact, ...history];
    return next.slice(0, 200);
  }
  const next = [slimTournamentForArchive(tournament), ...history];
  return next.slice(0, 5);
}

