"use client";

import { useMemo } from "react";
import { useDraftStore } from "@/store/draftStore";
import {
  computeGroupStandings,
  teamStarRating,
  isSwissStageComplete,
  playoffBracketKindFor,
} from "@/lib/tournament";
import type { TournamentMatch, TournamentState } from "@/lib/tournament";
import { MatchCard } from "./MatchCard";
import { RoundColumn, LosersRoundColumn, PlayoffBracketSection } from "./BracketViews";
import { StandingsTable, GroupStandingsTable, SwissStandingsTable } from "./StandingsTables";
import { buildLiveTeamStatsMap } from "@/components/team/TeamLiveStats";
import { DirectQualifierBadge } from "@/components/QualifierBadge";
import TeamStars from "@/components/TeamStars";
import TeamLogoLink from "@/components/team/TeamLogoLink";
import TeamNameLink from "@/components/team/TeamNameLink";

/** Season-wide series W-L + titles for teams in this tournament. */
function useTournamentLiveStats(tournament: TournamentState) {
  const season = useDraftStore((s) => s.season);
  return useMemo(() => {
    if (!season) return null;
    const ids = new Set(tournament.teams.map((t) => t.id));
    return buildLiveTeamStatsMap(
      season,
      season.teams.filter((t) => ids.has(t.id)),
    );
  }, [season, tournament.teams]);
}

