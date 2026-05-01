"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import {
  Area,
  ComposedChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { syntheticDamage } from "@/lib/sim/descriptions";
import { getChampionMeta } from "@/lib/championMeta";
import { useDraftStore } from "@/store/draftStore";
import {
  computeChampionAttribution,
  computeChampionStats,
  computeGroupStandings,
  computeStandings,
  computeSwissStandings,
  computeTeamBreakdown,
  computeTournamentChampionWR,
  computeTournamentSummary,
  encodeTournament,
  getMatch,
  getTeam,
  matchesByRound,
  playoffBracketKindFor,
  tournamentChampion,
  type ChampionAttribution,
  type ChampionStat,
  type TeamStanding,
  type TournamentMatch,
  type TournamentState,
  type TournamentSummary,
  type TournamentTeam,
} from "@/lib/tournament";
import {
  getMetaTier,
  TIER_ORDER,
  TIER_VALUE,
  type MetaTier,
} from "@/lib/championMeta";
import type {
  AIDifficulty,
  Champion,
  DraftMode,
  GameDraft,
  GameRecap,
  Lane,
  SeriesFormat,
  Side,
} from "@/lib/types";
import Modal from "./Modal";
import MetaPanel from "./MetaPanel";
import LaneIcon from "./LaneIcon";
import TeamIcon from "./TeamIcon";

// ─── Per-match override state ─────────────────────────────────────────
// When a user clicks "Start Match" on a pending match we open an inline
// override modal that lets them change the format/mode/fearless/aiSide
// for THIS match only (the match record's settings, not the tournament
// defaults). Confirm starts the match with the overrides applied.
interface MatchOverride {
  format: SeriesFormat;
  fearless: boolean;
  mode: DraftMode;
  aiSide: Side | null;
  aiDifficulty: AIDifficulty;
}

// Top-level dashboard: header (tournament name + status), bracket view,
// and exit affordance. The bracket view delegates per-match rendering to
// MatchCard. Clicking a pending match opens the existing draft flow via
// the store's startMatch action; routing back to the dashboard happens
// when the match's series is cleared in finishMatch.

