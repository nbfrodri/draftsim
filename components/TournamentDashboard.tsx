"use client";
import { useEscapeLayer } from "@/lib/useEscapeLayer";

import { lazy,Suspense,useEffect,useMemo,useState } from "react";

import { isDesktop,saveFileNative } from "@/lib/desktopStorage";
import {
feederEventOf,
qualifiedForInternational,
qualifierTag,
} from "@/lib/season/engine";
import {
encodeTournament,
matchesByRound,
tournamentChampion
} from "@/lib/tournament";
import { useDraftStore } from "@/store/draftStore";
import MetaPanel from "./MetaPanel";
import Modal from "./Modal";
import { QualifierTagView,type QualifierTagInfo } from "./QualifierBadge";
import TeamIcon from "./TeamIcon";

// ─── Bracket sub-modules ──────────────────────────────────────────────
import { BracketConnectorRoot } from "./tournament/bracket/BracketConnectors";
import { DoubleElimView,Header,RoundColumn,TripleElimView } from "./tournament/bracket/BracketViews";
import {
ReplayLoadingOverlay,
SaveTournamentModal,
SimulatingOverlay,
} from "./tournament/bracket/DashboardModals";
import { GroupsPlayoffsView,RoundRobinView,SwissView } from "./tournament/bracket/FormatViews";
import { LiveChampionMetaPanel,MetaEvolutionFeed } from "./tournament/bracket/LiveChampionMetaPanel";
import { MatchOverrideModal } from "./tournament/bracket/MatchOverrideModal";
import { StreaksPanel } from "./tournament/bracket/StreaksPanel";

// ─── Replay sub-module (lazy — pulls in recharts + recap panels) ─────
const MatchReplayModal = lazy(() =>
  import("./tournament/replay/MatchReplayModal").then((m) => ({
    default: m.MatchReplayModal,
  })),
);

// ─── Recap sub-module ─────────────────────────────────────────────────
import { PostTournamentRecap } from "./tournament/recap/PostTournamentRecap";

import type { MatchOverride } from "./tournament/shared";

// Top-level dashboard: header (tournament name + status), bracket view,
// and exit affordance. The bracket view delegates per-match rendering to
// MatchCard. Clicking a pending match opens the existing draft flow via
// the store's startMatch action; routing back to the dashboard happens
// when the match's series is cleared in finishMatch.

