"use client";

import { getTeam } from "@/lib/tournament";
import type { TournamentState } from "@/lib/tournament";

// ─── Notable games (fastest / longest / biggest comeback) ─────────────
// Walks every recapped game in the tournament once and picks the three
// extremes. Each entry tracks the originating match + game index so the
// post-tournament recap can deep-link the user straight to that game in
// the replay modal.

export interface NotableGameEntry {
  matchId: string;
  gameIdx: number;
  durationMinutes: number;
  blueTeamLabel: string;
  redTeamLabel: string;
  winnerLabel: string;
  // Lowest win-prob (from the eventual winner's perspective) reached
  // during the game. Only populated for the comeback entry; lower means
  // a deeper hole. 0 = looked dead, 1 = never looked behind.
  lowestWinnerProb?: number;
}

export interface NotableGames {
  any: boolean;
  fastest: NotableGameEntry | null;
  longest: NotableGameEntry | null;
  comeback: NotableGameEntry | null;
}

export function computeNotableGames(tournament: TournamentState): NotableGames {
  let fastest: NotableGameEntry | null = null;
  let longest: NotableGameEntry | null = null;
  let comeback: NotableGameEntry | null = null;
  let bestComebackDepth = 0; // 1 - lowestWinnerProb; bigger = deeper hole climbed out of

  for (const m of tournament.matches) {
    const series = m.series;
    if (!series) continue;
    const blueTeam = getTeam(tournament, m.blueTeamId);
    const redTeam = getTeam(tournament, m.redTeamId);
    series.games.forEach((g, gameIdx) => {
      const recap = g.recap;
      if (!recap || g.winner == null) return;
      // Side-aware team labels — track the per-GAME blue/red names since
      // sides can swap inside a series under the loser-picks-blue rule.
      const blueLabel = g.blueTeam || blueTeam?.name || "Blue";
      const redLabel = g.redTeam || redTeam?.name || "Red";
      const winnerLabel = g.winner === "blue" ? blueLabel : redLabel;
      const base: NotableGameEntry = {
        matchId: m.id,
        gameIdx,
        durationMinutes: recap.durationMinutes,
        blueTeamLabel: blueLabel,
        redTeamLabel: redLabel,
        winnerLabel,
      };

      if (fastest == null || recap.durationMinutes < fastest.durationMinutes) {
        fastest = base;
      }
      if (longest == null || recap.durationMinutes > longest.durationMinutes) {
        longest = base;
      }

      // Comeback magnitude: 1 - the lowest win-prob the eventual winner
      // ever reached. Requires a winProbTimeline (legacy recaps may not
      // have one — those games are silently skipped for this category).
      const tl = recap.winProbTimeline;
      if (tl && tl.length > 1) {
        let lowestWinnerProb = 1;
        for (const point of tl) {
          const winnerProb =
            g.winner === "blue" ? point.blueProb : 1 - point.blueProb;
          if (winnerProb < lowestWinnerProb) lowestWinnerProb = winnerProb;
        }
        const depth = 1 - lowestWinnerProb;
        if (depth > bestComebackDepth) {
          bestComebackDepth = depth;
          comeback = { ...base, lowestWinnerProb };
        }
      }
    });
  }

  return {
    any: fastest != null || longest != null || comeback != null,
    fastest,
    longest,
    comeback,
  };
}

export function NotableGamesPanel({
  notable,
  tournament,
  onViewGame,
}: {
  notable: NotableGames;
  tournament: TournamentState;
  onViewGame: (matchId: string, gameIdx: number) => void;
}) {
  return (
    <div className="border border-rift-line/50 bg-rift-panel/60 p-3 md:p-4">
      <div className="text-[10px] uppercase tracking-[0.4em] text-rift-gold/70 mb-2">
        Notable Games
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 md:gap-3">
        <NotableGameCard
          label="Fastest"
          tagline={
            notable.fastest
              ? `${Math.round(notable.fastest.durationMinutes)} min`
              : "—"
          }
          entry={notable.fastest}
          tournament={tournament}
          onViewGame={onViewGame}
        />
        <NotableGameCard
          label="Longest"
          tagline={
            notable.longest
              ? `${Math.round(notable.longest.durationMinutes)} min`
              : "—"
          }
          entry={notable.longest}
          tournament={tournament}
          onViewGame={onViewGame}
        />
        <NotableGameCard
          label="Biggest Comeback"
          tagline={
            notable.comeback?.lowestWinnerProb != null
              ? `Down to ${Math.round(notable.comeback.lowestWinnerProb * 100)}% win`
              : "No clear comeback"
          }
          entry={notable.comeback}
          tournament={tournament}
          onViewGame={onViewGame}
        />
      </div>
    </div>
  );
}

function NotableGameCard({
  label,
  tagline,
  entry,
  tournament,
  onViewGame,
}: {
  label: string;
  tagline: string;
  entry: NotableGameEntry | null;
  tournament: TournamentState;
  onViewGame: (matchId: string, gameIdx: number) => void;
}) {
  const disabled = entry == null;
  const match = entry
    ? tournament.matches.find((m) => m.id === entry.matchId)
    : null;
  const hasReplay = !!match?.series;
  return (
    <button
      type="button"
      disabled={disabled || !hasReplay}
      onClick={() => entry && onViewGame(entry.matchId, entry.gameIdx)}
      className={`text-left p-3 border transition-all ${
        disabled || !hasReplay
          ? "border-rift-line/40 bg-rift-bg/30 cursor-not-allowed text-rift-muted/50"
          : "border-rift-gold/40 bg-rift-gold/5 hover:bg-rift-gold/15 hover:border-rift-gold text-rift-mutedbright"
      }`}
      title={
        disabled
          ? "No game data"
          : !hasReplay
          ? "No replay data for this match"
          : `Replay Game ${entry.gameIdx + 1}`
      }
    >
      <div className="text-[9px] uppercase tracking-[0.35em] text-rift-gold/70 mb-1">
        {label}
      </div>
      <div className="font-display text-[13px] md:text-sm tracking-wider text-rift-goldbright">
        {tagline}
      </div>
      {entry && (
        <div className="mt-1 text-[10px] uppercase tracking-[0.25em] text-rift-mutedbright/80">
          {entry.blueTeamLabel} vs {entry.redTeamLabel}
        </div>
      )}
      {entry && (
        <div className="text-[9px] tracking-[0.25em] text-rift-mutedbright/60 mt-0.5">
          Game {entry.gameIdx + 1} · Won by{" "}
          <span className="text-rift-goldbright">{entry.winnerLabel}</span>
        </div>
      )}
    </button>
  );
}
