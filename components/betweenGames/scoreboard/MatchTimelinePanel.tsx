"use client";

import { memo, useEffect, useMemo, useRef } from "react";
import type { MatchEvent, MatchTimeline } from "@/lib/matchSimulator";
import type { Champion, Lane } from "@/lib/types";
import { useDraftStore } from "@/store/draftStore";
import WinProbChart from "@/components/charts/WinProbChart";
import GoldLeadChart from "@/components/charts/GoldLeadChart";
import {
  computeRunningStats,
  computeLiveLaneGold,
  computeGold,
  formatClock,
} from "../shared";
import { ScoreboardHeader } from "./ScoreboardHeader";
import { Scoreboard } from "./Scoreboard";
import { LaneGoldStrip } from "./LaneGoldStrip";
import { TimelineRow } from "../playback/TimelineRow";

// ─── Causality linking ────────────────────────────────────────────────────
// Surfaces the engine's pick → objective chain in the feed: an objective taken
// shortly after a same-side setup play (pick / vision / won fight) reads as the
// PAYOFF of that play, not an isolated dice roll. Heuristic but matches the
// sim's pickAdvantage window.
const SETUP_LABEL: Record<string, string> = {
  pick: "the pick",
  vision: "the vision pick",
  teamfight: "the won fight",
  outplay: "the outplay",
  shutdown: "the shutdown",
};
const PAYOFF_EVENTS = new Set(["soul", "baron", "elder", "dragon"]);
const CAUSAL_WINDOW_MIN = 3.5;

// For each event, a short "off the …" label if it's an objective off the back
// of a recent same-side setup play, else null. Events are chronological.
function computeCausalLinks(events: MatchEvent[]): (string | null)[] {
  return events.map((e, i) => {
    if (!PAYOFF_EVENTS.has(e.type)) return null;
    for (let j = i - 1; j >= 0; j--) {
      const p = events[j];
      if (e.minutes - p.minutes > CAUSAL_WINDOW_MIN) break;
      if (p.side === e.side && SETUP_LABEL[p.type]) return SETUP_LABEL[p.type];
    }
    return null;
  });
}

