"use client";

import { useEffect, useState } from "react";
import { useDraftStore } from "@/store/draftStore";
import { tournamentChampion, type TournamentState } from "@/lib/tournament";
import type { Champion } from "@/lib/types";
import CreateSimulationForm from "./CreateSimulationForm";
import DraftView from "./DraftView";
import BetweenGamesView from "./BetweenGamesView";
import SeriesCompleteView from "./SeriesCompleteView";
import TournamentSetup from "./TournamentSetup";
import TournamentDashboard from "./TournamentDashboard";
import Modal from "./Modal";

interface Props {
  champions: Champion[];
}

// Two top-level "modes" the user can be in:
//   1. Single-series — the original flow (CreateSimulationForm → DraftView
//      → BetweenGames → SeriesComplete). `tournament === null`.
//   2. Tournament — bracket dashboard with matches that drive the same
//      series flow. `tournament !== null`.
//
// The decision happens at the entry point: when `tournament === null`
// AND `series === null`, we show a chooser screen with the two options.
// "Single Series" routes to CreateSimulationForm; "Tournament" routes
// to TournamentSetup. Once either creates state, routing flows from
// there.
type EntryView = "menu" | "single-setup" | "tournament-setup";

export default function DraftApp({ champions }: Props) {
  const series = useDraftStore((s) => s.series);
  const tournament = useDraftStore((s) => s.tournament);
  const setChampions = useDraftStore((s) => s.setChampions);
  const hydrateMetaFromStorage = useDraftStore((s) => s.hydrateMetaFromStorage);
  const [entryView, setEntryView] = useState<EntryView>("menu");

  useEffect(() => {
    setChampions(champions);
  }, [champions, setChampions]);

  useEffect(() => {
    hydrateMetaFromStorage();
  }, [hydrateMetaFromStorage]);

  // Tournament mode is active. Route between dashboard and the active
  // match's series flow. The match's series lives in `state.series`
  // while the match is in progress; when finishMatch clears it, we
  // return to the dashboard.
  if (tournament) {
    if (series) {
      // Active match in flight — use the existing series-stage routing.
      if (series.status === "drafting")
        return <DraftView champions={champions} />;
      if (series.status === "between-games")
        return <BetweenGamesView champions={champions} />;
      return <SeriesCompleteView champions={champions} />;
    }
    return <TournamentDashboard />;
  }

  // Single-series mode — existing flow.
  if (series) {
    if (series.status === "drafting")
      return <DraftView champions={champions} />;
    if (series.status === "between-games")
      return <BetweenGamesView champions={champions} />;
    return <SeriesCompleteView champions={champions} />;
  }

  // No tournament and no series — show the entry chooser, or one of
  // the setup screens depending on user choice.
  if (entryView === "tournament-setup") {
    return <TournamentSetup onCancel={() => setEntryView("menu")} />;
  }
  if (entryView === "single-setup") {
    // Pass a back callback so the form can return to the menu without
    // requiring a state reset — it's just UI state.
    return <CreateSimulationForm onBack={() => setEntryView("menu")} />;
  }
  return <EntryMenu onChoose={setEntryView} />;
}

