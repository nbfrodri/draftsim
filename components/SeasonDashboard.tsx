"use client";

import { useEffect, useMemo, useState } from "react";

import { useDraftStore } from "@/store/draftStore";
import { computeStandings, tournamentChampion } from "@/lib/tournament";
import type { TournamentState } from "@/lib/tournament";
import {
  leagueOfTournament,
  phaseProgress,
} from "@/lib/season/engine";
import { computeSeasonStats, computeStageStats } from "@/lib/season/stats";
import {
  INTERNATIONAL_LABELS,
  LEAGUE_IDS,
  SPLIT_LABELS,
  seasonTeam,
  type SeasonPhase,
  type SeasonState,
} from "@/lib/season/types";
import type { Champion } from "@/lib/types";
import TeamIcon from "./TeamIcon";
import Modal from "./Modal";
import { SimulatingOverlay } from "./tournament/bracket/DashboardModals";

// Season dashboard: phase timeline, the current phase's tournaments
// (league cards with standings, international cards with seeds), sim
// controls, past results, and the Worlds champion banner.

export default function SeasonDashboard() {
  const season = useDraftStore((s) => s.season)!;
  const champions = useDraftStore((s) => s.champions);
  const simulating = useDraftStore((s) => s.simulating);
  const simProgress = useDraftStore((s) => s.simProgress);
  const openSeasonTournament = useDraftStore((s) => s.openSeasonTournament);
  const simSeason = useDraftStore((s) => s.simSeason);
  const exitSeasonView = useDraftStore((s) => s.exitSeasonView);
  const abandonSeason = useDraftStore((s) => s.abandonSeason);
  const saveCurrentSeason = useDraftStore((s) => s.saveCurrentSeason);
  const [confirmAbandon, setConfirmAbandon] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!saveFeedback) return;
    const t = setTimeout(() => setSaveFeedback(null), 2500);
    return () => clearTimeout(t);
  }, [saveFeedback]);

  const championsById = useMemo(() => {
    const map = new Map<number, Champion>();
    for (const c of champions) map.set(c.id, c);
    return map;
  }, [champions]);

  const phase = season.phases[season.phaseIndex] ?? null;
  const controlled = seasonTeam(season, season.config.controlledTeamId);
  const championTeam = seasonTeam(season, season.champion);

  return (
    <div className="min-h-screen px-4 py-8 md:py-10 relative">
      {simulating && <SimulatingOverlay scope={simulating} />}

      {/* Exit — top-left */}
      <button
        type="button"
        onClick={exitSeasonView}
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
            setSaveFeedback(ok ? "Season saved" : "Save failed");
          }}
          className="inline-flex items-center gap-1.5 px-2.5 md:px-3 py-1.5 border border-rift-line text-rift-mutedbright hover:text-rift-goldbright hover:border-rift-gold/50 hover:bg-rift-gold/5 transition-all text-[9px] md:text-[10px] uppercase tracking-[0.3em]"
          title="Save this season locally — load, duplicate, or delete it from Saved Seasons on the main menu"
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
              <TeamIcon iconKey={controlled.iconKey} size={12} color={controlled.color} />
              Following {controlled.name} ({controlled.leagueId})
            </div>
          )}
        </div>

        {/* Champion banner */}
        {season.status === "complete" && championTeam && (
          <div className="mb-8 border-2 border-rift-gold/70 bg-rift-gold/10 px-4 py-5 text-center">
            <div className="text-[10px] uppercase tracking-[0.5em] text-rift-gold/80 mb-1">
              World Champion
            </div>
            <div className="font-display text-2xl md:text-4xl tracking-[0.15em] text-rift-goldbright inline-flex items-center gap-3">
              <TeamIcon iconKey={championTeam.iconKey} size={28} color={championTeam.color} />
              {championTeam.name}
              <span className="text-rift-gold/60 text-base md:text-xl">
                {championTeam.leagueId}
              </span>
            </div>
          </div>
        )}

        {/* Phase timeline */}
        <div className="flex items-center justify-center gap-1.5 flex-wrap mb-7">
          {season.phases.map((p, i) => (
            <span
              key={`${p.label}-${i}`}
              className={`px-2.5 py-1 border text-[9px] uppercase tracking-[0.25em] ${
                p.status === "complete"
                  ? "border-rift-gold/40 text-rift-gold/60 bg-rift-gold/5"
                  : p.status === "in-progress"
                    ? "border-rift-gold text-rift-goldbright bg-rift-gold/15"
                    : "border-rift-line/50 text-rift-muted"
              }`}
            >
              {p.label}
              {p.status === "complete" && " ✓"}
            </span>
          ))}
        </div>

        {/* Sim controls */}
        {season.status !== "complete" && (
          <div className="flex items-center justify-center gap-2 mb-7">
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
            {simProgress && (
              <span className="text-[9px] uppercase tracking-[0.25em] text-rift-gold/70 tabular-nums">
                {simProgress.done}/{simProgress.total}
              </span>
            )}
          </div>
        )}

        {/* Season-wide recap — the year in numbers, once it's over. */}
        {season.status === "complete" && (
          <SeasonRecapPanel season={season} championsById={championsById} />
        )}

        {/* Current phase */}
        {phase && season.status !== "complete" && (
          <PhasePanel
            season={season}
            phase={phase}
            onOpen={openSeasonTournament}
          />
        )}

        {/* Past phases / results */}
        <PastResults
          season={season}
          championsById={championsById}
          onOpen={openSeasonTournament}
        />
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

