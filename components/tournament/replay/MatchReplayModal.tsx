"use client";

import { MatchPresentationProvider, MatchTeamMark, MatchPlayerLabel, MatchEventDescription } from "@/components/MatchPresentation";
import { buildMatchPresentation } from "@/lib/matchPresentation";

import { groupedReplayPentakills } from "@/lib/matchReplay";
import { formatKda } from "@/lib/formatKda";
import { useEscapeLayer } from "@/lib/useEscapeLayer";

import { RatingBadge } from "@/components/betweenGames/contributions/ContributionRow";
import GoldLeadChart from "@/components/charts/GoldLeadChart";
import WinProbChart from "@/components/charts/WinProbChart";
import LaneIcon from "@/components/LaneIcon";
import TeamIcon from "@/components/TeamIcon";
import PlayerNameLink from "@/components/player/PlayerNameLink";
import TeamLogoLink from "@/components/team/TeamLogoLink";
import TeamNameLink from "@/components/team/TeamNameLink";
import { getChampionMeta } from "@/lib/championMeta";
import { LANES } from "@/lib/lanes";
import { computeGameRatings } from "@/lib/matchSimulator";
import { gameKillTotals } from "@/lib/recapStats";
import { syntheticDamage } from "@/lib/sim/descriptions";
import type { TournamentMatch,TournamentState,TournamentTeam } from "@/lib/tournament";
import { getTeam } from "@/lib/tournament";
import type { Champion,GameDraft,GameRecap,Lane,Roster,Side } from "@/lib/types";
import { useDraftStore } from "@/store/draftStore";
import { memo,useEffect,useMemo,useState,type ReactNode } from "react";

function resolveReplayTeam(
  tournament: TournamentState,
  name: string,
  bracketBlue: TournamentTeam | null,
  bracketRed: TournamentTeam | null,
  matchBlueName: string,
  matchRedName: string,
): TournamentTeam | null {
  const participants = [bracketBlue, bracketRed].filter(t => t?.name === name);
  if (participants.length === 1) return participants[0];
  if (participants.length > 1) return null;
  const direct = tournament.teams.filter(t => t.name === name);
  if (direct.length === 1) return direct[0];
  if (matchBlueName !== matchRedName && name === matchBlueName) return bracketBlue;
  if (matchBlueName !== matchRedName && name === matchRedName) return bracketRed;
  return null;
}

