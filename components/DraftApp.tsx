"use client";

import { useEffect, useState } from "react";
import { useDraftStore, type SavedTournamentEntry } from "@/store/draftStore";
import { tournamentChampion, type TournamentState } from "@/lib/tournament";
import type { Champion } from "@/lib/types";
import CreateSimulationForm from "./CreateSimulationForm";
import DraftView from "./DraftView";
import StrategyView from "./StrategyView";
import BetweenGamesView from "./BetweenGamesView";
import SeriesCompleteView from "./SeriesCompleteView";
import TournamentSetup from "./TournamentSetup";
import TournamentDashboard from "./TournamentDashboard";
import MetaLibrary from "./MetaLibrary";
import PairingsLibrary from "./PairingsLibrary";
import Modal from "./Modal";
import { isDesktop, openFileNative } from "@/lib/desktopStorage";
import { hydrateMetaConfigFromDesktopFile } from "@/lib/metaRandomizer";

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
type EntryView =
  | "menu"
  | "single-setup"
  | "tournament-setup"
  | "meta-library"
  | "pairings-library";

export default function DraftApp({ champions }: Props) {
  const series = useDraftStore((s) => s.series);
  const tournament = useDraftStore((s) => s.tournament);
  const setChampions = useDraftStore((s) => s.setChampions);
  const hydrateMetaFromStorage = useDraftStore((s) => s.hydrateMetaFromStorage);
  const [entryView, setEntryView] = useState<EntryView>("menu");
  // Hydration gate (same pattern as Modal's mounted guard). With static
  // export, the prebuilt HTML is rendered before the persisted Zustand
  // store rehydrates from localStorage — without this gate users
  // mid-tournament would see EntryMenu flash before the dashboard swaps
  // in. Render a neutral splash until after the first client effect.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setChampions(champions);
  }, [champions, setChampions]);

  useEffect(() => {
    // Desktop: the meta config (tiers, synergies, counters, spikes) is
    // mirrored to an AppData file on every change and flushed on app
    // close. Seed localStorage from that file BEFORE the synchronous
    // hydrate so a fresh webview profile still restores the last config.
    let cancelled = false;
    void (async () => {
      if (isDesktop()) {
        await hydrateMetaConfigFromDesktopFile();
      }
      if (!cancelled) hydrateMetaFromStorage();
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrateMetaFromStorage]);

  // Pre-hydration splash — matches the app's dark backdrop (body is
  // already bg #010a13 via globals.css) so it reads as a brief blank
  // frame rather than a flash of the wrong screen.
  if (!mounted) {
    return <div aria-hidden="true" className="min-h-screen bg-rift-bg" />;
  }

  // Tournament mode is active. Route between dashboard and the active
  // match's series flow. The match's series lives in `state.series`
  // while the match is in progress; when finishMatch clears it, we
  // return to the dashboard.
  if (tournament) {
    if (series) {
      // Active match in flight — use the existing series-stage routing.
      if (series.status === "drafting")
        return <DraftView champions={champions} />;
      if (series.status === "strategy")
        return <StrategyView champions={champions} />;
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
    if (series.status === "strategy")
      return <StrategyView champions={champions} />;
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
  if (entryView === "meta-library") {
    return <MetaLibrary onBack={() => setEntryView("menu")} />;
  }
  if (entryView === "pairings-library") {
    return <PairingsLibrary onBack={() => setEntryView("menu")} />;
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
  const savedTournaments = useDraftStore((s) => s.savedTournaments);
  const loadSavedTournament = useDraftStore((s) => s.loadSavedTournament);
  const duplicateSavedTournament = useDraftStore(
    (s) => s.duplicateSavedTournament,
  );
  const deleteSavedTournament = useDraftStore((s) => s.deleteSavedTournament);
  const clearSavedTournaments = useDraftStore((s) => s.clearSavedTournaments);
  const [importOpen, setImportOpen] = useState(false);
  const [importCode, setImportCode] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  // Confirm dialogs for destructive history actions. Either holds the
  // tournament id to delete, or "all" to mean "clear-all".
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const confirmEntry =
    confirmDelete && confirmDelete !== "all"
      ? tournamentHistory.find((t) => t.id === confirmDelete)
      : null;
  // Same pattern for the saved-tournaments list (separate state so the
  // two modals can't trip over each other's confirms).
  const [confirmSavedDelete, setConfirmSavedDelete] = useState<string | null>(
    null,
  );
  const confirmSavedEntry =
    confirmSavedDelete && confirmSavedDelete !== "all"
      ? savedTournaments.find((e) => e.id === confirmSavedDelete)
      : null;

  const handleImport = async () => {
    setImportError(null);
    setImporting(true);
    // Desktop: open a native file dialog to read the .draftsim.json file.
    if (isDesktop()) {
      const fileResult = await openFileNative({
        filters: [{ name: "DraftSim Tournament", extensions: ["json"] }],
      });
      if (!fileResult.ok || fileResult.content == null) {
        setImporting(false);
        if (fileResult.error && fileResult.error !== "cancelled") {
          setImportError(fileResult.error);
        }
        return;
      }
      const res = await importTournament(fileResult.content);
      setImporting(false);
      if (res.ok) {
        setImportOpen(false);
        setImportCode("");
      } else {
        setImportError(res.error ?? "Import failed");
      }
      return;
    }
    // Web path: use the pasted code textarea.
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

        {/* Library sections — custom meta tier lists and synergy/counter
            sets. Saved presets can be applied before starting a series
            or tournament (pickers also appear in both setup forms). */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 mt-3 md:mt-4">
          <button
            type="button"
            onClick={() => onChoose("meta-library")}
            className="group border border-rift-line hover:border-rift-gold/60 hover:bg-rift-gold/5 transition-all px-5 py-4 text-left"
          >
            <div className="text-[9px] uppercase tracking-[0.4em] text-rift-gold/60 mb-1">
              Library
            </div>
            <div className="font-display text-lg md:text-xl tracking-wider text-rift-goldbright mb-1">
              Meta Tier Lists
            </div>
            <div className="text-[10px] md:text-[11px] text-rift-mutedbright leading-snug">
              Create, edit, and save your own tier lists. Import, export,
              and apply them to series and tournaments.
            </div>
          </button>
          <button
            type="button"
            onClick={() => onChoose("pairings-library")}
            className="group border border-rift-line hover:border-rift-gold/60 hover:bg-rift-gold/5 transition-all px-5 py-4 text-left"
          >
            <div className="text-[9px] uppercase tracking-[0.4em] text-rift-gold/60 mb-1">
              Library
            </div>
            <div className="font-display text-lg md:text-xl tracking-wider text-rift-goldbright mb-1">
              Synergies &amp; Counters
            </div>
            <div className="text-[10px] md:text-[11px] text-rift-mutedbright leading-snug">
              Build custom synergy pairs and counterpicks the AI and
              simulator use. Save, duplicate, import, and export sets.
            </div>
          </button>
        </div>

        <div className="mt-6 flex items-center justify-center gap-5 flex-wrap">
          <button
            type="button"
            onClick={() => {
              // Desktop: skip the paste-code modal and go straight to
              // the native file open dialog via handleImport.
              if (isDesktop()) {
                void handleImport();
              } else {
                setImportOpen(true);
              }
            }}
            disabled={importing}
            className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-rift-mutedbright hover:text-rift-goldbright disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M8 11V3M5 8l3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M3 13h10" strokeLinecap="round" />
            </svg>
            {isDesktop() ? "Import Tournament File" : "Import Tournament Code"}
          </button>
          {savedTournaments.length > 0 && (
            <button
              type="button"
              onClick={() => setSavedOpen(true)}
              className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-rift-mutedbright hover:text-rift-goldbright transition-colors"
            >
              <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M3 3v10h10V5l-2-2H3z" strokeLinejoin="round" />
                <path d="M5 3v3h5V3" strokeLinejoin="round" />
                <rect x="5" y="9" width="6" height="4" />
              </svg>
              Saved Tournaments ({savedTournaments.length})
            </button>
          )}
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

      {/* Saved Tournaments — manual save slots (any status), distinct
          from History which only lists finished tournaments. Entries can
          be resumed, duplicated, and deleted. */}
      {savedOpen && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center px-4 bg-black/70 backdrop-blur-sm"
          onClick={() => setSavedOpen(false)}
        >
          <div
            className="w-full max-w-2xl max-h-[85vh] overflow-y-auto border-2 border-rift-gold/60 bg-rift-panel p-5 md:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-baseline justify-between mb-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.4em] text-rift-gold/70 mb-1">
                  Saved Tournaments
                </div>
                <h2 className="font-display text-xl tracking-wider text-rift-goldbright">
                  {savedTournaments.length} Save
                  {savedTournaments.length === 1 ? "" : "s"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setConfirmSavedDelete("all")}
                className="text-[9px] uppercase tracking-[0.3em] text-rift-mutedbright/70 hover:text-rift-redbright transition-colors"
              >
                Clear All
              </button>
            </div>
            <div className="space-y-2">
              {savedTournaments.map((entry) => (
                <SavedTournamentRow
                  key={entry.id}
                  entry={entry}
                  onOpen={() => {
                    setSavedOpen(false);
                    loadSavedTournament(entry.id);
                  }}
                  onDuplicate={() => duplicateSavedTournament(entry.id)}
                  onDelete={() => setConfirmSavedDelete(entry.id)}
                />
              ))}
            </div>
            <div className="flex justify-end mt-4">
              <button
                type="button"
                onClick={() => setSavedOpen(false)}
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

      {/* Confirms for saved-tournament destructive actions. */}
      <Modal
        open={confirmSavedDelete === "all"}
        title="Clear All Saved Tournaments?"
        message="Every saved tournament will be permanently deleted from this device. This cannot be undone."
        confirmLabel="Clear All"
        cancelLabel="Cancel"
        tone="danger"
        onConfirm={() => {
          clearSavedTournaments();
          setConfirmSavedDelete(null);
          setSavedOpen(false);
        }}
        onCancel={() => setConfirmSavedDelete(null)}
      />
      <Modal
        open={!!confirmSavedEntry}
        title="Delete Saved Tournament?"
        message={
          confirmSavedEntry
            ? `"${confirmSavedEntry.tournament.name}" will be permanently removed from your saves.`
            : ""
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        tone="danger"
        onConfirm={() => {
          if (confirmSavedDelete && confirmSavedDelete !== "all") {
            deleteSavedTournament(confirmSavedDelete);
          }
          setConfirmSavedDelete(null);
        }}
        onCancel={() => setConfirmSavedDelete(null)}
      />
    </div>
  );
}

// One row in the Saved Tournaments modal. Shows the tournament name,
// format, team count, save date, and progress (matches played / total —
// or the champion when complete). Clicking the row resumes the
// tournament from its saved state; Duplicate clones it as a new slot.
function SavedTournamentRow({
  entry,
  onOpen,
  onDuplicate,
  onDelete,
}: {
  entry: SavedTournamentEntry;
  onOpen: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const t = entry.tournament;
  const champion = tournamentChampion(t);
  const date = new Date(entry.savedAt);
  const dateLabel = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const formatLabel =
    t.format === "single-elim"
      ? "Single-Elim"
      : t.format === "double-elim"
      ? "Double-Elim"
      : t.format === "round-robin"
      ? "Round-Robin"
      : t.format === "swiss"
      ? "Swiss"
      : "Groups+Playoffs";
  const played = t.matches.filter((m) => m.winner).length;
  const statusLabel =
    t.status === "complete"
      ? "Complete"
      : `In Progress · ${played}/${t.matches.length} matches`;
  return (
    <div className="border border-rift-line/50 bg-rift-bg/40 hover:border-rift-gold/40 transition-colors">
      <button
        type="button"
        onClick={onOpen}
        className="w-full text-left flex items-center justify-between gap-3 px-3 py-2.5"
      >
        <div className="min-w-0 flex-1">
          <div className="font-display text-sm tracking-wider text-rift-goldbright truncate">
            {t.name}
          </div>
          <div className="text-[9px] uppercase tracking-[0.25em] text-rift-mutedbright/60 mt-0.5">
            {formatLabel} · {t.teams.length} teams · Saved {dateLabel}
            <span className="text-rift-mutedbright/40 mx-1.5">·</span>
            <span
              className={
                t.status === "complete"
                  ? "text-rift-bluebright"
                  : "text-rift-goldbright/80"
              }
            >
              {statusLabel}
            </span>
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
          {t.status === "complete" ? "Open ›" : "Resume ›"}
        </span>
      </button>
      <div className="flex border-t border-rift-line/30">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDuplicate();
          }}
          className="flex-1 px-3 py-1 text-[9px] uppercase tracking-[0.3em] text-rift-mutedbright/40 hover:text-rift-goldbright hover:bg-rift-gold/5 transition-colors text-left"
        >
          Duplicate
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="flex-1 px-3 py-1 text-[9px] uppercase tracking-[0.3em] text-rift-mutedbright/40 hover:text-rift-redbright hover:bg-rift-red/5 transition-colors text-right"
        >
          Delete
        </button>
      </div>
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