function TournamentCard({
  season,
  tournament,
  onOpen,
}: {
  season: SeasonState;
  tournament: TournamentState;
  onOpen: () => void;
}) {
  const standings = useMemo(
    () => computeStandings(tournament).slice(0, 4),
    [tournament],
  );
  const done = tournament.matches.filter((m) => m.winner).length;
  const champion = tournamentChampion(tournament);
  const controlledId = season.config.controlledTeamId;
  return (
    <div className="border border-rift-line/50 bg-rift-bg/40 hover:border-rift-gold/40 transition-colors flex flex-col">
      <div className="flex items-center justify-between gap-2 px-3 pt-2.5">
        <div className="font-display text-sm tracking-wider text-rift-goldbright truncate">
          {tournament.name}
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
        {champion ? (
          <div className="text-[10px] uppercase tracking-[0.25em] text-rift-goldbright inline-flex items-center gap-1.5">
            <TeamIcon iconKey={champion.iconKey} size={13} color={champion.color} />
            Champion: {champion.name}
          </div>
        ) : (
          <div className="space-y-0.5">
            {standings.map((s) => (
              <div
                key={s.team.id}
                className={`flex items-center gap-1.5 text-[10px] ${
                  s.team.id === controlledId
                    ? "text-rift-bluebright"
                    : "text-rift-mutedbright"
                }`}
              >
                <span className="w-3 text-rift-muted/70 tabular-nums">
                  {s.rank}
                </span>
                <TeamIcon iconKey={s.team.iconKey} size={12} color={s.team.color} />
                <span className="truncate flex-1">{s.team.name}</span>
                <span className="tabular-nums text-rift-muted/70">
                  {s.wins}-{s.losses}
                </span>
              </div>
            ))}
            {standings.length === 0 && (
              <div className="text-[10px] text-rift-muted italic">
                No matches played yet
              </div>
            )}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="border-t border-rift-line/30 px-3 py-1.5 text-[9px] uppercase tracking-[0.3em] text-rift-gold/60 hover:text-rift-goldbright hover:bg-rift-gold/5 transition-colors text-right"
      >
        Open ›
      </button>
    </div>
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
  const past = season.phases.filter(
    (p, i) => p.status === "complete" || i < season.phaseIndex,
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
          return (
            <div
              key={phaseKey}
              className="border border-rift-line/40 bg-rift-bg/30 px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="text-[9px] uppercase tracking-[0.3em] text-rift-gold/60">
                  {p.label}
                </div>
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
                          <TeamIcon iconKey={champ.iconKey} size={12} color={champ.color} />
                          <span className="text-rift-goldbright">
                            {champ.name}
                          </span>
                        </>
                      ) : (
                        <span className="italic text-rift-muted">in progress</span>
                      )}
                    </button>
                  );
                })}
              </div>
              {statsOpen && (
                <div className="mt-2 space-y-1.5 border-t border-rift-line/30 pt-2">
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

// One completed stage's interesting numbers: finalists, MVP, the
// most-contested champion, the best-WR champion, and volume stats.
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
  const champion = seasonTeam(season, stats.championTeamId);
  const runnerUp = seasonTeam(season, stats.runnerUpTeamId);
  const s = stats.summary;
  const contested = s.mostContestedChampionId != null
    ? championsById.get(s.mostContestedChampionId)
    : null;
  const bestWR = s.bestWRChampionId != null
    ? championsById.get(s.bestWRChampionId)
    : null;
  return (
    <div className="text-[10px] leading-relaxed">
      <span className="text-rift-gold/70 font-display tracking-wider">
        {tournament.name}
      </span>
      <span className="text-rift-mutedbright">
        {" · "}
        {champion && (
          <>
            <span className="text-rift-goldbright">{champion.name}</span>
            {runnerUp && (
              <span className="text-rift-muted/80"> def. {runnerUp.name}</span>
            )}
          </>
        )}
        {stats.mvp && (
          <>
            {" · MVP "}
            <span className="text-rift-bluebright">
              {stats.mvp.displayName}
            </span>
            <span className="text-rift-muted/70">
              {" "}
              ({stats.mvp.avgRating.toFixed(1)})
            </span>
          </>
        )}
        {contested && (
          <>
            {" · Most contested "}
            <span className="text-rift-goldbright">{contested.name}</span>
            <span className="text-rift-muted/70">
              {" "}
              ({s.mostContestedPresence} picks+bans)
            </span>
          </>
        )}
        {bestWR && s.bestWR != null && (
          <>
            {" · Best WR "}
            <span className="text-rift-goldbright">{bestWR.name}</span>
            <span className="text-rift-muted/70">
              {" "}
              ({Math.round(s.bestWR * 100)}% over {s.bestWRGames})
            </span>
          </>
        )}
        {" · "}
        <span className="text-rift-muted/70">
          {s.totalMatches} matches, {s.totalGames} games,{" "}
          {s.uniqueChampionsPlayed} champions played
        </span>
      </span>
    </div>
  );
}

// ─── Season recap (season complete) ────────────────────────────────────────

function SeasonRecapPanel({
  season,
  championsById,
}: {
  season: SeasonState;
  championsById: Map<number, Champion>;
}) {
  const stats = useMemo(() => computeSeasonStats(season), [season]);
  const winningest = seasonTeam(season, stats.winningestTeam?.teamId);
  const mostTitled = seasonTeam(season, stats.mostTitledTeam?.teamId);
  const contested = stats.mostContested
    ? championsById.get(stats.mostContested.championId)
    : null;
  const bestWR = stats.bestWR
    ? championsById.get(stats.bestWR.championId)
    : null;
  const intlOrder = ["first-stand", "msi", "worlds"] as const;
  const splitOrder = ["winter", "spring", "summer"] as const;
  const bestRegion = (Object.entries(stats.leagueIntlTitles) as Array<
    [keyof typeof stats.leagueIntlTitles, number]
  >).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0];
  return (
    <div className="mb-8 border border-rift-gold/40 bg-rift-gold/[0.04] p-4">
      <div className="text-[10px] uppercase tracking-[0.4em] text-rift-gold/70 mb-3">
        Season Recap
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
                  <span className="text-rift-muted/80 w-24">
                    {INTERNATIONAL_LABELS[event]}
                  </span>
                  <TeamIcon iconKey={team.iconKey} size={13} color={team.color} />
                  <span className="text-rift-goldbright">{team.name}</span>
                  <span className="text-rift-muted/60">({team.leagueId})</span>
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
                      <span key={league}>
                        {i > 0 && <span className="text-rift-muted/40"> · </span>}
                        <span className="text-rift-muted/60">{league} </span>
                        <span className="text-rift-goldbright">{team.name}</span>
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
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="border border-rift-line/40 bg-rift-bg/40 px-3 py-2">
      <div className="text-[8px] uppercase tracking-[0.3em] text-rift-muted mb-0.5">
        {label}
      </div>
      <div className="font-display text-sm tracking-wider text-rift-goldbright truncate">
        {value}
      </div>
      {sub && (
        <div className="text-[9px] text-rift-mutedbright/70 mt-0.5">{sub}</div>
      )}
    </div>
  );
}