function ReplayTeamLabel({
  team,
  name,
  className = "",
  iconSize = 16,
}: {
  team: TournamentTeam | null;
  name: string;
  className?: string;
  iconSize?: number;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 min-w-0 ${className}`}>
      {team ? (
        <TeamNameLink
          teamId={team.id}
          name={name}
          iconKey={team.iconKey}
          logoUrl={team.logoUrl}
          color={team.color}
          logoSize={iconSize}
          renderAs="span"
          className="inline-flex items-center gap-1.5 min-w-0 truncate"
          hint={{
            name: team.name,
            iconKey: team.iconKey,
            logoUrl: team.logoUrl,
            color: team.color,
          }}
        >
          {name}
        </TeamNameLink>
      ) : (
        <span className="truncate">{name}</span>
      )}
    </span>
  );
}

// Compute per-player ratings for a single game, using the recap's stored
// ratings if present, or falling back to computeGameRatings when the recap
// was persisted before the ratings field existed (has perPickKDA).
function gameRatings(recap: GameRecap, winner: Side | null): { blue: number[]; red: number[] } | null {
  if (recap.ratings) return recap.ratings;
  if (!winner) return null;
  return computeGameRatings(recap, winner);
}

type GameRatingsCache = Map<string, { blue: number[]; red: number[] } | null>;

function buildGameRatingsCache(games: GameDraft[]): GameRatingsCache {
  const cache: GameRatingsCache = new Map();
  for (const g of games) {
    if (!g.recap || !g.winner) continue;
    cache.set(g.id, gameRatings(g.recap, g.winner));
  }
  return cache;
}

// Defer chart mounts one frame so picks/header paint before recharts.
function DeferredMount({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);
  if (!mounted) {
    return (
      fallback ?? (
        <div
          className="h-40 md:h-48 border border-rift-line/30 bg-rift-bg/20 animate-pulse"
          aria-hidden
        />
      )
    );
  }
  return children;
}

// Which side a team played on in a given game (sides may swap mid-series).
function teamSideInGame(game: GameDraft, teamName: string): Side | null {
  if (game.blueTeam === teamName) return "blue";
  if (game.redTeam === teamName) return "red";
  return null;
}

type SeriesPlayerSummary = {
  lane: Lane;
  name: string | null;
  playerId: string | null;
  avgRating: number;
  kda: { k: number; d: number; a: number };
  kdaGames: number;
  playedGames: number;
};

// Per-player series averages + summed KDA for one team slot.
function seriesTeamPlayerSummaries(
  games: GameDraft[],
  teamName: string,
  roster?: Roster,
  ratingsCache?: GameRatingsCache,
): SeriesPlayerSummary[] | null {
  const ratingSum = [0, 0, 0, 0, 0];
  const ratingCount = [0, 0, 0, 0, 0];
  const kdaCount = [0, 0, 0, 0, 0];
  const playedGames = games.filter(g => g.winner && teamSideInGame(g, teamName)).length;
  const kdaSum = [
    { k: 0, d: 0, a: 0 },
    { k: 0, d: 0, a: 0 },
    { k: 0, d: 0, a: 0 },
    { k: 0, d: 0, a: 0 },
    { k: 0, d: 0, a: 0 },
  ];
  const idsFromGames: (string | null)[] = [null, null, null, null, null];
  const namesFromGames: (string | null)[] = [null, null, null, null, null];
  let anyKda = false;
  let anyRating = false;

  for (const g of games) {
    if (!g.recap || !g.winner) continue;
    const side = teamSideInGame(g, teamName);
    if (!side) continue;
    const recap = g.recap;
    const ratings =
      ratingsCache?.get(g.id) ?? gameRatings(recap, g.winner);
    if (ratings) {
      const sideRatings = side === "blue" ? ratings.blue : ratings.red;
      for (let i = 0; i < 5; i++) {
        if (sideRatings[i] != null) {
          ratingSum[i] += sideRatings[i];
          ratingCount[i]++;
          anyRating = true;
        }
      }
    }
    const sideKda = recap.perPickKDA?.[side];
    if (sideKda) {
      for (let i = 0; i < 5; i++) {
        const row = sideKda[i];
        if (!row) continue;
        kdaCount[i]++;
        kdaSum[i].k += row.k;
        kdaSum[i].d += row.d;
        kdaSum[i].a += row.a;
        anyKda = true;
        const name = recap.perPickNames?.[side]?.[i];
        if (name && !namesFromGames[i]) namesFromGames[i] = name;
        idsFromGames[i] ??= recap.perPickIds?.[side]?.[i] ?? null;
      }
    }
  }

  if (!anyKda && !anyRating) return null;

  return LANES.map(({ key: lane }, i) => ({
    lane,
    name: namesFromGames[i] ?? roster?.[i]?.name ?? null,
    playerId: idsFromGames[i] ?? roster?.[i]?.id ?? null,
    avgRating:
      ratingCount[i] > 0
        ? Math.round((ratingSum[i] / ratingCount[i]) * 10) / 10
        : 0,
    kda: kdaSum[i],
    kdaGames: kdaCount[i],
    playedGames,
  }));
}

// Read-only replay of a completed tournament match. Renders a tab-strip
// for each game in the series and per-game panels showing both sides'
// bans, picks (with role icons), final winner, and any recap details
// captured at sim time (MVP champion + biggest swing event).
//
// The series may not have been preserved (e.g. legacy persisted state
// from before match.series was kept post-completion). The dashboard
// guards on `match.series` before rendering the modal, so this component
// can assume series is present — but we still defend with a fallback.
export function MatchReplayModal({
  match,
  tournament,
  onClose,
  initialGameIdx = 0,
}: {
  match: TournamentMatch;
  tournament: TournamentState;
  onClose: () => void;
  // Open the modal with a specific game tab pre-selected. Used by the
  // post-tournament "Notable Games" buttons (fastest / longest /
  // biggest-comeback) to deep-link straight to the relevant game.
  initialGameIdx?: number;
}) {
  const champions = useDraftStore((s) => s.champions);
  const byId = useMemo(
    () => new Map(champions.map((c) => [c.id, c])),
    [champions],
  );
  const [activeGameIdx, setActiveGameIdx] = useState(initialGameIdx);

  const blueTeam = getTeam(tournament, match.blueTeamId);
  const redTeam = getTeam(tournament, match.redTeamId);
  const series = match.series;

  const [previousMatch, setPreviousMatch] = useState({ id: match.id, initialGameIdx });
  if (previousMatch.id !== match.id || previousMatch.initialGameIdx !== initialGameIdx) {
    setPreviousMatch({ id: match.id, initialGameIdx });
    setActiveGameIdx(initialGameIdx);
  }

  useEscapeLayer(true, onClose);

  // Esc-to-close, arrow keys for game tabs, body-scroll-lock.
  useEffect(() => {
    const gameCount = series?.games.length ?? 0;
    const onKey = (e: KeyboardEvent) => {
      if (gameCount <= 1) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setActiveGameIdx((i) => Math.max(0, i - 1));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setActiveGameIdx((i) => Math.min(gameCount - 1, i + 1));
      }
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose, series?.games.length]);

  const games = useMemo(() => series?.games ?? [], [series?.games]);
  const game = games[activeGameIdx] ?? games[0];
  const matchBlueName = blueTeam?.name ?? games[0]?.blueTeam ?? "Blue";
  const matchRedName = redTeam?.name ?? games[0]?.redTeam ?? "Red";

  const ratingsCache = useMemo(
    () => buildGameRatingsCache(games),
    [games],
  );

  const blueSummaries = useMemo(
    () =>
      series
        ? seriesTeamPlayerSummaries(
            games,
            matchBlueName,
            blueTeam?.players,
            ratingsCache,
          )
        : null,
    [series, games, matchBlueName, blueTeam?.players, ratingsCache],
  );
  const redSummaries = useMemo(
    () =>
      series
        ? seriesTeamPlayerSummaries(
            games,
            matchRedName,
            redTeam?.players,
            ratingsCache,
          )
        : null,
    [series, games, matchRedName, redTeam?.players, ratingsCache],
  );
  const resolvedTeams = useMemo(
    () => ({
      blue: resolveReplayTeam(
        tournament,
        game?.blueTeam || matchBlueName,
        blueTeam,
        redTeam,
        matchBlueName,
        matchRedName,
      ),
      red: resolveReplayTeam(
        tournament,
        game?.redTeam || matchRedName,
        blueTeam,
        redTeam,
        matchBlueName,
        matchRedName,
      ),
    }),
    [
      tournament,
      game?.blueTeam,
      game?.redTeam,
      blueTeam,
      redTeam,
      matchBlueName,
      matchRedName,
    ],
  );
  const sidesSwapped =
    activeGameIdx > 0 &&
    games[0]?.blueTeam !== game?.blueTeam &&
    !!game?.blueTeam &&
    !!games[0]?.blueTeam;
  const perGameRatings = game ? ratingsCache.get(game.id) ?? null : null;

  if (!series || !game) return null;

  const winnerLabel =
    match.winner?.teamId === match.blueTeamId
      ? matchBlueName
      : match.winner?.teamId === match.redTeamId
      ? matchRedName
      : "—";
  const winnerTeam =
    match.winner?.teamId === match.blueTeamId
      ? blueTeam
      : match.winner?.teamId === match.redTeamId
        ? redTeam
        : null;
  const showSeriesStats = blueSummaries || redSummaries;

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
          <div className="flex items-center gap-2 md:gap-3 flex-wrap">
            <ReplayTeamLabel
              team={blueTeam}
              name={blueTeam?.name ?? matchBlueName}
              iconSize={18}
              className={`font-display text-lg md:text-xl tracking-wider ${
                match.winner?.teamId === match.blueTeamId
                  ? "text-rift-goldbright"
                  : "text-rift-bluebright"
              }`}
            />
            <span className="text-rift-mutedbright/60 text-sm tabular-nums font-display px-0.5">
              {match.winner?.blueWins ?? 0}-{match.winner?.redWins ?? 0}
            </span>
            <ReplayTeamLabel
              team={redTeam}
              name={redTeam?.name ?? matchRedName}
              iconSize={18}
              className={`font-display text-lg md:text-xl tracking-wider ${
                match.winner?.teamId === match.redTeamId
                  ? "text-rift-goldbright"
                  : "text-rift-redbright"
              }`}
            />
            <span className="text-[10px] uppercase tracking-[0.3em] text-rift-mutedbright/60 ml-auto flex items-center gap-1.5">
              Winner:{" "}
              {winnerTeam ? (
                <ReplayTeamLabel
                  team={winnerTeam}
                  name={winnerLabel}
                  iconSize={14}
                  className="text-rift-goldbright font-display tracking-wider normal-case"
                />
              ) : (
                <span className="text-rift-goldbright">—</span>
              )}
            </span>
          </div>
          {/* Series-average player ratings — only when at least one game
              was simulated and has rating/KDA data. */}
          {showSeriesStats && (
            <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
              {blueSummaries && (
                <SeriesRatingsPanel
                  team={blueTeam}
                  side="blue"
                  label={matchBlueName}
                  players={blueSummaries}
                />
              )}
              {redSummaries && (
                <SeriesRatingsPanel
                  team={redTeam}
                  side="red"
                  label={matchRedName}
                  players={redSummaries}
                />
              )}
            </div>
          )}
        </div>

        {/* Game tab strip — only when more than one game played. */}
        {games.length > 1 && (
          <div className="px-4 md:px-5 py-2 border-b border-rift-line/40 flex flex-wrap gap-1.5">
            {games.map((g, i) => {
              const isActive = i === activeGameIdx;
              const hasPentakill = !!g.recap?.pentakills?.length;
              const winnerSide = g.winner;
              const winnerName = winnerSide === "blue"
                ? g.blueTeam || matchBlueName
                : winnerSide === "red" ? g.redTeam || matchRedName : null;
              const winnerTeam = winnerName
                ? resolveReplayTeam(tournament, winnerName, blueTeam, redTeam, matchBlueName, matchRedName)
                : null;
              const kills = g.recap ? gameKillTotals(g.recap) : null;
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setActiveGameIdx(i)}
                  aria-label={`Game ${i + 1}${winnerName ? `, won by ${winnerName}` : ""}${hasPentakill ? ", Pentakill" : ""}`}
                  aria-pressed={isActive}
                  className={`inline-flex items-center px-3 py-1 text-[10px] uppercase tracking-[0.3em] border transition-all ${
                    hasPentakill
                      ? `border-rift-gold text-rift-goldbright ${isActive ? "bg-rift-gold/25 ring-1 ring-rift-gold/50" : "bg-rift-gold/10 hover:bg-rift-gold/20"}`
                      : isActive
                      ? "border-rift-gold bg-rift-gold/10 text-rift-goldbright"
                      : "border-rift-line text-rift-mutedbright hover:border-rift-gold/50 hover:bg-rift-gold/5"
                  }`}
                >
                  Game {i + 1}
                  {hasPentakill && <span className="ml-2 inline-flex"><PentakillBadges game={g} byId={byId} /></span>}
                  {kills && (
                    <span className="ml-1.5 tabular-nums text-rift-mutedbright/80 normal-case tracking-normal">
                      {kills.blue}–{kills.red}
                    </span>
                  )}
                  {winnerName && (
                    <span className="ml-1.5 inline-flex" title={`Winner: ${winnerName}`}>
                      <TeamIcon iconKey={winnerTeam?.iconKey} logoUrl={winnerTeam?.logoUrl} color={winnerTeam?.color} size={16} />
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
          <ReplayGamePanelMemo
            game={game}
            blueTeam={resolvedTeams.blue}
            redTeam={resolvedTeams.red}
            blueTeamName={game.blueTeam || matchBlueName}
            redTeamName={game.redTeam || matchRedName}
            sidesSwapped={sidesSwapped}
            byId={byId}
            perGameRatings={perGameRatings}
          />
        </div>
      </div>
    </div>
  );
}

// Series-level stats for one team: logo, per-player lane icon + name,
// summed KDA, and average rating across simulated games.
function SeriesRatingsPanel({
  team,
  side,
  label,
  players,
}: {
  team: ReturnType<typeof getTeam>;
  side: Side;
  label: string;
  players: SeriesPlayerSummary[];
}) {
  const sideAccent = side === "blue" ? "text-rift-bluebright" : "text-rift-redbright";
  const borderAccent =
    side === "blue" ? "border-rift-blue/30" : "border-rift-red/30";
  return (
    <div className={`border ${borderAccent} bg-rift-bg/25 px-2 py-1.5`}>
      <div className={`flex items-center gap-1.5 mb-1.5 ${sideAccent}`}>
        {team && (
          <TeamLogoLink
            teamId={team.id}
            name={team.name}
            iconKey={team.iconKey}
            logoUrl={team.logoUrl}
            color={team.color}
            size={14}
            renderAs="span"
            hint={{
              name: team.name,
              iconKey: team.iconKey,
              logoUrl: team.logoUrl,
              color: team.color,
            }}
          />
        )}
        <span className="text-[8px] uppercase tracking-[0.3em] truncate">
          {label} · Series Avg
        </span>
      </div>
      <div className="space-y-0.5">
        {players.map((p, i) => {
          const hasKda = p.kdaGames > 0;
          const kdaRatio = formatKda(hasKda ? p.kda : null);
          return (
            <div
              key={i}
              className="flex items-center gap-1.5 min-w-0 text-[10px]"
            >
              <LaneIcon lane={p.lane} className="w-3.5 h-3.5 text-rift-gold/70 flex-shrink-0" />
              {p.name && p.playerId ? (
                <PlayerNameLink
                  playerId={p.playerId}
                  name={p.name}
                  className="truncate flex-1 min-w-0 font-medium text-rift-mutedbright"
                  title={p.name}
                />
              ) : (
                <span
                  className="truncate flex-1 min-w-0 font-medium text-rift-mutedbright"
                  title={p.name ?? LANES[i].label}
                >
                  {p.name ?? LANES[i].label}
                </span>
              )}
              {hasKda && (
                <span className="tabular-nums font-display flex-shrink-0 text-[9px]">
                  <span className="text-emerald-300">{p.kda.k}</span>
                  <span className="text-rift-muted/50">/</span>
                  <span className="text-rift-redbright/85">{p.kda.d}</span>
                  <span className="text-rift-muted/50">/</span>
                  <span className="text-rift-goldbright/85">{p.kda.a}</span>
                  {kdaRatio && (
                    <span className="ml-1 text-rift-mutedbright/60">
                      ({kdaRatio}{p.kdaGames < p.playedGames ? ` · ${p.kdaGames}/${p.playedGames} games recorded` : ""})
                    </span>
                  )}
                </span>
              )}
              {p.avgRating > 0 && (
                <span className="flex-shrink-0">
                  <RatingBadge rating={p.avgRating} />
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ReplayGamePanel({
  game,
  blueTeam,
  redTeam,
  blueTeamName,
  redTeamName,
  sidesSwapped,
  byId,
  perGameRatings,
}: {
  game: GameDraft;
  blueTeam: TournamentTeam | null;
  redTeam: TournamentTeam | null;
  blueTeamName: string;
  redTeamName: string;
  sidesSwapped: boolean;
  byId: Map<number, Champion>;
  perGameRatings: { blue: number[]; red: number[] } | null;
}) {
  const presentation = useMemo(() => buildMatchPresentation({ blue: blueTeam ?? { name: blueTeamName }, red: redTeam ?? { name: redTeamName } }, byId, {
    blue: { picks: game.bluePicks, roles: game.blueRoles, names: game.recap?.perPickNames?.blue, ids: game.recap?.perPickIds?.blue },
    red: { picks: game.redPicks, roles: game.redRoles, names: game.recap?.perPickNames?.red, ids: game.recap?.perPickIds?.red },
  }), [game, blueTeam, redTeam, blueTeamName, redTeamName, byId]);
  const winnerSide = game.winner;
  const winnerTeam =
    winnerSide === "blue" ? blueTeam : winnerSide === "red" ? redTeam : null;
  const winnerName =
    winnerSide === "blue" ? blueTeamName : winnerSide === "red" ? redTeamName : "";
  const recap = game.recap;
  const killTotals = recap ? gameKillTotals(recap) : null;
  const mvp = recap?.mvp;
  const mvpChampion = mvp ? byId.get(mvp.championId) ?? null : null;
  return (
    <MatchPresentationProvider value={presentation}><div className="space-y-4">
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
          <div className="text-[10px] uppercase tracking-[0.3em] flex items-center gap-1.5 flex-wrap justify-end">
            <span className="text-rift-mutedbright/60">Winner:</span>
            <ReplayTeamLabel
              team={winnerTeam}
              name={winnerName}
              iconSize={14}
              className={
                winnerSide === "blue"
                  ? "text-rift-bluebright font-display tracking-wider normal-case"
                  : "text-rift-redbright font-display tracking-wider normal-case"
              }
            />
            {recap?.durationMinutes != null && (
              <span className="text-rift-mutedbright/60">
                · {Math.round(recap.durationMinutes)} min
              </span>
            )}
            {killTotals && (
              <span className="text-rift-mutedbright/60 tabular-nums">
                · {killTotals.blue}–{killTotals.red} kills
              </span>
            )}
          </div>
        ) : (
          <div className="text-[10px] uppercase tracking-[0.3em] text-rift-mutedbright/60">
            No winner recorded
          </div>
        )}
      </div>

      {!!recap?.pentakills?.length && (
        <div role="region" aria-label="Game pentakills" className="flex flex-wrap items-center gap-2 border border-rift-gold/60 bg-rift-gold/10 px-3 py-2">
          <PentakillBadges game={game} byId={byId} linkPlayer />
        </div>
      )}

      {/* Bans row, both sides side-by-side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
        <BanRow
          side="blue"
          team={blueTeam}
          label={blueTeamName}
          bans={game.blueBans}
          byId={byId}
        />
        <BanRow
          side="red"
          team={redTeam}
          label={redTeamName}
          bans={game.redBans}
          byId={byId}
        />
      </div>

      {/* Picks side-by-side with roles + per-lane gold diff + KDA +
          per-player ratings. The diff is signed from BLUE's perspective;
          we negate when rendering on the red side so each pick reads
          "+/- gold for me". KDA and ratings pull from the recap's stored
          fields (or are computed from perPickKDA for legacy recaps). */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
        <PickColumn
          side="blue"
          team={blueTeam}
          label={blueTeamName}
          picks={game.bluePicks}
          roles={game.blueRoles}
          byId={byId}
          isWinner={winnerSide === "blue"}
          laneGoldDiff={recap?.laneGoldDiff}
          perPickKDA={recap?.perPickKDA?.blue}
          ratings={perGameRatings?.blue}
          playerNames={recap?.perPickNames?.blue}
          playerIds={recap?.perPickIds?.blue}
        />
        <PickColumn
          side="red"
          team={redTeam}
          label={redTeamName}
          picks={game.redPicks}
          roles={game.redRoles}
          byId={byId}
          isWinner={winnerSide === "red"}
          laneGoldDiff={recap?.laneGoldDiff}
          perPickKDA={recap?.perPickKDA?.red}
          ratings={perGameRatings?.red}
          playerNames={recap?.perPickNames?.red}
          playerIds={recap?.perPickIds?.red}
        />
      </div>

      {/* Heavy chart blocks mount one frame after picks/header paint. */}
      <DeferredMount key={`charts-${game.id}`}>
        <>
          {recap?.winProbTimeline && recap.winProbTimeline.length > 1 && (
            <WinProbChart
              variant="replay"
              timeline={recap.winProbTimeline}
              events={recap.notableEvents ?? []}
              biggestSwing={recap.biggestSwing}
            />
          )}

          {recap?.goldLeadTimeline && recap.goldLeadTimeline.length > 1 && (
            <GoldLeadChart
              variant="replay"
              timeline={recap.goldLeadTimeline}
              notableEvents={recap.notableEvents ?? []}
              blueTeam={blueTeamName}
              redTeam={redTeamName}
            />
          )}

          {recap?.perPickKDA && (
            <DamageBars
              game={game}
              perPickKDA={recap.perPickKDA}
              byId={byId}
            />
          )}
        </>
      </DeferredMount>

      {/* Recap details — only when a sim recap was attached. Manual
          winner declarations leave recap unset. */}
      {recap && (
        <div className="border border-rift-line/40 bg-rift-bg/40 px-3 py-2.5 space-y-2">
          {mvp && (
            <div className="flex items-center gap-2 text-[11px]">
              {mvpChampion && <img
                src={mvpChampion.iconUrl}
                alt={mvpChampion.name}
                className="w-7 h-7 border border-rift-gold/60"
              />}
              <div className="min-w-0">
                <div className="text-[9px] uppercase tracking-[0.3em] text-rift-gold/70">
                  Game MVP
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-display tracking-wider text-rift-goldbright">
                  <MatchPlayerLabel side={mvp.side} lane={mvp.lane} playerName={mvp.playerName} playerId={mvp.playerId} fallback={mvpChampion?.name} />
                  <MatchTeamMark side={mvp.side} name />
                  {mvpChampion && <span className="text-rift-mutedbright/60">{mvpChampion.name}</span>}
                  <span className="text-rift-mutedbright/70 font-sans tabular-nums">
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
                <MatchTeamMark side={recap.biggestSwing.side} /> <MatchEventDescription text={recap.biggestSwing.description} />
              </div>
            </div>
          )}
        </div>
      )}
    </div></MatchPresentationProvider>
  );
}

function PentakillBadges({ game, byId, linkPlayer = false }: {
  game: GameDraft; byId: Map<number, Champion>; linkPlayer?: boolean;
}) {
  return groupedReplayPentakills(game).map((penta, i) => {
    const champion = byId.get(penta.championId);
    const name = penta.playerName ?? "Unknown player";
    return (
      <span key={i} className="inline-flex flex-wrap items-center gap-1.5 text-[10px] normal-case tracking-normal text-rift-goldbright">
        <span className="border border-rift-gold/50 bg-rift-gold/15 px-1.5 py-0.5 text-[9px] uppercase tracking-wider font-semibold">Pentakill{penta.count > 1 ? ` ×${penta.count}` : ""}</span>
        {penta.lane && <LaneIcon lane={penta.lane} size="xs" />}
        {linkPlayer ? <PlayerNameLink playerId={penta.playerId ?? undefined} name={name} /> : <span>{name}</span>}
        {champion && <img src={champion.iconUrl} alt={penta.championName} width={20} height={20} className="shrink-0 border border-rift-gold/50" />}
      </span>
    );
  });
}

const ReplayGamePanelMemo = memo(ReplayGamePanel);

function BanRow({
  side,
  team,
  label,
  bans,
  byId,
}: {
  side: Side;
  team: TournamentTeam | null;
  label: string;
  bans: (number | null)[];
  byId: Map<number, Champion>;
}) {
  const sideAccent =
    side === "blue" ? "text-rift-bluebright" : "text-rift-redbright";
  return (
    <div>
      <div
        className={`flex items-center gap-1.5 text-[9px] uppercase tracking-[0.3em] mb-1 ${sideAccent}`}
      >
        <ReplayTeamLabel team={team} name={label} iconSize={13} />
        <span className="text-rift-mutedbright/50">· Bans</span>
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

// Damage-dealt bars synthesized from per-pick KDA + champion archetype
// (no live damage feed, but the synthesis reads "right" for the user
// — carries top the chart, supports trail). Reuses the same formula as
// BetweenGamesView's damage bars.
const DamageBars = memo(function DamageBars({
  game,
  perPickKDA,
  byId,
}: {
  game: GameDraft;
  perPickKDA: NonNullable<GameRecap["perPickKDA"]>;
  byId: Map<number, Champion>;
}) {
  const rows = useMemo(() => {
    type Row = {
      side: Side;
      laneIdx: number;
      champion: Champion | null;
      damage: number;
    };
    const out: Row[] = [];
    for (let i = 0; i < 5; i++) {
      const blueId = game.bluePicks[i];
      const blueChamp = blueId != null ? byId.get(blueId) ?? null : null;
      const blueKDA = perPickKDA.blue[i] ?? { k: 0, d: 0, a: 0 };
      if (blueChamp) {
        const meta = getChampionMeta(blueChamp.alias);
        out.push({
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
        out.push({
          side: "red",
          laneIdx: i,
          champion: redChamp,
          damage: meta ? syntheticDamage(redKDA, meta) : 0,
        });
      }
    }
    return out;
  }, [game.bluePicks, game.redPicks, perPickKDA, byId]);
  const maxDamage = useMemo(
    () => Math.max(1, ...rows.map((r) => r.damage)),
    [rows],
  );
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
            "bg-rift-gold/70";
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
                <div className="flex items-center justify-between gap-1">
                  <span className="flex min-w-0 items-center gap-1 text-[10px] font-display tracking-wider text-rift-mutedbright">
                    <MatchTeamMark side={r.side} /> <MatchPlayerLabel side={r.side} lane={(r.side === "blue" ? game.blueRoles : game.redRoles)?.[r.laneIdx] ?? LANES[r.laneIdx].key} fallback={r.champion?.name} />
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
});

function PickColumn({
  side,
  team,
  label,
  picks,
  roles,
  byId,
  isWinner,
  laneGoldDiff,
  perPickKDA,
  ratings,
  playerNames,
  playerIds,
}: {
  side: Side;
  team: TournamentTeam | null;
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
  // Optional per-pick ratings (5 entries, same positional order as KDA).
  // Color-coded badge shown next to KDA: ≥8 gold, ≥6.5 green, ≥5 neutral,
  // <5 muted red. Matches the RatingBadge style from ContributionRow.
  ratings?: number[];
  // Optional per-pick player handles (positional lane order).
  playerNames?: (string | null)[];
  // Stable player ids parallel to `playerNames`.
  playerIds?: (string | null)[];
}) {
  const sideAccent =
    side === "blue" ? "text-rift-bluebright" : "text-rift-redbright";
  const winnerCls = isWinner ? "border-rift-gold/60" : "border-rift-line/40";
  return (
    <div className={`border ${winnerCls} bg-rift-bg/30 p-2`}>
      <div className="flex items-center justify-between mb-2 gap-2">
        <div
          className={`flex items-center gap-1.5 text-[10px] uppercase tracking-[0.35em] min-w-0 ${sideAccent}`}
        >
          <ReplayTeamLabel team={team} name={label} iconSize={14} className="truncate" />
          <span className="text-rift-mutedbright/50 flex-shrink-0">· Picks</span>
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
          // Render the KDA strip whenever the recap has a per-pick entry
          // for this slot — even all-zeros (`0/0/0`). Previously this
          // gated on `k+d+a > 0`, which silently hid the row for any
          // champion that finished a quiet game without a kill, death,
          // or assist (most often supports under low-event sims). Showing
          // the explicit zeros is what the user expects from a stat sheet.
          const hasKDA = kda != null;
          const rating = ratings?.[i];
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
                      {playerNames?.[i] && (
                        <PlayerNameLink
                          playerId={playerIds?.[i] ?? undefined}
                          name={playerNames[i]}
                          className="ml-1 font-sans font-medium text-[10px] text-rift-mutedbright"
                        />
                      )}
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
                  {hasKDA && (
                    <span className="ml-2 text-[9px] text-rift-mutedbright/65">
                      {formatKda(kda)}
                    </span>
                  )}
                  {rating != null && (
                    <span className="ml-1.5">
                      <RatingBadge rating={rating} />
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
