"use client";

import { memo, useMemo } from "react";
import type { TeamScore } from "@/lib/matchSimulator";
import {
  getIdentityProfile,
  identityMatchupEdge,
  type IdentityProfile,
} from "@/lib/sim/identities";
import type { Side } from "@/lib/types";
import TeamName from "@/components/TeamName";
import { POSITIVE_MATCHUP_TAGS, buildComparisonRows, buildVerdict, type ComparisonRow } from "../shared";

// ─── IdentityScoutingPanel ────────────────────────────────────────────────────

// Identity scouting panel — surfaces the strategic playstyle data for both
// teams' comp identities (loaded from IDENTITY_PROFILES) plus an identity-
// vs-identity matchup line. Reads as a broadcast pre-fight scout: "Blue is
// running Wombo Combo (wants 5v5 fights, weak to disengage); Red is running
// Pick Comp (wants single catches). Pick Comp edges Wombo Combo here."
function IdentityScoutingPanel({
  blueName,
  redName,
  blueIdentity,
  redIdentity,
}: {
  blueName: string;
  redName: string;
  blueIdentity: string | null;
  redIdentity: string | null;
}) {
  const blueProfile = getIdentityProfile(blueIdentity);
  const redProfile = getIdentityProfile(redIdentity);
  // If neither side has a recognized identity, hide the panel — it would
  // just be empty boxes.
  if (!blueProfile && !redProfile) return null;
  const matchup = identityMatchupEdge(blueIdentity, redIdentity);
  // Color the matchup line by who's favored.
  const matchupCls =
    matchup.edge >= 0.5
      ? "text-rift-bluebright"
      : matchup.edge <= -0.5
      ? "text-rift-redbright"
      : "text-rift-mutedbright";
  return (
    <div>
      <div className="text-[9px] md:text-[10px] uppercase tracking-[0.4em] text-rift-gold/55 mb-2 text-center">
        Scouting Report
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-3">
        <ScoutingCard side="blue" name={blueName} profile={blueProfile} />
        <ScoutingCard side="red" name={redName} profile={redProfile} />
      </div>
      {/* Identity matchup verdict — only shown when both sides have a
          recognized identity, since that's when the matrix has a real
          edge value. */}
      {blueProfile && redProfile && (
        <div className="mt-3 px-3 py-2 border border-rift-gold/30 bg-rift-bg/50 text-center">
          <div className="text-[8px] md:text-[9px] uppercase tracking-[0.4em] text-rift-mutedbright/60 mb-0.5">
            Identity Matchup
          </div>
          <div className={`text-[11px] md:text-xs font-display tracking-[0.1em] ${matchupCls}`}>
            {matchup.phrase}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ScoutingCard ─────────────────────────────────────────────────────────────

// One scouting card per team. Renders the comp identity name as a header,
// then the tagline, win condition, and weakness. Compact but rich — every
// line conveys one strategic concept.
function ScoutingCard({
  side,
  name,
  profile,
}: {
  side: Side;
  name: string;
  profile: IdentityProfile | null;
}) {
  const sideAccent =
    side === "blue" ? "text-rift-bluebright" : "text-rift-redbright";
  const sideBorder =
    side === "blue" ? "border-rift-blue/40" : "border-rift-red/40";
  const sideBg =
    side === "blue" ? "bg-rift-blue/5" : "bg-rift-red/5";
  if (!profile) {
    return (
      <div className={`border ${sideBorder} ${sideBg} p-3`}>
        <div
          className={`text-[10px] md:text-[11px] font-display uppercase tracking-[0.25em] ${sideAccent} mb-1 truncate`}
        >
          <TeamName name={name} size={13} />
        </div>
        <div className="text-[10px] md:text-[11px] text-rift-mutedbright/60 italic">
          No clear identity — flex draft
        </div>
      </div>
    );
  }
  return (
    <div className={`border ${sideBorder} ${sideBg} p-3 space-y-1.5`}>
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <span
          className={`text-[10px] md:text-[11px] font-display uppercase tracking-[0.25em] ${sideAccent} truncate`}
        >
          <TeamName name={name} size={13} />
        </span>
        <span className="text-[8px] uppercase tracking-[0.3em] text-rift-mutedbright/55 flex-shrink-0">
          peaks {profile.peakMinutes.min}–{profile.peakMinutes.max}'
        </span>
      </div>
      <div className="text-[11px] md:text-xs font-display tracking-[0.1em] text-rift-goldbright">
        {profile.label}
      </div>
      <div className="text-[10px] md:text-[11px] text-rift-mutedbright/85 italic leading-snug">
        {profile.tagline}
      </div>
      <div className="pt-1 border-t border-rift-line/30 space-y-1">
        <div className="text-[9px] md:text-[10px] leading-snug">
          <span className="uppercase tracking-[0.2em] text-rift-goldbright/70 mr-1">
            Wants:
          </span>
          <span className="text-rift-mutedbright/85">{profile.winCondition}</span>
        </div>
        <div className="text-[9px] md:text-[10px] leading-snug">
          <span className="uppercase tracking-[0.2em] text-rift-redbright/70 mr-1">
            Weak to:
          </span>
          <span className="text-rift-mutedbright/85">{profile.weakness}</span>
        </div>
      </div>
    </div>
  );
}

// ─── TugOfWarRow ──────────────────────────────────────────────────────────────

// One tug-of-war row. The bar is anchored at the center; a positive diff
// (blue ahead) fills LEFT in blue, a negative diff fills RIGHT in red. The
// magnitude of the fill scales by `|diff| / maxDiff` so a 1-point lead
// looks like a small pull and a 5-point lead looks decisive. Each side's
// numeric value sits at the outer edge in the team accent color (faded
// when that team is behind).
function TugOfWarRow({ row }: { row: ComparisonRow }) {
  const diff = row.blue - row.red;
  const blueAhead = diff > 0;
  const redAhead = diff < 0;
  // Bar fill width as a percent of the half-bar (50% max).
  const fillPct = Math.min(50, (Math.abs(diff) / row.maxDiff) * 100);
  // Show the values with a sign when either side has a negative number,
  // so the user understands "engage = -2" is a real outcome.
  const showSign = row.blue < 0 || row.red < 0;
  const fmt = (n: number): string =>
    showSign && n > 0 ? `+${n}` : `${n}`;
  return (
    <div className="grid grid-cols-[2.5rem_1fr_2.5rem] md:grid-cols-[3rem_1fr_3rem] items-center gap-2 md:gap-3">
      {/* Blue value */}
      <div
        className={`text-right font-display tabular-nums text-sm md:text-base tracking-tight ${
          blueAhead
            ? "text-rift-bluebright"
            : redAhead
            ? "text-rift-mutedbright/45"
            : "text-rift-mutedbright/70"
        }`}
      >
        {fmt(row.blue)}
      </div>

      {/* Center bar with metric label above */}
      <div className="flex flex-col gap-0.5">
        <div className="text-[9px] md:text-[10px] uppercase tracking-[0.2em] text-rift-mutedbright/70 text-center">
          {row.label}
        </div>
        <div className="relative h-2 bg-rift-bg/80 rounded-sm overflow-hidden">
          {/* Center divider */}
          <div
            className="absolute top-0 bottom-0 w-px bg-rift-mutedbright/40 z-10"
            style={{ left: "50%" }}
            aria-hidden
          />
          {/* Blue side fill (grows leftward from center) */}
          {blueAhead && (
            <div
              className="absolute top-0 bottom-0 right-1/2 bg-rift-blue rounded-l-sm"
              style={{ width: `${fillPct}%` }}
            />
          )}
          {/* Red side fill (grows rightward from center) */}
          {redAhead && (
            <div
              className="absolute top-0 bottom-0 left-1/2 bg-rift-red rounded-r-sm"
              style={{ width: `${fillPct}%` }}
            />
          )}
        </div>
      </div>

      {/* Red value */}
      <div
        className={`font-display tabular-nums text-sm md:text-base tracking-tight ${
          redAhead
            ? "text-rift-redbright"
            : blueAhead
            ? "text-rift-mutedbright/45"
            : "text-rift-mutedbright/70"
        }`}
      >
        {fmt(row.red)}
      </div>
    </div>
  );
}

// ─── SideTagColumn ────────────────────────────────────────────────────────────

// One column of side-specific tags (matchup edges + synergies). Used in
// the bottom row of the comparison panel so each side's flavor cluster
// stays visually attached to its accent color.
function SideTagColumn({
  side,
  name,
  matchupTags,
  synergyTags,
}: {
  side: Side;
  name: string;
  matchupTags: string[];
  synergyTags: string[];
}) {
  const headerCls =
    side === "blue" ? "text-rift-bluebright" : "text-rift-redbright";
  return (
    <div>
      <div
        className={`text-[9px] md:text-[10px] uppercase tracking-[0.3em] mb-1.5 truncate font-display ${headerCls}`}
      >
        <TeamName name={name} size={12} />
      </div>
      <div className="flex flex-wrap gap-1">
        {matchupTags.map((tag) => {
          const isPositive = POSITIVE_MATCHUP_TAGS.has(tag);
          const cls = isPositive
            ? "border-rift-gold/50 text-rift-goldbright bg-rift-gold/10"
            : "border-rift-red/50 text-rift-redbright bg-rift-red/10";
          return (
            <span
              key={tag}
              className={`inline-flex items-center gap-1 text-[9px] md:text-[10px] uppercase tracking-[0.15em] px-1.5 py-0.5 border ${cls}`}
            >
              <span className="text-[8px]">{isPositive ? "▲" : "▼"}</span>
              {tag}
            </span>
          );
        })}
        {synergyTags.map((tag, i) => (
          <span
            key={`${tag}-${i}`}
            className="inline-flex items-center gap-1 text-[9px] md:text-[10px] uppercase tracking-[0.15em] px-1.5 py-0.5 border border-rift-gold/50 bg-gradient-to-r from-rift-gold/15 to-rift-gold/5 text-rift-goldbright"
          >
            <span className="text-[8px]">★</span>
            {tag}
          </span>
        ))}
        {matchupTags.length === 0 && synergyTags.length === 0 && (
          <span className="text-[9px] uppercase tracking-[0.25em] text-rift-mutedbright/40 italic">
            No notable interactions
          </span>
        )}
      </div>
    </div>
  );
}

// ─── TeamComparison ───────────────────────────────────────────────────────────

// Single comparison panel that replaces the prior two-card breakdown. The
// previous layout asked the user to mentally diff two columns of identical
// bars — confusing and slow. This panel shows ONE bar per metric, anchored
// at center, that grows toward the stronger team. Reads like a tug-of-war:
// at a glance the user sees "Blue dominates frontline, Red wins scaling."
// Memoized: props are stable for the lifetime of a simulation result, so
// this heavy static panel renders once instead of on every playback update.
export const TeamComparison = memo(function TeamComparison({
  blueName,
  redName,
  blueScore,
  redScore,
}: {
  blueName: string;
  redName: string;
  blueScore: TeamScore;
  redScore: TeamScore;
}) {
  const sections = useMemo(
    () => buildComparisonRows(blueScore, redScore),
    [blueScore, redScore],
  );
  const verdict = useMemo(
    () => buildVerdict(blueName, redName, blueScore, redScore),
    [blueName, redName, blueScore, redScore],
  );
  const totalDiff = blueScore.total - redScore.total;
  const blueAhead = totalDiff > 0;
  const redAhead = totalDiff < 0;

  // Composition chips — same data points as before, displayed mirrored
  // (blue right-aligned, red left-aligned) so the eye reads them as
  // facing each other across the central axis.
  const compRows: {
    label: string;
    blue: number;
    red: number;
    color: string;
  }[] = [
    { label: "AP", blue: blueScore.apCount, red: redScore.apCount, color: "text-rift-mage" },
    { label: "AD", blue: blueScore.adCount, red: redScore.adCount, color: "text-rift-marksman" },
    { label: "Tank", blue: blueScore.frontCount, red: redScore.frontCount, color: "text-rift-tank" },
    { label: "Hard CC", blue: blueScore.hardCcCount, red: redScore.hardCcCount, color: "text-rift-goldbright" },
    { label: "Late", blue: blueScore.lateCount, red: redScore.lateCount, color: "text-rift-mage" },
    { label: "Early", blue: blueScore.earlyCount, red: redScore.earlyCount, color: "text-rift-marksman" },
  ];

  return (
    <div className="border-2 border-rift-gold/40 bg-rift-panel/50">
      {/* ─── Header: team identity strip with totals ──────────────── */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-3 border-b border-rift-line/50 bg-gradient-to-r from-rift-bluedeep/15 via-rift-bg/40 to-rift-reddeep/15">
        <div className="flex items-center justify-end gap-3 min-w-0">
          <div className="text-right min-w-0">
            <div
              className={`font-display text-sm md:text-base uppercase tracking-[0.25em] truncate ${
                blueAhead ? "text-rift-bluebright" : "text-rift-mutedbright/85"
              }`}
            >
              <TeamName name={blueName} size={18} />
            </div>
            <div className="text-[9px] uppercase tracking-[0.3em] text-rift-mutedbright/55">
              Blue Side
            </div>
          </div>
          <div
            className={`font-display tabular-nums tracking-tight ${
              blueAhead
                ? "text-3xl md:text-4xl text-rift-bluebright"
                : "text-2xl md:text-3xl text-rift-mutedbright/70"
            }`}
          >
            {blueScore.total}
          </div>
        </div>
        <div className="flex flex-col items-center px-2 md:px-3">
          <span className="text-[9px] md:text-[10px] uppercase tracking-[0.4em] text-rift-gold/70">
            VS
          </span>
          {totalDiff !== 0 && (
            <span className="text-[9px] md:text-[10px] tabular-nums tracking-[0.15em] text-rift-goldbright/70 font-display mt-0.5">
              {blueAhead ? "+" : "−"}
              {Math.abs(totalDiff)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`font-display tabular-nums tracking-tight ${
              redAhead
                ? "text-3xl md:text-4xl text-rift-redbright"
                : "text-2xl md:text-3xl text-rift-mutedbright/70"
            }`}
          >
            {redScore.total}
          </div>
          <div className="min-w-0">
            <div
              className={`font-display text-sm md:text-base uppercase tracking-[0.25em] truncate ${
                redAhead ? "text-rift-redbright" : "text-rift-mutedbright/85"
              }`}
            >
              <TeamName name={redName} size={18} />
            </div>
            <div className="text-[9px] uppercase tracking-[0.3em] text-rift-mutedbright/55">
              Red Side
            </div>
          </div>
        </div>
      </div>

      {/* ─── Verdict ──────────────────────────────────────────────── */}
      <div className="px-4 py-2.5 border-b border-rift-line/30 text-center">
        {verdict.map((line, i) => (
          <div
            key={i}
            className={`text-[11px] md:text-xs tracking-[0.05em] ${
              i === 0 ? "text-rift-goldbright" : "text-rift-mutedbright/85"
            }`}
          >
            {line}
          </div>
        ))}
      </div>

      <div className="p-3 md:p-5 space-y-5">
        {/* ─── Identity scouting reports + matchup line ──────────── */}
        <IdentityScoutingPanel
          blueName={blueName}
          redName={redName}
          blueIdentity={blueScore.identityLabel}
          redIdentity={redScore.identityLabel}
        />

        {/* ─── Composition mirror ────────────────────────────────── */}
        <div>
          <div className="text-[9px] md:text-[10px] uppercase tracking-[0.4em] text-rift-gold/55 mb-2 text-center">
            Composition Snapshot
          </div>
          <div className="space-y-1">
            {compRows.map((c) => {
              const diff = c.blue - c.red;
              const blueWins = diff > 0;
              const redWins = diff < 0;
              return (
                <div
                  key={c.label}
                  className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-[11px] md:text-xs"
                >
                  <div
                    className={`text-right font-display tabular-nums tracking-tight ${
                      blueWins ? c.color : "text-rift-mutedbright/55"
                    }`}
                  >
                    {c.blue}
                  </div>
                  <div className="text-[9px] md:text-[10px] uppercase tracking-[0.25em] text-rift-mutedbright/70 text-center min-w-[5.5rem] md:min-w-[7rem]">
                    {c.label}
                  </div>
                  <div
                    className={`font-display tabular-nums tracking-tight ${
                      redWins ? c.color : "text-rift-mutedbright/55"
                    }`}
                  >
                    {c.red}
                  </div>
                </div>
              );
            })}
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-[11px] md:text-xs">
              <div
                className={`text-right font-display tabular-nums ${
                  blueScore.highMobCount > redScore.highMobCount
                    ? "text-rift-bluebright"
                    : "text-rift-mutedbright/55"
                }`}
              >
                {blueScore.highMobCount}
                <span className="text-rift-muted/60 text-[9px] mx-0.5">/</span>
                <span className="text-rift-mutedbright/70 text-[10px]">
                  {blueScore.lowMobCount}
                </span>
              </div>
              <div className="text-[9px] uppercase tracking-[0.25em] text-rift-mutedbright/70 text-center min-w-[5.5rem] md:min-w-[7rem]">
                Mobility
              </div>
              <div
                className={`font-display tabular-nums ${
                  redScore.highMobCount > blueScore.highMobCount
                    ? "text-rift-redbright"
                    : "text-rift-mutedbright/55"
                }`}
              >
                {redScore.highMobCount}
                <span className="text-rift-muted/60 text-[9px] mx-0.5">/</span>
                <span className="text-rift-mutedbright/70 text-[10px]">
                  {redScore.lowMobCount}
                </span>
              </div>
            </div>
          </div>
          <div className="text-[8px] uppercase tracking-[0.3em] text-rift-mutedbright/40 text-center mt-1.5">
            Mobility shows high-mobility / low-mobility champions
          </div>
        </div>

        {/* ─── Tug-of-war metric bars ────────────────────────────── */}
        {sections.map((section) => (
          <div key={section.label}>
            <div className="text-[9px] md:text-[10px] uppercase tracking-[0.4em] text-rift-gold/55 mb-2">
              {section.label}
            </div>
            <div className="space-y-2">
              {section.rows.map((row) => (
                <TugOfWarRow key={row.label} row={row} />
              ))}
            </div>
          </div>
        ))}

        {/* ─── Tags grouped by side ──────────────────────────────── */}
        {(blueScore.matchupTags.length > 0 ||
          redScore.matchupTags.length > 0 ||
          blueScore.synergyTags.length > 0 ||
          redScore.synergyTags.length > 0) && (
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-rift-line/40">
            <SideTagColumn
              side="blue"
              name={blueName}
              matchupTags={blueScore.matchupTags}
              synergyTags={blueScore.synergyTags}
            />
            <SideTagColumn
              side="red"
              name={redName}
              matchupTags={redScore.matchupTags}
              synergyTags={redScore.synergyTags}
            />
          </div>
        )}
      </div>
    </div>
  );
});
