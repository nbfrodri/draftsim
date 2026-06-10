// lib/streaks.ts — pure helpers for team and player streak computation.
//
// ── Bye policy ────────────────────────────────────────────────────────────────
// A bye (isBye === true) is NEUTRAL: it does not extend a win streak and does
// NOT break one either. Concretely, byes are simply skipped when walking the
// match history backwards to count consecutive wins/losses. This is the
// standard Swiss convention: a bye is an administrative artefact, not a
// real performance signal.
//
// ── Game-win streak ──────────────────────────────────────────────────────────
// The gameStreak field counts consecutive individual GAME wins for a team
// within the most recent non-bye completed match. It is derived from the
// match's winner.blueWins / winner.redWins fields: if a team wins the last
// match 2-1, its gameStreak is 2 (they won the last two games of that set).
// Cross-match game streaks are intentionally not computed — the per-match
// streak is the meaningful momentum signal inside a live series.

import { compareMatchChronology, type TournamentState } from "./tournament";
import type { Lane } from "./types";
import { LANE_ORDER } from "./players";
import { playerFormKey } from "./playerForm";
import type { PlayerFormMap } from "./playerForm";

// ── Types ────────────────────────────────────────────────────────────────────

export interface TeamStreak {
  /** 'W' = win streak, 'L' = loss streak. */
  kind: "W" | "L";
  /** Number of consecutive series wins or losses (≥1). */
  count: number;
  /**
   * Game-win streak within the most recent completed non-bye match.
   * E.g. a 2-1 win gives gameStreak 2; a 2-0 gives 2; a 1-2 loss gives 1
   * (winner's last game). 0 when no completed non-bye match exists for
   * this team.
   */
  gameStreak: number;
}

/** Keyed by team id. Only includes teams that have ≥1 completed non-bye match. */
export type TeamStreakMap = Record<string, TeamStreak>;

export interface HotPlayer {
  teamId: string;
  teamName: string;
  lane: Lane;
  /** Resolved from tournament rosters, or fallback label. */
  playerName: string;
  /** Raw form value in [-1, +1]. */
  form: number;
  /** 'hot' when form >= threshold, 'cold' when form <= -threshold. */
  kind: "hot" | "cold";
  /** Human-readable label. */
  label: string;
}

export interface HotPlayersResult {
  hot: HotPlayer[];
  cold: HotPlayer[];
}

// ── computeTeamStreaks ────────────────────────────────────────────────────────

/**
 * Compute per-team current MATCH win/loss streak and in-match game-win streak
 * from the tournament's completed matches. Byes are skipped (neither extend
 * nor break a streak).
 *
 * Sorting: per-team chronological order via compareMatchChronology
 * (bracket phase → round → match.id), so playoff results keep extending
 * the streak after the regular stage even though bracket rounds restart
 * at 1. The streak is counted walking backwards from the most recent
 * completed non-bye match.
 *
 * Season carry-over: when the tournament has streakSeeds (season mode),
 * an unbroken in-tournament streak extends with the carried count when
 * the signs agree, and teams that haven't played yet show their carried
 * streak (with gameStreak 0).
 */
export function computeTeamStreaks(tournament: TournamentState): TeamStreakMap {
  const result: TeamStreakMap = {};

  for (const team of tournament.teams) {
    const teamId = team.id;
    const seed = tournament.streakSeeds?.[teamId] ?? 0;

    // All completed, non-bye matches this team participated in.
    const played = tournament.matches
      .filter(
        (m) =>
          !m.isBye &&
          m.winner != null &&
          (m.blueTeamId === teamId || m.redTeamId === teamId),
      )
      .sort(compareMatchChronology);

    if (played.length === 0) {
      // No matches yet — surface the streak carried in from the previous
      // tournament of the season, if any.
      if (seed !== 0) {
        result[teamId] = {
          kind: seed > 0 ? "W" : "L",
          count: Math.abs(seed),
          gameStreak: 0,
        };
      }
      continue;
    }

    // Walk backwards to find the streak kind and count.
    const lastMatch = played[played.length - 1];
    const lastWon = lastMatch.winner!.teamId === teamId;
    const streakKind: "W" | "L" = lastWon ? "W" : "L";

    let count = 0;
    let unbroken = true;
    for (let i = played.length - 1; i >= 0; i--) {
      const m = played[i];
      const won = m.winner!.teamId === teamId;
      if ((streakKind === "W") === won) {
        count++;
      } else {
        unbroken = false;
        break;
      }
    }

    // Extend with the season carry-in when nothing in this tournament
    // broke the streak and the carried streak points the same way.
    if (unbroken && (lastWon ? seed > 0 : seed < 0)) {
      count += Math.abs(seed);
    }

    // Game-win streak within the most recent match.
    // For a win: winner.blueWins (if blue) or winner.redWins (if red) is the
    // number of games won by the winner — that IS their game-win streak within
    // the set.
    // For a loss: the loser's game-win streak is the games they won in that
    // match (i.e. the loser's game count), which is at most maxGames-requiredWins.
    const w = lastMatch.winner!;
    let gameStreak = 0;
    if (lastWon) {
      gameStreak =
        lastMatch.blueTeamId === teamId ? w.blueWins : w.redWins;
    } else {
      gameStreak =
        lastMatch.blueTeamId === teamId ? w.blueWins : w.redWins;
    }

    result[teamId] = { kind: streakKind, count, gameStreak };
  }

  return result;
}

// ── hotPlayers ────────────────────────────────────────────────────────────────

/**
 * From the store's PlayerFormMap (keys `${teamId}:${lane}`), resolve player
 * names/teams from tournament rosters and return players sorted by |form| desc,
 * split into hot (form >= threshold) and cold (form <= -threshold).
 *
 * Players on teams not found in the tournament, or on teams with no roster, get
 * a fallback playerName of `${lane} player`.
 */
export function hotPlayers(
  playerForms: PlayerFormMap,
  tournament: TournamentState,
  threshold = 0.35,
): HotPlayersResult {
  const teamById = new Map(tournament.teams.map((t) => [t.id, t]));

  const hot: HotPlayer[] = [];
  const cold: HotPlayer[] = [];

  for (const lane of LANE_ORDER) {
    for (const team of tournament.teams) {
      const key = playerFormKey(team.id, lane);
      const form = playerForms[key];
      if (typeof form !== "number" || !Number.isFinite(form)) continue;

      const abs = Math.abs(form);
      if (abs < threshold) continue;

      const teamObj = teamById.get(team.id);
      const roster = teamObj?.players;
      // Find the player for this lane in the roster.
      let playerName = `${lane} player`;
      if (roster) {
        const player = roster.find((p) => p.lane === lane);
        if (player) {
          // Players don't have name fields in the type — use tier as label.
          playerName = `${team.name} ${lane} (${player.tier})`;
        }
      }

      const entry: HotPlayer = {
        teamId: team.id,
        teamName: team.name,
        lane,
        playerName,
        form,
        kind: form >= threshold ? "hot" : "cold",
        label: form >= threshold ? "On fire" : "Slumping",
      };

      if (form >= threshold) {
        hot.push(entry);
      } else {
        cold.push(entry);
      }
    }
  }

  // Sort each group by absolute form descending.
  hot.sort((a, b) => Math.abs(b.form) - Math.abs(a.form));
  cold.sort((a, b) => Math.abs(b.form) - Math.abs(a.form));

  return { hot, cold };
}
