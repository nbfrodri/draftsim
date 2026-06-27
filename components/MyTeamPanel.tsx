"use client";

import { useMemo } from "react";

import { useDraftStore } from "@/store/draftStore";
import { deriveStar } from "@/lib/players";
import { sideFormsFor } from "@/lib/playerForm";
import { teamSeasonGrades } from "@/lib/season/stats";
import { seasonTeam, type SeasonState } from "@/lib/season/types";
import type { TournamentMatch, TournamentState } from "@/lib/tournament";
import type { Lane, PlayerTier } from "@/lib/types";
import TeamIcon from "./TeamIcon";
import LaneIcon from "./LaneIcon";

// "My Team" dashboard panel for the controlled team: the live roster with
// tier badges (and ▲/▼ shift arrows when a tier moved this split) + current
// form, plus the team's next match with Play (draft it yourself) / Watch
// (AI drafts, you watch live) entry points.

const LANES: readonly Lane[] = ["top", "jungle", "middle", "bottom", "support"];
const LANE_LABEL: Record<Lane, string> = {
  top: "Top",
  jungle: "Jgl",
  middle: "Mid",
  bottom: "Bot",
  support: "Sup",
};
const TIER_VALUE: Record<PlayerTier, number> = { S: 2, A: 1, B: 0, C: -1, D: -2 };
const TIER_CLS: Record<PlayerTier, string> = {
  S: "border-rift-gold text-rift-goldbright bg-rift-gold/10",
  A: "border-rift-blue/70 text-rift-bluebright bg-rift-blue/10",
  B: "border-rift-line text-rift-mutedbright",
  C: "border-amber-600/50 text-amber-300/80",
  D: "border-rift-red/50 text-rift-redbright bg-rift-red/5",
};

// Performance "note" (1-10 grade) colouring: strong green, weak red.
function noteColor(n: number | null): string {
  if (n == null) return "text-rift-muted/45";
  if (n >= 7) return "text-emerald-400";
  if (n < 5.5) return "text-rift-redbright";
  return "text-rift-mutedbright";
}
const fmtNote = (n: number | null) => (n == null ? "–" : n.toFixed(1));

// Career arc — a one-word narrative for a player's season, from their season
// average note, last-match note, current form and tier movement this split.
// Priority: a tier drop reads as Decline; a tier bump or a star season reads as
// Breakout; recent over/under-performance vs the season baseline reads as
// Rising / Slump; otherwise Steady. Returns null with no rated games.
function careerArc(
  avg: number | null,
  last: number | null,
  form: number,
  tierUp: boolean,
  tierDown: boolean,
): { label: string; cls: string } | null {
  if (avg == null) return null;
  if (tierDown) return { label: "Decline", cls: "text-rift-redbright/80" };
  if (tierUp || avg >= 7.6) return { label: "Breakout", cls: "text-amber-300" };
  if (form > 0.25 || (last != null && last - avg >= 0.7))
    return { label: "Rising", cls: "text-emerald-400/80" };
  if (form < -0.25 || (last != null && avg - last >= 0.7))
    return { label: "Slump", cls: "text-rift-redbright/70" };
  return { label: "Steady", cls: "text-rift-muted/55" };
}

// First pending match in the current phase that the controlled team is in
// (both slots filled, no winner yet) — earliest round first.
function findNextMatch(
  season: SeasonState,
  controlledId: string,
): { tournament: TournamentState; match: TournamentMatch } | null {
  const phase = season.phases[season.phaseIndex];
  if (!phase) return null;
  for (const tid of phase.tournamentIds) {
    const t = season.tournaments[tid];
    if (!t) continue;
    const cands = t.matches
      .filter(
        (m) =>
          !m.winner &&
          m.blueTeamId != null &&
          m.redTeamId != null &&
          (m.blueTeamId === controlledId || m.redTeamId === controlledId),
      )
      .sort((a, b) => a.round - b.round);
    if (cands.length > 0) return { tournament: t, match: cands[0] };
  }
  return null;
}

