"use client";

import {
lazy,
Suspense,
useEffect,
useMemo,
useState,
type ReactNode,
} from "react";

import { computeChampionTeamTournamentMvp,computeFinalsMvp } from "@/lib/awards";
import { isDesktop,saveFileNative } from "@/lib/desktopStorage";
import {
computeAllProTeams,
type RawAllProTeam,
} from "@/lib/season/allPro";
import {
feederEventOf,
leagueOfTournament,
phaseProgress,
qualifiedForInternational,
qualifierTag,
seasonGoldenRoadTeamId,
seasonHasGlobalCup,
} from "@/lib/season/engine";
import {
computePowerRankings,
type PowerRankingRow,
type PowerTag,
} from "@/lib/season/powerRankings";
import { logoForTeamName } from "@/lib/season/realTeams";
import { buildSeasonStory } from "@/lib/season/seasonStory";
import {
computeSeasonRookiesOfYear,
computeSeasonStats,
computeStageStats,
type PlayerSeasonLine,
} from "@/lib/season/stats";
import {
INTERNATIONAL_DISPLAY_ORDER,
INTERNATIONAL_LABELS,
LEAGUE_IDS,
seasonTeam,
SPLIT_FEEDS_EVENT,
SPLIT_LABELS,
type InternationalId,
type LeagueId,
type SeasonPhase,
type SeasonState,
} from "@/lib/season/types";
import type { TournamentMatch,TournamentState } from "@/lib/tournament";
import {
computeStandings,
formatHasStandings,
tournamentChampion,
} from "@/lib/tournament";
import type { Champion,Lane } from "@/lib/types";
import type { SeasonMatchdayResult } from "@/store/draftStore";
import { useDraftStore } from "@/store/draftStore";
import FranchisePanel from "./FranchisePanel";
import FreeAgentsPanel from "./FreeAgentsPanel";
import LaneIcon from "./LaneIcon";
import LeagueIcon from "./LeagueIcon";
import { CopyMetaCodeButton,MetaDriftChips } from "./MetaSnapshots";
import Modal from "./Modal";
import MyTeamPanel from "./MyTeamPanel";
import OffseasonView from "./OffseasonView";
import PlayerNameLink from "./player/PlayerNameLink";
import {
IntlChampionBadge,
QualifierTagView,
TeamFormBadge,
type QualifierTagInfo,
} from "./QualifierBadge";
import BulkYearsControl from "./season/BulkYearsControl";
import SimResultsFeedPanel from "./season/SimResultsFeedPanel";
import SeasonMetaPanel from "./SeasonMetaPanel";
import SeasonStoryCard from "./SeasonStoryCard";
import {
buildLiveTeamStatsMap,
TeamLiveStatsInline,
type LiveTeamStats,
} from "./team/TeamLiveStats";
import TeamLogoLink from "./team/TeamLogoLink";
import TeamNameLink from "./team/TeamNameLink";
import TeamBrowserPanel from "./TeamBrowserPanel";
import {
ReplayLoadingOverlay,
SimulatingOverlay,
} from "./tournament/bracket/DashboardModals";
import { GroupStandingsTable } from "./tournament/bracket/StandingsTables";
import TransferWindowPanel from "./TransferWindowPanel";
const MatchReplayModal = lazy(() =>
  import("./tournament/replay/MatchReplayModal").then((m) => ({
    default: m.MatchReplayModal,
  })),
);

// Season dashboard: phase timeline, the current phase's tournaments
// (league cards with standings, international cards with seeds), sim
// controls, past results, and the Worlds champion banner.

/** Isolated store subscription so feed batched updates don't re-render the dashboard. */
function SeasonSimResultsFeed() {
  const simResultsFeed = useDraftStore((s) => s.simResultsFeed);
  const dismissSimResultsFeed = useDraftStore((s) => s.dismissSimResultsFeed);
  if (simResultsFeed.length === 0) return null;
  return (
    <div id="sim-results-panel" className="mb-6 cv-auto scroll-mt-4">
      <SimResultsFeedPanel
        entries={simResultsFeed}
        title="Simulation Results"
        onDismiss={dismissSimResultsFeed}
      />
    </div>
  );
}

