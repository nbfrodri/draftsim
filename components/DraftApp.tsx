"use client";
import MainMenuSections from "./MainMenuSections";
import { backupBeforeDestructiveChange } from "@/lib/backups";
import { parseSeasonImport } from "@/lib/importPreview";
import { decodeTournament } from "@/lib/tournamentShare";

import dynamic from "next/dynamic";
import Image from "next/image";

import {
getAppClosePhase,
getDesktopOperationPhase,
isDesktop,
isPersistReady,
openFileNative,
subscribeAppClosePhase,
subscribeDesktopOperationPhase,
subscribePersistReady,
} from "@/lib/desktopStorage";
import { hydrateMetaConfigFromDesktopFile } from "@/lib/metaRandomizer";
import { tournamentChampion,type TournamentState } from "@/lib/tournament";
import type { Champion } from "@/lib/types";
import { useDraftStore,type SavedTournamentEntry } from "@/store/draftStore";
import {
useCallback,
useEffect,
useRef,
useState,
useSyncExternalStore,
} from "react";
import AppClosingScreen from "./AppClosingScreen";
import AppDesktopOperationOverlay from "./AppDesktopOperationOverlay";
import AppStartupLoading from "./AppStartupLoading";
import { LiveCoachCardProvider } from "./coach/CoachCardContext";
import Modal from "./Modal";
import { LivePlayerCardProvider } from "./player/PlayerCardContext";
import { LiveTeamCardProvider } from "./team/TeamCardContext";
const CreateSimulationForm = dynamic(() => import("./CreateSimulationForm"), { loading: () => <p role="status" className="p-8 text-rift-gold">Loading...</p> });
const DraftView = dynamic(() => import("./DraftView"), { loading: () => <p role="status" className="p-8 text-rift-gold">Loading...</p> });
const StrategyView = dynamic(() => import("./StrategyView"), { loading: () => <p role="status" className="p-8 text-rift-gold">Loading...</p> });
const BetweenGamesView = dynamic(() => import("./BetweenGamesView"), { loading: () => <p role="status" className="p-8 text-rift-gold">Loading...</p> });
const SeriesCompleteView = dynamic(() => import("./SeriesCompleteView"), { loading: () => <p role="status" className="p-8 text-rift-gold">Loading...</p> });
const TournamentSetup = dynamic(() => import("./TournamentSetup"), { loading: () => <p role="status" className="p-8 text-rift-gold">Loading...</p> });
const TournamentDashboard = dynamic(() => import("./TournamentDashboard"), { loading: () => <p role="status" className="p-8 text-rift-gold">Loading...</p> });
const MetaLibrary = dynamic(() => import("./MetaLibrary"), { loading: () => <p role="status" className="p-8 text-rift-gold">Loading...</p> });
const PairingsLibrary = dynamic(() => import("./PairingsLibrary"), { loading: () => <p role="status" className="p-8 text-rift-gold">Loading...</p> });
const SeasonSetup = dynamic(() => import("./SeasonSetup"), { loading: () => <p role="status" className="p-8 text-rift-gold">Loading...</p> });
const SeasonDashboard = dynamic(() => import("./SeasonDashboard"), { loading: () => <p role="status" className="p-8 text-rift-gold">Loading...</p> });
const SeasonHistoryGate = dynamic(() => import("./SeasonHistoryGate"), { loading: () => <p role="status" className="p-8 text-rift-gold">Loading...</p> });
const RealitiesHub = dynamic(() => import("./RealitiesHub"), { loading: () => <p role="status" className="p-8 text-rift-gold">Loading...</p> });

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
  | "pairings-library"
  | "season-setup"
  | "season-history"
  | "realities-hub";