export default function MyTeamPanel() {
  const season = useDraftStore((s) => s.season);
  const playerForms = useDraftStore((s) => s.playerForms);
  const openSeasonTournament = useDraftStore((s) => s.openSeasonTournament);
  const startMatch = useDraftStore((s) => s.startMatch);

  const controlled = season
    ? seasonTeam(season, season.config.controlledTeamId)
    : null;
  const next = useMemo(
    () => (season && controlled ? findNextMatch(season, controlled.id) : null),
    [season, controlled],
  );
  // Per-player season notes (1-10) + the most-recent match grade.
  const grades = useMemo(
    () => (season && controlled ? teamSeasonGrades(season, controlled.id) : null),
    [season, controlled],
  );

  if (!season || !controlled) return null;

  const forms = sideFormsFor(playerForms, controlled.id);
  const prev = season.prevPlayerTiers?.[controlled.id];
  // Team star (1-5) derived from the roster, and the prior star from the
  // pre-development tiers — so we can flag a roster that got stronger/weaker.
  const star = deriveStar(controlled.players);
  const prevStar = prev
    ? deriveStar(
        controlled.players.map((p, i) => ({ ...p, tier: prev[i] ?? p.tier })),
      )
    : null;
  const starUp = prevStar != null && star > prevStar;
  const starDown = prevStar != null && star < prevStar;

  const opponent =
    next && controlled
      ? next.match.blueTeamId === controlled.id
        ? seasonTeam(season, next.match.redTeamId)
        : seasonTeam(season, next.match.blueTeamId)
      : null;
  const controlledSide: "blue" | "red" | null = next
    ? next.match.blueTeamId === controlled.id
      ? "blue"
      : "red"
    : null;

  // Play: draft your own match (AI plays the opponent), then live sim.
  const play = () => {
    if (!next || !controlledSide) return;
    openSeasonTournament(next.tournament.id);
    startMatch(next.match.id, {
      mode: "pvai",
      aiSide: controlledSide === "blue" ? "red" : "blue",
    });
  };
  // Watch: both sides AI — the draft + game play out live for you to watch.
  const watch = () => {
    if (!next) return;
    openSeasonTournament(next.tournament.id);
    startMatch(next.match.id, { mode: "aivai" });
  };

  return (
    <div className="mb-8 border border-rift-blue/40 bg-rift-blue/[0.04]">
      <div className="px-3 py-1.5 border-b border-rift-blue/30 flex items-center gap-2">
        <TeamIcon
          iconKey={controlled.iconKey}
          logoUrl={controlled.logoUrl}
          size={16}
          color={controlled.color}
        />
        <span className="font-display text-sm tracking-wider text-rift-bluebright">
          {controlled.name}
        </span>
        <span
          className="text-[10px] text-rift-gold/85 tabular-nums"
          title={
            prevStar != null && prevStar !== star
              ? `${prevStar}★ → ${star}★ this split`
              : `${star}★ team rating`
          }
        >
          {star}★
          {(starUp || starDown) && (
            <span
              className={starUp ? "text-emerald-400" : "text-rift-redbright"}
            >
              {starUp ? " ▲" : " ▼"}
            </span>
          )}
        </span>
        <span className="text-[8px] uppercase tracking-[0.3em] text-rift-mutedbright/55">
          My Team
        </span>
        {/* Team grade average — always shown so it's visible from the start
            and visibly fills in / updates each time the team plays. */}
        {grades && (
          <div className="ml-auto flex items-center gap-3 text-[9px] uppercase tracking-[0.2em] text-rift-muted/60">
            <span title="Average player note across the season">
              Avg{" "}
              <span className={`font-display ${noteColor(grades.teamAvg)}`}>
                {fmtNote(grades.teamAvg)}
              </span>
            </span>
            <span title="Team note in the most recent match">
              Last{" "}
              <span className={`font-display ${noteColor(grades.lastMatchAvg)}`}>
                {fmtNote(grades.lastMatchAvg)}
              </span>
            </span>
          </div>
        )}
      </div>
      <div className="grid md:grid-cols-2 gap-3 p-3">
        {/* Roster — tiers + shift arrows + form */}
        <div className="space-y-1">
          {controlled.coach && (
            <div className="flex items-center gap-1.5 mb-1 text-[9px]">
              <span className="uppercase tracking-[0.2em] text-rift-blue/70">Coach</span>
              <span className="text-rift-bluebright font-medium truncate">{controlled.coach.name}</span>
              <span className="text-rift-gold/70 tabular-nums" title="Rating — drives your AI draft on Watch-live">
                ★{controlled.coach.rating.toFixed(1)}
              </span>
            </div>
          )}
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-[8px] uppercase tracking-[0.3em] text-rift-gold/55">
              Roster
            </span>
            <span className="text-[7px] uppercase tracking-[0.2em] text-rift-muted/45">
              note (last match)
            </span>
          </div>
          {LANES.map((lane, i) => {
            const p = controlled.players[i];
            if (!p) return null;
            const form = forms[lane] ?? 0;
            const prevTier = prev?.[i];
            const shifted = prevTier != null && prevTier !== p.tier;
            const up = shifted && TIER_VALUE[p.tier] > TIER_VALUE[prevTier];
            return (
              <div key={lane} className="flex items-center gap-2 text-[10px]">
                <LaneIcon lane={lane} size="sm" className="shrink-0" />
                <span
                  className={`w-5 text-center border font-display ${TIER_CLS[p.tier]}`}
                >
                  {p.tier}
                </span>
                {p.name && (
                  <span className="text-rift-mutedbright font-medium max-w-[88px] truncate" title={p.name}>
                    {p.name}
                  </span>
                )}
                {shifted && (
                  <span
                    className={up ? "text-emerald-400" : "text-rift-redbright"}
                    title={`${prevTier} → ${p.tier} this split`}
                  >
                    {up ? "▲" : "▼"}{" "}
                    <span className="text-rift-muted/60">from {prevTier}</span>
                  </span>
                )}
                <div className="ml-auto flex items-center gap-2 tabular-nums">
                  {(() => {
                    const arc = grades
                      ? careerArc(grades.avg[i], grades.last[i], form, !!up, shifted && !up)
                      : null;
                    return arc ? (
                      <span
                        className={`text-[8px] uppercase tracking-[0.2em] ${arc.cls}`}
                        title="Season career arc"
                      >
                        {arc.label}
                      </span>
                    ) : null;
                  })()}
                  {Math.abs(form) > 0.15 && (
                    <span
                      className={`text-[9px] uppercase tracking-[0.2em] ${
                        form > 0
                          ? "text-emerald-400/80"
                          : "text-rift-redbright/80"
                      }`}
                      title={`Form ${form > 0 ? "+" : ""}${form.toFixed(2)}`}
                    >
                      {form > 0 ? "hot" : "cold"}
                    </span>
                  )}
                  {grades && (
                    <span className="flex items-baseline gap-1">
                      <span
                        className={`text-[11px] font-display ${noteColor(grades.avg[i])}`}
                        title="Season average note"
                      >
                        {fmtNote(grades.avg[i])}
                      </span>
                      <span
                        className={`text-[8px] ${noteColor(grades.last[i])}`}
                        title="Last match note"
                      >
                        ({fmtNote(grades.last[i])})
                      </span>
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {/* Next match — play or watch */}
        <div className="md:border-l border-rift-line/20 md:pl-3">
          <div className="text-[8px] uppercase tracking-[0.3em] text-rift-gold/55 mb-1">
            Next Match
          </div>
          {next && opponent ? (
            <div>
              <div className="flex items-center gap-1.5 text-[11px] text-rift-mutedbright mb-1.5">
                <span className="text-rift-bluebright truncate">
                  {controlled.name}
                </span>
                <span className="text-rift-muted/60">vs</span>
                <TeamIcon
                  iconKey={opponent.iconKey}
                  logoUrl={opponent.logoUrl}
                  size={13}
                  color={opponent.color}
                />
                <span className="truncate">{opponent.name}</span>
              </div>
              <div className="text-[8px] uppercase tracking-[0.25em] text-rift-mutedbright/50 mb-2 truncate">
                {next.tournament.name}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={play}
                  className="py-1.5 border border-rift-gold bg-rift-gold/10 text-rift-goldbright text-[10px] uppercase tracking-[0.25em] hover:bg-rift-gold/20 transition-all"
                  title="Draft this match yourself — you pick &amp; ban for your team, the AI plays the opponent, then watch it live"
                >
                  Play (draft)
                </button>
                <button
                  type="button"
                  onClick={watch}
                  className="py-1.5 border border-rift-line text-rift-mutedbright text-[10px] uppercase tracking-[0.25em] hover:text-rift-goldbright hover:border-rift-gold/50 transition-all"
                  title="Both sides AI — watch your team's draft and game play out live"
                >
                  Watch live
                </button>
              </div>
            </div>
          ) : (
            <div className="text-[10px] italic text-rift-muted">
              No upcoming match — your team isn&apos;t in the current stage.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