// Standalone round-robin layout: standings + matchday-grouped match
// cards. Each matchday gets its own header with a quick progress
// readout (X of Y played).
//
// For format === "round-robin-playoffs", the same standings + matchday
// layout drives the regular stage; once the regular stage finishes, a
// "Generate Playoff Bracket" button appears (then a DE playoff section
// once started). Playoff matches are filtered out of the matchday grid
// because they live on their own round-numbering and would otherwise
// merge into the regular-stage matchdays.
export function RoundRobinView({
  tournament,
  rounds,
  onStartMatch,
  onViewMatch,
}: {
  tournament: TournamentState;
  rounds: TournamentMatch[][];
  onStartMatch: (matchId: string) => void;
  onViewMatch: (matchId: string) => void;
}) {
  const simulateMatches = useDraftStore((s) => s.simulateMatches);
  const generatePlayoffBracket = useDraftStore(
    (s) => s.generatePlayoffBracket,
  );
  const teamStats = useTournamentLiveStats(tournament);
  const isRRPlayoffs =
    tournament.format === "round-robin-playoffs" ||
    tournament.format === "round-robin-playoffs-te" ||
    tournament.format === "round-robin-playoffs-step";
  // Regular-stage matches only — strips out the DE playoff matches
  // (winners/losers/grand-final) so they don't double up in the
  // matchday view. For plain round-robin every match has bracket
  // undefined so this is a no-op.
  const regularRounds = useMemo(() => {
    if (!isRRPlayoffs) return rounds;
    return rounds
      .map((rm) => rm.filter((m) => m.bracket === undefined))
      .filter((rm) => rm.length > 0);
  }, [rounds, isRRPlayoffs]);
  const playoffMatches = useMemo(
    () =>
      isRRPlayoffs
        ? tournament.matches.filter((m) => m.bracket !== undefined)
        : [],
    [tournament.matches, isRRPlayoffs],
  );
  const regularStageComplete =
    isRRPlayoffs &&
    tournament.matches
      .filter((m) => m.bracket === undefined)
      .every((m) => m.winner != null);
  const playoffStarted = tournament.rrPlayoffsStarted ?? false;
  const advancing = tournament.rrPlayoffsAdvancing ?? 0;
  return (
    <div className="space-y-6">
      <div>
        <div className="text-[10px] uppercase tracking-[0.4em] text-rift-gold/70 mb-2">
          Standings
        </div>
        <StandingsTable tournament={tournament} teamStats={teamStats} />
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-[0.4em] text-rift-gold/55 mb-3">
          Matchdays
        </div>
        <div className="space-y-3">
          {regularRounds.map((roundMatches, roundIdx) => {
            const done = roundMatches.filter((m) => m.winner).length;
            const pendingIds = roundMatches
              .filter((m) => !m.winner && m.blueTeamId && m.redTeamId)
              .map((m) => m.id);
            const isCurrent =
              done < roundMatches.length &&
              (roundIdx === 0 ||
                regularRounds[roundIdx - 1].every((m) => m.winner != null));
            return (
              <div
                key={roundIdx}
                className={`border ${
                  isCurrent
                    ? "border-rift-gold/60 bg-rift-gold/[0.03]"
                    : "border-rift-line/40 bg-rift-panel/30"
                } p-2.5 md:p-3`}
              >
                <div className="flex items-baseline justify-between mb-2 gap-2">
                  <div className="font-display text-sm tracking-wider text-rift-mutedbright">
                    Matchday {roundIdx + 1}
                    {isCurrent && (
                      <span className="ml-2 text-[9px] uppercase tracking-[0.3em] text-rift-goldbright">
                        Current
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-[9px] uppercase tracking-[0.3em] text-rift-mutedbright/55 tabular-nums">
                      {done}/{roundMatches.length}
                    </div>
                    {pendingIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => simulateMatches(pendingIds)}
                        className="px-2 py-0.5 border border-rift-gold/50 text-rift-gold hover:bg-rift-gold/10 hover:text-rift-goldbright text-[9px] uppercase tracking-[0.25em] transition-all"
                        title="Auto-play all remaining matches in this matchday"
                      >
                        Sim Day
                      </button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-3">
                  {roundMatches.map((m) => (
                    <MatchCard
                      key={m.id}
                      match={m}
                      tournament={tournament}
                      onStart={() => onStartMatch(m.id)}
                      onView={() => onViewMatch(m.id)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {isRRPlayoffs && regularStageComplete && !playoffStarted && (
        <button
          type="button"
          onClick={generatePlayoffBracket}
          className="w-full py-3 border-2 border-rift-gold bg-rift-gold/10 text-rift-goldbright hover:bg-rift-gold/20 font-display text-sm tracking-[0.3em] uppercase transition-all"
        >
          Lock In Standings → Generate Playoff Bracket (Top {advancing})
        </button>
      )}

      {isRRPlayoffs && playoffStarted && playoffMatches.length > 0 && (
        <PlayoffBracketSection
          tournament={tournament}
          playoffMatches={playoffMatches}
          kind={playoffBracketKindFor(tournament.format)}
          advancing={advancing}
          onStartMatch={onStartMatch}
          onViewMatch={onViewMatch}
        />
      )}
    </div>
  );
}

// Groups + playoffs view: visually distinct from round-robin to make
// the two-stage shape obvious. Group stage renders as a labelled
// "Group A" panel with a highlighted advancing-zone in the standings.
// Playoff bracket sits below in a tournament-tree layout once started.
export function GroupsPlayoffsView({
  tournament,
  onStartMatch,
  onViewMatch,
}: {
  tournament: TournamentState;
  rounds: TournamentMatch[][];
  onStartMatch: (matchId: string) => void;
  onViewMatch: (matchId: string) => void;
}) {
  const generatePlayoffBracket = useDraftStore(
    (s) => s.generatePlayoffBracket,
  );
  const simulateMatches = useDraftStore((s) => s.simulateMatches);
  const cfg = tournament.groupsPlayoffs;
  const groupCount = cfg?.groupCount ?? 1;
  const advancingPerGroup = cfg?.advancingPerGroup ?? 2;
  const totalAdvancing = groupCount * advancingPerGroup;
  const groupStagePendingIds = useMemo(
    () =>
      tournament.matches
        .filter(
          (m) =>
            m.bracket === undefined &&
            !m.winner &&
            m.blueTeamId &&
            m.redTeamId,
        )
        .map((m) => m.id),
    [tournament.matches],
  );
  // The current matchday across ALL groups: the lowest round that still
  // has unplayed group-stage matches, then every unplayed match in that
  // round (so all groups advance one matchday in lockstep).
  const matchdayPendingIds = useMemo(() => {
    const pend = tournament.matches.filter(
      (m) => m.bracket === undefined && !m.winner && m.blueTeamId && m.redTeamId,
    );
    if (pend.length === 0) return [];
    const round = Math.min(...pend.map((m) => m.round));
    return pend.filter((m) => m.round === round).map((m) => m.id);
  }, [tournament.matches]);
  // Group-stage matches in groups-playoffs DON'T have a `bracket` set
  // (only the dynamically-created playoff matches do). They DO have a
  // `groupId` letter assigned at creation.
  const groupIds = useMemo(() => {
    const ids = new Set<string>();
    for (const m of tournament.matches) {
      if (m.bracket === undefined && m.groupId) ids.add(m.groupId);
    }
    return [...ids].sort();
  }, [tournament.matches]);
  // Teams that bypass the group stage entirely and are pre-seeded into the
  // playoff bracket (Worlds region #1 seeds). Shown separately so they're
  // not invisible while the groups play out.
  const byeTeams = useMemo(() => {
    const ids = tournament.groupsByeTeamIds ?? [];
    return ids
      .map((id) => tournament.teams.find((t) => t.id === id))
      .filter((t): t is TournamentTeam => t != null)
      .sort((a, b) => a.seed - b.seed);
  }, [tournament.groupsByeTeamIds, tournament.teams]);
  const playoffMatches = tournament.matches.filter(
    (m) => m.bracket !== undefined,
  );
  const groupStageComplete = tournament.matches
    .filter((m) => m.bracket === undefined)
    .every((m) => m.winner != null);
  const playoffStarted = cfg?.playoffStarted ?? false;

  return (
    <div className="space-y-7">
      {/* ─── Group Stage Header ─────────────────────────────── */}
      <div className="flex items-baseline justify-between pb-2 border-b-2 border-rift-gold/40 gap-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.4em] text-rift-gold/70">
            Group Stage
          </div>
          <div className="font-display text-2xl tracking-wider text-rift-goldbright">
            {groupCount === 1
              ? "Single Group"
              : `${groupCount} Groups · Top ${advancingPerGroup} advance`}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="text-[9px] uppercase tracking-[0.3em] text-rift-mutedbright/60 text-right">
            <div>{totalAdvancing} → playoffs</div>
            <div className="text-rift-gold/60 mt-0.5">
              {
                tournament.matches.filter(
                  (m) => m.bracket === undefined && m.winner,
                ).length
              }
              /
              {tournament.matches.filter((m) => m.bracket === undefined).length}{" "}
              played
            </div>
          </div>
          {groupStagePendingIds.length > 0 && (
            <div className="flex items-center gap-1.5">
              {matchdayPendingIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => simulateMatches(matchdayPendingIds)}
                  className="px-2.5 py-1 border border-rift-gold/40 text-rift-gold hover:bg-rift-gold/10 hover:text-rift-goldbright text-[9px] uppercase tracking-[0.3em] transition-all"
                  title="Play the next matchday across every group at once"
                >
                  Sim Matchday
                </button>
              )}
              <button
                type="button"
                onClick={() => simulateMatches(groupStagePendingIds)}
                className="px-2.5 py-1 border border-rift-gold/60 text-rift-goldbright hover:bg-rift-gold/10 text-[9px] uppercase tracking-[0.3em] transition-all"
                title="Auto-play all remaining group-stage matches"
              >
                Sim Group Stage
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ─── Teams that bypassed the group stage (Worlds #1 seeds) ─── */}
      {byeTeams.length > 0 && (
        <div>
          <div className="flex items-baseline justify-between mb-2 gap-2">
            <span className="text-[10px] uppercase tracking-[0.4em] text-rift-gold/70">
              Direct to Playoffs
            </span>
            <span className="text-[9px] uppercase tracking-[0.3em] text-rift-mutedbright/60">
              Bye · seeded into the bracket
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {byeTeams.map((team, i) => (
              <span
                key={team.id}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-rift-gold/30 bg-rift-gold/5 text-[11px] font-display tracking-wider text-rift-goldbright"
              >
                <span className="text-rift-mutedbright/50 tabular-nums">
                  {i + 1}
                </span>
                <TeamNameLink
                  teamId={team.id}
                  name={team.name}
                  iconKey={team.iconKey}
                  logoUrl={team.logoUrl}
                  color={team.color ?? undefined}
                  showLogo={false}
                  renderAs="span"
                  className="truncate max-w-[12rem]"
                  hint={{
                    name: team.name,
                    iconKey: team.iconKey,
                    logoUrl: team.logoUrl,
                    color: team.color ?? undefined,
                  }}
                />
                <DirectQualifierBadge />
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ─── Per-group panels ───────────────────────────────── */}
      <div
        className={`grid gap-4 ${
          groupCount >= 4
            ? "grid-cols-1 md:grid-cols-2"
            : groupCount === 2
            ? "grid-cols-1 lg:grid-cols-2"
            : "grid-cols-1"
        }`}
      >
        {groupIds.map((groupId) => (
          <GroupPanel
            key={groupId}
            tournament={tournament}
            groupId={groupId}
            advancingPerGroup={advancingPerGroup}
            onStartMatch={onStartMatch}
            onViewMatch={onViewMatch}
          />
        ))}
      </div>

      {groupStageComplete && !playoffStarted && (
        <button
          type="button"
          onClick={generatePlayoffBracket}
          className="w-full py-3 border-2 border-rift-gold bg-rift-gold/10 text-rift-goldbright hover:bg-rift-gold/20 font-display text-sm tracking-[0.3em] uppercase transition-all"
        >
          Lock In Standings → Generate Playoff Bracket
        </button>
      )}

      {/* ─── Playoffs (single-elim or double-elim) ──────────── */}
      {playoffStarted && playoffMatches.length > 0 && (
        <PlayoffBracketSection
          tournament={tournament}
          playoffMatches={playoffMatches}
          kind={playoffBracketKindFor(tournament.format)}
          advancing={totalAdvancing}
          onStartMatch={onStartMatch}
          onViewMatch={onViewMatch}
        />
      )}
    </div>
  );
}

// One group section: standings (with advancing zone tinted) + per-
// matchday fixtures restricted to this group.
function GroupPanel({
  tournament,
  groupId,
  advancingPerGroup,
  onStartMatch,
  onViewMatch,
}: {
  tournament: TournamentState;
  groupId: string;
  advancingPerGroup: number;
  onStartMatch: (matchId: string) => void;
  onViewMatch: (matchId: string) => void;
}) {
  const simulateMatches = useDraftStore((s) => s.simulateMatches);
  const teamStats = useTournamentLiveStats(tournament);
  const standings = useMemo(
    () => computeGroupStandings(tournament, groupId),
    [tournament, groupId],
  );
  // Group this group's matches by round.
  const groupMatches = useMemo(
    () => tournament.matches.filter((m) => m.groupId === groupId),
    [tournament.matches, groupId],
  );
  const groupPendingIds = groupMatches
    .filter((m) => !m.winner && m.blueTeamId && m.redTeamId)
    .map((m) => m.id);
  const matchdays = useMemo(() => {
    const max = groupMatches.reduce((a, m) => Math.max(a, m.round), 0);
    const out: TournamentMatch[][] = [];
    for (let r = 1; r <= max; r++) {
      const inRound = groupMatches.filter((m) => m.round === r);
      if (inRound.length > 0) out.push(inRound);
    }
    return out;
  }, [groupMatches]);
  const done = groupMatches.filter((m) => m.winner).length;
  return (
    <div className="border border-rift-gold/30 bg-rift-panel/40">
      <div className="flex items-baseline justify-between px-3 py-2 border-b-2 border-rift-gold/40 bg-rift-gold/[0.03]">
        <div>
          <div className="text-[9px] uppercase tracking-[0.4em] text-rift-gold/70">
            Group {groupId}
          </div>
          <div className="text-[10px] text-rift-mutedbright/65">
            {standings.length} teams
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] uppercase tracking-[0.3em] text-rift-mutedbright/55 tabular-nums">
            {done}/{groupMatches.length}
          </span>
          {groupPendingIds.length > 0 && (
            <button
              type="button"
              onClick={() => simulateMatches(groupPendingIds)}
              className="px-1.5 py-0.5 border border-rift-gold/40 text-rift-gold hover:bg-rift-gold/10 hover:text-rift-goldbright text-[8px] uppercase tracking-[0.2em] transition-all"
              title={`Auto-play all of Group ${groupId}`}
            >
              Sim Group
            </button>
          )}
        </div>
      </div>
      <div className="p-2">
        <GroupStandingsTable
          standings={standings}
          advancingTeams={advancingPerGroup}
          tournament={tournament}
          teamStats={teamStats}
        />
      </div>
      <div className="px-2 pb-2 space-y-2">
        {matchdays.map((roundMatches, roundIdx) => (
          <div key={roundIdx} className="border border-rift-line/30 bg-rift-bg/30 p-2">
            <div className="text-[9px] uppercase tracking-[0.3em] text-rift-mutedbright/55 mb-1.5">
              Matchday {roundIdx + 1}
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              {roundMatches.map((m) => (
                <MatchCard
                  key={m.id}
                  match={m}
                  tournament={tournament}
                  onStart={() => onStartMatch(m.id)}
                  onView={() => onViewMatch(m.id)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Swiss view: standings on top, then a horizontal column-per-round
// layout (similar to single-elim bracket). Each round shows pairings
// stacked vertically with both teams' pre-round W-L records.
//
// For swiss-playoffs, the playoff bracket renders below once the user
// promotes top-N teams — same horizontal column layout as single-elim.
export function SwissView({
  tournament,
  rounds: _rounds,
  onStartMatch,
  onViewMatch,
}: {
  tournament: TournamentState;
  rounds: TournamentMatch[][];
  onStartMatch: (matchId: string) => void;
  onViewMatch: (matchId: string) => void;
}) {
  const simulateSwissStage = useDraftStore((s) => s.simulateSwissStage);
  const simulateSwissToPlayoffs = useDraftStore(
    (s) => s.simulateSwissToPlayoffs,
  );
  const generatePlayoffBracket = useDraftStore(
    (s) => s.generatePlayoffBracket,
  );
  const teamStats = useTournamentLiveStats(tournament);
  const total = tournament.swissTotalRounds ?? 0;

  // Split out Swiss-stage matches from playoff matches (swiss-playoffs).
  const swissMatches = useMemo(
    () => tournament.matches.filter((m) => m.bracket === undefined),
    [tournament.matches],
  );
  const playoffMatches = useMemo(
    () => tournament.matches.filter((m) => m.bracket !== undefined),
    [tournament.matches],
  );
  // Group Swiss matches by round.
  const swissRounds: TournamentMatch[][] = useMemo(() => {
    const max = swissMatches.reduce((a, m) => Math.max(a, m.round), 0);
    const out: TournamentMatch[][] = [];
    for (let r = 1; r <= max; r++) {
      const inRound = swissMatches.filter((m) => m.round === r);
      if (inRound.length > 0) out.push(inRound);
    }
    return out;
  }, [swissMatches]);

  const currentRoundIdx = (() => {
    for (let i = 0; i < swissRounds.length; i++) {
      if (swissRounds[i].some((m) => !m.winner)) return i;
    }
    return swissRounds.length - 1;
  })();

  // Pre-round W-L map for every Swiss round (so each pairing card shows
  // both teams' records entering the round).
  const preRoundRecords = useMemo(() => {
    const out: Map<string, { w: number; l: number }>[] = [];
    for (let r = 0; r <= swissRounds.length; r++) {
      const rec = new Map<string, { w: number; l: number }>();
      for (const team of tournament.teams) rec.set(team.id, { w: 0, l: 0 });
      for (const m of swissMatches) {
        if (m.round > r) continue;
        if (!m.winner || !m.blueTeamId || !m.redTeamId) continue;
        const winId = m.winner.teamId;
        const loseId = winId === m.blueTeamId ? m.redTeamId : m.blueTeamId;
        const w = rec.get(winId);
        if (w) w.w++;
        const l = rec.get(loseId);
        if (l) l.l++;
      }
      out.push(rec);
    }
    return out;
  }, [swissMatches, swissRounds.length, tournament.teams]);

  // Threshold mode (modern Worlds Swiss): symmetric X wins qualify / X
  // losses out (X fixed by field size).
  const winTarget = tournament.swissWinTarget ?? null;
  const swissStageComplete = isSwissStageComplete(tournament);
  const allSwissPendingIds = swissMatches
    .filter((m) => !m.winner && m.blueTeamId && m.redTeamId)
    .map((m) => m.id);
  const isSwissPlayoffs =
    tournament.format === "swiss-playoffs" ||
    tournament.format === "swiss-playoffs-de" ||
    tournament.format === "swiss-playoffs-te";
  const playoffStarted = tournament.swissPlayoffsStarted ?? false;
  const advancing = tournament.swissPlayoffsAdvancing ?? 0;
  const playoffKind = playoffBracketKindFor(tournament.format);
  // Teams pre-seeded into the playoff bracket without playing the swiss
  // stage (e.g. MSI region #1 seeds). They're shown separately so they're
  // not invisible while the swiss field plays out.
  const byeTeams = useMemo(() => {
    const ids = tournament.swissByeTeamIds ?? [];
    return ids
      .map((id) => tournament.teams.find((t) => t.id === id))
      .filter((t): t is TournamentTeam => t != null)
      .sort((a, b) => a.seed - b.seed);
  }, [tournament.swissByeTeamIds, tournament.teams]);

  return (
    <div className="space-y-6">
      {/* ─── Standings + stage controls ───────────────────────── */}
      <div>
        <div className="flex items-baseline justify-between mb-2 gap-2">
          <span className="text-[10px] uppercase tracking-[0.4em] text-rift-gold/70">
            Swiss Standings
          </span>
          <div className="flex items-center gap-2">
            <span className="text-[9px] uppercase tracking-[0.3em] text-rift-mutedbright/60">
              {winTarget != null
                ? `Round ${Math.min(swissRounds.length, currentRoundIdx + 1)} · ${winTarget}W qualify / ${winTarget}L out`
                : `Round ${Math.min(swissRounds.length, currentRoundIdx + 1)} of ${total}`}
            </span>
            {isSwissPlayoffs && !playoffStarted && !swissStageComplete && (
              <button
                type="button"
                onClick={() => simulateSwissToPlayoffs()}
                className="px-2.5 py-1 border border-rift-gold/60 text-rift-goldbright hover:bg-rift-gold/10 text-[9px] uppercase tracking-[0.3em] transition-all"
                title="Auto-play every remaining Swiss round, then create the playoff bracket"
              >
                Sim Swiss → Playoffs
              </button>
            )}
            {!isSwissPlayoffs && allSwissPendingIds.length > 0 && (
              <button
                type="button"
                onClick={() => simulateSwissStage()}
                className="px-2.5 py-1 border border-rift-gold/60 text-rift-goldbright hover:bg-rift-gold/10 text-[9px] uppercase tracking-[0.3em] transition-all"
                title="Auto-play every remaining match in the Swiss stage"
              >
                Sim Swiss Stage
              </button>
            )}
          </div>
        </div>
        <SwissStandingsTable
          tournament={tournament}
          advancing={isSwissPlayoffs ? advancing : 0}
          teamStats={teamStats}
        />
      </div>

      {/* ─── Teams that bypassed the swiss stage (e.g. MSI #1 seeds) ─── */}
      {byeTeams.length > 0 && (
        <div>
          <div className="flex items-baseline justify-between mb-2 gap-2">
            <span className="text-[10px] uppercase tracking-[0.4em] text-rift-gold/70">
              Pre-Qualified to Playoffs
            </span>
            <span className="text-[9px] uppercase tracking-[0.3em] text-rift-mutedbright/60">
              Bye · seeded into the bracket
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {byeTeams.map((team, i) => (
              <span
                key={team.id}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-rift-gold/30 bg-rift-gold/5 text-[11px] font-display tracking-wider text-rift-goldbright"
              >
                <span className="text-rift-mutedbright/50 tabular-nums">
                  {i + 1}
                </span>
                <TeamNameLink
                  teamId={team.id}
                  name={team.name}
                  iconKey={team.iconKey}
                  logoUrl={team.logoUrl}
                  color={team.color ?? undefined}
                  showLogo={false}
                  renderAs="span"
                  className="truncate max-w-[12rem]"
                  hint={{
                    name: team.name,
                    iconKey: team.iconKey,
                    logoUrl: team.logoUrl,
                    color: team.color ?? undefined,
                  }}
                />
                <DirectQualifierBadge />
              </span>
            ))}
          </div>
        </div>
      )}

      {isSwissPlayoffs && swissStageComplete && !playoffStarted && (
        <button
          type="button"
          onClick={generatePlayoffBracket}
          className="w-full py-3 border-2 border-rift-gold bg-rift-gold/10 text-rift-goldbright hover:bg-rift-gold/20 font-display text-sm tracking-[0.3em] uppercase transition-all"
        >
          Lock In Standings → Generate Playoff Bracket
          {byeTeams.length > 0
            ? ` (Top ${advancing} + ${byeTeams.length} seeded)`
            : ` (Top ${advancing})`}
        </button>
      )}

      {/* ─── Horizontal pairings: column per round ──────────── */}
      <div>
        <div className="flex items-baseline justify-between mb-3">
          <span className="text-[10px] uppercase tracking-[0.4em] text-rift-gold/55">
            Pairings
          </span>
          <span className="text-[8px] uppercase tracking-[0.3em] text-rift-mutedbright/55">
            Pair by record · greedy avoid-rematch
          </span>
        </div>
        <div className="overflow-x-auto pb-2">
          <div
            className="inline-flex items-stretch gap-4 md:gap-5 min-w-full"
            style={{ minWidth: `${Math.max(swissRounds.length, total) * 240}px` }}
          >
            {/* One column per round. Show stub columns for rounds that
                haven't been generated yet so the layout doesn't jump
                between rounds. */}
            {Array.from({ length: total }, (_, idx) => {
              const roundMatches = swissRounds[idx] ?? [];
              const isCurrent = idx === currentRoundIdx;
              const pendingIds = roundMatches
                .filter((m) => !m.winner && m.blueTeamId && m.redTeamId)
                .map((m) => m.id);
              return (
                <SwissRoundColumn
                  key={idx}
                  roundIdx={idx}
                  isCurrent={isCurrent}
                  matches={roundMatches}
                  tournament={tournament}
                  preRoundRecord={preRoundRecords[idx] ?? new Map()}
                  pendingIds={pendingIds}
                  onStartMatch={onStartMatch}
                  onViewMatch={onViewMatch}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* ─── Playoff bracket (swiss-playoffs / swiss-playoffs-de) ── */}
      {isSwissPlayoffs && playoffStarted && playoffMatches.length > 0 && (
        <PlayoffBracketSection
          tournament={tournament}
          playoffMatches={playoffMatches}
          kind={playoffKind}
          advancing={advancing}
          onStartMatch={onStartMatch}
          onViewMatch={onViewMatch}
        />
      )}
    </div>
  );
}

// Visual treatment for a record bracket ("2-1", "0-2", …): winning
// brackets read green, even brackets gold, losing brackets red — so the
// Swiss ladder is legible at a glance.
function recordBracketStyle(rec: string): {
  border: string;
  bg: string;
  text: string;
  bar: string;
} {
  const parts = rec.split("-").map(Number);
  const diff = (parts[0] || 0) - (parts[1] || 0);
  if (rec === "—" || Number.isNaN(diff)) {
    return {
      border: "border-rift-line/40",
      bg: "bg-rift-bg/20",
      text: "text-rift-mutedbright/70",
      bar: "bg-rift-line/10",
    };
  }
  if (diff > 0) {
    return {
      border: "border-emerald-500/40",
      bg: "bg-emerald-500/[0.035]",
      text: "text-emerald-300",
      bar: "bg-emerald-500/10",
    };
  }
  if (diff < 0) {
    return {
      border: "border-rift-red/45",
      bg: "bg-rift-red/[0.035]",
      text: "text-rift-redbright",
      bar: "bg-rift-red/10",
    };
  }
  return {
    border: "border-rift-gold/45",
    bg: "bg-rift-gold/[0.035]",
    text: "text-rift-goldbright",
    bar: "bg-rift-gold/10",
  };
}

// One Swiss round rendered as a vertical column (mirrors single-elim
// RoundColumn). Header includes the round label, completion ratio, and
// a Sim Round button when there are pending matches. Within the column
// each record bracket is a distinct tinted card with its own Sim button.
function SwissRoundColumn({
  roundIdx,
  isCurrent,
  matches,
  tournament,
  preRoundRecord,
  pendingIds,
  onStartMatch,
  onViewMatch,
}: {
  roundIdx: number;
  isCurrent: boolean;
  matches: TournamentMatch[];
  tournament: TournamentState;
  preRoundRecord: Map<string, { w: number; l: number }>;
  pendingIds: string[];
  onStartMatch: (matchId: string) => void;
  onViewMatch?: (matchId: string) => void;
}) {
  const simulateMatches = useDraftStore((s) => s.simulateMatches);
  const completed = matches.filter((m) => m.winner).length;
  const total = matches.length;
  const notStarted = total === 0;
  // Swiss pairs same-record teams, so group each round's matches by the
  // pairing's pre-round record ("2-0", "1-1", …) and label them — the
  // signature Swiss "record brackets" readout. Round 1 is all 0-0 so the
  // single-group label is suppressed.
  const recordGroups = useMemo(() => {
    const byRecord = new Map<string, TournamentMatch[]>();
    for (const m of matches) {
      const rec = m.blueTeamId ? preRoundRecord.get(m.blueTeamId) : null;
      const key = rec ? `${rec.w}-${rec.l}` : "—";
      const arr = byRecord.get(key);
      if (arr) arr.push(m);
      else byRecord.set(key, [m]);
    }
    return [...byRecord.entries()].sort((a, b) => {
      const [aw, al] = a[0].split("-").map(Number);
      const [bw, bl] = b[0].split("-").map(Number);
      return (bw || 0) - (aw || 0) || (al || 0) - (bl || 0);
    });
  }, [matches, preRoundRecord]);
  return (
    <div
      className={`flex-1 min-w-[220px] md:min-w-[240px] flex flex-col border ${
        isCurrent
          ? "border-rift-gold/60 bg-rift-gold/[0.03]"
          : "border-rift-line/40 bg-rift-panel/30"
      } p-2`}
    >
      <div className="flex items-baseline justify-between mb-2 gap-1">
        <div className="font-display text-[11px] md:text-xs tracking-[0.3em] uppercase">
          <span
            className={
              isCurrent ? "text-rift-goldbright" : "text-rift-mutedbright"
            }
          >
            Round {roundIdx + 1}
          </span>
          {isCurrent && (
            <span className="ml-2 text-[8px] tracking-[0.3em] text-rift-goldbright">
              ●
            </span>
          )}
        </div>
        <div className="text-[8px] uppercase tracking-[0.3em] text-rift-mutedbright/55 tabular-nums">
          {notStarted ? "TBD" : `${completed}/${total}`}
        </div>
      </div>
      {pendingIds.length > 0 && (
        <button
          type="button"
          onClick={() => simulateMatches(pendingIds)}
          className="mb-2 w-full px-2 py-1 border border-rift-gold/40 text-rift-gold hover:bg-rift-gold/10 hover:text-rift-goldbright text-[9px] uppercase tracking-[0.25em] transition-all"
          title="Auto-play this round"
        >
          Sim Round
        </button>
      )}
      <div className="flex-1 flex flex-col gap-2.5">
        {notStarted ? (
          <div className="text-[9px] uppercase tracking-[0.3em] text-rift-mutedbright/40 text-center py-3">
            Pairs after prior round resolves
          </div>
        ) : (
          recordGroups.map(([rec, groupMatches]) => {
            const style = recordBracketStyle(rec);
            const groupPending = groupMatches
              .filter((m) => !m.winner && m.blueTeamId && m.redTeamId)
              .map((m) => m.id);
            const groupDone = groupMatches.filter((m) => m.winner).length;
            return (
              <div
                key={rec}
                className={`border ${style.border} ${style.bg}`}
              >
                <div
                  className={`flex items-center justify-between gap-1 px-2 py-1 border-b ${style.border} ${style.bar}`}
                >
                  <span
                    className={`font-display text-[11px] tracking-[0.2em] tabular-nums ${style.text}`}
                  >
                    {rec === "—" ? "Bracket" : rec}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[8px] uppercase tracking-[0.25em] text-rift-mutedbright/55 tabular-nums">
                      {groupDone}/{groupMatches.length}
                    </span>
                    {groupPending.length > 0 && (
                      <button
                        type="button"
                        onClick={() => simulateMatches(groupPending)}
                        className={`px-1.5 py-0.5 border ${style.border} ${style.text} hover:brightness-125 text-[8px] uppercase tracking-[0.2em] transition-all`}
                        title={`Auto-play every match in the ${rec} bracket`}
                      >
                        Sim
                      </button>
                    )}
                  </div>
                </div>
                <div className="p-1.5 flex flex-col gap-1.5">
                  {groupMatches.map((m) => (
                    <SwissPairingRow
                      key={m.id}
                      match={m}
                      tournament={tournament}
                      preRoundRecord={preRoundRecord}
                      onStart={() => onStartMatch(m.id)}
                      onView={onViewMatch ? () => onViewMatch(m.id) : undefined}
                    />
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function SwissPairingRow({
  match,
  tournament,
  preRoundRecord,
  onStart,
  onView,
}: {
  match: TournamentMatch;
  tournament: TournamentState;
  preRoundRecord: Map<string, { w: number; l: number }>;
  onStart: () => void;
  onView?: () => void;
}) {
  const simulateOneMatch = useDraftStore((s) => s.simulateOneMatch);
  const blueTeam = match.blueTeamId
    ? tournament.teams.find((t) => t.id === match.blueTeamId) ?? null
    : null;
  const redTeam = match.redTeamId
    ? tournament.teams.find((t) => t.id === match.redTeamId) ?? null
    : null;
  const blueRec = blueTeam ? preRoundRecord.get(blueTeam.id) : null;
  const redRec = redTeam ? preRoundRecord.get(redTeam.id) : null;
  const winner = match.winner;
  const blueWon = winner && winner.teamId === match.blueTeamId;
  const redWon = winner && winner.teamId === match.redTeamId;
  const ready = blueTeam && redTeam && !winner;
  return (
    <div role="group" aria-label={`${blueTeam?.name ?? "TBD"} versus ${redTeam?.name ?? "TBD"}`} className="border border-rift-line/40 bg-rift-bg/30 px-2 py-1.5">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <SwissTeamSlot
          team={blueTeam}
          opponent={redTeam}
          record={blueRec}
          isWinner={!!blueWon}
          isLoser={!!redWon}
        />
        <span className="text-[10px] uppercase tracking-[0.3em] text-rift-mutedbright/50 tabular-nums">
          {winner ? `${winner.blueWins}–${winner.redWins}` : "vs"}
        </span>
        <SwissTeamSlot
          team={redTeam}
          opponent={blueTeam}
          record={redRec}
          isWinner={!!redWon}
          isLoser={!!blueWon}
          alignRight
        />
      </div>
      {ready && (
        <div className="grid grid-cols-[1fr_auto] gap-1.5 mt-1.5">
          <button
            type="button"
            onClick={onStart}
            className="py-1 border border-rift-gold/60 bg-rift-gold/15 text-rift-goldbright hover:bg-rift-gold/25 text-[9px] uppercase tracking-[0.3em] transition-all"
          >
            Start
          </button>
          <button
            type="button"
            onClick={() => simulateOneMatch(match.id)}
            className="px-2 py-1 border border-rift-line text-rift-mutedbright hover:text-rift-goldbright hover:border-rift-gold/50 text-[9px] uppercase tracking-[0.3em] transition-all"
          >
            Sim
          </button>
        </div>
      )}
      {winner && onView && match.series && (
        <button
          type="button"
          onClick={onView}
          className="w-full mt-1 py-0.5 text-[9px] uppercase tracking-[0.3em] text-rift-gold/70 hover:text-rift-goldbright border border-rift-gold/30 hover:bg-rift-gold/10 transition-all"
        >
          View Replay
        </button>
      )}
    </div>
  );
}

import type { TournamentTeam } from "@/lib/tournament";

function SwissTeamSlot({
  team,
  opponent,
  record,
  isWinner,
  isLoser,
  alignRight,
}: {
  team: TournamentTeam | null;
  opponent?: TournamentTeam | null;
  record: { w: number; l: number } | null | undefined;
  isWinner: boolean;
  isLoser: boolean;
  alignRight?: boolean;
}) {
  const winnerCls = isWinner ? "text-emerald-300" : isLoser ? "text-rift-redbright" : "text-rift-mutedbright";
  const opponentHint = opponent
    ? {
        name: opponent.name,
        iconKey: opponent.iconKey,
        logoUrl: opponent.logoUrl,
        color: opponent.color ?? undefined,
      }
    : undefined;
  return (
    <div
      className={`min-w-0 ${alignRight ? "text-right" : "text-left"}`}
      title={isWinner ? "Series winner" : isLoser ? "Series loser" : undefined}
    >
      <div
        className={`flex items-center gap-1 min-w-0 ${
          alignRight ? "flex-row-reverse justify-start" : ""
        }`}
      >
        {team && (
          <TeamLogoLink
            teamId={team.id}
            name={team.name}
            iconKey={team.iconKey}
            logoUrl={team.logoUrl}
            color={team.color ?? undefined}
            size={12}
            renderAs="span"
            className={`shrink-0 self-center ${winnerCls}`}
            hint={{
              name: team.name,
              iconKey: team.iconKey,
              logoUrl: team.logoUrl,
              color: team.color ?? undefined,
            }}
            opponentTeamId={opponent?.id}
            opponentHint={opponentHint}
          />
        )}
        <div className={`font-display text-[12px] tracking-wider truncate ${winnerCls}`}>
          {team ? (
            <TeamNameLink
              teamId={team.id}
              name={team.name}
              iconKey={team.iconKey}
              logoUrl={team.logoUrl}
              color={team.color ?? undefined}
              showLogo={false}
              renderAs="span"
              className="truncate"
              hint={{
                name: team.name,
                iconKey: team.iconKey,
                logoUrl: team.logoUrl,
                color: team.color ?? undefined,
              }}
              opponentTeamId={opponent?.id}
              opponentHint={opponentHint}
            />
          ) : (
            "TBD"
          )}
        </div>
      </div>
      <div className={`mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 ${alignRight ? "justify-end" : ""}`}>
        {(isWinner || isLoser) && <span className="sr-only">{isWinner ? "Series winner" : "Series loser"}</span>}
        {team && <TeamStars rating={teamStarRating(team)} className="text-[10px]" />}
        {record && <span className="text-[9px] text-rift-mutedbright/70 tabular-nums">{record.w}-{record.l}</span>}
      </div>
    </div>
  );
}