export default function DraftApp({ champions }: Props) {
  const series = useDraftStore((s) => s.series);
  const tournament = useDraftStore((s) => s.tournament);
  const season = useDraftStore((s) => s.season);
  const seasonViewOpen = useDraftStore((s) => s.seasonViewOpen);
  const setChampions = useDraftStore((s) => s.setChampions);
  const hydrateMetaFromStorage = useDraftStore((s) => s.hydrateMetaFromStorage);
  const exitSeasonView = useDraftStore((s) => s.exitSeasonView);
  const [entryView, setEntryView] = useState<EntryView>("menu");
  // Deep-link target for the Hall — set when a player trading card anywhere in
  // the live app is clicked, consumed by SeasonHistoryView's Search tab.
  const [hallPlayerId, setHallPlayerId] = useState<string | null>(null);
  const [hallTeamKey, setHallTeamKey] = useState<string | null>(null);
  const [hallCoachName, setHallCoachName] = useState<string | null>(null);
  // Wait for Zustand persist rehydration before showing empty menus /
  // "no realities" — async AppData reads on desktop finish after first
  // paint, and a premature empty UI (or a pre-hydrate set()) used to
  // look like lost saves.
  //
  // useSyncExternalStore + getServerSnapshot(false) keeps SSR and the
  // hydration pass on the same splash shell even when sync localStorage
  // rehydration has already flipped the gate on the client.
  const persistReady = useSyncExternalStore(
    subscribePersistReady,
    isPersistReady,
    () => false,
  );
  const closePhase = useSyncExternalStore(
    subscribeAppClosePhase,
    getAppClosePhase,
    () => "idle" as const,
  );
  const desktopOperationPhase = useSyncExternalStore(
    subscribeDesktopOperationPhase,
    getDesktopOperationPhase,
    () => "idle" as const,
  );

  useEffect(() => {
    if (!persistReady) return;
    // Select the cache once per launch. Background updates apply next launch,
    // so an ongoing simulation keeps its current catalogue.
    let cancelled = false;
    void import("@/lib/communityDragon").then(({ localChampions, refreshChampions }) => {
      if (cancelled) return;
      setChampions(localChampions());
      void refreshChampions().catch(() => {});
    });
    return () => { cancelled = true; };
  }, [persistReady, champions, setChampions]);

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

  // A player card clicked anywhere in the live app jumps to that player's
  // profile in the Hall — the one full-profile surface the app has.
  const openHallPlayer = useCallback(
    (playerId: string) => {
      setHallPlayerId(playerId);
      setHallTeamKey(null);
      setHallCoachName(null);
      setEntryView("season-history");
      exitSeasonView();
    },
    [exitSeasonView],
  );
  const openHallTeam = useCallback(
    (teamKey: string) => {
      setHallTeamKey(teamKey);
      setHallPlayerId(null);
      setHallCoachName(null);
      setEntryView("season-history");
      exitSeasonView();
    },
    [exitSeasonView],
  );
  const openHallCoach = useCallback(
    (coachName: string) => {
      setHallCoachName(coachName);
      setHallPlayerId(null);
      setHallTeamKey(null);
      setEntryView("season-history");
      exitSeasonView();
    },
    [exitSeasonView],
  );
  const leaveHall = useCallback(() => {
    setHallPlayerId(null);
    setHallTeamKey(null);
    setHallCoachName(null);
    setEntryView("menu");
  }, []);

  if (!persistReady) {
    return <AppStartupLoading />;
  }

  const routed = (() => {
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

    // Season mode — when the season view is open (and no tournament is
    // being browsed, handled above), show the season dashboard.
    if (seasonViewOpen && season) {
      return <SeasonDashboard />;
    }

    // No tournament and no series — show the entry chooser, or one of
    // the setup screens depending on user choice.
    if (entryView === "season-setup") {
      return <SeasonSetup onCancel={() => setEntryView("menu")} />;
    }
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
    if (entryView === "season-history") {
      return (
        <SeasonHistoryGate
          onBack={leaveHall}
          initialPlayerId={hallPlayerId}
          initialTeamKey={hallTeamKey}
          initialCoachName={hallCoachName}
        />
      );
    }
    if (entryView === "realities-hub") {
      return <RealitiesHub onChoose={setEntryView} />;
    }
    return <EntryMenu onChoose={setEntryView} />;
  })();

  // One live-season card resolver for the whole app: the season dashboard,
  // tournament/series screens and match recaps are siblings in this switch, so
  // the provider has to sit above all of them. The Hall nests its own
  // archive-backed provider on top.
  return (
    <>
      <LivePlayerCardProvider onOpenProfile={openHallPlayer}>
        <LiveTeamCardProvider onOpenProfile={openHallTeam}>
          <LiveCoachCardProvider onOpenProfile={openHallCoach}>
            {routed}
          </LiveCoachCardProvider>
        </LiveTeamCardProvider>
      </LivePlayerCardProvider>
      {closePhase !== "idle" && <AppClosingScreen phase={closePhase} />}
      {desktopOperationPhase !== "idle" && (
        <AppDesktopOperationOverlay phase={desktopOperationPhase} />
      )}
    </>
  );
}