export default function SeasonDashboard() {
  const season = useDraftStore((s) => s.season)!;
  const champions = useDraftStore((s) => s.champions);
  const simulating = useDraftStore((s) => s.simulating);
  const openSeasonTournament = useDraftStore((s) => s.openSeasonTournament);
  const simSeason = useDraftStore((s) => s.simSeason);
  const simSeasonMatchday = useDraftStore((s) => s.simSeasonMatchday);
  const seasonMatchday = useDraftStore((s) => s.seasonMatchday);
  const exitSeasonView = useDraftStore((s) => s.exitSeasonView);
  const abandonSeason = useDraftStore((s) => s.abandonSeason);
  const saveCurrentSeason = useDraftStore((s) => s.saveCurrentSeason);
  const exportCurrentSeason = useDraftStore((s) => s.exportCurrentSeason);
  const exportReality = useDraftStore((s) => s.exportReality);
  const archiveSeasonToHistory = useDraftStore((s) => s.archiveSeasonToHistory);
  const inHistory = useDraftStore((s) =>
    s.seasonHistory.some((e) => e.id === s.season?.id),
  );
  const [confirmAbandon, setConfirmAbandon] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [matchReplay, setMatchReplay] = useState<{
    tournamentId: string;
    matchId: string;
  } | null>(null);
  // Mid-season aggregate stats toggle (always rendered once complete).
  const [statsOpen, setStatsOpen] = useState(false);

  const replayTournament = matchReplay
    ? season.tournaments[matchReplay.tournamentId]
    : null;
  const replayMatch =
    replayTournament?.matches.find((m) => m.id === matchReplay?.matchId) ??
    null;

  useEffect(() => {
    if (!saveFeedback) return;
    const t = setTimeout(() => setSaveFeedback(null), 2500);
    return () => clearTimeout(t);
  }, [saveFeedback]);

  // Export button: when the season belongs to a reality, export the full
  // reality (timeline + season history) — same path as RealitiesHub.
  // For standalone seasons, fall back to the per-season export.
  const handleExportSeason = async () => {
    if (season.franchise) {
      const json = await exportReality(season.franchise.id);
      if (!json) {
        setSaveFeedback("Export failed");
        return;
      }
      const safe = season.franchise.name.replace(/[/\\:*?"<>|]/g, "_").trim() || "reality";
      const filename = `${safe}.draftsim-reality.json`;
      if (isDesktop()) {
        const res = await saveFileNative({
          defaultPath: filename,
          filters: [{ name: "DraftSim Reality", extensions: ["json"] }],
          content: json,
        });
        if (res.ok) setSaveFeedback("Reality exported");
        else if (res.error !== "cancelled")
          setSaveFeedback(res.error ? `Export failed: ${res.error}` : "Export failed");
        return;
      }
      const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      setSaveFeedback("Reality exported");
      return;
    }
    const entry = exportCurrentSeason();
    if (!entry) {
      setSaveFeedback("Export failed");
      return;
    }
    const json = JSON.stringify(entry);
    const safeName =
      season.name.replace(/[/\\:*?"<>|]/g, "_").trim() || "season";
    const filename = `${safeName}.draftsim-season.json`;
    if (isDesktop()) {
      const res = await saveFileNative({
        defaultPath: filename,
        filters: [{ name: "DraftSim Season", extensions: ["json"] }],
        content: json,
      });
      if (res.ok) setSaveFeedback("Season exported");
      else if (res.error !== "cancelled")
        setSaveFeedback(res.error ? `Export failed: ${res.error}` : "Export failed");
      return;
    }
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    setSaveFeedback("Season exported");
  };

  const championsById = useMemo(() => {
    const map = new Map<number, Champion>();
    for (const c of champions) map.set(c.id, c);
    return map;
  }, [champions]);
  const seasonStory = useMemo(() => buildSeasonStory(season), [season]);

  const phase = season.phases[season.phaseIndex] ?? null;
  const controlled = seasonTeam(season, season.config.controlledTeamId);
  const championTeam = seasonTeam(season, season.champion);
  // Golden Road: did the Worlds champion also sweep its 3 splits + the
  // other 2 internationals this season?
  const goldenRoadId = useMemo(
    () => seasonGoldenRoadTeamId(season),
    [season],
  );

  return (
    <div className="min-h-screen px-4 py-8 md:py-10 relative">
      {simulating && <SimulatingOverlay scope={simulating} />}

      {/* Exit — top-left */}
      <button
        type="button"
        onClick={() => void exitSeasonView()}
        className="fixed top-3 left-3 md:top-4 md:left-4 inline-flex items-center gap-1.5 px-2.5 md:px-3 py-1.5 border border-rift-line text-rift-mutedbright hover:text-rift-goldbright hover:border-rift-gold/50 hover:bg-rift-gold/5 transition-all text-[9px] md:text-[10px] uppercase tracking-[0.3em] z-30"
      >
        <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M9 3l-5 5 5 5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 8h10" strokeLinecap="round" />
        </svg>
        Main Menu
      </button>

      {/* Save / Abandon — top-right */}
      <div className="fixed top-3 right-3 md:top-4 md:right-4 flex items-center gap-2 z-30">
        {saveFeedback && (
          <span className="text-[9px] md:text-[10px] uppercase tracking-[0.25em] text-rift-goldbright">
            {saveFeedback}
          </span>
        )}
        <button
          type="button"
          onClick={() => {
            const ok = saveCurrentSeason();
            setSaveFeedback(
              ok
                ? season.franchise
                  ? "Saved to reality"
                  : "Season saved"
                : "Save failed",
            );
          }}
          className="inline-flex items-center gap-1.5 px-2.5 md:px-3 py-1.5 border border-rift-line text-rift-mutedbright hover:text-rift-goldbright hover:border-rift-gold/50 hover:bg-rift-gold/5 transition-all text-[9px] md:text-[10px] uppercase tracking-[0.3em]"
          title={
            season.franchise
              ? "Save progress into this reality — find it in the Realities hub"
              : "Save this season locally — load, duplicate, or delete it from Saved Seasons on the main menu"
          }
        >
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
            <path d="M3 3v10h10V5l-2-2H3z" strokeLinejoin="round" />
            <path d="M5 3v3h5V3" strokeLinejoin="round" />
            <rect x="5" y="9" width="6" height="4" />
          </svg>
          Save
        </button>
        <button
          type="button"
          onClick={handleExportSeason}
          className="inline-flex items-center gap-1.5 px-2.5 md:px-3 py-1.5 border border-rift-line text-rift-mutedbright hover:text-rift-goldbright hover:border-rift-gold/50 hover:bg-rift-gold/5 transition-all text-[9px] md:text-[10px] uppercase tracking-[0.3em]"
          title={
            season.franchise
              ? "Export this entire reality (timeline + season history) to a file — importable from the Realities hub"
              : "Export this season to a .json file you can re-import later (or on another device) from the main menu"
          }
        >
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
            <path d="M8 3v8M5 8l3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M3 13h10" strokeLinecap="round" />
          </svg>
          Export
        </button>
        <button
          type="button"
          onClick={() => setConfirmAbandon(true)}
          className="inline-flex items-center gap-1.5 px-2.5 md:px-3 py-1.5 border border-rift-line text-rift-mutedbright/60 hover:text-rift-redbright hover:border-rift-red/50 hover:bg-rift-red/5 transition-all text-[9px] md:text-[10px] uppercase tracking-[0.3em]"
        >
          Abandon
        </button>
      </div>

      <div className="max-w-6xl mx-auto pt-8">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="text-[10px] uppercase tracking-[0.5em] text-rift-gold/70 mb-1">
            Season Mode
          </div>
          <h1 className="font-display text-3xl md:text-5xl tracking-[0.12em] text-rift-goldbright">
            {season.name}
          </h1>
          {controlled && (
            <div className="mt-1 text-[10px] uppercase tracking-[0.3em] text-rift-bluebright inline-flex items-center gap-1.5">
              <TeamNameLink
                teamId={controlled.id}
                name={controlled.name}
                leagueId={controlled.leagueId}
                iconKey={controlled.iconKey}
                logoUrl={controlled.logoUrl}
                color={controlled.color}
                logoSize={12}
                hint={{ team: controlled }}
                renderAs="span"
                className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.3em] text-rift-bluebright"
              >
                Following {controlled.name}
              </TeamNameLink>
              (
              <LeagueIcon league={controlled.leagueId} size={13} />
              {controlled.leagueId})
            </div>
          )}
        </div>

        {/* My team: roster (tiers + shifts) + next match (play / watch). */}
        <MyTeamPanel />

        {/* Franchise / realities — live banner during the year, full offseason
            view (stats + biggest transfer window + finalize) once it's done. */}
        <FranchisePanel />
        <OffseasonView />
        <BulkYearsControl />

        {!simulating && <SeasonSimResultsFeed />}

        {/* Champion banner */}
        {season.status === "complete" && championTeam && (
          <div className="mb-8 border-2 border-rift-gold/70 bg-rift-gold/10 px-4 py-5 text-center">
            <div className="text-[10px] uppercase tracking-[0.5em] text-rift-gold/80 mb-1">
              World Champion
            </div>
            <div className="font-display text-2xl md:text-4xl tracking-[0.15em] text-rift-goldbright inline-flex items-center gap-3">
              <TeamNameLink
                teamId={championTeam.id}
                name={championTeam.name}
                leagueId={championTeam.leagueId}
                iconKey={championTeam.iconKey}
                logoUrl={championTeam.logoUrl}
                color={championTeam.color}
                logoSize={28}
                hint={{ team: championTeam }}
                renderAs="span"
                className="font-display text-2xl md:text-4xl tracking-[0.15em] text-rift-goldbright inline-flex items-center gap-3"
              />
              <span className="text-rift-gold/60 text-base md:text-xl inline-flex items-center gap-2">
                <LeagueIcon league={championTeam.leagueId} size={24} />
                {championTeam.leagueId}
              </span>
            </div>
            {goldenRoadId === championTeam.id && (
              <div className="mt-3 inline-block border border-rift-goldbright bg-gradient-to-r from-rift-gold/20 via-rift-goldbright/25 to-rift-gold/20 px-4 py-1.5">
                <span className="font-display text-sm md:text-lg tracking-[0.3em] uppercase bg-gold-sheen bg-clip-text text-transparent">
                  ★ Golden Road ★
                </span>
                <div className="text-[8px] uppercase tracking-[0.3em] text-rift-gold/70 mt-0.5">
                  {seasonHasGlobalCup(season)
                    ? "Swept all 3 splits + First Stand, MSI, Worlds & Global Cup"
                    : "Swept all 3 splits + First Stand, MSI & Worlds"}
                </div>
              </div>
            )}
            <div className="mt-3">
              <button
                type="button"
                disabled={inHistory}
                onClick={() => {
                  if (archiveSeasonToHistory()) {
                    setSaveFeedback("Added to Season History");
                  }
                }}
                className="px-3 py-1.5 border border-rift-gold/50 text-rift-goldbright text-[9px] uppercase tracking-[0.3em] hover:bg-rift-gold/10 disabled:opacity-50 disabled:cursor-default transition-all"
                title="Archive this season's résumé — champion, finalist, and title holders — to the Season History timeline on the main menu"
              >
                {inHistory ? "In Season History ✓" : "Add to Season History"}
              </button>
            </div>
          </div>
        )}

        {/* Phase timeline — a left-to-right tracker of the season's six
            phases. Splits read neutral, internationals gold; the active
            phase shows a live match-progress bar, finished phases a ✓. */}
        <div className="mb-7 overflow-x-auto pb-1">
          <div className="inline-flex items-stretch gap-0 min-w-full justify-center">
            {season.phases.map((p, i) => {
              const prog = phaseProgress(season, p);
              const pct =
                prog.total > 0
                  ? Math.round((100 * prog.done) / prog.total)
                  : p.status === "complete"
                    ? 100
                    : 0;
              const isIntl = p.kind === "international";
              const isTransfer = p.kind === "transfer";
              const active = p.status === "in-progress";
              const complete = p.status === "complete";
              const moveCount = isTransfer && p.event
                ? season.transfersByEvent?.[p.event]?.length ?? 0
                : 0;
              return (
                <div key={`${p.label}-${i}`} className="flex items-stretch">
                  {i > 0 && (
                    <span
                      className={`self-center px-1 text-xs ${complete || active ? "text-rift-gold/50" : "text-rift-line/50"}`}
                      aria-hidden
                    >
                      →
                    </span>
                  )}
                  <div
                    className={`${isTransfer ? "min-w-[70px] md:min-w-[78px]" : "min-w-[92px] md:min-w-[104px]"} px-2.5 py-1.5 border flex flex-col gap-1 ${
                      active
                        ? isTransfer
                          ? "border-rift-blue bg-rift-blue/15 border-dashed"
                          : "border-rift-gold bg-rift-gold/15"
                        : complete
                          ? isIntl
                            ? "border-rift-gold/45 bg-rift-gold/[0.06]"
                            : isTransfer
                              ? "border-rift-blue/35 bg-rift-blue/[0.04] border-dashed"
                              : "border-rift-gold/30 bg-rift-gold/[0.03]"
                          : isTransfer
                            ? "border-rift-line/40 bg-rift-bg/30 border-dashed"
                            : "border-rift-line/50 bg-rift-bg/30"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className={`text-[9px] uppercase tracking-[0.2em] truncate ${
                          active
                            ? isTransfer
                              ? "text-rift-bluebright"
                              : "text-rift-goldbright"
                            : complete
                              ? isTransfer
                                ? "text-rift-bluebright/70"
                                : "text-rift-gold/70"
                              : "text-rift-muted"
                        }`}
                      >
                        {isTransfer ? "Transfers" : p.label}
                      </span>
                      {complete ? (
                        <span className={`text-[9px] ${isTransfer ? "text-rift-bluebright/70" : "text-rift-gold/70"}`} aria-hidden>
                          ✓
                        </span>
                      ) : active ? (
                        <span className={`text-[8px] animate-pulse ${isTransfer ? "text-rift-bluebright" : "text-rift-goldbright"}`} aria-hidden>
                          ●
                        </span>
                      ) : null}
                    </div>
                    <div
                      className={`text-[7px] uppercase tracking-[0.2em] ${
                        isIntl ? "text-rift-gold/55" : isTransfer ? "text-rift-blue/55" : "text-rift-mutedbright/45"
                      }`}
                    >
                      {isIntl ? "International" : isTransfer ? "Window" : "Split"}
                    </div>
                    {isTransfer && (complete || active) && (
                      <div className="text-[7px] tabular-nums text-rift-mutedbright/55">
                        {moveCount} move{moveCount === 1 ? "" : "s"}
                      </div>
                    )}
                    {!isTransfer && (active || (complete && prog.total > 0)) && (
                      <div className="flex items-center gap-1">
                        <div className="flex-1 h-1 bg-rift-line/30 overflow-hidden">
                          <div
                            className="h-full bg-rift-gold/70"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-[7px] tabular-nums text-rift-mutedbright/55">
                          {prog.done}/{prog.total}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Transfer window — no content-visibility: sticky filters + hover cards
            need continuous layout (see globals.css .cv-auto). */}
        <div className="mb-8">
          <TransferWindowPanel />
        </div>

        {/* Browse every region's teams + full rosters */}
        <div className="cv-auto">
          <TeamBrowserPanel />
        </div>

        {/* League-wide free-agent pool (aging franchise) */}
        <div className="cv-auto">
          <FreeAgentsPanel />
        </div>

        {/* Sim controls — hidden while a transfer window is open (nothing to
            sim; the window's "Proceed" button advances the season). */}
        {season.status !== "complete" &&
          season.phases[season.phaseIndex]?.kind !== "transfer" && (
          <div className="flex items-center justify-center gap-2 mb-7 flex-wrap">
            <button
              type="button"
              disabled={!!simulating}
              onClick={() => simSeasonMatchday()}
              className="px-4 py-2 border-2 border-rift-gold bg-rift-gold/10 text-rift-goldbright text-[10px] uppercase tracking-[0.3em] hover:bg-rift-gold/20 disabled:opacity-40 transition-all"
              title={
                phase?.kind === "split"
                  ? "Play the next matchday across all six regions at once"
                  : "Play the next round of this event"
              }
            >
              ▸ Sim Matchday
            </button>
            <button
              type="button"
              disabled={!!simulating}
              onClick={() => simSeason("phase")}
              className="px-4 py-2 border border-rift-gold/60 text-rift-goldbright text-[10px] uppercase tracking-[0.3em] hover:bg-rift-gold/10 hover:border-rift-gold disabled:opacity-40 transition-all"
            >
              Sim {phase?.label ?? "Phase"}
            </button>
            <button
              type="button"
              disabled={!!simulating}
              onClick={() => simSeason("all")}
              className="px-4 py-2 border border-rift-line text-rift-mutedbright text-[10px] uppercase tracking-[0.3em] hover:text-rift-goldbright hover:border-rift-gold/50 disabled:opacity-40 transition-all"
              title="Simulate every remaining match of the season"
            >
              Sim Rest of Season
            </button>
            <button
              type="button"
              onClick={() => setStatsOpen(!statsOpen)}
              className={`px-4 py-2 border text-[10px] uppercase tracking-[0.3em] transition-all ${
                statsOpen
                  ? "border-rift-gold/60 text-rift-goldbright bg-rift-gold/10"
                  : "border-rift-line text-rift-mutedbright hover:text-rift-goldbright hover:border-rift-gold/50"
              }`}
              title="Season-wide stats so far — top teams, champions, trophies"
            >
              Season Stats {statsOpen ? "▴" : "▾"}
            </button>
            <SimProgressLabel />
          </div>
        )}

        {/* Latest matchday results, per region (updates each matchday). */}
        {seasonMatchday && season.status !== "complete" && (
          <div className="cv-auto">
            <LatestMatchdayPanel
              matchday={seasonMatchday}
              onViewReplay={(tournamentId, matchId) =>
                setMatchReplay({ tournamentId, matchId })
              }
            />
          </div>
        )}

        {/* Season-wide stats, available any time once games exist. */}
        {season.status !== "complete" && statsOpen && (
          <div className="cv-auto">
            <SeasonRecapPanel
              season={season}
              championsById={championsById}
              title="Season So Far"
            />
          </div>
        )}

        {/* The season's narrative recap, once it's over. */}
        {season.status === "complete" && (
          <div className="cv-auto">
            <SeasonStoryCard story={seasonStory} />
          </div>
        )}

        {/* All-Pro Team of the Year — best per lane across the whole season. */}
        {season.status === "complete" && (
          <div className="cv-auto">
            <SeasonOfTheYear season={season} />
          </div>
        )}

        {/* Season-wide recap — the year in numbers, once it's over. */}
        {season.status === "complete" && (
          <div className="cv-auto">
            <SeasonRecapPanel season={season} championsById={championsById} />
          </div>
        )}

        {/* Narrative power rankings — form + results + light meta-fit. */}
        <div className="cv-auto">
          <PowerRankingsPanel season={season} champions={champions} />
        </div>

        {/* The season's evolving meta: view/edit tiers & pairings,
            export codes, save to the libraries. No content-visibility here —
            it opens the tier-list / meta-editor / synergy modals, and paint
            containment would make this div their containing block, trapping
            the `fixed inset-0` overlays inside the panel. It's collapsed by
            default anyway, so there's little to skip. */}
        <SeasonMetaPanel />

        {/* Current phase */}
        {phase && season.status !== "complete" && (
          <div className="cv-auto">
            <PhasePanel
              season={season}
              phase={phase}
              onOpen={openSeasonTournament}
            />
          </div>
        )}

        {/* Past phases / results */}
        <div className="cv-auto">
          <PastResults
            season={season}
            championsById={championsById}
            onOpen={openSeasonTournament}
          />
        </div>
      </div>

      <Modal
        open={confirmAbandon}
        title="Abandon Season?"
        message={`"${season.name}" and all its results will be permanently deleted. This cannot be undone.`}
        confirmLabel="Abandon"
        cancelLabel="Cancel"
        tone="danger"
        onConfirm={() => {
          setConfirmAbandon(false);
          abandonSeason();
        }}
        onCancel={() => setConfirmAbandon(false)}
      />

      {replayTournament && replayMatch && (
        <Suspense
          fallback={
            <ReplayLoadingOverlay onClose={() => setMatchReplay(null)} />
          }
        >
          <MatchReplayModal
            match={replayMatch}
            tournament={replayTournament}
            onClose={() => setMatchReplay(null)}
          />
        </Suspense>
      )}
    </div>
  );
}

/** Owns the simProgress store subscription so tick updates don't re-render
 *  the entire season dashboard tree (panels, rankings, meta, etc.). */
function SimProgressLabel() {
  const simProgress = useDraftStore((s) => s.simProgress);
  if (!simProgress) return null;
  return (
    <span className="text-[9px] uppercase tracking-[0.25em] text-rift-gold/70 tabular-nums">
      {simProgress.done}/{simProgress.total}
    </span>
  );
}

// ─── Compact read-only playoff bracket (inside a region card) ───────────────

function MiniBracket({
  tournament,
  matches,
}: {
  tournament: TournamentState;
  matches: TournamentMatch[];
}) {
  const season = useDraftStore((s) => s.season);
  const bands: Array<{ key: string; label: string }> = [
    { key: "winners", label: "Winners" },
    { key: "losers", label: "Losers" },
    { key: "elimination", label: "Last-Chance" },
    { key: "consolation", label: "Consolation Final" },
    { key: "grand-final", label: "Grand Final" },
    { key: "grand-final-reset", label: "Reset" },
  ];
  // Banded matches (DE/TE/stage-playoffs). Standalone single-elim has no
  // bracket tag — fall back to a single "by round" band so SE renders too.
  const present = bands.filter((b) =>
    matches.some((m) => m.bracket === b.key),
  );
  const useByRound = present.length === 0 && matches.length > 0;
  const byRound: TournamentMatch[][] = useByRound
    ? (() => {
        const max = matches.reduce((a, m) => Math.max(a, m.round), 0);
        const out: TournamentMatch[][] = [];
        for (let r = 1; r <= max; r++) {
          const inR = matches.filter((m) => m.round === r);
          if (inR.length > 0) out.push(inR);
        }
        return out;
      })()
    : [];
  const roundLabel = (idx: number, total: number) =>
    idx === total - 1
      ? "Final"
      : idx === total - 2
        ? "Semifinals"
        : idx === total - 3
          ? "Quarterfinals"
          : `Round ${idx + 1}`;
  const teamOf = (id: string | null) =>
    id ? tournament.teams.find((t) => t.id === id) ?? null : null;
  const MatchRow = ({ m }: { m: TournamentMatch }) => {
    const blue = teamOf(m.blueTeamId);
    const red = teamOf(m.redTeamId);
    const blueWon = m.winner?.teamId === m.blueTeamId;
    const redWon = m.winner?.teamId === m.redTeamId;
    const blueSeason =
      m.blueTeamId && season ? seasonTeam(season, m.blueTeamId) : null;
    const redSeason =
      m.redTeamId && season ? seasonTeam(season, m.redTeamId) : null;
    return (
      <div className="flex items-center gap-1 text-[9px]">
        <span className="flex-1 flex items-center justify-end gap-1 min-w-0">
          {blue ? (
            <TeamNameLink
              teamId={blue.id}
              name={blue.name}
              leagueId={blueSeason?.leagueId}
              iconKey={blue.iconKey}
              logoUrl={blue.logoUrl}
              color={blue.color}
              logoSize={11}
              showLogo={false}
              renderAs="span"
              className={`truncate ${blueWon ? "text-rift-goldbright font-semibold" : "text-rift-mutedbright/60"}`}
              hint={blueSeason ? { team: blueSeason } : { name: blue.name, iconKey: blue.iconKey, logoUrl: blue.logoUrl, color: blue.color }}
              opponentTeamId={red?.id}
              opponentHint={
                redSeason
                  ? { team: redSeason }
                  : red
                    ? { name: red.name, iconKey: red.iconKey, logoUrl: red.logoUrl, color: red.color }
                    : undefined
              }
            />
          ) : (
            <span className="truncate text-rift-mutedbright/60">TBD</span>
          )}
          {blue && (
            <TeamLogoLink
              teamId={blue.id}
              name={blue.name}
              leagueId={blueSeason?.leagueId}
              iconKey={blue.iconKey}
              logoUrl={blue.logoUrl}
              color={blue.color}
              size={11}
              renderAs="span"
              hint={blueSeason ? { team: blueSeason } : { name: blue.name, iconKey: blue.iconKey, logoUrl: blue.logoUrl, color: blue.color }}
              opponentTeamId={red?.id}
              opponentHint={
                redSeason
                  ? { team: redSeason }
                  : red
                    ? { name: red.name, iconKey: red.iconKey, logoUrl: red.logoUrl, color: red.color }
                    : undefined
              }
            />
          )}
        </span>
        <span className="text-rift-mutedbright/70 px-1 flex-shrink-0 tabular-nums">
          {m.winner ? `${m.winner.blueWins}-${m.winner.redWins}` : "vs"}
        </span>
        <span className="flex-1 flex items-center gap-1 min-w-0">
          {red && (
            <TeamLogoLink
              teamId={red.id}
              name={red.name}
              leagueId={redSeason?.leagueId}
              iconKey={red.iconKey}
              logoUrl={red.logoUrl}
              color={red.color}
              size={11}
              renderAs="span"
              hint={redSeason ? { team: redSeason } : { name: red.name, iconKey: red.iconKey, logoUrl: red.logoUrl, color: red.color }}
              opponentTeamId={blue?.id}
              opponentHint={
                blueSeason
                  ? { team: blueSeason }
                  : blue
                    ? { name: blue.name, iconKey: blue.iconKey, logoUrl: blue.logoUrl, color: blue.color }
                    : undefined
              }
            />
          )}
          {red ? (
            <TeamNameLink
              teamId={red.id}
              name={red.name}
              leagueId={redSeason?.leagueId}
              iconKey={red.iconKey}
              logoUrl={red.logoUrl}
              color={red.color}
              logoSize={11}
              showLogo={false}
              renderAs="span"
              className={`truncate ${redWon ? "text-rift-goldbright font-semibold" : "text-rift-mutedbright/60"}`}
              hint={redSeason ? { team: redSeason } : { name: red.name, iconKey: red.iconKey, logoUrl: red.logoUrl, color: red.color }}
              opponentTeamId={blue?.id}
              opponentHint={
                blueSeason
                  ? { team: blueSeason }
                  : blue
                    ? { name: blue.name, iconKey: blue.iconKey, logoUrl: blue.logoUrl, color: blue.color }
                    : undefined
              }
            />
          ) : (
            <span className="truncate text-rift-mutedbright/60">TBD</span>
          )}
        </span>
      </div>
    );
  };
  return (
    <div className="border border-rift-line/30 bg-rift-bg/30 p-2 space-y-2">
      <div className="text-[8px] uppercase tracking-[0.3em] text-rift-gold/60">
        Bracket
      </div>
      {present.map((band) => {
        const bm = matches
          .filter((m) => m.bracket === band.key)
          .sort((a, b) => a.round - b.round);
        return (
          <div key={band.key}>
            {present.length > 1 && (
              <div className="text-[7px] uppercase tracking-[0.25em] text-rift-mutedbright/45 mb-0.5">
                {band.label}
              </div>
            )}
            <div className="space-y-0.5">
              {bm.map((m) => (
                <MatchRow key={m.id} m={m} />
              ))}
            </div>
          </div>
        );
      })}
      {byRound.map((roundMatches, idx) => (
        <div key={idx}>
          <div className="text-[7px] uppercase tracking-[0.25em] text-rift-mutedbright/45 mb-0.5">
            {roundLabel(idx, byRound.length)}
          </div>
          <div className="space-y-0.5">
            {roundMatches.map((m) => (
              <MatchRow key={m.id} m={m} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Latest matchday results ───────────────────────────────────────────────

function MatchdayStageTag({ stage, group }: { stage: string; group?: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    winners: { label: "Winners", cls: "border-rift-gold/50 text-rift-gold/80" },
    losers: { label: "Losers", cls: "border-amber-500/50 text-amber-300/90" },
    elimination: { label: "Last-Chance", cls: "border-rift-red/50 text-rift-redbright/90" },
    consolation: { label: "Consolation", cls: "border-rift-red/50 text-rift-redbright/90" },
    "grand-final": { label: "Grand Final", cls: "border-rift-goldbright/60 text-rift-goldbright" },
    "grand-final-reset": { label: "GF Reset", cls: "border-rift-goldbright/60 text-rift-goldbright" },
    stepladder: { label: "Stepladder", cls: "border-rift-gold/50 text-rift-gold/80" },
    group: { label: group ? `Group ${group}` : "Group", cls: "border-rift-line/60 text-rift-mutedbright/70" },
    regular: { label: "", cls: "" },
  };
  const t = map[stage] ?? { label: stage, cls: "border-rift-line/60 text-rift-mutedbright/70" };
  if (!t.label) return null;
  return (
    <span className={`px-1 py-px border text-[7px] uppercase tracking-[0.15em] flex-shrink-0 ${t.cls}`}>
      {t.label}
    </span>
  );
}

function MatchdayResultTag({ tag }: { tag: string }) {
  if (tag === "reverse-sweep") {
    return (
      <span
        className="px-1 py-px border border-rift-red/50 text-rift-redbright/90 text-[7px] uppercase tracking-[0.12em] flex-shrink-0"
        title="Reverse sweep — 0-2 comeback to win 3-2"
      >
        Rev Sweep
      </span>
    );
  }
  return (
    <span className="px-1 py-px border border-rift-line/60 text-rift-mutedbright/70 text-[7px] uppercase tracking-[0.12em] flex-shrink-0">
      {tag}
    </span>
  );
}

function LatestMatchdayPanel({
  matchday,
  onViewReplay,
}: {
  matchday: SeasonMatchdayResult;
  onViewReplay?: (tournamentId: string, matchId: string) => void;
}) {
  if (matchday.regions.length === 0) return null;
  return (
    <div className="mb-7 border border-rift-gold/40 bg-rift-bg/40">
      <div className="px-3 py-1.5 border-b border-rift-gold/30 bg-rift-gold/[0.05] flex items-baseline gap-2">
        <span className="text-[10px] uppercase tracking-[0.4em] text-rift-goldbright">
          Latest Matchday
        </span>
        <span className="text-[9px] uppercase tracking-[0.25em] text-rift-mutedbright/60 truncate">
          {matchday.label}
        </span>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-x-4 gap-y-3 p-3">
        {matchday.regions.map((r) => (
          <div key={r.name} className="min-w-0">
            <div className="text-[9px] uppercase tracking-[0.3em] text-rift-gold/65 mb-1.5 truncate border-b border-rift-line/20 pb-0.5">
              {r.name}
            </div>
            {r.results.length === 0 ? (
              <div className="text-[10px] italic text-rift-muted">
                {r.qualified ? "Play-in decided" : "—"}
              </div>
            ) : (
              <div className="space-y-1">
                {r.results.map((m, i) => {
                  const canReplay =
                    m.hasReplay &&
                    m.tournamentId &&
                    m.matchId &&
                    onViewReplay;
                  const row = (
                    <div className="flex items-center gap-1.5 text-[10px]">
                    {/* Blue side (right-aligned toward the score) */}
                    <span className="flex-1 flex items-center justify-end gap-1 min-w-0">
                      <TeamNameLink
                        teamId={m.blue.id}
                        name={m.blue.name}
                        leagueId={r.league ?? undefined}
                        iconKey={m.blue.iconKey}
                        logoUrl={m.blue.logoUrl}
                        color={m.blue.color}
                        showLogo={false}
                        renderAs="span"
                        className={`truncate ${m.blueWon ? "text-rift-goldbright font-semibold" : "text-rift-mutedbright/55"}`}
                        hint={{
                          name: m.blue.name,
                          ...(r.league ? { leagueId: r.league } : {}),
                          iconKey: m.blue.iconKey,
                          logoUrl: m.blue.logoUrl,
                          color: m.blue.color,
                        }}
                        opponentTeamId={m.red.id}
                        opponentHint={{
                          name: m.red.name,
                          ...(r.league ? { leagueId: r.league } : {}),
                          iconKey: m.red.iconKey,
                          logoUrl: m.red.logoUrl,
                          color: m.red.color,
                        }}
                      />
                      <TeamLogoLink
                        teamId={m.blue.id}
                        name={m.blue.name}
                        leagueId={r.league ?? undefined}
                        iconKey={m.blue.iconKey}
                        logoUrl={m.blue.logoUrl}
                        color={m.blue.color}
                        size={12}
                        renderAs="span"
                        hint={{
                          name: m.blue.name,
                          ...(r.league ? { leagueId: r.league } : {}),
                          iconKey: m.blue.iconKey,
                          logoUrl: m.blue.logoUrl,
                          color: m.blue.color,
                        }}
                        opponentTeamId={m.red.id}
                        opponentHint={{
                          name: m.red.name,
                          ...(r.league ? { leagueId: r.league } : {}),
                          iconKey: m.red.iconKey,
                          logoUrl: m.red.logoUrl,
                          color: m.red.color,
                        }}
                      />
                    </span>
                    <span className="tabular-nums text-rift-mutedbright/85 px-1 flex-shrink-0 font-display">
                      <span className={m.blueWon ? "text-rift-goldbright" : ""}>
                        {m.blueScore}
                      </span>
                      <span className="text-rift-mutedbright/40">-</span>
                      <span className={!m.blueWon ? "text-rift-goldbright" : ""}>
                        {m.redScore}
                      </span>
                    </span>
                    {/* Red side (left-aligned from the score) */}
                    <span className="flex-1 flex items-center gap-1 min-w-0">
                      <TeamLogoLink
                        teamId={m.red.id}
                        name={m.red.name}
                        leagueId={r.league ?? undefined}
                        iconKey={m.red.iconKey}
                        logoUrl={m.red.logoUrl}
                        color={m.red.color}
                        size={12}
                        renderAs="span"
                        hint={{
                          name: m.red.name,
                          ...(r.league ? { leagueId: r.league } : {}),
                          iconKey: m.red.iconKey,
                          logoUrl: m.red.logoUrl,
                          color: m.red.color,
                        }}
                        opponentTeamId={m.blue.id}
                        opponentHint={{
                          name: m.blue.name,
                          ...(r.league ? { leagueId: r.league } : {}),
                          iconKey: m.blue.iconKey,
                          logoUrl: m.blue.logoUrl,
                          color: m.blue.color,
                        }}
                      />
                      <TeamNameLink
                        teamId={m.red.id}
                        name={m.red.name}
                        leagueId={r.league ?? undefined}
                        iconKey={m.red.iconKey}
                        logoUrl={m.red.logoUrl}
                        color={m.red.color}
                        showLogo={false}
                        renderAs="span"
                        className={`truncate ${!m.blueWon ? "text-rift-goldbright font-semibold" : "text-rift-mutedbright/55"}`}
                        hint={{
                          name: m.red.name,
                          ...(r.league ? { leagueId: r.league } : {}),
                          iconKey: m.red.iconKey,
                          logoUrl: m.red.logoUrl,
                          color: m.red.color,
                        }}
                        opponentTeamId={m.blue.id}
                        opponentHint={{
                          name: m.blue.name,
                          ...(r.league ? { leagueId: r.league } : {}),
                          iconKey: m.blue.iconKey,
                          logoUrl: m.blue.logoUrl,
                          color: m.blue.color,
                        }}
                      />
                    </span>
                    <MatchdayStageTag stage={m.stage} group={m.group} />
                    {m.tags?.map((tag) => (
                      <MatchdayResultTag key={tag} tag={tag} />
                    ))}
                    {canReplay && (
                      <span className="text-[8px] uppercase tracking-[0.15em] text-rift-gold/60 flex-shrink-0">
                        · View
                      </span>
                    )}
                    </div>
                  );
                  if (!canReplay) {
                    return (
                      <div key={i}>{row}</div>
                    );
                  }
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() =>
                        onViewReplay!(m.tournamentId!, m.matchId!)
                      }
                      className="w-full text-left rounded-sm hover:bg-rift-gold/[0.06] transition-colors px-0.5 -mx-0.5"
                      title="View match recap"
                    >
                      {row}
                    </button>
                  );
                })}
              </div>
            )}
            {r.qualified && r.qualified.length > 0 && (
              <div className="mt-1.5 pt-1 border-t border-rift-line/20">
                <span className="text-[8px] uppercase tracking-[0.2em] text-rift-bluebright/70">
                  Qualified →
                </span>
                <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5">
                  {r.qualified.map((q) => (
                    <TeamNameLink
                      key={q.name}
                      teamId={q.id}
                      name={q.name}
                      leagueId={r.league ?? undefined}
                      iconKey={q.iconKey}
                      logoUrl={q.logoUrl}
                      color={q.color}
                      logoSize={11}
                      renderAs="span"
                      className="inline-flex items-center gap-1 text-[10px] text-rift-bluebright"
                      hint={{
                        name: q.name,
                        ...(r.league ? { leagueId: r.league } : {}),
                        iconKey: q.iconKey,
                        logoUrl: q.logoUrl,
                        color: q.color,
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Current phase panel ───────────────────────────────────────────────────

function PhasePanel({
  season,
  phase,
  onOpen,
}: {
  season: SeasonState;
  phase: SeasonPhase;
  onOpen: (tournamentId: string) => void;
}) {
  const tournaments = phase.tournamentIds
    .map((id) => season.tournaments[id])
    .filter((t): t is TournamentState => t != null);
  // Splits render one card per league in canonical league order.
  const ordered =
    phase.kind === "split"
      ? [...tournaments].sort(
          (a, b) =>
            LEAGUE_IDS.indexOf(leagueOfTournament(season, a) ?? "LCK") -
            LEAGUE_IDS.indexOf(leagueOfTournament(season, b) ?? "LCK"),
        )
      : tournaments;
  const progress = phaseProgress(season, phase);
  return (
    <div className="mb-8">
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-[10px] uppercase tracking-[0.4em] text-rift-gold/70">
          {phase.label}
        </div>
        <div className="text-[9px] uppercase tracking-[0.25em] text-rift-mutedbright/60 tabular-nums">
          {progress.done}/{progress.total} matches
        </div>
      </div>
      <div
        className={`grid gap-3 ${
          phase.kind === "split"
            ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
            : "grid-cols-1 md:grid-cols-2"
        }`}
      >
        {ordered.map((t) => (
          <TournamentCard
            key={t.id}
            season={season}
            tournament={t}
            onOpen={() => onOpen(t.id)}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Power rankings ────────────────────────────────────────────────────────
// A derived, always-available readout blending roster strength, current
// form, the most recent result, and a light meta-fit. Pure UI — no config
// flag needed; the form terms simply read 0 when those systems are off.

const POWER_TAG_LABEL: Record<PowerTag, string> = {
  "team-of-split": "Team of the Split",
  "biggest-riser": "Riser",
  "biggest-faller": "Faller",
};

function PowerRankRow({
  row,
  spread,
  min,
  stats,
}: {
  row: PowerRankingRow;
  spread: number;
  min: number;
  stats?: LiveTeamStats;
}) {
  // Bar fills relative to the visible field (best = full, worst ≈ empty).
  const pct = spread > 0 ? 8 + 92 * ((row.score - min) / spread) : 100;
  const glyph =
    row.movement === "up" ? "▲" : row.movement === "down" ? "▼" : "·";
  const glyphColor =
    row.movement === "up"
      ? "text-emerald-400"
      : row.movement === "down"
        ? "text-rift-redbright"
        : "text-rift-muted/50";
  return (
    <div className="flex items-center gap-1.5 text-[10px] text-rift-mutedbright">
      <span className="w-4 text-rift-muted/70 tabular-nums">{row.rank}</span>
      <span className={`w-2 text-center ${glyphColor}`} aria-hidden>
        {glyph}
      </span>
      <TeamNameLink
        teamId={row.team.id}
        name={row.team.name}
        leagueId={row.team.leagueId}
        iconKey={row.team.iconKey}
        logoUrl={row.team.logoUrl}
        color={row.team.color}
        logoSize={12}
        hint={{ team: row.team }}
        renderAs="span"
        className="truncate w-24 flex-shrink-0 text-[10px] text-rift-mutedbright"
      />
      <TeamLiveStatsInline stats={stats} showTitles={false} className="w-[4.5rem] justify-end" />
      {/* Score bar */}
      <div className="flex-1 h-1.5 bg-rift-line/40 min-w-8">
        <div
          className="h-full bg-rift-gold/60"
          style={{ width: `${pct}%` }}
        />
      </div>
      {/* Numeric team score (star-equivalent units). */}
      <span className="w-7 text-right tabular-nums text-rift-gold/80 flex-shrink-0">
        {row.score.toFixed(1)}
      </span>
      {row.tags
        .filter((t) => t !== "team-of-split" || row.rank === 1)
        .map((t) => (
          <span
            key={t}
            className={`px-1 py-px text-[8px] uppercase tracking-[0.15em] border flex-shrink-0 ${
              t === "biggest-faller"
                ? "border-rift-red/50 text-rift-redbright"
                : "border-rift-gold/50 text-rift-goldbright"
            }`}
          >
            {POWER_TAG_LABEL[t]}
          </span>
        ))}
    </div>
  );
}

function PowerRankingsPanel({
  season,
  champions,
}: {
  season: SeasonState;
  champions: readonly Champion[];
}) {
  // Collapsed by default — full-field rankings are expensive to compute and
  // paint; mid-sim season commits shouldn't pay for a closed panel.
  const [open, setOpen] = useState(false);
  const rows = useMemo(
    () => (open ? computePowerRankings(season, champions) : []),
    [season, champions, open],
  );
  const teamStats = useMemo(
    () => (open ? buildLiveTeamStatsMap(season) : null),
    [open, season],
  );
  const min = rows.length > 0 ? rows[rows.length - 1].score : 0;
  const spread = rows.length > 0 ? rows[0].score - min : 0;
  return (
    <div className="mb-8">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`group w-full flex items-center justify-between gap-3 border px-3 py-2.5 text-left transition-all ${
          open
            ? "border-rift-gold/55 bg-rift-gold/[0.08] text-rift-goldbright"
            : "border-rift-line/60 bg-rift-bg/40 text-rift-mutedbright hover:border-rift-gold/50 hover:bg-rift-gold/[0.06] hover:text-rift-goldbright"
        }`}
      >
        <span className="min-w-0">
          <span className="block text-[10px] uppercase tracking-[0.4em]">
            Power Rankings{open && rows.length > 0 ? ` · ${rows.length} Teams` : ""}
          </span>
          <span className="mt-0.5 block text-[8px] uppercase tracking-[0.22em] text-rift-muted/55 group-hover:text-rift-mutedbright/70 transition-colors">
            {open ? "Click to collapse" : "Click to expand"}
          </span>
        </span>
        <span
          className={`flex h-7 w-7 flex-shrink-0 items-center justify-center border text-sm leading-none transition-all ${
            open
              ? "border-rift-gold/60 bg-rift-gold/15 text-rift-goldbright"
              : "border-rift-line/70 bg-rift-panel/40 text-rift-gold/80 group-hover:border-rift-gold/50 group-hover:text-rift-goldbright"
          }`}
          aria-hidden
        >
          {open ? "▴" : "▾"}
        </span>
      </button>
      {open && rows.length > 0 && (
        <div className="mt-2 border border-rift-line/40 bg-rift-bg/30 px-3 py-2">
          <div className="space-y-1 max-h-80 overflow-y-auto pr-1">
            {rows.map((row) => (
              <PowerRankRow
                key={row.team.id}
                row={row}
                spread={spread}
                min={min}
                stats={teamStats?.get(row.team.id)}
              />
            ))}
          </div>
          <div className="text-[8px] text-rift-muted/60 italic pt-1">
            Blends roster strength, recent form &amp; results, and meta fit.
          </div>
        </div>
      )}
    </div>
  );
}

function TournamentCard({
  season,
  tournament,
  onOpen,
}: {
  season: SeasonState;
  tournament: TournamentState;
  onOpen: () => void;
}) {
  const simSeason = useDraftStore((s) => s.simSeason);
  const simSeasonMatchday = useDraftStore((s) => s.simSeasonMatchday);
  const simulating = useDraftStore((s) => s.simulating);
  const [expanded, setExpanded] = useState(false);
  const fullStandings = useMemo(
    () => computeStandings(tournament),
    [tournament],
  );
  const standings = useMemo(() => fullStandings.slice(0, 4), [fullStandings]);
  // Season-wide series + titles for teams in this tournament (preview + expanded).
  const teamStats = useMemo(() => {
    const ids = new Set(tournament.teams.map((t) => t.id));
    return buildLiveTeamStatsMap(
      season,
      season.teams.filter((t) => ids.has(t.id)),
    );
  }, [season, tournament.teams]);
  // Pure-bracket formats (single/double/triple-elim) have no standings —
  // the bracket IS the result. Everything else has a regular-stage table.
  const hasStandings = formatHasStandings(tournament.format);
  // Playoff bracket matches (set once the bracket is generated) + the
  // advancing cutline for the standings table. For pure-bracket formats
  // the whole event is the bracket (single-elim leaves bracket undefined,
  // so fall back to all matches there).
  const playoffMatches = useMemo(() => {
    const banded = tournament.matches.filter((m) => m.bracket != null);
    if (hasStandings) return banded;
    return banded.length > 0 ? banded : tournament.matches;
  }, [tournament.matches, hasStandings]);
  const advancing =
    tournament.rrPlayoffsAdvancing ?? tournament.swissPlayoffsAdvancing ?? 0;
  const done = tournament.matches.filter((m) => m.winner).length;
  const champion = tournamentChampion(tournament);
  // The card's badge: an international event uses its own event logo
  // (First Stand / MSI / Worlds); a split uses the league's region logo.
  // leagueOfTournament falls back to the first team's region, which for an
  // international would wrongly read as that team's league — so the event
  // wins when this tournament sits in an international phase.
  const cardPhase = season.phases.find((p) =>
    p.tournamentIds.includes(tournament.id),
  );
  const cardBadge: LeagueId | InternationalId | null =
    cardPhase?.kind === "international" && cardPhase.event
      ? cardPhase.event
      : leagueOfTournament(season, tournament);
  const controlledId = season.config.controlledTeamId;
  // International events: each team's home region and its seed inside
  // that region's qualifying split (e.g. "LCK #1"), or the defending-
  // champion trophy pill. Compact labels — the full route lives in the
  // tooltip so long tags never squeeze the team name out.
  const regionSeeds = useMemo(() => {
    const phase = season.phases.find(
      (p) =>
        p.kind === "international" && p.tournamentIds.includes(tournament.id),
    );
    if (!phase?.event) return null;
    const event = phase.event;
    const map = new Map<string, QualifierTagInfo>();
    for (const q of qualifiedForInternational(season, event)) {
      map.set(
        q.team.id,
        q.via === "champion"
          ? { label: q.league, championOf: feederEventOf(event) ?? undefined }
          : {
              label: `${q.league} #${q.leagueSeed}`,
              title:
                event === "worlds"
                  ? `Worlds: ${qualifierTag(event, q)}`
                  : undefined,
            },
      );
    }
    return map;
  }, [season, tournament.id]);
  // Split tournaments: once THIS league's split is complete, the teams
  // it sends to the upcoming international (and how they qualified).
  const splitQualifiers = useMemo(() => {
    if (tournament.status !== "complete") return null;
    const phase = season.phases.find(
      (p) => p.kind === "split" && p.tournamentIds.includes(tournament.id),
    );
    if (!phase?.split) return null;
    const event = SPLIT_FEEDS_EVENT[phase.split];
    const league = leagueOfTournament(season, tournament);
    if (!league) return null;
    const qualifiers = qualifiedForInternational(season, event)
      .filter((q) => q.league === league)
      .sort((a, b) => a.leagueSeed - b.leagueSeed);
    if (qualifiers.length === 0) return null;
    return { event, qualifiers };
  }, [season, tournament]);
  // A play-in: the teams that advanced to the main event (intersection of
  // this play-in's teams with the main event's field).
  const isPlayIn = tournament.name.includes("Play-In");
  const playInQualified = useMemo(() => {
    if (!isPlayIn || tournament.status !== "complete") return null;
    const phase = season.phases.find((p) =>
      p.tournamentIds.includes(tournament.id),
    );
    const mainId = phase?.tournamentIds.find((id) => id !== tournament.id);
    const main = mainId ? season.tournaments[mainId] : null;
    if (!main) return null;
    const inPlayIn = new Set(tournament.teams.map((t) => t.id));
    const adv = main.teams.filter((t) => inPlayIn.has(t.id));
    return adv.length > 0 ? adv : null;
  }, [season, tournament, isPlayIn]);
  const total = tournament.matches.length;
  const pct =
    tournament.status === "complete"
      ? 100
      : total > 0
        ? Math.round((100 * done) / total)
        : 0;
  return (
    <div className="border border-rift-line/50 bg-rift-bg/40 hover:border-rift-gold/40 transition-colors flex flex-col cv-auto">
      {/* Completion strip — quick visual read of how far this stage is. */}
      <div className="h-1 bg-rift-line/25 overflow-hidden">
        <div
          className={`h-full ${tournament.status === "complete" ? "bg-rift-bluebright/70" : "bg-rift-gold/70"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-center justify-between gap-2 px-3 pt-2.5">
        <div className="flex items-center gap-2 min-w-0">
          {cardBadge && <LeagueIcon league={cardBadge} size={18} />}
          <div className="font-display text-sm tracking-wider text-rift-goldbright truncate">
            {tournament.name}
          </div>
        </div>
        <span
          className={`text-[9px] uppercase tracking-[0.25em] flex-shrink-0 tabular-nums ${
            tournament.status === "complete"
              ? "text-rift-bluebright"
              : "text-rift-mutedbright/60"
          }`}
        >
          {tournament.status === "complete"
            ? "Complete"
            : `${done}/${tournament.matches.length}`}
        </span>
      </div>
      <div className="px-3 py-2 flex-1">
        {playInQualified ? (
          <div>
            <div className="text-[8px] uppercase tracking-[0.3em] text-rift-bluebright/80 mb-1">
              Qualified → Main Event
            </div>
            <div className="space-y-0.5">
              {playInQualified.map((t) => {
                const st = season.teams.find((x) => x.id === t.id);
                // TeamNameLink renders inline-flex; wrap so qualifiers stack
                // top/bottom instead of sitting side-by-side.
                return (
                  <div key={t.id}>
                    <TeamNameLink
                      teamId={t.id}
                      name={t.name}
                      leagueId={st?.leagueId}
                      iconKey={t.iconKey}
                      logoUrl={t.logoUrl}
                      color={t.color}
                      logoSize={12}
                      renderAs="span"
                      className="flex items-center gap-1.5 text-[10px] text-rift-goldbright"
                      hint={st ? { team: st } : { name: t.name, iconKey: t.iconKey, logoUrl: t.logoUrl, color: t.color }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ) : champion && !isPlayIn ? (
          <div className="text-[10px] uppercase tracking-[0.25em] text-rift-goldbright flex items-center gap-1.5 flex-wrap">
            <TeamNameLink
              teamId={champion.id}
              name={champion.name}
              leagueId={season.teams.find((t) => t.id === champion.id)?.leagueId}
              iconKey={champion.iconKey}
              logoUrl={champion.logoUrl}
              color={champion.color}
              logoSize={13}
              renderAs="span"
              className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.25em] text-rift-goldbright"
              hint={{
                team: season.teams.find((t) => t.id === champion.id),
              }}
            >
              Champion: {champion.name}
            </TeamNameLink>
            <QualifierTagView tag={regionSeeds?.get(champion.id)} />
          </div>
        ) : hasStandings ? (
          <div className="space-y-0.5">
            {standings.map((s) => (
              <div
                key={s.team.id}
                className={`grid grid-cols-[0.75rem_minmax(0,1fr)_2rem_8.5rem] gap-1.5 items-center text-[10px] ${
                  s.team.id === controlledId
                    ? "text-rift-bluebright"
                    : "text-rift-mutedbright"
                }`}
              >
                <span className="text-rift-muted/70 tabular-nums">
                  {s.rank}
                </span>
                {/* Name + form/qualifier absorb variable chrome; W-L and
                    season (S1/I1) sit on fixed tracks so columns align. */}
                <span className="min-w-0 flex items-center gap-1.5 overflow-hidden">
                  <TeamNameLink
                    teamId={s.team.id}
                    name={s.team.name}
                    leagueId={season.teams.find((t) => t.id === s.team.id)?.leagueId}
                    iconKey={s.team.iconKey}
                    logoUrl={s.team.logoUrl}
                    color={s.team.color}
                    logoSize={12}
                    renderAs="span"
                    className={`truncate min-w-0 text-[10px] ${
                      s.team.id === controlledId
                        ? "text-rift-bluebright"
                        : "text-rift-mutedbright"
                    }`}
                    hint={{
                      team: season.teams.find((t) => t.id === s.team.id),
                    }}
                  />
                  <TeamFormBadge
                    form={s.team.form}
                    baseStar={s.team.starRating}
                  />
                  <QualifierTagView tag={regionSeeds?.get(s.team.id)} />
                </span>
                <span
                  className="tabular-nums text-rift-muted/70 text-right"
                  title="This tournament match W-L"
                >
                  {s.wins}-{s.losses}
                </span>
                <span className="min-w-0 overflow-hidden flex justify-end">
                  <TeamLiveStatsInline stats={teamStats.get(s.team.id)} />
                </span>
              </div>
            ))}
            {standings.length === 0 && (
              <div className="text-[10px] text-rift-muted italic">
                No matches played yet
              </div>
            )}
          </div>
        ) : (
          // Pure-bracket format: no standings — show a compact bracket.
          <MiniBracket tournament={tournament} matches={playoffMatches} />
        )}
        {/* Once the split wraps, surface who this region sends to the
            next international and how each slot was earned. */}
        {splitQualifiers && (
          <div className="mt-2 pt-1.5 border-t border-rift-line/30">
            <div className="text-[8px] uppercase tracking-[0.3em] text-rift-bluebright/80 mb-1">
              Qualified → {INTERNATIONAL_LABELS[splitQualifiers.event]}
            </div>
            <div className="space-y-0.5">
              {splitQualifiers.qualifiers.map((q) => {
                const st = season.teams.find((t) => t.id === q.team.id);
                return (
                <div
                  key={q.team.id}
                  className="flex items-center gap-1.5 text-[10px] text-rift-mutedbright"
                >
                  <TeamNameLink
                    teamId={q.team.id}
                    name={q.team.name}
                    leagueId={st?.leagueId}
                    iconKey={q.team.iconKey}
                    logoUrl={q.team.logoUrl}
                    color={q.team.color}
                    logoSize={11}
                    renderAs="span"
                    className="truncate flex-1 text-[10px] text-rift-mutedbright"
                    hint={st ? { team: st } : { name: q.team.name, iconKey: q.team.iconKey, logoUrl: q.team.logoUrl, color: q.team.color }}
                  />
                  {q.via === "champion" ? (
                    <IntlChampionBadge
                      event={feederEventOf(splitQualifiers.event)!}
                    />
                  ) : (
                    <span
                      title={qualifierTag(splitQualifiers.event, q)}
                      className="text-[8px] uppercase tracking-[0.15em] text-rift-gold/60 whitespace-nowrap flex-shrink-0"
                    >
                      {qualifierTag(splitQualifiers.event, q)}
                    </span>
                  )}
                </div>
                );
              })}
            </div>
          </div>
        )}
        {/* Expand for the full standings table + playoff bracket. Only
            shown for formats that HAVE standings — pure-bracket formats
            already render their bracket inline above. */}
        {hasStandings && (
          <>
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="mt-2 w-full text-[8px] uppercase tracking-[0.3em] text-rift-mutedbright/55 hover:text-rift-goldbright border-t border-rift-line/20 pt-1.5 transition-colors text-center"
            >
              {expanded
                ? "▴ Hide standings"
                : playoffMatches.length > 0
                  ? "▾ Full standings & bracket"
                  : "▾ Full standings"}
            </button>
            {expanded && (
              <div className="mt-2 space-y-2">
                <GroupStandingsTable
                  standings={fullStandings}
                  advancingTeams={
                    advancing > 0 ? advancing : fullStandings.length
                  }
                  tournament={tournament}
                  teamStats={teamStats}
                />
                {playoffMatches.length > 0 && (
                  <MiniBracket
                    tournament={tournament}
                    matches={playoffMatches}
                  />
                )}
              </div>
            )}
          </>
        )}
      </div>
      <div className="border-t border-rift-line/30 flex">
        {tournament.status !== "complete" && (
          <>
            <button
              type="button"
              disabled={!!simulating}
              onClick={() => simSeasonMatchday(tournament.id)}
              className="flex-1 px-3 py-1.5 text-[9px] uppercase tracking-[0.3em] text-rift-mutedbright/70 hover:text-rift-goldbright hover:bg-rift-gold/5 disabled:opacity-40 transition-colors text-left border-r border-rift-line/30"
              title={`Play the next matchday of ${tournament.name}`}
            >
              ▸ Sim Matchday
            </button>
            <button
              type="button"
              disabled={!!simulating}
              onClick={() => simSeason({ tournamentId: tournament.id })}
              className="flex-1 px-3 py-1.5 text-[9px] uppercase tracking-[0.3em] text-rift-mutedbright/70 hover:text-rift-goldbright hover:bg-rift-gold/5 disabled:opacity-40 transition-colors text-left border-r border-rift-line/30"
              title={`Simulate every remaining match of ${tournament.name}`}
            >
              ▸ Sim This
            </button>
          </>
        )}
        <button
          type="button"
          onClick={onOpen}
          className="flex-1 px-3 py-1.5 text-[9px] uppercase tracking-[0.3em] text-rift-gold/60 hover:text-rift-goldbright hover:bg-rift-gold/5 transition-colors text-right"
        >
          Open ›
        </button>
      </div>
    </div>
  );
}

// ─── All-Pro teams (live) ──────────────────────────────────────────────────
// A split's global team or the season's Team of the Year, rendered as a lane
// strip from the raw (live) selections. Team identity is resolved live.
function AllProTeamStrip({
  season,
  team,
  label,
  highlight = false,
}: {
  season: SeasonState;
  team: RawAllProTeam;
  label: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={
        highlight
          ? "border-2 border-rift-gold/50 bg-rift-gold/[0.06] px-3 py-2"
          : "px-3 py-1.5 bg-rift-bg/40 border border-rift-line/40"
      }
    >
      <div className="text-[8px] uppercase tracking-[0.3em] text-rift-gold/60 mb-1">
        {label}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {LANE_ORDER.map((lane) => {
          const m = team.members.find((x) => x.lane === lane);
          if (!m) return null;
          const t = seasonTeam(season, m.teamId);
          return (
            <span key={lane} className="inline-flex items-center gap-1 text-[10px]">
              <LaneIcon lane={lane} size="xs" />
              {t && (
                <TeamLogoLink
                  teamId={t.id}
                  name={t.name}
                  leagueId={t.leagueId}
                  iconKey={t.iconKey}
                  logoUrl={t.logoUrl}
                  color={t.color}
                  size={11}
                  renderAs="span"
                  hint={{ team: t }}
                />
              )}
              <PlayerNameLink
                playerId={m.playerId}
                name={m.playerName ?? m.teamName}
                className="text-rift-bluebright"
              />
              <span className="text-rift-muted/60 tabular-nums" title={`${m.games} games`}>
                {m.avgRating.toFixed(1)}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

// The season's All-Pro Team of the Year — shown once the season is complete.
function SeasonOfTheYear({ season }: { season: SeasonState }) {
  const teams = useMemo(() => computeAllProTeams(season), [season]);
  const soty = teams.find((t) => t.scope === "season-global");
  if (!soty) return null;
  return (
    <AllProTeamStrip
      season={season}
      team={soty}
      label="★ All-Pro Team of the Year"
      highlight
    />
  );
}

// ─── Past results (with expandable stage stats) ────────────────────────────

function PastResults({
  season,
  championsById,
  onOpen,
}: {
  season: SeasonState;
  championsById: Map<number, Champion>;
  onOpen: (tournamentId: string) => void;
}) {
  const [statsFor, setStatsFor] = useState<string | null>(null);
  const [resultsFor, setResultsFor] = useState<string | null>(null);
  const allProTeams = useMemo(() => computeAllProTeams(season), [season]);
  const past = season.phases.filter(
    (p, i) =>
      p.kind !== "transfer" && (p.status === "complete" || i < season.phaseIndex),
  );
  if (past.length === 0) return null;
  return (
    <div className="mb-8">
      <div className="text-[10px] uppercase tracking-[0.4em] text-rift-gold/70 mb-2">
        Season Results
      </div>
      <div className="space-y-1.5">
        {past.map((p, i) => {
          const phaseKey = `${p.label}-${i}`;
          const statsOpen = statsFor === phaseKey;
          const resultsOpen = resultsFor === phaseKey;
          return (
            <div
              key={phaseKey}
              className="border border-rift-line/40 bg-rift-bg/30 px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.3em] text-rift-gold/60">
                  {p.kind === "international" && p.event && (
                    <LeagueIcon league={p.event} size={16} />
                  )}
                  {p.label}
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setResultsFor(resultsOpen ? null : phaseKey)}
                    className={`text-[9px] uppercase tracking-[0.25em] transition-colors ${
                      resultsOpen
                        ? "text-rift-goldbright"
                        : "text-rift-mutedbright/50 hover:text-rift-goldbright"
                    }`}
                  >
                    {resultsOpen ? "Hide Placements ▴" : "Placements ▾"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatsFor(statsOpen ? null : phaseKey)}
                    className={`text-[9px] uppercase tracking-[0.25em] transition-colors ${
                      statsOpen
                        ? "text-rift-goldbright"
                        : "text-rift-mutedbright/50 hover:text-rift-goldbright"
                    }`}
                  >
                    {statsOpen ? "Hide Stats ▴" : "Stats ▾"}
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-1">
                {p.tournamentIds.map((id) => {
                  const t = season.tournaments[id];
                  if (!t) return null;
                  const champ = tournamentChampion(t);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => onOpen(id)}
                      className="inline-flex items-center gap-1.5 text-[10px] text-rift-mutedbright hover:text-rift-goldbright transition-colors"
                      title={`Open ${t.name}`}
                    >
                      <span className="text-rift-muted/70">{t.name}:</span>
                      {champ ? (
                        <>
                          <TeamNameLink
                            teamId={champ.id}
                            name={champ.name}
                            leagueId={season.teams.find((x) => x.id === champ.id)?.leagueId}
                            iconKey={champ.iconKey}
                            logoUrl={champ.logoUrl}
                            color={champ.color}
                            logoSize={12}
                            renderAs="span"
                            className="inline-flex items-center gap-1.5 text-rift-goldbright"
                            hint={{
                              team: season.teams.find((x) => x.id === champ.id),
                            }}
                          />
                        </>
                      ) : (
                        <span className="italic text-rift-muted">in progress</span>
                      )}
                    </button>
                  );
                })}
              </div>
              {resultsOpen && <PhasePlacements season={season} phase={p} />}
              {statsOpen && (
                <div className="mt-2 space-y-1.5 border-t border-rift-line/30 pt-2">
                  {/* Split's cross-region All-Pro team (the per-league picks
                      appear in each tournament's row below). */}
                  {p.kind === "split" &&
                    (() => {
                      const g = allProTeams.find(
                        (t) => t.scope === "split-global" && t.split === p.split,
                      );
                      return g ? (
                        <AllProTeamStrip
                          season={season}
                          team={g}
                          label={`${p.label} · All-Pro (Global)`}
                        />
                      ) : null;
                    })()}
                  {p.tournamentIds.map((id) => {
                    const t = season.tournaments[id];
                    if (!t || t.status !== "complete") return null;
                    return (
                      <StageStatsRow
                        key={id}
                        season={season}
                        tournament={t}
                        championsById={championsById}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Full final placements of a completed phase. Splits show every
// league's ordered table; internationals show the ordered field with
// each team's region and qualifying seed.
function PhasePlacements({
  season,
  phase,
}: {
  season: SeasonState;
  phase: SeasonPhase;
}) {
  const regionSeeds = useMemo(() => {
    if (phase.kind !== "international" || !phase.event) return null;
    const event = phase.event;
    const map = new Map<string, QualifierTagInfo>();
    for (const q of qualifiedForInternational(season, event)) {
      map.set(
        q.team.id,
        q.via === "champion"
          ? { label: q.league, championOf: feederEventOf(event) ?? undefined }
          : {
              label: `${q.league} #${q.leagueSeed}`,
              title:
                event === "worlds"
                  ? `Worlds: ${qualifierTag(event, q)}`
                  : undefined,
            },
      );
    }
    return map;
  }, [season, phase]);
  // Split placements: tag every team that earned a ticket to the split's
  // international. Compact: the destination only ("Worlds", or "Play-In"
  // for the league's #4 Worlds seed) plus the trophy pill for the
  // additive defending-champion slot — the full route (finalist vs
  // championship points) lives in the tooltip.
  const qualBadges = useMemo(() => {
    if (phase.kind !== "split" || !phase.split) return null;
    const event = SPLIT_FEEDS_EVENT[phase.split];
    const label = INTERNATIONAL_LABELS[event];
    const map = new Map<string, QualifierTagInfo>();
    for (const q of qualifiedForInternational(season, event)) {
      const playIn = event === "worlds" && q.leagueSeed === 4;
      map.set(q.team.id, {
        label: playIn ? "Play-In" : label,
        title: `Qualified for ${label} — ${qualifierTag(event, q)}`,
        championOf:
          q.via === "champion" ? feederEventOf(event) ?? undefined : undefined,
      });
    }
    return map;
  }, [season, phase]);

  if (phase.kind === "split" && phase.split) {
    const byLeague = season.splitResults[phase.split];
    if (!byLeague) return null;
    return (
      <div className="mt-2 border-t border-rift-line/30 pt-2 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-x-4 gap-y-3">
        {LEAGUE_IDS.map((league) => {
          const ids = byLeague[league];
          if (!ids?.length) return null;
          return (
            <div key={league}>
              <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.3em] text-rift-gold/60 mb-1">
                <LeagueIcon league={league} size={14} />
                {league}
              </div>
              <ol className="space-y-0.5">
                {ids.map((id, idx) => (
                  <PlacementRow
                    key={id}
                    season={season}
                    teamId={id}
                    rank={idx + 1}
                    tag={qualBadges?.get(id)}
                  />
                ))}
              </ol>
            </div>
          );
        })}
      </div>
    );
  }

  if (phase.kind === "international" && phase.event) {
    const ids = season.intlResults[phase.event];
    if (!ids?.length) return null;
    return (
      <div className="mt-2 border-t border-rift-line/30 pt-2">
        <ol className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-0.5">
          {ids.map((id, idx) => (
            <PlacementRow
              key={id}
              season={season}
              teamId={id}
              rank={idx + 1}
              tag={regionSeeds?.get(id)}
              showRegion
            />
          ))}
        </ol>
      </div>
    );
  }

  return null;
}

