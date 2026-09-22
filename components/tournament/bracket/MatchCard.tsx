"use client";
import { teamStarRating } from "@/lib/tournament";
import TeamStars from "@/components/TeamStars";
import { useLayoutEffect } from "react";

import TeamLogoLink from "@/components/team/TeamLogoLink";
import TeamNameLink from "@/components/team/TeamNameLink";
import { getPersonality } from "@/lib/draftAI";
import { isReverseSweep } from "@/lib/matchTags";
import type { TeamStreakMap } from "@/lib/streaks";
import { computeTeamStreaks } from "@/lib/streaks";
import type { TournamentMatch,TournamentState,TournamentTeam } from "@/lib/tournament";
import { getTeam } from "@/lib/tournament";
import { useDraftStore } from "@/store/draftStore";
import { memo,useCallback,useRef } from "react";

// ─── Shared memoized streak lookup ──────────────────────────────────────
// computeTeamStreaks is O(teams × matches); previously EVERY MatchCard
// (and every standings table) recomputed it per render. The WeakMap keys
// on tournament identity, so all bracket components share ONE computation
// per tournament state — and bulk-sim commits (which replace the
// tournament object) invalidate it automatically.
const streaksCache = new WeakMap<TournamentState, TeamStreakMap>();

export function teamStreaksFor(tournament: TournamentState): TeamStreakMap {
  let streaks = streaksCache.get(tournament);
  if (!streaks) {
    streaks = computeTeamStreaks(tournament);
    streaksCache.set(tournament, streaks);
  }
  return streaks;
}

// Identity-stable wrapper for handler props. Parents pass fresh closures
// (`() => onStartMatch(m.id)`) on every render which would defeat
// React.memo on the inner card; this keeps a stable function identity
// while always invoking the LATEST closure (safe here — the closures only
// capture setState functions, never render-frame data).
function useStableHandler(fn?: () => void): () => void {
  const ref = useRef(fn);
  useLayoutEffect(() => { ref.current = fn; }, [fn]);
  return useCallback(() => {
    ref.current?.();
  }, []);
}

// ─── StatusPill ─────────────────────────────────────────────────────────
function StatusPill({ status }: { status: "pending" | "ready" | "complete" }) {
  const cls =
    status === "complete"
      ? "border-rift-gold/50 bg-rift-gold/10 text-rift-goldbright"
      : status === "ready"
      ? "border-rift-blue/50 bg-rift-blue/10 text-rift-bluebright"
      : "border-rift-line/50 text-rift-mutedbright/55";
  const label =
    status === "complete" ? "Done" : status === "ready" ? "Ready" : "Pending";
  return (
    <span
      className={`inline-flex items-center text-[8px] uppercase tracking-[0.25em] px-1.5 py-px border ${cls}`}
    >
      {label}
    </span>
  );
}

// Compact star-rating badge for the dashboard. Renders just the count of
// filled stars in gold so it's recognizable at a glance without taking
// much horizontal space on dense match cards.
function StarsBadge({ rating }: { rating: number }) {
  return <TeamStars rating={rating} className="text-[9px] tracking-tight" />;
}

function StreakChip({
  kind,
  count,
}: {
  kind: "W" | "L" | undefined;
  count: number;
}) {
  if (!kind || count < 2) return null;
  const isWin = kind === "W";
  const cls = isWin
    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
    : "bg-rift-red/20 text-rift-redbright border-rift-red/40";
  const label = `${kind}${count}`;
  const tooltip = isWin
    ? `Won last ${count} series`
    : `Lost last ${count} series`;
  return (
    <span
      className={`inline-flex items-center text-[8px] font-display tracking-tight px-1 py-px border shrink-0 hidden md:inline-flex ${cls}`}
      title={tooltip}
    >
      {label}
    </span>
  );
}

export function ReverseSweepTag() {
  return (
    <span
      className="inline-flex items-center text-[8px] uppercase tracking-[0.12em] px-1 py-px border border-rift-red/50 bg-rift-red/10 text-rift-redbright shrink-0"
      title="Reverse sweep — came back from 0-2 to win 3-2"
    >
      Rev Sweep
    </span>
  );
}