// Two-button chooser that routes into either flow. Kept inline here so
// it can stay small; if it grows it can move into its own file.
function EntryMenu({ onChoose }: { onChoose: (v: EntryView) => void }) {
  const season = useDraftStore((s) => s.season);
  const openSeason = useDraftStore((s) => s.openSeason);
  const realitiesCount = useDraftStore((s) => s.realities.length);
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
  const savedSeasons = useDraftStore((s) => s.savedSeasons);
  const loadSavedSeason = useDraftStore((s) => s.loadSavedSeason);
  const duplicateSavedSeason = useDraftStore((s) => s.duplicateSavedSeason);
  const deleteSavedSeason = useDraftStore((s) => s.deleteSavedSeason);
  const clearSavedSeasons = useDraftStore((s) => s.clearSavedSeasons);
  const importSeason = useDraftStore((s) => s.importSeason);
  const seasonHistory = useDraftStore((s) => s.seasonHistory);
  const archiveSavedSeasonToHistory = useDraftStore(
    (s) => s.archiveSavedSeasonToHistory,
  );
  // Which saved-season entry was just archived (transient "Added ✓").
  const [archivedFeedback, setArchivedFeedback] = useState<string | null>(
    null,
  );
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
  // Saved seasons modal + confirms. confirmSeasonLoad guards loading a
  // save while a DIFFERENT season is active (it would replace it).
  const [savedSeasonsOpen, setSavedSeasonsOpen] = useState(false);
  const [confirmSeasonDelete, setConfirmSeasonDelete] = useState<
    string | null
  >(null);
  const [confirmSeasonLoad, setConfirmSeasonLoad] = useState<string | null>(
    null,
  );
  const confirmSeasonEntry =
    confirmSeasonDelete && confirmSeasonDelete !== "all"
      ? savedSeasons.find((e) => e.id === confirmSeasonDelete)
      : null;
  const confirmSeasonLoadEntry = confirmSeasonLoad
    ? savedSeasons.find((e) => e.id === confirmSeasonLoad)
    : null;

  // Import-season state: a hidden file input drives the web path; desktop
  // uses the native open dialog. Either way the parsed entry lands in
  // Saved Seasons, which we then open so the user can load it.
  const seasonFileInputRef = useRef<HTMLInputElement>(null);
  const [seasonImportError, setSeasonImportError] = useState<string | null>(
    null,
  );

  const commitImportedSeason = (text: string) => {
    const res = importSeason(text);
    if (res.ok) {
      setSeasonImportError(null);
      setSavedSeasonsOpen(true);
    } else {
      setSeasonImportError(res.error ?? "Import failed");
    }
  };

  const [importPreview, setImportPreview] = useState<{ message: string; apply: () => void } | null>(null);
  const applyImportedSeason = (text: string) => {
    try {
      const entry = parseSeasonImport(text);
      const before = useDraftStore.getState().savedSeasons;
      const replaces = before.find(s => s.id === entry.id);
      setImportPreview({ message: `${entry.season.name} | Year ${entry.season.franchise?.year ?? 1} | ${entry.season.teams.length} teams: ${entry.season.teams.map(t => t.name).join(", ")}. ${replaces ? "Replaces the saved season with the same ID." : "Adds a saved season; the oldest slot may be removed if the library is full."}`,
        apply: () => { if (useDraftStore.getState().savedSeasons !== before) { setSeasonImportError("Saved seasons changed. Review the file again."); return; } commitImportedSeason(text); } });
    } catch (error) { setSeasonImportError(error instanceof Error ? error.message : String(error)); }
  };
  const previewTournament = async (text: string) => {
    const decoded = await decodeTournament(text);
    if (!decoded.tournament) return { ok: false, error: decoded.error ?? "Invalid tournament" };
    const t = decoded.tournament, before = useDraftStore.getState().tournament;
    setImportPreview({ message: `${t.name} | ${t.teams.length} teams: ${t.teams.map(team => team.name).join(", ")}. Replaces the current active tournament${before ? ` "${before.name}"` : ""}.`,
      apply: () => {
        if (useDraftStore.getState().tournament !== before) { setImportError("The current tournament changed. Review the import again."); return; }
        void importTournament(text).then(res => { if (!res.ok) setImportError(res.error ?? "Import failed"); });
      } });
    return { ok: true };
  };

  const handleImportSeason = async () => {
    setSeasonImportError(null);
    if (isDesktop()) {
      const res = await openFileNative({
        filters: [{ name: "DraftSim Season", extensions: ["json"] }],
      });
      if (!res.ok || res.content == null) {
        if (res.error && res.error !== "cancelled") {
          setSeasonImportError(res.error);
        }
        return;
      }
      applyImportedSeason(res.content);
      return;
    }
    // Web: open the OS file picker via the hidden input.
    seasonFileInputRef.current?.click();
  };

  const handleLoadSeason = (entryId: string) => {
    // Loading replaces the active season — confirm when one exists and
    // it isn't the same save slot.
    if (season && season.id !== entryId) {
      setConfirmSeasonLoad(entryId);
      return;
    }
    setSavedSeasonsOpen(false);
    loadSavedSeason(entryId);
  };

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
      const res = await previewTournament(fileResult.content);
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
    const res = await previewTournament(importCode);
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

  const latestSave = [
    ...savedSeasons.map((entry) => ({ savedAt: entry.savedAt, name: entry.season.name, detail: "Saved season", onClick: () => loadSavedSeason(entry.id) })),
    ...savedTournaments.map((entry) => ({ savedAt: entry.savedAt, name: entry.tournament.name, detail: "Saved tournament", onClick: () => loadSavedTournament(entry.id) })),
  ].sort((a, b) => b.savedAt - a.savedAt)[0];

  return (
    <div className="min-h-screen flex items-center justify-center px-5 py-8 md:py-10">
      <div className="w-full max-w-6xl">
        <header className="mb-6 border-b border-rift-line pb-5">
          <div className="text-[10px] uppercase tracking-[0.35em] text-rift-mutedbright mb-2">League of Legends simulator</div>
          <div className="flex items-center gap-4"><Image src="/icon.svg" alt="DraftSim logo" width={64} height={64} priority className="h-14 w-14 md:h-16 md:w-16 shrink-0" /><h1 className="font-display text-4xl md:text-5xl tracking-[0.12em] text-rift-goldbright">DRAFTSIM</h1></div>
          <p className="mt-3 text-sm text-rift-mutedbright">Your next draft. Your next champion. Your own history.</p>
        </header>
        <MainMenuSections
          onChoose={onChoose}
          onSeason={() => season ? openSeason() : onChoose("season-setup")}
          hasSeason={!!season}
          realitiesCount={realitiesCount}
          resume={season ? {
            name: season.franchise?.name ?? season.name,
            detail: `${season.franchise ? `Reality / Year ${season.franchise.year}` : "Season"} / ${season.status === "complete" ? "Season complete" : season.phases[season.phaseIndex]?.label ?? "In progress"}`,
            onClick: openSeason,
          } : latestSave ? {
            name: latestSave.name,
            detail: latestSave.detail,
            onClick: latestSave.onClick,
          } : realitiesCount > 0 ? {
            name: "Your realities",
            detail: "Choose a saved reality to continue your timeline.",
            onClick: () => onChoose("realities-hub"),
          } : undefined}
        />
        <h2 className="mt-8 mb-3 text-xs uppercase tracking-[0.25em] text-rift-gold">Saves & history</h2>
        <div className="flex items-center gap-x-6 gap-y-4 flex-wrap border-t border-rift-line pt-5">
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
          <button
            type="button"
            onClick={() => void handleImportSeason()}
            className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-rift-mutedbright hover:text-rift-goldbright transition-colors"
            title="Restore a season exported from the season dashboard (.json) into Saved Seasons"
          >
            <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M8 11V3M5 8l3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M3 13h10" strokeLinecap="round" />
            </svg>
            Import Season
          </button>
          {/* Web file picker for Import Season (desktop uses the native dialog). */}
          <input
            ref={seasonFileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              applyImportedSeason(await file.text());
            }}
          />
          {savedSeasons.length > 0 && (
            <button
              type="button"
              onClick={() => setSavedSeasonsOpen(true)}
              className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-rift-mutedbright hover:text-rift-goldbright transition-colors"
            >
              <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="8" cy="8" r="6" />
                <path d="M8 2v3M8 11v3M2 8h3M11 8h3" strokeLinecap="round" />
              </svg>
              Saved Seasons ({savedSeasons.length})
            </button>
          )}
          {/* Always shown — the Hall of Seasons is the entry point for
              browsing archived seasons AND for importing .xlsx archives,
              so it must be reachable even when the hall is currently empty. */}
          <button
            type="button"
            onClick={() => onChoose("season-history")}
            className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-rift-mutedbright hover:text-rift-goldbright transition-colors"
            title="The Hall of Seasons — every archived champion, finalist, and the metas they played on"
          >
            <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M4 2h8v2.5a4 4 0 0 1-8 0V2z" strokeLinejoin="round" />
              <path d="M4 3H2v1a2.5 2.5 0 0 0 2 2.45M12 3h2v1a2.5 2.5 0 0 1-2 2.45" strokeLinejoin="round" />
              <path d="M8 8.5V11M5.5 13h5M6.5 11h3v2h-3z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Season History{seasonHistory.length > 0 ? ` (${seasonHistory.length})` : ""}
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
        {seasonImportError && (
          <div className="mt-3 text-[10px] uppercase tracking-[0.25em] text-rift-redbright">
            Season import failed: {seasonImportError}
          </div>
        )}
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

      {/* Saved Seasons — manual save slots for season mode. Loading one
          makes it the active season (replacing the current one behind a
          confirm). */}
      {savedSeasonsOpen && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center px-4 bg-black/70 backdrop-blur-sm"
          onClick={() => setSavedSeasonsOpen(false)}
        >
          <div
            className="w-full max-w-2xl max-h-[85vh] overflow-y-auto border-2 border-rift-gold/60 bg-rift-panel p-5 md:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-baseline justify-between mb-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.4em] text-rift-gold/70 mb-1">
                  Saved Seasons
                </div>
                <h2 className="font-display text-xl tracking-wider text-rift-goldbright">
                  {savedSeasons.length} Save
                  {savedSeasons.length === 1 ? "" : "s"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setConfirmSeasonDelete("all")}
                className="text-[9px] uppercase tracking-[0.3em] text-rift-mutedbright/70 hover:text-rift-redbright transition-colors"
              >
                Clear All
              </button>
            </div>
            <div className="space-y-2">
              {savedSeasons.map((entry) => {
                const s = entry.season;
                const phase = s.phases[s.phaseIndex];
                const date = new Date(entry.savedAt);
                const dateLabel = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
                const statusLabel =
                  s.status === "complete"
                    ? "Complete"
                    : phase
                    ? `${phase.label}`
                    : "In Progress";
                return (
                  <div
                    key={entry.id}
                    className="border border-rift-line/50 bg-rift-bg/40 hover:border-rift-gold/40 transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => handleLoadSeason(entry.id)}
                      className="w-full text-left flex items-center justify-between gap-3 px-3 py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-display text-sm tracking-wider text-rift-goldbright truncate">
                          {s.name}
                        </div>
                        <div className="text-[9px] uppercase tracking-[0.25em] text-rift-mutedbright/60 mt-0.5">
                          Saved {dateLabel}
                          <span className="text-rift-mutedbright/40 mx-1.5">·</span>
                          <span
                            className={
                              s.status === "complete"
                                ? "text-rift-bluebright"
                                : "text-rift-goldbright/80"
                            }
                          >
                            {statusLabel}
                          </span>
                        </div>
                      </div>
                      <span className="text-rift-gold/60 text-[10px] uppercase tracking-[0.3em] flex-shrink-0">
                        {s.status === "complete" ? "Open ›" : "Load ›"}
                      </span>
                    </button>
                    <div className="flex border-t border-rift-line/30">
                      <button
                        type="button"
                        onClick={() => duplicateSavedSeason(entry.id)}
                        className="flex-1 px-3 py-1 text-[9px] uppercase tracking-[0.3em] text-rift-mutedbright/40 hover:text-rift-goldbright hover:bg-rift-gold/5 transition-colors text-left"
                      >
                        Duplicate
                      </button>
                      {s.status === "complete" && (
                        <button
                          type="button"
                          onClick={() => {
                            if (archiveSavedSeasonToHistory(entry.id)) {
                              setArchivedFeedback(entry.id);
                              setTimeout(() => setArchivedFeedback(null), 2000);
                            }
                          }}
                          className="flex-1 px-3 py-1 text-[9px] uppercase tracking-[0.3em] text-rift-mutedbright/40 hover:text-rift-goldbright hover:bg-rift-gold/5 transition-colors text-center"
                          title="Archive this season's résumé (champion, finalist, title holders) to Season History"
                        >
                          {archivedFeedback === entry.id
                            ? "Added to History ✓"
                            : "Add to History"}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setConfirmSeasonDelete(entry.id)}
                        className="flex-1 px-3 py-1 text-[9px] uppercase tracking-[0.3em] text-rift-mutedbright/40 hover:text-rift-redbright hover:bg-rift-red/5 transition-colors text-right"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-end mt-4">
              <button
                type="button"
                onClick={() => setSavedSeasonsOpen(false)}
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
      <Modal open={importPreview !== null} title="Review import" beforeConfirm={backupBeforeDestructiveChange} message={importPreview?.message ?? ""} confirmLabel="Import"
        onCancel={() => setImportPreview(null)} onConfirm={() => { const plan = importPreview; setImportPreview(null); plan?.apply(); }} />
      <Modal
        open={confirmDelete === "all"}
        title="Clear All Tournament History?"
        message="Every past tournament snapshot will be permanently deleted from this device. This cannot be undone."
        confirmLabel="Clear All"
        cancelLabel="Cancel"
        tone="danger" beforeConfirm={backupBeforeDestructiveChange}
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
        tone="danger" beforeConfirm={backupBeforeDestructiveChange}
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
        tone="danger" beforeConfirm={backupBeforeDestructiveChange}
        onConfirm={() => {
          clearSavedTournaments();
          setConfirmSavedDelete(null);
          setSavedOpen(false);
        }}
        onCancel={() => setConfirmSavedDelete(null)}
      />
      {/* Confirms for saved-season actions. */}
      <Modal
        open={confirmSeasonDelete === "all"}
        title="Clear All Saved Seasons?"
        message="Every saved season will be permanently deleted from this device. This cannot be undone."
        confirmLabel="Clear All"
        cancelLabel="Cancel"
        tone="danger" beforeConfirm={backupBeforeDestructiveChange}
        onConfirm={() => {
          clearSavedSeasons();
          setConfirmSeasonDelete(null);
          setSavedSeasonsOpen(false);
        }}
        onCancel={() => setConfirmSeasonDelete(null)}
      />
      <Modal
        open={!!confirmSeasonEntry}
        title="Delete Saved Season?"
        message={
          confirmSeasonEntry
            ? `"${confirmSeasonEntry.season.name}" will be permanently removed from your saves.`
            : ""
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        tone="danger" beforeConfirm={backupBeforeDestructiveChange}
        onConfirm={() => {
          if (confirmSeasonDelete && confirmSeasonDelete !== "all") {
            deleteSavedSeason(confirmSeasonDelete);
          }
          setConfirmSeasonDelete(null);
        }}
        onCancel={() => setConfirmSeasonDelete(null)}
      />
      <Modal
        open={!!confirmSeasonLoadEntry}
        title="Replace Active Season?"
        message={
          confirmSeasonLoadEntry
            ? `Loading "${confirmSeasonLoadEntry.season.name}" will replace your current season${
                season ? ` "${season.name}"` : ""
              }. Save the current season first if you want to keep its progress.`
            : ""
        }
        confirmLabel="Load Anyway"
        cancelLabel="Cancel"
        tone="danger" beforeConfirm={backupBeforeDestructiveChange}
        onConfirm={() => {
          if (confirmSeasonLoad) {
            loadSavedSeason(confirmSeasonLoad);
          }
          setConfirmSeasonLoad(null);
          setSavedSeasonsOpen(false);
        }}
        onCancel={() => setConfirmSeasonLoad(null)}
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
        tone="danger" beforeConfirm={backupBeforeDestructiveChange}
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
