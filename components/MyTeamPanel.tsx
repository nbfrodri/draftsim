"use client";

import { useMemo,useState } from "react";

import { sideFormsFor } from "@/lib/playerForm";
import { deriveStar } from "@/lib/players";
import {
ACADEMY_MAX_PER_TEAM,
USER_ACADEMY_ROOKIE_SOFT_MAX,
isRosterVacancy,
listTeamAcademy,
} from "@/lib/season/faMarket";
import { teamSeasonGrades } from "@/lib/season/stats";
import { seasonTeam,type SeasonState } from "@/lib/season/types";
import {
computeTeamChampionWR,
type TournamentChampionWREntry,
type TournamentMatch,
type TournamentState,
} from "@/lib/tournament";
import type { Champion,Lane,PlayerTier } from "@/lib/types";
import { useDraftStore } from "@/store/draftStore";
import CoachNameLink from "./coach/CoachNameLink";
import LaneIcon from "./LaneIcon";
import PlayerNameLink from "./player/PlayerNameLink";
import InactiveBrowseRow from "./season/InactiveBrowseRow";
import TeamNameLink from "./team/TeamNameLink";

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
const TIER_VALUE: Record<PlayerTier, number> = { "S+": 3, S: 2, A: 1, B: 0, C: -1, D: -2 };
const TIER_CLS: Record<PlayerTier, string> = {
  "S+": "border-rift-goldbright text-rift-goldbright bg-rift-gold/25",
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

// ≥2 games on a champ before it counts as a real best/worst signal.
const MIN_CHAMP_GAMES = 2;
interface ChampWRItem {
  champ: Champion;
  rec: TournamentChampionWREntry;
}
interface ChampWR {
  all: ChampWRItem[]; // every champion the team has played, most-played first
  best: ChampWRItem[]; // top 3 by win rate (≥2 games)
  worst: ChampWRItem[]; // bottom 3 by win rate (≥2 games), excl. best
  champCount: number;
  totalPicks: number; // champion-games summed (5 per game played)
  overallWR: number; // team game win rate
}

const wrTone = (wr: number) =>
  wr >= 0.6 ? "text-emerald-400" : wr <= 0.4 ? "text-rift-redbright" : "text-rift-mutedbright";

// A team's champion win rates across EVERY tournament this season (all splits +
// internationals), merged by champion. Recomputed whenever a game resolves
// (season.tournaments changes), so it tracks the whole season live. null until
// the team has played a game.
function teamChampionWR(
  season: SeasonState,
  teamName: string,
  champions: Champion[],
): ChampWR | null {
  const byId = new Map(champions.map((c) => [c.id, c] as const));
  const merged = new Map<number, TournamentChampionWREntry>();
  for (const t of Object.values(season.tournaments)) {
    const byTeam = computeTeamChampionWR(t).get(teamName);
    if (!byTeam) continue;
    for (const [id, rec] of byTeam) {
      const cur = merged.get(id) ?? { games: 0, wins: 0, winRate: 0 };
      cur.games += rec.games;
      cur.wins += rec.wins;
      cur.winRate = cur.wins / cur.games;
      merged.set(id, cur);
    }
  }
  const items: ChampWRItem[] = [];
  for (const [id, rec] of merged) {
    const champ = byId.get(id);
    if (champ) items.push({ champ, rec });
  }
  if (items.length === 0) return null;
  const all = [...items].sort(
    (a, b) => b.rec.games - a.rec.games || b.rec.winRate - a.rec.winRate || a.champ.name.localeCompare(b.champ.name),
  );
  const ranked = items.filter((i) => i.rec.games >= MIN_CHAMP_GAMES);
  const best = [...ranked].sort((a, b) => b.rec.winRate - a.rec.winRate || b.rec.games - a.rec.games).slice(0, 3);
  const bestIds = new Set(best.map((i) => i.champ.id));
  const worst = [...ranked]
    .sort((a, b) => a.rec.winRate - b.rec.winRate || b.rec.games - a.rec.games)
    .filter((i) => !bestIds.has(i.champ.id))
    .slice(0, 3);
  const totalWins = items.reduce((s, i) => s + i.rec.wins, 0);
  const totalPicks = items.reduce((s, i) => s + i.rec.games, 0);
  return { all, best, worst, champCount: items.length, totalPicks, overallWR: totalPicks ? totalWins / totalPicks : 0 };
}

function ChampWRChip({ champ, rec }: ChampWRItem) {
  const pct = Math.round(rec.winRate * 100);
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px]"
      title={`${champ.name}: ${rec.wins}-${rec.games - rec.wins} (${pct}% over ${rec.games} games)`}
    >
      { }
      <img src={champ.iconUrl} alt={champ.name} className="w-4 h-4 object-cover border border-rift-line/40" />
      <span className="text-rift-mutedbright max-w-[64px] truncate">{champ.name}</span>
      <span className={`tabular-nums ${wrTone(rec.winRate)}`}>{pct}%</span>
    </span>
  );
}

