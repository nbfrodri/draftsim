"use client";

import TournamentTeamIdentity from "@/components/tournament/TournamentTeamIdentity";

import { getTeam } from "@/lib/tournament";
import type { TournamentState } from "@/lib/tournament";

import type { NotableGameEntry, NotableGames } from "@/lib/notableGames";

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
          description="Recorded game duration"
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
          description="Recorded game duration"
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
          description="Winner’s lowest recorded win probability"
          tagline={
            notable.comeback?.lowestWinnerProb != null
              ? `${Math.round(notable.comeback.lowestWinnerProb * 100)}%`
              : "—"
          }
          entry={notable.comeback}
          tournament={tournament}
          onViewGame={onViewGame}
        />
        <NotableGameCard label="Most Kills" description="Combined kills by both teams"
          tagline={notable.mostKills ? `${notable.mostKills.metric} kills` : "—"}
          entry={notable.mostKills} tournament={tournament} onViewGame={onViewGame} />
        <NotableGameCard label="Closest Kill Score" description="Final kill difference · not the victory margin"
          tagline={notable.closestKills ? `${notable.closestKills.metric} kill gap` : "—"}
          entry={notable.closestKills} tournament={tournament} onViewGame={onViewGame} />
        <NotableGameCard label="Biggest Momentum Swing" description="Largest single-event win-probability change · pp = percentage points"
          tagline={notable.biggestSwing ? `${Math.round(notable.biggestSwing.metric! * 100)} pp` : "—"}
          entry={notable.biggestSwing} tournament={tournament} onViewGame={onViewGame} />
        <NotableGameCard label="Largest Gold Lead" description="Peak recorded gold difference · either team"
          tagline={notable.largestGoldLead ? `${Math.round(notable.largestGoldLead.metric!).toLocaleString("en-US")} gold` : "—"}
          entry={notable.largestGoldLead} tournament={tournament} onViewGame={onViewGame} />
      </div>
    </div>
  );
}

function NotableGameCard({
  label,
  tagline,
  description,
  entry,
  tournament,
  onViewGame,
}: {
  label: string;
  tagline: string;
  description: string;
  entry: NotableGameEntry | null;
  tournament: TournamentState;
  onViewGame: (matchId: string, gameIdx: number) => void;
}) {
  const disabled = entry == null;
  const match = entry
    ? tournament.matches.find((m) => m.id === entry.matchId)
    : null;
  const hasReplay = !!match?.series;
  const participants = match ? [getTeam(tournament, match.blueTeamId), getTeam(tournament, match.redTeamId)] : [];
  const identity = (name: string) => {
    const candidates = participants.filter(team => team?.name === name);
    return <TournamentTeamIdentity team={candidates.length === 1 ? candidates[0] : null} fallback={name} />;
  };
  return (
    <article aria-label={label} className="min-w-0 flex flex-col border border-rift-line/50 bg-rift-bg/40 p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-xs font-display text-rift-mutedbright">{label}</h3>
        {entry && <span className="text-[10px] text-rift-mutedbright/60">Game {entry.gameIdx + 1}</span>}
      </div>
      <div className="text-2xl font-display tabular-nums text-rift-goldbright">{tagline}</div>
      <p className="text-[10px] text-rift-mutedbright/60 mt-1 mb-4">
        {description}
      </p>
      {entry ? <>
        <div className="space-y-2 text-xs text-rift-mutedbright mb-4">
          <div className="flex items-center gap-2"><span className="w-5 text-[9px] text-rift-mutedbright/50">VS</span>{identity(entry.blueTeamLabel)}</div>
          <div className="flex items-center gap-2"><span className="w-5 shrink-0" aria-hidden="true" />{identity(entry.redTeamLabel)}</div>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-1.5 border-t border-rift-line/30 pt-3 mt-auto text-[11px] text-rift-mutedbright/70">
          <span>Won by</span><span className="text-rift-goldbright">{identity(entry.winnerLabel)}</span>
        </div>
      </> : <p className="text-xs text-rift-mutedbright/55 mb-4 mt-auto">No qualifying recorded data available.</p>}
      <button type="button" disabled={disabled || !hasReplay}
        onClick={() => entry && onViewGame(entry.matchId, entry.gameIdx)}
        aria-label={`${label}: replay${entry ? ` Game ${entry.gameIdx + 1}` : " unavailable"}`}
        className="mt-4 w-full border border-rift-gold/40 bg-rift-gold/5 px-3 py-2 text-xs text-rift-goldbright transition-colors hover:border-rift-gold hover:bg-rift-gold/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rift-gold disabled:opacity-40 disabled:cursor-not-allowed">
        {hasReplay ? "View replay →" : "Replay unavailable"}
      </button>
    </article>
  );
}
