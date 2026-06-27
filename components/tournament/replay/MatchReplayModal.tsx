"use client";

import { useEffect, useMemo, useState } from "react";
import { useDraftStore } from "@/store/draftStore";
import { getTeam } from "@/lib/tournament";
import { getChampionMeta } from "@/lib/championMeta";
import { syntheticDamage } from "@/lib/sim/descriptions";
import { computeGameRatings } from "@/lib/matchSimulator";
import type { TournamentMatch, TournamentState } from "@/lib/tournament";
import type { Champion, GameDraft, GameRecap, Lane, Side } from "@/lib/types";
import LaneIcon from "@/components/LaneIcon";
import WinProbChart from "@/components/charts/WinProbChart";
import GoldLeadChart from "@/components/charts/GoldLeadChart";
import { RatingBadge } from "@/components/betweenGames/contributions/ContributionRow";

// Compute per-player ratings for a single game, using the recap's stored
// ratings if present, or falling back to computeGameRatings when the recap
// was persisted before the ratings field existed (has perPickKDA).
function gameRatings(recap: GameRecap, winner: Side | null): { blue: number[]; red: number[] } | null {
  if (recap.ratings) return recap.ratings;
  if (!winner) return null;
  return computeGameRatings(recap, winner);
}

// Compute each player's average rating across all simulated games in the
// series. Returns { blue: number[], red: number[] } with 5 entries per side
// (positional lane order). Returns null when no game has ratings.
function seriesAverageRatings(games: GameDraft[]): { blue: number[]; red: number[] } | null {
  const blueAccum = [0, 0, 0, 0, 0];
  const redAccum = [0, 0, 0, 0, 0];
  const blueCount = [0, 0, 0, 0, 0];
  const redCount = [0, 0, 0, 0, 0];

  for (const g of games) {
    if (!g.recap || !g.winner) continue;
    const r = gameRatings(g.recap, g.winner);
    if (!r) continue;
    for (let i = 0; i < 5; i++) {
      if (r.blue[i] != null) { blueAccum[i] += r.blue[i]; blueCount[i]++; }
      if (r.red[i] != null) { redAccum[i] += r.red[i]; redCount[i]++; }
    }
  }

  const anyRated = blueCount.some((c) => c > 0) || redCount.some((c) => c > 0);
  if (!anyRated) return null;

  return {
    blue: blueAccum.map((sum, i) => blueCount[i] > 0 ? Math.round((sum / blueCount[i]) * 10) / 10 : 0),
    red: redAccum.map((sum, i) => redCount[i] > 0 ? Math.round((sum / redCount[i]) * 10) / 10 : 0),
  };
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

  const avgRatings = useMemo(() => seriesAverageRatings(series.games), [series.games]);

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
          {/* Series-average player ratings — only when at least one game
              was simulated and has rating data. Two columns, one per side. */}
          {avgRatings && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <SeriesRatingsRow
                label={blueTeam?.name ?? "Blue"}
                side="blue"
                ratings={avgRatings.blue}
              />
              <SeriesRatingsRow
                label={redTeam?.name ?? "Red"}
                side="red"
                ratings={avgRatings.red}
              />
            </div>
          )}
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

// Series-level average ratings row for one team's 5 players.
// Rendered in the modal header area to give an at-a-glance overview of
// each player's average performance across all simulated games.
function SeriesRatingsRow({
  label,
  side,
  ratings,
}: {
  label: string;
  side: Side;
  ratings: number[];
}) {
  const sideAccent = side === "blue" ? "text-rift-bluebright" : "text-rift-redbright";
  return (
    <div>
      <div className={`text-[8px] uppercase tracking-[0.3em] mb-1 ${sideAccent}`}>
        {label} · Avg Ratings
      </div>
      <div className="flex gap-1 flex-wrap">
        {ratings.map((r, i) => (
          r > 0 ? <RatingBadge key={i} rating={r} /> : null
        ))}
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
  // Per-game ratings: use stored ratings if present, fall back to
  // computeGameRatings for historical recaps that have perPickKDA.
  const perGameRatings =
    recap && winnerSide ? gameRatings(recap, winnerSide) : null;
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

      {/* Picks side-by-side with roles + per-lane gold diff + KDA +
          per-player ratings. The diff is signed from BLUE's perspective;
          we negate when rendering on the red side so each pick reads
          "+/- gold for me". KDA and ratings pull from the recap's stored
          fields (or are computed from perPickKDA for legacy recaps). */}
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
          ratings={perGameRatings?.blue}
          playerNames={recap?.perPickNames?.blue}
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
          ratings={perGameRatings?.red}
          playerNames={recap?.perPickNames?.red}
        />
      </div>

      {/* Win-probability sparkline. Renders only when the recap has a
          timeline (sim-resolved games). Step area chart anchored at 50%
          start so the user can read the game's tempo. */}
      {recap?.winProbTimeline && recap.winProbTimeline.length > 1 && (
        <WinProbChart
          variant="replay"
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
          variant="replay"
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
  ratings,
  playerNames,
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
  // Optional per-pick ratings (5 entries, same positional order as KDA).
  // Color-coded badge shown next to KDA: ≥8 gold, ≥6.5 green, ≥5 neutral,
  // <5 muted red. Matches the RatingBadge style from ContributionRow.
  ratings?: number[];
  // Optional per-pick player handles (positional lane order).
  playerNames?: (string | null)[];
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
                        <span className="ml-1 font-sans font-medium text-[10px] text-rift-mutedbright">
                          {playerNames[i]}
                        </span>
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
                  {kda!.d > 0 && (
                    <span className="ml-2 text-[9px] text-rift-mutedbright/65">
                      {((kda!.k + kda!.a) / kda!.d).toFixed(1)} KDA
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