function PlacementRow({
  season,
  teamId,
  rank,
  tag,
  showRegion = false,
}: {
  season: SeasonState;
  teamId: string;
  rank: number;
  tag?: QualifierTagInfo;
  // Show each team's region logo before its name — used in international
  // placements where teams come from mixed regions (a split's placements
  // are single-region and already carry a region header).
  showRegion?: boolean;
}) {
  const team = seasonTeam(season, teamId);
  if (!team) return null;
  const controlled = season.config.controlledTeamId === teamId;
  return (
    <li
      className={`flex items-center gap-1.5 text-[10px] ${
        rank === 1
          ? "text-rift-goldbright"
          : controlled
            ? "text-rift-bluebright"
            : "text-rift-mutedbright"
      }`}
    >
      <span className="w-4 text-rift-muted/70 tabular-nums flex-shrink-0">
        {rank}.
      </span>
      {showRegion && <LeagueIcon league={team.leagueId} size={12} />}
      <TeamNameLink
        teamId={team.id}
        name={team.name}
        leagueId={team.leagueId}
        iconKey={team.iconKey}
        logoUrl={team.logoUrl}
        color={team.color}
        logoSize={12}
        renderAs="span"
        className={`truncate text-[10px] ${
          rank === 1
            ? "text-rift-goldbright"
            : controlled
              ? "text-rift-bluebright"
              : "text-rift-mutedbright"
        }`}
        hint={{ team }}
      />
      {rank === 1 && <span aria-hidden>🏆</span>}
      <QualifierTagView tag={tag} />
    </li>
  );
}