// A full-table row: icon, name, W-L record, a win-rate bar, and games played.
function ChampWRRow({ champ, rec }: ChampWRItem) {
  const pct = Math.round(rec.winRate * 100);
  const losses = rec.games - rec.wins;
  return (
    <div className="flex items-center gap-2 text-[10px] py-0.5">
      { }
      <img src={champ.iconUrl} alt={champ.name} className="w-4 h-4 object-cover border border-rift-line/40 shrink-0" />
      <span className="text-rift-mutedbright truncate w-20 shrink-0">{champ.name}</span>
      <span className="tabular-nums text-rift-muted/70 w-10 shrink-0 text-right">
        <span className="text-emerald-400/80">{rec.wins}</span>-<span className="text-rift-redbright/80">{losses}</span>
      </span>
      <span className="flex-1 h-1.5 bg-rift-redbright/20 overflow-hidden min-w-[40px]" title={`${pct}% win rate`}>
        <span className="block h-full bg-emerald-400/70" style={{ width: `${pct}%` }} />
      </span>
      <span className={`tabular-nums w-8 text-right shrink-0 ${wrTone(rec.winRate)}`}>{pct}%</span>
      <span className="tabular-nums text-rift-muted/50 w-8 text-right shrink-0 text-[8px]">{rec.games}g</span>
    </div>
  );
}

