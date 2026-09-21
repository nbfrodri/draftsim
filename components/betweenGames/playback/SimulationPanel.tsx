"use client";

import { MatchPresentationProvider } from "@/components/MatchPresentation";
import { buildMatchPresentation } from "@/lib/matchPresentation";
import { useDraftStore } from "@/store/draftStore";
import { logoForTeamName } from "@/lib/season/realTeams";
import TeamName from "@/components/TeamName";
import type { SimulationResult } from "@/lib/matchSimulator";
import { computeGameRatings } from "@/lib/matchSimulator";
import { playEventBlip } from "@/lib/sounds";
import type { Champion,Lane } from "@/lib/types";
import { useEffect,useMemo,useRef,useState } from "react";
import { CompIdentityBadge,SynergyStrip } from "../comparison/CompIdentityBadge";
import { TeamComparison } from "../comparison/TeamComparison";
import { ChampionContributions } from "../contributions/ChampionContributions";
import { MVPCard } from "../MVPCard";
import { MatchTimelinePanel } from "../scoreboard/MatchTimelinePanel";
import {
computeRunningStats,
EVENT_BLIP_SEVERITY,
matchPaceLabel,
PLAYBACK_UI_UPDATE_MS,
type PlayMode,
type PlaySpeed,
SECONDS_PER_EVENT_AT_1X,
} from "../shared";
import { PlayControls } from "./PlayControls";
import { ProbabilityBar } from "./ProbabilityBar";