// One completed stage's recap card: result header (champion def.
// runner-up), award cells (MVP / most contested / best WR / longest
// series), the All-Pro lane strip, special recognitions, and a volume
// footer.

const LANE_LABEL: Record<Lane, string> = {
  top: "Top",
  jungle: "Jgl",
  middle: "Mid",
  bottom: "Bot",
  support: "Sup",
};
const LANE_ORDER: readonly Lane[] = [
  "top",
  "jungle",
  "middle",
  "bottom",
  "support",
];

function StageStatCell({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="bg-rift-bg/60 px-2.5 py-2 min-w-0">
      <div className="text-[8px] uppercase tracking-[0.3em] text-rift-muted mb-0.5">
        {label}
      </div>
      <div className="flex items-center gap-1 text-[11px] font-display tracking-wider text-rift-goldbright min-w-0">
        {icon}
        <span className="truncate">{value}</span>
      </div>
      {sub && (
        <div className="text-[9px] text-rift-mutedbright/60 truncate">{sub}</div>
      )}
    </div>
  );
}

// Small team crest for a player award, resolved from the live season roster.
function AwardTeamIcon({ season, teamId }: { season: SeasonState; teamId: string }) {
  const t = seasonTeam(season, teamId);
  if (!t) return null;
  return (
    <TeamLogoLink
      teamId={t.id}
      name={t.name}
      leagueId={t.leagueId}
      iconKey={t.iconKey}
      logoUrl={t.logoUrl}
      color={t.color}
      size={13}
      renderAs="span"
      hint={{ team: t }}
    />
  );
}