// Memoized: all props except currentMin / revealedCount / latestEventIdx /
// isFinished are referentially stable across playback updates, so this
// panel re-renders only when the throttled clock advances — not on every
// parent render.
export const MatchTimelinePanel = memo(function MatchTimelinePanel({
  timeline,
  blueTeam,
  redTeam,
  laneAdvantages,
  bluePicks,
  redPicks,
  byId,
  currentMin,
  revealedCount,
  latestEventIdx,
  isFinished,
}: {
  timeline: MatchTimeline;
  blueTeam: string;
  redTeam: string;
  laneAdvantages: Record<Lane, number>;
  bluePicks: (number | null)[];
  redPicks: (number | null)[];
  byId: Map<number, Champion>;
  currentMin: number;
  revealedCount: number;
  latestEventIdx: number;
  isFinished: boolean;
}) {
  // Game win streaks within this series (side-correct: lib/series swaps the
  // counters when teams swap sides between games).
  const blueWinStreak = useDraftStore((s) => s.series?.blueWinStreak ?? 0);
  const redWinStreak = useDraftStore((s) => s.series?.redWinStreak ?? 0);

  const visible = timeline.events.slice(0, revealedCount);
  const causalLinks = useMemo(
    () => computeCausalLinks(timeline.events),
    [timeline.events],
  );
  const placeholderCount = isFinished ? 0 : Math.max(0, timeline.events.length - revealedCount);
  const stats = useMemo(
    () => computeRunningStats(timeline.events, revealedCount),
    [timeline.events, revealedCount],
  );
  const laneGold = useMemo(
    () =>
      computeLiveLaneGold(
        laneAdvantages,
        stats.laneGoldEvent,
        currentMin,
        timeline.laningEndMinute,
      ),
    [laneAdvantages, stats.laneGoldEvent, currentMin, timeline.laningEndMinute],
  );
  // Team gold derives from lane sum so the totals match what's displayed
  // below in the Lane Gold strip — no off-by-N gold inconsistencies.
  const gold = useMemo(() => computeGold(laneGold, currentMin), [laneGold, currentMin]);

  // Keep the newest event in view while the log is a bounded scroll column
  // (large screens). During live playback we pin to the bottom as events
  // reveal; once finished we leave it so the user can read from the top.
  const logRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = logRef.current;
    if (el && !isFinished) el.scrollTop = el.scrollHeight;
  }, [revealedCount, isFinished]);

  return (
    <div className="border border-rift-gold/30 bg-rift-bg/40 p-3 md:p-4">
      {/* Esports-style HUD: team identity strip + live gold (full width). */}
      <ScoreboardHeader
        blueTeam={blueTeam}
        redTeam={redTeam}
        currentMin={currentMin}
        durationLabel={timeline.durationLabel}
        isFinished={isFinished}
        blueWinStreak={blueWinStreak}
        redWinStreak={redWinStreak}
      />

      {/* Bento layout: the objective scoreboard, the win-prob / gold-lead
          graphs, and the lane-gold strip occupy a wide main column, while the
          event log sits ALONGSIDE them (large screens) in a column that fills
          the same height and scrolls internally. This way the curves, scores,
          drakes/towers, gold and the log are all on screen at once — no
          scrolling up for the graph and down for the log. Below lg it falls
          back to the original top-to-bottom stack. */}
      <div className="mt-3 grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-4 lg:items-stretch">
        {/* Main column — scores + graphs + lane gold */}
        <div className="lg:col-span-7 min-w-0 flex flex-col">
          <Scoreboard stats={stats} gold={gold} />
          {/* Graphs side-by-side only on the widest screens (2xl); below that
              they stack so each keeps a readable width and the event-log
              column can stay wide. */}
          <div className="grid grid-cols-1 2xl:grid-cols-2 gap-x-4">
            <WinProbChart
              variant="live"
              events={timeline.events}
              revealedCount={revealedCount}
              durationMinutes={timeline.durationMinutes}
            />
            <GoldLeadChart
              variant="live"
              events={timeline.events}
              revealedCount={revealedCount}
              durationMinutes={timeline.durationMinutes}
              currentMin={currentMin}
              laneAdvantages={laneAdvantages}
              laningEndMinute={timeline.laningEndMinute}
              blueTeam={blueTeam}
              redTeam={redTeam}
            />
          </div>
          <LaneGoldStrip
            laneGold={laneGold}
            laneKDA={stats.laneKDA}
            bluePicks={bluePicks}
            redPicks={redPicks}
            byId={byId}
            currentMin={currentMin}
            latestEvent={
              latestEventIdx >= 0 && latestEventIdx < revealedCount
                ? timeline.events[latestEventIdx]
                : null
            }
            flashKey={latestEventIdx}
          />
        </div>

        {/* Event log — alongside the graphs, fills the row height and scrolls.
            Gets a wide 5/12 column so full event descriptions fit. */}
        <div className="lg:col-span-5 min-w-0 relative lg:min-h-[340px]">
          <div className="lg:absolute lg:inset-0 flex flex-col border-t lg:border-t-0 lg:border-l border-rift-line/40 mt-4 lg:mt-0 pt-3 lg:pt-0 lg:pl-3 xl:pl-4">
            <div className="flex items-baseline justify-between mb-2 shrink-0">
              <div className="text-[9px] md:text-[10px] uppercase tracking-[0.4em] text-rift-gold/70">
                Event Log
              </div>
              <div className="text-[9px] md:text-[10px] uppercase tracking-[0.3em] text-rift-mutedbright tabular-nums">
                {isFinished
                  ? timeline.durationLabel
                  : `${formatClock(currentMin)} / ${timeline.durationLabel}`}
              </div>
            </div>
            <div
              ref={logRef}
              className="space-y-1 lg:flex-1 lg:overflow-y-auto custom-scroll lg:pr-1"
            >
              {visible.length === 0 && !isFinished && (
                <div className="text-[10px] uppercase tracking-[0.3em] text-rift-muted/70 italic py-2">
                  Awaiting first action...
                </div>
              )}
              {visible.map((e, i) => (
                <TimelineRow
                  key={`${e.type}-${i}`}
                  event={e}
                  blueTeam={blueTeam}
                  redTeam={redTeam}
                  isNew={i === latestEventIdx}
                  link={causalLinks[i]}
                />
              ))}
              {placeholderCount > 0 && (
                <div className="text-[9px] uppercase tracking-[0.3em] text-rift-muted/40 pt-1.5 italic">
                  {placeholderCount} {placeholderCount === 1 ? "event" : "events"} unrevealed
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