function formatClock(min: number): string {
  const m = Math.floor(min);
  const s = Math.floor((min - m) * 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function SimulationPanel({
  result,
  blueTeam,
  redTeam,
  bluePicks,
  redPicks,
  blueRoles,
  redRoles,
  byId,
  onApply,
  onCancel,
  onResimulate,
  blueForms,
  redForms,
  bluePlayerNames,
  redPlayerNames,
  bluePlayerIds,
  redPlayerIds,
}: {
  result: SimulationResult;
  blueTeam: string;
  redTeam: string;
  bluePicks: (number | null)[];
  redPicks: (number | null)[];
  blueRoles: (Lane | null)[];
  redRoles: (Lane | null)[];
  byId: Map<number, Champion>;
  onApply: () => void;
  onCancel: () => void;
  onResimulate: () => void;
  // Optional per-player form arrays (lane order: top/jg/mid/bot/sup)
  blueForms?: number[];
  redForms?: number[];
  // Optional per-player handles in positional lane order.
  bluePlayerNames?: (string | null)[];
  redPlayerNames?: (string | null)[];
  // Stable player ids parallel to the handle arrays — power the hover cards.
  bluePlayerIds?: (string | null)[];
  redPlayerIds?: (string | null)[];
}) {
  const tournamentTeams = useDraftStore(s => s.tournament?.teams);
  const seasonTeams = useDraftStore(s => s.season?.teams);
  const presentation = useMemo(() => {
    const resolve = (name: string) => {
      const tournamentMatches = tournamentTeams?.filter(t => t.name === name) ?? [];
      const matches = tournamentMatches.length ? tournamentMatches : seasonTeams?.filter(t => t.name === name) ?? [];
      return matches.length === 1 ? matches[0] : { name, logoUrl: logoForTeamName(name) ?? undefined };
    };
    return buildMatchPresentation({ blue: resolve(blueTeam), red: resolve(redTeam) }, byId, {
      blue: { picks: bluePicks, roles: blueRoles, names: bluePlayerNames, ids: bluePlayerIds },
      red: { picks: redPicks, roles: redRoles, names: redPlayerNames, ids: redPlayerIds },
    });
  }, [tournamentTeams, seasonTeams, blueTeam, redTeam, byId, bluePicks, redPicks, blueRoles, redRoles, bluePlayerNames, redPlayerNames, bluePlayerIds, redPlayerIds]);
  const duration = result.timeline.durationMinutes;
  const winnerIsBlue = result.winner === "blue";

  const [mode, setMode] = useState<PlayMode>("playing");
  const [speed, setSpeed] = useState<PlaySpeed>(1);
  const [currentMin, setCurrentMin] = useState(0);
  const lastPlayedEventRef = useRef(-1);

  const playStartRef = useRef<number | null>(null);
  const accumulatedRef = useRef(0); // seconds elapsed at last pause

  const [previousResult, setPreviousResult] = useState(result);
  if (previousResult !== result) {
    setPreviousResult(result);
    setMode("playing");
    setSpeed(1);
    setCurrentMin(0);
  }
  useEffect(() => {
    playStartRef.current = null;
    accumulatedRef.current = 0;
    lastPlayedEventRef.current = -1;
  }, [result]);

  // Animation loop: event-paced playback. Each event consumes a 5s real-time
  // slot at 1x; within a slot the in-game clock interpolates from the prior
  // event's minute up to the next event's minute. This guarantees ≥5s
  // between event reveals even when their in-game timestamps are tight
  // (e.g., first blood and grubs both early-game). Pauses freeze elapsed
  // time; speed changes recompute the start anchor so the clock doesn't jump.
  useEffect(() => {
    if (mode !== "playing") return;
    let raf = 0;
    playStartRef.current = performance.now();
    const baseAccumulated = accumulatedRef.current;
    const events = result.timeline.events;
    const totalSec = events.length * SECONDS_PER_EVENT_AT_1X;
    // Throttle React state commits: the rAF loop still runs every frame
    // (so the finish condition fires promptly), but currentMin only updates
    // every PLAYBACK_UI_UPDATE_MS. Committing per-frame re-rendered the
    // entire live panel (recharts SVGs included) at ~60fps — the jank the
    // user reported. 0 forces an immediate first update on (re)start.
    let lastCommit = 0;
    const tick = () => {
      const now = performance.now();
      const elapsedSec =
        baseAccumulated + ((now - (playStartRef.current ?? now)) / 1000) * speed;
      if (elapsedSec >= totalSec) {
        accumulatedRef.current = totalSec;
        setCurrentMin(duration);
        setMode("finished");
        return;
      }
      if (now - lastCommit >= PLAYBACK_UI_UPDATE_MS) {
        lastCommit = now;
        const slotIdx = Math.min(
          events.length - 1,
          Math.floor(elapsedSec / SECONDS_PER_EVENT_AT_1X),
        );
        const slotStart = slotIdx * SECONDS_PER_EVENT_AT_1X;
        const slotProgress =
          (elapsedSec - slotStart) / SECONDS_PER_EVENT_AT_1X;
        const fromMin = slotIdx === 0 ? 0 : events[slotIdx - 1].minutes;
        const toMin = events[slotIdx].minutes;
        setCurrentMin(fromMin + (toMin - fromMin) * slotProgress);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      // Capture elapsed at unmount (pause/speed change) so resume doesn't reset.
      const now = performance.now();
      accumulatedRef.current =
        baseAccumulated + ((now - (playStartRef.current ?? now)) / 1000) * speed;
    };
  }, [mode, speed, duration, result.timeline.events]);

  // Reveal events as the clock crosses their timestamps.
  const revealedCount = useMemo(() => {
    let n = 0;
    for (const e of result.timeline.events) {
      if (e.minutes <= currentMin + 0.001) n++;
      else break;
    }
    return n;
  }, [currentMin, result.timeline.events]);

  // Track the most recent reveal so we can flag "isNew" for entry animation,
  // and play the matching audio cue. The severity → event-type map decides
  // which blip plays. We only fire when latestEventIdx ADVANCES (not on
  // every render), and we skip the synthetic "Match start" anchor at idx 0
  // by checking that an actual event exists.
  const latestEventIdx = revealedCount - 1;
  useEffect(() => {
    if (latestEventIdx !== lastPlayedEventRef.current) {
      const nextIdx = revealedCount - 1;
      lastPlayedEventRef.current = nextIdx;
      if (nextIdx >= 0 && nextIdx < result.timeline.events.length) {
        const ev = result.timeline.events[nextIdx];
        playEventBlip(EVENT_BLIP_SEVERITY[ev.type] ?? "minor");
      }
    }
  }, [revealedCount, latestEventIdx, result.timeline.events]);

  // Live probability — driven by the latest revealed event's winProbAfter.
  // Comebacks visibly swing the bar (a key teamfight win for the underdog
  // jumps the bar back toward them). Before any event fires, falls back to
  // the composition forecast.
  const t = Math.min(1, currentMin / duration);
  const liveBlueProb =
    revealedCount === 0
      ? result.blueProb
      : result.timeline.events[revealedCount - 1].winProbAfter;
  const bluePct = Math.round(liveBlueProb * 100);
  const redPct = 100 - bluePct;

  const winnerName = winnerIsBlue ? blueTeam : redTeam;
  const winnerCls = winnerIsBlue ? "text-rift-bluebright" : "text-rift-redbright";
  const isFinished = mode === "finished";

  // Final per-lane KDA (post-match). Only computed when the match is over
  // so the in-progress UI stays cheap. ChampionContributions and the
  // damage-share bars below consume this.
  const finalLaneKDA = useMemo(() => {
    if (!isFinished) return null;
    const stats = computeRunningStats(
      result.timeline.events,
      result.timeline.events.length,
    );
    return stats.laneKDA;
  }, [isFinished, result.timeline.events]);

  // Per-player ratings derived from final KDA + lane gold. Only shown once
  // the match finishes. We convert SideLaneKDA → perPickKDA array shape
  // that computeGameRatings expects, then derive ratings.
  const gameRatings = useMemo(() => {
    if (!isFinished || !finalLaneKDA) return null;
    const LANES: Lane[] = ["top", "jungle", "middle", "bottom", "support"];
    const toArr = (side: typeof finalLaneKDA.blue) =>
      LANES.map((l) => ({ k: side[l]?.k ?? 0, d: side[l]?.d ?? 0, a: side[l]?.a ?? 0 }));
    const laneGoldDiff: Partial<Record<Lane, number>> = {};
    for (const lane of LANES) laneGoldDiff[lane] = result.laneAdvantages[lane] ?? 0;
    return computeGameRatings(
      {
        perPickKDA: { blue: toArr(finalLaneKDA.blue), red: toArr(finalLaneKDA.red) },
        laneGoldDiff: laneGoldDiff as Record<Lane, number>,
        durationMinutes: result.timeline.durationMinutes,
      },
      result.winner,
    );
  }, [isFinished, finalLaneKDA, result]);

  const handleSkip = () => {
    accumulatedRef.current =
      result.timeline.events.length * SECONDS_PER_EVENT_AT_1X;
    setCurrentMin(duration);
    setMode("finished");
  };
  const handleTogglePause = () => {
    if (mode === "playing") setMode("paused");
    else if (mode === "paused") setMode("playing");
  };
  const handleSpeedToggle = () => {
    setSpeed((s) => (s === 1 ? 2 : s === 2 ? 4 : 1));
  };

  return (
    <MatchPresentationProvider value={presentation}>
    <div className="border border-rift-gold/40 bg-rift-panel/60 p-4 md:p-6 space-y-4 md:space-y-5">
      {/* Header — predicted winner reveals only after the simulation finishes;
          during play we show "Simulating..." to preserve the live feel. */}
      <div className="text-center">
        <div className="text-[10px] md:text-xs uppercase tracking-[0.5em] text-rift-gold/70 flex items-center justify-center gap-2">
          {!isFinished && mode === "playing" && (
            <span className="inline-flex items-center gap-1.5 text-rift-red">
              <span className="w-1.5 h-1.5 rounded-full bg-rift-red animate-breath" />
              LIVE
            </span>
          )}
          {!isFinished && mode === "paused" && (
            <span className="text-rift-mutedbright">PAUSED</span>
          )}
          <span>{isFinished ? "Match Simulation" : "Live Simulation"}</span>
        </div>
        <div className="mt-2 font-display text-xl md:text-2xl tracking-wider min-h-[2rem]">
          {isFinished ? (
            <>
              <span className={winnerCls}>
                <TeamName name={winnerName} size={22} />
              </span>
              <span className="text-rift-gold/70 mx-2">wins</span>
            </>
          ) : (
            <span className="text-rift-gold/60 tracking-[0.4em] text-base md:text-lg">
              {formatClock(currentMin)}
            </span>
          )}
        </div>
        <div className="text-[9px] md:text-[10px] uppercase tracking-[0.3em] text-rift-mutedbright mt-1">
          Score · {result.blueScore.total} <span className="text-rift-muted">vs</span>{" "}
          {result.redScore.total}
          <span className="text-rift-muted mx-2">·</span>
          <span className="text-rift-goldbright">
            {matchPaceLabel(result.timeline.durationMinutes)}
          </span>
        </div>
      </div>

      <ProbabilityBar bluePct={bluePct} redPct={redPct} />

      {/* Live controls — only visible while sim is running. */}
      {!isFinished && (
        <PlayControls
          mode={mode}
          speed={speed}
          progress={t}
          onTogglePause={handleTogglePause}
          onSpeedToggle={handleSpeedToggle}
          onSkip={handleSkip}
        />
      )}

      <div className="grid grid-cols-2 gap-3 md:gap-4">
        <CompIdentityBadge
          side="blue"
          label={result.blueScore.identityLabel}
        />
        <CompIdentityBadge
          side="red"
          label={result.redScore.identityLabel}
        />
      </div>

      {(result.blueScore.synergyTags.length > 0 ||
        result.redScore.synergyTags.length > 0) && (
        <div className="grid grid-cols-2 gap-3 md:gap-4">
          <SynergyStrip
            side="blue"
            tags={result.blueScore.synergyTags}
            bonus={result.blueScore.synergyBonus}
          />
          <SynergyStrip
            side="red"
            tags={result.redScore.synergyTags}
            bonus={result.redScore.synergyBonus}
          />
        </div>
      )}

      <MatchTimelinePanel
        timeline={result.timeline}
        blueTeam={blueTeam}
        redTeam={redTeam}
        laneAdvantages={result.laneAdvantages}
        bluePicks={bluePicks}
        redPicks={redPicks}
        byId={byId}
        currentMin={currentMin}
        revealedCount={revealedCount}
        latestEventIdx={latestEventIdx}
        isFinished={isFinished}
        bluePlayerNames={bluePlayerNames}
        redPlayerNames={redPlayerNames}
      />

      {isFinished && (
        <MVPCard
          timeline={result.timeline}
          laneAdvantages={result.laneAdvantages}
          bluePicks={bluePicks}
          redPicks={redPicks}
          blueRoles={blueRoles}
          redRoles={redRoles}
          byId={byId}
          winner={result.winner}
          blueTeam={blueTeam}
          redTeam={redTeam}
          bluePlayerNames={bluePlayerNames}
          redPlayerNames={redPlayerNames}
          bluePlayerIds={bluePlayerIds}
          redPlayerIds={redPlayerIds}
        />
      )}

      <div className="grid grid-cols-2 gap-3 md:gap-4">
        <ChampionContributions
          side="blue"
          picks={bluePicks}
          lanes={blueRoles}
          byId={byId}
          laneKDA={isFinished ? finalLaneKDA?.blue : undefined}
          ratings={gameRatings?.blue}
          forms={blueForms}
          playerNames={bluePlayerNames}
          playerIds={bluePlayerIds}
        />
        <ChampionContributions
          side="red"
          picks={redPicks}
          lanes={redRoles}
          byId={byId}
          laneKDA={isFinished ? finalLaneKDA?.red : undefined}
          ratings={gameRatings?.red}
          forms={redForms}
          playerNames={redPlayerNames}
          playerIds={redPlayerIds}
        />
      </div>

      <TeamComparison
        blueName={blueTeam}
        redName={redTeam}
        blueScore={result.blueScore}
        redScore={result.redScore}
      />

      <div className="grid grid-cols-3 gap-2 md:gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="py-3 border border-rift-line text-rift-mutedbright hover:border-rift-gold/50 hover:bg-rift-gold/5 text-[10px] md:text-xs uppercase tracking-[0.3em] transition-all"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onResimulate}
          className="py-3 border border-rift-gold/40 text-rift-goldbright hover:bg-rift-gold/10 hover:border-rift-gold text-[10px] md:text-xs uppercase tracking-[0.3em] transition-all"
        >
          Re-Simulate
        </button>
        <button
          type="button"
          onClick={onApply}
          disabled={!isFinished}
          className={`py-3 font-display text-[11px] md:text-sm tracking-[0.3em] uppercase transition-all ${
            isFinished
              ? "btn-gold"
              : "border border-rift-line text-rift-muted cursor-not-allowed opacity-60"
          }`}
        >
          Apply
        </button>
      </div>
    </div></MatchPresentationProvider>
  );
}