export default function TournamentDashboard() {
  const tournament = useDraftStore((s) => s.tournament)!;
  const startMatch = useDraftStore((s) => s.startMatch);
  const exitTournament = useDraftStore((s) => s.exitTournament);
  const simulateAllRemaining = useDraftStore((s) => s.simulateAllRemaining);
  const simulating = useDraftStore((s) => s.simulating);
  const [exitOpen, setExitOpen] = useState(false);
  // Match the user is configuring before launching. null = no modal open.
  const [pendingMatchId, setPendingMatchId] = useState<string | null>(null);
  // Match the user is reviewing post-tournament. null = no modal open.
  // Set when a completed MatchCard is clicked once the tournament status
  // is "complete". Distinct from pendingMatchId — that one starts a match.
  const [viewMatchId, setViewMatchId] = useState<string | null>(null);
  // Confirm modal for the simulate-all action — destructive in spirit
  // (it skips all human draft input for the rest of the tournament).
  const [simAllOpen, setSimAllOpen] = useState(false);
  // Transient export feedback ("Copied!" / error).
  const [exportFeedback, setExportFeedback] = useState<string | null>(null);
  // Save modal — opens with the encoded TOUR1: code displayed in a
  // textarea so the user can copy it manually if clipboard write fails.
  const [saveOpen, setSaveOpen] = useState(false);
  const [savedCode, setSavedCode] = useState<string | null>(null);
  const [savePending, setSavePending] = useState(false);

  const handleExport = async () => {
    setSavePending(true);
    setSaveOpen(true);
    try {
      const code = await encodeTournament(tournament);
      setSavedCode(code);
      // Try clipboard auto-copy as a convenience. If it fails (insecure
      // context, permission), the textarea fallback handles it.
      try {
        await navigator.clipboard.writeText(code);
        setExportFeedback("Copied to clipboard");
      } catch {
        setExportFeedback(null);
      }
    } catch (e) {
      setSavedCode(null);
      setExportFeedback(
        e instanceof Error ? `Save failed: ${e.message}` : "Save failed",
      );
    }
    setSavePending(false);
    setTimeout(() => setExportFeedback(null), 2500);
  };

  const champion = tournamentChampion(tournament);
  const rounds = matchesByRound(tournament);
  const totalRounds = rounds.length;
  const pendingMatch = pendingMatchId
    ? tournament.matches.find((m) => m.id === pendingMatchId) ?? null
    : null;
  const viewMatch = viewMatchId
    ? tournament.matches.find((m) => m.id === viewMatchId) ?? null
    : null;
  // Replay click-through is available only post-tournament. Mid-event
  // we'd be exposing in-progress series state via a read-only modal,
  // which conflicts with the live "start match" affordance on the same
  // card. Keep them mutually exclusive.
  const reviewMode = tournament.status === "complete";
  const handleViewMatch = (id: string) => setViewMatchId(id);

  return (
    <div className="min-h-screen px-4 py-8 md:py-10 overflow-x-hidden relative">
      {simulating && <SimulatingOverlay scope={simulating} />}
      {/* Exit hatch — top-left, behind a confirm so users don't lose state */}
      <button
        type="button"
        onClick={() => setExitOpen(true)}
        className="fixed top-3 left-3 md:top-4 md:left-4 inline-flex items-center gap-1.5 px-2.5 md:px-3 py-1.5 border border-rift-line text-rift-mutedbright hover:text-rift-goldbright hover:border-rift-gold/50 hover:bg-rift-gold/5 transition-all text-[9px] md:text-[10px] uppercase tracking-[0.3em] z-30"
      >
        <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M9 3l-5 5 5 5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 8h10" strokeLinecap="round" />
        </svg>
        Main Menu
      </button>

      {/* Export tournament — top-right. Copies a TOUR1: code to the
          clipboard so the user can share/reload the tournament state.
          Also hosts the spectator "Simulate Remaining" affordance when
          the tournament is in-progress. */}
      <div className="fixed top-3 right-3 md:top-4 md:right-4 flex items-center gap-2 z-30">
        {exportFeedback && (
          <span className="text-[9px] md:text-[10px] uppercase tracking-[0.25em] text-rift-goldbright">
            {exportFeedback}
          </span>
        )}
        {tournament.status !== "complete" && (
          <button
            type="button"
            onClick={() => setSimAllOpen(true)}
            className="inline-flex items-center gap-1.5 px-2.5 md:px-3 py-1.5 border border-rift-gold/60 text-rift-goldbright hover:bg-rift-gold/10 hover:border-rift-gold transition-all text-[9px] md:text-[10px] uppercase tracking-[0.3em]"
            title="Auto-play every remaining match in AI vs AI"
          >
            <svg
              viewBox="0 0 16 16"
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden
            >
              <path d="M5 3l7 5-7 5V3z" strokeLinejoin="round" />
            </svg>
            Sim All
          </button>
        )}
        <button
          type="button"
          onClick={handleExport}
          className="inline-flex items-center gap-1.5 px-2.5 md:px-3 py-1.5 border border-rift-line text-rift-mutedbright hover:text-rift-goldbright hover:border-rift-gold/50 hover:bg-rift-gold/5 transition-all text-[9px] md:text-[10px] uppercase tracking-[0.3em]"
          title="Save the tournament — copy a code you can paste later to resume from this exact state"
        >
          <svg
            viewBox="0 0 16 16"
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            aria-hidden
          >
            <path d="M3 3v10h10V5l-2-2H3z" strokeLinejoin="round" />
            <path d="M5 3v3h5V3" strokeLinejoin="round" />
            <rect x="5" y="9" width="6" height="4" />
          </svg>
          Save
        </button>
      </div>

      <div className="max-w-7xl mx-auto">
        <Header tournament={tournament} champion={champion} totalRounds={totalRounds} />

        {/* Post-tournament aggregates — only render once status is
            complete. Headline summary, presence/win-rate tables, plus
            tier list / synergy lookups so the user can review what the
            tournament looked like alongside the meta the AI used. */}
        {tournament.status === "complete" && (
          <>
            <PostTournamentRecap tournament={tournament} />
            <div className="mb-6 md:mb-8">
              <div className="text-[10px] uppercase tracking-[0.4em] text-rift-gold/70 mb-2">
                Meta Reference
              </div>
              <MetaPanel variant="view-only" />
            </div>
          </>
        )}

        {/* Live in-tournament meta — visible while the tournament is
            in-progress as soon as at least one game has resolved. Lets
            the user watch how the AI's evolving meta is shaping draft
            decisions. Hidden once the tournament is complete (the post-
            tournament recap covers that surface in more detail). */}
        {tournament.status !== "complete" && (
          <LiveChampionMetaPanel tournament={tournament} />
        )}

        {/* Format-specific layout: round-robin gets a standings table on
            top + a flat match list below. Single-elim keeps the bracket
            tree. Double-elim renders winners + losers + grand-final
            stacked. */}
        {tournament.format === "round-robin" ||
        tournament.format === "round-robin-playoffs" ? (
          <RoundRobinView
            tournament={tournament}
            rounds={rounds}
            reviewMode={reviewMode}
            onStartMatch={(id) => setPendingMatchId(id)}
            onViewMatch={handleViewMatch}
          />
        ) : tournament.format === "groups-playoffs" ||
          tournament.format === "groups-playoffs-de" ? (
          <GroupsPlayoffsView
            tournament={tournament}
            rounds={rounds}
            reviewMode={reviewMode}
            onStartMatch={(id) => setPendingMatchId(id)}
            onViewMatch={handleViewMatch}
          />
        ) : tournament.format === "swiss" ||
          tournament.format === "swiss-playoffs" ||
          tournament.format === "swiss-playoffs-de" ? (
          <SwissView
            tournament={tournament}
            rounds={rounds}
            reviewMode={reviewMode}
            onStartMatch={(id) => setPendingMatchId(id)}
            onViewMatch={handleViewMatch}
          />
        ) : tournament.format === "double-elim" ? (
          <DoubleElimView
            tournament={tournament}
            onStartMatch={(id) => setPendingMatchId(id)}
            onViewMatch={reviewMode ? handleViewMatch : undefined}
          />
        ) : (
          <div className="overflow-x-auto pb-4">
            <div
              className="inline-flex items-stretch gap-4 md:gap-6 min-w-full"
              style={{ minWidth: `${totalRounds * 220}px` }}
            >
              {rounds.map((roundMatches, roundIdx) => (
                <RoundColumn
                  key={roundIdx}
                  round={roundIdx + 1}
                  totalRounds={totalRounds}
                  matches={roundMatches}
                  tournament={tournament}
                  onStartMatch={(id) => setPendingMatchId(id)}
                  onViewMatch={reviewMode ? handleViewMatch : undefined}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <Modal
        open={exitOpen}
        title="Exit Tournament?"
        message="The current tournament progress will be lost. Are you sure?"
        confirmLabel="Exit"
        cancelLabel="Stay"
        tone="danger"
        onConfirm={() => {
          setExitOpen(false);
          exitTournament();
        }}
        onCancel={() => setExitOpen(false)}
      />

      <Modal
        open={simAllOpen}
        title="Simulate Remaining Matches?"
        message="Every pending match will be auto-played in AI vs AI mode. The bracket will jump to its final state. This cannot be undone."
        confirmLabel="Simulate"
        cancelLabel="Cancel"
        tone="default"
        onConfirm={() => {
          setSimAllOpen(false);
          simulateAllRemaining();
        }}
        onCancel={() => setSimAllOpen(false)}
      />

      {pendingMatch && (
        <MatchOverrideModal
          match={pendingMatch}
          tournament={tournament}
          onCancel={() => setPendingMatchId(null)}
          onStart={(overrides) => {
            setPendingMatchId(null);
            startMatch(pendingMatch.id, overrides);
          }}
        />
      )}

      {viewMatch && (
        <MatchReplayModal
          match={viewMatch}
          tournament={tournament}
          onClose={() => setViewMatchId(null)}
        />
      )}

      {saveOpen && (
        <SaveTournamentModal
          code={savedCode}
          pending={savePending}
          feedback={exportFeedback}
          onCopy={async () => {
            if (!savedCode) return;
            try {
              await navigator.clipboard.writeText(savedCode);
              setExportFeedback("Copied to clipboard");
              setTimeout(() => setExportFeedback(null), 2500);
            } catch {
              setExportFeedback("Clipboard blocked — select & copy manually");
              setTimeout(() => setExportFeedback(null), 4000);
            }
          }}
          onClose={() => setSaveOpen(false)}
        />
      )}
    </div>
  );
}

// Save-tournament modal: shows the encoded TOUR1: code in a textarea so
// the user can copy it (auto-copy attempted on open). The same code can
// be pasted into the entry-menu Import flow to resume from this exact
// state — bracket position, per-match results, in-flight series.
function SaveTournamentModal({
  code,
  pending,
  feedback,
  onCopy,
  onClose,
}: {
  code: string | null;
  pending: boolean;
  feedback: string | null;
  onCopy: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl border-2 border-rift-gold/60 bg-rift-panel p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between mb-2">
          <div>
            <div className="text-[10px] uppercase tracking-[0.4em] text-rift-gold/70">
              Save Tournament
            </div>
            <h2 className="font-display text-xl tracking-wider text-rift-goldbright">
              Tournament Code
            </h2>
          </div>
          {feedback && (
            <span className="text-[9px] uppercase tracking-[0.3em] text-rift-goldbright">
              {feedback}
            </span>
          )}
        </div>
        <p className="text-[10px] text-rift-mutedbright/75 mb-3 leading-relaxed">
          Copy this code to save the tournament — including the active match
          and any in-flight series. Paste it on the entry menu&rsquo;s{" "}
          <span className="text-rift-goldbright">Import Tournament Code</span>{" "}
          to resume.
        </p>
        <textarea
          readOnly
          value={pending ? "Generating…" : code ?? ""}
          onClick={(e) => e.currentTarget.select()}
          className="w-full h-32 bg-rift-bg/60 border border-rift-line text-rift-mutedbright text-xs font-mono p-2 outline-none focus:border-rift-gold/60 resize-none"
        />
        <div className="flex justify-end gap-2 mt-3">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 border border-rift-line text-rift-mutedbright text-[10px] uppercase tracking-[0.3em] hover:text-rift-goldbright hover:border-rift-gold/50 transition-all"
          >
            Close
          </button>
          <button
            type="button"
            onClick={onCopy}
            disabled={pending || !code}
            className="px-4 py-1.5 border border-rift-gold/70 bg-rift-gold/15 text-rift-goldbright text-[10px] uppercase tracking-[0.3em] hover:bg-rift-gold/25 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            Copy
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Header ────────────────────────────────────────────────────────────

function Header({
  tournament,
  champion,
  totalRounds,
}: {
  tournament: TournamentState;
  champion: TournamentTeam | null;
  totalRounds: number;
}) {
  const completed = tournament.matches.filter((m) => m.winner).length;
  const total = tournament.matches.length;
  const crownRef = useRef<HTMLDivElement | null>(null);

  // Animate the crown banner on mount when a champion is set. Scoped via
  // gsap.context so multiple dashboard mounts don't double-animate.
  // Tweens: flash + scale-in for the wreath, glow pulse for the border,
  // and a stagger for the inner text. Honors prefers-reduced-motion via
  // GSAP's matchMedia for accessibility.
  useEffect(() => {
    if (!champion || !crownRef.current) return;
    const ctx = gsap.context(() => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const tl = gsap.timeline();
        tl.from(crownRef.current, {
          scale: 0.6,
          opacity: 0,
          duration: 0.55,
          ease: "back.out(1.7)",
        })
          .from(
            ".crown-label",
            { y: -8, opacity: 0, duration: 0.35, ease: "power2.out" },
            "-=0.2",
          )
          .from(
            ".crown-name",
            { y: 8, opacity: 0, duration: 0.4, ease: "power2.out" },
            "<",
          )
          .to(
            crownRef.current,
            {
              boxShadow:
                "0 0 30px rgba(240, 200, 100, 0.55), 0 0 60px rgba(240, 200, 100, 0.25)",
              duration: 0.8,
              repeat: 2,
              yoyo: true,
              ease: "sine.inOut",
            },
            "-=0.1",
          );
      });
      // Reduced-motion: just fade in.
      mm.add("(prefers-reduced-motion: reduce)", () => {
        gsap.from(crownRef.current, { opacity: 0, duration: 0.3 });
      });
    }, crownRef);
    return () => ctx.revert();
  }, [champion]);

  return (
    <div className="text-center mb-6 md:mb-8">
      <div className="text-[10px] md:text-xs uppercase tracking-[0.5em] text-rift-gold/70">
        {formatHeaderLabel(tournament.format)}
        {" · "}
        {tournament.teams.length} Teams · {totalRounds} Round{totalRounds > 1 ? "s" : ""}
      </div>
      <h1 className="font-display text-3xl md:text-5xl tracking-[0.15em] text-rift-goldbright mt-2 truncate">
        {tournament.name}
      </h1>
      {champion ? (
        <div
          ref={crownRef}
          className="mt-3 inline-flex items-center gap-3 px-5 py-2.5 border-2 border-rift-gold bg-rift-gold/10 shadow-glow-gold relative"
        >
          {/* Decorative laurel marks — pure typography so no asset cost */}
          <span aria-hidden className="text-rift-gold/70 text-base">
            &#x2766;
          </span>
          <span className="crown-label text-[9px] uppercase tracking-[0.4em] text-rift-gold/80">
            Champion
          </span>
          <span className="crown-name font-display text-lg md:text-2xl text-rift-goldbright tracking-wider">
            {champion.name}
          </span>
          <span aria-hidden className="text-rift-gold/70 text-base">
            &#x2766;
          </span>
        </div>
      ) : (
        <div className="text-[10px] md:text-xs uppercase tracking-[0.3em] text-rift-mutedbright/70 mt-2">
          {completed}/{total} matches complete
        </div>
      )}
    </div>
  );
}

// ─── Round column ──────────────────────────────────────────────────────

function RoundColumn({
  round,
  totalRounds,
  matches,
  tournament,
  onStartMatch,
  onViewMatch,
}: {
  round: number;
  totalRounds: number;
  matches: TournamentMatch[];
  tournament: TournamentState;
  onStartMatch: (matchId: string) => void;
  onViewMatch?: (matchId: string) => void;
}) {
  const roundLabel =
    round === totalRounds
      ? "Final"
      : round === totalRounds - 1
      ? "Semifinals"
      : round === totalRounds - 2
      ? "Quarterfinals"
      : `Round ${round}`;
  return (
    <div className="flex-1 min-w-[200px] md:min-w-[220px] flex flex-col">
      <div className="text-[9px] md:text-[10px] uppercase tracking-[0.4em] text-rift-gold/55 text-center mb-3">
        {roundLabel}
      </div>
      <div
        className="flex-1 flex flex-col gap-3 md:gap-4 justify-around"
      >
        {matches.map((m) => (
          <MatchCard
            key={m.id}
            match={m}
            tournament={tournament}
            onStart={() => onStartMatch(m.id)}
            onView={onViewMatch ? () => onViewMatch(m.id) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Double-elim view ──────────────────────────────────────────────────
// Stacks the winners bracket on top, losers bracket below, and the
// grand-final card at the bottom. Each bracket is its own horizontal
// scroller so the rounds align column-wise within their own scope.
function DoubleElimView({
  tournament,
  onStartMatch,
  onViewMatch,
}: {
  tournament: TournamentState;
  onStartMatch: (matchId: string) => void;
  onViewMatch?: (matchId: string) => void;
}) {
  const winners = tournament.matches.filter((m) => m.bracket === "winners");
  const losers = tournament.matches.filter((m) => m.bracket === "losers");
  const grandFinal =
    tournament.matches.find((m) => m.bracket === "grand-final") ?? null;
  const grandFinalReset =
    tournament.matches.find((m) => m.bracket === "grand-final-reset") ?? null;
  const groupByRound = (matches: TournamentMatch[]): TournamentMatch[][] => {
    const max = matches.reduce((acc, m) => Math.max(acc, m.round), 0);
    const rounds: TournamentMatch[][] = [];
    for (let r = 1; r <= max; r++) {
      const inRound = matches.filter((m) => m.round === r);
      if (inRound.length > 0) rounds.push(inRound);
    }
    return rounds;
  };
  const winnersByRound = groupByRound(winners);
  const losersByRound = groupByRound(losers);
  const wTotal = winnersByRound.length;
  const lTotal = losersByRound.length;
  return (
    <div className="space-y-6">
      <div>
        <div className="text-[10px] uppercase tracking-[0.4em] text-rift-gold/70 mb-2">
          Winners Bracket
        </div>
        <div className="overflow-x-auto pb-2">
          <div
            className="inline-flex items-stretch gap-4 md:gap-6 min-w-full"
            style={{ minWidth: `${wTotal * 220}px` }}
          >
            {winnersByRound.map((roundMatches, idx) => (
              <RoundColumn
                key={idx}
                round={idx + 1}
                totalRounds={wTotal}
                matches={roundMatches}
                tournament={tournament}
                onStartMatch={onStartMatch}
                onViewMatch={onViewMatch}
              />
            ))}
          </div>
        </div>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-[0.4em] text-rift-redbright/65 mb-2">
          Losers Bracket
        </div>
        <div className="overflow-x-auto pb-2">
          <div
            className="inline-flex items-stretch gap-4 md:gap-6 min-w-full"
            style={{ minWidth: `${lTotal * 220}px` }}
          >
            {losersByRound.map((roundMatches, idx) => (
              <LosersRoundColumn
                key={idx}
                round={idx + 1}
                totalRounds={lTotal}
                matches={roundMatches}
                tournament={tournament}
                onStartMatch={onStartMatch}
                onViewMatch={onViewMatch}
              />
            ))}
          </div>
        </div>
      </div>

      {grandFinal && (
        <div>
          <div className="text-[10px] uppercase tracking-[0.4em] text-rift-gold mb-2">
            Grand Final
          </div>
          <div className="max-w-md">
            <MatchCard
              match={grandFinal}
              tournament={tournament}
              onStart={() => onStartMatch(grandFinal.id)}
              onView={
                onViewMatch ? () => onViewMatch(grandFinal.id) : undefined
              }
            />
          </div>
          {!grandFinalReset && (
            <div className="text-[8px] uppercase tracking-[0.3em] text-rift-mutedbright/40 mt-1">
              W-side wins outright. L-side win forces a bracket reset.
            </div>
          )}
        </div>
      )}

      {grandFinalReset && (
        <div>
          <div className="text-[10px] uppercase tracking-[0.4em] text-rift-gold mb-2">
            Grand Final · Reset
          </div>
          <div className="max-w-md">
            <MatchCard
              match={grandFinalReset}
              tournament={tournament}
              onStart={() => onStartMatch(grandFinalReset.id)}
              onView={
                onViewMatch ? () => onViewMatch(grandFinalReset.id) : undefined
              }
            />
          </div>
          <div className="text-[8px] uppercase tracking-[0.3em] text-rift-gold/60 mt-1">
            L-side forced a reset — this match decides the tournament.
          </div>
        </div>
      )}
    </div>
  );
}

// Losers-bracket round labels differ from W-side. R1 is "Losers R1",
// terminal round is "Losers Final", penultimate is "Losers Semifinal".
function LosersRoundColumn({
  round,
  totalRounds,
  matches,
  tournament,
  onStartMatch,
  onViewMatch,
}: {
  round: number;
  totalRounds: number;
  matches: TournamentMatch[];
  tournament: TournamentState;
  onStartMatch: (matchId: string) => void;
  onViewMatch?: (matchId: string) => void;
}) {
  const roundLabel =
    round === totalRounds
      ? "Losers Final"
      : round === totalRounds - 1
      ? "Losers Semi"
      : `Losers R${round}`;
  return (
    <div className="flex-1 min-w-[200px] md:min-w-[220px] flex flex-col">
      <div className="text-[9px] md:text-[10px] uppercase tracking-[0.4em] text-rift-redbright/55 text-center mb-3">
        {roundLabel}
      </div>
      <div className="flex-1 flex flex-col gap-3 md:gap-4 justify-around">
        {matches.map((m) => (
          <MatchCard
            key={m.id}
            match={m}
            tournament={tournament}
            onStart={() => onStartMatch(m.id)}
            onView={onViewMatch ? () => onViewMatch(m.id) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Match card ────────────────────────────────────────────────────────

function MatchCard({
  match,
  tournament,
  onStart,
  onView,
}: {
  match: TournamentMatch;
  tournament: TournamentState;
  onStart: () => void;
  // Optional review-mode handler. When supplied and the match is
  // complete, the whole card becomes clickable to open the replay
  // modal. Undefined = no replay button (dashboard during play).
  onView?: () => void;
}) {
  // Per-match auto-sim runs against the current tournament without
  // setting an active match. Always available when the match is ready.
  const simulateOneMatch = useDraftStore((s) => s.simulateOneMatch);
  const onSim = () => simulateOneMatch(match.id);
  const blueTeam = getTeam(tournament, match.blueTeamId);
  const redTeam = getTeam(tournament, match.redTeamId);
  const ready = blueTeam != null && redTeam != null;
  const winner = match.winner;
  const status: "pending" | "ready" | "complete" = winner
    ? "complete"
    : ready
    ? "ready"
    : "pending";

  const blueWon = winner ? winner.teamId === match.blueTeamId : false;
  const redWon = winner ? winner.teamId === match.redTeamId : false;

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
        </div>
        <StatusPill status={status} />
      </div>
      {/* Teams */}
      <TeamRow
        team={blueTeam}
        side="blue"
        won={blueWon}
        score={winner?.blueWins ?? null}
      />
      <TeamRow
        team={redTeam}
        side="red"
        won={redWon}
        score={winner?.redWins ?? null}
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
          // When a view handler is supplied (post-tournament), make the
          // final-score line a button that opens the replay modal.
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
}

function TeamRow({
  team,
  side,
  won,
  score,
}: {
  team: TournamentTeam | null;
  side: "blue" | "red";
  won: boolean;
  score: number | null;
}) {
  const sideAccent =
    side === "blue" ? "text-rift-bluebright" : "text-rift-redbright";
  const winnerCls = won ? "text-rift-goldbright bg-rift-gold/10" : "";
  // The match-card row's left border uses the team's color when set,
  // falling back to the side default (blue/red). Inline style is the
  // only way to apply an arbitrary user-picked hex with Tailwind.
  const sideBorder =
    side === "blue" ? "border-l-rift-blue" : "border-l-rift-red";
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
          <span
            className={`shrink-0 self-center ${
              won ? "text-rift-goldbright" : sideAccent
            }`}
            style={team.color ? { color: team.color } : undefined}
          >
            <TeamIcon
              iconKey={team.iconKey}
              size={12}
              // Icon stays in the team's brand color regardless of
              // win/lose. Name + score still go gold for the winner;
              // the icon is a stable identity mark.
              color={team.color ?? undefined}
            />
          </span>
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
          {team?.name ?? "TBD"}
        </span>
        {team && (
          <StarsBadge rating={team.starRating ?? 3} />
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
}

// ─── Match override modal (Phase 2.3) ────────────────────────────────
// Inline modal that appears when the user clicks "Start Match". Lets
// them override the match's format / mode / fearless / aiSide /
// difficulty for THIS match only. Defaults are seeded from the match
// record (which inherits from tournament defaults at creation).
//
// Built with createPortal-free overlay so it doesn't conflict with the
// confirm-modal portal usage. Click backdrop or "Start Default" to
// proceed without any overrides.
// Read-only replay of a completed tournament match. Renders a tab-strip
// for each game in the series and per-game panels showing both sides'
// bans, picks (with role icons), final winner, and any recap details
// captured at sim time (MVP champion + biggest swing event).
//
// The series may not have been preserved (e.g. legacy persisted state
// from before match.series was kept post-completion). The dashboard
// guards on `match.series` before rendering the modal, so this component
// can assume series is present — but we still defend with a fallback.
function MatchReplayModal({
  match,
  tournament,
  onClose,
}: {
  match: TournamentMatch;
  tournament: TournamentState;
  onClose: () => void;
}) {
  const champions = useDraftStore((s) => s.champions);
  const byId = useMemo(
    () => new Map(champions.map((c) => [c.id, c])),
    [champions],
  );
  const [activeGameIdx, setActiveGameIdx] = useState(0);

  const blueTeam = getTeam(tournament, match.blueTeamId);
  const redTeam = getTeam(tournament, match.redTeamId);
  const series = match.series;

  // Esc-to-close + body-scroll-lock — same pattern Modal uses, kept
  // local because this modal has its own multi-panel layout that doesn't
  // fit Modal's confirm/cancel shape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  if (!series) return null;
  const games = series.games;
  const game = games[activeGameIdx] ?? games[0];
  const winnerLabel =
    match.winner?.teamId === match.blueTeamId
      ? blueTeam?.name ?? "Blue"
      : match.winner?.teamId === match.redTeamId
      ? redTeam?.name ?? "Red"
      : "—";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-2 py-4 bg-black/75 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl max-h-[92vh] overflow-y-auto border-2 border-rift-gold/50 bg-rift-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center text-rift-mutedbright hover:text-rift-goldbright text-lg leading-none"
        >
          ×
        </button>
        {/* Header */}
        <div className="px-4 md:px-5 py-3 md:py-4 border-b border-rift-line/50">
          <div className="text-[9px] uppercase tracking-[0.4em] text-rift-gold/70 mb-1">
            Match Replay · {match.format.toUpperCase()}
            {match.fearless && " · Fearless"}
          </div>
          <div className="flex items-baseline gap-3 flex-wrap">
            <span
              className={`font-display text-lg md:text-xl tracking-wider ${
                match.winner?.teamId === match.blueTeamId
                  ? "text-rift-goldbright"
                  : "text-rift-bluebright"
              }`}
            >
              {blueTeam?.name ?? "Blue"}
            </span>
            <span className="text-rift-mutedbright/60 text-sm tabular-nums">
              {match.winner?.blueWins ?? 0}-{match.winner?.redWins ?? 0}
            </span>
            <span
              className={`font-display text-lg md:text-xl tracking-wider ${
                match.winner?.teamId === match.redTeamId
                  ? "text-rift-goldbright"
                  : "text-rift-redbright"
              }`}
            >
              {redTeam?.name ?? "Red"}
            </span>
            <span className="text-[10px] uppercase tracking-[0.3em] text-rift-mutedbright/60 ml-auto">
              Winner: <span className="text-rift-goldbright">{winnerLabel}</span>
            </span>
          </div>
        </div>

        {/* Game tab strip — only when more than one game played. */}
        {games.length > 1 && (
          <div className="px-4 md:px-5 py-2 border-b border-rift-line/40 flex flex-wrap gap-1.5">
            {games.map((g, i) => {
              const isActive = i === activeGameIdx;
              const winnerSide = g.winner;
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setActiveGameIdx(i)}
                  className={`px-3 py-1 text-[10px] uppercase tracking-[0.3em] border transition-all ${
                    isActive
                      ? "border-rift-gold bg-rift-gold/10 text-rift-goldbright"
                      : "border-rift-line text-rift-mutedbright hover:border-rift-gold/50 hover:bg-rift-gold/5"
                  }`}
                >
                  Game {i + 1}
                  {winnerSide && (
                    <span
                      className={`ml-1.5 ${
                        winnerSide === "blue"
                          ? "text-rift-bluebright"
                          : "text-rift-redbright"
                      }`}
                    >
                      ({winnerSide === "blue" ? "B" : "R"})
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Per-game body. Sides may have swapped between games (loser-
            takes-blue rule), so we use the GAME's own blue/red team
            names for labels, not the match-level slots. */}
        <div className="px-4 md:px-5 py-3 md:py-4">
          <ReplayGamePanel
            game={game}
            blueTeamName={game.blueTeam || blueTeam?.name || "Blue"}
            redTeamName={game.redTeam || redTeam?.name || "Red"}
            sidesSwapped={
              activeGameIdx > 0 &&
              games[0].blueTeam !== game.blueTeam &&
              !!game.blueTeam &&
              !!games[0].blueTeam
            }
            byId={byId}
          />
        </div>
      </div>
    </div>
  );
}

function ReplayGamePanel({
  game,
  blueTeamName,
  redTeamName,
  sidesSwapped,
  byId,
}: {
  game: GameDraft;
  blueTeamName: string;
  redTeamName: string;
  sidesSwapped: boolean;
  byId: Map<number, Champion>;
}) {
  const winnerSide = game.winner;
  const recap = game.recap;
  const mvp = recap?.mvp;
  const mvpChampion = mvp ? byId.get(mvp.championId) ?? null : null;
  return (
    <div className="space-y-4">
      {/* Game-level header (winner + duration) */}
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <div className="text-[10px] uppercase tracking-[0.35em] text-rift-mutedbright/65 flex items-baseline gap-2">
          <span>Game {game.gameNumber}</span>
          {sidesSwapped && (
            <span className="text-[8px] tracking-[0.3em] text-rift-gold/70 normal-case">
              ↔ Sides swapped
            </span>
          )}
        </div>
        {winnerSide ? (
          <div className="text-[10px] uppercase tracking-[0.3em]">
            Winner:{" "}
            <span
              className={
                winnerSide === "blue"
                  ? "text-rift-bluebright"
                  : "text-rift-redbright"
              }
            >
              {winnerSide === "blue" ? blueTeamName : redTeamName}
            </span>
            {recap?.durationMinutes != null && (
              <span className="text-rift-mutedbright/60 ml-2">
                · {Math.round(recap.durationMinutes)} min
              </span>
            )}
          </div>
        ) : (
          <div className="text-[10px] uppercase tracking-[0.3em] text-rift-mutedbright/60">
            No winner recorded
          </div>
        )}
      </div>

      {/* Bans row, both sides side-by-side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
        <BanRow
          side="blue"
          label={blueTeamName}
          bans={game.blueBans}
          byId={byId}
        />
        <BanRow
          side="red"
          label={redTeamName}
          bans={game.redBans}
          byId={byId}
        />
      </div>

      {/* Picks side-by-side with roles + per-lane gold diff + KDA.
          The diff is signed from BLUE's perspective; we negate when
          rendering on the red side so each pick reads "+/- gold for me".
          KDA pulls from recap.perPickKDA which mirrors the positional
          lane order. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
        <PickColumn
          side="blue"
          label={blueTeamName}
          picks={game.bluePicks}
          roles={game.blueRoles}
          byId={byId}
          isWinner={winnerSide === "blue"}
          laneGoldDiff={recap?.laneGoldDiff}
          perPickKDA={recap?.perPickKDA?.blue}
        />
        <PickColumn
          side="red"
          label={redTeamName}
          picks={game.redPicks}
          roles={game.redRoles}
          byId={byId}
          isWinner={winnerSide === "red"}
          laneGoldDiff={recap?.laneGoldDiff}
          perPickKDA={recap?.perPickKDA?.red}
        />
      </div>

      {/* Win-probability sparkline. Renders only when the recap has a
          timeline (sim-resolved games). Step area chart anchored at 50%
          start so the user can read the game's tempo. */}
      {recap?.winProbTimeline && recap.winProbTimeline.length > 1 && (
        <WinProbChart
          timeline={recap.winProbTimeline}
          events={recap.notableEvents ?? []}
          biggestSwing={recap.biggestSwing}
        />
      )}

      {/* Gold-lead sparkline. Mirrors the live chart in BetweenGamesView
          using the recap's persisted goldLeadTimeline (signed, blue-
          positive). Renders only when the timeline is present (sim-
          resolved games on a recent build; legacy recaps lack it). */}
      {recap?.goldLeadTimeline && recap.goldLeadTimeline.length > 1 && (
        <GoldLeadChart
          timeline={recap.goldLeadTimeline}
          notableEvents={recap.notableEvents ?? []}
          blueTeam={blueTeamName}
          redTeam={redTeamName}
        />
      )}

      {/* Damage-dealt bars synthesized from KDA + champion archetype.
          Renders only when per-pick KDA is in the recap. */}
      {recap?.perPickKDA && (
        <DamageBars
          game={game}
          perPickKDA={recap.perPickKDA}
          byId={byId}
        />
      )}

      {/* Recap details — only when a sim recap was attached. Manual
          winner declarations leave recap unset. */}
      {recap && (
        <div className="border border-rift-line/40 bg-rift-bg/40 px-3 py-2.5 space-y-2">
          {mvp && mvpChampion && (
            <div className="flex items-center gap-2 text-[11px]">
              <img
                src={mvpChampion.iconUrl}
                alt={mvpChampion.name}
                className="w-7 h-7 border border-rift-gold/60"
              />
              <div className="min-w-0">
                <div className="text-[9px] uppercase tracking-[0.3em] text-rift-gold/70">
                  Game MVP
                </div>
                <div className="font-display tracking-wider text-rift-goldbright">
                  {mvpChampion.name}
                  <span className="ml-2 text-rift-mutedbright/70 font-sans tabular-nums">
                    {mvp.kills}/{mvp.deaths}/{mvp.assists}
                  </span>
                </div>
              </div>
            </div>
          )}
          {recap.biggestSwing && (
            <div className="text-[11px]">
              <div className="text-[9px] uppercase tracking-[0.3em] text-rift-gold/70">
                Biggest Swing · @ {Math.round(recap.biggestSwing.minute)} min
              </div>
              <div className="text-rift-mutedbright">
                {recap.biggestSwing.description}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BanRow({
  side,
  label,
  bans,
  byId,
}: {
  side: Side;
  label: string;
  bans: (number | null)[];
  byId: Map<number, Champion>;
}) {
  const sideAccent =
    side === "blue" ? "text-rift-bluebright" : "text-rift-redbright";
  return (
    <div>
      <div
        className={`text-[9px] uppercase tracking-[0.3em] mb-1 ${sideAccent}`}
      >
        {label} · Bans
      </div>
      <div className="flex gap-1">
        {bans.map((id, i) => {
          const c = id != null ? byId.get(id) : null;
          return (
            <div
              key={i}
              className="w-9 h-9 border border-rift-line/60 bg-rift-bg/60 relative"
              title={c?.name ?? "No ban"}
            >
              {c ? (
                <>
                  <img
                    src={c.iconUrl}
                    alt={c.name}
                    className="w-full h-full grayscale opacity-70"
                  />
                  {/* Strike-through to make banned status unmistakable */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-full h-px bg-rift-redbright/80 rotate-[-30deg]" />
                  </div>
                </>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-rift-mutedbright/30 text-xs">
                  —
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Recharts tooltip for the replay win-prob chart. Shows minute + blue
// win probability at the hovered point. Light gold border, dark
// background — same visual language as the rest of the dashboard.
function ReplayChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; payload: { minute: number; blue: number } }>;
  label?: number;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  const blue = point.blue;
  const minute =
    typeof label === "number" ? label : point.minute;
  return (
    <div className="bg-rift-panel border border-rift-gold/60 px-2 py-1 text-[10px] tabular-nums font-display">
      <div className="text-rift-mutedbright/70 uppercase tracking-[0.25em] text-[8px]">
        {Math.round(minute)} min
      </div>
      <div className="flex items-baseline gap-2 mt-0.5">
        <span className="text-rift-bluebright">{Math.round(blue)}%</span>
        <span className="text-rift-mutedbright/40">/</span>
        <span className="text-rift-redbright">{100 - Math.round(blue)}%</span>
      </div>
    </div>
  );
}

// Win-probability chart for the post-tournament replay. Mirrors the
// visual style of the live chart in BetweenGamesView: blue-shaded area
// above 50%, red-shaded below, gold "EVEN" reference line, side-tinted
// event markers, gold curve gradient. Y axis is in percentage (0-100)
// to match the live chart's units.
function WinProbChart({
  timeline,
  events,
  biggestSwing,
}: {
  timeline: Array<{ minute: number; blueProb: number }>;
  events: Array<{
    minute: number;
    side: Side;
    type: string;
    description: string;
    probDelta: number;
  }>;
  biggestSwing: GameRecap["biggestSwing"];
}) {
  // Anchor the chart with a synthetic 50% point at minute 0 so the line
  // starts neutral instead of jumping straight to the first event.
  // Convert blueProb (0..1) → percentage (0..100) and split into the
  // blueAbove / redBelow companion series the area fills key off so
  // each side shades only when leading.
  // Two split-area series clamp to the 50% baseline on the "wrong"
  // side rather than going null. Whenever consecutive samples cross
  // the baseline (one above 50, the next below or vice versa) we
  // inject a synthetic point at the EXACT crossing time so the area
  // boundaries between blue/red zones meet at a single pixel. Without
  // this the linear interpolation only meets at the next sample's
  // x-coordinate, leaving a small visible gap or overlap at every
  // crossing.
  const data = useMemo(() => {
    type ChartPt = {
      minute: number;
      blue: number;
      blueAbove: number;
      redBelow: number;
    };
    const series: ChartPt[] = [];
    const push = (minute: number, blue: number) => {
      series.push({
        minute,
        blue,
        blueAbove: blue >= 50 ? blue : 50,
        redBelow: blue < 50 ? blue : 50,
      });
    };
    push(0, 50);
    let prev: { minute: number; blue: number } = { minute: 0, blue: 50 };
    for (const p of timeline) {
      const v = p.blueProb * 100;
      const crossesUp = prev.blue < 50 && v >= 50;
      const crossesDown = prev.blue >= 50 && v < 50;
      // Insert the exact crossing point if the line passes through 50
      // between the previous and current sample. Linear interpolation:
      //   t* = t1 + (t2 - t1) * (50 - v1) / (v2 - v1)
      if ((crossesUp || crossesDown) && p.minute > prev.minute) {
        const denom = v - prev.blue;
        if (Math.abs(denom) > 1e-6) {
          const tStar =
            prev.minute + ((p.minute - prev.minute) * (50 - prev.blue)) / denom;
          push(tStar, 50);
        }
      }
      push(p.minute, v);
      prev = { minute: p.minute, blue: v };
    }
    return series;
  }, [timeline]);
  const durationMinutes = data.length > 0 ? data[data.length - 1].minute : 30;
  // X-axis ticks: every 5 minutes for long games, less granular for short.
  const tickStep =
    durationMinutes >= 30 ? 5 : durationMinutes >= 18 ? 4 : 3;
  const xTicks: number[] = [0];
  for (let m = tickStep; m <= durationMinutes; m += tickStep) xTicks.push(m);
  const finalProb = data.length > 0 ? data[data.length - 1].blue : 50;
  const leadingSide = finalProb > 55 ? "blue" : finalProb < 45 ? "red" : null;
  const leadingLabel =
    leadingSide === "blue"
      ? `Blue ${Math.round(finalProb)}%`
      : leadingSide === "red"
      ? `Red ${Math.round(100 - finalProb)}%`
      : "Coin flip";
  const labelCls =
    leadingSide === "blue"
      ? "text-rift-bluebright"
      : leadingSide === "red"
      ? "text-rift-redbright"
      : "text-rift-mutedbright";

  return (
    <div className="border-t border-rift-line/40 mt-3 pt-2">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[9px] md:text-[10px] uppercase tracking-[0.4em] text-rift-gold/70">
          Win Probability
        </span>
        <span
          className={`font-display text-[10px] md:text-[11px] tabular-nums tracking-[0.18em] ${labelCls}`}
        >
          {leadingLabel}
        </span>
      </div>
      <div className="relative h-40 md:h-48 -mx-1">
        <span
          className="pointer-events-none absolute top-1.5 right-2 text-[8px] font-display tracking-[0.3em] text-rift-bluebright/70 z-10"
          aria-hidden
        >
          BLUE
        </span>
        <span
          className="pointer-events-none absolute bottom-5 right-2 text-[8px] font-display tracking-[0.3em] text-rift-redbright/70 z-10"
          aria-hidden
        >
          RED
        </span>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 8, right: 12, left: 8, bottom: 4 }}
          >
            <defs>
              <linearGradient id="rep-wp-blue-fill" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor="rgb(96 165 250)"
                  stopOpacity={0.55}
                />
                <stop
                  offset="100%"
                  stopColor="rgb(96 165 250)"
                  stopOpacity={0.04}
                />
              </linearGradient>
              <linearGradient id="rep-wp-red-fill" x1="0" y1="1" x2="0" y2="0">
                <stop
                  offset="0%"
                  stopColor="rgb(248 113 113)"
                  stopOpacity={0.55}
                />
                <stop
                  offset="100%"
                  stopColor="rgb(248 113 113)"
                  stopOpacity={0.04}
                />
              </linearGradient>
              <linearGradient id="rep-wp-curve" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgb(150 200 255)" />
                <stop offset="50%" stopColor="rgb(228 192 122)" />
                <stop offset="100%" stopColor="rgb(255 160 160)" />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="minute"
              type="number"
              domain={[0, Math.max(durationMinutes, 5)]}
              ticks={xTicks}
              tickFormatter={(m) => `${m}'`}
              tick={{ fill: "rgb(160 160 170)", fontSize: 10, opacity: 0.7 }}
              tickLine={false}
              axisLine={{
                stroke: "rgb(120 120 130)",
                strokeOpacity: 0.3,
              }}
              interval={0}
              minTickGap={10}
            />
            <YAxis domain={[0, 100]} hide />
            <ReferenceLine
              y={50}
              stroke="rgb(214 173 99)"
              strokeOpacity={0.45}
              strokeDasharray="3 3"
              label={{
                value: "EVEN",
                position: "insideRight",
                fill: "rgb(214 173 99)",
                fontSize: 8,
                opacity: 0.6,
                offset: 4,
              }}
            />
            <ReferenceLine
              y={75}
              stroke="rgb(96 165 250)"
              strokeOpacity={0.18}
              strokeDasharray="1.5 4"
            />
            <ReferenceLine
              y={25}
              stroke="rgb(248 113 113)"
              strokeOpacity={0.18}
              strokeDasharray="1.5 4"
            />
            {/* Linear interpolation between data points so the
                clamp-at-50 trick produces clean baseline crossings.
                Cubic (monotone) interpolation overshoots through the
                threshold, which makes the colored zones bleed past
                their intended side at every crossing. */}
            <Area
              type="linear"
              dataKey="blueAbove"
              stroke="none"
              fill="url(#rep-wp-blue-fill)"
              fillOpacity={1}
              isAnimationActive={false}
              baseValue={50}
            />
            <Area
              type="linear"
              dataKey="redBelow"
              stroke="none"
              fill="url(#rep-wp-red-fill)"
              fillOpacity={1}
              isAnimationActive={false}
              baseValue={50}
            />
            <Area
              type="linear"
              dataKey="blue"
              stroke="url(#rep-wp-curve)"
              strokeWidth={2.4}
              fill="none"
              dot={false}
              isAnimationActive={false}
            />
            {events.map((e, i) => {
              const point = timeline.find(
                (p) => Math.abs(p.minute - e.minute) < 0.05,
              );
              if (!point) return null;
              return (
                <ReferenceDot
                  key={`evt-${i}`}
                  x={point.minute}
                  y={point.blueProb * 100}
                  r={4}
                  fill={
                    e.side === "blue"
                      ? "rgb(96 165 250)"
                      : "rgb(248 113 113)"
                  }
                  stroke="rgb(20 22 30)"
                  strokeWidth={1.4}
                  ifOverflow="visible"
                />
              );
            })}
            {biggestSwing && (
              <ReferenceDot
                x={Math.round(biggestSwing.minute * 10) / 10}
                y={
                  ((timeline.find(
                    (p) => Math.abs(p.minute - biggestSwing.minute) < 0.1,
                  )?.blueProb ?? 0.5) *
                    100)
                }
                r={6}
                fill="rgba(240, 200, 100, 0.9)"
                stroke="rgb(20 22 30)"
                strokeWidth={1.6}
                ifOverflow="visible"
              />
            )}
            <Tooltip
              cursor={{
                stroke: "rgb(214 173 99)",
                strokeOpacity: 0.5,
                strokeDasharray: "2 3",
                strokeWidth: 1.2,
              }}
              content={<ReplayChartTooltip />}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {events.length > 0 && (
        <div className="mt-3 border-t border-rift-line/30 pt-2">
          <div className="text-[9px] uppercase tracking-[0.3em] text-rift-gold/60 mb-1">
            Key Events
          </div>
          <div className="max-h-36 overflow-y-auto text-[10px] space-y-0.5 pr-1">
            {events.map((e, i) => (
              <div
                key={i}
                className="grid grid-cols-[2.5rem_0.6rem_1fr_3rem] items-center gap-2 px-1 py-1 border-b border-rift-line/15 last:border-b-0"
              >
                <span className="tabular-nums text-rift-mutedbright/55 text-right">
                  {Math.round(e.minute)}&prime;
                </span>
                {/* Side dot — colors here mark WHO MADE the play (blue
                    side gain = blue dot, red side = red dot), distinct
                    from the +/-% column which signals the win-prob
                    direction (positive = blue gained). */}
                <span
                  className={`block w-2 h-2 rounded-full ${
                    e.side === "blue"
                      ? "bg-rift-bluebright"
                      : "bg-rift-redbright"
                  }`}
                  aria-hidden
                />
                <span className="truncate text-rift-mutedbright/90">
                  {e.description}
                </span>
                <span
                  className={`text-right tabular-nums font-display ${
                    e.probDelta > 0
                      ? "text-rift-bluebright"
                      : "text-rift-redbright"
                  }`}
                >
                  {e.probDelta > 0 ? "+" : ""}
                  {(e.probDelta * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Gold-lead chart for the post-tournament replay. Reads the recap's
// goldLeadTimeline (signed, blue-positive) and renders the same split
// blue/red gradient + 0-baseline visual language as the live chart in
// BetweenGamesView's GoldLeadSparkline. Snapshots are at the same event
// boundaries as the win-prob timeline, so the two charts align
// minute-for-minute when stacked. Notable events are pinned as colored
// dots so soul/baron/elder moments are easy to find on the curve.
function formatGoldLeadAbsReplay(g: number): string {
  const abs = Math.abs(Math.round(g));
  if (abs >= 1000) return `${(abs / 1000).toFixed(1)}k`;
  return `${abs}`;
}

function GoldChartTooltipReplay({
  active,
  payload,
  blueTeam,
  redTeam,
}: {
  active?: boolean;
  payload?: Array<{
    payload: { minute: number; goldLead: number };
  }>;
  blueTeam: string;
  redTeam: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  const isBlueAhead = p.goldLead >= 0;
  const leaderName = isBlueAhead ? blueTeam : redTeam;
  const leaderCls = isBlueAhead
    ? "text-rift-bluebright"
    : "text-rift-redbright";
  return (
    <div className="bg-rift-panel border border-rift-gold/60 px-2 py-1 text-[10px] tabular-nums font-display">
      <div className="text-rift-mutedbright/70 uppercase tracking-[0.25em] text-[8px]">
        {Math.round(p.minute)} min
      </div>
      <div className={`mt-0.5 ${leaderCls}`}>
        {Math.abs(p.goldLead) < 250
          ? "Even gold"
          : `${leaderName} +${formatGoldLeadAbsReplay(p.goldLead)}g`}
      </div>
    </div>
  );
}

function GoldYTickReplay(props: {
  x?: number | string;
  y?: number | string;
  payload?: { value?: number };
}) {
  const v = props.payload?.value ?? 0;
  const isMid = v === 0;
  const isBlue = v > 0;
  const display = isMid ? "EVEN" : `${formatGoldLeadAbsReplay(v)}g`;
  const color = isMid
    ? "rgb(214 173 99)"
    : isBlue
    ? "rgb(96 165 250)"
    : "rgb(248 113 113)";
  return (
    <text
      x={props.x}
      y={props.y}
      dy={3}
      textAnchor="end"
      fill={color}
      fontSize={9}
      opacity={0.85}
      style={{ fontVariantNumeric: "tabular-nums" }}
    >
      {display}
    </text>
  );
}

function GoldLeadChart({
  timeline,
  notableEvents,
  blueTeam,
  redTeam,
}: {
  timeline: Array<{ minute: number; goldLead: number }>;
  notableEvents: Array<{
    minute: number;
    side: Side;
    type: string;
    description: string;
    probDelta: number;
  }>;
  blueTeam: string;
  redTeam: string;
}) {
  // Build chart data with split blueAbove/redBelow series and synthetic
  // crossing points at exactly 0 to keep the colored zones from bleeding
  // past the baseline. Mirror of WinProbChart's crossing-point insertion
  // logic — same numerical reasoning, just with a 0 baseline instead of
  // 50.
  const data = useMemo(() => {
    type Pt = {
      minute: number;
      goldLead: number;
      blueAbove: number;
      redBelow: number;
    };
    const series: Pt[] = [];
    const push = (minute: number, gold: number) => {
      series.push({
        minute,
        goldLead: gold,
        blueAbove: gold >= 0 ? gold : 0,
        redBelow: gold < 0 ? gold : 0,
      });
    };
    push(0, 0);
    let prev = { minute: 0, goldLead: 0 };
    for (const p of timeline) {
      const v = p.goldLead;
      const crossesUp = prev.goldLead < 0 && v >= 0;
      const crossesDown = prev.goldLead >= 0 && v < 0;
      if ((crossesUp || crossesDown) && p.minute > prev.minute) {
        const denom = v - prev.goldLead;
        if (Math.abs(denom) > 1e-6) {
          const tStar =
            prev.minute +
            ((p.minute - prev.minute) * (0 - prev.goldLead)) / denom;
          push(tStar, 0);
        }
      }
      push(p.minute, v);
      prev = { minute: p.minute, goldLead: v };
    }
    return series;
  }, [timeline]);

  const durationMinutes =
    data.length > 0 ? data[data.length - 1].minute : 30;
  const tickStep =
    durationMinutes >= 30 ? 5 : durationMinutes >= 18 ? 4 : 3;
  const xTicks: number[] = [0];
  for (let m = tickStep; m <= durationMinutes; m += tickStep) xTicks.push(m);

  // Symmetric Y domain anchored at 0 (matches the live chart). Pad
  // ±15% so the curve doesn't kiss the edges; minimum span ±2k so a
  // tense game still renders with vertical movement.
  const yDomain = useMemo<[number, number]>(() => {
    let extreme = 2000;
    for (const p of data) {
      const a = Math.abs(p.goldLead);
      if (a > extreme) extreme = a;
    }
    extreme = Math.ceil(extreme * 1.15);
    return [-extreme, extreme];
  }, [data]);

  const yTicks = useMemo<number[]>(() => {
    const [lo, hi] = yDomain;
    const mag = Math.max(Math.abs(lo), Math.abs(hi));
    const step =
      mag > 12000 ? 5000 : mag > 6000 ? 2500 : mag > 2500 ? 1000 : 500;
    const ticks: number[] = [0];
    for (let v = step; v <= hi - step / 2; v += step) ticks.push(v);
    for (let v = -step; v >= lo + step / 2; v -= step) ticks.push(v);
    return ticks.sort((a, b) => a - b);
  }, [yDomain]);

  const last = data[data.length - 1];
  const lead = last?.goldLead ?? 0;
  const leadingSide: Side | "even" =
    Math.abs(lead) < 250 ? "even" : lead > 0 ? "blue" : "red";
  const headerLabel =
    leadingSide === "blue"
      ? `Blue +${formatGoldLeadAbsReplay(lead)}g`
      : leadingSide === "red"
      ? `Red +${formatGoldLeadAbsReplay(lead)}g`
      : "Even gold";
  const labelCls =
    leadingSide === "blue"
      ? "text-rift-bluebright"
      : leadingSide === "red"
      ? "text-rift-redbright"
      : "text-rift-mutedbright";

  return (
    <div className="border-t border-rift-line/40 mt-3 pt-2">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[9px] md:text-[10px] uppercase tracking-[0.4em] text-rift-gold/70">
          Gold Lead
        </span>
        <span
          className={`font-display text-[10px] md:text-[11px] tabular-nums tracking-[0.18em] ${labelCls}`}
        >
          {headerLabel}
        </span>
      </div>
      <div className="relative h-32 md:h-40 -mx-1">
        <span
          className="pointer-events-none absolute top-1.5 right-2 text-[8px] font-display tracking-[0.3em] text-rift-bluebright/70 z-10"
          aria-hidden
        >
          BLUE
        </span>
        <span
          className="pointer-events-none absolute bottom-5 right-2 text-[8px] font-display tracking-[0.3em] text-rift-redbright/70 z-10"
          aria-hidden
        >
          RED
        </span>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 8, right: 12, left: 8, bottom: 4 }}
          >
            <defs>
              <linearGradient id="rep-gold-blue-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgb(96 165 250)" stopOpacity={0.55} />
                <stop offset="100%" stopColor="rgb(96 165 250)" stopOpacity={0.04} />
              </linearGradient>
              <linearGradient id="rep-gold-red-fill" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor="rgb(248 113 113)" stopOpacity={0.55} />
                <stop offset="100%" stopColor="rgb(248 113 113)" stopOpacity={0.04} />
              </linearGradient>
              <linearGradient id="rep-gold-curve" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgb(150 200 255)" />
                <stop offset="50%" stopColor="rgb(228 192 122)" />
                <stop offset="100%" stopColor="rgb(255 160 160)" />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="minute"
              type="number"
              domain={[0, Math.max(durationMinutes, 5)]}
              ticks={xTicks}
              tickFormatter={(m) => `${m}'`}
              tick={{ fill: "rgb(160 160 170)", fontSize: 10, opacity: 0.7 }}
              tickLine={false}
              axisLine={{ stroke: "rgb(120 120 130)", strokeOpacity: 0.3 }}
              interval={0}
              minTickGap={10}
            />
            <YAxis
              domain={yDomain}
              ticks={yTicks}
              tick={GoldYTickReplay}
              tickLine={false}
              axisLine={false}
              width={42}
            />
            <ReferenceLine
              y={0}
              stroke="rgb(214 173 99)"
              strokeOpacity={0.45}
              strokeDasharray="3 3"
              label={{
                value: "EVEN",
                position: "insideRight",
                fill: "rgb(214 173 99)",
                fontSize: 8,
                opacity: 0.6,
                offset: 4,
              }}
            />
            <Area
              type="linear"
              dataKey="blueAbove"
              stroke="none"
              fill="url(#rep-gold-blue-fill)"
              fillOpacity={1}
              isAnimationActive={false}
              baseValue={0}
            />
            <Area
              type="linear"
              dataKey="redBelow"
              stroke="none"
              fill="url(#rep-gold-red-fill)"
              fillOpacity={1}
              isAnimationActive={false}
              baseValue={0}
            />
            <Area
              type="linear"
              dataKey="goldLead"
              stroke="url(#rep-gold-curve)"
              strokeWidth={2.4}
              fill="none"
              dot={false}
              isAnimationActive={false}
            />
            {notableEvents.map((e, i) => {
              // Find the gold-timeline point at the event's minute. Use
              // a 0.1-minute tolerance for floating-point drift between
              // the win-prob and gold-lead timelines (both snapshot at
              // the same simulator event boundaries).
              const pt = timeline.find(
                (p) => Math.abs(p.minute - e.minute) < 0.15,
              );
              if (!pt) return null;
              return (
                <ReferenceDot
                  key={`gold-evt-${i}`}
                  x={pt.minute}
                  y={pt.goldLead}
                  r={4}
                  fill={
                    e.side === "blue"
                      ? "rgb(96 165 250)"
                      : "rgb(248 113 113)"
                  }
                  stroke="rgb(20 22 30)"
                  strokeWidth={1.4}
                  ifOverflow="visible"
                />
              );
            })}
            <Tooltip
              cursor={{
                stroke: "rgb(214 173 99)",
                strokeOpacity: 0.5,
                strokeDasharray: "2 3",
                strokeWidth: 1.2,
              }}
              content={
                <GoldChartTooltipReplay
                  blueTeam={blueTeam}
                  redTeam={redTeam}
                />
              }
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// Damage-dealt bars synthesized from per-pick KDA + champion archetype
// (no live damage feed, but the synthesis reads "right" for the user
// — carries top the chart, supports trail). Reuses the same formula as
// BetweenGamesView's damage bars.
function DamageBars({
  game,
  perPickKDA,
  byId,
}: {
  game: GameDraft;
  perPickKDA: NonNullable<GameRecap["perPickKDA"]>;
  byId: Map<number, Champion>;
}) {
  // Compute synthetic damage per pick on both sides.
  type Row = {
    side: Side;
    laneIdx: number;
    champion: Champion | null;
    damage: number;
  };
  const rows: Row[] = [];
  for (let i = 0; i < 5; i++) {
    const blueId = game.bluePicks[i];
    const blueChamp = blueId != null ? byId.get(blueId) ?? null : null;
    const blueKDA = perPickKDA.blue[i] ?? { k: 0, d: 0, a: 0 };
    if (blueChamp) {
      const meta = getChampionMeta(blueChamp.alias);
      rows.push({
        side: "blue",
        laneIdx: i,
        champion: blueChamp,
        damage: meta ? syntheticDamage(blueKDA, meta) : 0,
      });
    }
    const redId = game.redPicks[i];
    const redChamp = redId != null ? byId.get(redId) ?? null : null;
    const redKDA = perPickKDA.red[i] ?? { k: 0, d: 0, a: 0 };
    if (redChamp) {
      const meta = getChampionMeta(redChamp.alias);
      rows.push({
        side: "red",
        laneIdx: i,
        champion: redChamp,
        damage: meta ? syntheticDamage(redKDA, meta) : 0,
      });
    }
  }
  const maxDamage = Math.max(1, ...rows.map((r) => r.damage));
  return (
    <div className="border border-rift-line/40 bg-rift-bg/30 px-3 py-2">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[9px] uppercase tracking-[0.3em] text-rift-gold/70">
          Damage Dealt
        </span>
        <span className="text-[8px] uppercase tracking-[0.25em] text-rift-mutedbright/55">
          Synthesized from KDA + role
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-3 gap-y-1">
        {rows.map((r) => {
          const pct = (r.damage / maxDamage) * 100;
          const accentBar =
            r.side === "blue" ? "bg-rift-blue" : "bg-rift-red";
          return (
            <div key={`${r.side}-${r.laneIdx}`} className="flex items-center gap-2">
              {r.champion && (
                <img
                  src={r.champion.iconUrl}
                  alt={r.champion.name}
                  className="w-5 h-5 border border-rift-line/60 flex-shrink-0"
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-1">
                  <span className="text-[10px] font-display tracking-wider text-rift-mutedbright truncate">
                    {r.champion?.name ?? "—"}
                  </span>
                  <span className="text-[9px] tabular-nums text-rift-mutedbright/65">
                    {Math.round(r.damage)}
                  </span>
                </div>
                <div className="h-1 bg-rift-line/40 mt-0.5">
                  <div
                    className={`h-full ${accentBar}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PickColumn({
  side,
  label,
  picks,
  roles,
  byId,
  isWinner,
  laneGoldDiff,
  perPickKDA,
}: {
  side: Side;
  label: string;
  picks: (number | null)[];
  roles: (Lane | null)[];
  byId: Map<number, Champion>;
  isWinner: boolean;
  laneGoldDiff?: Partial<Record<Lane, number>>;
  // Optional per-pick KDA (5 entries aligned to positional lanes —
  // top, jungle, middle, bottom, support). Renders as a K/D/A line
  // under each champion when present.
  perPickKDA?: Array<{ k: number; d: number; a: number }>;
}) {
  const sideAccent =
    side === "blue" ? "text-rift-bluebright" : "text-rift-redbright";
  const winnerCls = isWinner ? "border-rift-gold/60" : "border-rift-line/40";
  return (
    <div className={`border ${winnerCls} bg-rift-bg/30 p-2`}>
      <div className="flex items-baseline justify-between mb-2">
        <div
          className={`text-[10px] uppercase tracking-[0.35em] ${sideAccent}`}
        >
          {label} · Picks
        </div>
        {isWinner && (
          <div className="text-[8px] uppercase tracking-[0.3em] text-rift-goldbright">
            Won
          </div>
        )}
      </div>
      <div className="space-y-1">
        {picks.map((id, i) => {
          const c = id != null ? byId.get(id) : null;
          const role = roles[i];
          // Lane gold diff is keyed by lane and signed from BLUE's
          // perspective. For red-side rows we negate so the number
          // shows the diff from THIS team's point of view.
          const rawDiff =
            role && laneGoldDiff ? laneGoldDiff[role] : undefined;
          const diff =
            rawDiff != null
              ? side === "red"
                ? -rawDiff
                : rawDiff
              : null;
          const kda = perPickKDA?.[i];
          const hasKDA = kda && kda.k + kda.d + kda.a > 0;
          return (
            <div
              key={i}
              className="px-1.5 py-1 border border-rift-line/30"
            >
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 flex-shrink-0">
                  {role ? (
                    <LaneIcon lane={role} className="w-4 h-4 text-rift-gold/70" />
                  ) : (
                    <div className="w-4 h-4" />
                  )}
                </div>
                {c ? (
                  <>
                    <img
                      src={c.iconUrl}
                      alt={c.name}
                      className="w-7 h-7 border border-rift-line/60 flex-shrink-0"
                    />
                    <span className="text-[11px] font-display tracking-wider text-rift-mutedbright truncate flex-1">
                      {c.name}
                    </span>
                    {diff != null && (
                      <span
                        className={`text-[10px] tabular-nums font-display flex-shrink-0 ${
                          diff > 0
                            ? "text-emerald-300"
                            : diff < 0
                            ? "text-rift-redbright"
                            : "text-rift-mutedbright/60"
                        }`}
                        title={`Lane gold diff (signed for this team)`}
                      >
                        {diff > 0 ? "+" : ""}
                        {Math.round(diff / 100) / 10}k
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-[11px] uppercase tracking-[0.25em] text-rift-mutedbright/40">
                    No pick
                  </span>
                )}
              </div>
              {/* KDA strip below — fixed colors regardless of side. */}
              {hasKDA && (
                <div className="ml-6 mt-0.5 text-[10px] tabular-nums font-display flex items-baseline gap-0.5">
                  <span className="text-[8px] uppercase tracking-[0.25em] text-rift-mutedbright/55 mr-1">
                    KDA
                  </span>
                  <span className="text-emerald-300">{kda!.k}</span>
                  <span className="text-rift-muted/50">/</span>
                  <span className="text-rift-redbright/85">{kda!.d}</span>
                  <span className="text-rift-muted/50">/</span>
                  <span className="text-rift-goldbright/85">{kda!.a}</span>
                  {kda!.d > 0 && (
                    <span className="ml-2 text-[9px] text-rift-mutedbright/65">
                      {((kda!.k + kda!.a) / kda!.d).toFixed(1)} KDA
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MatchOverrideModal({
  match,
  tournament,
  onStart,
  onCancel,
}: {
  match: TournamentMatch;
  tournament: TournamentState;
  onStart: (overrides: Partial<MatchOverride>) => void;
  onCancel: () => void;
}) {
  const blueTeam = getTeam(tournament, match.blueTeamId);
  const redTeam = getTeam(tournament, match.redTeamId);
  const [format, setFormat] = useState<SeriesFormat>(match.format);
  const [fearless, setFearless] = useState(match.fearless);
  const [mode, setMode] = useState<DraftMode>(match.mode);
  const [aiSide, setAiSide] = useState<Side>(match.aiSide ?? "red");
  const [aiDifficulty, setAiDifficulty] = useState<AIDifficulty>(
    match.aiDifficulty,
  );
  const dirty =
    format !== match.format ||
    fearless !== match.fearless ||
    mode !== match.mode ||
    (mode === "pvai" && aiSide !== match.aiSide) ||
    aiDifficulty !== match.aiDifficulty;

  const handleStart = () => {
    if (!dirty) {
      onStart({}); // proceed with match's existing settings
      return;
    }
    onStart({
      format,
      fearless,
      mode,
      aiSide: mode === "pvai" ? aiSide : null,
      aiDifficulty,
    });
  };

  return (
    <div
      className="fixed inset-0 z-[150] bg-rift-bg/85 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="relative bg-rift-panel border-2 border-rift-gold/50 max-w-md w-full max-h-[90vh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
      >
        <div className="px-4 md:px-5 py-3 md:py-4 border-b border-rift-gold/20">
          <div className="text-[9px] uppercase tracking-[0.4em] text-rift-gold/70">
            Start Match
          </div>
          <div className="font-display text-base md:text-lg tracking-wider text-rift-goldbright mt-0.5">
            {blueTeam?.name ?? "TBD"} <span className="text-rift-mutedbright/60 mx-1">vs</span>{" "}
            {redTeam?.name ?? "TBD"}
          </div>
          <div className="text-[9px] uppercase tracking-[0.25em] text-rift-mutedbright/55 mt-1">
            Override settings for this match, or accept defaults
          </div>
        </div>
        <div className="p-4 md:p-5 space-y-3">
          <PillRow
            label="Format"
            value={format}
            options={[
              { value: "bo1" as const, label: "Bo1" },
              { value: "bo3" as const, label: "Bo3" },
              { value: "bo5" as const, label: "Bo5" },
            ]}
            onChange={setFormat}
          />
          <PillRow
            label="Mode"
            value={mode}
            options={[
              { value: "pvp" as const, label: "PvP" },
              { value: "pvai" as const, label: "vs AI" },
              { value: "aivai" as const, label: "AI vs AI" },
            ]}
            onChange={setMode}
          />
          {mode === "pvai" && (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAiSide("red")}
                className={`py-1.5 border text-[10px] uppercase tracking-[0.3em] transition-all ${
                  aiSide === "red"
                    ? "border-rift-blue bg-rift-blue/10 text-rift-bluebright"
                    : "border-rift-line text-rift-mutedbright hover:border-rift-blue/60"
                }`}
              >
                You: Blue
              </button>
              <button
                type="button"
                onClick={() => setAiSide("blue")}
                className={`py-1.5 border text-[10px] uppercase tracking-[0.3em] transition-all ${
                  aiSide === "blue"
                    ? "border-rift-red bg-rift-red/10 text-rift-redbright"
                    : "border-rift-line text-rift-mutedbright hover:border-rift-red/60"
                }`}
              >
                You: Red
              </button>
            </div>
          )}
          {(mode === "pvai" || mode === "aivai") && (
            <PillRow
              label="AI Difficulty"
              value={aiDifficulty}
              options={[
                { value: "easy" as const, label: "Easy" },
                { value: "normal" as const, label: "Normal" },
                { value: "hard" as const, label: "Hard" },
              ]}
              onChange={setAiDifficulty}
            />
          )}
          <label className="flex items-center gap-2 cursor-pointer text-[10px] uppercase tracking-[0.25em] text-rift-mutedbright">
            <input
              type="checkbox"
              checked={fearless}
              onChange={(e) => setFearless(e.target.checked)}
              disabled={format === "bo1"}
              className="accent-rift-gold"
            />
            Fearless (within series)
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2 px-4 pb-4">
          <button
            type="button"
            onClick={onCancel}
            className="py-2.5 border border-rift-line text-rift-mutedbright hover:border-rift-gold/50 hover:bg-rift-gold/5 text-[10px] uppercase tracking-[0.3em] transition-all"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleStart}
            className="btn-gold py-2.5 font-display text-[11px] tracking-[0.3em]"
          >
            {dirty ? "Start Match" : "Start (Defaults)"}
          </button>
        </div>
      </div>
    </div>
  );
}

interface PillOpt<T> {
  value: T;
  label: string;
}
function PillRow<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly PillOpt<T>[];
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <div className="text-[8px] uppercase tracking-[0.3em] text-rift-gold/55 mb-1">
        {label}
      </div>
      <div
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
        {options.map((o) => {
          const active = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              className={`py-1.5 border text-[10px] uppercase tracking-[0.25em] transition-all ${
                active
                  ? "border-rift-gold bg-rift-gold/10 text-rift-goldbright"
                  : "border-rift-line text-rift-mutedbright hover:border-rift-gold/60 hover:text-rift-goldbright hover:bg-rift-gold/5"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Post-tournament recap ───────────────────────────────────────────
// Lives at the top of the dashboard when status === "complete". Renders:
//   1. A summary stat block (matches/games/coverage/longest series)
//   2. Two side-by-side champion stat tables — Presence (picks+bans+games,
//      sorted by total presence) and Win Rate (sorted by WR, gated by a
//      min-game threshold so 1-0 noise doesn't dominate).
//
// The earlier "Tournament MVP" card was removed: a champion-level "MVP"
// is conceptually muddy for a draft simulator (the MVP signal lives on
// the player, not the champion), and the headline data is captured more
// directly by the WR table + most-contested callout.
function PostTournamentRecap({ tournament }: { tournament: TournamentState }) {
  const champions = useDraftStore((s) => s.champions);
  const byId = useMemo(
    () => new Map(champions.map((c) => [c.id, c])),
    [champions],
  );
  const summary = useMemo(
    () => computeTournamentSummary(tournament, champions.length || null),
    [tournament, champions.length],
  );
  const champion = useMemo(() => tournamentChampion(tournament), [tournament]);

  // Two derived rankings from the same per-champion stats:
  //   • presence: picks + bans (default order from computeChampionStats)
  //   • winRate: filtered to ≥3 games of evidence, sorted by WR desc
  const allStats = useMemo(
    () => computeChampionStats(tournament),
    [tournament],
  );
  const byPresence = useMemo(
    () =>
      allStats
        .filter((s) => s.picks + s.bans > 0)
        .slice(0, 10),
    [allStats],
  );
  const byWinRate = useMemo(() => {
    const MIN_GAMES = 3;
    return allStats
      .filter((s) => s.wins + s.losses >= MIN_GAMES && s.winRate != null)
      .slice() // copy before sort
      .sort((a, b) => {
        // WR desc; tiebreak by sample size desc, then by id asc.
        const wrA = a.winRate ?? 0;
        const wrB = b.winRate ?? 0;
        if (wrA !== wrB) return wrB - wrA;
        const gA = a.wins + a.losses;
        const gB = b.wins + b.losses;
        if (gA !== gB) return gB - gA;
        return a.championId - b.championId;
      })
      .slice(0, 10);
  }, [allStats]);

  // "Best WR among most played" — rank by sample size first (top 12 by
  // games), then re-sort by WR. Surfaces the champions whose strong
  // performance was earned over many games rather than via small-sample
  // luck. Distinct from `byWinRate` which sorts the full pool by WR.
  const byMostPlayedThenWR = useMemo(() => {
    const POOL = 12;
    const candidates = allStats
      .filter((s) => s.wins + s.losses > 0 && s.winRate != null)
      .slice()
      .sort((a, b) => {
        const gA = a.wins + a.losses;
        const gB = b.wins + b.losses;
        return gB - gA;
      })
      .slice(0, POOL);
    candidates.sort((a, b) => {
      const wrA = a.winRate ?? 0;
      const wrB = b.winRate ?? 0;
      if (wrA !== wrB) return wrB - wrA;
      const gA = a.wins + a.losses;
      const gB = b.wins + b.losses;
      return gB - gA;
    });
    return candidates.slice(0, 8);
  }, [allStats]);

  return (
    <div className="mb-6 md:mb-8 space-y-4 md:space-y-5">
      <SummaryCard
        summary={summary}
        tournament={tournament}
        champion={champion}
        byId={byId}
      />
      <MetaShiftPanel tournament={tournament} byId={byId} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
        <PresenceTable rows={byPresence} byId={byId} />
        <WinRateTable
          title="Win Rate"
          subtitle="Min 3 games"
          rows={byWinRate}
          byId={byId}
          emptyMessage="No champion has played 3+ games yet"
        />
      </div>
      <WinRateTable
        title="Best WR Among Most Played"
        subtitle="Sample-weighted: WR earned across many games"
        rows={byMostPlayedThenWR}
        byId={byId}
        emptyMessage="Not enough data yet"
      />
      <ChampionSearchPanel tournament={tournament} byId={byId} />
      <TeamBreakdownPanel tournament={tournament} byId={byId} />
    </div>
  );
}

// Headline summary — high-level facts about what happened. Renders the
// crowned team prominently, then a row of compact stat tiles, then the
// most-contested + best-WR flavor callouts.
function SummaryCard({
  summary,
  tournament,
  champion,
  byId,
}: {
  summary: TournamentSummary;
  tournament: TournamentState;
  champion: TournamentTeam | null;
  byId: Map<number, Champion>;
}) {
  const fearlessLabels: string[] = [];
  if (tournament.fearlessConfig.global) fearlessLabels.push("Global");
  else if (tournament.fearlessConfig.perTeam) fearlessLabels.push("Per-Team");
  if (tournament.fearlessConfig.perSeries) fearlessLabels.push("Per-Series");
  const formatLabel = formatHeaderLabel(tournament.format);
  const avgGamesPerMatch =
    summary.totalMatches > 0
      ? (summary.totalGames / summary.totalMatches).toFixed(2)
      : "0";
  const coveragePct =
    summary.rosterCoverage != null
      ? Math.round(summary.rosterCoverage * 100)
      : null;
  const mostContested =
    summary.mostContestedChampionId != null
      ? byId.get(summary.mostContestedChampionId)
      : null;
  const bestWRChamp =
    summary.bestWRChampionId != null
      ? byId.get(summary.bestWRChampionId)
      : null;
  return (
    <div className="border-2 border-rift-gold/50 bg-gradient-to-br from-rift-gold/[0.06] via-rift-bg/40 to-transparent p-4 md:p-5">
      <div className="flex items-baseline justify-between mb-3">
        <div className="text-[10px] uppercase tracking-[0.4em] text-rift-gold/70">
          Tournament Summary
        </div>
        <div className="text-[9px] uppercase tracking-[0.25em] text-rift-mutedbright/55">
          {formatLabel} · {tournament.teams.length} teams
          {fearlessLabels.length > 0 && ` · Fearless ${fearlessLabels.join("+")}`}
        </div>
      </div>
      {champion && (
        <div className="text-[10px] uppercase tracking-[0.3em] text-rift-mutedbright/70 mb-3">
          Crowned:&nbsp;
          <span className="text-rift-goldbright font-display text-base tracking-wider">
            {champion.name}
          </span>
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 md:gap-3">
        <StatTile label="Matches" value={summary.totalMatches} />
        <StatTile label="Games" value={summary.totalGames} />
        <StatTile
          label="Avg Games / Match"
          value={avgGamesPerMatch}
        />
        <StatTile
          label="Longest Series"
          value={summary.longestSeriesGames}
        />
        <StatTile label="Total Picks" value={summary.totalPicks} />
        <StatTile label="Total Bans" value={summary.totalBans} />
        <StatTile
          label="Champions Played"
          value={summary.uniqueChampionsPlayed}
        />
        <StatTile
          label="Roster Coverage"
          value={coveragePct != null ? `${coveragePct}%` : "—"}
          hint="Picked or banned at least once"
        />
      </div>
      {(mostContested || bestWRChamp) && (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2 md:gap-3">
          {mostContested && (
            <CalloutTile
              label="Most Contested"
              champion={mostContested}
              detail={`${summary.mostContestedPresence} picks+bans`}
            />
          )}
          {bestWRChamp && summary.bestWR != null && (
            <CalloutTile
              label={`Best WR (≥3 games)`}
              champion={bestWRChamp}
              detail={`${Math.round(summary.bestWR * 100)}% over ${
                summary.bestWRGames
              } games`}
              accent="emerald"
            />
          )}
        </div>
      )}
    </div>
  );
}

function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | string;
  hint?: string;
}) {
  return (
    <div
      className="border border-rift-line/40 bg-rift-bg/30 px-3 py-2"
      title={hint}
    >
      <div className="text-[8px] uppercase tracking-[0.3em] text-rift-mutedbright/60">
        {label}
      </div>
      <div className="font-display text-lg md:text-xl text-rift-goldbright tabular-nums">
        {value}
      </div>
    </div>
  );
}

function CalloutTile({
  label,
  champion,
  detail,
  accent = "gold",
}: {
  label: string;
  champion: Champion;
  detail: string;
  accent?: "gold" | "emerald";
}) {
  const ringCls =
    accent === "emerald"
      ? "border-emerald-400/50 bg-emerald-400/[0.04]"
      : "border-rift-gold/50 bg-rift-gold/[0.05]";
  const accentText =
    accent === "emerald" ? "text-emerald-300" : "text-rift-goldbright";
  return (
    <div className={`flex items-center gap-3 border ${ringCls} px-3 py-2`}>
      <img
        src={champion.iconUrl}
        alt={champion.name}
        className="w-10 h-10 border border-rift-line/60 flex-shrink-0"
      />
      <div className="min-w-0">
        <div className="text-[8px] uppercase tracking-[0.3em] text-rift-mutedbright/60">
          {label}
        </div>
        <div className={`font-display text-sm tracking-wider truncate ${accentText}`}>
          {champion.name}
        </div>
        <div className="text-[9px] uppercase tracking-[0.2em] text-rift-mutedbright/65">
          {detail}
        </div>
      </div>
    </div>
  );
}

// Champion search panel: type a name (or alias prefix), get the
// champion's tournament-wide picks/bans/wins/losses + which teams played
// them most. Picks-only matches the search results when there's a clear
// single hit (e.g. typing "Aatr" → Aatrox); ambiguous queries show a
// suggestion list.
function ChampionSearchPanel({
  tournament,
  byId,
}: {
  tournament: TournamentState;
  byId: Map<number, Champion>;
}) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [browseOpen, setBrowseOpen] = useState(false);

  const champions = useMemo(() => Array.from(byId.values()), [byId]);
  // Restrict suggestions to champions that actually appear in the
  // tournament — we don't want to drown the panel in unused roster.
  const tournamentChampionIds = useMemo(() => {
    const ids = new Set<number>();
    for (const m of tournament.matches) {
      if (!m.series) continue;
      for (const g of m.series.games) {
        for (const id of [
          ...g.bluePicks,
          ...g.redPicks,
          ...g.blueBans,
          ...g.redBans,
        ]) {
          if (id != null) ids.add(id);
        }
      }
    }
    return ids;
  }, [tournament]);

  // Sorted list of every champion that appeared in this tournament,
  // alphabetically. Powers the browse-all expandable section.
  const allTournamentChampions = useMemo(() => {
    return champions
      .filter((c) => tournamentChampionIds.has(c.id))
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [champions, tournamentChampionIds]);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return champions
      .filter(
        (c) =>
          tournamentChampionIds.has(c.id) &&
          (c.name.toLowerCase().includes(q) ||
            c.alias.toLowerCase().includes(q)),
      )
      .slice(0, 8);
  }, [query, champions, tournamentChampionIds]);

  const selected = selectedId != null ? byId.get(selectedId) ?? null : null;
  const attribution = useMemo(() => {
    if (selectedId == null) return null;
    return computeChampionAttribution(tournament, selectedId);
  }, [tournament, selectedId]);

  return (
    <div className="border border-rift-line/50 bg-rift-panel/40 p-3 md:p-4">
      <div className="flex items-baseline justify-between mb-3">
        <span className="text-[10px] uppercase tracking-[0.4em] text-rift-gold/70">
          Champion Lookup
        </span>
        <span className="text-[8px] uppercase tracking-[0.3em] text-rift-mutedbright/55">
          {tournamentChampionIds.size} champions in tournament
        </span>
      </div>
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type a champion name…"
          className="w-full bg-rift-bg/60 border border-rift-line text-rift-mutedbright text-sm px-3 py-2 outline-none focus:border-rift-gold/60"
        />
        {suggestions.length > 0 && query.trim() && (
          <div className="absolute z-10 left-0 right-0 mt-1 max-h-64 overflow-y-auto border border-rift-line bg-rift-panel shadow-lg">
            {suggestions.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setSelectedId(c.id);
                  setQuery("");
                }}
                className="w-full text-left flex items-center gap-2 px-2 py-1.5 hover:bg-rift-gold/10 transition-colors"
              >
                <img
                  src={c.iconUrl}
                  alt={c.name}
                  className="w-7 h-7 border border-rift-line/60"
                />
                <span className="text-[12px] font-display tracking-wider text-rift-mutedbright">
                  {c.name}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Browse-all expandable. A scrollable grid of every champion
          that appeared in the tournament — useful when you don't
          remember the exact name to search. */}
      {allTournamentChampions.length > 0 && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setBrowseOpen((v) => !v)}
            className="w-full flex items-center justify-between px-2 py-1.5 border border-rift-line text-[10px] uppercase tracking-[0.3em] text-rift-mutedbright hover:text-rift-goldbright hover:border-rift-gold/50 transition-all"
          >
            <span>
              {browseOpen ? "Hide" : "Browse"} all champions played
            </span>
            <span className="text-rift-gold/60">
              {browseOpen ? "▾" : "▸"}
            </span>
          </button>
          {browseOpen && (
            <div className="mt-2 max-h-72 overflow-y-auto border border-rift-line/40 bg-rift-bg/30 p-2 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1.5">
              {allTournamentChampions.map((c) => {
                const isSelected = selectedId === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(c.id);
                      setQuery("");
                    }}
                    className={`flex items-center gap-1.5 px-1.5 py-1 border text-left transition-colors ${
                      isSelected
                        ? "border-rift-gold bg-rift-gold/10"
                        : "border-rift-line/30 hover:border-rift-gold/50 hover:bg-rift-gold/5"
                    }`}
                  >
                    <img
                      src={c.iconUrl}
                      alt={c.name}
                      className="w-6 h-6 border border-rift-line/60 flex-shrink-0"
                    />
                    <span className="text-[10px] font-display tracking-wider text-rift-mutedbright truncate">
                      {c.name}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {selected && attribution && (
        <ChampionAttributionView
          tournament={tournament}
          champion={selected}
          attribution={attribution}
          onClear={() => setSelectedId(null)}
        />
      )}
      {selectedId != null && !attribution && (
        <div className="mt-3 text-[11px] uppercase tracking-[0.25em] text-rift-mutedbright/55">
          {selected?.name ?? "Champion"} did not appear in any pick or ban.
        </div>
      )}
    </div>
  );
}

function ChampionAttributionView({
  tournament,
  champion,
  attribution,
  onClear,
}: {
  tournament: TournamentState;
  champion: Champion;
  attribution: ChampionAttribution;
  onClear: () => void;
}) {
  const games = attribution.totalWins + attribution.totalLosses;
  const wrPct = games > 0 ? Math.round((attribution.totalWins / games) * 100) : null;
  const wrColor =
    wrPct == null
      ? "text-rift-mutedbright/40"
      : wrPct >= 60
      ? "text-emerald-300"
      : wrPct < 40
      ? "text-rift-redbright"
      : "text-rift-mutedbright";
  const topTeam =
    attribution.byTeam.find((row) => row.picks > 0) ?? null;
  const topTeamObj = topTeam ? getTeam(tournament, topTeam.teamId) : null;
  return (
    <div className="mt-3 border border-rift-gold/40 bg-rift-bg/40 p-3">
      <div className="flex items-start gap-3">
        <img
          src={champion.iconUrl}
          alt={champion.name}
          className="w-14 h-14 md:w-16 md:h-16 border-2 border-rift-gold/60 flex-shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <div className="font-display text-xl tracking-wider text-rift-goldbright truncate">
              {champion.name}
            </div>
            <button
              type="button"
              onClick={onClear}
              className="text-[9px] uppercase tracking-[0.3em] text-rift-mutedbright/60 hover:text-rift-redbright transition-colors ml-auto"
            >
              Clear
            </button>
          </div>
          <div className="mt-1.5 grid grid-cols-2 sm:grid-cols-5 gap-2">
            <Stat label="Picks" value={attribution.totalPicks} />
            <Stat label="Bans" value={attribution.totalBans} />
            <Stat label="Wins" value={attribution.totalWins} />
            <Stat label="Losses" value={attribution.totalLosses} />
            <Stat
              label="WR"
              value={wrPct != null ? `${wrPct}%` : "—"}
              valueClass={wrColor}
            />
          </div>
        </div>
      </div>
      {topTeamObj && (
        <div className="mt-3 text-[10px] uppercase tracking-[0.3em] text-rift-mutedbright/60">
          Most picked by:&nbsp;
          <span className="text-rift-goldbright font-display tracking-wider">
            {topTeamObj.name}
          </span>
          <span className="text-rift-mutedbright/50">
            &nbsp;· {topTeam!.picks} picks · {topTeam!.wins}-{topTeam!.losses}
          </span>
        </div>
      )}
      {/* Per-team breakdown for THIS champion */}
      <div className="mt-3 border-t border-rift-line/40 pt-2">
        <div className="text-[9px] uppercase tracking-[0.3em] text-rift-gold/60 mb-1.5">
          Per-team breakdown
        </div>
        <div className="grid grid-cols-[1fr_2.5rem_2.5rem_3rem] gap-2 px-2 py-1 text-[8px] uppercase tracking-[0.3em] text-rift-mutedbright/55">
          <span>Team</span>
          <span className="text-center">P</span>
          <span className="text-center">B</span>
          <span className="text-center">W-L</span>
        </div>
        {attribution.byTeam.map((row) => {
          const team = getTeam(tournament, row.teamId);
          if (!team) return null;
          return (
            <div
              key={row.teamId}
              className="grid grid-cols-[1fr_2.5rem_2.5rem_3rem] gap-2 px-2 py-1 text-[10px] md:text-[11px] border-t border-rift-line/15"
            >
              <span className="font-display tracking-wider text-rift-mutedbright truncate">
                {team.name}
              </span>
              <span className="text-center tabular-nums text-rift-bluebright">
                {row.picks}
              </span>
              <span className="text-center tabular-nums text-rift-redbright">
                {row.bans}
              </span>
              <span className="text-center tabular-nums text-rift-mutedbright/85">
                {row.wins}-{row.losses}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  valueClass = "text-rift-goldbright",
}: {
  label: string;
  value: number | string;
  valueClass?: string;
}) {
  return (
    <div className="border border-rift-line/40 bg-rift-bg/30 px-2 py-1.5">
      <div className="text-[8px] uppercase tracking-[0.3em] text-rift-mutedbright/55">
        {label}
      </div>
      <div className={`font-display text-base tabular-nums ${valueClass}`}>
        {value}
      </div>
    </div>
  );
}

// Per-team champion-pool panel. Lists every team and the champions they
// played, ordered by pick frequency. Collapsible per row so the panel
// stays compact when there are 8+ teams.
function TeamBreakdownPanel({
  tournament,
  byId,
}: {
  tournament: TournamentState;
  byId: Map<number, Champion>;
}) {
  const breakdown = useMemo(
    () => computeTeamBreakdown(tournament),
    [tournament],
  );
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(
    () => breakdown[0]?.teamId ?? null,
  );
  if (breakdown.length === 0) return null;
  return (
    <div className="border border-rift-line/50 bg-rift-panel/40">
      <div className="px-3 py-2 border-b border-rift-line/40 flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-[0.4em] text-rift-gold/70">
          Team Champion Pools
        </span>
        <span className="text-[8px] uppercase tracking-[0.3em] text-rift-mutedbright/55">
          Click a team to expand
        </span>
      </div>
      {breakdown.map((entry) => {
        const team = getTeam(tournament, entry.teamId);
        if (!team) return null;
        const expanded = expandedTeamId === entry.teamId;
        const totalPicks = entry.champions.reduce((a, c) => a + c.picks, 0);
        const totalWins = entry.champions.reduce((a, c) => a + c.wins, 0);
        const totalLosses = entry.champions.reduce((a, c) => a + c.losses, 0);
        return (
          <div key={entry.teamId} className="border-b border-rift-line/20 last:border-b-0">
            <button
              type="button"
              onClick={() =>
                setExpandedTeamId(expanded ? null : entry.teamId)
              }
              className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-rift-gold/[0.03] transition-colors"
            >
              <span className="flex items-baseline gap-2">
                <span className="text-rift-mutedbright/55 text-[9px] tabular-nums">
                  #{team.seed}
                </span>
                <span className="font-display tracking-wider text-rift-goldbright text-sm">
                  {team.name}
                </span>
                <span className="text-[9px] uppercase tracking-[0.3em] text-rift-mutedbright/55">
                  {entry.champions.length} champions · {totalPicks} picks · {totalWins}-{totalLosses}
                </span>
              </span>
              <span className="text-rift-gold/60 text-xs">
                {expanded ? "▾" : "▸"}
              </span>
            </button>
            {expanded && (
              <div className="px-3 pb-2.5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {entry.champions.map((c) => {
                  const champ = byId.get(c.championId);
                  if (!champ) return null;
                  const games = c.wins + c.losses;
                  return (
                    <div
                      key={c.championId}
                      className="flex items-center gap-2 border border-rift-line/30 bg-rift-bg/30 px-2 py-1.5"
                    >
                      <img
                        src={champ.iconUrl}
                        alt={champ.name}
                        className="w-8 h-8 border border-rift-line/60 flex-shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="text-[11px] font-display tracking-wider text-rift-mutedbright truncate">
                          {champ.name}
                        </div>
                        <div className="text-[9px] uppercase tracking-[0.2em] text-rift-mutedbright/65">
                          {c.picks}× ·&nbsp;
                          <span className="text-rift-bluebright">{c.wins}W</span>
                          {games > 0 && (
                            <span className="text-rift-redbright">
                              &nbsp;{c.losses}L
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Meta shift panel: surfaces the champions whose tournament W/L most
// disagrees with their pre-tournament tier expectation. Mirrors the AI's
// shrunk-WR computation (3-game prior centered at 50%) so what you see
// is what the AI actually used to bias its drafting.
//
// "Rising" = champion overperforming their base tier (winning more than
// expected; AI gives them a bump). "Falling" = the opposite.
//
// The shift magnitude is the centered shrunk WR (range roughly -0.5 to
// +0.5 with full prior weight). We report it both numerically and via a
// "tier-step" approximation so users can think about the signal in tier
// terms. tier-step ≈ shift × 4 (4 because the AI's bonus caps at ±2
// score points and a tier is worth ~3 points).
interface MetaMover {
  championId: number;
  alias: string;
  baseTier: MetaTier | null;
  baseTierValue: number;
  games: number;
  wins: number;
  losses: number;
  shrunkWR: number;
  shift: number; // shrunkWR - 0.5
}

function computeMetaMovers(
  tournament: TournamentState,
  byId: Map<number, Champion>,
): { rising: MetaMover[]; falling: MetaMover[] } {
  const wr = computeTournamentChampionWR(tournament);
  const PRIOR_GAMES = 3;
  const PRIOR_WR = 0.5;
  const MIN_GAMES = 2;
  const movers: MetaMover[] = [];
  for (const [id, entry] of wr) {
    if (entry.games < MIN_GAMES) continue;
    const champion = byId.get(id);
    if (!champion) continue;
    // Best base tier across the lanes this champion can play.
    let baseTier: MetaTier | null = null;
    let baseTierValue = 0;
    for (const lane of champion.lanes) {
      const t = getMetaTier(champion.alias, lane);
      if (!t) continue;
      const v = TIER_VALUE[t];
      if (v > baseTierValue) {
        baseTier = t;
        baseTierValue = v;
      }
    }
    const shrunkWR =
      (entry.wins + PRIOR_WR * PRIOR_GAMES) / (entry.games + PRIOR_GAMES);
    const shift = shrunkWR - 0.5;
    movers.push({
      championId: id,
      alias: champion.alias,
      baseTier,
      baseTierValue,
      games: entry.games,
      wins: entry.wins,
      losses: entry.games - entry.wins,
      shrunkWR,
      shift,
    });
  }
  // Rising = highest positive shift; falling = lowest (most negative).
  const rising = movers
    .filter((m) => m.shift > 0.05)
    .sort((a, b) => b.shift - a.shift)
    .slice(0, 5);
  const falling = movers
    .filter((m) => m.shift < -0.05)
    .sort((a, b) => a.shift - b.shift)
    .slice(0, 5);
  return { rising, falling };
}

function MetaShiftPanel({
  tournament,
  byId,
}: {
  tournament: TournamentState;
  byId: Map<number, Champion>;
}) {
  const { rising, falling } = useMemo(
    () => computeMetaMovers(tournament, byId),
    [tournament, byId],
  );
  if (rising.length === 0 && falling.length === 0) return null;
  return (
    <div className="border border-rift-line/50 bg-rift-panel/40 p-3 md:p-4">
      <div className="flex items-baseline justify-between mb-3">
        <span className="text-[9px] uppercase tracking-[0.4em] text-rift-gold/70">
          Meta Shift
        </span>
        <span className="text-[8px] uppercase tracking-[0.3em] text-rift-mutedbright/55">
          Tier vs. observed performance
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
        <MoverColumn
          label="Rising"
          rows={rising}
          byId={byId}
          accent="emerald"
        />
        <MoverColumn
          label="Falling"
          rows={falling}
          byId={byId}
          accent="red"
        />
      </div>
    </div>
  );
}

function MoverColumn({
  label,
  rows,
  byId,
  accent,
}: {
  label: string;
  rows: MetaMover[];
  byId: Map<number, Champion>;
  accent: "emerald" | "red";
}) {
  const accentText =
    accent === "emerald" ? "text-emerald-300" : "text-rift-redbright";
  const arrow = accent === "emerald" ? "↑" : "↓";
  return (
    <div>
      <div
        className={`text-[10px] uppercase tracking-[0.35em] mb-1.5 ${accentText}`}
      >
        {arrow} {label}
      </div>
      {rows.length === 0 ? (
        <div className="text-[10px] uppercase tracking-[0.25em] text-rift-mutedbright/40">
          —
        </div>
      ) : (
        <div className="space-y-1.5">
          {rows.map((m) => {
            const c = byId.get(m.championId);
            if (!c) return null;
            const wrPct = Math.round(m.shrunkWR * 100);
            // Tier-step: roughly how many tier slots the observed WR
            // would suggest moving the champion. Capped to the visible
            // tier ladder. Sign matches the column.
            const tierStep = Math.round(m.shift * 4);
            const targetTier = projectTier(m.baseTier, tierStep);
            return (
              <div
                key={c.id}
                className="flex items-center gap-2 border border-rift-line/40 bg-rift-bg/40 px-2 py-1.5"
              >
                <img
                  src={c.iconUrl}
                  alt={c.name}
                  className="w-7 h-7 border border-rift-line/60 flex-shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-display tracking-wider text-rift-mutedbright truncate">
                    {c.name}
                  </div>
                  <div className="text-[9px] uppercase tracking-[0.2em] text-rift-mutedbright/65">
                    {m.wins}-{m.losses} ·&nbsp;
                    <span className={accentText}>{wrPct}% WR</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[8px] uppercase tracking-[0.3em] text-rift-mutedbright/55">
                    Tier
                  </div>
                  <div className="text-[11px] font-display tabular-nums">
                    <span className="text-rift-mutedbright/70">
                      {m.baseTier ?? "—"}
                    </span>
                    {targetTier && targetTier !== m.baseTier && (
                      <>
                        <span className="text-rift-mutedbright/40 mx-0.5">
                          →
                        </span>
                        <span className={accentText}>{targetTier}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Project a base tier up/down by N slots. Clamps to the tier ladder.
// step > 0 = better (S → S+); step < 0 = worse. Returns null when base
// is unknown. Unchanged when base equals "S+" and step is positive.
function projectTier(base: MetaTier | null, step: number): MetaTier | null {
  if (!base) return null;
  const idx = TIER_ORDER.indexOf(base);
  if (idx < 0) return null;
  // TIER_ORDER goes S+, S, A, B, C, D — index 0 is BEST. So a positive
  // step in the user's mental model ("got better") means moving DOWN in
  // index. Negate accordingly.
  const newIdx = Math.max(
    0,
    Math.min(TIER_ORDER.length - 1, idx - step),
  );
  return TIER_ORDER[newIdx];
}

function PresenceTable({
  rows,
  byId,
}: {
  rows: ChampionStat[];
  byId: Map<number, Champion>;
}) {
  return (
    <div className="border border-rift-line/50 bg-rift-panel/40">
      <div className="px-3 py-2 border-b border-rift-line/40 flex items-baseline justify-between">
        <span className="text-[9px] uppercase tracking-[0.4em] text-rift-gold/70">
          Presence
        </span>
        <span className="text-[8px] uppercase tracking-[0.3em] text-rift-mutedbright/55">
          Picks + Bans + Games
        </span>
      </div>
      <div className="grid grid-cols-[2rem_1fr_2.5rem_2.5rem_2.5rem_3rem] gap-2 px-3 py-1.5 border-b border-rift-line/30 text-[8px] uppercase tracking-[0.3em] text-rift-gold/55">
        <span></span>
        <span>Champion</span>
        <span className="text-center" title="Picks">P</span>
        <span className="text-center" title="Bans">B</span>
        <span className="text-center" title="Games">G</span>
        <span className="text-center" title="Total presence (P+B+G)">Σ</span>
      </div>
      {rows.length === 0 && (
        <div className="px-3 py-3 text-[10px] uppercase tracking-[0.25em] text-rift-mutedbright/55">
          No data
        </div>
      )}
      {rows.map((stat) => {
        const c = byId.get(stat.championId);
        if (!c) return null;
        const games = stat.wins + stat.losses;
        const total = stat.picks + stat.bans + games;
        return (
          <div
            key={c.id}
            className="grid grid-cols-[2rem_1fr_2.5rem_2.5rem_2.5rem_3rem] gap-2 px-3 py-1.5 border-b border-rift-line/20 last:border-b-0 text-[10px] md:text-[11px] items-center"
          >
            <img
              src={c.iconUrl}
              alt={c.name}
              className="w-6 h-6 border border-rift-line"
            />
            <span className="truncate font-display tracking-wider text-rift-mutedbright">
              {c.name}
            </span>
            <span className="text-center tabular-nums text-rift-bluebright">
              {stat.picks}
            </span>
            <span className="text-center tabular-nums text-rift-redbright">
              {stat.bans}
            </span>
            <span className="text-center tabular-nums text-rift-mutedbright/85">
              {games}
            </span>
            <span className="text-center tabular-nums text-rift-goldbright/85 font-display">
              {total}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function WinRateTable({
  rows,
  byId,
  title = "Win Rate",
  subtitle = "Min 3 games",
  emptyMessage = "No champion has played 3+ games yet",
}: {
  rows: ChampionStat[];
  byId: Map<number, Champion>;
  title?: string;
  subtitle?: string;
  emptyMessage?: string;
}) {
  return (
    <div className="border border-rift-line/50 bg-rift-panel/40">
      <div className="px-3 py-2 border-b border-rift-line/40 flex items-baseline justify-between">
        <span className="text-[9px] uppercase tracking-[0.4em] text-rift-gold/70">
          {title}
        </span>
        <span className="text-[8px] uppercase tracking-[0.3em] text-rift-mutedbright/55">
          {subtitle}
        </span>
      </div>
      <div className="grid grid-cols-[2rem_1fr_3.5rem_3rem_3.5rem] gap-2 px-3 py-1.5 border-b border-rift-line/30 text-[8px] uppercase tracking-[0.3em] text-rift-gold/55">
        <span></span>
        <span>Champion</span>
        <span className="text-center" title="Wins-Losses">W-L</span>
        <span className="text-center" title="Games played">G</span>
        <span className="text-center" title="Win Rate">WR</span>
      </div>
      {rows.length === 0 && (
        <div className="px-3 py-3 text-[10px] uppercase tracking-[0.25em] text-rift-mutedbright/55">
          {emptyMessage}
        </div>
      )}
      {rows.map((stat) => {
        const c = byId.get(stat.championId);
        if (!c) return null;
        const games = stat.wins + stat.losses;
        const wrPct =
          stat.winRate != null ? Math.round(stat.winRate * 100) : null;
        const wrCls =
          wrPct == null
            ? "text-rift-mutedbright/40"
            : wrPct >= 60
            ? "text-emerald-300"
            : wrPct < 40
            ? "text-rift-redbright"
            : "text-rift-mutedbright";
        return (
          <div
            key={c.id}
            className="grid grid-cols-[2rem_1fr_3.5rem_3rem_3.5rem] gap-2 px-3 py-1.5 border-b border-rift-line/20 last:border-b-0 text-[10px] md:text-[11px] items-center"
          >
            <img
              src={c.iconUrl}
              alt={c.name}
              className="w-6 h-6 border border-rift-line"
            />
            <span className="truncate font-display tracking-wider text-rift-mutedbright">
              {c.name}
            </span>
            <span className="text-center tabular-nums text-rift-mutedbright/85">
              {stat.wins}-{stat.losses}
            </span>
            <span className="text-center tabular-nums text-rift-mutedbright/65">
              {games}
            </span>
            <span className={`text-center tabular-nums font-display ${wrCls}`}>
              {wrPct != null ? `${wrPct}%` : "—"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Standings table (round-robin) ────────────────────────────────────

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
function RoundRobinView({
  tournament,
  rounds,
  reviewMode,
  onStartMatch,
  onViewMatch,
}: {
  tournament: TournamentState;
  rounds: TournamentMatch[][];
  reviewMode: boolean;
  onStartMatch: (matchId: string) => void;
  onViewMatch: (matchId: string) => void;
}) {
  const simulateMatches = useDraftStore((s) => s.simulateMatches);
  const generatePlayoffBracket = useDraftStore(
    (s) => s.generatePlayoffBracket,
  );
  const isRRPlayoffs = tournament.format === "round-robin-playoffs";
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
        <StandingsTable tournament={tournament} />
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
                      onView={
                        reviewMode ? () => onViewMatch(m.id) : undefined
                      }
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
          onViewMatch={reviewMode ? onViewMatch : undefined}
        />
      )}
    </div>
  );
}

// Reusable playoff bracket section — renders either a single-elim
// column layout or a double-elim winners + losers + grand-final stack
// depending on `kind`. Used by SwissView, GroupsPlayoffsView, and the
// round-robin-playoffs branch of RoundRobinView so the same code paths
// drive every stage-format playoff bracket.
function PlayoffBracketSection({
  tournament,
  playoffMatches,
  kind,
  advancing,
  onStartMatch,
  onViewMatch,
}: {
  tournament: TournamentState;
  playoffMatches: TournamentMatch[];
  kind: "single-elim" | "double-elim";
  advancing: number;
  onStartMatch: (matchId: string) => void;
  onViewMatch?: (matchId: string) => void;
}) {
  // Group matches by round for SE rendering. DE gets its own filter
  // path further down.
  const seRoundsByRound: TournamentMatch[][] = useMemo(() => {
    if (kind !== "single-elim") return [];
    const max = playoffMatches.reduce((acc, m) => Math.max(acc, m.round), 0);
    const out: TournamentMatch[][] = [];
    for (let r = 1; r <= max; r++) {
      const inRound = playoffMatches.filter((m) => m.round === r);
      if (inRound.length > 0) out.push(inRound);
    }
    return out;
  }, [playoffMatches, kind]);

  // Pre-split DE buckets — saved here once so the JSX below stays clean.
  const winners = useMemo(
    () =>
      kind === "double-elim"
        ? playoffMatches.filter((m) => m.bracket === "winners")
        : [],
    [playoffMatches, kind],
  );
  const losers = useMemo(
    () =>
      kind === "double-elim"
        ? playoffMatches.filter((m) => m.bracket === "losers")
        : [],
    [playoffMatches, kind],
  );
  const grandFinal =
    kind === "double-elim"
      ? playoffMatches.find((m) => m.bracket === "grand-final") ?? null
      : null;
  const grandFinalReset =
    kind === "double-elim"
      ? playoffMatches.find((m) => m.bracket === "grand-final-reset") ?? null
      : null;

  const groupByRound = (matches: TournamentMatch[]): TournamentMatch[][] => {
    const max = matches.reduce((acc, m) => Math.max(acc, m.round), 0);
    const minRound = matches.reduce(
      (acc, m) => Math.min(acc, m.round),
      Number.POSITIVE_INFINITY,
    );
    const out: TournamentMatch[][] = [];
    if (!Number.isFinite(minRound)) return out;
    for (let r = minRound; r <= max; r++) {
      const inRound = matches.filter((m) => m.round === r);
      if (inRound.length > 0) out.push(inRound);
    }
    return out;
  };
  const winnersByRound = groupByRound(winners);
  const losersByRound = groupByRound(losers);

  return (
    <section>
      <div className="flex items-baseline justify-between mb-3 pb-2 border-b-2 border-rift-gold/40">
        <div>
          <div className="text-[10px] uppercase tracking-[0.4em] text-rift-gold/70">
            Knockout Stage
          </div>
          <div className="font-display text-2xl tracking-wider text-rift-goldbright">
            Playoffs
          </div>
        </div>
        <div className="text-[9px] uppercase tracking-[0.3em] text-rift-mutedbright/60">
          {kind === "double-elim" ? "Double-Elim" : "Single-Elim"} ·{" "}
          {advancing} teams
        </div>
      </div>

      {kind === "single-elim" ? (
        <div className="overflow-x-auto pb-2">
          <div
            className="inline-flex items-stretch gap-4 md:gap-6 min-w-full"
            style={{ minWidth: `${seRoundsByRound.length * 220}px` }}
          >
            {seRoundsByRound.map((roundMatches, idx) => (
              <RoundColumn
                key={idx}
                round={idx + 1}
                totalRounds={seRoundsByRound.length}
                matches={roundMatches}
                tournament={tournament}
                onStartMatch={onStartMatch}
                onViewMatch={onViewMatch}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div>
            <div className="text-[10px] uppercase tracking-[0.4em] text-rift-gold/70 mb-2">
              Winners Bracket
            </div>
            <div className="overflow-x-auto pb-2">
              <div
                className="inline-flex items-stretch gap-4 md:gap-6 min-w-full"
                style={{ minWidth: `${winnersByRound.length * 220}px` }}
              >
                {winnersByRound.map((roundMatches, idx) => (
                  <RoundColumn
                    key={idx}
                    round={idx + 1}
                    totalRounds={winnersByRound.length}
                    matches={roundMatches}
                    tournament={tournament}
                    onStartMatch={onStartMatch}
                    onViewMatch={onViewMatch}
                  />
                ))}
              </div>
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.4em] text-rift-redbright/65 mb-2">
              Losers Bracket
            </div>
            <div className="overflow-x-auto pb-2">
              <div
                className="inline-flex items-stretch gap-4 md:gap-6 min-w-full"
                style={{ minWidth: `${losersByRound.length * 220}px` }}
              >
                {losersByRound.map((roundMatches, idx) => (
                  <LosersRoundColumn
                    key={idx}
                    round={idx + 1}
                    totalRounds={losersByRound.length}
                    matches={roundMatches}
                    tournament={tournament}
                    onStartMatch={onStartMatch}
                    onViewMatch={onViewMatch}
                  />
                ))}
              </div>
            </div>
          </div>
          {grandFinal && (
            <div>
              <div className="text-[10px] uppercase tracking-[0.4em] text-rift-gold mb-2">
                Grand Final
              </div>
              <div className="max-w-md">
                <MatchCard
                  match={grandFinal}
                  tournament={tournament}
                  onStart={() => onStartMatch(grandFinal.id)}
                  onView={
                    onViewMatch ? () => onViewMatch(grandFinal.id) : undefined
                  }
                />
              </div>
              {!grandFinalReset && (
                <div className="text-[8px] uppercase tracking-[0.3em] text-rift-mutedbright/40 mt-1">
                  W-side wins outright. L-side win forces a bracket reset.
                </div>
              )}
            </div>
          )}
          {grandFinalReset && (
            <div>
              <div className="text-[10px] uppercase tracking-[0.4em] text-rift-gold mb-2">
                Grand Final · Reset
              </div>
              <div className="max-w-md">
                <MatchCard
                  match={grandFinalReset}
                  tournament={tournament}
                  onStart={() => onStartMatch(grandFinalReset.id)}
                  onView={
                    onViewMatch
                      ? () => onViewMatch(grandFinalReset.id)
                      : undefined
                  }
                />
              </div>
              <div className="text-[8px] uppercase tracking-[0.3em] text-rift-gold/60 mt-1">
                L-side forced a reset — this match decides the tournament.
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// Groups + playoffs view: visually distinct from round-robin to make
// the two-stage shape obvious. Group stage renders as a labelled
// "Group A" panel with a highlighted advancing-zone in the standings.
// Playoff bracket sits below in a tournament-tree layout once started.
function GroupsPlayoffsView({
  tournament,
  reviewMode,
  onStartMatch,
  onViewMatch,
}: {
  tournament: TournamentState;
  rounds: TournamentMatch[][];
  reviewMode: boolean;
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
            <button
              type="button"
              onClick={() => simulateMatches(groupStagePendingIds)}
              className="px-2.5 py-1 border border-rift-gold/60 text-rift-goldbright hover:bg-rift-gold/10 text-[9px] uppercase tracking-[0.3em] transition-all"
              title="Auto-play all remaining group-stage matches"
            >
              Sim Group Stage
            </button>
          )}
        </div>
      </div>

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
            reviewMode={reviewMode}
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
          onViewMatch={reviewMode ? onViewMatch : undefined}
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
  reviewMode,
  onStartMatch,
  onViewMatch,
}: {
  tournament: TournamentState;
  groupId: string;
  advancingPerGroup: number;
  reviewMode: boolean;
  onStartMatch: (matchId: string) => void;
  onViewMatch: (matchId: string) => void;
}) {
  const standings = useMemo(
    () => computeGroupStandings(tournament, groupId),
    [tournament, groupId],
  );
  // Group this group's matches by round.
  const groupMatches = useMemo(
    () => tournament.matches.filter((m) => m.groupId === groupId),
    [tournament.matches, groupId],
  );
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
        <div className="text-[9px] uppercase tracking-[0.3em] text-rift-mutedbright/55 tabular-nums">
          {done}/{groupMatches.length}
        </div>
      </div>
      <div className="p-2">
        <GroupStandingsTable
          standings={standings}
          advancingTeams={advancingPerGroup}
          tournament={tournament}
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
                  onView={reviewMode ? () => onViewMatch(m.id) : undefined}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Group standings: like the round-robin table but with an explicit
// horizontal divider after row N (advancingTeams), with the advancing
// rows tinted gold and the eliminated rows tinted muted.
function GroupStandingsTable({
  standings,
  advancingTeams,
  tournament,
}: {
  standings: TeamStanding[];
  advancingTeams: number;
  tournament: TournamentState;
}) {
  return (
    <div className="border border-rift-line/50 bg-rift-panel/40">
      <div className="grid grid-cols-[2.5rem_1fr_3rem_3rem_3.5rem_3.5rem] gap-2 px-3 py-2 border-b border-rift-line/40 text-[8px] uppercase tracking-[0.3em] text-rift-gold/60">
        <span>#</span>
        <span>Team</span>
        <span className="text-center" title="Played: matches played">P</span>
        <span className="text-center" title="Match wins">W</span>
        <span className="text-center" title="Match losses">L</span>
        <span className="text-center" title="Game differential (gamesWon − gamesLost). Tiebreaker after head-to-head.">+/-</span>
      </div>
      {standings.map((row, idx) => {
        const isAdvancing = row.rank <= advancingTeams;
        const isCutLine = row.rank === advancingTeams;
        const rowCls = isAdvancing
          ? row.rank === 1 && tournament.status === "complete"
            ? "bg-rift-gold/15 text-rift-goldbright"
            : "text-rift-bluebright bg-rift-blue/[0.04]"
          : "text-rift-mutedbright/65";
        return (
          <div key={row.team.id}>
            <div
              className={`grid grid-cols-[2.5rem_1fr_3rem_3rem_3.5rem_3.5rem] gap-2 px-3 py-1.5 border-b border-rift-line/20 last:border-b-0 text-[11px] md:text-xs items-baseline ${rowCls}`}
            >
              <span className="font-display tabular-nums">
                {row.rank}
                {isAdvancing && (
                  <span className="text-emerald-300/80 ml-0.5">▲</span>
                )}
              </span>
              <span className="truncate">
                <span className="text-rift-mutedbright/60 mr-2 tabular-nums text-[9px]">
                  #{row.team.seed}
                </span>
                {row.team.name}
              </span>
              <span className="text-center tabular-nums">{row.played}</span>
              <span className="text-center tabular-nums text-rift-bluebright">
                {row.wins}
              </span>
              <span className="text-center tabular-nums text-rift-redbright">
                {row.losses}
              </span>
              <span
                className={`text-center tabular-nums ${
                  row.gameDiff > 0
                    ? "text-emerald-300"
                    : row.gameDiff < 0
                    ? "text-rift-redbright"
                    : "text-rift-mutedbright/60"
                }`}
              >
                {row.gameDiff > 0 ? "+" : ""}
                {row.gameDiff}
              </span>
            </div>
            {isCutLine && idx < standings.length - 1 && (
              <div className="px-3 py-0.5 text-[8px] uppercase tracking-[0.4em] text-rift-mutedbright/50 border-b border-dashed border-rift-gold/40 bg-rift-bg/40 text-center">
                — playoff cutline —
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Swiss view: standings on top, then a horizontal column-per-round
// layout (similar to single-elim bracket). Each round shows pairings
// stacked vertically with both teams' pre-round W-L records.
//
// For swiss-playoffs, the playoff bracket renders below once the user
// promotes top-N teams — same horizontal column layout as single-elim.
function SwissView({
  tournament,
  rounds: _rounds,
  reviewMode,
  onStartMatch,
  onViewMatch,
}: {
  tournament: TournamentState;
  rounds: TournamentMatch[][];
  reviewMode: boolean;
  onStartMatch: (matchId: string) => void;
  onViewMatch: (matchId: string) => void;
}) {
  const simulateMatches = useDraftStore((s) => s.simulateMatches);
  const generatePlayoffBracket = useDraftStore(
    (s) => s.generatePlayoffBracket,
  );
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

  const swissStageComplete =
    swissRounds.length >= total &&
    swissMatches.length > 0 &&
    swissMatches.every((m) => m.winner != null);
  const allSwissPendingIds = swissMatches
    .filter((m) => !m.winner && m.blueTeamId && m.redTeamId)
    .map((m) => m.id);
  const isSwissPlayoffs =
    tournament.format === "swiss-playoffs" ||
    tournament.format === "swiss-playoffs-de";
  const playoffStarted = tournament.swissPlayoffsStarted ?? false;
  const advancing = tournament.swissPlayoffsAdvancing ?? 0;
  const playoffKind = playoffBracketKindFor(tournament.format);

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
              Round {Math.min(swissRounds.length, currentRoundIdx + 1)} of {total}
            </span>
            {allSwissPendingIds.length > 0 && (
              <button
                type="button"
                onClick={() => simulateMatches(allSwissPendingIds)}
                className="px-2.5 py-1 border border-rift-gold/60 text-rift-goldbright hover:bg-rift-gold/10 text-[9px] uppercase tracking-[0.3em] transition-all"
                title="Auto-play every remaining match in the Swiss stage"
              >
                Sim Swiss Stage
              </button>
            )}
          </div>
        </div>
        <SwissStandingsTable tournament={tournament} />
      </div>

      {isSwissPlayoffs && swissStageComplete && !playoffStarted && (
        <button
          type="button"
          onClick={generatePlayoffBracket}
          className="w-full py-3 border-2 border-rift-gold bg-rift-gold/10 text-rift-goldbright hover:bg-rift-gold/20 font-display text-sm tracking-[0.3em] uppercase transition-all"
        >
          Lock In Standings → Generate Playoff Bracket (Top {advancing})
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
                  onViewMatch={reviewMode ? onViewMatch : undefined}
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
          onViewMatch={reviewMode ? onViewMatch : undefined}
        />
      )}
    </div>
  );
}

// One Swiss round rendered as a vertical column (mirrors single-elim
// RoundColumn). Header includes the round label, completion ratio, and
// a Sim Round button when there are pending matches.
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
      <div className="flex-1 flex flex-col gap-2">
        {notStarted ? (
          <div className="text-[9px] uppercase tracking-[0.3em] text-rift-mutedbright/40 text-center py-3">
            Pairs after prior round resolves
          </div>
        ) : (
          matches.map((m) => (
            <SwissPairingRow
              key={m.id}
              match={m}
              tournament={tournament}
              preRoundRecord={preRoundRecord}
              onStart={() => onStartMatch(m.id)}
              onView={onViewMatch ? () => onViewMatch(m.id) : undefined}
            />
          ))
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
  const blueTeam = getTeam(tournament, match.blueTeamId);
  const redTeam = getTeam(tournament, match.redTeamId);
  const blueRec = blueTeam ? preRoundRecord.get(blueTeam.id) : null;
  const redRec = redTeam ? preRoundRecord.get(redTeam.id) : null;
  const winner = match.winner;
  const blueWon = winner && winner.teamId === match.blueTeamId;
  const redWon = winner && winner.teamId === match.redTeamId;
  const ready = blueTeam && redTeam && !winner;
  return (
    <div className="border border-rift-line/40 bg-rift-bg/30 px-2 py-1.5">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <SwissTeamSlot
          team={blueTeam}
          record={blueRec}
          side="blue"
          isWinner={!!blueWon}
        />
        <span className="text-[10px] uppercase tracking-[0.3em] text-rift-mutedbright/50 tabular-nums">
          {winner ? `${winner.blueWins}–${winner.redWins}` : "vs"}
        </span>
        <SwissTeamSlot
          team={redTeam}
          record={redRec}
          side="red"
          isWinner={!!redWon}
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

function SwissTeamSlot({
  team,
  record,
  side,
  isWinner,
  alignRight,
}: {
  team: TournamentTeam | null;
  record: { w: number; l: number } | null | undefined;
  side: Side;
  isWinner: boolean;
  alignRight?: boolean;
}) {
  const accent =
    side === "blue" ? "text-rift-bluebright" : "text-rift-redbright";
  const winnerCls = isWinner ? "text-rift-goldbright" : accent;
  return (
    <div
      className={`min-w-0 ${alignRight ? "text-right" : "text-left"}`}
    >
      <div className={`font-display text-[12px] tracking-wider truncate ${winnerCls}`}>
        {team?.name ?? "TBD"}
      </div>
      {record && (
        <div className="text-[8px] uppercase tracking-[0.25em] text-rift-mutedbright/60 tabular-nums">
          {record.w}-{record.l}
        </div>
      )}
    </div>
  );
}

function SwissStandingsTable({
  tournament,
}: {
  tournament: TournamentState;
}) {
  const standings = computeSwissStandings(tournament);
  return (
    <div className="border border-rift-line/50 bg-rift-panel/40">
      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          <div className="grid grid-cols-[2.5rem_1fr_2.5rem_2.5rem_2.5rem_3.5rem_2.75rem_3rem] gap-2 px-3 py-2 border-b border-rift-line/40 text-[8px] uppercase tracking-[0.3em] text-rift-gold/60">
            <span>#</span>
            <span>Team</span>
            <span className="text-center" title="Played: total matches played">P</span>
            <span className="text-center" title="Match wins (entire matches won)">W</span>
            <span className="text-center" title="Match losses (entire matches lost)">L</span>
            <span className="text-center" title="Games W-L: individual games won and lost across all matches (a Bo3 win 2-1 contributes 2 wins and 1 loss)">G W-L</span>
            <span className="text-center" title="Buchholz: sum of every opponent's match wins. Higher = harder schedule.">Bch</span>
            <span className="text-center" title="Median Buchholz: Buchholz with the highest and lowest opponent dropped. Less swayed by extreme schedules.">M-Bch</span>
          </div>
        {standings.map((row) => {
          const isLead = row.rank === 1 && row.played > 0;
          const isDecided = tournament.status === "complete" && row.rank === 1;
          const rowCls = isDecided
            ? "bg-rift-gold/10 text-rift-goldbright"
            : isLead
            ? "text-rift-bluebright"
            : "text-rift-mutedbright";
          return (
            <div
              key={row.team.id}
              className={`grid grid-cols-[2.5rem_1fr_2.5rem_2.5rem_2.5rem_3.5rem_2.75rem_3rem] gap-2 px-3 py-1.5 border-b border-rift-line/20 last:border-b-0 text-[11px] md:text-xs items-baseline ${rowCls}`}
            >
              <span className="font-display tabular-nums text-rift-goldbright/80">
                {row.rank}
              </span>
              <span className="truncate">
                <span className="text-rift-mutedbright/60 mr-2 tabular-nums text-[9px]">
                  #{row.team.seed}
                </span>
                {row.team.name}
              </span>
              <span className="text-center tabular-nums">{row.played}</span>
              <span className="text-center tabular-nums text-rift-bluebright">
                {row.wins}
              </span>
              <span className="text-center tabular-nums text-rift-redbright">
                {row.losses}
              </span>
              <span className="text-center tabular-nums text-rift-mutedbright/85">
                {row.gamesWon}-{row.gamesLost}
              </span>
              <span className="text-center tabular-nums text-rift-mutedbright/70">
                {row.buchholz}
              </span>
              <span className="text-center tabular-nums">{row.medianBuchholz}</span>
            </div>
          );
        })}
        </div>
      </div>
      <SwissStandingsLegend />
    </div>
  );
}

// Inline legend explaining the abbreviated column headers. Sits below
// the table so users have a glanceable reference for "G W-L", "Bch",
// and "M-Bch" without needing to hover for tooltips.
function SwissStandingsLegend() {
  return (
    <div className="px-3 py-1.5 border-t border-rift-line/30 grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-0.5 text-[9px] text-rift-mutedbright/60">
      <span>
        <span className="text-rift-gold/70 font-display tracking-wider">G W-L</span>{" "}
        — games won-lost (within Bo3/Bo5)
      </span>
      <span>
        <span className="text-rift-gold/70 font-display tracking-wider">Bch</span>{" "}
        — Buchholz: sum of opponents&rsquo; wins
      </span>
      <span>
        <span className="text-rift-gold/70 font-display tracking-wider">M-Bch</span>{" "}
        — Median Buchholz (high/low dropped)
      </span>
    </div>
  );
}

function StandingsTable({ tournament }: { tournament: TournamentState }) {
  const standings = computeStandings(tournament);
  return (
    <div className="border border-rift-line/50 bg-rift-panel/40 overflow-x-auto">
      <div className="min-w-[560px]">
      <div className="grid grid-cols-[2.5rem_1fr_2.5rem_2.5rem_2.5rem_3.5rem_3rem] gap-2 px-3 py-2 border-b border-rift-line/40 text-[8px] uppercase tracking-[0.3em] text-rift-gold/60">
        <span>#</span>
        <span>Team</span>
        <span className="text-center" title="Played: total matches played">P</span>
        <span className="text-center" title="Match wins (entire matches won)">W</span>
        <span className="text-center" title="Match losses (entire matches lost)">L</span>
        <span className="text-center" title="Games W-L: individual games won and lost across all matches (a Bo3 win 2-1 contributes 2 wins and 1 loss)">G W-L</span>
        <span className="text-center" title="Game differential (gamesWon − gamesLost). Tiebreaker after head-to-head.">+/-</span>
      </div>
      {standings.map((row) => {
        const isLead = row.rank === 1 && row.played > 0;
        const isDecided = tournament.status === "complete" && row.rank === 1;
        const rowCls = isDecided
          ? "bg-rift-gold/10 text-rift-goldbright"
          : isLead
          ? "text-rift-bluebright"
          : "text-rift-mutedbright";
        return (
          <div
            key={row.team.id}
            className={`grid grid-cols-[2.5rem_1fr_2.5rem_2.5rem_2.5rem_3.5rem_3rem] gap-2 px-3 py-1.5 border-b border-rift-line/20 last:border-b-0 text-[11px] md:text-xs items-baseline ${rowCls}`}
          >
            <span className="font-display tabular-nums text-rift-goldbright/80">
              {row.rank}
            </span>
            <span className="truncate">
              <span className="text-rift-mutedbright/60 mr-2 tabular-nums text-[9px]">
                #{row.team.seed}
              </span>
              {row.team.name}
            </span>
            <span className="text-center tabular-nums">{row.played}</span>
            <span className="text-center tabular-nums text-rift-bluebright">
              {row.wins}
            </span>
            <span className="text-center tabular-nums text-rift-redbright">
              {row.losses}
            </span>
            <span className="text-center tabular-nums text-rift-mutedbright/85">
              {row.gamesWon}-{row.gamesLost}
            </span>
            <span
              className={`text-center tabular-nums ${
                row.gameDiff > 0
                  ? "text-rift-bluebright"
                  : row.gameDiff < 0
                  ? "text-rift-redbright"
                  : ""
              }`}
            >
              {row.gameDiff > 0 ? "+" : ""}
              {row.gameDiff}
            </span>
          </div>
        );
      })}
      </div>
    </div>
  );
}

// Header label per tournament format. Keep in sync with the option list
// in TournamentSetup so the dashboard echoes the same wording the user
// picked. New stage+playoff variants get explicit two-word labels so
// the format is unambiguous at a glance.
function formatHeaderLabel(format: TournamentState["format"]): string {
  switch (format) {
    case "single-elim":
      return "Single Elimination";
    case "double-elim":
      return "Double Elimination";
    case "round-robin":
      return "Round Robin";
    case "swiss":
      return "Swiss";
    case "swiss-playoffs":
      return "Swiss + Playoffs";
    case "swiss-playoffs-de":
      return "Swiss + DE Playoffs";
    case "groups-playoffs":
      return "Groups + Playoffs";
    case "groups-playoffs-de":
      return "Groups + DE Playoffs";
    case "round-robin-playoffs":
      return "Round Robin + DE Playoffs";
    default:
      return "Tournament";
  }
}

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

// Live in-tournament meta panel. Renders a compact table of the
// champions with the most picks/games-played so the user can watch the
// AI-relevant meta evolve as matches resolve. Sample size is small early
// on (the AI applies Bayesian shrinkage, so a 1-game outlier doesn't
// dominate scoring), so we surface games-played alongside WR to set
// expectations. Hidden when no champion has played a recorded game yet.
function LiveChampionMetaPanel({ tournament }: { tournament: TournamentState }) {
  const champions = useDraftStore((s) => s.champions);
  const byId = useMemo(
    () => new Map(champions.map((c) => [c.id, c])),
    [champions],
  );
  // Use the same WR computation the AI sees so what's displayed equals
  // what's influencing draft decisions.
  const rows = useMemo(() => {
    const wr = computeTournamentChampionWR(tournament);
    const out: { id: number; games: number; wins: number; winRate: number }[] = [];
    for (const [id, e] of wr) {
      out.push({ id, games: e.games, wins: e.wins, winRate: e.winRate });
    }
    // Sort by sample size (more games = more confident signal), then by
    // win rate descending. Cap at 8 rows to keep the panel compact.
    out.sort((a, b) => {
      if (b.games !== a.games) return b.games - a.games;
      return b.winRate - a.winRate;
    });
    return out.slice(0, 8);
  }, [tournament]);

  if (rows.length === 0) return null;
  return (
    <div className="mb-6 border border-rift-line/50 bg-rift-panel/40 p-3 md:p-4">
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-[10px] uppercase tracking-[0.4em] text-rift-gold/70">
          In-Tournament Meta
        </div>
        <div className="text-[9px] uppercase tracking-[0.25em] text-rift-mutedbright/55">
          AI shifts toward winning champions
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {rows.map((r) => {
          const champ = byId.get(r.id);
          if (!champ) return null;
          const wrPct = Math.round(r.winRate * 100);
          const wrColor =
            r.winRate >= 0.6
              ? "text-emerald-300"
              : r.winRate <= 0.4
              ? "text-rift-redbright"
              : "text-rift-mutedbright";
          return (
            <div
              key={r.id}
              className="flex items-center gap-2 border border-rift-line/40 bg-rift-bg/40 px-2 py-1.5"
            >
              <img
                src={champ.iconUrl}
                alt={champ.name}
                className="w-7 h-7 border border-rift-line/60 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-display tracking-wider text-rift-mutedbright truncate">
                  {champ.name}
                </div>
                <div className="text-[9px] uppercase tracking-[0.2em] text-rift-mutedbright/60">
                  {r.games}G · <span className={wrColor}>{wrPct}% WR</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Compact star-rating badge for the dashboard. Renders just the count of
// filled stars in gold so it's recognizable at a glance without taking
// much horizontal space on dense match cards.
// Full-screen "simulating" overlay shown while a Sim All / Sim One
// pass is in progress. The store sets `simulating` true on the same
// render cycle the user clicks the button, then defers the actual sim
// to the next tick — so the overlay paints first and the user gets
// feedback before the (synchronous) sim work blocks the main thread.
function SimulatingOverlay({ scope }: { scope: "match" | "all" }) {
  const label = scope === "all" ? "Simulating remaining matches…" : "Simulating match…";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm pointer-events-auto">
      <div className="border-2 border-rift-gold/60 bg-rift-panel px-8 py-6 text-center shadow-glow-gold">
        <div className="flex items-center justify-center mb-3">
          <div className="w-6 h-6 border-2 border-rift-gold/30 border-t-rift-goldbright rounded-full animate-spin" />
        </div>
        <div className="font-display text-sm md:text-base tracking-[0.3em] uppercase text-rift-goldbright">
          {label}
        </div>
        <div className="text-[9px] uppercase tracking-[0.3em] text-rift-mutedbright/60 mt-1.5">
          Drafting + sim running
        </div>
      </div>
    </div>
  );
}

function StarsBadge({ rating }: { rating: number }) {
  const safe = Math.max(1, Math.min(5, Math.round(rating)));
  // Empty stars used `text-rift-line` previously, which is too dark
  // against the panel background — they appeared invisible. Faded
  // gold (rift-gold/30) keeps the contrast hierarchy (filled brighter
  // than empty) while staying readable on the dark theme.
  return (
    <span
      className="text-[9px] tracking-tight tabular-nums leading-none flex-shrink-0 whitespace-nowrap"
      title={`Rating: ${safe}/5`}
    >
      <span className="text-rift-gold">{"★".repeat(safe)}</span>
      <span className="text-rift-gold/30">{"★".repeat(5 - safe)}</span>
    </span>
  );
}