// Memoized: props are a stable team object (team identities never change
// within a tournament), primitives, and streak kind/count primitives — so
// rows only re-render when their own data changes.
const TeamRow = memo(function TeamRow({
  team,
  opponent,
  side,
  won,
  score,
  streakKind,
  streakCount,
}: {
  team: TournamentTeam | null;
  opponent: TournamentTeam | null;
  side: "blue" | "red";
  won: boolean;
  score: number | null;
  streakKind?: "W" | "L";
  streakCount?: number;
}) {
  const sideAccent =
    side === "blue" ? "text-rift-bluebright" : "text-rift-redbright";
  const winnerCls = won ? "text-rift-goldbright bg-rift-gold/10" : "";
  // The match-card row's left border uses the team's color when set,
  // falling back to the side default (blue/red). Inline style is the
  // only way to apply an arbitrary user-picked hex with Tailwind.
  const sideBorder =
    side === "blue" ? "border-l-rift-blue" : "border-l-rift-red";
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
      className={`flex items-center justify-between gap-2 px-2 py-1 border-l-2 ${
        team?.color ? "" : sideBorder
      } ${winnerCls} mb-0.5`}
      style={team?.color ? { borderLeftColor: team.color } : undefined}
    >
      <div className="flex items-baseline gap-1.5 min-w-0 flex-1">
        <span
          className={`text-[8px] tabular-nums shrink-0 ${
            won ? "text-rift-goldbright" : sideAccent
          }`}
        >
          {team ? team.seed : "—"}
        </span>
        {team && (
          <TeamLogoLink
            teamId={team.id}
            name={team.name}
            iconKey={team.iconKey}
            logoUrl={team.logoUrl}
            color={team.color ?? undefined}
            size={12}
            renderAs="span"
            className={`shrink-0 self-center ${
              won ? "text-rift-goldbright" : sideAccent
            }`}
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
        <span
          className={`text-[11px] md:text-xs font-display tracking-wider truncate flex-1 min-w-0 ${
            won
              ? "text-rift-goldbright"
              : team
              ? "text-rift-mutedbright"
              : "text-rift-mutedbright/50 italic"
          }`}
        >
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
        </span>
        {team && (
          <StarsBadge rating={teamStarRating(team)} />
        )}
        {team && (
          <StreakChip kind={streakKind} count={streakCount ?? 0} />
        )}
        {/* Shown for every team — including the "Balanced" default — so
            no team appears to be missing its identity tag. */}
        {team?.personalityId && (
          <span
            className="text-[8px] uppercase tracking-[0.1em] text-rift-mutedbright/50 shrink-0 hidden md:block"
            title={`${getPersonality(team.personalityId).name}: ${getPersonality(team.personalityId).description}`}
          >
            {getPersonality(team.personalityId).name}
          </span>
        )}
      </div>
      {score != null && (
        <span
          className={`text-[11px] tabular-nums font-display ${
            won ? "text-rift-goldbright" : "text-rift-mutedbright/70"
          } flex-shrink-0`}
        >
          {score}
        </span>
      )}
    </div>
  );
});

// ─── Match card ────────────────────────────────────────────────────────

// Inner memoized card. All props are reference-stable across unrelated
// state commits: `match` objects keep identity unless THEIR result/series
// changed, team objects are never replaced within a tournament, streak
// values are primitives, and the handlers are identity-stable wrappers.
// During a bulk sim this means only the card(s) whose match actually
// resolved re-render on each batched commit.
const MatchCardInner = memo(function MatchCardInner({
  match,
  blueTeam,
  redTeam,
  blueStreakKind,
  blueStreakCount,
  redStreakKind,
  redStreakCount,
  onStart,
  onView,
}: {
  match: TournamentMatch;
  blueTeam: TournamentTeam | null;
  redTeam: TournamentTeam | null;
  blueStreakKind?: "W" | "L";
  blueStreakCount?: number;
  redStreakKind?: "W" | "L";
  redStreakCount?: number;
  onStart: () => void;
  onView?: () => void;
}) {
  // Per-match auto-sim runs against the current tournament without
  // setting an active match. Always available when the match is ready.
  // Zustand action references are stable for the lifetime of the store.
  const simulateOneMatch = useDraftStore((s) => s.simulateOneMatch);
  const onSim = () => simulateOneMatch(match.id);

  const ready = blueTeam != null && redTeam != null;
  const winner = match.winner;
  const status: "pending" | "ready" | "complete" = winner
    ? "complete"
    : ready
    ? "ready"
    : "pending";

  const blueWon = winner ? winner.teamId === match.blueTeamId : false;
  const redWon = winner ? winner.teamId === match.redTeamId : false;
  const reverseSweep = winner ? isReverseSweep(match) : false;

  // Border / accent based on status — pending = muted, ready = gold,
  // complete = green-ish gold for the winning side.
  const cardBorder =
    status === "complete"
      ? "border-rift-gold/50"
      : status === "ready"
      ? "border-rift-gold/40"
      : "border-rift-line/50";

  return (
    <div
      className={`relative border ${cardBorder} bg-rift-panel/60 p-2 md:p-2.5`}
    >
      {/* Round + format badges */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5 text-[8px] uppercase tracking-[0.25em] text-rift-mutedbright/55">
          <span>{match.format.toUpperCase()}</span>
          {match.fearless && <span>· Fearless</span>}
          {reverseSweep && <ReverseSweepTag />}
        </div>
        <StatusPill status={status} />
      </div>
      {/* Teams */}
      <TeamRow
        team={blueTeam}
        opponent={redTeam}
        side="blue"
        won={blueWon}
        score={winner?.blueWins ?? null}
        streakKind={blueStreakKind}
        streakCount={blueStreakCount}
      />
      <TeamRow
        team={redTeam}
        opponent={blueTeam}
        side="red"
        won={redWon}
        score={winner?.redWins ?? null}
        streakKind={redStreakKind}
        streakCount={redStreakCount}
      />
      {/* Action buttons. Two-column: manual Start vs auto-sim. */}
      {status === "ready" && (
        <div className="grid grid-cols-[1fr_auto] gap-1.5 mt-2">
          <button
            type="button"
            onClick={onStart}
            className="py-1.5 border border-rift-gold/60 bg-rift-gold/15 text-rift-goldbright hover:bg-rift-gold/25 text-[10px] uppercase tracking-[0.3em] transition-all"
          >
            Start Match
          </button>
          <button
            type="button"
            onClick={onSim}
            title="Auto-play this match in AI vs AI"
            className="px-2.5 py-1.5 border border-rift-line text-rift-mutedbright hover:text-rift-goldbright hover:border-rift-gold/50 hover:bg-rift-gold/5 text-[10px] uppercase tracking-[0.3em] transition-all"
          >
            Sim
          </button>
        </div>
      )}
      {status === "complete" &&
        (onView ? (
          // Completed matches can open the replay modal any time — even
          // while the wider tournament is still in progress.
          <button
            type="button"
            onClick={onView}
            disabled={!match.series}
            className={`w-full mt-1.5 py-1 text-[9px] uppercase tracking-[0.3em] transition-all ${
              match.series
                ? "border border-rift-gold/40 text-rift-goldbright hover:bg-rift-gold/10"
                : "text-rift-gold/60 cursor-not-allowed"
            }`}
            title={match.series ? "View per-game results" : "No replay data"}
          >
            Final {winner!.blueWins}-{winner!.redWins}
            {match.series && (
              <span className="ml-1.5 text-rift-mutedbright/70">· View</span>
            )}
          </button>
        ) : (
          <div className="text-[9px] uppercase tracking-[0.3em] text-rift-gold/60 text-center mt-1.5">
            Final {winner!.blueWins}-{winner!.redWins}
          </div>
        ))}
    </div>
  );
});

// Thin public wrapper — keeps the existing call-site API (match +
// tournament + per-card closures) while resolving everything down to
// stable/primitive props for the memoized inner card. The wrapper itself
// re-renders with its parent (cheap: two team lookups + a WeakMap hit);
// the expensive DOM subtree only re-renders when its own props change.
export function MatchCard({
  match,
  tournament,
  onStart,
  onView,
}: {
  match: TournamentMatch;
  tournament: TournamentState;
  onStart: () => void;
  // Optional review handler. When supplied and the match is complete,
  // the final score becomes a button that opens the replay modal.
  onView?: () => void;
}) {
  const blueTeam = getTeam(tournament, match.blueTeamId);
  const redTeam = getTeam(tournament, match.redTeamId);
  // Shared per-tournament streak map (see teamStreaksFor) — no longer
  // recomputed per card.
  const streaks = teamStreaksFor(tournament);
  const blueStreak = match.blueTeamId ? streaks[match.blueTeamId] : undefined;
  const redStreak = match.redTeamId ? streaks[match.redTeamId] : undefined;
  const stableStart = useStableHandler(onStart);
  const stableView = useStableHandler(onView);
  return (
    <MatchCardInner
      match={match}
      blueTeam={blueTeam}
      redTeam={redTeam}
      blueStreakKind={blueStreak?.kind}
      blueStreakCount={blueStreak?.count}
      redStreakKind={redStreak?.kind}
      redStreakCount={redStreak?.count}
      onStart={stableStart}
      onView={onView ? stableView : undefined}
    />
  );
}