function StageStatsRow({
  season,
  tournament,
  championsById,
}: {
  season: SeasonState;
  tournament: TournamentState;
  championsById: Map<number, Champion>;
}) {
  const stats = useMemo(() => computeStageStats(tournament), [tournament]);
  // The stage MVP is the finals MVP for domestic splits, or the champion-side
  // tournament MVP for internationals (avg rating across the whole event).
  const isIntl = useMemo(
    () =>
      season.phases.some(
        (p) =>
          p.kind === "international" &&
          p.tournamentIds.includes(tournament.id),
      ),
    [season.phases, tournament.id],
  );
  const stageMvp = useMemo(
    () =>
      isIntl
        ? computeChampionTeamTournamentMvp(tournament)
        : computeFinalsMvp(tournament),
    [isIntl, tournament],
  );
  const mvp = stageMvp ?? stats.mvp;
  const champion = seasonTeam(season, stats.championTeamId);
  const runnerUp = seasonTeam(season, stats.runnerUpTeamId);
  const s = stats.summary;
  const contested = s.mostContestedChampionId != null
    ? championsById.get(s.mostContestedChampionId)
    : null;
  const bestWR = s.bestWRChampionId != null
    ? championsById.get(s.bestWRChampionId)
    : null;
  const allProByLane = new Map(stats.allPro.map((p) => [p.lane, p]));
  return (
    <div className="border border-rift-line/40 bg-rift-bg/40">
      {/* Result header */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2 border-b border-rift-line/30 bg-rift-gold/[0.04]">
        <span className="font-display text-sm tracking-wider text-rift-gold/80">
          {tournament.name}
        </span>
        {champion && (
          <span className="inline-flex items-center gap-1.5 text-[10px]">
            <span aria-hidden>🏆</span>
            <TeamNameLink
              teamId={champion.id}
              name={champion.name}
              leagueId={champion.leagueId}
              iconKey={champion.iconKey}
              logoUrl={champion.logoUrl}
              color={champion.color}
              logoSize={13}
              renderAs="span"
              className="inline-flex items-center gap-1.5 font-display tracking-wider text-rift-goldbright"
              hint={{ team: champion }}
            />
            {runnerUp && (
              <span className="text-rift-muted/80 inline-flex items-center gap-1">
                def.{" "}
                <TeamNameLink
                  teamId={runnerUp.id}
                  name={runnerUp.name}
                  leagueId={runnerUp.leagueId}
                  iconKey={runnerUp.iconKey}
                  logoUrl={runnerUp.logoUrl}
                  color={runnerUp.color}
                  showLogo={false}
                  renderAs="span"
                  className="text-rift-muted/80"
                  hint={{ team: runnerUp }}
                />
              </span>
            )}
          </span>
        )}
      </div>

      {/* Award cells */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-rift-line/20">
        {mvp && (
          <StageStatCell
            label="MVP"
            value={
              <PlayerNameLink
                playerId={mvp.playerId}
                name={mvp.playerName ?? mvp.displayName}
                className="truncate"
              />
            }
            sub={
              stageMvp
                ? isIntl
                  ? `${mvp.teamName} · ${mvp.avgRating.toFixed(1)} avg across event`
                  : `${mvp.teamName} · ${mvp.avgRating.toFixed(1)} in the final`
                : `${mvp.teamName} · ${mvp.avgRating.toFixed(1)} rating`
            }
            icon={<AwardTeamIcon season={season} teamId={mvp.teamId} />}
          />
        )}
        {contested && (
          <StageStatCell
            label="Most Contested"
            value={contested.name}
            sub={`${s.mostContestedPresence} picks+bans`}
          />
        )}
        {bestWR && s.bestWR != null && (
          <StageStatCell
            label="Best Win Rate"
            value={bestWR.name}
            sub={`${Math.round(s.bestWR * 100)}% over ${s.bestWRGames} games`}
          />
        )}
        {s.longestSeriesGames > 1 && (
          <StageStatCell
            label="Longest Series"
            value={`${s.longestSeriesGames} games`}
          />
        )}
      </div>

      {/* All-Pro lane strip */}
      {stats.allPro.length > 0 && (
        <div className="px-3 py-1.5 border-t border-rift-line/30 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="text-[8px] uppercase tracking-[0.3em] text-rift-gold/60">
            All-Pro
          </span>
          {LANE_ORDER.map((lane) => {
            const p = allProByLane.get(lane);
            if (!p) return null;
            return (
              <span
                key={lane}
                className="inline-flex items-center gap-1 text-[10px]"
              >
                <LaneIcon lane={lane} size="xs" />
                <AwardTeamIcon season={season} teamId={p.teamId} />
                <PlayerNameLink
                  playerId={p.playerId}
                  name={p.playerName ?? p.displayName}
                  className="text-rift-bluebright"
                />
                <span className="text-rift-muted/60 tabular-nums">
                  {p.avgRating.toFixed(1)}
                </span>
              </span>
            );
          })}
        </div>
      )}

      {/* Special recognitions */}
      {stats.specials.length > 0 && (
        <div className="px-3 py-1.5 border-t border-rift-line/30 flex flex-wrap gap-x-4 gap-y-1">
          {stats.specials.map((a) => (
            <span key={a.kind} className="inline-flex items-center gap-1 text-[10px]">
              <span className="text-rift-gold/70">{a.title}:</span>
              <AwardTeamIcon season={season} teamId={a.player.teamId} />
              <PlayerNameLink
                playerId={a.player.playerId}
                name={a.player.playerName ?? a.player.displayName}
                className="text-rift-bluebright"
              />
              <span className="text-rift-muted/60">({a.context})</span>
            </span>
          ))}
        </div>
      )}

      {/* Volume footer */}
      <div className="px-3 py-1 border-t border-rift-line/30 text-[9px] text-rift-muted/70 tabular-nums">
        {s.totalMatches} matches · {s.totalGames} games ·{" "}
        {s.uniqueChampionsPlayed} champions played
      </div>
    </div>
  );
}

// ─── Season recap (season complete) ────────────────────────────────────────

function SeasonRecapPanel({
  season,
  championsById,
  title = "Season Recap",
}: {
  season: SeasonState;
  championsById: Map<number, Champion>;
  title?: string;
}) {
  const stats = useMemo(() => computeSeasonStats(season), [season]);
  const rookies = useMemo(() => computeSeasonRookiesOfYear(season), [season]);
  const winningest = seasonTeam(season, stats.winningestTeam?.teamId);
  const mostTitled = seasonTeam(season, stats.mostTitledTeam?.teamId);
  const contested = stats.mostContested
    ? championsById.get(stats.mostContested.championId)
    : null;
  const bestWR = stats.bestWR
    ? championsById.get(stats.bestWR.championId)
    : null;
  const intlOrder = INTERNATIONAL_DISPLAY_ORDER;
  const splitOrder = ["winter", "spring", "summer"] as const;
  const bestRegion = (Object.entries(stats.leagueIntlTitles) as Array<
    [keyof typeof stats.leagueIntlTitles, number]
  >).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0];
  return (
    <div className="mb-8 border border-rift-gold/40 bg-rift-gold/[0.04] p-4">
      <div className="text-[10px] uppercase tracking-[0.4em] text-rift-gold/70 mb-3">
        {title}
      </div>

      {/* Headline stat chips */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
        <RecapChip label="Matches Played" value={`${stats.totalMatches}`} sub={`${stats.totalGames} games`} />
        {winningest && stats.winningestTeam && (
          <RecapChip
            label="Winningest Team"
            value={winningest.name}
            sub={`${stats.winningestTeam.wins}-${stats.winningestTeam.losses} in matches`}
          />
        )}
        {mostTitled && stats.mostTitledTeam && (
          <RecapChip
            label="Most Titles"
            value={mostTitled.name}
            sub={`${stats.mostTitledTeam.titles} trophies`}
          />
        )}
        {bestRegion && (bestRegion[1] ?? 0) > 0 && (
          <RecapChip
            label="Best Region"
            value={bestRegion[0]}
            icon={<LeagueIcon league={bestRegion[0]} size={16} />}
            sub={`${bestRegion[1]} international title${(bestRegion[1] ?? 0) === 1 ? "" : "s"}`}
          />
        )}
        {contested && stats.mostContested && (
          <RecapChip
            label="Face of the Season"
            value={contested.name}
            sub={`${stats.mostContested.presence} picks+bans`}
          />
        )}
        {bestWR && stats.bestWR?.winRate != null && (
          <RecapChip
            label="Best Win Rate"
            value={bestWR.name}
            sub={`${Math.round(stats.bestWR.winRate * 100)}% over ${stats.bestWR.wins + stats.bestWR.losses} games`}
          />
        )}
      </div>

      {/* Regional review — each league's year in one card. */}
      <div className="text-[9px] uppercase tracking-[0.3em] text-rift-gold/60 mb-1.5">
        Regional Review
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 mb-4">
        {LEAGUE_IDS.map((league) => {
          const best = stats.leagueBestTeams[league];
          const bestTeam = seasonTeam(season, best?.teamId);
          const intlTitles = stats.leagueIntlTitles[league] ?? 0;
          if (!best || !bestTeam) return null;
          return (
            <div
              key={league}
              className="border border-rift-line/40 bg-rift-bg/40 px-2.5 py-2"
            >
              <div className="flex items-center gap-1.5 text-[8px] uppercase tracking-[0.3em] text-rift-muted mb-1">
                <LeagueIcon league={league} size={13} />
                {league}
              </div>
              <div className="flex items-center gap-1.5 mb-0.5">
                <TeamNameLink
                  teamId={bestTeam.id}
                  name={bestTeam.name}
                  leagueId={bestTeam.leagueId}
                  iconKey={bestTeam.iconKey}
                  logoUrl={bestTeam.logoUrl}
                  color={bestTeam.color}
                  logoSize={13}
                  renderAs="span"
                  className="font-display text-xs tracking-wider text-rift-goldbright truncate"
                  hint={{ team: bestTeam }}
                />
              </div>
              <div className="text-[9px] text-rift-mutedbright/70">
                Best of the region · {best.wins}-{best.losses}
              </div>
              <div className="text-[9px] text-rift-mutedbright/70">
                {best.titles} {best.titles === 1 ? "trophy" : "trophies"}
                {intlTitles > 0 && (
                  <span className="text-rift-gold/70">
                    {" "}
                    · {intlTitles} intl. for {league}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {rookies.length > 0 && (
        <>
          <div className="text-[9px] uppercase tracking-[0.3em] text-rift-gold/60 mb-1.5">
            Rookie of the Year
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 mb-4">
            {rookies.map((r) => {
              const team = seasonTeam(season, r.teamId);
              return (
                <div
                  key={r.lane}
                  className="border border-rift-blue/30 bg-rift-blue/[0.04] px-2.5 py-2 text-[10px]"
                >
                  <div className="text-[8px] uppercase tracking-[0.25em] text-rift-blue/70 mb-1">
                    {r.lane}
                  </div>
                  <PlayerNameLink
                    playerId={r.playerId}
                    name={r.playerName}
                    className="font-display text-rift-goldbright truncate"
                  />
                  {team && (
                    <TeamNameLink
                      teamId={team.id}
                      name={team.name}
                      leagueId={team.leagueId}
                      iconKey={team.iconKey}
                      logoUrl={team.logoUrl}
                      color={team.color}
                      showLogo={false}
                      renderAs="span"
                      className="text-[9px] text-rift-mutedbright/70 truncate mt-0.5"
                      hint={{ team }}
                    />
                  )}
                  <div className="text-[8px] text-rift-muted/70 tabular-nums mt-1">
                    ★{r.avgRating.toFixed(1)} · {r.splitTitles} split · {r.intlTitles} intl
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Season records — milestones drawn from recap fields that survive a
          save/load (game length, best MVP, biggest swing/stomp/penta). */}
      {(stats.records.longestGame ||
        stats.records.bestMvp ||
        stats.records.biggestSwing ||
        stats.records.biggestStomp ||
        stats.records.fastestPentakill) && (
        <div className="mb-4">
          <div className="flex items-baseline justify-between mb-1.5">
            <div className="text-[9px] uppercase tracking-[0.3em] text-rift-gold/60">
              Records of the Year
            </div>
            <div className="text-[9px] text-rift-mutedbright/60 tabular-nums">
              {stats.totalGames} games · {stats.totalMatches} matches
            </div>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
            {stats.records.longestGame && (
              <div className="border border-rift-line/40 bg-rift-bg/40 px-2.5 py-2">
                <div className="text-[8px] uppercase tracking-[0.3em] text-rift-muted mb-1">
                  Longest Game
                </div>
                <div className="font-display text-sm text-rift-goldbright tabular-nums">
                  {Math.round(stats.records.longestGame.minutes)}′
                </div>
                <div className="text-[9px] text-rift-mutedbright/70 truncate">
                  {stats.records.longestGame.blueTeam} vs{" "}
                  {stats.records.longestGame.redTeam}
                </div>
              </div>
            )}
            {stats.records.shortestGame && (
              <div className="border border-rift-line/40 bg-rift-bg/40 px-2.5 py-2">
                <div className="text-[8px] uppercase tracking-[0.3em] text-rift-muted mb-1">
                  Fastest Game
                </div>
                <div className="font-display text-sm text-rift-goldbright tabular-nums">
                  {Math.round(stats.records.shortestGame.minutes)}′
                </div>
                <div className="text-[9px] text-rift-mutedbright/70 truncate">
                  {stats.records.shortestGame.blueTeam} vs{" "}
                  {stats.records.shortestGame.redTeam}
                </div>
              </div>
            )}
            {stats.records.biggestStomp && (
              <div className="border border-rift-line/40 bg-rift-bg/40 px-2.5 py-2">
                <div className="text-[8px] uppercase tracking-[0.3em] text-rift-muted mb-1">
                  Biggest Stomp
                </div>
                <div className="font-display text-sm text-rift-goldbright tabular-nums">
                  +{(stats.records.biggestStomp.goldLead / 1000).toFixed(1)}k g
                </div>
                <div className="text-[9px] text-rift-mutedbright/70 truncate">
                  {stats.records.biggestStomp.winnerTeam} ▸{" "}
                  {stats.records.biggestStomp.loserTeam}
                </div>
              </div>
            )}
            {stats.records.bestMvp && (
              <div className="flex items-center gap-2 border border-rift-line/40 bg-rift-bg/40 px-2.5 py-2">
                {championsById.get(stats.records.bestMvp.championId) && (
                  <img
                    src={championsById.get(stats.records.bestMvp.championId)!.iconUrl}
                    alt=""
                    draggable={false}
                    className="w-8 h-8 rounded-sm ring-1 ring-rift-gold/30 shrink-0"
                  />
                )}
                <div className="min-w-0">
                  <div className="text-[8px] uppercase tracking-[0.3em] text-rift-muted mb-0.5">
                    Best Game
                  </div>
                  <div className="font-display text-xs text-rift-goldbright tabular-nums">
                    {stats.records.bestMvp.playerName ? (
                      <span>
                        <PlayerNameLink
                          playerId={stats.records.bestMvp.playerId}
                          name={stats.records.bestMvp.playerName}
                        />{" "}
                        ·{" "}
                      </span>
                    ) : null}
                    {stats.records.bestMvp.kills}/{stats.records.bestMvp.deaths}/
                    {stats.records.bestMvp.assists}
                    <span className="text-rift-mutedbright/60">
                      {" "}
                      {championsById.get(stats.records.bestMvp.championId)?.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-[9px] text-rift-mutedbright/70 truncate">
                    {stats.records.bestMvp.lane && (
                      <LaneIcon lane={stats.records.bestMvp.lane} size="xs" />
                    )}
                    <span className="truncate">{stats.records.bestMvp.teamName}</span>
                  </div>
                </div>
              </div>
            )}
            {stats.records.fastestPentakill && (
              <div className="flex items-center gap-2 border border-rift-line/40 bg-rift-bg/40 px-2.5 py-2">
                {championsById.get(stats.records.fastestPentakill.championId) && (
                  <img
                    src={
                      championsById.get(
                        stats.records.fastestPentakill.championId,
                      )!.iconUrl
                    }
                    alt=""
                    draggable={false}
                    className="w-8 h-8 rounded-sm ring-1 ring-rift-gold/30 shrink-0"
                  />
                )}
                <div className="min-w-0">
                  <div className="text-[8px] uppercase tracking-[0.3em] text-rift-muted mb-0.5">
                    Fastest Penta
                  </div>
                  <div className="font-display text-xs text-rift-goldbright tabular-nums">
                    {Math.round(stats.records.fastestPentakill.minute)}′{" "}
                    <span className="text-rift-mutedbright/60">
                      {stats.records.fastestPentakill.championName}
                    </span>
                  </div>
                  <div className="text-[9px] text-rift-mutedbright/70 truncate">
                    {stats.records.fastestPentakill.teamName}
                  </div>
                </div>
              </div>
            )}
            {stats.records.biggestSwing && (
              <div className="border border-rift-line/40 bg-rift-bg/40 px-2.5 py-2">
                <div className="text-[8px] uppercase tracking-[0.3em] text-rift-muted mb-1">
                  Biggest Swing
                </div>
                <div className="text-[10px] text-rift-goldbright leading-tight line-clamp-2">
                  {stats.records.biggestSwing.description}
                </div>
                <div className="text-[9px] text-rift-mutedbright/70 truncate mt-0.5">
                  {stats.records.biggestSwing.teamName} ·{" "}
                  {Math.round(stats.records.biggestSwing.minute)}′ ·{" "}
                  {Math.round(Math.abs(stats.records.biggestSwing.probDelta) * 100)}
                  pp
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MVP leaderboard — which roster slot (team + lane) earned the most
          Player-of-the-Game nods this year, with their signature champion. */}
      {stats.mvpLeaderboard.length > 0 && (
        <div className="mb-4">
          <div className="text-[9px] uppercase tracking-[0.3em] text-rift-gold/60 mb-1.5">
            Most MVPs
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
            {stats.mvpLeaderboard.slice(0, 6).map((p) => {
              const team = seasonTeam(season, p.teamId);
              const champ = championsById.get(p.topChampionId);
              const laneLabel =
                p.lane === "middle"
                  ? "MID"
                  : p.lane === "bottom"
                  ? "BOT"
                  : p.lane === "jungle"
                  ? "JG"
                  : p.lane === "support"
                  ? "SUP"
                  : "TOP";
              const avg = (n: number) => (n / Math.max(1, p.count)).toFixed(1);
              return (
                <div
                  key={`${p.teamId}-${p.lane}`}
                  className="flex items-center gap-2 border border-rift-line/40 bg-rift-bg/40 px-2.5 py-2"
                >
                  {champ && (
                    <img
                      src={champ.iconUrl}
                      alt=""
                      draggable={false}
                      className="w-8 h-8 rounded-sm ring-1 ring-rift-gold/30 shrink-0"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      {team && (
                        <TeamLogoLink
                          teamId={team.id}
                          name={team.name}
                          leagueId={team.leagueId}
                          iconKey={team.iconKey}
                          logoUrl={team.logoUrl}
                          color={team.color}
                          size={12}
                          renderAs="span"
                          hint={{ team }}
                        />
                      )}
                      <PlayerNameLink
                        playerId={p.playerId}
                        name={p.playerName ?? (team?.name ?? "—")}
                        className="font-display text-xs tracking-wider text-rift-goldbright truncate"
                      />
                      <span className="ml-auto text-[8px] uppercase tracking-wider text-rift-gold/50 shrink-0">
                        {laneLabel}
                      </span>
                    </div>
                    {p.playerName && (
                      <div className="text-[8px] tracking-wide text-rift-mutedbright/50 truncate">
                        {team?.name ?? "—"}
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[9px] text-rift-mutedbright/70 tabular-nums">
                        {avg(p.kills)}/{avg(p.deaths)}/{avg(p.assists)} avg
                      </span>
                      <span className="font-display text-[11px] text-rift-goldbright tabular-nums shrink-0">
                        ×{p.count}
                      </span>
                    </div>
                    {p.tier && (
                      <div className="text-[8px] uppercase tracking-[0.2em] text-rift-muted/70 truncate">
                        {p.tier}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Player leaders — season stats aggregated by stable player id, so a
          transferred player's numbers follow them across teams. */}
      {(() => {
        const pl = stats.playerLeaders;
        // "Most MVPs" intentionally omitted here — it has its own richer card
        // above (champion + K/D/A). Keeping both duplicated the same stat with
        // different groupings (per team+lane slot vs per player), which read as
        // conflicting totals.
        const boards: Array<{ label: string; rows: PlayerSeasonLine[]; val: (l: PlayerSeasonLine) => string }> = [
          { label: "Most Kills", rows: pl.byKills, val: (l: PlayerSeasonLine) => `${l.kills}` },
          { label: "Best Rating", rows: pl.byRating, val: (l: PlayerSeasonLine) => (l.avgRating ?? 0).toFixed(1) },
          { label: "Most Pentakills", rows: pl.byPentakills, val: (l: PlayerSeasonLine) => `×${l.pentakills}` },
        ].filter((b) => b.rows.length > 0);
        if (boards.length === 0) return null;
        return (
          <div className="mb-4">
            <div className="text-[9px] uppercase tracking-[0.3em] text-rift-gold/60 mb-1.5">
              Player Leaders
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              {boards.map((b) => (
                <div key={b.label} className="border border-rift-line/40 bg-rift-bg/30">
                  <div className="px-2 py-1 border-b border-rift-line/30 text-[8px] uppercase tracking-[0.25em] text-rift-gold/55">
                    {b.label}
                  </div>
                  <div className="divide-y divide-rift-line/15">
                    {b.rows.slice(0, 5).map((l, i) => {
                      const lteam = seasonTeam(season, l.teamId);
                      return (
                        <div key={l.playerId} className="flex items-center gap-1.5 px-2 py-1 text-[10px]">
                          <span className="w-3 text-[8px] tabular-nums text-rift-muted/60">{i + 1}</span>
                          {lteam && (
                            <TeamLogoLink
                              teamId={lteam.id}
                              name={lteam.name}
                              leagueId={lteam.leagueId}
                              iconKey={lteam.iconKey}
                              logoUrl={lteam.logoUrl}
                              color={lteam.color}
                              size={13}
                              renderAs="span"
                              hint={{ team: lteam }}
                            />
                          )}
                          <LaneIcon lane={l.lane} size="xs" className="shrink-0" />
                          <span className="min-w-0 flex-1 truncate">
                            <PlayerNameLink
                              playerId={l.playerId}
                              name={l.playerName || l.teamName}
                              className="text-rift-mutedbright font-medium"
                            />
                            <span className="text-rift-muted/50">
                              {" "}· {l.teamName}
                            </span>
                          </span>
                          <span className={`font-display tabular-nums shrink-0 ${i === 0 ? "text-rift-goldbright" : "text-rift-mutedbright"}`}>
                            {b.val(l)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Pentakill board — every solo-ace of the year, by champion + the team
          that scored it. A rare highlight, so even a handful reads well. */}
      {stats.totalPentakills > 0 && (
        <div className="mb-4">
          <div className="text-[9px] uppercase tracking-[0.3em] text-rift-gold/60 mb-1.5">
            Pentakills · {stats.totalPentakills}
            <span className="text-rift-mutedbright/50">
              {" "}
              · {stats.uniquePentaChampions} champion
              {stats.uniquePentaChampions === 1 ? "" : "s"}
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {stats.pentakills.slice(0, 12).map((p) => {
              const champ = championsById.get(p.championId);
              const pTeam = season.teams.find((t) => t.name === p.teamName);
              return (
                <div
                  key={`${p.championId}-${p.teamName}`}
                  className="flex items-center gap-2 border border-rift-line/40 bg-rift-bg/40 px-2.5 py-2"
                >
                  {champ && (
                    <img
                      src={champ.iconUrl}
                      alt={p.championName}
                      draggable={false}
                      className="w-8 h-8 rounded-sm ring-1 ring-rift-gold/30 shrink-0"
                    />
                  )}
                  <div className="min-w-0">
                    <div className="font-display text-xs tracking-wider text-rift-goldbright truncate flex items-center gap-1">
                      {p.lane && <LaneIcon lane={p.lane} size="xs" />}
                      <PlayerNameLink
                        playerId={p.playerId ?? undefined}
                        name={p.playerName || p.championName}
                        className="truncate"
                      />
                    </div>
                    <div className="flex items-center gap-1 text-[9px] text-rift-mutedbright/70 truncate">
                      <TeamLogoLink
                        teamId={pTeam?.id}
                        name={p.teamName}
                        leagueId={pTeam?.leagueId}
                        iconKey={pTeam?.iconKey ?? "shield"}
                        logoUrl={pTeam?.logoUrl ?? logoForTeamName(p.teamName)}
                        color={pTeam?.color}
                        size={11}
                        renderAs="span"
                        hint={pTeam ? { team: pTeam } : { name: p.teamName }}
                      />
                      <span className="truncate">
                        {p.playerName ? `${p.championName} · ` : ""}
                        {p.teamName}
                      </span>
                      {p.earliestMinute > 0 && (
                        <span className="text-rift-mutedbright/50 tabular-nums shrink-0">
                          @ {Math.round(p.earliestMinute)}′
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="ml-auto font-display text-sm text-rift-goldbright tabular-nums">
                    ×{p.count}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Rivalries — the most-played head-to-heads of the year, with record. */}
      {stats.rivalries.length > 0 && (
        <div className="mb-4">
          <div className="text-[9px] uppercase tracking-[0.3em] text-rift-gold/60 mb-1.5">
            Rivalries of the Year
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {stats.rivalries.map((r) => {
              const a = seasonTeam(season, r.teamAId);
              const b = seasonTeam(season, r.teamBId);
              return (
                <div
                  key={`${r.teamAId}-${r.teamBId}`}
                  className="flex items-center gap-2 border border-rift-line/40 bg-rift-bg/40 px-2.5 py-2"
                >
                  <div className="flex items-center gap-1 min-w-0 flex-1 justify-end">
                    {a ? (
                      <TeamNameLink
                        teamId={a.id}
                        name={a.name}
                        leagueId={a.leagueId}
                        iconKey={a.iconKey}
                        logoUrl={a.logoUrl}
                        color={a.color}
                        showLogo={false}
                        renderAs="span"
                        className="font-display text-xs text-rift-goldbright truncate"
                        hint={{ team: a }}
                      />
                    ) : (
                      <span className="font-display text-xs text-rift-goldbright truncate">—</span>
                    )}
                    {a && (
                      <TeamLogoLink
                        teamId={a.id}
                        name={a.name}
                        leagueId={a.leagueId}
                        iconKey={a.iconKey}
                        logoUrl={a.logoUrl}
                        color={a.color}
                        size={14}
                        renderAs="span"
                        hint={{ team: a }}
                      />
                    )}
                  </div>
                  <div className="font-display text-sm text-rift-goldbright tabular-nums shrink-0 px-1">
                    {r.aWins}–{r.bWins}
                  </div>
                  <div className="flex items-center gap-1 min-w-0 flex-1">
                    {b && (
                      <TeamLogoLink
                        teamId={b.id}
                        name={b.name}
                        leagueId={b.leagueId}
                        iconKey={b.iconKey}
                        logoUrl={b.logoUrl}
                        color={b.color}
                        size={14}
                        renderAs="span"
                        hint={{ team: b }}
                      />
                    )}
                    {b ? (
                      <TeamNameLink
                        teamId={b.id}
                        name={b.name}
                        leagueId={b.leagueId}
                        iconKey={b.iconKey}
                        logoUrl={b.logoUrl}
                        color={b.color}
                        showLogo={false}
                        renderAs="span"
                        className="font-display text-xs text-rift-goldbright truncate"
                        hint={{ team: b }}
                      />
                    ) : (
                      <span className="font-display text-xs text-rift-goldbright truncate">—</span>
                    )}
                  </div>
                  <span className="text-[8px] uppercase tracking-wider text-rift-muted/70 shrink-0">
                    ×{r.meetings}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* How far the meta drifted over the year — only once the season
          is decided (mid-season, the live meta panel covers the now). */}
      {season.status === "complete" && (
        <div className="mb-4 border border-rift-line/40 bg-rift-bg/40 px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mb-2">
            <span className="text-[9px] uppercase tracking-[0.3em] text-rift-gold/60">
              The Meta · Start → Finish
            </span>
            <CopyMetaCodeButton
              label="Starting Meta"
              override={
                season.initialMeta !== undefined
                  ? season.initialMeta.metaOverride ?? null
                  : undefined
              }
            />
            <CopyMetaCodeButton
              label="Final Meta"
              override={season.currentMeta.metaOverride ?? null}
            />
          </div>
          <MetaDriftChips
            initial={
              season.initialMeta !== undefined
                ? season.initialMeta.metaOverride ?? null
                : undefined
            }
            final={season.currentMeta.metaOverride ?? null}
          />
        </div>
      )}

      {/* Trophy cabinet */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <div className="text-[9px] uppercase tracking-[0.3em] text-rift-gold/60 mb-1.5">
            International Champions
          </div>
          <div className="space-y-1">
            {intlOrder.map((event) => {
              const team = seasonTeam(season, stats.intlChampions[event]);
              if (!team) return null;
              return (
                <div key={event} className="flex items-center gap-2 text-[11px]">
                  <span className="inline-flex items-center gap-1.5 text-rift-muted/80 w-24">
                    <LeagueIcon league={event} size={14} />
                    {INTERNATIONAL_LABELS[event]}
                  </span>
                  <TeamNameLink
                    teamId={team.id}
                    name={team.name}
                    leagueId={team.leagueId}
                    iconKey={team.iconKey}
                    logoUrl={team.logoUrl}
                    color={team.color}
                    logoSize={13}
                    renderAs="span"
                    className="text-rift-goldbright inline-flex items-center gap-1.5"
                    hint={{ team }}
                  />
                  <span className="inline-flex items-center gap-1 text-rift-muted/60">
                    <LeagueIcon league={team.leagueId} size={12} />({team.leagueId})
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-[0.3em] text-rift-gold/60 mb-1.5">
            Split Champions
          </div>
          <div className="space-y-1">
            {splitOrder.map((split) => {
              const byLeague = stats.splitChampions[split];
              if (!byLeague) return null;
              return (
                <div key={split} className="text-[10px] text-rift-mutedbright">
                  <span className="text-rift-muted/80">
                    {SPLIT_LABELS[split]}:{" "}
                  </span>
                  {LEAGUE_IDS.map((league, i) => {
                    const team = seasonTeam(season, byLeague[league]);
                    if (!team) return null;
                    return (
                      <span key={league} className="inline-flex items-center gap-1">
                        {i > 0 && <span className="text-rift-muted/40"> · </span>}
                        <LeagueIcon league={league} size={12} />
                        <TeamNameLink
                          teamId={team.id}
                          name={team.name}
                          leagueId={team.leagueId}
                          iconKey={team.iconKey}
                          logoUrl={team.logoUrl}
                          color={team.color}
                          showLogo={false}
                          renderAs="span"
                          className="text-rift-goldbright"
                          hint={{ team }}
                        />
                      </span>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function RecapChip({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="border border-rift-line/40 bg-rift-bg/40 px-3 py-2">
      <div className="text-[8px] uppercase tracking-[0.3em] text-rift-muted mb-0.5">
        {label}
      </div>
      <div className="flex items-center gap-1.5 font-display text-sm tracking-wider text-rift-goldbright truncate">
        {icon}
        {value}
      </div>
      {sub && (
        <div className="text-[9px] text-rift-mutedbright/70 mt-0.5">{sub}</div>
      )}
    </div>
  );
}