export default function TournamentDashboard() {
  const tournament = useDraftStore((s) => s.tournament)!;
  const season = useDraftStore((s) => s.season);
  const startMatch = useDraftStore((s) => s.startMatch);
  const saveCurrentTournament = useDraftStore((s) => s.saveCurrentTournament);
  const exitTournament = useDraftStore((s) => s.exitTournament);
  const simulateAllRemaining = useDraftStore((s) => s.simulateAllRemaining);
  const simulating = useDraftStore((s) => s.simulating);
  const [exitOpen, setExitOpen] = useState(false);
  useEscapeLayer(true, () => setExitOpen(true), 0);
  // Match the user is configuring before launching. null = no modal open.
  const [pendingMatchId, setPendingMatchId] = useState<string | null>(null);
  // Match the user is reviewing post-tournament. null = no modal open.
  // Set when a completed MatchCard is clicked once the tournament status
  // is "complete". Distinct from pendingMatchId — that one starts a match.
  const [viewMatchId, setViewMatchId] = useState<string | null>(null);
  // Which game index inside the viewed match to land on. Reset to 0 on
  // every match-card click; the post-tournament "Notable Games" panel
  // sets this to deep-link straight to (e.g.) the longest game.
  const [viewGameIdx, setViewGameIdx] = useState(0);
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

  // Single effect that owns the auto-clear timer for exportFeedback.
  // Clears the previous timeout on every feedback change to avoid
  // setState-after-unmount from stale inline setTimeout calls.
  useEffect(() => {
    if (!exportFeedback) return;
    const id = setTimeout(() => setExportFeedback(null), 2500);
    return () => clearTimeout(id);
  }, [exportFeedback]);

  // Save = snapshot the full tournament state (bracket, recaps, evolved
  // meta, pick histories) into the local Saved Tournaments list on the
  // main menu. Distinct from Export, which produces a shareable file/code.
  const handleSave = () => {
    const ok = saveCurrentTournament();
    setExportFeedback(ok ? "Saved — see Saved Tournaments on the main menu" : "Save failed");
  };

  const handleExport = async () => {
    setSavePending(true);
    // On desktop, use native save dialog — skip the modal overlay.
    if (isDesktop()) {
      try {
        const code = await encodeTournament(tournament);
        const safeName = tournament.name.replace(/[/\\:*?"<>|]/g, "_");
        const result = await saveFileNative({
          defaultPath: `${safeName}.draftsim.json`,
          filters: [{ name: "DraftSim Tournament", extensions: ["json"] }],
          content: code,
        });
        if (result.ok) {
          setExportFeedback("Saved to file");
        } else if (result.error !== "cancelled") {
          setExportFeedback(
            result.error ? `Save failed: ${result.error}` : "Save failed",
          );
        }
      } catch (e) {
        setExportFeedback(
          e instanceof Error ? `Save failed: ${e.message}` : "Save failed",
        );
      }
      setSavePending(false);
      return;
    }
    // Web path: show the save modal with the encoded code.
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
  };

  // Memoize expensive tournament derivations so they don't re-run on
  // every render (e.g. state changes unrelated to tournament data).
  const { champion, rounds, pendingMatch, viewMatch } = useMemo(() => {
    const champion = tournamentChampion(tournament);
    const rounds = matchesByRound(tournament);
    const pendingMatch = pendingMatchId
      ? tournament.matches.find((m) => m.id === pendingMatchId) ?? null
      : null;
    const viewMatch = viewMatchId
      ? tournament.matches.find((m) => m.id === viewMatchId) ?? null
      : null;
    return { champion, rounds, pendingMatch, viewMatch };

  }, [tournament, pendingMatchId, viewMatchId]);
  const totalRounds = rounds.length;
  // Season internationals: every team's home region + the seed it
  // earned in that region's qualifying split, ordered by global seed.
  const intlField = useMemo(() => {
    if (!season || tournament.seasonId !== season.id) return null;
    const phase = season.phases.find(
      (p) =>
        p.kind === "international" && p.tournamentIds.includes(tournament.id),
    );
    if (!phase?.event) return null;
    const inTournament = new Set(tournament.teams.map((t) => t.id));
    const event = phase.event;
    // Compact tags: "LCK #1" for split seeds, the trophy pill for the
    // defending champion's slot. Worlds keeps its route (finalist vs
    // championship points vs play-in) in the tooltip.
    const field = qualifiedForInternational(season, event)
      .filter((q) => inTournament.has(q.team.id))
      .map((q) => ({
        ...q,
        tag: (q.via === "champion"
          ? { label: q.league, championOf: feederEventOf(event) ?? undefined }
          : {
              label: `${q.league} #${q.leagueSeed}`,
              title:
                event === "worlds"
                  ? `Worlds: ${qualifierTag(event, q)}`
                  : undefined,
            }) satisfies QualifierTagInfo,
      }));
    return field.length > 0 ? field : null;
  }, [season, tournament]);
  const handleViewMatch = (id: string) => {
    setViewMatchId(id);
    setViewGameIdx(0);
  };
  // Deep-link variant used by the post-tournament Notable Games panel —
  // opens the replay modal AND lands on the supplied game index.
  const handleViewMatchGame = (id: string, gameIdx: number) => {
    setViewMatchId(id);
    setViewGameIdx(gameIdx);
  };

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
          onClick={handleSave}
          className="inline-flex items-center gap-1.5 px-2.5 md:px-3 py-1.5 border border-rift-line text-rift-mutedbright hover:text-rift-goldbright hover:border-rift-gold/50 hover:bg-rift-gold/5 transition-all text-[9px] md:text-[10px] uppercase tracking-[0.3em]"
          title="Save this tournament locally — resume, duplicate, or delete it from Saved Tournaments on the main menu"
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
        <button
          type="button"
          onClick={handleExport}
          className="inline-flex items-center gap-1.5 px-2.5 md:px-3 py-1.5 border border-rift-line text-rift-mutedbright hover:text-rift-goldbright hover:border-rift-gold/50 hover:bg-rift-gold/5 transition-all text-[9px] md:text-[10px] uppercase tracking-[0.3em]"
          title={
            isDesktop()
              ? "Export the tournament to a file you can import later"
              : "Export the tournament — copy a code you can paste later to resume from this exact state"
          }
        >
          <svg
            viewBox="0 0 16 16"
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            aria-hidden
          >
            <path d="M8 3v8M5 8l3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M3 13h10" strokeLinecap="round" />
          </svg>
          Export
        </button>
      </div>

      <div className="max-w-7xl mx-auto">
        <Header tournament={tournament} champion={champion} totalRounds={totalRounds} />

        {/* Region & seed of every qualified team (season internationals). */}
        {intlField && (
          <div className="mb-6 border border-rift-line/40 bg-rift-bg/30 px-3 py-2.5">
            <div className="text-[9px] uppercase tracking-[0.35em] text-rift-gold/60 mb-1.5">
              Qualified Field · Region &amp; Seed
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {intlField.map((q) => (
                <span
                  key={q.team.id}
                  className="inline-flex items-center gap-1.5 text-[10px] text-rift-mutedbright"
                >
                  <TeamIcon
                    iconKey={q.team.iconKey}
                    logoUrl={q.team.logoUrl}
                    size={12}
                    color={q.team.color}
                  />
                  <span>{q.team.name}</span>
                  <QualifierTagView tag={q.tag} />
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Post-tournament aggregates — only render once status is
            complete. Headline summary, presence/win-rate tables, plus
            tier list / synergy lookups so the user can review what the
            tournament looked like alongside the meta the AI used. */}
        {tournament.status === "complete" && (
          <>
            <div className="cv-auto">
              <PostTournamentRecap
                tournament={tournament}
                onViewGame={handleViewMatchGame}
              />
            </div>
            {/* MetaPanel opens full-screen `fixed` modals — no containment
                here, or they'd be trapped inside this wrapper. */}
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
          <div className="cv-auto">
            <LiveChampionMetaPanel tournament={tournament} />
          </div>
        )}
        <div className="cv-auto">
          <StreaksPanel tournament={tournament} />
        </div>
        <div className="cv-auto">
          <MetaEvolutionFeed tournament={tournament} />
        </div>

        {/* Format-specific layout: round-robin gets a standings table on
            top + a flat match list below. Single-elim keeps the bracket
            tree. Double-elim renders winners + losers + grand-final
            stacked. */}
        {tournament.format === "round-robin" ||
        tournament.format === "round-robin-playoffs" ||
        tournament.format === "round-robin-playoffs-te" ||
        tournament.format === "round-robin-playoffs-step" ? (
          <RoundRobinView
            tournament={tournament}
            rounds={rounds}
            onStartMatch={(id) => setPendingMatchId(id)}
            onViewMatch={handleViewMatch}
          />
        ) : tournament.format === "groups-playoffs" ||
          tournament.format === "groups-playoffs-de" ||
          tournament.format === "groups-playoffs-te" ? (
          <GroupsPlayoffsView
            tournament={tournament}
            rounds={rounds}
            onStartMatch={(id) => setPendingMatchId(id)}
            onViewMatch={handleViewMatch}
          />
        ) : tournament.format === "swiss" ||
          tournament.format === "swiss-playoffs" ||
          tournament.format === "swiss-playoffs-de" ||
          tournament.format === "swiss-playoffs-te" ? (
          <SwissView
            tournament={tournament}
            rounds={rounds}
            onStartMatch={(id) => setPendingMatchId(id)}
            onViewMatch={handleViewMatch}
          />
        ) : tournament.format === "double-elim" ? (
          <DoubleElimView
            tournament={tournament}
            onStartMatch={(id) => setPendingMatchId(id)}
            onViewMatch={handleViewMatch}
          />
        ) : tournament.format === "triple-elim" ? (
          <TripleElimView
            tournament={tournament}
            onStartMatch={(id) => setPendingMatchId(id)}
            onViewMatch={handleViewMatch}
          />
        ) : (
          <div className="overflow-x-auto pb-4" style={{ scrollbarWidth: "thin" }}>
            <BracketConnectorRoot
              matches={tournament.matches}
              className="inline-flex items-stretch gap-4 md:gap-6"
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
                  onViewMatch={handleViewMatch}
                />
              ))}
            </BracketConnectorRoot>
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
            startMatch(pendingMatch.id, overrides as Partial<MatchOverride>);
          }}
        />
      )}

      {viewMatch && (
        <Suspense
          fallback={
            <ReplayLoadingOverlay onClose={() => setViewMatchId(null)} />
          }
        >
          <MatchReplayModal
            match={viewMatch}
            tournament={tournament}
            initialGameIdx={viewGameIdx}
            onClose={() => setViewMatchId(null)}
          />
        </Suspense>
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
            } catch {
              setExportFeedback("Clipboard blocked — select & copy manually");
            }
          }}
          onClose={() => setSaveOpen(false)}
        />
      )}
    </div>
  );
}