// Two-button chooser that routes into either flow. Kept inline here so
// it can stay small; if it grows it can move into its own file.
function EntryMenu({ onChoose }: { onChoose: (v: EntryView) => void }) {
  const importTournament = useDraftStore((s) => s.importTournament);
  const tournamentHistory = useDraftStore((s) => s.tournamentHistory);
  const loadFromHistory = useDraftStore((s) => s.loadFromHistory);
  const deleteHistoryEntry = useDraftStore((s) => s.deleteHistoryEntry);
  const clearHistory = useDraftStore((s) => s.clearHistory);
  const [importOpen, setImportOpen] = useState(false);
  const [importCode, setImportCode] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  // Confirm dialogs for destructive history actions. Either holds the
  // tournament id to delete, or "all" to mean "clear-all".
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const confirmEntry =
    confirmDelete && confirmDelete !== "all"
      ? tournamentHistory.find((t) => t.id === confirmDelete)
      : null;

  const handleImport = async () => {
    setImportError(null);
    setImporting(true);
    const res = await importTournament(importCode);
    setImporting(false);
    if (res.ok) {
      // Tournament now in store — the parent component will route to the
      // dashboard on the next render. Reset modal state for cleanliness.
      setImportOpen(false);
      setImportCode("");
    } else {
      setImportError(res.error ?? "Import failed");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-2xl text-center">
        <div className="text-[10px] md:text-xs uppercase tracking-[0.5em] text-rift-gold/70 mb-2">
          DraftSim
        </div>
        <h1 className="font-display text-4xl md:text-6xl tracking-[0.15em] text-rift-goldbright mb-1">
          <span className="bg-gold-sheen bg-clip-text text-transparent">
            CHOOSE
          </span>
          <span className="text-rift-gold/90 ml-3">A MODE</span>
        </h1>
        <div className="ornament mb-8 md:mb-10">
          <span className="text-[10px] tracking-[0.3em] text-rift-gold/50 uppercase">
            How would you like to draft today?
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
          <button
            type="button"
            onClick={() => onChoose("single-setup")}
            className="group relative border-2 border-rift-line hover:border-rift-gold/70 hover:bg-rift-gold/5 transition-all p-6 md:p-8 text-left"
          >
            <div className="text-[9px] uppercase tracking-[0.4em] text-rift-gold/60 mb-2">
              Solo
            </div>
            <div className="font-display text-2xl md:text-3xl tracking-wider text-rift-goldbright group-hover:text-rift-goldbright mb-2">
              Single Series
            </div>
            <div className="text-[11px] md:text-xs text-rift-mutedbright leading-snug">
              Quick draft + match. Bo1, Bo3, or Bo5 between two teams.
              Optional fearless. Solo PvP, vs AI, or AI vs AI.
            </div>
          </button>
          <button
            type="button"
            onClick={() => onChoose("tournament-setup")}
            className="group relative border-2 border-rift-gold/40 bg-rift-gold/[0.03] hover:border-rift-gold hover:bg-rift-gold/10 transition-all p-6 md:p-8 text-left"
          >
            <div className="text-[9px] uppercase tracking-[0.4em] text-rift-goldbright/80 mb-2">
              Bracket
            </div>
            <div className="font-display text-2xl md:text-3xl tracking-wider text-rift-goldbright mb-2">
              Tournament
            </div>
            <div className="text-[11px] md:text-xs text-rift-mutedbright leading-snug">
              Single-elim or round-robin with team ratings, cross-match
              fearless, and per-match overrides. Champion crowned at the
              end with MVP and champion-stats recap.
            </div>
          </button>
        </div>

        <div className="mt-6 flex items-center justify-center gap-5 flex-wrap">
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-rift-mutedbright hover:text-rift-goldbright transition-colors"
          >
            <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M8 11V3M5 8l3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M3 13h10" strokeLinecap="round" />
            </svg>
            Import Tournament Code
          </button>
          {tournamentHistory.length > 0 && (
            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-rift-mutedbright hover:text-rift-goldbright transition-colors"
            >
              <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="8" cy="8" r="6" />
                <path d="M8 4v4l3 1.5" strokeLinecap="round" />
              </svg>
              Tournament History ({tournamentHistory.length})
            </button>
          )}
        </div>
      </div>

      {historyOpen && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center px-4 bg-black/70 backdrop-blur-sm"
          onClick={() => setHistoryOpen(false)}
        >
          <div
            className="w-full max-w-2xl max-h-[85vh] overflow-y-auto border-2 border-rift-gold/60 bg-rift-panel p-5 md:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-baseline justify-between mb-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.4em] text-rift-gold/70 mb-1">
                  Tournament History
                </div>
                <h2 className="font-display text-xl tracking-wider text-rift-goldbright">
                  {tournamentHistory.length} Past Tournament
                  {tournamentHistory.length === 1 ? "" : "s"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setConfirmDelete("all")}
                className="text-[9px] uppercase tracking-[0.3em] text-rift-mutedbright/70 hover:text-rift-redbright transition-colors"
              >
                Clear All
              </button>
            </div>
            <div className="space-y-2">
              {tournamentHistory.map((t) => (
                <HistoryRow
                  key={t.id}
                  tournament={t}
                  onOpen={() => {
                    setHistoryOpen(false);
                    loadFromHistory(t.id);
                  }}
                  onDelete={() => setConfirmDelete(t.id)}
                />
              ))}
            </div>
            <div className="flex justify-end mt-4">
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="px-3 py-1.5 border border-rift-line text-rift-mutedbright text-[10px] uppercase tracking-[0.3em] hover:text-rift-goldbright hover:border-rift-gold/50 transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {importOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center px-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-lg border-2 border-rift-gold/60 bg-rift-panel p-5 md:p-6">
            <div className="text-[10px] uppercase tracking-[0.4em] text-rift-gold/70 mb-2">
              Import Tournament
            </div>
            <h2 className="font-display text-xl md:text-2xl tracking-wider text-rift-goldbright mb-3">
              Paste TOUR1 Code
            </h2>
            <textarea
              value={importCode}
              onChange={(e) => setImportCode(e.target.value)}
              placeholder="TOUR1:..."
              className="w-full h-28 bg-rift-bg/60 border border-rift-line text-rift-mutedbright text-xs font-mono p-2 outline-none focus:border-rift-gold/60 resize-none"
            />
            {importError && (
              <div className="mt-2 text-[10px] uppercase tracking-[0.25em] text-rift-redbright">
                {importError}
              </div>
            )}
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => {
                  setImportOpen(false);
                  setImportError(null);
                }}
                className="px-3 py-1.5 border border-rift-line text-rift-mutedbright text-[10px] uppercase tracking-[0.3em] hover:text-rift-goldbright hover:border-rift-gold/50 transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleImport}
                disabled={importing || !importCode.trim()}
                className="px-4 py-1.5 border border-rift-gold/70 bg-rift-gold/15 text-rift-goldbright text-[10px] uppercase tracking-[0.3em] hover:bg-rift-gold/25 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {importing ? "Loading…" : "Import"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* In-app confirms for history destructive actions. Replaces the
          earlier window.confirm() calls so the dialogs match the rest of
          the app's UX (and aren't blocked by browser settings). */}
      <Modal
        open={confirmDelete === "all"}
        title="Clear All Tournament History?"
        message="Every past tournament snapshot will be permanently deleted from this device. This cannot be undone."
        confirmLabel="Clear All"
        cancelLabel="Cancel"
        tone="danger"
        onConfirm={() => {
          clearHistory();
          setConfirmDelete(null);
          setHistoryOpen(false);
        }}
        onCancel={() => setConfirmDelete(null)}
      />
      <Modal
        open={!!confirmEntry}
        title="Delete from History?"
        message={
          confirmEntry
            ? `"${confirmEntry.name}" will be permanently removed from history.`
            : ""
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        tone="danger"
        onConfirm={() => {
          if (confirmDelete && confirmDelete !== "all") {
            deleteHistoryEntry(confirmDelete);
          }
          setConfirmDelete(null);
        }}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}

// One row in the history modal. Shows the tournament name, format,
// team count, completion date, and the crowned team. Clicking the row
// opens the tournament for review; the trash icon deletes it.
function HistoryRow({
  tournament,
  onOpen,
  onDelete,
}: {
  tournament: TournamentState;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const champion = tournamentChampion(tournament);
  const date = new Date(tournament.updatedAt);
  const dateLabel = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const formatLabel =
    tournament.format === "single-elim"
      ? "Single-Elim"
      : tournament.format === "double-elim"
      ? "Double-Elim"
      : tournament.format === "round-robin"
      ? "Round-Robin"
      : tournament.format === "swiss"
      ? "Swiss"
      : "Groups+Playoffs";
  return (
    <div className="border border-rift-line/50 bg-rift-bg/40 hover:border-rift-gold/40 transition-colors">
      <button
        type="button"
        onClick={onOpen}
        className="w-full text-left flex items-center justify-between gap-3 px-3 py-2.5"
      >
        <div className="min-w-0 flex-1">
          <div className="font-display text-sm tracking-wider text-rift-goldbright truncate">
            {tournament.name}
          </div>
          <div className="text-[9px] uppercase tracking-[0.25em] text-rift-mutedbright/60 mt-0.5">
            {formatLabel} · {tournament.teams.length} teams · {dateLabel}
            {champion && (
              <>
                <span className="text-rift-mutedbright/40 mx-1.5">·</span>
                <span className="text-rift-bluebright">
                  Champion: {champion.name}
                </span>
              </>
            )}
          </div>
        </div>
        <span className="text-rift-gold/60 text-[10px] uppercase tracking-[0.3em] flex-shrink-0">
          Open ›
        </span>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="w-full px-3 py-1 text-[9px] uppercase tracking-[0.3em] text-rift-mutedbright/40 hover:text-rift-redbright hover:bg-rift-red/5 border-t border-rift-line/30 transition-colors text-right"
      >
        Delete
      </button>
    </div>
  );
}