export default function MyTeamPanel() {
  const season = useDraftStore((s) => s.season);
  const champions = useDraftStore((s) => s.champions);
  const playerForms = useDraftStore((s) => s.playerForms);
  const openSeasonTournament = useDraftStore((s) => s.openSeasonTournament);
  const startMatch = useDraftStore((s) => s.startMatch);
  const shopAcademyRelease = useDraftStore((s) => s.shopAcademyRelease);
  const shopAcademyRecall = useDraftStore((s) => s.shopAcademyRecall);
  const shopAcademyRookie = useDraftStore((s) => s.shopAcademyRookie);
  const [champOpen, setChampOpen] = useState(false);

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
  // This team's best/worst champions by win rate, merged across every split's
  // tournament this season. Best = green, worst = red. ≥2 games to be signal.
  const champWR = useMemo(
    () =>
      season && controlled
        ? teamChampionWR(season, controlled.name, champions)
        : null,
    [season, controlled, champions],
  );

  const academy = useMemo(() => {
    if (!season?.franchise?.aging || !controlled) return [];
    return listTeamAcademy(season.franchise.inactivePool ?? [], controlled.id);
  }, [season, controlled]);

  const shopping = useMemo(() => {
    if (!season?.franchise?.aging) return false;
    if (season.status === "complete") return true;
    const phase = season.phases[season.phaseIndex];
    return (
      season.status === "in-progress" &&
      phase?.kind === "transfer" &&
      phase.status === "in-progress"
    );
  }, [season]);

  const sameWindowDemoteIds = useMemo(
    () => new Set(season?.franchise?.sameWindowDemoteIds ?? []),
    [season?.franchise?.sameWindowDemoteIds],
  );

  if (!season || !controlled) return null;

  // This year's retirements + rookie debuts on the followed team — warn the user.
  const news = (season.rosterNews ?? []).filter((n) => n.teamId === controlled.id);

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
        <TeamNameLink
          teamId={controlled.id}
          name={controlled.name}
          leagueId={controlled.leagueId}
          iconKey={controlled.iconKey}
          logoUrl={controlled.logoUrl}
          color={controlled.color}
          logoSize={16}
          hint={{ team: controlled }}
          className="font-display text-sm tracking-wider text-rift-bluebright min-w-0"
        />
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
      {news.length > 0 && (
        <div className="px-3 py-2 border-b border-amber-500/25 bg-amber-500/[0.06]">
          <div className="text-[8px] uppercase tracking-[0.3em] text-amber-300/80 mb-1">
            Roster news
          </div>
          <div className="space-y-0.5">
            {news.map((n, i) => {
              const source = n.entrantSource;
              const vacancyDemote =
                n.marketNote === "manual-demote" || n.marketNote === "ai-demote";
              const becameFa =
                n.marketNote === "academy-release" ||
                n.marketNote === "became-fa" ||
                n.marketNote === "academy-bump" ||
                n.marketNote === "agency-depart";
              const retired = n.marketNote === "retired";
              const faToAcademy =
                n.marketNote === "fa-academy" ||
                n.marketNote === "academy-stash" ||
                n.marketNote === "academy-rookie";
              const sourceLabel =
                source === "academy" ? "returnee (academy)" : source === "free-agent" ? "returnee (FA)" : "rookie";
              const bidNote =
                n.marketNote === "academy-pass" && n.passedAcademyName
                  ? ` · passed academy ${n.passedAcademyName}`
                  : n.beatenNames && n.beatenNames.length > 0
                    ? ` · over ${n.beatenNames.join(", ")}`
                    : n.marketNote === "open-fa"
                      ? " · open FA upgrade"
                      : n.marketNote === "rookie-gate"
                        ? " · rookie's door"
                        : n.marketNote === "agency-sign"
                          ? " · agency preference"
                          : "";
              if (n.marketNote === "agency-override") {
                return (
                  <div key={`${n.lane}-${i}`} className="flex flex-wrap items-center gap-x-2 text-[10px]">
                    <span className="inline-flex items-center px-1 py-px border border-rift-line/40 text-[8px] uppercase tracking-[0.12em] text-rift-muted/55 shrink-0">
                      {n.timeMark ?? "—"}
                    </span>
                    <LaneIcon lane={n.lane} size="xs" className="shrink-0" />
                    <span className="text-rift-mutedbright">
                      <span className="text-rift-goldbright">{n.departedName ?? n.entrantName}</span>{" "}
                      stayed (override)
                      {n.beatenNames?.[0] ? ` · wanted ${n.beatenNames[0]}` : ""}
                    </span>
                  </div>
                );
              }
              if (n.marketNote === "agency-leave") {
                return (
                  <div key={`${n.lane}-${i}`} className="flex flex-wrap items-center gap-x-2 text-[10px]">
                    <span className="inline-flex items-center px-1 py-px border border-rift-line/40 text-[8px] uppercase tracking-[0.12em] text-rift-muted/55 shrink-0">
                      {n.timeMark ?? "—"}
                    </span>
                    <LaneIcon lane={n.lane} size="xs" className="shrink-0" />
                    <span className="text-rift-mutedbright">
                      <span className="text-rift-redbright/80">{n.departedName}</span> walked (agency)
                      {n.beatenNames?.[0] ? ` · preferred ${n.beatenNames[0]}` : ""}
                    </span>
                  </div>
                );
              }
              if (n.marketNote === "agency-callup") {
                return (
                  <div key={`${n.lane}-${i}`} className="flex flex-wrap items-center gap-x-2 text-[10px]">
                    <span className="inline-flex items-center px-1 py-px border border-rift-line/40 text-[8px] uppercase tracking-[0.12em] text-rift-muted/55 shrink-0">
                      {n.timeMark ?? "—"}
                    </span>
                    <LaneIcon lane={n.lane} size="xs" className="shrink-0" />
                    <span className="text-rift-mutedbright">
                      <span className="text-rift-bluebright">{n.entrantName}</span> called up (agency)
                    </span>
                  </div>
                );
              }
              if (retired) {
                return (
                  <div key={`${n.lane}-${i}`} className="flex flex-wrap items-center gap-x-2 text-[10px]">
                    <span className="inline-flex items-center px-1 py-px border border-rift-line/40 text-[8px] uppercase tracking-[0.12em] text-rift-muted/55 shrink-0">
                      {n.timeMark ?? "—"}
                    </span>
                    <LaneIcon lane={n.lane} size="xs" className="shrink-0" />
                    <span className="text-rift-mutedbright">
                      <span className="text-rift-redbright/80">{n.departedName ?? n.entrantName}</span>{" "}
                      <span className="text-rift-muted/60">
                        ({n.departedTier ?? n.entrantTier}) retired
                        {n.departedAge != null ? ` · age ${n.departedAge}` : ""}
                      </span>
                    </span>
                  </div>
                );
              }
              if (becameFa) {
                const label =
                  n.marketNote === "academy-release"
                    ? "released to free agency"
                    : n.marketNote === "agency-depart"
                      ? "left academy (agency)"
                    : n.marketNote === "academy-bump"
                      ? "became a free agent (academy full)"
                      : "became a free agent";
                return (
                  <div key={`${n.lane}-${i}`} className="flex flex-wrap items-center gap-x-2 text-[10px]">
                    <span className="inline-flex items-center px-1 py-px border border-rift-line/40 text-[8px] uppercase tracking-[0.12em] text-rift-muted/55 shrink-0">
                      {n.timeMark ?? "—"}
                    </span>
                    <LaneIcon lane={n.lane} size="xs" className="shrink-0" />
                    <span className="text-rift-mutedbright">
                      <span className="text-amber-300/90">{n.departedName ?? n.entrantName}</span>{" "}
                      <span className="text-rift-muted/60">
                        ({n.departedTier ?? n.entrantTier}) {label}
                        {n.departedAge != null ? ` · age ${n.departedAge}` : ""}
                      </span>
                    </span>
                  </div>
                );
              }
              if (faToAcademy) {
                const academyLabel =
                  n.marketNote === "academy-rookie"
                    ? "academy rookie"
                    : n.marketNote === "academy-stash"
                      ? "signed to academy · AI stash"
                      : "signed to academy";
                return (
                  <div key={`${n.lane}-${i}`} className="flex flex-wrap items-center gap-x-2 text-[10px]">
                    <span className="inline-flex items-center px-1 py-px border border-rift-line/40 text-[8px] uppercase tracking-[0.12em] text-rift-muted/55 shrink-0">
                      {n.timeMark ?? "—"}
                    </span>
                    <LaneIcon lane={n.lane} size="xs" className="shrink-0" />
                    <span className="text-rift-mutedbright">
                      <span className="text-sky-400/90">{n.entrantName}</span>{" "}
                      <span className="text-rift-muted/60">
                        ({n.entrantTier}) {academyLabel}
                      </span>
                    </span>
                  </div>
                );
              }
              return (
              <div key={`${n.lane}-${i}`} className="flex flex-wrap items-center gap-x-2 text-[10px]">
                <span className="inline-flex items-center px-1 py-px border border-rift-line/40 text-[8px] uppercase tracking-[0.12em] text-rift-muted/55 shrink-0">
                  {n.timeMark ?? "—"}
                </span>
                <LaneIcon lane={n.lane} size="xs" className="shrink-0" />
                {n.departedName ? (
                  <span className="text-rift-mutedbright">
                    <span className="text-rift-redbright/80">{n.departedName}</span>{" "}
                    <span className="text-rift-muted/60">
                      ({n.departedTier}) demoted to academy
                      {n.departedAge != null ? ` · age ${n.departedAge}` : ""}
                    </span>
                  </span>
                ) : (
                  <span className="text-rift-muted/60">Slot opened</span>
                )}
                {vacancyDemote ? (
                  <span className="text-[8px] uppercase tracking-[0.15em] text-amber-300/75">
                    {n.marketNote === "ai-demote"
                      ? "→ AI bench · market fill"
                      : "→ slot open · fill via FA / academy or leave for AI"}
                  </span>
                ) : (
                  <>
                    <span className="text-rift-muted/40">→</span>
                    <span className="text-rift-mutedbright">
                      {sourceLabel}{" "}
                      <span className={source === "rookie" ? "text-emerald-400/90" : "text-sky-400/90"}>
                        {n.entrantName}
                      </span>
                    </span>
                    <span className="text-[8px] uppercase tracking-[0.15em] text-rift-muted/60">
                      {n.entrantTier}
                      {n.entrantPotential !== n.entrantTier ? ` ↗${n.entrantPotential}` : ""}
                      {source === "rookie" ? " debuts" : " returns"}
                      {bidNote && <span className="normal-case tracking-normal text-rift-muted/50">{bidNote}</span>}
                    </span>
                  </>
                )}
              </div>
              );
            })}
          </div>
        </div>
      )}
      <div className="grid md:grid-cols-2 gap-3 p-3">
        {/* Roster — tiers + shift arrows + form */}
        <div className="space-y-1">
          {controlled.coach && (
            <div className="flex items-center gap-1.5 mb-1 text-[9px]">
              <span className="uppercase tracking-[0.2em] text-rift-blue/70">Coach</span>
              <CoachNameLink
                name={controlled.coach.name}
                hint={{ coach: controlled.coach, team: controlled }}
                className="text-rift-bluebright font-medium truncate"
              />
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
                  <PlayerNameLink
                    playerId={p.id}
                    name={p.name}
                    hint={{ player: p, teamName: controlled.name }}
                    title={p.name}
                    className="text-rift-mutedbright font-medium max-w-[88px] truncate"
                  />
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
          {season.franchise?.aging && (
            <div className="mt-2 pt-2 border-t border-amber-500/20">
              <div className="flex items-baseline justify-between mb-1 gap-2 flex-wrap">
                <span className="text-[8px] uppercase tracking-[0.3em] text-amber-300/75">
                  Academy
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="text-[7px] uppercase tracking-[0.2em] text-rift-muted/45 tabular-nums">
                    {academy.length}/{ACADEMY_MAX_PER_TEAM}
                  </span>
                  {shopping && academy.length < USER_ACADEMY_ROOKIE_SOFT_MAX && (
                    <button
                      type="button"
                      onClick={() => shopAcademyRookie()}
                      title={`Generate a rookie into academy (soft cap ${USER_ACADEMY_ROOKIE_SOFT_MAX}/${ACADEMY_MAX_PER_TEAM} — leaves a demotion slot)`}
                      className="px-1.5 py-0.5 text-[7px] uppercase tracking-[0.12em] border border-rift-line/60 text-rift-muted/70 hover:border-emerald-500/50 hover:text-emerald-400/90 transition-all"
                    >
                      Add academy rookie
                    </button>
                  )}
                </span>
              </div>
              {academy.length === 0 ? (
                <div className="text-[9px] italic text-rift-muted/55 px-0.5">
                  No academy players
                </div>
              ) : (
                <div className="space-y-0.5 -mx-1">
                  {academy.map((entry) => {
                    const pid = entry.player.id;
                    const blocked = !!pid && sameWindowDemoteIds.has(pid);
                    const vacantLane = controlled.players.find(
                      (p) => p.lane === entry.player.lane && isRosterVacancy(p),
                    );
                    return (
                      <InactiveBrowseRow
                        key={pid ?? entry.player.name}
                        entry={entry}
                        actions={
                          shopping ? (
                            <>
                              <button
                                type="button"
                                disabled={!pid}
                                onClick={() => pid && shopAcademyRelease(pid)}
                                title="Release this academy player to free agency"
                                className="px-1.5 py-0.5 text-[7px] uppercase tracking-[0.12em] border border-rift-line/60 text-rift-muted/70 hover:border-amber-500/50 hover:text-amber-300/90 transition-all disabled:opacity-35"
                              >
                                Release
                              </button>
                              <button
                                type="button"
                                disabled={!pid || blocked || !vacantLane}
                                onClick={() =>
                                  pid && shopAcademyRecall(entry.player.lane, pid)
                                }
                                title={
                                  blocked
                                    ? "Benched this window — cannot call up until next window"
                                    : vacantLane
                                      ? `Call up into vacant ${entry.player.lane} (develops faster on main roster)`
                                      : "Need a vacant lane (Bench first) or use academy board to replace"
                                }
                                className="px-1.5 py-0.5 text-[7px] uppercase tracking-[0.12em] border border-rift-line/60 text-rift-muted/70 hover:border-rift-gold/50 hover:text-rift-goldbright transition-all disabled:opacity-35"
                              >
                                Call up
                              </button>
                            </>
                          ) : undefined
                        }
                      />
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
        {/* Next match — play or watch */}
        <div className="md:border-l border-rift-line/20 md:pl-3">
          <div className="text-[8px] uppercase tracking-[0.3em] text-rift-gold/55 mb-1">
            Next Match
          </div>
          {next && opponent ? (
            <div>
              <div className="flex items-center gap-1.5 text-[11px] text-rift-mutedbright mb-1.5">
                <TeamNameLink
                  teamId={controlled.id}
                  name={controlled.name}
                  leagueId={controlled.leagueId}
                  iconKey={controlled.iconKey}
                  logoUrl={controlled.logoUrl}
                  color={controlled.color}
                  logoSize={13}
                  showLogo={false}
                  className="truncate text-rift-bluebright"
                  hint={{ team: controlled }}
                />
                <span className="text-rift-muted/60">vs</span>
                <TeamNameLink
                  teamId={opponent.id}
                  name={opponent.name}
                  leagueId={opponent.leagueId}
                  iconKey={opponent.iconKey}
                  logoUrl={opponent.logoUrl}
                  color={opponent.color}
                  logoSize={13}
                  className="inline-flex items-center gap-1 min-w-0 truncate text-rift-mutedbright"
                  hint={{ team: opponent }}
                />
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
      {champWR && (
        <div className="px-3 pb-3 -mt-1 border-t border-rift-line/15 pt-2">
          <div className="flex items-baseline justify-between gap-2 mb-1.5">
            <span className="text-[8px] uppercase tracking-[0.3em] text-rift-gold/55">
              Champion win rates
            </span>
            <span className="text-[8px] text-rift-muted/55 tabular-nums" title="Champions played · total picks · overall game win rate this season">
              {champWR.champCount} champs · {champWR.totalPicks} picks ·{" "}
              <span className={wrTone(champWR.overallWR)}>{Math.round(champWR.overallWR * 100)}% WR</span>
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            {champWR.best.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-[8px] uppercase tracking-[0.2em] text-emerald-400/70 w-12 shrink-0">
                  Best
                </span>
                {champWR.best.map((i) => (
                  <ChampWRChip key={i.champ.id} champ={i.champ} rec={i.rec} />
                ))}
              </div>
            )}
            {champWR.worst.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-[8px] uppercase tracking-[0.2em] text-rift-redbright/70 w-12 shrink-0">
                  Worst
                </span>
                {champWR.worst.map((i) => (
                  <ChampWRChip key={i.champ.id} champ={i.champ} rec={i.rec} />
                ))}
              </div>
            )}
            {champWR.best.length === 0 && (
              <div className="text-[9px] italic text-rift-muted/60">
                Best/worst appear once a champion has 2+ games — full table below.
              </div>
            )}
          </div>
          {/* Full per-champion table — every champion played this season */}
          <button
            type="button"
            onClick={() => setChampOpen((v) => !v)}
            className="mt-2 w-full flex items-center justify-between px-2 py-1 border border-rift-line/40 bg-rift-bg/30 text-[8px] uppercase tracking-[0.2em] text-rift-mutedbright hover:text-rift-goldbright hover:border-rift-gold/40 transition-all"
          >
            <span>{champOpen ? "Hide" : "All champions"} ({champWR.all.length})</span>
            <span>{champOpen ? "▴" : "▾"}</span>
          </button>
          {champOpen && (
            <div className="mt-1 border border-t-0 border-rift-line/30 px-2 py-1 max-h-56 overflow-y-auto divide-y divide-rift-line/10">
              {champWR.all.map((i) => (
                <ChampWRRow key={i.champ.id} champ={i.champ} rec={i.rec} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
